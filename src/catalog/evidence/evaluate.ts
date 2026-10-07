import { evaluateClaimEligibility } from "../../claims/eligibility/evaluate.js";
import type { EvidenceState } from "../../claims/eligibility/types.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { amcVersion } from "../../version.js";
import { digestOf } from "../digest.js";
import { admitEvidence, useKey, type Admission } from "./admission.js";
import {
  decideApplicability, decideEnforcement, decideEvidence, decideResult, decideReview, isObservedTier,
  type AdmittedItem, type RejectedItem
} from "./dimensions.js";
import type { ControlResult, EvaluableControl, EvaluationContext, EvidenceItem } from "./types.js";

const EVIDENCE_ORDER: readonly EvidenceState[] = ["sufficient", "incomplete", "stale", "contradictory", "untrusted"];
const worse = (a: EvidenceState, b: EvidenceState): EvidenceState => (EVIDENCE_ORDER.indexOf(b) > EVIDENCE_ORDER.indexOf(a) ? b : a);
const itemKey = (item: EvidenceItem): string => `${item.ref.kind}\u0000${item.ref.id}\u0000${item.producerId}`;

/**
 * Evaluates one control on the items its loader read and verified (P1-11). Deterministic: items are taken in ref order,
 * and `digest` covers the canonical result without `evaluatedAt`, which is this function's own clock. The claim kind
 * and the result come from P0-08's evaluateClaimEligibility, so they can only be as strong as its rules allow:
 * observed only when every admitted item derives OBSERVED, and never independently reviewed here.
 */
export function evaluateControl(record: EvaluableControl, items: readonly EvidenceItem[], ctx: EvaluationContext): ControlResult {
  const nowMs = Date.now();
  const uses = { key: useKey(record, ctx), seen: new Map<string, string>() };
  const admitted: AdmittedItem[] = [];
  const rejected: RejectedItem[] = [];
  for (const item of [...items].sort((a, b) => (itemKey(a) < itemKey(b) ? -1 : itemKey(a) > itemKey(b) ? 1 : 0))) {
    const contract = record.evidence.find((row) => row.producer === item.producerId);
    const decision: Admission = contract ? admitEvidence(item, contract, record, ctx, uses)
      : { admitted: false, reason: "producer_not_admitted", detail: `no evidence contract of ${record.id} names producer ${item.producerId}` };
    if (decision.admitted) admitted.push({ item, trustTier: decision.trustTier });
    else rejected.push({ item, reason: decision.reason, detail: decision.detail });
  }
  const reasons: string[] = [];
  if (admitted.length > 0) reasons.push(`${admitted.length} record(s) admitted`);
  for (const reason of [...new Set(rejected.map((row) => row.reason))]) {
    const rows = rejected.filter((row) => row.reason === reason);
    reasons.push(`${rows.length} record(s) rejected as ${reason}: ${rows[0]?.detail ?? ""}`);
  }
  const applicability = decideApplicability(ctx);
  const evidence = decideEvidence(record, admitted, rejected, reasons);
  const enforcement = decideEnforcement(record, ctx, admitted);
  const synthetic = admitted.some(({ item }) => ctx.producers.find((row) => row.id === item.producerId)?.maxClaimKind === "synthetic_example");
  const newest = admitted.reduce((max, { item }) => Math.max(max, Date.parse(item.recordedAt)), -Infinity);
  const envelope = evaluateClaimEligibility({
    producer: `catalog:${record.id}`,
    method: synthetic ? "synthetic" : "runtime_observation",
    regulated: true,
    proposed: { result: decideResult(applicability, evidence, admitted, rejected, reasons), level: null },
    evidence: {
      eventCount: admitted.length,
      tiers: admitted.length > 0 && admitted.every((row) => isObservedTier(row.trustTier)) ? ["OBSERVED"] : ["SELF_REPORTED"],
      newestTs: Number.isFinite(newest) ? newest : null,
      boundToControl: true, sameScope: true, contradictory: evidence === "contradictory", signatureValid: null, issuerPinned: null
    },
    evidenceRefs: admitted.map(({ item }) => item.ref.id),
    applicability,
    enforcement,
    now: nowMs
  });
  const base: Omit<ControlResult, "evaluatedAt" | "digest"> = {
    resultVersion: 1,
    controlId: record.id,
    controlVersion: record.version,
    controlDigest: digestOf(record),
    planDigest: ctx.plan?.digest ?? null,
    subject: { ...ctx.subject },
    window: { ...ctx.window },
    dimensions: { ...envelope.statusDimensions, evidence: worse(evidence, envelope.statusDimensions.evidence), review: "pending" },
    claimKind: envelope.claimKind,
    claimReasons: envelope.reasons,
    admitted: admitted.map(({ item, trustTier }) => ({ ref: { ...item.ref }, producerId: item.producerId, trustTier })),
    rejected: rejected.map(({ item, reason, detail }) => ({ ref: { ...item.ref }, reason, detail })),
    reasons,
    evaluator: { name: "amc", version: amcVersion }
  };
  const digest = sha256Hex(canonicalize(base));
  const review = decideReview(ctx.reviews, digest, nowMs);
  return { ...base, dimensions: { ...base.dimensions, review }, evaluatedAt: new Date(nowMs).toISOString(), digest };
}
