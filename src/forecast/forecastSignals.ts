import { readdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { DiagnosticReport, OutcomeReport } from "../types.js";
import type { OrgScorecard } from "../org/orgSchema.js";
import { getAgentPaths } from "../fleet/paths.js";
import { listAgents } from "../fleet/registry.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { computeFailureRiskIndices } from "../assurance/indices.js";
import { loadTransformMap } from "../transformation/transformPlanner.js";
import { FOUR_CS } from "../transformation/fourCs.js";
import { listValueReports } from "../value/valueStore.js";
import type { ValueReport } from "../value/valueSchema.js";
import type { ForecastScope } from "./forecastSchema.js";
import { FORECAST_INDEX_IDS, FORECAST_VALUE_DIMENSIONS } from "./forecastSchema.js";

export interface ForecastSeriesInput {
  maturityOverall: Array<{ ts: number; value: number; runId?: string; trustTier?: string }>;
  integrityIndex: Array<{ ts: number; value: number; runId?: string; trustTier?: string }>;
  correlationRatio: Array<{ ts: number; value: number; runId?: string; trustTier?: string }>;
  fourC: Record<"Concept" | "Culture" | "Capabilities" | "Configuration", Array<{ ts: number; value: number; runId?: string; trustTier?: string }>>;
  indices: Record<(typeof FORECAST_INDEX_IDS)[number], Array<{ ts: number; value: number; runId?: string; trustTier?: string }>>;
  value: Record<(typeof FORECAST_VALUE_DIMENSIONS)[number], Array<{ ts: number; value: number; runId?: string; trustTier?: string }>>;
  operating: Record<string, Array<{ ts: number; value: number; runId?: string; trustTier?: string }>>;
}

export interface ForecastSignalBundle {
  scope: ForecastScope;
  generatedTs: number;
  points: ForecastSeriesInput;
  evidence: {
    observedShare: number;
    attestedShare: number;
    selfReportedShare: number;
    observedRuns: number;
    latestIntegrityIndex: number;
    latestCorrelationRatio: number;
  };
  runRefs: string[];
  targetProgress: {
    gapPoints: number;
    remainingEffort: number;
    throughputHistoryPerDay: number[];
  };
}

function parseJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(readUtf8(path)) as T;
  } catch {
    return null;
  }
}

function listJsonFiles(dir: string): string[] {
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => join(dir, name));
}

function runTrustTier(run: DiagnosticReport): "SELF_REPORTED" | "ATTESTED" | "OBSERVED" | "OBSERVED_HARDENED" {
  const observed = run.evidenceTrustCoverage?.observed ?? 0;
  const attested = run.evidenceTrustCoverage?.attested ?? 0;
  if (observed >= 0.85 && run.correlationRatio >= 0.95 && (run.invalidReceiptsCount ?? 0) === 0) {
    return "OBSERVED_HARDENED";
  }
  if (observed >= 0.5) {
    return "OBSERVED";
  }
  if (attested >= 0.5) {
    return "ATTESTED";
  }
  return "SELF_REPORTED";
}

function zeroSeriesInput(): ForecastSeriesInput {
  return {
    maturityOverall: [],
    integrityIndex: [],
    correlationRatio: [],
    fourC: {
      Concept: [],
      Culture: [],
      Capabilities: [],
      Configuration: []
    },
    indices: {
      EcosystemFocusRisk: [],
      ClarityPathRisk: [],
      EconomicSignificanceRisk: [],
      RiskAssuranceRisk: [],
      DigitalDualityRisk: []
    },
    value: {
      EmotionalValue: [],
      FunctionalValue: [],
      EconomicValue: [],
      BrandValue: [],
      LifetimeValue: []
    },
    operating: {}
  };
}

function listAgentIds(workspace: string): string[] {
  const ids = listAgents(workspace).map((row) => row.id);
  if (!ids.includes("default")) {
    ids.push("default");
  }
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

function loadAgentRuns(workspace: string, agentId: string, earliestTs: number): DiagnosticReport[] {
  const files = listJsonFiles(getAgentPaths(workspace, agentId).runsDir);
  return files
    .map((file) => parseJsonFile<DiagnosticReport>(file))
    .filter((row): row is DiagnosticReport => row !== null && Number(row.ts) >= earliestTs)
    .sort((a, b) => a.ts - b.ts);
}

function loadAgentOutcomeReports(workspace: string, agentId: string, earliestTs: number): OutcomeReport[] {
  const dir = join(getAgentPaths(workspace, agentId).rootDir, "outcomes", "reports");
  const files = listJsonFiles(dir);
  return files
    .map((file) => parseJsonFile<OutcomeReport>(file))
    .filter((row): row is OutcomeReport => row !== null && Number(row.ts) >= earliestTs)
    .sort((a, b) => a.ts - b.ts);
}

function latestOutcomeBeforeTs(reports: OutcomeReport[], ts: number): OutcomeReport | null {
  let latest: OutcomeReport | null = null;
  for (const report of reports) {
    if (report.ts <= ts) {
      latest = report;
      continue;
    }
    break;
  }
  return latest;
}

function latestValueReportBeforeTs(reports: ValueReport[], ts: number): ValueReport | null {
  let latest: ValueReport | null = null;
  for (const report of reports) {
    if (report.generatedTs <= ts) {
      latest = report;
      continue;
    }
    break;
  }
  return latest;
}

function valueFromValueReport(report: ValueReport | null): Record<(typeof FORECAST_VALUE_DIMENSIONS)[number], number> | null {
  if (!report || report.snapshot.status !== "OK") {
    return null;
  }
  const dims = report.snapshot.valueDimensions;
  if (
    typeof dims.emotional !== "number" ||
    typeof dims.functional !== "number" ||
    typeof dims.economic !== "number" ||
    typeof dims.brand !== "number" ||
    typeof dims.lifetime !== "number"
  ) {
    return null;
  }
  return {
    EmotionalValue: Number(dims.emotional.toFixed(6)),
    FunctionalValue: Number(dims.functional.toFixed(6)),
    EconomicValue: Number(dims.economic.toFixed(6)),
    BrandValue: Number(dims.brand.toFixed(6)),
    LifetimeValue: Number(dims.lifetime.toFixed(6))
  };
}

function computeFourCForRun(workspace: string, run: DiagnosticReport): Record<"Concept" | "Culture" | "Capabilities" | "Configuration", number> {
  const map = loadTransformMap(workspace);
  const buckets: Record<"Concept" | "Culture" | "Capabilities" | "Configuration", number[]> = {
    Concept: [],
    Culture: [],
    Capabilities: [],
    Configuration: []
  };
  for (const score of run.questionScores) {
    const mapped = map.transformMap.questionTo4C[score.questionId];
    if (!mapped) {
      continue;
    }
    buckets[mapped.primary].push(score.finalLevel);
  }
  return {
    Concept:
      buckets.Concept.length === 0
        ? 0
        : Number((buckets.Concept.reduce((sum, value) => sum + value, 0) / buckets.Concept.length).toFixed(6)),
    Culture:
      buckets.Culture.length === 0
        ? 0
        : Number((buckets.Culture.reduce((sum, value) => sum + value, 0) / buckets.Culture.length).toFixed(6)),
    Capabilities:
      buckets.Capabilities.length === 0
        ? 0
        : Number((buckets.Capabilities.reduce((sum, value) => sum + value, 0) / buckets.Capabilities.length).toFixed(6)),
    Configuration:
      buckets.Configuration.length === 0
        ? 0
        : Number((buckets.Configuration.reduce((sum, value) => sum + value, 0) / buckets.Configuration.length).toFixed(6))
  };
}

function loadOrgScorecards(workspace: string, earliestTs: number): OrgScorecard[] {
  const dir = join(workspace, ".amc", "org", "scorecards", "history");
  const files = listJsonFiles(dir);
  return files
    .map((file) => parseJsonFile<OrgScorecard>(file))
    .filter((row): row is OrgScorecard => row !== null && Number(row.computedAt) >= earliestTs)
    .sort((a, b) => a.computedAt - b.computedAt);
}

function scopeNode(scorecard: OrgScorecard, scope: ForecastScope) {
  if (scope.type === "NODE") {
    return scorecard.nodes.find((node) => node.nodeId === scope.id) ?? null;
  }
  if (scope.type === "WORKSPACE") {
    return scorecard.summary.enterpriseRollup ?? scorecard.nodes[0] ?? null;
  }
  return null;
}

function scopeAgentsFromOrg(workspace: string, scope: ForecastScope): string[] {
  if (scope.type === "AGENT") {
    return [scope.id];
  }
  const orgPath = join(workspace, ".amc", "org.yaml");
  if (!pathExists(orgPath)) {
    return listAgentIds(workspace);
  }
  const parsed = YAML.parse(readUtf8(orgPath)) as { org?: { memberships?: Array<{ agentId: string; nodeIds: string[] }> }; memberships?: Array<{ agentId: string; nodeIds: string[] }> };
  const memberships = parsed?.org?.memberships ?? parsed?.memberships;
  if (!memberships) {
    return listAgentIds(workspace);
  }
  if (scope.type === "WORKSPACE") {
    return [...new Set(memberships.map((row) => row.agentId))].sort((a, b) => a.localeCompare(b));
  }
  return [
    ...new Set(
      memberships
        .filter((row) => Array.isArray(row.nodeIds) && row.nodeIds.includes(scope.id))
        .map((row) => row.agentId)
    )
  ].sort((a, b) => a.localeCompare(b));
}

function valueFromOutcome(report: OutcomeReport | null): Record<(typeof FORECAST_VALUE_DIMENSIONS)[number], number> {
  if (!report) {
    return {
      EmotionalValue: 0,
      FunctionalValue: 0,
      EconomicValue: 0,
      BrandValue: 0,
      LifetimeValue: 0
    };
  }
  return {
    EmotionalValue: Number((report.categoryScores.Emotional ?? 0).toFixed(6)),
    FunctionalValue: Number((report.categoryScores.Functional ?? 0).toFixed(6)),
    EconomicValue: Number((report.categoryScores.Economic ?? 0).toFixed(6)),
    BrandValue: Number((report.categoryScores.Brand ?? 0).toFixed(6)),
    LifetimeValue: Number((report.categoryScores.Lifetime ?? 0).toFixed(6))
  };
}

function computeTargetProgress(workspace: string, agentId: string, runs: DiagnosticReport[]): {
  gapPoints: number;
  remainingEffort: number;
  throughputHistoryPerDay: number[];
} {
  const latestRun = runs[runs.length - 1] ?? null;
  const gapPoints = latestRun
    ? Number(latestRun.targetDiff.reduce((sum, row) => sum + Math.max(0, row.gap), 0).toFixed(6))
    : 0;
  const latestPlanPath = join(workspace, ".amc", "agents", agentId, "transform", "latest.json");
  const latestPlan = parseJsonFile<{
    tasks?: Array<{ effort: number; status: string }>;
  }>(latestPlanPath);
  const remainingEffort = latestPlan?.tasks
    ? Number(
        latestPlan.tasks
          .filter((task) => task.status !== "DONE" && task.status !== "ATTESTED")
          .reduce((sum, task) => sum + Number(task.effort ?? 1), 0)
          .toFixed(6)
      )
    : gapPoints;

  const snapshotsDir = join(workspace, ".amc", "agents", agentId, "transform", "snapshots");
  const snapshots = listJsonFiles(snapshotsDir)
    .map((file) =>
      parseJsonFile<{
        createdTs?: number;
        tasks?: Array<{ taskId: string; effort: number; status: string }>;
      }>(file)
    )
    .filter((row): row is { createdTs?: number; tasks?: Array<{ taskId: string; effort: number; status: string }> } => Boolean(row))
    .sort((a, b) => Number(a.createdTs ?? 0) - Number(b.createdTs ?? 0));
  const throughputByDay = new Map<string, number>();
  let prevDone = new Set<string>();
  for (const snapshot of snapshots) {
    const ts = Number(snapshot.createdTs ?? 0);
    if (!Number.isFinite(ts) || ts <= 0) {
      continue;
    }
    const day = new Date(ts).toISOString().slice(0, 10);
    const done = new Set(
      (snapshot.tasks ?? [])
        .filter((task) => task.status === "DONE" || task.status === "ATTESTED")
        .map((task) => task.taskId)
    );
    let completedToday = 0;
    for (const task of done) {
      if (!prevDone.has(task)) {
        completedToday += 1;
      }
    }
    if (completedToday > 0) {
      throughputByDay.set(day, (throughputByDay.get(day) ?? 0) + completedToday);
    }
    prevDone = done;
  }
  return {
    gapPoints,
    remainingEffort,
    throughputHistoryPerDay: [...throughputByDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map((row) => row[1])
  };
}

export function collectForecastSignals(params: {
  workspace: string;
  scope: ForecastScope;
  lookbackDays?: number;
}): ForecastSignalBundle {
  const lookbackDays = Math.max(14, params.lookbackDays ?? 90);
  const earliestTs = Date.now() - lookbackDays * 86_400_000;
  const points = zeroSeriesInput();
  const runRefs: string[] = [];
  let observedAccumulator = 0;
  let attestedAccumulator = 0;
  let selfAccumulator = 0;
  let runCount = 0;
  let observedRuns = 0;
  let latestIntegrityIndex = 0;
  let latestCorrelationRatio = 0;
  let orgQuestionCount = 67;
  let targetProgress = {
    gapPoints: 0,
    remainingEffort: 0,
    throughputHistoryPerDay: [] as number[]
  };

  if (params.scope.type === "AGENT") {
    const runs = loadAgentRuns(params.workspace, params.scope.id, earliestTs);
    const outcomes = loadAgentOutcomeReports(params.workspace, params.scope.id, earliestTs);
    const valueReports = listValueReports(params.workspace, {
      type: "AGENT",
      id: params.scope.id
    })
      .filter((report) => report.generatedTs >= earliestTs)
      .sort((a, b) => a.generatedTs - b.generatedTs);
    targetProgress = computeTargetProgress(params.workspace, params.scope.id, runs);

    for (const run of runs) {
      const trustTier = runTrustTier(run);
      const overall =
        run.layerScores.length === 0
          ? 0
          : run.layerScores.reduce((sum, row) => sum + row.avgFinalLevel, 0) / run.layerScores.length;
      const risk = computeFailureRiskIndices({ run });
      const fourC = computeFourCForRun(params.workspace, run);
      const value =
        valueFromValueReport(latestValueReportBeforeTs(valueReports, run.ts)) ??
        valueFromOutcome(latestOutcomeBeforeTs(outcomes, run.ts));
      const backlog = Math.max(0, (run.approvalHygiene?.requested ?? 0) - (run.approvalHygiene?.consumed ?? 0));
      const denialRate = (() => {
        const usage = run.toolHubUsage;
        if (!usage || usage.toolActionCount <= 0) {
          return 0;
        }
        return usage.deniedActionCount / Math.max(1, usage.toolActionCount);
      })();

      points.maturityOverall.push({ ts: run.ts, value: Number(overall.toFixed(6)), runId: run.runId, trustTier });
      points.integrityIndex.push({ ts: run.ts, value: Number(run.integrityIndex.toFixed(6)), runId: run.runId, trustTier });
      points.correlationRatio.push({ ts: run.ts, value: Number(run.correlationRatio.toFixed(6)), runId: run.runId, trustTier });
      points.fourC.Concept.push({ ts: run.ts, value: fourC.Concept, runId: run.runId, trustTier });
      points.fourC.Culture.push({ ts: run.ts, value: fourC.Culture, runId: run.runId, trustTier });
      points.fourC.Capabilities.push({ ts: run.ts, value: fourC.Capabilities, runId: run.runId, trustTier });
      points.fourC.Configuration.push({ ts: run.ts, value: fourC.Configuration, runId: run.runId, trustTier });
      for (const index of risk.indices) {
        points.indices[index.id].push({
          ts: run.ts,
          value: Number(index.score0to100.toFixed(6)),
          runId: run.runId,
          trustTier
        });
      }
      for (const key of FORECAST_VALUE_DIMENSIONS) {
        points.value[key].push({
          ts: run.ts,
          value: value[key],
          runId: run.runId,
          trustTier
        });
      }
      if (!points.operating.approval_backlog_size) {
        points.operating.approval_backlog_size = [];
      }
      if (!points.operating.toolhub_denial_rate) {
        points.operating.toolhub_denial_rate = [];
      }
      points.operating.approval_backlog_size.push({ ts: run.ts, value: backlog, runId: run.runId, trustTier });
      points.operating.toolhub_denial_rate.push({ ts: run.ts, value: denialRate, runId: run.runId, trustTier });

      runRefs.push(run.runId);
      observedAccumulator += run.evidenceTrustCoverage?.observed ?? 0;
      attestedAccumulator += run.evidenceTrustCoverage?.attested ?? 0;
      selfAccumulator += run.evidenceTrustCoverage?.selfReported ?? 0;
      if ((run.evidenceTrustCoverage?.observed ?? 0) >= 0.5) {
        observedRuns += 1;
      }
      runCount += 1;
      latestIntegrityIndex = run.integrityIndex;
      latestCorrelationRatio = run.correlationRatio;
    }
  } else {
    const scorecards = loadOrgScorecards(params.workspace, earliestTs);
    const memberAgents = scopeAgentsFromOrg(params.workspace, params.scope);
    const outcomesByAgent = new Map<string, OutcomeReport[]>(
      memberAgents.map((agentId) => [agentId, loadAgentOutcomeReports(params.workspace, agentId, earliestTs)])
    );
    const valueReportsByAgent = new Map<string, ValueReport[]>(
      memberAgents.map((agentId) => [
        agentId,
        listValueReports(params.workspace, { type: "AGENT", id: agentId })
          .filter((report) => report.generatedTs >= earliestTs)
          .sort((a, b) => a.generatedTs - b.generatedTs)
      ])
    );
    for (const scorecard of scorecards) {
      const node = scopeNode(scorecard, params.scope);
      if (!node) {
        continue;
      }
      const ts = scorecard.computedAt;
      const trustTier = node.evidenceCoverage.observedRatio >= 0.85 ? "OBSERVED_HARDENED" : node.evidenceCoverage.observedRatio >= 0.5 ? "OBSERVED" : "ATTESTED";
      points.maturityOverall.push({ ts, value: Number(node.headline.median.toFixed(6)), runId: `${scorecard.computedAt}`, trustTier });
      points.integrityIndex.push({ ts, value: Number(node.integrityIndex.toFixed(6)), runId: `${scorecard.computedAt}`, trustTier });
      points.correlationRatio.push({
        ts,
        value: Number(node.evidenceCoverage.medianCorrelationRatio.toFixed(6)),
        runId: `${scorecard.computedAt}`,
        trustTier
      });

      const questionMap = new Map(node.questionScores.map((row) => [row.questionId, row.median] as const));
      if (node.questionScores.length > 0) {
        orgQuestionCount = node.questionScores.length;
      }
      const transformMap = loadTransformMap(params.workspace);
      const fourCValues: Record<"Concept" | "Culture" | "Capabilities" | "Configuration", number[]> = {
        Concept: [],
        Culture: [],
        Capabilities: [],
        Configuration: []
      };
      for (const [questionId, mapping] of Object.entries(transformMap.transformMap.questionTo4C)) {
        const value = questionMap.get(questionId);
        if (typeof value !== "number") {
          continue;
        }
        fourCValues[mapping.primary].push(value);
      }
      for (const key of FOUR_CS) {
        const arr = fourCValues[key];
        const avg = arr.length === 0 ? 0 : arr.reduce((sum, value) => sum + value, 0) / arr.length;
        points.fourC[key].push({
          ts,
          value: Number(avg.toFixed(6)),
          runId: `${scorecard.computedAt}`,
          trustTier
        });
      }

      for (const indexId of FORECAST_INDEX_IDS) {
        const item = node.riskIndices.find((row) => row.id === indexId);
        points.indices[indexId].push({
          ts,
          value: Number((item?.score0to100 ?? 0).toFixed(6)),
          runId: `${scorecard.computedAt}`,
          trustTier
        });
      }

      const values = {
        EmotionalValue: 0,
        FunctionalValue: 0,
        EconomicValue: 0,
        BrandValue: 0,
        LifetimeValue: 0
      };
      let valueSamples = 0;
      for (const agentId of memberAgents) {
        const valueRow =
          valueFromValueReport(latestValueReportBeforeTs(valueReportsByAgent.get(agentId) ?? [], ts)) ??
          valueFromOutcome(latestOutcomeBeforeTs(outcomesByAgent.get(agentId) ?? [], ts));
        if (!valueRow) {
          continue;
        }
        values.EmotionalValue += valueRow.EmotionalValue;
        values.FunctionalValue += valueRow.FunctionalValue;
        values.EconomicValue += valueRow.EconomicValue;
        values.BrandValue += valueRow.BrandValue;
        values.LifetimeValue += valueRow.LifetimeValue;
        valueSamples += 1;
      }
      for (const dim of FORECAST_VALUE_DIMENSIONS) {
        points.value[dim].push({
          ts,
          value: Number((valueSamples > 0 ? values[dim] / valueSamples : 0).toFixed(6)),
          runId: `${scorecard.computedAt}`,
          trustTier
        });
      }

      runRefs.push(`${scorecard.computedAt}`);
      observedAccumulator += node.evidenceCoverage.observedRatio;
      attestedAccumulator += node.evidenceCoverage.attestedRatio;
      selfAccumulator += node.evidenceCoverage.selfReportedRatio;
      if (node.evidenceCoverage.observedRatio >= 0.5) {
        observedRuns += 1;
      }
      runCount += 1;
      latestIntegrityIndex = node.integrityIndex;
      latestCorrelationRatio = node.evidenceCoverage.medianCorrelationRatio;
    }

    targetProgress = {
      gapPoints: Number(
        (points.maturityOverall.length > 0
          ? Math.max(0, 5 - points.maturityOverall[points.maturityOverall.length - 1]!.value) * orgQuestionCount
          : 0).toFixed(6)
      ),
      remainingEffort: Number(
        (points.maturityOverall.length > 0
          ? Math.max(0, 5 - points.maturityOverall[points.maturityOverall.length - 1]!.value) * 20
          : 0).toFixed(6)
      ),
      throughputHistoryPerDay: []
    };
  }

  const safeDiv = (num: number, den: number): number => (den <= 0 ? 0 : Number((num / den).toFixed(6)));
  return {
    scope: params.scope,
    generatedTs: Date.now(),
    points,
    evidence: {
      observedShare: safeDiv(observedAccumulator, runCount),
      attestedShare: safeDiv(attestedAccumulator, runCount),
      selfReportedShare: safeDiv(selfAccumulator, runCount),
      observedRuns,
      latestIntegrityIndex: Number((latestIntegrityIndex ?? 0).toFixed(6)),
      latestCorrelationRatio: Number((latestCorrelationRatio ?? 0).toFixed(6))
    },
    runRefs: [...new Set(runRefs)],
    targetProgress
  };
}
