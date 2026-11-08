import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMode } from "../src/mode/mode.js";
import { initWorkspace } from "../src/workspace.js";
import { lockVault, vaultStatus } from "../src/vault/vault.js";
import { AGENT_ENV_MARKERS } from "../src/vault/operatorContext.js";
import { rememberedUnlockLocation, rememberVaultPassphrase, unlockWithRememberedPassphrase } from "../src/vault/passphraseStore.js";
import { unlockVaultInteractive } from "../src/vault/vaultCli.js";

/**
 * B2: the passphrase `amc up` remembered unlocks the vault for the other commands of that workspace in a new shell
 * (amc verify, amc user init, amc vault unlock), in their own process only. AMC_VAULT_PASSPHRASE still wins, agent mode
 * never uses it, and the passphrase never reaches the environment or the output. LIVE-VAULT-01: only an interactive
 * operator gets it, so these cases run as one (stdin a terminal, the agent markers a Claude Code shell exports cleared);
 * tests/vaultOperatorGate.test.ts covers the refusals.
 */
const PASS = "remembered-unlock-pass-123";
const roots: string[] = [];

function lockedWorkspace(): { workspace: string; env: NodeJS.ProcessEnv; file: string } {
  const root = mkdtempSync(join(tmpdir(), "amc-remembered-unlock-"));
  roots.push(root);
  const workspace = join(root, "ws");
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  lockVault(workspace);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
  const file = join(root, "vault-credentials.json");
  return { workspace, env: { AMC_VAULT_REMEMBER_FILE: file } as NodeJS.ProcessEnv, file };
}

const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
beforeEach(() => {
  for (const name of AGENT_ENV_MARKERS) vi.stubEnv(name, undefined);
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true, writable: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (stdinTTY) Object.defineProperty(process.stdin, "isTTY", stdinTTY);
  else delete (process.stdin as { isTTY?: boolean }).isTTY;
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("remembered vault passphrase in later commands", () => {
  it("unlocks the vault in this process without putting the passphrase in the environment", () => {
    const { workspace, env, file } = lockedWorkspace();
    rememberVaultPassphrase(workspace, PASS, env);
    expect(vaultStatus(workspace).unlocked).toBe(false);
    unlockWithRememberedPassphrase(workspace, env);
    expect(vaultStatus(workspace).unlocked).toBe(true);
    expect(rememberedUnlockLocation(workspace)).toBe(file);
    expect(process.env.AMC_VAULT_PASSPHRASE).toBeUndefined();
    expect(env.AMC_VAULT_PASSPHRASE).toBeUndefined();
  });

  it("leaves AMC_VAULT_PASSPHRASE in charge when it is set", () => {
    const { workspace, env } = lockedWorkspace();
    rememberVaultPassphrase(workspace, "a-stale-remembered-pass", env);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    unlockWithRememberedPassphrase(workspace, { ...env, AMC_VAULT_PASSPHRASE: PASS });
    expect(vaultStatus(workspace).unlocked).toBe(false);
    expect(stderr).not.toHaveBeenCalled();
  });

  it("stays locked on a remembered passphrase that does not open the vault, and says so without printing it", () => {
    const { workspace, env, file } = lockedWorkspace();
    rememberVaultPassphrase(workspace, "wrong-remembered-pass", env);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    unlockWithRememberedPassphrase(workspace, env);
    expect(vaultStatus(workspace).unlocked).toBe(false);
    const said = stderr.mock.calls.map((call) => String(call[0])).join("");
    expect(said).toContain(`remembered in ${file} did not unlock`);
    expect(said).toContain("amc vault forget");
    expect(said).not.toContain("wrong-remembered-pass");
  });

  it("is never used in agent mode, nor by a process holding an agent's lease or bridge token", () => {
    const { workspace, env } = lockedWorkspace();
    rememberVaultPassphrase(workspace, PASS, env);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    unlockWithRememberedPassphrase(workspace, { ...env, AMC_LEASE: "lease.token" });
    unlockWithRememberedPassphrase(workspace, { ...env, AMC_TOKEN: "bridge-token" });
    expect(vaultStatus(workspace).unlocked).toBe(false);
    setMode(workspace, "agent");
    unlockWithRememberedPassphrase(workspace, env);
    expect(vaultStatus(workspace).unlocked).toBe(false);
  });

  it("lets `amc vault unlock` use it instead of prompting for a passphrase the newcomer never saw", async () => {
    const { workspace, env } = lockedWorkspace();
    rememberVaultPassphrase(workspace, PASS, env);
    vi.stubEnv("AMC_VAULT_REMEMBER_FILE", env.AMC_VAULT_REMEMBER_FILE!);
    await expect(unlockVaultInteractive(workspace)).resolves.toBe(PASS);
    expect(vaultStatus(workspace).unlocked).toBe(true);
    expect(process.env.AMC_VAULT_PASSPHRASE).toBeUndefined();
  });
});
