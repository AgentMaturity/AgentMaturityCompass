import { z } from "zod";

export const valueDimensionScoresSchema = z.object({
  emotional: z.number().min(0).max(100).nullable(),
  functional: z.number().min(0).max(100).nullable(),
  economic: z.number().min(0).max(100).nullable(),
  brand: z.number().min(0).max(100).nullable(),
  lifetime: z.number().min(0).max(100).nullable(),
  valueScore: z.number().min(0).max(100).nullable()
});

export const economicSignificanceSchema = z.object({
  score: z.number().min(0).max(100).nullable(),
  risk: z.number().min(0).max(100).nullable(),
  reasons: z.array(z.string()).default([])
});

export const valueSnapshotSchema = z.object({
  v: z.literal(1),
  generatedTs: z.number().int(),
  scope: z.object({
    type: z.enum(["WORKSPACE", "NODE", "AGENT"]),
    id: z.string().min(1)
  }),
  status: z.enum(["OK", "INSUFFICIENT_EVIDENCE"]),
  reasons: z.array(z.string()).default([]),
  gates: z.object({
    integrityIndex: z.number().min(0).max(1),
    correlationRatio: z.number().min(0).max(1).nullable(),
    observedShare: z.number().min(0).max(1),
    selfReportedShare: z.number().min(0).max(1)
  }),
  baselines: z.object({
    windowDays: z.number().int().min(1),
    startTs: z.number().int(),
    endTs: z.number().int()
  }),
  kpis: z.array(
    z.object({
      kpiId: z.string().min(1),
      normalizedScore: z.number().min(0).max(100).nullable(),
      baselineValue: z.number().nullable(),
      currentValue: z.number().nullable(),
      delta: z.number().nullable(),
      trustKindSummary: z.object({
        observed: z.number().min(0).max(1),
        attested: z.number().min(0).max(1),
        selfReported: z.number().min(0).max(1)
      }),
      evidenceRefsCount: z.number().int().min(0)
    })
  ),
  valueDimensions: valueDimensionScoresSchema,
  economicSignificance: economicSignificanceSchema,
  attributionSummary: z.object({
    status: z.enum(["OK", "INSUFFICIENT_EVIDENCE"]),
    method: z.enum(["LAST_TOUCH", "PROPORTIONAL_RUN_COUNT"]),
    entries: z.array(
      z.object({
        kpiId: z.string(),
        attributedTo: z.array(
          z.object({
            agentIdHash: z.string(),
            share: z.number(),
            runIds: z.array(z.string()),
            evidenceRefs: z.array(z.string())
          })
        )
      })
    )
  }),
  notes: z.array(z.string()).default([])
});

export type ValueSnapshot = z.infer<typeof valueSnapshotSchema>;

export const valueReportSchema = z.object({
  v: z.literal(1),
  reportId: z.string().min(1),
  generatedTs: z.number().int(),
  windowDays: z.number().int().min(1),
  scope: z.object({
    type: z.enum(["WORKSPACE", "NODE", "AGENT"]),
    id: z.string().min(1)
  }),
  snapshot: valueSnapshotSchema,
  series: z.object({
    valueScore: z.array(z.object({ ts: z.number().int(), value: z.number().min(0).max(100) })),
    economic: z.array(z.object({ ts: z.number().int(), value: z.number().min(0).max(100) })),
    risk: z.array(z.object({ ts: z.number().int(), value: z.number().min(0).max(100) }))
  })
});

export type ValueReport = z.infer<typeof valueReportSchema>;
