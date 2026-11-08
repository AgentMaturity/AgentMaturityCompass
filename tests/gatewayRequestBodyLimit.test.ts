import { createServer, request as httpRequest, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { gatewayConfigSchema, initGatewayConfig } from "../src/gateway/config.js";
import { startGateway } from "../src/gateway/server.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { openLedger } from "../src/ledger/ledger.js";
import { defaultOpsPolicy, opsPolicyPath, signOpsPolicy } from "../src/ops/policy.js";
import { initWorkspace } from "../src/workspace.js";
import YAML from "yaml";

// LIVE-RUNTIME-01 (D-R1): request bodies are capped (413, nothing forwarded), a request whose lease does not verify is
// refused before its body is read, and upstream responses stay uncapped. The cap stays under the default ops policy's
// 64 KiB evidence payload limit, which refuses a larger llm_request row on its own (a separate, operator-configurable limit).
const CAP = 16 * 1024;
const roots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  while (servers.length > 0) await new Promise<void>((done) => servers.pop()!.close(() => done()));
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

const listen = (server: Server) => new Promise<number>((done) => server.listen(0, "127.0.0.1", () => done((server.address() as { port: number }).port)));

async function setup(options: { responseBytes?: number; proxy?: boolean } = {}) {
  const workspace = mkdtempSync(join(tmpdir(), "amc-gateway-body-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  if (options.responseBytes) {
    // The evidence limits (64 KiB per event, 10 MiB per blob by default) are raised the way an operator would, so the
    // test shows that the gateway itself never caps an upstream response.
    const policy = defaultOpsPolicy();
    policy.opsPolicy.retention.maxPayloadBytesPerEvent = 32 * 1024 * 1024;
    policy.opsPolicy.retention.maxBlobBytes = 32 * 1024 * 1024;
    writeFileSync(opsPolicyPath(workspace), YAML.stringify(policy));
    signOpsPolicy(workspace);
  }
  const received: number[] = [];
  const upstream = createServer((req, res) => {
    let size = 0;
    req.on("data", (chunk: Buffer) => { size += chunk.length; });
    req.on("end", () => {
      received.push(size);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(options.responseBytes ? Buffer.alloc(options.responseBytes, 0x61) : JSON.stringify({ ok: true, size }));
    });
  });
  servers.push(upstream);
  const upstreamPort = await listen(upstream);
  const probe = createServer();
  const proxyPort = await listen(probe);
  await new Promise<void>((done) => probe.close(() => done()));
  initGatewayConfig(workspace, gatewayConfigSchema.parse({
    listen: { host: "127.0.0.1", port: 0 },
    redaction: { headerKeysDenylist: ["authorization"], jsonPathsDenylist: [], textRegexDenylist: [] },
    upstreams: { test: { baseUrl: `http://127.0.0.1:${upstreamPort}`, auth: { type: "none" }, allowLocalhost: true } },
    routes: [{ prefix: "/test", upstream: "test", stripPrefix: true, openaiCompatible: false }],
    ...(options.proxy ? { proxy: { enabled: true, port: proxyPort, allowlistHosts: ["127.0.0.1"], denyByDefault: true } } : {})
  }));
  const gateway = await startGateway({ workspace, maxRequestBytes: CAP });
  const lease = issueLeaseForCli({ workspace, agentId: "default", ttl: "60m", scopes: "gateway:llm,proxy:connect", routes: "/test",
    models: "*", rpm: 1000, tpm: 1_000_000, maxCostUsdPerDay: null }).token;
  return { workspace, gateway, lease, received, upstreamPort };
}

function post(port: number, path: string, body: Buffer, headers: Record<string, string>): Promise<{ status: number; bytes: number; body: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method: "POST", headers: { "content-length": body.length, ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const all = Buffer.concat(chunks);
        resolvePromise({ status: res.statusCode ?? 0, bytes: all.length, body: all.length < 4096 ? all.toString("utf8") : "" });
      });
    });
    req.on("error", rejectPromise);
    req.end(body);
  });
}

/**
 * The status (and Connection header) of a POST that sends its headers and one chunk of a 1 MiB body, then never ends
 * it; fails after 2 s. The chunk stays under the cap, so a gateway that reads the body waits for the rest instead of
 * answering 413.
 */
function statusBeforeBodyEnds(port: number, headers: Record<string, string>): Promise<{ status: number; connection: string | undefined }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest({ host: "127.0.0.1", port, path: "/test/v1/x", method: "POST", headers: { "content-length": 1_048_576, ...headers } }, (res) => {
      clearTimeout(timer);
      res.resume();
      resolvePromise({ status: res.statusCode ?? 0, connection: res.headers.connection });
      req.destroy();
    });
    const timer = setTimeout(() => { req.destroy(); rejectPromise(new Error("no response within 2 s")); }, 2_000);
    req.on("error", () => undefined);
    req.write(Buffer.alloc(CAP / 2, 0x63));
  });
}

function auditRows(workspace: string, type: string): Array<Record<string, unknown>> {
  const ledger = openLedger(workspace);
  try {
    return ledger.getAllEvents().map((event) => JSON.parse(event.meta_json ?? "{}") as Record<string, unknown>).filter((meta) => meta.auditType === type);
  } finally {
    ledger.close();
  }
}

describe("gateway request body cap", () => {
  test("a leased body one byte over the cap is 413, audited, and never forwarded", async () => {
    const { workspace, gateway, lease, received } = await setup();
    try {
      const response = await post(gateway.port, "/test/v1/x", Buffer.alloc(CAP + 1, 0x62), { "x-amc-agent-id": "default", "x-amc-lease": lease });
      expect(response.status).toBe(413);
      expect(JSON.parse(response.body)).toEqual({ error: "payload too large" });
    } finally {
      await gateway.close();
    }
    expect(received).toEqual([]);
    expect(auditRows(workspace, "GATEWAY_PAYLOAD_TOO_LARGE")).toEqual([expect.objectContaining({ severity: "MED", agentId: "default", maxRequestBytes: CAP })]);
  }, 60_000);

  test("a leased body of exactly the cap is forwarded", async () => {
    const { gateway, lease, received } = await setup();
    try {
      const response = await post(gateway.port, "/test/v1/x", Buffer.alloc(CAP, 0x62), { "x-amc-agent-id": "default", "x-amc-lease": lease });
      expect(response.status).toBe(200);
    } finally {
      await gateway.close();
    }
    expect(received).toEqual([CAP]);
  }, 60_000);

  test("an unleased request is refused before its body is read", async () => {
    const { gateway } = await setup();
    try {
      expect(await statusBeforeBodyEnds(gateway.port, { "x-amc-agent-id": "default" })).toEqual({ status: 401, connection: "close" });
    } finally {
      await gateway.close();
    }
  }, 60_000);

  // A lease-shaped carrier is not a lease: a forged one used to make the gateway buffer up to the cap before the lease
  // was verified, so N held connections pinned N x cap bytes (skeptic D1).
  test("a forged lease is refused before its body is read", async () => {
    const { workspace, gateway } = await setup();
    try {
      // Answered at once, and the unread body is not drained: the connection closes.
      expect(await statusBeforeBodyEnds(gateway.port, { "x-amc-agent-id": "default", "x-amc-lease": "forged.notalease" })).toEqual({ status: 401, connection: "close" });
    } finally {
      await gateway.close();
    }
    expect(auditRows(workspace, "LEASE_INVALID_OR_MISSING")).toEqual([expect.objectContaining({ agentId: "default" })]);
  }, 60_000);

  // It also used to write one signed GATEWAY_PAYLOAD_TOO_LARGE row per request, outside the pre-auth audit bound and
  // attributed to whichever agent the client named (skeptic D2). Now it is an invalid lease, inside that bound.
  test("an oversized body under a forged lease is an invalid lease, audited within the pre-auth bound", async () => {
    const { workspace, gateway, received } = await setup();
    const statuses: number[] = [];
    try {
      for (let i = 0; i < 12; i += 1) {
        const forged = { "x-amc-agent-id": "victim-agent", "x-amc-lease": "forged.notalease" };
        statuses.push((await post(gateway.port, "/test/v1/x", Buffer.alloc(CAP + 1, 0x62), forged)).status);
      }
    } finally {
      await gateway.close();
    }
    expect(statuses).toEqual(Array(12).fill(401));
    expect(received).toEqual([]);
    expect(auditRows(workspace, "GATEWAY_PAYLOAD_TOO_LARGE")).toEqual([]);
    const refusals = auditRows(workspace, "LEASE_INVALID_OR_MISSING");
    expect(refusals.filter((row) => row.suppressed === undefined)).toHaveLength(10);
    expect(refusals.filter((row) => row.suppressed !== undefined)).toEqual([expect.objectContaining({ suppressed: 2 })]);
  }, 60_000);

  test("the forward proxy caps a leased request body the same way", async () => {
    const { workspace, gateway, lease, received, upstreamPort } = await setup({ proxy: true });
    try {
      const response = await post(gateway.proxyPort!, `http://127.0.0.1:${upstreamPort}/x`, Buffer.alloc(CAP + 1, 0x62),
        { "x-amc-agent-id": "default", "x-amc-lease": lease });
      expect(response.status).toBe(413);
    } finally {
      await gateway.close();
    }
    expect(received).toEqual([]);
    expect(auditRows(workspace, "GATEWAY_PAYLOAD_TOO_LARGE")).toEqual([expect.objectContaining({ proxyMode: true })]);
  }, 60_000);

  test("a 12 MiB upstream response reaches the client whole", async () => {
    const responseBytes = 12 * 1024 * 1024;
    const { gateway, lease } = await setup({ responseBytes });
    try {
      const response = await post(gateway.port, "/test/v1/x", Buffer.from("{}"), { "x-amc-agent-id": "default", "x-amc-lease": lease });
      expect(response.status).toBe(200);
      expect(response.bytes).toBe(responseBytes);
    } finally {
      await gateway.close();
    }
  }, 120_000);
});
