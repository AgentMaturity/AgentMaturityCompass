/**
 * P1-66 debt (pending-checks.md): the gateway forward proxy resolves a listed name for every connection, checks every
 * address, and connects only to a checked one. Names resolve through a mocked node:dns/promises; nothing leaves the host.
 */
import { createServer, request as httpRequest, type Server } from "node:http";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const dns = vi.hoisted(() => ({ table: new Map<string, string[]>(), held: new Map<string, Promise<void>>(), queries: [] as string[] }));
vi.mock("node:dns/promises", async (original) => {
  const actual = await original<typeof import("node:dns/promises")>();
  const lookup = (async (host: string, options?: unknown) => {
    dns.queries.push(host);
    await dns.held.get(host);
    const addresses = dns.table.get(host);
    if (addresses === undefined) return actual.lookup(host, options as never);
    if (addresses.length === 0) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: "ENOTFOUND" });
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  }) as typeof actual.lookup;
  return { ...actual, lookup, default: { ...actual, lookup } };
});

const { gatewayConfigSchema, initGatewayConfig } = await import("../src/gateway/config.js");
const { startGateway } = await import("../src/gateway/server.js");
const { issueLeaseForCli } = await import("../src/leases/leaseCli.js");
const { openLedger } = await import("../src/ledger/ledger.js");
const { initWorkspace } = await import("../src/workspace.js");

vi.setConfig({ testTimeout: 60_000 });
let root: string;
let workspace: string;
let upstream: Server;
let upstreamPort: number;
let upstreamConnections: number;
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => { unhandled.push(reason); };

const listen = (server: Server, host = "127.0.0.1") => new Promise<number>((done) => server.listen(0, host, () => done((server.address() as { port: number }).port)));

beforeEach(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p166-dns-")));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  upstreamConnections = 0;
  upstream = createServer((req, res) => { req.resume(); req.on("end", () => res.writeHead(201).end("ok")); });
  upstream.on("connection", () => { upstreamConnections += 1; });
  upstreamPort = await listen(upstream);
  dns.table.clear(); dns.held.clear(); dns.queries.length = 0; unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
});
afterEach(async () => {
  process.off("unhandledRejection", onUnhandled);
  vi.unstubAllEnvs();
  await new Promise<void>((done) => upstream.close(() => done()));
  rmSync(root, { recursive: true, force: true });
});

async function withProxy(proxy: { allowlistHosts: string[]; denyByDefault: boolean },
  body: (call: (method: string, path: string, options?: { reset?: boolean }) => Promise<number>) => Promise<void>): Promise<void> {
  const free = createServer();
  const port = await listen(free);
  await new Promise<void>((done) => free.close(() => done()));
  initGatewayConfig(workspace, gatewayConfigSchema.parse({
    listen: { host: "127.0.0.1", port: 0 },
    redaction: { headerKeysDenylist: ["authorization"], jsonPathsDenylist: [], textRegexDenylist: [] },
    upstreams: { openai: { baseUrl: `http://127.0.0.1:${upstreamPort}`, auth: { type: "none" }, allowLocalhost: true, providerId: "openai" } },
    routes: [{ prefix: "/openai", upstream: "openai", stripPrefix: true, openaiCompatible: true, agentId: "default" }],
    proxy: { enabled: true, port, ...proxy }
  }));
  const gateway = await startGateway({ workspace });
  try {
    const lease = issueLeaseForCli({ workspace, agentId: "default", ttl: "60m", scopes: "gateway:llm,proxy:connect", routes: "/openai",
      models: "*", rpm: 500, tpm: 1000000, maxCostUsdPerDay: null }).token;
    const headers = { "x-amc-agent-id": "default", "x-amc-lease": lease };
    await body((method, path, options = {}) => new Promise<number>((done, fail) => {
      const req = httpRequest({ host: gateway.host, port: gateway.proxyPort!, method, path, headers });
      req.on("response", (res) => { done(res.statusCode ?? 0); res.resume(); });
      req.on("connect", (res, socket) => { done(res.statusCode ?? 0); socket.destroy(); });
      req.on("error", (error) => options.reset ? done(0) : fail(error));
      // A reset (RST), not a FIN, 50 ms into the held lookup.
      if (options.reset) req.on("socket", (socket) => socket.once("connect", () => setTimeout(() => { socket.resetAndDestroy(); done(0); }, 50)));
      if (method === "POST") req.write("{\"partial\":"); // a partial body: the client resets before sending the rest
      if (method !== "POST" || !options.reset) req.end();
    }));
  } finally {
    await gateway.close();
  }
}

function auditRows(type: string): Array<Record<string, unknown>> {
  const ledger = openLedger(workspace);
  try {
    return ledger.getAllEvents().map((event) => JSON.parse(event.meta_json ?? "{}") as Record<string, unknown>)
      .filter((meta) => meta.auditType === type || meta.stage === type || (type === "tunnel" && "connectedAddress" in meta));
  } finally { ledger.close(); }
}

test("an allowed name that resolves to 10.0.0.5 is refused, with the address in the reason", async () => {
  dns.table.set("inner.example", ["10.0.0.5"]);
  await withProxy({ allowlistHosts: ["inner.example"], denyByDefault: true }, async (call) => {
    expect(await call("GET", "http://inner.example/x")).toBe(403);
    expect(await call("CONNECT", "inner.example:443")).toBe(403);
  });
  const rows = auditRows("NETWORK_EGRESS_BLOCKED");
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row.reason).toContain("10.0.0.5");
    expect(row.resolvedAddresses).toEqual(["10.0.0.5"]);
  }
});

test("an allowed name that does not resolve is EGRESS_UNRESOLVED (502), never allowed; an unlisted name is never looked up", async () => {
  dns.table.set("ghost.example", []);
  await withProxy({ allowlistHosts: ["ghost.example"], denyByDefault: true }, async (call) => {
    expect(await call("GET", "http://ghost.example/x")).toBe(502);
    expect(await call("CONNECT", "ghost.example:443")).toBe(502);
    expect(await call("CONNECT", "unlisted.example:443")).toBe(403);
  });
  const rows = auditRows("egress_unresolved");
  expect(rows).toHaveLength(2);
  for (const row of rows) expect(row.reason).toContain("EGRESS_UNRESOLVED");
  expect(dns.queries).not.toContain("unlisted.example");
});

test("denyByDefault: false still refuses a name that resolves to loopback", async () => {
  dns.table.set("localhost", ["127.0.0.1"]);
  await withProxy({ allowlistHosts: [], denyByDefault: false }, async (call) => {
    expect(await call("GET", `http://localhost:${upstreamPort}/x`)).toBe(403);
    expect(await call("CONNECT", `localhost:${upstreamPort}`)).toBe(403);
  });
  expect(upstreamConnections).toBe(0);
  expect(auditRows("NETWORK_EGRESS_BLOCKED").every((row) => String(row.reason).includes("127.0.0.1"))).toBe(true);
});

test("CONNECT falls back across the checked addresses and records the address it reached", async () => {
  dns.table.set("dual.example", ["::1", "127.0.0.1"]);
  await withProxy({ allowlistHosts: ["dual.example", "::1", "127.0.0.1"], denyByDefault: true }, async (call) => {
    expect(await call("CONNECT", `dual.example:${upstreamPort}`)).toBe(200);
    await new Promise((done) => setTimeout(done, 200)); // the tunnel row is written when the tunnel closes
  });
  expect(upstreamConnections).toBe(1);
  const tunnels = auditRows("tunnel");
  expect(tunnels).toEqual([expect.objectContaining({ destinationHost: "dual.example", resolvedAddresses: ["::1", "127.0.0.1"], connectedAddress: "127.0.0.1" })]);
});

test("a client that resets during the lookup opens nothing upstream and leaves no unhandled rejection", async () => {
  let release!: () => void;
  dns.held.set("slow.example", new Promise<void>((done) => { release = done; }));
  dns.table.set("slow.example", ["127.0.0.1"]);
  await withProxy({ allowlistHosts: ["slow.example", "127.0.0.1"], denyByDefault: true }, async (call) => {
    const resets = [
      call("GET", `http://slow.example:${upstreamPort}/x`, { reset: true }),
      call("POST", `http://slow.example:${upstreamPort}/x`, { reset: true }),
      ...Array.from({ length: 5 }, () => call("CONNECT", `slow.example:${upstreamPort}`, { reset: true }))
    ];
    await Promise.all(resets);
    await new Promise((done) => setTimeout(done, 200)); // the gateway sees the resets before the lookup returns
    release();
    await new Promise((done) => setTimeout(done, 300));
  });
  expect(upstreamConnections).toBe(0);
  expect(unhandled).toEqual([]);
});

test("CONNECT to port 99999 answers 400 and opens nothing", async () => {
  await withProxy({ allowlistHosts: ["127.0.0.1"], denyByDefault: true }, async (call) => {
    expect(await call("CONNECT", "127.0.0.1:99999")).toBe(400);
  });
  expect(upstreamConnections).toBe(0);
  expect(unhandled).toEqual([]);
});
