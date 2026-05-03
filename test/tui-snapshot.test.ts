import { describe, expect, it } from "bun:test"
import { resolve } from "path"
import { HarnessWriter } from "../src/harness/writer.js"
import { ProposerWriter } from "../src/proposer/writer.js"
import { queue, snapshot } from "../src/tui.js"

describe("TUI Snapshot", () => {
  const root = resolve(`.coevolve-tui-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  it("should build dashboard snapshot", async () => {
    const harness = new HarnessWriter(resolve(root, ".coevolve", "harness"))
    const proposer = new ProposerWriter(resolve(root, ".coevolve", "proposals"))
    await harness.init()
    await proposer.init()

    await Bun.write(
      resolve(root, ".coevolve", "experience", "session-a", "signals.json"),
      JSON.stringify({
        sessionID: "a",
        timestamp: Date.now(),
        health_score: 0.8,
        signals: [{ type: "REPROMPT", severity: "medium" }],
      }),
    )

    await proposer.writePending({
      id: "p1",
      generated_at: new Date().toISOString(),
      proposer_version: "1.0",
      harness_tree_parent: "root",
      change_type: "add_instruction",
      target_section: "system_prompt_extensions",
      proposed_addition: {
        path: null,
        content: "Prefer terse answers",
        format: "full",
        reason: "Lower verbosity",
        condition: null,
      },
      rationale: "Frequent long responses",
      evidence_nodes: ["n1"],
      evidence_sessions: ["a"],
      confidence: "medium",
      expected_improvement: "less churn",
      detection_criterion: "fewer reprompts",
      reversibility_note: "safe rollback",
      what_was_tried_before: null,
      trigger: "manual",
    })

    const out = await snapshot(root)
    expect(out.node).toBe("root")
    expect(out.pending).toBe(1)
    expect(out.sessions).toBe(1)
    expect(out.health).toBeGreaterThan(0)
  })

  it("should map review queue entries", async () => {
    const proposer = new ProposerWriter(resolve(root, ".coevolve", "proposals"))
    await proposer.init()

    await proposer.writePending({
      id: "p2",
      generated_at: new Date().toISOString(),
      proposer_version: "1.0",
      harness_tree_parent: "root",
      change_type: "add_context_file",
      target_section: "initial_context_files",
      proposed_addition: {
        path: "README.md",
        content: null,
        format: "summary_20_lines",
        reason: "Core docs",
        condition: null,
      },
      rationale: "Repeated setup confusion",
      evidence_nodes: ["n2"],
      evidence_sessions: ["b"],
      confidence: "high",
      expected_improvement: "faster starts",
      detection_criterion: "fewer setup prompts",
      reversibility_note: "delete if noisy",
      what_was_tried_before: null,
      trigger: "session_count",
    })

    const out = await queue(root)
    expect(out.length).toBeGreaterThan(0)
    expect(out.some(x => x.id === "p2" && x.change === "add_context_file")).toBeTrue()
  })
})
