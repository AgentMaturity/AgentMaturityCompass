import { z } from "zod";
import { auditFamilyResultSchema } from "./auditMapSchema.js";
import { conformanceStatusSchema } from "../domains/conformance/conformanceSchema.js";

export const binderScopeSchema = z.object({
  type: z.enum(["WORKSPACE", "NODE", "AGENT"]),
  idHash: z.string().min(8)
});

export const binderSectionStatusSchema = z.enum(["OK", "INSUFFICIENT_EVIDENCE"]);

export const binderTrustSchema = z.object({
  integrityIndex: z.number().min(0).max(1),
  correlationRatio: z.number().min(0).max(1),
  trustLabel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  evidenceCoverage: z.object({
    observedShare: z.number().min(0).max(1),
    attestedShare: z.number().min(0).max(1),
    selfReportedShare: z.number().min(0).max(1)
  }),
  notary: z.object({
    enabled: z.boolean(),
    fingerprint: z.string().nullable().optional(),
    attestationAgeMinutes: z.number().nullable().optional()
  })
});

export const binderControlsSectionSchema = z.object({
  mapId: z.string().min(1),
  families: z.array(auditFamilyResultSchema).min(1)
});

export const binderJsonSchema = z.object({
  v: z.literal(1),
  binderId: z.string().min(1),
  generatedTs: z.number().int(),
  scope: binderScopeSchema,
  trust: binderTrustSchema,
  bindings: z.object({
    auditPolicySha256: z.string().length(64),
    auditMapSha256: z.string().length(64),
    canonSha256: z.string().length(64),
    bankSha256: z.string().length(64),
    cgxPackSha256: z.string().length(64),
    promptPolicySha256: z.string().length(64).optional(),
    mechanicTargetsSha256: z.string().length(64).optional()
  }),
  sections: z.object({
    maturity: z.object({
      status: binderSectionStatusSchema,
      overall: z.number().min(0).max(5).nullable(),
      byDimensions: z.object({
        DIM1: z.number().min(0).max(5).nullable(),
        DIM2: z.number().min(0).max(5).nullable(),
        DIM3: z.number().min(0).max(5).nullable(),
        DIM4: z.number().min(0).max(5).nullable(),
        DIM5: z.number().min(0).max(5).nullable()
      }),
      unknownQuestionsCount: z.number().int().min(0),
      evidenceRefs: z.array(z.string()).default([]),
      notes: z.array(z.string()).default([])
    }),
    governance: z.object({
      identity: z.object({ status: binderSectionStatusSchema, evidenceRefs: z.array(z.string()), notes: z.array(z.string()) }),
      approvals: z.object({ status: binderSectionStatusSchema, evidenceRefs: z.array(z.string()), notes: z.array(z.string()) }),
      leases: z.object({ status: binderSectionStatusSchema, evidenceRefs: z.array(z.string()), notes: z.array(z.string()) })
    }),
    modelToolGovernance: z.object({
      bridgeEnforcement: z.object({ status: binderSectionStatusSchema, evidenceRefs: z.array(z.string()), notes: z.array(z.string()) }),
      providerAllowlists: z.object({ status: binderSectionStatusSchema, evidenceRefs: z.array(z.string()), notes: z.array(z.string()) }),
      budgets: z.object({ status: binderSectionStatusSchema, evidenceRefs: z.array(z.string()), notes: z.array(z.string()) }),
      truthguard: z.object({ status: binderSectionStatusSchema, evidenceRefs: z.array(z.string()), notes: z.array(z.string()) })
    }),
    assurance: z.object({
      lastCert: z.object({
        status: z.enum(["PASS", "FAIL", "INSUFFICIENT_EVIDENCE"]).nullable(),
        certSha256: z.string().length(64).nullable().optional(),
        issuedTs: z.number().int().nullable().optional()
      }),
      riskAssuranceScore: z.number().min(0).max(100).nullable().optional(),
      topFindings: z.array(z.object({ category: z.string(), severity: z.string(), evidenceRefs: z.array(z.string()) })).default([]),
      notes: z.array(z.string()).default([])
    }),
    supplyChainIntegrity: z.object({
      plugins: z.object({ status: binderSectionStatusSchema, evidenceRefs: z.array(z.string()), notes: z.array(z.string()) }),
      releases: z.object({ status: binderSectionStatusSchema, evidenceRefs: z.array(z.string()), notes: z.array(z.string()) }),
      backupsRestoreDrills: z.object({ status: binderSectionStatusSchema, evidenceRefs: z.array(z.string()), notes: z.array(z.string()) })
    }),
    recurrence: z.object({
      diagnosticCadence: z.object({ configuredHours: z.number().nullable(), lastRunTs: z.number().nullable(), nextRunTs: z.number().nullable(), status: z.string() }),
      forecastCadence: z.object({ configuredHours: z.number().nullable(), lastRunTs: z.number().nullable(), nextRunTs: z.number().nullable(), status: z.string() }),
      assuranceCadence: z.object({ configuredHours: z.number().nullable(), lastRunTs: z.number().nullable(), nextRunTs: z.number().nullable(), status: z.string() }),
      benchCadence: z.object({ configuredDays: z.number().nullable(), lastRunTs: z.number().nullable(), nextRunTs: z.number().nullable(), status: z.string() })
    }),
    controls: binderControlsSectionSchema,
    /**
     * P1-16: the agent's newest conformance run that verified under pinned trust, with the digests of the allowlisted
     * copies the binder carries (checks/conformance-run.json, summaries/conformance-run.md); status null when none did.
     * Optional for older binders.
     */
    conformanceRun: z.object({
      status: conformanceStatusSchema.nullable(),
      conformanceRunId: z.string().min(1).nullable(),
      station: z.string().min(1).nullable(),
      counts: z.object({ total: z.number().int(), pass: z.number().int(), fail: z.number().int(), notEvaluated: z.number().int() }).nullable(),
      reportJsonSha256: z.string().length(64).nullable(),
      checkSha256: z.string().length(64).nullable(),
      summarySha256: z.string().length(64).nullable(),
      notes: z.array(z.string()).default([])
    }).optional()
  }),
  proofBindings: z.object({
    transparencyRootSha256: z.string().length(64),
    merkleRootSha256: z.string().length(64),
    includedEventProofIds: z.array(z.string()),
    calculationManifestSha256: z.string().length(64)
  })
});

export type AuditBinderJson = z.infer<typeof binderJsonSchema>;

export const binderSignatureSchema = z.object({
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

export const binderPiiFindingSchema = z.object({
  severity: z.enum(["HIGH", "MEDIUM", "LOW"]),
  type: z.enum(["EMAIL", "URL", "FILE_PATH", "TOKEN", "PRIVATE_KEY", "FREE_TEXT"]),
  path: z.string().min(1),
  snippetRedacted: z.string().min(1)
});

export const binderPiiScanSchema = z.object({
  v: z.literal(1),
  status: z.enum(["PASS", "FAIL"]),
  findings: z.array(binderPiiFindingSchema)
});
