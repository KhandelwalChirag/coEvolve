import { describe, expect, it } from "bun:test"
import { resolve } from "path"
import { HarnessWriter } from "../src/harness/index.js"
import { MemoryWriter } from "../src/memory/index.js"
import { ProposerReview, ProposerWriter } from "../src/proposer/index.js"

describe("ProposerReview", () => {
  const root = resolve(`.coevolve-proposer-review-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  it("should apply pending proposal into harness tree and archive", async () => {
    const harness = new HarnessWriter(resolve(root, ".coevolve", "harness"))
    const cur = await harness.init()

    const memory = new MemoryWriter(resolve(root, ".coevolve", "memory"))
    await memory.init()
    await memory.writeNode({
      id: "node-1",
      created_at: 1,
      content: "auth context gap",
      keywords: ["auth"],
      tags: ["CONTEXT_GAP"],
      evidence_sessions: ["s1"],
      linked_nodes: [],
      link_reasons: {},
      confidence: 0.8,
      status: "active",
      source: "heuristic",
      resolved_by_proposal: null,
    })

    const writer = new ProposerWriter(resolve(root, ".coevolve", "proposals"))
    await writer.init()
    await writer.writePending({
      id: "prop-apply-1",
      generated_at: new Date().toISOString(),
      proposer_version: "1.0",
      harness_tree_parent: cur.tree_node,
      change_type: "add_context_file",
      target_section: "initial_context_files",
      proposed_addition: {
        path: "src/auth/RateLimiter.ts",
        content: null,
        format: "summary_10_lines",
        reason: "test",
        condition: null,
      },
      rationale: "test",
      evidence_nodes: ["node-1"],
      evidence_sessions: ["s1", "s2", "s3"],
      confidence: "high",
      expected_improvement: "lower reprompt",
      detection_criterion: "rate down",
      reversibility_note: "rollback",
      what_was_tried_before: null,
      trigger: "manual",
    })

    const review = new ProposerReview(root)
    const out = await review.apply()

    const next = await harness.readCurrent()
    const pending = await writer.readPending()
    const appliedPath = resolve(
      root,
      ".coevolve",
      "proposals",
      "history",
      "applied",
    )
    const applied = await Array.fromAsync(new Bun.Glob("proposal-*.json").scan({ cwd: appliedPath }))
    const node = (await memory.readNodes()).find(x => x.id === "node-1")

    expect(out.state).toBe("applied")
    expect(out.node).not.toBeNull()
    expect(next.initial_context_files.some(x => x.path === "src/auth/RateLimiter.ts")).toBeTrue()
    expect(pending.length).toBe(0)
    expect(applied.length).toBe(1)
    expect(node?.status).toBe("resolved")
    expect(node?.resolved_by_proposal).toBe("prop-apply-1")
  })

  it("should dismiss pending proposal and archive with memory tag", async () => {
    const dir = resolve(`${root}-dismiss`)
    const harness = new HarnessWriter(resolve(dir, ".coevolve", "harness"))
    const cur = await harness.init()

    const memory = new MemoryWriter(resolve(dir, ".coevolve", "memory"))
    await memory.init()
    await memory.writeNode({
      id: "node-9",
      created_at: 1,
      content: "loop",
      keywords: ["loop"],
      tags: ["TOOL_LOOP"],
      evidence_sessions: ["x"],
      linked_nodes: [],
      link_reasons: {},
      confidence: 0.7,
      status: "active",
      source: "heuristic",
      resolved_by_proposal: null,
    })

    const writer = new ProposerWriter(resolve(dir, ".coevolve", "proposals"))
    await writer.init()
    await writer.writePending({
      id: "prop-dismiss-1",
      generated_at: new Date().toISOString(),
      proposer_version: "1.0",
      harness_tree_parent: cur.tree_node,
      change_type: "add_instruction",
      target_section: "system_prompt_extensions",
      proposed_addition: {
        path: null,
        content: "inspect code first",
        format: null,
        reason: "test",
        condition: null,
      },
      rationale: "test",
      evidence_nodes: ["node-9"],
      evidence_sessions: ["x", "y", "z"],
      confidence: "medium",
      expected_improvement: "reduce loop",
      detection_criterion: "loop down",
      reversibility_note: "undo",
      what_was_tried_before: null,
      trigger: "manual",
    })

    const review = new ProposerReview(dir)
    const out = await review.dismiss({ note: "not now" })

    const pending = await writer.readPending()
    const dismissedPath = resolve(
      dir,
      ".coevolve",
      "proposals",
      "history",
      "dismissed",
    )
    const dismissed = await Array.fromAsync(new Bun.Glob("proposal-*.json").scan({ cwd: dismissedPath }))
    const node = (await memory.readNodes()).find(x => x.id === "node-9")

    expect(out.state).toBe("dismissed")
    expect(pending.length).toBe(0)
    expect(dismissed.length).toBe(1)
    expect(node?.tags.includes("proposal:dismissed_once")).toBeTrue()
  })
})
