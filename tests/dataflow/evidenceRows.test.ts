import { createServer, request as httpRequest, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { appendBridgeTelemetryEvent } from "../../src/bridge/bridgeTelemetry.js";
import { DETECTOR_SET_DIGEST } from "../../src/dataflow/detectors.js";
import { initProcessorRegistry } from "../../src/dataflow/processorRegistry.js";
import { initGatewayConfig } from "../../src/gateway/config.js";
import { startGateway } from "../../src/gateway/server.js";
import { issueLeaseForCli } from "../../src/leases/leaseCli.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { readEventPayload } from "../../src/session/eventPayload.js";
import type { EvidenceEvent } from "../../src/types.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { initWorkspace } from "../../src/workspace.js";

/**
 * P2-02 (issue table, last row): the evidence the gateway and the bridge store in an opted-in workspace. The admission
 * row holds classes, counts, the detector-set digest and the processor only; the stored request and response hold
 * `[REDACTED]` (gateway) or the bridge marker in place of each finding, with the redaction reasons and only a digest of
 * the redacted bytes (no digest of the original, which a short value could be brute-forced from). No row's metadata or
 * payload holds a planted value. A workspace that has not opted in stores them, which is what the scan is checked against.
 */
vi.setConfig({ testTimeout: 60_000 });
const CARD = "4111111111111111", EMAIL = "odalys.fenwick@example.com", PASSWORD = "hunter2-fixture", MRN = "A7781234";
const PLANTED = [CARD, EMAIL, PASSWORD, MRN];
let root: string, workspace: string, upstream: Server, upstreamBase: string;

const listen = (server: Server) => new Promise<number>((done) => server.listen(0, "127.0.0.1", () => done((server.address() as { port: number }).port)));
const freePort = () => new Promise<number>((done) => { const probe = createNetServer(); probe.listen(0, "127.0.0.1", () => {
  const { port } = probe.address() as { port: number }; probe.close(() => done(port)); }); });
const post = (url: string, headers: Record<string, string>, payload: unknown) => new Promise<{ status: number; body: string }>((done, fail) => {
  const body = JSON.stringify(payload);
  const req = httpRequest(url, { method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), ...headers } }, (res) => {
    let text = ""; res.on("data", (chunk) => { text += chunk.toString("utf8"); }); res.on("end", () => done({ status: res.statusCode ?? 0, body: text }));
  });
  req.on("error", fail); req.end(body);
});
function events(): EvidenceEvent[] {
  const ledger = openLedger(workspace);
  try { return ledger.getAllEvents(); } finally { ledger.close(); }
}
const meta = (event: EvidenceEvent) => JSON.parse(event.meta_json) as Record<string, unknown>;
const payload = (event: EvidenceEvent) => { const read = readEventPayload(workspace, event); return read.status === "ok" ? read.bytes.toString("utf8") : ""; };
const plantedIn = (text: string) => PLANTED.filter(value => text.includes(value));
const everything = () => events().map(event => `${event.meta_json}\n${payload(event)}`).join("\n");

beforeEach(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p202-evidence-")));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "evidence-rows-fixture-passphrase");
  workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  // The provider answers with the request's email in its text, so the response row is redacted too.
  upstream = createServer((req, res) => { req.resume(); req.on("end", () => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: "ok", model: "gpt-fixture", choices: [{ message: { role: "assistant", content: `Sent to ${EMAIL}.` } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
  }); });
  upstreamBase = `http://127.0.0.1:${await listen(upstream)}`;
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((done) => upstream.close(() => done()));
  rmSync(root, { recursive: true, force: true });
});

function optIn(): void {
  initProcessorRegistry(workspace, { schemaVersion: "amc.dataflow-processors/v1", experimental: true,
    processors: [{ processorId: "proc-general", legalName: "Fixture General Processor",
      contracts: [{ kind: "DPA", reference: "DPA-GENERAL-1", effective: "2026-01-01", expires: null, dataClasses: ["pii", "card_number"] }] }],
    purposes: [{ purposeId: "support", allowedDataClasses: ["pii", "card_number"], allowedTools: ["model.request"], allowedProcessors: ["proc-general"] }],
    bindings: [{ providerId: "openai", baseUrl: upstreamBase, processorId: "proc-general", purposeId: "support" }] });
}
async function viaGateway(): Promise<{ status: number; requestBody: string }> {
  initGatewayConfig(workspace, {
    listen: { host: "127.0.0.1", port: 0 },
    redaction: { headerKeysDenylist: ["authorization", "x-amc-lease"], jsonPathsDenylist: [], textRegexDenylist: [] },
    upstreams: { openai: { baseUrl: upstreamBase, auth: { type: "none" }, allowLocalhost: true, providerId: "openai" } },
    routes: [{ prefix: "/openai", upstream: "openai", stripPrefix: true, openaiCompatible: true, agentId: "default" }],
    lease: { allowQueryCarrier: false },
    proxy: { enabled: false, port: await freePort(), allowlistHosts: [], denyByDefault: true }
  } as never);
  const lease = issueLeaseForCli({ workspace, agentId: "default", ttl: "60m", scopes: "gateway:llm", routes: "/openai", models: "*",
    rpm: 500, tpm: 1_000_000, maxCostUsdPerDay: null }).token;
  const request = { model: "gpt-fixture", messages: [{ role: "user", content: `Charge card ${CARD} and email the receipt to ${EMAIL}.` }] };
  const gateway = await startGateway({ workspace });
  try {
    const response = await post(`http://${gateway.host}:${gateway.port}/openai/v1/chat/completions`,
      { "x-amc-agent-id": "default", "x-amc-lease": lease, "x-end-user": EMAIL }, request);
    return { status: response.status, requestBody: JSON.stringify(request) };
  } finally { await gateway.close(); }
}

describe("gateway evidence rows", () => {
  test("opted in: classes and counts only, redacted bodies and headers, and a digest of the redacted bytes only", async () => {
    optIn();
    const { status, requestBody } = await viaGateway();
    expect(status).toBe(200);
    const detected = events().filter(event => meta(event).auditType === "PROTECTED_DATA_DETECTED");
    expect(detected).toHaveLength(1);
    const evidence = { classes: ["pii", "card_number"], counts: { pii: 2, card_number: 1 }, detectorSetDigest: DETECTOR_SET_DIGEST, processorId: "proc-general" };
    expect(meta(detected[0]!)).toEqual(expect.objectContaining({ auditType: "PROTECTED_DATA_DETECTED", ...evidence }));
    expect(JSON.parse(payload(detected[0]!))).toEqual(evidence);

    for (const kind of ["llm_request", "llm_response"]) {
      const row = events().find(event => event.event_type === kind)!;
      const stored = JSON.parse(payload(row)) as { body: string; headers?: Record<string, string> };
      expect(meta(row)).toMatchObject({ bodyRedacted: true, originalHashOmitted: true, redactionReasons: expect.arrayContaining(["protectedData:pii"]) });
      expect(meta(row)).not.toHaveProperty("originalPayloadSha256");
      expect(meta(row).bodySha256).toBe(sha256Hex(Buffer.from(stored.body, "utf8")));
      expect(stored.body).toContain("[REDACTED]");
      if (kind === "llm_request") {
        expect(meta(row).redactionReasons).toEqual(expect.arrayContaining(["protectedData:card_number"]));
        expect(meta(row).bodySha256).not.toBe(sha256Hex(Buffer.from(requestBody, "utf8")));
        expect(stored.headers!["x-end-user"]).toBe("[REDACTED]");
      }
    }
    expect(plantedIn(everything())).toEqual([]);
  });

  test("not opted in: no admission row, and the stored bodies keep the values", async () => {
    await viaGateway();
    expect(events().some(event => meta(event).auditType === "PROTECTED_DATA_DETECTED")).toBe(false);
    expect(plantedIn(everything()).sort()).toEqual([CARD, EMAIL].sort());
  });
});

describe("bridge evidence rows", () => {
  const telemetry = () => {
    appendBridgeTelemetryEvent({ workspace, agentId: "default", event: { sessionId: "bridge-fixture", eventType: "agent_stdout",
      payload: `charged ${CARD}\nreceipt to ${EMAIL}\nMRN: ${MRN}\n` } });
    appendBridgeTelemetryEvent({ workspace, agentId: "default", event: { sessionId: "bridge-fixture", eventType: "agent_process_started",
      payload: { command: "deploy", args: [`--password=${PASSWORD}`, "--region", "eu-west-1"], note: `for ${EMAIL}` } } });
  };
  test("opted in: each finding is the marker, rows keep their shape, and the digest is of the stored bytes", () => {
    optIn();
    telemetry();
    const stdout = events().find(event => event.event_type === "agent_stdout")!;
    expect(payload(stdout)).toBe("charged <AMC_REDACTED>\nreceipt to <AMC_REDACTED>\n<AMC_REDACTED>\n"); // the MRN span includes its keyword
    expect(stdout.payload_sha256).toBe(sha256Hex(Buffer.from(payload(stdout), "utf8")));
    expect(meta(stdout)).toMatchObject({ trustTier: "OBSERVED", agentId: "default" });
    const started = events().find(event => event.event_type === "agent_process_started")!;
    expect(JSON.parse(payload(started))).toEqual({ command: "deploy", args: ["--password=<AMC_REDACTED>", "--region", "eu-west-1"], note: "for <AMC_REDACTED>" });
    expect(plantedIn(everything())).toEqual([]);
  });

  test("not opted in: the secret table only, which none of the planted values matches, so all are stored", () => {
    telemetry();
    expect(plantedIn(everything()).sort()).toEqual([...PLANTED].sort());
  });
});
