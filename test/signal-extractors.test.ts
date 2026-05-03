import { describe, it, expect } from "bun:test"
import {
  extractReprompt,
  extractToolLoop,
  extractContextGap,
  extractSessionAbandoned,
  extractReversion,
  extractTokenEfficiencyDegradation,
  extractToolPreferenceMismatch,
  calculateHealthScore,
  extractAllSignals,
} from "../src/signal/extractors.js"
import { type TraceEvent } from "../src/trace/types.js"

describe("Signal Extractors", () => {
  describe("extractReprompt", () => {
    it("should detect reprompt signals", () => {
      const events: TraceEvent[] = [
        {
          type: "message",
          role: "user",
          signal: "reprompt",
          ts: 1000,
          order: 0,
        },
        {
          type: "message",
          role: "user",
          signal: "reprompt",
          ts: 2000,
          order: 1,
        },
      ]

      const signal = extractReprompt(events)
      expect(signal).not.toBeNull()
      expect(signal?.type).toBe("REPROMPT")
      expect(signal?.severity).toBe("medium")
    })

    it("should detect high severity reprompts", () => {
      const events: TraceEvent[] = [
        {
          type: "message",
          role: "user",
          signal: "reprompt",
          ts: 1000,
          order: 0,
        },
        {
          type: "message",
          role: "user",
          signal: "reprompt",
          ts: 2000,
          order: 1,
        },
        {
          type: "message",
          role: "user",
          signal: "reprompt",
          ts: 3000,
          order: 2,
        },
      ]

      const signal = extractReprompt(events)
      expect(signal).not.toBeNull()
      expect(signal?.type).toBe("REPROMPT")
      expect(signal?.severity).toBe("high")
    })

    it("should return null when no reprompts", () => {
      const events: TraceEvent[] = [
        {
          type: "message",
          role: "user",
          ts: 1000,
          order: 0,
        },
      ]

      const signal = extractReprompt(events)
      expect(signal).toBeNull()
    })
  })

  describe("extractToolLoop", () => {
    it("should detect repeated tool calls on same path", () => {
      const events: TraceEvent[] = [
        {
          type: "tool_call",
          tool: "read",
          path: "src/main.ts",
          ts: 1000,
          order: 0,
        },
        {
          type: "tool_call",
          tool: "read",
          path: "src/main.ts",
          ts: 2000,
          order: 1,
        },
        {
          type: "tool_call",
          tool: "read",
          path: "src/main.ts",
          ts: 3000,
          order: 2,
        },
      ]

      const signal = extractToolLoop(events)
      expect(signal).not.toBeNull()
      expect(signal?.type).toBe("TOOL_LOOP")
    })

    it("should return null when no loops", () => {
      const events: TraceEvent[] = [
        {
          type: "tool_call",
          tool: "read",
          path: "src/main.ts",
          ts: 1000,
          order: 0,
        },
        {
          type: "tool_call",
          tool: "read",
          path: "src/other.ts",
          ts: 2000,
          order: 1,
        },
      ]

      const signal = extractToolLoop(events)
      expect(signal).toBeNull()
    })
  })

  describe("extractContextGap", () => {
    it("should detect files accessed early", () => {
      const events: TraceEvent[] = [
        {
          type: "tool_call",
          tool: "read",
          path: "src/utils.ts",
          ts: 1000,
          order: 0,
        },
      ]

      const signal = extractContextGap(events)
      expect(signal).not.toBeNull()
      expect(signal?.type).toBe("CONTEXT_GAP")
    })

    it("should return null when no early access", () => {
      const events: TraceEvent[] = [
        {
          type: "tool_call",
          tool: "read",
          path: "src/main.ts",
          ts: 1000,
          order: 5,
        },
      ]

      const signal = extractContextGap(events)
      expect(signal).toBeNull()
    })
  })

  describe("extractSessionAbandoned", () => {
    it("should detect abandoned sessions", () => {
      const signal = extractSessionAbandoned([], 2, 0)
      expect(signal).not.toBeNull()
      expect(signal?.type).toBe("SESSION_ABANDONED")
    })

    it("should return null for active sessions", () => {
      const events: TraceEvent[] = [
        {
          type: "tool_call",
          tool: "read",
          path: "src/main.ts",
          ts: 1000,
          order: 0,
        },
      ]
      const signal = extractSessionAbandoned(events, 10, 5)
      expect(signal).toBeNull()
    })
  })

  describe("extractReversion", () => {
    it("should detect reversions from git diff", () => {
      const signal = extractReversion({
        filePaths: ["src/main.ts", "src/utils.ts"],
        linesReverted: 25,
      })

      expect(signal).not.toBeNull()
      expect(signal?.type).toBe("REVERSION")
      expect(signal?.severity).toBe("high")
    })

    it("should return null when no reversions", () => {
      const signal = extractReversion({
        filePaths: [],
        linesReverted: 0,
      })
      expect(signal).toBeNull()
    })
  })

  describe("extractTokenEfficiencyDegradation", () => {
    it("should detect worsening effort per accepted edit", () => {
      const history = [
        {
          sessionID: "s1",
          timestamp: 1,
          health_score: 0.8,
          message_count: 8,
          accepted_edits: 4,
          tool_call_count: 2,
          tokens_per_accepted_edit_line: 3,
          signals: [],
        },
        {
          sessionID: "s2",
          timestamp: 2,
          health_score: 0.82,
          message_count: 10,
          accepted_edits: 5,
          tool_call_count: 3,
          tokens_per_accepted_edit_line: 3.2,
          signals: [],
        },
        {
          sessionID: "s3",
          timestamp: 3,
          health_score: 0.84,
          message_count: 7,
          accepted_edits: 4,
          tool_call_count: 2,
          tokens_per_accepted_edit_line: 2.75,
          signals: [],
        },
      ]

      const signal = extractTokenEfficiencyDegradation(history, {
        sessionID: "s4",
        messageCount: 30,
        acceptedEdits: 2,
        toolCallCount: 10,
      })

      expect(signal).not.toBeNull()
      expect(signal?.type).toBe("TOKEN_EFFICIENCY_DEGRADATION")
    })
  })

  describe("extractToolPreferenceMismatch", () => {
    it("should detect repeated shell-style tool use on file work", () => {
      const events: TraceEvent[] = [
        { type: "tool_call", tool: "bash", ts: 1, order: 0 },
        { type: "tool_call", tool: "bash", ts: 2, order: 1 },
        { type: "tool_call", tool: "bash", ts: 3, order: 2 },
        { type: "tool_call", tool: "read", path: "src/main.ts", ts: 4, order: 3 },
      ]

      const signal = extractToolPreferenceMismatch(events)
      expect(signal).not.toBeNull()
      expect(signal?.type).toBe("TOOL_PREFERENCE_MISMATCH")
    })
  })

  describe("calculateHealthScore", () => {
    it("should start at 1.0 with no signals", () => {
      const score = calculateHealthScore([])
      expect(score).toBe(1.0)
    })

    it("should reduce score for high severity signals", () => {
      const signals = [
        {
          type: "REVERSION" as const,
          severity: "high" as const,
          description: "test",
          evidence: [],
          detected_at: Date.now(),
          rule: "test",
        },
      ]

      const score = calculateHealthScore(signals)
      expect(score).toBeLessThan(1.0)
      expect(score).toBeGreaterThan(0)
    })

    it("should clamp score between 0 and 1", () => {
      const signals = Array(10).fill({
        type: "REVERSION" as const,
        severity: "high" as const,
        description: "test",
        evidence: [],
        detected_at: Date.now(),
        rule: "test",
      })

      const score = calculateHealthScore(signals)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    })
  })

  describe("extractAllSignals", () => {
    it("should extract multiple signals", () => {
      const events: TraceEvent[] = [
        {
          type: "message",
          role: "user",
          signal: "reprompt",
          ts: 1000,
          order: 0,
        },
        {
          type: "tool_call",
          tool: "read",
          path: "src/main.ts",
          ts: 2000,
          order: 1,
        },
        {
          type: "tool_call",
          tool: "read",
          path: "src/main.ts",
          ts: 3000,
          order: 2,
        },
        {
          type: "tool_call",
          tool: "read",
          path: "src/main.ts",
          ts: 4000,
          order: 3,
        },
      ]

      const signals = extractAllSignals(events, {
        messageCount: 5,
        acceptedEdits: 1,
        reversionData: { filePaths: [], linesReverted: 0 },
      })

      expect(signals.length).toBeGreaterThan(0)
      expect(signals.some(s => s.type === "REPROMPT")).toBeTruthy()
      expect(signals.some(s => s.type === "TOOL_LOOP")).toBeTruthy()
    })
  })
})
