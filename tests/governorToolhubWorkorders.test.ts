import { createServer, request as httpRequest } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import type { DiagnosticReport, RiskTier, TargetProfile } from "../src/types.js";
import {
  actionPolicyPath,
  evaluateActionPermission,
  initActionPolicy,
  loadActionPolicy,
  verifyActionPolicySignature,
  type GovernorAssuranceSummary,
  type GovernorTrustSummary
} from "../src/governor/actionPolicyEngine.js";
import { initToolsConfig, toolsConfigPath, verifyToolsConfigSignature } from "../src/toolhub/toolhubValidators.js";
import { ToolHubService } from "../src/toolhub/toolhubServer.js";
import { openLedger } from "../src/ledger/ledger.js";
import { createWorkOrder, verifyWorkOrder } from "../src/workorders/workorderEngine.js";
import { issueExecTicket } from "../src/tickets/execTicketVerify.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { defaultGatewayConfig, initGatewayConfig } from "../src/gateway/config.js";
import { startGateway } from "../src/gateway/server.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-governor-test-"));
  roots.push(dir);
  const _savedVaultPass = process.env.AMC_VAULT_PASSPHRASE;
  process.env.AMC_VAULT_PASSPHRASE = "governor-test-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function mockRun(level: number): DiagnosticReport {
  const now = Date.now();
  return {
    agentId: "default",
    runId: "run_mock",
    ts: now,
    windowStartTs: now - 86_400_000,
    windowEndTs: now,
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.95,
    trustLabel: "HIGH TRUST",
    targetProfileId: null,
    layerScores: [],
    questionScores: questionBank.map((q) => ({
      questionId: q.id,
      claimedLevel: level,
      supportedMaxLevel: level,
      finalLevel: level,
      confidence: 0.95,
      evidenceEventIds: ["ev_mock"],
      flags: [],
      narrative: "mock"
    })),
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 1,
    evidenceTrustCoverage: {
      observed: 1,
      attested: 0,
      selfReported: 0
    },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "sig",
    reportJsonSha256: "hash"
  };
}

function mockTarget(level: number, overrides: Record<string, number> = {}): TargetProfile {
  const mapping: Record<string, number> = {};
  for (const q of questionBank) {
    mapping[q.id] = level;
  }
  for (const [id, target] of Object.entries(overrides)) {
    mapping[id] = target;
  }
  return {
    id: "target_mock",
    name: "default",
    createdTs: Date.now(),
    contextGraphHash: "ctx",
    mapping,
    signature: "sig"
  };
}

const strongTrust: GovernorTrustSummary = {
  trustTier: "OBSERVED_HARDENED",
  sandboxEvidence: true,
  untrustedConfig: false,
  correlationRatio: 1
};

const strongAssurance: GovernorAssuranceSummary = {
  packs: {
    injection: { score: 95, succeeded: 0, observed: true },
    exfiltration: { score: 95, succeeded: 0, observed: true },
    unsafe_tooling: { score: 95, succeeded: 0, observed: true },
    governance_bypass: { score: 95, succeeded: 0, observed: true },
    hallucination: { score: 95, succeeded: 0, observed: true }
  }
};

async function pickFreePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((resolvePromise) => s.listen(0, "127.0.0.1", () => resolvePromise()));
  const addr = s.address();
  await new Promise<void>((resolvePromise) => s.close(() => resolvePromise()));
  if (!addr || typeof addr === "string") {
    throw new Error("failed to allocate port");
  }
  return addr.port;
}

async function postJson(url: string, body: Record<string, unknown>, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
  return {
    status: response.status,
    body: await response.text()
  };
}

async function sendGatewayRequest(params: {
  url: string;
  body: string;
  headers?: Record<string, string>;
}): Promise<{ status: number; body: string }> {
  const target = new URL(params.url);
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      {
        method: "POST",
        hostname: target.hostname,
        port: Number(target.port),
        path: `${target.pathname}${target.search}`,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(params.body),
          ...(params.headers ?? {})
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
    req.write(params.body);
    req.end();
  });
}

describe("governor + toolhub + workorders", () => {
  test("action-policy signature tamper denies EXECUTE", () => {
    const workspace = newWorkspace();
    initActionPolicy(workspace);

    const policyFile = actionPolicyPath(workspace);
    writeFileSync(policyFile, `${readFileSync(policyFile, "utf8")}\n# tamper`);
    const sig = verifyActionPolicySignature(workspace);
    expect(sig.valid).toBe(false);

    const decision = evaluateActionPermission({
      agentId: "default",
      actionClass: "READ_ONLY",
      riskTier: "med",
      currentDiagnosticRun: mockRun(5),
      targetProfile: mockTarget(5),
      trustSummary: strongTrust,
      assuranceSummary: strongAssurance,
      requestedMode: "EXECUTE",
      policy: loadActionPolicy(workspace),
      policySignatureValid: sig.valid
    });

    expect(decision.effectiveMode).toBe("SIMULATE");
    expect(decision.reasons.some((reason) => reason.includes("UNTRUSTED CONFIG"))).toBe(true);
  });

  test("governor effective level uses min(current,target)", () => {
    const workspace = newWorkspace();
    initActionPolicy(workspace);

    const decision = evaluateActionPermission({
      agentId: "default",
      actionClass: "DEPLOY",
      riskTier: "low",
      currentDiagnosticRun: mockRun(5),
      targetProfile: mockTarget(5, { "AMC-1.8": 2 }),
      trustSummary: strongTrust,
      assuranceSummary: strongAssurance,
      requestedMode: "EXECUTE",
      policy: loadActionPolicy(workspace),
      policySignatureValid: true,
      hasExecTicket: true
    });

    expect(decision.effectiveMode).toBe("SIMULATE");
    expect(decision.reasons.some((reason) => reason.includes("AMC-1.8 effective level 2 < required 4"))).toBe(true);
  });

  test("tools.yaml signature tamper denies execution and writes audit event", async () => {
    const workspace = newWorkspace();
    initActionPolicy(workspace);
    initToolsConfig(workspace);
    const service = new ToolHubService(workspace);

    mkdirSync(join(workspace, "workspace"), { recursive: true });
    writeFileSync(join(workspace, "workspace", "readme.txt"), "hello");
    const intent = service.createIntent({
      agentId: "default",
      toolName: "fs.read",
      args: { path: "./workspace/readme.txt" },
      requestedMode: "SIMULATE"
    });

    writeFileSync(toolsConfigPath(workspace), `${readFileSync(toolsConfigPath(workspace), "utf8")}\n# tamper`);
    expect(verifyToolsConfigSignature(workspace).valid).toBe(false);

    const execution = await service.executeIntent({ intentId: intent.intentId });
    expect(execution.allowed).toBe(false);
    expect(execution.result.auditType).toBe("CONFIG_SIGNATURE_INVALID");

    const ledger = openLedger(workspace);
    const audits = ledger
      .getEventsBetween(0, Date.now())
      .filter((event) => event.event_type === "audit")
      .map((event) => JSON.parse(event.meta_json) as Record<string, unknown>);
    ledger.close();
    expect(audits.some((meta) => meta.auditType === "CONFIG_SIGNATURE_INVALID")).toBe(true);
  });

  test("toolhub intent->execute works with scoped lease via Studio API", async () => {
    const workspace = newWorkspace();
    initActionPolicy(workspace);
    initToolsConfig(workspace);
    mkdirSync(join(workspace, "workspace"), { recursive: true });
    writeFileSync(join(workspace, "workspace", "token-test.txt"), "hello");

    const lease = issueLeaseForCli({
      workspace,
      agentId: "default",
      ttl: "60m",
      scopes: "toolhub:intent,toolhub:execute",
      routes: "/openai",
      models: "*",
      rpm: 500,
      tpm: 1000000,
      maxCostUsdPerDay: null
    }).token;
    const port = await pickFreePort();
    const api = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token: "admin-secret"
    });

    try {
      const intentResponse = await postJson(
        `${api.url}/toolhub/intent`,
        {
          agentId: "default",
          toolName: "fs.read",
          requestedMode: "SIMULATE",
          args: { path: "./workspace/token-test.txt" }
        },
        {
          "x-amc-lease": lease
        }
      );
      expect(intentResponse.status).toBe(200);
      const intentBody = JSON.parse(intentResponse.body) as { intentId: string };
      expect(intentBody.intentId.startsWith("intent_")).toBe(true);

      const executeResponse = await postJson(
        `${api.url}/toolhub/execute`,
        {
          intentId: intentBody.intentId
        },
        {
          "x-amc-lease": lease
        }
      );
      expect(executeResponse.status).toBe(200);
      const executeBody = JSON.parse(executeResponse.body) as { allowed: boolean; resultReceipt?: string };
      expect(executeBody.allowed).toBe(true);
      expect(typeof executeBody.resultReceipt).toBe("string");
    } finally {
      await api.close();
    }
  });

  test("toolhub denies .amc path access and dangerous argv patterns", async () => {
    const workspace = newWorkspace();
    initActionPolicy(workspace);
    initToolsConfig(workspace);
    const service = new ToolHubService(workspace);

    const intentA = service.createIntent({
      agentId: "default",
      toolName: "fs.read",
      args: { path: ".amc/amc.config.yaml" },
      requestedMode: "SIMULATE"
    });
    const deniedPath = await service.executeIntent({ intentId: intentA.intentId });
    expect(deniedPath.allowed).toBe(false);
    expect(deniedPath.result.auditType).toBe("TOOLHUB_BYPASS_ATTEMPTED");

    const intentB = service.createIntent({
      agentId: "default",
      toolName: "process.spawn",
      args: {
        binary: "node",
        argv: ["-e", "rm -rf /"]
      },
      requestedMode: "SIMULATE"
    });
    const deniedArgv = await service.executeIntent({ intentId: intentB.intentId });
    expect(deniedArgv.allowed).toBe(false);
    expect(deniedArgv.result.auditType).toBe("TOOLHUB_BYPASS_ATTEMPTED");
  });

  test("exec ticket valid allows tool flow, invalid/expired ticket is denied", async () => {
    const workspace = newWorkspace();
    initActionPolicy(workspace);
    initToolsConfig(workspace);
    const service = new ToolHubService(workspace);

    const workOrder = createWorkOrder({
      workspace,
      agentId: "default",
      title: "Deploy mock",
      description: "test flow",
      riskTier: "low",
      requestedMode: "EXECUTE",
      allowedActionClasses: ["WRITE_HIGH"]
    }).workOrder;

    const validTicket = issueExecTicket({
      workspace,
      agentId: "default",
      workOrderId: workOrder.workOrderId,
      actionClass: "WRITE_HIGH",
      toolName: "process.spawn",
      ttlMs: 10 * 60_000
    }).ticket;

    const intentValid = service.createIntent({
      agentId: "default",
      workOrderId: workOrder.workOrderId,
      toolName: "process.spawn",
      args: {
        binary: "node",
        argv: ["-v"]
      },
      requestedMode: "EXECUTE"
    });
    const validExecution = await service.executeIntent({
      intentId: intentValid.intentId,
      execTicket: validTicket
    });
    expect(validExecution.allowed).toBe(true);

    const expiredTicket = issueExecTicket({
      workspace,
      agentId: "default",
      workOrderId: workOrder.workOrderId,
      actionClass: "WRITE_HIGH",
      toolName: "process.spawn",
      ttlMs: 1000
    }).ticket;

    const [payloadB64, signatureB64] = expiredTicket.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as {
      expiresTs: number;
    };
    payload.expiresTs = Date.now() - 1000;
    const expiredPayloadB64 = Buffer.from(JSON.stringify(payload), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    const forgedExpired = `${expiredPayloadB64}.${signatureB64}`;

    const intentInvalid = service.createIntent({
      agentId: "default",
      workOrderId: workOrder.workOrderId,
      toolName: "process.spawn",
      args: {
        binary: "node",
        argv: ["-v"]
      },
      requestedMode: "EXECUTE"
    });

    const invalidExecution = await service.executeIntent({
      intentId: intentInvalid.intentId,
      execTicket: forgedExpired
    });
    expect(invalidExecution.allowed).toBe(false);
    expect(invalidExecution.result.auditType).toBe("EXEC_TICKET_INVALID");
  });

  test("work order signature is required and gateway records x-amc-workorder-id", async () => {
    const workspace = newWorkspace();
    const workOrder = createWorkOrder({
      workspace,
      agentId: "default",
      title: "Gateway-bound task",
      description: "validate workorder evidence attribution",
      riskTier: "low",
      requestedMode: "SIMULATE",
      allowedActionClasses: ["READ_ONLY"]
    });
    expect(verifyWorkOrder({ workspace, agentId: "default", workOrderId: workOrder.workOrder.workOrderId }).valid).toBe(true);

    writeFileSync(workOrder.filePath, `${readFileSync(workOrder.filePath, "utf8")}\n`);
    expect(verifyWorkOrder({ workspace, agentId: "default", workOrderId: workOrder.workOrder.workOrderId }).valid).toBe(false);

    const upstream = createServer((req, res) => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          id: "resp_1",
          model: "gpt-4o-mini",
          output: [{ type: "output_text", text: "ok" }],
          usage: { input_tokens: 1, output_tokens: 1 }
        })
      );
    });
    const upstreamPort = await pickFreePort();
    await new Promise<void>((resolvePromise) => upstream.listen(upstreamPort, "127.0.0.1", () => resolvePromise()));

    const cfg = defaultGatewayConfig();
    cfg.listen.port = await pickFreePort();
    cfg.proxy.port = await pickFreePort();
    cfg.routes = [{ prefix: "/openai", upstream: "openai", stripPrefix: true, openaiCompatible: true }];
    cfg.upstreams = {
      openai: {
        baseUrl: `http://127.0.0.1:${upstreamPort}`,
        auth: {
          type: "bearer_env",
          env: "OPENAI_API_KEY"
        }
      }
    };
    initGatewayConfig(workspace, cfg);
    const gateway = await startGateway({ workspace });
    const lease = issueLeaseForCli({
      workspace,
      agentId: "default",
      ttl: "60m",
      scopes: "gateway:llm",
      routes: "/openai",
      models: "*",
      rpm: 200,
      tpm: 1000000,
      maxCostUsdPerDay: null
    }).token;

    try {
      process.env.OPENAI_API_KEY = "test-key";
      const response = await sendGatewayRequest({
        url: `http://127.0.0.1:${cfg.listen.port}/openai/v1/responses`,
        body: JSON.stringify({ model: "gpt-4o-mini", input: [{ role: "user", content: "hi" }] }),
        headers: {
          "x-amc-agent-id": "default",
          "x-amc-lease": lease,
          "x-amc-workorder-id": workOrder.workOrder.workOrderId
        }
      });
      expect(response.status).toBe(200);

      const ledger = openLedger(workspace);
      const requestEvents = ledger
        .getEventsBetween(0, Date.now())
        .filter((event) => event.event_type === "llm_request")
        .map((event) => JSON.parse(event.meta_json) as Record<string, unknown>);
      ledger.close();
      expect(requestEvents.some((meta) => meta.workOrderId === workOrder.workOrder.workOrderId)).toBe(true);
    } finally {
      await gateway.close();
      await new Promise<void>((resolvePromise) => upstream.close(() => resolvePromise()));
    }
  });

  test("execute without ticket writes audit evidence and diagnostic stays capped", async () => {
    const workspace = newWorkspace();
    initActionPolicy(workspace);
    initToolsConfig(workspace);
    const service = new ToolHubService(workspace);

    const workOrder = createWorkOrder({
      workspace,
      agentId: "default",
      title: "No ticket attempt",
      description: "dual mode test",
      riskTier: "high",
      requestedMode: "EXECUTE",
      allowedActionClasses: ["WRITE_HIGH"]
    }).workOrder;

    const intent = service.createIntent({
      agentId: "default",
      workOrderId: workOrder.workOrderId,
      toolName: "process.spawn",
      args: {
        binary: "node",
        argv: ["-v"]
      },
      requestedMode: "EXECUTE"
    });

    const denied = await service.executeIntent({ intentId: intent.intentId });
    expect(denied.allowed).toBe(false);
    expect(denied.result.auditType).toBe("EXEC_TICKET_MISSING");

    const ledger = openLedger(workspace);
    const audits = ledger
      .getEventsBetween(0, Date.now())
      .filter((event) => event.event_type === "audit")
      .map((event) => JSON.parse(event.meta_json) as Record<string, unknown>);
    ledger.close();
    expect(audits.some((meta) => meta.auditType === "EXECUTE_WITHOUT_TICKET_ATTEMPTED")).toBe(true);

    const report = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });
    const q36 = report.questionScores.find((question) => question.questionId === "AMC-4.6");
    expect(q36).toBeDefined();
    expect((q36?.finalLevel ?? 0) <= 3).toBe(true);
  });
});
