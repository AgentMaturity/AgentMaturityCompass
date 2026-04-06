import { z } from "zod";
import { mechanicScopeSchema } from "./targetSchema.js";

export const mechanicActionKindSchema = z.enum([
  "POLICY_PACK_APPLY",
  "BUDGETS_APPLY",
  "TOOLS_APPLY",
  "APPROVAL_POLICY_APPLY",
  "PLUGIN_INSTALL",
  "ASSURANCE_RUN",
  "TRANSFORM_PLAN_CREATE",
  "FREEZE_SET",
  "BENCH_CREATE",
  "FORECAST_REFRESH"
]);

export const mechanicPlanActionSchema = z.object({
  id: z.string().min(1),
  kind: mechanicActionKindSchema,
  requiresApproval: z.boolean(),
  effect: z.string().min(1),
  evidenceToVerify: z.array(z.string().min(1)).default([]),
  params: z.record(z.string(), z.unknown()).default({}),
  approvalRequestId: z.string().min(1).optional(),
  executedTs: z.number().int().optional(),
  executionStatus: z.enum(["PENDING", "EXECUTED", "FAILED", "SKIPPED"]).default("PENDING"),
  executionNote: z.string().optional()
});

export const mechanicPlanSchema = z.object({
  v: z.literal(1),
  planId: z.string().min(1),
  scope: mechanicScopeSchema,
  generatedTs: z.number().int().nonnegative(),
  inputs: z.object({
    targetsSha256: z.string().length(64),
    measuredScorecardSha256: z.string().length(64),
    bankVersion: z.number().int().positive(),
    canonVersion: z.number().int().positive(),
    cgxPackSha256: z.string().length(64)
  }),
  summary: z.object({
    currentOverall: z.number().min(0).max(5),
    targetOverall: z.number().min(0).max(5),
    gapPointsTotal: z.number().nonnegative(),
    unknownQuestionsCount: z.number().int().nonnegative(),
    integrityIndex: z.number().min(0).max(1),
    correlationRatio: z.number().min(0).max(1),
    readiness: z.enum(["READY", "NEEDS_EVIDENCE", "UNTRUSTED"])
  }),
  phases: z.array(
    z.object({
      phaseId: z.string().min(1),
      goal: z.string().min(1),
      actions: z.array(mechanicPlanActionSchema)
    })
  ),
  perQuestionPlan: z.array(
    z.object({
      qId: z.string().min(1),
      measured: z.number().min(0).max(5),
      target: z.number().min(0).max(5),
      actions: z.array(z.string().min(1)),
      expectedEvidence: z.array(z.string().min(1)).default([])
    })
  ),
  eta: z.object({
    status: z.enum(["OK", "UNKNOWN"]),
    optimisticDays: z.number().nonnegative().optional(),
    expectedDays: z.number().nonnegative().optional(),
    conservativeDays: z.number().nonnegative().optional(),
    reasons: z.array(z.string().min(1)).optional()
  }),
  safety: z.object({
    highRiskActionsCount: z.number().int().nonnegative(),
    requiresDualControl: z.boolean(),
    blockedByFreeze: z.boolean(),
    warnings: z.array(z.string().min(1)).default([])
  })
});

export type MechanicUpgradePlan = z.infer<typeof mechanicPlanSchema>;
export type MechanicActionKind = z.infer<typeof mechanicActionKindSchema>;
