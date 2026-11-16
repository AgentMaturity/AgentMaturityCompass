/**
 * Vault key derivation (vault lane, 2026-11-16): new vaults use PBKDF2-SHA-256 at 600,000 iterations, stored in the
 * header; an existing vault opens with its stored or legacy count and a rewrite keeps that count; a header that asks
 * for fewer than the legacy count (a downgrade) or an absurd number (a stall) is refused before any work.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import {
  decryptVaultPayload, encryptVaultPayload, LEGACY_VAULT_ITERATIONS, storedVaultIterations, VAULT_ITERATIONS, type VaultEnvelope
} from "../src/vault/vaultCrypto.js";
import { initWorkspace } from "../src/workspace.js";
import { setVaultSecret, getVaultSecret, vaultPaths } from "../src/vault/vault.js";

const PASS = "kdf-test-passphrase";
const plain = Buffer.from("payload");
const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

describe("vault key derivation", () => {
  test("a new envelope uses 600,000 iterations and says so in its header", () => {
    const envelope = encryptVaultPayload(plain, PASS);
    expect(VAULT_ITERATIONS).toBe(600_000);
    expect(envelope.kdf.iterations).toBe(600_000);
    expect(decryptVaultPayload(envelope, PASS).equals(plain)).toBe(true);
  });

  test("a legacy envelope opens with its stored count, or the legacy count when the header names none", () => {
    const legacy = encryptVaultPayload(plain, PASS, LEGACY_VAULT_ITERATIONS);
    expect(decryptVaultPayload(legacy, PASS).equals(plain)).toBe(true);
    const unnamed = { ...legacy, kdf: { ...legacy.kdf } } as VaultEnvelope;
    delete (unnamed.kdf as Partial<VaultEnvelope["kdf"]>).iterations;
    expect(decryptVaultPayload(unnamed, PASS).equals(plain)).toBe(true);
  });

  test.each([[100_000, "a downgrade"], [2_000_000_000, "a stall"], [600_000.5, "not a whole number"]])("a header asking for %s rounds (%s) is refused", (iterations) => {
    const envelope = encryptVaultPayload(plain, PASS);
    const started = Date.now();
    expect(() => decryptVaultPayload({ ...envelope, kdf: { ...envelope.kdf, iterations } }, PASS)).toThrow(/key-derivation rounds.*restore it from a backup/);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test("other key-derivation settings AMC never writes are refused", () => {
    const envelope = encryptVaultPayload(plain, PASS);
    expect(() => decryptVaultPayload({ ...envelope, kdf: { ...envelope.kdf, keyLen: 16 } }, PASS)).toThrow(/settings AMC does not write/);
  });

  test("a new workspace vault is written at 600,000; an existing 210,000 vault keeps its count when rewritten", () => {
    const ws = mkdtempSync(join(tmpdir(), "amc-vault-kdf-"));
    dirs.push(ws);
    process.env.AMC_VAULT_PASSPHRASE ??= "amc-test-passphrase";
    const passphrase = process.env.AMC_VAULT_PASSPHRASE;
    initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
    const file = vaultPaths(ws).vaultFile;
    expect(storedVaultIterations(readFileSync(file))).toBe(600_000);
    const downgradedForTest = encryptVaultPayload(decryptVaultPayload(JSON.parse(readFileSync(file, "utf8")) as VaultEnvelope, passphrase), passphrase, LEGACY_VAULT_ITERATIONS);
    writeFileSync(file, JSON.stringify(downgradedForTest, null, 2));
    setVaultSecret(ws, "kept", "value");
    expect(storedVaultIterations(readFileSync(file))).toBe(LEGACY_VAULT_ITERATIONS);
    expect(getVaultSecret(ws, "kept")).toBe("value");
  });
});
