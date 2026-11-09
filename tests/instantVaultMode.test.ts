import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureInstantVaultMode } from "../src/cli/instantVaultMode.js";
import { setMode } from "../src/mode/mode.js";
import { initWorkspace } from "../src/workspace.js";
import { lockVault, unlockVault } from "../src/vault/vault.js";
import { loadLocalVaultPassphrase, localVaultPassphrasePath } from "../src/vault/localPassphrase.js";
import { AGENT_ENV_MARKERS } from "../src/vault/operatorContext.js";
import { rememberVaultPassphrase, unlockWithRememberedPassphrase } from "../src/vault/passphraseStore.js";

/**
 * LIVE-VAULT-02 (S4): bare `amc`, `amc run` and `amc init` sign with the operator's passphrase only. An in-process unlock
 * that did not come from AMC_VAULT_PASSPHRASE or the gated remembered store is not operator intent, and
 * `.amc/local-vault-passphrase` never reaches a process carrying an agent marker or in agent mode.
 */
const PASS = "instant-vault-pass-123";
const LOCKED_REASON = "Existing vault is locked and no passphrase is available; generated an unsigned full score.";
const roots: string[] = [];
const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");

function vaultWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-instant-vault-"));
  roots.push(root);
  const workspace = join(root, "ws");
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  lockVault(workspace);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
  return workspace;
}

beforeEach(() => {
  for (const name of AGENT_ENV_MARKERS) vi.stubEnv(name, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (stdinTTY) Object.defineProperty(process.stdin, "isTTY", stdinTTY);
  else delete (process.stdin as { isTTY?: boolean }).isTTY;
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("ensureInstantVaultMode signs only with the operator's passphrase", () => {
  it("treats a bare in-process unlock as no passphrase", () => {
    const workspace = vaultWorkspace();
    unlockVault(workspace, PASS);
    expect(ensureInstantVaultMode(workspace)).toEqual({ noSign: true, createdLocalPassphrase: false, localPassphrasePath: null, reason: LOCKED_REASON });
    lockVault(workspace);
  });

  it("signs after the gated remembered-store unlock", () => {
    const workspace = vaultWorkspace();
    const env = { AMC_VAULT_REMEMBER_FILE: join(workspace, "..", "creds.json") } as NodeJS.ProcessEnv;
    rememberVaultPassphrase(workspace, PASS, env);
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true, writable: true });
    unlockWithRememberedPassphrase(workspace, env);
    expect(ensureInstantVaultMode(workspace)).toEqual({ noSign: false, createdLocalPassphrase: false, localPassphrasePath: null, reason: null });
    expect(process.env.AMC_VAULT_PASSPHRASE).toBeUndefined();
    lockVault(workspace);
  });

  it("does not load .amc/local-vault-passphrase under an agent marker, and scores unsigned saying why", () => {
    const workspace = vaultWorkspace();
    writeFileSync(localVaultPassphrasePath(workspace), `${PASS}\n`, { mode: 0o600 });
    vi.stubEnv("CLAUDECODE", "1");
    const result = ensureInstantVaultMode(workspace);
    expect(result.noSign).toBe(true);
    expect(result.reason).toBe(".amc/local-vault-passphrase is not read under the agent marker CLAUDECODE; generated an unsigned full score.");
    expect(process.env.AMC_VAULT_PASSPHRASE).toBeUndefined();
  });

  it("loads it for a non-agent process", () => {
    const workspace = vaultWorkspace();
    writeFileSync(localVaultPassphrasePath(workspace), `${PASS}\n`, { mode: 0o600 });
    expect(ensureInstantVaultMode(workspace)).toEqual({ noSign: false, createdLocalPassphrase: false, localPassphrasePath: localVaultPassphrasePath(workspace), reason: null });
    expect(process.env.AMC_VAULT_PASSPHRASE).toBe(PASS);
  });
});

describe("loadLocalVaultPassphrase", () => {
  function fileWorkspace(): string {
    const root = mkdtempSync(join(tmpdir(), "amc-local-pass-"));
    roots.push(root);
    setMode(root, "owner");
    writeFileSync(localVaultPassphrasePath(root), ` ${PASS} \n`, { mode: 0o600 });
    return root;
  }

  it("refuses under a marker and leaves the environment alone; loads the trimmed value otherwise", () => {
    const workspace = fileWorkspace();
    const marked: NodeJS.ProcessEnv = { CLAUDECODE: "1" };
    expect(loadLocalVaultPassphrase(workspace, marked)).toEqual({ loaded: false, reason: "agent-marker", marker: "CLAUDECODE" });
    expect(marked.AMC_VAULT_PASSPHRASE).toBeUndefined();
    const operator: NodeJS.ProcessEnv = {};
    expect(loadLocalVaultPassphrase(workspace, operator)).toEqual({ loaded: true });
    expect(operator.AMC_VAULT_PASSPHRASE).toBe(PASS);
  });

  it("refuses in agent mode", () => {
    const workspace = fileWorkspace();
    setMode(workspace, "agent");
    const env: NodeJS.ProcessEnv = {};
    expect(loadLocalVaultPassphrase(workspace, env)).toEqual({ loaded: false, reason: "agent-mode" });
    expect(env.AMC_VAULT_PASSPHRASE).toBeUndefined();
  });

  it("leaves an exported AMC_VAULT_PASSPHRASE in charge, and skips an absent or short file", () => {
    const workspace = fileWorkspace();
    const exported: NodeJS.ProcessEnv = { AMC_VAULT_PASSPHRASE: "operator-exported-pass" };
    expect(loadLocalVaultPassphrase(workspace, exported)).toEqual({ loaded: false });
    expect(exported.AMC_VAULT_PASSPHRASE).toBe("operator-exported-pass");
    writeFileSync(localVaultPassphrasePath(workspace), "short\n");
    expect(loadLocalVaultPassphrase(workspace, {})).toEqual({ loaded: false });
    rmSync(localVaultPassphrasePath(workspace));
    expect(loadLocalVaultPassphrase(workspace, {})).toEqual({ loaded: false });
  });
});
