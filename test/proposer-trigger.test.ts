import { describe, expect, it } from "bun:test"
import { resolve } from "path"
import { ProposerTrigger, ProposerWriter, type Proposal } from "../src/proposer/index.js"

function signal(type: string, ts: number) {
  return {
    sessionID: `sess-${ts}`,
    signals: [
      {
        type,
      },
    ],
    health_score: 0.6,
    timestamp: ts,
  }
}

describe("ProposerTrigger", () => {
  const root = resolve(`.coevolve-proposer-trigger-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  it("should trigger when ten sessions accumulated since last proposal", async () => {
    const writer = new ProposerWriter(resolve(root, ".coevolve", "proposals"))
    await writer.init()

    for (let i = 1; i <= 10; i++) {
      await Bun.write(resolve(root, ".coevolve", "experience", `session-${i}`, "signals.json"), JSON.stringify(signal("TOOL_LOOP", i)))
    }

    const trigger = new ProposerTrigger({ directory: root, writer })
    const out = await trigger.check()
    expect(out.should).toBeTrue()
    expect(out.reason).toBe("session_count")
    expect(out.stats.sessions_since_last).toBe(10)
  })

  it("should trigger on reprompt rate when enough recent sessions show reprompts", async () => {
    const writer = new ProposerWriter(resolve(root, ".coevolve", "proposals"))
    await writer.init()

    const proposal: Proposal = {
      id: "prop-existing",
      generated_at: new Date().toISOString(),
      proposer_version: "1.0",
      harness_tree_parent: "root",
      change_type: "add_instruction",
      target_section: "system_prompt_extensions",
      proposed_addition: {
        path: null,
        content: "baseline",
        format: null,
        reason: "baseline",
        condition: null,
      },
      rationale: "baseline",
      evidence_nodes: ["node-x"],
      evidence_sessions: ["a", "b", "c"],
      confidence: "low",
      expected_improvement: "baseline",
      detection_criterion: "baseline",
      reversibility_note: "baseline",
      what_was_tried_before: null,
      trigger: "manual",
    }
    await writer.writePending(proposal)

    for (let i = 11; i <= 20; i++) {
      const type = i <= 14 ? "REPROMPT" : "TOOL_LOOP"
      await Bun.write(resolve(root, ".coevolve", "experience", `session-${i}`, "signals.json"), JSON.stringify(signal(type, i)))
    }

    const trigger = new ProposerTrigger({ directory: root, writer })
    const out = await trigger.check()
    expect(out.should).toBeTrue()
    expect(out.reason).toBe("reprompt_rate")
    expect(out.stats.reprompt_rate).toBeGreaterThan(0.3)
    expect(out.stats.sessions_since_last).toBe(0)
  })
})
