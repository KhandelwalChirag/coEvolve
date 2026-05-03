import { describe, expect, it } from "bun:test"
import { resolve } from "path"
import { Harness, HarnessWriter } from "../src/harness/index.js"

describe("Harness", () => {
  it("should validate minimal harness shape", () => {
    const now = Date.now()
    const out = Harness.parse({
      version: "1.0",
      created_at: now,
      updated_at: now,
      tree_node: "root",
      parent_node: null,
      health_at_creation: 0.5,
    })

    expect(out.system_prompt_extensions.length).toBe(0)
    expect(out.invariant_rules.length).toBe(0)
  })

  it("should reject health score out of range", () => {
    const now = Date.now()
    expect(() =>
      Harness.parse({
        version: "1.0",
        created_at: now,
        updated_at: now,
        tree_node: "root",
        parent_node: null,
        health_at_creation: 2,
      }),
    ).toThrow()
  })
})

describe("HarnessWriter", () => {
  const root = resolve(`.coevolve-harness-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  it("should initialize current and root tree artifacts", async () => {
    const w = new HarnessWriter(root)
    const out = await w.init({ source: "bootstrap", confidence: "low" })

    expect(out.tree_node).toBe("root")
    expect(await Bun.file(resolve(root, "current.json")).exists()).toBeTrue()
    expect(await Bun.file(resolve(root, "tree", "root", "harness.json")).exists()).toBeTrue()
    expect(await Bun.file(resolve(root, "tree", "root", "score.json")).exists()).toBeTrue()
    expect(await Bun.file(resolve(root, "tree", "root", "node.json")).exists()).toBeTrue()
  })

  it("should write and read node harness", async () => {
    const w = new HarnessWriter(root)
    const cur = await w.init()

    const now = Date.now()
    const next = {
      ...cur,
      created_at: now,
      updated_at: now,
      tree_node: "branch-a",
      parent_node: "root",
      health_at_creation: 0.71,
      system_prompt_extensions: [
        {
          id: "ext-1",
          content: "Prefer reading type files first",
          reason: "Early context gaps",
          added_at: now,
          added_by: "proposer" as const,
          confidence: "medium" as const,
          locked: false,
        },
      ],
    }

    await w.writeNode("branch-a", next)
    await w.writeCurrent(next)

    const node = await w.readNode("branch-a")
    const read = await w.readCurrent()

    expect(node?.tree_node).toBe("branch-a")
    expect(read.tree_node).toBe("branch-a")
    expect(read.system_prompt_extensions.length).toBe(1)
  })
})
