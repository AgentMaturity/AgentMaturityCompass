import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import type { DiagnosticReport } from "../src/types.js";
import { forecastInitCli, forecastRefreshCli, forecastSchedulerRunNowCli } from "../src/forecast/forecastCli.js";
import { forecastScopeLatestPath } from "../src/forecast/forecastStore.js";
import { verifyLatestForecast } from "../src/forecast/forecastVerifier.js";
import { detectSuspiciousMaturityJump } from "../src/forecast/anomalyDetector.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";

afterEach(() => { vi.useRealTimers(); });

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-forecast-test-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "forecast-test-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  vi.useRealTimers();
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function writeRunFixture(params: {
  workspace: string;
  runId: string;
  ts: number;
  overall: number;
  integrity: number;
  observed: number;
  attested: number;
  selfReported: number;
  correlation: number;
}): void {
  const paths = getAgentPaths(params.workspace, "default");
  const run: DiagnosticReport = {
    agentId: "default",
    runId: params.runId,
    ts: params.ts,
    windowStartTs: params.ts - 7 * 24 * 60 * 60 * 1000,
    windowEndTs: params.ts,
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: params.integrity,
    trustLabel: "HIGH TRUST",
    targetProfileId: "default",
    layerScores: [
      { layerName: "Strategic Agent Operations", avgFinalLevel: params.overall, confidenceWeightedFinalLevel: params.overall },
      { layerName: "Leadership & Autonomy", avgFinalLevel: params.overall, confidenceWeightedFinalLevel: params.overall },
      { layerName: "Culture & Alignment", avgFinalLevel: params.overall, confidenceWeightedFinalLevel: params.overall },
      { layerName: "Resilience", avgFinalLevel: params.overall, confidenceWeightedFinalLevel: params.overall },
      { layerName: "Skills", avgFinalLevel: params.overall, confidenceWeightedFinalLevel: params.overall }
    ],
    questionScores: questionBank.map((question) => ({
      questionId: question.id,
      claimedLevel: Math.round(params.overall),
      supportedMaxLevel: Math.round(params.overall),
      finalLevel: Math.round(params.overall),
      confidence: params.integrity,
      evidenceEventIds: ["fixture-ev"],
      flags: [],
      narrative: "fixture"
    })),
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: params.correlation,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 1,
    evidenceTrustCoverage: {
      observed: params.observed,
      attested: params.attested,
      selfReported: params.selfReported
    },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "fixture",
    reportJsonSha256: "fixture"
  };
  writeFileSync(join(paths.runsDir, `${params.runId}.json`), JSON.stringify(run, null, 2));
}

function writeTransformHistory(workspace: string, agentId: string): void {
  const baseDir = join(workspace, ".amc", "agents", agentId, "transform");
  const snapshotsDir = join(baseDir, "snapshots");
  mkdirSync(snapshotsDir, { recursive: true });
  const now = Date.now();
  const snapshots = [
    {
      createdTs: now - 4 * 86_400_000,
      tasks: [
        { taskId: "t1", effort: 2, status: "DONE" },
        { taskId: "t2", effort: 2, status: "NOT_STARTED" }
      ]
    },
    {
      createdTs: now - 3 * 86_400_000,
      tasks: [
        { taskId: "t1", effort: 2, status: "DONE" },
        { taskId: "t2", effort: 2, status: "DONE" },
        { taskId: "t3", effort: 1, status: "NOT_STARTED" }
      ]
    },
    {
      createdTs: now - 2 * 86_400_000,
      tasks: [
        { taskId: "t1", effort: 2, status: "DONE" },
        { taskId: "t2", effort: 2, status: "DONE" },
        { taskId: "t3", effort: 1, status: "DONE" }
      ]
    },
    {
      createdTs: now - 1 * 86_400_000,
      tasks: [
        { taskId: "t1", effort: 2, status: "DONE" },
        { taskId: "t2", effort: 2, status: "DONE" },
        { taskId: "t3", effort: 1, status: "DONE" },
        { taskId: "t4", effort: 3, status: "NOT_STARTED" }
      ]
    }
  ];
  for (let i = 0; i < snapshots.length; i += 1) {
    const path = join(snapshotsDir, `${now - (5 - i) * 60_000}.json`);
    writeFileSync(path, JSON.stringify(snapshots[i], null, 2));
  }
  writeFileSync(
    join(baseDir, "latest.json"),
    JSON.stringify(
      {
        tasks: [
          { taskId: "t4", effort: 3, status: "NOT_STARTED" },
          { taskId: "t5", effort: 2, status: "IN_PROGRESS" }
        ]
      },
      null,
      2
    )
  );
}

async function pickPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  const addr = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!addr || typeof addr === "string") {
    throw new Error("failed to allocate port");
  }
  return addr.port;
}

async function httpGet(url: string, token?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      url,
      {
        method: "GET",
        headers: token ? { "x-amc-admin-token": token } : {}
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      }
    );
    req.on("error", rejectPromise);
    req.end();
  });
}

describe("forecast planning", () => {
  test("deterministic forecast output for fixed fixture", () => {
    const workspace = newWorkspace();
    forecastInitCli(workspace);
    const baseTs = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 6; i += 1) {
      writeRunFixture({
        workspace,
        runId: `run_${i}`,
        ts: baseTs + i * 86_400_000,
        overall: 2.5 + i * 0.2,
        integrity: 0.92,
        observed: 0.95,
        attested: 0.04,
        selfReported: 0.01,
        correlation: 0.96
      });
    }
    writeTransformHistory(workspace, "default");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 1, 1)));

    forecastRefreshCli({
      workspace,
      scope: "agent",
      targetId: "default"
    });
    const latestPath = forecastScopeLatestPath(workspace, { type: "AGENT", id: "default" });
    const firstBytes = readFileSync(latestPath, "utf8");

    forecastRefreshCli({
      workspace,
      scope: "agent",
      targetId: "default"
    });
    const secondBytes = readFileSync(latestPath, "utf8");
    expect(secondBytes).toBe(firstBytes);

    const parsed = JSON.parse(firstBytes) as { status: string; etaToTarget?: { status?: string } };
    expect(parsed.status).toBe("OK");
    expect(parsed.etaToTarget?.status).toBe("OK");
  });

  test("evidence gates block low-integrity forecasts", () => {
    const workspace = newWorkspace();
    forecastInitCli(workspace);
    const baseTs = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 4; i += 1) {
      writeRunFixture({
        workspace,
        runId: `gate_${i}`,
        ts: baseTs + i * 86_400_000,
        overall: 3,
        integrity: 0.6,
        observed: 0.9,
        attested: 0.05,
        selfReported: 0.05,
        correlation: 0.95
      });
    }
    const out = forecastRefreshCli({
      workspace,
      scope: "agent",
      targetId: "default"
    });
    expect(out.status).toBe("INSUFFICIENT_EVIDENCE");
    const latest = JSON.parse(
      readFileSync(forecastScopeLatestPath(workspace, { type: "AGENT", id: "default" }), "utf8")
    ) as { reasons: string[]; series: { maturityOverall: { forecast: { short: unknown } } } };
    expect(latest.reasons.some((reason) => reason.includes("INTEGRITY_BELOW_MIN"))).toBe(true);
    expect(latest.series.maturityOverall.forecast.short).toBeNull();
  });

  test("drift advisories are produced for critical drops", () => {
    const workspace = newWorkspace();
    forecastInitCli(workspace);
    const baseTs = Date.now() - 30 * 86_400_000;
    const values = [4.1, 4.0, 4.0, 3.2, 3.1, 3.0];
    for (let i = 0; i < values.length; i += 1) {
      writeRunFixture({
        workspace,
        runId: `drift_${i}`,
        ts: baseTs + i * 86_400_000,
        overall: values[i] ?? 3,
        integrity: 0.93,
        observed: 0.96,
        attested: 0.03,
        selfReported: 0.01,
        correlation: 0.97
      });
    }
    const out = forecastRefreshCli({
      workspace,
      scope: "agent",
      targetId: "default"
    });
    expect(out.advisories).toBeGreaterThan(0);
    const latest = JSON.parse(
      readFileSync(forecastScopeLatestPath(workspace, { type: "AGENT", id: "default" }), "utf8")
    ) as { advisories: Array<{ category: string; severity: string }>; drift: Array<{ severity: string }> };
    expect(latest.drift.some((row) => row.severity === "CRITICAL")).toBe(true);
    expect(latest.advisories.some((row) => row.category === "DRIFT")).toBe(true);
  });

  test("anomaly detector flags suspicious jump and low-evidence forecast remains blocked", () => {
    const anomaly = detectSuspiciousMaturityJump({
      maturityPoints: [
        { ts: 1, value: 1, runId: "r1" },
        { ts: 2, value: 1, runId: "r2" },
        { ts: 3, value: 1.1, runId: "r3" },
        { ts: 4, value: 4.9, runId: "r4" }
      ],
      integrityPoints: [
        { ts: 1, value: 0.91, runId: "r1" },
        { ts: 2, value: 0.91, runId: "r2" },
        { ts: 3, value: 0.91, runId: "r3" },
        { ts: 4, value: 0.915, runId: "r4" }
      ],
      correlationPoints: [
        { ts: 1, value: 0.95, runId: "r1" },
        { ts: 2, value: 0.95, runId: "r2" },
        { ts: 3, value: 0.95, runId: "r3" },
        { ts: 4, value: 0.955, runId: "r4" }
      ],
      observedShare: 0.3,
      thresholdRobustZ: 4
    });
    expect(anomaly?.type).toBe("SUSPICIOUS_MATURITY_JUMP");

    const workspace = newWorkspace();
    forecastInitCli(workspace);
    const baseTs = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 4; i += 1) {
      writeRunFixture({
        workspace,
        runId: `anom_${i}`,
        ts: baseTs + i * 86_400_000,
        overall: i < 3 ? 1.2 : 4.8,
        integrity: 0.9,
        observed: 0.2,
        attested: 0.1,
        selfReported: 0.7,
        correlation: 0.95
      });
    }
    const out = forecastRefreshCli({
      workspace,
      scope: "agent",
      targetId: "default"
    });
    expect(out.status).toBe("INSUFFICIENT_EVIDENCE");
  });

  test("forecast artifacts are signed and tamper is detected", () => {
    const workspace = newWorkspace();
    forecastInitCli(workspace);
    const baseTs = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 4; i += 1) {
      writeRunFixture({
        workspace,
        runId: `sig_${i}`,
        ts: baseTs + i * 86_400_000,
        overall: 3.2,
        integrity: 0.95,
        observed: 0.95,
        attested: 0.03,
        selfReported: 0.02,
        correlation: 0.96
      });
    }
    forecastRefreshCli({
      workspace,
      scope: "agent",
      targetId: "default"
    });
    const scope = { type: "AGENT" as const, id: "default" };
    const before = verifyLatestForecast(workspace, scope);
    expect(before.file.valid).toBe(true);
    const path = forecastScopeLatestPath(workspace, scope);
    writeFileSync(path, `${readFileSync(path, "utf8")}\n{"tamper":true}\n`);
    const after = verifyLatestForecast(workspace, scope);
    expect(after.file.valid).toBe(false);
  });

  test("scheduler run-now updates deterministic nextRefresh and studio serves forecast pages", async () => {
    const workspace = newWorkspace();
    forecastInitCli(workspace);
    const baseTs = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 4; i += 1) {
      writeRunFixture({
        workspace,
        runId: `sched_${i}`,
        ts: baseTs + i * 86_400_000,
        overall: 3.5,
        integrity: 0.95,
        observed: 0.95,
        attested: 0.02,
        selfReported: 0.03,
        correlation: 0.96
      });
    }
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 1, 10, 0, 0, 0)));
    const scheduler = forecastSchedulerRunNowCli({
      workspace
    });
    expect(scheduler.state.lastRefreshTs).toBe(Date.UTC(2026, 1, 11, 0, 0, 0));
    expect(scheduler.state.nextRefreshTs).toBe(Date.UTC(2026, 1, 12, 0, 0, 0));

    const port = await pickPort();
    const api = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token: "admin-token"
    });
    try {
      const forecastHtml = await httpGet(`${api.url}/console/forecast.html`, "admin-token");
      expect(forecastHtml.status).toBe(200);
      expect(forecastHtml.body).not.toMatch(/https?:\/\/cdn/i);
      const advisoryHtml = await httpGet(`${api.url}/console/advisories.html`, "admin-token");
      expect(advisoryHtml.status).toBe(200);
      const portfolioHtml = await httpGet(`${api.url}/console/portfolioForecast.html`, "admin-token");
      expect(portfolioHtml.status).toBe(200);
      const js = await httpGet(`${api.url}/console/assets/app.js`, "admin-token");
      expect(js.status).toBe(200);
      expect(js.body).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/);
      expect(js.body).not.toContain("BEGIN PRIVATE KEY");
      expect(js.body).not.toContain("lease_");
    } finally {
      await api.close();
    }
  });
});
