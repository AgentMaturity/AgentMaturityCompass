/**
 * Outcome-event verification: their own hash chain from GENESIS_OUTCOME, signatures and receipts. Split from
 * ledgerVerification.ts to keep that file under the line cap (as sessionVerification.ts was); behaviour is unchanged.
 */
import { verifyHexDigestAny } from "../crypto/keys.js";
import { legacyLedgerRowKeys } from "../keys/operationalLedgerReader.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { verifyReceipt } from "../receipts/receipt.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { Ledger } from "./ledger.js";

export function verifyOutcomeEvents(ledger: Ledger, workspace: string, errors: string[]): void {
  const monitorKeys = legacyLedgerRowKeys(workspace);
  const rows = ledger.getAllOutcomeEvents();
  let previous = "GENESIS_OUTCOME";
  for (const row of rows) {
    if (row.prev_event_hash !== previous) {
      errors.push(`Outcome event ${row.outcome_event_id} previous hash mismatch`);
    }
    const metaJson = row.meta_json;
    let parsedValue: unknown = row.value;
    try {
      parsedValue = JSON.parse(row.value);
    } catch {
      parsedValue = row.value;
    }
    const recalculated = sha256Hex(
      `${row.prev_event_hash}${canonicalize({
        outcome_event_id: row.outcome_event_id,
        ts: row.ts,
        agent_id: row.agent_id,
        work_order_id: row.work_order_id,
        category: row.category,
        metric_id: row.metric_id,
        value: parsedValue,
        unit: row.unit,
        trust_tier: row.trust_tier,
        source: row.source,
        meta_json: metaJson,
        payload_sha256: row.payload_sha256
      })}`
    );
    if (recalculated !== row.event_hash) {
      errors.push(`Outcome event ${row.outcome_event_id} event_hash mismatch`);
    }
    if (!verifyHexDigestAny(row.event_hash, row.signature, monitorKeys)) {
      errors.push(`Outcome event ${row.outcome_event_id} signature invalid`);
    }
    const verifiedReceipt = verifyReceipt(row.receipt, getPurposeKeyHistory(workspace, "receipt"));
    if (!verifiedReceipt.ok || !verifiedReceipt.payload) {
      errors.push(`Outcome event ${row.outcome_event_id} receipt invalid`);
    } else {
      if (verifiedReceipt.payload.event_hash !== row.event_hash) {
        errors.push(`Outcome event ${row.outcome_event_id} receipt event hash mismatch`);
      }
      if (verifiedReceipt.payload.body_sha256 !== row.payload_sha256) {
        errors.push(`Outcome event ${row.outcome_event_id} receipt payload hash mismatch`);
      }
      if (verifiedReceipt.payload.receipt_id !== row.receipt_id) {
        errors.push(`Outcome event ${row.outcome_event_id} receipt id mismatch`);
      }
    }
    previous = row.event_hash;
  }
}
