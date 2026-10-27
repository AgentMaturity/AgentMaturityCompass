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
});
