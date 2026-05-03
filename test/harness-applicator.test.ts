import { describe, expect, it } from "bun:test"
import { resolve } from "path"
import { Harness, HarnessApplicator } from "../src/harness/index.js"

describe("HarnessApplicator", () => {
  const root = resolve(`.coevolve-applicator-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  it("should build system injection from harness sections", async () => {
    await Bun.write(resolve(root, "README.md"), "line-1\nline-2\nline-3")

    const now = Date.now()
    const harness = Harness.parse({
      version: "1.0",
      created_at: now,
      updated_at: now,
      tree_node: "root",
      parent_node: null,
      health_at_creation: 0.5,
      system_prompt_extensions: [
        {
          id: "ext-1",
          content: "Use project patterns",
          reason: "learned",
          added_at: now,
          added_by: "proposer",
          confidence: "high",
          locked: false,
        },
      ],
      initial_context_files: [
        {
          id: "ctx-1",
          path: "README.md",
          format: "summary_10_lines",
          reason: "common",
          condition: null,
          locked: false,
        },
      ],
      invariant_rules: [
        {
          id: "inv-1",
          content: "Never use Node 20 APIs",
          set_by: "user",
          locked: true,
        },
      ],
    })

    const app = new HarnessApplicator()
    const out = await app.build({ harness, directory: root })

    expect(out).not.toBeNull()
    expect(out ?? "").toContain("CoEvolve Harness Injection")
    expect(out ?? "").toContain("Use project patterns")
    expect(out ?? "").toContain("Never use Node 20 APIs")
    expect(out ?? "").toContain("line-1")
  })

  it("should apply session_touches_path condition from trace", async () => {
    await Bun.write(resolve(root, "src", "auth", "rules.ts"), "export const x = 1")
    await Bun.write(
      resolve(root, ".coevolve", "experience", "session-s1", "trace.jsonl"),
      JSON.stringify({ type: "tool_call", tool: "read", path: "src/auth/rules.ts", order: 0, ts: Date.now() }) + "\n",
    )

    const now = Date.now()
    const harness = Harness.parse({
      version: "1.0",
      created_at: now,
      updated_at: now,
      tree_node: "root",
      parent_node: null,
      health_at_creation: 0.5,
      initial_context_files: [
        {
          id: "ctx-2",
          path: "src/auth/rules.ts",
          format: "summary_10_lines",
          reason: "auth",
          condition: "session_touches_path:src/auth/",
          locked: false,
        },
      ],
    })

    const app = new HarnessApplicator()
    const out = await app.build({ harness, directory: root, sessionID: "s1" })
    expect(out ?? "").toContain("src/auth/rules.ts")
  })
})
