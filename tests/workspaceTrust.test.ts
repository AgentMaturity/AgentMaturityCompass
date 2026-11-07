import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { registerAgentCommands, type AgentLoopCliIo } from "../src/cli-agent-commands.js";
import { registerSandboxCommands } from "../src/cli-sandbox-commands.js";
import { requireWorkspaceTrust, revokeWorkspaceTrust, repairWorkspaceTrustStore, suppliedTrustConsent, trustWorkspace, workspaceTrustVerdict } from "../src/security/workspaceTrust.js";

/**
 * SH-SANDBOX-07. A key set `amc init` committed under one AMC home is the operator's own (trusted). The same workspace
 * read under a second AMC home is one this machine never committed: a clone, as far as that home is concerned.
 */
const originalCwd = process.cwd();
let workspace: string;
let ownerHome: string;
let cloneHome: string;
let credentialsHome: string;
let priorPassphrase: string | undefined;
let priorExitListeners: ReturnType<typeof process.listeners>;

beforeEach(() => {
  priorPassphrase = process.env.AMC_VAULT_PASSPHRASE;
  process.env.AMC_VAULT_PASSPHRASE = "workspace-trust-test";
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-wt-ws-")));
  ownerHome = realpathSync(mkdtempSync(join(tmpdir(), "amc-wt-owner-")));
  cloneHome = realpathSync(mkdtempSync(join(tmpdir(), "amc-wt-clone-")));
  credentialsHome = realpathSync(mkdtempSync(join(tmpdir(), "amc-wt-creds-")));
  vi.stubEnv("AMC_HOME", ownerHome);
  vi.stubEnv("AMC_TRUST_WORKSPACE", "");
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  priorExitListeners = process.listeners("exit");
  process.chdir(workspace);
});

afterEach(() => {
  vi.unstubAllEnvs();
  process.chdir(originalCwd);
  for (const listener of process.listeners("exit")) {
    if (!priorExitListeners.includes(listener)) { process.removeListener("exit", listener); listener(0); }
  }
  if (priorPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = priorPassphrase;
  for (const dir of [workspace, ownerHome, cloneHome, credentialsHome]) rmSync(dir, { recursive: true, force: true });
});

const asClone = (): void => { vi.stubEnv("AMC_HOME", cloneHome); };
const storePath = (): string => join(cloneHome, "state", "workspace-trust.json");

describe("workspace trust verdicts", () => {
  it("a key set this machine committed is trusted; the same workspace under another AMC home is a first use", () => {
    expect(workspaceTrustVerdict(workspace)).toMatchObject({ state: "trusted", reason: "committed-keys" });
    asClone();
    const verdict = workspaceTrustVerdict(workspace);
    expect(verdict.state).toBe("first-use");
    if (verdict.state === "first-use") expect(verdict.surface.toolsSummary).toMatch(/signed tools/);
  });

  it("a workspace with no key set has nothing to trust", () => {
    const bare = mkdtempSync(join(tmpdir(), "amc-wt-bare-"));
    try { expect(workspaceTrustVerdict(bare)).toMatchObject({ state: "trusted", reason: "no-key-set" }); }
    finally { rmSync(bare, { recursive: true, force: true }); }
  });

  it("refuses without consent, records consent from a flag or the environment, notices a re-signed tools policy, and revokes", () => {
    asClone();
    const refused = requireWorkspaceTrust(workspace, null);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toMatch(/amc trust workspace.*--trust-workspace.*AMC_TRUST_WORKSPACE=1/s);
    expect(existsSync(storePath())).toBe(false);

    const consented = requireWorkspaceTrust(workspace, "cli-flag");
    expect(consented.ok).toBe(true);
    expect(statSync(storePath()).mode & 0o777).toBe(0o600);
    expect(workspaceTrustVerdict(workspace)).toMatchObject({ state: "trusted", reason: "consented", record: { by: "cli-flag", realpath: workspace } });
    // Idempotent: a trusted workspace records nothing new.
    expect(requireWorkspaceTrust(workspace, null)).toMatchObject({ ok: true, recorded: null });

    // The repository re-signs its tools policy (a wider shell grant): a changed surface, refused until trusted again.
    const config = loadToolsConfig(workspace);
    mkdirSync(join(workspace, "wider"), { recursive: true });
    initToolsConfig(workspace, { tools: { ...config.tools, allowedTools: config.tools.allowedTools.map(tool => tool.name === "bash"
      ? { ...tool, nativeSandbox: { kind: "os-native" as const, writableDirectories: ["wider"] } } : tool) } });
    expect(workspaceTrustVerdict(workspace)).toMatchObject({ state: "changed", changed: ["tools-policy"] });
    const changed = requireWorkspaceTrust(workspace, null);
    expect(changed.ok).toBe(false);
    if (!changed.ok) expect(changed.reason).toContain("tools-policy changed");
    vi.stubEnv("AMC_TRUST_WORKSPACE", "1");
    expect(requireWorkspaceTrust(workspace, suppliedTrustConsent(undefined))).toMatchObject({ ok: true, recorded: { by: "env" } });
    vi.stubEnv("AMC_TRUST_WORKSPACE", "");

    expect(revokeWorkspaceTrust(workspace)).toBe(true);
    expect(revokeWorkspaceTrust(workspace)).toBe(false);
    expect(workspaceTrustVerdict(workspace).state).toBe("first-use");
  });

  it("an unreadable store refuses every workspace even with consent, until it is moved aside", () => {
    asClone();
    mkdirSync(join(cloneHome, "state"), { recursive: true });
    writeFileSync(storePath(), "{not json");
    expect(workspaceTrustVerdict(workspace)).toMatchObject({ state: "refused" });
    const withFlag = requireWorkspaceTrust(workspace, "cli-flag");
    expect(withFlag.ok).toBe(false);
    if (!withFlag.ok) expect(withFlag.reason).toContain("--repair-store");
    const aside = repairWorkspaceTrustStore();
    expect(aside).not.toBeNull();
    expect(readFileSync(aside!, "utf8")).toBe("{not json");
    expect(repairWorkspaceTrustStore()).toBeNull();
    expect(trustWorkspace(workspace, "command").by).toBe("command");
    expect(workspaceTrustVerdict(workspace).state).toBe("trusted");
  });
});

describe("through the real surfaces", () => {
  async function runCli(extra: string[]): Promise<{ errors: string[]; failed: boolean }> {
    const errors: string[] = []; let failed = false;
    const program = new Command().exitOverride();
    const io: AgentLoopCliIo = { log: () => {}, error: line => errors.push(line), fail: () => { failed = true; } };
    registerAgentCommands(program, io);
    await program.parseAsync(["agent-loop", "run", "hello", "--provider", "stub", "--tools", "none", "--credentials-home", credentialsHome, "--json", ...extra], { from: "user" });
    return { errors, failed };
  }

  it("amc agent-loop run refuses an untrusted workspace before composing anything, and proceeds with --trust-workspace", async () => {
    asClone();
    const refused = await runCli([]);
    expect(refused.failed).toBe(true);
    expect(refused.errors.join("\n")).toContain("has not trusted this workspace");
    const trusted = await runCli(["--trust-workspace"]);
    expect(trusted.failed, trusted.errors.join("\n")).toBe(false);
    expect(trusted.errors.join("\n")).toContain("workspace trusted on this machine (cli-flag)");
    const again = await runCli([]);
    expect(again.failed, again.errors.join("\n")).toBe(false);
  });

  it("amc trust workspace records, reports and revokes the consent", () => {
    asClone();
    const program = new Command().exitOverride();
    program.command("trust");
    registerSandboxCommands(program);
    const out: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation(line => { out.push(String(line)); });
    try {
      program.parse(["trust", "workspace", "--status", "--json"], { from: "user" });
      expect(JSON.parse(out.at(-1)!)).toMatchObject({ state: "first-use" });
      program.parse(["trust", "workspace", "--json"], { from: "user" });
      expect(JSON.parse(out.at(-1)!)).toMatchObject({ state: "trusted", record: { by: "command" } });
      program.parse(["trust", "workspace", "--revoke", "--json"], { from: "user" });
      expect(JSON.parse(out.at(-1)!)).toMatchObject({ revoked: true });
    } finally { log.mockRestore(); }
    expect(workspaceTrustVerdict(workspace).state).toBe("first-use");
  });
});
