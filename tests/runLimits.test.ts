import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { describeRunLimit, parseRunLimits, priorTokensOf, RunLimitTracker } from "../src/agent/runLimits.js";
import { readTurnEndMeta } from "../src/session/turnLifecycleMeta.js";
import { isTurnCancelCause } from "../src/session/sessionTypes.js";
import { bodyFromChunks } from "../src/llm/adapter/transport.js";
import type { EvidenceEvent } from "../src/types.js";
import { loopHarness, textStep, type LoopHarness } from "./helpers/agentLoopHarness.js";

/**
 * SH-LOOP-06: root-run stop conditions. Every limit ends the run as a signed `loop/cancel` whose cause is
 * `{kind:"limit", condition, bound}`, and a limit that fires inside a turn also sits inside the hashed `turn/end`.
 */
describe("parseRunLimits", () => {
  it("accepts the three forms once each and refuses prose, duplicates and child-only syntax", () => {
    const parsed = parseRunLimits(["max-turns:2", "max-tokens:500", "timeout-ms:1000"]);
    expect(parsed).toMatchObject({ ok: true, limits: { maxTurns: 2, maxTotalTokens: 500, deadlineMs: 1000 } });
    expect(parseRunLimits(undefined)).toMatchObject({ ok: true, limits: {}, conditions: [] });
    for (const bad of [["max-turns:0"], ["max-turns:2", "max-turns:3"], ["max turns 2"], ["timeout-ms:9999999999"], ["max-tokens:+1"]]) {
      expect(parseRunLimits(bad).ok, bad.join(",")).toBe(false);
    }
  });

  it("is refused where no root driver would enforce it: goal rounds and schedule passes", async () => {
    // MUTATION: drop the runComposedTurn refusal and the limit is silently dropped on the goal-rounds path.
    const { runComposedTurn } = await import("../src/kernel/agentLoopRunner.js");
    await expect(runComposedTurn({ workspace: "/nonexistent-amc-workspace", agentId: "default", prompt: "goal", runLimits: { deadlineMs: 1000 },
      goalRounds: { maxRounds: 1 }, route: { providerId: "stub", model: "stub", params: { max_tokens: 16, stream: true } }, routes: [] }))
      .rejects.toThrow(/Run limits bound the root driver/);
  });

  it("is not the child parser: --delegate-stop still refuses max-tokens", async () => {
    const { parseSubagentStopConditions } = await import("../src/agent/subagentStopConditions.js");
    expect(parseSubagentStopConditions(["max-tokens:1"]).ok).toBe(false);
  });
});

describe("RunLimitTracker", () => {
  it("fails closed on a step that reported no usage", () => {
    const tracker = new RunLimitTracker({ maxTotalTokens: 100 });
    expect(tracker.recordUsage({ inputTokens: 10, outputTokens: 5, cacheRead: null, cacheWrite: null })).toBeNull();
    expect(tracker.recordUsage(null)).toMatchObject({ kind: "limit", condition: "max-tokens", bound: 100, unmeasured: true });
  });
  it("seeds from the session's earlier steps and fails closed on an unmeasured history", () => {
    expect(priorTokensOf({ turns: [{ steps: 2, measuredSteps: 2, tokens: { inputTokens: 40, outputTokens: 10, cacheRead: null, cacheWrite: 5 } }] })).toEqual({ priorTokens: 55, priorUnmeasured: false });
    const seeded = new RunLimitTracker({ maxTotalTokens: 60 }, 55);
    expect(seeded.recordUsage({ inputTokens: 4, outputTokens: 2, cacheRead: null, cacheWrite: null })).toMatchObject({ condition: "max-tokens" });
    expect(new RunLimitTracker({ maxTotalTokens: 60 }, 0, true).turnAllowed(1)).toMatchObject({ condition: "max-tokens", unmeasured: true });
    expect(new RunLimitTracker({ maxTurns: 1 }).turnAllowed(2)).toMatchObject({ condition: "max-turns", bound: 1 });
  });
  it("is a cancel cause the vocabulary validates and the SDK page schema accepts", async () => {
    expect(isTurnCancelCause({ kind: "limit", condition: "deadline", bound: 5 })).toBe(true);
    expect(isTurnCancelCause({ kind: "limit", condition: "max-steps", bound: 5 })).toBe(false);
    expect(isTurnCancelCause({ kind: "limit", condition: "max-turns", bound: -1 })).toBe(false);
  });
});

describe("the driver under run limits", () => {
  const open: LoopHarness[] = [];
  afterEach(() => {
    while (open.length > 0) {
      const harness = open.pop()!;
      try { harness.finish(); } catch { /* already closed */ }
      rmSync(harness.dir, { recursive: true, force: true });
    }
  });
  const rows = (events: readonly EvidenceEvent[], type: string) => events.filter(event => event.event_type === type);
  const cancels = (events: readonly EvidenceEvent[]) => rows(events, "loop/cancel").map(row => JSON.parse(row.meta_json) as Record<string, unknown>);

  it("max-turns: the turn beyond the bound never opens; the refusal is a signed cancel and the queue is dropped", async () => {
    // MUTATION: remove the `turnAllowed` check before `startTurn` and a second turn/start appears.
    const harness = loopHarness({ scripts: [textStep("one", { inputTokens: 1, outputTokens: 1 })], runLimits: { limits: { maxTurns: 1 } } });
    open.push(harness);
    harness.driver.followup("First.");
    await harness.driver.whenIdle();
    harness.driver.followup("Second.");
    await harness.driver.whenIdle();
    const events = harness.events();
    expect(rows(events, "turn/start")).toHaveLength(1);
    expect(readTurnEndMeta(rows(events, "turn/end")[0]!.meta_json)?.reason).toBe("complete");
    const [refusal] = cancels(events);
    expect(refusal).toMatchObject({ requestedBy: "run-limit", keepInbox: false, cause: { kind: "limit", condition: "max-turns", bound: 1 } });
    expect(harness.driver.inbox.hasPending).toBe(false);
  });

  it("max-tokens: the budget is checked after each measured step and ends the live turn with the limit as its cause", async () => {
    // MUTATION: drop the `recordUsage` check after `endStep` and the turn ends `complete`.
    const harness = loopHarness({
      scripts: [textStep("first", { inputTokens: 30, outputTokens: 10 }), textStep("second", { inputTokens: 30, outputTokens: 10 })],
      runLimits: { limits: { maxTotalTokens: 50 } }
    });
    open.push(harness);
    harness.driver.followup("Go.");
    await harness.driver.whenIdle();
    harness.driver.followup("Again.");
    await harness.driver.whenIdle();
    const events = harness.events();
    const endings = rows(events, "turn/end").map(row => readTurnEndMeta(row.meta_json));
    expect(endings[0]?.reason).toBe("complete");
    // The second turn's first step reports 40 more tokens: 80 > 50, so the turn is cancelled right there.
    expect(endings[1]).toMatchObject({ reason: "cancelled", cancelCause: { kind: "limit", condition: "max-tokens", bound: 50 } });
    expect(rows(events, "step/start")).toHaveLength(2);
    expect(cancels(events)[0]).toMatchObject({ requestedBy: "run-limit", cause: { condition: "max-tokens" } });
  });

  it("max-tokens with an unmeasured step fails closed: the next turn is refused rather than the step counted as zero", async () => {
    // A stream with no usage chunk fails the step (the protocol requires one), so its step/end carries usage: null.
    // MUTATION: count a null usage as 0 and the second turn opens.
    const unmeasured = textStep("no usage reported").filter(chunk => chunk.type !== "usage");
    const harness = loopHarness({ scripts: [unmeasured, textStep("fine", { inputTokens: 1, outputTokens: 1 })], runLimits: { limits: { maxTotalTokens: 1_000 } } });
    open.push(harness);
    harness.driver.followup("Go.");
    await harness.driver.whenIdle();
    harness.driver.followup("Again.");
    await harness.driver.whenIdle();
    const events = harness.events();
    expect(rows(events, "step/end").map(row => (JSON.parse(row.meta_json) as { usage: unknown }).usage)).toEqual([null]);
    expect(rows(events, "turn/start")).toHaveLength(1);
    expect(cancels(events)[0]).toMatchObject({ requestedBy: "run-limit", cause: { kind: "limit", condition: "max-tokens", unmeasured: true } });
  });

  it("a limit that ended the run refuses new work at admission: one signed cancel, not one per later attempt", async () => {
    // MUTATION: drop the limitEnding check in assertUsable and the third follow-up is admitted, then cancelled by a second row.
    const harness = loopHarness({ scripts: [textStep("one", { inputTokens: 1, outputTokens: 1 })], runLimits: { limits: { maxTurns: 1 } } });
    open.push(harness);
    harness.driver.followup("First.");
    await harness.driver.whenIdle();
    expect(harness.driver.runLimitEnding).toBeNull();
    harness.driver.followup("Second.");
    await harness.driver.whenIdle();
    expect(harness.driver.runLimitEnding).toMatchObject({ kind: "limit", condition: "max-turns", bound: 1 });
    expect(() => harness.driver.followup("Third.")).toThrow(/run limit reached \(max-turns:1\)/);
    expect(cancels(harness.events())).toHaveLength(1);
    expect(describeRunLimit({ kind: "limit", condition: "deadline", bound: 100 })).toBe("timeout-ms:100");
    expect(describeRunLimit({ kind: "limit", condition: "max-tokens", bound: 5, unmeasured: true })).toMatch(/^max-tokens:5 \(a step reported no usage/);
  });

  it("timeout-ms: the deadline cancels a live turn with cause deadline", async () => {
    // MUTATION: never arm the timer and the turn completes instead.
    const slow = async () => { await new Promise(resolve => setTimeout(resolve, 300)); return { status: 200, headers: { "content-type": "text/event-stream" }, body: bodyFromChunks([]) }; };
    const harness = loopHarness({ scripts: [textStep("late", { inputTokens: 1, outputTokens: 1 })], transport: slow, runLimits: { limits: { deadlineMs: 60 } } });
    open.push(harness);
    harness.driver.followup("Go.");
    await harness.driver.whenIdle();
    const events = harness.events();
    expect(readTurnEndMeta(rows(events, "turn/end")[0]!.meta_json)).toMatchObject({ reason: "cancelled", cancelCause: { kind: "limit", condition: "deadline", bound: 60 } });
    expect(cancels(events)[0]).toMatchObject({ requestedBy: "run-limit", phase: "running" });
  });
});
