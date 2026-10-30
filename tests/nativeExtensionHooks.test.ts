import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { sha256Hex } from "../src/utils/hash.js";
import { signNativeExtension } from "../src/extensions/nativeExtensionStore.js";
import { NativeExtensionManager } from "../src/extensions/nativeExtensionRuntime.js";
import { ToolRegistry, defineTool } from "../src/tools/toolRegistry.js";
import { openActionJournal } from "../src/actions/actionJournal.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { readTurnEndMeta } from "../src/session/turnLifecycleMeta.js";
import { SessionService } from "../src/session/sessionService.js";
import { removeActionPolicy } from "./helpers/actionPolicyFixtures.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { loopHarness, textStep, toolStep, StubToolSeam, ok } from "./helpers/agentLoopHarness.js";

// Real manifest signatures; executable authority and launch are simulated here.
// nativeExecutableHooks tests exercise the admitted runner separately.
const runtime = vi.hoisted(() => ({ invoke: vi.fn(), current: vi.fn(), constructed: vi.fn() }));
vi.mock("../src/plugins/nativeExecutableRunner.js", () => ({ NativeExecutableRunner: class {
  readonly id = "hooks";
  constructor(_workspace: string, _path: string, readonly manifestDigest: string) { runtime.constructed(); }
  contextNames() { return []; }
  commandNames() { return []; }
  hookNames() { return ["turn-start", "turn-end", "step-start", "step-end", "tool-start", "tool-end", "pre-tool"] as const; }
  invoke(...args: unknown[]) { return runtime.invoke(...args) as Promise<string>; }
  assertCurrent() { return runtime.current(); }
  revoke() {}
} }));
const directories: string[] = [];
const passphrase = process.env.AMC_VAULT_PASSPHRASE;
afterEach(() => {
  vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllEnvs();
  if (passphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = passphrase;
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function fixture(signed = true) {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-extension-hooks-")));
  directories.push(workspace);
  const checkpoints = realpathSync(mkdtempSync(join(tmpdir(), "amc-hook-checkpoints-")));
  directories.push(checkpoints); vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", checkpoints);
  process.env.AMC_VAULT_PASSPHRASE = "native-hooks-fixture";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const root = join(workspace, "hooks"); mkdirSync(root);
  const path = join(root, "extension.json");
  const hooks = Object.fromEntries(["turn-start", "turn-end", "step-start", "step-end", "tool-start", "tool-end", "pre-tool"].map(kind => [kind, { export: "hook" }]));
  writeFileSync(path, JSON.stringify({ schemaVersion: 2, id: "hooks", contexts: [], commands: {}, executable: {
    apiVersion: 1, pluginId: "hooks-plugin", version: "1.0.0", packageSha256: "a".repeat(64), publisherFingerprint: "b".repeat(64),
    entrypoint: "content/extensions/hooks.mjs", capabilities: ["hook.observe", "hook.deny"], contexts: [], commands: {}, hooks,
    limits: { timeoutMs: 100, maxOutputBytes: 1_000, maxCalls: 100, maxLifetimeMs: 30_000 }
  } }));
  const digest = sha256Hex(readFileSync(path));
  if (signed) signNativeExtension(workspace, path, digest);
  runtime.invoke.mockResolvedValue('{"decision":"abstain"}');
  const manager = new NativeExtensionManager(workspace);
  return { workspace, path, digest, manager };
}
function pipeline(f: ReturnType<typeof fixture>, guard = () => undefined as string | undefined) {
  const registry = new ToolRegistry(); const body = vi.fn((_execution: import("../src/tools/toolTypes.js").ToolExecution) => ({ ok: true, output: "unchanged" }));
  registry.define(defineTool({ name: "read", description: "read", actionClass: "READ_ONLY", parameters: { type: "object" }, body }));
  registry.guard("native-extensions", f.manager.hooks.guard);
  registry.guard("policy", guard);
  const records: unknown[] = [];
  return { body, records, registry, pipeline: new ToolPipeline({ registry, workspace: f.workspace, authorizeClasses: new Set(),
    prepareGuards: f.manager.hooks.prepare, record: (execution, outcome) => records.push({ execution, outcome }) }) };
}
const call = { name: "read", agentId: "default", arguments: { secret: "never disclose" }, requestedMode: "EXECUTE" as const };

describe("governed native extension hooks", () => {
  it("never loads hooks from an unsigned extension", async () => {
    const f = fixture(false);
    expect(() => f.manager.load(f.path)).toThrow(/signature/i);
    expect(runtime.constructed).not.toHaveBeenCalled();
    await f.manager.hooks.observe({ kind: "turn-start", turn: 1 });
    expect(runtime.invoke).not.toHaveBeenCalled();
  });
  it("passes frozen redacted metadata and ignores observer output", async () => {
    const f = fixture(); f.manager.load(f.path);
    runtime.invoke.mockImplementation(async (_kind, _name, view) => {
      expect(Object.isFrozen(view)).toBe(true);
      expect(() => { view.turn = 999; }).toThrow(TypeError);
      expect(view).toEqual({ kind: "turn-start", turn: 1 });
      return '{"decision":"deny","reason":"observer cannot deny"}';
    });
    await expect(f.manager.hooks.observe({ kind: "turn-start", turn: 1 })).resolves.toEqual([]);
  });
  it("isolates throwing observers and reports extension, digest and coarse failure", async () => {
    const f = fixture(); f.manager.load(f.path);
    runtime.invoke.mockRejectedValue(new Error("private credential text"));
    const reports = await f.manager.hooks.observe({ kind: "step-start", turn: 1, step: 1 });
    expect(reports).toMatchObject([{ extensionId: "hooks", manifestDigest: f.digest, kind: "step-start", code: "EXECUTABLE_RUNTIME_FAILED" }]);
    expect(JSON.stringify(reports)).not.toContain("private credential");
  });
  it("denies through the pipeline and records the reason with exact extension identity", async () => {
    const f = fixture(); f.manager.load(f.path);
    runtime.invoke.mockResolvedValue('{"decision":"deny","reason":"review required"}');
    const p = pipeline(f); const result = await p.pipeline.execute(call);
    expect(result.denied).toMatchObject({ stage: "guard", guardLabel: "native-extensions" });
    expect(result.denied?.reason).toContain(`hooks sha256 ${f.digest}`);
    expect(result.denied?.reason).toContain("review required"); expect(p.body).not.toHaveBeenCalled();
    expect(p.records).toHaveLength(1);
    expect(JSON.stringify(p.records)).toContain("review required");
    const view = runtime.invoke.mock.calls[0]![2];
    expect(view).toEqual({ kind: "pre-tool", toolName: "read", actionClass: "READ_ONLY", requestedMode: "EXECUTE" });
    expect(Object.isFrozen(view)).toBe(true);
  });
  it("registers the native guard for top-level and Code Mode sub-calls with recorded evidence", async () => {
    const f = fixture(); f.manager.load(f.path); removeActionPolicy(f.workspace);
    initBudgets(f.workspace, "default"); writeRuntimeFirewallPolicy({ workspace: f.workspace, mode: "observe" });
    mkdirSync(join(f.workspace, "workspace")); writeFileSync(join(f.workspace, "workspace", "file.txt"), "private contents");
    const session = new SessionService(f.workspace);
    session.open({ agentId: "default", harnessVersion: "test", compositionDigest: "test", policyDigest: "test" });
    const evidence = vi.spyOn(session, "recordProjectedEvidence");
    const toolset = agentToolset({ workspace: f.workspace, agentId: "default", sessionId: session.sessionId,
      extensionHooks: f.manager.hooks, recorder: session });
    runtime.invoke.mockResolvedValue('{"decision":"deny","reason":"native guard review"}');
    try {
      expect(toolset.seam.extensionHooks).toBe(f.manager.hooks);
      const request = { callId: "native-call", toolName: "fs.read", rawArguments: '{"path":"workspace/file.txt"}',
        sessionId: session.sessionId, turn: 1, step: 1, dispatch: "native" as const, parentToken: null,
        signal: new AbortController().signal };
      const direct = await toolset.seam.execute(request);
      expect(direct.denied).toBe(true); expect(String(direct.content)).toContain("native guard review");
      expect(String(direct.content)).toContain(f.digest);
      const nested = await toolset.pipeline.execute({ name: "fs.read", agentId: "default", arguments: { path: "workspace/file.txt" },
        requestedMode: "EXECUTE", parentToken: "parent-tool" });
      expect(nested.denied?.guardLabel).toBe("native-extensions"); expect(nested.denied?.reason).toContain(f.digest);
      expect(JSON.stringify(evidence.mock.calls)).toContain(f.digest);
      expect(JSON.stringify(evidence.mock.calls)).toContain("native-extensions");
    } finally { toolset.close(); session.close({ reason: "completed" }); }
  });
  it("prepares the same deny-only guard on journaled calls", async () => {
    const f = fixture(); f.manager.load(f.path); removeActionPolicy(f.workspace);
    runtime.invoke.mockResolvedValue('{"decision":"deny","reason":"journal review required"}');
    const registry = new ToolRegistry(); const body = vi.fn(() => ({ ok: true, output: "must not run" }));
    registry.define(defineTool({ name: "fs.read", description: "read", actionClass: "READ_ONLY", body }));
    registry.guard("native-extensions", f.manager.hooks.guard);
    const journal = openActionJournal(f.workspace);
    const p = new ToolPipeline({ registry, workspace: f.workspace, prepareGuards: f.manager.hooks.prepare,
      authorizeClasses: new Set(["READ_ONLY"]), journal: () => journal, authorizationContext: () => ({ sessionId: "hook-journal" }) });
    try {
      const result = await p.execute({ ...call, name: "fs.read", arguments: { path: "workspace/file.txt" } });
      expect(result.denied).toMatchObject({ stage: "guard", guardLabel: "native-extensions" });
      expect(result.denied?.reason).toContain("journal review required"); expect(body).not.toHaveBeenCalled();
      expect(runtime.invoke).toHaveBeenCalledOnce(); expect(result.action?.state).toBe("denied");
    } finally { journal.close(); }
  });
  it("allow cannot override another guard or rewrite arguments and mode", async () => {
    const f = fixture(); f.manager.load(f.path);
    runtime.invoke.mockResolvedValue('{"decision":"allow"}');
    const denied = pipeline(f, () => "policy says no");
    expect((await denied.pipeline.execute(call)).denied).toMatchObject({ guardLabel: "policy", reason: "policy says no" });
    expect(denied.body).not.toHaveBeenCalled();
    const allowed = pipeline(f); expect((await allowed.pipeline.execute(call)).ok).toBe(true);
    expect(allowed.body.mock.calls[0]![0]).toMatchObject({ arguments: call.arguments, effectiveMode: "EXECUTE" });
  });
  it("runs policy checks after asynchronous hooks settle", async () => {
    const f = fixture(); f.manager.load(f.path); let blocked = false;
    runtime.invoke.mockImplementation(async () => { blocked = true; return '{"decision":"allow"}'; });
    const p = pipeline(f, () => blocked ? "new policy denial" : undefined);
    expect((await p.pipeline.execute(call)).denied?.reason).toBe("new policy denial"); expect(p.body).not.toHaveBeenCalled();
  });
  it.each(["timeout", "invalid response", "revoked"])("fails closed for deny-hook %s", async failure => {
    const f = fixture(); f.manager.load(f.path);
    if (failure === "invalid response") runtime.invoke.mockResolvedValue("not JSON");
    else runtime.invoke.mockRejectedValue(new Error(failure));
    const p = pipeline(f); const result = await p.pipeline.execute(call);
    expect(result.denied?.guardLabel).toBe("native-extensions"); expect(result.denied?.reason).toContain(f.digest);
    expect(p.body).not.toHaveBeenCalled();
  });
  it("never evaluates hooks in place of a refused approval", async () => {
    const f = fixture(); f.manager.load(f.path); const p = pipeline(f);
    const approve = vi.fn(async () => "deny" as const);
    const guarded = new ToolPipeline({ registry: p.registry, workspace: f.workspace, authorizeClasses: new Set(),
      prepareGuards: f.manager.hooks.prepare, approve, approvalRequiredFor: new Set(["READ_ONLY"]) });
    expect((await guarded.execute(call)).denied?.stage).toBe("approval");
    expect(approve).toHaveBeenCalledOnce(); expect(runtime.invoke).not.toHaveBeenCalled(); expect(p.body).not.toHaveBeenCalled();
  });
  it("refuses a prepared hook decision after unload", async () => {
    const f = fixture(); f.manager.load(f.path);
    runtime.invoke.mockImplementation(async () => { f.manager.unload("hooks"); return '{"decision":"allow"}'; });
    const p = pipeline(f); expect((await p.pipeline.execute(call)).denied?.reason).toContain("load changed");
    expect(p.body).not.toHaveBeenCalled();
  });
  it("refuses a deny guard that was not prepared for the exact execution", async () => {
    const f = fixture(); f.manager.load(f.path); const p = pipeline(f);
    const unprepared = new ToolPipeline({ registry: p.registry, workspace: f.workspace, authorizeClasses: new Set() });
    expect((await unprepared.execute(call)).denied?.reason).toContain("not evaluated"); expect(p.body).not.toHaveBeenCalled();
  });
  it("rechecks authority after an allow response and denies a stale signed load", async () => {
    const f = fixture(); f.manager.load(f.path);
    runtime.invoke.mockImplementation(async () => { runtime.current.mockImplementation(() => { throw new Error("revoked"); }); return '{"decision":"allow"}'; });
    const p = pipeline(f); expect((await p.pipeline.execute(call)).denied?.guardLabel).toBe("native-extensions"); expect(p.body).not.toHaveBeenCalled();
  });
  it("observes all native driver boundaries without changing the signed turn", async () => {
    const f = fixture(); f.manager.load(f.path);
    const stub = new StubToolSeam({ read: async () => ok("private output") });
    const h = loopHarness({ scripts: [toolStep("call", "read", '{"secret":"private arguments"}'), textStep("done")],
      tools: Object.assign(stub, { extensionHooks: f.manager.hooks }) });
    directories.push(h.dir);
    try {
      h.driver.send("private prompt", "next-turn", true); await h.driver.whenIdle();
      const kinds = runtime.invoke.mock.calls.map(args => args[1]);
      for (const kind of ["turn-start", "turn-end", "step-start", "step-end", "tool-start", "tool-end"]) expect(kinds).toContain(kind);
      expect(JSON.stringify(runtime.invoke.mock.calls)).not.toMatch(/private (prompt|arguments|output)/);
      expect(h.driver.status).toBe("idle");
    } finally { h.finish(); }
  });
  it("cancels an active observer and passes the cancelled signal to closing notifications", async () => {
    const f = fixture(); f.manager.load(f.path); const stub = new StubToolSeam({});
    let started: (() => void) | undefined;
    const entered = new Promise<void>(resolve => { started = resolve; });
    runtime.invoke.mockImplementation(async (_kind, name, _view, signal: AbortSignal) => {
      if (signal?.aborted) throw new Error("cancelled");
      if (name === "turn-start") {
        started!();
        await new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
      }
      return "";
    });
    const h = loopHarness({ scripts: [textStep("must not request")], tools: Object.assign(stub, { extensionHooks: f.manager.hooks }) });
    directories.push(h.dir);
    try {
      h.driver.send("run", "next-turn", true); await entered; h.driver.cancel({ kind: "user" }); await h.driver.whenIdle();
      expect(h.driver.status).toBe("idle");
      expect(h.events().filter(event => event.event_type === "turn/end")).toHaveLength(1);
      const ending = runtime.invoke.mock.calls.find(args => args[1] === "turn-end");
      expect(ending?.[3]?.aborted).toBe(true);
    } finally { h.finish(); }
  });
  it("keeps late observer failures out of an already sealed turn", async () => {
    const f = fixture(); f.manager.load(f.path);
    let rejectObserver: ((error: Error) => void) | undefined;
    runtime.invoke.mockImplementation(async (_kind, name) => {
      if (name === "tool-end") return new Promise<string>((_resolve, reject) => { rejectObserver = reject; });
      return "";
    });
    const stub = new StubToolSeam({ read: async () => { h.driver.cancel({ kind: "user" }); return ok("done"); } });
    const h = loopHarness({ scripts: [toolStep("call", "read", "{}")], config: { toolAbandonGraceMs: 1 },
      tools: Object.assign(stub, { extensionHooks: f.manager.hooks }) });
    directories.push(h.dir);
    try {
      h.driver.send("run", "next-turn", true); await h.driver.whenIdle();
      expect(rejectObserver).toBeTypeOf("function");
      const count = h.events().length; rejectObserver!(new Error("late private failure"));
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(h.events()).toHaveLength(count); expect(f.manager.hooks.reports()).toHaveLength(1);
    } finally { h.finish(); }
  });
  it("names the recorded observer failure as the cancellation evidence head", async () => {
    const f = fixture(); f.manager.load(f.path); runtime.invoke.mockRejectedValue(new Error("private observer failure"));
    const stub = new StubToolSeam({});
    const h = loopHarness({ scripts: [textStep("unused")], tools: Object.assign(stub, { extensionHooks: f.manager.hooks }) });
    directories.push(h.dir);
    let failureId: string | undefined;
    const record = h.session.recordProjectedEvidence.bind(h.session);
    vi.spyOn(h.session, "recordProjectedEvidence").mockImplementation(row => {
      const ref = record(row);
      if (failureId === undefined) { failureId = ref.eventId; queueMicrotask(() => h.driver.cancel({ kind: "user" })); }
      return ref;
    });
    try {
      h.driver.send("run", "next-turn", true); await h.driver.whenIdle();
      const cancel = h.events().find(event => event.event_type === "loop/cancel");
      expect(failureId).toBeTypeOf("string");
      expect(JSON.parse(cancel!.meta_json).observedHeadEventId).toBe(failureId);
    } finally { h.finish(); }
  });
  it("keeps a throwing hook from breaking turn closure and records its failure", async () => {
    const f = fixture(); f.manager.load(f.path); runtime.invoke.mockRejectedValue(new Error("private exception"));
    const stub = new StubToolSeam({});
    const h = loopHarness({ scripts: [textStep("done")], tools: Object.assign(stub, { extensionHooks: f.manager.hooks }) });
    directories.push(h.dir);
    try {
      h.driver.send("run", "next-turn", true); await h.driver.whenIdle();
      expect(h.driver.status).toBe("idle");
      const events = h.events(); expect(events.filter(event => event.event_type === "turn/end")).toHaveLength(1);
      expect(readTurnEndMeta(events.find(event => event.event_type === "turn/end")!.meta_json)?.reason).toBe("complete");
      expect(events.some(event => event.meta_json.includes(f.digest) && event.meta_json.includes("EXECUTABLE_RUNTIME_FAILED"))).toBe(true);
    } finally { h.finish(); }
  });
});
