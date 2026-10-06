import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Command } from "commander";
import YAML from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { agentToolset, type AgentToolset, type AgentToolsetOptions } from "../src/agent/agentToolset.js";
import { openAgentSession, type AgentSessionInit } from "../src/agent/agentSession.js";
import { createDriverRunner } from "../src/agent/subagentRunner.js";
import { spawnSubagent } from "../src/agent/subagentSpawn.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { SessionService } from "../src/session/sessionService.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import { signAmcConfig, verifyAmcConfigSignature } from "../src/config/amcConfigSignature.js";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { decideNativeShell, nativeShellReadiness, type NativeShellReadiness } from "../src/sandbox/nativeShellGate.js";
import { AMCNativeClient } from "../src/sdk/nativeAgentClient.js";
import { startAcpStdio } from "../src/acp/acpStdioMain.js";
import { createNativeTaskService } from "../src/studio/nativeTaskService.js";
import type { SandboxOutcome } from "../src/sandbox/sandboxTypes.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep } from "./helpers/agentLoopHarness.js";

/**
 * P0-06: the native shell is offered only when it is confined (Linux with a
 * usable Bubblewrap) or when an operator explicitly opted in to an unconfined
 * shell on macOS. The platform and the Bubblewrap backend are pinned in every
 * case, so these results do not depend on the host running the suite.
 */
const backend = vi.hoisted(() => ({
  available: { value: { ok: true } as { ok: true } | { ok: false; reason: string } },
  run: vi.fn<(...args: unknown[]) => Promise<SandboxOutcome>>()
}));
vi.mock("../src/sandbox/bwrapBackend.js", async importOriginal => ({
  ...(await importOriginal<typeof import("../src/sandbox/bwrapBackend.js")>()),
  bwrapBackend: () => ({ kind: "bwrap", available: () => backend.available.value, run: backend.run })
}));

const DARWIN_REFUSAL = "The native shell is refused on macOS: AMC cannot confine it yet (Seatbelt confinement arrives with P1-05). To accept an unconfined shell with your full user rights, pass --unsafe-unconfined-shell (Studio: start it with AMC_UNSAFE_UNCONFINED_SHELL=1).";
const NOT_HONOURED = "runtime.shell.allowUnconfined is not honoured: a workspace can sign its own config, so a file in the repository cannot grant an unconfined shell. Pass --unsafe-unconfined-shell, or start Studio with AMC_UNSAFE_UNCONFINED_SHELL=1.";
const CLI_FLAG_WARNING = "WARNING: the native shell is UNCONFINED on darwin (opt-in: cli-flag). Commands run with your full user rights: files outside the workspace, ~/.ssh and the network are reachable. Receipts record enforcement: none.";
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const pin = (value: NodeJS.Platform): void => { Object.defineProperty(process, "platform", { ...platform, value }); };
const dirs: string[] = [];
const toolsets: AgentToolset[] = [];
const originalCwd = process.cwd();
let priorExitListeners: ReturnType<typeof process.listeners> | null = null;

afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  backend.available.value = { ok: true };
  backend.run.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.chdir(originalCwd);
  if (priorExitListeners !== null) {
    // The CLI closes its toolset on process exit; release only what this test added.
    for (const listener of process.listeners("exit")) {
      if (!priorExitListeners.includes(listener)) { process.removeListener("exit", listener); listener(0); }
    }
    priorExitListeners = null;
  }
  for (const toolset of toolsets.splice(0)) toolset.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] ??= "native-shell-composition-pass";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-shell-gate-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  return dir;
}

type Row = { readonly meta: Record<string, unknown> };
function compose(dir: string, extra: Partial<AgentToolsetOptions> = {}) {
  const rows: Row[] = [];
  const toolset = agentToolset({ workspace: dir, agentId: "default", sessionId: "shell-gate-session",
    recorder: { recordProjectedEvidence: row => { rows.push(row); return null; } }, ...extra });
  toolsets.push(toolset);
  return { toolset, audits: (type: string) => rows.filter(row => row.meta["auditType"] === type).map(row => row.meta) };
}
const names = (toolset: AgentToolset): string[] => (toolset.seam.schemas() ?? []).map(schema => schema.name);
const bashCall = (command: string) => ({ callId: `c-${command}`, toolName: "bash", rawArguments: JSON.stringify({ command }),
  sessionId: "shell-gate-session", turn: 1, step: 1, parentToken: null, dispatch: "native" as const, signal: new AbortController().signal });

function setAllowUnconfined(dir: string, value: boolean): void {
  const path = join(dir, ".amc", "amc.config.yaml");
  const config = YAML.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  writeFileSync(path, YAML.stringify({ ...config, runtime: { shell: { allowUnconfined: value } } }));
}

describe("macOS", () => {
  it("offers no bash without an opt-in, refuses a guessed call and says how to opt in", async () => {
    pin("darwin");
    const { toolset, audits } = compose(workspace());
    expect(names(toolset)).toContain("fs.read");
    expect(names(toolset)).not.toContain("bash");
    const result = await toolset.seam.execute(bashCall("echo should-not-run"));
    expect(result.outcome).toBe("DENIED");
    expect(audits("NATIVE_SHELL_CONFINEMENT")).toEqual([]);
    expect(toolset.readiness.shell).toEqual({ offered: false, decision: "refused", enforcement: "none", boundary: null,
      reason: DARWIN_REFUSAL, optInSource: null });
  });

  it("an opted-in session warns once and records enforcement none on every shell receipt", async () => {
    pin("darwin");
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { toolset, audits } = compose(workspace(), { unconfinedShell: "cli-flag" });
    expect(names(toolset)).toContain("bash");
    const result = await toolset.seam.execute(bashCall("echo opted-in"));
    expect(result.outcome, String(result.content)).toBe("OK");
    expect(String(result.content)).toContain("opted-in");
    await toolset.seam.execute(bashCall("echo again"));
    const receipts = audits("NATIVE_SHELL_CONFINEMENT");
    expect(receipts).toHaveLength(2);
    for (const receipt of receipts) {
      expect(receipt).toMatchObject({ platform: "darwin", backend: "none", confined: false, enforcementLevel: "none", optInSource: "cli-flag" });
    }
    expect(audits("NATIVE_SHELL_UNCONFINED_ENABLED")).toEqual([expect.objectContaining({ platform: "darwin", optInSource: "cli-flag", sessionId: "shell-gate-session" })]);
    expect(toolset.readiness.shell).toMatchObject({ offered: true, decision: "unconfined-opt-in", enforcement: "none", boundary: null, reason: CLI_FLAG_WARNING });
    expect(stderr.mock.calls.filter(([chunk]) => String(chunk).includes(CLI_FLAG_WARNING))).toHaveLength(1);
  });
});

describe("Windows and Linux", () => {
  it("refuses Windows even with the flag", () => {
    pin("win32");
    const { toolset } = compose(workspace(), { unconfinedShell: "cli-flag" });
    expect(names(toolset)).not.toContain("bash");
    expect(toolset.readiness.shell.reason).toContain("not available on Windows");
  });

  it("refuses Linux without Bubblewrap, even with the flag, and names /usr/bin/bwrap", () => {
    pin("linux");
    backend.available.value = { ok: false, reason: "Install a supported system Bubblewrap at /usr/bin/bwrap; AMC does not fall back to an unconfined Linux shell." };
    const { toolset } = compose(workspace(), { unconfinedShell: "cli-flag" });
    expect(names(toolset)).not.toContain("bash");
    expect(toolset.readiness.shell).toMatchObject({ offered: false, decision: "refused" });
    expect(toolset.readiness.shell.reason).toContain("Install Bubblewrap at /usr/bin/bwrap");
  });

  it("confines Linux with Bubblewrap and records enforced at linux-bwrap", async () => {
    pin("linux");
    backend.run.mockImplementation(async () => ({ confined: true, backend: "bwrap", failure: null, exitCode: 0, timedOut: false,
      stdout: "fixture launcher completed", stderr: "", writableRoots: [], treeExitProven: true }));
    const { toolset, audits } = compose(workspace());
    expect(toolset.readiness.shell).toMatchObject({ offered: true, decision: "confined", enforcement: "enforced", boundary: "linux-bwrap", reason: null });
    const result = await toolset.seam.execute(bashCall("echo confined"));
    expect(result.outcome, String(result.content)).toBe("OK");
    expect(audits("NATIVE_SHELL_CONFINEMENT")).toEqual([expect.objectContaining({ platform: "linux", backend: "bwrap", confined: true,
      enforcementLevel: "enforced", boundary: "linux-bwrap" })]);
    expect(audits("NATIVE_SHELL_UNCONFINED_ENABLED")).toEqual([]);
  });
});

describe("no workspace file can opt in", () => {
  it("does not honour an unsigned allowUnconfined and says why", () => {
    pin("darwin");
    const dir = workspace();
    setAllowUnconfined(dir, true);
    rmSync(join(dir, ".amc", "amc.config.yaml.sig"));
    const { toolset } = compose(dir);
    expect(names(toolset)).not.toContain("bash");
    expect(toolset.readiness.shell.reason).toBe(`${NOT_HONOURED} ${DARWIN_REFUSAL}`);
  });

  it("ATTACK: a repository that signs allowUnconfined with its own auditor key is still refused", () => {
    pin("darwin");
    // A fresh workspace generates its own auditor keys, exactly as a malicious
    // repository can ship its own key history, opt-in and signature.
    const dir = workspace();
    setAllowUnconfined(dir, true);
    signAmcConfig(dir);
    expect(verifyAmcConfigSignature(dir).valid).toBe(true);
    const { toolset } = compose(dir);
    expect(names(toolset)).not.toContain("bash");
    expect(toolset.readiness.shell).toEqual({ offered: false, decision: "refused", enforcement: "none", boundary: null,
      reason: `${NOT_HONOURED} ${DARWIN_REFUSAL}`, optInSource: null });
  });

  it("adds the not-honoured note only to the macOS refusal, never where the flag cannot help", () => {
    const missing = { ok: false, reason: "Install a supported system Bubblewrap at /usr/bin/bwrap; AMC does not fall back to an unconfined Linux shell." } as const;
    for (const [os, bwrap] of [["win32", { ok: true }], ["linux", missing]] as const) {
      pin(os);
      backend.available.value = bwrap;
      const dir = workspace();
      setAllowUnconfined(dir, true);
      const expected = (decideNativeShell({ platform: os, bwrap, optIn: null }) as { remediation: string }).remediation;
      for (const explicit of [undefined, "cli-flag"] as const) expect(nativeShellReadiness(dir, explicit).reason, `${os} ${explicit}`).toBe(expected);
    }
  });

  it("the CLI, ACP and SDK paths ignore AMC_UNSAFE_UNCONFINED_SHELL", () => {
    pin("darwin");
    vi.stubEnv("AMC_UNSAFE_UNCONFINED_SHELL", "1");
    expect(nativeShellReadiness(workspace())).toEqual({ offered: false, decision: "refused", enforcement: "none", boundary: null,
      reason: DARWIN_REFUSAL, optInSource: null });
  });

  it("a caller cannot claim an unknown label as its explicit opt-in", () => {
    pin("darwin");
    const readiness = nativeShellReadiness(workspace(), "signed-config" as never);
    expect(readiness).toMatchObject({ offered: false, decision: "refused", optInSource: null });
  });

  it("amc verify --sign-config writes a signature that verifies", () => {
    const cli = resolve("dist/cli.js");
    if (!existsSync(cli)) throw new Error("Build dist/ before the amc verify --sign-config regression.");
    const dir = workspace();
    setAllowUnconfined(dir, true);
    expect(verifyAmcConfigSignature(dir).valid).toBe(false);
    const run = spawnSync(process.execPath, [cli, "verify", "--sign-config"], { cwd: dir, encoding: "utf8",
      env: { ...process.env, AMC_VAULT_PASSPHRASE: process.env["AMC_VAULT_PASSPHRASE"] } });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain(join(dir, ".amc", "amc.config.yaml.sig"));
    expect(verifyAmcConfigSignature(dir).valid).toBe(true);
  });
});

describe("Studio's operator-only opt-in", () => {
  async function studioStart(environment: NodeJS.ProcessEnv) {
    const dir = workspace();
    const home = join(dir, "operator-home");
    mkdirSync(home, { mode: 0o700 });
    const start = vi.spyOn(AMCNativeClient, "start").mockRejectedValue(new Error("fixture: no child process is started"));
    const service = createNativeTaskService({ workspace: dir, credentialsHome: home,
      environment: { HOME: home, PATH: process.env.PATH, AMC_VAULT_PASSPHRASE: process.env["AMC_VAULT_PASSPHRASE"], ...environment } });
    try {
      await service.start({ principalId: "shell-gate-operator", agentId: "default", demo: true },
        { clientRequestId: randomUUID(), agentId: "default", provider: "stub", tools: "none", prompt: "shell gate fixture" });
      await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
      return { dir, options: start.mock.calls[0]![0], shellOptIn: service.shellOptIn };
    } finally {
      await service.close();
      start.mockRestore();
    }
  }

  it("passes allowUnconfinedShell only for AMC_UNSAFE_UNCONFINED_SHELL=1 in its own environment, and never to the child", async () => {
    // Also ambient, so an allowlist leak into the child environment would show.
    vi.stubEnv("AMC_UNSAFE_UNCONFINED_SHELL", "1");
    const on = await studioStart({ AMC_UNSAFE_UNCONFINED_SHELL: "1" });
    expect(on.options.allowUnconfinedShell).toBe(true);
    // The child gets --unsafe-unconfined-shell and records "cli-flag" (see the agent-loop run test), so the banner must too.
    expect(on.shellOptIn).toBe("cli-flag");
    pin("darwin");
    expect(nativeShellReadiness(on.dir, on.shellOptIn ?? undefined)).toMatchObject({ optInSource: "cli-flag", reason: CLI_FLAG_WARNING });
    expect(on.options.env?.["AMC_UNSAFE_UNCONFINED_SHELL"]).toBeUndefined();
    for (const value of [undefined, "true", "yes", " 1"]) {
      const off = await studioStart(value === undefined ? {} : { AMC_UNSAFE_UNCONFINED_SHELL: value });
      expect(off.options, String(value)).not.toHaveProperty("allowUnconfinedShell");
      expect(off.shellOptIn, String(value)).toBeNull();
      expect(off.options.env?.["AMC_UNSAFE_UNCONFINED_SHELL"]).toBeUndefined();
    }
  });
});

function scriptedRegistry(bodies: unknown[]): AdapterRegistry {
  const adapter = scriptedAdapter([textStep("done")]);
  const registry = new AdapterRegistry();
  registry.register({ providerId: LOOP_PROVIDER, baseUrl: "https://api.anthropic.invalid", credentialRef: credentialRef("AMC_LOOP_TEST_KEY"),
    models: [LOOP_MODEL], adapter: { ...adapter, envelope: input => { bodies.push(input.body); return adapter.envelope(input); } } });
  return registry;
}
const offeredTools = (body: unknown): string[] => ((JSON.parse(Buffer.from(body as Uint8Array).toString("utf8")) as { tools?: { name: string }[] }).tools ?? []).map(tool => tool.name);

describe("every surface composes through the gate", () => {
  function session(dir: string, extra: Partial<AgentSessionInit> = {}) {
    let captured: AgentToolset | null = null;
    const opened = openAgentSession({ workspace: dir, agentId: "default", tools: "workspace",
      makeLlm: session => new LlmRuntime({ session, credentials: new FixedCredentials(), registry: scriptedRegistry([]), transport: silentTransport }),
      route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: {} }, systemPrompt: "s", harnessVersion: "3.2.0",
      compositionDigest: "c", policyDigest: "p",
      bindTools: ({ toolset }) => { captured = toolset; return toolset!.seam; }, ...extra });
    const offered = names(captured!);
    opened.close();
    return offered;
  }

  it("openAgentSession (ACP and the TypeScript SDK) offers bash on macOS only with the SDK opt-in", () => {
    pin("darwin");
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const dir = workspace();
    expect(session(dir)).not.toContain("bash");
    expect(session(dir, { unconfinedShell: "sdk-option" })).toContain("bash");
  });

  async function childTools(dir: string, parentShell?: NativeShellReadiness): Promise<string[]> {
    const bodies: unknown[] = [];
    const registry = scriptedRegistry(bodies);
    const runner = createDriverRunner({ workspace: dir, route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 64 } },
      makeLlm: session => new LlmRuntime({ session, credentials: new FixedCredentials(), registry, transport: silentTransport }),
      systemPrompt: "child", harnessVersion: "3.2.0", compositionDigest: "c", policyDigest: "p",
      ...(parentShell === undefined ? {} : { parentShell }) });
    const parent = new SessionService(dir);
    parent.open({ agentId: "default", harnessVersion: "3.2.0", compositionDigest: "c", policyDigest: "p" });
    const outcome = await spawnSubagent({ workspace: dir, parent: rootIdentity("default"), request: { runAs: "child", goal: "g" },
      session: { recordLoopEvent: record => parent.recordLoopEvent(record), recordProjectedEvidence: () => null }, runner,
      mintSessionId: () => `child-${randomUUID()}` });
    parent.close({ reason: "completed" });
    expect(outcome.ok, outcome.ok ? "" : outcome.reason).toBe(true);
    return offeredTools(bodies[0]);
  }

  it("a delegated child on macOS has no bash without the parent's opt-in, and inherits it when given", async () => {
    pin("darwin");
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const dir = workspace();
    const without = await childTools(dir);
    expect(without.length, "the child is offered its other workspace tools").toBeGreaterThan(0);
    expect(without).not.toContain("bash");
    expect(await childTools(dir, compose(dir, { unconfinedShell: "cli-flag" }).toolset.readiness.shell)).toContain("bash");
  });

  it("a child never widens a refused parent, even when the config is signed mid-run", async () => {
    pin("darwin");
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const dir = workspace();
    const parent = compose(dir).toolset.readiness.shell;
    expect(parent.decision).toBe("refused");
    setAllowUnconfined(dir, true);
    signAmcConfig(dir);
    expect(await childTools(dir, parent)).not.toContain("bash");
    expect(await childTools(dir), "a child with no parent decision inherits no opt-in").not.toContain("bash");
  });

  async function runCli(dir: string, extra: string[]) {
    const errors: string[] = [];
    priorExitListeners ??= process.listeners("exit");
    process.chdir(dir);
    const program = new Command().exitOverride();
    registerAgentCommands(program, { log: () => undefined, error: line => errors.push(line), fail: () => undefined });
    await program.parseAsync(["agent-loop", "run", "list files", "--provider", "stub", "--tools", "workspace", "--json", ...extra], { from: "user" });
    return errors.join("\n");
  }

  /** Opens one real ACP session over in-memory stdio; returns what `amc acp` wrote to its own stderr. */
  async function acpSession(dir: string, unconfinedShell?: boolean): Promise<string[]> {
    const stdin = new EventEmitter(), frames: { id?: number; error?: unknown }[] = [], diagnostics: string[] = [];
    const handle = startAcpStdio({ workspace: dir, agentId: "default", providerId: "stub", systemPrompt: "s", tools: "workspace",
      credentialsMode: "operator-only", credentialsHome: join(dir, "empty-home"), ...(unconfinedShell === undefined ? {} : { unconfinedShell }),
      stdin, stdout: { write: bytes => { frames.push(JSON.parse(bytes.toString("utf8")) as { id?: number }); return true; } },
      stderr: { write: chunk => { diagnostics.push(chunk); return true; } } });
    const call = async (id: number, method: string, params: unknown): Promise<void> => {
      stdin.emit("data", Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"));
      await vi.waitFor(() => expect(frames.find(frame => frame.id === id)).toBeDefined());
      expect(frames.find(frame => frame.id === id)!.error).toBeUndefined();
    };
    try {
      await call(1, "initialize", { protocolVersion: 1, clientCapabilities: {} });
      await call(2, "session/new", { cwd: dir, mcpServers: [] });
    } finally { await handle.close(); }
    return diagnostics;
  }

  it("amc acp maps --unsafe-unconfined-shell to the cli-flag opt-in and refuses the shell without it", async () => {
    pin("darwin");
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const warnings = () => stderr.mock.calls.map(([chunk]) => String(chunk)).filter(chunk => chunk.includes("UNCONFINED"));
    const dir = workspace();
    for (const off of [undefined, false]) expect(await acpSession(dir, off), String(off)).toEqual([`amc acp: ${DARWIN_REFUSAL}\n`]);
    expect(warnings()).toEqual([]);
    // The session composes with "cli-flag", not "sdk-option": the warning names its source.
    expect(await acpSession(dir, true)).toEqual([]);
    expect(warnings()).toEqual([`${CLI_FLAG_WARNING}\n`]);
  });

  it("amc agent-loop run refuses the shell on macOS and warns when --unsafe-unconfined-shell is passed", async () => {
    pin("darwin");
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const dir = workspace();
    expect(await runCli(dir, [])).toContain(DARWIN_REFUSAL);
    expect(stderr.mock.calls.some(([chunk]) => String(chunk).includes("UNCONFINED"))).toBe(false);
    await runCli(dir, ["--unsafe-unconfined-shell"]);
    expect(stderr.mock.calls.filter(([chunk]) => String(chunk).includes(CLI_FLAG_WARNING))).toHaveLength(1);
  });
});
