import { z } from "zod";

export const FORECAST_SCOPE_TYPES = ["WORKSPACE", "NODE", "AGENT"] as const;
export const FORECAST_STATUSES = ["OK", "INSUFFICIENT_EVIDENCE"] as const;
export const FORECAST_SEVERITIES = ["INFO", "WARN", "CRITICAL"] as const;
export const FORECAST_ADVISORY_CATEGORIES = [
  "DRIFT",
  "ANOMALY",
  "RISK_INDEX",
  "VALUE_REGRESSION",
  "INTEGRITY",
  "GOVERNANCE",
  "BUDGET",
  "NOTARY"
] as const;
export const FORECAST_INDEX_IDS = [
  "EcosystemFocusRisk",
  "ClarityPathRisk",
  "EconomicSignificanceRisk",
  "RiskAssuranceRisk",
  "DigitalDualityRisk"
] as const;
export const FORECAST_VALUE_DIMENSIONS = [
  "EmotionalValue",
  "FunctionalValue",
  "EconomicValue",
  "BrandValue",
  "LifetimeValue"
] as const;
export const FORECAST_VALUE_CATEGORIES = [
  "Emotional",
  "Functional",
  "Economic",
  "Brand",
  "Lifetime"
] as const;
export const FORECAST_CADENCE_EVENTS = [
  "POLICY_APPLIED",
  "APPROVAL_DECIDED",
  "FREEZE_CHANGED",
  "PLUGIN_INSTALLED",
  "NOTARY_ATTESTATION_OBSERVED"
] as const;

export const forecastScopeTypeSchema = z.enum(FORECAST_SCOPE_TYPES);
export const forecastStatusSchema = z.enum(FORECAST_STATUSES);
export const forecastSeveritySchema = z.enum(FORECAST_SEVERITIES);
export const forecastAdvisoryCategorySchema = z.enum(FORECAST_ADVISORY_CATEGORIES);
export const forecastIndexIdSchema = z.enum(FORECAST_INDEX_IDS);
export const forecastValueDimensionSchema = z.enum(FORECAST_VALUE_DIMENSIONS);
export const forecastValueCategorySchema = z.enum(FORECAST_VALUE_CATEGORIES);
export const forecastCadenceEventSchema = z.enum(FORECAST_CADENCE_EVENTS);

export const forecastPolicySchema = z.object({
  forecastPolicy: z.object({
    version: z.literal(1),
    cadence: z.object({
      defaultRefreshHours: z.number().int().min(1),
      refreshAfterRun: z.boolean(),
      refreshAfterEvents: z.array(forecastCadenceEventSchema).default([])
    }),
    horizons: z.object({
      shortDays: z.number().int().min(1),
      midDays: z.number().int().min(1),
      longDays: z.number().int().min(1)
    }),
    evidenceGates: z.object({
      minIntegrityIndex: z.number().min(0).max(1),
      minCorrelationRatio: z.number().min(0).max(1),
      minObservedRuns: z.number().int().min(1),
      maxSelfReportedShare: z.number().min(0).max(1)
    }),
    anomaly: z.object({
      maturityJumpRobustZ: z.number().positive(),
      integrityDropRobustZ: z.number().positive(),
      approvalsBacklogJumpRobustZ: z.number().positive()
    }),
    drift: z.object({
      nRunsWindow: z.number().int().min(3),
      driftWarnPoints: z.number().positive(),
      driftCriticalPoints: z.number().positive()
    }),
    advisories: z.object({
      enable: z.boolean(),
      thresholds: z.object({
        riskScoreWarn: z.number().min(0).max(100),
        riskScoreCritical: z.number().min(0).max(100)
      }),
      dispatch: z.object({
        warnEvents: z.boolean(),
        criticalEvents: z.boolean()
      })
    }),
    privacy: z.object({
      exportAgentIdsHashed: z.boolean(),
      hashTruncBytes: z.number().int().min(4).max(32)
    })
  })
});

export const forecastScopeSchema = z.object({
  type: forecastScopeTypeSchema,
  id: z.string().min(1)
});

export const forecastPointSchema = z.object({
  ts: z.number().int(),
  value: z.number(),
  runId: z.string().optional(),
  trustTier: z.string().optional()
});

export const forecastTrendSchema = z.object({
  slope: z.number(),
  intercept: z.number(),
  robustSigma: z.number().nonnegative(),
  ewmaNow: z.number(),
  sampleSize: z.number().int().min(0),
  outlierCount: z.number().int().min(0),
  changePoints: z
    .array(
      z.object({
        ts: z.number().int(),
        direction: z.enum(["UP", "DOWN"]),
        magnitude: z.number()
      })
    )
    .default([])
});

export const forecastProjectionSchema = z.object({
  atTs: z.number().int(),
  value: z.number(),
  low: z.number(),
  high: z.number()
});

export const forecastSeriesSchema = z.object({
  points: z.array(forecastPointSchema).default([]),
  trend: forecastTrendSchema.nullable(),
  forecast: z.object({
    short: forecastProjectionSchema.nullable(),
    mid: forecastProjectionSchema.nullable(),
    long: forecastProjectionSchema.nullable()
  })
});

export const forecastEvidenceRefSchema = z.object({
  runIds: z.array(z.string()).default([]),
  eventHashes: z.array(z.string()).default([])
});

export const forecastLeadingIndicatorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  direction: z.enum(["WORSENING", "IMPROVING", "STABLE"]),
  magnitude: z.number(),
  robustZ: z.number(),
  evidenceRefs: forecastEvidenceRefSchema,
  explanationTemplateId: z.string().min(1)
});

export const forecastDriftSchema = z.object({
  metricId: z.string().min(1),
  severity: forecastSeveritySchema,
  delta: z.number(),
  window: z.number().int().min(1),
  evidenceRefs: forecastEvidenceRefSchema
});

export const forecastAnomalySchema = z.object({
  type: z.string().min(1),
  severity: forecastSeveritySchema,
  explanationTemplateId: z.string().min(1),
  evidenceRefs: forecastEvidenceRefSchema
});

export const forecastEtaSchema = z.object({
  status: z.enum(["OK", "UNKNOWN"]),
  optimisticDays: z.number().nonnegative().optional(),
  expectedDays: z.number().nonnegative().optional(),
  conservativeDays: z.number().nonnegative().optional(),
  reasons: z.array(z.string()).default([])
});

export const advisorySchema = z.object({
  advisoryId: z.string().min(1),
  scope: forecastScopeSchema,
  severity: forecastSeveritySchema,
  category: forecastAdvisoryCategorySchema,
  summary: z.string().min(1),
  whyNow: z.array(z.string()).default([]),
  evidenceRefs: forecastEvidenceRefSchema,
  recommendedNextSteps: z.array(z.string()).min(1),
  createdTs: z.number().int(),
  acknowledged: z
    .object({
      by: z.string().min(1),
      ts: z.number().int(),
      note: z.string().min(1)
    })
    .optional()
});

const forecastSeriesBlockSchema = z.object({
  maturityOverall: forecastSeriesSchema,
  integrityIndex: forecastSeriesSchema,
  correlationRatio: forecastSeriesSchema,
  fourC: z.object({
    Concept: forecastSeriesSchema,
    Culture: forecastSeriesSchema,
    Capabilities: forecastSeriesSchema,
    Configuration: forecastSeriesSchema
  }),
  indices: z.partialRecord(forecastIndexIdSchema, forecastSeriesSchema),
  value: z.partialRecord(forecastValueDimensionSchema, forecastSeriesSchema),
  operating: z.record(z.string(), forecastSeriesSchema)
});

export const forecastArtifactSchema = z.object({
  v: z.literal(1),
  scope: forecastScopeSchema,
  generatedTs: z.number().int(),
  policySha256: z.string().length(64),
  modelVersion: z.string().min(1),
  status: forecastStatusSchema,
  reasons: z.array(z.string()).default([]),
  horizons: z.object({
    shortDays: z.number().int().min(1),
    midDays: z.number().int().min(1),
    longDays: z.number().int().min(1)
  }),
  evidenceCoverage: z.object({
    observedShare: z.number().min(0).max(1),
    attestedShare: z.number().min(0).max(1),
    selfReportedShare: z.number().min(0).max(1),
    observedRuns: z.number().int().min(0),
    latestIntegrityIndex: z.number().min(0).max(1),
    latestCorrelationRatio: z.number().min(0).max(1)
  }),
  series: forecastSeriesBlockSchema,
  drift: z.array(forecastDriftSchema).default([]),
  anomalies: z.array(forecastAnomalySchema).default([]),
  leadingIndicators: z.array(forecastLeadingIndicatorSchema).default([]),
  etaToTarget: forecastEtaSchema,
  advisories: z.array(advisorySchema).default([])
});

export const forecastSchedulerStateSchema = z.object({
  enabled: z.boolean(),
  lastRefreshTs: z.number().int().nullable(),
  nextRefreshTs: z.number().int().nullable(),
  lastOutcome: z.object({
    status: z.enum(["OK", "ERROR", "SKIPPED"]).default("OK"),
    reason: z.string().default("")
  })
});

export type ForecastPolicy = z.infer<typeof forecastPolicySchema>;
export type ForecastScope = z.infer<typeof forecastScopeSchema>;
export type ForecastSeries = z.infer<typeof forecastSeriesSchema>;
export type ForecastLeadingIndicator = z.infer<typeof forecastLeadingIndicatorSchema>;
export type ForecastDrift = z.infer<typeof forecastDriftSchema>;
export type ForecastAnomaly = z.infer<typeof forecastAnomalySchema>;
export type AdvisoryRecord = z.infer<typeof advisorySchema>;
export type ForecastArtifact = z.infer<typeof forecastArtifactSchema>;
export type ForecastSchedulerState = z.infer<typeof forecastSchedulerStateSchema>;
