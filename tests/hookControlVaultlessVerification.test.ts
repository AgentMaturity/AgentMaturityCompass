/**
 * WP35c: a delegated Claude Code child's hook forwarder runs without the vault passphrase (WP36 keeps it out of foreign
 * CLI children), so it verifies the Bridge's signed decision with public material only: chain, writer signature, receipt
 * and seal. The decision row's payload blob is encrypted under a vault-held key; there it is listed as not evaluated,
 * never counted as verified, and a blob that does not open under a reachable key still fails.
 */
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "vitest";
import { verifyProviderHookControlResult } from "../src/bridge/hookControl.js";
import { openLedger, verifyEvidenceEventIntegrity } from "../src/ledger/ledger.js";
import { blobMagicV1 } from "../src/storage/blobs/blobEncryptor.js";
import { readBlobKeyMaterial, VaultLockedError } from "../src/storage/blobs/blobKeys.js";
import { deleteVaultSecret, lockVault, unlockVault } from "../src/vault/vault.js";
import { agentId, claudeWorkspace, controlRequest, decide, recorded } from "./helpers/claudeCodeHookFixtures.js";
import { removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

const passphrase = () => process.env.AMC_VAULT_PASSPHRASE;
let saved: string | undefined;
afterEach(() => {
  if (saved !== undefined) process.env.AMC_VAULT_PASSPHRASE = saved;
  saved = undefined;
});
afterAll(() => removeFixtureWorkspaces());

/** A workspace holding one sealed allow decision for a Read, and the request and answer the forwarder would verify. */
function allowedRead(existing?: string, toolUseId = "toolu_vaultless") {
  const workspace = existing ?? claudeWorkspace();
  const payload = { ...recorded("PreToolUse-read", workspace), tool_input: { file_path: join(realpathSync(workspace), "workspace", "public.txt") },
    tool_use_id: toolUseId };
  const rawInput = controlRequest(payload);
  const result = decide(workspace, rawInput);
  expect(result.decision).toBe("allow");
  return { workspace, rawInput, result };
}

/** As in the delegated child: no passphrase in the environment, and no unlocked vault session in this process. */
function withoutVault(workspace: string): void {
  saved = passphrase();
  delete process.env.AMC_VAULT_PASSPHRASE;
  lockVault(workspace);
}

function integrity(workspace: string, eventId: string, blobKeyOptional?: boolean) {
  const ledger = openLedger(workspace);
  try {
    return verifyEvidenceEventIntegrity({ ledger, eventId, requireReceipt: true, requireSealedSession: true, ...(blobKeyOptional ? { blobKeyOptional } : {}) });
  } finally {
    ledger.close();
  }
}

function blobPath(workspace: string, eventId: string): string {
  const ledger = openLedger(workspace);
  try {
    const row = ledger.db.prepare("SELECT payload_path FROM evidence_events WHERE id = ?").get(eventId) as { payload_path: string | null };
    expect(row.payload_path, "the decision's payload is a blob").toBeTruthy();
    return join(workspace, row.payload_path!);
  } finally {
    ledger.close();
  }
}

describe("verifying a hook control decision without the vault", () => {
  test("the forwarder's check accepts the signed decision; its blob is not evaluated, not verified", () => {
    const { workspace, rawInput, result } = allowedRead();
    withoutVault(workspace);
    const verified = verifyProviderHookControlResult({ workspace, authenticatedAgentId: agentId, provider: "claude-code", rawInput, result,
      blobKeyOptional: true });
    expect(verified).toEqual({ ok: true, error: null });
    const optional = integrity(workspace, result.eventId, true);
    expect(optional.ok).toBe(true);
    expect(optional.payloadsNotEvaluated).toEqual([`Event ${result.eventId} payload not evaluated: the blob key is unavailable here`]);
    // Every other reader still needs the key: without it the row fails, as before.
    expect(integrity(workspace, result.eventId).errors).toContain(`Event ${result.eventId} payload authentication failed`);
  });

  test("a blob that does not open under a reachable key fails, with or without the option", () => {
    const { workspace, result } = allowedRead();
    const path = blobPath(workspace, result.eventId);
    const bytes = readFileSync(path);
    bytes[bytes.length - 1] ^= 0xff;
    writeFileSync(path, bytes);
    expect(integrity(workspace, result.eventId, true).errors).toContain(`Event ${result.eventId} payload authentication failed`);
  });

  test("a vaulted blob key is out of reach only when the session is locked and no passphrase is set", () => {
    const { workspace } = allowedRead();
    lockVault(workspace);
    expect(readBlobKeyMaterial(workspace, 1), "a passphrase still reaches the key").toHaveLength(32);
    withoutVault(workspace);
    expect(() => readBlobKeyMaterial(workspace, 1)).toThrow(VaultLockedError);
    unlockVault(workspace, saved);
    expect(readBlobKeyMaterial(workspace, 1), "an unlocked session reaches the key without the passphrase").toHaveLength(32);
    lockVault(workspace);
    // Version 0 is never vault-held: its failures are never VaultLockedError.
    expect(() => readBlobKeyMaterial(workspace, 0)).toThrow(/unvaulted blob key missing/);
  });

  test("without the vault, a blob that is not the row's envelope still fails", () => {
    const { workspace, rawInput, result } = allowedRead();
    writeFileSync(blobPath(workspace, result.eventId), "not a blob envelope");
    withoutVault(workspace);
    // Not an envelope, so read as a plaintext blob: its bytes are not the row's payload.
    expect(integrity(workspace, result.eventId, true).errors).toContain(`Event ${result.eventId} payload hash mismatch`);
    expect(verifyProviderHookControlResult({ workspace, authenticatedAgentId: agentId, provider: "claude-code", rawInput, result,
      blobKeyOptional: true }).ok).toBe(false);
  });

  test("without the vault, another row's sealed blob in this row's place still fails", () => {
    const { workspace, rawInput, result } = allowedRead();
    const other = allowedRead(workspace, "toolu_vaultless_other").result;
    writeFileSync(blobPath(workspace, result.eventId), readFileSync(blobPath(workspace, other.eventId)));
    withoutVault(workspace);
    expect(integrity(workspace, result.eventId, true).errors).toContain(`Event ${result.eventId} payload authentication failed`);
    expect(verifyProviderHookControlResult({ workspace, authenticatedAgentId: agentId, provider: "claude-code", rawInput, result,
      blobKeyOptional: true }).ok).toBe(false);
  });

  // The envelope header is not authenticated without the key: its key version cannot excuse the blob.
  test("without the vault, a header naming a key version this workspace never issued fails", () => {
    const { workspace, result } = allowedRead();
    setHeaderKeyVersion(blobPath(workspace, result.eventId), 7);
    withoutVault(workspace);
    expect(integrity(workspace, result.eventId, true).errors).toContain(`Event ${result.eventId} payload authentication failed`);
  });

  test("without the vault, a current key version raised without its signature admits no new version", () => {
    const { workspace, result } = allowedRead();
    setHeaderKeyVersion(blobPath(workspace, result.eventId), 7);
    const current = join(workspace, ".amc", "blob-keys", "current.json");
    writeFileSync(current, JSON.stringify({ ...JSON.parse(readFileSync(current, "utf8")) as object, keyVersion: 7 }, null, 2));
    withoutVault(workspace);
    expect(integrity(workspace, result.eventId, true).errors).toContain(`Event ${result.eventId} payload authentication failed`);
  });

  test("without the vault, a header naming the unvaulted key fails when that key file is corrupt", () => {
    const { workspace, result } = allowedRead();
    setHeaderKeyVersion(blobPath(workspace, result.eventId), 0);
    writeFileSync(join(workspace, ".amc", "blobs", "unvaulted.key"), "corrupt", { mode: 0o600 });
    withoutVault(workspace);
    expect(integrity(workspace, result.eventId, true).errors).toContain(`Event ${result.eventId} payload authentication failed`);
  });

  test("an unlocked vault that lacks the blob key's secret fails: only a locked vault is out of reach", () => {
    const { workspace, result } = allowedRead();
    unlockVault(workspace, passphrase());
    expect(deleteVaultSecret(workspace, "vault.secrets.blobKeys.1")).toBe(true);
    expect(integrity(workspace, result.eventId, true).errors).toContain(`Event ${result.eventId} payload authentication failed`);
  });

  test("a caller that does not pass blobKeyOptional (the Bridge side) still needs the blob key", () => {
    const { workspace, rawInput, result } = allowedRead();
    withoutVault(workspace);
    expect(verifyProviderHookControlResult({ workspace, authenticatedAgentId: agentId, provider: "claude-code", rawInput, result }))
      .toEqual({ ok: false, error: expect.stringContaining("payload authentication failed") });
  });
});

/** Rewrites the blob envelope's (unauthenticated) key version field, right after its magic. */
function setHeaderKeyVersion(path: string, keyVersion: number): void {
  const bytes = readFileSync(path);
  const offset = Buffer.byteLength(blobMagicV1(), "ascii");
  expect(bytes.readUInt32BE(offset), "the blob was written under key version 1").toBe(1);
  bytes.writeUInt32BE(keyVersion, offset);
  writeFileSync(path, bytes);
}
