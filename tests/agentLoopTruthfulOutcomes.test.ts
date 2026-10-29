import { rmSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { readStepBoundary, readTurnEndMeta } from "../src/session/turnLifecycleMeta.js";
import type { LoopNotification } from "../src/agent/loopTypes.js";
import { LoopInbox } from "../src/agent/inbox.js";
import type { StreamChunk } from "../src/llm/streamChunk.js";
import type { EvidenceEvent } from "../src/types.js";
import type { HttpRequest } from "../src/llm/adapter/transport.js";
import { loopHarness, ok, silentTransport, StubToolSeam, textStep, toolStep, toolStepMulti, type LoopHarness } from "./helpers/agentLoopHarness.js";

/**
 * WP33: the loop reports what happened. An observer that throws cannot unbalance a step, skip a seal or lose a wake
 * (DXA-16); a tool call cut off at max_tokens is told to the model rather than vanishing (PXA-01); and one concluding
 * tool cannot end the turn over a sibling's result (PXA-23).
 */
describe("WP33 — truthful loop outcomes", () => {
  const open: LoopHarness[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const harness of open.splice(0)) {
      try { harness.finish(); } catch { /* already closed */ }
      rmSync(harness.dir, { recursive: true, force: true });
    }
  });
  const harnessFor = (options: Parameters<typeof loopHarness>[0]): LoopHarness => {
    const harness = loopHarness(options);
    open.push(harness);
    return harness;
  };
  const types = (events: readonly EvidenceEvent[]): string[] => events.map((event) => event.event_type);
  const steps = (events: readonly EvidenceEvent[], type: string): string[] => events.filter((event) => event.event_type === type)
    .map((event) => { const boundary = readStepBoundary(event.meta_json); return `${boundary?.turn}.${boundary?.step}`; });
  const throwingOn = (kind: LoopNotification["kind"]) => (notification: LoopNotification): void => {
    if (notification.kind === kind) throw new Error(`observer broke on ${kind}`);
  };

  test.each(["step-start", "step-end", "turn-end"] as const)("a notify that throws on %s leaves balanced, sealed turns (DXA-16)", async (kind) => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const harness = harnessFor({ scripts: [textStep("one"), textStep("two")], hooks: { notify: throwingOn(kind) } });
    harness.driver.followup("first");
    await harness.driver.whenIdle();
    // The seal released the turn slot, so a second turn runs.
    harness.driver.followup("second");
    await harness.driver.whenIdle();
    expect(harness.driver.status).toBe("idle");
    harness.finish();

    const events = harness.events();
    expect(steps(events, "step/end")).toEqual(steps(events, "step/start"));
    expect(steps(events, "step/start")).toEqual(["1.1", "2.1"]);
    const order = types(events);
    expect(order.filter((type) => type === "turn/seal")).toHaveLength(2);
    expect(order.filter((type) => type === "turn/end")).toHaveLength(2);
    const verdict = await verifyLedgerIntegrity(harness.dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
  });

  test("a notify that throws on an inbox insert still wakes the driver (DXA-16)", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const harness = harnessFor({ scripts: [textStep("hello")], hooks: { notify: throwingOn("inbox") } });
    expect(() => harness.driver.followup("wake up")).not.toThrow();
    await harness.driver.whenIdle();
    harness.finish();
    expect(types(harness.events()).filter((type) => type === "turn/start")).toHaveLength(1);
  });

  test("a LoopInbox whose own observer throws still queues the message durably (DXA-16)", () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const harness = harnessFor({ scripts: [textStep("unused")] });
    const inbox = new LoopInbox(harness.session, throwingOn("inbox"));
    expect(() => inbox.insert("next-turn", "queued", "followup", { wake: false, demotedFrom: null })).not.toThrow();
    expect(new LoopInbox(harness.session, () => {}).nextTurn.map((message) => message.text)).toEqual(["queued"]);
  });

  test("a tool call cut off at max_tokens is told to the model through the signed inbox, not dropped silently (PXA-01)", async () => {
    const truncated: StreamChunk[] = toolStep("cut-1", "echo", "{\"path\":\"./a").map((chunk) =>
      chunk.type === "finish" ? { type: "finish", reason: { kind: "max_tokens" } } : chunk);
    const bodies: string[] = [];
    const tools = new StubToolSeam({ echo: async () => ok("never") });
    const harness = harnessFor({
      scripts: [truncated, textStep("I will reissue it shorter.")],
      tools,
      transport: async (request: HttpRequest) => { bodies.push(request.body.toString("utf8")); return silentTransport(request); }
    });
    harness.driver.followup("Read a.");
    await harness.driver.whenIdle();
    harness.finish();

    expect(tools.calls, "a truncated call is never executed").toHaveLength(0);
    const events = harness.events();
    expect(types(events)).not.toContain("tool/call");
    // The notice is a signed inbox row, then the next step's model request carries it.
    expect(steps(events, "step/start")).toEqual(["1.1", "1.2"]);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).not.toContain("cut off and NOT run");
    expect(bodies[1]).toContain("cut off and NOT run");
    expect(bodies[1]).toContain("\\\"echo\\\"");
    expect(readTurnEndMeta(events.find((event) => event.event_type === "turn/end")!.meta_json)?.reason).toBe("max_tokens");
    const verdict = await verifyLedgerIntegrity(harness.dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
  });

  test("one concluding call does not end the turn over an ordinary sibling (PXA-23)", async () => {
    const tools = new StubToolSeam({
      hand_back: async () => ok("handed back", { concludesTurn: true }),
      echo: async () => ok("a sibling result the model has not read")
    });
    const harness = harnessFor({
      scripts: [toolStepMulti([{ id: "c1", name: "hand_back", args: "{}" }, { id: "c2", name: "echo", args: "{}" }]), textStep("done")],
      tools
    });
    harness.driver.followup("go");
    await harness.driver.whenIdle();
    harness.finish();
    expect(steps(harness.events(), "step/start"), "the turn continues to read the sibling's result").toEqual(["1.1", "1.2"]);
  });

  test("a step whose every call concludes still ends the turn (PXA-23)", async () => {
    const tools = new StubToolSeam({ hand_back: async () => ok("handed back", { concludesTurn: true }) });
    const harness = harnessFor({ scripts: [toolStep("c1", "hand_back", "{}"), textStep("unreached")], tools });
    harness.driver.followup("go");
    await harness.driver.whenIdle();
    harness.finish();
    expect(steps(harness.events(), "step/start")).toEqual(["1.1"]);
  });
});
