import { z } from "zod";
import { timeEvidenceSchema, type TimeEvidence, type TimeFinding } from "../time/timeEvidence.js";
import { amcVersion } from "../version.js";
import { admitKey, issuerAdmissionSchema, type IssuerAdmission } from "./admission.js";
import type { TrustContext } from "./trustContext.js";

const dimensionStatus = z.enum(["pass", "fail", "not-evaluated"]);
const reasons = z.strictObject({ status: dimensionStatus, reasons: z.array(z.string()) });
const anchoringSchema = z.strictObject({ status: z.enum(["anchored", "unanchored", "not-applicable"]), detail: z.string().nullable() });

/**
 * One report for every verifier. Scope, freshness, completeness and satisfaction stay "not-evaluated" until P1-06,
 * except that freshness fails on a claimed time outside the attested window and states the time basis (P1-25).
 */
export const verifierReportSchema = z.strictObject({
  type: z.literal("amc.verifier-report"),
  version: z.literal(1),
  artifact: z.strictObject({ kind: z.string(), path: z.string(), sha256: z.string() }),
  verifier: z.strictObject({ name: z.literal("agent-maturity-compass"), version: z.string() }),
  verifiedAt: z.string(),
  asOf: z.string(),
  integrity: z.strictObject({ status: dimensionStatus, errors: z.array(z.string()) }),
  issuerAdmission: z.strictObject({ status: dimensionStatus, signatures: z.array(issuerAdmissionSchema) }),
  anchoring: anchoringSchema,
  /** P1-25: the artifact's claimed time and, when a pinned TSA's token verified, its attested time. */
  time: timeEvidenceSchema.optional(),
  scope: reasons,
  freshness: reasons,
  completeness: reasons,
  satisfaction: reasons,
  trusted: z.boolean(),
  overrides: z.array(z.enum(["allow-unpinned", "allow-unanchored"])),
  warnings: z.array(z.string())
});
export type VerifierReportV1 = z.infer<typeof verifierReportSchema>;

export interface VerifierReportInput {
  artifact: VerifierReportV1["artifact"];
  context: TrustContext;
  integrityErrors: readonly string[];
  signatures: readonly IssuerAdmission[];
  anchoring: VerifierReportV1["anchoring"];
  warnings?: readonly string[];
  verifiedAt?: Date;
  time?: { evidence: TimeEvidence; findings: readonly TimeFinding[] };
}

/** trusted = integrity passes, every signature is admitted and the ledger is not unanchored. Allow flags never make it true. */
export function buildVerifierReport(input: VerifierReportInput): VerifierReportV1 {
  const notEvaluated = { status: "not-evaluated" as const, reasons: [] };
  const integrity = input.integrityErrors.length ? "fail" : "pass";
  const issuer = input.signatures.length === 0 ? "not-evaluated"
    : input.signatures.every(signature => signature.status === "admitted") ? "pass" : "fail";
  const overrides: VerifierReportV1["overrides"] = [];
  if (input.signatures.some(signature => signature.status === "unpinned-allowed")) overrides.push("allow-unpinned");
  if (input.anchoring.status === "unanchored" && input.context.allowUnanchored) overrides.push("allow-unanchored");
  const warnings = [...(input.warnings ?? []), ...(input.time?.findings ?? [])
    .map(finding => `${finding}: claimed time ${input.time?.evidence.claimedAt} lies outside the attested window`)];
  const freshness = input.time
    ? { status: input.time.findings.length ? "fail" as const : "not-evaluated" as const, reasons: [`basis: ${input.time.evidence.basis}`, ...input.time.findings] }
    : notEvaluated;
  if (input.context.mode === "workspace-self") {
    warnings.push("workspace-self: keys were read from the workspace being verified; this is a self-check, not independent verification");
  }
  return {
    type: "amc.verifier-report", version: 1, artifact: input.artifact,
    verifier: { name: "agent-maturity-compass", version: amcVersion },
    verifiedAt: (input.verifiedAt ?? new Date()).toISOString(), asOf: input.context.asOf.toISOString(),
    integrity: { status: integrity, errors: [...input.integrityErrors] },
    issuerAdmission: { status: issuer, signatures: [...input.signatures] },
    anchoring: input.anchoring,
    ...(input.time ? { time: input.time.evidence } : {}),
    scope: notEvaluated, freshness, completeness: notEvaluated, satisfaction: notEvaluated,
    trusted: integrity === "pass" && issuer === "pass" && input.anchoring.status !== "unanchored",
    overrides, warnings
  };
}

/**
 * Exit codes for every verify command: 0 trusted; 2 integrity verified but untrusted only because an allow flag was
 * used (the caller prints "UNTRUSTED:" on stderr); 1 for everything else.
 */
export function verdictExitCode(report: VerifierReportV1): 0 | 1 | 2 {
  if (report.trusted) return 0;
  const onlyOverrides = report.integrity.status === "pass"
    && report.issuerAdmission.signatures.every(signature => signature.status === "admitted" || signature.status === "unpinned-allowed")
    && (report.anchoring.status !== "unanchored" || report.overrides.includes("allow-unanchored"));
  return onlyOverrides && report.overrides.length > 0 ? 2 : 1;
}

/** One line per reason the report is not trusted: integrity errors, refused signatures and an unanchored ledger. */
export function untrustedReasons(report: VerifierReportV1): string[] {
  return [
    ...report.integrity.errors,
    ...report.issuerAdmission.signatures.filter(signature => signature.status !== "admitted")
      .map(signature => `${signature.signature} (${signature.purpose}): ${signature.status}${signature.detail ? ` — ${signature.detail}` : ""}`),
    ...(report.anchoring.status === "unanchored" ? [`ledger UNANCHORED: ${report.anchoring.detail ?? "the monitor key is not pinned"}`] : [])
  ];
}

/**
 * P0-51: an artifact that names no signer (an unkeyed hash, or an HMAC under a shared secret) has no issuer to admit.
 * admitKey refuses the missing key as not-pinned whatever the flags, so the report is never trusted and exits 1.
 */
export function unsignedArtifactReport(artifact: VerifierReportV1["artifact"], trust: TrustContext, integrityErrors: readonly string[],
  signature: string): VerifierReportV1 {
  return buildVerifierReport({ artifact, context: trust, integrityErrors, anchoring: { status: "not-applicable", detail: null },
    signatures: [admitKey({ publicKeyPem: null, purpose: "artifact-seal", signature, context: trust })] });
}
