import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentToolset, type AgentToolset } from "../src/agent/agentToolset.js";
import { openAgentSession, type AgentSession } from "../src/agent/agentSession.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { openLedger } from "../src/ledger/ledger.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { loadToolsConfig, signToolsConfig, toolsConfigPath } from "../src/toolhub/toolhubValidators.js";
import { initWorkspace } from "../src/workspace.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import type { SandboxOutcome, SandboxPolicy } from "../src/sandbox/sandboxTypes.js";
import type { ToolCallRequest } from "../src/agent/toolSeam.js";
import type { SessionService } from "../src/session/sessionService.js";
import type { EvidenceEvent } from "../src/types.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep } from "./helpers/agentLoopHarness.js";

// Pin only the operating-system launcher. The signed policy, private native
// bash binding, authorization, journal and ToolPipeline remain the real path.
const backend = vi.hoisted(() => ({ run: vi.fn<(argv: readonly string[], cwd: string, policy: SandboxPolicy) => Promise<SandboxOutcome>>() }));
vi.mock("../src/sandbox/bwrapBackend.js", async importOriginal => ({
  ...(await importOriginal<typeof import("../src/sandbox/bwrapBackend.js")>()),
  bwrapBackend: () => ({ kind: "bwrap", available: () => ({ ok: true }), run: backend.run })
}));
vi.mock("../src/sandbox/seatbeltNativeShell.js", async importOriginal => ({
  ...(await importOriginal<typeof import("../src/sandbox/seatbeltNativeShell.js")>()),
  seatbeltNativeShell: () => ({ kind: "seatbelt", available: () => ({ ok: false, reason: "test requires the Linux binding" }), run: backend.run })
}));

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const dirs: string[] = [];
const tools: AgentToolset[] = [];
const sessions: AgentSession[] = [];
const resourceTools = [
  ["job_start", "WRITE_HIGH"], ["job_list", "READ_ONLY"], ["job_output", "READ_ONLY"], ["job_kill", "READ_ONLY"],
  ["terminal_open", "WRITE_HIGH"], ["terminal_list", "READ_ONLY"], ["terminal_read", "READ_ONLY"],
  ["terminal_send", "WRITE_HIGH"], ["terminal_signal", "WRITE_HIGH"], ["terminal_resize", "WRITE_HIGH"], ["terminal_close", "WRITE_HIGH"]
] as const;

beforeEach(() => {
  const checkpoints = realpathSync(mkdtempSync("/private/tmp/amc-wp16-control-"));
  dirs.push(checkpoints);
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", checkpoints);
  process.env["AMC_VAULT_PASSPHRASE"] ??= "wp16-native-composition-pass";
  Object.defineProperty(process, "platform", { ...platform, value: "linux" });
});
afterEach(async () => {
  for (const session of sessions.splice(0)) { try { await session.close(); } catch { /* already closed or released */ } }
  for (const toolset of tools.splice(0)) { try { await toolset.shutdown(); await toolset.close(); } catch { /* preserve failed test */ } }
  backend.run.mockReset();
  Object.defineProperty(process, "platform", platform);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp16-native-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  mkdirSync(join(dir, "workspace", "output"), { recursive: true });
  return dir;
}
function admitResourceTools(dir: string): void {
  const config = loadToolsConfig(dir);
  for (const [name, actionClass] of resourceTools) config.tools.allowedTools.push({ name, actionClass });
  const bash = config.tools.allowedTools.find(tool => tool.name === "bash")!;
  bash.nativeSandbox = { kind: "linux-bwrap", writableDirectories: ["workspace/output"] };
  writeFileSync(toolsConfigPath(dir), YAML.stringify(config));
  signToolsConfig(dir);
}
function compose(dir: string, sessionId = "wp16-native-session"): AgentToolset {
  const toolset = agentToolset({ workspace: dir, agentId: "default", sessionId,
    recorder: { recordProjectedEvidence: () => null } });
  tools.push(toolset);
  return toolset;
}
function call(name: string, args: unknown, sessionId = "wp16-native-session"): ToolCallRequest {
  return { callId: randomUUID(), toolName: name, rawArguments: JSON.stringify(args), sessionId,
    turn: 7, step: 3, parentToken: null, dispatch: "native", signal: new AbortController().signal };
}
function closeRows(dir: string, sessionId: string) {
  const ledger = openLedger(dir);
  try { return ledger.getAllEvents().filter(event => event.session_id === sessionId && event.event_type === "session/close"); }
  finally { ledger.close(); }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}
function idleSession(dir: string, cleanup: Promise<boolean>): AgentSession {
  const registry = new AdapterRegistry();
  registry.register({ providerId: LOOP_PROVIDER, adapter: scriptedAdapter([textStep("unused")]),
    baseUrl: "https://api.anthropic.invalid", credentialRef: credentialRef("AMC_LOOP_TEST_KEY"), models: [LOOP_MODEL] });
  const opened = openAgentSession({ workspace: dir, agentId: "default", systemPrompt: "Own and reap every resource.",
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: {} }, harnessVersion: "test", compositionDigest: "c", policyDigest: "p",
    makeLlm: session => new LlmRuntime({ session, credentials: new FixedCredentials(), registry, transport: silentTransport }),
    bindTools: ({ toolset }) => {
      if (!toolset) throw new Error("The test requires native workspace tools.");
      // A deterministic resource lifetime lets this test observe the writer
      // while physical cleanup is pending, without relying on process timing.
      toolset.hasOwnedWork = () => true;
      toolset.shutdown = () => cleanup;
      return { ...toolset.seam, hasOwnedWork: () => true, shutdown: () => cleanup };
    } });
  sessions.push(opened);
  return opened;
}

describe("WP16 native tool composition", () => {
  it("offers jobs and PTYs only after their exact native identities are signed", async () => {
    const dir = workspace();
    const toolset = compose(dir);
    const before = (toolset.seam.schemas() ?? []).map(schema => schema.name);
    for (const [name] of resourceTools) expect(before).not.toContain(name);
    const denied = await toolset.seam.execute(call("job_list", {}));
    expect(denied.outcome).toBe("DENIED");

    admitResourceTools(dir);
    const after = (toolset.seam.schemas() ?? []).map(schema => schema.name);
    for (const [name] of resourceTools) expect(after).toContain(name);
    const list = await toolset.seam.execute(call("job_list", {}));
    expect(list.outcome, String(list.content)).toBe("OK");
    expect(JSON.parse(String(list.content))).toEqual([]);
    const terminal = await toolset.seam.execute(call("terminal_list", {}));
    expect(terminal.outcome, String(terminal.content)).toBe("OK");
    expect(JSON.parse(String(terminal.content))).toEqual([]);
  });

  it("starts, reads and kills an owned job through the same governed confined bash pipeline", async () => {
    const dir = workspace();
    admitResourceTools(dir);
    const toolset = compose(dir);
    const entered = deferred<void>();
    let shellSignal: AbortSignal | undefined;
    backend.run.mockImplementation(async (_argv, _cwd, policy) => {
      shellSignal = policy.signal;
      policy.onOutput?.("stdout", "partial job output\n");
      entered.resolve();
      await new Promise<void>(resolve => {
        if (policy.signal?.aborted) resolve();
        else policy.signal?.addEventListener("abort", () => resolve(), { once: true });
      });
      return { confined: true, backend: "bwrap", failure: null, exitCode: null, timedOut: false,
        cancelled: true, stdout: "partial job output\n", stderr: "", writableRoots: [], treeExitProven: true };
    });
    const start = call("job_start", { command: "echo partial; sleep 30", description: "owned task" });
    const accepted = await toolset.seam.execute(start);
    expect(accepted.outcome, String(accepted.content)).toBe("OK");
    const snapshot = JSON.parse(String(accepted.content)) as { id: string; ownerStep: unknown };
    expect(snapshot.ownerStep).toEqual({ sessionId: start.sessionId, turn: 7, step: 3, callId: start.callId });
    await entered.promise;
    expect(backend.run).toHaveBeenCalledTimes(1);
    expect(shellSignal?.aborted).toBe(false);
    const output = await toolset.seam.execute(call("job_output", { job_id: snapshot.id, wait: true, timeout_ms: 5 }));
    expect(output.outcome, String(output.content)).toBe("OK");
    expect(String(output.content)).toContain("partial job output");
    const killed = await toolset.seam.execute(call("job_kill", { job_id: snapshot.id, reason: "operator stopped it" }));
    expect(killed.outcome, String(killed.content)).toBe("OK");
    expect(JSON.parse(String(killed.content))).toMatchObject({ stopRequested: true, cleanup: "confirmed" });
    expect(shellSignal?.aborted).toBe(true);
    expect(await toolset.shutdown()).toBe(true);
  });

  it("keeps an ambiguous bash receipt unknown even after physical cleanup is observed", async () => {
    const dir = workspace();
    admitResourceTools(dir);
    const toolset = compose(dir);
    backend.run.mockResolvedValue({ confined: true, backend: "bwrap", failure: { kind: "runner-failure", reason: "Command receipt was lost." },
      exitCode: null, timedOut: false, stdout: "", stderr: "", writableRoots: [], treeExitProven: true });
    const started = await toolset.seam.execute(call("job_start", { command: "echo uncertain" }));
    expect(started.outcome, String(started.content)).toBe("OK");
    await vi.waitFor(async () => {
      const listed = await toolset.seam.execute(call("job_list", {}));
      expect(listed.outcome, String(listed.content)).toBe("OK");
      const jobs = JSON.parse(String(listed.content)) as { cleanup: string; outcome: { outcome: string } | null }[];
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({ cleanup: "confirmed", outcome: { outcome: "TOOL_OUTCOME_UNKNOWN" } });
    });
  });

  it("does not turn an unconfined macOS shell opt-in into background job authority", async () => {
    const dir = workspace();
    admitResourceTools(dir);
    const config = loadToolsConfig(dir);
    delete config.tools.allowedTools.find(tool => tool.name === "bash")!.nativeSandbox;
    writeFileSync(toolsConfigPath(dir), YAML.stringify(config));
    signToolsConfig(dir);
    Object.defineProperty(process, "platform", { ...platform, value: "darwin" });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const toolset = agentToolset({ workspace: dir, agentId: "default", sessionId: "wp16-native-session", unconfinedShell: "cli-flag",
      recorder: { recordProjectedEvidence: () => null } });
    tools.push(toolset);
    expect(toolset.readiness.shell.decision).toBe("unconfined-opt-in");
    expect((toolset.seam.schemas() ?? []).map(schema => schema.name)).toContain("job_start");
    const refused = await toolset.seam.execute(call("job_start", { command: "printf unconfined-must-not-run" }));
    expect(refused.outcome).toBe("ERROR");
    expect(String(refused.content)).toContain("Background jobs require the admitted confined bash binding");
    expect(backend.run).not.toHaveBeenCalled();
    expect(toolset.hasOwnedWork()).toBe(false);
  });

  it("refuses forged owner arguments before starting any shell", async () => {
    const dir = workspace();
    admitResourceTools(dir);
    const toolset = compose(dir);
    const refused = await toolset.seam.execute(call("job_start", { command: "echo forbidden", owner: "another-session" }));
    expect(refused.outcome).toBe("ERROR");
    expect(backend.run).not.toHaveBeenCalled();
  });

  it("refuses a job call whose trusted step belongs to a different composed session", async () => {
    const dir = workspace();
    admitResourceTools(dir);
    const toolset = compose(dir);
    const refused = await toolset.seam.execute(call("job_start", { command: "echo forbidden" }, "foreign-session"));
    expect(refused.outcome).not.toBe("OK");
    expect(String(refused.content)).toMatch(/ownership|session step/);
    expect(backend.run).not.toHaveBeenCalled();
  });
});

describe("WP16 pre-seal owned-resource cleanup", () => {
  it("reaps a real owned job and records confinement evidence before closing its actual native session", async () => {
    const dir = workspace();
    admitResourceTools(dir);
    const entered = deferred<void>();
    const exit = deferred<SandboxOutcome>();
    let signal: AbortSignal | undefined;
    backend.run.mockImplementation(async (_argv, _cwd, policy) => {
      signal = policy.signal;
      policy.onOutput?.("stdout", "owned session job started\n");
      entered.resolve();
      return exit.promise;
    });
    const registry = new AdapterRegistry();
    registry.register({ providerId: LOOP_PROVIDER, adapter: scriptedAdapter([textStep("unused")]),
      baseUrl: "https://api.anthropic.invalid", credentialRef: credentialRef("AMC_LOOP_TEST_KEY"), models: [LOOP_MODEL] });
    let realTools!: AgentToolset;
    const session = openAgentSession({ workspace: dir, agentId: "default", systemPrompt: "Reap the resources this session starts.",
      route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: {} }, harnessVersion: "test", compositionDigest: "c", policyDigest: "p",
      makeLlm: writer => new LlmRuntime({ session: writer, credentials: new FixedCredentials(), registry, transport: silentTransport }),
      bindTools: ({ toolset }) => {
        if (!toolset) throw new Error("The test requires the real native toolset.");
        realTools = toolset;
        return toolset.seam;
      } });
    sessions.push(session);
    const readRows = (): EvidenceEvent[] => {
      const ledger = openLedger(dir);
      try { return ledger.db.prepare("SELECT * FROM evidence_events WHERE session_id = ? ORDER BY rowid ASC").all(session.sessionId) as EvidenceEvent[]; }
      finally { ledger.close(); }
    };
    let closing: void | Promise<void>;
    try {
      const started = await realTools.seam.execute(call("job_start", { command: "echo owned; sleep 30", description: "session-owned job" }, session.sessionId));
      expect(started.outcome, String(started.content)).toBe("OK");
      await entered.promise;
      expect(signal?.aborted).toBe(false);
      expect(realTools.hasOwnedWork()).toBe(true);
      closing = session.close();
      expect(closing).toBeInstanceOf(Promise);
      expect(signal?.aborted, "session end must request stop before yielding").toBe(true);
      await Promise.resolve();
      expect(closeRows(dir, session.sessionId), "process exit proof is still pending").toEqual([]);
      exit.resolve({ confined: true, backend: "bwrap", failure: null, exitCode: null, timedOut: false, cancelled: true,
        stdout: "owned session job started\n", stderr: "", writableRoots: [], treeExitProven: true });
      await closing;
      const rows = readRows();
      const confinement = rows.findIndex(row => row.event_type === "audit" && (JSON.parse(row.meta_json) as { auditType?: string }).auditType === "NATIVE_SHELL_CONFINEMENT");
      const closed = rows.findIndex(row => row.event_type === "session/close");
      expect(confinement).toBeGreaterThanOrEqual(0);
      expect(closed).toBeGreaterThan(confinement);
      expect(closed).toBe(rows.length - 1);
      expect(JSON.parse(rows[closed]!.meta_json)).toMatchObject({ reason: "completed" });
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(readRows(), "late completion must not append evidence after the session close").toEqual(rows);
      expect(realTools.hasOwnedWork()).toBe(false);
    } finally {
      exit.resolve({ confined: true, backend: "bwrap", failure: null, exitCode: null, timedOut: false, cancelled: true,
        stdout: "", stderr: "", writableRoots: [], treeExitProven: true });
    }
  });

  for (const confirmed of [true, false]) {
    it(`waits for physical cleanup before sealing and records ${confirmed ? "completed" : "resource_outcome_unknown"}`, async () => {
      const dir = workspace();
      const cleanup = deferred<boolean>();
      const session = idleSession(dir, cleanup.promise);
      const closing = session.close();
      expect(closing).toBeInstanceOf(Promise);
      expect(closeRows(dir, session.sessionId)).toEqual([]);
      expect(await session.prompt("late admission")).toMatchObject({ ok: false });
      expect(closeRows(dir, session.sessionId), "the writer must still be open after asynchronous admission settles").toEqual([]);
      cleanup.resolve(confirmed);
      await closing;
      const rows = closeRows(dir, session.sessionId);
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0]!.meta_json)).toMatchObject({ reason: confirmed ? "completed" : "resource_outcome_unknown" });
    });
  }

  it("keeps a failed composition unsealed while cleanup is pending and disposes unknown resources without a clean close", async () => {
    const dir = workspace();
    const cleanup = deferred<boolean>();
    let writer!: SessionService;
    let disposeCalls = 0;
    const sessionId = "failed-owned-composition";
    expect(() => openAgentSession({ workspace: dir, agentId: "default", sessionId,
      route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: {} }, systemPrompt: "Owned setup.",
      harnessVersion: "test", compositionDigest: "c", policyDigest: "p",
      makeLlm: () => { throw new Error("The failed mount must prevent model construction."); },
      bindTools: context => {
        writer = context.session;
        if (!context.toolset) throw new Error("The test requires workspace tools.");
        context.toolset.hasOwnedWork = () => true;
        context.toolset.shutdown = () => cleanup.promise;
        const disposeWriter = writer.disposeWithoutClosing.bind(writer);
        vi.spyOn(writer, "disposeWithoutClosing").mockImplementation(() => { disposeCalls++; disposeWriter(); });
        throw new Error("resource mount failed");
      } })).toThrow("resource mount failed");
    try {
      await Promise.resolve();
      expect(closeRows(dir, sessionId)).toEqual([]);
      expect(disposeCalls).toBe(0);
      expect(() => writer.assertWritable()).not.toThrow();
      cleanup.resolve(false);
      await vi.waitFor(() => expect(disposeCalls).toBe(1));
      expect(closeRows(dir, sessionId)).toEqual([]);
      expect(() => writer.assertWritable()).toThrow();
    } finally { cleanup.resolve(false); }
  });

  it("refuses ownership handover when cleanup cannot be observed", async () => {
    const dir = workspace();
    const cleanup = deferred<boolean>();
    const session = idleSession(dir, cleanup.promise);
    const releasing = session.release!();
    expect(closeRows(dir, session.sessionId)).toEqual([]);
    cleanup.resolve(false);
    await expect(releasing).rejects.toThrow(/cleanup|unknown|resource/i);
    expect(closeRows(dir, session.sessionId)).toEqual([]);
  });
});
