import type {
  Applicability,
  ClaimEligibilityInput,
  ClaimEnvelope,
  ClaimKind,
  ClaimMethod,
  ClaimReasonCode,
  EvidenceState,
  ResultState
} from "./types.js";

const WEAK_METHODS: ReadonlySet<ClaimMethod> = new Set(["keyword_match", "unkeyed_checksum", "path_presence"]);
const OBSERVING_METHODS: ReadonlySet<ClaimMethod> = new Set(["runtime_observation", "executed_test"]);
// When several evidence problems apply, the most serious one is reported.
const EVIDENCE_SEVERITY: readonly EvidenceState[] = ["sufficient", "incomplete", "stale", "contradictory", "untrusted"];

function worse(current: EvidenceState, next: EvidenceState): EvidenceState {
  return EVIDENCE_SEVERITY.indexOf(next) > EVIDENCE_SEVERITY.indexOf(current) ? next : current;
}

function capAtOne(level: number | null): number | null {
  return level === null ? null : Math.min(level, 1);
}

/**
 * Decides a result's claim kind, five status dimensions and eligible level.
 * Pure: no clock, filesystem or environment. The rules run in the order of
 * docs/CLAIM_KINDS.md and each records its reason code.
 */
export function evaluateClaimEligibility(input: ClaimEligibilityInput): ClaimEnvelope {
  const { method, regulated, evidence: ev } = input;
  const reasons: ClaimReasonCode[] = [];
  let result: ResultState = input.proposed.result;
  let level = input.proposed.level;
  let evidence: EvidenceState = "sufficient";
  let kind: ClaimKind | null = null;
  const blockPass = (code: ClaimReasonCode) => {
    if (result === "pass") result = "not_evaluated";
    reasons.push(code);
  };

  // 1. Synthetic values are not evidence.
  if (method === "synthetic") {
    kind = "synthetic_example";
    result = "not_evaluated";
    level = null;
    evidence = "incomplete";
    reasons.push("SYNTHETIC_VALUES");
  }
  // 2. Stored 1.x results were never verified.
  if (input.legacy) {
    kind ??= "self_reported";
    reasons.push("LEGACY_1X_UNVERIFIED");
  }
  // 3. An empty stream is never a pass and never a default score. A negative or NaN count is no evidence either.
  if (!(ev.eventCount > 0) && method !== "numeric_self_answer") {
    evidence = worse(evidence, "incomplete");
    result = "not_evaluated";
    level = null;
    reasons.push("EMPTY_EVIDENCE");
  }
  // 4. Numeric self-answers: level 1 at most, never a positive regulated status.
  // An answer is not evidence, so the evidence dimension stays incomplete.
  if (method === "numeric_self_answer") {
    kind ??= "self_reported";
    evidence = worse(evidence, "incomplete");
    if (regulated && result === "pass") blockPass("SELF_REPORTED_NO_POSITIVE_STATUS");
    if (level !== null && level > 1) reasons.push("SELF_REPORTED_LEVEL_CAP");
    level = capAtOne(level);
  }
  // 5. Weak methods: level 1 at most, never a positive regulated status.
  if (WEAK_METHODS.has(method)) {
    if ((regulated && result === "pass") || (level !== null && level > 1)) reasons.push("WEAK_METHOD");
    if (regulated && result === "pass") result = "not_evaluated";
    level = capAtOne(level);
  }
  // 6. Untrusted, contradictory or stale evidence cannot carry a pass.
  if (ev.signatureValid === false) {
    evidence = worse(evidence, "untrusted");
    blockPass("SIGNATURE_INVALID");
  }
  if (ev.sameScope === false) {
    evidence = worse(evidence, "untrusted");
    blockPass("CROSS_SCOPE_EVIDENCE");
  }
  if (ev.contradictory) {
    evidence = worse(evidence, "contradictory");
    blockPass("CONTRADICTORY_EVIDENCE");
  }
  // With a freshness bound, an unknown or future-dated (replayed or forged) timestamp is not fresh.
  if (ev.maxAgeMs !== undefined
    && !(ev.newestTs !== null && ev.newestTs <= input.now && input.now - ev.newestTs <= ev.maxAgeMs)) {
    evidence = worse(evidence, "stale");
    blockPass("STALE_EVIDENCE");
  }
  // 7. Coincidental event types from another control decide nothing, pass or fail.
  if (regulated && ev.boundToControl === false) {
    result = "not_evaluated";
    reasons.push("UNBOUND_EVIDENCE");
  }
  // 8. Kind for everything else.
  if (kind === null) kind = decideKind(input, reasons);
  // 9. Applicability.
  const applicability: Applicability = input.applicability
    ?? (regulated ? { state: "unresolved", reason: "no applicability decision recorded" } : { state: "applicable" });
  if (applicability.state === "not_applicable") {
    result = "not_evaluated";
    reasons.push("NOT_APPLICABLE");
  } else if (applicability.state === "unresolved") {
    blockPass("APPLICABILITY_UNRESOLVED");
  }

  return {
    claimKind: kind,
    statusDimensions: {
      applicability,
      evidence,
      result,
      enforcement: input.enforcement ?? { state: "none" },
      review: input.review?.state ?? "pending"
    },
    provenance: {
      producer: input.producer,
      method,
      evidenceRefs: [...(input.evidenceRefs ?? [])],
      ...(input.legacy ? { legacy: { ...input.legacy } } : {})
    },
    eligibleLevel: level,
    reasons,
    ...(input.entitlement ? { entitlement: { ...input.entitlement } } : {})
  };
}

function decideKind(input: ClaimEligibilityInput, reasons: ClaimReasonCode[]): ClaimKind {
  const review = input.review;
  if (review?.state === "approved") {
    if (!review.independent) reasons.push("REVIEW_NOT_INDEPENDENT");
    else if (input.evidence.issuerPinned !== true) reasons.push("ISSUER_NOT_PINNED");
    else return "independently_reviewed";
  }
  const observedTier = input.evidence.tiers.some((tier) => tier === "OBSERVED" || tier === "OBSERVED_HARDENED");
  return OBSERVING_METHODS.has(input.method) && observedTier ? "observed" : "self_reported";
}
