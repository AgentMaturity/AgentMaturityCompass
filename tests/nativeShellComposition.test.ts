import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
import { nativeShellReadiness, type NativeShellReadiness } from "../src/sandbox/nativeShellGate.js";
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
// Hands the next read of one path different bytes, to model a swap between two reads.
const tamper = vi.hoisted(() => ({ once: null as null | { readonly path: string; readonly text: string } }));
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const readFileSync = ((path: Parameters<typeof actual.readFileSync>[0], options?: unknown) => {
    if (tamper.once !== null && String(path) === tamper.once.path) {
      const { text } = tamper.once;
      tamper.once = null;
      return options === undefined ? Buffer.from(text) : text;
    }
    return actual.readFileSync(path, options as never);
  }) as typeof actual.readFileSync;
  return { ...actual, readFileSync };
});
vi.mock("../src/sandbox/bwrapBackend.js", async importOriginal => ({
  ...(await importOriginal<typeof import("../src/sandbox/bwrapBackend.js")>()),
  bwrapBackend: () => ({ kind: "bwrap", available: () => backend.available.value, run: backend.run })
}));

const DARWIN_REFUSAL = "The native shell is refused on macOS: AMC cannot confine it yet (Seatbelt confinement arrives with P1-05). To accept an unconfined shell with your full user rights, pass --unsafe-unconfined-shell or set runtime.shell.allowUnconfined: true in a signed .amc/amc.config.yaml.";
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
  tamper.once = null;
  vi.restoreAllMocks();
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
    const warning = "WARNING: the native shell is UNCONFINED on darwin (opt-in: cli-flag). Commands run with your full user rights: files outside the workspace, ~/.ssh and the network are reachable. Receipts record enforcement: none.";
    expect(toolset.readiness.shell).toMatchObject({ offered: true, decision: "unconfined-opt-in", enforcement: "none", boundary: null, reason: warning });
    expect(stderr.mock.calls.filter(([chunk]) => String(chunk).includes(warning))).toHaveLength(1);
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

describe("the signed config opt-in", () => {
  it("ignores an unsigned allowUnconfined and says how to sign it", () => {
    pin("darwin");
    const dir = workspace();
    setAllowUnconfined(dir, true);
    rmSync(join(dir, ".amc", "amc.config.yaml.sig"));
    const { toolset } = compose(dir);
    expect(names(toolset)).not.toContain("bash");
    expect(toolset.readiness.shell.reason).toContain("runtime.shell.allowUnconfined is ignored: config signature missing. Re-sign the config with: amc verify --sign-config");
  });

  it("honours a signed allowUnconfined and ignores it once edited after signing", () => {
    pin("darwin");
    const dir = workspace();
    setAllowUnconfined(dir, true);
    signAmcConfig(dir);
    const signed = compose(dir);
    expect(names(signed.toolset)).toContain("bash");
    expect(signed.toolset.readiness.shell).toMatchObject({ decision: "unconfined-opt-in", optInSource: "signed-config" });
    writeFileSync(join(dir, ".amc", "amc.config.yaml"), `${readFileSync(join(dir, ".amc", "amc.config.yaml"), "utf8")}# edited\n`);
    const edited = compose(dir);
    expect(names(edited.toolset)).not.toContain("bash");
    expect(edited.toolset.readiness.shell.reason).toContain("runtime.shell.allowUnconfined is ignored: config digest mismatch");
  });

  it("survives amc init re-saving the config, which re-signs it", () => {
    pin("darwin");
    const dir = workspace();
    setAllowUnconfined(dir, true);
    signAmcConfig(dir);
    initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
    expect(verifyAmcConfigSignature(dir).valid).toBe(true);
    expect(names(compose(dir).toolset)).toContain("bash");
  });

  it("amc init never signs an opt-in that was added without a valid signature", () => {
    pin("darwin");
    const dir = workspace();
    setAllowUnconfined(dir, true);
    expect(verifyAmcConfigSignature(dir).valid).toBe(false);
    initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
    expect(verifyAmcConfigSignature(dir).valid).toBe(true);
    expect(names(compose(dir).toolset)).not.toContain("bash");
  });

  it("decides from the same bytes the signature covers, so a swap between reads cannot opt in", () => {
    pin("darwin");
    const dir = workspace();
    const path = join(dir, ".amc", "amc.config.yaml");
    signAmcConfig(dir);
    tamper.once = { path, text: `${readFileSync(path, "utf8")}runtime:\n  shell:\n    allowUnconfined: true\n` };
    expect(nativeShellReadiness(dir)).toMatchObject({ offered: false, decision: "refused", optInSource: null });
    expect(verifyAmcConfigSignature(dir, Buffer.from(`${readFileSync(path, "utf8")}# unsigned\n`))).toMatchObject({ valid: false, reason: "config digest mismatch" });
  });

  it("a caller cannot claim the signed config as its explicit opt-in", () => {
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

  it("amc agent-loop run refuses the shell on macOS and warns when --unsafe-unconfined-shell is passed", async () => {
    pin("darwin");
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const dir = workspace();
    expect(await runCli(dir, [])).toContain(DARWIN_REFUSAL);
    expect(stderr.mock.calls.some(([chunk]) => String(chunk).includes("UNCONFINED"))).toBe(false);
    await runCli(dir, ["--unsafe-unconfined-shell"]);
    expect(stderr.mock.calls.filter(([chunk]) => String(chunk).includes("WARNING: the native shell is UNCONFINED on darwin (opt-in: cli-flag)"))).toHaveLength(1);
  });
});
