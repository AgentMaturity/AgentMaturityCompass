import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace, loadAMCConfig, saveAMCConfig } from "../src/workspace.js";
import { gatewayConfigSchema, initGatewayConfig, saveGatewayConfig, verifyGatewayConfigSignature, type GatewayConfig } from "../src/gateway/config.js";
import { startGateway } from "../src/gateway/server.js";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { superviseProcess } from "../src/ledger/monitor.js";
import { verifyReceipt } from "../src/receipts/receipt.js";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gateway-test-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

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

async function httpPostJsonDetailed(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: string; headers: Record<string, string | string[]>; trailers: Record<string, string> }> {
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
          resolvePromise({
            status: res.statusCode ?? 0,
            body: data,
            headers: res.headers as Record<string, string | string[]>,
            trailers: res.trailers as Record<string, string>
          });
        });
      }
    );

    req.on("error", rejectPromise);
    req.write(body);
    req.end();
  });
}

function issueGatewayLease(workspace: string, agentId: string, routes = "/test"): string {
  return issueLeaseForCli({
    workspace,
    agentId,
    ttl: "60m",
    scopes: "gateway:llm",
    routes,
    models: "*",
    rpm: 1000,
    tpm: 1000000,
    maxCostUsdPerDay: null
  }).token;
}

describe("gateway and supervise", () => {
  test("gateway captures llm_request/llm_response and verify fails after blob tamper", async () => {
    const workspace = newWorkspace();

    const upstream = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString("utf8");
      });
      req.on("end", () => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            id: "resp-1",
            model: "gpt-test",
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            echo: JSON.parse(body)
          })
        );
      });
    });

    await new Promise<void>((resolvePromise) => {
      upstream.listen(0, "127.0.0.1", () => resolvePromise());
    });

    const upstreamAddress = upstream.address();
    if (!upstreamAddress || typeof upstreamAddress === "string") {
      throw new Error("upstream failed to bind");
    }

    const gatewayConfig: GatewayConfig = gatewayConfigSchema.parse({
      listen: { host: "127.0.0.1", port: 0 },
      redaction: {
        headerKeysDenylist: ["authorization", "x-api-key"],
        jsonPathsDenylist: ["$.api_key"],
        textRegexDenylist: ["(?i)sk-[A-Za-z0-9]{10,}"]
      },
      upstreams: {
        test: {
          baseUrl: `http://127.0.0.1:${upstreamAddress.port}`,
          auth: { type: "none" },
          allowLocalhost: true
        }
      },
      routes: [{ prefix: "/test", upstream: "test", stripPrefix: true, openaiCompatible: false }]
    });

    initGatewayConfig(workspace, gatewayConfig);
    const sig = verifyGatewayConfigSignature(workspace);
    expect(sig.valid).toBe(true);

    const gateway = await startGateway({ workspace });
    const lease = issueGatewayLease(workspace, "default", "/test");

    const response = await httpPostJson(`http://${gateway.host}:${gateway.port}/test/v1/chat/completions`, {
      model: "gpt-test",
      messages: [{ role: "user", content: "hello" }]
    }, {
      "x-amc-agent-id": "default",
      "x-amc-lease": lease
    });

    expect(response.status).toBe(200);

    await gateway.close();
    await new Promise<void>((resolvePromise) => upstream.close(() => resolvePromise()));

    const ledger = openLedger(workspace);
    const llmRequests = ledger.getAllEvents().filter((event) => event.event_type === "llm_request");
    const llmResponses = ledger.getAllEvents().filter((event) => event.event_type === "llm_response");
    ledger.close();

    expect(llmRequests.length).toBeGreaterThan(0);
    expect(llmResponses.length).toBeGreaterThan(0);

    const reqMeta = JSON.parse(llmRequests[0]?.meta_json ?? "{}") as Record<string, unknown>;
    const respMeta = JSON.parse(llmResponses[0]?.meta_json ?? "{}") as Record<string, unknown>;
    expect(reqMeta.request_id).toBeTruthy();
    expect(respMeta.request_id).toBe(reqMeta.request_id);

    const verifyBeforeTamper = await verifyLedgerIntegrity(workspace);
    expect(verifyBeforeTamper.ok).toBe(true);

    const tamperTarget = llmResponses.find((event) => event.payload_path)?.payload_path;
    if (!tamperTarget) {
      throw new Error("Expected llm_response payload_path to tamper with blob");
    }

    const fullBlobPath = join(workspace, tamperTarget);
    writeFileSync(fullBlobPath, `${readFileSync(fullBlobPath, "utf8")}\nCORRUPTED`);

    const verifyAfterTamper = await verifyLedgerIntegrity(workspace);
    expect(verifyAfterTamper.ok).toBe(false);
  });

  test("unsigned gateway config triggers audit and diagnostic trust penalty", async () => {
    const workspace = newWorkspace();

    const unsignedConfig: GatewayConfig = gatewayConfigSchema.parse({
      listen: { host: "127.0.0.1", port: 0 },
      redaction: {
        headerKeysDenylist: ["authorization"],
        jsonPathsDenylist: ["$.key"],
        textRegexDenylist: ["(?i)bearer\\s+[A-Za-z0-9._-]{10,}"]
      },
      upstreams: {
        local: {
          baseUrl: "http://127.0.0.1:9999",
          auth: { type: "none" },
          allowLocalhost: false
        }
      },
      routes: [{ prefix: "/local", upstream: "local", stripPrefix: true, openaiCompatible: false }]
    });

    saveGatewayConfig(workspace, unsignedConfig);
    const signatureState = verifyGatewayConfigSignature(workspace);
    expect(signatureState.valid).toBe(false);
    expect(signatureState.signatureExists).toBe(false);

    const gateway = await startGateway({ workspace });
    await gateway.close();

    const ledger = openLedger(workspace);
    const audits = ledger
      .getAllEvents()
      .filter((event) => event.event_type === "audit")
      .map((event) => JSON.parse(event.payload_inline ?? "{}") as Record<string, unknown>);
    ledger.close();

    expect(audits.some((audit) => audit.auditType === "CONFIG_UNSIGNED")).toBe(true);

    const report = await runDiagnostic({ workspace, window: "14d", targetName: "default", claimMode: "auto" });
    expect(report.status).toBe("VALID");
    expect(report.trustLabel).not.toBe("HIGH TRUST");
  });

  test("supervise injects provider route env vars and records stdout/stderr", async () => {
    const workspace = newWorkspace();
    const providerRoute = "http://127.0.0.1:3210/openai";

    const cfg = loadAMCConfig(workspace);
    cfg.supervise.extraEnv = { CUSTOM_SUPERVISE_FLAG: "enabled" };
    saveAMCConfig(workspace, cfg);

    const sessionId = await superviseProcess(
      "node",
      [
        "-e",
        [
          'console.log("OPENAI_BASE_URL=" + process.env.OPENAI_BASE_URL);',
          'console.log("OPENAI_API_BASE=" + process.env.OPENAI_API_BASE);',
          'console.log("AMC_LLM_BASE_URL=" + process.env.AMC_LLM_BASE_URL);',
          'console.error("OPENAI_API_HOST=" + process.env.OPENAI_API_HOST);',
          'console.error("CUSTOM_SUPERVISE_FLAG=" + process.env.CUSTOM_SUPERVISE_FLAG);'
        ].join("")
      ],
      {
        workspace,
        config: cfg,
        providerRoute
      }
    );

    const ledger = openLedger(workspace);
    const events = ledger.getAllEvents().filter((event) => event.session_id === sessionId);
    const eventText = (event: (typeof events)[number]): string => {
      if (event.payload_inline !== null) {
        return event.payload_inline;
      }
      if (event.payload_path !== null) {
        return readFileSync(join(workspace, event.payload_path), "utf8");
      }
      return "";
    };
    const stdoutPayload = events
      .filter((event) => event.event_type === "stdout")
      .map((event) => eventText(event))
      .join("\n");
    const stderrPayload = events
      .filter((event) => event.event_type === "stderr")
      .map((event) => eventText(event))
      .join("\n");
    ledger.close();

    expect(stdoutPayload).toContain(`OPENAI_BASE_URL=${providerRoute}`);
    expect(stdoutPayload).toContain(`OPENAI_API_BASE=${providerRoute}`);
    expect(stdoutPayload).toContain(`AMC_LLM_BASE_URL=${providerRoute}`);
    expect(stderrPayload).toContain(`OPENAI_API_HOST=${providerRoute}`);
    expect(stderrPayload).toContain("CUSTOM_SUPERVISE_FLAG=enabled");

  });

  test("stream passthrough mode returns receipt trailer and keeps verifiable receipt", async () => {
    const workspace = newWorkspace();

    const upstream = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString("utf8");
      });
      req.on("end", () => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.write('{"id":"resp-stream","model":"gpt-stream","echo":');
        res.write(body);
        res.end("}");
      });
    });
    await new Promise<void>((resolvePromise) => upstream.listen(0, "127.0.0.1", () => resolvePromise()));
    const upstreamAddress = upstream.address();
    if (!upstreamAddress || typeof upstreamAddress === "string") {
      throw new Error("upstream failed to bind");
    }

    const gatewayConfig: GatewayConfig = gatewayConfigSchema.parse({
      listen: { host: "127.0.0.1", port: 0 },
      redaction: {
        headerKeysDenylist: ["authorization", "x-api-key"],
        jsonPathsDenylist: ["$.api_key"],
        textRegexDenylist: ["(?i)sk-[A-Za-z0-9]{10,}"]
      },
      upstreams: {
        test: {
          baseUrl: `http://127.0.0.1:${upstreamAddress.port}`,
          auth: { type: "none" },
          allowLocalhost: true
        }
      },
      routes: [{ prefix: "/test", upstream: "test", stripPrefix: true, openaiCompatible: false }],
      streamPassthrough: true
    });

    initGatewayConfig(workspace, gatewayConfig);
    const gateway = await startGateway({ workspace });
    const lease = issueGatewayLease(workspace, "default", "/test");

    const response = await httpPostJsonDetailed(`http://${gateway.host}:${gateway.port}/test/v1/chat/completions`, {
      model: "gpt-stream",
      messages: [{ role: "user", content: "stream" }]
    }, {
      "x-amc-agent-id": "default",
      "x-amc-lease": lease
    });
    expect(response.status).toBe(200);
    expect(response.headers["x-amc-receipt-mode"]).toBe("trailer");
    expect(typeof response.headers["x-amc-request-id"]).toBe("string");
    expect(typeof response.trailers["x-amc-receipt-trailer"]).toBe("string");

    const receiptCheck = verifyReceipt(response.trailers["x-amc-receipt-trailer"], getPublicKeyHistory(workspace, "monitor"));
    expect(receiptCheck.ok).toBe(true);

    await gateway.close();
    await new Promise<void>((resolvePromise) => upstream.close(() => resolvePromise()));
  });
});
