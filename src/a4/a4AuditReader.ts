/** A4's actual audit-row binding, using the existing independent purpose-authority readers. */
import { eventMeta } from "../claims/evidenceProvenance.js";
import { verifyHexDigestAny } from "../crypto/keys.js";
import { legacyLedgerRowKeys, operationalEvidenceProblems } from "../keys/operationalLedgerReader.js";
import { receiptLedgerProblems } from "../keys/receiptSqlAuthority.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { canonicalMetadataForHash, type Ledger } from "../ledger/ledger.js";
import { verifyReceipt } from "../receipts/receipt.js";
import type { TrustContext } from "../trust/trustContext.js";
import { sha256Hex } from "../utils/hash.js";
import type { A4TransitionRow } from "./a4Schema.js";

/** SQL reads use the caller's actual transaction; public files and operator trust are current point-in-time reads. */
export function a4AuditProblems(ledger: Ledger, row: A4TransitionRow, trust?: TrustContext): string[] {
  const keys = legacyLedgerRowKeys(ledger.workspace);
  const event = ledger.getEventById(row.evidence_event_id);
  if (!event || event.event_type !== "audit" || event.payload_sha256 !== row.body_digest
    || [event.payload_inline, event.canonical_payload_inline].some((inline) => inline != null && inline !== row.body_json)) {
    return [`transition ${row.seq} audit row missing or carries other bytes`];
  }
  const recomputed = sha256Hex(`${event.prev_event_hash}${canonicalMetadataForHash({ id: event.id, ts: event.ts, sessionId: event.session_id,
    runtime: event.runtime, eventType: event.event_type, payloadPath: event.canonical_payload_path ?? event.payload_path,
    payloadInline: event.canonical_payload_inline ?? event.payload_inline, metaJson: event.meta_json })}${event.payload_sha256}`);
  if (recomputed !== event.event_hash || !verifyHexDigestAny(event.event_hash, event.writer_sig, keys)) {
    return [`transition ${row.seq} audit row signature does not verify`];
  }
  const delegation = operationalEvidenceProblems(ledger.workspace, [event], { ledger, trust });
  if (delegation.length > 0) return delegation.map((problem) => `transition ${row.seq} audit row delegation is not admitted: ${problem}`);
  const problems: string[] = [];
  const meta = eventMeta(event);
  if (meta.auditType !== "A4_STATE" || meta.projectId !== row.project_id || meta.seq !== row.seq) problems.push(`transition ${row.seq} audit row is for another transition`);
  const receipt = typeof meta.receipt === "string"
    ? verifyReceipt(meta.receipt, getPurposeKeyHistory(ledger.workspace, "receipt")) : null;
  if (!receipt?.ok || receipt.payload?.body_sha256 !== row.body_digest || receipt.payload.event_hash !== event.event_hash) {
    problems.push(`transition ${row.seq} signed receipt does not bind it`);
  } else {
    problems.push(...receiptLedgerProblems(ledger, trust).map((problem) => `transition ${row.seq} receipt authority is not admitted: ${problem}`));
  }
  return problems;
}
