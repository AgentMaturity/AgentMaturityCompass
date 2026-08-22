/**
 * The event-hash pre-image helpers, factored out of ledger.ts.
 *
 * Pure functions shared by the writer (ledger.ts) and the verifier
 * (ledgerVerification.ts): both must canonicalise a row's metadata identically
 * or a freshly written event would fail its own verification. Keeping them in
 * one module is what makes "write and verify agree" structural rather than a
 * coincidence maintained by hand.
 *
 * sanitizeMetaForHash strips the receipt fields (which are added AFTER hashing)
 * and, on unparseable meta, hashes the raw string rather than throwing — the
 * hash must be defined for every row.
 */
import { canonicalize } from "../utils/json.js";
import type { EvidenceEventType, RuntimeName } from "../types.js";

export function sanitizeMetaForHash(metaJson: string): string {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(metaJson) as Record<string, unknown>;
  } catch {
    return metaJson;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return metaJson;
  }
  const clone: Record<string, unknown> = { ...parsed };
  delete clone.receipt;
  delete clone.receipt_sha256;
  return JSON.stringify(clone);
}

export function canonicalMetadataForHash(params: {
  id: string;
  ts: number;
  sessionId: string;
  runtime: RuntimeName;
  eventType: EvidenceEventType;
  payloadPath: string | null;
  payloadInline: string | null;
  metaJson: string;
}): string {
  return canonicalize({
    id: params.id,
    ts: params.ts,
    session_id: params.sessionId,
    runtime: params.runtime,
    event_type: params.eventType,
    payload_path: params.payloadPath,
    payload_inline: params.payloadInline,
    meta_json: sanitizeMetaForHash(params.metaJson)
  });
}
