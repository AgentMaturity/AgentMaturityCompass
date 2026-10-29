/** WP20 scripted transport tests; committed-history authentication is tested by the shared reader suites. */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { AMCNativeClient, AMCNativeInputError, AMCNativeProtocolError, AMCNativeRefusedError, type AMCNativeClientOptions } from "../src/sdk/nativeAgentClient.js";

const clients: AMCNativeClient[] = [], workspaces: string[] = [];
const digest = "a".repeat(64);
function state() {
  const metric = { observedTokens: null, reportedRequests: 0 };
  return { validation: { status: "not-requested", turn: null, configSha256: null, checks: [] },
    usage: { scope: "recorded-session", status: "unavailable", requests: 0, syntheticRequests: 0,
      reportedRequests: 0, completeRequests: 0, unreportedRequests: 0, pendingRequests: 0, issueCount: 0,
      totals: { inputTokens: metric, outputTokens: metric, cacheReadTokens: metric, cacheWriteTokens: metric, reasoningTokens: metric },
      cache: { basis: "reported-input-token-subtotal", readShare: null, readTokens: null, inputTokens: null,
        eligibleRequests: 0, excludedRequests: 0, unreportedWriteRequests: 0 } },
    turn: { number: null, lastEnd: null, lastSeal: null, cancellationRequested: false },
    approvals: { pending: 0, answered: 0, denied: 0, unavailable: 0 }, toolOutcomes: { unknown: 0, unavailable: 0 } };
}
const verification = { metadata: "hashes-signatures-global-and-session-chains", checkedStoreEventCount: 100,
  payloads: "verified", retainedOutput: "not-read", completeness: "all-available-events-in-requested-scope", rollbackProtection: "no-external-head",
  trustRoot: { anchored: false, monitorFingerprint: digest, expectedFingerprint: null } };
const seal = { turn: 1, seq: 51, eventId: "seal-1", eventHash: digest };
function completedState() {
  return { ...state(), turn: { number: 1, lastEnd: { turn: 1, reason: "complete", interrupted: false, cancelCause: null }, lastSeal: seal, cancellationRequested: false } };
}
function page(changes: Record<string, unknown> = {}) {
  return { format: "amc-session-event-page-v1", sessionId: "fixture-session", agentId: "default", committed: true,
    backend: "sqlite", headEventHash: digest, headSeq: 2, storeHeadEventHash: digest, firstSeq: 0, nextSeq: 3,
    nextCursor: null, resumeCursor: "follow-cursor", sealed: false, verification, state: state(),
    updates: [{ seq: 1, eventId: "event-1", eventHash: digest,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "committed answer" } } }], ...changes };
}
async function client(pages: unknown[] = [page()], disabled = false, extraEnv: NodeJS.ProcessEnv = {}, options: Partial<AMCNativeClientOptions> = {}) {
  const workspace = mkdtempSync(join(tmpdir(), "wp20-sdk-page-")); workspaces.push(workspace);
  const instance = await AMCNativeClient.start({ workspace, provider: "stub", timeoutMs: 5000,
    command: [process.execPath, resolve("tests/fixtures/wp20SdkPeer.mjs")],
    env: { ...extraEnv, AMC_WP20_PAGES: JSON.stringify(pages), ...(disabled ? { AMC_WP20_NO_PAGES: "1" } : {}) }, ...options });
  clients.push(instance); return instance;
}
afterEach(async () => {
  for (const instance of clients.splice(0)) await instance.close();
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true });
});

describe("WP20 bounded committed SDK pages", () => {
  test("reads without opening or resuming a writer and retains a detached frozen page", async () => {
    const instance = await client();
    const result = await instance.readSessionPage("fixture-session", { limit: 8 });
    expect(result.committed).toBe(true); expect(result.updates[0]?.update.content).toEqual({ type: "text", text: "committed answer" });
    expect(result.resumeCursor).toBe("follow-cursor"); expect(Object.isFrozen(result.updates[0]?.update.content)).toBe(true);
    expect(instance.state).toBe("open");
  });
  test("drains stable snapshots then resumes from the explicit follow cursor without duplicate rows", async () => {
    const instance = await client([page({ headSeq: 3, nextSeq: 2, nextCursor: "next-page" }),
      page({ headSeq: 3, firstSeq: 2, nextSeq: 4, updates: [{ seq: 3, eventId: "event-3", eventHash: digest,
        update: { sessionUpdate: "tool_call_update", toolCallId: "call-1", status: "failed" } }] }),
      page({ firstSeq: 4, headSeq: 4, nextSeq: 5, updates: [], resumeCursor: "new-follow-cursor" })]);
    const seen: number[] = []; let resume = "";
    for await (const result of instance.readSessionPages("fixture-session", { limit: 2 })) {
      seen.push(...result.updates.map(update => update.seq)); resume = result.resumeCursor;
    }
    expect(seen).toEqual([1, 3]); expect(resume).toBe("follow-cursor");
    expect((await instance.readSessionPage("fixture-session", { cursor: resume })).updates).toEqual([]);
  });
  test("refuses an unadvertised reader capability", async () => {
    const instance = await client([], true);
    await expect(instance.readSessionPage("fixture-session")).rejects.toBeInstanceOf(AMCNativeRefusedError);
  });
  test.each([0, -1, 257, 1.5, "8", null])("refuses page limit %j before transport", async limit => {
    const instance = await client();
    await expect(instance.readSessionPage("fixture-session", { limit: limit as number })).rejects.toBeInstanceOf(AMCNativeInputError);
  });
  test.each([
    { state: {} }, { verification: {} }, { state: { ...state(), approvals: { pending: -1, answered: 0, denied: 0, unavailable: 0 } } },
    { state: { ...state(), validation: { status: "success" } } },
    { sessionId: "another-session" }, { agentId: "another-owner" }, { committed: false }, { headEventHash: "bad" },
    { nextSeq: 4 }, { firstSeq: -1 }, { resumeCursor: "" }, { nextCursor: 3 },
    { updates: [{ seq: 3, eventId: "event-3", eventHash: digest, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "out of range" } } }] },
    { updates: [{ seq: 1, eventId: "event-1", eventHash: digest, update: { sessionUpdate: "provisional_text", content: { type: "text", text: "draft" } } }] }
  ])("rejects an inconsistent or provisional response: %j", async changes => {
    const instance = await client([page(changes)]);
    await expect(instance.readSessionPage("fixture-session")).rejects.toBeInstanceOf(AMCNativeProtocolError);
  });
  test("rejects a nonadvancing cursor", async () => {
    const instance = await client([page({ nextSeq: 2, nextCursor: "repeated-cursor" }),
      page({ firstSeq: 2, nextSeq: 2, updates: [], nextCursor: "repeated-cursor" })]);
    const iterator = instance.readSessionPages("fixture-session");
    await iterator.next();
    await expect(iterator.next()).rejects.toThrow("did not advance");
  });
  test("rejects a changed snapshot during iteration", async () => {
    const instance = await client([page({ nextSeq: 2, nextCursor: "next-page" }), page({ firstSeq: 2, updates: [], headEventHash: "b".repeat(64) })]);
    const iterator = instance.readSessionPages("fixture-session");
    await expect(iterator.next()).resolves.toMatchObject({ done: false });
    await expect(iterator.next()).rejects.toBeInstanceOf(AMCNativeProtocolError);
  });
});


describe("WP20 SDK plan updates", () => {
  test("retains model text as display data and preserves blocked source metadata", async () => {
    const plan = { sessionUpdate: "plan", entries: [{ content: "<script>model text</script>", priority: "medium", status: "pending" }],
      _meta: { "dev.agentmaturity.amc": { listKind: "todo", sourceStatuses: ["blocked"] } } };
    const instance = await client([], false, { AMC_WP20_LIVE_PLAN: JSON.stringify(plan) });
    const session = await instance.newSession(), turn = session.prompt("show plan");
    expect((await turn.result).updates[0]?.update).toEqual(plan);
  });
  test.each([
    { content: "prepare", priority: "medium", status: "invented" },
    { content: "prepare", priority: [], status: "pending" },
    { content: "x".repeat(8193), priority: "medium", status: "pending" }
  ])("rejects malformed live plans: %j", async entry => {
    const instance = await client([], false, { AMC_WP20_LIVE_PLAN: JSON.stringify({ sessionUpdate: "plan", entries: [entry] }) });
    const session = await instance.newSession();
    await expect(session.prompt("bad plan").result).rejects.toBeInstanceOf(AMCNativeProtocolError);
  });
});


describe("PXB-31 committed overflow recovery", () => {
  const updates = Array.from({ length: 50 }, (_, index) => ({ seq: index + 1, eventId: `event-${index + 1}`, eventHash: digest,
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: `part-${index};` } } }));
  const baseline = () => page({ headSeq: 0, nextSeq: 1, updates: [], resumeCursor: "before-turn" });
  const recovered = (changes: Record<string, unknown> = {}) => page({ firstSeq: 1, nextSeq: 52, headSeq: 51, updates, state: completedState(), ...changes });
  test("50 updates complete with a verified resync after the retained 8-update prefix", async () => {
    const instance = await client([baseline(), recovered()], false, { AMC_WP20_OVERFLOW: "50" },
      { resyncOnOverflow: true, eventBuffer: { maxEvents: 8 } });
    const session = await instance.newSession(), turn = session.prompt("many committed updates");
    const seen: unknown[] = [];
    let streamError: unknown;
    try { for await (const event of turn) seen.push(event); } catch (error) { streamError = error; }
    expect(streamError).toMatchObject({ name: "AMCNativeResyncRequiredError", recoverable: true });
    expect(seen).toHaveLength(8);
    const result = await turn.result;
    expect(result.text).toBe(updates.map(event => event.update.content.text).join(""));
    expect(result.updates).toHaveLength(8); expect(result.resynced).toBe(true);
    expect(result.recovery).toMatchObject({ updatesComplete: false, retainedUpdates: "bounded-prefix", cursor: "follow-cursor" });
    expect(instance.state).toBe("open");
  });
  test("a tampered recovery page refuses the result", async () => {
    const instance = await client([baseline(), recovered({ committed: false })], false, { AMC_WP20_OVERFLOW: "50" },
      { resyncOnOverflow: true, eventBuffer: { maxEvents: 8 } });
    const session = await instance.newSession();
    await expect(session.prompt("many updates").result).rejects.toBeInstanceOf(AMCNativeProtocolError);
  });
  test("recovered text respects the existing byte bound", async () => {
    const instance = await client([baseline(), recovered()], false, { AMC_WP20_OVERFLOW: "50" },
      { resyncOnOverflow: true, eventBuffer: { maxEvents: 8, maxBytes: 200 } });
    const session = await instance.newSession();
    await expect(session.prompt("many updates").result).rejects.toMatchObject({ resource: "turn-bytes", limit: 200 });
  });
});


describe("PXB-24/25 SDK submission controls", () => {
  test("forwards request identity without changing input format and withdraws one queued message", async () => {
    const instance = await client([], false, { AMC_WP20_REQUEST_IDS: "1" });
    const session = await instance.newSession();
    const result = await session.prompt("retry-safe input", { clientRequestId: "request-1" }).result;
    expect(result.meta).toEqual({ "dev.agentmaturity.amc": { clientRequestId: "request-1" } });
    await expect(session.withdraw("message-1")).resolves.toBe(true);
  });
  test("refuses request identity and withdrawal when the runtime does not advertise them", async () => {
    const instance = await client([], false, { AMC_WP20_NO_REQUEST_IDS: "1", AMC_WP20_REQUEST_IDS: "1" });
    const session = await instance.newSession();
    expect(() => session.prompt("must not send", { clientRequestId: "request-1" })).toThrow(AMCNativeRefusedError);
    await expect(session.withdraw("message-1")).rejects.toBeInstanceOf(AMCNativeRefusedError);
  });
  test.each(["", "has space", "line\nfeed", "x".repeat(129), "非ASCII"])("rejects malformed request ID %j before dispatch", async clientRequestId => {
    const instance = await client([], false, { AMC_WP20_REQUEST_IDS: "1" });
    const session = await instance.newSession();
    expect(() => session.prompt("must not send", { clientRequestId })).toThrow(AMCNativeInputError);
  });
});


describe("WP20 session page admission", () => {
  test.each(["", "\0", null])("rejects invalid session identity %j", async sessionId => {
    await expect((await client()).readSessionPage(sessionId as string)).rejects.toBeInstanceOf(AMCNativeInputError);
  });
  test.each(["", "x".repeat(2049)])("rejects invalid cursor length", async cursor => {
    await expect((await client()).readSessionPage("fixture-session", { cursor })).rejects.toBeInstanceOf(AMCNativeInputError);
  });
  test.each([
    { ...state(), usage: { ...state().usage, requests: -1 } },
    { ...state(), usage: { ...state().usage, totals: {} } },
    { ...state(), usage: { ...state().usage, cache: {} } },
    { ...state(), usage: { ...state().usage, requestCache: {} } },
    { ...state(), toolOutcomes: { unknown: -1, unavailable: 0 } },
    { ...state(), turn: { number: 1, lastEnd: { turn: 1, reason: "complete", interrupted: true, cancelCause: null }, cancellationRequested: false } },
    { ...state(), turn: { number: 1, lastEnd: { turn: 1, reason: "cancelled", interrupted: false, cancelCause: null }, cancellationRequested: false } }
  ])("refuses malformed cumulative state without inferring zero", async snapshot => {
    await expect((await client([page({ state: snapshot })])).readSessionPage("fixture-session")).rejects.toBeInstanceOf(AMCNativeProtocolError);
  });
  test.each([
    { firstSeq: 0, nextSeq: 257, headSeq: 256, updates: [] },
    { nextCursor: "extra-page-at-end" }, { nextCursor: null, nextSeq: 2 }
  ])("refuses inconsistent bounded ranges: %j", async changes => {
    await expect((await client([page(changes)])).readSessionPage("fixture-session")).rejects.toBeInstanceOf(AMCNativeProtocolError);
  });
});


test("SDK withdrawal refuses malformed response metadata", async () => {
  const session = await (await client([], false, { AMC_WP20_BAD_WITHDRAW: "1" })).newSession();
  await expect(session.withdraw("message-1")).rejects.toBeInstanceOf(AMCNativeProtocolError);
});

test.each(["", "has space", "x".repeat(129), "非ASCII"])("SDK withdrawal rejects malformed identity %j", async messageId => {
  const session = await (await client()).newSession();
  await expect(session.withdraw(messageId)).rejects.toBeInstanceOf(AMCNativeInputError);
});


test("overflow recovery requires an advertised committed reader", async () => {
  await expect(client([], true, {}, { resyncOnOverflow: true })).rejects.toBeInstanceOf(AMCNativeRefusedError);
});

test("overflow recovery options reject nonboolean values before spawning", async () => {
  await expect(client([], false, {}, { resyncOnOverflow: "true" as unknown as boolean })).rejects.toBeInstanceOf(AMCNativeInputError);
});


test("live plan updates require both peers to negotiate the plan contract", async () => {
  const plan = { sessionUpdate: "plan", entries: [{ content: "prepare", priority: "medium", status: "pending" }] };
  const instance = await client([], false, { AMC_WP20_NO_PLANS: "1", AMC_WP20_LIVE_PLAN: JSON.stringify(plan) });
  const session = await instance.newSession();
  await expect(session.prompt("unnegotiated plan").result).rejects.toBeInstanceOf(AMCNativeProtocolError);
});


const recoveryUpdates = Array.from({ length: 50 }, (_, index) => ({ seq: index + 1, eventId: `event-${index + 1}`, eventHash: digest,
  update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: `part-${index};` } } }));
const beforeTurn = () => page({ headSeq: 0, nextSeq: 1, updates: [], resumeCursor: "before-turn" });
const recoveredTurn = (changes: Record<string, unknown> = {}) => page({ firstSeq: 1, headSeq: 51, nextSeq: 52,
  updates: recoveryUpdates, state: completedState(), ...changes });
const recoveryOptions = { resyncOnOverflow: true, eventBuffer: { maxEvents: 8 } };
function requestRecords(path: string): { method: string }[] {
  try { return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as { method: string }); }
  catch { return []; }
}
async function waitForReads(path: string, count: number): Promise<void> {
  const until = Date.now() + 5000;
  while (requestRecords(path).filter(frame => frame.method === "_amc/session/events").length < count) {
    if (Date.now() >= until) throw new Error("scripted peer did not receive its page request");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

describe("PXB-31 sealed recovery admission", () => {
  test("requires the committed-turn capability before starting a client", async () => {
    await expect(client([], false, { AMC_WP20_NO_TURN_CAP: "1" }, recoveryOptions)).rejects.toBeInstanceOf(AMCNativeRefusedError);
  });
  test("rejects a valid unchanged baseline instead of completing with empty text", async () => {
    const instance = await client([beforeTurn(), page({ firstSeq: 1, headSeq: 0, nextSeq: 1, updates: [], state: state() })], false,
      { AMC_WP20_OVERFLOW: "50" }, recoveryOptions);
    await expect((await instance.newSession()).prompt("valid-prefix rollback").result).rejects.toBeInstanceOf(AMCNativeProtocolError);
  });
  test.each([
    { AMC_WP20_NO_TURN_REF: "1" }, { AMC_WP20_TURN_REF: "null" },
    { AMC_WP20_TURN_REF: JSON.stringify({ ...seal, seq: 0 }) }, { AMC_WP20_TURN_REF: JSON.stringify({ ...seal, eventHash: "bad" }) }
  ])("rejects a missing, prior or malformed reply seal: %j", async env => {
    const instance = await client([beforeTurn(), recoveredTurn()], false, { AMC_WP20_OVERFLOW: "50", ...env }, recoveryOptions);
    await expect((await instance.newSession()).prompt("reply seal required").result).rejects.toBeInstanceOf(AMCNativeProtocolError);
  });
  test.each([
    { ...completedState(), turn: { ...completedState().turn, lastSeal: null } },
    { ...completedState(), turn: { ...completedState().turn, lastSeal: { ...seal, eventId: "another-seal" } } },
    { ...completedState(), turn: { ...completedState().turn, lastEnd: { ...completedState().turn.lastEnd, turn: 2 } } }
  ])("rejects a snapshot without this prompt's exact completed seal", async snapshot => {
    const instance = await client([beforeTurn(), recoveredTurn({ state: snapshot })], false, { AMC_WP20_OVERFLOW: "50" }, recoveryOptions);
    await expect((await instance.newSession()).prompt("exact current seal").result).rejects.toBeInstanceOf(AMCNativeProtocolError);
  });
  test("rejects recovered text that differs from the retained committed prefix", async () => {
    const updates = recoveryUpdates.map(event => ({ ...event, update: { ...event.update, content: { type: "text", text: "different" } } }));
    const instance = await client([beforeTurn(), recoveredTurn({ updates })], false, { AMC_WP20_OVERFLOW: "50" }, recoveryOptions);
    await expect((await instance.newSession()).prompt("matching text required").result).rejects.toBeInstanceOf(AMCNativeProtocolError);
  });
});

describe("PXB-31 read-loop cancellation and total deadline", () => {
  test("preflight stops at the total deadline without dispatching a prompt", async () => {
    const capture = join(mkdtempSync(join(tmpdir(), "wp20-deadline-")), "requests.jsonl"); workspaces.push(resolve(capture, ".."));
    const pages = [page({ headSeq: 2, nextSeq: 1, nextCursor: "p1", updates: [] }),
      page({ headSeq: 2, firstSeq: 1, nextSeq: 2, nextCursor: "p2", updates: [] }), page({ firstSeq: 2, updates: [] })];
    const instance = await client(pages, false, { AMC_WP20_CAPTURE: capture, AMC_WP20_PAGE_DELAYS: "[300,300,300]" }, { ...recoveryOptions, timeoutMs: 600 });
    await expect((await instance.newSession()).prompt("deadline").result).rejects.toBeInstanceOf(AMCNativeProtocolError);
    expect(requestRecords(capture).filter(frame => frame.method === "session/prompt")).toHaveLength(0);
    expect(requestRecords(capture).filter(frame => frame.method === "_amc/session/events").length).toBeLessThanOrEqual(2);
  });
  test("preflight cancellation stops before reading another page or dispatching", async () => {
    const capture = join(mkdtempSync(join(tmpdir(), "wp20-cancel-")), "requests.jsonl"); workspaces.push(resolve(capture, ".."));
    const pages = [page({ nextSeq: 1, nextCursor: "p1", updates: [] }), page({ firstSeq: 1, updates: [] })];
    const instance = await client(pages, false, { AMC_WP20_CAPTURE: capture, AMC_WP20_PAGE_DELAYS: "[100,100]" }, recoveryOptions);
    const session = await instance.newSession(), turn = session.prompt("cancel before model");
    await waitForReads(capture, 1); turn.cancel();
    await expect(turn.result).rejects.toThrow(/cancel/i);
    expect(requestRecords(capture).filter(frame => frame.method === "_amc/session/events")).toHaveLength(1);
    expect(requestRecords(capture).filter(frame => frame.method === "session/prompt")).toHaveLength(0);
  });
  test("cancellation during recovery refuses its result without another prompt", async () => {
    const capture = join(mkdtempSync(join(tmpdir(), "wp20-recovery-cancel-")), "requests.jsonl"); workspaces.push(resolve(capture, ".."));
    const instance = await client([beforeTurn(), recoveredTurn()], false,
      { AMC_WP20_CAPTURE: capture, AMC_WP20_PAGE_DELAYS: "[0,100]", AMC_WP20_OVERFLOW: "50" }, recoveryOptions);
    const turn = (await instance.newSession()).prompt("cancel during recovery");
    await waitForReads(capture, 2); turn.cancel();
    await expect(turn.result).rejects.toThrow(/cancel/i);
    expect(requestRecords(capture).filter(frame => frame.method === "session/prompt")).toHaveLength(1);
  });
  test("ordinary acknowledged model cancellation still returns its cancelled outcome", async () => {
    const snapshot = completedState(); snapshot.turn = { ...snapshot.turn, lastEnd: { ...snapshot.turn.lastEnd, reason: "cancelled", cancelCause: { kind: "user" } } } as unknown as typeof snapshot.turn;
    const instance = await client([beforeTurn(), recoveredTurn({ state: snapshot })], false,
      { AMC_WP20_OVERFLOW: "50", AMC_WP20_HOLD_PROMPT: "1" }, recoveryOptions);
    const turn = (await instance.newSession()).prompt("cancel model");
    try { for await (const _event of turn) { /* wait until the explicit recovery notice */ } } catch { /* expected retention notice */ }
    turn.cancel(); expect((await turn.result).stopReason).toBe("cancelled");
  });
});


test("recovery uses the same total deadline after the prompt reply", async () => {
  const capture = join(mkdtempSync(join(tmpdir(), "wp20-recovery-deadline-")), "requests.jsonl"); workspaces.push(resolve(capture, ".."));
  const pages = [beforeTurn(), recoveredTurn({ nextSeq: 18, nextCursor: "r1", updates: recoveryUpdates.slice(0, 17) }),
    recoveredTurn({ firstSeq: 18, nextSeq: 35, nextCursor: "r2", updates: recoveryUpdates.slice(17, 34) }),
    recoveredTurn({ firstSeq: 35, updates: recoveryUpdates.slice(34) })];
  const instance = await client(pages, false, { AMC_WP20_CAPTURE: capture, AMC_WP20_PAGE_DELAYS: "[0,300,300,300]", AMC_WP20_OVERFLOW: "50" },
    { ...recoveryOptions, timeoutMs: 600 });
  await expect((await instance.newSession()).prompt("recovery deadline").result).rejects.toBeInstanceOf(AMCNativeProtocolError);
  expect(requestRecords(capture).filter(frame => frame.method === "_amc/session/events").length).toBeLessThanOrEqual(3);
  expect(requestRecords(capture).filter(frame => frame.method === "session/prompt")).toHaveLength(1);
});

test("recovery refuses a page replaying rows before the saved follow boundary", async () => {
  const instance = await client([beforeTurn(), recoveredTurn({ firstSeq: 0 })], false, { AMC_WP20_OVERFLOW: "50" }, recoveryOptions);
  await expect((await instance.newSession()).prompt("exact follow boundary").result).rejects.toBeInstanceOf(AMCNativeProtocolError);
});

test("recovery accepts the pinned final seal when one prompt drains multiple queued turns", async () => {
  const reference = { ...seal, turn: 3 };
  const snapshot = { ...completedState(), turn: { ...completedState().turn, number: 3,
    lastEnd: { ...completedState().turn.lastEnd, turn: 3 }, lastSeal: reference } };
  const instance = await client([beforeTurn(), recoveredTurn({ state: snapshot })], false,
    { AMC_WP20_OVERFLOW: "50", AMC_WP20_TURN_REF: JSON.stringify(reference) }, recoveryOptions);
  expect((await (await instance.newSession()).prompt("drained queued turns").result).text).toBe(recoveryUpdates.map(event => event.update.content.text).join(""));
});

test("session page state requires an explicit nullable lastSeal", async () => {
  const snapshot = state(); delete (snapshot.turn as Record<string, unknown>).lastSeal;
  await expect((await client([page({ state: snapshot })])).readSessionPage("fixture-session")).rejects.toBeInstanceOf(AMCNativeProtocolError);
});


test("recovery refuses a coherent prior seal even when no assistant prefix was retained", async () => {
  const baseline = page({ headSeq: 51, nextSeq: 52, updates: [], state: completedState(), resumeCursor: "before-turn" });
  const rollback = page({ firstSeq: 52, headSeq: 51, nextSeq: 52, updates: [], state: completedState() });
  const instance = await client([baseline, rollback], false, { AMC_WP20_OVERFLOW: "50", AMC_WP20_TOOL_OVERFLOW: "1" }, recoveryOptions);
  await expect((await instance.newSession()).prompt("no new current turn seal").result).rejects.toBeInstanceOf(AMCNativeProtocolError);
});


test("recovery refuses a coherently malformed reply and snapshot seal", async () => {
  const reference = { ...seal, eventHash: "bad" };
  const snapshot = { ...completedState(), turn: { ...completedState().turn, lastSeal: reference } };
  const instance = await client([beforeTurn(), recoveredTurn({ state: snapshot })], false,
    { AMC_WP20_OVERFLOW: "50", AMC_WP20_TURN_REF: JSON.stringify(reference) }, recoveryOptions);
  await expect((await instance.newSession()).prompt("invalid seal digest").result).rejects.toBeInstanceOf(AMCNativeProtocolError);
});
