import { z } from "zod"
import { askJSON } from "../llm/json.js"
import { type ReflectionNote, type ReflectionRequest, PatternMatch, type PatternMatch as PatternValue } from "./types.js"

/**
 * Reflection generator - produces structured analysis via LLM with heuristic fallback
 */
export class ReflectionGenerator {
  private client?: any
  private directory?: string

  constructor(input?: { client?: any; directory?: string }) {
    this.client = input?.client
    this.directory = input?.directory
  }

  /**
   * Generate reflection from session data
   * Uses structured LLM output when available and falls back to local analysis otherwise
   */
  async generate(request: ReflectionRequest): Promise<ReflectionNote> {
    const llm = await this.generateLLM(request)
    if (llm) return llm

    const { sessionID, traceEvents, signals, healthScore, messageCount, toolCallCount, acceptedEdits } = request

    // Analyze the session to generate reflection
    const completed = healthScore > 0.6 && acceptedEdits > 0
    const satisfaction = this.evaluateSatisfaction(healthScore, acceptedEdits, messageCount)

    // Extract patterns from signals
    const patterns = this.extractPatterns(signals)

    // Generate learnings
    const learnings = this.generateLearnings(signals, patterns, traceEvents)

    // Generate recommendations
    const recommendations = this.generateRecommendations(signals, patterns, healthScore)

    const reflection: ReflectionNote = {
      sessionID,
      generated_at: Date.now(),
      task_summary: request.summary,
      session_duration_ms: this.calculateDuration(traceEvents),
      completed_successfully: completed,
      user_satisfaction: satisfaction,
      root_cause: completed
        ? undefined
        : {
            main_issue: this.describeMainIssue(signals, healthScore),
            contributing_factors: this.describeContributingFactors(signals),
            severity: healthScore < 0.3 ? "critical" : healthScore < 0.6 ? "high" : "medium",
            pattern_matches: patterns,
          },
      key_learnings: learnings,
      recommendations: recommendations,
      confidence: this.calculateConfidence(signals.length, traceEvents.length),
    }

    return reflection
  }

  private async generateLLM(request: ReflectionRequest): Promise<ReflectionNote | null> {
    if (!this.client) return null

    const schema = z.object({
      task_summary: z.string().min(1),
      what_worked: z.string().min(1),
      what_failed: z.string().min(1),
      missing_context: z.array(z.string()).max(5),
      what_would_have_helped: z.string().min(1),
      root_cause_hypothesis: z.string().min(1),
      pattern_matches: z.array(PatternMatch).max(5),
      key_learnings: z.array(z.string()).min(1).max(5),
      recommendations: z.array(z.string()).max(3),
      confidence: z.number().min(0).max(1),
    })

    const msg = [
      "You are CoEvolve reflection analyzer.",
      "Return only JSON that matches schema.",
      `SessionID: ${request.sessionID}`,
      `ProjectID: ${request.projectID}`,
      `Health: ${request.healthScore}`,
      `MessageCount: ${request.messageCount}`,
      `ToolCallCount: ${request.toolCallCount}`,
      `AcceptedEdits: ${request.acceptedEdits}`,
      `Signals: ${JSON.stringify(request.signals)}`,
      `TraceHead: ${JSON.stringify(request.traceEvents.slice(0, 15))}`,
    ].join("\n")

    const out = await askJSON({
      client: this.client,
      directory: this.directory,
      title: "CoEvolve Reflection",
      prompt: msg,
      schema,
    })

    if (!out) return null

    const completed = request.healthScore > 0.6 && request.acceptedEdits > 0
    const satisfaction = this.evaluateSatisfaction(request.healthScore, request.acceptedEdits, request.messageCount)
    const severity = request.healthScore < 0.3 ? "critical" : request.healthScore < 0.6 ? "high" : "medium"

    return {
      sessionID: request.sessionID,
      generated_at: Date.now(),
      task_summary: out.task_summary,
      what_worked: out.what_worked,
      what_failed: out.what_failed,
      missing_context: out.missing_context,
      what_would_have_helped: out.what_would_have_helped,
      root_cause_hypothesis: out.root_cause_hypothesis,
      session_duration_ms: this.calculateDuration(request.traceEvents),
      completed_successfully: completed,
      user_satisfaction: satisfaction,
      root_cause: completed
        ? undefined
        : {
            main_issue: out.root_cause_hypothesis,
            contributing_factors: [out.what_failed],
            severity,
            pattern_matches: out.pattern_matches,
          },
      key_learnings: out.key_learnings,
      recommendations: out.recommendations,
      confidence: out.confidence,
    }
  }

  private evaluateSatisfaction(
    health: number,
    edits: number,
    messages: number,
  ): "very_satisfied" | "satisfied" | "neutral" | "dissatisfied" | "very_dissatisfied" {
    if (health > 0.85 && edits > 0) return "very_satisfied"
    if (health > 0.7 && edits > 0) return "satisfied"
    if (health > 0.5) return "neutral"
    if (health > 0.3) return "dissatisfied"
    return "very_dissatisfied"
  }

  private extractPatterns(signals: Array<{ type: string; severity: string }>): PatternValue[] {
    const patterns: string[] = []

    for (const signal of signals) {
      switch (signal.type) {
        case "REPROMPT":
          patterns.push("context_gap")
          patterns.push("incomplete_edit")
          break
        case "TOOL_LOOP":
          patterns.push("wrong_tool_choice")
          patterns.push("incomplete_edit")
          break
        case "CONTEXT_GAP":
          patterns.push("context_gap")
          break
        case "REVERSION":
          patterns.push("error_handling_miss")
          patterns.push("incomplete_edit")
          break
        case "SESSION_ABANDONED":
          patterns.push("incompleteness")
          break
      }
    }

    // Remove duplicates and limit to valid patterns
    const unique = [...new Set(patterns)].filter(p => {
      try {
        PatternMatch.parse(p)
        return true
      } catch {
        return false
      }
    }) as PatternValue[]
    return unique.slice(0, 5)
  }

  private generateLearnings(
    signals: Array<{ type: string; severity: string }>,
    patterns: string[],
    events: any[],
  ): string[] {
    const learnings: string[] = []

    // High-impact signals become learnings
    for (const signal of signals.filter(s => s.severity !== "low")) {
      if (signal.type === "REPROMPT") {
        learnings.push("Agent misunderstood the initial task - needs better context about intent")
      } else if (signal.type === "CONTEXT_GAP") {
        learnings.push("Key files were not pre-loaded - agent spent time discovering them mid-session")
      } else if (signal.type === "TOOL_LOOP") {
        learnings.push("Agent got stuck in a tool loop - likely missing knowledge about how to use the tool correctly")
      } else if (signal.type === "REVERSION") {
        learnings.push("Agent made edits that were later reverted - suggests incomplete understanding of codebase")
      }
    }

    // Add tool frequency insights
    if (events.length > 10) {
      learnings.push("Long session with many interactions - may indicate gradual understanding rather than quick grasp")
    }

    return learnings.slice(0, 5)
  }

  private generateRecommendations(
    signals: Array<{ type: string; severity: string }>,
    patterns: string[],
    health: number,
  ): string[] {
    const recommendations: string[] = []

    if (patterns.includes("context_gap")) {
      recommendations.push("Pre-load context files in initial system prompt based on task intent")
    }

    if (patterns.includes("wrong_tool_choice")) {
      recommendations.push("Enhance tool descriptions to clarify when each tool is appropriate")
    }

    if (patterns.includes("incomplete_edit") || health < 0.5) {
      recommendations.push("Add examples of completed edits to the system prompt")
    }

    return recommendations.slice(0, 3)
  }

  private describeMainIssue(signals: Array<{ type: string; severity: string }>, health: number): string {
    const highSeverity = signals.find(s => s.severity === "high")
    if (highSeverity?.type === "REPROMPT") return "User had to correct the agent - initial understanding was incomplete"
    if (highSeverity?.type === "REVERSION") return "Agent made changes that didn't survive review - incomplete solution"
    if (highSeverity?.type === "TOOL_LOOP") return "Agent got stuck repeating the same tool call"
    return "Session did not meet expected quality threshold"
  }

  private describeContributingFactors(signals: Array<{ type: string; severity: string }>): string[] {
    return signals.slice(0, 3).map(s => `${s.type} (${s.severity} severity)`)
  }

  private calculateDuration(events: any[]): number {
    if (events.length < 2) return 0
    const first = events[0]?.ts || 0
    const last = events[events.length - 1]?.ts || 0
    return Math.max(0, last - first)
  }

  private calculateConfidence(signalCount: number, eventCount: number): number {
    // More signals and events = more data to analyze = higher confidence
    const signalScore = Math.min(1, signalCount / 5)
    const eventScore = Math.min(1, eventCount / 20)
    return (signalScore + eventScore) / 2
  }
}

export default ReflectionGenerator
