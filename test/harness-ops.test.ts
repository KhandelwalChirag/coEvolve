import { describe, expect, it } from "bun:test"
import { resolve } from "path"
import { HarnessOps, HarnessWriter } from "../src/harness/index.js"

describe("HarnessOps", () => {
  const root = resolve(`.coevolve-ops-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  it("should rollback current harness to target node", async () => {
    const writer = new HarnessWriter(root)
    const cur = await writer.init()
    const now = Date.now()

    await writer.writeNode("node-a", {
      ...cur,
      created_at: now,
      updated_at: now,
      tree_node: "node-a",
      parent_node: "root",
      health_at_creation: 0.8,
    })

    const ops = new HarnessOps(root)
    await ops.rollback("node-a")

    const next = await writer.readCurrent()
    expect(next.tree_node).toBe("node-a")
    expect(next.parent_node).toBe("root")
  })

  it("should lock and unlock rules with invariant sync", async () => {
    const writer = new HarnessWriter(root)
    const cur = await writer.readCurrent()
    const now = Date.now()

    await writer.writeCurrent({
      ...cur,
      tool_preferences: [
        {
          id: "tp-1",
          rule: "Prefer lsp over bash",
          reason: "signal",
          locked: false,
        },
      ],
      updated_at: now,
    })

    const ops = new HarnessOps(root)
    await ops.lock("tp-1")

    const mid = await writer.readCurrent()
    expect(mid.tool_preferences[0].locked).toBeTrue()
    expect(mid.invariant_rules.some(x => x.id === "inv-tp-1")).toBeTrue()

    await ops.unlock("tp-1")
    const end = await writer.readCurrent()
    expect(end.tool_preferences[0].locked).toBeFalse()
    expect(end.invariant_rules.some(x => x.id === "inv-tp-1")).toBeFalse()
  })
})
