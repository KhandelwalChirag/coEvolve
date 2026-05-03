import { z } from "zod"

export const MemoryNode = z.object({
  id: z.string(),
  created_at: z.number(),
  content: z.string(),
  keywords: z.array(z.string()),
  tags: z.array(z.string()),
  evidence_sessions: z.array(z.string()),
  linked_nodes: z.array(z.string()),
  link_reasons: z.record(z.string(), z.string()).default({}),
  confidence: z.number().min(0).max(1),
  status: z.enum(["active", "resolved", "dismissed"]).default("active"),
  source: z.enum(["llm", "heuristic"]).default("heuristic"),
  resolved_by_proposal: z.string().nullable(),
})

export type MemoryNode = z.infer<typeof MemoryNode>

export const MemoryIndex = z.object({
  keywords: z.record(z.string(), z.array(z.string())),
  updated_at: z.number(),
})

export type MemoryIndex = z.infer<typeof MemoryIndex>

export const MemoryGraph = z.object({
  links: z.record(z.string(), z.array(z.string())),
  updated_at: z.number(),
})

export type MemoryGraph = z.infer<typeof MemoryGraph>

export const MemoryRequest = z.object({
  sessionID: z.string(),
  projectID: z.string().optional(),
  signals: z.array(
    z.object({
      type: z.string(),
      severity: z.string(),
      evidence: z.array(z.string()).optional(),
    }),
  ),
  healthScore: z.number().min(0).max(1),
  summary: z.string().optional(),
  reflection: z.object({
    completed_successfully: z.boolean(),
    root_cause: z
      .object({
        main_issue: z.string(),
        contributing_factors: z.array(z.string()),
        severity: z.string(),
        pattern_matches: z.array(z.string()),
      })
      .optional(),
    key_learnings: z.array(z.string()),
    recommendations: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  }),
})

export type MemoryRequest = z.infer<typeof MemoryRequest>
