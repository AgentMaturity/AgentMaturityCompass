import { rmSync } from "node:fs";
import { afterEach, describe, expect, test } from "vitest";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { readStepBoundary, readTurnEndMeta } from "../src/session/turnLifecycleMeta.js";
import { readLoopInboxMeta } from "../src/session/loopEventMeta.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { AgentDriver } from "../src/agent/agentDriver.js";
import type { EvidenceEvent } from "../src/types.js";
import {
  loopHarness,
  LOOP_MODEL,
  LOOP_PROVIDER,
  ok,
  maxTokensStep,
  StubToolSeam,
  textStep,
  toolStep,
  toolStepMulti,
  type LoopHarness
} from "./helpers/agentLoopHarness.js";

/**
 * P3.2 stage 2 — the turn/step machine and the inbox.
 *
 * Every test here drives the REAL driver over the REAL session spine, with a
 * scripted model and no network. What is asserted is what the log says
 * afterwards, because the log is the product: an assertion that the driver
 * returned the right value would pass on an implementation that recorded
 * nothing.
 *
 * Each rule this stage adds has a test that goes RED when the rule is removed —
 * the balanced brackets are checked on a FAILING turn (where a missing `finally`
 * is the difference between a balanced turn and a truncated one), the veto is
 * checked by the absence of any step, and the nullable cache counts are checked
 * for null rather than for zero.
 */
describe("P3.2 — the agent loop's turn/step machine", () => {
  const open: LoopHarness[] = [];

  afterEach(() => {
    while (open.length > 0) {
      const harness = open.pop();
      if (harness === undefined) continue;
      try {
        harness.finish();
      } catch {
        // Already closed, or the session failed. Cleanup, not an assertion.
      }
      rmSync(harness.dir, { recursive: true, force: true });
    }
  });

  function harnessFor(options: Parameters<typeof loopHarness>[0]): LoopHarness {
    const harness = loopHarness(options);
    open.push(harness);
    return harness;
  }

  const typesOf = (events: readonly EvidenceEvent[]): string[] =>
    events.map((event) => event.event_type);

  const metaOf = (event: EvidenceEvent): Record<string, unknown> =>
    JSON.parse(event.meta_json) as Record<string, unknown>;

  const only = (events: readonly EvidenceEvent[], type: string): EvidenceEvent => {
    const matches = events.filter((event) => event.event_type === type);
    expect(matches, `exactly one ${type}`).toHaveLength(1);
    return matches[0]!;
  };

  /**
   * Every `step/start` in the log has a `step/end` naming the same (turn, step),
   * and every `turn/start` has a `turn/end` naming the same turn.
   *
   * This is the balance property the two `finally` blocks exist to produce. It
   * is asserted as a fold over the whole log rather than as a shape at one
   * index, so a turn that ended in an unexpected place still has to be balanced.
   */
  function assertBalanced(events: readonly EvidenceEvent[]): void {
    const startedSteps = events
      .filter((event) => event.event_type === "step/start")
      .map((event) => readStepBoundary(event.meta_json));
    const endedSteps = events
      .filter((event) => event.event_type === "step/end")
      .map((event) => readStepBoundary(event.meta_json));
    expect(startedSteps.every((boundary) => boundary !== null)).toBe(true);
    expect(endedSteps.map((boundary) => `${boundary?.turn}.${boundary?.step}`)).toEqual(
      startedSteps.map((boundary) => `${boundary?.turn}.${boundary?.step}`)
    );

    const startedTurns = events
      .filter((event) => event.event_type === "turn/start")
      .map((event) => metaOf(event).turn);
    const endedTurns = events
      .filter((event) => event.event_type === "turn/end")
      .map((event) => readTurnEndMeta(event.meta_json)?.turn);
    expect(endedTurns).toEqual(startedTurns);
  }

  // ── A multi-step turn ────────────────────────────────────────────────────

  test("a turn that calls a tool runs a second step and ends complete, fully bracketed", async () => {
    const tools = new StubToolSeam({
      echo: async () => ok("file-a.txt\nfile-b.txt\n")
    });
    const harness = harnessFor({
      scripts: [
        toolStep("call-1", "echo", JSON.stringify({ path: "." })),
        textStep("There are two files.")
      ],
      tools
    });

    harness.driver.followup("List the files.");
    await harness.driver.whenIdle();
    harness.finish();

    const events = harness.events();
    assertBalanced(events);

    // ONE turn, TWO steps: the tool call is what made the turn multi-step, and
    // the second step is the model being asked again with the result in view.
    expect(typesOf(events).filter((type) => type === "turn/start")).toHaveLength(1);
    const steps = events
      .filter((event) => event.event_type === "step/start")
      .map((event) => readStepBoundary(event.meta_json));
    expect(steps).toEqual([
      { turn: 1, step: 1 },
      { turn: 1, step: 2 }
    ]);

    // The model's call was answered, and the answer is joined to the call by id.
    const call = only(events, "tool/call");
    const result = only(events, "tool/result");
    expect(metaOf(call).toolCallId).toBe("call-1");
    expect(metaOf(result).toolCallId).toBe("call-1");
    expect(metaOf(result).outcome).toBe("OK");
    expect(tools.calls.map((request) => request.toolName)).toEqual(["echo"]);

    const ending = readTurnEndMeta(only(events, "turn/end").meta_json);
    expect(ending?.reason).toBe("complete");
    expect(ending?.interrupted).toBe(false);
    expect(ending?.cancelCause).toBeNull();

    // The seal comes AFTER the closer, and only after it: a sealed window with
    // no turn/end is the one shape that reads as tidy while hiding a gap.
    const order = typesOf(events);
    expect(order.indexOf("turn/seal")).toBeGreaterThan(order.indexOf("turn/end"));

    const verdict = await verifyLedgerIntegrity(harness.dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
    expect(verdict.sessions.closed).toContain(harness.sessionId);
  });

  /**
   * The negative half of the bracket rule.
   *
   * A step whose model call FAILS is the case where a missing `finally` shows:
   * the throw unwinds past `endStep` and `endTurn`, leaving an open step inside
   * an open turn — a log shaped exactly like a crash, produced by a process that
   * was alive and knew what happened. Deleting either `finally` turns this red.
   */
  test("a failing model call still closes its step and its turn", async () => {
    const harness = harnessFor({
      scripts: [textStep("never sent")],
      transport: async () => {
        throw new Error("connection refused");
      }
    });

    harness.driver.followup("Say hello.");
    await harness.driver.whenIdle();
    harness.finish();

    const events = harness.events();
    assertBalanced(events);
    expect(typesOf(events)).toContain("step/end");
    expect(typesOf(events)).toContain("request/failure");

    const ending = readTurnEndMeta(only(events, "turn/end").meta_json);
    expect(ending?.reason).toBe("error");
    // An error is NOT a cancellation and NOT a crash: neither of the other two
    // vocabularies may leak into it.
    expect(ending?.interrupted).toBe(false);
    expect(ending?.cancelCause).toBeNull();

    const verdict = await verifyLedgerIntegrity(harness.dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
  });

  // ── Steering ─────────────────────────────────────────────────────────────

  test("a steer sent mid-turn is claimed by the NEXT step of the SAME turn", async () => {
    let steerEventId = "";
    const tools = new StubToolSeam({
      // The steer arrives while the first step is still executing its tool —
      // the only moment at which "mid-turn" is a real condition rather than a
      // convenient fiction.
      echo: async () => {
        steerEventId = harness.driver.steer("Use the short listing instead.").eventId;
        return ok("file-a.txt\n");
      }
    });
    const harness = harnessFor({
      scripts: [
        toolStep("call-1", "echo", JSON.stringify({ path: "." })),
        textStep("Understood — short listing.")
      ],
      tools
    });

    harness.driver.followup("List the files.");
    await harness.driver.whenIdle();
    harness.finish();

    const events = harness.events();
    assertBalanced(events);

    // THE claim of this test: one turn, not two. A steer that opened its own
    // turn would leave two turn/start rows here.
    expect(events.filter((event) => event.event_type === "turn/start")).toHaveLength(1);

    const insert = events.find((event) => event.id === steerEventId);
    expect(insert, "the receipt names a committed loop/inbox row").toBeDefined();
    const insertMeta = readLoopInboxMeta(insert!.meta_json);
    expect(insertMeta?.op).toBe("insert");
    expect(insertMeta?.target).toBe("next-step");
    expect(insertMeta?.origin).toBe("steer");
    expect(metaOf(insert!).wake).toBe(true);

    // A claim, not a cancellation. That one field is all that separates "a turn
    // consumed this" from "a cancel dropped it" when the log is folded.
    const claim = events.find((event) => {
      const meta = readLoopInboxMeta(event.meta_json);
      return (
        event.event_type === "loop/inbox" &&
        meta?.op === "claim" &&
        meta.messageIds.includes(insertMeta!.messageIds[0]!)
      );
    });
    expect(claim, "the steer was claimed").toBeDefined();
    expect(metaOf(claim!).outcome).toBeNull();

    // Delivered in step 2 of turn 1 — the next step of the same turn.
    const delivered = events.filter((event) => event.event_type === "user/message");
    const steerRow = delivered.find(
      (event) => event.payload_sha256 === insert!.payload_sha256
    );
    expect(steerRow, "the steer reached the model").toBeDefined();
    const envelope = extractEnvelope(steerRow!.meta_json);
    expect(envelope?.turn).toBe(1);
    expect(envelope?.step).toBe(2);

    // THE NO-REWRITE JOIN: the queued bytes and the model-visible bytes are the
    // same bytes. A pre-step listener that rewrote the batch would break this,
    // and that break is the only record such a rewrite leaves.
    expect(steerRow!.payload_sha256).toBe(insert!.payload_sha256);

    const verdict = await verifyLedgerIntegrity(harness.dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
  });

  test("inject does not wake an idle driver; followup does", async () => {
    const harness = harnessFor({ scripts: [textStep("hello")] });

    const receipt = harness.driver.inject("Background context nobody asked for.");
    await harness.driver.whenIdle();

    // Nothing ran: an injected message is context for a step that happens, not a
    // reason for one to happen.
    expect(harness.events().filter((event) => event.event_type === "turn/start")).toHaveLength(0);
    expect(harness.driver.status).toBe("idle");

    harness.driver.followup("Now do something.");
    await harness.driver.whenIdle();
    harness.finish();

    const events = harness.events();
    expect(events.filter((event) => event.event_type === "turn/start")).toHaveLength(1);
    // The injected message was still waiting, so the turn claimed it too.
    const injectRow = events.find((event) => event.id === receipt.eventId);
    const delivered = events.filter((event) => event.event_type === "user/message");
    expect(delivered.map((event) => event.payload_sha256)).toContain(injectRow!.payload_sha256);
  });

  test("a queued message survives a new driver over the same session", () => {
    const harness = harnessFor({ scripts: [textStep("hello")] });
    harness.driver.inject("Remember this.");

    // A second driver replays the queue from the signed rows rather than
    // starting empty — the property that makes the inbox durable rather than a
    // process's memory.
    const resumed = new AgentDriver({
      session: harness.session,
      llm: harness.llm,
      route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: {} },
      systemPromptEventId: harness.systemPromptEventId
    });
    expect(resumed.inbox.nextStep.map((message) => message.text)).toEqual(["Remember this."]);
  });

  // ── The pre-step veto ────────────────────────────────────────────────────

  test("a pre-step veto ends the turn blocked, with no step and a named vetoer", async () => {
    const harness = harnessFor({
      scripts: [textStep("never asked")],
      hooks: {
        preStep: async () => ({ kind: "reject", by: "test-guard" })
      }
    });

    harness.driver.followup("Do something risky.");
    await harness.driver.whenIdle();
    harness.finish();

    const events = harness.events();
    assertBalanced(events);

    // No model was called and no step was opened. If the veto were ignored, a
    // step/start (and a request/header) would be here.
    expect(events.filter((event) => event.event_type === "step/start")).toHaveLength(0);
    expect(events.filter((event) => event.event_type === "request/header")).toHaveLength(0);

    const ending = readTurnEndMeta(only(events, "turn/end").meta_json);
    expect(ending?.reason).toBe("blocked");

    // The claim was durable before the waterfall ran, so the veto BURNED the
    // message. That loss is recorded rather than hidden.
    const veto = only(events, "loop/veto");
    const vetoMeta = metaOf(veto);
    expect(vetoMeta.by).toBe("test-guard");
    expect(vetoMeta.turn).toBe(1);
    expect(vetoMeta.step).toBe(1);
    expect((vetoMeta.claimedMessageIds as string[]).length).toBe(1);
    // The veto consumed the message, so nothing was ever shown to the model.
    expect(events.filter((event) => event.event_type === "user/message")).toHaveLength(0);

    const verdict = await verifyLedgerIntegrity(harness.dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
  });

  // ── The loop's own bounds ────────────────────────────────────────────────

  test("the per-turn step cap stops a tool-looping model and says so", async () => {
    const tools = new StubToolSeam({ spin: async () => ok("again") });
    const harness = harnessFor({
      // Without the cap this run would take a second step and end "complete".
      // dsh has no such cap at all, which is why the rule needs its own test.
      scripts: [toolStep("call-1", "spin", "{}"), textStep("finally done")],
      tools,
      config: { maxStepsPerTurn: 1 }
    });

    harness.driver.followup("Keep going.");
    await harness.driver.whenIdle();
    harness.finish();

    const events = harness.events();
    assertBalanced(events);
    expect(events.filter((event) => event.event_type === "step/start")).toHaveLength(1);
    expect(readTurnEndMeta(only(events, "turn/end").meta_json)?.reason).toBe("max_steps");

    const verdict = await verifyLedgerIntegrity(harness.dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
  });

  test("max_tokens is sticky: a later clean step does not erase the truncation", async () => {
    let steered = false;
    const harness = harnessFor({
      scripts: [maxTokensStep("this answer was cut off"), textStep("a complete second answer")],
      hooks: {
        // A listener that objects to the turn stopping says so by steering, which
        // is what produces the second step this test needs.
        turnStopping: async () => {
          if (steered) return;
          steered = true;
          harness.driver.steer("Carry on.");
        }
      }
    });

    harness.driver.followup("Write something long.");
    await harness.driver.whenIdle();
    harness.finish();

    const events = harness.events();
    assertBalanced(events);
    expect(events.filter((event) => event.event_type === "step/start")).toHaveLength(2);
    // The SECOND step finished cleanly. If stickiness were dropped, the turn
    // would end "complete" and the log would no longer say that output was
    // truncated anywhere in it.
    expect(readTurnEndMeta(only(events, "turn/end").meta_json)?.reason).toBe("max_tokens");
  });

  // ── Token accounting ─────────────────────────────────────────────────────

  test("unreported cache counts are recorded as null, never as a fabricated zero", async () => {
    const harness = harnessFor({
      scripts: [
        textStep("no cache figures", { inputTokens: 120, outputTokens: 17 }),
        textStep("with a cache read", { inputTokens: 8, outputTokens: 3, cacheReadTokens: 40 })
      ],
      tools: new StubToolSeam({ noop: async () => ok("done") })
    });

    harness.driver.followup("First.");
    await harness.driver.whenIdle();
    harness.driver.followup("Second.");
    await harness.driver.whenIdle();
    harness.finish();

    const stepEnds = harness.events().filter((event) => event.event_type === "step/end");
    expect(stepEnds).toHaveLength(2);

    const first = metaOf(stepEnds[0]!).usage as Record<string, unknown>;
    expect(first.inputTokens).toBe(120);
    expect(first.outputTokens).toBe(17);
    // NOT 0. The provider reported nothing, and "nothing" is not "zero" — a
    // fabricated zero would enter every cost projection that reads this row.
    expect(first.cacheRead).toBeNull();
    expect(first.cacheWrite).toBeNull();

    const second = metaOf(stepEnds[1]!).usage as Record<string, unknown>;
    expect(second.cacheRead).toBe(40);
    expect(second.cacheWrite).toBeNull();
  });

  // ── Cancellation ─────────────────────────────────────────────────────────

  test("a call the loop never dispatched is answered CANCELLED, not left dangling", async () => {
    const tools = new StubToolSeam({
      first: async () => {
        // Cancelling from inside the first tool means the second call — which the
        // pool has not started, because maxParallelToolCalls is 1 — never runs.
        harness.driver.cancel({ kind: "user" });
        return ok("done");
      },
      second: async () => ok("must not run")
    });
    const harness = harnessFor({
      scripts: [
        toolStepMulti([
          { id: "call-1", name: "first", args: "{}" },
          { id: "call-2", name: "second", args: "{}" }
        ]),
        textStep("unreachable")
      ],
      tools,
      config: { maxParallelToolCalls: 1 }
    });

    harness.driver.followup("Run both.");
    await harness.driver.whenIdle();
    harness.finish();

    const events = harness.events();
    assertBalanced(events);
    expect(tools.calls.map((request) => request.toolName)).toEqual(["first"]);

    // P3.1 wrote a `tool/call` row for BOTH calls when the stream settled, so
    // both must be answered — an unanswered tool_use part cannot be sent back to
    // a provider, which would make the session unresumable.
    const results = events
      .filter((event) => event.event_type === "tool/result")
      .map((event) => metaOf(event));
    expect(results.map((meta) => meta.toolCallId)).toEqual(["call-1", "call-2"]);
    expect(results[0]!.outcome).toBe("OK");
    // CANCELLED means "never attempted": no side effect happened, and that is a
    // different fact from "we do not know", which is what UNKNOWN means.
    expect(results[1]!.outcome).toBe("CANCELLED");

    const verdict = await verifyLedgerIntegrity(harness.dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
  });

  test("a tool seam that itself throws leaves TOOL_OUTCOME_UNKNOWN, not a missing result", async () => {
    const tools = new StubToolSeam({
      broken: async () => {
        // The SEAM failing is not the TOOL failing: a tool that fails returns an
        // ERROR outcome, so reaching here means the pipeline broke and nothing
        // about this call's side effect is known.
        throw new Error("tool pipeline exploded");
      }
    });
    const harness = harnessFor({
      scripts: [toolStep("call-1", "broken", "{}"), textStep("unreachable")],
      tools
    });

    harness.driver.followup("Run it.");
    await harness.driver.whenIdle();
    harness.finish();

    const events = harness.events();
    assertBalanced(events);

    const result = only(events, "tool/result");
    expect(metaOf(result).toolCallId).toBe("call-1");
    expect(metaOf(result).outcome).toBe("TOOL_OUTCOME_UNKNOWN");

    const ending = readTurnEndMeta(only(events, "turn/end").meta_json);
    expect(ending?.reason).toBe("error");

    const verdict = await verifyLedgerIntegrity(harness.dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
  });

  test("a cancel closes the turn as cancelled with its cause, and leaves nothing dangling", async () => {
    const tools = new StubToolSeam({
      slow: async (request) =>
        new Promise((resolve) => {
          request.signal.addEventListener("abort", () => {
            resolve({
              outcome: "CANCELLED",
              content: "stopped",
              exitCode: null,
              timedOut: false,
              denied: false
            });
          });
          harness.driver.cancel({ kind: "hook", reason: "policy-stop" }, { by: "test" });
        })
    });
    const harness = harnessFor({
      scripts: [toolStep("call-1", "slow", "{}"), textStep("unreachable")],
      tools
    });

    harness.driver.followup("Start something long.");
    await harness.driver.whenIdle();
    harness.finish();

    const events = harness.events();
    assertBalanced(events);

    const ending = readTurnEndMeta(only(events, "turn/end").meta_json);
    // A LIVE CANCEL, with a cause, and explicitly NOT the crash vocabulary.
    expect(ending?.reason).toBe("cancelled");
    expect(ending?.interrupted).toBe(false);
    expect(ending?.cancelCause).toEqual({ kind: "hook", reason: "policy-stop" });
    expect(extractEnvelope(only(events, "turn/end").meta_json)?.synthetic).toBe(false);

    // The request was recorded before anything unwound, and names the same cause.
    const cancelRow = only(events, "loop/cancel");
    expect(metaOf(cancelRow).cause).toEqual({ kind: "hook", reason: "policy-stop" });
    expect(metaOf(cancelRow).requestedBy).toBe("test");
    const order = events.map((event) => event.id);
    expect(order.indexOf(cancelRow.id)).toBeLessThan(order.indexOf(only(events, "turn/end").id));

    // No dangling call: a tool_use part with no result cannot be sent back to a
    // provider, so a cancelled session would otherwise be unresumable.
    const callIds = events
      .filter((event) => event.event_type === "tool/call")
      .map((event) => metaOf(event).toolCallId);
    const resultIds = events
      .filter((event) => event.event_type === "tool/result")
      .map((event) => metaOf(event).toolCallId);
    expect(resultIds).toEqual(callIds);

    // The turn is sealed, so the interruption itself is inside a Merkle window.
    expect(typesOf(events)).toContain("turn/seal");

    const verdict = await verifyLedgerIntegrity(harness.dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
  });
});
