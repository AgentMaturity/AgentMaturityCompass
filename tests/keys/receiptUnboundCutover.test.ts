/** Actual unbound Ledger prefixes: valid token math does not establish a committed receipt cutover. */
import { verify } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { verifyLedgerIntegrity } from "../../src/ledger/ledgerVerification.js";
import { receiptLedgerProblems } from "../../src/keys/receiptSqlAuthority.js";
import { readReceiptAuthorityState } from "../../src/keys/receiptAuthorityState.js";
import { RECEIPT_AUTHORITY_META } from "../../src/keys/receiptAuthority.js";
import { getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { parseReceipt, verifyReceipt } from "../../src/receipts/receipt.js";
import { workspaceIdFromDirectory } from "../../src/workspaces/workspaceId.js";
import { sha256Hex } from "../../src/utils/hash.js";
import type { Ledger } from "../../src/ledger/ledger.js";
import { cleanupReceiptAuthorityFixtures, makeReceiptAuthorityFixture } from "../helpers/receiptAuthorityFixture.js";
import { uncommittedReceiptToken } from "../helpers/uncommittedReceiptToken.js";
afterEach(() => { try { vi.restoreAllMocks(); cleanupReceiptAuthorityFixtures(); } finally { vi.unstubAllEnvs(); } });
function fault<T>(ledger: Ledger, stream: "evidence" | "outcome", run: () => T): T {
  const name = stream === "evidence" ? "protect_evidence_immutable" : "no_update_outcome_events";
  const trigger = ledger.db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?").get(name) as { sql: string } | undefined;
  expect(trigger?.sql).toBeTypeOf("string");
  if (trigger) ledger.db.exec(`DROP TRIGGER "${name}"`);
  try { return run(); } finally { if (trigger) ledger.db.exec(trigger.sql); }
}
test.each(["evidence", "outcome"] as const)("genuine uncommitted child proof is refused by actual public %s prefix while original row bindings remain valid", stream => {
  const f = makeReceiptAuthorityFixture(false), out = stream === "evidence" ? f.evidence() : f.outcome();
  const made = uncommittedReceiptToken(out.receipt, f.legacyPrivate, workspaceIdFromDirectory(f.workspace));
  expect(verify(null, made.certificateSigningBytes, made.issuer, Buffer.from(made.signed.signature, "base64"))).toBe(true);
  expect(verify(null, made.childSigningBytes, made.childPem, made.childSignature)).toBe(true);
  expect(getPurposeKeyHistory(f.workspace, "receipt")).toContain(made.issuer);
  expect(verifyReceipt(made.receipt, getPurposeKeyHistory(f.workspace, "receipt")).ok).toBe(true);
  expect(parseReceipt(made.receipt).payload).toEqual(parseReceipt(out.receipt).payload);
  expect(readReceiptAuthorityState(f.workspace)).toBeNull(); expect(verifyLedgerIntegrity(f.workspace, { trust: f.trust() }).chain.ok).toBe(true);
  f.withLedger(ledger => {
    const table = stream === "evidence" ? "evidence_events" : "outcome_events", idCol = stream === "evidence" ? "id" : "outcome_event_id";
    const id = "id" in out ? out.id : out.outcomeEventId;
    const before = ledger.db.prepare(`SELECT * FROM ${table} WHERE ${idCol}=?`).get(id) as Record<string, unknown>;
    const replace = (token: string) => stream === "evidence"
      ? ledger.db.prepare("UPDATE evidence_events SET meta_json=? WHERE id=?").run(JSON.stringify({ ...JSON.parse(before.meta_json as string), receipt: token, receipt_sha256: sha256Hex(token) }), id)
      : ledger.db.prepare("UPDATE outcome_events SET receipt=? WHERE outcome_event_id=?").run(token, id);
    fault(ledger, stream, () => {
      replace(made.receipt);
      try {
        const changed = ledger.db.prepare(`SELECT * FROM ${table} WHERE ${idCol}=?`).get(id) as Record<string, unknown>;
        expect(changed.event_hash).toBe(before.event_hash); expect(changed[stream === "evidence" ? "writer_sig" : "signature"]).toBe(before[stream === "evidence" ? "writer_sig" : "signature"]);
        const beforeBindings = { ...before }, changedBindings = { ...changed };
        delete beforeBindings.meta_json; delete changedBindings.meta_json; delete beforeBindings.receipt; delete changedBindings.receipt;
        expect(changedBindings).toEqual(beforeBindings);
        if (stream === "outcome") expect(changed.meta_json).toBe(before.meta_json);
        else {
          const oldMeta = JSON.parse(before.meta_json as string), newMeta = JSON.parse(changed.meta_json as string);
          delete oldMeta.receipt; delete oldMeta.receipt_sha256; delete newMeta.receipt; delete newMeta.receipt_sha256;
          expect(newMeta).toEqual(oldMeta);
        }
        const signature = changed[stream === "evidence" ? "writer_sig" : "signature"] as string;
        expect(getPurposeKeyHistory(f.workspace, "ledger-row").some(key => verify(null, Buffer.from(changed.event_hash as string, "hex"), key, Buffer.from(signature, "base64")))).toBe(true);
        expect(verifyLedgerIntegrity(f.workspace, { trust: f.trust() }).chain.ok).toBe(false);
        expect(receiptLedgerProblems(ledger, f.trust())).toHaveLength(1);
      } finally {
        if (stream === "evidence") ledger.db.prepare("UPDATE evidence_events SET meta_json=? WHERE id=?").run(before.meta_json, id); else replace(out.receipt);
      }
    });
    expect(receiptLedgerProblems(ledger, f.trust())).toEqual([]);
  });
  expect(verifyLedgerIntegrity(f.workspace, { trust: f.trust() }).chain.ok).toBe(true);
  const fresh = f.evidence(); expect(fresh.receipt.split(".")).toHaveLength(2); expect(f.fake.requests).toHaveLength(0);
});
test.each(["evidence", "outcome"] as const)("actual unbound %s reserved-marker discriminator refuses without new legacy hash reconciliation", stream => {
  const f = makeReceiptAuthorityFixture(false), out = stream === "evidence" ? f.evidence() : f.outcome();
  f.withLedger(ledger => {
    const table = stream === "evidence" ? "evidence_events" : "outcome_events", idCol = stream === "evidence" ? "id" : "outcome_event_id";
    const id = "id" in out ? out.id : out.outcomeEventId;
    const before = ledger.db.prepare(`SELECT meta_json FROM ${table} WHERE ${idCol}=?`).get(id) as { meta_json: string };
    fault(ledger, stream, () => {
      ledger.db.prepare(`UPDATE ${table} SET meta_json=? WHERE ${idCol}=?`).run(JSON.stringify({ ...JSON.parse(before.meta_json), [RECEIPT_AUTHORITY_META]: { sha256: "a".repeat(64), epoch: 1 } }), id);
      try {
        // This is the exact component discriminator. Other validators may independently reject this owned changed metadata.
        expect(verifyReceipt(out.receipt, getPurposeKeyHistory(f.workspace, "receipt")).ok).toBe(true);
        expect(receiptLedgerProblems(ledger, f.trust())).toHaveLength(1);
      } finally { ledger.db.prepare(`UPDATE ${table} SET meta_json=? WHERE ${idCol}=?`).run(before.meta_json, id); }
    });
    expect(receiptLedgerProblems(ledger, f.trust())).toEqual([]);
  });
  expect(verifyLedgerIntegrity(f.workspace, { trust: f.trust() }).chain.ok).toBe(true); expect(f.fake.requests).toHaveLength(0);
});
