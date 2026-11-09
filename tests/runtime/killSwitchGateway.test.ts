/** P2-26 slice B at the gateway: model calls, the HTTP proxy and CONNECT tunnels all meet the kill switch, provider kills included. */
import { createServer, request as httpRequest, type Server } from "node:http";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { gatewayConfigSchema, initGatewayConfig, type GatewayConfig } from "../../src/gateway/config.js";
import { startGateway } from "../../src/gateway/server.js";
import { issueLeaseForCli } from "../../src/leases/leaseCli.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { checkEgress } from "../../src/residency/checkEgress.js";
import { KillSwitchDenied, activateKillSwitch, killSwitchEgressDenial } from "../../src/runtime/killSwitch.js";
import { initWorkspace } from "../../src/workspace.js";

vi.setConfig({ testTimeout: 60_000 });
let root: string;
let workspace: string;
let upstream: Server;
let upstreamPort: number;
let config: GatewayConfig;

const listen = (server: Server) => new Promise<number>((done) => server.listen(0, "127.0.0.1", () => done((server.address() as { port: number }).port)));
const kill = (scope: { kind: "provider" | "agent" | "workspace"; id: string }, mode: "stop_all" | "stop_new_effects" = "stop_all") =>
  activateKillSwitch({ workspace, issuedBy: "owner-1", scope, mode, reason: "gateway fixture", incidentId: "inc-gw" });

beforeEach(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p226-gw-")));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  upstream = createServer((req, res) => { req.resume(); req.on("end", () => res.end(JSON.stringify({ id: "ok", model: "m", usage: { prompt_tokens: 1, completion_tokens: 1 } }))); });
  upstreamPort = await listen(upstream);
  const free = createServer();
  const proxyPort = await listen(free);
  await new Promise<void>((done) => free.close(() => done()));
  config = gatewayConfigSchema.parse({
    listen: { host: "127.0.0.1", port: 0 },
    redaction: { headerKeysDenylist: ["authorization"], jsonPathsDenylist: [], textRegexDenylist: [] },
    upstreams: { openai: { baseUrl: `http://127.0.0.1:${upstreamPort}`, auth: { type: "none" }, allowLocalhost: true, providerId: "openai" } },
    routes: [{ prefix: "/openai", upstream: "openai", stripPrefix: true, openaiCompatible: true, agentId: "default" }],
    proxy: { enabled: true, port: proxyPort, allowlistHosts: ["127.0.0.1", "allowed.example"], denyByDefault: true }
  });
  initGatewayConfig(workspace, config);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((done) => upstream.close(() => done()));
  rmSync(root, { recursive: true, force: true });
});

describe("killSwitchEgressDenial", () => {
  test("no kill: nothing is denied", () => {
    expect(killSwitchEgressDenial(workspace, "default", "127.0.0.1", config)).toBeNull();
    expect(killSwitchEgressDenial(workspace, "default", "elsewhere.example", config)).toBeNull();
  });

  test("a provider kill denies its upstream's host and, failing closed, any host that maps to no upstream", async () => {
    await kill({ kind: "provider", id: "openai" });
    expect(killSwitchEgressDenial(workspace, "default", "127.0.0.1", config)).toContain("kill_switch_active");
    expect(killSwitchEgressDenial(workspace, "default", "elsewhere.example", config)).toContain("maps to no configured upstream");
  });

  test("an agent stop_new_effects kill keeps model traffic and refuses other egress", async () => {
    await kill({ kind: "agent", id: "default" }, "stop_new_effects");
    expect(killSwitchEgressDenial(workspace, "default", "127.0.0.1", config)).toBeNull();
    expect(killSwitchEgressDenial(workspace, "default", "elsewhere.example", config)).toContain("kill_switch_active");
    expect(killSwitchEgressDenial(workspace, "other-agent", "elsewhere.example", config)).toBeNull();
  });
});

describe("checkEgress, the egress choke point", () => {
  const egress = (channel: "provider" | "network-tool" | "mcp-http" | "bridge" | "callback", extra: { agentId?: string; providerId?: string } = {}) =>
    () => checkEgress({ workspace, channel, url: "https://api.example.com/v1", ...extra });

  test("a workspace stop_new_effects kill refuses agent network egress and keeps model calls and AMC's own traffic", async () => {
    for (const channel of ["network-tool", "mcp-http", "bridge"] as const) expect(egress(channel, { agentId: "default" })).not.toThrow();
    await kill({ kind: "workspace", id: "workspace" }, "stop_new_effects");
    for (const channel of ["network-tool", "mcp-http", "bridge"] as const) expect(egress(channel, { agentId: "default" })).toThrow(KillSwitchDenied);
    expect(egress("network-tool")).toThrow(KillSwitchDenied);
    expect(egress("network-tool", { agentId: "system" })).not.toThrow();
    expect(egress("callback", { agentId: "default" })).not.toThrow();
    expect(egress("provider", { providerId: "openai" })).not.toThrow();
  });

  test("a provider kill refuses that provider's native calls and, failing closed, a call naming no provider", async () => {
    await kill({ kind: "provider", id: "openai" });
    expect(egress("provider", { providerId: "openai" })).toThrow(KillSwitchDenied);
    expect(egress("provider", { providerId: "anthropic" })).not.toThrow();
    expect(egress("provider")).toThrow(/names no provider/);
  });
});

describe("the running gateway", () => {
  test("a provider kill refuses the model route, the HTTP proxy and CONNECT to that provider, and CONNECT to an unmapped host", async () => {
    const gateway = await startGateway({ workspace });
    try {
      const lease = issueLeaseForCli({ workspace, agentId: "default", ttl: "60m", scopes: "gateway:llm,proxy:connect", routes: "/openai",
        models: "*", rpm: 500, tpm: 1000000, maxCostUsdPerDay: null }).token;
      const headers = { "x-amc-agent-id": "default", "x-amc-lease": lease };
      const status = (options: { method: string; path: string; port: number }) => new Promise<number>((done, fail) => {
        const req = httpRequest({ host: gateway.host, ...options, headers });
        req.on("response", (res) => { done(res.statusCode ?? 0); res.resume(); });
        req.on("connect", (res, socket) => { done(res.statusCode ?? 0); socket.destroy(); });
        req.on("error", fail);
        req.end();
      });
      const proxyPort = gateway.proxyPort!;
      await kill({ kind: "provider", id: "openai" });
      expect(await status({ method: "POST", path: "/openai/v1/chat/completions", port: gateway.port })).toBe(403);
      expect(await status({ method: "GET", path: `http://127.0.0.1:${upstreamPort}/`, port: proxyPort })).toBe(403);
      expect(await status({ method: "CONNECT", path: `127.0.0.1:${upstreamPort}`, port: proxyPort })).toBe(403);
      expect(await status({ method: "CONNECT", path: "allowed.example:443", port: proxyPort })).toBe(403);
    } finally {
      await gateway.close();
    }
    const ledger = openLedger(workspace);
    try {
      const denied = ledger.getAllEvents().filter((e) => e.event_type === "audit" && (e.meta_json ?? "").includes("KILL_SWITCH_DENIED"));
      expect(denied.length).toBe(4);
    } finally {
      ledger.close();
    }
  });

  // SR-9: the kill switch was checked before the lease, so its rows went through the pre-auth bound and one budget per
  // client: an unleased flood silenced a leased agent's kill-switch refusals. Now the lease is verified first. An unleased
  // request gets the bounded lease refusal (and learns nothing of the kill), and every leased refusal is recorded.
  test("after an unleased flood within the pre-auth bound, every kill-switch refusal of a leased agent is recorded", async () => {
    initGatewayConfig(workspace, gatewayConfigSchema.parse({ ...config, lease: { ...config.lease, allowQueryCarrier: true } }));
    const gateway = await startGateway({ workspace });
    const post = (headers: Record<string, string>, query = "") => new Promise<number>((done, fail) => {
      const req = httpRequest({ host: gateway.host, port: gateway.port, method: "POST", path: `/openai/v1/chat/completions${query}`, headers });
      req.on("response", (res) => { done(res.statusCode ?? 0); res.resume(); });
      req.on("error", fail);
      req.end("{}");
    });
    try {
      await kill({ kind: "provider", id: "openai" });
      for (let i = 0; i < 15; i += 1) expect(await post({ "x-amc-agent-id": "default" })).toBe(401);
      const lease = issueLeaseForCli({ workspace, agentId: "default", ttl: "60m", scopes: "gateway:llm,proxy:connect", routes: "/openai",
        models: "*", rpm: 500, tpm: 1000000, maxCostUsdPerDay: null }).token;
      for (let i = 0; i < 12; i += 1) expect(await post({ "x-amc-agent-id": "default", "x-amc-lease": lease })).toBe(403);
      // The same lease in the query, here and through the HTTP proxy: its carrier row is a verified request's row too.
      for (let i = 0; i < 12; i += 1) expect(await post({ "x-amc-agent-id": "default" }, `?amc_lease=${lease}`)).toBe(403);
      const viaProxy = (path: string) => new Promise<number>((done, fail) => {
        const req = httpRequest({ host: gateway.host, port: gateway.proxyPort!, method: "GET", path, headers: { "x-amc-agent-id": "default" } });
        req.on("response", (res) => { done(res.statusCode ?? 0); res.resume(); });
        req.on("error", fail);
        req.end();
      });
      for (let i = 0; i < 12; i += 1) expect(await viaProxy(`http://127.0.0.1:${upstreamPort}/?amc_lease=${lease}`)).toBe(403);
    } finally {
      await gateway.close();
    }
    const ledger = openLedger(workspace);
    try {
      const metas = ledger.getAllEvents().filter((e) => e.event_type === "audit").map((e) => JSON.parse(e.meta_json ?? "{}") as Record<string, unknown>);
      const denied = metas.filter((meta) => meta.auditType === "KILL_SWITCH_DENIED");
      expect(denied).toHaveLength(36);
      expect(denied.every((meta) => meta.suppressed === undefined && meta.agentId === "default")).toBe(true);
      const carried = metas.filter((meta) => meta.auditType === "LEASE_QUERY_CARRIER_USED");
      expect(carried).toHaveLength(24);
      expect(carried.every((meta) => meta.suppressed === undefined)).toBe(true);
      const refused = metas.filter((meta) => meta.auditType === "LEASE_INVALID_OR_MISSING");
      expect(refused.filter((meta) => meta.suppressed === undefined)).toHaveLength(10);
      expect(refused.filter((meta) => meta.suppressed !== undefined)).toEqual([expect.objectContaining({ suppressed: 5, severity: "HIGH" })]);
    } finally {
      ledger.close();
    }
  });
});
