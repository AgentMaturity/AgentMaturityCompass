import { openLedger } from "../src/ledger/ledger.js";
import { startOwnerProcess } from "./helpers/sessionOwnerProcess.js";
import { rmSync } from "node:fs";
import { afterEach, describe, expect, test } from "vitest";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { recoverSession, type RecoveryClaimant } from "../src/session/sessionRecovery.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { readStepBoundary, readTurnEndMeta } from "../src/session/turnLifecycleMeta.js";
import type { ToolCallOutcome } from "../src/agent/toolSeam.js";
import type { EvidenceEvent } from "../src/types.js";
import {
  loopHarness,
  ok,
  StubToolSeam,
  textStep,
  toolStep,
  toolStepMulti,
  type LoopHarness
} from "./helpers/agentLoopHarness.js";

/**
 * P3.2 stage 3 — the bounded tool pool and cancellation.
 *
 * Three properties are under test here, and each is a rule that a plausible
 * simpler implementation would not have:
 *
 *   1. THE POOL IS BOUNDED AND ROLLING. Concurrency is observed, not asserted
 *      from configuration — a counter the tools themselves maintain must reach
 *      the ceiling and never pass it. A serial implementation fails the "reach"
 *      half; an unbounded one fails the "never pass" half.
 *
 *   2. A TOOL THAT HANGS CANNOT VETO A CANCEL. Every test that stops a hanging
 *      tool is run under an explicit deadline, so the failure mode of removing
 *      the grace window is a named assertion rather than a suite that hangs.
 *
 *   3. A LIVE CANCEL AND A CRASH ARE DIFFERENT FACTS. The last test runs the
 *      SAME scenario twice — once stopped, once abandoned and repaired — and
 *      pins both projected `turn/end` rows by deep equality, so any future
 *      change that spells one of them like the other fails here.
 */
describe("P3.2 — the bounded tool pool and cancellation", () => {
  const open: LoopHarness[] = [];

  const claimant: RecoveryClaimant = {
    pid: 9191,
    hostId: "host-pool",
    bootId: "boot-pool",
    startedAt: 1_700_000_000
  };

  afterEach(() => {
    while (open.length > 0) {
      const harness = open.pop();
      if (harness === undefined) continue;
      try {
        harness.finish();
      } catch {
        // Already closed, abandoned, or failed. Cleanup, not an assertion.
      }
      rmSync(harness.dir, { recursive: true, force: true });
    }
  });

  function harnessFor(options: Parameters<typeof loopHarness>[0]): LoopHarness {
    const harness = loopHarness(options);
    open.push(harness);
    return harness;
  }

  const metaOf = (event: EvidenceEvent): Record<string, unknown> =>
    JSON.parse(event.meta_json) as Record<string, unknown>;

  const rows = (events: readonly EvidenceEvent[], type: string): EvidenceEvent[] =>
    events.filter((event) => event.event_type === type);

  const only = (events: readonly EvidenceEvent[], type: string): EvidenceEvent => {
    const matches = rows(events, type);
    expect(matches, `exactly one ${type}`).toHaveLength(1);
    return matches[0]!;
  };

  /** Every recorded `tool/call`, answered, in the order the model asked. */
  function answers(events: readonly EvidenceEvent[]): { id: unknown; outcome: unknown }[] {
    return rows(events, "tool/result").map((event) => ({
      id: metaOf(event).toolCallId,
      outcome: metaOf(event).outcome
    }));
  }

  function callIds(events: readonly EvidenceEvent[]): unknown[] {
    return rows(events, "tool/call").map((event) => metaOf(event).toolCallId);
  }

  /** What a `tool/result` row's model-visible body actually says. */
  function bodyOf(harness: LoopHarness, event: EvidenceEvent): string {
    const payload = readEventPayload(harness.dir, event);
    expect(payload.status, "the result body is readable").toBe("ok");
    return payload.status === "ok" ? payload.bytes.toString("utf8") : "";
  }

  function assertBalanced(events: readonly EvidenceEvent[]): void {
    const started = rows(events, "step/start").map((event) => readStepBoundary(event.meta_json));
    const ended = rows(events, "step/end").map((event) => readStepBoundary(event.meta_json));
    expect(ended).toEqual(started);
    expect(rows(events, "turn/end").map((event) => readTurnEndMeta(event.meta_json)?.turn)).toEqual(
      rows(events, "turn/start").map((event) => metaOf(event).turn)
    );
  }

  /**
   * Await something under a deadline.
   *
   * The whole point of the hang policy is that these waits terminate. Racing a
   * deadline turns "the pool wedged" — which would otherwise appear as a suite
   * that never finishes — into a one-line failure naming what did not settle.
   */
  async function within(promise: Promise<void>, ms: number, what: string): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${what} did not settle within ${ms}ms — the pool wedged`));
      }, ms);
    });
    try {
      await Promise.race([promise, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** A tool that never returns and never looks at its abort signal. */
  function hangingTool(): { run: () => Promise<ToolCallOutcome>; dispatched: Promise<void> } {
    let started: () => void = () => {
      // Replaced synchronously below.
    };
    const dispatched = new Promise<void>((resolve) => {
      started = resolve;
    });
    return {
      run: (): Promise<ToolCallOutcome> => {
        started();
        // Deliberately never settles: this is the tool that ignores the stop.
        return new Promise<ToolCallOutcome>(() => {
          // no resolution, ever
        });
      },
      dispatched
    };
  }

  const yieldTick = (): Promise<void> =>
    new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

  // ── The bound is real, and it is a ceiling, not a policy ──────────────────

  test("the pool rolls up to the concurrency ceiling and never past it", async () => {
    let live = 0;
    let peak = 0;
    const tools = new StubToolSeam({
      work: async () => {
        live += 1;
        peak = Math.max(peak, live);
        // Yield so a sibling that is allowed to start actually does before this
        // one settles; without it "parallel" and "serial" look identical.
        await yieldTick();
        live -= 1;
        return ok("done");
      }
    });
    const calls = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `call-${n}`, name: "work", args: "{}" }));
    const harness = harnessFor({
      scripts: [toolStepMulti(calls), textStep("all six ran.")],
      tools,
      config: { maxParallelToolCalls: 3 }
    });

    harness.driver.followup("Run six things.");
    await within(harness.driver.whenIdle(), 5_000, "a six-call step");
    harness.finish();

    // BOTH halves matter. `=== 3` fails a serial implementation (peak 1) and an
    // unbounded one (peak 6); a `<= 3` assertion alone would pass the serial one.
    expect(peak).toBe(3);
    expect(tools.calls).toHaveLength(6);

    const events = harness.events();
    assertBalanced(events);
    // Dispatch overlapped; results did not. Model order is what the conversation
    // means, so the rows are in model order even though the tools were not.
    expect(answers(events).map((answer) => answer.id)).toEqual(calls.map((call) => call.id));
    expect(answers(events).every((answer) => answer.outcome === "OK")).toBe(true);

    const verdict = await verifyLedgerIntegrity(harness.dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
  });

  test("an exclusive call is a barrier: nothing overlaps it, and the pool resumes after it", async () => {
    let live = 0;
    let peak = 0;
    let liveWhenExclusiveEntered = -1;
    const enter = (): void => {
      live += 1;
      peak = Math.max(peak, live);
    };
    const tools = new StubToolSeam(
      {
        para: async () => {
          enter();
          await yieldTick();
          live -= 1;
          return ok("parallel");
        },
        solo: async () => {
          enter();
          liveWhenExclusiveEntered = live;
          await yieldTick();
          live -= 1;
          return ok("exclusive");
        }
      },
      ["solo"]
    );
    const harness = harnessFor({
      scripts: [
        toolStepMulti([
          { id: "call-1", name: "para", args: "{}" },
          { id: "call-2", name: "para", args: "{}" },
          { id: "call-3", name: "solo", args: "{}" },
          { id: "call-4", name: "para", args: "{}" },
          { id: "call-5", name: "para", args: "{}" }
        ]),
        textStep("done.")
      ],
      tools,
      // Deliberately ABOVE the parallel run lengths: with a ceiling of 3 and no
      // barrier, the exclusive call would join the first pair and peak would be
      // 3. The barrier is the only thing that holds the observed peak at 2.
      config: { maxParallelToolCalls: 3 }
    });

    harness.driver.followup("Run five things.");
    await within(harness.driver.whenIdle(), 5_000, "a five-call step");
    harness.finish();

    expect(liveWhenExclusiveEntered).toBe(1);
    expect(peak).toBe(2);
    expect(tools.calls.map((request) => request.toolName)).toEqual([
      "para",
      "para",
      "solo",
      "para",
      "para"
    ]);

    const events = harness.events();
    assertBalanced(events);
    expect(answers(events)).toHaveLength(5);
  });

  // ── A hanging tool cannot wedge the pool, the turn, or the driver ─────────

  test("a tool that hangs and ignores the stop is abandoned; its siblings keep their real outcomes", async () => {
    const hang = hangingTool();
    let fastRuns = 0;
    let bothFastDone: () => void = () => {
      // Replaced synchronously below.
    };
    const bothFast = new Promise<void>((resolve) => {
      bothFastDone = resolve;
    });
    const tools = new StubToolSeam({
      hang: hang.run,
      fast: async () => {
        fastRuns += 1;
        const label = `fast-${fastRuns}`;
        await yieldTick();
        if (fastRuns === 2) bothFastDone();
        return ok(label);
      }
    });
    const harness = harnessFor({
      scripts: [
        toolStepMulti([
          { id: "call-1", name: "hang", args: "{}" },
          { id: "call-2", name: "fast", args: "{}" },
          { id: "call-3", name: "fast", args: "{}" }
        ]),
        textStep("unreachable")
      ],
      tools,
      config: { maxParallelToolCalls: 2, toolAbandonGraceMs: 20 }
    });

    harness.driver.followup("Run three things, one of which never returns.");
    await hang.dispatched;
    // Wait for BOTH fast calls before stopping anything. That is the claim: with
    // a two-slot pool and a hang holding one slot, the second slot kept rolling.
    // A pool that a single hang blocks never reaches this line.
    await within(bothFast, 5_000, "the two calls queued behind a hanging tool");
    harness.driver.cancel({ kind: "user" }, { by: "operator" });
    await within(harness.driver.whenIdle(), 5_000, "a cancelled turn with a hanging tool");
    harness.finish();

    // The hang occupied ONE pool slot; it did not stop the other calls being
    // dispatched behind it. That is the difference between a bounded rolling
    // pool and a queue that a single slow call blocks.
    expect(fastRuns).toBe(2);

    const events = harness.events();
    assertBalanced(events);

    // Every call the recorder wrote a row for is answered — a `tool_use` with no
    // `tool_result` cannot be sent back to a provider, so the session would be
    // unresumable.
    expect(answers(events).map((answer) => answer.id)).toEqual(callIds(events));
    expect(answers(events)).toEqual([
      // Dispatched, never returned: unknown, because it genuinely is.
      { id: "call-1", outcome: "TOOL_OUTCOME_UNKNOWN" },
      // These two DID finish. A known result is never discarded just because the
      // step was stopping — that would record less than AMC knows.
      { id: "call-2", outcome: "OK" },
      { id: "call-3", outcome: "OK" }
    ]);
    expect(bodyOf(harness, rows(events, "tool/result")[1]!)).toBe("fast-1");
    expect(bodyOf(harness, rows(events, "tool/result")[0]!)).toContain("grace window");

    const ending = readTurnEndMeta(only(events, "turn/end").meta_json);
    expect(ending?.reason).toBe("cancelled");
    expect(ending?.cancelCause).toEqual({ kind: "user" });
    expect(metaOf(only(events, "loop/cancel")).requestedBy).toBe("operator");

    const verdict = await verifyLedgerIntegrity(harness.dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
  });

  test("a seam failure beside a hanging sibling still answers both, and says which is which", async () => {
    const hang = hangingTool();
    const tools = new StubToolSeam({
      hang: hang.run,
      broken: async () => {
        await yieldTick();
        // The SEAM, not the tool: a failing tool returns an ERROR outcome.
        throw new Error("tool pipeline exploded");
      }
    });
    const harness = harnessFor({
      scripts: [
        toolStepMulti([
          { id: "call-1", name: "hang", args: "{}" },
          { id: "call-2", name: "broken", args: "{}" }
        ]),
        textStep("unreachable")
      ],
      tools,
      config: { maxParallelToolCalls: 2, toolAbandonGraceMs: 20 }
    });

    harness.driver.followup("Run both.");
    // Nothing cancels here. The bound on the post-failure drain is what makes
    // this terminate at all: an unbounded drain would wait on the hang forever.
    await within(harness.driver.whenIdle(), 5_000, "a seam failure beside a hanging tool");
    harness.finish();

    const events = harness.events();
    assertBalanced(events);
    expect(answers(events)).toEqual([
      { id: "call-1", outcome: "TOOL_OUTCOME_UNKNOWN" },
      { id: "call-2", outcome: "TOOL_OUTCOME_UNKNOWN" }
    ]);

    // Same machine-readable outcome, two different stories — an operator asking
    // "what happened to my call?" gets the right one.
    const [abandoned, broke] = rows(events, "tool/result");
    expect(bodyOf(harness, abandoned!)).toContain("grace window");
    expect(bodyOf(harness, broke!)).toContain("the tool seam failed while it was running");

    expect(readTurnEndMeta(only(events, "turn/end").meta_json)?.reason).toBe("error");

    const verdict = await verifyLedgerIntegrity(harness.dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
  });

  // ── keepInbox decides what survives the cancel ────────────────────────────

  test("cancel drops queued work by default, and records the drop as a splice", async () => {
    const hang = hangingTool();
    const harness = harnessFor({
      scripts: [toolStep("call-1", "hang", "{}"), textStep("unreachable")],
      tools: new StubToolSeam({ hang: hang.run }),
      config: { toolAbandonGraceMs: 20 }
    });

    harness.driver.followup("Start something long.");
    await hang.dispatched;
    const queued = harness.driver.inject("context the model has not seen yet");
    harness.driver.cancel({ kind: "user" });
    await within(harness.driver.whenIdle(), 5_000, "a cancelled turn");
    harness.finish();

    expect(harness.driver.inbox.nextStep).toHaveLength(0);
    const events = harness.events();
    // The loss is RECORDED, not merely performed: a dropped message that leaves
    // no row is work the log cannot account for.
    const dropped = rows(events, "loop/inbox").filter((event) => metaOf(event).op === "cancel");
    expect(dropped).toHaveLength(1);
    expect(metaOf(dropped[0]!).messageIds).toEqual([queued.messageId]);
    expect(metaOf(only(events, "loop/cancel")).keepInbox).toBe(false);
  });

  test("cancel with keepInbox keeps queued work, and logs no drop", async () => {
    const hang = hangingTool();
    const harness = harnessFor({
      scripts: [toolStep("call-1", "hang", "{}"), textStep("unreachable")],
      tools: new StubToolSeam({ hang: hang.run }),
      config: { toolAbandonGraceMs: 20 }
    });

    harness.driver.followup("Start something long.");
    await hang.dispatched;
    const queued = harness.driver.inject("context the model has not seen yet");
    harness.driver.cancel({ kind: "user" }, { keepInbox: true });
    await within(harness.driver.whenIdle(), 5_000, "a cancelled turn that kept its inbox");
    harness.finish();

    // The live turn still stopped; only the QUEUE survived.
    expect(harness.driver.inbox.nextStep.map((message) => message.messageId)).toEqual([
      queued.messageId
    ]);
    const events = harness.events();
    expect(rows(events, "loop/inbox").filter((event) => metaOf(event).op === "cancel")).toHaveLength(
      0
    );
    expect(metaOf(only(events, "loop/cancel")).keepInbox).toBe(true);
    expect(readTurnEndMeta(only(events, "turn/end").meta_json)?.reason).toBe("cancelled");
  });

  // ── VERIFY-3: stopped and died are different facts ────────────────────────

  /**
   * The projected closure of a turn, as a reader of the log would see it.
   *
   * Built from the two production readers — the meta reader and the envelope —
   * rather than from a bespoke shape, so the assertion is about what the log
   * says and not about a helper this test invented.
   */
  function projectClosure(event: EvidenceEvent): Record<string, unknown> {
    const meta = readTurnEndMeta(event.meta_json);
    return {
      turn: meta?.turn ?? null,
      reason: meta?.reason ?? null,
      interrupted: meta?.interrupted ?? null,
      cancelCause: meta?.cancelCause ?? null,
      synthetic: extractEnvelope(event.meta_json)?.synthetic ?? null
    };
  }

  /** One scenario: a turn whose only tool never returns. Stopped, or abandoned. */
  function hangingTurn(): { harness: LoopHarness; dispatched: Promise<void> } {
    const hang = hangingTool();
    const harness = harnessFor({
      scripts: [toolStep("call-1", "hang", "{}"), textStep("unreachable")],
      tools: new StubToolSeam({ hang: hang.run }),
      config: { toolAbandonGraceMs: 20 }
    });
    harness.driver.followup("Start something that never comes back.");
    return { harness, dispatched: hang.dispatched };
  }

  test("the same stopped turn reads as cancelled when stopped and interrupted when repaired", async () => {
    // (1) LIVE CANCEL — someone stopped this agent.
    const live = hangingTurn();
    await live.dispatched;
    live.harness.driver.cancel({ kind: "user" });
    await within(live.harness.driver.whenIdle(), 5_000, "the cancelled run");
    live.harness.finish();

    // (2) THE SAME SCENARIO, ABANDONED — this agent died. Nothing cancels and
    // nothing closes: the turn is left open exactly as a process death leaves
    // it, and crash repair is what closes it.
    const dead = hangingTurn();
    await dead.dispatched;
    dead.harness.abandon();
    // Abandoning an object in this still-live process is not death. Even force
    // must refuse its owner. Stage the actual interrupted log in a child.
    const refused = recoverSession({ workspace: dead.harness.dir, sessionId: dead.harness.sessionId, claimant, force: true });
    expect(refused.verdict).toBe("INDETERMINATE"); expect(refused.reason).toMatch(/still alive/);
    const process = await startOwnerProcess(dead.harness.dir, "tool");
    const crashedSessionId = String(process.ready.sessionId); await process.kill();
    const report = recoverSession({ workspace: dead.harness.dir, sessionId: crashedSessionId, claimant, force: true });
    expect(report.verdict).toBe("RECOVERED");
    expect(report.syntheticTurnEnds).toBe(1);
    expect(report.syntheticStepEnds).toBe(1);
    // The dangling call is answered by repair, with the same word the live pool
    // uses for the same fact.
    expect(report.unknownToolOutcomes).toBe(1);

    const liveClosure = projectClosure(only(live.harness.events(), "turn/end"));
    const reader = openLedger(dead.harness.dir, { readonly: true });
    let repairedEvents: EvidenceEvent[];
    try { repairedEvents = reader.getAllEvents().filter((event) => event.session_id === crashedSessionId); } finally { reader.close(); }
    const repairedClosure = projectClosure(only(repairedEvents, "turn/end"));

    // Deep equality on BOTH, so a change that spells either one like the other
    // fails here rather than quietly laundering a stop into a death.
    expect(liveClosure).toEqual({
      turn: 1,
      reason: "cancelled",
      interrupted: false,
      cancelCause: { kind: "user" },
      synthetic: false
    });
    expect(repairedClosure).toEqual({
      turn: 1,
      reason: "interrupted",
      interrupted: true,
      cancelCause: null,
      synthetic: true
    });
    expect(liveClosure).not.toEqual(repairedClosure);

    // Both logs still verify: the distinction is inside signed, chained rows.
    for (const harness of [live.harness, dead.harness]) {
      const verdict = await verifyLedgerIntegrity(harness.dir);
      expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
    }
  });
});
