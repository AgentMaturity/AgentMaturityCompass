import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { initWorkspace } from "../src/workspace.js";
import { gatewayConfigSchema, initGatewayConfig } from "../src/gateway/config.js";
import { startGateway } from "../src/gateway/server.js";
import { getPublicKeyHistory, getPrivateKeyPem } from "../src/crypto/keys.js";
import { parseEvidenceEvent } from "../src/diagnostic/gates.js";
import { correlateTracesAgainstEvidence } from "../src/correlation/correlate.js";
import { mintReceipt, verifyReceipt } from "../src/receipts/receipt.js";
import { openLedger } from "../src/ledger/ledger.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { wrapFetch } from "../src/runtime/wrapFetch.js";
import { buildDashboard } from "../src/dashboard/build.js";
import { serveDashboard } from "../src/dashboard/serve.js";
import { exportEvidenceBundle, verifyEvidenceBundle } from "../src/bundles/bundle.js";
import { sha256Hex } from "../src/utils/hash.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-receipt-test-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

async function httpPostJson(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  const body = JSON.stringify(payload);
  const target = new URL(url);
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      {
        host: target.hostname,
        port: Number(target.port),
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          ...headers
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    req.on("error", rejectPromise);
    req.write(body);
    req.end();
  });
}

function extractTar(bundleFile: string, outputDir: string): void {
  const out = spawnSync("tar", ["-xzf", bundleFile, "-C", outputDir], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`tar extract failed: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function packTar(sourceDir: string, bundleFile: string): void {
  const out = spawnSync("tar", ["-czf", bundleFile, "-C", sourceDir, "."], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`tar pack failed: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("receipts, correlation, runtime sdk, dashboard", () => {
  test("gateway injects receipt header and receipt verifies against ledger event hash", async () => {
    const workspace = newWorkspace();

    const upstream = createHttpServer((req, res) => {
      req.resume();
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ model: "gpt-test", usage: { total_tokens: 7 }, output_text: "ok" }));
    });
    await new Promise<void>((resolvePromise) => upstream.listen(0, "127.0.0.1", () => resolvePromise()));
    const upstreamAddr = upstream.address();
    if (!upstreamAddr || typeof upstreamAddr === "string") {
      throw new Error("failed to allocate upstream address");
    }

    initGatewayConfig(workspace, gatewayConfigSchema.parse({
      listen: { host: "127.0.0.1", port: 0 },
      redaction: {
        headerKeysDenylist: ["authorization", "x-api-key", "api-key", "x-openai-key"],
        jsonPathsDenylist: ["$.api_key", "$.key"],
        textRegexDenylist: ["(?i)sk-[A-Za-z0-9]{10,}", "(?i)bearer\\s+[A-Za-z0-9._-]{10,}"]
      },
      upstreams: {
        openai: {
          baseUrl: `http://127.0.0.1:${upstreamAddr.port}`,
          auth: { type: "none" },
          providerId: "openai",
          allowLocalhost: true
        }
      },
      routes: [{ prefix: "/openai", upstream: "openai", stripPrefix: true, openaiCompatible: true }],
      proxy: { enabled: false, port: 3211, allowlistHosts: [], denyByDefault: true }
    }));

    const gateway = await startGateway({ workspace });
    try {
      const lease = issueLeaseForCli({
        workspace,
        agentId: "default",
        ttl: "60m",
        scopes: "gateway:llm",
        routes: "/openai",
        models: "*",
        rpm: 500,
        tpm: 1000000,
        maxCostUsdPerDay: null
      }).token;
      const res = await httpPostJson(`http://127.0.0.1:${gateway.port}/openai/v1/chat/completions`, {
        model: "gpt-test",
        messages: [{ role: "user", content: "hello" }]
      }, {
        "x-amc-agent-id": "default",
        "x-amc-lease": lease
      });
      expect(res.status).toBe(200);
      const receipt = Array.isArray(res.headers["x-amc-receipt"])
        ? res.headers["x-amc-receipt"][0]
        : res.headers["x-amc-receipt"];
      expect(receipt).toBeTruthy();

      const verified = verifyReceipt(String(receipt), getPublicKeyHistory(workspace, "monitor"));
      expect(verified.ok).toBe(true);
      expect(verified.payload?.event_hash).toBeTruthy();

      const ledger = openLedger(workspace);
      const event = ledger.getAllEvents().find((row) => row.event_hash === verified.payload?.event_hash);
      ledger.close();
      expect(event).toBeTruthy();
      expect(event?.event_type).toBe("llm_response");
    } finally {
      await gateway.close();
      upstream.close();
    }
  });

  test("correlation engine validates matching receipts and detects invalid/unmatched receipts", () => {
    const workspace = newWorkspace();
    const ledger = openLedger(workspace);
    const sessionId = randomUUID();
    ledger.startSession({
      sessionId,
      runtime: "any",
      binaryPath: "test-runtime",
      binarySha256: "abc"
    });

    const llm = ledger.appendEvidenceWithReceipt({
      sessionId,
      runtime: "gateway",
      eventType: "llm_response",
      payload: JSON.stringify({ body: "ok" }),
      payloadExt: "json",
      inline: true,
      meta: {
        agentId: "default",
        trustTier: "OBSERVED"
      },
      receipt: {
        kind: "llm_response",
        agentId: "default",
        providerId: "openai",
        model: "gpt-test",
        bodySha256: sha256Hex(Buffer.from(JSON.stringify({ body: "ok" }), "utf8"))
      }
    });

    const validTrace = JSON.stringify({
      amc_trace_v: 1,
      ts: Date.now(),
      agentId: "default",
      event: "llm_result",
      receipt: llm.receipt
    });
    ledger.appendEvidence({
      sessionId,
      runtime: "any",
      eventType: "stdout",
      payload: validTrace,
      inline: true,
      meta: {
        agentId: "default",
        trustTier: "OBSERVED"
      }
    });

    const badSigReceipt = "bad.receipt";
    const invalidTrace = JSON.stringify({
      amc_trace_v: 1,
      ts: Date.now(),
      agentId: "default",
      event: "llm_result",
      receipt: badSigReceipt
    });
    ledger.appendEvidence({
      sessionId,
      runtime: "any",
      eventType: "stderr",
      payload: invalidTrace,
      inline: true,
      meta: {
        agentId: "default",
        trustTier: "OBSERVED"
      }
    });

    const fake = mintReceipt({
      kind: "llm_response",
      ts: Date.now(),
      agentId: "default",
      providerId: "openai",
      model: null,
      eventHash: "f".repeat(64),
      bodySha256: "a".repeat(64),
      sessionId,
      privateKeyPem: getPrivateKeyPem(workspace, "monitor")
    });
    const unmatchedTrace = JSON.stringify({
      amc_trace_v: 1,
      ts: Date.now(),
      agentId: "default",
      event: "llm_result",
      receipt: fake.receipt
    });
    ledger.appendEvidence({
      sessionId,
      runtime: "any",
      eventType: "stdout",
      payload: unmatchedTrace,
      inline: true,
      meta: {
        agentId: "default",
        trustTier: "OBSERVED"
      }
    });

    ledger.sealSession(sessionId);
    const parsed = ledger.getAllEvents().map((event) => parseEvidenceEvent(event));
    ledger.close();

    const metrics = correlateTracesAgainstEvidence({
      events: parsed,
      monitorPublicKeys: getPublicKeyHistory(workspace, "monitor"),
      expectedAgentId: "default"
    });

    expect(metrics.totalTracesWithReceipt).toBe(3);
    expect(metrics.validReceipts).toBe(1);
    expect(metrics.invalidReceipts).toBe(2);
    expect(metrics.unmatchedReceipts).toBe(1);
    expect(metrics.issues.some((issue) => issue.auditType === "TRACE_RECEIPT_INVALID")).toBe(true);
    expect(metrics.issues.some((issue) => issue.auditType === "TRACE_EVENT_HASH_NOT_FOUND")).toBe(true);
  });

  test("diagnostic applies invalid-receipt cap for high-risk honesty question", async () => {
    const workspace = newWorkspace();
    const contextPath = join(workspace, ".amc", "context-graph.json");
    const context = JSON.parse(readFileSync(contextPath, "utf8")) as Record<string, unknown>;
    context.riskTier = "high";
    writeFileSync(contextPath, JSON.stringify(context, null, 2));

    const ledger = openLedger(workspace);
    const dayMs = 24 * 60 * 60 * 1000;
    const base = Date.now() - dayMs * 3;

    const sessions = ["s1", "s2", "s3"];
    for (let i = 0; i < sessions.length; i += 1) {
      const sid = sessions[i]!;
      ledger.startSession({
        sessionId: sid,
        runtime: "gateway",
        binaryPath: "test-runtime",
        binarySha256: "abc"
      });
      const ts = base + i * dayMs;
      ledger.appendEvidence({
        sessionId: sid,
        runtime: "gateway",
        eventType: "llm_response",
        payload: "What I observed [ev:abc] and uncertain assumption details.",
        inline: true,
        ts,
        meta: {
          questionId: "AMC-2.5",
          agentId: "default",
          trustTier: "OBSERVED"
        }
      });
      ledger.appendEvidence({
        sessionId: sid,
        runtime: "gateway",
        eventType: "audit",
        payload: JSON.stringify({ auditType: "ALIGNMENT_CHECK_PASS" }),
        inline: true,
        ts: ts + 1,
        meta: {
          questionId: "AMC-2.5",
          auditType: "ALIGNMENT_CHECK_PASS",
          agentId: "default",
          trustTier: "OBSERVED"
        }
      });
      if (i < 2) {
        ledger.appendEvidence({
          sessionId: sid,
          runtime: "gateway",
          eventType: "metric",
          payload: JSON.stringify({ metricKey: `m-${i}` }),
          inline: true,
          ts: ts + 2,
          meta: {
            questionId: "AMC-2.5",
            metricKey: `m-${i}`,
            agentId: "default",
            trustTier: "OBSERVED"
          }
        });
      }
      ledger.sealSession(sid);
    }

    const badReceiptTrace = JSON.stringify({
      amc_trace_v: 1,
      ts: Date.now(),
      agentId: "default",
      event: "llm_result",
      receipt: "bad.receipt"
    });
    ledger.appendEvidence({
      sessionId: "trace-session",
      runtime: "any",
      eventType: "stdout",
      payload: badReceiptTrace,
      inline: true,
      meta: {
        agentId: "default",
        trustTier: "OBSERVED"
      }
    });

    ledger.close();

    const report = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });

    const honesty = report.questionScores.find((row) => row.questionId === "AMC-2.5");
    expect(report.correlationRatio).toBeLessThan(0.8);
    expect(report.invalidReceiptsCount).toBeGreaterThan(0);
    expect(honesty?.finalLevel ?? 0).toBeLessThanOrEqual(2);
    expect(honesty?.flags).toContain("FLAG_INVALID_RECEIPTS");
  });

  test("wrapFetch rewrites base URL, injects agent header, and emits AMC trace logs", async () => {
    const hits: Array<{ path: string; agentId: string | undefined }> = [];
    const server = createHttpServer((req, res) => {
      const agentId = req.headers["x-amc-agent-id"] as string | undefined;
      hits.push({ path: req.url ?? "", agentId });
      req.resume();
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.setHeader("x-amc-request-id", "req-1");
      res.setHeader("x-amc-receipt", "receipt-1");
      res.end("{}");
    });
    await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("bad server address");
    }

    const logs: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as unknown as { write: (chunk: string | Uint8Array) => boolean }).write = (chunk: string | Uint8Array) => {
      logs.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
      return true;
    };

    try {
      const wrapped = wrapFetch(fetch, {
        agentId: "salesbot",
        gatewayBaseUrl: `http://127.0.0.1:${addr.port}/openai`,
        forceBaseUrl: true
      });
      const response = await wrapped("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({ model: "gpt-test" }),
        headers: { "content-type": "application/json" }
      });
      expect(response.status).toBe(200);
    } finally {
      (process.stdout as unknown as { write: (chunk: string | Uint8Array) => boolean }).write = originalWrite;
      server.close();
    }

    expect(hits[0]?.path).toBe("/openai/v1/chat/completions");
    expect(hits[0]?.agentId).toBe("salesbot");

    const parsed = logs
      .join("")
      .split(/\r?\n/)
      .filter((line) => line.trim().startsWith("{"))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(parsed.some((row) => row.event === "llm_call")).toBe(true);
    expect(parsed.some((row) => row.event === "llm_result" && row.receipt === "receipt-1")).toBe(true);
  });

  test("dashboard build/serve creates required assets and serves index.html", async () => {
    const workspace = newWorkspace();
    const run = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });

    const built = buildDashboard({
      workspace,
      outDir: ".amc/dashboard-test"
    });
    expect(built.latestRunId).toBe(run.runId);

    const outDir = join(workspace, ".amc", "dashboard-test");
    for (const file of ["index.html", "app.js", "styles.css", "data.json", "evidenceIndex.json"]) {
      expect(readFileSync(join(outDir, file), "utf8").length).toBeGreaterThan(0);
    }

    const data = JSON.parse(readFileSync(join(outDir, "data.json"), "utf8")) as Record<string, unknown>;
    expect(data.latestRun).toBeTruthy();
    expect(data.targetMapping).toBeTruthy();
    expect(data.trends).toBeTruthy();
    expect(data.indices).toBeTruthy();

    const port = 46000 + Math.floor(Math.random() * 500);
    const server = await serveDashboard({
      workspace,
      port,
      outDir: ".amc/dashboard-test"
    });
    try {
      const response = await new Promise<{ status: number; body: string }>((resolvePromise, rejectPromise) => {
        const req = httpRequest(`${server.url}/`, { method: "GET" }, (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
        });
        req.on("error", rejectPromise);
        req.end();
      });
      expect(response.status).toBe(200);
      expect(response.body).toContain("AMC Dashboard");
    } finally {
      await server.close();
    }
  });

  test("dashboard serve supports ephemeral ports", async () => {
    const workspace = newWorkspace();
    await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });

    buildDashboard({
      workspace,
      outDir: ".amc/dashboard-ephemeral"
    });

    const server = await serveDashboard({
      workspace,
      port: 0,
      outDir: ".amc/dashboard-ephemeral"
    });
    try {
      expect(server.port).toBeGreaterThan(0);
      expect(server.url).toContain(`:${server.port}`);
      const response = await new Promise<{ status: number; body: string }>((resolvePromise, rejectPromise) => {
        const req = httpRequest(`${server.url}/`, { method: "GET" }, (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
        });
        req.on("error", rejectPromise);
        req.end();
      });
      expect(response.status).toBe(200);
      expect(response.body).toContain("AMC Dashboard");
    } finally {
      await server.close();
    }
  });

  test("bundle verification fails when receipt metadata is tampered", async () => {
    const workspace = newWorkspace();
    const ledger = openLedger(workspace);
    const sessionId = randomUUID();
    ledger.startSession({
      sessionId,
      runtime: "gateway",
      binaryPath: "test-runtime",
      binarySha256: "abc"
    });
    ledger.appendEvidenceWithReceipt({
      sessionId,
      runtime: "gateway",
      eventType: "llm_response",
      payload: JSON.stringify({ body: "ok" }),
      inline: true,
      payloadExt: "json",
      meta: { agentId: "default", trustTier: "OBSERVED" },
      receipt: {
        kind: "llm_response",
        agentId: "default",
        providerId: "openai",
        model: "gpt-test",
        bodySha256: sha256Hex(Buffer.from(JSON.stringify({ body: "ok" }), "utf8"))
      }
    });
    ledger.sealSession(sessionId);
    ledger.close();

    const run = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });

    const bundleFile = join(workspace, ".amc", "receipt-bundle.amcbundle");
    exportEvidenceBundle({
      workspace,
      runId: run.runId,
      outFile: bundleFile
    });

    const extractedDir = mkdtempSync(join(tmpdir(), "amc-receipt-bundle-"));
    roots.push(extractedDir);
    extractTar(bundleFile, extractedDir);

    const db = new Database(join(extractedDir, "evidence", "evidence.sqlite"));
    try {
      const row = db
        .prepare("SELECT id, meta_json FROM evidence_events WHERE meta_json LIKE '%\"receipt\"%' LIMIT 1")
        .get() as { id: string; meta_json: string } | undefined;
      expect(row).toBeTruthy();
      const meta = JSON.parse(row!.meta_json) as Record<string, unknown>;
      const receipt = String(meta.receipt ?? "");
      meta.receipt = `${receipt.slice(0, -1)}X`;
      db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(JSON.stringify(meta), row!.id);
    } finally {
      db.close();
    }

    const tamperedBundle = join(workspace, ".amc", "receipt-bundle-tampered.amcbundle");
    packTar(extractedDir, tamperedBundle);

    const verify = await verifyEvidenceBundle(tamperedBundle);
    expect(verify.ok).toBe(false);
  });
});
