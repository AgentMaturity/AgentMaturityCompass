/**
 * The shared verifier report (AMC's VerifierReportV1, spec/schemas/v1/verifier-report): six separate results, never one
 * merged verdict. `reasonCodes` carries the normative codes per dimension; `errors` and `reasons` say the same in words.
 */
import { readFileSync } from "node:fs";
import { DIMENSIONS, type Dimension, type DimensionStatus, type Finding, type ReasonCode } from "./codes.js";
import type { DimResult, Evaluation } from "./evaluation.js";
import type { IssuerAdmission } from "./trust.js";

export const VERIFIER_NAME = "amc-verify";
export const VERIFIER_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
})();

type Reasons = { status: DimensionStatus; reasons: string[] };

export interface VerifierReport {
  type: "amc.verifier-report";
  version: 1;
  artifact: { kind: string; path: string; sha256: string };
  verifier: { name: string; version: string };
  verifiedAt: string;
  asOf: string;
  integrity: { status: DimensionStatus; errors: string[] };
  issuerAdmission: { status: DimensionStatus; signatures: IssuerAdmission[] };
  anchoring: { status: "anchored" | "unanchored" | "not-applicable"; detail: string | null };
  time?: { claimedAt: string; attested: null; basis: "claimed" };
  scope: Reasons;
  freshness: Reasons;
  completeness: Reasons;
  satisfaction: Reasons;
  reasonCodes: { [D in Dimension]: ReasonCode<D>[] };
  trusted: boolean;
  overrides: never[];
  warnings: string[];
}

const words = (findings: readonly Finding[]) => findings.map(finding => `${finding.code}: ${finding.detail}`);
const codes = <D extends Dimension>(findings: readonly Finding<D>[]) => [...new Set(findings.map(finding => finding.code))];
const skipped = <D extends Dimension>(why: string): DimResult<D> => ({ status: "not-evaluated", findings: [], note: why });

/**
 * Integrity first: anything it did not pass leaves the rest unread, except issuer admission when only a signer's key
 * was missing. The statement of an issuer that is not admitted is not evaluated. Satisfaction runs only when the other
 * five pass.
 */
export function buildReport(input: { evaluation: Evaluation; path: string; sha256: string; asOf: Date; extraIntegrity: Finding<"integrity">[];
  ctxProblems: Finding<"issuerAdmission">[] }): VerifierReport {
  const { evaluation } = input;
  const integrityFindings = [...input.extraIntegrity, ...evaluation.integrity];
  const integrity: DimResult<"integrity"> = integrityFindings.length > 0 ? { status: "fail", findings: integrityFindings, note: null }
    : evaluation.unverifiable.length > 0 ? { status: "not-evaluated", findings: [], note: evaluation.unverifiable.join("; ") }
      : { status: "pass", findings: [], note: null };
  const issuerFindings = [...input.ctxProblems, ...evaluation.admissions.flatMap(admission => (admission.finding ? [admission.finding] : [])),
    ...evaluation.admissionFindings];
  if (evaluation.admissions.length === 0 && issuerFindings.length === 0) issuerFindings.push({ code: "ISSUER_NOT_PINNED", detail: "no signature to admit" });
  const issuer: DimResult<"issuerAdmission"> = integrity.status === "fail" ? skipped("integrity failed")
    : { status: issuerFindings.length > 0 ? "fail" : "pass", findings: issuerFindings, note: null };
  const gate = integrity.status !== "pass" ? "integrity did not pass" : issuer.status !== "pass" ? "the issuer is not admitted" : null;
  const scope = gate ? skipped<"scope">(gate) : evaluation.scope();
  const freshness = gate ? skipped<"freshness">(gate) : evaluation.freshness();
  const completeness = gate ? skipped<"completeness">(gate) : evaluation.completeness();
  const others = [integrity, issuer, scope, freshness, completeness];
  const satisfaction = others.every(dim => dim.status === "pass") ? evaluation.satisfaction()
    : skipped<"satisfaction">("evaluated only when the other five dimensions pass");
  const all = { integrity, issuerAdmission: issuer, scope, freshness, completeness, satisfaction };
  const reasons = (dim: DimResult<Dimension>): Reasons => ({ status: dim.status, reasons: dim.findings.length ? words(dim.findings) : dim.note ? [dim.note] : [] });
  return {
    type: "amc.verifier-report", version: 1,
    artifact: { kind: evaluation.kind, path: input.path, sha256: input.sha256 },
    verifier: { name: VERIFIER_NAME, version: VERIFIER_VERSION },
    verifiedAt: new Date().toISOString(), asOf: input.asOf.toISOString(),
    integrity: { status: integrity.status, errors: words(integrity.findings).concat(integrity.status === "not-evaluated" && integrity.note ? [integrity.note] : []) },
    issuerAdmission: { status: issuer.status, signatures: evaluation.admissions.map(admission => admission.record) },
    anchoring: evaluation.anchoring,
    ...(evaluation.claimedAt === null ? {} : { time: { claimedAt: evaluation.claimedAt, attested: null, basis: "claimed" as const } }),
    scope: reasons(scope), freshness: reasons(freshness), completeness: reasons(completeness), satisfaction: reasons(satisfaction),
    reasonCodes: Object.fromEntries(DIMENSIONS.map(dimension => [dimension, codes(all[dimension].findings)])) as VerifierReport["reasonCodes"],
    trusted: integrity.status === "pass" && issuer.status === "pass" && evaluation.anchoring.status !== "unanchored",
    overrides: [],
    warnings: [...evaluation.warnings]
  };
}

/** 0 every dimension passes; 1 any fails; 3 none fails and at least one is not evaluated. */
export function exitCode(report: VerifierReport): 0 | 1 | 3 {
  const statuses = DIMENSIONS.map(dimension => report[dimension].status);
  return statuses.includes("fail") ? 1 : statuses.includes("not-evaluated") ? 3 : 0;
}
