import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { createWorkOrder } from "../src/workorders/workorderEngine.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import type { DiagnosticReport } from "../src/types.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { loadTargetProfile, verifyTargetProfileSignature } from "../src/targets/targetProfile.js";
import { openLedger } from "../src/ledger/ledger.js";
import { exportBenchmarkArtifact } from "../src/benchmarks/benchExport.js";
import { verifyBenchmarkArtifact } from "../src/benchmarks/benchVerify.js";
import { ingestBenchmarks } from "../src/benchmarks/benchImport.js";
import { benchmarkStats } from "../src/benchmarks/benchStats.js";
import { scaffoldAgent } from "../src/fleet/registry.js";
import { initUsersConfig } from "../src/auth/authApi.js";
import { enableLanMode } from "../src/pairing/lanMode.js";
import { createPairingCode } from "../src/pairing/pairingCodes.js";
import { exportEvidenceBundle } from "../src/bundles/bundle.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { writeSignedGatePolicy, defaultGatePolicy } from "../src/ci/gate.js";
import { generateBom } from "../src/bom/bomGenerator.js";
import { signBomFile } from "../src/bom/bomVerifier.js";
import { issueCertificate } from "../src/assurance/certificate.js";
import { readTransparencyEntries, verifyTransparencyLog, transparencyLogPath } from "../src/transparency/logChain.js";
import { applyPolicyPack } from "../src/policyPacks/packApply.js";
import { diffPolicyPack } from "../src/policyPacks/packDiff.js";
import { verifyActionPolicySignature } from "../src/governor/actionPolicyEngine.js";
import { verifyToolsConfigSignature } from "../src/toolhub/toolhubValidators.js";
import { verifyBudgetsConfigSignature } from "../src/budgets/budgets.js";
import { verifyAlertsConfigSignature } from "../src/drift/alerts.js";
import { verifyApprovalPolicySignature } from "../src/approvals/approvalPolicyEngine.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-console-test-"));
  roots.push(dir);
  const _savedVaultPass = process.env.AMC_VAULT_PASSPHRASE;
  process.env.AMC_VAULT_PASSPHRASE = "console-test-passphrase";
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

async function httpRequestRaw(params: {
  url: string;
  method: "GET" | "POST";
  adminToken?: string;
  lease?: string;
  cookie?: string;
  body?: unknown;
}): Promise<{ status: number; body: string; headers: Record<string, string | string[]> }> {
  const body = params.body === undefined ? "" : JSON.stringify(params.body);
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      params.url,
      {
        method: params.method,
        headers: {
          ...(params.adminToken ? { "x-amc-admin-token": params.adminToken } : {}),
          ...(params.lease ? { "x-amc-lease": params.lease } : {}),
          ...(params.cookie ? { cookie: params.cookie } : {}),
          connection: "close",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body)
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: res.headers as Record<string, string | string[]>
          });
        });
      }
    );
    req.on("error", rejectPromise);
    if (body.length > 0) {
      req.write(body);
    }
    req.end();
  });
}

async function httpRequestJson(params: {
  url: string;
  method: "GET" | "POST";
  adminToken?: string;
  lease?: string;
  cookie?: string;
  body?: unknown;
}): Promise<{ status: number; body: string }> {
  const raw = await httpRequestRaw(params);
  return {
    status: raw.status,
    body: raw.body
  };
}

function writeHighRun(workspace: string, runId = "run_high"): void {
  const agentPaths = getAgentPaths(workspace, "default");
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
      narrative: "fixture"
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
  writeFileSync(join(agentPaths.runsDir, `${runId}.json`), JSON.stringify(report, null, 2));
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
}

function readFileSafe(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function ensureDefaultAgent(workspace: string): void {
  const agentPaths = getAgentPaths(workspace, "default");
  if (readFileSafe(agentPaths.agentConfig)) {
    return;
  }
  const now = Date.now();
  scaffoldAgent(workspace, {
    id: "default",
    agentName: "Default Agent",
    role: "assistant",
    domain: "general",
    primaryTasks: ["analysis", "delivery"],
    stakeholders: ["owner", "operator"],
    riskTier: "med",
    provider: {
      templateId: "openai",
      routePrefix: "/openai",
      upstreamId: "openai",
      baseUrl: "https://api.openai.com",
      openaiCompatible: true,
      auth: {
        type: "bearer_env",
        env: "OPENAI_API_KEY"
      }
    },
    createdTs: now,
    updatedTs: now
  });
}

describe("console + approvals + what-if + benchmarks", () => {
  test("approval inbox flow supports signed decision + single-shot replay protection", async () => {
    const workspace = newWorkspace();
    writeHighRun(workspace);
    initActionPolicy(workspace);
    const tools = loadToolsConfig(workspace);
    const fsWrite = tools.tools.allowedTools.find((tool) => tool.name === "fs.write");
    if (!fsWrite) {
      throw new Error("missing fs.write tool");
    }
    fsWrite.requireExecTicket = true;
    initToolsConfig(workspace, tools);

    const workOrder = createWorkOrder({
      workspace,
      agentId: "default",
      title: "Approval test",
      description: "execute write with approval",
      riskTier: "low",
      requestedMode: "EXECUTE",
      allowedActionClasses: ["WRITE_LOW"]
    }).workOrder;
    mkdirSync(join(workspace, "workspace", "output"), { recursive: true });

    const port = await pickFreePort();
    const token = "admin-token";
    const server = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token
    });
    const lease = issueLeaseForCli({
      workspace,
      agentId: "default",
      ttl: "60m",
      scopes: "toolhub:intent,toolhub:execute",
      routes: "/openai",
      models: "*",
      rpm: 60,
      tpm: 200000,
      maxCostUsdPerDay: null
    }).token;

    try {
      const intentRes = await httpRequestJson({
        url: `http://127.0.0.1:${port}/toolhub/intent`,
        method: "POST",
        lease,
        body: {
          agentId: "default",
          workOrderId: workOrder.workOrderId,
          toolName: "fs.write",
          args: { path: "./workspace/output/approved.txt", content: "ok" },
          requestedMode: "EXECUTE"
        }
      });
      expect(intentRes.status).toBe(200);
      const intent = JSON.parse(intentRes.body) as {
        intentId: string;
        approvalRequired?: boolean;
        approvalId?: string;
      };
      expect(intent.approvalRequired).toBe(true);
      expect(intent.approvalId).toBeTruthy();

      const pending = await httpRequestJson({
        url: `http://127.0.0.1:${port}/approvals?agentId=default&status=PENDING`,
        method: "GET",
        adminToken: token
      });
      expect(pending.status).toBe(200);

      const pollUnauthorized = await httpRequestJson({
        url: `http://127.0.0.1:${port}/agent/approvals/${encodeURIComponent(intent.approvalId!)}/status`,
        method: "GET"
      });
      expect(pollUnauthorized.status).toBe(401);

      const poll = await httpRequestJson({
        url: `http://127.0.0.1:${port}/agent/approvals/${encodeURIComponent(intent.approvalId!)}/status`,
        method: "GET",
        lease
      });
      expect(poll.status).toBe(200);
      expect(poll.body).not.toContain("x-amc-admin-token");
      expect(poll.body).not.toContain(lease);

      const approve = await httpRequestJson({
        url: `http://127.0.0.1:${port}/approvals/${encodeURIComponent(intent.approvalId!)}/approve`,
        method: "POST",
        adminToken: token,
        body: {
          mode: "EXECUTE",
          reason: "Approved for test"
        }
      });
      expect(approve.status).toBe(200);

      const execute = await httpRequestJson({
        url: `http://127.0.0.1:${port}/toolhub/execute`,
        method: "POST",
        lease,
        body: {
          intentId: intent.intentId,
          approvalId: intent.approvalId
        }
      });
      expect(execute.status).toBe(200);
      const executeBody = JSON.parse(execute.body) as { allowed: boolean };
      expect(executeBody.allowed).toBe(true);

      const replay = await httpRequestJson({
        url: `http://127.0.0.1:${port}/toolhub/execute`,
        method: "POST",
        lease,
        body: {
          intentId: intent.intentId,
          approvalId: intent.approvalId
        }
      });
      expect(replay.status).toBe(200);
      const replayBody = JSON.parse(replay.body) as { allowed: boolean; result: { auditType?: string } };
      expect(replayBody.allowed).toBe(false);
      expect(replayBody.result.auditType).toBe("APPROVAL_REPLAY_ATTEMPTED");
    } finally {
      await server.close();
    }

    const ledger = openLedger(workspace);
    try {
      const audits = ledger
        .getAllEvents()
        .filter((event) => event.event_type === "audit")
        .map((event) => JSON.parse(event.payload_inline ?? "{}") as Record<string, unknown>);
      expect(audits.some((row) => row.auditType === "APPROVAL_REQUESTED")).toBe(true);
      expect(audits.some((row) => row.auditType === "APPROVAL_DECIDED")).toBe(true);
      expect(audits.some((row) => row.auditType === "APPROVAL_CONSUMED")).toBe(true);
      expect(audits.some((row) => row.auditType === "APPROVAL_REPLAY_ATTEMPTED")).toBe(true);
    } finally {
      ledger.close();
    }
  });

  test("target what-if endpoint is deterministic and apply writes signed target with audit", async () => {
    const workspace = newWorkspace();
    writeHighRun(workspace);
    const port = await pickFreePort();
    const token = "admin-token";
    const server = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token
    });
    try {
      const mapping = {
        "AMC-1.1": 2,
        "AMC-3.3.1": 5
      };
      const a = await httpRequestJson({
        url: `http://127.0.0.1:${port}/agents/default/targets/whatif`,
        method: "POST",
        adminToken: token,
        body: { mapping }
      });
      const b = await httpRequestJson({
        url: `http://127.0.0.1:${port}/agents/default/targets/whatif`,
        method: "POST",
        adminToken: token,
        body: { mapping }
      });
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      const pa = JSON.parse(a.body) as { summary: unknown };
      const pb = JSON.parse(b.body) as { summary: unknown };
      expect(pa.summary).toEqual(pb.summary);

      const apply = await httpRequestJson({
        url: `http://127.0.0.1:${port}/agents/default/targets/apply`,
        method: "POST",
        adminToken: token,
        body: { mapping }
      });
      expect(apply.status).toBe(200);
    } finally {
      await server.close();
    }

    const profile = loadTargetProfile(workspace, "default", "default");
    expect(verifyTargetProfileSignature(workspace, profile)).toBe(true);
    const ledger = openLedger(workspace);
    try {
      const audits = ledger
        .getAllEvents()
        .filter((event) => event.event_type === "audit")
        .map((event) => JSON.parse(event.payload_inline ?? "{}") as Record<string, unknown>);
      expect(audits.some((row) => row.auditType === "CONSOLE_TARGET_DRAFT_APPLIED")).toBe(true);
    } finally {
      ledger.close();
    }
  }, 40_000);

  test("benchmark export/verify/ingest/stats are deterministic and tamper-evident", () => {
    const workspace = newWorkspace();
    writeHighRun(workspace, "run_bench");
    const outFile = ".amc/benchmarks/demo.amcbench";
    const exported = exportBenchmarkArtifact({
      workspace,
      agentId: "default",
      runId: "run_bench",
      outFile
    });
    const verify = verifyBenchmarkArtifact(exported.outFile);
    expect(verify.ok).toBe(true);

    const tamperDir = mkdtempSync(join(tmpdir(), "amc-bench-tamper-"));
    try {
      const extracted = join(tamperDir, "x");
      mkdirSync(extracted, { recursive: true });
      const extract = spawnSync("tar", ["-xzf", exported.outFile, "-C", extracted], { encoding: "utf8" });
      expect(extract.status).toBe(0);
      const benchPath = join(extracted, "bench.json");
      const bench = JSON.parse(readFileSync(benchPath, "utf8")) as { notes?: string | null };
      bench.notes = "tampered";
      writeFileSync(benchPath, JSON.stringify(bench, null, 2));
      const tamperedBundle = join(tamperDir, "tampered.amcbench");
      const pack = spawnSync("tar", ["-czf", tamperedBundle, "-C", extracted, "."], { encoding: "utf8" });
      expect(pack.status).toBe(0);
      const bad = verifyBenchmarkArtifact(tamperedBundle);
      expect(bad.ok).toBe(false);
    } finally {
      rmSync(tamperDir, { recursive: true, force: true });
    }

    const ingested = ingestBenchmarks(workspace, outFile);
    expect(ingested.imported.length).toBe(1);
    const statsA = benchmarkStats({ workspace, groupBy: "riskTier" });
    const statsB = benchmarkStats({ workspace, groupBy: "riskTier" });
    expect(statsA).toEqual(statsB);
  }, 40000);

  test("RBAC login issues session cookie and invalid users signature forces read-only", async () => {
    const workspace = newWorkspace();
    initUsersConfig({
      workspace,
      username: "owner",
      password: "owner-pass"
    });
    const port = await pickFreePort();
    const token = "admin-token";
    const server = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token
    });
    try {
      const login = await httpRequestRaw({
        url: `http://127.0.0.1:${port}/auth/login`,
        method: "POST",
        body: { username: "owner", password: "owner-pass" }
      });
      expect(login.status).toBe(200);
      const setCookie = login.headers["set-cookie"];
      const cookieText = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie ?? "");
      expect(cookieText).toContain("amc_session=");

      const me = await httpRequestJson({
        url: `http://127.0.0.1:${port}/auth/me`,
        method: "GET",
        cookie: cookieText
      });
      expect(me.status).toBe(200);

      const usersPath = join(workspace, ".amc", "users.yaml");
      const usersRaw = readFileSync(usersPath, "utf8");
      writeFileSync(usersPath, `${usersRaw}\n# tamper`);

      const blockedLogin = await httpRequestJson({
        url: `http://127.0.0.1:${port}/auth/login`,
        method: "POST",
        body: { username: "owner", password: "owner-pass" }
      });
      expect(blockedLogin.status).toBe(403);

      const blockedWrite = await httpRequestJson({
        url: `http://127.0.0.1:${port}/users/add`,
        method: "POST",
        adminToken: token,
        body: { username: "viewer", password: "viewer-pass", roles: ["VIEWER"] }
      });
      expect(blockedWrite.status).toBe(403);
    } finally {
      await server.close();
    }
  }, 20_000);

  test("LAN pairing requires one-time code before login and code is single-use", async () => {
    const workspace = newWorkspace();
    initUsersConfig({
      workspace,
      username: "owner",
      password: "owner-pass"
    });
    enableLanMode({
      workspace,
      bind: "127.0.0.1",
      port: 3212,
      allowedCIDRs: ["127.0.0.1/32"],
      requirePairing: true
    });

    const port = await pickFreePort();
    const token = "admin-token";
    const server = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token
    });
    try {
      const blocked = await httpRequestJson({
        url: `http://127.0.0.1:${port}/auth/login`,
        method: "POST",
        body: { username: "owner", password: "owner-pass" }
      });
      expect(blocked.status).toBe(403);

      const created = createPairingCode({
        workspace,
        ttlMs: 10 * 60 * 1000
      });
      const claim = await httpRequestRaw({
        url: `http://127.0.0.1:${port}/pair/claim`,
        method: "POST",
        body: { code: created.code }
      });
      expect(claim.status).toBe(200);
      const pairCookie = Array.isArray(claim.headers["set-cookie"])
        ? claim.headers["set-cookie"][0] ?? ""
        : String(claim.headers["set-cookie"] ?? "");
      expect(pairCookie).toContain("amc_pairing=");

      const login = await httpRequestJson({
        url: `http://127.0.0.1:${port}/auth/login`,
        method: "POST",
        cookie: pairCookie,
        body: { username: "owner", password: "owner-pass" }
      });
      expect(login.status).toBe(200);

      const replay = await httpRequestJson({
        url: `http://127.0.0.1:${port}/pair/claim`,
        method: "POST",
        body: { code: created.code }
      });
      expect(replay.status).toBe(400);

      const loginPage = await httpRequestJson({
        url: `http://127.0.0.1:${port}/console/login`,
        method: "GET"
      });
      expect(loginPage.body).not.toContain(created.code);
      expect(loginPage.body).not.toMatch(/amc_session=|amc_pairing=|x-amc-admin-token=[A-Za-z0-9]/);
    } finally {
      await server.close();
    }
  }, 20_000);

  test("transparency log records issuance events and detects tampering", async () => {
    const workspace = newWorkspace();
    ensureDefaultAgent(workspace);
    const diagnosticRun = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });
    exportEvidenceBundle({
      workspace,
      runId: diagnosticRun.runId,
      outFile: ".amc/bundles/transparency-test.amcbundle",
      agentId: "default"
    });
    writeSignedGatePolicy({
      workspace,
      policyPath: ".amc/agents/default/gatePolicy.json",
      policy: {
        ...defaultGatePolicy(),
        minIntegrityIndex: 0,
        minOverall: 0,
        minLayer: {
          "Strategic Agent Operations": 0,
          "Leadership & Autonomy": 0,
          "Culture & Alignment": 0,
          Resilience: 0,
          Skills: 0
        },
        denyIfLowTrust: false,
        requireObservedForLevel5: false
      }
    });
    exportBenchmarkArtifact({
      workspace,
      agentId: "default",
      runId: diagnosticRun.runId,
      outFile: ".amc/benchmarks/transparency.amcbench"
    });
    generateBom({
      workspace,
      agentId: "default",
      runId: diagnosticRun.runId,
      outFile: "amc-bom.json"
    });
    signBomFile({
      workspace,
      inputFile: "amc-bom.json",
      outputSigFile: "amc-bom.json.sig"
    });
    await issueCertificate({
      workspace,
      runId: diagnosticRun.runId,
      policyPath: ".amc/agents/default/gatePolicy.json",
      outFile: ".amc/certs/transparency.amccert",
      agentId: "default"
    });
    applyPolicyPack({
      workspace,
      agentId: "default",
      packId: "code-agent.low"
    });

    const entries = readTransparencyEntries(workspace);
    const types = new Set(entries.map((row) => row.type));
    expect(types.has("BUNDLE_EXPORTED")).toBe(true);
    expect(types.has("BENCHMARK_EXPORTED")).toBe(true);
    expect(types.has("BOM_SIGNED")).toBe(true);
    expect(types.has("CERT_ISSUED")).toBe(true);
    expect(types.has("POLICY_PACK_APPLIED")).toBe(true);
    expect(verifyTransparencyLog(workspace).ok).toBe(true);

    const logPath = transparencyLogPath(workspace);
    writeFileSync(logPath, `${readFileSync(logPath, "utf8")}\n{\"bad\":true}\n`);
    expect(verifyTransparencyLog(workspace).ok).toBe(false);
  }, 30_000);

  test("policy pack diff is deterministic and apply writes signed configs", () => {
    const workspace = newWorkspace();
    ensureDefaultAgent(workspace);
    const first = diffPolicyPack({
      workspace,
      agentId: "default",
      packId: "code-agent.medium"
    });
    const second = diffPolicyPack({
      workspace,
      agentId: "default",
      packId: "code-agent.medium"
    });
    expect(first).toEqual(second);

    const applied = applyPolicyPack({
      workspace,
      agentId: "default",
      packId: "security-agent.high"
    });
    expect(applied.packId).toBe("security-agent.high");
    expect(verifyActionPolicySignature(workspace).valid).toBe(true);
    expect(verifyToolsConfigSignature(workspace).valid).toBe(true);
    expect(verifyBudgetsConfigSignature(workspace).valid).toBe(true);
    expect(verifyAlertsConfigSignature(workspace).valid).toBe(true);
    expect(verifyApprovalPolicySignature(workspace).valid).toBe(true);
  });

  test("console pages are served and contain no external CDN references", async () => {
    const workspace = newWorkspace();
    const port = await pickFreePort();
    const token = "admin-token";
    const server = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token
    });
    try {
      const page = await httpRequestJson({
        url: `http://127.0.0.1:${port}/console`,
        method: "GET"
      });
      const app = await httpRequestJson({
        url: `http://127.0.0.1:${port}/console/assets/app.js`,
        method: "GET"
      });
      expect(page.status).toBe(200);
      expect(app.status).toBe(200);
      expect(page.body).toContain("Compass Console");
      expect(app.body).toContain("renderAuthScreen");
    } finally {
      await server.close();
    }

    const consoleRoot = join(process.cwd(), "src", "console");
    const files = [
      ...readdirSync(join(consoleRoot, "pages")).map((name) =>
        readFileSync(join(consoleRoot, "pages", name), "utf8")
      ),
      ...readdirSync(join(consoleRoot, "assets")).map((name) => {
        const full = join(consoleRoot, "assets", name);
        try {
          return readFileSync(full, "utf8");
        } catch {
          return "";
        }
      })
    ].join("\n");
    expect(files).not.toMatch(/https?:\/\/[^"'\s]*cdn/i);
  }, 20_000);
});
