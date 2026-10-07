/**
 * Evidence binding for control results (P1-11). An evidence item is admitted or rejected against a control's evidence
 * contracts, and every result carries P0-08's five status dimensions and a derived claim kind, never one number.
 * docs/catalog/CONTROL_RECORD.md, "Status dimensions", is the decision table.
 */
import type { Applicability, ClaimKind, ClaimReasonCode, StatusDimensions } from "../../claims/eligibility/types.js";
import type { TrustTier } from "../../types.js";
import type { BindingField, ControlRecord, EvidenceContract, InvalidationTrigger, ProducerRecord } from "../types.js";

export interface EvidenceRef {
  kind: "ledger_event" | "receipt" | "external" | "signed_config" | "review_record" | "assurance_report";
  id: string;
  sha256: string;
}

/**
 * What the loader proved from the bytes it read, in the same read: admission never re-reads a source. `producerId` is
 * the producer those bytes prove (null when they prove none) and `trustTier` the tier P0-18 derives from them.
 */
export type ItemProvenance =
  | { verified: true; producerId: string | null; trustTier: TrustTier | null }
  | { verified: false; detail: string };

export interface EvidenceItem {
  ref: EvidenceRef;
  /** Claimed; admission checks it against `provenance`. */
  producerId: string;
  provenance: ItemProvenance;
  /** Ledger insertion, receipt or sealed-report time. Freshness reads this, never `claimedAt`. */
  recordedAt: string;
  /** Producer-supplied time when different. */
  claimedAt: string | null;
  binding: Partial<Record<BindingField, string>>;
  /** Set by the control's oracle adapter. */
  verdict: "conforms" | "violates" | "neutral";
  /**
   * Admission and the evidence rules read: `receiptId` (replay), `foreignReceipt` (a receipt for another row or
   * workspace), `observationKey` and `observation` (two admitted items with one key and different observations
   * contradict each other), `decision` ("allow" or "deny" at an enforcement point).
   */
  attributes: Record<string, string | number | boolean>;
}

export type RejectionReason = "producer_not_admitted" | "producer_unverified" | "binding_missing"
  | "binding_mismatch" | "cross_tenant" | "outside_window" | "stale" | "replayed" | "invalidated";

/** A result review decided through the approval engine; the caller verifies its signature before passing it. */
export interface ResultReview {
  resultDigest: string;
  decision: "approved" | "rejected";
  reviewer: string;
  approvalRequestId: string;
  expiresAt: string;
}

/** The compiled plan's decision for one control (P1-10). Without one, applicability is unresolved. */
export interface ControlPlan {
  digest: string;
  policyDigest: string;
  applicability: Applicability;
  /** `warn` when the compiled policy runs the control's enforcement point without blocking. */
  mode: "enforce" | "warn";
}

export interface EvaluationContext {
  subject: { tenantId: string | null; workspaceId: string; deploymentId: string | null; agentId: string | null; subjectId: string | null };
  window: { start: string; end: string };
  plan: ControlPlan | null;
  invalidations: ReadonlyArray<{ trigger: InvalidationTrigger; at: string; ref: string }>;
  reviews: readonly ResultReview[];
  /** catalog/producers.yaml. */
  producers: readonly ProducerRecord[];
  /** Earlier uses of an item id or receipt id, keyed by control, subject and window; a different key is a replay. */
  priorUses?: ReadonlyArray<{ id: string; key: string }>;
}

/** A mapping-derived contract may also require a share of OBSERVED items (P0-17's `minObservedRatio`). */
export type EvaluatedContract = EvidenceContract & { minObservedRatio?: number };

/** What evaluation reads from a control record. A catalog ControlRecord is one. */
export interface EvaluableControl extends Pick<ControlRecord, "id" | "version" | "binding" | "invalidatedBy"> {
  evidence: EvaluatedContract[];
}

export interface ControlResult {
  resultVersion: 1;
  controlId: string;
  controlVersion: string;
  controlDigest: string;
  planDigest: string | null;
  subject: EvaluationContext["subject"];
  window: EvaluationContext["window"];
  dimensions: StatusDimensions;
  /** Derived through P0-08's evaluateClaimEligibility, never declared. */
  claimKind: ClaimKind;
  /** P0-08's reason codes for the kind and result, so a claim label can say why. */
  claimReasons: ClaimReasonCode[];
  admitted: Array<{ ref: EvidenceRef; producerId: string; trustTier: TrustTier }>;
  rejected: Array<{ ref: EvidenceRef; reason: RejectionReason; detail: string }>;
  reasons: string[];
  evaluatedAt: string;
  evaluator: { name: "amc"; version: string };
  /** sha256 of the canonical result without `evaluatedAt`, with review `pending`, so a review can name it. */
  digest: string;
}
