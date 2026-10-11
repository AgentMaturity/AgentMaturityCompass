import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPrivateKeyPem, getPublicKeyHistory, getPublicKeyPem, signHexDigest, verifyHexDigestAny } from "../../src/crypto/keys.js";
import { keysetPaths } from "../../src/keys/keyset.js";
import { getSigningKey, getSigningPublicKeyPem, resumeKeyRotation, rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { lockVault, unlockVault, vaultPaths } from "../../src/vault/vault.js";
import { decryptVaultPayload } from "../../src/vault/vaultCrypto.js";
import { ensureSigningKeys } from "../../src/crypto/keys.js";
import { v1Workspace } from "../helpers/legacyVault.js";

// Crash injection: the k-th renameSync anywhere under node:fs throws, as a process killed mid-rename would leave it.
const crash = vi.hoisted(() => ({ at: 0, count: 0 }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const renameSync: typeof actual.renameSync = (from, to) => {
    crash.count += 1;
    if (crash.at > 0 && crash.count === crash.at) throw new Error(`simulated crash at rename ${crash.at}`);
    return actual.renameSync(from, to);
  };
  return { ...actual, renameSync, default: { ...actual, renameSync } };
});

const PASS = "amc-test-passphrase";
const INCOMPLETE = /key set generation \d+ is incomplete; run `amc keys rotate --resume`/;
const roots: string[] = [];
afterEach(() => {
  crash.at = 0;
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
});

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-atomic-rotation-"));
  roots.push(root);
  ensureSigningKeys(root);
  return root;
}

function renamesDuring(run: () => void): number {
  crash.at = 0;
  crash.count = 0;
  run();
  return crash.count;
}

function crashAt(k: number, run: () => void): boolean {
  crash.at = k;
  crash.count = 0;
  try {
    run();
    return false;
  } catch (error) {
    expect(String(error)).toMatch(/simulated crash/);
    return true;
  } finally {
    crash.at = 0;
  }
}

describe("atomic rotation (P1-08)", () => {
  it("every crash inside a rotation's commit refuses to sign and verify until --resume, and resume completes or rolls back", () => {
    const total = renamesDuring(() => rotatePurposeKeys({ workspace: workspace(), purposes: ["artifact-seal"], passphrase: PASS }));
    expect(total).toBeGreaterThan(10);
    const outcomes = new Set<string>();
    for (let k = 1; k <= total; k += 1) {
      const root = workspace();
      const before = getSigningKey(root, "artifact-seal");
      const digest = "d".repeat(64);
      const oldSignature = signHexDigest(digest, before);
      if (!crashAt(k, () => rotatePurposeKeys({ workspace: root, purposes: ["artifact-seal"], passphrase: PASS }))) continue;
      const pending = existsSync(keysetPaths(root).pending);
      if (pending) {
        expect(() => getSigningKey(root, "artifact-seal"), `rename ${k}`).toThrow(INCOMPLETE);
        expect(() => getPrivateKeyPem(root, "monitor"), `rename ${k}`).toThrow(INCOMPLETE);
        expect(() => getPublicKeyPem(root, "auditor"), `rename ${k}`).toThrow(INCOMPLETE);
        const resumed = resumeKeyRotation(root);
        outcomes.add(resumed.action);
        expect(["completed", "rolled-back"]).toContain(resumed.action);
      } else {
        outcomes.add("no-pending");
      }
      unlockVault(root, PASS);
      const after = getSigningKey(root, "artifact-seal");
      // One coherent key set: the vault key is the published one, and old signatures verify through the history.
      expect(getSigningPublicKeyPem(root, "artifact-seal")).toBe(getPublicKeyPem(root, "auditor"));
      expect(verifyHexDigestAny(digest, signHexDigest(digest, after), [getSigningPublicKeyPem(root, "artifact-seal")])).toBe(true);
      expect(verifyHexDigestAny(digest, oldSignature, getPublicKeyHistory(root, "auditor")), `rename ${k}`).toBe(true);
    }
    expect(outcomes.has("completed")).toBe(true);
  }, 240_000);

  it("a public key that lost the digest its generation recorded refuses signing, even with the pending marker deleted", () => {
    const root = workspace();
    const total = renamesDuring(() => rotatePurposeKeys({ workspace: workspace(), purposes: ["artifact-seal"], passphrase: PASS }));
    for (let k = 1; k <= total; k += 1) {
      const candidate = workspace();
      if (!crashAt(k, () => rotatePurposeKeys({ workspace: candidate, purposes: ["artifact-seal"], passphrase: PASS }))) continue;
      const committed = JSON.parse(readFileSync(keysetPaths(candidate).keyset, "utf8")) as { files: Record<string, string> };
      const moved = Object.entries(committed.files).some(([rel, digest]) => rel.endsWith(".pub") && existsSync(join(candidate, ".amc", rel))
        && createHash("sha256").update(readFileSync(join(candidate, ".amc", rel))).digest("hex") !== digest);
      if (!existsSync(keysetPaths(candidate).pending) || !moved) continue;
      rmSync(keysetPaths(candidate).pending);
      expect(() => getSigningKey(candidate, "artifact-seal")).toThrow(/does not have the digest generation 1 recorded/);
      expect(() => getPrivateKeyPem(candidate, "auditor")).toThrow(INCOMPLETE);
      return;
    }
    expect.unreachable(`no crash point between a public-key rename and the commit (${root})`);
  }, 120_000);

  it("a v1 vault migration that crashes at any rename loses no key and converges on resume", () => {
    const fixture = v1Workspace(PASS);
    roots.push(fixture.root);
    const total = renamesDuring(() => unlockVault(fixture.root, PASS));
    expect(total).toBeGreaterThan(10);
    for (let k = 1; k <= total; k += 1) {
      const { root, roles } = v1Workspace(PASS);
      roots.push(root);
      if (!crashAt(k, () => unlockVault(root, PASS))) continue;
      lockVault(root);
      if (existsSync(keysetPaths(root).pending)) {
        // Fail closed either way: a v1 vault cannot migrate over the pending generation, a v2 one cannot sign.
        let unlocked = true;
        try { unlockVault(root, PASS); } catch (error) { unlocked = false; expect(String(error), `rename ${k}`).toMatch(INCOMPLETE); }
        if (unlocked) expect(() => getSigningKey(root, "receipt"), `rename ${k}`).toThrow(INCOMPLETE);
        resumeKeyRotation(root);
        lockVault(root);
      }
      // Whatever the crash left, the vault on disk still opens to the same keys.
      const raw = JSON.parse(decryptVaultPayload(JSON.parse(readFileSync(vaultPaths(root).vaultFile, "utf8")), PASS).toString("utf8"));
      expect(raw.v === 1 ? raw.monitorPrivateKeyPem : raw.keys["ledger-row"].privateKeyPem, `rename ${k}`).toBe(roles.monitor.privatePem);
      unlockVault(root, PASS);
      expect(getSigningKey(root, "receipt"), `rename ${k}`).toBe(roles.monitor.privatePem);
      expect(getSigningKey(root, "artifact-seal")).toBe(roles.auditor.privatePem);
      expect(getPrivateKeyPem(root, "lease")).toBe(roles.lease.privatePem);
      expect(getPublicKeyPem(root, "monitor")).toBe(roles.monitor.publicPem);
    }
  }, 240_000);
});
