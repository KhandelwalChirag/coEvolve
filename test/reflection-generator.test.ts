import { describe, it, expect } from "bun:test"
import { ReflectionGenerator } from "../src/reflection/generator.js"
import { type ReflectionRequest } from "../src/reflection/types.js"

describe("ReflectionGenerator", () => {
  const generator = new ReflectionGenerator()

  const createRequest = (overrides: Partial<ReflectionRequest> = {}): ReflectionRequest => ({
    sessionID: "test-sess-1",
    projectID: "test-proj-1",
    traceEvents: [],
    signals: [],
    healthScore: 0.7,
    messageCount: 3,
    toolCallCount: 2,
    acceptedEdits: 1,
    ...overrides,
  })

  describe("generate", () => {
    it("should generate reflection for successful session", async () => {
      const req = createRequest({
        healthScore: 0.9,
        acceptedEdits: 2,
      })

      const reflection = await generator.generate(req)

      expect(reflection.sessionID).toBe("test-sess-1")
      expect(reflection.completed_successfully).toBe(true)
      expect(reflection.user_satisfaction).toBe("very_satisfied")
      expect(reflection.root_cause).toBeUndefined()
    })

    it("should generate reflection for mediocre session", async () => {
      const req = createRequest({
        healthScore: 0.65,
        acceptedEdits: 1,
      })

      const reflection = await generator.generate(req)

      expect(reflection.completed_successfully).toBe(true)
        expect(reflection.user_satisfaction).toBe("neutral")
    })

    it("should generate reflection for failing session", async () => {
      const req = createRequest({
        healthScore: 0.4,
        acceptedEdits: 0,
        signals: [
          { type: "REPROMPT", severity: "high" },
          { type: "CONTEXT_GAP", severity: "medium" },
        ],
      })

      const reflection = await generator.generate(req)

      expect(reflection.completed_successfully).toBe(false)
      expect(reflection.user_satisfaction).toBe("dissatisfied")
      expect(reflection.root_cause).toBeDefined()
      expect(reflection.root_cause?.severity).toBe("high")
      expect(reflection.key_learnings.length).toBeGreaterThan(0)
    })

    it("should extract patterns from signals", async () => {
      const req = createRequest({
        signals: [
          { type: "REPROMPT", severity: "high" },
          { type: "TOOL_LOOP", severity: "medium" },
        ],
      })

      const reflection = await generator.generate(req)

      if (reflection.root_cause) {
        expect(reflection.root_cause.pattern_matches.length).toBeGreaterThan(0)
        expect(reflection.root_cause.pattern_matches.some(p => p === "context_gap")).toBeTruthy()
      }
    })

    it("should generate recommendations based on patterns", async () => {
      const req = createRequest({
        healthScore: 0.4,
        signals: [{ type: "CONTEXT_GAP", severity: "high" }],
      })

      const reflection = await generator.generate(req)

      expect(reflection.recommendations.length).toBeGreaterThan(0)
      expect(reflection.recommendations[0]).toContain("Pre-load")
    })

    it("should calculate confidence from signal count", async () => {
      const lowConfidence = await generator.generate(
        createRequest({
          signals: [],
          traceEvents: [],
        }),
      )

      const highConfidence = await generator.generate(
        createRequest({
          signals: Array(5).fill({ type: "REPROMPT", severity: "high" }),
          traceEvents: Array(25).fill({ type: "tool_call", ts: 1000 }),
        }),
      )

      expect(lowConfidence.confidence).toBeLessThan(highConfidence.confidence)
    })

    it("should include generated_at timestamp", async () => {
      const before = Date.now()
      const reflection = await generator.generate(createRequest())
      const after = Date.now()

      expect(reflection.generated_at).toBeGreaterThanOrEqual(before)
      expect(reflection.generated_at).toBeLessThanOrEqual(after)
    })

    it("should limit recommendations to 3", async () => {
      const req = createRequest({
        healthScore: 0,
        signals: Array(10).fill({ type: "CONTEXT_GAP", severity: "high" }),
      })

      const reflection = await generator.generate(req)

      expect(reflection.recommendations.length).toBeLessThanOrEqual(3)
    })

    it("should mark critical failures correctly", async () => {
      const req = createRequest({
        healthScore: 0.2,
        acceptedEdits: 0,
        signals: [{ type: "SESSION_ABANDONED", severity: "high" }],
      })

      const reflection = await generator.generate(req)

      expect(reflection.root_cause?.severity).toBe("critical")
      expect(reflection.user_satisfaction).toBe("very_dissatisfied")
    })

    it("should include key learnings", async () => {
      const req = createRequest({
        signals: [{ type: "REPROMPT", severity: "high" }],
      })

      const reflection = await generator.generate(req)

      expect(reflection.key_learnings.length).toBeGreaterThan(0)
    })

    it("should evaluate satisfaction based on health and edits", async () => {
      const satisfied = await generator.generate(
        createRequest({ healthScore: 0.8, acceptedEdits: 2 }),
      )
      expect(satisfied.user_satisfaction).toBe("satisfied")

      const neutral = await generator.generate(
        createRequest({ healthScore: 0.55, acceptedEdits: 0 }),
      )
      expect(neutral.user_satisfaction).toBe("neutral")
    })
  })
})
