import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { listHandoffPackets, verifyHandoffPacket } from "../src/fleet/handoffPacket.js";
import { parseSubagentStopConditions } from "../src/agent/subagentStopConditions.js";
import { spawnSubagent, type SpawnSubagentInit, type SubagentContinuation,
  type SubagentRunContext, type SubagentRunResult } from "../src/agent/subagentSpawn.js";
import { createDriverRunner } from "../src/agent/subagentRunner.js";
import { SessionService } from "../src/session/sessionService.js";
import { openLedger } from "../src/ledger/ledger.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import type { HttpTransport } from "../src/llm/adapter/transport.js";
import type { LoopEventRecord } from "../src/session/loopEventMeta.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport,
  textStep, toolStep } from "./helpers/agentLoopHarness.js";

// Authored implementation regressions. Scripted transport is not provider evidence.
const dirs: string[] = [];
afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function workspace(): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "stop-conditions-fixture-passphrase");
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-stop-conditions-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  return dir;
}
function recorder() {
  const rows: LoopEventRecord[] = [];
  const projected: Array<{ payload: string; meta: Record<string, unknown> }> = [];
  return { rows, projected,
    recordLoopEvent: (row: LoopEventRecord) => { rows.push(row); return null; },
    recordProjectedEvidence: (row: { payload: string; meta: Record<string, unknown> }) => { projected.push(row); return null; } };
}
function spawn(dir: string, session: ReturnType<typeof recorder>, over: Partial<SpawnSubagentInit> = {}) {
  return spawnSubagent({ workspace: dir, parent: rootIdentity("default"),
    request: { runAs: "child", goal: "first question" }, session,
    runner: async () => ({ ok: true, text: "first answer" }), mintSessionId: () => "child-stop-fixture", ...over });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function completion(session: ReturnType<typeof recorder>) {
  return session.rows.filter(row => row.kind === "delegation-completed");
}
function fakeClock() { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }); }
function retained(implementation: SubagentContinuation["continue"] = async () => ({ ok: true, text: "next answer" })) {
  return { continue: vi.fn(implementation), close: vi.fn() };
}

const invalid = [
  "stop when done", "max-turns:0", "max-turns:-1", "max-turns:+1", "max-turns:01", "max-turns:1.0",
  "max-turns:1e2", "max-turns: 1", " max-turns:1", "max-turns:1 ", "max-turns:1\n", "MAX-TURNS:1",
  "timeout-ms:0", "timeout-ms:2147483648", "max-turns:9007199254740992", "timeout-ms:Infinity", "unknown:2"
];
describe("the signed stop vocabulary", () => {
  it("snapshots supported canonical values without changing signed order", () => {
    const input = ["timeout-ms:2147483647", "max-turns:9007199254740991"];
    const parsed = parseSubagentStopConditions(input);
    expect(parsed).toEqual({ ok: true, conditions: [...input], timeoutMs: 2147483647, maxTurns: 9007199254740991 });
    input[0] = "timeout-ms:1";
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.conditions[0]).toBe("timeout-ms:2147483647");
    expect(Object.isFrozen(parsed.conditions)).toBe(true);
    expect(Object.isFrozen(parsed)).toBe(true);
  });
  it("treats omitted and empty declarations as no extra bounds", () => {
    expect(parseSubagentStopConditions(undefined)).toEqual({ ok: true, conditions: [] });
    expect(parseSubagentStopConditions([])).toEqual({ ok: true, conditions: [] });
  });
  it.each(invalid)("refuses unsupported or noncanonical condition %s", condition => {
    expect(parseSubagentStopConditions([condition])).toMatchObject({ ok: false, reason: expect.any(String) });
  });
  it("refuses duplicate kinds, malformed containers and non-string entries", () => {
    for (const input of [
      ["max-turns:1", "max-turns:2"], ["timeout-ms:1", "timeout-ms:1"],
      [2], [undefined], new Array(1), null, "max-turns:1", {}
    ]) expect(parseSubagentStopConditions(input as readonly string[])).toMatchObject({ ok: false });
  });
  it("refuses before minting a packet, announcing a session or invoking a runner", async () => {
    const dir = workspace(), session = recorder(), runner = vi.fn(async () => ({ ok: true, text: "unreachable" }));
    const mint = vi.fn(() => "must-not-mint");
    for (const conditions of [...invalid.map(value => [value]), ["max-turns:1", "max-turns:2"]]) {
      const outcome = await spawn(dir, session, { request: { runAs: "child", goal: "g", stopConditions: conditions }, runner, mintSessionId: mint });
      expect(outcome).toMatchObject({ ok: false, packetId: null });
    }
    expect(runner).not.toHaveBeenCalled(); expect(mint).not.toHaveBeenCalled();
    expect(session.rows).toEqual([]); expect(listHandoffPackets(dir)).toEqual([]);
  });
});

describe("one admitted-invocation ceiling for an entire delegation", () => {
  it("counts the initial invocation and closes immediately at max-turns:1", async () => {
    const dir = workspace(), session = recorder(), child = retained(); fakeClock();
    const outcome = await spawn(dir, session, { request: { runAs: "child", goal: "g", continuable: true,
      stopConditions: ["max-turns:1", "timeout-ms:100"] }, runner: async () => ({ ok: true, text: "actual answer", continuation: child }) });
    expect(outcome).toMatchObject({ ok: true, childText: "actual answer" });
    expect("handle" in outcome && outcome.handle).toBeFalsy();
    expect(child.continue).not.toHaveBeenCalled(); expect(child.close).toHaveBeenCalledTimes(1);
    expect(completion(session)).toMatchObject([{ settledAs: "reported", reason: expect.stringContaining("max-turns:1") }]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("admits the final continuation, closes it, and refuses every later dispatch", async () => {
    const dir = workspace(), session = recorder(), child = retained(); fakeClock();
    const outcome = await spawn(dir, session, { request: { runAs: "child", goal: "g", continuable: true,
      stopConditions: ["max-turns:2", "timeout-ms:100"] }, runner: async () => ({ ok: true, text: "first", continuation: child }) });
    if (!outcome.ok || !outcome.handle) throw new Error("expected live handle");
    expect(completion(session)).toEqual([]);
    expect(await outcome.handle.continue("last permitted")).toEqual({ ok: true, text: "next answer" });
    expect(await outcome.handle.continue("must not run")).toMatchObject({ ok: false, reason: expect.stringContaining("max-turns:2") });
    outcome.handle.close("reported", "duplicate close");
    expect(child.continue).toHaveBeenCalledTimes(1); expect(child.continue).toHaveBeenCalledWith("last permitted");
    expect(child.close).toHaveBeenCalledTimes(1);
    expect(completion(session)).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("refuses concurrent admissions without consuming a remaining turn or exposing raw continuations", async () => {
    const dir = workspace(), session = recorder(), pending = deferred<SubagentRunResult>();
    const child = retained(() => pending.promise);
    const outcome = await spawn(dir, session, { request: { runAs: "child", goal: "g", continuable: true, stopConditions: ["max-turns:3"] },
      runner: async () => ({ ok: true, text: "first", continuation: child }) });
    if (!outcome.ok || !outcome.handle) throw new Error("expected live handle");
    const second = outcome.handle.continue("second");
    expect(await outcome.handle.continue("concurrent")).toMatchObject({ ok: false, reason: expect.stringContaining("active turn") });
    expect(child.continue).toHaveBeenCalledTimes(1);
    pending.resolve({ ok: true, text: "second", continuation: child });
    expect(await second).toEqual({ ok: true, text: "second" });
    expect(await outcome.handle.continue("third")).toEqual({ ok: true, text: "second" });
    expect(child.continue).toHaveBeenCalledTimes(2); expect(child.close).toHaveBeenCalledTimes(1);
    expect(completion(session)).toHaveLength(1);
  });
  it("uses snapshots of the goal, parent identity, scope and stop declarations after admission", async () => {
    const dir = workspace(), session = recorder(), pending = deferred<SubagentRunResult>(), child = retained();
    const conditions = ["max-turns:2"], scope = ["READ_ONLY"], parent = rootIdentity("default");
    const request = { runAs: "child", goal: "signed goal", continuable: true, stopConditions: conditions, delegationScope: scope };
    let context!: SubagentRunContext;
    const running = spawn(dir, session, { parent, request, runner: async ctx => { context = ctx; return pending.promise; } });
    conditions[0] = "max-turns:99"; scope[0] = "WRITE_HIGH"; request.goal = "mutated goal"; request.continuable = false;
    Object.assign(parent, { governedAs: "other-root" });
    pending.resolve({ ok: true, text: "actual first", continuation: child });
    const outcome = await running;
    if (!outcome.ok || !outcome.handle) throw new Error("expected bounded handle");
    const verified = verifyHandoffPacket(dir, outcome.packetId);
    expect(verified.signatureValid).toBe(true);
    expect(verified.packet).toMatchObject({ goal: "signed goal", stopConditions: ["max-turns:2"], delegationScope: ["READ_ONLY"] });
    expect(context.goal).toBe("signed goal"); expect(context.toolsetAgentId).toBe("default");
    expect(context.stopConditions).toEqual(["max-turns:2"]); expect(Object.isFrozen(context.stopConditions)).toBe(true);
    expect(context.delegationScope).toEqual(["READ_ONLY"]);
    await outcome.handle.continue("final");
    expect(await outcome.handle.continue("forbidden")).toMatchObject({ ok: false });
    expect(child.continue).toHaveBeenCalledTimes(1);
  });
  it.each([{ stopConditions: undefined }, { stopConditions: [] }])("preserves an unbounded retained child when conditions are $stopConditions", async ({ stopConditions }) => {
    const dir = workspace(), session = recorder(), child = retained(); fakeClock();
    const outcome = await spawn(dir, session, { request: { runAs: "child", goal: "g", continuable: true, stopConditions },
      runner: async () => ({ ok: true, text: "first", continuation: child }) });
    if (!outcome.ok || !outcome.handle) throw new Error("expected live handle");
    await outcome.handle.continue("second"); await outcome.handle.continue("third");
    expect(completion(session)).toEqual([]); expect(vi.getTimerCount()).toBe(0);
    outcome.handle.close("reported", "done");
    expect(await outcome.handle.continue("fourth")).toMatchObject({ ok: false, reason: expect.stringContaining("released") });
    expect(child.continue).toHaveBeenCalledTimes(2); expect(child.close).toHaveBeenCalledTimes(1);
  });
});

describe("one nonresetting lifetime timeout and bounded cancellation", () => {
  it("keeps its timeout referenced during execution and releases that reference while idle", async () => {
    const dir = workspace(), session = recorder(), pending = deferred<SubagentRunResult>(), child = retained();
    const timers = vi.spyOn(globalThis, "setTimeout");
    const running = spawn(dir, session, { request: { runAs: "child", goal: "g", continuable: true,
      stopConditions: ["timeout-ms:60000"] }, runner: () => pending.promise });
    const timerIndex = timers.mock.calls.findIndex(([_callback, delay]) => delay === 60000);
    const timer = timers.mock.results[timerIndex]?.value as ReturnType<typeof setTimeout>;
    try {
      expect(timer).toBeDefined(); expect(timer.hasRef()).toBe(true);
      pending.resolve({ ok: true, text: "first", continuation: child });
      const outcome = await running;
      if (!outcome.ok || !outcome.handle) throw new Error("expected live handle");
      expect(timer.hasRef()).toBe(false);
    } finally {
      pending.resolve({ ok: true, text: "first", continuation: child });
      const outcome = await running;
      if (outcome.ok) outcome.handle?.close("reported", "done");
    }
    expect(child.close).toHaveBeenCalledTimes(1);
  });
  it("includes idle continuation time and releases the timed-out child exactly once", async () => {
    const dir = workspace(), session = recorder(), child = retained(), parent = new AbortController(); fakeClock();
    const add = vi.spyOn(parent.signal, "addEventListener"), remove = vi.spyOn(parent.signal, "removeEventListener");
    let signal!: AbortSignal;
    const outcome = await spawn(dir, session, { signal: parent.signal, request: { runAs: "child", goal: "g", continuable: true,
      stopConditions: ["timeout-ms:100"] }, runner: async ctx => { signal = ctx.signal!; return { ok: true, text: "first", continuation: child }; } });
    if (!outcome.ok || !outcome.handle) throw new Error("expected live handle");
    await vi.advanceTimersByTimeAsync(60); await outcome.handle.continue("second");
    await vi.advanceTimersByTimeAsync(39); expect(child.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true); expect(child.close).toHaveBeenCalledTimes(1);
    expect(await outcome.handle.continue("too late")).toMatchObject({ ok: false, reason: expect.stringContaining("timeout-ms:100") });
    outcome.handle.close("reported", "duplicate"); parent.abort();
    expect(child.continue).toHaveBeenCalledTimes(1); expect(completion(session)).toHaveLength(1);
    expect(completion(session)[0]).toMatchObject({ settledAs: "cancelled", reason: expect.stringContaining("idle") });
    const subscription = add.mock.calls.find(([kind]) => kind === "abort")?.[1];
    expect(remove.mock.calls.some(([kind, listener]) => kind === "abort" && listener === subscription)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("refuses late admission even before the event loop delivers the timeout callback", async () => {
    const dir = workspace(), session = recorder(), child = retained(); fakeClock();
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const outcome = await spawn(dir, session, { request: { runAs: "child", goal: "g", continuable: true, stopConditions: ["timeout-ms:100"] },
      runner: async () => ({ ok: true, text: "first", continuation: child }) });
    if (!outcome.ok || !outcome.handle) throw new Error("expected live handle");
    now.mockReturnValue(101);
    expect(await outcome.handle.continue("after deadline")).toMatchObject({ ok: false, reason: expect.stringContaining("timeout-ms:100") });
    expect(child.continue).not.toHaveBeenCalled(); expect(child.close).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("never returns a live initial handle after cancellation, even when the runner reports success", async () => {
    const dir = workspace(), session = recorder(), parent = new AbortController(), child = retained(); fakeClock();
    const outcome = await spawn(dir, session, { signal: parent.signal, request: { runAs: "child", goal: "g", continuable: true,
      stopConditions: ["timeout-ms:100"] }, runner: async () => { parent.abort(); return { ok: true, text: "actual output", continuation: child }; } });
    expect(outcome).toMatchObject({ ok: false, childText: "actual output", reason: expect.stringContaining("parent cancelled") });
    expect("handle" in outcome).toBe(false); expect(child.close).toHaveBeenCalledTimes(1);
    expect(completion(session)).toMatchObject([{ settledAs: "cancelled" }]); expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds an uncooperative initial executor, then closes its late retained resource without resettling", async () => {
    const dir = workspace(), session = recorder(), child = retained(), pending = deferred<SubagentRunResult>(); fakeClock();
    let signal!: AbortSignal;
    const running = spawn(dir, session, { cancelGraceMs: 20, request: { runAs: "child", goal: "g", continuable: true,
      stopConditions: ["timeout-ms:100"] }, runner: ctx => { signal = ctx.signal!; return pending.promise; } });
    await vi.advanceTimersByTimeAsync(100);
    expect(signal.aborted).toBe(true); expect(completion(session)).toEqual([]);
    await vi.advanceTimersByTimeAsync(20);
    expect(await running).toMatchObject({ ok: false, reason: expect.stringContaining("execution stop unconfirmed") });
    expect(child.close).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    pending.resolve({ ok: true, text: "late words", continuation: child }); await pending.promise; await Promise.resolve();
    expect(child.close).toHaveBeenCalledTimes(1); expect(completion(session)).toHaveLength(1);
  });
  it("does not close a retained DB under an active continuation while timeout grace expires", async () => {
    const dir = workspace(), session = recorder(), pending = deferred<SubagentRunResult>(); fakeClock();
    let inFlight = false;
    const child = retained(async () => { inFlight = true; try { return await pending.promise; } finally { inFlight = false; } });
    child.close.mockImplementation(() => { expect(inFlight, "resources remain owned until execution actually returns").toBe(false); });
    const lateChild = retained();
    const outcome = await spawn(dir, session, { cancelGraceMs: 20, request: { runAs: "child", goal: "g", continuable: true,
      stopConditions: ["timeout-ms:100"] }, runner: async () => ({ ok: true, text: "first", continuation: child }) });
    if (!outcome.ok || !outcome.handle) throw new Error("expected live handle");
    await vi.advanceTimersByTimeAsync(60); const running = outcome.handle.continue("active second");
    await vi.advanceTimersByTimeAsync(40); expect(child.close).not.toHaveBeenCalled(); expect(completion(session)).toEqual([]);
    await vi.advanceTimersByTimeAsync(20);
    expect(await running).toMatchObject({ ok: false, reason: expect.stringContaining("abandoned") });
    expect(child.close).not.toHaveBeenCalled();
    expect(await outcome.handle.continue("forbidden")).toMatchObject({ ok: false });
    outcome.handle.close("reported", "duplicate");
    pending.resolve({ ok: true, text: "late answer", continuation: lateChild }); await pending.promise; await Promise.resolve(); await Promise.resolve();
    expect(child.close).toHaveBeenCalledTimes(1); expect(lateChild.close).toHaveBeenCalledTimes(1);
    expect(child.continue).toHaveBeenCalledTimes(1); expect(completion(session)).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("defers active explicit close to bounded execution settlement", async () => {
    const dir = workspace(), session = recorder(), pending = deferred<SubagentRunResult>(), child = retained(() => pending.promise); fakeClock();
    let signal!: AbortSignal;
    const outcome = await spawn(dir, session, { cancelGraceMs: 20, request: { runAs: "child", goal: "g", continuable: true },
      runner: async ctx => { signal = ctx.signal!; return { ok: true, text: "first", continuation: child }; } });
    if (!outcome.ok || !outcome.handle) throw new Error("expected live handle");
    const running = outcome.handle.continue("active"); outcome.handle.close("reported", "operator release");
    expect(signal.aborted).toBe(true); expect(child.close).not.toHaveBeenCalled(); expect(completion(session)).toEqual([]);
    pending.resolve({ ok: false, text: "partial child output", reason: "cooperated" });
    expect(await running).toMatchObject({ ok: false, text: "partial child output", reason: expect.stringContaining("release requested") });
    expect(child.close).toHaveBeenCalledTimes(1); expect(completion(session)).toMatchObject([{ settledAs: "cancelled" }]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps the parent abort connection across idle continuations without a timeout", async () => {
    const dir = workspace(), session = recorder(), child = retained(), parent = new AbortController();
    const outcome = await spawn(dir, session, { signal: parent.signal, request: { runAs: "child", goal: "g", continuable: true },
      runner: async () => ({ ok: true, text: "first", continuation: child }) });
    if (!outcome.ok || !outcome.handle) throw new Error("expected live handle");
    parent.abort();
    expect(await outcome.handle.continue("forbidden")).toMatchObject({ ok: false, reason: expect.stringContaining("parent cancelled") });
    expect(child.continue).not.toHaveBeenCalled(); expect(child.close).toHaveBeenCalledTimes(1);
    expect(completion(session)).toMatchObject([{ settledAs: "cancelled" }]);
  });
  it("cleans timeout/listener state on a throwing continuation and never repeats settlement", async () => {
    const dir = workspace(), session = recorder(), child = retained(async () => { throw new Error("executor broke"); }), parent = new AbortController(); fakeClock();
    const outcome = await spawn(dir, session, { signal: parent.signal, request: { runAs: "child", goal: "g", continuable: true,
      stopConditions: ["timeout-ms:100"] }, runner: async () => ({ ok: true, text: "first", continuation: child }) });
    if (!outcome.ok || !outcome.handle) throw new Error("expected live handle");
    expect(await outcome.handle.continue("fail")).toMatchObject({ ok: false, reason: expect.stringContaining("executor broke") });
    parent.abort(); await vi.advanceTimersByTimeAsync(200);
    expect(child.close).toHaveBeenCalledTimes(1); expect(completion(session)).toMatchObject([{ settledAs: "failed" }]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not turn failed completion recording into a passing result or retry the row on timeout", async () => {
    const dir = workspace(), session = recorder(); fakeClock();
    const write = session.recordLoopEvent;
    session.recordLoopEvent = row => { if (row.kind === "delegation-completed") throw new Error("parent writer closed"); return write(row); };
    const outcome = await spawn(dir, session, { request: { runAs: "child", goal: "g", stopConditions: ["timeout-ms:100"] } });
    expect(outcome).toMatchObject({ ok: false, childText: "first answer", reason: expect.stringContaining("could not be recorded") });
    await vi.advanceTimersByTimeAsync(200); expect(completion(session)).toEqual([]); expect(vi.getTimerCount()).toBe(0);
  });
});

function nativeRunner(dir: string, scripts: ReturnType<typeof textStep>[], transport: HttpTransport = silentTransport) {
  initBudgets(dir, "default"); writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  const registry = new AdapterRegistry(), adapter = scriptedAdapter(scripts);
  registry.register({ providerId: LOOP_PROVIDER, baseUrl: "https://fixture.invalid", credentialRef: null, models: [LOOP_MODEL],
    adapter: { ...adapter, envelope: input => ({ ...adapter.envelope(input), signal: input.signal }) } });
  return createDriverRunner({ workspace: dir,
    makeLlm: session => new LlmRuntime({ session, registry, credentials: new FixedCredentials(), transport }),
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
    systemPrompt: "Respect delegated limits.", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
}
function childRows(dir: string) {
  const ledger = openLedger(dir, { readonly: true });
  try { return ledger.getAllEvents().filter(row => row.session_id === "child-stop-fixture"); }
  finally { ledger.close(); }
}
function parentSession(dir: string) {
  const session = new SessionService(dir);
  session.open({ agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
  return session;
}
describe("native child integration with real session storage and scripted transport", () => {
  it("counts invocations rather than model steps and seals the native session at the final turn", async () => {
    const dir = workspace(); writeFileSync(join(dir, "input.txt"), "fixture text");
    const runner = nativeRunner(dir, [toolStep("read", "fs.read", '{"path":"input.txt"}'), textStep("first answer"), textStep("second answer")]);
    const session = parentSession(dir);
    try {
      const outcome = await spawnSubagent({ workspace: dir, parent: rootIdentity("default"), session, runner,
        request: { runAs: "child", goal: "read input", continuable: true, stopConditions: ["max-turns:2"] }, mintSessionId: () => "child-stop-fixture" });
      if (!outcome.ok || !outcome.handle) throw new Error(`expected native handle: ${JSON.stringify(outcome)}`);
      expect(outcome.childText).toContain("first answer");
      expect(childRows(dir).filter(row => row.event_type === "request/header")).toHaveLength(2);
      expect(await outcome.handle.continue("summarize again")).toMatchObject({ ok: true, text: expect.stringContaining("second answer") });
      const before = childRows(dir);
      expect(await outcome.handle.continue("forbidden third invocation")).toMatchObject({ ok: false, reason: expect.stringContaining("max-turns:2") });
      expect(childRows(dir)).toEqual(before);
      expect(before.filter(row => row.event_type === "request/header")).toHaveLength(3);
      expect(before.filter(row => row.event_type === "turn/end")).toHaveLength(2);
      expect(before.filter(row => row.event_type === "session/close")).toHaveLength(1);
      expect(before.at(-1)?.event_type).toBe("session/close");
    } finally { session.close({ reason: "completed" }); }
  });
  it("aborts the actual native continuation request and records cancellation before session close", async () => {
    const dir = workspace(), entered = deferred<void>(); let calls = 0, signal: AbortSignal | undefined;
    const transport: HttpTransport = async envelope => {
      if (++calls === 1) return silentTransport(envelope);
      signal = envelope.signal; entered.resolve();
      return await new Promise((_resolve, reject) => {
        const abort = () => reject(new DOMException("fixture timeout", "AbortError"));
        if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
      });
    };
    const runner = nativeRunner(dir, [textStep("first answer")], transport), session = parentSession(dir); fakeClock();
    try {
      const outcome = await spawnSubagent({ workspace: dir, parent: rootIdentity("default"), session, runner, cancelGraceMs: 100,
        request: { runAs: "child", goal: "first", continuable: true, stopConditions: ["timeout-ms:1000"] }, mintSessionId: () => "child-stop-fixture" });
      if (!outcome.ok || !outcome.handle) throw new Error(`expected native handle: ${JSON.stringify(outcome)}`);
      await vi.advanceTimersByTimeAsync(800);
      const pending = outcome.handle.continue("second"); await entered.promise;
      await vi.advanceTimersByTimeAsync(200);
      expect(await pending).toMatchObject({ ok: false, reason: expect.stringContaining("timeout-ms:1000") });
      expect(signal?.aborted).toBe(true);
      const rows = childRows(dir);
      expect(JSON.parse(rows.filter(row => row.event_type === "turn/end").at(-1)!.meta_json)).toMatchObject({ reason: "cancelled" });
      expect(rows.filter(row => row.event_type === "session/close")).toHaveLength(1);
      expect(rows.at(-1)?.event_type).toBe("session/close");
      const count = rows.length;
      expect(await outcome.handle.continue("late")).toMatchObject({ ok: false }); expect(childRows(dir)).toHaveLength(count);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); session.close({ reason: "completed" }); }
  });
});
