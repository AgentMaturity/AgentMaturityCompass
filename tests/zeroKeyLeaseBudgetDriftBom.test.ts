import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initGatewayConfig, type GatewayConfig } from "../src/gateway/config.js";
import { startGateway } from "../src/gateway/server.js";
import { issueLeaseForCli, revokeLeaseForCli, verifyLeaseForCli } from "../src/leases/leaseCli.js";
import { initBudgets, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import { initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { ToolHubService } from "../src/toolhub/toolhubServer.js";
import { createWorkOrder } from "../src/workorders/workorderEngine.js";
import { issueExecTicket } from "../src/tickets/execTicketVerify.js";
import { runDriftCheck } from "../src/drift/driftDetector.js";
import { initAlertsConfig, loadAlertsConfig, signAlertsConfig, sendTestAlert } from "../src/drift/alerts.js";
import { getVaultSecret } from "../src/vault/vault.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import type { DiagnosticReport } from "../src/types.js";
import { runGovernorCheck } from "../src/governor/governorCli.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { generateBom } from "../src/bom/bomGenerator.js";
import { signBomFile, verifyBomSignature } from "../src/bom/bomVerifier.js";
import { openLedger } from "../src/ledger/ledger.js";
import { questionBank } from "../src/diagnostic/questionBank.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-zero-key-test-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "zero-key-test-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
  vi.useRealTimers();
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

async function postJson(url: string, payload: Record<string, unknown>, headers: Record<string, string> = {}): Promise<{
  status: number;
  body: string;
}> {
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
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
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

function writeRunFixture(params: {
  workspace: string;
  runId: string;
  ts: number;
  overall: number;
  integrity: number;
  correlation: number;
}): void {
  const paths = getAgentPaths(params.workspace, "default");
  const questionScores = Array.from({ length: 48 }, (_unused, idx) => ({
    questionId: `Q${idx + 1}`,
    claimedLevel: 5,
    supportedMaxLevel: 5,
    finalLevel: 5,
    confidence: 0.9,
    evidenceEventIds: ["ev"],
    flags: [],
    narrative: "fixture"
  }));
  const report: DiagnosticReport = {
    agentId: "default",
    runId: params.runId,
    ts: params.ts,
    windowStartTs: params.ts - 86_400_000,
    windowEndTs: params.ts,
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: params.integrity,
    trustLabel: params.integrity >= 0.6 ? "HIGH TRUST" : "LOW TRUST",
    targetProfileId: "default",
    layerScores: [
      { layerName: "Strategic Agent Operations", avgFinalLevel: params.overall, confidenceWeightedFinalLevel: params.overall },
      { layerName: "Leadership & Autonomy", avgFinalLevel: params.overall, confidenceWeightedFinalLevel: params.overall },
      { layerName: "Culture & Alignment", avgFinalLevel: params.overall, confidenceWeightedFinalLevel: params.overall },
      { layerName: "Resilience", avgFinalLevel: params.overall, confidenceWeightedFinalLevel: params.overall },
      { layerName: "Skills", avgFinalLevel: params.overall, confidenceWeightedFinalLevel: params.overall }
    ],
    questionScores,
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: params.correlation,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 1,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "sig",
    reportJsonSha256: "hash"
  };
  writeFileSync(join(paths.runsDir, `${params.runId}.json`), JSON.stringify(report, null, 2));
}

function writeHighMaturityRunForGovernor(workspace: string, runId: string): void {
  const paths = getAgentPaths(workspace, "default");
  const now = Date.now();
  const report: DiagnosticReport = {
    agentId: "default",
    runId,
    ts: now,
    windowStartTs: now - 86_400_000,
    windowEndTs: now,
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.95,
    trustLabel: "HIGH TRUST",
    targetProfileId: "default",
    layerScores: [
      { layerName: "Strategic Agent Operations", avgFinalLevel: 5, confidenceWeightedFinalLevel: 5 },
      { layerName: "Leadership & Autonomy", avgFinalLevel: 5, confidenceWeightedFinalLevel: 5 },
      { layerName: "Culture & Alignment", avgFinalLevel: 5, confidenceWeightedFinalLevel: 5 },
      { layerName: "Resilience", avgFinalLevel: 5, confidenceWeightedFinalLevel: 5 },
      { layerName: "Skills", avgFinalLevel: 5, confidenceWeightedFinalLevel: 5 }
    ],
    questionScores: questionBank.map((question) => ({
      questionId: question.id,
      claimedLevel: 5,
      supportedMaxLevel: 5,
      finalLevel: 5,
      confidence: 0.95,
      evidenceEventIds: ["ev"],
      flags: [],
      narrative: "high run fixture"
    })),
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 1,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "sig",
    reportJsonSha256: "hash"
  };
  writeFileSync(join(paths.runsDir, `${runId}.json`), JSON.stringify(report, null, 2));
}

describe("zero-key, leases, budgets, drift, and BOM", () => {
  test("lease issue/verify/revoke and tamper/expiry checks are deterministic", () => {
    const workspace = newWorkspace();

    const token = issueLeaseForCli({
      workspace,
      agentId: "default",
      ttl: "60m",
      scopes: "gateway:llm",
      routes: "/openai",
      models: "gpt-*",
      rpm: 60,
      tpm: 200000,
      maxCostUsdPerDay: null
    }).token;
    expect(verifyLeaseForCli({ workspace, token }).ok).toBe(true);

    const tampered = `${token.slice(0, -3)}abc`;
    expect(verifyLeaseForCli({ workspace, token: tampered }).ok).toBe(false);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
    expect(verifyLeaseForCli({ workspace, token }).ok).toBe(false);
    vi.useRealTimers();

    const verified = verifyLeaseForCli({ workspace, token });
    const leaseId = (verified.payload as { leaseId: string }).leaseId;
    revokeLeaseForCli({
      workspace,
      leaseId,
      reason: "test revocation"
    });
    expect(verifyLeaseForCli({ workspace, token }).ok).toBe(false);
  });

  test("gateway enforces leases/model allowlist and strips agent auth headers", async () => {
    const workspace = newWorkspace();
    let observedAuthorization = "";

    const upstream = createServer((req, res) => {
      observedAuthorization = String(req.headers.authorization ?? "");
      req.resume();
      req.on("end", () => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ model: "gpt-safe", usage: { total_tokens: 3 }, ok: true }));
      });
    });
    await new Promise<void>((resolvePromise) => upstream.listen(0, "127.0.0.1", () => resolvePromise()));
    const upstreamAddr = upstream.address();
    if (!upstreamAddr || typeof upstreamAddr === "string") {
      throw new Error("upstream bind failed");
    }

    process.env.OPENAI_API_KEY = "vault-only-secret";
    const config: GatewayConfig = {
      listen: { host: "127.0.0.1", port: 0 },
      redaction: {
        headerKeysDenylist: ["authorization", "x-api-key", "api-key", "x-openai-key"],
        jsonPathsDenylist: ["$.api_key", "$.key"],
        textRegexDenylist: ["(?i)sk-[A-Za-z0-9]{10,}", "(?i)bearer\\s+[A-Za-z0-9._-]{10,}"]
      },
      upstreams: {
        openai: {
          baseUrl: `http://127.0.0.1:${upstreamAddr.port}`,
          auth: { type: "bearer_env", env: "OPENAI_API_KEY" },
          allowLocalhost: true,
          providerId: "openai"
        }
      },
      routes: [{ prefix: "/openai", upstream: "openai", stripPrefix: true, openaiCompatible: true }],
      proxy: { enabled: false, port: 3211, allowlistHosts: [], denyByDefault: true }
    };
    initGatewayConfig(workspace, config);
    const gateway = await startGateway({ workspace });

    try {
      const missingLease = await postJson(`http://127.0.0.1:${gateway.port}/openai/v1/chat/completions`, {
        model: "gpt-safe",
        messages: [{ role: "user", content: "hello" }]
      }, {
        "x-amc-agent-id": "default"
      });
      expect(missingLease.status).toBe(401);

      const deniedModelLease = issueLeaseForCli({
        workspace,
        agentId: "default",
        ttl: "60m",
        scopes: "gateway:llm",
        routes: "/openai",
        models: "claude-*",
        rpm: 60,
        tpm: 200000,
        maxCostUsdPerDay: null
      }).token;
      const deniedModel = await postJson(`http://127.0.0.1:${gateway.port}/openai/v1/chat/completions`, {
        model: "gpt-safe",
        messages: [{ role: "user", content: "hello" }]
      }, {
        "x-amc-agent-id": "default",
        "x-amc-lease": deniedModelLease
      });
      expect(deniedModel.status).toBe(403);

      const lease = issueLeaseForCli({
        workspace,
        agentId: "default",
        ttl: "60m",
        scopes: "gateway:llm",
        routes: "/openai",
        models: "gpt-*",
        rpm: 60,
        tpm: 200000,
        maxCostUsdPerDay: null
      }).token;
      const success = await postJson(`http://127.0.0.1:${gateway.port}/openai/v1/chat/completions`, {
        model: "gpt-safe",
        messages: [{ role: "user", content: "hello" }]
      }, {
        "x-amc-agent-id": "default",
        "x-amc-lease": lease,
        authorization: "Bearer sk-client-1234567890"
      });
      expect(success.status).toBe(200);
      expect(observedAuthorization).toBe("Bearer vault-only-secret");
    } finally {
      await gateway.close();
      await new Promise<void>((resolvePromise) => upstream.close(() => resolvePromise()));
    }

    const ledger = openLedger(workspace);
    const audits = ledger
      .getAllEvents()
      .filter((event) => event.event_type === "audit")
      .map((event) => JSON.parse(event.payload_inline ?? "{}") as Record<string, unknown>);
    ledger.close();
    expect(audits.some((row) => row.auditType === "LEASE_INVALID_OR_MISSING")).toBe(true);
    expect(audits.some((row) => row.auditType === "LEASE_MODEL_DENIED")).toBe(true);
    expect(audits.some((row) => row.auditType === "AGENT_PROVIDED_KEY_IGNORED")).toBe(true);
  });

  test("gateway rate-limits by lease and logs budget audits", async () => {
    const workspace = newWorkspace();

    const upstream = createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ model: "gpt-mini", usage: { total_tokens: 1 } }));
      });
    });
    await new Promise<void>((resolvePromise) => upstream.listen(0, "127.0.0.1", () => resolvePromise()));
    const upstreamAddr = upstream.address();
    if (!upstreamAddr || typeof upstreamAddr === "string") {
      throw new Error("upstream bind failed");
    }

    initGatewayConfig(workspace, {
      listen: { host: "127.0.0.1", port: 0 },
      redaction: {
        headerKeysDenylist: ["authorization"],
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
      routes: [{ prefix: "/openai", upstream: "openai", stripPrefix: true, openaiCompatible: true }],
      proxy: { enabled: false, port: 3211, allowlistHosts: [], denyByDefault: true }
    });
    const gateway = await startGateway({ workspace });
    const lease = issueLeaseForCli({
      workspace,
      agentId: "default",
      ttl: "60m",
      scopes: "gateway:llm",
      routes: "/openai",
      models: "*",
      rpm: 1,
      tpm: 200000,
      maxCostUsdPerDay: null
    }).token;

    try {
      const first = await postJson(`http://127.0.0.1:${gateway.port}/openai/v1/chat/completions`, {
        model: "gpt-mini",
        messages: [{ role: "user", content: "a" }]
      }, {
        "x-amc-agent-id": "default",
        "x-amc-lease": lease
      });
      expect(first.status).toBe(200);
      const second = await postJson(`http://127.0.0.1:${gateway.port}/openai/v1/chat/completions`, {
        model: "gpt-mini",
        messages: [{ role: "user", content: "b" }]
      }, {
        "x-amc-agent-id": "default",
        "x-amc-lease": lease
      });
      expect(second.status).toBe(429);
    } finally {
      await gateway.close();
      await new Promise<void>((resolvePromise) => upstream.close(() => resolvePromise()));
    }

    const ledger = openLedger(workspace);
    const audits = ledger
      .getAllEvents()
      .filter((event) => event.event_type === "audit")
      .map((event) => JSON.parse(event.payload_inline ?? "{}") as Record<string, unknown>);
    ledger.close();
    expect(audits.some((row) => row.auditType === "LEASE_RATE_LIMITED")).toBe(true);
    expect(audits.some((row) => row.auditType === "BUDGET_EXCEEDED")).toBe(true);
  });

  test("toolhub enforces budget exceed for execute actions", async () => {
    const workspace = newWorkspace();
    initActionPolicy(workspace);
    initToolsConfig(workspace);
    writeHighMaturityRunForGovernor(workspace, "run_high");
    const agentPaths = getAgentPaths(workspace, "default");
    const now = Date.now();
    mkdirSync(join(agentPaths.reportsDir, "assurance"), { recursive: true });
    writeFileSync(
      join(agentPaths.reportsDir, "assurance", `assurance_${now}.json`),
      JSON.stringify(
        {
          assuranceRunId: `assurance_${now}`,
          agentId: "default",
          ts: now,
          mode: "supervise",
          windowStartTs: now - 86_400_000,
          windowEndTs: now,
          trustTier: "OBSERVED",
          status: "VALID",
          verificationPassed: true,
          packResults: [
            {
              packId: "unsafe_tooling",
              score0to100: 95,
              scenarioResults: [{ auditEventTypes: [] }]
            },
            {
              packId: "governance_bypass",
              score0to100: 95,
              scenarioResults: [{ auditEventTypes: [] }]
            }
          ]
        },
        null,
        2
      )
    );

    const budgets = loadBudgetsConfig(workspace);
    budgets.budgets.perAgent.default!.daily.maxToolExecutes.WRITE_LOW = 0;
    writeFileSync(join(workspace, ".amc", "budgets.yaml"), JSON.stringify(budgets, null, 2));
    signBudgetsConfig(workspace);

    const service = new ToolHubService(workspace);
    const workOrder = createWorkOrder({
      workspace,
      agentId: "default",
      title: "Budget test",
      description: "execute count budget",
      riskTier: "low",
      requestedMode: "EXECUTE",
      allowedActionClasses: ["WRITE_LOW"]
    }).workOrder;

    mkdirSync(join(workspace, "workspace", "output"), { recursive: true });
    writeFileSync(join(workspace, "workspace", "output", "seed.txt"), "seed");

    const intentA = service.createIntent({
      agentId: "default",
      workOrderId: workOrder.workOrderId,
      toolName: "fs.write",
      args: { path: "./workspace/output/a.txt", content: "a" },
      requestedMode: "EXECUTE"
    });
    const first = await service.executeIntent({ intentId: intentA.intentId });
    expect(first.allowed).toBe(true);
    expect(first.effectiveMode).toBe("EXECUTE");

    const intentB = service.createIntent({
      agentId: "default",
      workOrderId: workOrder.workOrderId,
      toolName: "fs.write",
      args: { path: "./workspace/output/b.txt", content: "b" },
      requestedMode: "EXECUTE"
    });
    const second = await service.executeIntent({ intentId: intentB.intentId });
    expect(second.allowed).toBe(false);
    expect(second.result.auditType).toBe("BUDGET_EXCEEDED");
  });

  test("drift regression creates freeze incident and governor denies execute", async () => {
    const workspace = newWorkspace();
    initActionPolicy(workspace);
    initToolsConfig(workspace);
    initAlertsConfig(workspace);
    const alertsConfig = loadAlertsConfig(workspace);
    const webhookPort = await pickFreePort();
    alertsConfig.alerts.channels[0]!.url = `http://127.0.0.1:${webhookPort}/webhook`;
    writeFileSync(join(workspace, ".amc", "alerts.yaml"), JSON.stringify(alertsConfig, null, 2));
    signAlertsConfig(workspace);

    const webhook = createServer((_req, res) => {
      res.statusCode = 200;
      res.end("ok");
    });
    await new Promise<void>((resolvePromise) => webhook.listen(webhookPort, "127.0.0.1", () => resolvePromise()));

    const now = Date.now();
    writeRunFixture({
      workspace,
      runId: "run_prev",
      ts: now - 200000,
      overall: 4.8,
      integrity: 0.95,
      correlation: 0.99
    });
    writeRunFixture({
      workspace,
      runId: "run_curr",
      ts: now - 100000,
      overall: 4.0,
      integrity: 0.7,
      correlation: 0.5
    });

    try {
      const drift = await runDriftCheck({
        workspace,
        agentId: "default"
      });
      expect(drift.triggered).toBe(true);
      expect(drift.incidentId).toBeTruthy();

      const check = runGovernorCheck({
        workspace,
        agentId: "default",
        actionClass: "DEPLOY",
        riskTier: "high",
        mode: "EXECUTE"
      });
      expect(check.effectiveMode).toBe("SIMULATE");
      expect(check.reasons.some((reason) => reason.includes("frozen"))).toBe(true);
    } finally {
      await new Promise<void>((resolvePromise) => webhook.close(() => resolvePromise()));
    }
  });

  test("alerts secrets are stored in vault and test dispatch posts deterministic payload", async () => {
    const workspace = newWorkspace();
    const out = initAlertsConfig(workspace);
    expect(readFileSync(out.configPath, "utf8")).not.toContain("x-amc-alert-secret");
    expect(getVaultSecret(workspace, "alerts/local-dev")).toBeTruthy();

    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const parsed = JSON.parse(body) as { type: string };
        expect(parsed.type).toBe("AMC_ALERT");
        res.statusCode = 200;
        res.end("ok");
      });
    });
    const port = await pickFreePort();
    await new Promise<void>((resolvePromise) => server.listen(port, "127.0.0.1", () => resolvePromise()));
    try {
      const cfg = loadAlertsConfig(workspace);
      cfg.alerts.channels[0]!.url = `http://127.0.0.1:${port}/webhook`;
      writeFileSync(join(workspace, ".amc", "alerts.yaml"), JSON.stringify(cfg, null, 2));
      signAlertsConfig(workspace);
      await sendTestAlert(workspace);
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });

  test("BOM generate/sign/verify works and fails loudly on tampering", async () => {
    const workspace = newWorkspace();
    const run = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });
    const generated = generateBom({
      workspace,
      agentId: "default",
      runId: run.runId,
      outFile: "amc-bom.json"
    });
    const signed = signBomFile({
      workspace,
      inputFile: generated.outFile,
      outputSigFile: "amc-bom.json.sig"
    });
    const verified = verifyBomSignature({
      workspace,
      inputFile: generated.outFile,
      sigFile: signed.sigFile
    });
    expect(verified.ok).toBe(true);

    writeFileSync(generated.outFile, `${readFileSync(generated.outFile, "utf8")}\n# tamper`);
    const afterTamper = verifyBomSignature({
      workspace,
      inputFile: generated.outFile,
      sigFile: signed.sigFile
    });
    expect(afterTamper.ok).toBe(false);
  });

  test("workspace evidence blobs do not contain provider key patterns", async () => {
    const workspace = newWorkspace();

    const upstream = createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ model: "gpt-safe", usage: { total_tokens: 1 } }));
      });
    });
    await new Promise<void>((resolvePromise) => upstream.listen(0, "127.0.0.1", () => resolvePromise()));
    const upstreamAddr = upstream.address();
    if (!upstreamAddr || typeof upstreamAddr === "string") {
      throw new Error("upstream bind failed");
    }

    initGatewayConfig(workspace, {
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
    });
    const gateway = await startGateway({ workspace });
    const lease = issueLeaseForCli({
      workspace,
      agentId: "default",
      ttl: "60m",
      scopes: "gateway:llm",
      routes: "/openai",
      models: "*",
      rpm: 60,
      tpm: 100000,
      maxCostUsdPerDay: null
    }).token;
    try {
      await postJson(`http://127.0.0.1:${gateway.port}/openai/v1/chat/completions`, {
        model: "gpt-safe",
        messages: [{ role: "user", content: "hello" }]
      }, {
        "x-amc-agent-id": "default",
        "x-amc-lease": lease,
        authorization: "Bearer sk-should-not-leak-1234567890"
      });
    } finally {
      await gateway.close();
      await new Promise<void>((resolvePromise) => upstream.close(() => resolvePromise()));
    }

    const blobsDir = join(workspace, ".amc", "blobs");
    const files = readdirSync(blobsDir);
    for (const file of files) {
      const text = readFileSync(join(blobsDir, file), "utf8");
      expect(text).not.toMatch(/sk-[A-Za-z0-9]{10,}/i);
      expect(text).not.toMatch(/bearer\s+[A-Za-z0-9._-]{10,}/i);
    }
  });
});
