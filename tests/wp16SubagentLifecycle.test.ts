import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { openLedger } from "../src/ledger/ledger.js";
import { SessionService } from "../src/session/sessionService.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import type { HttpTransport } from "../src/llm/adapter/transport.js";
import { createDriverRunner } from "../src/agent/subagentRunner.js";
import { spawnSubagent, type SubagentRunContext } from "../src/agent/subagentSpawn.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import type { LoopEventRecord } from "../src/session/loopEventMeta.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep } from "./helpers/agentLoopHarness.js";

const resourceState = vi.hoisted(() => ({ unknown: false, toolsets: [] as import("../src/agent/agentToolset.js").AgentToolset[] }));
vi.mock("../src/agent/agentToolset.js", async importOriginal => {
  const original = await importOriginal<typeof import("../src/agent/agentToolset.js")>();
  return { ...original, agentToolset: (...args: Parameters<typeof original.agentToolset>) => {
    const toolset = original.agentToolset(...args);
    resourceState.toolsets.push(toolset);
    if (resourceState.unknown) { toolset.hasOwnedWork = () => true; toolset.shutdown = () => Promise.resolve(false); }
    return toolset;
  } };
});

const dirs: string[] = [];
const writers: SessionService[] = [];
beforeEach(() => {
  const checkpoints = realpathSync(mkdtempSync("/private/tmp/amc-wp16-child-control-"));
  dirs.push(checkpoints);
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", checkpoints);
  process.env["AMC_VAULT_PASSPHRASE"] ??= "wp16-subagent-lifecycle-pass";
});
afterEach(async () => {
  resourceState.unknown = false;
  for (const writer of writers.splice(0)) { try { writer.disposeWithoutClosing(); } catch { /* already disposed */ } }
  for (const toolset of resourceState.toolsets.splice(0)) { try { await toolset.close(); } catch { /* preserve failed check */ } }
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function workspace(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp16-child-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  return dir;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}
function context(continuable: boolean): SubagentRunContext {
  return { continuable, toolsetAgentId: "default", childSessionId: "wp16-child", goal: "first task",
    identity: { governedAs: "default", runAs: "child", parent: "default", depth: 1 } };
}
function runnerFor(dir: string, transport: HttpTransport = silentTransport) {
  const adapter = scriptedAdapter([textStep("child answered")]);
  const registry = new AdapterRegistry();
  registry.register({ providerId: LOOP_PROVIDER, credentialRef: null, models: [LOOP_MODEL], baseUrl: "https://fixture.invalid",
    adapter: { ...adapter, envelope: input => ({ ...adapter.envelope(input), signal: input.signal }) } });
  return createDriverRunner({ workspace: dir, route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 128 } },
    systemPrompt: "Keep child resources owned until cleanup is observed.", harnessVersion: "test", compositionDigest: "c", policyDigest: "p",
    config: { toolAbandonGraceMs: 0 }, makeLlm: session => {
      writers.push(session);
      return new LlmRuntime({ session, credentials: new FixedCredentials(), registry, transport });
    } });
}
function rows(dir: string) {
  const ledger = openLedger(dir, { readonly: true });
  try { return ledger.getAllEvents().filter(event => event.session_id === "wp16-child"); }
  finally { ledger.close(); }
}
function recorder() {
  const records: LoopEventRecord[] = [];
  return { records, recordLoopEvent: (record: LoopEventRecord) => { records.push(record); }, recordProjectedEvidence: () => null };
}

describe("WP16 delegated cleanup", () => {
  it("awaits bounded active continuation shutdown and never seals a noncooperative child", async () => {
    const dir = workspace(), entered = deferred<void>();
    let requests = 0, signal: AbortSignal | undefined;
    const runner = runnerFor(dir, request => {
      if (++requests === 1) return silentTransport(request);
      signal = request.signal;
      entered.resolve();
      return new Promise(() => undefined);
    });
    const first = await runner(context(true));
    if (!first.ok || !first.continuation) throw new Error(`Expected a continued child: ${JSON.stringify(first)}`);
    const active = first.continuation.continue("second task").then(value => ({ value }), error => ({ error }));
    await entered.promise;
    const stoppedAt = Date.now();
    const closing = first.continuation.close();
    expect(closing).toBeInstanceOf(Promise);
    expect(signal?.aborted).toBe(true);
    let settled = false;
    const released = Promise.resolve(closing).then(() => { settled = true; return { error: undefined }; }, error => { settled = true; return { error }; });
    await Promise.resolve();
    expect(settled, "requesting cancellation is not an observed drain").toBe(false);
    expect(rows(dir).filter(event => event.event_type === "session/close")).toEqual([]);
    const closed = await released;
    expect(String(closed.error)).toContain("TOOL_OUTCOME_UNKNOWN");
    const result = await active;
    expect("error" in result || result.value.ok === false).toBe(true);
    expect(Date.now() - stoppedAt).toBeLessThan(5_000);
    expect(rows(dir).filter(event => event.event_type === "session/close" || event.event_type === "session/release")).toEqual([]);
    expect(() => writers[0]!.assertWritable()).toThrow();
  }, 15_000);

  it("does not return a successful noncontinuable child after owned resource cleanup is unknown", async () => {
    const dir = workspace();
    resourceState.unknown = true;
    const result = await runnerFor(dir)(context(false)).then(value => ({ value }), error => ({ error }));
    expect("error" in result || result.value.ok === false).toBe(true);
    if ("error" in result) expect(String(result.error)).toContain("TOOL_OUTCOME_UNKNOWN");
    expect(rows(dir).filter(event => event.event_type === "session/close")
      .some(event => (JSON.parse(event.meta_json) as { reason: string }).reason === "completed")).toBe(false);
  });

  it("awaits a retained asynchronous close before accounting a public delegation as reported", async () => {
    const dir = workspace(), session = recorder(), cleanup = deferred<void>();
    const close = vi.fn(() => cleanup.promise);
    const first = await spawnSubagent({ workspace: dir, parent: rootIdentity("default"), session,
      request: { runAs: "child", goal: "first", continuable: true }, mintSessionId: () => "wp16-child",
      runner: async () => ({ ok: true, text: "first answer", continuation: { continue: async () => ({ ok: true, text: "next" }), close } }) });
    if (!first.ok || !first.handle) throw new Error("Expected a retained delegation.");
    const closing = first.handle.close("reported", "finished");
    expect(closing).toBeInstanceOf(Promise);
    expect(session.records.filter(record => record.kind === "delegation-completed")).toEqual([]);
    expect(close).toHaveBeenCalledTimes(1);
    cleanup.resolve();
    await closing;
    expect(session.records.filter(record => record.kind === "delegation-completed")).toMatchObject([{ settledAs: "reported" }]);
    await first.handle.close("reported", "duplicate");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("propagates rejected asynchronous cleanup and accounts failure without reporting success", async () => {
    const dir = workspace(), session = recorder();
    const cleanup = deferred<void>();
    const closingFailure = cleanup.promise.then(() => { throw new Error("TOOL_OUTCOME_UNKNOWN: producer survived"); });
    void closingFailure.catch(() => undefined);
    const first = await spawnSubagent({ workspace: dir, parent: rootIdentity("default"), session,
      request: { runAs: "child", goal: "first", continuable: true }, mintSessionId: () => "wp16-child",
      runner: async () => ({ ok: true, text: "first answer", continuation: { continue: async () => ({ ok: true, text: "next" }), close: () => closingFailure } }) });
    if (!first.ok || !first.handle) throw new Error("Expected a retained delegation.");
    const closing = first.handle.close("reported", "finished");
    cleanup.resolve();
    await expect(Promise.resolve(closing)).rejects.toThrow(/TOOL_OUTCOME_UNKNOWN/);
    expect(session.records.filter(record => record.kind === "delegation-completed")).toMatchObject([{ settledAs: "failed", reason: expect.stringContaining("TOOL_OUTCOME_UNKNOWN") }]);
  });

  it("does not return an automatic successful spawn before its retained async resource closes", async () => {
    const dir = workspace(), session = recorder(), cleanup = deferred<void>(), entered = deferred<void>();
    let settled = false;
    const spawning = spawnSubagent({ workspace: dir, parent: rootIdentity("default"), session,
      request: { runAs: "child", goal: "first" }, mintSessionId: () => "wp16-child",
      runner: async () => ({ ok: true, text: "first answer", continuation: { continue: async () => ({ ok: true, text: "next" }),
        close: () => { entered.resolve(); return cleanup.promise; } } }) }).then(result => { settled = true; return result; });
    await entered.promise;
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(settled).toBe(false);
    expect(session.records.filter(record => record.kind === "delegation-completed")).toEqual([]);
    cleanup.resolve();
    expect(await spawning).toMatchObject({ ok: true });
    expect(session.records.filter(record => record.kind === "delegation-completed")).toMatchObject([{ settledAs: "reported" }]);
  });

  it("makes public active close await bounded unknown settlement without closing a still-running resource", async () => {
    const dir = workspace(), session = recorder(), pending = deferred<{ ok: boolean; text: string }>();
    const close = vi.fn();
    const first = await spawnSubagent({ workspace: dir, parent: rootIdentity("default"), session, cancelGraceMs: 5,
      request: { runAs: "child", goal: "first", continuable: true }, mintSessionId: () => "wp16-child",
      runner: async () => ({ ok: true, text: "first answer", continuation: { continue: () => pending.promise, close } }) });
    if (!first.ok || !first.handle) throw new Error("Expected a retained delegation.");
    const active = first.handle.continue("second");
    const closing = first.handle.close("cancelled", "operator stopped");
    expect(closing).toBeInstanceOf(Promise);
    expect(close).not.toHaveBeenCalled();
    await expect(Promise.resolve(closing)).rejects.toThrow(/TOOL_OUTCOME_UNKNOWN/);
    expect(await active).toMatchObject({ ok: false, reason: expect.stringContaining("unconfirmed") });
    expect(close).not.toHaveBeenCalled();
    pending.resolve({ ok: true, text: "late" });
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(session.records.filter(record => record.kind === "delegation-completed")).toHaveLength(1);
  });

  it("bounds an asynchronous cleanup promise that never acknowledges release", async () => {
    const dir = workspace(), session = recorder();
    const first = await spawnSubagent({ workspace: dir, parent: rootIdentity("default"), session, cancelGraceMs: 5,
      request: { runAs: "child", goal: "first", continuable: true }, mintSessionId: () => "wp16-child",
      runner: async () => ({ ok: true, text: "first answer", continuation: { continue: async () => ({ ok: true, text: "next" }), close: () => new Promise<void>(() => undefined) } }) });
    if (!first.ok || !first.handle) throw new Error("Expected a retained delegation.");
    await expect(Promise.resolve(first.handle.close("reported", "finished"))).rejects.toThrow(/TOOL_OUTCOME_UNKNOWN/);
    expect(session.records.filter(record => record.kind === "delegation-completed")).toMatchObject([{ settledAs: "failed" }]);
  });
});
