import { z } from "zod";
import { amcVersion } from "../version.js";
import { issuerAdmissionSchema, type IssuerAdmission } from "./admission.js";
import type { TrustContext } from "./trustContext.js";

const dimensionStatus = z.enum(["pass", "fail", "not-evaluated"]);
const reasons = z.strictObject({ status: dimensionStatus, reasons: z.array(z.string()) });
const anchoringSchema = z.strictObject({ status: z.enum(["anchored", "unanchored", "not-applicable"]), detail: z.string().nullable() });

/** One report for every verifier. Scope, freshness, completeness and satisfaction stay "not-evaluated" until P1-06. */
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
  const warnings = [...(input.warnings ?? [])];
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
    scope: notEvaluated, freshness: notEvaluated, completeness: notEvaluated, satisfaction: notEvaluated,
    trusted: integrity === "pass" && issuer === "pass" && input.anchoring.status !== "unanchored",
    overrides, warnings
  };
}
