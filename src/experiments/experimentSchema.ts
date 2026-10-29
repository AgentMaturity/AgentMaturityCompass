import { z } from "zod";

export const experimentSchema = z.object({
  experiment: z.object({
    version: z.literal(1),
    experimentId: z.string().min(1),
    agentId: z.string().min(1),
    name: z.string().min(1),
    casebookId: z.string().min(1),
    createdTs: z.number().int(),
    baselineConfig: z.object({
      id: z.string().min(1),
      kind: z.enum(["current", "file"]),
      path: z.string().nullable().optional()
    }),
    candidateConfig: z.object({
      id: z.string().min(1),
      kind: z.enum(["overlay-file", "current"]),
      path: z.string().nullable().optional(),
      digestSha256: z.string().length(64).nullable().optional(),
      signatureValid: z.boolean().default(false)
    }).nullable().default(null)
  })
});

export const experimentGateSchema = z.object({
  minUpliftSuccessRate: z.number(),
  minUpliftValuePoints: z.number(),
  maxCostIncreaseRatio: z.number().positive().optional(),
  denyIfRegression: z.boolean().optional(),
  /** Fewer cases determinate on both sides makes the gate inconclusive (default DEFAULT_MIN_PAIRED_CASES). */
  minPairedCases: z.number().int().min(1).optional(),
  /** Require the paired 95% interval of the value-point difference to lie above zero. */
  requireIntervalAboveZero: z.boolean().optional()
});

export type ExperimentFile = z.infer<typeof experimentSchema>;
export type ExperimentGatePolicy = z.infer<typeof experimentGateSchema>;
