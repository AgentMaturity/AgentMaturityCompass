import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { buildTurnEndMeta, canonicalTurnCancelCause, readTurnEndMeta } from "../src/session/turnLifecycleMeta.js";
import { buildLoopEventRow } from "../src/session/loopEventMeta.js";
import { loopHarness, textStep, toolStep, StubToolSeam, type LoopHarness } from "./helpers/agentLoopHarness.js";

describe("WP16 owned shutdown", () => {
  const open: LoopHarness[] = [];
  afterEach(() => {
    for (const harness of open.splice(0)) {
      try { harness.finish(); } catch { harness.abandon(); }
      rmSync(harness.dir, { recursive: true, force: true });
    }
  });
  const make = (options: Parameters<typeof loopHarness>[0]): LoopHarness => {
    const harness = loopHarness(options);
    open.push(harness);
    return harness;
  };

  it("closes idle admission synchronously without recording a spurious cancel", async () => {
    const harness = make({ scripts: [textStep("unused")] });
    const disposal = harness.driver.dispose();
    expect(harness.driver.disposed).toBe(true);
    expect(() => harness.driver.followup("late")).toThrow(/disposed/);
    expect(() => harness.driver.steer("late")).toThrow(/disposed/);
    expect(() => harness.driver.inject("late")).toThrow(/disposed/);
    expect(await disposal).toBe(true);
    expect(harness.driver.dispose()).toBe(disposal);
    expect(harness.events().filter(event => event.event_type === "loop/cancel")).toEqual([]);
  });

  it("reserves one disposal before a cancellation observer can reenter it", async () => {
    const nested: Promise<boolean>[] = [];
    const harness = make({ scripts: [textStep("unused")], hooks: { notify: notification => {
      if (notification.kind === "inbox" && notification.op === "cancel") nested.push(harness.driver.dispose());
    } } });
    harness.driver.inject("pending context");
    const disposal = harness.driver.dispose();
    expect(await disposal).toBe(true);
    expect(nested).toEqual([disposal]);
    expect(harness.events().filter(event => event.event_type === "loop/cancel")).toHaveLength(1);
  });

  it("cancels the active operation, preserves its first cause, and never admits a successor", async () => {
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const tools = new StubToolSeam({ slow: async request => new Promise(resolve => {
      request.signal.addEventListener("abort", () => resolve({ outcome: "CANCELLED", content: "stopped", exitCode: null, timedOut: false, denied: false }));
      entered();
    }) });
    const harness = make({ scripts: [toolStep("slow-1", "slow", "{}")], tools });
    harness.driver.followup("start");
    await started;
    const firstCause = { kind: "hook" as const, reason: "first" };
    harness.driver.cancel(firstCause);
    firstCause.reason = "caller changed the object after cancellation";
    expect(await harness.driver.dispose()).toBe(true);
    expect(() => harness.driver.followup("late")).toThrow(/disposed/);
    const endings = harness.events().filter(event => event.event_type === "turn/end");
    expect(endings).toHaveLength(1);
    expect(readTurnEndMeta(endings[0]!.meta_json)?.cancelCause).toEqual({ kind: "hook", reason: "first" });
    expect(harness.events().filter(event => event.event_type === "turn/start")).toHaveLength(1);
  });

  it("reports unknown cleanup when an uncooperative hook outlives the finite grace", async () => {
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const harness = make({ scripts: [textStep("unused")], hooks: { preStep: async (_input, next) => {
      entered();
      await blocked;
      return next();
    } } });
    harness.driver.followup("start");
    await started;
    try {
      expect(await harness.driver.dispose(1)).toBe(false);
      expect(() => harness.driver.followup("overlap")).toThrow(/disposed/);
    } finally {
      release();
      await harness.driver.whenIdle();
    }
  });
});

describe("WP16 cancellation metadata bounds", () => {
  it("bounds hook reasons and requesters at every writer without splitting UTF-8", () => {
    const unbounded = "🙂".repeat(262_144);
    const cause = { kind: "hook" as const, reason: unbounded };
    const expected = "🙂".repeat(128);
    expect(canonicalTurnCancelCause(cause)).toEqual({ kind: "hook", reason: expected });
    const end = buildTurnEndMeta({ turn: 1, reason: "cancelled", cancelCause: cause, recovery: null }, "live");
    expect(end.cancelCause).toEqual({ kind: "hook", reason: expected });
    const cancel = buildLoopEventRow({ kind: "cancel", cause, keepInbox: false, requestedBy: unbounded, observedHeadEventId: null, phase: "running" });
    expect(cancel.meta.cause).toEqual(end.cancelCause);
    expect(cancel.meta.requestedBy).toBe(expected);
    expect(Buffer.byteLength(cancel.meta.requestedBy as string)).toBe(512);
    expect(cause.reason).toBe(unbounded);
    expect(readTurnEndMeta(JSON.stringify({ ...end, cancelCause: cause }))?.cancelCause).toEqual(cause);
  });
});
