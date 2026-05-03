import { z } from "zod"

/**
 * Signal types and schemas
 * Signals are observations extracted from session traces
 */

export const SignalType = z.enum([
  "REPROMPT",
  "REVERSION",
  "TOOL_LOOP",
  "CONTEXT_GAP",
  "SESSION_ABANDONED",
  "TOKEN_EFFICIENCY_DEGRADATION",
  "TOOL_PREFERENCE_MISMATCH",
])

export type SignalType = z.infer<typeof SignalType>

/**
 * Base signal schema
 */
export const Signal = z.object({
  type: SignalType,
  severity: z.enum(["low", "medium", "high"]),
  description: z.string(),
  evidence: z.array(z.string()),
  detected_at: z.number(),
  rule: z.string(), // The extraction rule that detected this
})

export type Signal = z.infer<typeof Signal>

/**
 * Signals output file schema
 */
export const SignalsOutput = z.object({
  sessionID: z.string(),
  signals: z.array(Signal),
  health_score: z.number().min(0).max(1),
  timestamp: z.number(),
  message_count: z.number().nonnegative().optional(),
  accepted_edits: z.number().nonnegative().optional(),
  tool_call_count: z.number().nonnegative().optional(),
  tokens_per_accepted_edit_line: z.number().nonnegative().optional(),
})

export type SignalsOutput = z.infer<typeof SignalsOutput>

/**
 * Reprompt signal - User corrected or repeated intent
 */
export const RepromptSignal = Signal.extend({
  type: z.literal("REPROMPT"),
  data: z.object({
    messageCount: z.number(),
    patterns: z.array(z.string()),
  }),
})

/**
 * Reversion signal - Agent edit did not survive git diff
 */
export const ReversionSignal = Signal.extend({
  type: z.literal("REVERSION"),
  data: z.object({
    filePaths: z.array(z.string()),
    linesReverted: z.number(),
  }),
})

/**
 * Tool loop signal - Agent called same tool 3+ times on same path
 */
export const ToolLoopSignal = Signal.extend({
  type: z.literal("TOOL_LOOP"),
  data: z.object({
    tool: z.string(),
    path: z.string().optional(),
    callCount: z.number(),
  }),
})

/**
 * Context gap signal - File accessed early but not in initial context
 */
export const ContextGapSignal = Signal.extend({
  type: z.literal("CONTEXT_GAP"),
  data: z.object({
    filePath: z.string(),
    accessedAtToolCall: z.number(),
    category: z.enum(["utility", "type", "config", "middleware", "model"]),
  }),
})

/**
 * Session abandoned signal - No accepted changes, few messages
 */
export const SessionAbandonedSignal = Signal.extend({
  type: z.literal("SESSION_ABANDONED"),
  data: z.object({
    messageCount: z.number(),
    toolCallCount: z.number(),
    reason: z.enum(["user_error", "no_output", "timeout"]),
  }),
})

/**
 * Token efficiency degradation signal
 */
export const TokenEfficiencySignal = Signal.extend({
  type: z.literal("TOKEN_EFFICIENCY_DEGRADATION"),
  data: z.object({
    tokensPerLine: z.number(),
    trend: z.enum(["increasing", "stable", "decreasing"]),
    percentChange: z.number(),
  }),
})

/**
 * Tool preference mismatch signal
 */
export const ToolPreferenceMismatchSignal = Signal.extend({
  type: z.literal("TOOL_PREFERENCE_MISMATCH"),
  data: z.object({
    actualTool: z.string(),
    expectedTool: z.string(),
    cause: z.string(),
  }),
})
