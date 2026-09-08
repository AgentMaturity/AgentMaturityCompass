import { createServer, request, type IncomingHttpHeaders, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceRuntimeClosingError, WorkspaceRuntimeRegistry } from "../src/workspaces/workspaceRuntimeRegistry.js";
import { proxyStudioWorkspaceRequest } from "../src/workspaces/workspaceStudioProxy.js";
import { assertNativeBrowserAdmission, isNativeProtectedPath, NativeAdmissionError, nativeCsrfTokenForSession,
  NATIVE_CSRF_HEADER, NATIVE_INTENT_HEADER, NATIVE_INTENT_VALUE } from "../src/studio/nativeAdmission.js";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const closers: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of closers.splice(0).reverse()) await close(); });

describe("hosted workspace runtime ownership", () => {
  it("shares the pending initialization across concurrent requests and closes its one runtime once", async () => {
    const registry = new WorkspaceRuntimeRegistry<{ close(): Promise<void> }>();
    const runtime = { close: vi.fn(async () => {}) };
    const ready = deferred<typeof runtime>();
    const factory = vi.fn(() => ready.promise);
    const first = registry.getOrCreate("review", factory), second = registry.getOrCreate("review", factory);
    expect(first).toBe(second);
    await Promise.resolve(); expect(factory).toHaveBeenCalledTimes(1);
    ready.resolve(runtime); expect(await first).toBe(runtime);
    expect(await registry.getOrCreate("review", factory)).toBe(runtime);
    const shutdown = registry.close(); expect(registry.close()).toBe(shutdown);
    await shutdown; expect(runtime.close).toHaveBeenCalledTimes(1);
  });

  it("fences an initialization queued before shutdown before invoking its factory", async () => {
    const registry = new WorkspaceRuntimeRegistry<{ close(): Promise<void> }>();
    const factory = vi.fn(async () => ({ close: async () => {} }));
    const pending = registry.getOrCreate("queued", factory);
    const refusal = expect(pending).rejects.toBeInstanceOf(WorkspaceRuntimeClosingError);
    await registry.close(); await refusal;
    expect(factory).not.toHaveBeenCalled(); expect(registry.closing).toBe(true);
    await expect(registry.getOrCreate("new", factory)).rejects.toBeInstanceOf(WorkspaceRuntimeClosingError);
    expect(factory).not.toHaveBeenCalled();
  });

  it("drains a started but unresolved initialization and cannot leave a hidden late server", async () => {
    const registry = new WorkspaceRuntimeRegistry<{ close(): Promise<void> }>();
    const started = deferred<void>(), ready = deferred<{ close(): Promise<void> }>();
    const runtime = { close: vi.fn(async () => {}) };
    const pending = registry.getOrCreate("slow", () => { started.resolve(); return ready.promise; });
    await started.promise;
    let closed = false;
    const shutdown = registry.close().then(() => { closed = true; });
    await Promise.resolve(); expect(closed).toBe(false);
    const unwanted = vi.fn(async () => runtime);
    await expect(registry.getOrCreate("slow", unwanted)).rejects.toBeInstanceOf(WorkspaceRuntimeClosingError);
    ready.resolve(runtime); await pending; await shutdown;
    expect(unwanted).not.toHaveBeenCalled(); expect(runtime.close).toHaveBeenCalledTimes(1);
  });

  it("permits a retry after a failed start while open, without retaining the rejected promise", async () => {
    const registry = new WorkspaceRuntimeRegistry<{ close(): Promise<void> }>();
    await expect(registry.getOrCreate("retry", async () => { throw new Error("bind failed"); })).rejects.toThrow("bind failed");
    const runtime = { close: vi.fn(async () => {}) };
    expect(await registry.getOrCreate("retry", async () => runtime)).toBe(runtime);
    await registry.close(); expect(runtime.close).toHaveBeenCalledTimes(1);
  });

  it("continues draining the other workspaces when one runtime close fails and reports that failure", async () => {
    const registry = new WorkspaceRuntimeRegistry<{ close(): Promise<void> }>();
    const broken = { close: vi.fn(async () => { throw new Error("child still alive"); }) };
    const healthy = { close: vi.fn(async () => {}) };
    await registry.getOrCreate("broken", async () => broken); await registry.getOrCreate("healthy", async () => healthy);
    const shutdown = registry.close(); await expect(shutdown).rejects.toThrow("did not close cleanly");
    expect(registry.close()).toBe(shutdown);
    expect(broken.close).toHaveBeenCalledTimes(1); expect(healthy.close).toHaveBeenCalledTimes(1);
  });
});

async function listen(server: Server): Promise<number> {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  closers.push(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No fixture port.");
  return address.port;
}

async function proxyFixture() {
  const seen: Array<{ path: string; headers: IncomingHttpHeaders; body: string }> = [];
  const upstreamClosed = deferred<void>();
  const upstream = createServer((req, res) => {
    if (req.url?.includes("stream=1")) {
      res.once("close", () => upstreamClosed.resolve());
      res.writeHead(200, { "content-type": "text/event-stream" }); res.write("data: started\n\n"); return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const row = { path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString("utf8") };
      seen.push(row); res.setHeader("content-type", "application/json"); res.end(JSON.stringify(row));
    });
  });
  const upstreamPort = await listen(upstream);
  const proof = nativeCsrfTokenForSession({ nonce: "hosted-signed-session-nonce" });
  let origin = "";
  // The outer HTTP harness supplies an already verified actor. It exercises the production
  // native guard + proxy, including its second-hop headers, independently from host DB setup.
  const outer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://outer.invalid");
    const target = url.pathname.replace(/^\/w\/review/, "") + url.search;
    if (isNativeProtectedPath(new URL(target, "http://inner.invalid").pathname, req.method ?? "GET")) {
      try { assertNativeBrowserAdmission({ req, actor: { isAdmin: false, userId: "host-user-1", nativeCsrfToken: proof }, allowedOrigins: [origin] }); }
      catch (error) {
        if (!(error instanceof NativeAdmissionError)) throw error;
        res.statusCode = error.statusCode; res.end(JSON.stringify({ code: error.code })); return;
      }
    }
    void proxyStudioWorkspaceRequest(req, res, { host: "127.0.0.1", port: upstreamPort }, target);
  });
  const outerPort = await listen(outer); origin = `http://127.0.0.1:${outerPort}`;
  return { origin, upstreamPort, seen, upstreamClosed: upstreamClosed.promise,
    headers: { origin, [NATIVE_INTENT_HEADER]: NATIVE_INTENT_VALUE, [NATIVE_CSRF_HEADER]: proof, "x-amc-admin-token": "caller-cannot-promote-this" } };
}

describe("hosted native proxy preserves checked browser proof and query identity", () => {
  it("forwards native agent/cursor and checked origin/host while stripping client admin authority", async () => {
    const f = await proxyFixture();
    const response = await fetch(`${f.origin}/w/review/api/v1/native-tasks/task-123456?agentId=reviewer&cursor=42`, { headers: f.headers });
    expect(response.status).toBe(200); await response.text();
    expect(f.seen).toHaveLength(1);
    expect(f.seen[0]).toMatchObject({ path: "/api/v1/native-tasks/task-123456?agentId=reviewer&cursor=42",
      headers: { host: new URL(f.origin).host, origin: f.origin, [NATIVE_CSRF_HEADER]: f.headers[NATIVE_CSRF_HEADER] } });
    expect(f.seen[0]?.headers["x-amc-admin-token"]).toBeUndefined();
  });

  it.each(["/approvals/apr-1/approve", "/approvals/apr-1/deny", "/approvals/requests/apr-1/decide", "/approvals/requests/apr-1/cancel"])("keeps the same protected second hop for %s", async path => {
    const f = await proxyFixture();
    const response = await fetch(`${f.origin}/w/review${path}?agentId=reviewer`, { method: "POST", headers: { ...f.headers, "content-type": "application/json" }, body: '{"reason":"reviewed"}' });
    expect(response.status).toBe(200); await response.text();
    expect(f.seen[0]).toMatchObject({ path: `${path}?agentId=reviewer`, body: '{"reason":"reviewed"}', headers: { host: new URL(f.origin).host, origin: f.origin } });
    expect(f.seen[0]?.headers["x-amc-admin-token"]).toBeUndefined();
  });

  it("refuses hostile origin before forwarding rather than stripping the evidence of its origin", async () => {
    const f = await proxyFixture();
    const response = await fetch(`${f.origin}/w/review/api/v1/native-tasks`, { method: "POST",
      headers: { ...f.headers, origin: "https://attacker.invalid", "x-forwarded-host": new URL(f.origin).host }, body: "{}" });
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ code: "NATIVE_ORIGIN_DENIED" });
    expect(f.seen).toEqual([]);
  });

  it.each(["/api/v1/native-tasks-lookalike", "/approvals/apr-1/approve/extra"])("preserves ordinary proxy behavior for the nonmatching path %s", async path => {
    const f = await proxyFixture();
    const response = await fetch(`${f.origin}/w/review${path}`, { method: "POST", headers: f.headers, body: "{}" });
    expect(response.status).toBe(200); await response.text();
    expect(f.seen[0]?.headers.host).toBe(`127.0.0.1:${f.upstreamPort}`);
    expect(f.seen[0]?.headers.origin).toBeUndefined(); expect(f.seen[0]?.headers["x-amc-admin-token"]).toBeUndefined();
  });

  it("closes a native upstream stream when its downstream disconnects and serves the next request", async () => {
    const f = await proxyFixture();
    await new Promise<void>((resolve, reject) => {
      const client = request(`${f.origin}/w/review/api/v1/native-tasks/task-123456?stream=1`, { headers: f.headers }, response => {
        response.once("data", () => { response.destroy(); client.destroy(); resolve(); });
        response.once("error", error => { if (!response.destroyed) reject(error); });
      });
      client.once("error", error => { if (!client.destroyed) reject(error); }); client.end();
    });
    await f.upstreamClosed;
    const next = await fetch(`${f.origin}/w/review/api/v1/native-tasks/options?agentId=reviewer`, { headers: f.headers });
    expect(next.status).toBe(200); await next.text(); expect(f.seen).toHaveLength(1);
  }, 10_000);
});
