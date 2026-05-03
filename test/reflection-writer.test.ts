import { describe, it, expect, afterEach } from "bun:test"
import { ReflectionWriter } from "../src/reflection/writer.js"
import { type ReflectionNote } from "../src/reflection/types.js"
import { resolve } from "path"

const testDir = ".coevolve-reflection-test"

describe("ReflectionWriter", () => {
  afterEach(async () => {
    try {
      const dir = Bun.file(testDir)
      if (dir.exists()) {
        await dir.delete()
      }
    } catch {
      // Ignore
    }
  })

  it("should write reflection to JSON file", async () => {
    const sessionPath = resolve(testDir, "session-1")
    await Bun.write(sessionPath + "/.gitkeep", "")

    const writer = new ReflectionWriter(sessionPath)

    const reflection: ReflectionNote = {
      sessionID: "test-1",
      generated_at: Date.now(),
      completed_successfully: true,
      user_satisfaction: "satisfied",
      key_learnings: ["lesson-1"],
      recommendations: ["recommendation-1"],
      confidence: 0.8,
    }

    await writer.write(reflection)

    const path = writer.getPath()
    const file = Bun.file(path)
    expect(file.exists()).toBeTruthy()
  })

  it("should read reflection from JSON file", async () => {
    const sessionPath = resolve(testDir, "session-2")
    await Bun.write(sessionPath + "/.gitkeep", "")

    const writer = new ReflectionWriter(sessionPath)

    const original: ReflectionNote = {
      sessionID: "test-2",
      generated_at: 1234567890,
      completed_successfully: false,
      user_satisfaction: "dissatisfied",
      key_learnings: ["lesson-1", "lesson-2"],
      recommendations: ["fix-1"],
      confidence: 0.6,
      root_cause: {
        main_issue: "Agent failed",
        contributing_factors: ["issue-1"],
        severity: "high",
        pattern_matches: ["context_gap"],
      },
    }

    await writer.write(original)
    const read = await writer.read()

    expect(read).not.toBeNull()
    expect(read?.sessionID).toBe("test-2")
    expect(read?.user_satisfaction).toBe("dissatisfied")
    expect(read?.key_learnings.length).toBe(2)
    expect(read?.root_cause?.main_issue).toBe("Agent failed")
  })

  it("should return null when reflection does not exist", async () => {
    const sessionPath = resolve(testDir, "session-nonexistent")
    const writer = new ReflectionWriter(sessionPath)

    const read = await writer.read()
    expect(read).toBeNull()
  })

  it("should preserve all reflection fields", async () => {
    const sessionPath = resolve(testDir, "session-3")
    await Bun.write(sessionPath + "/.gitkeep", "")

    const writer = new ReflectionWriter(sessionPath)

    const reflection: ReflectionNote = {
      sessionID: "test-3",
      generated_at: 9999999,
      session_duration_ms: 5000,
      completed_successfully: true,
      user_satisfaction: "very_satisfied",
      key_learnings: ["a", "b", "c"],
      recommendations: ["x", "y"],
      confidence: 0.95,
    }

    await writer.write(reflection)
    const read = await writer.read()

    expect(read?.session_duration_ms).toBe(5000)
    expect(read?.confidence).toBe(0.95)
    expect(read?.key_learnings).toEqual(["a", "b", "c"])
  })
})
