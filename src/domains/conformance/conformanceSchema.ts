import { z } from "zod";

/**
 * Conformance run — the composed, sealed result of one station's
 * sector-pack assessment, required assurance packs and scenario packs.
 *
 * Every requirement carries an explicit status and the evidence ids it
 * resolved to. The overall status is a function of those statuses only; there
 * is no score, percentage or weighted average anywhere in this artifact,
 * because an average is how NOT_EVALUATED disappears.
 */

export const conformanceStationSchema = z.enum([
  "health",
  "education",
  "environment",
  "mobility",
  "governance",
  "technology",
  "wealth"
]);

export const conformanceRequirementStatusSchema = z.enum(["PASS", "FAIL", "NOT_EVALUATED"]);

export const conformanceStatusSchema = z.enum(["REQUIREMENTS_MET", "REQUIREMENTS_NOT_MET"]);

export const conformanceRequirementKindSchema = z.enum([
  "industry-pack-question",
  "domain-question",
  "assurance-pack",
  "scenario-pack"
]);

export const conformanceEvidenceRefSchema = z.object({
  kind: z.enum(["assurance-run", "ledger-session", "ledger-event", "pack-response"]),
  id: z.string().min(1)
});

export const conformanceRequirementSchema = z.object({
  id: z.string().min(1),
  kind: conformanceRequirementKindSchema,
  title: z.string().min(1),
  /** Where the requirement comes from (registry file, pack id, profile id). */
  source: z.string().min(1),
  regulatoryRef: z.string().min(1).optional(),
  /** What a PASS means for this requirement, in words. */
  criterion: z.string().min(1),
  status: conformanceRequirementStatusSchema,
  /** What was measured (e.g. "L4", "3/3 scenarios passed"); null when nothing was. */
  observed: z.string().nullable(),
  reason: z.string().min(1),
  evidence: z.array(conformanceEvidenceRefSchema)
});

export const conformanceAssuranceInputSchema = z.object({
  assuranceRunId: z.string().min(1),
  sessionId: z.string().min(1),
  reportJsonSha256: z.string().length(64),
  ts: z.number().int(),
  packIds: z.array(z.string().min(1))
});

export const conformanceRefusedInputSchema = z.object({
  source: z.string().min(1),
  reason: z.string().min(1)
});

export const conformanceProfileRefSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1)
});

export const conformanceEnvironmentSchema = z.object({
  platform: z.string().min(1),
  arch: z.string().min(1),
  node: z.string().min(1)
});

export const conformanceCountsSchema = z.object({
  total: z.number().int().min(0),
  pass: z.number().int().min(0),
  fail: z.number().int().min(0),
  notEvaluated: z.number().int().min(0)
});

export const conformanceExportSchema = z.object({
  schema: z.literal("amc.conformance-run/1"),
  conformanceRunId: z.string().min(1),
  station: conformanceStationSchema,
  agentId: z.string().min(1),
  generatedTs: z.number().int(),
  /** Full git sha of the AMC source that produced the run, or "unknown". */
  sourceCommit: z.string().min(1),
  sourceCommitResolution: z.string().min(1),
  environment: conformanceEnvironmentSchema,
  profile: conformanceProfileRefSchema.nullable(),
  status: conformanceStatusSchema,
  counts: conformanceCountsSchema,
  failedRequirementIds: z.array(z.string().min(1)),
  notEvaluatedRequirementIds: z.array(z.string().min(1)),
  requirements: z.array(conformanceRequirementSchema),
  inputs: z.object({
    assuranceRuns: z.array(conformanceAssuranceInputSchema),
    packResponseCount: z.number().int().min(0)
  }),
  refusedInputs: z.array(conformanceRefusedInputSchema),
  /** Seal fields, named as the diagnostic/assurance seal names them so `sealedRunReportVerifies` applies unchanged. */
  reportJsonSha256: z.string(),
  runSealSig: z.string()
});

export type ConformanceStation = z.infer<typeof conformanceStationSchema>;
export type ConformanceRequirementStatus = z.infer<typeof conformanceRequirementStatusSchema>;
export type ConformanceStatus = z.infer<typeof conformanceStatusSchema>;
export type ConformanceRequirementKind = z.infer<typeof conformanceRequirementKindSchema>;
export type ConformanceEvidenceRef = z.infer<typeof conformanceEvidenceRefSchema>;
export type ConformanceRequirement = z.infer<typeof conformanceRequirementSchema>;
export type ConformanceAssuranceInput = z.infer<typeof conformanceAssuranceInputSchema>;
export type ConformanceRefusedInput = z.infer<typeof conformanceRefusedInputSchema>;
export type ConformanceProfileRef = z.infer<typeof conformanceProfileRefSchema>;
export type ConformanceEnvironment = z.infer<typeof conformanceEnvironmentSchema>;
export type ConformanceCounts = z.infer<typeof conformanceCountsSchema>;
export type ConformanceExport = z.infer<typeof conformanceExportSchema>;
