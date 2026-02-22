import { z } from "zod";

export const assuranceScopeTypeSchema = z.enum(["WORKSPACE", "NODE", "AGENT"]);
export type AssuranceScopeType = z.infer<typeof assuranceScopeTypeSchema>;

export const assuranceStatusSchema = z.enum(["PASS", "FAIL", "INSUFFICIENT_EVIDENCE", "ERROR"]);
export type AssuranceStatus = z.infer<typeof assuranceStatusSchema>;

export const assurancePackIdSchema = z.enum([
  "injection",
  "exfiltration",
  "toolMisuse",
  "truthfulness",
  "sandboxBoundary",
  "notaryAttestation",
  "context-leakage"
]);
export type AssurancePackId = z.infer<typeof assurancePackIdSchema>;

export const assuranceFindingCategorySchema = z.enum([
  "INJECTION_RESILIENCE",
  "SECRET_LEAKAGE",
  "PII_LEAKAGE",
  "TOOL_GOVERNANCE",
  "MODEL_GOVERNANCE",
  "BUDGET_GOVERNANCE",
  "APPROVALS_GOVERNANCE",
  "TRUTHFULNESS",
  "SANDBOX_BOUNDARY",
  "ATTESTATION_INTEGRITY",
  "PLUGIN_INTEGRITY"
]);
export type AssuranceFindingCategory = z.infer<typeof assuranceFindingCategorySchema>;

export const assuranceFindingSeveritySchema = z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type AssuranceFindingSeverity = z.infer<typeof assuranceFindingSeveritySchema>;

export const assuranceEvidenceRefsSchema = z.object({
  runId: z.string().min(1),
  eventHashes: z.array(z.string().length(64)).default([]),
  receiptIds: z.array(z.string().min(1)).default([])
});
export type AssuranceEvidenceRefs = z.infer<typeof assuranceEvidenceRefsSchema>;

export const assuranceFindingSchema = z.object({
  findingId: z.string().min(1),
  scenarioId: z.string().min(1),
  category: assuranceFindingCategorySchema,
  severity: assuranceFindingSeveritySchema,
  descriptionTemplateId: z.string().min(1),
  evidenceRefs: assuranceEvidenceRefsSchema,
  remediationHints: z.array(z.string().min(1)).default([])
});
export type AssuranceFinding = z.infer<typeof assuranceFindingSchema>;

export const assuranceScenarioTraceRefSchema = z.object({
  scenarioId: z.string().min(1),
  requestId: z.string().min(1),
  runId: z.string().min(1),
  agentIdHash: z.string().regex(/^[a-f0-9]{8,64}$/),
  inputHash: z.string().length(64),
  outputHash: z.string().length(64),
  decision: z.enum(["ALLOWED", "DENIED", "REJECTED", "FLAGGED"]),
  policyHashes: z
    .object({
      assurancePolicySha256: z.string().length(64),
      promptPolicySha256: z.string().length(64).optional(),
      toolsSha256: z.string().length(64).optional(),
      budgetsSha256: z.string().length(64).optional()
    })
    .default({ assurancePolicySha256: "0".repeat(64) }),
  evidenceEventHashes: z.array(z.string().length(64)).default([]),
  timingMs: z.number().int().min(0),
  counters: z.record(z.string(), z.number()).default({})
});
export type AssuranceScenarioTraceRef = z.infer<typeof assuranceScenarioTraceRefSchema>;

export const assuranceScenarioResultSchema = z.object({
  scenarioId: z.string().min(1),
  packId: assurancePackIdSchema,
  category: assuranceFindingCategorySchema,
  passed: z.boolean(),
  reasons: z.array(z.string().min(1)).default([]),
  severityOnFailure: assuranceFindingSeveritySchema,
  evidenceRefs: assuranceEvidenceRefsSchema,
  traceRef: assuranceScenarioTraceRefSchema
});
export type AssuranceScenarioResult = z.infer<typeof assuranceScenarioResultSchema>;

export const assurancePackRunSchema = z.object({
  packId: assurancePackIdSchema,
  enabled: z.boolean(),
  scenarioCount: z.number().int().min(0),
  passedCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  scenarios: z.array(assuranceScenarioResultSchema).default([])
});
export type AssurancePackRun = z.infer<typeof assurancePackRunSchema>;

export const assuranceScoreSchema = z.object({
  status: assuranceStatusSchema,
  riskAssuranceScore: z.number().min(0).max(100).nullable(),
  categoryScores: z.record(assuranceFindingCategorySchema, z.number().min(0).max(100)).default({} as Record<AssuranceFindingCategory, number>),
  findingCounts: z.object({
    critical: z.number().int().min(0),
    high: z.number().int().min(0),
    medium: z.number().int().min(0),
    low: z.number().int().min(0),
    info: z.number().int().min(0)
  }),
  pass: z.boolean(),
  reasons: z.array(z.string().min(1)).default([])
});
export type AssuranceScore = z.infer<typeof assuranceScoreSchema>;

export const assuranceRunSchema = z.object({
  v: z.literal(1),
  runId: z.string().min(1),
  generatedTs: z.number().int(),
  scope: z.object({
    type: assuranceScopeTypeSchema,
    id: z.string().min(1)
  }),
  policySha256: z.string().length(64),
  selectedPacks: z.array(assurancePackIdSchema).default([]),
  evidenceGates: z.object({
    integrityIndex: z.number().min(0).max(1),
    correlationRatio: z.number().min(0).max(1),
    observedShare: z.number().min(0).max(1)
  }),
  packRuns: z.array(assurancePackRunSchema).default([]),
  score: assuranceScoreSchema,
  notes: z.array(z.string().min(1)).default([])
});
export type AssuranceRun = z.infer<typeof assuranceRunSchema>;

export const assuranceTraceRefsSchema = z.object({
  v: z.literal(1),
  runId: z.string().min(1),
  generatedTs: z.number().int(),
  refs: z.array(assuranceScenarioTraceRefSchema).default([])
});
export type AssuranceTraceRefs = z.infer<typeof assuranceTraceRefsSchema>;

export const assuranceFindingsDocSchema = z.object({
  v: z.literal(1),
  runId: z.string().min(1),
  generatedTs: z.number().int(),
  findings: z.array(assuranceFindingSchema).default([])
});
export type AssuranceFindingsDoc = z.infer<typeof assuranceFindingsDocSchema>;

export const assuranceSchedulerStateSchema = z.object({
  enabled: z.boolean(),
  lastRunTs: z.number().int().nullable(),
  nextRunTs: z.number().int().nullable(),
  lastOutcome: z.object({
    status: z.enum(["OK", "ERROR", "SKIPPED"]),
    reason: z.string()
  }),
  lastCertStatus: z.enum(["PASS", "FAIL", "INSUFFICIENT_EVIDENCE", "NONE"])
});
export type AssuranceSchedulerState = z.infer<typeof assuranceSchedulerStateSchema>;

export const assuranceWaiverSchema = z.object({
  v: z.literal(1),
  waiverId: z.string().min(1),
  createdTs: z.number().int(),
  expiresTs: z.number().int(),
  reason: z.string().min(1),
  scope: z.object({
    type: assuranceScopeTypeSchema,
    id: z.string().min(1)
  }),
  allowReadyDespiteAssuranceFail: z.literal(true),
  approvedBy: z.array(
    z.object({
      userIdHash: z.string().regex(/^[a-f0-9]{8,64}$/),
      role: z.enum(["OWNER", "AUDITOR"]),
      approvalEventHash: z.string().length(64)
    })
  ),
  bindings: z.object({
    lastCertSha256: z.string().length(64),
    policySha256: z.string().length(64)
  })
});
export type AssuranceWaiver = z.infer<typeof assuranceWaiverSchema>;

export const assuranceCertSchema = z.object({
  v: z.literal(1),
  certId: z.string().min(1),
  issuedTs: z.number().int(),
  scope: z.object({
    type: assuranceScopeTypeSchema,
    idHash: z.string().regex(/^[a-f0-9]{8,64}$/)
  }),
  runId: z.string().min(1),
  status: z.enum(["PASS", "FAIL", "INSUFFICIENT_EVIDENCE"]),
  riskAssuranceScore: z.number().min(0).max(100).nullable().optional(),
  categoryScores: z.record(assuranceFindingCategorySchema, z.number().min(0).max(100)).nullable().optional(),
  findingCounts: z.object({
    critical: z.number().int().min(0),
    high: z.number().int().min(0),
    medium: z.number().int().min(0),
    low: z.number().int().min(0),
    info: z.number().int().min(0)
  }),
  gates: z.object({
    integrityIndex: z.number().min(0).max(1),
    correlationRatio: z.number().min(0).max(1),
    observedShare: z.number().min(0).max(1)
  }),
  bindings: z.object({
    assurancePolicySha256: z.string().length(64),
    cgxPackSha256: z.string().length(64),
    promptPolicySha256: z.string().length(64),
    trustMode: z.enum(["LOCAL_VAULT", "NOTARY"]),
    notaryFingerprint: z.string().length(64).nullable().optional()
  }),
  proofBindings: z.object({
    transparencyRootSha256: z.string().length(64),
    merkleRootSha256: z.string().length(64),
    includedEventProofIds: z.array(z.string().min(1)).default([])
  })
});
export type AssuranceCert = z.infer<typeof assuranceCertSchema>;
