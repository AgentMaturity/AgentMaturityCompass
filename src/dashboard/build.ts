import { copyFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import type { DiagnosticReport } from "../types.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { listAgents } from "../fleet/registry.js";
import { loadTargetProfile } from "../targets/targetProfile.js";
import { latestAssuranceByPack } from "../assurance/assuranceRunner.js";
import { computeFailureRiskIndices } from "../assurance/indices.js";
import { questionBank } from "../diagnostic/questionBank.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { openLedger } from "../ledger/ledger.js";
import { readStudioState } from "../studio/studioState.js";
import { vaultStatus } from "../vault/vault.js";
import { verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import { verifyToolsConfigSignature } from "../toolhub/toolhubValidators.js";
import { activeFreezeStatus } from "../drift/freezeEngine.js";
import { lastDriftCheckSummary } from "../drift/driftDetector.js";
import { listApprovals } from "../approvals/approvalStore.js";
import { benchmarkStats } from "../benchmarks/benchStats.js";
import { latestOutcomeReport, outcomeTrend, topValueGaps } from "../outcomes/outcomeDashboard.js";

export interface DashboardBuildInput {
  workspace: string;
  agentId?: string;
  outDir: string;
}

export interface DashboardBuildResult {
  agentId: string;
  outDir: string;
  latestRunId: string;
  generatedFiles: string[];
}

function moduleDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function readAsset(relativePath: string, fallback = ""): string {
  const candidates = [
    join(moduleDir(), relativePath),
    join(process.cwd(), "src", "dashboard", relativePath)
  ];
  for (const candidate of candidates) {
    if (pathExists(candidate)) {
      return readUtf8(candidate);
    }
  }
  return fallback;
}

function listRunFiles(runsDir: string): string[] {
  if (!pathExists(runsDir)) {
    return [];
  }
  return readdirSync(runsDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => join(runsDir, file));
}

function loadRuns(runsDir: string): DiagnosticReport[] {
  return listRunFiles(runsDir)
    .map((file) => JSON.parse(readUtf8(file)) as DiagnosticReport)
    .sort((a, b) => a.ts - b.ts);
}

function safeTargetMapping(workspace: string, agentId: string): { targetId: string | null; mapping: Record<string, number> } {
  try {
    const target = loadTargetProfile(workspace, "default", agentId);
    return {
      targetId: target.id,
      mapping: target.mapping
    };
  } catch {
    return {
      targetId: null,
      mapping: {}
    };
  }
}

function overallScore(run: DiagnosticReport): number {
  if (run.layerScores.length === 0) {
    return 0;
  }
  return run.layerScores.reduce((sum, row) => sum + row.avgFinalLevel, 0) / run.layerScores.length;
}

function evidenceGaps(run: DiagnosticReport): Array<{ questionId: string; reason: string }> {
  const gaps: Array<{ questionId: string; reason: string }> = [];
  for (const row of run.questionScores) {
    if (row.evidenceEventIds.length === 0) {
      gaps.push({ questionId: row.questionId, reason: "No evidence events linked." });
      continue;
    }
    if (row.finalLevel < 3) {
      gaps.push({ questionId: row.questionId, reason: "Level below 3 requires more verified evidence." });
      continue;
    }
    if (row.flags.includes("FLAG_UNSUPPORTED_CLAIM")) {
      gaps.push({ questionId: row.questionId, reason: "Claim exceeded supported evidence." });
    }
  }
  return gaps.slice(0, 20);
}

function eocView(run: DiagnosticReport, targetMapping: Record<string, number>): {
  education: string[];
  ownership: string[];
  commitment: string[];
  days: number;
} {
  const top = run.questionScores
    .map((score) => {
      const target = targetMapping[score.questionId] ?? 0;
      return {
        questionId: score.questionId,
        gap: target - score.finalLevel
      };
    })
    .filter((row) => row.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 5);

  const education = top.map((row) => {
    const question = questionBank.find((q) => q.id === row.questionId);
    return `${row.questionId}: ${question?.title ?? "question"}`;
  });

  const ownership = [
    "Owner: sign targets/policies and enforce CI gates.",
    "Agent: follow Truth Protocol and request approvals.",
    "System: enforce gateway/ledger verification and correlation checks."
  ];

  const commitment = run.evidenceToCollectNext.slice(0, 7);

  return {
    education,
    ownership,
    commitment,
    days: 14
  };
}

function parseTrustTier(metaJson: string): string {
  try {
    const meta = JSON.parse(metaJson) as Record<string, unknown>;
    const tier = meta.trustTier;
    if (typeof tier === "string" && tier.length > 0) {
      return tier;
    }
  } catch {
    // ignore
  }
  return "OBSERVED";
}

function parseMeta(metaJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(metaJson) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return {};
}

function loadLatestRunSummary(workspace: string, agentId: string): { overall: number; trustLabel: string } | null {
  const paths = getAgentPaths(workspace, agentId);
  if (!pathExists(paths.runsDir)) {
    return null;
  }
  const runs = loadRuns(paths.runsDir);
  if (runs.length === 0) {
    return null;
  }
  const latest = runs[runs.length - 1]!;
  return {
    overall: overallScore(latest),
    trustLabel: latest.trustLabel
  };
}

export function buildDashboard(input: DashboardBuildInput): DashboardBuildResult {
  const agentId = resolveAgentId(input.workspace, input.agentId);
  const paths = getAgentPaths(input.workspace, agentId);
  const runs = loadRuns(paths.runsDir);
  if (runs.length === 0) {
    throw new Error(`No runs found for agent ${agentId}. Run 'amc run' first.`);
  }
  const latestRun = runs[runs.length - 1]!;
  const trends = runs.slice(Math.max(0, runs.length - 20)).map((run) => ({
    runId: run.runId,
    ts: run.ts,
    integrityIndex: run.integrityIndex,
    overall: overallScore(run),
    trustLabel: run.trustLabel
  }));

  const target = safeTargetMapping(input.workspace, agentId);
  const assuranceByPack = latestAssuranceByPack({
    workspace: input.workspace,
    agentId,
    windowStartTs: latestRun.windowStartTs,
    windowEndTs: latestRun.windowEndTs
  });
  const assurance = [...assuranceByPack.values()].map((pack) => ({
    packId: pack.packId,
    score0to100: pack.score0to100,
    passCount: pack.passCount,
    failCount: pack.failCount
  }));

  const indices = computeFailureRiskIndices({
    run: latestRun,
    assuranceByPack
  });
  const latestOutcome = latestOutcomeReport(input.workspace, agentId);
  const valueTrend = outcomeTrend(input.workspace, agentId, 20);

  const data = {
    generatedTs: Date.now(),
    agentId,
    latestRun,
    overall: overallScore(latestRun),
    targetId: target.targetId,
    targetMapping: target.mapping,
    trends,
    assurance,
    approvalsSummary: {
      requested: 0,
      approved: 0,
      denied: 0,
      expired: 0,
      consumed: 0,
      replayAttempts: 0
    },
    benchmarksSummary: {
      count: 0,
      percentileOverall: 0
    },
    valueSummary: latestOutcome
      ? {
          valueScore: latestOutcome.valueScore,
          economicSignificanceIndex: latestOutcome.economicSignificanceIndex,
          valueRegressionRisk: latestOutcome.valueRegressionRisk,
          trustLabel: latestOutcome.trustLabel
        }
      : {
          valueScore: 0,
          economicSignificanceIndex: 0,
          valueRegressionRisk: 0,
          trustLabel: "UNTRUSTED CONFIG"
        },
    valueTrend,
    topValueGaps: latestOutcome ? topValueGaps(latestOutcome, 5) : [],
    indices,
    evidenceGaps: evidenceGaps(latestRun),
    eoc: eocView(latestRun, target.mapping),
    studioHome: {
      running: false,
      untrustedConfig: false,
      vaultUnlocked: false,
      gatewayUrl: null as string | null,
      proxyUrl: null as string | null,
      dashboardUrl: null as string | null,
      agents: [] as Array<{
        id: string;
        overall: number | null;
        trustLabel: string | null;
        lastProvider: string | null;
        lastModel: string | null;
        freezeActive: boolean;
      }>,
      activeFreezes: [] as Array<{ agentId: string; actionClasses: string[] }>,
      lastDriftCheck: null as null | { incidentId: string | null; activeFreeze: boolean },
      lastLease: null as null | { agentId: string; leaseId: string; expiresTs: number },
      actionPolicySignature: "MISSING" as "VALID" | "INVALID" | "MISSING",
      toolsSignature: "MISSING" as "VALID" | "INVALID" | "MISSING",
      toolhubExecutions: [] as Array<{
        ts: number;
        eventId: string;
        agentId: string | null;
        toolName: string | null;
        executionId: string | null;
        requestedMode: string | null;
        effectiveMode: string | null;
      }>
    }
  };

  const ledger = openLedger(input.workspace);
  let evidenceIndex: Record<string, { ts: number; eventType: string; sessionId: string; runtime: string; trustTier: string }> = {};
  try {
    const events = ledger.getEventsBetween(latestRun.windowStartTs, latestRun.windowEndTs);
    const tagged = events.filter((event) => {
      try {
        const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
        return meta.agentId === agentId;
      } catch {
        return false;
      }
    });
    const scoped = tagged.length > 0 ? tagged : events;
    const approvals = listApprovals({
      workspace: input.workspace,
      agentId
    }).filter((row) => row.approval.createdTs >= latestRun.windowStartTs && row.approval.createdTs <= latestRun.windowEndTs);
    data.approvalsSummary = {
      requested: approvals.length,
      approved: approvals.filter((row) => row.status === "APPROVED" || row.status === "CONSUMED").length,
      denied: approvals.filter((row) => row.status === "DENIED").length,
      expired: approvals.filter((row) => row.status === "EXPIRED").length,
      consumed: approvals.filter((row) => row.status === "CONSUMED").length,
      replayAttempts: scoped.filter((event) => event.event_type === "audit" && parseMeta(event.meta_json).auditType === "APPROVAL_REPLAY_ATTEMPTED").length
    };
    const bench = benchmarkStats({
      workspace: input.workspace,
      groupBy: "riskTier"
    });
    const allOverall = bench.scatter.map((row) => row.overall);
    const localPct =
      allOverall.length > 0
        ? Number(
            (
              (allOverall.filter((value) => value <= overallScore(latestRun)).length / allOverall.length) *
              100
            ).toFixed(2)
          )
        : 0;
    data.benchmarksSummary = {
      count: bench.count,
      percentileOverall: localPct
    };
    evidenceIndex = Object.fromEntries(
      scoped.map((event) => [
        event.id,
        {
          ts: event.ts,
          eventType: event.event_type,
          sessionId: event.session_id,
          runtime: event.runtime,
          trustTier: parseTrustTier(event.meta_json)
        }
      ])
    );

    const latestProviderModel = new Map<string, { provider: string | null; model: string | null; ts: number }>();
    for (const event of events) {
      if (event.event_type !== "llm_request" && event.event_type !== "llm_response") {
        continue;
      }
      const meta = parseMeta(event.meta_json);
      const maybeAgentId = typeof meta.agentId === "string" && meta.agentId.length > 0 ? meta.agentId : null;
      if (!maybeAgentId) {
        continue;
      }
      const previous = latestProviderModel.get(maybeAgentId);
      if (previous && previous.ts >= event.ts) {
        continue;
      }
      latestProviderModel.set(maybeAgentId, {
        provider: typeof meta.providerId === "string" ? meta.providerId : null,
        model: typeof meta.model === "string" ? meta.model : null,
        ts: event.ts
      });
    }

    const studio = readStudioState(input.workspace);
    const vault = vaultStatus(input.workspace);
    const actionPolicySig = verifyActionPolicySignature(input.workspace);
    const toolsSig = verifyToolsConfigSignature(input.workspace);
    data.studioHome.actionPolicySignature = actionPolicySig.signatureExists
      ? (actionPolicySig.valid ? "VALID" : "INVALID")
      : "MISSING";
    data.studioHome.toolsSignature = toolsSig.signatureExists ? (toolsSig.valid ? "VALID" : "INVALID") : "MISSING";
    data.studioHome.running = !!studio;
    data.studioHome.untrustedConfig = studio?.untrustedConfig ?? false;
    data.studioHome.vaultUnlocked = vault.unlocked;
    data.studioHome.gatewayUrl = studio ? `http://${studio.host}:${studio.gatewayPort}` : null;
    data.studioHome.proxyUrl = studio && studio.proxyPort > 0 ? `http://${studio.host}:${studio.proxyPort}` : null;
    data.studioHome.dashboardUrl = studio ? `http://${studio.host}:${studio.dashboardPort}` : null;
    data.studioHome.lastLease = studio?.lastLease
      ? {
          agentId: studio.lastLease.agentId,
          leaseId: studio.lastLease.leaseId,
          expiresTs: studio.lastLease.expiresTs
        }
      : null;
    data.studioHome.lastDriftCheck = lastDriftCheckSummary(input.workspace, agentId);
    const agents = listAgents(input.workspace);
    data.studioHome.agents = agents.map((agent) => {
      const run = loadLatestRunSummary(input.workspace, agent.id);
      const provider = latestProviderModel.get(agent.id);
      const freeze = activeFreezeStatus(input.workspace, agent.id);
      return {
        id: agent.id,
        overall: run?.overall ?? null,
        trustLabel: run?.trustLabel ?? null,
        lastProvider: provider?.provider ?? null,
        lastModel: provider?.model ?? null,
        freezeActive: freeze.active
      };
    });
    data.studioHome.activeFreezes = agents
      .map((agent) => {
        const freeze = activeFreezeStatus(input.workspace, agent.id);
        return {
          agentId: agent.id,
          actionClasses: freeze.actionClasses
        };
      })
      .filter((row) => row.actionClasses.length > 0);

    const recentToolhub = events
      .filter((event) => event.event_type === "tool_result")
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 10)
      .map((event) => {
        const meta = parseMeta(event.meta_json);
        let parsedPayload: Record<string, unknown> = {};
        try {
          parsedPayload = JSON.parse(event.payload_inline ?? "{}") as Record<string, unknown>;
        } catch {
          parsedPayload = {};
        }
        const result = typeof parsedPayload.result === "object" && parsedPayload.result !== null
          ? (parsedPayload.result as Record<string, unknown>)
          : {};
        return {
          ts: event.ts,
          eventId: event.id,
          agentId: typeof meta.agentId === "string" ? meta.agentId : (typeof result.agentId === "string" ? result.agentId : null),
          toolName: typeof meta.toolName === "string" ? meta.toolName : null,
          executionId: typeof result.executionId === "string" ? result.executionId : (typeof parsedPayload.executionId === "string" ? parsedPayload.executionId : null),
          requestedMode: typeof result.requestedMode === "string" ? result.requestedMode : (typeof parsedPayload.requestedMode === "string" ? parsedPayload.requestedMode : null),
          effectiveMode: typeof result.effectiveMode === "string" ? result.effectiveMode : (typeof parsedPayload.effectiveMode === "string" ? parsedPayload.effectiveMode : null)
        };
      });
    data.studioHome.toolhubExecutions = recentToolhub;
  } finally {
    ledger.close();
  }

  const outDir = resolve(input.workspace, input.outDir);
  ensureDir(outDir);
  ensureDir(join(outDir, "components"));
  ensureDir(join(outDir, "fonts"));

  /* Copy self-hosted font files (binary — can't use readAsset) */
  for (const fontFile of ["inter-latin.woff2", "jbmono-latin.woff2"]) {
    const candidates = [
      join(moduleDir(), "templates", "fonts", fontFile),
      join(process.cwd(), "src", "dashboard", "templates", "fonts", fontFile),
    ];
    for (const src of candidates) {
      if (existsSync(src)) { copyFileSync(src, join(outDir, "fonts", fontFile)); break; }
    }
  }

  const html = readAsset(join("templates", "index.html"), "<html><body><h1>AMC Dashboard</h1></body></html>");
  const appJs = readAsset(join("templates", "app.js"), "console.log('AMC dashboard');");
  const css = readAsset(join("templates", "styles.css"), "body{font-family:sans-serif;}");
  const radar = readAsset(join("components", "radar.js"), "export function renderRadar(){}");
  const heatmap = readAsset(join("components", "heatmap.js"), "export function renderHeatmap(){}");
  const timeline = readAsset(join("components", "timeline.js"), "export function renderTimeline(){}");
  const questionDetail = readAsset(join("components", "questionDetail.js"), "export function renderQuestionDetail(){}");
  const eoc = readAsset(join("components", "eoc.js"), "export function renderEoc(){}");

  writeFileAtomic(join(outDir, "index.html"), html, 0o644);
  writeFileAtomic(join(outDir, "app.js"), appJs, 0o644);
  writeFileAtomic(join(outDir, "styles.css"), css, 0o644);
  writeFileAtomic(join(outDir, "data.json"), JSON.stringify(data, null, 2), 0o644);
  writeFileAtomic(join(outDir, "evidenceIndex.json"), JSON.stringify(evidenceIndex, null, 2), 0o644);
  writeFileAtomic(join(outDir, "components", "radar.js"), radar, 0o644);
  writeFileAtomic(join(outDir, "components", "heatmap.js"), heatmap, 0o644);
  writeFileAtomic(join(outDir, "components", "timeline.js"), timeline, 0o644);
  writeFileAtomic(join(outDir, "components", "questionDetail.js"), questionDetail, 0o644);
  writeFileAtomic(join(outDir, "components", "eoc.js"), eoc, 0o644);

  return {
    agentId,
    outDir,
    latestRunId: latestRun.runId,
    generatedFiles: [
      "index.html",
      "app.js",
      "styles.css",
      "data.json",
      "evidenceIndex.json",
      "components/radar.js",
      "components/heatmap.js",
      "components/timeline.js",
      "components/questionDetail.js",
      "components/eoc.js"
    ]
  };
}
