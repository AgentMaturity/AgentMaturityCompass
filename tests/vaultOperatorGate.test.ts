import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prompt = vi.hoisted(() => vi.fn());
/** The streams each prompt module was created with (the governance question must go to stderr). */
const promptModules = vi.hoisted(() => [] as unknown[]);
vi.mock("inquirer", () => ({ default: { prompt, createPromptModule: (options: unknown) => { promptModules.push(options); return prompt; } } }));

import { setMode } from "../src/mode/mode.js";
import { initWorkspace } from "../src/workspace.js";
import { lockVault, vaultStatus } from "../src/vault/vault.js";
import { keysetAnchoring } from "../src/keys/keyset.js";
import { AGENT_ENV_MARKERS, askToUnlockForSigning, confirmRememberedUnlock, GOVERNANCE_SIGNING_PATHS, interactiveOperator, isGovernancePath } from "../src/vault/operatorContext.js";
import { rememberedUnlockLocation, rememberVaultPassphrase, unlockWithRememberedPassphrase } from "../src/vault/passphraseStore.js";
import { unlockVaultInteractive } from "../src/vault/vaultCli.js";

/**
 * LIVE-VAULT-01 (S3): the passphrase `amc up` remembered unlocks the vault only for an interactive operator (stdin a
 * terminal, no agent mode, no agent marker), and a governance command opened from it asks first. The vitest worker
 * inherits CLAUDECODE from a Claude Code shell, so every case starts with the markers cleared.
 */
const PASS = "operator-gate-pass-123";
const roots: string[] = [];
const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");

function setTTY(stream: NodeJS.ReadStream | NodeJS.WriteStream, value: boolean | undefined): void {
  Object.defineProperty(stream, "isTTY", { value, configurable: true, writable: true });
}

function restoreTTY(stream: NodeJS.ReadStream | NodeJS.WriteStream, original: PropertyDescriptor | undefined): void {
  if (original) Object.defineProperty(stream, "isTTY", original);
  else delete (stream as { isTTY?: boolean }).isTTY;
}

function tempDir(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function rememberedWorkspace(): { workspace: string; env: NodeJS.ProcessEnv; file: string } {
  const root = tempDir("amc-operator-gate-");
  const workspace = join(root, "ws");
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  lockVault(workspace);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
  const file = join(root, "vault-credentials.json");
  const env = { AMC_VAULT_REMEMBER_FILE: file } as NodeJS.ProcessEnv;
  rememberVaultPassphrase(workspace, PASS, env);
  return { workspace, env, file };
}

/** The declined flag is process-level by design, so a case that sets it gets its own module instances. */
async function freshModules() {
  vi.resetModules();
  return {
    ...(await import("../src/vault/operatorContext.js")),
    ...(await import("../src/vault/passphraseStore.js")),
    vaultStatus: (await import("../src/vault/vault.js")).vaultStatus
  };
}

beforeEach(() => {
  for (const name of AGENT_ENV_MARKERS) vi.stubEnv(name, undefined);
  prompt.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  restoreTTY(process.stdin, stdinTTY);
  restoreTTY(process.stdout, stdoutTTY);
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("the remembered passphrase unlocks for an interactive operator only", () => {
  it("leaves the vault locked without a terminal on stdin, and unlocks with one", () => {
    const { workspace, env, file } = rememberedWorkspace();
    setTTY(process.stdin, false);
    unlockWithRememberedPassphrase(workspace, env);
    expect(vaultStatus(workspace).unlocked).toBe(false);
    setTTY(process.stdin, true);
    unlockWithRememberedPassphrase(workspace, env);
    expect(vaultStatus(workspace).unlocked).toBe(true);
    expect(rememberedUnlockLocation(workspace)).toBe(file);
  });

  it("keeps the vault locked under every agent marker, and names the marker on stderr", () => {
    const { workspace, env } = rememberedWorkspace();
    setTTY(process.stdin, true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    for (const name of AGENT_ENV_MARKERS) {
      stderr.mockClear();
      unlockWithRememberedPassphrase(workspace, { ...env, [name]: "1" });
      expect(vaultStatus(workspace).unlocked, name).toBe(false);
      const said = stderr.mock.calls.map((call) => String(call[0]));
      expect(said, name).toHaveLength(1);
      expect(said[0], name).toContain(`not used: this shell carries the agent marker ${name}`);
      expect(said[0], name).not.toContain(PASS);
    }
  });

  it("says nothing on stderr without a terminal, so a hook does not spam", () => {
    const { workspace, env } = rememberedWorkspace();
    setTTY(process.stdin, false);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    unlockWithRememberedPassphrase(workspace, { ...env, CLAUDECODE: "1" });
    expect(vaultStatus(workspace).unlocked).toBe(false);
    expect(stderr).not.toHaveBeenCalled();
  });

  it("still unlocks for the operator's own --agent selector (AMC_AGENT_ID is not a marker)", () => {
    const { workspace, env } = rememberedWorkspace();
    setTTY(process.stdin, true);
    unlockWithRememberedPassphrase(workspace, { ...env, AMC_AGENT_ID: "x" });
    expect(vaultStatus(workspace).unlocked).toBe(true);
  });

  it("says why on stderr in an agent-mode workspace with a terminal", () => {
    const { workspace, env } = rememberedWorkspace();
    setMode(workspace, "agent");
    setTTY(process.stdin, true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    unlockWithRememberedPassphrase(workspace, env);
    expect(vaultStatus(workspace).unlocked).toBe(false);
    expect(stderr.mock.calls.map((call) => String(call[0])).join("")).toContain("not used: this workspace is in agent mode");
  });

  it("refuses a non-terminal `amc vault unlock` with the fix instead of prompting", async () => {
    const { workspace, env } = rememberedWorkspace();
    vi.stubEnv("AMC_VAULT_REMEMBER_FILE", env.AMC_VAULT_REMEMBER_FILE!);
    setTTY(process.stdin, false);
    prompt.mockRejectedValue(new Error("must not prompt"));
    await expect(unlockVaultInteractive(workspace)).rejects.toThrow(
      "Vault passphrase needed: export AMC_VAULT_PASSPHRASE (or AMC_VAULT_PASSPHRASE_FILE) for this shell, or re-run this command from your terminal.");
    expect(prompt).not.toHaveBeenCalled();
    expect(vaultStatus(workspace).unlocked).toBe(false);
  });
});

describe("interactiveOperator", () => {
  const owner = () => tempDir("amc-operator-owner-");
  const agent = () => { const ws = tempDir("amc-operator-agent-"); setMode(ws, "agent"); return ws; };

  it("is ok for stdin a terminal, owner mode and no marker, whatever stdout is (amc shell, pipes)", () => {
    setTTY(process.stdout, false);
    expect(interactiveOperator({ workspace: owner(), env: {}, stdin: { isTTY: true } })).toEqual({ ok: true });
    setTTY(process.stdout, undefined);
    expect(interactiveOperator({ workspace: owner(), env: {}, stdin: { isTTY: true } })).toEqual({ ok: true });
  });

  it("refuses without a terminal on stdin", () => {
    expect(interactiveOperator({ workspace: owner(), env: {}, stdin: { isTTY: false } })).toEqual({ ok: false, reason: "no-tty" });
    expect(interactiveOperator({ workspace: owner(), env: {}, stdin: {} })).toEqual({ ok: false, reason: "no-tty" });
  });

  it("puts a marker before the terminal, agent mode before the marker, and ignores an empty marker", () => {
    expect(interactiveOperator({ workspace: owner(), env: { GEMINI_CLI: "1" }, stdin: { isTTY: false } }))
      .toEqual({ ok: false, reason: "agent-marker", marker: "GEMINI_CLI" });
    expect(interactiveOperator({ workspace: agent(), env: { GEMINI_CLI: "1" }, stdin: { isTTY: true } })).toEqual({ ok: false, reason: "agent-mode" });
    expect(interactiveOperator({ workspace: owner(), env: { CLAUDECODE: "" }, stdin: { isTTY: true } })).toEqual({ ok: true });
  });

  it("puts a decline before agent mode", async () => {
    const fresh = await freshModules();
    fresh.declineRememberedStore();
    expect(fresh.interactiveOperator({ workspace: agent(), env: {}, stdin: { isTTY: true } })).toEqual({ ok: false, reason: "declined" });
  });
});

describe("governance signing from the remembered store asks first", () => {
  it("lists the owner-only commands and the signing prefixes, without option suffixes", () => {
    for (const path of ["policy sign", "lease issue", "studio lan enable", "connect hooks install", "user add", "firewall enable", "notary sign"]) {
      expect(isGovernancePath(path), path).toBe(true);
    }
    expect(isGovernancePath("score")).toBe(false);
    expect(isGovernancePath("useradd")).toBe(false);
    expect(GOVERNANCE_SIGNING_PATHS.some((entry) => entry.includes(" --"))).toBe(false);
  });

  it("locks again on N, and no later call in the process reopens it from the store", async () => {
    const { workspace, env } = rememberedWorkspace();
    setTTY(process.stdin, true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const fresh = await freshModules();
    fresh.unlockWithRememberedPassphrase(workspace, env);
    expect(fresh.vaultStatus(workspace).unlocked).toBe(true);
    prompt.mockResolvedValue({ sign: false });
    await fresh.confirmRememberedUnlock(workspace, "policy sign");
    expect(prompt).toHaveBeenCalledTimes(1);
    const question = JSON.stringify(prompt.mock.calls[0]);
    expect(question).toContain("Use the vault passphrase saved in");
    expect(question).toContain("to sign amc policy sign?");
    expect(question, "plain words: no environment variable inside the question").not.toMatch(/AMC_[A-Z_]+/);
    expect(prompt.mock.calls[0]![0][0]).toMatchObject({ type: "confirm", default: false });
    expect(promptModules.at(-1), "asked on stderr, never in the command's stdout (skeptic SK-6)").toMatchObject({ output: process.stderr });
    expect(fresh.vaultStatus(workspace).unlocked).toBe(false);
    expect(fresh.rememberedUnlockLocation(workspace)).toBeNull();
    expect(fresh.rememberedStoreDeclined()).toBe(true);
    expect(fresh.operatorRememberedPassphrase(workspace, env)).toBeNull();
  });

  it("keeps the vault unlocked on Y", async () => {
    const { workspace, env, file } = rememberedWorkspace();
    setTTY(process.stdin, true);
    unlockWithRememberedPassphrase(workspace, env);
    prompt.mockResolvedValue({ sign: true });
    await confirmRememberedUnlock(workspace, "firewall enable");
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(vaultStatus(workspace).unlocked).toBe(true);
    expect(rememberedUnlockLocation(workspace)).toBe(file);
  });

  it("asks for each governance path, and never for other commands or the reads", async () => {
    const { workspace, env } = rememberedWorkspace();
    setTTY(process.stdin, true);
    unlockWithRememberedPassphrase(workspace, env);
    prompt.mockResolvedValue({ sign: true });
    for (const path of ["score", "vault status", "user list", "verify", "keys list", "firewall status", "firewall events", "tools list",
      "gateway status", "policy controls", "policy test", "connect hooks health", "down", "integrations source observe"]) await confirmRememberedUnlock(workspace, path);
    expect(prompt, "governance reads that sign nothing (skeptic SK-6)").not.toHaveBeenCalled();
    for (const path of ["policy sign", "lease issue", "studio lan enable", "connect hooks install", "integrations source admit"]) await confirmRememberedUnlock(workspace, path);
    expect(prompt).toHaveBeenCalledTimes(5);
    expect(vaultStatus(workspace).unlocked).toBe(true);
  });

  it("does not ask when the vault was opened another way (AMC_VAULT_PASSPHRASE or a prompt)", async () => {
    const { workspace } = rememberedWorkspace();
    setTTY(process.stdin, true);
    await confirmRememberedUnlock(workspace, "policy sign");
    expect(prompt).not.toHaveBeenCalled();
  });
});

/** A workspace whose vault exists and is locked, with nothing remembered. */
function lockedWorkspace(): string {
  const workspace = join(tempDir("amc-signing-unlock-"), "ws");
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  lockVault(workspace);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
  return workspace;
}

describe("a signing command asks an interactive operator for the passphrase instead of refusing", () => {
  it("asks once on stderr, masked, and leaves the vault unlocked in this process only", async () => {
    const workspace = lockedWorkspace();
    setTTY(process.stdin, true);
    prompt.mockResolvedValue({ passphrase: PASS });
    await askToUnlockForSigning(workspace, "firewall enable");
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt.mock.calls[0]![0][0]).toMatchObject({ type: "password", mask: "*" });
    expect(promptModules.at(-1)).toMatchObject({ output: process.stderr });
    expect(vaultStatus(workspace).unlocked).toBe(true);
    expect(process.env.AMC_VAULT_PASSPHRASE ?? "", "never put into the environment children inherit").toBe("");
  });

  it("only accepts a passphrase that opens the vault, and an empty answer continues locked", async () => {
    const workspace = lockedWorkspace();
    setTTY(process.stdin, true);
    prompt.mockResolvedValue({ passphrase: "" });
    await askToUnlockForSigning(workspace, "policy sign");
    const validate = prompt.mock.calls[0]![0][0].validate as (value: string) => true | string;
    expect(validate("not-the-passphrase")).toMatch(/does not open/);
    expect(validate(PASS)).toBe(true);
    expect(validate("")).toBe(true);
    expect(vaultStatus(workspace).unlocked).toBe(false);
  });

  // 2026-11-14: a folder set up by bare amc asked for a passphrase the person had never seen.
  it("offers the passphrase bare amc saved, by name and with no as the default, only when it opens a vault this machine created", async () => {
    const workspace = lockedWorkspace();
    setTTY(process.stdin, true);
    writeFileSync(join(workspace, ".amc", "local-vault-passphrase"), `${PASS}\n`, { mode: 0o600 });
    const anchored = keysetAnchoring(workspace).state === "committed";
    prompt.mockResolvedValueOnce({ useSaved: true }).mockResolvedValue({ passphrase: "" });
    await askToUnlockForSigning(workspace, "user init");
    const first = prompt.mock.calls[0]![0][0] as { type: string; default?: boolean; message: string };
    if (anchored) {
      expect(first).toMatchObject({ type: "confirm", default: false });
      expect(first.message).toContain(".amc/local-vault-passphrase");
      expect(vaultStatus(workspace).unlocked).toBe(true);
    } else {
      expect(first.type, "an unanchored vault's file is never offered").toBe("password");
    }
    expect(process.env.AMC_VAULT_PASSPHRASE ?? "").toBe("");
  });

  it("keeps the refusal for agents, shells without a terminal, reads and other commands", async () => {
    const workspace = lockedWorkspace();
    setTTY(process.stdin, false);
    await askToUnlockForSigning(workspace, "firewall enable");
    setTTY(process.stdin, true);
    for (const name of AGENT_ENV_MARKERS) await askToUnlockForSigning(workspace, "firewall enable", { ...process.env, [name]: "1" });
    for (const path of ["firewall status", "score", "keys rotate", "vault unlock", "init"]) await askToUnlockForSigning(workspace, path);
    expect(prompt).not.toHaveBeenCalled();
    expect(vaultStatus(workspace).unlocked).toBe(false);
  });

  it("does not ask when the passphrase comes from the environment or the vault is open", async () => {
    const workspace = lockedWorkspace();
    setTTY(process.stdin, true);
    await askToUnlockForSigning(workspace, "firewall enable", { ...process.env, AMC_VAULT_PASSPHRASE_FILE: "/nowhere" });
    await askToUnlockForSigning(workspace, "firewall enable", { ...process.env, AMC_VAULT_PASSPHRASE: "x" });
    expect(prompt).not.toHaveBeenCalled();
  });

  it("does not ask after the operator declined to sign from the remembered store", async () => {
    const { workspace, env } = rememberedWorkspace();
    setTTY(process.stdin, true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const fresh = await freshModules();
    fresh.unlockWithRememberedPassphrase(workspace, env);
    prompt.mockResolvedValue({ sign: false });
    await fresh.confirmRememberedUnlock(workspace, "firewall enable");
    prompt.mockClear();
    await fresh.askToUnlockForSigning(workspace, "firewall enable");
    expect(prompt).not.toHaveBeenCalled();
  });
});
