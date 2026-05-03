import { describe, expect, it } from "bun:test"
import { resolve } from "path"
import { ProposerWriter, type Proposal } from "../src/proposer/index.js"

describe("ProposerWriter", () => {
  const root = resolve(`.coevolve-proposer-writer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  it("should write and read pending proposals", async () => {
    const writer = new ProposerWriter(resolve(root, ".coevolve", "proposals"))
    await writer.init()

    const data: Proposal = {
      id: "prop-1",
      generated_at: new Date().toISOString(),
      proposer_version: "1.0",
      harness_tree_parent: "root",
      change_type: "add_instruction",
      target_section: "system_prompt_extensions",
      proposed_addition: {
        path: null,
        content: "Always inspect tests before edits",
        format: null,
        reason: "test",
        condition: null,
      },
      rationale: "repeat issue",
      evidence_nodes: ["node-1"],
      evidence_sessions: ["sess-1", "sess-2", "sess-3"],
      confidence: "medium",
      expected_improvement: "fewer reprompts",
      detection_criterion: "reprompt drops",
      reversibility_note: "remove if no effect",
      what_was_tried_before: null,
      trigger: "manual",
    }

    await writer.writePending(data)

    const list = await writer.readPending()
    expect(list.length).toBe(1)
    expect(list[0].id).toBe("prop-1")
    expect(await writer.hasPending()).toBeTrue()
    expect(await writer.lastGeneratedAt()).toBeGreaterThan(0)
  })
})
