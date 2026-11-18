import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalArguments, describeTurnStop, firstStop, projectTurnStops, TurnGuards, TURN_GUARD_DEFAULTS, turnPolicies } from "../src/agent/turnGuards.js";
import { describeRunLimit, parseRunLimits, RunLimitTracker } from "../src/agent/runLimits.js";
import { isTurnCancelCause } from "../src/session/sessionTypes.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { canonicalTurnCancelCause, readTurnEndMeta } from "../src/session/turnLifecycleMeta.js";
import type { ToolCallOutcome } from "../src/agent/toolSeam.js";
import type { ActionClass, EvidenceEvent } from "../src/types.js";
import type { StreamChunk } from "../src/llm/streamChunk.js";
import { loopHarness, ok, StubToolSeam, textStep, toolStep, toolStepMulti, type LoopHarness } from "./helpers/agentLoopHarness.js";

const denied = (content = "[amc] policy denied: no"): ToolCallOutcome => ({ outcome: "DENIED", content, exitCode: null, timedOut: false, denied: true });

/** A stub seam that names action classes, as the pipeline seam does. */
class ClassedSeam extends StubToolSeam {
  constructor(handlers: ConstructorParameters<typeof StubToolSeam>[0], private readonly classes: Readonly<Record<string, ActionClass>>) { super(handlers); }
  actionClassOf(name: string): ActionClass | null { return this.classes[name] ?? null; }
}

const harnesses: LoopHarness[] = [];
afterEach(() => {
  for (const harness of harnesses.splice(0)) {
    try { harness.finish(); } catch { /* already closed */ }
    rmSync(harness.dir, { recursive: true, force: true });
  }
});
function harnessFor(options: Parameters<typeof loopHarness>[0]): LoopHarness {
  const harness = loopHarness(options);
  harnesses.push(harness);
  return harness;
}
const rows = (events: readonly EvidenceEvent[], type: string) => events.filter(event => event.event_type === type);
const meta = (event: EvidenceEvent) => JSON.parse(event.meta_json) as Record<string, unknown>;
const lastEnd = (events: readonly EvidenceEvent[]) => readTurnEndMeta(rows(events, "turn/end").at(-1)!.meta_json);
const results = (events: readonly EvidenceEvent[]) => rows(events, "tool/result").map(event => meta(event));
/** Mark tool calls (all, or the one named) as names the request never offered, as the provider binding does. */
const unoffered = (chunks: StreamChunk[], only?: string): StreamChunk[] => chunks.map(chunk =>
  chunk.type === "tool-call-delta" && (only === undefined || chunk.name === only) ? { ...chunk, unoffered: true as const }
    : chunk.type === "block-end" && chunk.block.kind === "tool_use" && (only === undefined || chunk.block.name === only) ? { ...chunk, block: { ...chunk.block, unoffered: true as const } } : chunk);

describe("TurnGuards (unit)", () => {
  it("reads arguments in canonical form and refuses what is not a JSON object", () => {
    expect(canonicalArguments('{"b":1,"a":{"d":2,"c":3}}')).toBe(canonicalArguments('{"a":{"c":3,"d":2},"b":1}'));
    expect(canonicalArguments("")).toBe("{}");
    expect(canonicalArguments("[1]")).toBeNull();
    expect(canonicalArguments("not json")).toBeNull();
  });

  it("refuses the third identical call in a row and stops at the fifth", () => {
    const guards = new TurnGuards();
    const call = { name: "read", arguments: '{"path":"a"}' };
    expect(guards.beforeCall(call)).toBeNull();
    expect(guards.beforeCall({ ...call, arguments: '{ "path" : "a" }' })).toBeNull();
    expect(guards.beforeCall(call)?.content).toMatch(/3 times in a row, so it was not run/);
    expect(guards.beforeCall(call)?.denied).toBe(true);
    expect(guards.trip).toBeNull();
    guards.beforeCall(call);
    expect(guards.trip).toEqual({ kind: "limit", condition: "repeated-call", bound: 5, tools: ["read"] });
    guards.reset();
    expect(guards.trip).toBeNull();
    expect(guards.lastTrip?.condition).toBe("repeated-call");
    expect(guards.beforeCall(call)).toBeNull();
  });

  it("a different call in between, or a successful write, clears the streak; an unknown class does not", () => {
    const guards = new TurnGuards();
    const read = { name: "read", arguments: "{}" };
    guards.beforeCall(read); guards.beforeCall(read);
    guards.beforeCall({ name: "write", arguments: "{}" });
    guards.afterCall("write", ok("done"), "WRITE_LOW");
    expect(guards.beforeCall(read)).toBeNull();
    expect(guards.beforeCall(read)).toBeNull();
    guards.afterCall("read", ok("x"), null);
    expect(guards.beforeCall(read)).not.toBeNull();
    // A failed write is not a change of state.
    const again = new TurnGuards();
    const write = { name: "write", arguments: '{"x":1}' };
    for (let i = 0; i < 2; i++) { again.beforeCall(write); again.afterCall("write", { ...ok("no"), outcome: "ERROR" }, "WRITE_LOW"); }
    expect(again.beforeCall(write)).not.toBeNull();
  });

  it("counts denials per turn, names the tools sorted, and leaves its own refusals out", () => {
    const guards = new TurnGuards({ denials: 2 });
    guards.afterCall("zeta", denied(), "WRITE_HIGH");
    expect(guards.trip).toBeNull();
    guards.afterCall("alpha", denied(), "WRITE_HIGH");
    expect(guards.trip).toEqual({ kind: "limit", condition: "denials", bound: 2, tools: ["alpha", "zeta"] });
  });

  it("ends the turn after the third malformed step in a row; a clean step resets", () => {
    const guards = new TurnGuards();
    const bad = { name: "read", arguments: "{oops" };
    guards.beforeCall(bad); guards.endStep();
    guards.beforeCall({ name: "nope", arguments: "{}", unoffered: true }); guards.endStep();
    guards.beforeCall({ name: "read", arguments: "{}" }); guards.endStep();
    guards.beforeCall(bad); guards.endStep();
    guards.beforeCall(bad); guards.endStep();
    expect(guards.trip).toBeNull();
    guards.beforeCall(bad); guards.endStep();
    expect(guards.trip).toEqual({ kind: "limit", condition: "malformed-responses", bound: 3 });
  });

  it("policies run in order and the first stop wins", () => {
    const guards = new TurnGuards({ malformedResponses: 1 });
    guards.beforeCall({ name: "x", arguments: "[]" }); guards.endStep();
    const tracker = new RunLimitTracker({ maxTotalTokens: 1 });
    expect(firstStop(turnPolicies(null, guards, () => { throw new Error("cost must not be read"); }))).toMatchObject({ scope: "turn", cause: { condition: "malformed-responses" } });
    tracker.recordUsage({ inputTokens: 5, outputTokens: 5, cacheRead: null, cacheWrite: null, reasoningTokens: null });
    expect(firstStop(turnPolicies(tracker, guards, () => { throw new Error("cost must not be read"); }))).toMatchObject({ scope: "run", cause: { condition: "max-tokens" } });
  });
});

describe("run limits: cost and stricter-only guard forms", () => {
  it("parses max-cost-usd and the guard forms, and refuses a looser guard", () => {
    expect(parseRunLimits(["max-cost-usd:0.50", "repeated-calls:3", "malformed-responses:1", "denials:2"])).toMatchObject({ ok: true,
      limits: { maxCostUsd: 0.5, repeatedCalls: 3, malformedResponses: 1, denials: 2 } });
    for (const loose of ["repeated-calls:6", "repeated-calls:1", "malformed-responses:4", "denials:6", "max-cost-usd:0", "max-cost-usd:-1", "max-cost-usd:1e3", "max-cost-usd:0.1234567"]) {
      expect(parseRunLimits([loose]).ok, loose).toBe(false);
    }
    expect(parseRunLimits(["repeated-calls:9"])).toMatchObject({ reason: expect.stringMatching(/only be made stricter than the default of 5/) });
    expect(parseRunLimits(["denials:2", "denials:3"])).toMatchObject({ ok: false, reason: "duplicate denials stop condition" });
    expect(TURN_GUARD_DEFAULTS).toMatchObject({ repeatedCalls: 5, malformedResponses: 3, denials: 5 });
  });

  it("the cost limit fails closed on any request without a known cost and stops past the bound", () => {
    const view = (status: "complete" | "partial" | "unavailable" | "invalid", attributedSubtotalUsd: number | null, unknownRequests = 0) =>
      () => ({ status, attributedSubtotalUsd, partialRequests: 0, unknownRequests });
    expect(new RunLimitTracker({}).recordCost(() => { throw new Error("not read without a limit"); })).toBeNull();
    expect(new RunLimitTracker({ maxCostUsd: 1 }).recordCost(view("complete", 0.4))).toBeNull();
    expect(new RunLimitTracker({ maxCostUsd: 1 }).recordCost(view("unavailable", null))).toBeNull();
    expect(new RunLimitTracker({ maxCostUsd: 1 }).recordCost(view("complete", 1.01))).toEqual({ kind: "limit", condition: "max-cost-usd", bound: 1 });
    for (const status of ["partial", "invalid"] as const) {
      expect(new RunLimitTracker({ maxCostUsd: 1 }).recordCost(view(status, 0.1))).toEqual({ kind: "limit", condition: "max-cost-usd", bound: 1, unmeasured: true });
    }
    expect(new RunLimitTracker({ maxCostUsd: 1 }).recordCost(view("unavailable", null, 1))?.unmeasured).toBe(true);
    expect(describeRunLimit({ kind: "limit", condition: "max-cost-usd", bound: 0.5, unmeasured: true })).toMatch(/no known cost/);
  });

  it("a guard cause is a valid, canonical signed cause; a malformed one is refused", () => {
    expect(isTurnCancelCause({ kind: "limit", condition: "denials", bound: 5, tools: ["b", "a"] })).toBe(true);
    expect(isTurnCancelCause({ kind: "limit", condition: "max-cost-usd", bound: 0.25 })).toBe(true);
    expect(isTurnCancelCause({ kind: "limit", condition: "max-tokens", bound: 0.25 })).toBe(false);
    expect(isTurnCancelCause({ kind: "limit", condition: "denials", bound: 5, tools: [] })).toBe(false);
    expect(isTurnCancelCause({ kind: "limit", condition: "stuck", bound: 5 })).toBe(false);
    expect(canonicalTurnCancelCause({ kind: "limit", condition: "denials", bound: 5, tools: ["b", "a", "b"] })).toEqual({ kind: "limit", condition: "denials", bound: 5, tools: ["a", "b"] });
  });

  it("says each stop in plain words", () => {
    expect(describeTurnStop({ condition: "repeated-call", bound: 5, tools: ["read_file"] })).toBe('The agent made the same tool call 5 times in a row ("read_file"), so AMC ended the turn.');
    expect(describeTurnStop({ condition: "denials", bound: 5, tools: ["bash"] })).toMatch(/refused in one turn \("bash"\).*Nothing refused was run/);
    expect(describeTurnStop({ condition: "max-cost-usd", bound: 2, unmeasured: true })).toMatch(/no known cost/);
    for (const condition of ["malformed-responses", "max-cost-usd", "max-tokens", "max-turns", "deadline", "unknown"]) expect(describeTurnStop({ condition, bound: 1 })).toMatch(/stopped|ended/);
  });
});

describe("turn guards in the driver", () => {
  it("does not run the third identical call, ends the turn at the fifth, and signs the stop", async () => {
    const tools = new StubToolSeam({ spin: async () => ok("same") });
    const args = ['{"a":1,"b":2}', '{"b":2,"a":1}', '{"a":1,"b":2}', '{"a":1,"b":2}', '{"a":1,"b":2}'];
    const harness = harnessFor({ scripts: [...args.map((value, i) => toolStep(`c${i}`, "spin", value)), textStep("never")], tools });
    harness.driver.followup("Go.");
    await harness.driver.whenIdle();
    const events = harness.events();
    expect(tools.calls).toHaveLength(2);
    const answered = results(events);
    expect(answered).toHaveLength(5);
    expect(answered.slice(2).every(row => row.denied === true)).toBe(true);
    const end = lastEnd(events);
    expect(end?.reason).toBe("cancelled");
    expect(end?.cancelCause).toEqual({ kind: "limit", condition: "repeated-call", bound: 5, tools: ["spin"] });
    const cancel = meta(rows(events, "loop/cancel").at(-1)!);
    expect(cancel).toMatchObject({ requestedBy: "turn-guard", keepInbox: true, cause: { condition: "repeated-call" } });
    expect(harness.driver.turnGuardEnding).toMatchObject({ condition: "repeated-call" });
    expect(harness.driver.runLimitEnding).toBeNull();
    expect(projectTurnStops(events, harness.sessionId)).toEqual([expect.objectContaining({ turn: 1, condition: "repeated-call",
      text: 'The agent made the same tool call 5 times in a row ("spin"), so AMC ended the turn.' })]);
    harness.finish();
    const verdict = await verifyLedgerIntegrity(harness.dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
  });

  it("a guard stop ends only the turn: the next turn starts fresh and runs the same call", async () => {
    const tools = new StubToolSeam({ spin: async () => ok("same") });
    const harness = harnessFor({ scripts: [toolStep("a", "spin", "{}"), toolStep("b", "spin", "{}"), textStep("next turn"), toolStep("c", "spin", "{}"), textStep("done")],
      tools, runLimits: { limits: { repeatedCalls: 2 } } });
    harness.driver.followup("one");
    await harness.driver.whenIdle();
    expect(lastEnd(harness.events())?.cancelCause).toMatchObject({ condition: "repeated-call", bound: 2 });
    harness.driver.followup("two");
    await harness.driver.whenIdle();
    harness.driver.followup("three");
    await harness.driver.whenIdle();
    expect(lastEnd(harness.events())?.reason).toBe("complete");
    expect(tools.calls).toHaveLength(2);
  });

  it("identical successful writes are not repeats", async () => {
    const tools = new ClassedSeam({ write: async () => ok("written") }, { write: "WRITE_LOW" });
    const harness = harnessFor({ scripts: [...[0, 1, 2, 3, 4, 5].map(i => toolStep(`w${i}`, "write", '{"x":1}')), textStep("done")], tools });
    harness.driver.followup("Go.");
    await harness.driver.whenIdle();
    expect(tools.calls).toHaveLength(6);
    expect(lastEnd(harness.events())?.reason).toBe("complete");
  });

  it("ends the turn after three malformed responses in a row", async () => {
    // Unoffered names here: a call with unparseable arguments already fails the next request on this route's encoder.
    const tools = new StubToolSeam({ read: async () => ok("x") });
    const harness = harnessFor({ scripts: [unoffered(toolStep("a", "ghost", "{}")), unoffered(toolStepMulti([{ id: "b", name: "read", args: "{}" }, { id: "b2", name: "phantom", args: "{}" }]), "phantom"),
      unoffered(toolStep("c", "ghost", '{"n":1}')), textStep("never")], tools });
    harness.driver.followup("Go.");
    await harness.driver.whenIdle();
    expect(tools.calls.map(call => call.toolName)).toEqual(["read"]);
    expect(lastEnd(harness.events())?.cancelCause).toEqual({ kind: "limit", condition: "malformed-responses", bound: 3 });
  });

  it("ends the turn after five refusals and names the refused tools; it approves nothing", async () => {
    const tools = new StubToolSeam({ deploy: async () => denied(), publish: async () => denied() });
    const scripts = [0, 1, 2, 3, 4].map(i => toolStep(`d${i}`, i % 2 === 0 ? "deploy" : "publish", `{"n":${i}}`));
    const harness = harnessFor({ scripts: [...scripts, textStep("never")], tools });
    harness.driver.followup("Go.");
    await harness.driver.whenIdle();
    const events = harness.events();
    expect(results(events).every(row => row.denied === true)).toBe(true);
    expect(lastEnd(events)?.cancelCause).toEqual({ kind: "limit", condition: "denials", bound: 5, tools: ["deploy", "publish"] });
  });

  it("a cost limit on a route with no price stops the run after the first step, as unmeasured", async () => {
    const tools = new StubToolSeam({ read: async () => ok("x") });
    const harness = harnessFor({ scripts: [toolStep("a", "read", "{}"), textStep("never")], tools, runLimits: { limits: { maxCostUsd: 5 } } });
    harness.driver.followup("Go.");
    await harness.driver.whenIdle();
    expect(lastEnd(harness.events())?.cancelCause).toEqual({ kind: "limit", condition: "max-cost-usd", bound: 5, unmeasured: true });
    expect(harness.driver.runLimitEnding).toMatchObject({ condition: "max-cost-usd" });
    expect(() => harness.driver.followup("more")).toThrow(/run limit reached/);
  });
});
