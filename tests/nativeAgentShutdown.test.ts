import { rmSync } from "node:fs";
import type { EvidenceEventType } from "../src/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openLedger } from "../src/ledger/ledger.js";
import { shutdownToolResults } from "../src/agent/agentShutdown.js";
import { SessionService } from "../src/session/sessionService.js";
import * as composition from "../src/agent/nativeAgentComposition.js";
import { AgentDriver } from "../src/agent/agentDriver.js";
import { LoopInbox } from "../src/agent/inbox.js";
import { openAgentSession } from "../src/agent/agentSession.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import { bodyFromChunks } from "../src/llm/adapter/transport.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, loopHarness, ok, scriptedAdapter, silentTransport,
  StubToolSeam, textStep, toolStepMulti, type LoopHarness } from "./helpers/agentLoopHarness.js";
import type { ToolCallOutcome } from "../src/agent/toolSeam.js";

const open: LoopHarness[] = [];
function harness(options: Parameters<typeof loopHarness>[0]): LoopHarness {
  const value = loopHarness(options); open.push(value); return value;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const value of open.splice(0)) {
    try { value.finish(); } catch { value.session.disposeWithoutClosing(); }
    rmSync(value.dir, { recursive: true, force: true });
  }
});

function nativeSession(h: LoopHarness, transport = silentTransport) {
  const registry = new AdapterRegistry();
  registry.register({ providerId: LOOP_PROVIDER, adapter: scriptedAdapter([textStep("hello")]),
    baseUrl: "https://api.anthropic.invalid", credentialRef: credentialRef("AMC_LOOP_TEST_KEY"), models: [LOOP_MODEL] });
  return openAgentSession({ workspace: h.dir, agentId: "default", tools: "none", systemPrompt: "test",
    makeLlm: spine => new LlmRuntime({ session: spine, registry, credentials: new FixedCredentials(), transport }),
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
    harnessVersion: "test", compositionDigest: "c".repeat(64), policyDigest: "p".repeat(64) });
}

// A shutdown snapshot describes observed outcomes, never rollback or verifier success.
describe("WP20b native shutdown results", () => {
  it("stops admission synchronously, is idempotent, and adds no idle cancellation", async () => {
    const h = harness({ scripts: [textStep("unused")] });
    const before = h.events().length;
    const stopping = h.driver.shutdown();
    expect(() => h.driver.followup("late")).toThrow(/shut/i);
    expect(() => h.driver.steer("late")).toThrow(/shut/i);
    expect(() => h.driver.inject("late")).toThrow(/shut/i);
    expect(() => h.driver.withdraw("late")).toThrow(/shut/i);
    expect(() => h.driver.followupParts([{ type: "text", text: "late" }])).toThrow(/shut/i);
    expect(() => h.driver.followupAudioParts([{ type: "text", text: "late" }])).toThrow(/shut/i);
    expect(h.driver.shutdown()).toBe(stopping);
    expect(await stopping).toMatchObject({ sessionId: h.sessionId, state: "settled", turn: null,
      settled: [], cancelled: [], unknown: [], cancelledMessageIds: [], pendingMessageIds: [], errors: [] });
    expect(h.events()).toHaveLength(before);
  });

  it("names only durably cancelled pending messages in both lanes", async () => {
    const h = harness({ scripts: [textStep("unused")] });
    const next = h.driver.send("later", "next-turn", false);
    const steer = h.driver.inject("context");
    const result = await h.driver.shutdown();
    expect(result.cancelledMessageIds).toEqual([steer.messageId, next.messageId]);
    expect(result.pendingMessageIds).toEqual([]);
    expect(new LoopInbox(h.session, () => {}).hasPending).toBe(false);
    expect(result.state).toBe("settled");
  });

  it("separates settled, never-started and unknown calls and freezes late outcomes", async () => {
    let started!: () => void, complete!: (value: ToolCallOutcome) => void;
    const dispatched = new Promise<void>(resolve => { started = resolve; });
    const tools = new StubToolSeam({ done: async () => ok("done"), hang: () => {
      started(); return new Promise(resolve => { complete = resolve; });
    }, unstarted: async () => ok("must not run") });
    const h = harness({ scripts: [toolStepMulti([{ id: "done-id", name: "done", args: "{}" },
      { id: "hang-id", name: "hang", args: "{}" }, { id: "unstarted-id", name: "unstarted", args: "{}" }])],
      tools, config: { maxParallelToolCalls: 1, toolAbandonGraceMs: 5 } });
    h.driver.followup("work"); await dispatched;
    const pending = h.driver.followup("later");
    const result = await h.driver.shutdown({ timeoutMs: 500 });
    expect(result.state).toBe("settled");
    expect(result.settled).toEqual([expect.objectContaining({ toolCallId: "done-id", toolName: "done", outcome: "OK", recorded: true })]);
    expect(result.cancelled).toEqual([expect.objectContaining({ toolCallId: "unstarted-id", outcome: "CANCELLED", recorded: true })]);
    expect(result.unknown).toEqual([expect.objectContaining({ toolCallId: "hang-id", outcome: "TOOL_OUTCOME_UNKNOWN", recorded: true })]);
    expect(result.cancelledMessageIds).toEqual([pending.messageId]);
    expect(tools.calls.map(call => call.toolName)).toEqual(["done", "hang"]);
    const before = h.events().length, snapshot = JSON.stringify(result);
    complete(ok("late success")); await new Promise(resolve => setImmediate(resolve));
    expect(h.events()).toHaveLength(before);
    expect(JSON.stringify(result)).toBe(snapshot);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.unknown)).toBe(true);
    expect(Object.isFrozen(result.unknown[0])).toBe(true);
  });

  it("reports cooperative execution's real outcome instead of claiming rollback", async () => {
    let started!: () => void;
    const dispatched = new Promise<void>(resolve => { started = resolve; });
    const h = harness({ scripts: [toolStepMulti([{ id: "cooperative", name: "cooperative", args: "{}" }])],
      tools: new StubToolSeam({ cooperative: request => new Promise(resolve => {
        request.signal.addEventListener("abort", () => resolve(ok("stopped", { outcome: "ERROR", additionalContext: ["late context"] })), { once: true }); started();
      }) }) });
    h.driver.followup("work"); await dispatched;
    const result = await h.driver.shutdown();
    expect(result.settled).toEqual([expect.objectContaining({ toolCallId: "cooperative", outcome: "ERROR" })]);
    expect(result.cancelled).toEqual([]);
    expect(result.unknown).toEqual([]);
    expect(result.state).toBe("incomplete");
    expect(result.pendingMessageIds).toHaveLength(1);
    expect(result.errors).toEqual([]);
    expect(h.events().filter(row => row.event_type === "turn/end").map(row => JSON.parse(row.meta_json).reason)).toEqual(["cancelled"]);
  });

  it("bounds a noncooperative provider and never promotes its late completion", async () => {
    let started!: () => void, resume!: () => void;
    const dispatched = new Promise<void>(resolve => { started = resolve; });
    const paused = new Promise<void>(resolve => { resume = resolve; });
    const h = harness({ scripts: [textStep("late")], transport: async () => {
      started(); await paused; return { status: 200, headers: {}, body: bodyFromChunks([]) };
    } });
    h.driver.followup("work"); await dispatched;
    const result = await h.driver.shutdown({ timeoutMs: 5 });
    expect(result.state).toBe("incomplete");
    expect(result.timedOut).toBe(true);
    expect(result.errors).not.toEqual([]);
    expect(result.unknown).toEqual([]); // No recorded tool call is not a known tool outcome.
    const snapshot = JSON.stringify(result);
    resume(); await h.driver.whenIdle();
    expect(JSON.stringify(result)).toBe(snapshot);
    expect(() => h.driver.followup("late")).toThrow(/shut/i);
  });

  it("aborts even if durable queue clearing fails and preserves pending IDs", async () => {
    let started!: () => void;
    const dispatched = new Promise<void>(resolve => { started = resolve; });
    const h = harness({ scripts: [toolStepMulti([{ id: "running", name: "run", args: "{}" }])],
      tools: new StubToolSeam({ run: request => new Promise(resolve => {
        request.signal.addEventListener("abort", () => resolve(ok("stopped")), { once: true }); started();
      }) }) });
    h.driver.followup("work"); await dispatched;
    const pending = h.driver.followup("queued");
    vi.spyOn(h.driver.inbox, "clear").mockImplementation(() => { throw new Error("queue write failed"); });
    const result = await h.driver.shutdown({ timeoutMs: 500 });
    expect(result.state).toBe("incomplete");
    expect(result.timedOut).toBe(false);
    expect(result.cancelledMessageIds).toEqual([]);
    expect(result.pendingMessageIds).toEqual([pending.messageId]);
    expect(result.errors).toContain("queue write failed");
    expect(h.driver.status).toBe("idle");
  });

  it("reports a failed evidence closer as incomplete", async () => {
    const h = harness({ scripts: [textStep("answer")] });
    const seal = vi.spyOn(h.session, "sealTurn").mockImplementation(() => { throw new Error("seal failed"); });
    h.driver.followup("work"); await h.driver.whenIdle();
    const result = await h.driver.shutdown();
    expect(result.state).toBe("incomplete");
    expect(result.driverStatus).toBe("failed");
    expect(result.errors.join(" ")).toContain("seal failed");
    seal.mockRestore();
    h.session.sealTurn();
  });

  it.each([-1, NaN, Infinity, 1.5, 60_001])("rejects timeout %s before stopping admission", timeoutMs => {
    const h = harness({ scripts: [textStep("unused")] });
    expect(() => h.driver.shutdown({ timeoutMs })).toThrow(/timeout/i);
    expect(() => h.driver.inject("still usable")).not.toThrow();
  });

  it("does not wake after an insertion observer requests shutdown re-entrantly", async () => {
    let stop: (() => void) | undefined;
    const h = harness({ scripts: [textStep("must not run")], hooks: { notify: notification => {
      if (notification.kind === "inbox" && notification.op === "insert") stop?.();
    } } });
    stop = () => { void h.driver.shutdown(); };
    h.driver.followup("stop during admission");
    const result = await h.driver.shutdown();
    expect(result.state).toBe("settled");
    expect(result.cancelledMessageIds).toHaveLength(1);
    expect(h.events().filter(row => row.event_type === "turn/start")).toEqual([]);
  });

  it("includes validation tools with unknown side effects outside model tool rows", async () => {
    let started!: () => void;
    const dispatched = new Promise<void>(resolve => { started = resolve; });
    const h = harness({ scripts: [textStep("done")] });
    const driver = new AgentDriver({ session: h.session, llm: h.llm, systemPromptEventId: h.systemPromptEventId,
      route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
      config: { toolAbandonGraceMs: 5 }, validation: { configSha256: "a".repeat(64),
        checks: [{ id: "check", title: "check", command: "echo check", timeoutMs: 1000 }] },
      tools: new StubToolSeam({ bash: () => { started(); return new Promise(() => {}); } }) });
    driver.followup("work"); await dispatched;
    const result = await driver.shutdown({ timeoutMs: 500 });
    expect(result.state).toBe("settled");
    expect(result.unknown).toEqual([expect.objectContaining({ source: "validation", toolName: "bash", outcome: "TOOL_OUTCOME_UNKNOWN", recorded: true })]);
    expect(h.events().filter(row => row.event_type === "tool/call")).toEqual([]);
  });

  it("keeps reused model call IDs distinct across steps", async () => {
    let started!: () => void;
    const dispatched = new Promise<void>(resolve => { started = resolve; });
    const h = harness({ scripts: [toolStepMulti([{ id: "same", name: "done", args: "{}" }]),
      toolStepMulti([{ id: "same", name: "hang", args: "{}" }])], config: { toolAbandonGraceMs: 5 },
      tools: new StubToolSeam({ done: async () => ok("done"), hang: () => { started(); return new Promise(() => {}); } }) });
    h.driver.followup("work"); await dispatched;
    const result = await h.driver.shutdown({ timeoutMs: 500 });
    expect(result.settled).toEqual([expect.objectContaining({ toolCallId: "same", step: 1, outcome: "OK" })]);
    expect(result.unknown).toEqual([expect.objectContaining({ toolCallId: "same", step: 2, outcome: "TOOL_OUTCOME_UNKNOWN" })]);
  });

  it("reports an unanswered committed call as unknown when shutdown times out", async () => {
    let started!: () => void, complete!: (value: ToolCallOutcome) => void;
    const dispatched = new Promise<void>(resolve => { started = resolve; });
    const h = harness({ scripts: [toolStepMulti([{ id: "missing", name: "hang", args: "{}" }])],
      config: { toolAbandonGraceMs: 100 }, tools: new StubToolSeam({ hang: () => {
        started(); return new Promise(resolve => { complete = resolve; });
      } }) });
    h.driver.followup("work"); await dispatched;
    const result = await h.driver.shutdown({ timeoutMs: 0 });
    expect(result.state).toBe("incomplete");
    expect(result.unknown).toEqual([expect.objectContaining({ toolCallId: "missing", outcome: "TOOL_OUTCOME_UNKNOWN", recorded: false })]);
    complete(ok("late")); await h.driver.whenIdle();
    expect(result.unknown[0]?.outcome).toBe("TOOL_OUTCOME_UNKNOWN");
  });

  it("fails closed on unreadable, duplicate or orphan tool outcome identities", () => {
    const h = harness({ scripts: [textStep("unused")] });
    const base = h.events()[0]!;
    const row = (event_type: EvidenceEventType, meta: unknown) => ({ ...base, event_type, meta_json: JSON.stringify(meta) });
    const call = row("tool/call", { turn: 1, step: 1, toolCallId: "call", toolName: "tool" });
    const result = row("tool/result", { turn: 1, step: 1, toolCallId: "call", outcome: "OK" });
    for (const rows of [[result], [call, call], [call, result, result],
      [row("tool/call", { turn: 1, step: 0, toolCallId: "call", toolName: "tool" })],
      [row("tool/call", { turn: 1, step: 1, toolCallId: "", toolName: "tool" })],
      [row("tool/call", { turn: 1, step: 1, toolCallId: "call", toolName: "" })],
      [call, row("tool/result", { turn: 1, step: 1, toolCallId: "call", outcome: "success" })]]) {
      expect(() => shutdownToolResults(rows, 1)).toThrow(/shutdown/i);
    }
  });

  it("reports cancellation persistence failure while still stopping the turn", async () => {
    const h = harness({ scripts: [textStep("unused")] });
    h.driver.inject("pending");
    const record = h.session.recordLoopEvent.bind(h.session);
    vi.spyOn(h.session, "recordLoopEvent").mockImplementation(input => {
      if (input.kind === "cancel") throw new Error("cancel write failed");
      return record(input);
    });
    const result = await h.driver.shutdown();
    expect(result.state).toBe("incomplete");
    expect(result.errors).toContain("cancel write failed");
    expect(result.cancelledMessageIds).toHaveLength(1);
  });

  it("validates session shutdown options before stopping its admission", async () => {
    const h = harness({ scripts: [textStep("unused")] });
    const session = nativeSession(h);
    expect(() => session.shutdown({ timeoutMs: -1 })).toThrow(/timeout/i);
    expect((await session.prompt("hello")).ok).toBe(true);
    expect((await session.shutdown()).sessionClosed).toBe(true);
    expect(() => session.close()).not.toThrow();
  });

  it("permits explicit cleanup after timed-out session work eventually settles", async () => {
    let started!: () => void, resume!: () => void;
    const dispatched = new Promise<void>(resolve => { started = resolve; });
    const paused = new Promise<void>(resolve => { resume = resolve; });
    const h = harness({ scripts: [textStep("unused")] });
    const session = nativeSession(h, async () => { started(); await paused; return { status: 200, headers: {}, body: bodyFromChunks([]) }; });
    const prompt = session.prompt("work"); await dispatched;
    const stopping = session.shutdown({ timeoutMs: 0 });
    expect(() => session.close()).toThrow(/Wait/);
    expect(await stopping).toMatchObject({ state: "incomplete", sessionClosed: false, timedOut: true });
    resume(); await prompt;
    expect(() => session.close()).not.toThrow();
  });

  it("does not report session sealing when the session closer fails", async () => {
    const h = harness({ scripts: [textStep("unused")] });
    const session = nativeSession(h);
    const close = vi.spyOn(SessionService.prototype, "close").mockImplementation(() => { throw new Error("session seal failed"); });
    expect(await session.shutdown()).toMatchObject({ state: "incomplete", sessionClosed: false, errors: ["session seal failed"] });
    close.mockRestore();
  });

  it("retains a successful seal when later prompt cleanup fails", async () => {
    const h = harness({ scripts: [textStep("unused")] });
    const compose = composition.composeNativeAgent;
    vi.spyOn(composition, "composeNativeAgent").mockImplementation(init => {
      const native = compose(init);
      return { ...native, dispose: () => { native.dispose(); throw new Error("prompt cleanup failed"); } };
    });
    const session = nativeSession(h);
    expect(await session.shutdown()).toMatchObject({ state: "incomplete", sessionClosed: true, errors: ["prompt cleanup failed"] });
  });

  it("exposes typed shutdown on a composed in-process SDK session and seals after settlement", async () => {
    const h = harness({ scripts: [textStep("unused")] });
    const session = nativeSession(h);
    expect((await session.prompt("hello")).ok).toBe(true);
    const stopping = session.shutdown();
    expect(session.shutdown()).toBe(stopping);
    const refused = session.prompt("late");
    const result = await stopping;
    expect(await refused).toMatchObject({ ok: false });
    expect(result).toMatchObject({ state: "settled", sessionClosed: true });
    const ledger = openLedger(h.dir);
    try { expect(ledger.getAllEvents().some(row => row.session_id === session.sessionId && row.event_type === "session/close")).toBe(true); }
    finally { ledger.close(); }
    expect(await session.prompt("late")).toMatchObject({ ok: false });
  });
});
