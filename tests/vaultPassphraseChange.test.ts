import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { sign, verify } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const prompt = vi.hoisted(() => vi.fn());
vi.mock("inquirer", () => ({ default: { prompt } }));

import { getSigningKey, getSigningPublicKeyPem } from "../src/keys/purposeKeys.js";
import { AGENT_ENV_MARKERS } from "../src/vault/operatorContext.js";
import { getRememberedVaultPassphrase, rememberVaultPassphrase } from "../src/vault/passphraseStore.js";
import { lockVault, unlockVault, vaultEnvelopeKeyIds, vaultPaths, vaultStatus } from "../src/vault/vault.js";
import { changeVaultPassphrase, changeVaultPassphraseInteractive } from "../src/vault/vaultCli.js";
import { initWorkspace } from "../src/workspace.js";

/** LIVE-VAULT-19: `amc vault passphrase` re-seals the vault under a new passphrase without changing a key. */
const OLD = "old-vault-passphrase-1";
const NEXT = "new-vault-passphrase-2";
const roots: string[] = [];
const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");

beforeEach(() => {
  for (const name of AGENT_ENV_MARKERS) vi.stubEnv(name, undefined);
  prompt.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  if (stdinTTY) Object.defineProperty(process.stdin, "isTTY", stdinTTY);
  else delete (process.stdin as { isTTY?: boolean }).isTTY;
  while (roots.length > 0) {
    const root = roots.pop()!;
    lockVault(root);
    rmSync(root, { recursive: true, force: true });
  }
});

function workspace(): { ws: string; env: NodeJS.ProcessEnv } {
  const root = mkdtempSync(join(tmpdir(), "amc-vault-passphrase-"));
  roots.push(root);
  const ws = join(root, "ws");
  vi.stubEnv("AMC_VAULT_PASSPHRASE", OLD);
  initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
  vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
  return { ws, env: { AMC_VAULT_REMEMBER_FILE: join(root, "creds.json") } };
}

describe("changeVaultPassphrase", () => {
  test("the new passphrase opens the vault, the old one does not, and no key or signature changes", () => {
    const { ws } = workspace();
    unlockVault(ws, OLD);
    const message = Buffer.from("signed before the change");
    const signature = sign(null, message, getSigningKey(ws, "receipt"));
    const keysBefore = vaultEnvelopeKeyIds(readFileSync(vaultPaths(ws).vaultFile, "utf8"), OLD);
    changeVaultPassphrase(ws, OLD, NEXT);
    expect(vaultStatus(ws).unlocked).toBe(false);
    expect(() => unlockVault(ws, OLD)).toThrow();
    expect(() => unlockVault(ws, NEXT)).not.toThrow();
    expect(vaultEnvelopeKeyIds(readFileSync(vaultPaths(ws).vaultFile, "utf8"), NEXT)).toEqual(keysBefore);
    expect(keysBefore).not.toBeNull();
    expect(verify(null, message, getSigningPublicKeyPem(ws, "receipt"), signature)).toBe(true);
  });

  test("forgets the remembered entry, and refuses a wrong current passphrase without changing anything", () => {
    const { ws, env } = workspace();
    vi.stubEnv("AMC_VAULT_REMEMBER_FILE", env.AMC_VAULT_REMEMBER_FILE!);
    rememberVaultPassphrase(ws, OLD);
    const before = readFileSync(vaultPaths(ws).vaultFile, "utf8");
    expect(() => changeVaultPassphrase(ws, "not-the-passphrase", NEXT)).toThrow();
    expect(readFileSync(vaultPaths(ws).vaultFile, "utf8")).toBe(before);
    changeVaultPassphrase(ws, OLD, NEXT);
    expect(getRememberedVaultPassphrase(ws)).toBeNull();
  });
});

describe("amc vault passphrase", () => {
  test("asks for the current passphrase and the new one twice, and a mismatch changes nothing", async () => {
    const { ws } = workspace();
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true, writable: true });
    const before = readFileSync(vaultPaths(ws).vaultFile, "utf8");
    prompt.mockResolvedValueOnce({ passphrase: OLD }).mockResolvedValueOnce({ passphrase: NEXT }).mockResolvedValueOnce({ passphrase: "typo-passphrase-3" });
    await expect(changeVaultPassphraseInteractive(ws)).rejects.toThrow("The new passphrases do not match; nothing changed.");
    expect(readFileSync(vaultPaths(ws).vaultFile, "utf8")).toBe(before);
    prompt.mockResolvedValueOnce({ passphrase: OLD }).mockResolvedValueOnce({ passphrase: NEXT }).mockResolvedValueOnce({ passphrase: NEXT });
    await changeVaultPassphraseInteractive(ws);
    expect(() => unlockVault(ws, NEXT)).not.toThrow();
  });

  test("refuses without a terminal and never prompts", async () => {
    const { ws } = workspace();
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true, writable: true });
    await expect(changeVaultPassphraseInteractive(ws)).rejects.toThrow("re-run this command from your terminal");
    expect(prompt).not.toHaveBeenCalled();
  });
});
