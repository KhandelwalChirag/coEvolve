import { describe, expect, it } from "bun:test"
import { resolve } from "path"
import { exportHarness, reset } from "../src/cli/index.js"
import { HarnessWriter } from "../src/harness/index.js"

describe("CLI Reset Export", () => {
  const root = resolve(`.coevolve-cli-reset-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  it("should export current harness", async () => {
    const harness = new HarnessWriter(resolve(root, ".coevolve", "harness"))
    await harness.init()
    const out = await exportHarness(root)
    expect(out).toContain("export_written")
  })

  it("should reset harness and archive old data", async () => {
    const harness = new HarnessWriter(resolve(root, ".coevolve", "harness"))
    await harness.init()
    await Bun.write(resolve(root, ".coevolve", "proposals", "pending", "proposal-1.json"), "{}")

    const out = await reset({ directory: root })
    expect(out).toContain("reset_complete")

    const cur = await Bun.file(resolve(root, ".coevolve", "harness", "current.json")).json().catch(() => null)
    expect(cur).not.toBeNull()
  })
})
