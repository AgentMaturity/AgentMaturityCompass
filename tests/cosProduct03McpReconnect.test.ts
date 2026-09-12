import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResultSchema, ProgressNotificationSchema, type JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NativeMcpHttpTransport, NATIVE_MCP_HTTP_LIMITS, type NativeMcpHttpServer } from "../src/mcp/nativeMcpHttpTransport.js";
import { discoverNativeMcpCatalog } from "../src/mcp/nativeMcpClient.js";
import {
  NativeMcpReconnectBudget, NativeMcpReconnectCursors, NATIVE_MCP_RECONNECT_LIMITS,
  nativeMcpRetryAfter, nativeMcpWait
} from "../src/mcp/nativeMcpReconnect.js";

// Synthetic wire data only. These regressions exercise the installed SDK and the
// real native transport; no external endpoint or credential store is consulted.
const ENDPOINT = "https://p03-mcp.invalid/mcp";
const ORIGIN = "https://p03-mcp.invalid";
const SECRET = "synthetic-p03-auth-741fb9";
const SESSION = "synthetic-p03-session-83e2";
const ENCODER = new TextEncoder();
interface Wire {
  url: string; method: string; headers: Headers; signal: AbortSignal; init: RequestInit; at: number;
  rpc?: { id?: string | number; method?: string; params?: Record<string, unknown> };
}
type Hook = (wire: Wire) => Response | undefined | Promise<Response | undefined>;
const disposals: (() => Promise<void>)[] = [];
beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }); });
afterEach(async () => {
  try { for (const close of disposals.splice(0).reverse()) await close(); }
  finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
});

function reply(status: number, body: BodyInit | null = null, headers: Record<string, string> = {}, url = ENDPOINT): Response {
  const response = new Response(body, { status, headers: { "content-type": "application/json", ...headers } });
  Object.defineProperty(response, "url", { value: url });
  return response;
}
function result(id: string | number | undefined, value: unknown): Response {
  return reply(200, JSON.stringify({ jsonrpc: "2.0", id, result: value }), { "mcp-session-id": SESSION });
}
function frame(id: string, message?: unknown): string {
  return `id: ${id}\ndata: ${message === undefined ? "" : JSON.stringify(message)}\n\n`;
}
function rawBody(wire: Wire, parts: readonly (string | Uint8Array)[], tail: "end" | "error" | "hold" = "end"): ReadableStream<Uint8Array> {
  let index = 0, ended = false;
  let target: ReadableStreamDefaultController<Uint8Array>;
  const cleanup = () => wire.signal.removeEventListener("abort", abort);
  const abort = () => { if (!ended) { ended = true; cleanup(); target.error(new Error(`private transport text ${SECRET}`)); } };
  return new ReadableStream<Uint8Array>({
    start(controller) { target = controller; wire.signal.addEventListener("abort", abort, { once: true }); if (wire.signal.aborted) abort(); },
    pull(controller) {
      if (ended) return;
      const part = parts[index++];
      if (part !== undefined) { controller.enqueue(typeof part === "string" ? ENCODER.encode(part) : part); return; }
      if (tail === "hold") return;
      ended = true; cleanup();
      if (tail === "error") controller.error(new Error(`connection lost ${SECRET} ${SESSION}`));
      else controller.close();
    },
    cancel() { ended = true; cleanup(); }
  });
}
function sse(wire: Wire, parts: readonly (string | Uint8Array)[], tail: "end" | "error" | "hold" = "end", extra: Record<string, string> = {}): Response {
  return reply(200, rawBody(wire, parts, tail), { "content-type": "text/event-stream", "mcp-session-id": SESSION, ...extra });
}
function harness(hook: Hook = () => undefined, options: Partial<NativeMcpHttpServer> = {}) {
  const calls: Wire[] = [], errors: Error[] = [];
  const headers = { Authorization: `Bearer ${SECRET}` };
  const server: NativeMcpHttpServer = { transport: "streamable-http", id: "p03", url: ENDPOINT, origin: ORIGIN,
    headers, timeoutMs: 5000, notificationLifetimeMs: 60_000, ...options };
  const transport = new NativeMcpHttpTransport(server, server.timeoutMs!);
  const client = new Client({ name: "p03-regression", version: "1" }, { capabilities: {} });
  client.onerror = error => errors.push(error);
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    if (!init.signal) throw new Error("The native transport must supply cancellation to every request");
    const wire: Wire = { url: String(input), method: init.method ?? "GET", headers: new Headers(init.headers),
      signal: init.signal, init, at: Date.now(),
      ...(typeof init.body === "string" ? { rpc: JSON.parse(init.body) as Wire["rpc"] } : {}) };
    calls.push(wire);
    const overridden = await hook(wire);
    if (overridden) return overridden;
    if (wire.method === "DELETE") return reply(204);
    if (wire.method === "GET") return reply(405);
    if (wire.rpc?.method === "initialize") return result(wire.rpc.id, {
      protocolVersion: wire.rpc.params?.protocolVersion,
      capabilities: { tools: { listChanged: true } }, serverInfo: { name: "p03-server", version: "1" }
    });
    if (wire.rpc?.method === "notifications/initialized") return reply(202);
    if (wire.rpc?.method === "tools/list") return result(wire.rpc.id, { tools: [] });
    return result(wire.rpc?.id, wire.rpc?.method === "tools/call" ? { content: [{ type: "text", text: "one execution" }] } : {});
  }));
  disposals.push(async () => { try { await client.close(); } catch {} try { await transport.close(); } catch {} });
  const connect = async () => { await client.connect(transport, { timeout: server.timeoutMs }); await vi.advanceTimersByTimeAsync(0); };
  const call = () => client.request({ method: "tools/call", params: { name: "side_effect", arguments: {},
    _meta: { readOnlyHint: true } } }, CallToolResultSchema, { timeout: server.timeoutMs });
  const posts = (method: string) => calls.filter(wire => wire.method === "POST" && wire.rpc?.method === method);
  const resumes = () => calls.filter(wire => wire.method === "GET" && wire.headers.has("last-event-id"));
  return { transport, client, calls, errors, headers, server, connect, call, posts, resumes };
}

describe("P03 bounded recovery primitives", () => {
  test("backoff is exponential, finite and never reset by a successful connection", async () => {
    const abort = new AbortController(), budget = new NativeMcpReconnectBudget(abort.signal, Date.now() + 30_000);
    for (const delay of [250, 500, 1000]) {
      let ready = false;
      const waiting = budget.wait().then(() => { ready = true; });
      await vi.advanceTimersByTimeAsync(delay - 1); expect(ready).toBe(false);
      await vi.advanceTimersByTimeAsync(1); await waiting; expect(ready).toBe(true);
    }
    await expect(budget.wait()).rejects.toMatchObject({ code: "RETRY_EXHAUSTED" });
    expect(vi.getTimerCount()).toBe(0);
  });

  test("Retry-After dates and seconds are lower bounds; oversized hints fail instead of being shortened", async () => {
    const now = Date.UTC(2026, 8, 11, 6, 0, 0);
    expect(nativeMcpRetryAfter("2", now)).toBe(2000);
    expect(nativeMcpRetryAfter("Fri, 11 Sep 2026 06:00:03 GMT", now)).toBe(3000);
    expect(nativeMcpRetryAfter("-2", now)).toBe(0);
    expect(nativeMcpRetryAfter("not a date", now)).toBe(0);
    const budget = new NativeMcpReconnectBudget(new AbortController().signal, Date.now() + 30_000);
    await expect(budget.wait(10_001)).rejects.toMatchObject({ code: "RETRY_EXHAUSTED" });
    expect(vi.getTimerCount()).toBe(0);
  });

  test("cancellation removes backoff timers and never echoes an abort reason", async () => {
    const abort = new AbortController();
    const rejected = expect(nativeMcpWait(2000, abort.signal)).rejects.toMatchObject({ code: "CANCELLED", message: expect.not.stringContaining(SECRET) });
    abort.abort(new Error(SECRET)); await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  test("a cursor is owned by one stream and one immutable event; the ledger is bounded", () => {
    const cursors = new NativeMcpReconnectCursors();
    expect(cursors.accept("same", 1, "message", "payload")).toBe(true);
    expect(cursors.accept("same", 1, "message", "payload")).toBe(false);
    expect(() => cursors.accept("same", 2, "message", "payload")).toThrow(/crossed/);
    expect(() => cursors.accept("same", 1, "message", "changed")).toThrow(/changed/);
    expect(() => cursors.accept("injected\nheader", 1, "message", "")).toThrow(/cursor/);
    for (let i = 1; i < NATIVE_MCP_RECONNECT_LIMITS.eventIds; i++) cursors.accept(`cursor-${i}`, 1, "message", "");
    expect(() => cursors.accept("overflow", 1, "message", "")).toThrow(/limit/);
  });
});

describe("P03 installed-SDK native HTTP recovery", () => {
  test("tools/list retries transient HTTP/network failures with the same id, session, protocol and immutable auth", async () => {
    let attempts = 0;
    const h = harness(wire => {
      if (wire.rpc?.method !== "tools/list") return;
      if (++attempts === 1) return reply(503, SECRET, { "retry-after": "0", "mcp-session-id": SESSION });
      if (attempts === 2) throw new Error(`network ${SECRET}`);
    });
    await h.connect(); h.headers.Authorization = "Bearer changed-after-construction";
    const reading = h.client.listTools();
    await vi.advanceTimersByTimeAsync(0); expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(250); expect(attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(500); expect(await reading).toMatchObject({ tools: [] });
    const posts = h.posts("tools/list");
    expect(posts.map(wire => wire.at - posts[0]!.at)).toEqual([0, 250, 750]);
    expect(new Set(posts.map(wire => wire.init.body)).size).toBe(1);
    expect(posts.every(wire => wire.headers.get("authorization") === `Bearer ${SECRET}` && wire.headers.get("mcp-session-id") === SESSION)).toBe(true);
    expect(posts.every(wire => wire.headers.get("mcp-protocol-version") === h.posts("initialize")[0]!.rpc?.params?.protocolVersion)).toBe(true);
    expect(h.posts("initialize")).toHaveLength(1); expect(h.errors).toEqual([]);
    expect(h.transport.redactString(`${SECRET} ${SESSION}`)).toBe("[REDACTED] [REDACTED]");
  });

  test("a truncated read-only JSON body is retried before any partial result reaches the SDK", async () => {
    let attempts = 0;
    const h = harness(wire => {
      if (wire.rpc?.method === "tools/list" && ++attempts === 1) {
        return reply(200, rawBody(wire, ['{"jsonrpc":"2.0","id":'], "error"), { "mcp-session-id": SESSION });
      }
    });
    await h.connect(); const reading = h.client.listTools();
    await vi.advanceTimersByTimeAsync(250); expect(await reading).toMatchObject({ tools: [] });
    expect(h.posts("tools/list")).toHaveLength(2); expect(h.errors).toEqual([]);
  });

  test.each(["network", "503", "429", "partial-json"] as const)("never replays tools/call after %s, even with read-only metadata", async failure => {
    const h = harness(wire => {
      if (wire.rpc?.method !== "tools/call") return;
      if (failure === "network") throw new Error(SECRET);
      if (failure === "partial-json") return reply(200, rawBody(wire, ['{"jsonrpc":"2.0",'], "error"));
      return reply(Number(failure), SECRET, { "retry-after": "0" });
    });
    await h.connect(); const failed = expect(h.call()).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(10_000); await failed;
    expect(h.posts("tools/call")).toHaveLength(1); expect(h.resumes()).toEqual([]);
    expect(h.transport.failureMessage).not.toContain(SECRET);
  });

  test("initialization is not blindly reposted after an ambiguous network failure", async () => {
    const h = harness(wire => { if (wire.rpc?.method === "initialize") throw new Error(SECRET); });
    const failed = expect(h.connect()).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(10_000); await failed;
    expect(h.posts("initialize")).toHaveLength(1); expect(h.resumes()).toEqual([]);
  });

  test("POST SSE resumes via GET, discards a partial frame and suppresses duplicate progress events", async () => {
    let requestId: string | number | undefined, progress = 0;
    const notice = { jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: "p03-progress", progress: 1 } };
    const h = harness(wire => {
      if (wire.rpc?.method === "tools/call") {
        requestId = wire.rpc.id;
        return sse(wire, [frame("p03-prime") + frame("p03-progress", notice) + 'id: unfinished\ndata: {"jsonrpc":'], "error");
      }
      if (wire.headers.has("last-event-id")) return sse(wire, [frame("p03-progress", notice),
        frame("p03-result", { jsonrpc: "2.0", id: requestId, result: { content: [{ type: "text", text: "recovered" }] } })]);
    });
    h.client.setNotificationHandler(ProgressNotificationSchema, () => { progress++; });
    await h.connect(); const calling = h.call();
    await vi.advanceTimersByTimeAsync(250);
    expect(await calling).toMatchObject({ content: [{ text: "recovered" }] }); expect(progress).toBe(1);
    expect(h.posts("tools/call")).toHaveLength(1); expect(h.resumes()).toHaveLength(1); expect(h.errors).toEqual([]);
    const resumed = h.resumes()[0]!;
    expect(resumed.headers.get("last-event-id")).toBe("p03-progress"); expect(resumed.init.body).toBeUndefined();
    expect(resumed.headers.get("mcp-session-id")).toBe(SESSION); expect(resumed.headers.get("authorization")).toBe(`Bearer ${SECRET}`);
    expect(resumed.headers.get("mcp-protocol-version")).toBe(h.posts("initialize")[0]!.rpc?.params?.protocolVersion);
    expect(h.calls.every(wire => wire.url === ENDPOINT && wire.init.redirect === "manual" && wire.init.credentials === "omit")).toBe(true);
  });

  test("SSE retry applies without a trailing blank line and also bounds failed resume GET retries", async () => {
    let requestId: string | number | undefined, gets = 0;
    const h = harness(wire => {
      if (wire.rpc?.method === "tools/call") { requestId = wire.rpc.id; return sse(wire, [frame("retry-cursor") + "retry: 1200\n"]); }
      if (wire.headers.has("last-event-id")) {
        if (++gets === 1) return reply(503, null, { "retry-after": "0" });
        return sse(wire, [frame("retry-result", { jsonrpc: "2.0", id: requestId, result: { content: [] } })]);
      }
    });
    await h.connect(); const calling = h.call(); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1199); expect(gets).toBe(0);
    await vi.advanceTimersByTimeAsync(1); expect(gets).toBe(1);
    await vi.advanceTimersByTimeAsync(1199); expect(gets).toBe(1);
    await vi.advanceTimersByTimeAsync(1); expect(await calling).toMatchObject({ content: [] });
    expect(h.resumes()[1]!.at - h.resumes()[0]!.at).toBe(1200); expect(h.posts("tools/call")).toHaveLength(1);
  });

  test("concurrent response streams retain separate cursors and response ids", async () => {
    const requests = new Map<string, string | number>();
    const h = harness(wire => {
      if (wire.rpc?.method === "tools/call") {
        const cursor = `request-${wire.rpc.id}`; requests.set(cursor, wire.rpc.id!); return sse(wire, [frame(cursor)]);
      }
      const cursor = wire.headers.get("last-event-id");
      if (cursor) return sse(wire, [frame(`${cursor}-result`, { jsonrpc: "2.0", id: requests.get(cursor),
        result: { content: [{ type: "text", text: cursor }] } })]);
    });
    await h.connect(); const both = Promise.all([h.call(), h.call()]); await vi.advanceTimersByTimeAsync(250);
    const results = await both;
    expect(new Set(results.map(value => JSON.stringify(value.content))).size).toBe(2);
    expect(h.posts("tools/call")).toHaveLength(2); expect(h.resumes()).toHaveLength(2); expect(h.errors).toEqual([]);
  });

  test("a JSON-RPC error completes a resumed POST stream without starting another SDK reconnect loop", async () => {
    let requestId: string | number | undefined;
    const h = harness(wire => {
      if (wire.rpc?.method === "tools/call") { requestId = wire.rpc.id; return sse(wire, [frame("error-prime")]); }
      if (wire.headers.has("last-event-id")) return sse(wire, [frame("error-result", {
        jsonrpc: "2.0", id: requestId, error: { code: -32603, message: "synthetic remote failure" }
      })]);
    });
    await h.connect(); const failed = expect(h.call()).rejects.toMatchObject({ code: -32603 });
    await vi.advanceTimersByTimeAsync(2000); await failed;
    expect(h.resumes()).toHaveLength(1); expect(h.errors).toEqual([]); expect(h.transport.failureMessage).toBeUndefined();
    await expect(h.client.ping()).resolves.toEqual({});
  });

  test.each(["absent", "cleared", "id-less-after-checkpoint"] as const)("refuses unsafe %s cursor recovery instead of reposting", async mode => {
    const notice = { jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: "p03", progress: 1 } };
    const h = harness(wire => {
      if (wire.rpc?.method !== "tools/call") return;
      const data = mode === "absent" ? ": connected\n\n" : mode === "cleared" ? frame("prior") + "id:\ndata:\n\n"
        : frame("prior") + `data: ${JSON.stringify(notice)}\n\n`;
      return sse(wire, [data]);
    });
    await h.connect(); const failed = expect(h.call()).rejects.toBeDefined(); await vi.advanceTimersByTimeAsync(1000); await failed;
    expect(h.transport.failureCode).toBe("STREAM_NOT_RESUMABLE"); expect(h.resumes()).toHaveLength(0); expect(h.posts("tools/call")).toHaveLength(1);
  });

  test.each([401, 403, 404, 307, 200] as const)("refuses auth/session/origin changes on resumed GET (HTTP %s)", async status => {
    const h = harness(wire => {
      if (wire.rpc?.method === "tools/call") return sse(wire, [frame("boundary-cursor")]);
      if (wire.headers.has("last-event-id")) return reply(status, SECRET, {
        "content-type": "text/event-stream", "www-authenticate": 'Bearer resource_metadata="https://must-not-follow.invalid/oauth"',
        location: "https://must-not-follow.invalid/mcp", ...(status === 200 ? { "mcp-session-id": "replacement-session" } : {})
      });
    });
    await h.connect(); const failed = expect(h.call()).rejects.toBeDefined(); await vi.advanceTimersByTimeAsync(10_000); await failed;
    expect(h.transport.failureCode).toBe(status === 401 || status === 403 ? "AUTH_REQUIRED" : status === 404 ? "SESSION_EXPIRED" : status === 200 ? "SESSION_CHANGED" : "REFUSED");
    expect(h.transport.failureMessage).not.toContain(SECRET); expect(h.resumes()).toHaveLength(1); expect(h.posts("initialize")).toHaveLength(1);
    expect(h.calls.every(wire => wire.url === ENDPOINT && wire.headers.get("mcp-session-id") !== "replacement-session")).toBe(true);
  });

  test("does not remap a resumed response from a different request", async () => {
    const h = harness(wire => {
      if (wire.rpc?.method === "tools/call") return sse(wire, [frame("wrong-id-prime")]);
      if (wire.headers.has("last-event-id")) return sse(wire, [frame("wrong-id-response", { jsonrpc: "2.0", id: 99999, result: { content: [] } })]);
    });
    await h.connect(); const failed = expect(h.call()).rejects.toBeDefined(); await vi.advanceTimersByTimeAsync(250); await failed;
    expect(h.transport.failureCode).toBe("PROTOCOL_ERROR"); expect(h.posts("tools/call")).toHaveLength(1);
  });

  test("notification recovery gates new tool dispatch and keeps the original absolute lifetime", async () => {
    const h = harness(wire => {
      if (wire.method !== "GET") return;
      return wire.headers.has("last-event-id") ? sse(wire, [": recovered\n\n"], "hold") : sse(wire, [frame("notify-prime")]);
    }, { notificationLifetimeMs: 1500 });
    await h.connect(); expect(h.transport.recoveryGeneration).toBe(1);
    let ready = false; const waiting = h.transport.waitForRecovery().then(() => { ready = true; });
    await expect(h.transport.send({ jsonrpc: "2.0", id: 500, method: "tools/call", params: { name: "side_effect" } })).rejects.toThrow(/no new tool call/);
    expect(h.posts("tools/call")).toHaveLength(0); expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(250); await waiting; expect(ready).toBe(true);
    await vi.advanceTimersByTimeAsync(1249); expect(h.transport.failureMessage).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1); expect(h.transport.failureCode).toBe("TIMED_OUT"); expect(h.transport.failureTimedOut).toBe(true);
    expect(h.calls.filter(wire => wire.method === "GET")).toHaveLength(2); expect(h.posts("initialize")).toHaveLength(1);
  });

  test("repeated successful-but-empty reconnects cannot reset the retry budget", async () => {
    let get = 0;
    const h = harness(wire => wire.method === "GET" ? sse(wire, [frame(`flapping-${++get}`)]) : undefined);
    await h.connect(); await vi.advanceTimersByTimeAsync(2000);
    expect(get).toBe(4); expect(h.transport.failureCode).toBe("RETRY_EXHAUSTED"); expect(h.posts("initialize")).toHaveLength(1);
  });

  test("200 resume headers with no complete frame cannot hold the mount indefinitely", async () => {
    const h = harness(wire => {
      if (wire.method !== "GET") return;
      return wire.headers.has("last-event-id") ? sse(wire, [], "hold") : sse(wire, [frame("stalled-prime")]);
    }, { timeoutMs: 1000 });
    await h.connect(); await vi.advanceTimersByTimeAsync(6000);
    expect(h.transport.failureCode).toBe("RETRY_EXHAUSTED"); expect(h.resumes()).toHaveLength(3);
  });

  test("closing during backoff is idempotent and cancels all future GET recovery", async () => {
    const h = harness(wire => wire.rpc?.method === "tools/call" ? sse(wire, [frame("cancel-prime")]) : undefined);
    await h.connect(); const failed = expect(h.call()).rejects.toBeDefined(); await vi.advanceTimersByTimeAsync(0);
    const closing = h.transport.close(); expect(h.transport.close()).toBe(closing); await closing; await failed;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.resumes()).toHaveLength(0); expect(h.posts("tools/call")).toHaveLength(1);
    expect(h.calls.filter(wire => wire.method === "DELETE")).toHaveLength(1);
  });

  test("closing aborts an in-flight resume GET and rejects readiness waits", async () => {
    const h = harness(wire => {
      if (wire.method === "GET" && !wire.headers.has("last-event-id")) return sse(wire, [frame("inflight-prime")]);
      if (wire.headers.has("last-event-id")) return new Promise<Response>((_resolve, reject) => {
        wire.signal.addEventListener("abort", () => reject(new Error(SECRET)), { once: true });
      });
    });
    await h.connect(); const waiting = expect(h.transport.waitForRecovery()).rejects.toMatchObject({ code: "CANCELLED" });
    await vi.advanceTimersByTimeAsync(250); expect(h.resumes()).toHaveLength(1);
    await h.transport.close(); await waiting; await vi.advanceTimersByTimeAsync(10_000);
    expect(h.resumes()).toHaveLength(1); expect(h.resumes()[0]!.signal.aborted).toBe(true);
  });

  test("duplicate tool request ids and externally supplied resumption tokens never dispatch", async () => {
    const h = harness(); await h.connect();
    const request: JSONRPCMessage = { jsonrpc: "2.0", id: "direct-tool", method: "tools/call", params: { name: "side_effect" } };
    // A raw transport observer avoids the SDK rejecting an intentionally unregistered id.
    h.transport.onmessage = () => {};
    await h.transport.send(request);
    await expect(h.transport.send(request)).rejects.toThrow(/Duplicate/);
    await expect(h.transport.send({ ...request, id: "another" }, { resumptionToken: "foreign-cursor" })).rejects.toThrow(/external resumption/);
    expect(h.posts("tools/call")).toHaveLength(1); expect(h.resumes()).toHaveLength(0);
    expect(() => h.transport.setProtocolVersion("2024-11-05")).toThrow(/protocol version changed/);
  });

  test("split CRLF and UTF-8 are preserved within a response but incomplete decoder state is discarded on recovery", async () => {
    let requestId: string | number | undefined;
    const h = harness(wire => {
      if (wire.rpc?.method === "tools/call") {
        requestId = wire.rpc.id;
        return sse(wire, ["id: unicode-prime\r", "\ndata:\r", "\n\r", "\nid: partial\r\ndata: {\"text\":\"", new Uint8Array([0xe2])]);
      }
      if (wire.headers.has("last-event-id")) {
        const bytes = ENCODER.encode(frame("unicode-result", { jsonrpc: "2.0", id: requestId, result: { content: [{ type: "text", text: "✓" }] } }));
        const split = bytes.indexOf(0xe2) + 1;
        return sse(wire, [bytes.slice(0, split), bytes.slice(split)]);
      }
    });
    await h.connect(); const calling = h.call(); await vi.advanceTimersByTimeAsync(250);
    expect(await calling).toMatchObject({ content: [{ text: "✓" }] });
    expect(h.resumes()[0]!.headers.get("last-event-id")).toBe("unicode-prime"); expect(h.errors).toEqual([]);
  });

  test.each(["declared", "streamed"] as const)("recovered SSE still enforces the %s per-response size bound without further retry", async size => {
    const h = harness(wire => {
      if (wire.rpc?.method === "tools/call") return sse(wire, [frame("size-prime")]);
      if (wire.headers.has("last-event-id")) return size === "declared"
        ? sse(wire, [], "end", { "content-length": String(NATIVE_MCP_HTTP_LIMITS.responseBytes + 1) })
        : sse(wire, [new Uint8Array(NATIVE_MCP_HTTP_LIMITS.responseBytes + 1)]);
    });
    await h.connect(); const failed = expect(h.call()).rejects.toBeDefined(); await vi.advanceTimersByTimeAsync(1000); await failed;
    expect(h.transport.failureCode).toBe("BOUND_EXCEEDED"); expect(h.resumes()).toHaveLength(1); expect(h.posts("tools/call")).toHaveLength(1);
  });

  test("normalized credential values are also redacted, including bare bearer tokens", async () => {
    const h = harness(undefined, { headers: { Authorization: `  Bearer ${SECRET}  ` } });
    await h.connect();
    expect(h.calls.every(wire => wire.headers.get("authorization") === `Bearer ${SECRET}`)).toBe(true);
    expect(h.transport.redactString(`Bearer ${SECRET} and ${SECRET}`)).toBe("[REDACTED] and [REDACTED]");
  });

  test("authentication failure is not replaced by a second failure terminating the same session", async () => {
    const h = harness(wire => wire.rpc?.method === "tools/list" || wire.method === "DELETE" ? reply(401, SECRET) : undefined);
    await expect(discoverNativeMcpCatalog(h.server, process.cwd())).rejects.toThrow(/headerRefs/);
    expect(h.posts("initialize")).toHaveLength(1); expect(h.calls.filter(wire => wire.method === "DELETE")).toHaveLength(1);
  });

  test("a slow original tool POST keeps its configured timeout rather than the shorter GET recovery header deadline", async () => {
    const h = harness(wire => wire.rpc?.method === "tools/call" ? new Promise<Response>(resolve => {
      setTimeout(() => resolve(result(wire.rpc!.id, { content: [{ type: "text", text: "slow original result" }] })), 12_000);
    }) : undefined, { timeoutMs: 20_000 });
    await h.connect(); const calling = h.call();
    await vi.advanceTimersByTimeAsync(11_000); expect(h.transport.failureMessage).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await calling).toMatchObject({ content: [{ text: "slow original result" }] });
    expect(h.posts("tools/call")).toHaveLength(1); expect(h.resumes()).toHaveLength(0);
  });
});
