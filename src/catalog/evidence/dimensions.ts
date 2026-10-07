import type { Applicability, Enforcement, EvidenceState, ResultState, ReviewState } from "../../claims/eligibility/types.js";
import type { TrustTier } from "../../types.js";
import type { EnforcementPoint } from "../types.js";
import type { EvaluableControl, EvaluationContext, EvidenceItem, RejectionReason, ResultReview } from "./types.js";

/**
 * The status dimension rules of docs/catalog/CONTROL_RECORD.md ("Status dimensions"). Each reads only the items this
 * evaluation admitted or rejected, never a stored status or a report-wide total. Each rule that withholds a pass says
 * why in `reasons`.
 */
export interface AdmittedItem { item: EvidenceItem; trustTier: TrustTier }
export interface RejectedItem { item: EvidenceItem; reason: RejectionReason; detail: string }

/** The producers whose allow and deny records come from each enforcement point. */
const POINT_PRODUCERS: Record<EnforcementPoint, readonly string[]> = {
  tool_pipeline: ["amc.toolPipeline.guard", "amc.toolPipeline.receipt"],
  approvals: ["amc.approvals.engine"],
  egress: ["amc.gateway.egress"],
  deletion_executor: []
};
const TRUST_FAILURES: ReadonlySet<RejectionReason> = new Set(["producer_not_admitted", "producer_unverified", "cross_tenant"]);

export const isObservedTier = (tier: TrustTier): boolean => tier === "OBSERVED" || tier === "OBSERVED_HARDENED";

export function decideApplicability(ctx: EvaluationContext): Applicability {
  return ctx.plan?.applicability ?? { state: "unresolved", reason: "no compiled plan decides this control's applicability yet" };
}

function contradiction(admitted: readonly AdmittedItem[]): string | null {
  const seen = new Map<string, string>();
  for (const { item } of admitted) {
    const key = item.attributes.observationKey;
    const value = item.attributes.observation;
    if (typeof key !== "string" || value === undefined) continue;
    const prior = seen.get(key);
    if (prior !== undefined && prior !== String(value)) return `admitted records disagree on ${key} (${prior} and ${String(value)})`;
    seen.set(key, String(value));
  }
  return null;
}

/** First match wins: contradictory, untrusted, stale, incomplete, sufficient. */
export function decideEvidence(record: EvaluableControl, admitted: readonly AdmittedItem[], rejected: readonly RejectedItem[],
  reasons: string[]): EvidenceState {
  const disagreement = contradiction(admitted);
  if (disagreement) {
    reasons.push(disagreement);
    return "contradictory";
  }
  if (admitted.length === 0 && rejected.some((row) => TRUST_FAILURES.has(row.reason))) {
    reasons.push("records exist, but none came from an admitted, verified producer of this tenant");
    return "untrusted";
  }
  for (const contract of record.evidence) {
    const own = admitted.filter(({ item }) => item.producerId === contract.producer);
    const min = contract.minObservedRatio ?? 0;
    const ratio = own.length === 0 ? 1 : own.filter((row) => isObservedTier(row.trustTier)).length / own.length;
    if (ratio < min) {
      reasons.push(`Observed trust ratio ${ratio.toFixed(3)} is below required ${min.toFixed(3)} (${contract.id})`);
      return "untrusted";
    }
  }
  const short = record.evidence.filter((contract) =>
    admitted.filter(({ item }) => item.producerId === contract.producer).length < (contract.sampling.minItems ?? 1));
  for (const contract of short) reasons.push(`${contract.id}: fewer than ${contract.sampling.minItems ?? 1} admitted records in the window`);
  if (short.some((contract) => rejected.some((row) => row.reason === "stale" && row.item.producerId === contract.producer))) return "stale";
  return short.length > 0 ? "incomplete" : "sufficient";
}

/** A trusted violation is a failure whatever the evidence; a violation that was not admitted still blocks a pass. */
export function decideResult(applicability: Applicability, evidence: EvidenceState, admitted: readonly AdmittedItem[],
  rejected: readonly RejectedItem[], reasons: string[]): ResultState {
  if (admitted.some(({ item }) => item.verdict === "violates")) return "fail";
  const unadmitted = rejected.filter(({ item }) => item.verdict === "violates");
  if (unadmitted.length > 0) {
    reasons.push(`${unadmitted.length} violating record(s) were not admitted (${[...new Set(unadmitted.map((row) => row.reason))].join(", ")}); the control cannot pass`);
    return "not_evaluated";
  }
  if (applicability.state === "unresolved") reasons.push(`not evaluated: ${applicability.reason}`);
  if (applicability.state === "not_applicable") reasons.push(`not evaluated: not applicable (${applicability.rationale})`);
  return applicability.state === "applicable" && evidence === "sufficient" ? "pass" : "not_evaluated";
}

/** Enforced only on admitted allow or deny records from the control's binding point under the plan's policy digest. */
export function decideEnforcement(record: EvaluableControl, ctx: EvaluationContext, admitted: readonly AdmittedItem[]): Enforcement {
  const plan = ctx.plan;
  if (record.binding.kind === "enforcement_point" && plan) {
    if (plan.mode === "warn") return { state: "advisory" };
    const point = record.binding.points.find((candidate) => admitted.some(({ item }) =>
      POINT_PRODUCERS[candidate].includes(item.producerId) && item.binding.policyDigest === plan.policyDigest
      && (item.attributes.decision === "allow" || item.attributes.decision === "deny")));
    if (point) return { state: "enforced", boundary: point };
  }
  return admitted.length > 0 ? { state: "observed" } : { state: "none" };
}

/** A rejection wins over an approval; an approval past `expiresAt` is expired. */
export function decideReview(reviews: readonly ResultReview[], digest: string, nowMs: number): ReviewState {
  const own = reviews.filter((review) => review.resultDigest === digest);
  if (own.some((review) => review.decision === "rejected")) return "rejected";
  const approved = own.filter((review) => review.decision === "approved");
  if (approved.some((review) => Date.parse(review.expiresAt) > nowMs)) return "approved";
  return approved.length > 0 ? "expired" : "pending";
}
