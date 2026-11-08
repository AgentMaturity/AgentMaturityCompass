import { createServer, request as httpRequest, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

// One upstream call can be made to fail with an error that names a URL with a key in its query (some providers take
// the key as a query parameter); everything else passes through.
const fail = vi.hoisted(() => ({ next: null as Error | null }));
vi.mock("../src/ops/circuitBreaker.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ops/circuitBreaker.js")>();
  return {
    ...actual,
    withCircuitBreaker: (async (...args: Parameters<typeof actual.withCircuitBreaker>) => {
      const error = fail.next;
      fail.next = null;
      if (error) throw error;
      return actual.withCircuitBreaker(...args);
    }) as typeof actual.withCircuitBreaker
  };
});

const { gatewayConfigSchema, initGatewayConfig } = await import("../src/gateway/config.js");
const { startGateway } = await import("../src/gateway/server.js");
const { issueLeaseForCli } = await import("../src/leases/leaseCli.js");
const { openLedger } = await import("../src/ledger/ledger.js");
const { initWorkspace } = await import("../src/workspace.js");

// LIVE-RUNTIME-11: fixed client bodies with a code; the detail goes to the audit row and to a log line with no URL query.
const roots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  while (servers.length > 0) await new Promise<void>((done) => servers.pop()!.close(() => done()));
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

async function setup() {
  const workspace = mkdtempSync(join(tmpdir(), "amc-gateway-errors-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const upstream = createServer((req, res) => { req.resume(); req.on("end", () => res.writeHead(200).end("{}")); });
  servers.push(upstream);
  const port = await new Promise<number>((done) => upstream.listen(0, "127.0.0.1", () => done((upstream.address() as { port: number }).port)));
  initGatewayConfig(workspace, gatewayConfigSchema.parse({
    listen: { host: "127.0.0.1", port: 0 },
    redaction: { headerKeysDenylist: ["authorization"], jsonPathsDenylist: [], textRegexDenylist: [] },
    upstreams: {
      keyed: { baseUrl: `http://127.0.0.1:${port}`, auth: { type: "bearer_env", env: "AMC_TEST_ABSENT_UPSTREAM_KEY_7F3A" }, allowLocalhost: true },
      unresolved: { baseUrl: "${AMC_TEST_UNSET_BASE_URL_7F3A}", auth: { type: "none" } },
      plain: { baseUrl: `http://127.0.0.1:${port}`, auth: { type: "none" }, allowLocalhost: true }
    },
    routes: [
      { prefix: "/keyed", upstream: "keyed", stripPrefix: true, openaiCompatible: false },
      { prefix: "/unresolved", upstream: "unresolved", stripPrefix: true, openaiCompatible: false },
      { prefix: "/plain", upstream: "plain", stripPrefix: true, openaiCompatible: false }
    ]
  }));
  const lines: string[] = [];
  const gateway = await startGateway({ workspace, logger: { log: () => undefined, error: (line: string) => { lines.push(String(line)); } } });
  const lease = issueLeaseForCli({ workspace, agentId: "default", ttl: "60m", scopes: "gateway:llm", routes: "/keyed,/unresolved,/plain",
    models: "*", rpm: 1000, tpm: 1_000_000, maxCostUsdPerDay: null }).token;
  return { workspace, gateway, lease, lines };
}

function post(port: number, path: string, lease: string): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method: "POST",
      headers: { "content-type": "application/json", "x-amc-agent-id": "default", "x-amc-lease": lease } }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString("utf8"); });
      res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", rejectPromise);
    req.end("{}");
  });
}

describe("gateway error bodies", () => {
  test("a missing upstream credential answers a fixed body; the audit row still names the reference", async () => {
    const { workspace, gateway, lease, lines } = await setup();
    try {
      const response = await post(gateway.port, "/keyed/v1/x", lease);
      expect(response.status).toBe(500);
      expect(response.body).toBe("{\"error\":\"upstream credential unavailable\",\"code\":\"AMC_UPSTREAM_AUTH\"}");
    } finally {
      await gateway.close();
    }
    const ledger = openLedger(workspace);
    try {
      const audit = ledger.getAllEvents().map((event) => JSON.parse(event.meta_json ?? "{}") as Record<string, unknown>)
        .find((meta) => meta.auditType === "UPSTREAM_AUTH_MISSING");
      // The audit append is unchanged: its (encrypted blob) payload keeps `message` with the reference.
      expect(audit).toEqual(expect.objectContaining({ severity: "HIGH", upstreamId: "keyed", agentId: "default" }));
    } finally {
      ledger.close();
    }
    expect(lines.some((line) => line.includes("AMC_TEST_ABSENT_UPSTREAM_KEY_7F3A") && line.includes("request "))).toBe(true);
  }, 60_000);

  test("an upstream with no resolved base URL answers gateway misconfigured", async () => {
    const { gateway, lease, lines } = await setup();
    try {
      const response = await post(gateway.port, "/unresolved/v1/x", lease);
      expect(response.status).toBe(500);
      expect(response.body).toBe("{\"error\":\"gateway misconfigured\",\"code\":\"AMC_GATEWAY_CONFIG\"}");
    } finally {
      await gateway.close();
    }
    expect(lines.some((line) => line.includes("unresolved") && line.includes("missing its resolved baseUrl"))).toBe(true);
  }, 60_000);

  test("a failed upstream call is logged without the query of any URL in the error", async () => {
    const { gateway, lease, lines } = await setup();
    try {
      fail.next = new Error("upstream request to https://x.example/v1?key=secret failed");
      const response = await post(gateway.port, "/plain/v1/x", lease);
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(response.body).not.toContain("secret");
    } finally {
      await gateway.close();
    }
    const logged = lines.filter((line) => line.includes("x.example"));
    expect(logged.length).toBeGreaterThan(0);
    for (const line of logged) {
      expect(line).not.toContain("key=secret");
      expect(line).not.toContain("?");
    }
  }, 60_000);
});
