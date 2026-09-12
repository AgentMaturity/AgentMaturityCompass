/** P08 regressions — authored, not executed. No provider, package or release qualification. */
import { afterEach, describe, expect, test, vi } from "vitest";
import { createAcpConnection, type AcpConnection, type AcpHandlers } from "../src/acp/acpConnection.js";
import { classifyAcpMessage } from "../src/acp/acpEnvelope.js";
import { ACP_ERROR, AcpFailure } from "../src/acp/acpErrors.js";
import { createAcpStdioSink } from "../src/acp/acpStdioMain.js";
import { ACP_MAX_TURN_UPDATE_BYTES } from "../src/acp/acpCommittedUpdates.js";

type Frame = Record<string, unknown>;
const connections: AcpConnection[] = [];
afterEach(() => { for (const connection of connections.splice(0)) connection.close(); vi.restoreAllMocks(); });
const bytes = (...frames: Frame[]) => Buffer.from(frames.map(frame => JSON.stringify(frame)).join("\n") + "\n");
const request = (id: string | number, method = "work") => ({ jsonrpc: "2.0", id, method, params: {} });
const settled = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}
function peer(handler: AcpHandlers["request"], sink?: (frame: Buffer) => void) {
  const frames: Frame[] = [], notifications = vi.fn(), unusable = vi.fn(), log = vi.fn();
  const connection = createAcpConnection({ handlers: { request: handler, notification: notifications },
    write: frame => { if (sink) sink(frame); frames.push(JSON.parse(frame.toString("utf8")) as Frame); },
    onUnusable: unusable, log });
  connections.push(connection);
  return { connection, frames, notifications, unusable, log };
}

describe("P08 ACP connection boundaries (unexecuted)", () => {
  test.each(["result", "error"])("a method mixed with %s is not dispatched", async field => {
    const run = vi.fn(async () => ({})), h = peer(run);
    const message = { ...request(1), [field]: field === "result" ? {} : { code: -32603, message: "bad" } };
    expect(classifyAcpMessage(message)).toMatchObject({ kind: "malformed", id: 1 });
    h.connection.ingest(bytes(message)); await settled();
    expect(run).not.toHaveBeenCalled();
    expect(h.frames).toEqual([{ jsonrpc: "2.0", id: 1, error: { code: -32600, message: expect.any(String) } }]);
  });

  test("synchronous handler exceptions produce one bounded error and preserve the next request", async () => {
    const h = peer(method => { if (method === "bad") throw new Error("private-path\nforged line"); return Promise.resolve({ actual: true }); });
    expect(() => h.connection.ingest(bytes(request(1, "bad"), request(2)))).not.toThrow();
    await settled();
    expect(h.frames).toEqual([
      { jsonrpc: "2.0", id: 1, error: { code: -32603, message: "the method failed" } },
      { jsonrpc: "2.0", id: 2, result: { actual: true } }
    ]);
    expect(h.log.mock.calls.every(([message]) => !String(message).includes("\n"))).toBe(true);
  });

  test("an intentional AcpFailure preserves its refusal, but a duck-typed error cannot choose a protocol verdict", async () => {
    const h = peer(async method => {
      if (method === "intentional") throw new AcpFailure(ACP_ERROR.invalidParams, "exact refusal", { reason: "unsupported" });
      throw { acpCode: 1234, message: "do not trust this object" };
    });
    h.connection.ingest(bytes(request(1, "intentional"), request(2))); await settled();
    expect(h.frames[0]).toMatchObject({ id: 1, error: { code: -32602, message: "exact refusal", data: { reason: "unsupported" } } });
    expect(h.frames[1]).toMatchObject({ id: 2, error: { code: -32603, message: "the method failed" } });
  });

  test.each([undefined, 1n, () => {}, Symbol("unsupported")])("invalid result %s never becomes a response without a result", async result => {
    const h = peer(async () => result);
    h.connection.ingest(bytes(request(1))); await settled();
    expect(h.frames).toEqual([{ jsonrpc: "2.0", id: 1, error: { code: -32603, message: "the method produced an invalid response" } }]);
    expect(h.connection.isInFlight(1)).toBe(false);
  });

  test("duplicate in-flight identity aborts the original and cannot emit two answers or launch the next frame", async () => {
    const gate = deferred<unknown>(); let signal!: AbortSignal;
    const run = vi.fn((_method: string, _params: unknown, active: AbortSignal) => { signal = active; return gate.promise; });
    const h = peer(run);
    h.connection.ingest(bytes(request(7), request(7), request(8)));
    expect(signal.aborted).toBe(true); expect(run).toHaveBeenCalledTimes(1); expect(h.unusable).toHaveBeenCalledTimes(1);
    expect(h.frames).toEqual([{ jsonrpc: "2.0", id: 7, error: { code: -32600, message: "a request with this id is already in flight" } }]);
    gate.resolve({ never: "another result" }); await settled();
    h.connection.ingest(bytes(request(7))); await settled();
    expect(h.frames).toHaveLength(1); expect(run).toHaveBeenCalledTimes(1);
  });

  test("a malformed frame reusing an active id also retires that identity once", async () => {
    const gate = deferred<unknown>(); let signal!: AbortSignal;
    const h = peer((_method, _params, active) => { signal = active; return gate.promise; });
    h.connection.ingest(bytes(request(1), { ...request(1), result: {} }));
    expect(signal.aborted).toBe(true); gate.resolve({}); await settled();
    expect(h.frames).toHaveLength(1); expect(h.unusable).toHaveBeenCalledTimes(1);
  });

  test("number and string IDs remain distinct and unsolicited responses never trigger replies", async () => {
    const run = vi.fn(async () => ({})), h = peer(run);
    h.connection.ingest(bytes(request(1), request("1"), { jsonrpc: "2.0", id: 55, result: "unsolicited" })); await settled();
    expect(run).toHaveBeenCalledTimes(2);
    expect(h.frames.map(frame => frame.id)).toEqual([1, "1"]);
  });

  test("a throwing sink latches transport failure and aborts active work without throwing out of ingest", async () => {
    const gate = deferred<unknown>(); let signal!: AbortSignal;
    const run = vi.fn((_method: string, _params: unknown, active: AbortSignal) => { signal = active; return gate.promise; });
    const h = peer(run, () => { throw new Error("EPIPE"); });
    h.connection.ingest(bytes(request(1)));
    expect(() => h.connection.ingest(bytes({ ...request(2), result: {} }, request(3)))).not.toThrow();
    expect(signal.aborted).toBe(true); expect(h.unusable).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(() => h.connection.notify("session/update", {})).toThrow(/unusable/);
    gate.resolve({}); await settled(); expect(h.frames).toEqual([]);
  });

  test("truncated EOF is a transport refusal; clean EOF still permits its already accepted response", async () => {
    const damaged = peer(async () => ({}));
    damaged.connection.ingest(Buffer.from('{"jsonrpc":"2.0"'));
    damaged.connection.end(); damaged.connection.end();
    expect(damaged.unusable).toHaveBeenCalledTimes(1);
    expect(String(damaged.unusable.mock.calls[0]?.[0])).toMatch(/incomplete record/);
    const gate = deferred<unknown>(), clean = peer(() => gate.promise);
    clean.connection.ingest(bytes(request(1))); clean.connection.end();
    gate.resolve({ completed: true }); await settled();
    expect(clean.unusable).not.toHaveBeenCalled();
    expect(clean.frames).toEqual([{ jsonrpc: "2.0", id: 1, result: { completed: true } }]);
  });

  test("duplicate JSON keys fail at the byte parser without dispatching a following valid frame", () => {
    const run = vi.fn(async () => ({})), h = peer(run);
    h.connection.ingest(Buffer.concat([Buffer.from('{"jsonrpc":"2.0","id":1,"method":"work","method":"other"}\n'), bytes(request(2))]));
    expect(run).not.toHaveBeenCalled(); expect(h.unusable).toHaveBeenCalledTimes(1); expect(h.frames).toEqual([]);
  });

  test("stdio backpressure is bounded without pausing input or treating write(false) as an automatic error", () => {
    const write = vi.fn(() => false);
    expect(() => createAcpStdioSink({ write, writableLength: 1024 })(Buffer.from("ok\n"))).not.toThrow();
    write.mockClear();
    expect(() => createAcpStdioSink({ write, writableLength: ACP_MAX_TURN_UPDATE_BYTES })(Buffer.from("x"))).toThrow(/bounded output queue/);
    expect(write).not.toHaveBeenCalled();
    expect(() => createAcpStdioSink({ write })(Buffer.from("x"))).toThrow(/without a measurable/);
    write.mockClear();
    expect(() => createAcpStdioSink({ write, destroyed: true })(Buffer.from("x"))).toThrow(/closed/);
    expect(write).not.toHaveBeenCalled();
  });
});
