import { z } from "zod";

export const caseRiskTierSchema = z.enum(["low", "medium", "high", "critical"]);
export const caseModeSchema = z.enum(["SIMULATE", "EXECUTE"]);

export const casebookCaseSchema = z.object({
  v: z.literal(1),
  caseId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  riskTier: caseRiskTierSchema,
  requestedMode: caseModeSchema.default("SIMULATE"),
  allowedActionClasses: z.array(z.string().min(1)).min(1),
  inputs: z.object({
    prompt: z.string().min(1),
    context: z.record(z.string(), z.unknown()).optional()
  }),
  validators: z.object({
    requiredToolActions: z.array(z.string().min(1)).default([]),
    forbiddenAudits: z.array(z.string().min(1)).default([]),
    minCorrelationRatio: z.number().min(0).max(1).default(0.9),
    requireReceipts: z.boolean().default(true)
  }),
  scoring: z.object({
    successPoints: z.number().min(0).max(100).default(60),
    valuePoints: z.number().min(0).max(100).default(100)
  })
});

export const casebookSchema = z.object({
  casebook: z.object({
    version: z.literal(1),
    casebookId: z.string().min(1),
    agentId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    createdTs: z.number().int(),
    caseIds: z.array(z.string().min(1)).default([])
  })
});

export type CasebookCase = z.infer<typeof casebookCaseSchema>;
export type CasebookFile = z.infer<typeof casebookSchema>;
