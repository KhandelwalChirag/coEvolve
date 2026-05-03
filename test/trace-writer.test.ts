import { describe, it, expect, afterEach } from "bun:test"
import { resolve } from "path"
import { TraceWriter, SessionTraceRecorder } from "../src/trace/writer.js"

const testDir = `.coevolve-test-${Date.now()}-${Math.random().toString(36).slice(2)}`

describe("TraceWriter", () => {
  afterEach(async () => {
    // Cleanup
    try {
      await Bun.file(testDir).delete()
    } catch {
      // Ignore
    }
  })

  it("should initialize session directory", async () => {
    const writer = new TraceWriter({
      basePath: testDir,
      sessionID: "test-1",
      projectID: "proj-1",
      directory: "/test",
    })

    await writer.init()

    const path = resolve(writer.getSessionPath())
    expect(Bun.file(path).exists()).toBeTruthy()
  })

  it("should write trace events to jsonl", async () => {
    const writer = new TraceWriter({
      basePath: testDir,
      sessionID: "test-2",
      projectID: "proj-1",
      directory: "/test",
    })

    await writer.init()

    await writer.write({
      type: "tool_call",
      tool: "read",
      path: "src/main.ts",
      ts: Date.now(),
    })

    const events = await writer.readTrace()
    expect(events.length).toBe(1)
    expect(events[0].type).toBe("tool_call")
    expect(events[0].order).toBe(0)
  })

  it("should maintain order for multiple events", async () => {
    const writer = new TraceWriter({
      basePath: testDir,
      sessionID: "test-3",
      projectID: "proj-1",
      directory: "/test",
    })

    await writer.init()

    await writer.write({
      type: "tool_call",
      tool: "read",
      path: "src/main.ts",
      ts: Date.now(),
    })

    await writer.write({
      type: "tool_call",
      tool: "edit",
      path: "src/main.ts",
      ts: Date.now(),
    })

    const events = await writer.readTrace()
    expect(events.length).toBe(2)
    expect(events[0].order).toBe(0)
    expect(events[1].order).toBe(1)
  })

  it("should save and read metadata", async () => {
    const writer = new TraceWriter({
      basePath: testDir,
      sessionID: "test-4",
      projectID: "proj-1",
      directory: "/test",
    })

    await writer.init()

    const metadata = { duration: 1000, count: 5 }
    await writer.saveMetadata(metadata)

    const path = writer.getMetadataPath()
    const content = await Bun.file(path).text()
    const parsed = JSON.parse(content)

    expect(parsed.duration).toBe(1000)
    expect(parsed.count).toBe(5)
  })
})

describe("SessionTraceRecorder", () => {
  afterEach(async () => {
    try {
      await Bun.file(testDir).delete()
    } catch {
      // Ignore
    }
  })

  it("should record tool calls", async () => {
    const recorder = new SessionTraceRecorder({
      basePath: testDir,
      sessionID: "test-5",
      projectID: "proj-1",
      directory: "/test",
    })

    await recorder.init()
    await recorder.recordToolCall("read", "src/main.ts")

    const events = await recorder.getEvents()
    expect(events.length).toBe(1)
    expect(events[0].type).toBe("tool_call")
  })

  it("should record tool results", async () => {
    const recorder = new SessionTraceRecorder({
      basePath: testDir,
      sessionID: "test-6",
      projectID: "proj-1",
      directory: "/test",
    })

    await recorder.init()
    await recorder.recordToolResult("read", "success", 100)

    const events = await recorder.getEvents()
    expect(events.some(e => e.type === "tool_result")).toBeTruthy()
  })

  it("should record messages", async () => {
    const recorder = new SessionTraceRecorder({
      basePath: testDir,
      sessionID: "test-7",
      projectID: "proj-1",
      directory: "/test",
    })

    await recorder.init()
    await recorder.recordMessage("user", "initial")

    const events = await recorder.getEvents()
    expect(events.some(e => e.type === "message" && e.role === "user")).toBeTruthy()
  })

  it("should record errors", async () => {
    const recorder = new SessionTraceRecorder({
      basePath: testDir,
      sessionID: "test-8",
      projectID: "proj-1",
      directory: "/test",
    })

    await recorder.init()
    await recorder.recordError("Test error", "read")

    const events = await recorder.getEvents()
    expect(events.some(e => e.type === "error")).toBeTruthy()
  })
})
