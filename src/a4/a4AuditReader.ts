/** A4's actual audit-row binding, using the existing independent purpose-authority readers. */
import { eventMeta } from "../claims/evidenceProvenance.js";
import { verifyHexDigestAny } from "../crypto/keys.js";
import { legacyLedgerRowKeys, operationalEvidenceProblems } from "../keys/operationalLedgerReader.js";
import { receiptLedgerProblems } from "../keys/receiptSqlAuthority.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { readDataKeyFile } from "../ledger/encryption/dataKeys.js";
import { inlinePlaintextOrNull, isEncryptedField, recomputeEventHash } from "../ledger/encryption/ledgerCipher.js";
import type { Ledger } from "../ledger/ledger.js";
import { verifyReceipt } from "../receipts/receipt.js";
import type { TrustContext } from "../trust/trustContext.js";
import type { A4TransitionRow } from "./a4Schema.js";

/** Whether this workspace holds no ledger key file at all: a verifier's workspace, such as a materialized export. */
function keyless(workspace: string): boolean {
  try {
    return readDataKeyFile(workspace) === null;
  } catch {
    return false;
  }
}

/**
 * Whether a stored inline column carries the transition body (P2-36; reconcile/G2.md conflict 12): as is, or, under ledger
 * encryption, as a ciphertext the ledger's own cipher opens to it. Where the key is out of reach (a locked vault or an
 * unreachable provider) or the workspace holds no ledger key (an offline verifier), the ciphertext stands on the signed
 * binding instead: the row hash covers it and its payload_sha256 is the body digest. A ciphertext that does not open
 * under a key this workspace holds is a failure.
 */
function inlineCarries(workspace: string, eventId: string, inline: string, body: string): boolean {
  if (inline === body) return true;
  if (!isEncryptedField(inline)) return false;
  try {
    const plain = inlinePlaintextOrNull(workspace, eventId, inline);
    return plain === null || plain === body;
  } catch {
    return keyless(workspace);
  }
}

/** SQL reads use the caller's actual transaction; public files and operator trust are current point-in-time reads. */
export function a4AuditProblems(ledger: Ledger, row: A4TransitionRow, trust?: TrustContext): string[] {
  const keys = legacyLedgerRowKeys(ledger.workspace);
  const event = ledger.getEventById(row.evidence_event_id);
  if (!event || event.event_type !== "audit" || event.payload_sha256 !== row.body_digest
    || [event.payload_inline, event.canonical_payload_inline].some((inline) => inline != null && !inlineCarries(ledger.workspace, event.id, inline, row.body_json))) {
    return [`transition ${row.seq} audit row missing or carries other bytes`];
  }
  // A row encrypted after it was hashed (`amc evidence-stores encrypt`) recomputes over its plaintext, which needs the key.
  const hashErrors: string[] = [];
  const recomputed = recomputeEventHash(ledger.workspace, event, hashErrors);
  if (hashErrors.length > 0 || recomputed !== event.event_hash || !verifyHexDigestAny(event.event_hash, event.writer_sig, keys)) {
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
