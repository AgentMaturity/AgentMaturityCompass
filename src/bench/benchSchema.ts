import { signatureEnvelopeSchema } from "../crypto/signing/signatureEnvelope.js";
import { z } from "zod";

export const benchScopeTypeSchema = z.enum(["WORKSPACE", "NODE", "AGENT"]);
export const benchPublisherModeSchema = z.enum(["ANONYMIZED", "NAMED"]);
export const benchTrustLabelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const benchAttestationLevelSchema = z.enum(["SOFTWARE", "HARDWARE", "NONE"]);
export const benchForecastStatusSchema = z.enum(["OK", "INSUFFICIENT_EVIDENCE"]);
export const benchConfidenceLabelSchema = z.enum(["HIGH", "MEDIUM", "LOW", "NONE"]);
export const benchPluginIntegritySchema = z.enum(["PASS", "FAIL"]);

export const benchRiskSchema = z.object({
  ecosystemFocusRisk: z.number().min(0).max(100),
  clarityPathRisk: z.number().min(0).max(100),
  economicSignificanceRisk: z.number().min(0).max(100),
  riskAssuranceRisk: z.number().min(0).max(100),
  digitalDualityRisk: z.number().min(0).max(100)
});

export const benchValuesSchema = z.object({
  emotionalValue: z.number().min(0).max(100),
  functionalValue: z.number().min(0).max(100),
  economicValue: z.number().min(0).max(100),
  brandValue: z.number().min(0).max(100),
  lifetimeValue: z.number().min(0).max(100),
  valueScore: z.number().min(0).max(100).optional()
});

export const benchOperatingHealthSchema = z.object({
  approvalsBacklogCount: z.number().int().min(0),
  approvalsMedianAgeHours: z.number().min(0),
  budgetExceedEvents: z.number().int().min(0),
  toolhubDenialRate: z.number().min(0).max(1),
  freezeEvents: z.number().int().min(0),
  assurance: z.object({
    latestScore: z.number().min(0).max(100),
    injectionFailures: z.number().int().min(0),
    exfilAttemptsDetected: z.number().int().min(0)
  }),
  plugins: z.object({
    integrity: benchPluginIntegritySchema,
    installedCount: z.number().int().min(0)
  }),
  notary: z.object({
    enabled: z.boolean(),
    downEvents: z.number().int().min(0),
    attestationAgeMinutes: z.number().min(0).nullable()
  })
});

export const benchMaturitySchema = z.object({
  overall: z.number().min(0).max(5),
  fiveLayers: z.object({
    strategicOps: z.number().min(0).max(5),
    leadership: z.number().min(0).max(5),
    culture: z.number().min(0).max(5),
    resilience: z.number().min(0).max(5),
    skills: z.number().min(0).max(5)
  }),
  fiveDimensions: z.object({
    d1: z.number().min(0).max(5),
    d2: z.number().min(0).max(5),
    d3: z.number().min(0).max(5),
    d4: z.number().min(0).max(5),
    d5: z.number().min(0).max(5)
  }),
  questions42: z
    .array(
      z.object({
        qIdHash: z.string().regex(/^q_[a-f0-9]{8,64}$/),
        score: z.number().min(0).max(5)
      })
    )
    .optional()
});

export const benchEvidenceSchema = z.object({
  window: z.object({
    days: z.number().int().min(1),
    startTs: z.number().int(),
    endTs: z.number().int()
  }),
  integrityIndex: z.number().min(0).max(1),
  correlationRatio: z.number().min(0).max(1),
  trustLabel: benchTrustLabelSchema,
  evidenceCoverage: z.object({
    observedShare: z.number().min(0).max(1),
    attestedShare: z.number().min(0).max(1),
    selfReportedShare: z.number().min(0).max(1)
  })
});

export const benchProofBindingSchema = z.object({
  transparencyRootSha256: z.string().length(64),
  merkleRootSha256: z.string().length(64),
  includedEventKinds: z.array(z.string().min(1)),
  includedEventProofIds: z.array(z.string().min(1)),
  calculationManifestSha256: z.string().length(64)
});

export const benchLabelSchema = z.object({
  industry: z.enum(["software", "fintech", "health", "manufacturing", "other"]).optional(),
  agentType: z.enum(["code-agent", "support-agent", "ops-agent", "research-agent", "sales-agent", "other"]).optional(),
  deployment: z.enum(["single", "host", "k8s", "compose"]).optional()
});

export const benchArtifactSchema = z.object({
  v: z.literal(1),
  benchId: z.string().regex(/^bench_[a-zA-Z0-9_-]{8,}$/),
  generatedTs: z.number().int(),
  scope: z.object({
    type: benchScopeTypeSchema,
    idHash: z.string().regex(/^[a-f0-9]{8,64}$/)
  }),
  publisher: z.object({
    mode: benchPublisherModeSchema,
    workspaceIdHash: z.string().regex(/^[a-f0-9]{8,64}$/),
    hostInstanceHash: z.string().regex(/^[a-f0-9]{8,64}$/).nullable(),
    attestation: z.object({
      trustMode: z.enum(["LOCAL_VAULT", "NOTARY"]),
      attestationLevel: benchAttestationLevelSchema,
      notaryFingerprint: z.string().length(64).nullable(),
      lastAttestationTs: z.number().int().nullable()
    })
  }),
  evidence: benchEvidenceSchema,
  metrics: z.object({
    maturity: benchMaturitySchema,
    strategyFailureRisks: benchRiskSchema,
    valueDimensions: benchValuesSchema,
    operatingHealth: benchOperatingHealthSchema,
    forecastSummary: z.object({
      status: benchForecastStatusSchema,
      maturityDeltaShort: z.number().nullable(),
      riskDeltaShort: z.number().nullable(),
      confidenceLabel: benchConfidenceLabelSchema,
      reasons: z.array(z.string().min(1))
    })
  }),
  proofBindings: benchProofBindingSchema,
  labels: benchLabelSchema.default({})
});

export const benchSignatureSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: signatureEnvelopeSchema.optional()
});

export const benchPiiScanSchema = z.object({
  v: z.literal(1),
  status: z.enum(["PASS", "FAIL"]),
  findings: z.array(
    z.object({
      severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
      type: z.string().min(1),
      path: z.string().min(1),
      pattern: z.string().min(1),
      snippetRedacted: z.string().min(1)
    })
  )
});

export const benchBuildMetaSchema = z.object({
  v: z.literal(1),
  generatedTs: z.number().int(),
  modelVersion: z.string().min(1),
  scope: z.object({
    type: benchScopeTypeSchema,
    idHash: z.string().regex(/^[a-f0-9]{8,64}$/)
  }),
  sourceRefs: z.object({
    runId: z.string().nullable(),
    orgScorecardComputedTs: z.number().int().nullable(),
    outcomeReportId: z.string().nullable(),
    forecastGeneratedTs: z.number().int().nullable()
  })
});

export const benchComparisonSchema = z.object({
  v: z.literal(1),
  generatedTs: z.number().int(),
  scope: z.object({
    type: benchScopeTypeSchema,
    idHash: z.string().regex(/^[a-f0-9]{8,64}$/)
  }),
  population: z.object({
    count: z.number().int().min(0),
    registryIds: z.array(z.string().min(1)),
    trustSummary: z.object({
      low: z.number().int().min(0),
      medium: z.number().int().min(0),
      high: z.number().int().min(0)
    })
  }),
  percentiles: z.record(z.string().min(1), z.number().min(0).max(100)),
  composites: z.object({
    ecosystemAlignmentScore: z.number().min(0).max(100),
    riskAssuranceScore: z.number().min(0).max(100),
    digitalDualityReadiness: z.number().min(0).max(100)
  }),
  peerGroup: z.object({
    id: z.string().min(1),
    size: z.number().int().min(1),
    medoidBenchId: z.string().min(1),
    distance: z.number().min(0)
  }),
  warnings: z.array(z.string().min(1))
});

export type BenchArtifact = z.infer<typeof benchArtifactSchema>;
export type BenchComparison = z.infer<typeof benchComparisonSchema>;
export type BenchBuildMeta = z.infer<typeof benchBuildMetaSchema>;
export type BenchPiiScanReport = z.infer<typeof benchPiiScanSchema>;

