import { randomBytes, scryptSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import YAML from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { authenticateUser, initUsersConfig, listUsers, usersConfigPath, usersConfigSigPath, verifyUsersConfigSignature } from "../src/auth/authApi.js";
import { hashPassword, PasswordPolicyError, verifyPassword } from "../src/auth/passwordHash.js";
import { getSigningKey, signHexDigest } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault, unlockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/** LIVE-VAULT-13: scrypt N=2^15 with an explicit maxmem, bounded parameters, a minimal policy, re-hash on login, a private users file. */
const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop()!;
    lockVault(root);
    rmSync(root, { recursive: true, force: true });
  }
});

/** A hash in the pre-LIVE-VAULT-13 form (N=16384), made directly with scrypt. */
function oldHash(password: string): string {
  const salt = randomBytes(16);
  return ["scrypt", "16384", "8", "1", "64", salt.toString("base64"), scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("base64")].join("$");
}

describe("password hashing", () => {
  test("new hashes encode N=32768 and verify; old N=16384 hashes still verify", () => {
    const hash = hashPassword("a-good-password-12");
    expect(hash.split("$").slice(0, 5)).toEqual(["scrypt", "32768", "8", "1", "64"]);
    expect(verifyPassword("a-good-password-12", hash)).toBe(true);
    expect(verifyPassword("a-bad-password-12", hash)).toBe(false);
    expect(verifyPassword("legacy-password", oldHash("legacy-password"))).toBe(true);
  });

  test("a hash string asking for more than 64 MiB, p=4 or a 128-byte key is refused quickly instead of running", () => {
    const salt = randomBytes(16).toString("base64"), derived = randomBytes(64).toString("base64");
    // Valid scrypt parameters (N < 2^(16r)) that would cost 512, 256 and 128 MiB, 16 times a current verify (skeptic SK-11)
    // or a 16 MiB derivation if accepted, so only the caps refuse them.
    for (const [n, r, p, keylen] of [[2 ** 21, 2, 1, 64], [2 ** 15, 64, 1, 64], [2 ** 17, 8, 1, 64], [2 ** 15, 8, 16, 64], [2 ** 15, 8, 1, 2 ** 24]]) {
      const started = performance.now();
      expect(verifyPassword("whatever-password", ["scrypt", n, r, p, keylen, salt, derived].join("$")), `${n}/${r}/${p}/${keylen}`).toBe(false);
      expect(performance.now() - started, `${n}/${r}/${p}/${keylen}`).toBeLessThan(100);
    }
  });

  test("the policy: at least 12 characters, and not the username", () => {
    expect(() => hashPassword("eleven-char")).toThrow(new PasswordPolicyError("password must be at least 12 characters"));
    expect(() => hashPassword("ownerowner12", { username: "OwnerOwner12" })).toThrow(PasswordPolicyError);
    expect(() => hashPassword("ownerowner12", { username: "someone-else" })).not.toThrow();
  });
});

describe("re-hash on login and the users file", () => {
  /** A workspace whose only account has an old-N hash, re-signed the way users.yaml always is. */
  function legacyAccount(): string {
    const workspace = mkdtempSync(join(tmpdir(), "amc-rehash-"));
    roots.push(workspace);
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    initUsersConfig({ workspace, username: "owner", password: "owner-rehash-pass" });
    const config = YAML.parse(readFileSync(usersConfigPath(workspace), "utf8"));
    config.users[0].passwordHash = oldHash("owner-rehash-pass");
    const bytes = Buffer.from(YAML.stringify(config), "utf8");
    writeFileSync(usersConfigPath(workspace), bytes);
    const digest = sha256Hex(bytes);
    writeFileSync(usersConfigSigPath(workspace), JSON.stringify({ digestSha256: digest, signature: signHexDigest(digest, getSigningKey(workspace, "config-signature")), signedTs: Date.now(), signer: "auditor" }));
    expect(verifyUsersConfigSignature(workspace).valid).toBe(true);
    return workspace;
  }
  const storedN = (workspace: string) => listUsers(workspace)[0]!.passwordHash.split("$")[1];

  test("a successful login with the vault unlocked re-hashes an old hash, signed", () => {
    const workspace = legacyAccount();
    unlockVault(workspace, process.env.AMC_VAULT_PASSPHRASE!);
    expect(authenticateUser({ workspace, username: "owner", password: "owner-rehash-pass" }).ok).toBe(true);
    expect(storedN(workspace)).toBe("32768");
    expect(verifyUsersConfigSignature(workspace).valid).toBe(true);
    expect(authenticateUser({ workspace, username: "owner", password: "owner-rehash-pass" }).ok).toBe(true);
  });

  test("with the vault locked the hash stays and the login still succeeds; a failed login never re-hashes", () => {
    const workspace = legacyAccount();
    lockVault(workspace);
    expect(authenticateUser({ workspace, username: "owner", password: "owner-rehash-pass" }).ok).toBe(true);
    expect(storedN(workspace)).toBe("16384");
    unlockVault(workspace, process.env.AMC_VAULT_PASSPHRASE!);
    expect(authenticateUser({ workspace, username: "owner", password: "not-the-password" }).ok).toBe(false);
    expect(storedN(workspace)).toBe("16384");
  });

  test.skipIf(process.platform === "win32")("users.yaml and its signature are written 0600", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-users-mode-"));
    roots.push(workspace);
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    initUsersConfig({ workspace, username: "owner", password: "owner-mode-pass-123" });
    expect(statSync(usersConfigPath(workspace)).mode & 0o777).toBe(0o600);
    expect(statSync(usersConfigSigPath(workspace)).mode & 0o777).toBe(0o600);
  });
});
