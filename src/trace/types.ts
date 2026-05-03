import { z } from "zod"

/**
 * Core trace event types for session recording
 */

export const TraceEventType = z.enum([
  "tool_call",
  "tool_result",
  "message",
  "error",
  "session_start",
  "session_end",
])

export type TraceEventType = z.infer<typeof TraceEventType>

/**
 Tool call trace - captures when agent invokes a tool
 */
export const ToolCallTrace = z.object({
  type: z.literal("tool_call"),
  tool: z.string(),
  path: z.string().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  ts: z.number(), // milliseconds since epoch
  order: z.number(), // sequence number in session
})

export type ToolCallTrace = z.infer<typeof ToolCallTrace>

/**
 * Tool result trace - captures tool execution outcome
 */
export const ToolResultTrace = z.object({
  type: z.literal("tool_result"),
  tool: z.string(),
  status: z.enum(["success", "error", "timeout"]),
  duration_ms: z.number(),
  ts: z.number(),
  order: z.number(),
  error: z.string().optional(),
})

export type ToolResultTrace = z.infer<typeof ToolResultTrace>

/**
 * Message trace - captures user messages or reprompts (signals)
 */
export const MessageTrace = z.object({
  type: z.literal("message"),
  role: z.enum(["user", "assistant"]),
  signal: z
    .enum([
      "reprompt", // User corrected or repeated intent
      "clarification", // User clarified previous request
      "approval", // User approved agent work
      "initial", // First message of session
    ])
    .optional(),
  ts: z.number(),
  order: z.number(),
})

export type MessageTrace = z.infer<typeof MessageTrace>

/**
 * Error trace - captures exceptions or failures
 */
export const ErrorTrace = z.object({
  type: z.literal("error"),
  error: z.string(),
  tool: z.string().optional(),
  ts: z.number(),
  order: z.number(),
})

export type ErrorTrace = z.infer<typeof ErrorTrace>

/**
 * Session boundary traces
 */
export const SessionStartTrace = z.object({
  type: z.literal("session_start"),
  sessionID: z.string(),
  ts: z.number(),
  order: z.number(),
})

export const SessionEndTrace = z.object({
  type: z.literal("session_end"),
  sessionID: z.string(),
  ts: z.number(),
  order: z.number(),
  token_count: z.number().optional(),
})

export type SessionStartTrace = z.infer<typeof SessionStartTrace>
export type SessionEndTrace = z.infer<typeof SessionEndTrace>

/**
 * Union of all trace event types
 */
export const TraceEvent = z.union([
  ToolCallTrace,
  ToolResultTrace,
  MessageTrace,
  ErrorTrace,
  SessionStartTrace,
  SessionEndTrace,
])

export type TraceEvent = z.infer<typeof TraceEvent>

/**
 * Session trace - collection of all events in a session
 * Stored as JSONL (one JSON object per line)
 */
export const SessionTrace = z.object({
  sessionID: z.string(),
  projectID: z.string(),
  directory: z.string(),
  started: z.number(),
  ended: z.number().optional(),
  events: z.array(TraceEvent),
})

export type SessionTrace = z.infer<typeof SessionTrace>

/**
 * Trace writer configuration
 */
export const TraceConfig = z.object({
  enabled: z.boolean().default(true),
  basePath: z.string().default(".coevolve/experience"),
  maxFileSize: z.number().default(10 * 1024 * 1024), // 10MB
})

export type TraceConfig = z.infer<typeof TraceConfig>
