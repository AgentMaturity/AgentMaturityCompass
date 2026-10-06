/** P07 authored regressions — not executed during implementation.
 * Controlled pipes exercise SDK scheduling only, not provider work or signed evidence.
 */
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  AMCNativeClient, AMCNativeTurn, AMCNativeInputError, AMCNativeLimitError,
  AMCNativeProcessError, AMCNativeProtocolError, AMCNativeRefusedError,
  AMC_NATIVE_EVENT_LIMITS, type AMCNativeUpdate, type AMCNativeClientOptions
} from "../src/sdk/nativeAgentClient.js";
import { AMCAgent } from "../src/sdk/amcAgent.js";

const processMock = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", async original => ({
  ...await original<typeof import("node:child_process")>(), spawn: processMock.spawn
}));

type Frame = { jsonrpc: "2.0"; id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: unknown };
const update = (text: string, sessionId = "unit-session"): AMCNativeUpdate => ({
  sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } }
});
const notification = (event: AMCNativeUpdate): Frame => ({ jsonrpc: "2.0", method: "session/update", params: { ...event } });

class ControlledInput extends EventEmitter {
  writableLength = 0;
  writableEnded = false;
  blocked = false;
  constructor(private readonly peer: ControlledPeer) { super(); }
  write(line: string, callback?: (error?: Error | null) => void): boolean {
    if (this.writableEnded) throw new Error("write after end");
    const frame = JSON.parse(line) as Frame;
    this.peer.frames.push(frame);
    if (this.blocked) this.writableLength += Buffer.byteLength(line);
    queueMicrotask(() => { this.peer.receive(frame); callback?.(); });
    return !this.blocked;
  }
  drain(): void { this.blocked = false; this.writableLength = 0; this.emit("drain"); }
  end(): void { this.writableEnded = true; queueMicrotask(() => this.peer.finish(0, null)); }
  destroy(): void { this.writableEnded = true; }
}

class ControlledPeer extends EventEmitter {
  readonly stdin = new ControlledInput(this);
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly frames: Frame[] = [];
  readonly prompts = new Map<string, Frame>();
  readonly kill = vi.fn((signal: NodeJS.Signals) => { queueMicrotask(() => this.finish(null, signal)); return true; });
  onPrompt: ((frame: Frame) => void) | undefined;
  onLoad: ((frame: Frame) => void) | undefined;
  capabilities: Record<string, unknown> = { loadSession: true, promptCapabilities: { image: false },
    _meta: { "dev.agentmaturity.amc": { releaseSession: true } } };
  private sequence = 0;
  private ended = false;
  send(...frames: Frame[]): void { this.stdout.write(Buffer.from(frames.map(frame => JSON.stringify(frame) + "\n").join(""))); }
  reply(frame: Frame, result: unknown): void { this.send({ jsonrpc: "2.0", id: frame.id, result }); }
  finish(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.ended) return;
    this.ended = true; this.emit("close", code, signal); this.stdout.destroy(); this.stderr.destroy();
  }
  receive(frame: Frame): void {
    if (this.ended) return;
    const sessionId = frame.params?.sessionId as string;
    switch (frame.method) {
      case "initialize": this.reply(frame, { protocolVersion: 1,
        agentInfo: { name: "agent-maturity-compass" }, agentCapabilities: this.capabilities }); break;
      case "session/new": this.reply(frame, { sessionId: `controlled-${++this.sequence}` }); break;
      case "session/prompt": this.prompts.set(sessionId, frame); this.onPrompt?.(frame); break;
      case "session/cancel": {
        const active = this.prompts.get(sessionId);
        if (active) { this.prompts.delete(sessionId); this.reply(active, { stopReason: "cancelled" }); }
        break;
      }
      case "session/load": if (this.onLoad) this.onLoad(frame); else this.reply(frame, {}); break;
      case "_amc/session/release": this.reply(frame, {}); break;
    }
  }
}

const clients: AMCNativeClient[] = [];
async function connect(peer = new ControlledPeer(), options: Partial<AMCNativeClientOptions> = {}) {
  processMock.spawn.mockReturnValueOnce(peer);
  const client = await AMCNativeClient.start({ workspace: process.cwd(), provider: "stub", timeoutMs: 1000, ...options });
  clients.push(client); return { peer, client };
}
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
  processMock.spawn.mockReset();
});

describe("P07 bounded native turn iteration", () => {
  test("return interrupts a pending next without waiting for a peer event or inventing a result", async () => {
    const cancel = vi.fn(), turn = new AMCNativeTurn("unit-session", cancel);
    const iterator = turn[Symbol.asyncIterator](), waiting = iterator.next();
    await expect(iterator.return!()).resolves.toEqual({ done: true, value: undefined });
    await expect(waiting).resolves.toEqual({ done: true, value: undefined });
    turn.cancel(); await iterator.return!(); expect(cancel).toHaveBeenCalledTimes(1);
    expect(turn.state).toBe("cancel-requested");
    turn.finish({ stopReason: "max_tokens" });
    expect(await turn.result).toMatchObject({ stopReason: "max_tokens", verification: "not-verified" });
  });
  test("return before the first next also requests one cancellation", async () => {
    const cancel = vi.fn(), turn = new AMCNativeTurn("unit-session", cancel), iterator = turn[Symbol.asyncIterator]();
    await iterator.return!(); expect(cancel).toHaveBeenCalledTimes(1);
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    turn.finish({ stopReason: "cancelled" }); await turn.result;
  });
  test("throw and simultaneous reads are bounded without losing the original waiter", async () => {
    const cancel = vi.fn(), turn = new AMCNativeTurn("unit-session", cancel), iterator = turn[Symbol.asyncIterator]();
    const waiting = iterator.next();
    await expect(iterator.next()).rejects.toThrow(/one native update read/i);
    turn.receive(update("first")); expect((await waiting).done).toBe(false);
    const error = new Error("consumer failure"); await expect(iterator.throw!(error)).rejects.toBe(error);
    expect(cancel).toHaveBeenCalledTimes(1); turn.finish({ stopReason: "cancelled" }); await turn.result;
  });
  test("cancel transport errors settle result rather than escaping an AbortSignal listener", async () => {
    const error = new AMCNativeProtocolError("broken input"), turn = new AMCNativeTurn("unit-session", () => { throw error; });
    expect(() => turn.cancel()).not.toThrow(); await expect(turn.result).rejects.toBe(error);
    expect(turn.state).toBe("failed");
  });
  test("retained snapshots cannot be changed through iteration or caller-owned update objects", async () => {
    const turn = new AMCNativeTurn("unit-session", vi.fn()), original = update("original");
    turn.receive(original); (original.update.content as { text: string }).text = "caller mutation";
    const iterator = turn[Symbol.asyncIterator](), item = await iterator.next();
    expect(Object.isFrozen(item.value.update.content)).toBe(true);
    expect(() => { (item.value.update.content as { text: string }).text = "iterator mutation"; }).toThrow();
    turn.finish({ stopReason: "end_turn" });
    const result = await turn.result;
    expect(result.text).toBe("original"); expect(Object.isFrozen(result.updates)).toBe(true);
    expect(result.validation.status).toBe("unavailable"); expect(result.verification).toBe("not-verified");
    expect(() => turn[Symbol.asyncIterator]()).toThrow(/one update iterator/);
    await iterator.return!();
  });
  test("an awaited result needs no iterator and retains ordered events within the exact count boundary", async () => {
    const turn = new AMCNativeTurn("unit-session", vi.fn(), { maxEvents: 2 });
    turn.receive(update("a")); turn.receive(update("b")); turn.finish({ stopReason: "end_turn" });
    expect(await turn.result).toMatchObject({ text: "ab", updates: [update("a"), update("b")] });
  });
  test("overflow is explicit and already delivered prefix remains available before the stream error", async () => {
    const turn = new AMCNativeTurn("unit-session", vi.fn(), { maxEvents: 1 });
    turn.receive(update("prefix")); expect(() => turn.receive(update("overflow"))).toThrow(AMCNativeLimitError);
    await expect(turn.result).rejects.toMatchObject({ resource: "turn-events", limit: 1 });
    const iterator = turn[Symbol.asyncIterator](); expect((await iterator.next()).value).toEqual(update("prefix"));
    await expect(iterator.next()).rejects.toBeInstanceOf(AMCNativeLimitError);
    turn.finish({ stopReason: "end_turn" }); expect(turn.state).toBe("failed");
  });
  test("byte ceilings count UTF-8 encoded updates, not JavaScript character length", async () => {
    const event = update("ગુજરાતી 🌏"), size = Buffer.byteLength(JSON.stringify(event));
    const exact = new AMCNativeTurn("unit-session", vi.fn(), { maxBytes: size });
    exact.receive(event); exact.finish({ stopReason: "end_turn" }); expect((await exact.result).text).toBe("ગુજરાતી 🌏");
    const small = new AMCNativeTurn("unit-session", vi.fn(), { maxBytes: size - 1 });
    expect(() => small.receive(event)).toThrow(AMCNativeLimitError);
    await expect(small.result).rejects.toMatchObject({ resource: "turn-bytes", limit: size - 1 });
  });
  test.each([0, -1, 1.5, NaN, Infinity, AMC_NATIVE_EVENT_LIMITS.maxEvents + 1])("rejects invalid event limit %s", value => {
    expect(() => new AMCNativeTurn("unit-session", vi.fn(), { maxEvents: value })).toThrow(AMCNativeInputError);
  });
  test.each([
    { stopReason: "success" }, { stopReason: "end_turn", _meta: [] },
    { stopReason: "end_turn", _meta: { "dev.agentmaturity.amc": "passed" } },
    { stopReason: "end_turn", _meta: { "dev.agentmaturity.amc": { validation: { status: "passed" } } } }
  ])("malformed completion cannot resolve as completed: %j", async value => {
    const turn = new AMCNativeTurn("unit-session", vi.fn());
    expect(() => turn.finish(value)).toThrow(AMCNativeProtocolError);
    await expect(turn.result).rejects.toBeInstanceOf(AMCNativeProtocolError);
  });
  test("valid operator-check failure remains independent from turn completion and verification", async () => {
    const turn = new AMCNativeTurn("unit-session", vi.fn());
    const validation = { status: "failed", turn: 1, configSha256: "a".repeat(64), checks: [{
      id: "check", title: "Operator check", status: "failed", callId: "call", exitCode: 2,
      timedOut: false, reason: "nonzero-exit", outputEventId: "output"
    }] };
    turn.finish({ stopReason: "end_turn", _meta: { "dev.agentmaturity.amc": { validation } } });
    expect(await turn.result).toMatchObject({ state: "completed", validation, verification: "not-verified" });
    validation.checks[0]!.exitCode = 0;
    expect((await turn.result).validation.checks[0]!.exitCode).toBe(2);
  });
});

describe("P07 controlled native lifecycle and transport", () => {
  test("stdin backpressure preserves prompt/cancel ordering and close waits for drain", async () => {
    const { client, peer } = await connect(), first = await client.newSession(), second = await client.newSession();
    peer.stdin.blocked = true;
    const one = first.prompt("one"), two = second.prompt("two");
    one.cancel(); one.cancel(); const closing = client.close(); expect(client.close()).toBe(closing);
    expect(peer.frames.filter(frame => frame.method === "session/prompt")).toHaveLength(1);
    expect(peer.stdin.writableEnded).toBe(false); expect(client.processClosed).toBe(false);
    expect(() => first.prompt("after close")).toThrow(/closed/);
    peer.stdin.drain();
    await expect(one.result).resolves.toMatchObject({ stopReason: "cancelled" });
    await expect(two.result).resolves.toMatchObject({ stopReason: "cancelled" }); await closing;
    const sent = peer.frames.filter(frame => ["session/prompt", "session/cancel"].includes(frame.method ?? ""));
    expect(sent.map(frame => [frame.method, frame.params?.sessionId])).toEqual([
      ["session/prompt", first.sessionId], ["session/prompt", second.sessionId],
      ["session/cancel", first.sessionId], ["session/cancel", second.sessionId]
    ]);
    expect(client.processClosed).toBe(true); expect(client.processExit).toEqual({ exitCode: 0, signal: null });
  });
  test.each(["result", "error"] as const)("retires the prompt update window on the %s reader frame", async kind => {
    const { client, peer } = await connect(), session = await client.newSession();
    peer.onPrompt = frame => peer.send({ jsonrpc: "2.0", id: frame.id,
      ...(kind === "result" ? { result: { stopReason: "end_turn" } }
        : { error: { code: -32007, message: "signed refusal remains exact", data: { reason: "signed-policy" } } })
    }, notification(update("late output", session.sessionId)));
    const turn = session.prompt("prompt");
    if (kind === "result") await expect(turn.result).rejects.toBeInstanceOf(AMCNativeProtocolError);
    else await expect(turn.result).rejects.toMatchObject({ code: -32007, message: "signed refusal remains exact", data: { reason: "signed-policy" } });
    await client.close(); expect(client.state).toBe("failed"); expect(client.processClosed).toBe(true);
  });
  test("return after the reader retired a prompt does not emit a stale session cancellation", async () => {
    const { client, peer } = await connect(), session = await client.newSession();
    peer.onPrompt = frame => peer.send(notification(update("last", session.sessionId)),
      { jsonrpc: "2.0", id: frame.id, result: { stopReason: "end_turn" } });
    const turn = session.prompt("prompt"), iterator = turn[Symbol.asyncIterator]();
    await iterator.next(); await iterator.return!(); await turn.result;
    expect(peer.frames.filter(frame => frame.method === "session/cancel")).toEqual([]);
  });
  test("released handles cannot regain authority when the same client resumes the ID", async () => {
    const { client, peer } = await connect(), original = await client.newSession();
    const releasing = original.release(); expect(original.release()).toBe(releasing); expect(original.lifecycle).toBe("releasing");
    await releasing; expect(original.lifecycle).toBe("released");
    const resumed = await client.resumeSession(original.sessionId); expect(resumed.lifecycle).toBe("accepted");
    expect(() => original.prompt("stale handle")).toThrow(/has been released/);
    await expect(original.closeAndVerify()).rejects.toThrow(/has been released/);
    await original.release(); expect(peer.frames.filter(frame => frame.method === "_amc/session/release")).toHaveLength(1);
    peer.onPrompt = frame => peer.reply(frame, { stopReason: "end_turn" });
    expect((await resumed.prompt("new handle").result).verification).toBe("not-verified");
  });
  test("a session reply arriving during close cannot resurrect a usable handle", async () => {
    const { client } = await connect();
    const pending = client.newSession(), closing = client.close();
    await expect(pending).rejects.toThrow(/closed/); await closing;
    expect(client.processClosed).toBe(true); expect(client.state).toBe("closed");
  });
  test("event flood fails the client with a typed limit rather than truncating a successful result", async () => {
    const { client, peer } = await connect(undefined, { eventBuffer: { maxEvents: 1 } }), session = await client.newSession();
    peer.onPrompt = frame => peer.send(notification(update("one", session.sessionId)), notification(update("two", session.sessionId)),
      { jsonrpc: "2.0", id: frame.id, result: { stopReason: "end_turn" } });
    await expect(session.prompt("prompt").result).rejects.toMatchObject({ resource: "turn-events", limit: 1 });
    await client.close(); expect(client.processClosed).toBe(true);
  });
  test("history has the same event ceiling and never becomes new turn output", async () => {
    const { client, peer } = await connect(undefined, { eventBuffer: { maxEvents: 1 } });
    peer.onLoad = frame => peer.send(notification(update("old1", "resuming")), notification(update("old2", "resuming")),
      { jsonrpc: "2.0", id: frame.id, result: {} });
    await expect(client.resumeSession("resuming")).rejects.toMatchObject({ resource: "history-events", limit: 1 });
    await client.close(); expect(client.state).toBe("failed");
  });
  test("close-event crash details reject the pending result without manufacturing verification", async () => {
    const { client, peer } = await connect(), session = await client.newSession();
    const turn = session.prompt("prompt"), iterator = turn[Symbol.asyncIterator](), reading = iterator.next();
    peer.finish(17, null);
    await expect(turn.result).rejects.toBeInstanceOf(AMCNativeProcessError);
    await expect(reading).rejects.toMatchObject({ exitCode: 17, signal: null });
    expect(client.processClosed).toBe(true); expect(client.processExit).toEqual({ exitCode: 17, signal: null });
  });
  test("split UTF-8 is preserved and malformed bytes are refused instead of replacement-decoded", async () => {
    const { client, peer } = await connect(), session = await client.newSession();
    peer.onPrompt = frame => {
      const bytes = Buffer.from(JSON.stringify(notification(update("🌏", session.sessionId))) + "\n");
      const at = bytes.indexOf(Buffer.from("🌏")) + 1;
      peer.stdout.write(bytes.subarray(0, at)); peer.stdout.write(bytes.subarray(at)); peer.reply(frame, { stopReason: "end_turn" });
    };
    expect((await session.prompt("valid").result).text).toBe("🌏");
    peer.onPrompt = () => {
      const bytes = Buffer.from(JSON.stringify(notification(update("x", session.sessionId))) + "\n");
      bytes[bytes.indexOf(Buffer.from('"x"')) + 1] = 0xff; peer.stdout.write(bytes);
    };
    await expect(session.prompt("invalid").result).rejects.toThrow(/invalid or uncorrelated/);
  });
  test("oversized local input leaves the existing client and prompt slot usable", async () => {
    const { client, peer } = await connect(), session = await client.newSession();
    await expect(session.prompt("x".repeat(262144)).result).rejects.toThrow(/ACP ingress frame limit/);
    expect(peer.frames.some(frame => frame.method === "session/prompt")).toBe(false);
    peer.onPrompt = frame => peer.reply(frame, { stopReason: "end_turn" });
    expect((await session.prompt("still usable").result).verification).toBe("not-verified");
  });
  test("AMCAgent exposes explicit native startup without a bridge lease or default provider", async () => {
    const peer = new ControlledPeer(); processMock.spawn.mockReturnValueOnce(peer);
    const client = await AMCAgent.startNative({ workspace: process.cwd(), provider: "stub" }); clients.push(client);
    expect(await client.newSession()).toMatchObject({ state: "accepted" });
    const count = processMock.spawn.mock.calls.length;
    await expect(AMCAgent.startNative({ workspace: process.cwd(), provider: "" })).rejects.toBeInstanceOf(AMCNativeInputError);
    expect(processMock.spawn.mock.calls).toHaveLength(count);
  });
  test("allowUnconfinedShell: true adds --unsafe-unconfined-shell to the spawned amc acp argv; false or absent does not", async () => {
    for (const allowUnconfinedShell of [true, false, undefined]) {
      await connect(new ControlledPeer(), { command: ["fixture-node", "fixture-cli.js"],
        ...(allowUnconfinedShell === undefined ? {} : { allowUnconfinedShell }) });
    }
    expect(processMock.spawn.mock.calls.map(([executable, argv]) => [executable, argv])).toEqual([
      ["fixture-node", ["fixture-cli.js", "acp", "--provider", "stub", "--unsafe-unconfined-shell"]],
      ["fixture-node", ["fixture-cli.js", "acp", "--provider", "stub"]],
      ["fixture-node", ["fixture-cli.js", "acp", "--provider", "stub"]]
    ]);
  });
  test("invalid validation IDs are rejected before spawn, not coerced into CLI flags", async () => {
    await expect(AMCNativeClient.start({ workspace: process.cwd(), provider: "stub", validationConfig: "checks.json",
      validate: [7] as unknown as readonly string[] })).rejects.toBeInstanceOf(AMCNativeInputError);
    expect(processMock.spawn).not.toHaveBeenCalled();
  });
  test("invalid signals and timer overflow are refused before starting a child", async () => {
    await expect(AMCNativeClient.start({ workspace: process.cwd(), provider: "stub",
      startupSignal: { aborted: false } as AbortSignal })).rejects.toBeInstanceOf(AMCNativeInputError);
    await expect(AMCNativeClient.start({ workspace: process.cwd(), provider: "stub", timeoutMs: 2_147_483_648 }))
      .rejects.toBeInstanceOf(AMCNativeInputError);
    expect(processMock.spawn).not.toHaveBeenCalled();
  });
  test("prompt signal validation does not strand an active slot", async () => {
    const { client, peer } = await connect(), session = await client.newSession();
    expect(() => session.prompt("invalid", { signal: { aborted: false } as AbortSignal })).toThrow(AMCNativeInputError);
    peer.onPrompt = frame => peer.reply(frame, { stopReason: "end_turn" });
    expect((await session.prompt("usable").result).verification).toBe("not-verified");
  });
  test("a server refusal preserves its original code, message and data", async () => {
    const { client, peer } = await connect(), session = await client.newSession();
    peer.onPrompt = frame => peer.send({ jsonrpc: "2.0", id: frame.id,
      error: { code: -32019, message: "Operator policy refused this request", data: { reason: "policy-digest" } } });
    const turn = session.prompt("refused");
    await expect(turn.result).rejects.toBeInstanceOf(AMCNativeRefusedError);
    await expect(turn.result).rejects.toMatchObject({ code: -32019, message: "Operator policy refused this request", data: { reason: "policy-digest" } });
    expect(client.state).toBe("open");
  });
});
