import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import {
  buildAgentConfig,
  initFleet,
  scaffoldAgent,
  verifyAgentConfigSignature,
  verifyFleetConfigSignature
} from "../src/fleet/registry.js";
import { attestIngestSession, ingestEvidence } from "../src/ingest/ingest.js";
import { initGatewayConfig, type GatewayConfig } from "../src/gateway/config.js";
import { startGateway } from "../src/gateway/server.js";
import { parseEvidenceEvent, evaluateGate } from "../src/diagnostic/gates.js";
import type { Gate } from "../src/types.js";
import { enforceHighRiskSandboxRequirement } from "../src/diagnostic/runner.js";
import { openLedger } from "../src/ledger/ledger.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-fleet-test-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  vi.restoreAllMocks();
  vi.resetModules();
});

async function pickFreePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((resolvePromise) => s.listen(0, "127.0.0.1", () => resolvePromise()));
  const addr = s.address();
  await new Promise<void>((resolvePromise) => s.close(() => resolvePromise()));
  if (!addr || typeof addr === "string") {
    throw new Error("failed to allocate random port");
  }
  return addr.port;
}

async function httpPostJson(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: string }> {
  const body = JSON.stringify(payload);
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          ...headers
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString("utf8");
        });
        res.on("end", () => {
          resolvePromise({ status: res.statusCode ?? 0, body: data });
        });
      }
    );
    req.on("error", rejectPromise);
    req.write(body);
    req.end();
  });
}

describe("fleet mode and trust tiers", () => {
  test("fleet config signature becomes invalid when edited", () => {
    const workspace = newWorkspace();
    const created = initFleet(workspace, { orgName: "Acme AI Ops" });
    expect(verifyFleetConfigSignature(workspace).valid).toBe(true);

    writeFileSync(created.fleetPath, `${readFileSync(created.fleetPath, "utf8")}\n# tamper`);
    const verify = verifyFleetConfigSignature(workspace);
    expect(verify.valid).toBe(false);
    expect(verify.signatureExists).toBe(true);
  });

  test("agent config signature becomes invalid when edited", () => {
    const workspace = newWorkspace();
    initFleet(workspace);
    const config = buildAgentConfig({
      agentId: "salesbot",
      agentName: "Sales Bot",
      role: "sales-assistant",
      domain: "sales",
      primaryTasks: ["lead qualification"],
      stakeholders: ["ops", "sales"],
      riskTier: "med",
      templateId: "openai",
      baseUrl: "https://api.openai.com",
      routePrefix: "/openai",
      auth: { type: "bearer_env", env: "OPENAI_API_KEY" }
    });
    const scaffold = scaffoldAgent(workspace, config);
    expect(verifyAgentConfigSignature(workspace, "salesbot").valid).toBe(true);

    writeFileSync(scaffold.configPath, `${readFileSync(scaffold.configPath, "utf8")}\n# edited`);
    expect(verifyAgentConfigSignature(workspace, "salesbot").valid).toBe(false);
  });

  test("gateway records agent/provider/model metadata and proxy blocks non-allowlisted host", async () => {
    const workspace = newWorkspace();
    initFleet(workspace);

    const upstream = createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ id: "ok", model: "gpt-4.1-mini", usage: { prompt_tokens: 1, completion_tokens: 1 } }));
      });
    });
    await new Promise<void>((resolvePromise) => upstream.listen(0, "127.0.0.1", () => resolvePromise()));
    const upstreamAddr = upstream.address();
    if (!upstreamAddr || typeof upstreamAddr === "string") {
      throw new Error("upstream listen failed");
    }

    const proxyPort = await pickFreePort();
    const gatewayConfig: GatewayConfig = {
      listen: { host: "127.0.0.1", port: 0 },
      redaction: {
        headerKeysDenylist: ["authorization", "x-api-key"],
        jsonPathsDenylist: ["$.api_key"],
        textRegexDenylist: ["(?i)sk-[A-Za-z0-9]{10,}"]
      },
      upstreams: {
        openai: {
          baseUrl: `http://127.0.0.1:${upstreamAddr.port}`,
          auth: { type: "none" },
          allowLocalhost: true,
          providerId: "openai"
        }
      },
      routes: [
        {
          prefix: "/openai",
          upstream: "openai",
          stripPrefix: true,
          openaiCompatible: true,
          agentId: "salesbot"
        }
      ],
      proxy: {
        enabled: true,
        port: proxyPort,
        allowlistHosts: ["allowed.example"],
        denyByDefault: true
      }
    };
    initGatewayConfig(workspace, gatewayConfig);
    const gateway = await startGateway({ workspace });
    const lease = issueLeaseForCli({
      workspace,
      agentId: "salesbot",
      ttl: "60m",
      scopes: "gateway:llm,proxy:connect",
      routes: "/openai",
      models: "*",
      rpm: 500,
      tpm: 1000000,
      maxCostUsdPerDay: null
    }).token;

    const resp = await httpPostJson(`http://${gateway.host}:${gateway.port}/openai/v1/chat/completions`, {
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: "hi" }]
    }, {
      "x-amc-agent-id": "salesbot",
      "x-amc-lease": lease
    });
    expect(resp.status).toBe(200);

    const blockedStatus = await new Promise<number>((resolvePromise, rejectPromise) => {
      const req = httpRequest(
        {
          host: gateway.host,
          port: gateway.proxyPort ?? proxyPort,
          method: "GET",
          path: "http://blocked.example/",
          headers: {
            "x-amc-agent-id": "salesbot",
            "x-amc-lease": lease
          }
        },
        (res) => {
          resolvePromise(res.statusCode ?? 0);
          res.resume();
        }
      );
      req.on("error", rejectPromise);
      req.end();
    });
    expect(blockedStatus).toBe(403);

    await gateway.close();
    await new Promise<void>((resolvePromise) => upstream.close(() => resolvePromise()));

    const ledger = openLedger(workspace);
    const llmRequest = ledger.getAllEvents().find((event) => event.event_type === "llm_request");
    const audits = ledger.getAllEvents().filter((event) => event.event_type === "audit");
    ledger.close();
    expect(llmRequest).toBeTruthy();
    const reqMeta = JSON.parse(llmRequest?.meta_json ?? "{}") as Record<string, unknown>;
    expect(reqMeta.agentId).toBe("salesbot");
    expect(reqMeta.providerId).toBe("openai");
    expect(reqMeta.model).toBe("gpt-4.1-mini");
    expect(audits.some((event) => (JSON.parse(event.payload_inline ?? "{}") as Record<string, unknown>).auditType === "NETWORK_EGRESS_BLOCKED")).toBe(
      true
    );
  });

  test("ingest starts as SELF_REPORTED and attest promotes evidence to ATTESTED", () => {
    const workspace = newWorkspace();
    const ingestFile = join(workspace, "chat.txt");
    writeFileSync(ingestFile, "assistant: hello");

    const ingested = ingestEvidence({
      workspace,
      agentId: "default",
      inputPath: ingestFile,
      type: "generic_text"
    });
    const ledger = openLedger(workspace);
    const before = ledger
      .getAllEvents()
      .filter((event) => event.session_id === ingested.ingestSessionId && event.event_type === "review")
      .map((event) => parseEvidenceEvent(event));
    expect(before.every((event) => event.trustTier === "SELF_REPORTED")).toBe(true);
    ledger.close();

    const attested = attestIngestSession({
      workspace,
      ingestSessionId: ingested.ingestSessionId,
      agentId: "default",
      attestedBy: "auditor@example.com",
      statement: "Verified provenance of exported logs for this test."
    });
    expect(attested.attestedEventCount).toBeGreaterThan(0);

    const ledger2 = openLedger(workspace);
    const after = ledger2
      .getAllEvents()
      .filter((event) => event.session_id === ingested.ingestSessionId && event.event_type === "review")
      .map((event) => parseEvidenceEvent(event));
    const audits = ledger2.getAllEvents().filter((event) => event.event_type === "audit");
    ledger2.close();
    expect(after.some((event) => event.trustTier === "ATTESTED")).toBe(true);
    expect(audits.some((event) => (JSON.parse(event.payload_inline ?? "{}") as Record<string, unknown>).auditType === "INGEST_ATTESTED")).toBe(true);
  });

  test("level-5 gates require OBSERVED evidence, not SELF_REPORTED", () => {
    const gate: Gate = {
      level: 5,
      requiredEvidenceTypes: ["llm_response"],
      minEvents: 1,
      minSessions: 1,
      minDistinctDays: 1,
      requiredTrustTier: "OBSERVED",
      acceptedTrustTiers: ["OBSERVED"],
      mustInclude: {},
      mustNotInclude: {}
    };

    const self = parseEvidenceEvent({
      id: "e1",
      ts: Date.now(),
      session_id: "s1",
      runtime: "gateway",
      event_type: "llm_response",
      payload_path: null,
      payload_inline: "{}",
      payload_sha256: "00",
      meta_json: JSON.stringify({ trustTier: "SELF_REPORTED" }),
      prev_event_hash: "GENESIS",
      event_hash: "x",
      writer_sig: "y"
    });
    expect(evaluateGate(gate, [self]).pass).toBe(false);

    const observed = parseEvidenceEvent({
      ...self,
      id: "e2",
      meta_json: JSON.stringify({ trustTier: "OBSERVED" })
    });
    expect(evaluateGate(gate, [observed]).pass).toBe(true);
  });

  test("high-risk level-5 is capped to 4 without sandbox attestation", () => {
    const enforced = enforceHighRiskSandboxRequirement({
      questionId: "AMC-1.5",
      riskTier: "high",
      supportedMaxLevel: 5,
      sandboxEnabled: false
    });
    expect(enforced.applied).toBe(true);
    expect(enforced.supportedMaxLevel).toBe(4);
  });

  test("sandbox run uses deterministic docker args with mocked docker and writes attestation", async () => {
    const workspace = newWorkspace();
    const wrapAnyMock = vi.fn(async () => "sandbox-session");
    const spawnSyncMock = vi.fn((cmd: string, args: readonly string[] = []) => {
      if (cmd === "docker" && args[0] === "--version") {
        return { status: 0, stdout: "Docker version test\n", stderr: "" } as ReturnType<typeof import("node:child_process").spawnSync>;
      }
      if (cmd === "docker" && args[0] === "image") {
        return { status: 0, stdout: "sha256:test-image\n", stderr: "" } as ReturnType<typeof import("node:child_process").spawnSync>;
      }
      return { status: 0, stdout: "", stderr: "" } as ReturnType<typeof import("node:child_process").spawnSync>;
    });

    vi.doMock("../src/ledger/monitor.js", () => ({
      wrapAny: wrapAnyMock
    }));
    vi.doMock("node:child_process", async () => {
      const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
      return {
        ...actual,
        spawnSync: spawnSyncMock
      };
    });

    const sandbox = await import("../src/sandbox/sandbox.js");
    const result = await sandbox.runSandboxCommand({
      workspace,
      agentId: "salesbot",
      command: "node",
      args: ["-v"],
      gatewayRoute: "http://127.0.0.1:3210/openai",
      gatewayProxyUrl: "http://127.0.0.1:3211"
    });

    expect(result.sessionId).toBe("sandbox-session");
    expect(result.dockerArgs).toContain("run");
    expect(result.dockerArgs).toContain("--network");
    expect(result.dockerArgs).toContain(result.networkName);
    expect(wrapAnyMock).toHaveBeenCalledOnce();
    expect(
      spawnSyncMock.mock.calls.some((call) => call[0] === "docker" && Array.isArray(call[1]) && (call[1] as string[])[0] === "network" && (call[1] as string[])[1] === "create")
    ).toBe(true);
    expect(
      spawnSyncMock.mock.calls.some((call) => call[0] === "docker" && Array.isArray(call[1]) && (call[1] as string[])[0] === "network" && (call[1] as string[])[1] === "rm")
    ).toBe(true);

    const ledger = openLedger(workspace);
    const audits = ledger.getAllEvents().filter((event) => event.event_type === "audit");
    ledger.close();
    expect(audits.some((event) => (JSON.parse(event.payload_inline ?? "{}") as Record<string, unknown>).auditType === "SANDBOX_EXECUTION_ENABLED")).toBe(
      true
    );
    expect(audits.some((event) => (JSON.parse(event.payload_inline ?? "{}") as Record<string, unknown>).auditType === "SANDBOX_NETWORK_CLEANUP_OK")).toBe(
      true
    );
  });
});
