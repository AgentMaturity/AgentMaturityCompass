import { describe, expect, test } from "vitest";
import { createPiTelemetryBridge } from "../src/importers/piTelemetryCallbacks.js";
import { createCurrentPiTelemetryBridge, parseCurrentPiTelemetry, parseDetectedCurrentPiTelemetry, PI_CURRENT_TELEMETRY_CONTRACT, currentPiTelemetryTraces } from "../src/importers/piTelemetryCurrent.js";

describe("explicit current Pi telemetry profile", () => {
  test("retains current AI/Durable fields and import trust, refuses old/current cross decoding", async () => {
    const bridge = createCurrentPiTelemetryBridge({ sourceContract: PI_CURRENT_TELEMETRY_CONTRACT });
    const expected = {};
    let calls = 0;
    const result = bridge.telemetryContext.startSpan({ name: "pi.ai.request", attributes: { provider: "test", api: "chat", model: "model", "usage.input": 3, "usage.output": 2, "cost.total": 0.4, prompt: "PRIVATE", "pi.tool.name": "PRIVATE-OLD" } }, span => {
      calls++; span.addEvent("pi.durable.entry", { "entry.id": 2, "entry.kind": "assistant" }); return expected;
    });
    expect(calls).toBe(1); expect(result).toBeInstanceOf(Promise); expect(await result).toBe(expected);
    const document = bridge.snapshot();
    expect(document.source).toEqual({ contract: PI_CURRENT_TELEMETRY_CONTRACT, trust: "SELF_REPORTED", signed: false, evaluation: "NOT_EVALUATED" });
    expect(document.spans[0]!.attributes).toMatchObject({ provider: "test", "usage.input": 3, "usage.output": 2 });
    expect(document.spans[0]!.timestamp).toBeNull(); expect(document.stats.filteredAttributes).toBe(2);
    expect(JSON.stringify(document)).not.toContain("PRIVATE");
    expect(parseDetectedCurrentPiTelemetry(JSON.stringify(document))!.format.sourceTrust).toBe("SELF_REPORTED");
    const parsed = parseCurrentPiTelemetry(document);
    expect(currentPiTelemetryTraces(parsed, "agent")[0]!.metadata).toMatchObject({ usage: { input_tokens: 3, output_tokens: 2, cost: 0.4 }, sourceFormat: { version: 2 } });
    expect(() => parseCurrentPiTelemetry(createPiTelemetryBridge().capture.snapshot())).toThrow();
    expect(() => createCurrentPiTelemetryBridge({ sourceContract: "future" })).toThrow(/unsupported/i);
  });

  test.each(["fulfilled", "rejected"] as const)("preserves native Promise %s with poisoned own then", async settlement => {
    const bridge = createCurrentPiTelemetryBridge({ sourceContract: PI_CURRENT_TELEMETRY_CONTRACT });
    const value = {}, rejection = {};
    const promise = settlement === "fulfilled" ? Promise.resolve(value) : Promise.reject(rejection);
    if (settlement === "rejected") Promise.prototype.then.call(promise, undefined, () => undefined);
    Object.defineProperty(promise, "then", settlement === "fulfilled"
      ? { get() { throw new Error("poisoned recording path"); } }
      : { value: () => Promise.resolve(value) });
    const result = bridge.telemetryContext.startSpan({ name: "native-promise" }, () => promise);
    if (settlement === "fulfilled") await expect(result).resolves.toBe(value);
    else await expect(result).rejects.toBe(rejection);
    bridge.close();
  });

  test("pending spans ignore recording getters and counters after bridge closure", async () => {
    const bridge = createCurrentPiTelemetryBridge({ sourceContract: PI_CURRENT_TELEMETRY_CONTRACT });
    let captured!: Parameters<Parameters<typeof bridge.telemetryContext.startSpan>[1]>[0];
    let release!: (value: object) => void;
    const expected = {}, pending = new Promise<object>(resolve => { release = resolve; });
    const work = bridge.telemetryContext.startSpan({ name: "pending" }, span => { captured = span; return pending; });
    bridge.close(); const before = bridge.snapshot(); let reads = 0;
    captured.setAttributes({ get provider() { reads++; return "test"; } });
    captured.addEvent("ignored", { get model() { reads++; return "model"; } });
    captured.addLink({ get context(): never { reads++; throw new Error("closed link"); } });
    captured.setStatus({ get status(): "ok" { reads++; return "ok"; } });
    release(expected); await expect(work).resolves.toBe(expected);
    expect(reads).toBe(0);
    expect(bridge.snapshot()).toMatchObject({ spans: before.spans, stats: before.stats });
  });

  test("links preserve source identity and are bounded; arbitrary contexts cannot smuggle content", async () => {
    const bridge = createCurrentPiTelemetryBridge({ sourceContract: PI_CURRENT_TELEMETRY_CONTRACT, maxLinksPerSpan: 2 });
    let target: Parameters<Parameters<typeof bridge.telemetryContext.startSpan>[1]>[0] | undefined;
    await bridge.telemetryContext.startSpan({ name: "target" }, span => { target = span; });
    const attributes = { reason: ["initial"] };
    await bridge.telemetryContext.startSpan({ name: "linked", links: [{ context: target!, attributes }] }, span => {
      attributes.reason.push("changed");
      span.addLink({ context: target!, attributes: { reason: "late", prompt: "PRIVATE" } });
      span.addLink({ context: target! });
      span.addLink({ context: { startSpan() { throw new Error("PRIVATE"); } } });
    });
    const document = bridge.snapshot(), [targetRecord, linked] = document.spans;
    expect(linked!.parentId).toBeNull();
    expect(linked!.links).toEqual([
      { captureId: document.captureId, spanId: targetRecord!.id, attributes: { reason: ["initial"] } },
      { captureId: document.captureId, spanId: targetRecord!.id, attributes: { reason: "late" } }
    ]);
    expect(document.stats.droppedLinks).toBe(2); expect(JSON.stringify(document)).not.toContain("PRIVATE");
  });

  test("sync throw, async rejection, recording failures, overflow and closure preserve work", async () => {
    const bridge = createCurrentPiTelemetryBridge({ sourceContract: PI_CURRENT_TELEMETRY_CONTRACT, maxSpans: 2 });
    const rejected = {};
    let result: Promise<unknown> | undefined;
    expect(() => { result = bridge.telemetryContext.startSpan({ name: "throw" }, () => { throw rejected; }); }).not.toThrow();
    await expect(result).rejects.toBe(rejected);
    const expected = {};
    await expect(bridge.telemetryContext.startSpan({ name: "overflow" }, span => { span.addLink({ get context(): never { throw new Error("recording"); } }); return expected; })).resolves.toBe(expected);
    await expect(bridge.telemetryContext.startSpan({ name: "dropped" }, () => expected)).resolves.toBe(expected);
    bridge.close();
    await expect(bridge.telemetryContext.startSpan({ get name(): never { throw new Error("recording"); } }, () => Promise.reject(undefined))).rejects.toBeUndefined();
    expect(bridge.snapshot().spans).toHaveLength(2);
    const frozen = bridge.snapshot();
    await bridge.telemetryContext.startSpan({ get name(): never { throw new Error("closed options"); }, get links(): never { throw new Error("closed links"); } }, span => {
      span.setAttributes({ prompt: "PRIVATE" }); span.addEvent("private", { prompt: "PRIVATE" });
    });
    expect(bridge.snapshot()).toMatchObject({ spans: frozen.spans, stats: frozen.stats });
  });
});

describe("current Pi watch and flush losses", () => {
  test("tracks snapshot, ordered deltas, retirement and replacement without retaining content", async () => {
    const bridge = createCurrentPiTelemetryBridge({ sourceContract: PI_CURRENT_TELEMETRY_CONTRACT });
    let listener: ((change: { value: unknown; ops: readonly unknown[]; retired: boolean }, context: unknown) => Promise<void>) | undefined;
    let finish!: (end: { reason: string }) => void;
    const closed = new Promise<{ reason: string }>(resolve => { finish = resolve; });
    let stops = 0;
    const binding = bridge.bindWatch({ value: { prompt: "PRIVATE" }, start(next) { listener = next; }, async stop() { stops++; return { reason: "stopped" }; }, closed });
    expect(binding.state.initialSnapshot).toBe(true);
    await listener!({ value: { prompt: "PRIVATE-2" }, ops: [["s", "prompt", "PRIVATE-2"]], retired: false }, {});
    await listener!({ value: {}, ops: [], retired: true }, {});
    expect(binding.retired).toBe(true); expect(binding.state.resyncRequired).toBe(true);
    await listener!({ value: {}, ops: [["r", {}]], retired: false }, {});
    expect(binding.state.resyncRequired).toBe(false); expect(binding.updates).toBe(3);
    await binding.stop(); await binding.stop(); expect(stops).toBe(1);
    finish({ reason: "stopped" }); await closed;
    await listener!({ value: {}, ops: [], retired: false }, {}); expect(binding.updates).toBe(3);
    expect(JSON.stringify(bridge.snapshot())).not.toContain("PRIVATE");
  });

  test("missing snapshots, invalid deltas, stop failures and failed closure retain losses", async () => {
    const bridge = createCurrentPiTelemetryBridge({ sourceContract: PI_CURRENT_TELEMETRY_CONTRACT });
    let listener: ((change: { value: unknown; ops: readonly unknown[]; retired: boolean }, context: unknown) => Promise<void>) | undefined;
    const binding = bridge.bindWatch({ value: undefined, start(next) { listener = next; }, async stop() { throw new Error("PRIVATE"); }, closed: Promise.resolve({ reason: "failed" }) });
    await listener!({ value: undefined, ops: [], retired: false }, {});
    expect(await binding.stop()).toEqual({ ok: false });
    expect(binding.state.resyncRequired).toBe(true); expect(bridge.snapshot().stats.watchLosses).toBeGreaterThanOrEqual(3);
  });

  test("flush uncertainty retains links and stable IDs; successful retry drains exactly settled spans", async () => {
    const bridge = createCurrentPiTelemetryBridge({ sourceContract: PI_CURRENT_TELEMETRY_CONTRACT });
    await bridge.telemetryContext.startSpan({ name: "done" }, () => undefined);
    const id = bridge.snapshot().spans[0]!.id;
    expect(await bridge.flush(() => { throw new Error("sink"); })).toMatchObject({ ok: false, remaining: 1 });
    expect(bridge.snapshot().spans[0]!.id).toBe(id);
    expect(await bridge.flush(document => { expect(document.version).toBe(2); expect(document.spans[0]!.id).toBe(id); })).toMatchObject({ ok: true, remaining: 0 });
  });
});


describe("current profile import admission", () => {
  test("filters forged content and invalid operational types on spans, events and links", async () => {
    const bridge = createCurrentPiTelemetryBridge({ sourceContract: PI_CURRENT_TELEMETRY_CONTRACT });
    let target: Parameters<Parameters<typeof bridge.telemetryContext.startSpan>[1]>[0] | undefined;
    await bridge.telemetryContext.startSpan({ name: "target" }, span => { target = span; });
    await bridge.telemetryContext.startSpan({ name: "input", links: [{ context: target! }] }, span => { span.addEvent("event"); });
    const input = bridge.snapshot();
    input.spans[1]!.status = { status: "error", error: { name: "Error", message: "PRIVATE" } };
    input.losses.push("PRIVATE");
    input.spans[1]!.attributes.prompt = "PRIVATE";
    input.spans[1]!.attributes.provider = "Content with whitespace PRIVATE";
    input.spans[1]!.attributes["usage.input"] = "100";
    input.spans[1]!.events[0]!.attributes.authorization = "Bearer PRIVATE";
    input.spans[1]!.links[0]!.attributes["tool.arguments"] = "PRIVATE";
    const parsed = parseCurrentPiTelemetry(input);
    expect(parsed.document.stats.filteredAttributes).toBe(5);
    expect(JSON.stringify(parsed.document)).not.toContain("PRIVATE");
    expect(parsed.document.spans[1]!.attributes["usage.input"]).toBeUndefined();
  });
  test("refuses future profiles, forged trust, ambiguous identities, invalid links and cyclic ancestry", async () => {
    const bridge = createCurrentPiTelemetryBridge({ sourceContract: PI_CURRENT_TELEMETRY_CONTRACT });
    let target: Parameters<Parameters<typeof bridge.telemetryContext.startSpan>[1]>[0] | undefined;
    await bridge.telemetryContext.startSpan({ name: "one" }, span => { target = span; });
    await bridge.telemetryContext.startSpan({ name: "two", links: [{ context: target! }] }, () => undefined);
    const original = bridge.snapshot();
    for (const mutate of [
      (value: typeof original) => { value.version = 99 as 2; },
      (value: typeof original) => { value.source.trust = "OBSERVED" as "SELF_REPORTED"; },
      (value: typeof original) => { value.source.contract = "pi-telemetry@future" as typeof PI_CURRENT_TELEMETRY_CONTRACT; },
      (value: typeof original) => { value.spans[0]!.sourceIdentity.spanId = value.spans[1]!.id; },
      (value: typeof original) => { value.spans[1]!.links[0]!.spanId = `${value.captureId}:forged`; },
      (value: typeof original) => { value.spans[0]!.parentId = value.spans[1]!.id; value.spans[1]!.parentId = value.spans[0]!.id; }
    ]) {
      const copy = structuredClone(original); mutate(copy); expect(() => parseCurrentPiTelemetry(copy)).toThrow();
    }
  });
});

describe("safe detected current-profile refusal reasons", () => {
  test("exposes supported version and exact profile without echoing hostile source fields", () => {
    const fixture = createCurrentPiTelemetryBridge({ sourceContract: PI_CURRENT_TELEMETRY_CONTRACT }).snapshot();
    expect(parseDetectedCurrentPiTelemetry(JSON.stringify(createPiTelemetryBridge().capture.snapshot()))).toBeNull();
    for (const [version, contract, expected] of [
      [99, PI_CURRENT_TELEMETRY_CONTRACT, "version 99"],
      ["PRIVATE-VERSION", PI_CURRENT_TELEMETRY_CONTRACT, "missing or invalid version"],
      [2, "PRIVATE-CONTRACT", "Unsupported or missing current Pi telemetry source profile"]
    ] as const) {
      try {
        parseDetectedCurrentPiTelemetry(JSON.stringify({ ...fixture, version, source: { ...fixture.source, contract } }));
        throw new Error("expected refusal");
      } catch (error) {
        expect(error).toMatchObject({ name: "SourceFormatError", format: "pi-callback-telemetry" });
        expect((error as Error).message).toContain(expected);
        expect((error as Error).message).toContain("v2");
        expect((error as Error).message).toContain(PI_CURRENT_TELEMETRY_CONTRACT);
        expect((error as Error).message).not.toContain("PRIVATE");
      }
    }
  });
});

describe("current Pi watch closure recording boundary", () => {
  test.each(["cancelled", "failed", "rejected"] as const)("late %s watch termination preserves cleanup state without recording after close", async reason => {
    const bridge = createCurrentPiTelemetryBridge({ sourceContract: PI_CURRENT_TELEMETRY_CONTRACT });
    let finish!: (value: { reason: string }) => void, reject!: (error: unknown) => void;
    const closed = new Promise<{ reason: string }>((resolve, fail) => { finish = resolve; reject = fail; });
    const binding = bridge.bindWatch({ value: {}, start() {}, async stop() { return { reason: "stopped" }; }, closed });
    bridge.close(); const before = bridge.snapshot();
    if (reason === "rejected") reject(new Error("source failure")); else finish({ reason });
    await closed.catch(() => undefined);
    expect(binding.state.terminal).toBe(reason === "rejected" ? "failed" : reason);
    expect(bridge.snapshot()).toMatchObject({ spans: before.spans, stats: before.stats });
  });

  test("stop cleanup remains retryable after capture close without changing recording counters", async () => {
    const bridge = createCurrentPiTelemetryBridge({ sourceContract: PI_CURRENT_TELEMETRY_CONTRACT });
    let calls = 0;
    const binding = bridge.bindWatch({ value: {}, start() {}, async stop() {
      calls++; if (calls === 1) throw new Error("source cleanup failure"); return { reason: "stopped" };
    }, closed: new Promise(() => undefined) });
    bridge.close(); const before = bridge.snapshot();
    expect(await binding.stop()).toEqual({ ok: false });
    expect(await binding.stop()).toEqual({ ok: true });
    expect(binding.state.terminal).toBe("stopped");
    expect(await binding.stop()).toEqual({ ok: true }); expect(calls).toBe(2);
    expect(bridge.snapshot()).toMatchObject({ spans: before.spans, stats: before.stats });
  });

  test("binding after capture close never reads or acquires the supplied handle", async () => {
    const bridge = createCurrentPiTelemetryBridge({ sourceContract: PI_CURRENT_TELEMETRY_CONTRACT });
    bridge.close(); const before = bridge.snapshot(); let reads = 0;
    const binding = bridge.bindWatch({
      get value(): never { reads++; throw new Error("closed acquisition value"); },
      get start(): never { reads++; throw new Error("closed acquisition start"); },
      get stop(): never { reads++; throw new Error("closed acquisition stop"); },
      get closed(): never { reads++; throw new Error("closed acquisition terminal"); }
    });
    expect(binding.state).toEqual({ attached: false, initialSnapshot: false, resyncRequired: false, terminal: null });
    expect(binding.retired).toBe(false); expect(binding.updates).toBe(0);
    expect(await binding.stop()).toEqual({ ok: true }); expect(await binding.stop()).toEqual({ ok: true });
    expect(reads).toBe(0);
    expect(bridge.snapshot()).toMatchObject({ spans: before.spans, stats: before.stats });
  });
});
