import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault, unlockVault, vaultPaths, vaultStatus, getVaultSecret, setVaultSecret } from "../src/vault/vault.js";

/**
 * Unlocking an already-unlocked vault must not re-run the passphrase KDF.
 *
 * Measured before the fix: `ensureSigningKeys` -> `ensureVaultAndPublicKeys`
 * -> `unlockVault` cost 24ms per call and sat inside `signArtifactFile`, so
 * every signed artifact in AMC paid a full key derivation it did not need —
 * the vault session was already unlocked in memory (which is why reading a
 * private key from it measures 0.001ms).
 *
 * The cache is keyed on BOTH the passphrase and a digest of the envelope on
 * disk. Keying it on the passphrase alone would be faster and wrong: a vault
 * replaced underneath a running process would keep serving the old keys.
 */
const PASS = "vault-unlock-caching-pass";
const OTHER_PASS = "vault-unlock-caching-other";
const roots: string[] = [];

function workspace(pass: string): string {
  const prior = process.env["AMC_VAULT_PASSPHRASE"];
  process.env["AMC_VAULT_PASSPHRASE"] = pass;
  const dir = mkdtempSync(join(tmpdir(), "amc-vault-cache-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  if (prior === undefined) delete process.env["AMC_VAULT_PASSPHRASE"];
  else process.env["AMC_VAULT_PASSPHRASE"] = prior;
  return dir;
}

function elapsedMs(times: number, fn: () => void): number {
  const start = process.hrtime.bigint();
  for (let i = 0; i < times; i += 1) fn();
  return Number(process.hrtime.bigint() - start) / 1e6 / times;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("unlocking an already-unlocked vault", () => {
  it("skips the key derivation entirely", () => {
    const dir = workspace(PASS);

    // Cold: locking clears the session, so this pays the full KDF.
    lockVault(dir);
    const cold = elapsedMs(3, () => {
      lockVault(dir);
      unlockVault(dir, PASS);
    });

    // Warm: the session is already unlocked with this exact passphrase.
    const warm = elapsedMs(50, () => unlockVault(dir, PASS));

    // Self-calibrating so this holds on a slow machine as well as a fast one.
    // The real gap measured ~24ms against ~0.02ms; a 5x margin is far inside it.
    expect(warm, `warm ${warm.toFixed(3)}ms should be far below cold ${cold.toFixed(3)}ms`)
      .toBeLessThan(cold / 5);
    expect(vaultStatus(dir).unlocked).toBe(true);
  });

  it("still rejects a wrong passphrase while unlocked", () => {
    // The cheap path must be reachable only by the passphrase that already
    // proved itself. Otherwise one correct unlock would authorise every later
    // caller regardless of what they present.
    const dir = workspace(PASS);
    unlockVault(dir, PASS);
    expect(() => unlockVault(dir, "definitely-not-the-passphrase")).toThrow(/Vault unlock failed/);
  });

  it("does not serve a cached session for a vault replaced on disk", () => {
    // A passphrase-only cache would return the OLD keys here, silently, for as
    // long as the process lived.
    const mine = workspace(PASS);
    const theirs = workspace(OTHER_PASS);
    unlockVault(mine, PASS);

    copyFileSync(vaultPaths(theirs).vaultFile, vaultPaths(mine).vaultFile);

    expect(
      () => unlockVault(mine, PASS),
      "the replaced vault does not open with the old passphrase"
    ).toThrow(/Vault unlock failed/);
  });

  it("re-reads after the vault is rewritten by a secret update", () => {
    // setVaultSecret re-encrypts the whole envelope, so the digest changes
    // under the same passphrase. The next unlock must pick up the new file.
    const dir = workspace(PASS);
    unlockVault(dir, PASS);
    setVaultSecret(dir, "api-token", "value-one");

    unlockVault(dir, PASS);
    expect(getVaultSecret(dir, "api-token")).toBe("value-one");

    setVaultSecret(dir, "api-token", "value-two");
    unlockVault(dir, PASS);
    expect(getVaultSecret(dir, "api-token"), "a stale cache would still read value-one").toBe("value-two");
  });
});
