import { signatureEnvelopeSchema } from "../crypto/signing/signatureEnvelope.js";
import { z } from "zod";
import { evidenceCoverageSchema, fiveLayersSchema, valueDimensionFields } from "../bench/benchSchema.js";

export const passportScopeTypeSchema = z.enum(["WORKSPACE", "NODE", "AGENT"]);
export const passportTrustLabelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const passportStatusLabelSchema = z.enum(["VERIFIED", "INFORMATIONAL", "UNTRUSTED"]);
export const passportMaturityStatusSchema = z.enum(["OK", "INSUFFICIENT_EVIDENCE"]);

export const passportGovernanceStatusSchema = z.enum(["PASS", "FAIL", "UNKNOWN"]);
export const passportPromptEnforcementSchema = z.enum(["ON", "OFF", "UNKNOWN"]);
export const passportTruthguardModeSchema = z.enum(["ENFORCE", "WARN", "OFF", "UNKNOWN"]);

/**
 * Who stands behind a passport. Today every passport is self-issued: the workspace signs, with its own auditor key, a
 * summary of its own agent, and its time is the signing machine's clock. The signature shows who wrote it and that it is
 * unchanged, not that its figures are true; nobody outside the workspace checked them. The evidence mix is
 * `trust.evidenceCoverage`. Absent on passports made before 2026-11-16; readers then show it as unknown.
 */
export const passportIssuanceSchema = z.object({
  issuerRelationship: z.literal("self"),
  selfIssued: z.literal(true),
  /** generatedTs and expiresTs come from the signing machine's own clock; no trusted timestamp vouches for them. */
  timeBasis: z.literal("claimed"),
  /** VERIFIED means the workspace's own passport gates passed, not that anyone outside checked the passport. */
  statusBasis: z.literal("workspace-own-gates"),
  /** The signed revocation list that would name this passport if it were revoked (`amc keys revoke --passport`). */
  revocationListId: z.string().regex(/^passports:[a-z0-9][a-z0-9:._-]{0,117}$/)
});

const questionScoreRowsSchema = z.array(z.object({
  qIdHash: z.string().regex(/^q_[a-f0-9]{8,64}$/),
  score: z.number().min(0).max(5)
}));

export const passportJsonSchema = z.object({
  v: z.literal(1),
  passportId: z.string().regex(/^pass_[A-Za-z0-9_-]{8,}$/),
  generatedTs: z.number().int(),
  expiresTs: z.number().int().optional(),
  scope: z.object({
    type: passportScopeTypeSchema,
    idHash: z.string().regex(/^[a-f0-9]{8,64}$/)
  }),
  /** A trust signal AMC did not measure (no trusted run, no receipted trace, no evidence mix) is null, never 0. */
  trust: z.object({
    integrityIndex: z.number().min(0).max(1).nullable(),
    correlationRatio: z.number().min(0).max(1).nullable(),
    trustLabel: passportTrustLabelSchema,
    evidenceCoverage: evidenceCoverageSchema,
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
    byFiveLayers: fiveLayersSchema,
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
        sourceRefs: z.array(z.string().min(1)),
        sourceRefCount: z.number().int().min(0).optional(),
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
    /** One row per question in the bank the run used (its size varies), hashed ids only. */
    questionScores: questionScoreRowsSchema.optional(),
    /** The old name of questionScores, still read so older passports keep verifying; new passports never write it. */
    questionScores42: questionScoreRowsSchema.optional()
  }),
  strategyFailureRisks: z.object({
    ecosystemFocusRisk: z.number().min(0).max(100).nullable(),
    clarityPathRisk: z.number().min(0).max(100).nullable(),
    economicSignificanceRisk: z.number().min(0).max(100).nullable(),
    riskAssuranceRisk: z.number().min(0).max(100).nullable(),
    digitalDualityRisk: z.number().min(0).max(100).nullable()
  }),
  valueDimensions: z.object({ ...valueDimensionFields, valueScore: z.number().min(0).max(100).nullable() }),
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
  }),
  issuance: passportIssuanceSchema.optional()
});

export function selfIssuance(revocationListId: string): z.infer<typeof passportIssuanceSchema> {
  return { issuerRelationship: "self", selfIssued: true, timeBasis: "claimed", statusBasis: "workspace-own-gates", revocationListId };
}

/** The words a person reads for a passport status: VERIFIED is the workspace's own check, never an outside one. */
export function passportStatusWords(label: z.infer<typeof passportStatusLabelSchema>): string {
  if (label === "VERIFIED") return "VERIFIED by this workspace's own checks (self-issued: nobody outside checked it)";
  if (label === "INFORMATIONAL") return "INFORMATIONAL (for information only: some checks were not met)";
  return "UNTRUSTED";
}

/** The passport's evidence mix in words: how much of the evidence AMC observed, others attested, or was self-reported. */
export function passportEvidenceMixWords(passport: Pick<PassportJson, "trust">): string {
  const mix = passport.trust.evidenceCoverage;
  if (mix === null) return "not measured";
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  return `${pct(mix.observedShare)} observed by AMC, ${pct(mix.attestedShare)} attested by others, ${pct(mix.selfReportedShare)} self-reported`;
}

export const passportSignatureSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: signatureEnvelopeSchema.optional()
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

/** What `passport create` and `passport verify` print about who stands behind a passport. */
export function passportIssuanceLines(passport: PassportJson): string[] {
  return [
    `status: ${passportStatusWords(passport.status.label)}`,
    `evidence mix: ${passportEvidenceMixWords(passport)}`,
    passport.issuance?.selfIssued === true
      ? "self-issued: this workspace signed it about its own agent, with its own clock. The signature shows who wrote it and that it is unchanged, not that it is true."
      : "issuer: not stated (a passport made before 2026-11-16); treat it as self-issued."
  ];
}
