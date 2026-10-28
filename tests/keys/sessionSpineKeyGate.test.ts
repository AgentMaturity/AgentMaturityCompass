import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeSignedRevocationList, nextRevocationList, readAnchoredRevocationList, revocationListSha256, signRevocationList } from "../../src/keys/revocationList.js";
import { getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { SessionService } from "../../src/session/sessionService.js";
import { ed25519KeyId } from "../../src/trust/index.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";
import type { LocalPurpose } from "../../src/vault/vaultPayload.js";

/**
 * The session spine re-checks every signing key on every event (P2-08); the per-event gate is kept cheap by reusing
 * work only inside one synchronous check pass. A revocation or vault lock between two events must refuse the second,
 * including a revocation written by another process (no in-process write counter sees it).
 */
const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
});

function openSession(): { root: string; svc: SessionService } {
  const root = mkdtempSync(join(tmpdir(), "amc-spine-gate-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  const svc = new SessionService(root);
  svc.open({ sessionId: "gate", agentId: "a", harnessVersion: "1", compositionDigest: "0".repeat(64), policyDigest: "0".repeat(64) });
  svc.startTurn({ trigger: "user" });
  svc.startStep();
  return { root, svc };
}

const block = (svc: SessionService, i: number) => svc.recordAssistantBlock({ blockIndex: i, blockKind: "text", stopReason: null, content: `block ${i}` });

/** A validly signed next key revocation list naming `purpose`'s current key (amc keys revoke refuses a key in use). */
function revocationBytes(root: string, purpose: LocalPurpose): Buffer {
  const location = { workspace: root, rel: ".amc/keys/revocations.signed.json", listId: "keys:default", trustedPublicKeyPems: getPurposeKeyHistory(root, "revocation-list") };
  const current = readAnchoredRevocationList(location)!;
  const keyId = ed25519KeyId(getSigningPublicKeyPem(root, purpose))!;
  const list = nextRevocationList("keys:default", { sequence: current.list.sequence, sha256: revocationListSha256(current.list) },
    [{ id: keyId, kind: "key", revokedAt: new Date().toISOString(), reason: `key-compromise: ${purpose}` }], 0);
  return Buffer.from(encodeSignedRevocationList(signRevocationList(list, getSigningKey(root, "revocation-list"))));
}

const listPath = (root: string) => join(root, ".amc", "keys", "revocations.signed.json");

describe("session spine key gate between two events (P2-08 throughput)", () => {
  it.each(["artifact-seal", "ledger-row"] as const)("a %s revocation written by this process refuses the next event", (purpose) => {
    const { root, svc } = openSession();
    block(svc, 0);
    writeFileSync(listPath(root), revocationBytes(root, purpose));
    expect(() => block(svc, 1)).toThrow(/revoked/);
  });

  it.each(["artifact-seal", "ledger-row"] as const)("a %s revocation written by another process refuses the next event", (purpose) => {
    const { root, svc } = openSession();
    block(svc, 0);
    const bytes = revocationBytes(root, purpose);
    execFileSync(process.execPath, ["-e", "require('node:fs').writeFileSync(process.argv[1], Buffer.from(process.argv[2], 'base64'))", listPath(root), bytes.toString("base64")]);
    expect(() => block(svc, 1)).toThrow(/revoked/);
  });

  it("a vault lock between two events refuses the next event", () => {
    const { root, svc } = openSession();
    block(svc, 0);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    lockVault(root);
    expect(() => block(svc, 1)).toThrow(/vault/i);
  });
});
