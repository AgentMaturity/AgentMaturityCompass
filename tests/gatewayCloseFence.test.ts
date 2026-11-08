import { EventEmitter } from "node:events";
import { createServer, request as httpRequest, type Server, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createTcpServer, type Server as TcpServer } from "node:net";
import type { Duplex } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, expect, test, vi } from "vitest";
import { initGatewayConfig, type GatewayConfig } from "../src/gateway/config.js";
import { createCloseFence } from "../src/gateway/gatewayClose.js";
import { startGateway } from "../src/gateway/server.js";
import { openLedger } from "../src/ledger/ledger.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * The gateway close fence (the runtime order's LIVE-RUNTIME-02 items 1-3, owned by the integrity lane): a bounded close
 * that aborts a slow upstream call, seals the session over its true last row, and lets no late handler write after it.
 */
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.unstubAllEnvs(); });

function gatewayConfig(upstreamPort: number): GatewayConfig {
  return {
    listen: { host: "127.0.0.1", port: 0 },
    redaction: { headerKeysDenylist: ["authorization", "x-api-key"], jsonPathsDenylist: [], textRegexDenylist: [] },
    upstreams: { test: { baseUrl: `http://127.0.0.1:${upstreamPort}`, auth: { type: "none" }, allowLocalhost: true } },
    routes: [{ prefix: "/test", upstream: "test", stripPrefix: true, openaiCompatible: true }],
    lease: { allowQueryCarrier: false }, streamPassthrough: false,
    proxy: { enabled: false, port: 3299, allowlistHosts: [], denyByDefault: true }
  } as GatewayConfig;
}

function post(url: string, lease: string): Promise<number> {
  const body = JSON.stringify({ model: "m", messages: [{ role: "user", content: "hi" }] });
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method: "POST", agent: false, headers: { "content-type": "application/json",
      "content-length": Buffer.byteLength(body), "x-amc-agent-id": "default", "x-amc-lease": lease } }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode ?? 0));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end(body);
  });
}

test("close() is bounded, aborts the slow upstream call, seals over the last row, and nothing lands after the seal", { timeout: 60_000 }, async () => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-gateway-close-fence");
  const root = mkdtempSync(join(tmpdir(), "amc-gateway-close-fence-"));
  cleanups.push(() => { lockVault(root); rmSync(root, { recursive: true, force: true }); });
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => { rejections.push(reason); };
  process.on("unhandledRejection", onRejection);
  cleanups.push(() => { process.off("unhandledRejection", onRejection); });

  let arrived!: () => void;
  const upstreamReached = new Promise<void>((resolve) => { arrived = resolve; });
  const timers: NodeJS.Timeout[] = [];
  let upstreamAborted = false;
  const upstream: Server = createServer((req, res) => {
    req.resume();
    res.on("close", () => { if (!res.writableEnded) upstreamAborted = true; });
    req.on("end", () => {
      arrived();
      timers.push(setTimeout(() => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ id: "late", model: "m" })); }, 10_000));
    });
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => { timers.forEach(clearTimeout); upstream.closeAllConnections(); upstream.close(() => resolve()); }));
  initGatewayConfig(root, gatewayConfig((upstream.address() as { port: number }).port));

  const gateway = await startGateway({ workspace: root, logger: { log() {}, error() {} } });
  const lease = issueLeaseForCli({ workspace: root, agentId: "default", ttl: "60m", scopes: "gateway:llm", routes: "/test", models: "*",
    rpm: 1000, tpm: 1_000_000, maxCostUsdPerDay: null }).token;
  const url = `http://${gateway.host}:${gateway.port}/test/v1/chat/completions`;
  const inFlight = post(url, lease).then((status) => ({ status }), (error: unknown) => ({ error }));
  await upstreamReached;

  const started = Date.now();
  const closing = gateway.close();
  const after = await post(url, lease).then((status) => ({ status }), (error: unknown) => ({ error }));
  expect("status" in after ? after.status : "connection error").toEqual(expect.toBeOneOf([503, "connection error"]));
  await closing;
  expect(Date.now() - started).toBeLessThan(4_000);
  expect(await inFlight).not.toEqual({ status: 200 });

  const count = () => {
    const ledger = openLedger(root, { readonly: true });
    try {
      const rows = ledger.getAllEvents().filter((event) => event.session_id === gateway.gatewaySessionId);
      const session = ledger.getAllSessions().find((row) => row.session_id === gateway.gatewaySessionId)!;
      return { rows: rows.length, last: rows.at(-1)!.event_hash, session };
    } finally { ledger.close(); }
  };
  const sealed = count();
  expect(sealed.session).toMatchObject({ ended_ts: expect.any(Number), session_seal_sig: expect.any(String), session_final_event_hash: sealed.last });
  await delay(500);
  expect(count().rows).toBe(sealed.rows);
  expect(upstreamAborted).toBe(true); // the gateway cancelled its upstream call instead of waiting 10 s for it
  expect(rejections).toEqual([]);
});

/** A response stand-in: records what admit() writes and emits "close" when the test ends the request. */
function fakeResponse() {
  return Object.assign(new EventEmitter(), {
    statusCode: 200, headers: {} as Record<string, string>, body: "",
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(body = "") { this.body = body; }
  });
}
const parts = (order: string[]) => ({ servers: [], session: { close: () => order.push("seal") }, ledger: { close: () => order.push("ledger") },
  credentials: { close: async () => { order.push("credentials"); } } });

test("the fence admits until close starts, waits for in-flight requests, aborts, seals, then answers 503", async () => {
  const fence = createCloseFence({ drainMs: 5_000, settleMs: 50 });
  const inFlight = fakeResponse();
  expect(fence.admit(inFlight as unknown as ServerResponse)).toBe(true);
  const order: string[] = [];
  fence.signal.addEventListener("abort", () => order.push("abort"));
  const closing = fence.close(parts(order));
  expect(fence.close(parts(order))).toBe(closing);
  const late = fakeResponse();
  expect(fence.admit(late as unknown as ServerResponse)).toBe(false);
  expect(late).toMatchObject({ statusCode: 503, headers: { "content-type": "application/json" }, body: '{"error":"gateway shutting down"}' });
  await delay(20);
  expect(order).toEqual([]); // still draining the admitted request
  inFlight.emit("close");
  await closing;
  expect(order).toEqual(["abort", "seal", "ledger", "credentials"]);
});

test("the drain is bounded: a request that never ends is aborted after drainMs", async () => {
  const fence = createCloseFence({ drainMs: 30, settleMs: 10 });
  expect(fence.admit(fakeResponse() as unknown as ServerResponse)).toBe(true);
  const started = Date.now();
  await fence.close(parts([]));
  expect(fence.signal.aborted).toBe(true);
  expect(Date.now() - started).toBeLessThan(1_000);
});

/** A socket stand-in: records what admitTunnel() writes; destroy() emits "close" once, later, as a net.Socket does. */
class FakeSocket extends EventEmitter {
  written = "";
  destroyed = false;
  end(chunk = "", done?: () => void): this { this.written += chunk; done?.(); return this; }
  destroy(): this { if (!this.destroyed) { this.destroyed = true; queueMicrotask(() => this.emit("close")); } return this; }
}
const fakeSocket = () => new FakeSocket();

test("CONNECT tunnels: an admitted one holds the drain and is destroyed when it ends, before the seal; one opened while closing gets 503", async () => {
  const fence = createCloseFence({ drainMs: 50, settleMs: 50 });
  const tunnel = fakeSocket();
  expect(fence.admitTunnel(tunnel as unknown as Duplex)).toBe(true);
  const order: string[] = [];
  fence.signal.addEventListener("abort", () => order.push("abort"));
  tunnel.on("close", () => order.push("tunnel closed"));
  const closing = fence.close(parts(order));
  const late = fakeSocket();
  expect(fence.admitTunnel(late as unknown as Duplex)).toBe(false);
  expect(late.written).toMatch(/^HTTP\/1\.1 503 Service Unavailable\r\n[\s\S]*\r\n\r\n\{"error":"gateway shutting down"\}$/);
  expect(late.destroyed).toBe(true);
  await delay(20);
  expect(order).toEqual([]); // still draining the admitted tunnel
  await closing;
  expect(order).toEqual(["abort", "tunnel closed", "seal", "ledger", "credentials"]);
});

test("close() ends an open CONNECT tunnel within the bound and records it before the seal (skeptic: tunnels were outside the fence)", { timeout: 60_000 }, async () => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-gateway-close-fence-connect");
  const root = mkdtempSync(join(tmpdir(), "amc-gateway-close-connect-"));
  cleanups.push(() => { lockVault(root); rmSync(root, { recursive: true, force: true }); });
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  const echoSockets = new Set<Duplex>();
  const echo: TcpServer = createTcpServer((socket) => { echoSockets.add(socket); socket.on("error", () => socket.destroy()); socket.pipe(socket); });
  await new Promise<void>((resolve) => echo.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => { echoSockets.forEach((socket) => socket.destroy()); echo.close(() => resolve()); }));
  const echoPort = (echo.address() as { port: number }).port;
  initGatewayConfig(root, { ...gatewayConfig(echoPort), proxy: { enabled: true, port: 3299, allowlistHosts: ["127.0.0.1"], denyByDefault: true } } as GatewayConfig); // proxyPort: 0 below overrides the port
  const gateway = await startGateway({ workspace: root, listenPort: 0, proxyPort: 0, logger: { log() {}, error() {} } });
  const lease = issueLeaseForCli({ workspace: root, agentId: "default", ttl: "60m", scopes: "gateway:llm,proxy:connect", routes: "/test", models: "*",
    rpm: 1000, tpm: 1_000_000, maxCostUsdPerDay: null }).token;
  const tunnel = await new Promise<Duplex>((resolve, reject) => {
    const req = httpRequest({ host: gateway.host, port: gateway.proxyPort!, method: "CONNECT", path: `127.0.0.1:${echoPort}`, agent: false,
      headers: { "x-amc-agent-id": "default", "x-amc-lease": lease } });
    req.on("connect", (res, socket) => res.statusCode === 200 ? resolve(socket) : reject(new Error(`CONNECT answered ${res.statusCode}`)));
    req.on("error", reject);
    req.end();
  });
  cleanups.push(() => { tunnel.destroy(); });
  const echoed = new Promise<string>((resolve) => tunnel.once("data", (chunk: Buffer) => resolve(chunk.toString())));
  tunnel.write("ping");
  expect(await echoed).toBe("ping");
  let tunnelClosed = false;
  tunnel.on("close", () => { tunnelClosed = true; });
  tunnel.on("error", () => {});

  const started = Date.now();
  await gateway.close();
  expect(Date.now() - started).toBeLessThan(5_000);
  await delay(200);
  expect(tunnelClosed).toBe(true); // close() destroyed the tunnel instead of leaving it relaying traffic

  const ledger = openLedger(root, { readonly: true });
  try {
    const rows = ledger.getAllEvents().filter((event) => event.session_id === gateway.gatewaySessionId)
      .map((event) => ({ hash: event.event_hash, meta: JSON.parse(event.meta_json) as Record<string, unknown> }));
    const tunnelRow = rows.findIndex((row) => row.meta.proxyMode === true && row.meta.destinationPort === echoPort && "connectedAddress" in row.meta);
    const stopRow = rows.findIndex((row) => row.meta.stage === "stop");
    expect(tunnelRow).toBeGreaterThan(-1);
    expect(tunnelRow).toBeLessThan(stopRow);
    const session = ledger.getAllSessions().find((row) => row.session_id === gateway.gatewaySessionId)!;
    expect(session.session_final_event_hash).toBe(rows.at(-1)!.hash);
  } finally { ledger.close(); }
});
