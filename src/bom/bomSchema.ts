import { z } from "zod";

export const maturityBomSchema = z.object({
  v: z.literal(1),
  generatedTs: z.number().int(),
  agentId: z.string().min(1),
  agentName: z.string().min(1),
  role: z.string().min(1),
  domain: z.string().min(1),
  riskTier: z.string().min(1),
  runId: z.string().min(1),
  reportSha256: z.string().length(64),
  integrityIndex: z.number().min(0).max(1),
  trustLabel: z.string().min(1),
  overall: z.number().min(0).max(5),
  layerScores: z.array(
    z.object({
      layerName: z.string().min(1),
      avgFinalLevel: z.number(),
      confidenceWeightedFinalLevel: z.number()
    })
  ),
  assurancePackScores: z.record(z.string(), z.number().min(0).max(100)),
  indices: z.record(z.string(), z.number().min(0).max(100)),
  activeFreezeActionClasses: z.array(z.string()),
  git: z.object({
    commit: z.string().nullable(),
    branch: z.string().nullable()
  }),
  references: z.object({
    bundleId: z.string().nullable(),
    certId: z.string().nullable()
  })
});

export type MaturityBom = z.infer<typeof maturityBomSchema>;
