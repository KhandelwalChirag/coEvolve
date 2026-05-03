import { type MemoryNode, type MemoryRequest } from "./types.js"
import { z } from "zod"
import { askJSON } from "../llm/json.js"

export class MemoryGenerator {
  private client?: any
  private directory?: string

  constructor(input?: { client?: any; directory?: string }) {
    this.client = input?.client
    this.directory = input?.directory
  }

  async generate(input: MemoryRequest, existing: MemoryNode[]): Promise<MemoryNode> {
    const llm = await this.generateLLM(input, existing)
    if (llm) return llm

    const root = input.reflection.root_cause
    const keys = this.keywords(input)
    const tags = this.tags(input)
    const links = this.links(keys, existing).map(x => x.id)
    const reasons = Object.fromEntries(this.links(keys, existing).map(x => [x.id, x.reason]))
    const now = Date.now()

    return {
      id: `node-${now}-${Math.random().toString(36).slice(2, 8)}`,
      created_at: now,
      content: this.content(input),
      keywords: keys,
      tags,
      evidence_sessions: [input.sessionID],
      linked_nodes: links,
      link_reasons: reasons,
      confidence: Math.max(input.reflection.confidence, root ? 0.6 : 0.4),
      status: "active",
      source: "heuristic",
      resolved_by_proposal: null,
    }
  }

  private async generateLLM(input: MemoryRequest, existing: MemoryNode[]): Promise<MemoryNode | null> {
    if (!this.client) return null

    const schema = z.object({
      content: z.string().min(1),
      keywords: z.array(z.string()).min(3).max(20),
      tags: z.array(z.string()).min(2).max(20),
      linked_nodes: z.array(z.string()).max(5),
      link_reasons: z.record(z.string(), z.string()),
      confidence: z.number().min(0).max(1),
    })

    const msg = [
      "You are CoEvolve memory synthesizer.",
      "Build one high-value memory node JSON using the schema.",
      `SessionID: ${input.sessionID}`,
      `Health: ${input.healthScore}`,
      `Signals: ${JSON.stringify(input.signals)}`,
      `Reflection: ${JSON.stringify(input.reflection)}`,
      `ExistingNodeIDs: ${JSON.stringify(existing.slice(0, 100).map(x => x.id))}`,
      "Only include linked_nodes that exist in ExistingNodeIDs.",
    ].join("\n")

    const out = await askJSON({
      client: this.client,
      directory: this.directory,
      title: "CoEvolve Memory",
      prompt: msg,
      schema,
    })

    if (!out) return null

    const ids = new Set(existing.map(x => x.id))
    const links = out.linked_nodes.filter(x => ids.has(x))
    const reasons = Object.fromEntries(
      Object.entries(out.link_reasons).filter(([k]) => ids.has(k)),
    )

    return {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      created_at: Date.now(),
      content: out.content,
      keywords: [...new Set(out.keywords.map(x => x.toLowerCase()))],
      tags: [...new Set(out.tags.map(x => x.toLowerCase()))],
      evidence_sessions: [input.sessionID],
      linked_nodes: links,
      link_reasons: reasons,
      confidence: out.confidence,
      status: "active",
      source: "llm",
      resolved_by_proposal: null,
    }
  }

  private content(input: MemoryRequest): string {
    const root = input.reflection.root_cause
    if (root) {
      return [
        `Root issue: ${root.main_issue}`,
        `Patterns: ${root.pattern_matches.join(", ") || "none"}`,
        `Signals: ${input.signals.map(x => x.type).join(", ") || "none"}`,
        `Recommendations: ${input.reflection.recommendations.join(" | ") || "none"}`,
      ].join(" ")
    }

    return [
      `Session completed with health score ${input.healthScore.toFixed(2)}.`,
      `Signals observed: ${input.signals.map(x => x.type).join(", ") || "none"}.`,
      `Key learnings: ${input.reflection.key_learnings.join(" | ") || "none"}.`,
    ].join(" ")
  }

  private keywords(input: MemoryRequest): string[] {
    const all = [
      ...input.signals.map(x => x.type.toLowerCase()),
      ...input.reflection.key_learnings.flatMap(x => this.split(x)),
      ...input.reflection.recommendations.flatMap(x => this.split(x)),
      ...(input.reflection.root_cause?.pattern_matches ?? []).map(x => x.toLowerCase()),
    ]

    return [...new Set(all)]
      .filter(x => x.length > 2)
      .slice(0, 18)
  }

  private tags(input: MemoryRequest): string[] {
    const root = input.reflection.root_cause
    const sev = root?.severity ?? (input.healthScore < 0.5 ? "high" : "medium")

    return [
      ...new Set([
        `severity:${sev}`,
        ...input.signals.map(x => `signal:${x.type.toLowerCase()}`),
        ...(root?.pattern_matches ?? []).map(x => `pattern:${x}`),
      ]),
    ]
  }

  private links(keys: string[], existing: MemoryNode[]): Array<{ id: string; reason: string }> {
    return existing
      .map(x => ({
        id: x.id,
        score: x.keywords.filter(y => keys.includes(y)).length,
      }))
      .filter(x => x.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(x => ({ id: x.id, reason: `keyword_overlap:${x.score}` }))
  }

  private split(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9_\s/.-]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  }
}
