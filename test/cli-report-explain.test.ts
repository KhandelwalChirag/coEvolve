import { describe, expect, it } from "bun:test"
import { resolve } from "path"
import { explain, report } from "../src/cli/index.js"

describe("CLI Report Explain", () => {
  const root = resolve(`.coevolve-cli-report-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  it("should write report file", async () => {
    await Bun.write(
      resolve(root, ".coevolve", "experience", "session-s1", "signals.json"),
      JSON.stringify({
        sessionID: "s1",
        signals: [{ type: "CONTEXT_GAP", severity: "medium" }],
        health_score: 0.55,
        timestamp: Date.now(),
      }),
    )

    const out = await report(root)
    expect(out).toContain("report_written")
  })

  it("should explain latest session", async () => {
    await Bun.write(
      resolve(root, ".coevolve", "experience", "session-s1", "reflection.json"),
      JSON.stringify({
        sessionID: "s1",
        task_summary: "test task",
        root_cause: { main_issue: "context gap" },
      }),
    )

    const out = await explain(root, "s1")
    expect(out).toContain("Session s1 analysis")
    expect(out).toContain("context gap")
  })
})
