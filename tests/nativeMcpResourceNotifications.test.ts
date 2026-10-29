import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ListResourcesResultSchema, ResourceListChangedNotificationSchema, type JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NativeMcpHttpTransport } from "../src/mcp/nativeMcpHttpTransport.js";
import { NativeMcpHttpRefused, NativeMcpReconnectBudget, NativeMcpReconnectCursors } from "../src/mcp/nativeMcpReconnect.js";
import { nativeMcpRecoverableStream } from "../src/mcp/nativeMcpReconnectStream.js";
import { statelessRequestMeta } from "../src/mcp/protocol/version.js";

const ORIGIN = "https://resource-notifications.invalid", ENDPOINT = `${ORIGIN}/mcp`;
const SESSION = "synthetic-resource-notification-session", URI = "resource://fixture/docs/pinned";
const NOTICE = { jsonrpc: "2.0", method: "notifications/resources/list_changed" } as const;
const disposals: (() => Promise<void>)[] = [];
beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }); });
afterEach(async () => {
  try { for (const dispose of disposals.splice(0).reverse()) await dispose(); }
  finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
});
function response(status: number, value: unknown = null, sse = false, legacy = true): Response {
  const reply = new Response(value === null ? null : sse ? String(value) : JSON.stringify(value), {
    status, headers: { "content-type": sse ? "text/event-stream" : "application/json", ...(legacy ? { "mcp-session-id": SESSION } : {}) }
  });
  Object.defineProperty(reply, "url", { value: ENDPOINT }); return reply;
}
const frame = (message: unknown) => `event: message\ndata: ${JSON.stringify(message)}\n\n`;
function harness(mode: "legacy" | "stateless") {
  const calls: { method: string; rpc?: string }[] = [];
  const transport = new NativeMcpHttpTransport({ transport: "streamable-http", id: "fixture", url: ENDPOINT, origin: ORIGIN,
    timeoutMs: 5000, notificationLifetimeMs: 60_000 }, 5000);
  const client = new Client({ name: "resource-notice-fixture", version: "1" }, { capabilities: {} });
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    expect(String(input)).toBe(ENDPOINT); expect(init.signal).toBeDefined();
    const rpc = typeof init.body === "string" ? JSON.parse(init.body) as { id?: number | string; method?: string; params?: Record<string, unknown> } : {};
    calls.push({ method: init.method ?? "GET", rpc: rpc.method });
    if (init.method === "DELETE") return response(204);
    if ((init.method ?? "GET") === "GET") return response(405);
    if (rpc.method === "notifications/initialized") return response(202);
    if (rpc.method === "initialize") return response(200, { jsonrpc: "2.0", id: rpc.id, result: {
      protocolVersion: rpc.params?.protocolVersion, capabilities: { resources: { listChanged: true } }, serverInfo: { name: "fixture", version: "1" }
    } });
    if (rpc.method === "resources/list") return response(200, [NOTICE, { jsonrpc: "2.0", id: rpc.id, result: { resources: [] } }]);
    if (rpc.method === "resources/read" && mode === "stateless") return response(200,
      frame(NOTICE) + frame({ jsonrpc: "2.0", id: rpc.id, result: { contents: [{ uri: URI, text: "external text" }] } }), true, false);
    throw new Error("Unexpected synthetic resource-notification request");
  }));
  disposals.push(async () => { try { await client.close(); } finally { await transport.close(); } });
  return { transport, client, calls };
}

describe("resource catalog notification latches without live sockets", () => {
  test("an incoming SDK resource notification invalidates transport recovery independently of the SSE parser", async () => {
    const f = harness("legacy"), notified = vi.fn();
    f.client.setNotificationHandler(ResourceListChangedNotificationSchema, notified);
    await f.client.connect(f.transport, { timeout: 5000 }); await vi.advanceTimersByTimeAsync(0);
    await expect(f.client.request({ method: "resources/list", params: {} }, ListResourcesResultSchema)).resolves.toEqual({ resources: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(notified).toHaveBeenCalledTimes(1);
    await expect(f.transport.waitForRecovery()).rejects.toMatchObject({ code: "NOT_DISPATCHED" });
    expect(f.calls.some(call => call.rpc === "resources/read")).toBe(false);
  });

  test("a resource notice in a recoverable legacy POST stream latches before delivering its terminal response", async () => {
    const abort = new AbortController(), order: string[] = [];
    const terminal = { jsonrpc: "2.0", id: 7, result: { contents: [{ uri: URI, text: "external text" }] } };
    const onCatalogChanged = vi.fn(() => { order.push("catalog-changed"); }), resume = vi.fn();
    const cleanup = vi.fn(), cancel = vi.fn();
    const stream = nativeMcpRecoverableStream({
      first: { response: response(200, frame(NOTICE) + frame(terminal), true), release: vi.fn(), cancel },
      streamId: 1, requestId: 7, signal: abort.signal,
      budget: new NativeMcpReconnectBudget(abort.signal, Date.now() + 30_000), cursors: new NativeMcpReconnectCursors(),
      responseByteLimit: 1024 * 1024, recoveryTimeoutMs: 1000, charge: vi.fn(), resume,
      onGap: vi.fn(), onRecovered: vi.fn(), onCatalogChanged, cleanup,
      onFailure: () => new NativeMcpHttpRefused("Unexpected synthetic stream failure", "PROTOCOL_ERROR")
    });
    const rendered = await new Response(stream).text(); order.push("consumer-received");
    expect(onCatalogChanged).toHaveBeenCalledTimes(1); expect(order).toEqual(["catalog-changed", "consumer-received"]);
    expect(rendered).toContain(JSON.stringify(NOTICE)); expect(rendered).toContain(JSON.stringify(terminal));
    expect(resume).not.toHaveBeenCalled(); expect(cleanup).toHaveBeenCalledTimes(1); expect(cancel).toHaveBeenCalledTimes(1);
  });

  test("a stateless SSE resource notice invalidates recovery even though only the terminal response reaches the SDK", async () => {
    const f = harness("stateless"), delivered: JSONRPCMessage[] = [];
    f.transport.onmessage = message => delivered.push(message);
    f.transport.beginStatelessProbe(); await f.transport.start(); f.transport.useStateless();
    await f.transport.send({ jsonrpc: "2.0", id: 9, method: "resources/read", params: { uri: URI, _meta: statelessRequestMeta() } });
    expect(delivered).toEqual([{ jsonrpc: "2.0", id: 9, result: { contents: [{ uri: URI, text: "external text" }] } }]);
    await expect(f.transport.waitForRecovery()).rejects.toMatchObject({ code: "NOT_DISPATCHED" });
    expect(f.calls).toEqual([{ method: "POST", rpc: "resources/read" }]);
  });
});
