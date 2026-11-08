import { createServer, request as httpRequest, type Server } from "node:http";
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
    expect(limiter.shouldAudit("10.0.0.1", "NETWORK_EGRESS_BLOCKED")).toBe(false);
    expect(summaries).toEqual([]);
    at = 60_000;
    expect(limiter.shouldAudit("10.0.0.1", "LEASE_INVALID_OR_MISSING"), "the next window audits again").toBe(true);
    expect(summaries).toEqual([
      { auditType: "LEASE_INVALID_OR_MISSING", severity: "HIGH", clientIp: "10.0.0.1", suppressed: 20, windowStartTs: 0 },
      { auditType: "NETWORK_EGRESS_BLOCKED", severity: "HIGH", clientIp: "10.0.0.1", suppressed: 1, windowStartTs: 0 }
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

  function call(port: number, headers: Record<string, string>): Promise<number> {
    return new Promise((resolvePromise, rejectPromise) => {
      const req = httpRequest({ host: "127.0.0.1", port, path: "/test/v1/x", method: "POST", headers: { "content-type": "application/json", ...headers } }, (res) => {
        res.resume();
        res.on("end", () => resolvePromise(res.statusCode ?? 0));
      });
      req.on("error", rejectPromise);
      req.end("{}");
    });
  }

  test("30 unleased requests: 30 refusals, 10 audit rows and one summary of 20; a leased request is unaffected", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-gateway-preauth-"));
    roots.push(workspace);
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const upstream = createServer((req, res) => { req.resume(); req.on("end", () => res.writeHead(200).end("{}")); });
    servers.push(upstream);
    const port = await new Promise<number>((done) => upstream.listen(0, "127.0.0.1", () => done((upstream.address() as { port: number }).port)));
    initGatewayConfig(workspace, gatewayConfigSchema.parse({
      listen: { host: "127.0.0.1", port: 0 },
      redaction: { headerKeysDenylist: ["authorization"], jsonPathsDenylist: [], textRegexDenylist: [] },
      upstreams: { test: { baseUrl: `http://127.0.0.1:${port}`, auth: { type: "none" }, allowLocalhost: true } },
      routes: [{ prefix: "/test", upstream: "test", stripPrefix: true, openaiCompatible: false }]
    }));
    const gateway = await startGateway({ workspace });
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
});
