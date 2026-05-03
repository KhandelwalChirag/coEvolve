import { describe, expect, it } from "bun:test"
import { resolve } from "path"
import { ProposerGenerator } from "../src/proposer/index.js"
import { HarnessWriter } from "../src/harness/index.js"
import { MemoryWriter } from "../src/memory/index.js"

describe("ProposerGenerator", () => {
  const root = resolve(`.coevolve-proposer-generator-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  it("should generate a single proposal from active memory evidence", async () => {
    const harness = new HarnessWriter(resolve(root, ".coevolve", "harness"))
    await harness.init()

    const mem = new MemoryWriter(resolve(root, ".coevolve", "memory"))
    await mem.init()

    await mem.writeNode({
      id: "node-1",
      created_at: 1,
      content: "Repeated context gap around src/auth/RateLimiter.ts in auth sessions",
      keywords: ["context_gap", "auth", "src/auth/RateLimiter.ts"],
      tags: ["CONTEXT_GAP"],
      evidence_sessions: ["s1", "s2", "s3"],
      linked_nodes: [],
      link_reasons: {},
      confidence: 0.9,
      status: "active",
      source: "heuristic",
      resolved_by_proposal: null,
    })

    await mem.writeNode({
      id: "node-2",
      created_at: 2,
      content: "Auth sessions often reprompt before loading the limiter file",
      keywords: ["reprompt", "auth"],
      tags: ["REPROMPT"],
      evidence_sessions: ["s2", "s3", "s4"],
      linked_nodes: [],
      link_reasons: {},
      confidence: 0.7,
      status: "active",
      source: "heuristic",
      resolved_by_proposal: null,
    })

    const gen = new ProposerGenerator({ directory: root })
    const out = await gen.generate({ trigger: "manual" })

    expect(out).not.toBeNull()
    expect(out?.change_type).toBe("add_context_file")
    expect(out?.target_section).toBe("initial_context_files")
    expect(out?.proposed_addition.path).toContain("src/auth/RateLimiter.ts")
  })

  it("should skip proposal when evidence is too thin", async () => {
    const thin = resolve(`${root}-thin`)
    const harness = new HarnessWriter(resolve(thin, ".coevolve", "harness"))
    await harness.init()

    const mem = new MemoryWriter(resolve(thin, ".coevolve", "memory"))
    await mem.init()
    await mem.writeNode({
      id: "node-a",
      created_at: 1,
      content: "single session note",
      keywords: ["note"],
      tags: ["REPROMPT"],
      evidence_sessions: ["only-1"],
      linked_nodes: [],
      link_reasons: {},
      confidence: 0.5,
      status: "active",
      source: "heuristic",
      resolved_by_proposal: null,
    })

    const gen = new ProposerGenerator({ directory: thin })
    const out = await gen.generate({ trigger: "manual" })
    expect(out).toBeNull()
  })
})
