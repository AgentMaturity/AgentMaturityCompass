/**
 * `amc evidence-stores encrypt` (P2-09, named freeze exception): encrypts the inline payloads of rows written before
 * ledger encryption was switched on, in batched transactions, skipping values that are already `amcenc:`. Event hashes,
 * signatures and receipts are untouched, so the chain head before and after must be the same; the signed receipt says
 * so. Those rows hashed their plaintext, so recomputing their event hash needs the key (or a plaintext export) from now
 * on; rows written with encryption on hash their ciphertext and verify without it (ADR 018).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getPublicKeyHistory, getSigningKey, signHexDigest, verifyHexDigestAny } from "../../crypto/keys.js";
import type { KeyProvider, KeyRef } from "../../keys/provider.js";
import { loadOpsPolicy } from "../../ops/policy.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { openLedger } from "../ledger.js";
import { getActiveDataKey, readDataKeyFile, rotateDataKey } from "./dataKeys.js";
import { encryptField, inlinePayloadAad, isEncryptedField } from "./ledgerCipher.js";

export interface EncryptionMigrationReceipt {
  v: 1;
  kind: "ledger-encryption-migration";
  ts: number;
  keyVersion: number;
  rowsEncrypted: number;
  rowsSkipped: number;
  /** The newest row when the run began, and its event hash before and after the run. */
  headEventId: string | null;
  chainHeadBefore: string;
  chainHeadAfter: string;
}

type Row = { rowid: number; id: string; payload_inline: string | null; canonical_payload_inline: string | null };

function sealRow(workspace: string, row: Row): { payload_inline: string | null; canonical_payload_inline: string | null } | null {
  const seal = (value: string | null) => value === null || isEncryptedField(value) ? value : encryptField(workspace, value, inlinePayloadAad(row.id));
  if (!(row.payload_inline !== null && !isEncryptedField(row.payload_inline)) && !(row.canonical_payload_inline !== null && !isEncryptedField(row.canonical_payload_inline))) return null;
  const payload = seal(row.payload_inline);
  // The two columns hold one ciphertext when they held one plaintext, as rows written with encryption on do.
  const canonical = row.canonical_payload_inline !== null && row.canonical_payload_inline === row.payload_inline ? payload : seal(row.canonical_payload_inline);
  return { payload_inline: payload, canonical_payload_inline: canonical };
}

export async function encryptExistingLedger(workspace: string, opts: { provider?: KeyProvider; ref?: KeyRef; batchSize?: number } = {}): Promise<{
  receipt: EncryptionMigrationReceipt; receiptPath: string;
}> {
  if (loadOpsPolicy(workspace).opsPolicy.encryption.ledgerEncryptionEnabled !== true) {
    throw new Error("set opsPolicy.encryption.ledgerEncryptionEnabled: true (and re-sign the ops policy) before encrypting the ledger");
  }
  if (readDataKeyFile(workspace) === null) await rotateDataKey(workspace, opts);
  const { keyVersion } = await getActiveDataKey(workspace, opts);
  const ledger = openLedger(workspace);
  try {
    const db = ledger.db;
    // Overwritten plaintext pages are zeroed rather than left in free space.
    db.pragma("secure_delete = ON");
    const head = db.prepare("SELECT rowid, id, event_hash FROM evidence_events ORDER BY rowid DESC LIMIT 1").get() as { rowid: number; id: string; event_hash: string } | undefined;
    const select = db.prepare(`SELECT rowid, id, payload_inline, canonical_payload_inline FROM evidence_events
      WHERE rowid > ? AND rowid <= ? AND (payload_inline IS NOT NULL OR canonical_payload_inline IS NOT NULL) ORDER BY rowid LIMIT ?`);
    const update = db.prepare("UPDATE evidence_events SET payload_inline = @payload_inline, canonical_payload_inline = @canonical_payload_inline WHERE rowid = @rowid");
    let after = 0, rowsEncrypted = 0, rowsSkipped = 0;
    for (;;) {
      const rows = select.all(after, head?.rowid ?? 0, opts.batchSize ?? 500) as Row[];
      if (rows.length === 0) break;
      db.transaction(() => {
        for (const row of rows) {
          const sealed = sealRow(workspace, row);
          if (sealed === null) rowsSkipped += 1;
          else { update.run({ ...sealed, rowid: row.rowid }); rowsEncrypted += 1; }
        }
      })();
      after = rows.at(-1)!.rowid;
    }
    db.pragma("wal_checkpoint(TRUNCATE)");
    const headAfter = head ? (db.prepare("SELECT event_hash FROM evidence_events WHERE rowid = ?").get(head.rowid) as { event_hash: string }).event_hash : "GENESIS";
    const receipt: EncryptionMigrationReceipt = {
      v: 1, kind: "ledger-encryption-migration", ts: Date.now(), keyVersion, rowsEncrypted, rowsSkipped,
      headEventId: head?.id ?? null, chainHeadBefore: head?.event_hash ?? "GENESIS", chainHeadAfter: headAfter
    };
    if (receipt.chainHeadAfter !== receipt.chainHeadBefore) throw new Error("ledger encryption changed the chain head; restore the pre-migration backup");
    return { receipt, receiptPath: writeSignedReceipt(workspace, receipt) };
  } finally {
    ledger.close();
  }
}

function writeSignedReceipt(workspace: string, receipt: EncryptionMigrationReceipt): string {
  const dir = join(workspace, ".amc", "ledger-encryption");
  mkdirSync(dir, { recursive: true });
  const digest = sha256Hex(canonicalize(receipt));
  const path = join(dir, `migration-${receipt.ts}.json`);
  writeFileSync(path, JSON.stringify({ receipt, digestSha256: digest, signature: signHexDigest(digest, getSigningKey(workspace, "config-signature")) }, null, 2), { mode: 0o644 });
  return path;
}

/** True when the receipt file's signature verifies under the workspace's auditor key history. */
export function verifyEncryptionReceipt(workspace: string, path: string): boolean {
  const signed = JSON.parse(readFileSync(path, "utf8")) as { receipt: EncryptionMigrationReceipt; digestSha256: string; signature: string };
  const digest = sha256Hex(canonicalize(signed.receipt));
  return digest === signed.digestSha256 && verifyHexDigestAny(digest, signed.signature, getPublicKeyHistory(workspace, "auditor"));
}
