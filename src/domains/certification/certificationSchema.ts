import { z } from "zod";

/**
 * Industry certification run — the composed, sealed result of one station's
 * sector-pack assessment, required assurance packs and scenario packs.
 *
 * Every requirement carries an explicit status and the evidence ids it
 * resolved to. The overall status is a function of those statuses only; there
 * is no score, percentage or weighted average anywhere in this artifact,
 * because an average is how NOT_EVALUATED disappears.
 */

export const certificationStationSchema = z.enum([
  "health",
  "education",
  "environment",
  "mobility",
  "governance",
  "technology",
  "wealth"
]);

export const certificationRequirementStatusSchema = z.enum(["PASS", "FAIL", "NOT_EVALUATED"]);

export const certificationStatusSchema = z.enum(["CERTIFIED", "NOT_CERTIFIED"]);

export const certificationRequirementKindSchema = z.enum([
  "industry-pack-question",
  "domain-question",
  "assurance-pack",
  "scenario-pack"
]);

export const certificationEvidenceRefSchema = z.object({
  kind: z.enum(["assurance-run", "ledger-session", "ledger-event", "pack-response"]),
  id: z.string().min(1)
});

export const certificationRequirementSchema = z.object({
  id: z.string().min(1),
  kind: certificationRequirementKindSchema,
  title: z.string().min(1),
  /** Where the requirement comes from (registry file, pack id, profile id). */
  source: z.string().min(1),
  regulatoryRef: z.string().min(1).optional(),
  /** What a PASS means for this requirement, in words. */
  criterion: z.string().min(1),
  status: certificationRequirementStatusSchema,
  /** What was measured (e.g. "L4", "3/3 scenarios passed"); null when nothing was. */
  observed: z.string().nullable(),
  reason: z.string().min(1),
  evidence: z.array(certificationEvidenceRefSchema)
});

export const certificationAssuranceInputSchema = z.object({
  assuranceRunId: z.string().min(1),
  sessionId: z.string().min(1),
  reportJsonSha256: z.string().length(64),
  ts: z.number().int(),
  packIds: z.array(z.string().min(1))
});

export const certificationRefusedInputSchema = z.object({
  source: z.string().min(1),
  reason: z.string().min(1)
});

export const certificationProfileRefSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1)
});

export const certificationEnvironmentSchema = z.object({
  platform: z.string().min(1),
  arch: z.string().min(1),
  node: z.string().min(1)
});

export const certificationCountsSchema = z.object({
  total: z.number().int().min(0),
  pass: z.number().int().min(0),
  fail: z.number().int().min(0),
  notEvaluated: z.number().int().min(0)
});

export const certificationExportSchema = z.object({
  v: z.literal(1),
  certificationRunId: z.string().min(1),
  station: certificationStationSchema,
  agentId: z.string().min(1),
  generatedTs: z.number().int(),
  /** Full git sha of the AMC source that produced the run, or "unknown". */
  sourceCommit: z.string().min(1),
  sourceCommitResolution: z.string().min(1),
  environment: certificationEnvironmentSchema,
  profile: certificationProfileRefSchema.nullable(),
  status: certificationStatusSchema,
  counts: certificationCountsSchema,
  failedRequirementIds: z.array(z.string().min(1)),
  notEvaluatedRequirementIds: z.array(z.string().min(1)),
  requirements: z.array(certificationRequirementSchema),
  inputs: z.object({
    assuranceRuns: z.array(certificationAssuranceInputSchema),
    packResponseCount: z.number().int().min(0)
  }),
  refusedInputs: z.array(certificationRefusedInputSchema),
  /** Seal fields, named as the diagnostic/assurance seal names them so `sealedRunReportVerifies` applies unchanged. */
  reportJsonSha256: z.string(),
  runSealSig: z.string()
});

export type CertificationStation = z.infer<typeof certificationStationSchema>;
export type CertificationRequirementStatus = z.infer<typeof certificationRequirementStatusSchema>;
export type CertificationStatus = z.infer<typeof certificationStatusSchema>;
export type CertificationRequirementKind = z.infer<typeof certificationRequirementKindSchema>;
export type CertificationEvidenceRef = z.infer<typeof certificationEvidenceRefSchema>;
export type CertificationRequirement = z.infer<typeof certificationRequirementSchema>;
export type CertificationAssuranceInput = z.infer<typeof certificationAssuranceInputSchema>;
export type CertificationRefusedInput = z.infer<typeof certificationRefusedInputSchema>;
export type CertificationProfileRef = z.infer<typeof certificationProfileRefSchema>;
export type CertificationEnvironment = z.infer<typeof certificationEnvironmentSchema>;
export type CertificationCounts = z.infer<typeof certificationCountsSchema>;
export type CertificationExport = z.infer<typeof certificationExportSchema>;
