import { createServer, request as httpRequest, type Server } from "node:http";
import { connect } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { gatewayConfigSchema, initGatewayConfig } from "../src/gateway/config.js";
import { createPreAuthAuditLimiter, type PreAuthAuditSummary } from "../src/gateway/preAuthAudit.js";
import { startGateway } from "../src/gateway/server.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initWorkspace } from "../src/workspace.js";

// LIVE-RUNTIME-21 (D-R13): unauthenticated refusals write at most 10 audit rows per client per minute, plus one summary.
describe("pre-auth audit limiter", () => {
  test("10 rows per client per minute, then one summary per audit type when the window rolls over", () => {
    let at = 0;
    const summaries: PreAuthAuditSummary[] = [];
    const limiter = createPreAuthAuditLimiter({ appendSummary: (row) => summaries.push(row), now: () => at });
    const decisions = Array.from({ length: 30 }, () => limiter.shouldAudit("10.0.0.1", "LEASE_INVALID_OR_MISSING"));
    expect(decisions.filter(Boolean)).toHaveLength(10);
    expect(limiter.shouldAudit("10.0.0.2", "LEASE_INVALID_OR_MISSING"), "another client has its own budget").toBe(true);
    expect(summaries).toEqual([]);
    at = 60_000;
    expect(limiter.shouldAudit("10.0.0.1", "LEASE_INVALID_OR_MISSING"), "the next window audits again").toBe(true);
    expect(summaries).toEqual([
      { auditType: "LEASE_INVALID_OR_MISSING", severity: "HIGH", clientIp: "10.0.0.1", suppressed: 20, windowStartTs: 0 }
    ]);
  });

  test("other audit types are never limited, and flushAll writes what is pending", () => {
    const summaries: PreAuthAuditSummary[] = [];
    const limiter = createPreAuthAuditLimiter({ appendSummary: (row) => summaries.push(row), now: () => 0 });
    for (let i = 0; i < 20; i += 1) expect(limiter.shouldAudit("10.0.0.1", "LEASE_SCOPE_DENIED")).toBe(true);
    for (let i = 0; i < 12; i += 1) limiter.shouldAudit("10.0.0.1", "NETWORK_EGRESS_BLOCKED");
    limiter.flushAll();
    expect(summaries).toEqual([expect.objectContaining({ auditType: "NETWORK_EGRESS_BLOCKED", suppressed: 2 })]);
  });

  // SR-9: one budget per client used to cover every type, so a flood of one type (carrier audits, say) silenced the
  // rest. A kill-switch refusal comes only after a lease verified, so it is never limited.
  test("each audit type has its own budget, summaries keep each type's severity, and kill-switch refusals are never limited", () => {
    const summaries: PreAuthAuditSummary[] = [];
    const limiter = createPreAuthAuditLimiter({ appendSummary: (row) => summaries.push(row), now: () => 0 });
    for (let i = 0; i < 30; i += 1) limiter.shouldAudit("10.0.0.1", "AGENT_PROVIDED_KEY_IGNORED");
    expect(limiter.shouldAudit("10.0.0.1", "LEASE_INVALID_OR_MISSING"), "a flood of one type leaves another's budget").toBe(true);
    expect(limiter.shouldAudit("10.0.0.1", "NETWORK_EGRESS_BLOCKED")).toBe(true);
    expect(Array.from({ length: 12 }, () => limiter.shouldAudit("10.0.0.1", "KILL_SWITCH_DENIED")).every(Boolean)).toBe(true);
    expect(Array.from({ length: 13 }, () => limiter.shouldAudit("10.0.0.1", "LEASE_QUERY_CARRIER_USED")).filter(Boolean)).toHaveLength(10);
    limiter.flushAll();
    expect(summaries).toEqual([
      expect.objectContaining({ auditType: "AGENT_PROVIDED_KEY_IGNORED", severity: "MED", suppressed: 20 }),
      expect.objectContaining({ auditType: "LEASE_QUERY_CARRIER_USED", severity: "LOW", suppressed: 3 })
    ]);
  });

  test("past 10,000 live clients the rest share one bounded window", () => {
    const summaries: PreAuthAuditSummary[] = [];
    const limiter = createPreAuthAuditLimiter({ appendSummary: (row) => summaries.push(row), now: () => 0 });
    for (let i = 0; i < 10_000; i += 1) limiter.shouldAudit(`c-${i}`, "LEASE_INVALID_OR_MISSING");
    const overflow = Array.from({ length: 15 }, (_, i) => limiter.shouldAudit(`late-${i}`, "LEASE_INVALID_OR_MISSING"));
    expect(overflow.filter(Boolean)).toHaveLength(10);
    limiter.flushAll();
    expect(summaries).toEqual([expect.objectContaining({ clientIp: "*", suppressed: 5 })]);
  });
});

describe("gateway pre-auth audit rows", () => {
  const roots: string[] = [];
  const servers: Server[] = [];
  afterEach(async () => {
    while (servers.length > 0) await new Promise<void>((done) => servers.pop()!.close(() => done()));
    while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
  });

  function call(port: number, headers: Record<string, string>, path = "/test/v1/x"): Promise<number> {
    return new Promise((resolvePromise, rejectPromise) => {
      const req = httpRequest({ host: "127.0.0.1", port, path, method: "POST", headers: { "content-type": "application/json", ...headers } }, (res) => {
        res.resume();
        res.on("end", () => resolvePromise(res.statusCode ?? 0));
      });
      req.on("error", rejectPromise);
      req.end("{}");
    });
  }

  const listen = (server: Server) => new Promise<number>((done) => server.listen(0, "127.0.0.1", () => done((server.address() as { port: number }).port)));

  async function start(options: { proxy?: boolean; queryCarrier?: boolean } = {}) {
    const workspace = mkdtempSync(join(tmpdir(), "amc-gateway-preauth-"));
    roots.push(workspace);
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const upstream = createServer((req, res) => { req.resume(); req.on("end", () => res.writeHead(200).end("{}")); });
    servers.push(upstream);
    const port = await listen(upstream);
    const probe = createServer();
    const proxyPort = await listen(probe);
    await new Promise<void>((done) => probe.close(() => done()));
    initGatewayConfig(workspace, gatewayConfigSchema.parse({
      listen: { host: "127.0.0.1", port: 0 },
      redaction: { headerKeysDenylist: ["authorization"], jsonPathsDenylist: [], textRegexDenylist: [] },
      upstreams: { test: { baseUrl: `http://127.0.0.1:${port}`, auth: { type: "none" }, allowLocalhost: true } },
      routes: [{ prefix: "/test", upstream: "test", stripPrefix: true, openaiCompatible: false }],
      ...(options.proxy ? { proxy: { enabled: true, port: proxyPort, allowlistHosts: ["127.0.0.1"], denyByDefault: true } } : {}),
      ...(options.queryCarrier ? { lease: { allowQueryCarrier: true } } : {})
    }));
    return { workspace, gateway: await startGateway({ workspace }), upstreamPort: port };
  }

  function connectStatus(port: number, headers: Record<string, string>, authority: string): Promise<number> {
    return new Promise((resolvePromise, rejectPromise) => {
      const req = httpRequest({ host: "127.0.0.1", port, method: "CONNECT", path: authority, headers });
      req.on("connect", (res, socket) => { resolvePromise(res.statusCode ?? 0); socket.destroy(); });
      req.on("error", rejectPromise);
      req.end();
    });
  }

  function auditMetas(workspace: string): Array<Record<string, unknown>> {
    const ledger = openLedger(workspace);
    try {
      return ledger.getAllEvents().map((event) => ({ eventType: event.event_type, ...(JSON.parse(event.meta_json ?? "{}") as Record<string, unknown>) }));
    } finally {
      ledger.close();
    }
  }

  test("30 unleased requests: 30 refusals, 10 audit rows and one summary of 20; a leased request is unaffected", async () => {
    const { workspace, gateway } = await start();
    try {
      const statuses = await Promise.all(Array.from({ length: 30 }, () => call(gateway.port, { "x-amc-agent-id": "default" })));
      expect(statuses).toEqual(Array.from({ length: 30 }, () => 401));
      const lease = issueLeaseForCli({ workspace, agentId: "default", ttl: "60m", scopes: "gateway:llm", routes: "/test",
        models: "*", rpm: 1000, tpm: 1_000_000, maxCostUsdPerDay: null }).token;
      expect(await call(gateway.port, { "x-amc-agent-id": "default", "x-amc-lease": lease })).toBe(200);
    } finally {
      await gateway.close();
    }
    const ledger = openLedger(workspace);
    try {
      const rows = ledger.getAllEvents().map((event) => JSON.parse(event.meta_json ?? "{}") as Record<string, unknown>)
        .filter((meta) => meta.auditType === "LEASE_INVALID_OR_MISSING");
      expect(rows.filter((meta) => meta.suppressed === undefined)).toHaveLength(10);
      expect(rows.filter((meta) => meta.suppressed !== undefined)).toEqual([expect.objectContaining({ suppressed: 20, clientIp: "127.0.0.1" })]);
    } finally {
      ledger.close();
    }
  }, 60_000);

  // SR-3: the provider-key and query-carrier audits used to be written before the lease was checked, one per request.
  test("unleased requests carrying a provider key or a query carrier stay within the bound, on both servers", async () => {
    const { workspace, gateway, upstreamPort } = await start({ proxy: true, queryCarrier: true });
    const keyed = { "x-amc-agent-id": "default", authorization: "Bearer sk-not-a-lease-1234567890" };
    try {
      for (let i = 0; i < 10; i += 1) expect(await call(gateway.port, keyed)).toBe(401);
      for (let i = 0; i < 10; i += 1) expect(await call(gateway.port, { "x-amc-agent-id": "default" }, "/test/v1/x?amc_lease=forged.notalease")).toBe(401);
      for (let i = 0; i < 10; i += 1) expect(await call(gateway.proxyPort!, keyed, `http://127.0.0.1:${upstreamPort}/x`)).toBe(401);
      for (let i = 0; i < 5; i += 1) expect(await connectStatus(gateway.proxyPort!, keyed, `127.0.0.1:${upstreamPort}`)).toBe(401);
      const lease = issueLeaseForCli({ workspace, agentId: "default", ttl: "60m", scopes: "gateway:llm", routes: "/test",
        models: "*", rpm: 1000, tpm: 1_000_000, maxCostUsdPerDay: null }).token;
      expect(await call(gateway.port, { "x-amc-agent-id": "default" }, `/test/v1/x?amc_lease=${lease}`)).toBe(200);
    } finally {
      await gateway.close();
    }
    const metas = auditMetas(workspace).filter((meta) => meta.eventType === "audit");
    const rows = metas.filter((meta) => meta.suppressed === undefined && ["LEASE_INVALID_OR_MISSING", "AGENT_PROVIDED_KEY_IGNORED", "LEASE_QUERY_CARRIER_USED"].includes(String(meta.auditType)));
    // SR-9: 10 per audit type for the 35 refused requests (35 lease refusals, 25 provider-key and 10 query-carrier audits),
    // plus the leased request's own query-carrier row: a verified lease is never limited.
    expect(rows).toHaveLength(31);
    expect(rows.at(-1)).toMatchObject({ auditType: "LEASE_QUERY_CARRIER_USED", agentId: "default" });
    const summaries = metas.filter((meta) => meta.suppressed !== undefined);
    expect(summaries.map((meta) => [meta.auditType, meta.suppressed])).toEqual(expect.arrayContaining([["LEASE_INVALID_OR_MISSING", 25], ["AGENT_PROVIDED_KEY_IGNORED", 15]]));
    expect(summaries).toHaveLength(2);
  }, 60_000);

  // SR-3: a request that fails before its lease is checked (here an unparsable Host) used to write a request_error row.
  test("a failure before the lease is checked writes no ledger row", async () => {
    const { workspace, gateway } = await start();
    try {
      const status = await new Promise<string>((resolvePromise, rejectPromise) => {
        const socket = connect(gateway.port, "127.0.0.1", () => socket.write("POST /test/v1/x HTTP/1.1\r\nHost: a b\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}"));
        let head = "";
        socket.on("data", (chunk: Buffer) => { head += chunk.toString("latin1"); });
        socket.on("end", () => resolvePromise(head.split("\r\n", 1)[0] ?? ""));
        socket.on("error", rejectPromise);
      });
      expect(status).toMatch(/^HTTP\/1\.1 5\d\d /);
    } finally {
      await gateway.close();
    }
    expect(auditMetas(workspace).filter((meta) => meta.stage === "request_error")).toEqual([]);
  }, 60_000);
});
