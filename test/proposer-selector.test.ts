import { describe, expect, it } from "bun:test"
import { resolve } from "path"
import { HarnessTree, HarnessWriter } from "../src/harness/index.js"
import { ProposerSelector } from "../src/proposer/index.js"

describe("ProposerSelector", () => {
  const root = resolve(`.coevolve-proposer-selector-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  it("should keep current node when branch is not plateaued", async () => {
    const writer = new HarnessWriter(resolve(root, ".coevolve", "harness"))
    const harness = await writer.init()
    const tree = new HarnessTree(resolve(root, ".coevolve", "harness"))

    const id = await tree.create({
      parent: "root",
      harness,
      note: "test child",
      health: 0.72,
      apply: true,
    })

    await Bun.write(
      resolve(root, ".coevolve", "harness", "tree", id, "score.json"),
      JSON.stringify({
        node: id,
        created_at: Date.now(),
        health_at_creation: 0.72,
        rolling_health: [0.6, 0.68, 0.73, 0.79, 0.84],
      }),
    )

    const selector = new ProposerSelector(root)
    const out = await selector.pick()
    expect(out.parent).toBe(id)
    expect(out.plateaued).toBeFalse()
  })

  it("should switch parent when current branch is plateaued", async () => {
    const dir = resolve(`${root}-plateau`)
    const writer = new HarnessWriter(resolve(dir, ".coevolve", "harness"))
    const harness = await writer.init()
    const tree = new HarnessTree(resolve(dir, ".coevolve", "harness"))

    const a = await tree.create({ parent: "root", harness, note: "a", health: 0.61, apply: true })
    const cur = await writer.readCurrent()
    const b = await tree.create({ parent: "root", harness: cur, note: "b", health: 0.82, apply: false })

    await Bun.write(
      resolve(dir, ".coevolve", "harness", "tree", a, "score.json"),
      JSON.stringify({
        node: a,
        created_at: Date.now(),
        health_at_creation: 0.61,
        rolling_health: [0.64, 0.65, 0.64, 0.65, 0.64],
      }),
    )

    await Bun.write(
      resolve(dir, ".coevolve", "harness", "tree", b, "score.json"),
      JSON.stringify({
        node: b,
        created_at: Date.now(),
        health_at_creation: 0.82,
        rolling_health: [0.82, 0.84, 0.83, 0.85, 0.86],
      }),
    )

    const selector = new ProposerSelector(dir)
    const out = await selector.pick()
    expect(out.plateaued).toBeTrue()
    expect(out.parent).toBe(b)
    expect(out.tried).toContain("plateau_switch")
  })
})
