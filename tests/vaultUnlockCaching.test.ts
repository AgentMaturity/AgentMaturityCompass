import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault, unlockVault, vaultPaths, vaultStatus, getVaultSecret, setVaultSecret } from "../src/vault/vault.js";
import * as vaultCrypto from "../src/vault/vaultCrypto.js";
import { readBlobKeyMaterial } from "../src/storage/blobs/blobKeys.js";

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

function diskState(dir: string): Record<string, { bytes: string; mtimeMs: number; mode: number }> {
  const paths = vaultPaths(dir);
  return Object.fromEntries([
    paths.vaultFile,
    paths.metaFile,
    ...readdirSync(paths.keysDir).sort().map((name) => join(paths.keysDir, name))
  ].map((path) => {
    const stat = statSync(path);
    return [path, { bytes: readFileSync(path).toString("hex"), mtimeMs: stat.mtimeMs, mode: stat.mode }];
  }));
}

function writeSecretInChild(dir: string): void {
  const vaultModule = pathToFileURL(resolve("src/vault/vault.ts")).href;
  const child = spawnSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `import { unlockVault, setVaultSecret } from ${JSON.stringify(vaultModule)};
     unlockVault(process.argv[1], process.env.AMC_VAULT_PASSPHRASE);
     setVaultSecret(process.argv[1], "child-token", "child-value");`,
    dir
  ], { encoding: "utf8", env: { ...process.env, AMC_VAULT_PASSPHRASE: PASS }, timeout: 30_000 });
  expect(child.status, child.stderr).toBe(0);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      lockVault(root);
      rmSync(root, { recursive: true, force: true });
    }
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

  it("reads a child process secret update without unlocking or rewriting trust files", () => {
    const dir = workspace(PASS);
    setVaultSecret(dir, "parent-token", "parent-value");
    writeSecretInChild(dir);
    const before = diskState(dir);
    const decrypt = vi.spyOn(vaultCrypto, "decryptVaultPayload");

    expect(getVaultSecret(dir, "child-token")).toBe("child-value");
    expect(getVaultSecret(dir, "parent-token")).toBe("parent-value");
    expect(getVaultSecret(dir, "child-token")).toBe("child-value");
    expect(decrypt).toHaveBeenCalledTimes(1);
    expect(diskState(dir)).toEqual(before);
  });

  it("refreshes legacy secrets in memory without upgrading missing lease or session keys", () => {
    const dir = workspace(PASS);
    const paths = vaultPaths(dir);
    const payload = JSON.parse(vaultCrypto.decryptVaultPayload(JSON.parse(readFileSync(paths.vaultFile, "utf8")), PASS).toString("utf8"));
    delete payload.leasePrivateKeyPem;
    delete payload.sessionPrivateKeyPem;
    payload.secrets["legacy-token"] = "legacy-value";
    writeFileSync(paths.vaultFile, JSON.stringify(vaultCrypto.encryptVaultPayload(Buffer.from(JSON.stringify(payload)), PASS)));
    const before = diskState(dir);

    expect(getVaultSecret(dir, "legacy-token")).toBe("legacy-value");
    expect(diskState(dir)).toEqual(before);
  });

  it("reads cold blob secrets without unlocking ordinary access or repeating the KDF", () => {
    const dir = workspace(PASS);
    const material = Buffer.alloc(32, 7);
    setVaultSecret(dir, "vault.secrets.blobKeys.1", material.toString("base64"));
    lockVault(dir);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
    const before = diskState(dir);
    const decrypt = vi.spyOn(vaultCrypto, "decryptVaultPayload");

    expect(readBlobKeyMaterial(dir, 1)).toEqual(material);
    expect(readBlobKeyMaterial(dir, 1)).toEqual(material);
    expect(decrypt).toHaveBeenCalledTimes(1);
    expect(vaultStatus(dir).unlocked).toBe(false);
    expect(() => getVaultSecret(dir, "vault.secrets.blobKeys.1")).toThrow(/Vault locked/);
    expect(diskState(dir)).toEqual(before);

    // A previous successful read must not authorize a different or absent phrase.
    vi.stubEnv("AMC_VAULT_PASSPHRASE", OTHER_PASS);
    expect(() => readBlobKeyMaterial(dir, 1)).toThrow();
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    expect(() => readBlobKeyMaterial(dir, 1)).toThrow();
    vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
    expect(readBlobKeyMaterial(dir, 1)).toEqual(material);
    lockVault(dir);
    const callsBefore = decrypt.mock.calls.length;
    expect(readBlobKeyMaterial(dir, 1)).toEqual(material);
    expect(decrypt.mock.calls.length).toBe(callsBefore + 1);
    expect(diskState(dir)).toEqual(before);
  });

  it.each(["missing", "corrupt", "wrong-passphrase", "invalid-payload"] as const)(
    "refuses stale secrets when the on-disk vault is %s",
    (replacement) => {
      const dir = workspace(PASS);
      setVaultSecret(dir, "cached-token", "must-not-be-served");
      const path = vaultPaths(dir).vaultFile;
      if (replacement === "missing") rmSync(path);
      else if (replacement === "corrupt") writeFileSync(path, "not a vault");
      else if (replacement === "wrong-passphrase") copyFileSync(vaultPaths(workspace(OTHER_PASS)).vaultFile, path);
      else writeFileSync(path, JSON.stringify(vaultCrypto.encryptVaultPayload(Buffer.from('{"v":2}'), PASS)));
      const before = replacement === "missing" ? null : diskState(dir);

      expect(() => getVaultSecret(dir, "cached-token")).toThrow(/Vault (refresh failed|file not found)/);
      expect(vaultStatus(dir).unlocked).toBe(false);
      expect(() => getVaultSecret(dir, "cached-token")).toThrow(/Vault locked/);
      if (before) expect(diskState(dir)).toEqual(before);
      else expect(vaultStatus(dir).exists).toBe(false);
    }
  );
});
