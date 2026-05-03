import { type TraceEvent, type MessageTrace, type ToolCallTrace, type ToolResultTrace } from "../trace/types.js"
import { type Signal } from "./types.js"

type SessionStats = {
  sessionID: string
  timestamp: number
  health_score: number
  message_count?: number
  accepted_edits?: number
  tool_call_count?: number
  tokens_per_accepted_edit_line?: number
  signals: Array<{ type: string; severity: string }>
}

/**
 * Signal extractors - pure functions that analyze traces
 */

/**
 * Extract REPROMPT signal
 * Detects user repetition or correction patterns
 */
export function extractReprompt(events: TraceEvent[]): Signal | null {
  const messages = events.filter((e): e is MessageTrace => e.type === "message")
  const reprompts = messages.filter(m => m.signal === "reprompt")

  if (reprompts.length === 0) return null

  const patterns = new Set<string>()
  for (const msg of reprompts) {
    if (msg.signal === "reprompt") {
      patterns.add("user_repeated_intent")
    }
  }

  return {
    type: "REPROMPT",
    severity: reprompts.length > 2 ? "high" : "medium",
    description: `User re-prompted ${reprompts.length} times in session`,
    evidence: [`Detected ${reprompts.length} reprompt messages`],
    detected_at: Date.now(),
    rule: "message.signal == 'reprompt'",
  }
}

/**
 * Extract TOOL_LOOP signal
 * Detects repeated tool calls on same path
 */
export function extractToolLoop(events: TraceEvent[]): Signal | null {
  const toolCalls = events.filter((e): e is ToolCallTrace => e.type === "tool_call")

  const toolPathCount: Record<string, number> = {}
  for (const call of toolCalls) {
    const key = `${call.tool}:${call.path || "no-path"}`
    toolPathCount[key] = (toolPathCount[key] || 0) + 1
  }

  const loops = Object.entries(toolPathCount).filter(([_, count]) => count >= 3)

  if (loops.length === 0) return null

  const topLoop = loops.sort((a, b) => b[1] - a[1])[0]
  const [key, count] = topLoop
  const [tool, path] = key.split(":")

  return {
    type: "TOOL_LOOP",
    severity: count > 4 ? "high" : "medium",
    description: `Tool '${tool}' called ${count} times on ${path}`,
    evidence: [`Detected repeated ${tool} calls on ${path}`],
    detected_at: Date.now(),
    rule: "tool_call[same_tool + same_path] >= 3",
  }
}

/**
 * Extract CONTEXT_GAP signal
 * Detects files accessed early but not in initial context
 */
export function extractContextGap(events: TraceEvent[]): Signal | null {
  const toolCalls = events.filter((e): e is ToolCallTrace => e.type === "tool_call")

  const accessedPaths: Set<string> = new Set()
  const earlyAccess: Array<{ path: string; order: number; tool: string }> = []

  for (const call of toolCalls) {
    if (call.path && call.order <= 2) {
      earlyAccess.push({ path: call.path, order: call.order, tool: call.tool })
    }
    if (call.path) {
      accessedPaths.add(call.path)
    }
  }

  if (earlyAccess.length === 0) return null

  const topPath = earlyAccess[0]

  return {
    type: "CONTEXT_GAP",
    severity: "medium",
    description: `File '${topPath.path}' accessed in first ${topPath.order + 1} tool calls`,
    evidence: [`File needed early: ${topPath.path}`],
    detected_at: Date.now(),
    rule: "tool_call[order <= 2].path detected",
  }
}

/**
 * Extract SESSION_ABANDONED signal
 * Detects sessions with no accepted changes
 */
export function extractSessionAbandoned(
  events: TraceEvent[],
  messageCount: number,
  acceptedEdits: number,
): Signal | null {
  const toolCalls = events.filter((e): e is ToolCallTrace => e.type === "tool_call")

  if (messageCount < 5 && acceptedEdits === 0 && toolCalls.length === 0) {
    return {
      type: "SESSION_ABANDONED",
      severity: "high",
      description: "Session ended with no accepted edits and minimal activity",
      evidence: ["No accepted edits", `${messageCount} messages`, `${toolCalls.length} tool calls`],
      detected_at: Date.now(),
      rule: "messageCount < 5 AND acceptedEdits == 0",
    }
  }

  return null
}

/**
 * Extract REVERSION signal
 * Detects when agent edits don't survive git diff
 */
export function extractReversion(reversionData: { filePaths: string[]; linesReverted: number }): Signal | null {
  if (reversionData.filePaths.length === 0) return null

  return {
    type: "REVERSION",
    severity: reversionData.linesReverted > 20 ? "high" : "medium",
    description: `${reversionData.linesReverted} lines reverted from agent edits`,
    evidence: reversionData.filePaths.map(p => `Reverted: ${p}`),
    detected_at: Date.now(),
    rule: "git_diff(agent_edits) not in current_tree",
  }
}

/**
 * Extract TOKEN_EFFICIENCY_DEGRADATION signal.
 * Uses a simple effort proxy when raw token counts are unavailable.
 */
export function extractTokenEfficiencyDegradation(
  history: SessionStats[],
  current: {
    sessionID: string
    messageCount: number
    acceptedEdits: number
    toolCallCount: number
  },
): Signal | null {
  const score = thisEfficiency(current.messageCount, current.toolCallCount, current.acceptedEdits)
  const past = history
    .filter(x => x.sessionID !== current.sessionID)
    .filter(x => typeof x.accepted_edits === "number" && (x.accepted_edits ?? 0) > 0)
    .slice(0, 10)
    .map(x => x.tokens_per_accepted_edit_line ?? thisEfficiency(x.message_count ?? 0, x.tool_call_count ?? 0, x.accepted_edits ?? 0))
    .filter(x => Number.isFinite(x) && x > 0)

  if (past.length < 3) return null

  const avg = past.reduce((sum, x) => sum + x, 0) / past.length
  if (score <= avg * 1.25) return null

  return {
    type: "TOKEN_EFFICIENCY_DEGRADATION",
    severity: score >= avg * 1.75 ? "high" : "medium",
    description: `Current session used ${score.toFixed(1)} effort units per accepted edit versus recent average ${avg.toFixed(1)}`,
    evidence: [
      `current=${score.toFixed(1)}`,
      `recent_avg=${avg.toFixed(1)}`,
      `messages=${current.messageCount}`,
      `tool_calls=${current.toolCallCount}`,
      `accepted_edits=${current.acceptedEdits}`,
    ],
    detected_at: Date.now(),
    rule: "recent_effort_per_accepted_edit > recent_average * 1.25",
  }
}

/**
 * Extract TOOL_PREFERENCE_MISMATCH signal.
 * Flags repeated shell-style tool usage during file-centric work.
 */
export function extractToolPreferenceMismatch(events: TraceEvent[]): Signal | null {
  const toolCalls = events.filter((e): e is ToolCallTrace => e.type === "tool_call")
  const shell = toolCalls.filter(call => ["bash", "shell", "terminal"].includes(call.tool.toLowerCase()))
  if (shell.length < 3) return null

  const fileish = toolCalls.some(call => {
    if (!call.path) return false
    return /\.(ts|tsx|js|jsx|py|rs|go|java|kt|swift|md|json)$/i.test(call.path)
  })

  if (!fileish) return null

  return {
    type: "TOOL_PREFERENCE_MISMATCH",
    severity: shell.length >= 5 ? "high" : "medium",
    description: `Session relied on ${shell.length} shell-style tool calls alongside file-based work`,
    evidence: shell.slice(0, 5).map(call => `${call.tool}:${call.path ?? "no-path"}`),
    detected_at: Date.now(),
    rule: "shell_usage >= 3 and file-based work present",
  }
}

function thisEfficiency(messageCount: number, toolCallCount: number, acceptedEdits: number): number {
  return (messageCount + toolCallCount * 2) / Math.max(1, acceptedEdits)
}

/**
 * Calculate health score from signals
 * Based on signal frequency and severity
 */
export function calculateHealthScore(signals: Signal[]): number {
  let score = 1.0

  for (const signal of signals) {
    const weight = signal.severity === "high" ? 0.3 : signal.severity === "medium" ? 0.15 : 0.05

    switch (signal.type) {
      case "REPROMPT":
        score -= weight * 0.3 // Reprompts are moderately bad
        break
      case "REVERSION":
        score -= weight * 0.4 // Reversions are very bad
        break
      case "TOOL_LOOP":
        score -= weight * 0.25 // Tool loops are moderately bad
        break
      case "CONTEXT_GAP":
        score -= weight * 0.2 // Context gaps are somewhat bad
        break
      case "SESSION_ABANDONED":
        score -= weight * 0.5 // Abandonments are very bad
        break
      case "TOKEN_EFFICIENCY_DEGRADATION":
        score -= weight * 0.15 // Token issues are minor
        break
      case "TOOL_PREFERENCE_MISMATCH":
        score -= weight * 0.1 // Tool preferences are very minor
        break
    }
  }

  return Math.max(0, Math.min(1, score))
}

/**
 * Extract all signals from a session trace
 */
export function extractAllSignals(
  events: TraceEvent[],
  additionalData: {
    messageCount: number
    acceptedEdits: number
    toolCallCount?: number
    reversionData: { filePaths: string[]; linesReverted: number }
    history?: SessionStats[]
    sessionID?: string
  },
): Signal[] {
  const signals: Signal[] = []

  const reprompt = extractReprompt(events)
  if (reprompt) signals.push(reprompt)

  const toolLoop = extractToolLoop(events)
  if (toolLoop) signals.push(toolLoop)

  const contextGap = extractContextGap(events)
  if (contextGap) signals.push(contextGap)

  const abandoned = extractSessionAbandoned(
    events,
    additionalData.messageCount,
    additionalData.acceptedEdits,
  )
  if (abandoned) signals.push(abandoned)

  const reversion = extractReversion(additionalData.reversionData)
  if (reversion) signals.push(reversion)

  const token = extractTokenEfficiencyDegradation(additionalData.history ?? [], {
    sessionID: additionalData.sessionID ?? "unknown",
    messageCount: additionalData.messageCount,
    acceptedEdits: additionalData.acceptedEdits,
    toolCallCount: additionalData.toolCallCount ?? 0,
  })
  if (token) signals.push(token)

  const toolPref = extractToolPreferenceMismatch(events)
  if (toolPref) signals.push(toolPref)

  return signals
}
