import { describe, it, expect } from "bun:test"
import { MemoryGenerator } from "../src/memory/generator.js"
import { type MemoryNode, type MemoryRequest } from "../src/memory/types.js"

describe("MemoryGenerator", () => {
  const gen = new MemoryGenerator()

  const input = (x: Partial<MemoryRequest> = {}): MemoryRequest => ({
    sessionID: "sess-1",
    signals: [{ type: "CONTEXT_GAP", severity: "high", evidence: ["src/types.ts"] }],
    healthScore: 0.45,
    reflection: {
      completed_successfully: false,
      root_cause: {
        main_issue: "Missing early context",
        contributing_factors: ["late file discovery"],
        severity: "high",
        pattern_matches: ["context_gap"],
      },
      key_learnings: ["load key files early"],
      recommendations: ["pre-load src/types.ts"],
      confidence: 0.7,
    },
    ...x,
  })

  it("should generate node with expected base fields", async () => {
    const node = await gen.generate(input(), [])

    expect(node.id.startsWith("node-")).toBeTrue()
    expect(node.evidence_sessions).toEqual(["sess-1"])
    expect(node.keywords.length).toBeGreaterThan(0)
    expect(node.tags.some(x => x === "signal:context_gap")).toBeTrue()
    expect(node.status).toBe("active")
    expect(node.resolved_by_proposal).toBeNull()
  })

  it("should link with existing nodes when overlap is strong", async () => {
    const existing: MemoryNode[] = [
      {
        id: "node-old",
        created_at: Date.now() - 1000,
        content: "old",
        keywords: ["context_gap", "pre-load", "src/types.ts"],
        tags: ["severity:high"],
        evidence_sessions: ["sess-old"],
        linked_nodes: [],
        link_reasons: {},
        confidence: 0.8,
        status: "active",
        source: "heuristic",
        resolved_by_proposal: null,
      },
    ]

    const node = await gen.generate(input(), existing)
    expect(node.linked_nodes).toContain("node-old")
  })

  it("should keep confidence within expected range", async () => {
    const node = await gen.generate(input({ reflection: { ...input().reflection, confidence: 0.2 } }), [])
    expect(node.confidence).toBeGreaterThanOrEqual(0.6)
    expect(node.confidence).toBeLessThanOrEqual(1)
  })
})
