import { describe, it, expect } from "bun:test"
import { ReflectionGenerator } from "../src/reflection/generator.js"

describe("ReflectionGenerator LLM", () => {
  it("should use structured output from llm path", async () => {
    const client = {
      session: {
        create: async () => ({ data: { id: "s1" } }),
        prompt: async () => ({
          data: {
            info: {
              structured: {
                task_summary: "Add auth rate limit",
                what_worked: "Found middleware",
                what_failed: "Missed util class",
                missing_context: ["src/utils/RateLimiter.ts"],
                what_would_have_helped: "Preload util",
                root_cause_hypothesis: "Context gap",
                pattern_matches: ["context_gap"],
                key_learnings: ["Load utility classes early"],
                recommendations: ["Pre-load RateLimiter"],
                confidence: 0.82,
              },
            },
            parts: [],
          },
        }),
        delete: async () => ({ data: {} }),
      },
    }

    const gen = new ReflectionGenerator({ client, directory: "." })
    const out = await gen.generate({
      sessionID: "sess-1",
      projectID: "proj-1",
      traceEvents: [{ type: "tool_call", ts: 1 }, { type: "tool_result", ts: 2 }],
      signals: [{ type: "CONTEXT_GAP", severity: "high" }],
      healthScore: 0.4,
      messageCount: 5,
      toolCallCount: 2,
      acceptedEdits: 0,
      summary: "Add auth rate limit",
    })

    expect(out.task_summary).toBe("Add auth rate limit")
    expect(out.what_failed).toContain("Missed")
    expect(out.root_cause_hypothesis).toBe("Context gap")
    expect(out.key_learnings[0]).toContain("utility")
    expect(out.confidence).toBe(0.82)
  })
})
