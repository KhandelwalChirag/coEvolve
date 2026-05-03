import { describe, expect, it } from "bun:test"
import { resolve } from "path"
import { HarnessTree, HarnessWriter } from "../src/harness/index.js"

describe("HarnessTree", () => {
  const root = resolve(`.coevolve-tree-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  it("should create child node and update parent metadata", async () => {
    const writer = new HarnessWriter(root)
    const cur = await writer.init()
    const tree = new HarnessTree(root)

    const id = await tree.create({
      parent: "root",
      harness: cur,
      note: "add auth context",
      health: 0.72,
    })

    const parent = await tree.readNode("root")
    const node = await tree.readNode(id)
    const score = await tree.readScore(id)
    const next = await writer.readCurrent()

    expect(parent?.children.includes(id)).toBeTrue()
    expect(node?.parent).toBe("root")
    expect(node?.note).toContain("auth")
    expect(score?.health_at_creation).toBe(0.72)
    expect(next.tree_node).toBe(id)
    expect(next.parent_node).toBe("root")
  })

  it("should list known tree nodes", async () => {
    const tree = new HarnessTree(root)
    const all = await tree.list()
    expect(all.some(x => x === "root")).toBeTrue()
    expect(all.length).toBeGreaterThan(1)
  })
})
