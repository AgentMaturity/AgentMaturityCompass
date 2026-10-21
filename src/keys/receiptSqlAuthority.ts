/** Actual complete SQL receipt prefixes. No caller-supplied purportedly verified snapshot. */
import type Database from "better-sqlite3";
import type { EvidenceEvent, OutcomeEvent } from "../types.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalMetadataForHash } from "../ledger/eventHash.js";
import { hasOptionalLegacyTable } from "../ledger/legacyOptionalTables.js";
import { verifyReceipt } from "../receipts/receipt.js";
import { RECEIPT_TRANSPORT_TAG, verifyReceiptTransport } from "../receipts/receiptTransport.js";
import { loadTrustContext, type TrustContext } from "../trust/trustContext.js";
import { assertKeyNotRevoked } from "./keyRevocations.js";
import { getPurposeKeyHistory } from "./signingKeys.js";
import { RECEIPT_AUTHORITY_META, RECEIPT_STREAMS, receiptAuthorityMarkerSchema, type ReceiptStream } from "./receiptAuthority.js";
import { admitReceiptGrant, readReceiptAuthorityState, receiptAuthorityAt, type ReceiptAuthorityState } from "./receiptAuthorityState.js";

export interface ReceiptSqlReader { workspace: string; db: Database.Database }
export function readReceiptSqlSnapshot(ledger: ReceiptSqlReader) {
  const evidence = ledger.db.prepare("SELECT * FROM evidence_events ORDER BY rowid").all() as EvidenceEvent[];
  const outcomes = ledger.db.prepare("SELECT * FROM outcome_events ORDER BY rowid").all() as OutcomeEvent[];
  return { evidence, outcomes };
}
export type ReceiptSqlSnapshot = ReturnType<typeof readReceiptSqlSnapshot>;
/** Public unbound reads retain Ledger's existing known-prefix optional-table checks. */
function readUnboundReceiptSqlSnapshot(ledger: ReceiptSqlReader): ReceiptSqlSnapshot {
  if (hasOptionalLegacyTable(ledger.db, "outcome_events")) return readReceiptSqlSnapshot(ledger);
  return { evidence: ledger.db.prepare<[], EvidenceEvent>("SELECT * FROM evidence_events ORDER BY rowid").all(), outcomes: [] };
}
const rowsFor = (snapshot: ReceiptSqlSnapshot, stream: ReceiptStream) => stream === "sqlite-evidence" ? snapshot.evidence : snapshot.outcomes;
export function receiptSqlStarts(snapshot: ReceiptSqlSnapshot) {
  return { "sqlite-evidence": { count: snapshot.evidence.length, head: snapshot.evidence.at(-1)?.event_hash ?? "GENESIS" },
    "sqlite-outcome": { count: snapshot.outcomes.length, head: snapshot.outcomes.at(-1)?.event_hash ?? "GENESIS_OUTCOME" } };
}
/** Complete hash preimages and chain; callers separately verify ledger-row writer authority. */
export function assertReceiptSqlHashes(snapshot: ReceiptSqlSnapshot): void {
  for (const stream of RECEIPT_STREAMS) {
    let previous = stream === "sqlite-evidence" ? "GENESIS" : "GENESIS_OUTCOME";
    for (const row of rowsFor(snapshot, stream)) {
      let digest: string;
      if ("id" in row) digest = sha256Hex(`${row.prev_event_hash}${canonicalMetadataForHash({ id: row.id, ts: row.ts, sessionId: row.session_id, runtime: row.runtime,
        eventType: row.event_type, payloadPath: row.canonical_payload_path ?? row.payload_path, payloadInline: row.canonical_payload_inline ?? row.payload_inline, metaJson: row.meta_json })}${row.payload_sha256}`);
      else { let value: unknown = row.value; try { value = JSON.parse(row.value); } catch { /* legacy value */ }
        digest = sha256Hex(`${row.prev_event_hash}${canonicalize({ outcome_event_id: row.outcome_event_id, ts: row.ts, agent_id: row.agent_id, work_order_id: row.work_order_id,
          category: row.category, metric_id: row.metric_id, value, unit: row.unit, trust_tier: row.trust_tier, source: row.source, meta_json: row.meta_json, payload_sha256: row.payload_sha256 })}`);
      }
      if (row.prev_event_hash !== previous || row.event_hash !== digest) throw new Error("receipt SQL hash prefix invalid"); previous = row.event_hash;
    }
  }
}
/** Internal owner/writer math: explicit child distrust must stop use, but must not prevent a valid owner renewing it. */
export function verifyReceiptSqlMath(workspace: string, snapshot: ReceiptSqlSnapshot, state: ReceiptAuthorityState | null): void {
  assertReceiptSqlHashes(snapshot);
  const legacyKeys = getPurposeKeyHistory(workspace, "receipt");
  if (state) for (const grant of state.chain) for (const stream of RECEIPT_STREAMS) {
    const start = grant.signed.authority.starts[stream], rows = rowsFor(snapshot, stream), genesis = stream === "sqlite-evidence" ? "GENESIS" : "GENESIS_OUTCOME";
    if (start.count > rows.length || start.head !== (start.count === 0 ? genesis : rows[start.count - 1]!.event_hash)) throw new Error("receipt authority cutover prefix invalid");
  }
  for (const stream of RECEIPT_STREAMS) for (const [offset, row] of rowsFor(snapshot, stream).entries()) {
    const meta = JSON.parse(row.meta_json) as Record<string, unknown>, evidence = "id" in row;
    const token = evidence ? meta.receipt : row.receipt;
    const marked = RECEIPT_AUTHORITY_META in meta;
    if (evidence && token === undefined && !marked) continue; // ordinary appendEvidence does not mint receipts
    if (typeof token !== "string" || token.length === 0) throw new Error("receipt token missing from its signed row");
    const grant = state === null ? null : receiptAuthorityAt(state, stream, offset + 1);
    let payload;
    if (grant === null) {
      if (marked || token.startsWith(`${RECEIPT_TRANSPORT_TAG}.`)) throw new Error("receipt authority appears before its cutover");
      const checked = verifyReceipt(token, legacyKeys); if (!checked.ok || checked.payload === null) throw new Error("legacy receipt signature invalid"); payload = checked.payload;
    } else {
      const marker = receiptAuthorityMarkerSchema.parse(meta[RECEIPT_AUTHORITY_META]);
      if (marker.sha256 !== grant.sha256 || marker.epoch !== grant.signed.authority.epoch) throw new Error("receipt row authority marker invalid");
      const checked = verifyReceiptTransport(token, [grant.issuerPublicKeyPem]);
      if (!checked.authorityBytes.equals(grant.bytes)) throw new Error("receipt proof does not match its actual epoch"); payload = checked.payload;
    }
    const expectedBody = evidence && typeof meta.bodySha256 === "string" && meta.bodySha256.length === 64 ? meta.bodySha256 : row.payload_sha256;
    if (payload.event_hash !== row.event_hash || payload.body_sha256 !== expectedBody || payload.ts !== row.ts
      || (evidence ? payload.session_id !== row.session_id || payload.receipt_id !== meta.receipt_id : payload.receipt_id !== row.receipt_id)) throw new Error("receipt payload does not bind its actual row");
    if (evidence && sha256Hex(Buffer.from(token, "utf8")) !== meta.receipt_sha256) throw new Error("receipt token hash does not match its row");
  }
}
/** Unbound prefixes may contain only legacy receipt transport, never a purported committed child epoch. */
function assertNoUnboundReceiptAuthority(snapshot: ReceiptSqlSnapshot): void {
  for (const stream of RECEIPT_STREAMS) for (const row of rowsFor(snapshot, stream)) {
    let meta: unknown;
    try { meta = JSON.parse(row.meta_json); } catch { meta = null; } // Existing legacy validators own malformed metadata.
    const object = typeof meta === "object" && meta !== null ? meta as Record<string, unknown> : null;
    if (object !== null && RECEIPT_AUTHORITY_META in object) throw new Error("receipt authority appears before its cutover");
    const token = "id" in row ? object?.receipt : row.receipt;
    if (typeof token === "string" && token.startsWith(`${RECEIPT_TRANSPORT_TAG}.`)) throw new Error("receipt authority appears before its cutover");
  }
}
/** Bound admission includes zero-row boundaries and every receipt-bearing row; legacy math is unchanged. */
export function receiptLedgerProblems(ledger: ReceiptSqlReader, trust?: TrustContext): string[] {
  try {
    const state = readReceiptAuthorityState(ledger.workspace);
    if (state === null) {
      const snapshot = ledger.db.inTransaction ? readUnboundReceiptSqlSnapshot(ledger) : ledger.db.transaction(readUnboundReceiptSqlSnapshot)(ledger);
      assertNoUnboundReceiptAuthority(snapshot); return [];
    }
    const snapshot = readReceiptSqlSnapshot(ledger), context = trust ?? loadTrustContext();
    verifyReceiptSqlMath(ledger.workspace, snapshot, state);
    for (const grant of state.chain) {
      assertKeyNotRevoked(ledger.workspace, true, grant.signed.authority.issuerKeyId, "receipt");
      assertKeyNotRevoked(ledger.workspace, true, grant.signed.authority.childKeyId, "receipt");
      admitReceiptGrant(grant, context, grant.signed.authority.notBefore);
    }
    for (const stream of RECEIPT_STREAMS) for (const [index, row] of rowsFor(snapshot, stream).entries()) {
      const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
      if (stream === "sqlite-evidence" && !(RECEIPT_AUTHORITY_META in meta)) continue;
      const grant = receiptAuthorityAt(state, stream, index + 1); if (grant) admitReceiptGrant(grant, context, row.ts);
    }
    return [];
  } catch { return ["receipt authority or signed SQL receipt prefix is unreadable, invalid or not admitted"]; }
}
