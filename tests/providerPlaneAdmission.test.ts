import { createServer, request as httpRequest, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initGatewayConfig } from "../src/gateway/config.js";
import { startGateway } from "../src/gateway/server.js";
import { initProcessorRegistry } from "../src/dataflow/processorRegistry.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { openLedger } from "../src/ledger/ledger.js";
import { runStudioForeground } from "../src/studio/studioSupervisor.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * P2-02: the gateway and the bridge send provider calls under the same processor/purpose admission as the native runtime
 * (llmRuntime), with the same typed refusal, decided before any provider call. The bridge always relays through the
 * gateway, so its calls meet that admission at the gateway hop.
 */
vi.setConfig({ testTimeout: 60_000 });
const EMAIL = "odalys.fenwick@example.com";
let root: string;
let workspace: string;
let upstream: Server;
let upstreamBase: string;
let upstreamHits: number;

const listen = (server: Server) => new Promise<number>((done) => server.listen(0, "127.0.0.1", () => done((server.address() as { port: number }).port)));
const freePort = () => new Promise<number>((done) => { const probe = createNetServer(); probe.listen(0, "127.0.0.1", () => {
  const { port } = probe.address() as { port: number }; probe.close(() => done(port)); }); });
const post = (url: string, headers: Record<string, string>, payload: unknown) => new Promise<{ status: number; body: string }>((done, fail) => {
  const body = Buffer.isBuffer(payload) ? payload : JSON.stringify(payload);
  const req = httpRequest(url, { method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), ...headers } }, (res) => {
    let text = ""; res.on("data", (chunk) => { text += chunk.toString("utf8"); }); res.on("end", () => done({ status: res.statusCode ?? 0, body: text }));
  });
  req.on("error", fail); req.end(body);
});
const chat = (content: string) => ({ model: "gpt-fixture", messages: [{ role: "user", content }] });

/** Opted in; the `openai` upstream is bound to `purpose`, whose processor holds a DPA for PII. */
function registry(purpose: { allowedDataClasses: ("phi" | "pii")[] } | null): void {
  initProcessorRegistry(workspace, { schemaVersion: "amc.dataflow-processors/v1", experimental: true,
    processors: [{ processorId: "proc-general", legalName: "Fixture General Processor",
      contracts: [{ kind: "DPA", reference: "DPA-GENERAL-1", effective: "2026-01-01", expires: null, dataClasses: ["pii"] }] }],
    purposes: [{ purposeId: "support", allowedDataClasses: purpose?.allowedDataClasses ?? ["pii"], allowedTools: ["model.request"], allowedProcessors: ["proc-general"] }],
    bindings: purpose === null ? [] : [{ providerId: "openai", baseUrl: upstreamBase, processorId: "proc-general", purposeId: "support" }] });
}
function audits(type: string): Record<string, unknown>[] {
  const ledger = openLedger(workspace);
  try {
    return ledger.getAllEvents().filter((event) => event.event_type === "audit").map((event) => JSON.parse(event.meta_json) as Record<string, unknown>)
      .filter((meta) => meta.auditType === type);
  } finally { ledger.close(); }
}
const lease = () => issueLeaseForCli({ workspace, agentId: "default", ttl: "60m", scopes: "gateway:llm", routes: "/openai", models: "*",
  rpm: 500, tpm: 1_000_000, maxCostUsdPerDay: null }).token;

beforeEach(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p202-planes-")));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "provider-plane-fixture-passphrase");
  workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  upstreamHits = 0;
  upstream = createServer((req, res) => { upstreamHits += 1; req.resume(); req.on("end", () => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: "ok", model: "gpt-fixture", choices: [{ message: { role: "assistant", content: "ok" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
  }); });
  upstreamBase = `http://127.0.0.1:${await listen(upstream)}`;
  initGatewayConfig(workspace, {
    listen: { host: "127.0.0.1", port: 0 },
    redaction: { headerKeysDenylist: ["authorization", "x-amc-lease"], jsonPathsDenylist: [], textRegexDenylist: [] },
    upstreams: { openai: { baseUrl: upstreamBase, auth: { type: "none" }, allowLocalhost: true, providerId: "openai" } },
    routes: [{ prefix: "/openai", upstream: "openai", stripPrefix: true, openaiCompatible: true, agentId: "default" }],
    lease: { allowQueryCarrier: false },
    proxy: { enabled: false, port: await freePort(), allowlistHosts: [], denyByDefault: true }
  } as never);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((done) => upstream.close(() => done()));
  rmSync(root, { recursive: true, force: true });
});

describe("the gateway plane", () => {
  async function viaGateway(content: string) {
    const gateway = await startGateway({ workspace });
    try {
      return await post(`http://${gateway.host}:${gateway.port}/openai/v1/chat/completions`, { "x-amc-agent-id": "default", "x-amc-lease": lease() }, chat(content));
    } finally { await gateway.close(); }
  }

  test("a purpose that does not allow the request's class is refused, typed, before the provider is called", async () => {
    registry({ allowedDataClasses: ["phi"] });
    const response = await viaGateway(`Please email ${EMAIL} the receipt.`);
    expect(response.status).toBe(403);
    expect(JSON.parse(response.body)).toEqual({ error: "DATA_FLOW_REFUSED", reason: "class_not_permitted", processorId: "proc-general", purposeId: "support" });
    expect(upstreamHits).toBe(0);
    expect(audits("PROTECTED_DATA_DETECTED")).toEqual([expect.objectContaining({ classes: ["pii"], processorId: "proc-general" })]);
    expect(audits("DATA_FLOW_REFUSED")).toEqual([expect.objectContaining({ reason: "class_not_permitted", processorId: "proc-general",
      purposeId: "support", upstreamId: "openai" })]);
    expect(JSON.stringify(audits("DATA_FLOW_REFUSED"))).not.toContain(EMAIL);
  });

  test("a route bound to no processor is refused before the provider is called", async () => {
    registry(null);
    const response = await viaGateway(`Please email ${EMAIL} the receipt.`);
    expect(response.status).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({ error: "DATA_FLOW_REFUSED", reason: "binding_missing", processorId: null, purposeId: null });
    expect(upstreamHits).toBe(0);
  });

  test("forwarded headers are admitted under their names, and a body admission cannot read is refused", async () => {
    registry({ allowedDataClasses: ["phi"] });
    const gateway = await startGateway({ workspace });
    try {
      const url = `http://${gateway.host}:${gateway.port}/openai/v1/chat/completions`, auth = { "x-amc-agent-id": "default", "x-amc-lease": lease() };
      const header = await post(url, { ...auth, "x-end-user": EMAIL }, chat("Summarise the changelog."));
      expect(JSON.parse(header.body)).toMatchObject({ error: "DATA_FLOW_REFUSED", reason: "class_not_permitted" });
      const binary = await post(url, auth, Buffer.from([0x7b, 0xff, 0xfe, 0x7d]));
      expect(binary.status).toBe(403);
      expect(JSON.parse(binary.body)).toMatchObject({ error: "DATA_FLOW_REFUSED", reason: "detector_invalid" });
    } finally { await gateway.close(); }
    expect(upstreamHits).toBe(0);
  });

  test("an admitted request, and one with no protected data, reach the provider", async () => {
    registry({ allowedDataClasses: ["pii"] });
    expect((await viaGateway(`Please email ${EMAIL} the receipt.`)).status).toBe(200);
    expect((await viaGateway("Summarise the changelog.")).status).toBe(200);
    expect(upstreamHits).toBe(2);
    expect(audits("DATA_FLOW_REFUSED")).toEqual([]);
  });
});

describe("the bridge plane", () => {
  test("a bridge call a purpose does not admit is refused, typed, before the provider is called", async () => {
    registry({ allowedDataClasses: ["phi"] });
    const runtime = await runStudioForeground({ workspace, apiPort: await freePort(), dashboardPort: await freePort(),
      gatewayPort: await freePort(), proxyPort: await freePort(), metricsPort: await freePort() });
    try {
      const base = `http://${runtime.state.host}:${runtime.state.apiPort}`;
      const refused = await post(`${base}/bridge/openai/v1/chat/completions`, { authorization: `Bearer ${lease()}` }, chat(`Please email ${EMAIL} the receipt.`));
      expect(refused.status).toBe(403);
      expect(JSON.parse(refused.body)).toEqual({ error: "DATA_FLOW_REFUSED", reason: "class_not_permitted", processorId: "proc-general", purposeId: "support" });
      expect(upstreamHits).toBe(0);
      const admitted = await post(`${base}/bridge/openai/v1/chat/completions`, { authorization: `Bearer ${lease()}` }, chat("Summarise the changelog."));
      expect(admitted.status).toBe(200);
      expect(upstreamHits).toBe(1);
    } finally { await runtime.stop(); }
  });
});
