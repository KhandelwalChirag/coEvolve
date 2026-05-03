import { resolve } from "path"
import { z } from "zod"
import { askJSON } from "../llm/json.js"
import { MemoryWriter } from "../memory/writer.js"
import { HarnessWriter } from "../harness/writer.js"
import { Proposal, type Proposal as Info, type ProposalTrigger } from "./types.js"

type Input = {
  directory: string
  client?: unknown
}

export class ProposerGenerator {
  private dir: string
  private client?: unknown

  constructor(input: Input) {
    this.dir = input.directory
    this.client = input.client
  }

  async generate(input: { trigger: ProposalTrigger; parent?: string; tried?: string | null }): Promise<Info | null> {
    const node = input.parent ?? (await this.currentNode())
    const mem = new MemoryWriter(resolve(this.dir, ".coevolve", "memory"))
    await mem.init()
    const all = await mem.readNodes()
    const pick = all
      .filter(x => x.status === "active")
      .sort((a, b) => b.confidence - a.confidence || b.created_at - a.created_at)
      .slice(0, 5)

    const sessions = [...new Set(pick.flatMap(x => x.evidence_sessions))]
    if (pick.length === 0 || sessions.length < 3) return null

    const llm = await this.llm({ pick, sessions, node, trigger: input.trigger, tried: input.tried ?? null })
    if (llm) return llm

    const file = this.path(pick)
    const now = new Date()
    const id = `prop-${now.toISOString().replace(/[:.]/g, "-")}`
    const change = file ? "add_context_file" : "add_instruction"
    const target = file ? "initial_context_files" : "system_prompt_extensions"
    const confidence = sessions.length >= 5 ? "high" : "medium"

    return Proposal.parse({
      id,
      generated_at: now.toISOString(),
      proposer_version: "1.0",
      harness_tree_parent: node,
      change_type: change,
      target_section: target,
      proposed_addition: {
        path: file,
        content: file
          ? null
          : "Before writing code, load nearby implementation and tests to mirror local conventions.",
        format: file ? "summary_10_lines" : null,
        reason: "highest_frequency_active_memory_pattern",
        condition: null,
      },
      rationale: "Recent unresolved memories indicate recurring context misses that can be reduced with one focused harness addition.",
      evidence_nodes: pick.map(x => x.id).slice(0, 3),
      evidence_sessions: sessions.slice(0, 6),
      confidence,
      expected_improvement: "Lower re-prompt and context-gap signals in the next 5 similar sessions.",
      detection_criterion: "Signal rate for matching sessions drops by at least 30% over the next 5 sessions.",
      reversibility_note: "Rollback this addition if no measurable improvement is observed after the evaluation window.",
      what_was_tried_before: input.tried ?? null,
      trigger: input.trigger,
    })
  }

  private async llm(input: {
    pick: Array<{ id: string; content: string; evidence_sessions: string[] }>
    sessions: string[]
    node: string
    trigger: ProposalTrigger
    tried: string | null
  }): Promise<Info | null> {
    const schema = z.object({
      change_type: z.enum(["add_context_file", "add_instruction", "add_tool_preference"]),
      target_section: z.enum(["initial_context_files", "system_prompt_extensions", "tool_preferences"]),
      path: z.string().nullable(),
      content: z.string().nullable(),
      condition: z.string().nullable(),
      rationale: z.string(),
      expected_improvement: z.string(),
      detection_criterion: z.string(),
      reversibility_note: z.string(),
      confidence: z.enum(["low", "medium", "high"]),
    })

    const out = await askJSON({
      client: this.client,
      directory: this.dir,
      title: "CoEvolve Proposer",
      prompt: [
        "Generate one harness proposal from active memory evidence.",
        "Never remove or modify invariant rules.",
        `Current node: ${input.node}`,
        `What was tried before: ${input.tried ?? "unknown"}`,
        `Evidence sessions: ${input.sessions.join(", ")}`,
        ...input.pick.map(x => `Node ${x.id}: ${x.content}`),
      ].join("\n"),
      schema,
    })

    if (!out) return null

    const now = new Date()
    return Proposal.parse({
      id: `prop-${now.toISOString().replace(/[:.]/g, "-")}`,
      generated_at: now.toISOString(),
      proposer_version: "1.0",
      harness_tree_parent: input.node,
      change_type: out.change_type,
      target_section: out.target_section,
      proposed_addition: {
        path: out.path,
        content: out.content,
        format: out.path ? "summary_10_lines" : null,
        reason: "model_generated",
        condition: out.condition,
      },
      rationale: out.rationale,
      evidence_nodes: input.pick.map(x => x.id).slice(0, 3),
      evidence_sessions: input.sessions.slice(0, 6),
      confidence: out.confidence,
      expected_improvement: out.expected_improvement,
      detection_criterion: out.detection_criterion,
      reversibility_note: out.reversibility_note,
      what_was_tried_before: input.tried,
      trigger: input.trigger,
    })
  }

  private path(nodes: Array<{ content: string; keywords: string[] }>): string | null {
    const text = nodes.flatMap(x => [x.content, ...x.keywords]).join(" ")
    const hit = text.match(/[a-zA-Z0-9_./-]+\.(ts|tsx|js|jsx|py|rs|go|java|kt|swift|md|json)/)
    return hit ? hit[0] : null
  }

  private async currentNode(): Promise<string> {
    const writer = new HarnessWriter(resolve(this.dir, ".coevolve", "harness"))
    const harness = await writer.init()
    return harness.tree_node
  }
}
