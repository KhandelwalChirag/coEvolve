import { resolve } from "path"
import { HarnessTree } from "../harness/tree.js"
import { HarnessWriter } from "../harness/writer.js"
import { MemoryWriter } from "../memory/writer.js"
import { type Proposal } from "./types.js"
import { ProposerWriter } from "./writer.js"

type Result = {
  state: "applied" | "dismissed" | "skipped"
  reason: string
  proposal_id: string | null
  node: string | null
}

export class ProposerReview {
  private dir: string
  private writer: ProposerWriter

  constructor(directory: string) {
    this.dir = directory
    this.writer = new ProposerWriter(resolve(directory, ".coevolve", "proposals"))
  }

  async apply(input?: { id?: string; edit?: Partial<Proposal> }): Promise<Result> {
    await this.writer.init()
    const entry = await this.writer.readPendingEntry(input?.id)
    if (!entry) {
      return { state: "skipped", reason: "missing_pending", proposal_id: null, node: null }
    }

    const proposal = {
      ...entry.proposal,
      ...input?.edit,
    }

    const root = resolve(this.dir, ".coevolve", "harness")
    const tree = new HarnessTree(root)
    const harnessWriter = new HarnessWriter(root)
    const memory = new MemoryWriter(resolve(this.dir, ".coevolve", "memory"))

    const cur = await harnessWriter.init()
    const next = this.patch(cur, proposal)
    const parent = (await tree.readNode(proposal.harness_tree_parent))
      ? proposal.harness_tree_parent
      : cur.tree_node

    const node = await tree.create({
      parent,
      harness: next,
      note: `proposal:${proposal.id}:${proposal.change_type}`,
      health: cur.health_at_creation,
      apply: true,
    })

    await memory.init()
    await memory.resolve(proposal.evidence_nodes, proposal.id)

    await this.writer.archive(entry.name, "applied", {
      ...proposal,
      applied_at: new Date().toISOString(),
      applied_node: node,
      outcome: "applied",
    })
    await this.writer.removePending(entry.name)

    return { state: "applied", reason: "ok", proposal_id: proposal.id, node }
  }

  async dismiss(input?: { id?: string; note?: string }): Promise<Result> {
    await this.writer.init()
    const entry = await this.writer.readPendingEntry(input?.id)
    if (!entry) {
      return { state: "skipped", reason: "missing_pending", proposal_id: null, node: null }
    }

    const proposal = entry.proposal
    const memory = new MemoryWriter(resolve(this.dir, ".coevolve", "memory"))
    await memory.init()
    await memory.dismiss(proposal.evidence_nodes)
    await this.writer.markDismissed(proposal.evidence_nodes)

    await this.writer.archive(entry.name, "dismissed", {
      ...proposal,
      dismissed_at: new Date().toISOString(),
      dismiss_note: input?.note ?? null,
      outcome: "dismissed",
    })
    await this.writer.removePending(entry.name)

    return { state: "dismissed", reason: "ok", proposal_id: proposal.id, node: null }
  }

  private patch(cur: Awaited<ReturnType<HarnessWriter["readCurrent"]>>, proposal: Proposal) {
    const now = Date.now()
    if (proposal.change_type === "remove_context_file" && proposal.proposed_addition.path) {
      return {
        ...cur,
        source: "proposal" as const,
        confidence: proposal.confidence,
        initial_context_files: cur.initial_context_files.filter(
          x => !(x.path === proposal.proposed_addition.path && !x.locked),
        ),
      }
    }

    if (proposal.change_type === "remove_tool_preference" && proposal.proposed_addition.content) {
      return {
        ...cur,
        source: "proposal" as const,
        confidence: proposal.confidence,
        tool_preferences: cur.tool_preferences.filter(
          x => !(x.rule === proposal.proposed_addition.content && !x.locked),
        ),
      }
    }

    if (proposal.change_type === "remove_instruction" && proposal.proposed_addition.content) {
      return {
        ...cur,
        source: "proposal" as const,
        confidence: proposal.confidence,
        system_prompt_extensions: cur.system_prompt_extensions.filter(
          x => !(x.content === proposal.proposed_addition.content && !x.locked),
        ),
      }
    }

    if (proposal.target_section === "initial_context_files" && proposal.proposed_addition.path) {
      const exists = cur.initial_context_files.some(x => x.path === proposal.proposed_addition.path)
      if (exists) return cur

      return {
        ...cur,
        source: "proposal" as const,
        confidence: proposal.confidence,
        initial_context_files: [
          ...cur.initial_context_files,
          {
            id: `ctx-${now}`,
            path: proposal.proposed_addition.path,
            format: proposal.proposed_addition.format ?? "summary_10_lines",
            reason: proposal.proposed_addition.reason,
            condition: proposal.proposed_addition.condition,
            locked: false,
          },
        ],
      }
    }

    if (proposal.target_section === "tool_preferences" && proposal.proposed_addition.content) {
      const exists = cur.tool_preferences.some(x => x.rule === proposal.proposed_addition.content)
      if (exists) return cur

      return {
        ...cur,
        source: "proposal" as const,
        confidence: proposal.confidence,
        tool_preferences: [
          ...cur.tool_preferences,
          {
            id: `tp-${now}`,
            rule: proposal.proposed_addition.content,
            reason: proposal.proposed_addition.reason,
            locked: false,
          },
        ],
      }
    }

    if (proposal.proposed_addition.content) {
      const exists = cur.system_prompt_extensions.some(x => x.content === proposal.proposed_addition.content)
      if (exists) return cur

      return {
        ...cur,
        source: "proposal" as const,
        confidence: proposal.confidence,
        system_prompt_extensions: [
          ...cur.system_prompt_extensions,
          {
            id: `ext-${now}`,
            content: proposal.proposed_addition.content,
            reason: proposal.proposed_addition.reason,
            added_at: now,
            added_by: "proposer" as const,
            confidence: proposal.confidence,
            locked: false,
          },
        ],
      }
    }

    return cur
  }
}
