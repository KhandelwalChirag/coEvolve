import { describe, it, expect } from "bun:test"
import { MemoryGenerator } from "../src/memory/generator.js"
import { type MemoryNode } from "../src/memory/types.js"

describe("MemoryGenerator LLM", () => {
  it("should build memory node from llm structured output", async () => {
    const client = {
      session: {
        create: async () => ({ data: { id: "s1" } }),
        prompt: async () => ({
          data: {
            info: {
              structured: {
                content: "Agent misses rate limiter in auth flows",
                keywords: ["ratelimiter", "auth", "context_gap"],
                tags: ["signal:context_gap", "module:auth"],
                linked_nodes: ["node-1", "unknown"],
                link_reasons: { "node-1": "same auth module", unknown: "bad" },
                confidence: 0.9,
              },
            },
            parts: [],
          },
        }),
        delete: async () => ({ data: {} }),
      },
    }

    const gen = new MemoryGenerator({ client, directory: "." })
    const existing: MemoryNode[] = [
      {
        id: "node-1",
        created_at: Date.now() - 1000,
        content: "old",
        keywords: ["auth"],
        tags: ["module:auth"],
        evidence_sessions: ["s0"],
        linked_nodes: [],
        link_reasons: {},
        confidence: 0.6,
        status: "active",
        source: "heuristic",
        resolved_by_proposal: null,
      },
    ]

    const out = await gen.generate(
      {
        sessionID: "sess-2",
        signals: [{ type: "CONTEXT_GAP", severity: "high" }],
        healthScore: 0.5,
        reflection: {
          completed_successfully: false,
          key_learnings: ["x"],
          recommendations: ["y"],
          confidence: 0.7,
        },
      },
      existing,
    )

    expect(out.source).toBe("llm")
    expect(out.linked_nodes).toEqual(["node-1"])
    expect(out.link_reasons["node-1"]).toContain("auth")
    expect(out.confidence).toBe(0.9)
  })
})
