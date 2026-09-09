import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { openLedger } from "../src/ledger/ledger.js";
import { SessionService } from "../src/session/sessionService.js";
import * as payloadReader from "../src/session/eventPayload.js";
import * as runReport from "../src/agent/runReport.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { createDriverRunner } from "../src/agent/subagentRunner.js";
import { spawnSubagent, type SubagentHandle, type SubagentRequest } from "../src/agent/subagentSpawn.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import type { HttpResponse, HttpTransport } from "../src/llm/adapter/transport.js";
import type { AgentLoopConfig } from "../src/agent/loopTypes.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, maxTokensStep, scriptedAdapter,
  silentTransport, textStep, toolStep } from "./helpers/agentLoopHarness.js";

// AUTHORED, UNEXECUTED: actual native driver/session composition with scripted
// responses. Not provider, installed, retention/erasure or signature qualification.
const dirs: string[] = [];
const parents = new Set<SessionService>();
const handles = new Set<SubagentHandle>();
const CHILD = "native-stopped-output-child";
afterEach(() => {
  for (const handle of handles) handle.close("cancelled", "fixture cleanup");
  handles.clear();
  for (const session of parents) session.close({ reason: "completed" });
  parents.clear();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function rows(workspace: string, sessionId = CHILD) {
  const ledger = openLedger(workspace, { readonly: true });
  try { return ledger.getAllEvents().filter(row => row.session_id === sessionId); }
  finally { ledger.close(); }
}
function fixture(scripts: ReturnType<typeof textStep>[], transport: HttpTransport = silentTransport,
  config?: Partial<AgentLoopConfig>) {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "native-stopped-output-fixture-only");
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-native-stopped-output-")));
  dirs.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default");
  writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  writeFileSync(join(workspace, "input.txt"), "local fixture text");
  const parent = new SessionService(workspace);
  parent.open({ agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
  parents.add(parent);
  const registry = new AdapterRegistry(), adapter = scriptedAdapter(scripts);
  registry.register({ providerId: LOOP_PROVIDER, baseUrl: "https://fixture.invalid", credentialRef: null,
    models: [LOOP_MODEL], adapter: { ...adapter, envelope: input => ({ ...adapter.envelope(input), signal: input.signal }) } });
  const runner = createDriverRunner({ workspace,
    makeLlm: session => new LlmRuntime({ session, registry, credentials: new FixedCredentials(), transport }),
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
    systemPrompt: "Respect native delegation limits.", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture",
    ...(config === undefined ? {} : { config }) });
  return { workspace, parent,
    spawn: async (request: Partial<SubagentRequest> = {}, signal?: AbortSignal) => {
      const outcome = await spawnSubagent({ workspace, parent: rootIdentity("default"), session: parent, runner,
        request: { runAs: "child", goal: "Read the local input.", ...request }, mintSessionId: () => CHILD,
        cancelGraceMs: 20, ...(signal === undefined ? {} : { signal }) });
      if (outcome.ok && outcome.handle) handles.add(outcome.handle);
      return outcome;
    }
  };
}

/** Completed text precedes a real local tool, so it is durable before request #2. */
function textThenRead(text: string): ReturnType<typeof textStep> {
  return [...textStep(text).slice(0, 3),
    ...toolStep("read-input", "fs.read", '{"path":"input.txt"}').map(chunk =>
      "index" in chunk ? { ...chunk, index: chunk.index + 1 } : chunk)];
}
function twoTextBlocks(first: string, second: string): ReturnType<typeof textStep> {
  return [...textStep(first).slice(0, 3),
    ...textStep(second).slice(0, 3).map(chunk => "index" in chunk ? { ...chunk, index: chunk.index + 1 } : chunk),
    ...textStep(second).slice(3)];
}
function heldRequest(requestNumber: number) {
  const entered = deferred<void>(), pending = deferred<HttpResponse>();
  let calls = 0, waiting = false, signal: AbortSignal | undefined;
  const transport: HttpTransport = async envelope => {
    if (++calls !== requestNumber) return silentTransport(envelope);
    waiting = true; signal = envelope.signal;
    const abort = () => pending.reject(new DOMException("fixture cancellation", "AbortError"));
    if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
    entered.resolve();
    try { return await pending.promise; }
    finally { waiting = false; signal?.removeEventListener("abort", abort); }
  };
  return { transport, entered: entered.promise, signal: () => signal,
    release: () => { if (waiting) pending.reject(new DOMException("fixture cleanup", "AbortError")); } };
}
function expectChildClosed(workspace: string, reason: string) {
  const events = rows(workspace);
  expect(JSON.parse(events.find(event => event.event_type === "session/open")!.meta_json).agentId).toBe("default");
  expect(JSON.parse(events.filter(event => event.event_type === "turn/end").at(-1)!.meta_json).reason).toBe(reason);
  expect(events.filter(event => event.event_type === "session/close")).toHaveLength(1);
  expect(events.at(-1)?.event_type).toBe("session/close");
}

describe("native stopped output stays separate from runtime settlement", () => {
  it("retains recorded text from an initial token-capped turn without a success or live handle", async () => {
    const f = fixture([maxTokensStep("Only this partial child answer.")]);
    const outcome = await f.spawn({ continuable: true, stopConditions: ["max-turns:3"] });
    expect(outcome).toMatchObject({ ok: false, childText: "Only this partial child answer.", reason: expect.stringContaining("max_tokens") });
    expect("handle" in outcome).toBe(false);
    expectChildClosed(f.workspace, "max_tokens");
    expect(rows(f.workspace).filter(row => row.event_type === "request/header")).toHaveLength(1);
    const completed = rows(f.workspace, f.parent.sessionId).filter(row => row.event_type === "agent_delegation_completed");
    expect(completed).toHaveLength(1);
    expect(JSON.parse(completed[0]!.meta_json).settledAs).toBe("failed");
  });

  it("returns only the failing continuation's new text and refuses subsequent work", async () => {
    const f = fixture([textStep("Earlier answer."), maxTokensStep("New partial answer.")]);
    const first = await f.spawn({ continuable: true, stopConditions: ["max-turns:3"] });
    if (!first.ok || !first.handle) throw new Error("expected native continuation");
    expect(first.childText).toBe("Earlier answer.");
    const second = await first.handle.continue("Continue.");
    expect(second).toMatchObject({ ok: false, text: "New partial answer.", reason: expect.stringContaining("max_tokens") });
    expect(second.text).not.toContain("Earlier answer.");
    const before = rows(f.workspace);
    expect(await first.handle.continue("Do not dispatch.")).toMatchObject({ ok: false, text: "" });
    expect(rows(f.workspace)).toEqual(before);
    expectChildClosed(f.workspace, "max_tokens");
  });

  it("retains completed text when the inherited per-turn step ceiling stops more requests", async () => {
    const f = fixture([textThenRead("Recorded before the step ceiling.")], silentTransport, { maxStepsPerTurn: 1 });
    expect(await f.spawn()).toMatchObject({ ok: false, childText: "Recorded before the step ceiling.", reason: expect.stringContaining("max_steps") });
    expectChildClosed(f.workspace, "max_steps");
    expect(rows(f.workspace).filter(row => row.event_type === "request/header")).toHaveLength(1);
  });

  it("preserves committed output when parent cancellation reaches the next native request", async () => {
    const held = heldRequest(2), parent = new AbortController();
    const f = fixture([textThenRead("Recorded before cancellation.")], held.transport);
    const running = f.spawn({ continuable: true }, parent.signal);
    try {
      await held.entered; parent.abort("operator stopped");
      expect(await running).toMatchObject({ ok: false, childText: "Recorded before cancellation.", reason: expect.stringContaining("parent cancelled") });
      expect(held.signal()?.aborted).toBe(true);
      expectChildClosed(f.workspace, "cancelled");
    } finally { parent.abort(); held.release(); await running; }
  });

  it("a lifetime timeout preserves only fresh continuation output and keeps its actual cause", async () => {
    const held = heldRequest(3), parent = new AbortController();
    const f = fixture([textStep("Earlier successful answer."), textThenRead("Fresh text before timeout.")], held.transport);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const first = await f.spawn({ continuable: true, stopConditions: ["timeout-ms:1000"] }, parent.signal);
    if (!first.ok || !first.handle) throw new Error("expected native continuation");
    await vi.advanceTimersByTimeAsync(800);
    const running = first.handle.continue("Read again.");
    try {
      await held.entered; await vi.advanceTimersByTimeAsync(200);
      const outcome = await running;
      expect(outcome).toMatchObject({ ok: false, text: "Fresh text before timeout.", reason: expect.stringContaining("timeout-ms:1000") });
      expect(outcome.text).not.toContain("Earlier successful answer.");
      expect(held.signal()?.aborted).toBe(true);
      expectChildClosed(f.workspace, "cancelled");
      const before = rows(f.workspace);
      expect(await first.handle.continue("Too late.")).toMatchObject({ ok: false, text: "" });
      expect(rows(f.workspace)).toEqual(before);
      expect(vi.getTimerCount()).toBe(0);
    } finally { parent.abort(); held.release(); await running; }
  });

  it("does not replay an earlier answer when a later cancelled turn records no text", async () => {
    const held = heldRequest(2), parent = new AbortController();
    const f = fixture([textStep("Earlier answer only.")], held.transport);
    const first = await f.spawn({ continuable: true }, parent.signal);
    if (!first.ok || !first.handle) throw new Error("expected native continuation");
    const running = first.handle.continue("Cancelled before output.");
    try {
      await held.entered; parent.abort();
      expect(await running).toMatchObject({ ok: false, text: "", reason: expect.stringContaining("parent cancelled") });
      expectChildClosed(f.workspace, "cancelled");
    } finally { parent.abort(); held.release(); await running; }
  });

  it.each(["missing", "pruned"] as const)("keeps %s payload diagnostics out of a child's available words", async status => {
    const f = fixture([twoTextBlocks("Available child text.", "Unavailable fixture text.")]);
    const original = payloadReader.readEventPayload;
    // Reader fault only: no evidence mutation or actual erasure/retention run.
    vi.spyOn(payloadReader, "readEventPayload").mockImplementation((workspace, event) => {
      const payload = original(workspace, event);
      if (event.session_id === CHILD && event.event_type === "assistant/block" && payload.status === "ok"
          && payload.bytes.toString("utf8") === "Unavailable fixture text.") {
        return status === "pruned" ? { status: "pruned" } : { status: "missing", detail: "fixture-only unavailable payload" };
      }
      return payload;
    });
    const outcome = await f.spawn();
    expect(outcome).toMatchObject({ ok: false, childText: "Available child text.", reason: expect.stringContaining(`(${status})`) });
    if (outcome.ok) throw new Error("unavailable output must not become success");
    expect(outcome.reason).toContain("output is incomplete");
    expect(outcome.childText).not.toContain("[amc:payload");
    expect(outcome.childText).not.toContain("fixture-only");
    expectChildClosed(f.workspace, "complete"); // Model completion is not output availability.
  });

  it("keeps the existing unsigned refusal ahead of partial-output exposure", async () => {
    const f = fixture([maxTokensStep("Must not be exposed as usable child output.")]);
    const original = runReport.readAgentRunSummary;
    // Explicit projection seam; this does not disable signing or qualify signatures.
    vi.spyOn(runReport, "readAgentRunSummary").mockImplementation((...args) => ({ ...original(...args), unsignedRows: 1 }));
    const outcome = await f.spawn();
    expect(outcome).toMatchObject({ ok: false, reason: expect.stringContaining("unsigned row") });
    expect("childText" in outcome).toBe(false);
    if (outcome.ok) throw new Error("unsigned output must not become success");
    expect(outcome.reason).toContain("max_tokens");
    expectChildClosed(f.workspace, "max_tokens");
  });
});
