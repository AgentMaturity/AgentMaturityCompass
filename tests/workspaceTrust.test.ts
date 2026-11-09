import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { registerAgentCommands, type AgentLoopCliIo } from "../src/cli-agent-commands.js";
import { registerSandboxCommands } from "../src/cli-sandbox-commands.js";
import { registerNativeScheduleCommands } from "../src/cli-native-schedule-commands.js";
import { openAgentSession } from "../src/agent/agentSession.js";
import { keysetAnchoring } from "../src/keys/keyset.js";
import { lockVault, vaultPaths } from "../src/vault/vault.js";
import { amcSecretPaths } from "../src/sandbox/shellSecretPaths.js";
import { LocalCredentialsService } from "../src/credentials/localCredentialsService.js";
import { saveSchedules } from "../src/autonomy/scheduleStore.js";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL } from "../src/agent/stubProvider.js";
import { v1Workspace } from "./helpers/legacyVault.js";
import { consentedToolsDigest, NO_TOOLS_POLICY_PIN, requireWorkspaceTrust, revokeWorkspaceTrust, repairWorkspaceTrustStore, suppliedTrustConsent, trustWorkspace, workspaceTrustVerdict } from "../src/security/workspaceTrust.js";
import type { AgentToolset } from "../src/agent/agentToolset.js";

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

  it("a workspace with no signing key at all has nothing to trust", () => {
    const bare = mkdtempSync(join(tmpdir(), "amc-wt-bare-"));
    try {
      expect(workspaceTrustVerdict(bare)).toMatchObject({ state: "trusted", reason: "no-signer" });
      expect(() => trustWorkspace(bare, "command")).toThrow(/nothing to trust/);
    } finally { rmSync(bare, { recursive: true, force: true }); }
  });

  it("a consented session pins the consented tools.yaml digest; this machine's own workspace pins nothing", () => {
    expect(consentedToolsDigest(requireWorkspaceTrust(workspace, null))).toBeNull();
    asClone();
    const recorded = requireWorkspaceTrust(workspace, "cli-flag");
    expect(consentedToolsDigest(recorded)).toMatch(/^[0-9a-f]{64}$/);
    expect(consentedToolsDigest(requireWorkspaceTrust(workspace, null))).toBe(consentedToolsDigest(recorded));
    expect(consentedToolsDigest({ ok: false, reason: "x" })).toBeNull();
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
    // SH-SANDBOX-08: the credential store this run selected by option is on the confined shell's deny list from now on.
    expect(amcSecretPaths()).toEqual(expect.arrayContaining([credentialsHome, join(credentialsHome, ".credentials.yaml")]));
  });

  it("a credential store opened by option on any surface (ACP, the SDK's child, wire, trials) is denied to the confined shell from then on", () => {
    const store = realpathSync(mkdtempSync(join(tmpdir(), "amc-wt-acp-creds-")));
    try {
      expect(amcSecretPaths({})).not.toContain(store);
      // acpStdioMain, wire and the trial runner open the store directly, not through the kernel's credentials service.
      new LocalCredentialsService({ homeDir: store, projectDir: null, includeDotenv: false, watch: false });
      expect(amcSecretPaths({})).toEqual(expect.arrayContaining([store, join(store, ".credentials.yaml")]));
    } finally { rmSync(store, { recursive: true, force: true }); }
  });

  /**
   * S19: a 1.x key layout (role keys, no keyset.json) has no key set, but its signed tools.yaml still verifies through the
   * legacy role-key fallback. Such a clone is a first use bound to that key's fingerprint, not "nothing to trust".
   */
  function legacyLayoutWorkspace(): string {
    const v1 = v1Workspace(process.env.AMC_VAULT_PASSPHRASE!);
    const root = realpathSync(v1.root);
    // Initialising on top of the 1.x vault unlocks and migrates it under the owner home and signs the default tools.yaml
    // with the (migrated) auditor key; the 1.x key layout is then restored byte for byte.
    initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
    lockVault(root);
    const keys = vaultPaths(root).keysDir;
    for (const name of readdirSync(keys)) {
      if (!/^(monitor|auditor|lease|session)_(ed25519\.pub|history\.json)$/.test(name)) rmSync(join(keys, name), { recursive: true, force: true });
    }
    writeFileSync(vaultPaths(root).vaultFile, v1.envelope, { mode: 0o600 });
    for (const stray of ["vault.meta.json", "previous-vault.amcvault"]) { try { unlinkSync(join(root, ".amc", stray)); } catch { /* not written */ } }
    return root;
  }

  it("a 1.x-layout clone whose signed tools.yaml verifies with the legacy auditor key is a first use, and a refused run does not migrate it", async () => {
    const legacy = legacyLayoutWorkspace();
    try {
      asClone();
      expect(existsSync(join(legacy, ".amc", "keys", "keyset.json"))).toBe(false);
      const verdict = workspaceTrustVerdict(legacy);
      expect(verdict).toMatchObject({ state: "first-use", surface: { signer: { kind: "legacy-role-key", generation: 0 } } });
      if (verdict.state === "first-use") expect(verdict.surface.toolsSummary).toMatch(/^\d+ signed tools/);
      const refused = requireWorkspaceTrust(legacy, null);
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.reason).toContain("legacy signing key (no key set)");
      // The real CLI entry: refused before anything unlocks the vault, so the clone is neither written nor migrated.
      process.chdir(legacy);
      const run = await runCli([]);
      expect(run.failed).toBe(true);
      expect(run.errors.join("\n")).toContain("has not trusted this workspace");
      expect(existsSync(join(legacy, ".amc", "keys", "keyset.json"))).toBe(false);
      expect(keysetAnchoring(legacy)).toEqual({ state: "none", generation: null });
      expect(workspaceTrustVerdict(legacy).state).toBe("first-use");
      // With consent the record names the legacy key; the first session then migrates the vault, committing a key set here.
      const trusted = await runCli(["--trust-workspace"]);
      expect(trusted.failed, trusted.errors.join("\n")).toBe(false);
      expect(trusted.errors.join("\n")).toContain("workspace trusted on this machine (cli-flag)");
      expect(existsSync(join(legacy, ".amc", "keys", "keyset.json"))).toBe(true);
      expect(workspaceTrustVerdict(legacy)).toMatchObject({ state: "trusted", reason: "committed-keys" });
      lockVault(legacy);
    } finally { process.chdir(workspace); rmSync(legacy, { recursive: true, force: true }); }
  });

  it("openAgentSession (SDK, ACP, Studio, wire) refuses an untrusted workspace and records the ACP flag as its source", async () => {
    asClone();
    // Opened and closed only: the composition reads the route from the llm it is given, so an inert one is enough here.
    const init = { workspace, agentId: "default", tools: "none" as const, systemPrompt: "s", harnessVersion: "trust-test", makeLlm: () => ({} as never),
      compositionDigest: "composition", policyDigest: "policy", route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: {} } };
    expect(() => openAgentSession(init)).toThrow(/has not trusted this workspace/);
    expect(existsSync(storePath())).toBe(false);
    const session = openAgentSession({ ...init, trustWorkspace: "acp-flag" });
    await session.close();
    expect(workspaceTrustVerdict(workspace)).toMatchObject({ state: "trusted", record: { by: "acp-flag" } });
    expect(revokeWorkspaceTrust(workspace)).toBe(true);
    const viaSdk = openAgentSession({ ...init, trustWorkspace: true });
    await viaSdk.close();
    expect(workspaceTrustVerdict(workspace)).toMatchObject({ state: "trusted", record: { by: "sdk-option" } });
  });

  /**
   * S19b: consent given while the repository had no verifiable signed tools policy covers "no policy". A policy signed
   * after that (a `git pull` under a long-lived ACP, SDK or Studio session) is refused for the rest of the session.
   */
  it("a tools policy signed after consent that covered none is refused for the rest of the session", async () => {
    writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
    const config = loadToolsConfig(workspace);
    rmSync(join(workspace, ".amc", "tools.yaml.sig"));
    asClone();
    const consent = requireWorkspaceTrust(workspace, "cli-flag");
    expect(consent).toMatchObject({ ok: true, recorded: { toolsDigestSha256: null } });
    expect(consentedToolsDigest(consent)).toBe(NO_TOOLS_POLICY_PIN);
    expect(consentedToolsDigest(requireWorkspaceTrust(workspace, null))).toBe(NO_TOOLS_POLICY_PIN);
    let toolset: AgentToolset | null = null;
    const session = openAgentSession({ workspace, agentId: "default", tools: "workspace", systemPrompt: "s", harnessVersion: "trust-test", makeLlm: () => ({} as never),
      compositionDigest: "composition", policyDigest: "policy", route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: {} },
      bindTools: ({ toolset: composed }) => { toolset = composed; return composed!.seam; } });
    try {
      mkdirSync(join(workspace, "workspace"), { recursive: true });
      writeFileSync(join(workspace, "workspace", "notes.txt"), "readable under the newly signed policy");
      const read = () => toolset!.pipeline.execute({ name: "fs.read", agentId: "default", requestedMode: "EXECUTE", arguments: { path: "workspace/notes.txt" } });
      expect((await read()).denied).not.toBeNull(); // nothing verifies yet
      initToolsConfig(workspace, { tools: config.tools }); // signed mid-session: a verifiable policy whose fs.read allows ./workspace/**
      expect(workspaceTrustVerdict(workspace)).toMatchObject({ state: "changed", changed: ["tools-policy"] });
      expect((await read()).denied?.reason).toBe("signed tool policy differs from the native task's reviewed digest");
    } finally { await session.close(); }
  });

  it("a workspace with no signer at admission pins no policy either", () => {
    const bare = mkdtempSync(join(tmpdir(), "amc-wt-bare-"));
    try {
      const check = requireWorkspaceTrust(bare, null);
      expect(check).toMatchObject({ ok: true, verdict: { state: "trusted", reason: "no-signer" } });
      expect(consentedToolsDigest(check)).toBe(NO_TOOLS_POLICY_PIN);
    } finally { rmSync(bare, { recursive: true, force: true }); }
  });

  it("amc native-schedule run-due refuses an untrusted workspace before any pass", async () => {
    asClone();
    saveSchedules(workspace, [{ id: "noop", runAs: "writer", goal: "hello", maxRounds: 1, everyMs: 60_000, enabled: true, scope: ["WRITE_LOW"] }]);
    const errors: string[] = []; let failed = false;
    const program = new Command().exitOverride();
    registerNativeScheduleCommands(program, { log: () => {}, error: line => errors.push(line), fail: () => { failed = true; } }, { workspace: () => workspace });
    await program.parseAsync(["native-schedule", "run-due", "--agent", "default", "--provider", "stub", "--approve-tools", "WRITE_LOW",
      "--expect-digest", "0".repeat(64), "--expect-tools-digest", "0".repeat(64), "--credentials-home", credentialsHome], { from: "user" });
    expect(failed).toBe(true);
    expect(errors.join("\n")).toContain("has not trusted this workspace");
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
