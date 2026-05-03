import { describe, expect, it } from "bun:test"
import { resolve } from "path"
import { HarnessWriter } from "../src/harness/index.js"
import { analyze, history, status } from "../src/cli/index.js"

describe("CLI Commands", () => {
  const root = resolve(`.coevolve-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  it("should render status output", async () => {
    const harness = new HarnessWriter(resolve(root, ".coevolve", "harness"))
    await harness.init()
    await Bun.write(
      resolve(root, ".coevolve", "experience", "session-s1", "signals.json"),
      JSON.stringify({
        sessionID: "s1",
        signals: [{ type: "REPROMPT", severity: "medium" }],
        health_score: 0.62,
        timestamp: Date.now(),
      }),
    )

    const out = await status(root)
    expect(out).toContain("CoEvolve Status")
    expect(out).toContain("pending_proposals")
  })

  it("should render analyze output", async () => {
    await Bun.write(
      resolve(root, ".coevolve", "experience", "session-s2", "signals.json"),
      JSON.stringify({
        sessionID: "s2",
        signals: [
          { type: "REVERSION", severity: "high" },
          { type: "TOOL_LOOP", severity: "medium" },
        ],
        health_score: 0.4,
        timestamp: Date.now() + 1,
      }),
    )

    const out = await analyze(root)
    expect(out).toContain("CoEvolve Analyze")
    expect(out).toContain("signals:")
    expect(out).toContain("REVERSION")
  })

  it("should render history output", async () => {
    const out = await history(root)
    expect(out).toContain("CoEvolve History")
    expect(out).toContain("root")
  })
})
