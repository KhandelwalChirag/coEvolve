import { z } from "zod"

const Confidence = z.enum(["low", "medium", "high"])

const Ext = z.object({
  id: z.string(),
  content: z.string(),
  reason: z.string(),
  added_at: z.number(),
  added_by: z.enum(["bootstrap", "proposer", "user"]),
  confidence: Confidence,
  locked: z.boolean().default(false),
})

const Ctx = z.object({
  id: z.string(),
  path: z.string(),
  format: z.enum(["full", "summary_10_lines", "summary_20_lines"]),
  reason: z.string(),
  condition: z.string().nullable().default(null),
  locked: z.boolean().default(false),
})

const Rule = z.object({
  id: z.string(),
  rule: z.string(),
  reason: z.string(),
  locked: z.boolean().default(false),
})

const Inv = z.object({
  id: z.string(),
  content: z.string(),
  set_by: z.enum(["user", "bootstrap", "proposer"]),
  locked: z.literal(true).default(true),
})

export const Harness = z.object({
  version: z.literal("1.0"),
  created_at: z.number(),
  updated_at: z.number(),
  tree_node: z.string(),
  parent_node: z.string().nullable(),
  health_at_creation: z.number().min(0).max(1),
  source: z.enum(["bootstrap", "manual", "proposal"]).default("manual"),
  confidence: Confidence.default("low"),
  system_prompt_extensions: z.array(Ext).default([]),
  initial_context_files: z.array(Ctx).default([]),
  tool_preferences: z.array(Rule).default([]),
  suppression_rules: z.array(Rule).default([]),
  aci_format_rules: z.array(Rule).default([]),
  invariant_rules: z.array(Inv).default([]),
})

export type Harness = z.infer<typeof Harness>

export const HarnessNode = z.object({
  id: z.string(),
  parent: z.string().nullable(),
  children: z.array(z.string()),
  created_at: z.number(),
  note: z.string(),
})

export type HarnessNode = z.infer<typeof HarnessNode>

export const HarnessScore = z.object({
  node: z.string(),
  created_at: z.number(),
  health_at_creation: z.number().min(0).max(1),
  rolling_health: z.array(z.number().min(0).max(1)).default([]),
})

export type HarnessScore = z.infer<typeof HarnessScore>
