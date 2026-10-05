import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { LiveDriftAlert, LiveDriftMetricId, LiveDriftReceipt } from "./liveDriftTypes.js";

/** Hash the caller's exact payload; array order and native canonicalization errors are retained. */
function hashLiveDriftPayload(payload: unknown): string {
  return sha256Hex(canonicalize(payload));
}

export function withLiveDriftReceiptHash(receipt: Omit<LiveDriftReceipt, "receiptHash">): LiveDriftReceipt {
  return { ...receipt, receiptHash: hashLiveDriftPayload(receipt) };
}

export function withLiveDriftRowHash<T extends object>(payload: T): T & { rowHash: string } {
  return { ...payload, rowHash: hashLiveDriftPayload(payload) };
}

interface MetadataReceiptPolicy<P> {
  alertSuffix: string;
  metricId: LiveDriftMetricId;
  messagePrefix: string;
  summaryPrefix: string;
  evidenceRefs: (proof: P) => string[];
  signedEvidenceRefs: (proof: P) => string[];
  sourceRefs: (receipt: LiveDriftReceipt, proof: P) => string[];
}

/**
 * Assemble metadata-only proof alerts. Domain admission and reference selection stay
 * in the caller. The callbacks retain the original eager read order: receipt spread,
 * alert refs, signed refs, alerts, then source refs. This does not authenticate proof.
 */
export function createLiveDriftMetadataReceiptEnricher<P>(policy: MetadataReceiptPolicy<P>) {
  return function enrichReceipt(
    receipt: LiveDriftReceipt,
    coverage: number,
    missingReasons: string[],
    proof: P,
  ): LiveDriftReceipt {
    const { receiptHash: _oldHash, ...receiptWithoutHash } = receipt;
    const alertRefs = policy.evidenceRefs(proof);
    const signedRefs = policy.signedEvidenceRefs(proof);
    const alerts: LiveDriftAlert[] = [...receipt.alerts];
    if (missingReasons.length > 0) {
      alerts.push({
        alertId: `live-drift:${receipt.agentId}:${receipt.baselineWindowId}:${receipt.liveWindowId}:${policy.alertSuffix}`,
        metricId: policy.metricId,
        severity: coverage < 0.75 ? "critical" : "high",
        message: `${policy.messagePrefix}${missingReasons.join(", ")}.`,
        threshold: 1,
        observed: Math.round(coverage * 10000) / 10000,
        evidenceRefs: alertRefs,
        signedEvidenceRefs: signedRefs,
      });
    }
    const recommendation = alerts.length > 0 ? "alert" : receipt.recommendation;
    return withLiveDriftReceiptHash({
      ...receiptWithoutHash,
      alerts,
      recommendation,
      failClosed: alerts.length > 0,
      sourceRefs: policy.sourceRefs(receipt, proof),
      summary: `${alerts.length} live drift alert(s), recommendation=${recommendation}; ${policy.summaryPrefix}${Math.round(coverage * 10000) / 10000}`,
    });
  };
}
