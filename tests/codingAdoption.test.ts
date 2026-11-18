import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** UX-01: a folder bare `amc` set up moves to the `init --coding` setup in place, by a person, keeping keys and records. */
const answers = vi.hoisted(() => ({ yes: true, passphrase: "my own vault passphrase" }));
vi.mock("inquirer", () => ({ default: { prompt: vi.fn(async (questions: Array<{ name: string }>) =>
  Object.fromEntries(questions.map((q) => [q.name, q.name === "yes" ? answers.yes : answers.passphrase]))) } }));

import { loadActionPolicy } from "../src/governor/actionPolicyStore.js";
import { usersConfigPath } from "../src/auth/authApi.js";
import { ensureInstantVaultMode } from "../src/cli/instantVaultMode.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { appendOpsAuditEvent } from "../src/ops/audit.js";
import { assertPersonAdopts, codingAdoptionBlockers } from "../src/setup/codingAdoption.js";
import { refuseForceOverCommittedKeys, runStarterInit } from "../src/setup/starterProfiles.js";
import { loadRuntimeFirewallPolicy, writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { toolsConfigPath } from "../src/toolhub/toolhubValidators.js";
import { AGENT_ENV_MARKERS } from "../src/vault/operatorContext.js";
import { localVaultPassphrasePath } from "../src/vault/localPassphrase.js";
import { lockVault, vaultOpensWith } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

const OWNER = { username: "folder-owner", password: "folder-owner-password" };
const tty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const dirs: string[] = [];
const temp = (prefix: string): string => { const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix))); dirs.push(dir); return dir; };

beforeEach(() => {
  for (const marker of AGENT_ENV_MARKERS) vi.stubEnv(marker, "");
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
  vi.stubEnv("AMC_HOME", temp("amc-adopt-home-"));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(temp("amc-adopt-ckpt-"), "checkpoints"));
  vi.stubEnv("AMC_BOOTSTRAP_OWNER_USERNAME", OWNER.username);
  vi.stubEnv("AMC_BOOTSTRAP_OWNER_PASSWORD", OWNER.password);
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  answers.yes = true;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  if (tty) Object.defineProperty(process.stdin, "isTTY", tty); else delete (process.stdin as { isTTY?: boolean }).isTTY;
  for (const dir of dirs.splice(0)) { try { lockVault(dir); } catch { /* not a workspace */ } rmSync(dir, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** What bare `amc` makes: a vault sealed with a generated passphrase kept in .amc/local-vault-passphrase, and a record. */
function menuWorkspace(): string {
  const dir = temp("amc-adopt-");
  ensureInstantVaultMode(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  appendOpsAuditEvent({ workspace: dir, auditType: "MENU_RECORD_BEFORE_ADOPTION", payload: { note: "an earlier record" } });
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
  return dir;
}

const auditTypes = (dir: string): string[] => {
  const ledger = openLedger(dir);
  try { return ledger.getAllEvents().map((event) => (JSON.parse(event.meta_json) as { auditType?: string }).auditType ?? ""); } finally { ledger.close(); }
};

describe("moving a menu workspace to the coding setup (UX-01)", () => {
  it("a menu workspace has nothing in the way", () => {
    expect(codingAdoptionBlockers(menuWorkspace())).toEqual([]);
  });

  it("keeps the keys, the earlier records and a verifying chain; edits and commands then run on approval", async () => {
    const dir = menuWorkspace();
    const monitor = readFileSync(join(dir, ".amc", "keys", "monitor_ed25519.pub"), "utf8");
    const report = await runStarterInit(dir, "coding");
    expect(report?.readiness.ready).toBe(true);
    expect(readFileSync(join(dir, ".amc", "keys", "monitor_ed25519.pub"), "utf8"), "same monitor key").toBe(monitor);
    expect(existsSync(usersConfigPath(dir))).toBe(true);
    const rules = loadActionPolicy(dir).actions.filter((rule) => rule.actionClass === "WRITE_LOW" || rule.actionClass === "WRITE_HIGH");
    expect(rules.map((rule) => rule.executeOnApproval)).toEqual([true, true]);
    expect(existsSync(localVaultPassphrasePath(dir)), "the generated passphrase is gone").toBe(false);
    expect(vaultOpensWith(dir, answers.passphrase), "the person's own passphrase opens the vault").toBe(true);
    const types = auditTypes(dir);
    expect(types).toContain("MENU_RECORD_BEFORE_ADOPTION");
    expect(types).toContain("WORKSPACE_CODING_SETUP_ADOPTED");
    expect(verifyLedgerIntegrity(dir).ok).toBe(true);
  });

  it("an agent cannot do it, and nothing changes", async () => {
    const dir = menuWorkspace();
    vi.stubEnv("CLAUDECODE", "1");
    await expect(runStarterInit(dir, "coding")).rejects.toThrow("needs you at your own terminal, and this shell carries the agent marker CLAUDECODE");
    expect(() => assertPersonAdopts(dir, { CODEX_THREAD_ID: "t" }, { isTTY: true })).toThrow("agent marker CODEX_THREAD_ID");
    expect(() => assertPersonAdopts(dir, {}, { isTTY: false })).toThrow("stdin is not a terminal");
    expect(existsSync(usersConfigPath(dir))).toBe(false);
    expect(existsSync(localVaultPassphrasePath(dir))).toBe(true);
    expect(auditTypes(dir)).not.toContain("WORKSPACE_CODING_SETUP_ADOPTED");
  });

  it("a no changes nothing", async () => {
    const dir = menuWorkspace();
    answers.yes = false;
    expect(await runStarterInit(dir, "coding")).toBeNull();
    expect(existsSync(usersConfigPath(dir))).toBe(false);
    expect(existsSync(localVaultPassphrasePath(dir))).toBe(true);
  });

  it("keeps a firewall policy the folder already had", async () => {
    const dir = menuWorkspace();
    vi.stubEnv("AMC_VAULT_PASSPHRASE", readFileSync(localVaultPassphrasePath(dir), "utf8").trim());
    writeRuntimeFirewallPolicy({ workspace: dir, mode: "block" });
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    const report = await runStarterInit(dir, "coding");
    expect(report?.firewallMode).toBe("block");
    expect(loadRuntimeFirewallPolicy(dir)?.mode).toBe("block");
  });

  it("with the person's own passphrase: a wrong one is refused before anything is written; the right one is kept", async () => {
    const dir = temp("amc-adopt-own-");
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "the person's own passphrase");
    initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
    lockVault(dir);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    const tools = readFileSync(toolsConfigPath(dir), "utf8");
    await expect(runStarterInit(dir, "coding")).rejects.toThrow("That passphrase does not open this folder's vault. Nothing was changed.");
    expect(readFileSync(toolsConfigPath(dir), "utf8")).toBe(tools);
    expect(existsSync(usersConfigPath(dir))).toBe(false);
    answers.passphrase = "the person's own passphrase";
    try {
      expect((await runStarterInit(dir, "coding"))?.readiness.ready).toBe(true);
      expect(vaultOpensWith(dir, "the person's own passphrase")).toBe(true);
    } finally { answers.passphrase = "my own vault passphrase"; }
  });

  it("refuses a copy whose keys another computer created", async () => {
    const dir = menuWorkspace();
    vi.stubEnv("AMC_HOME", temp("amc-adopt-other-machine-"));
    expect(codingAdoptionBlockers(dir)).toEqual(["this computer did not create its keys (a copy or a clone)"]);
  });

  it("refuses a workspace someone already changed, naming what, and changes nothing", async () => {
    const dir = menuWorkspace();
    writeFileSync(toolsConfigPath(dir), readFileSync(toolsConfigPath(dir), "utf8").replace("./workspace/output/**", "./**"));
    await expect(runStarterInit(dir, "coding")).rejects.toThrow("its tool list was changed (.amc/tools.yaml)");
    expect(existsSync(usersConfigPath(dir))).toBe(false);
  });
});

describe("--force where this machine committed the folder's keys (UX-29)", () => {
  it("is refused before anything is deleted, because AMC would then refuse to set the folder up again", async () => {
    const dir = menuWorkspace();
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "an operator passphrase");
    await expect(runStarterInit(dir, "coding", true)).rejects.toThrow("Nothing was deleted.");
    expect(existsSync(join(dir, ".amc", "keys", "monitor_ed25519.pub"))).toBe(true);
    expect(auditTypes(dir)).toContain("MENU_RECORD_BEFORE_ADOPTION");
    expect(() => refuseForceOverCommittedKeys(temp("amc-no-workspace-")), "a folder without .amc has nothing to protect").not.toThrow();
  });
});
