import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { sign, verify } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const prompt = vi.hoisted(() => vi.fn());
vi.mock("inquirer", () => ({ default: { prompt } }));
/** SR-V1: runs once, right after the passphrase change's owner gate opened the vault (as another process committing then). */
const hooks = vi.hoisted(() => ({ afterGate: null as null | (() => void) }));
vi.mock("../src/vault/vault.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/vault/vault.js")>();
  return { ...real, unlockedPayloadForKeyChange: (workspace: string, passphrase: string) => {
    const payload = real.unlockedPayloadForKeyChange(workspace, passphrase);
    const hook = hooks.afterGate;
    hooks.afterGate = null;
    hook?.();
    return payload;
  } };
});

import { workspaceScope } from "../src/keys/highWater.js";
import { assertKeysetComplete, commitKeyset, restoreCommittedKeyset } from "../src/keys/keyset.js";
import { getSigningKey, getSigningPublicKeyPem, rotatePurposeKeys } from "../src/keys/purposeKeys.js";
import { withControlFileLock } from "../src/lifecycle/controlFileLock.js";
import { sha256Hex } from "../src/utils/hash.js";
import { localVaultPassphrasePath } from "../src/vault/localPassphrase.js";
import { AGENT_ENV_MARKERS } from "../src/vault/operatorContext.js";
import { getRememberedVaultPassphrase, rememberVaultPassphrase } from "../src/vault/passphraseStore.js";
import { deleteVaultSecret, lockVault, setVaultSecret, unlockVault, vaultEnvelopeKeyIds, vaultPaths, vaultStatus } from "../src/vault/vault.js";
import { changeVaultPassphrase, changeVaultPassphraseInteractive } from "../src/vault/vaultCli.js";
import { decryptVaultPayload, encryptVaultPayload } from "../src/vault/vaultCrypto.js";
import { initWorkspace } from "../src/workspace.js";
import { v1Workspace } from "./helpers/legacyVault.js";

/** LIVE-VAULT-19: `amc vault passphrase` re-seals the vault under a new passphrase without changing a key. */
const OLD = "old-vault-passphrase-1";
const NEXT = "new-vault-passphrase-2";
const roots: string[] = [];
const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");

beforeEach(() => {
  for (const name of AGENT_ENV_MARKERS) vi.stubEnv(name, undefined);
  prompt.mockReset();
  hooks.afterGate = null;
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

/** Every vault envelope this machine keeps for the workspace in AMC home: key-set recovery copies, pre-images, the v1 vault. */
function recoveryEnvelopes(ws: string): string[] {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? walk(join(dir, entry.name)) : /\.amcvault/.test(entry.name) && !entry.name.endsWith(".json") ? [join(dir, entry.name)] : []);
  return walk(join(process.env.AMC_HOME!, "state", "keyset-recovery", workspaceScope(ws)));
}
const opens = (file: string, passphrase: string) => vaultEnvelopeKeyIds(readFileSync(file, "utf8"), passphrase) !== null;

describe("the copies AMC keeps, and concurrent key changes (skeptic: copies, SR-V1, local file)", () => {
  test("every vault copy in AMC home is re-sealed, so `amc keys rotate --restore` brings a lost vault back with the new passphrase", () => {
    const { ws } = workspace();
    rotatePurposeKeys({ workspace: ws, purposes: ["receipt"], passphrase: OLD });
    const before = recoveryEnvelopes(ws);
    expect(before.length).toBeGreaterThan(1);
    const result = changeVaultPassphrase(ws, OLD, NEXT);
    const after = recoveryEnvelopes(ws);
    expect(after.length).toBeGreaterThan(before.length);
    for (const file of after) {
      expect(opens(file, OLD), file).toBe(false);
      expect(opens(file, NEXT), file).toBe(true);
    }
    expect(result.unopenedCopies).toEqual([]);
    renameSync(vaultPaths(ws).vaultFile, `${vaultPaths(ws).vaultFile}.lost`);
    const restored = restoreCommittedKeyset(ws, { vaultKeyIds: (bytes) => vaultEnvelopeKeyIds(bytes.toString("utf8"), NEXT) });
    expect(restored.restored).toContain("vault.amcvault");
    expect(() => unlockVault(ws, OLD)).toThrow();
    expect(() => unlockVault(ws, NEXT)).not.toThrow();
  });

  test("a migrated 1.x workspace's v1 vault kept in AMC home is re-sealed too", () => {
    const { root } = v1Workspace(OLD);
    roots.push(root);
    unlockVault(root, OLD);
    const previous = join(process.env.AMC_HOME!, "state", "keyset-recovery", workspaceScope(root), "previous-vault.amcvault");
    expect(decryptVaultPayload(JSON.parse(readFileSync(previous, "utf8")), OLD).length).toBeGreaterThan(0);
    changeVaultPassphrase(root, OLD, NEXT);
    expect(() => decryptVaultPayload(JSON.parse(readFileSync(previous, "utf8")), OLD)).toThrow();
    expect(JSON.parse(decryptVaultPayload(JSON.parse(readFileSync(previous, "utf8")), NEXT).toString("utf8")).v).toBe(1);
  });

  test("a sealed child vault the key set pins is re-sealed in the same generation", () => {
    const { ws } = workspace();
    const child = join(ws, ".amc", "keys", "receipt-child.amcvault");
    const keyset = assertKeysetComplete(ws)!;
    commitKeyset(ws, { keys: keyset.keys, expectedGeneration: keyset.generation,
      writes: [{ path: child, bytes: JSON.stringify(encryptVaultPayload(Buffer.from("child key material"), OLD)), mode: 0o600 }] });
    const result = changeVaultPassphrase(ws, OLD, NEXT);
    const sealed = readFileSync(child, "utf8");
    expect(() => decryptVaultPayload(JSON.parse(sealed), OLD)).toThrow();
    expect(decryptVaultPayload(JSON.parse(sealed), NEXT).toString("utf8")).toBe("child key material");
    expect(assertKeysetComplete(ws)).toMatchObject({ generation: result.generation, files: { "keys/receipt-child.amcvault": sha256Hex(sealed) } });
  });

  test("a rotation committed after the passphrase was checked makes the change refuse, and the rotation stands", () => {
    const { ws } = workspace();
    let rotatedTo: string | null = null;
    hooks.afterGate = () => { rotatedTo = rotatePurposeKeys({ workspace: ws, purposes: ["receipt"], passphrase: OLD }).rotated[0]!.nextKeyId; };
    expect(() => changeVaultPassphrase(ws, OLD, NEXT)).toThrow("the vault changed while its passphrase was being changed");
    expect(rotatedTo).not.toBeNull();
    expect(() => unlockVault(ws, NEXT)).toThrow();
    expect(() => unlockVault(ws, OLD)).not.toThrow();
    expect(vaultEnvelopeKeyIds(readFileSync(vaultPaths(ws).vaultFile, "utf8"), OLD)?.receipt).toBe(rotatedTo);
  });

  test("a secret written after the passphrase was checked makes the change refuse, and the secret stays", () => {
    const { ws } = workspace();
    hooks.afterGate = () => setVaultSecret(ws, "probe", "written meanwhile");
    expect(() => changeVaultPassphrase(ws, OLD, NEXT)).toThrow("the vault changed while its passphrase was being changed");
    const payload = JSON.parse(decryptVaultPayload(JSON.parse(readFileSync(vaultPaths(ws).vaultFile, "utf8")), OLD).toString("utf8"));
    expect(payload.secrets.probe).toBe("written meanwhile");
  });

  test("a passphrase change committed while a rotation was prepared makes the rotation refuse, and the new passphrase stands", () => {
    const { ws } = workspace();
    hooks.afterGate = () => { changeVaultPassphrase(ws, OLD, NEXT); };
    expect(() => rotatePurposeKeys({ workspace: ws, purposes: ["receipt"], passphrase: OLD })).toThrow("the committed key set changed while this generation was prepared");
    expect(() => unlockVault(ws, OLD)).toThrow();
    expect(() => unlockVault(ws, NEXT)).not.toThrow();
  });

  test("waits for the key-change lock that rotation and revocation hold, and the vault-envelope lock that secret writes hold", () => {
    const { ws } = workspace();
    const held = (name: string, run: () => void) => withControlFileLock({ root: vaultPaths(ws).keysDir, name, operation: run });
    held("key-revocations", () => expect(() => changeVaultPassphrase(ws, OLD, NEXT)).toThrow("key-revocations is busy"));
    held("vault-envelope", () => expect(() => changeVaultPassphrase(ws, OLD, NEXT)).toThrow("vault-envelope is busy"));
    unlockVault(ws, OLD);
    held("vault-envelope", () => expect(() => setVaultSecret(ws, "probe", "value")).toThrow("vault-envelope is busy"));
    held("vault-envelope", () => expect(() => deleteVaultSecret(ws, "probe")).toThrow("vault-envelope is busy"));
    expect(() => unlockVault(ws, OLD)).not.toThrow();
  }, 40_000);

  test("removes .amc/local-vault-passphrase, which holds the old passphrase", () => {
    const { ws } = workspace();
    writeFileSync(localVaultPassphrasePath(ws), `${OLD}\n`, { mode: 0o600 });
    expect(changeVaultPassphrase(ws, OLD, NEXT).localPassphraseRemoved).toBe(true);
    expect(existsSync(localVaultPassphrasePath(ws))).toBe(false);
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
