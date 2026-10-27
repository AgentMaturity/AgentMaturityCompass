/**
 * P2-09 ledger encryption at rest (ADR 018 option A): inline payloads are AES-256-GCM ciphertext under a data key the
 * KeyProvider wraps; the chain verifies without the key; a provider outage denies the append before any row exists.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { closeLedgerDataKeys, getActiveDataKey, ledgerDekPath, rewrapDataKeys, rotateDataKey } from "../src/ledger/encryption/dataKeys.js";
import { decryptField, inlinePayloadAad, isEncryptedField, LedgerFieldAuthError } from "../src/ledger/encryption/ledgerCipher.js";
import { loadOpsPolicy, opsPolicyPath, signOpsPolicy } from "../src/ops/policy.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import type { KeyProvider } from "../src/keys/provider.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { sha256Hex } from "../src/utils/hash.js";

const CANARY = "CANARY-7f3a";
const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  closeLedgerDataKeys();
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
});

export function enableLedgerEncryption(workspace: string, on = true): void {
  const policy = loadOpsPolicy(workspace);
  policy.opsPolicy.encryption.ledgerEncryptionEnabled = on;
  writeFileSync(opsPolicyPath(workspace), YAML.stringify(policy));
  signOpsPolicy(workspace);
}

async function encryptedWorkspace(): Promise<string> {
  const workspace = mkdtempSync(join(tmpdir(), "amc-ledger-enc-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  enableLedgerEncryption(workspace);
  await rotateDataKey(workspace);
  return workspace;
}

function append(workspace: string, payloads: string[], session = "enc-session"): string[] {
  const ledger = openLedger(workspace);
  try {
    if (!ledger.getSessionById(session)) ledger.startSession({ sessionId: session, runtime: "unknown", binaryPath: "test", binarySha256: "fixture" });
    return payloads.map((payload) => ledger.appendEvidence({ sessionId: session, runtime: "unknown", eventType: "stdout", payload, inline: true }));
  } finally {
    ledger.close();
  }
}

function rows(workspace: string) {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    return ledger.getAllEvents();
  } finally {
    ledger.close();
  }
}

describe("ledger encryption at rest (P2-09)", () => {
  it("keeps the canary out of the database file and its WAL, and reads return plaintext", async () => {
    const workspace = await encryptedWorkspace();
    const ids = append(workspace, [`first ${CANARY}`, `second ${CANARY}`]);
    const ledger = openLedger(workspace);
    try {
      ids.push(ledger.appendEvidenceWithReceipt({ sessionId: "enc-session", runtime: "unknown", eventType: "llm_response", payload: `receipted ${CANARY}`, inline: true,
        meta: { agentId: "default", trustTier: "OBSERVED" },
        receipt: { kind: "llm_response", agentId: "default", providerId: "openai", model: "gpt-test", bodySha256: sha256Hex(Buffer.from(`receipted ${CANARY}`)) } }).id);
    } finally {
      ledger.close();
    }
    for (const file of ["evidence.sqlite", "evidence.sqlite-wal"]) {
      const path = join(workspace, ".amc", file);
      if (existsSync(path)) expect(readFileSync(path).includes(Buffer.from(CANARY)), file).toBe(false);
    }
    const stored = rows(workspace).filter((row) => ids.includes(row.id));
    expect(stored.every((row) => isEncryptedField(row.payload_inline) && row.canonical_payload_inline === row.payload_inline)).toBe(true);
    expect(stored).toHaveLength(3);
    expect(stored.map((row) => readEventPayload(workspace, row))).toEqual([`first ${CANARY}`, `second ${CANARY}`, `receipted ${CANARY}`]
      .map((text) => ({ status: "ok", bytes: Buffer.from(text) })));
    expect(verifyLedgerIntegrity(workspace).chain.errors.filter((error) => ids.some((id) => error.includes(id)))).toEqual([]);
  });

  it("verifies the chain through the read-only path with no key, and still detects a changed ciphertext", async () => {
    const workspace = await encryptedWorkspace();
    const [id] = append(workspace, [`keyless ${CANARY}`]);
    closeLedgerDataKeys();
    lockVault(workspace);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    const chainErrors = () => verifyLedgerIntegrity(workspace).chain.errors.filter((error) => error.includes(id!));
    expect(chainErrors()).toEqual([]);

    const db = openLedger(workspace, { readonly: true });
    const value = (db.db.prepare("SELECT payload_inline FROM evidence_events WHERE id = ?").get(id) as { payload_inline: string }).payload_inline;
    db.close();
    vi.unstubAllEnvs();
    const ledger = openLedger(workspace);
    const flipped = value.slice(0, -2) + (value.at(-2) === "A" ? "B" : "A") + value.at(-1);
    // Someone with write access to the file is not stopped by a trigger; the chain must catch it.
    ledger.db.exec("DROP TRIGGER protect_evidence_immutable");
    ledger.db.prepare("UPDATE evidence_events SET payload_inline = ?, canonical_payload_inline = ? WHERE id = ?").run(flipped, flipped, id);
    ledger.close();
    lockVault(workspace);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    expect(chainErrors().some((error) => error.startsWith(`Event ${id} event_hash mismatch`))).toBe(true);
  });

  it("refuses a ciphertext moved to another row (AAD binds the row id)", async () => {
    const workspace = await encryptedWorkspace();
    const [a, b] = append(workspace, ["payload A", "payload B"]);
    const byId = new Map(rows(workspace).map((row) => [row.id, row.payload_inline!]));
    expect(decryptField(workspace, byId.get(a!)!, inlinePayloadAad(a!))).toBe("payload A");
    expect(() => decryptField(workspace, byId.get(a!)!, inlinePayloadAad(b!))).toThrow(LedgerFieldAuthError);
    expect(() => decryptField(workspace, byId.get(b!)!, { ...inlinePayloadAad(b!), column: "meta_json" })).toThrow(LedgerFieldAuthError);
    const swapped = rows(workspace).find((row) => row.id === b)!;
    expect(readEventPayload(workspace, { ...swapped, payload_inline: byId.get(a!)! })).toMatchObject({ status: "missing" });
  });

  it("denies the append with the provider's reason when the KeyProvider is down, and writes no row", async () => {
    const workspace = await encryptedWorkspace();
    append(workspace, ["before the outage"]);
    const kms: KeyProvider = {
      id: "aws-kms",
      describe: async () => { throw new Error("unused"); },
      sign: async () => { throw new Error("unused"); },
      wrapKey: async (_ref, key) => Buffer.from(key).reverse(),
      unwrapKey: async (_ref, wrapped) => Buffer.from(wrapped).reverse()
    };
    await rotateDataKey(workspace, { provider: kms, ref: { provider: "aws-kms", id: "arn:aws:kms:eu-west-1:111122223333:key/0b0b0b0b-1111-2222-3333-444455556666" } });
    closeLedgerDataKeys();
    const before = rows(workspace).length;
    // The synchronous path reaches the provider through the P2-08 bridge, which cannot reach any KMS here.
    expect(() => append(workspace, ["during the outage"])).toThrow(/KEY_PROVIDER_UNAVAILABLE|KEY_PROVIDER_NOT_INSTALLED/);
    expect(rows(workspace).length).toBe(before);
    await getActiveDataKey(workspace, { provider: kms });
    expect(append(workspace, ["after priming"])).toHaveLength(1);
  });

  it("rotates to version 2 for new rows, old rows still decrypt, and rewrap leaves every ciphertext byte unchanged", async () => {
    const workspace = await encryptedWorkspace();
    const [old] = append(workspace, ["under version 1"]);
    await rotateDataKey(workspace);
    const [fresh] = append(workspace, ["under version 2"]);
    const before = new Map(rows(workspace).map((row) => [row.id, row.payload_inline]));
    expect(before.get(old!)).toMatch(/^amcenc:v1:1:/);
    expect(before.get(fresh!)).toMatch(/^amcenc:v1:2:/);
    const keyFile = readFileSync(ledgerDekPath(workspace), "utf8");
    await rewrapDataKeys(workspace);
    expect(readFileSync(ledgerDekPath(workspace), "utf8")).not.toBe(keyFile);
    closeLedgerDataKeys();
    const after = rows(workspace);
    expect(new Map(after.map((row) => [row.id, row.payload_inline]))).toEqual(before);
    expect(after.filter((row) => [old, fresh].includes(row.id)).map((row) => readEventPayload(workspace, row)))
      .toEqual([{ status: "ok", bytes: Buffer.from("under version 1") }, { status: "ok", bytes: Buffer.from("under version 2") }]);
  });

  it("leaves a workspace without the policy key unchanged (plaintext rows)", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-ledger-plain-"));
    roots.push(workspace);
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const [id] = append(workspace, ["plain as before"]);
    expect(rows(workspace).find((row) => row.id === id)!.payload_inline).toBe("plain as before");
  });
});
