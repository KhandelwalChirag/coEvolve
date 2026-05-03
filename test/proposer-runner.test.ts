import { describe, expect, it } from "bun:test"
import { resolve } from "path"
import { HarnessWriter } from "../src/harness/index.js"
import { MemoryWriter } from "../src/memory/index.js"
import {
  ProposerGenerator,
  ProposerRunner,
  ProposerTrigger,
  ProposerWriter,
} from "../src/proposer/index.js"

describe("ProposerRunner", () => {
  const root = resolve(`.coevolve-proposer-runner-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  it("should create proposal on manual evolve trigger", async () => {
    const harness = new HarnessWriter(resolve(root, ".coevolve", "harness"))
    await harness.init()

    const memory = new MemoryWriter(resolve(root, ".coevolve", "memory"))
    await memory.init()
    await memory.writeNode({
      id: "node-1",
      created_at: 1,
      content: "Context gap around src/auth/RateLimiter.ts occurs often",
      keywords: ["context_gap", "src/auth/RateLimiter.ts", "auth"],
      tags: ["CONTEXT_GAP"],
      evidence_sessions: ["s1", "s2", "s3"],
      linked_nodes: [],
      link_reasons: {},
      confidence: 0.9,
      status: "active",
      source: "heuristic",
      resolved_by_proposal: null,
    })

    const writer = new ProposerWriter(resolve(root, ".coevolve", "proposals"))
    const trigger = new ProposerTrigger({ directory: root, writer })
    const generator = new ProposerGenerator({ directory: root })
    const runner = new ProposerRunner({ directory: root, writer, trigger, generator })

    const out = await runner.run({ manual: true })
    const list = await writer.readPending()

    expect(out.state).toBe("created")
    expect(out.reason).toBe("manual")
    expect(out.proposal_id).not.toBeNull()
    expect(list.length).toBe(1)
  })
})
