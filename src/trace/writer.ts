import Bun from "bun"
import { resolve } from "path"
import {
  type TraceEvent,
  type ToolCallTrace,
  type ToolResultTrace,
  type MessageTrace,
  type ErrorTrace,
  type SessionStartTrace,
  type SessionEndTrace,
} from "./types.js"

/**
 * Trace writer - handles writing trace events to disk
 * Stores traces as JSONL files in .coevolve/experience/session-{id}/
 */

type TraceWriterConfig = {
  basePath: string
  sessionID: string
  projectID: string
  directory: string
}

export class TraceWriter {
  private config: TraceWriterConfig
  private sessionPath: string
  private order = 0
  private started = Date.now()

  constructor(config: TraceWriterConfig) {
    this.config = config
    this.sessionPath = resolve(config.basePath, `session-${config.sessionID}`)
  }

  /**
   * Initialize session directory
   */
  async init(): Promise<void> {
    const dir = Bun.file(this.sessionPath)
    if (!(await dir.exists())) {
      await Bun.write(resolve(this.sessionPath, ".gitkeep"), "")
    }
  }

  /**
   * Write a single trace event to JSONL file
   */
  async write(
    event:
      | Omit<ToolCallTrace, "order">
      | Omit<ToolResultTrace, "order">
      | Omit<MessageTrace, "order">
      | Omit<ErrorTrace, "order">
      | Omit<SessionStartTrace, "order">
      | Omit<SessionEndTrace, "order">,
  ): Promise<void> {
    const withOrder = {
      ...event,
      order: this.order++,
    }

    const tracePath = resolve(this.sessionPath, "trace.jsonl")
    const existing = await Bun.file(tracePath).text().catch(() => "")
    const lines = existing.trim().split("\n").filter(Boolean)
    lines.push(JSON.stringify(withOrder))

    await Bun.write(tracePath, lines.join("\n") + "\n")
  }

  /**
   * Get path to trace file
   */
  getTracePath(): string {
    return resolve(this.sessionPath, "trace.jsonl")
  }

  /**
   * Get path to session metadata file
   */
  getMetadataPath(): string {
    return resolve(this.sessionPath, "metadata.json")
  }

  /**
   * Save session metadata
   */
  async saveMetadata(data: Record<string, unknown>): Promise<void> {
    const path = this.getMetadataPath()
    await Bun.write(path, JSON.stringify(data, null, 2))
  }

  /**
   * Read all trace events from file
   */
  async readTrace(): Promise<TraceEvent[]> {
    const tracePath = this.getTracePath()
    const text = await Bun.file(tracePath).text().catch(() => "")
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(line => JSON.parse(line) as TraceEvent)
  }

  /**
   * Get session directory path
   */
  getSessionPath(): string {
    return this.sessionPath
  }

  /**
   * Get the session identifier for this writer
   */
  getSessionID(): string {
    return this.config.sessionID
  }
}

/**
 * High-level trace recorder for a session
 */
export class SessionTraceRecorder {
  private writer: TraceWriter
  private events: TraceEvent[] = []

  constructor(config: {
    basePath: string
    sessionID: string
    projectID: string
    directory: string
  }) {
    this.writer = new TraceWriter(config)
  }

  async init(): Promise<void> {
    await this.writer.init()
  }

  /**
   * Record a tool call
   */
  async recordToolCall(tool: string, path?: string, args?: Record<string, unknown>): Promise<void> {
    await this.writer.write({
      type: "tool_call",
      tool,
      path,
      args,
      ts: Date.now(),
    })
  }

  /**
   * Record a tool result
   */
  async recordToolResult(
    tool: string,
    status: "success" | "error" | "timeout",
    duration_ms: number,
    error?: string,
  ): Promise<void> {
    await this.writer.write({
      type: "tool_result",
      tool,
      status,
      duration_ms,
      error,
      ts: Date.now(),
    })
  }

  /**
   * Record a message with optional signal
   */
  async recordMessage(
    role: "user" | "assistant",
    signal?: "reprompt" | "clarification" | "approval" | "initial",
  ): Promise<void> {
    await this.writer.write({
      type: "message",
      role,
      signal,
      ts: Date.now(),
    })
  }

  /**
   * Record an error
   */
  async recordError(error: string, tool?: string): Promise<void> {
    await this.writer.write({
      type: "error",
      error,
      tool,
      ts: Date.now(),
    })
  }

  /**
   * Get session path for other operations
   */
  getSessionPath(): string {
    return this.writer.getSessionPath()
  }

  /**
   * Get the session identifier for this recorder
   */
  getSessionID(): string {
    return this.writer.getSessionID()
  }

  /**
   * Save metadata
   */
  async saveMetadata(data: Record<string, unknown>): Promise<void> {
    await this.writer.saveMetadata(data)
  }

  /**
   * Read all recorded events
   */
  async getEvents(): Promise<TraceEvent[]> {
    return this.writer.readTrace()
  }
}
