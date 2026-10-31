/** P2-09 `amc evidence-stores encrypt`: plaintext rows become ciphertext, idempotently, with the chain head unchanged. */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { closeLedgerDataKeys } from "../src/ledger/encryption/dataKeys.js";
import { encryptExistingLedger, verifyEncryptionReceipt } from "../src/ledger/encryption/encryptMigration.js";
import { isEncryptedField } from "../src/ledger/encryption/ledgerCipher.js";
import { loadOpsPolicy, opsPolicyPath, signOpsPolicy } from "../src/ops/policy.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  closeLedgerDataKeys();
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
});

function setPolicy(workspace: string, on: boolean): void {
  const policy = loadOpsPolicy(workspace);
  policy.opsPolicy.encryption.ledgerEncryptionEnabled = on;
  writeFileSync(opsPolicyPath(workspace), YAML.stringify(policy));
  signOpsPolicy(workspace);
}

function plaintextLedger(): { workspace: string; ids: string[] } {
  const workspace = mkdtempSync(join(tmpdir(), "amc-ledger-enc-mig-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const ledger = openLedger(workspace);
  try {
    ledger.startSession({ sessionId: "legacy", runtime: "unknown", binaryPath: "test", binarySha256: "fixture" });
    const ids = Array.from({ length: 7 }, (_, index) => ledger.appendEvidence({ sessionId: "legacy", runtime: "unknown", eventType: "stdout", payload: `legacy ${index}`, inline: true }));
    ids.push(ledger.appendEvidence({ sessionId: "legacy", runtime: "unknown", eventType: "stdout", payload: "in a blob", inline: false }));
    return { workspace, ids };
  } finally {
    ledger.close();
  }
}

const events = (workspace: string) => {
  const ledger = openLedger(workspace, { readonly: true });
  try { return ledger.getAllEvents(); } finally { ledger.close(); }
};

describe("ledger encryption migration (P2-09)", () => {
  it("refuses while the policy key is off", async () => {
    const { workspace } = plaintextLedger();
    await expect(encryptExistingLedger(workspace)).rejects.toThrow(/ledgerEncryptionEnabled/);
  });

  it("encrypts every inline payload, changes nothing on a second run, keeps the chain head and signs the receipt", async () => {
    const { workspace, ids } = plaintextLedger();
    const headBefore = events(workspace).at(-1)!.event_hash;
    setPolicy(workspace, true);
    const first = await encryptExistingLedger(workspace, { batchSize: 3 });
    const inline = events(workspace).filter((row) => row.payload_inline !== null || row.canonical_payload_inline !== null);
    expect(inline.length).toBeGreaterThanOrEqual(7);
    expect(inline.every((row) => isEncryptedField(row.payload_inline) && row.canonical_payload_inline === row.payload_inline)).toBe(true);
    expect(first.receipt).toMatchObject({ rowsEncrypted: inline.length, rowsSkipped: 0, keyVersion: 1, chainHeadBefore: headBefore, chainHeadAfter: headBefore });
    expect(verifyEncryptionReceipt(workspace, first.receiptPath)).toBe(true);

    const snapshot = events(workspace).map((row) => row.payload_inline);
    const second = await encryptExistingLedger(workspace);
    expect(second.receipt).toMatchObject({ rowsEncrypted: 0, rowsSkipped: inline.length, chainHeadAfter: headBefore });
    expect(events(workspace).map((row) => row.payload_inline)).toEqual(snapshot);

    const byId = new Map(events(workspace).map((row) => [row.id, row]));
    expect(readEventPayload(workspace, byId.get(ids[0]!)!)).toEqual({ status: "ok", bytes: Buffer.from("legacy 0") });
    expect(verifyLedgerIntegrity(workspace).chain.errors.filter((error) => ids.some((id) => error.includes(id)))).toEqual([]);
  });

  it("reports migrated rows as needing the key when verified without it", async () => {
    const { workspace, ids } = plaintextLedger();
    setPolicy(workspace, true);
    await encryptExistingLedger(workspace);
    closeLedgerDataKeys();
    lockVault(workspace);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    const errors = verifyLedgerIntegrity(workspace).chain.errors.filter((error) => error.includes(ids[0]!));
    expect(errors.some((error) => error.includes("needs the ledger key or a plaintext export"))).toBe(true);
  });

  it("creates the first data key in a fresh process whose vault is locked, from AMC_VAULT_PASSPHRASE (P2-06 D5)", async () => {
    // `amc evidence-stores encrypt` starts with a locked vault; the chart runs it with the passphrase in the environment.
    const { workspace } = plaintextLedger();
    setPolicy(workspace, true);
    lockVault(workspace);
    const { receipt } = await encryptExistingLedger(workspace);
    expect(receipt).toMatchObject({ keyVersion: 1 });
    expect(events(workspace).filter((row) => row.payload_inline !== null).every((row) => isEncryptedField(row.payload_inline))).toBe(true);
  });

  it("still refuses to create a data key with the vault locked and no passphrase", async () => {
    const { workspace } = plaintextLedger();
    setPolicy(workspace, true);
    lockVault(workspace);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    await expect(encryptExistingLedger(workspace)).rejects.toThrow(/Vault locked/);
  });

  it("detects a forged receipt", async () => {
    const { workspace } = plaintextLedger();
    setPolicy(workspace, true);
    const { receiptPath } = await encryptExistingLedger(workspace);
    const { readFileSync } = await import("node:fs");
    const signed = JSON.parse(readFileSync(receiptPath, "utf8"));
    signed.receipt.chainHeadAfter = "0".repeat(64);
    writeFileSync(receiptPath, JSON.stringify(signed));
    expect(verifyEncryptionReceipt(workspace, receiptPath)).toBe(false);
  });
});
