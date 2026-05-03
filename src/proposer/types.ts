import { z } from "zod"

export const ProposalConfidence = z.enum(["low", "medium", "high"])

export const ProposalChangeType = z.enum([
  "add_context_file",
  "remove_context_file",
  "add_instruction",
  "remove_instruction",
  "add_tool_preference",
  "remove_tool_preference",
])

export const ProposalTarget = z.enum([
  "initial_context_files",
  "system_prompt_extensions",
  "tool_preferences",
])

export const ProposalAddition = z.object({
  path: z.string().nullable().default(null),
  content: z.string().nullable().default(null),
  format: z.enum(["full", "summary_10_lines", "summary_20_lines"]).nullable().default(null),
  reason: z.string(),
  condition: z.string().nullable().default(null),
})

export const ProposalTrigger = z.enum([
  "manual",
  "session_count",
  "reprompt_rate",
  "reversion_rate",
  "none",
])

export const Proposal = z.object({
  id: z.string(),
  generated_at: z.string(),
  proposer_version: z.literal("1.0"),
  harness_tree_parent: z.string(),
  change_type: ProposalChangeType,
  target_section: ProposalTarget,
  proposed_addition: ProposalAddition,
  rationale: z.string(),
  evidence_nodes: z.array(z.string()),
  evidence_sessions: z.array(z.string()),
  confidence: ProposalConfidence,
  expected_improvement: z.string(),
  detection_criterion: z.string(),
  reversibility_note: z.string(),
  what_was_tried_before: z.string().nullable(),
  trigger: ProposalTrigger,
})

export type Proposal = z.infer<typeof Proposal>
export type ProposalTrigger = z.infer<typeof ProposalTrigger>

export type ProposerStats = {
  sessions_since_last: number
  reprompt_rate: number
  reversion_rate: number
  recent_sessions: number
}

export type TriggerCheck = {
  should: boolean
  reason: ProposalTrigger
  stats: ProposerStats
}
