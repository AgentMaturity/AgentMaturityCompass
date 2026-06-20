import { z } from "zod";

export const passportScopeTypeSchema = z.enum(["WORKSPACE", "NODE", "AGENT"]);
export const passportTrustLabelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const passportStatusLabelSchema = z.enum(["VERIFIED", "INFORMATIONAL", "UNTRUSTED"]);
export const passportMaturityStatusSchema = z.enum(["OK", "INSUFFICIENT_EVIDENCE"]);

export const passportGovernanceStatusSchema = z.enum(["PASS", "FAIL", "UNKNOWN"]);
export const passportPromptEnforcementSchema = z.enum(["ON", "OFF", "UNKNOWN"]);
export const passportTruthguardModeSchema = z.enum(["ENFORCE", "WARN", "OFF", "UNKNOWN"]);

export const passportJsonSchema = z.object({
  v: z.literal(1),
  passportId: z.string().regex(/^pass_[A-Za-z0-9_-]{8,}$/),
  generatedTs: z.number().int(),
  expiresTs: z.number().int().optional(),
  scope: z.object({
    type: passportScopeTypeSchema,
    idHash: z.string().regex(/^[a-f0-9]{8,64}$/)
  }),
  trust: z.object({
    integrityIndex: z.number().min(0).max(1),
    correlationRatio: z.number().min(0).max(1),
    trustLabel: passportTrustLabelSchema,
    evidenceCoverage: z.object({
      observedShare: z.number().min(0).max(1),
      attestedShare: z.number().min(0).max(1),
      selfReportedShare: z.number().min(0).max(1)
    }),
    notary: z.object({
      enabled: z.boolean(),
      fingerprint: z.string().length(64).nullable().optional(),
      attestationAgeMinutes: z.number().min(0).nullable().optional()
    })
  }),
  status: z.object({
    label: passportStatusLabelSchema,
    reasons: z.array(z.string().min(1))
  }),
  maturity: z.object({
    status: passportMaturityStatusSchema,
    overall: z.number().min(0).max(5).nullable(),
    byFiveLayers: z.object({
      strategicOps: z.number().min(0).max(5).nullable(),
      leadership: z.number().min(0).max(5).nullable(),
      culture: z.number().min(0).max(5).nullable(),
      resilience: z.number().min(0).max(5).nullable(),
      skills: z.number().min(0).max(5).nullable()
    }),
    unknownQuestionsCount: z.number().int().min(0),
    questionExplainabilityHash: z.string().length(64).optional(),
    questionExplainabilitySummary: z
      .object({
        replayable: z.boolean(),
        failClosed: z.boolean(),
        rowCount: z.number().int().min(0),
        signedEvidenceRowCount: z.number().int().min(0),
        acceptedEvidenceCount: z.number().int().min(0),
        rejectedEvidenceCount: z.number().int().min(0),
        rejectedEvidenceReasonCount: z.number().int().min(0),
        reproducibleEvalPackCount: z.number().int().min(0),
        failClosedThresholdCount: z.number().int().min(0),
        surfaces: z.array(z.string().min(1)),
        rows: z
          .array(
            z.object({
              questionId: z.string().min(1),
              acceptedEvidenceIds: z.array(z.string().min(1)),
              rejectedEvidenceReasons: z.array(z.object({ evidenceId: z.string().min(1), reason: z.string().min(1) })),
              repairHint: z.string().min(1),
              status: z.enum(["ready", "fail_closed"]),
              rowHash: z.string().length(64)
            })
          )
          .optional()
      })
      .optional(),
    questionExplainabilityReplayable: z.boolean().optional(),
    questionExplainabilityFailClosed: z.boolean().optional(),
    questionScores42: z
      .array(
        z.object({
          qIdHash: z.string().regex(/^q_[a-f0-9]{8,64}$/),
          score: z.number().min(0).max(5)
        })
      )
      .optional()
  }),
  strategyFailureRisks: z.object({
    ecosystemFocusRisk: z.number().min(0).max(100).nullable(),
    clarityPathRisk: z.number().min(0).max(100).nullable(),
    economicSignificanceRisk: z.number().min(0).max(100).nullable(),
    riskAssuranceRisk: z.number().min(0).max(100).nullable(),
    digitalDualityRisk: z.number().min(0).max(100).nullable()
  }),
  valueDimensions: z.object({
    emotionalValue: z.number().min(0).max(100).nullable(),
    functionalValue: z.number().min(0).max(100).nullable(),
    economicValue: z.number().min(0).max(100).nullable(),
    brandValue: z.number().min(0).max(100).nullable(),
    lifetimeValue: z.number().min(0).max(100).nullable(),
    valueScore: z.number().min(0).max(100).nullable()
  }),
  checkpoints: z.object({
    cgxPackSha256: z.string().length(64),
    promptPackSha256: z.string().length(64).nullable().optional(),
    lastAssuranceCert: z.object({
      status: z.enum(["PASS", "FAIL", "INSUFFICIENT_EVIDENCE"]),
      sha256: z.string().length(64).nullable().optional(),
      issuedTs: z.number().int().nullable().optional(),
      riskAssuranceScore: z.number().min(0).max(100).nullable().optional()
    }),
    lastBench: z.object({
      sha256: z.string().length(64).nullable().optional(),
      generatedTs: z.number().int().nullable().optional()
    }),
    lastAuditBinder: z.object({
      sha256: z.string().length(64).nullable().optional(),
      generatedTs: z.number().int().nullable().optional()
    }),
    lastValueSnapshot: z.object({
      sha256: z.string().length(64).nullable().optional(),
      generatedTs: z.number().int().nullable().optional()
    })
  }),
  governanceSummary: z.object({
    promptEnforcement: passportPromptEnforcementSchema,
    truthguard: passportTruthguardModeSchema,
    providerAllowlist: passportGovernanceStatusSchema,
    modelAllowlist: passportGovernanceStatusSchema,
    toolAllowlist: passportGovernanceStatusSchema,
    approvals: passportGovernanceStatusSchema,
    leases: passportGovernanceStatusSchema,
    pluginsIntegrity: passportGovernanceStatusSchema
  }),
  bindings: z.object({
    passportPolicySha256: z.string().length(64),
    canonSha256: z.string().length(64),
    bankSha256: z.string().length(64),
    mechanicTargetsSha256: z.string().length(64).nullable().optional(),
    trustMode: z.enum(["LOCAL_VAULT", "NOTARY"]),
    notaryFingerprint: z.string().length(64).nullable().optional()
  }),
  proofBindings: z.object({
    transparencyRootSha256: z.string().length(64),
    merkleRootSha256: z.string().length(64),
    includedEventProofIds: z.array(z.string().min(1)),
    calculationManifestSha256: z.string().length(64)
  })
});

export const passportSignatureSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: z
    .object({
      v: z.literal(1),
      alg: z.literal("ed25519"),
      pubkeyB64: z.string().min(1),
      fingerprint: z.string().length(64),
      sigB64: z.string().min(1),
      signedTs: z.number().int(),
      signer: z.object({
        type: z.enum(["VAULT", "NOTARY"]),
        attestationLevel: z.enum(["SOFTWARE", "HARDWARE"]),
        notaryFingerprint: z.string().length(64).optional()
      })
    })
    .optional()
});

export const passportPiiFindingSchema = z.object({
  severity: z.enum(["HIGH", "MEDIUM", "LOW"]),
  type: z.enum(["EMAIL", "URL", "FILE_PATH", "TOKEN", "PRIVATE_KEY", "FREE_TEXT"]),
  path: z.string().min(1),
  snippetRedacted: z.string().min(1)
});

export const passportPiiScanSchema = z.object({
  v: z.literal(1),
  status: z.enum(["PASS", "FAIL"]),
  findings: z.array(passportPiiFindingSchema)
});

export type PassportJson = z.infer<typeof passportJsonSchema>;
export type PassportSignature = z.infer<typeof passportSignatureSchema>;
export type PassportPiiScan = z.infer<typeof passportPiiScanSchema>;
