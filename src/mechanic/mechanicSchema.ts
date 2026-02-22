import { z } from "zod";
import { mechanicScopeSchema } from "./targetSchema.js";
import { mechanicActionKindSchema } from "./upgradePlanSchema.js";

export const mechanicGapQuestionSchema = z.object({
  qId: z.string().min(1),
  measured: z.number().min(0).max(5),
  desired: z.number().min(0).max(5),
  gap: z.number(),
  status: z.enum(["OK", "UNKNOWN", "BLOCKED"]),
  reasons: z.array(z.string().min(1)).default([]),
  evidenceCoverage: z.number().min(0).max(1)
});

export const mechanicGapDimensionSchema = z.object({
  dimensionId: z.string().min(1),
  measuredAverage: z.number().min(0).max(5),
  targetAverage: z.number().min(0).max(5),
  unknownCount: z.number().int().nonnegative(),
  topGaps: z.array(z.object({ qId: z.string().min(1), gap: z.number() })).default([])
});

export const mechanicGapReportSchema = z.object({
  v: z.literal(1),
  generatedTs: z.number().int().nonnegative(),
  scope: mechanicScopeSchema,
  readiness: z.enum(["READY", "NEEDS_EVIDENCE", "UNTRUSTED"]),
  perQuestion: z.array(mechanicGapQuestionSchema).length(91),
  perDimension: z.array(mechanicGapDimensionSchema).length(5),
  global: z.object({
    upgradeReadiness: z.enum(["READY", "NEEDS_EVIDENCE", "UNTRUSTED"]),
    integrityIndex: z.number().min(0).max(1),
    correlationRatio: z.number().min(0).max(1),
    strategyFailureRisks: z.record(z.number()).default({}),
    valueDimensions: z.record(z.number()).default({})
  })
});

export const mechanicSimulationCandidateSchema = z.object({
  candidateId: z.string().min(1),
  actions: z.array(
    z.object({
      id: z.string().min(1),
      kind: mechanicActionKindSchema
    })
  ),
  projected: z.object({
    evidenceCoverageDelta: z.number().optional(),
    maturityDeltaBand: z.object({ low: z.number(), mid: z.number(), high: z.number() }).optional(),
    riskIndexDeltaBand: z.object({ low: z.number(), mid: z.number(), high: z.number() }).optional(),
    valueDeltaBand: z.object({ low: z.number(), mid: z.number(), high: z.number() }).optional(),
    tradeoffs: z.array(z.string().min(1)).default([])
  }),
  honestyNotes: z.array(z.string().min(1)).min(1)
});

export const mechanicSimulationSchema = z.object({
  v: z.literal(1),
  simulationId: z.string().min(1),
  generatedTs: z.number().int().nonnegative(),
  scope: mechanicScopeSchema,
  status: z.enum(["OK", "INSUFFICIENT_EVIDENCE"]),
  reasons: z.array(z.string().min(1)).default([]),
  candidates: z.array(mechanicSimulationCandidateSchema)
});

export type MechanicGapReport = z.infer<typeof mechanicGapReportSchema>;
export type MechanicSimulation = z.infer<typeof mechanicSimulationSchema>;
