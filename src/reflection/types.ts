import { z } from "zod"

/**
 * Reflection schemas - structured LLM analysis of session failures
 */

export const PatternMatch = z.enum([
  "context_gap",
  "utility_class_blindness",
  "wrong_tool_choice",
  "incomplete_edit",
  "error_handling_miss",
  "type_system_miss",
  "architecture_mismatch",
  "api_misunderstanding",
  "concurrency_issue",
  "dependency_conflict",
  "test_coverage_gap",
  "performance_regression",
  "security_vulnerability",
  "edge_case_unhandled",
  "incompleteness",
  "other",
])

export type PatternMatch = z.infer<typeof PatternMatch>

/**
 * Root cause analysis result
 */
export const RootCauseAnalysis = z.object({
  main_issue: z.string().describe("Primary reason for failure"),
  contributing_factors: z.array(z.string()).describe("Secondary issues"),
  severity: z.enum(["critical", "high", "medium", "low"]),
  pattern_matches: z.array(PatternMatch).describe("Recognized failure patterns"),
})

export type RootCauseAnalysis = z.infer<typeof RootCauseAnalysis>

/**
 * Reflection note - critical LLM output
 */
export const ReflectionNote = z.object({
  sessionID: z.string(),
  // Timing
  generated_at: z.number(),
  task_summary: z.string().optional(),
  what_worked: z.string().optional(),
  what_failed: z.string().optional(),
  missing_context: z.array(z.string()).optional(),
  what_would_have_helped: z.string().optional(),
  root_cause_hypothesis: z.string().optional(),
  // Analysis results
  session_duration_ms: z.number().optional(),
  completed_successfully: z.boolean(),
  user_satisfaction: z.enum(["very_satisfied", "satisfied", "neutral", "dissatisfied", "very_dissatisfied"]),
  // Root cause if something went wrong
  root_cause: RootCauseAnalysis.optional(),
  // Key learnings
  key_learnings: z.array(z.string()).max(5).describe("Top 3-5 insights"),
  // Recommendations
  recommendations: z.array(z.string()).max(3).describe("Suggested harness improvements"),
  // Confidence score
  confidence: z.number().min(0).max(1).describe("How confident the analysis is"),
})

export type ReflectionNote = z.infer<typeof ReflectionNote>

/**
 * Reflection generation request from session data
 */
export const ReflectionRequest = z.object({
  sessionID: z.string(),
  projectID: z.string(),
  traceEvents: z.array(z.record(z.string(), z.unknown())),
  signals: z.array(z.object({ type: z.string(), severity: z.string() })),
  healthScore: z.number().min(0).max(1),
  messageCount: z.number(),
  toolCallCount: z.number(),
  acceptedEdits: z.number(),
  summary: z.string().optional(),
})

export type ReflectionRequest = z.infer<typeof ReflectionRequest>
