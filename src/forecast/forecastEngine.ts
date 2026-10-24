import { randomUUID } from "node:crypto";
import {
  FORECAST_INDEX_IDS,
  FORECAST_VALUE_DIMENSIONS,
  type AdvisoryRecord,
  type ForecastArtifact,
  type ForecastPolicy,
  type ForecastScope,
  type ForecastSeries
} from "./forecastSchema.js";
import { detectSuspiciousMaturityJump } from "./anomalyDetector.js";
import { generateAdvisories, captureAdvisoryRecommendations } from "./advisoryGenerator.js";
import { detectCusumChangePoints } from "./changePoint.js";
import { detectDrift } from "./driftDetector.js";
import { FORECAST_MODEL_VERSION, fitSeriesForecast } from "./forecastModels.js";
import { captureForecastSignals, type ForecastSignalBundle } from "./forecastSignals.js";
import {
  defaultForecastSchedulerState,
  loadAdvisory,
  loadForecastPolicy,
  loadForecastSchedulerState,
  loadLatestForecastArtifact,
  saveAdvisory,
  saveForecastArtifact,
  saveForecastPolicy,
  saveForecastSchedulerState,
  verifyForecastPolicySignature,
  captureVerifiedForecastPolicy
} from "./forecastStore.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { dispatchIntegrationEvent } from "../integrations/integrationDispatcher.js";
import { quantile } from "./robustStats.js";
import { captureLeadingIndicators } from "./leadingIndicators.js";
import { computeNextRefreshTs, withSchedulerOutcome } from "./renewalCadence.js";
import { parseWindowToMs } from "../utils/time.js";
import { listAgents } from "../fleet/registry.js";
import { loadOrgConfig } from "../org/orgStore.js";
import { readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

function now(): number {
  return Date.now();
}

function ensureNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(6));
}

function noProjectionSeries(points: Array<{ ts: number; value: number; runId?: string; trustTier?: string }>): ForecastSeries {
  return {
    points: [...points].sort((a, b) => a.ts - b.ts).map((point) => ({
      ts: point.ts,
      value: ensureNumber(point.value),
      runId: point.runId,
      trustTier: point.trustTier
    })),
    trend: null,
    forecast: {
      short: null,
      mid: null,
      long: null
    }
  };
}

function withChangePoints(series: ForecastSeries): ForecastSeries {
  if (!series.trend || series.points.length < 4) {
    return series;
  }
  const cps = detectCusumChangePoints({
    points: series.points.map((point) => ({ ts: point.ts, value: point.value }))
  });
  return {
    ...series,
    trend: {
      ...series.trend,
      changePoints: cps
    }
  };
}

function latestOrZero(series: ForecastSeries | undefined): number {
  if (!series || series.points.length === 0) {
    return 0;
  }
  return series.points[series.points.length - 1]!.value;
}

function forecastOrLatest(series: ForecastSeries | undefined): number {
  if (!series) {
    return 0;
  }
  return series.forecast.short?.value ?? latestOrZero(series);
}

function avg(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return ensureNumber(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function evidenceGateFailures(policy: ForecastPolicy, signals: ForecastSignalBundle): string[] {
  const reasons: string[] = [];
  const gates = policy.forecastPolicy.evidenceGates;
  if (signals.evidence.latestIntegrityIndex < gates.minIntegrityIndex) {
    reasons.push(
      `INTEGRITY_BELOW_MIN:${signals.evidence.latestIntegrityIndex.toFixed(3)}<${gates.minIntegrityIndex.toFixed(3)}`
    );
  }
  if (signals.evidence.latestCorrelationRatio < gates.minCorrelationRatio) {
    reasons.push(
      `CORRELATION_BELOW_MIN:${signals.evidence.latestCorrelationRatio.toFixed(3)}<${gates.minCorrelationRatio.toFixed(3)}`
    );
  }
  if (signals.evidence.observedRuns < gates.minObservedRuns) {
    reasons.push(`OBSERVED_RUNS_BELOW_MIN:${signals.evidence.observedRuns}<${gates.minObservedRuns}`);
  }
  if (signals.evidence.selfReportedShare > gates.maxSelfReportedShare) {
    reasons.push(
      `SELF_REPORTED_SHARE_ABOVE_MAX:${signals.evidence.selfReportedShare.toFixed(3)}>${gates.maxSelfReportedShare.toFixed(3)}`
    );
  }
  return reasons;
}

function computeEta(signal: ForecastSignalBundle): ForecastArtifact["etaToTarget"] {
  const remainingEffort = Math.max(0, Number(signal.targetProgress.remainingEffort ?? 0));
  const throughput = [...signal.targetProgress.throughputHistoryPerDay].filter((value) => Number.isFinite(value) && value > 0);
  if (remainingEffort <= 0) {
    return {
      status: "OK",
      optimisticDays: 0,
      expectedDays: 0,
      conservativeDays: 0,
      reasons: ["target gap already closed"]
    };
  }
  if (throughput.length < 3) {
    return {
      status: "UNKNOWN",
      reasons: ["insufficient completion history"]
    };
  }
  const p25 = Math.max(1e-6, quantile(throughput, 0.25));
  const p50 = Math.max(1e-6, quantile(throughput, 0.5));
  const p75 = Math.max(1e-6, quantile(throughput, 0.75));
  return {
    status: "OK",
    optimisticDays: ensureNumber(remainingEffort / p75),
    expectedDays: ensureNumber(remainingEffort / p50),
    conservativeDays: ensureNumber(remainingEffort / p25),
    reasons: []
  };
}

function forecastScopeSeries(
  signal: ForecastSignalBundle,
  horizons: ForecastPolicy["forecastPolicy"]["horizons"],
  allowNumericForecasts: boolean
): ForecastArtifact["series"] {
  const seriesFor = (points: Array<{ ts: number; value: number; runId?: string; trustTier?: string }>): ForecastSeries =>
    allowNumericForecasts
      ? withChangePoints(
          fitSeriesForecast({
            points,
            horizons
          })
        )
      : noProjectionSeries(points);

  const indices = Object.fromEntries(
    FORECAST_INDEX_IDS.map((id) => [id, seriesFor(signal.points.indices[id])])
  ) as ForecastArtifact["series"]["indices"];
  const value = Object.fromEntries(
    FORECAST_VALUE_DIMENSIONS.map((id) => [id, seriesFor(signal.points.value[id])])
  ) as ForecastArtifact["series"]["value"];
  const operating = Object.fromEntries(
    Object.entries(signal.points.operating).map(([id, points]) => [id, seriesFor(points)])
  ) as ForecastArtifact["series"]["operating"];
  return {
    maturityOverall: seriesFor(signal.points.maturityOverall),
    integrityIndex: seriesFor(signal.points.integrityIndex),
    correlationRatio: seriesFor(signal.points.correlationRatio),
    fourC: {
      Concept: seriesFor(signal.points.fourC.Concept),
      Culture: seriesFor(signal.points.fourC.Culture),
      Capabilities: seriesFor(signal.points.fourC.Capabilities),
      Configuration: seriesFor(signal.points.fourC.Configuration)
    },
    indices,
    value,
    operating
  };
}

function computeDriftSet(params: {
  series: ForecastArtifact["series"];
  policy: ForecastPolicy;
}): ForecastArtifact["drift"] {
  const out: ForecastArtifact["drift"] = [];
  const window = params.policy.forecastPolicy.drift.nRunsWindow;
  const warn = params.policy.forecastPolicy.drift.driftWarnPoints;
  const critical = params.policy.forecastPolicy.drift.driftCriticalPoints;
  const maybe = detectDrift({
    metricId: "maturity_overall",
    points: params.series.maturityOverall.points,
    window,
    warnThreshold: warn,
    criticalThreshold: critical
  });
  if (maybe) {
    out.push(maybe);
  }
  return out;
}

function computeRiskScore(series: ForecastArtifact["series"]): number {
  return avg(FORECAST_INDEX_IDS.map((id) => forecastOrLatest(series.indices[id])));
}

function computeValueDrop(series: ForecastArtifact["series"]): number {
  const latest = avg(FORECAST_VALUE_DIMENSIONS.map((id) => latestOrZero(series.value[id])));
  if (latest <= 1e-9) {
    return 0;
  }
  const forecasted = avg(FORECAST_VALUE_DIMENSIONS.map((id) => forecastOrLatest(series.value[id])));
  return ensureNumber(Math.max(0, (latest - forecasted) / Math.max(1e-9, latest)));
}

/** Internal existing best-effort delivery boundary, reused after durable async publication. */
export function maybeDispatchAdvisories(params: {
  workspace: string;
  advisories: AdvisoryRecord[];
  policy: ForecastPolicy;
}): void {
  const dispatchPolicy = params.policy.forecastPolicy.advisories.dispatch;
  for (const advisory of params.advisories) {
    const shouldDispatch =
      (advisory.severity === "WARN" && dispatchPolicy.warnEvents) ||
      (advisory.severity === "CRITICAL" && dispatchPolicy.criticalEvents);
    if (!shouldDispatch) {
      continue;
    }
    void dispatchIntegrationEvent({
      workspace: params.workspace,
      eventName: "ADVISORY_CREATED",
      agentId: advisory.scope.type === "AGENT" ? advisory.scope.id : "system",
      summary: advisory.summary,
      details: {
        advisoryId: advisory.advisoryId,
        severity: advisory.severity,
        category: advisory.category,
        scope: advisory.scope
      }
    }).catch(() => undefined);
  }
}

export function defaultForecastPolicy(): ForecastPolicy {
  return {
    forecastPolicy: {
      version: 1,
      cadence: {
        defaultRefreshHours: 24,
        refreshAfterRun: true,
        refreshAfterEvents: ["POLICY_APPLIED", "APPROVAL_DECIDED", "FREEZE_CHANGED", "PLUGIN_INSTALLED", "NOTARY_ATTESTATION_OBSERVED"]
      },
      horizons: {
        shortDays: 7,
        midDays: 30,
        longDays: 90
      },
      evidenceGates: {
        minIntegrityIndex: 0.85,
        minCorrelationRatio: 0.9,
        minObservedRuns: 4,
        maxSelfReportedShare: 0.2
      },
      anomaly: {
        maturityJumpRobustZ: 4,
        integrityDropRobustZ: 3,
        approvalsBacklogJumpRobustZ: 3
      },
      drift: {
        nRunsWindow: 6,
        driftWarnPoints: 0.25,
        driftCriticalPoints: 0.5
      },
      advisories: {
        enable: true,
        thresholds: {
          riskScoreWarn: 60,
          riskScoreCritical: 80
        },
        dispatch: {
          warnEvents: true,
          criticalEvents: true
        }
      },
      privacy: {
        exportAgentIdsHashed: true,
        hashTruncBytes: 8
      }
    }
  };
}

export function initForecastPolicy(workspace: string): {
  path: string;
  sigPath: string;
  policy: ForecastPolicy;
} {
  const policy = defaultForecastPolicy();
  const saved = saveForecastPolicy(workspace, policy);
  const contentSha = sha256Hex(readUtf8(saved.path));
  appendTransparencyEntry({
    workspace,
    type: "FORECAST_POLICY_UPDATED",
    agentId: "system",
    artifact: {
      kind: "policy",
      id: "forecast-policy",
      sha256: contentSha
    }
  });
  return {
    ...saved,
    policy
  };
}

function policySha256(policy: ForecastPolicy): string {
  return sha256Hex(canonicalize(policy));
}

export function parseForecastScope(params: {
  scope: "workspace" | "agent" | "node";
  targetId?: string | null;
}): ForecastScope {
  const scope = params.scope.toLowerCase();
  if (scope === "workspace") {
    return {
      type: "WORKSPACE",
      id: "workspace"
    };
  }
  if (!params.targetId || params.targetId.trim().length === 0) {
    throw new Error("targetId is required for agent/node scopes");
  }
  return {
    type: scope === "node" ? "NODE" : "AGENT",
    id: params.targetId.trim()
  };
}

export interface ForecastCreationParams { workspace: string; scope: ForecastScope; lookbackDays?: number; persist?: boolean }
/** Internal shared calculation; historical bodies and actual input projections are fixed before any provider wait. */
export function calculateForecast(input: ForecastCreationParams) {
  const params = { ...input, scope: { ...input.scope } };
  const policySnapshot = captureVerifiedForecastPolicy(params.workspace), policy = policySnapshot.policy;
  const signalSnapshot = captureForecastSignals({
    workspace: params.workspace,
    scope: params.scope,
    lookbackDays: params.lookbackDays ?? Math.max(90, policy.forecastPolicy.horizons.longDays)
  });

  const signals = signalSnapshot.signals;
  const gateReasons = evidenceGateFailures(policy, signals);
  const status: ForecastArtifact["status"] = gateReasons.length === 0 ? "OK" : "INSUFFICIENT_EVIDENCE";
  const series = forecastScopeSeries(signals, policy.forecastPolicy.horizons, status === "OK");
  const drift = status === "OK" ? computeDriftSet({ series, policy }) : [];
  const anomaly =
    status === "OK"
      ? detectSuspiciousMaturityJump({
          maturityPoints: series.maturityOverall.points,
          integrityPoints: series.integrityIndex.points,
          correlationPoints: series.correlationRatio.points,
          observedShare: signals.evidence.observedShare,
          thresholdRobustZ: policy.forecastPolicy.anomaly.maturityJumpRobustZ
        })
      : null;
  const anomalies = anomaly ? [anomaly] : [];
  const leadingSnapshot = captureLeadingIndicators({
    workspace: params.workspace,
    agentId: params.scope.type === "AGENT" ? params.scope.id : undefined,
    windowStartTs: now() - parseWindowToMs("30d"),
    windowEndTs: now()
  });
  const leadingIndicators = leadingSnapshot.indicators;
  let recommendations: ReturnType<typeof captureAdvisoryRecommendations> | undefined;
  const transformSteps = () => (recommendations ??= captureAdvisoryRecommendations(params.workspace, params.scope)).steps;
  const riskScore = computeRiskScore(series);
  const valueDrop = computeValueDrop(series);
  const advisories = policy.forecastPolicy.advisories.enable
    ? generateAdvisories({
        workspace: params.workspace,
        transformSteps,
        scope: params.scope,
        drift,
        anomalies,
        riskScore,
        valueDrop,
        thresholds: policy.forecastPolicy.advisories.thresholds,
        insufficientEvidenceReasons: gateReasons
      })
    : [];

  const forecast: ForecastArtifact = {
    v: 1,
    scope: params.scope,
    generatedTs: now(),
    policySha256: policySha256(policy),
    modelVersion: FORECAST_MODEL_VERSION,
    status,
    reasons: gateReasons,
    horizons: policy.forecastPolicy.horizons,
    evidenceCoverage: {
      observedShare: signals.evidence.observedShare,
      attestedShare: signals.evidence.attestedShare,
      selfReportedShare: signals.evidence.selfReportedShare,
      observedRuns: signals.evidence.observedRuns,
      latestIntegrityIndex: signals.evidence.latestIntegrityIndex,
      latestCorrelationRatio: signals.evidence.latestCorrelationRatio
    },
    series,
    drift,
    anomalies,
    leadingIndicators,
    etaToTarget: computeEta(signals),
    advisories
  };

  return { forecast, advisories, policy, assertInputsCurrent() {
    policySnapshot.assertCurrent(); signalSnapshot.assertCurrent(); leadingSnapshot.assertCurrent(); recommendations?.assertCurrent();
  } };
}

export function createForecast(input: ForecastCreationParams): {
  forecast: ForecastArtifact; advisories: AdvisoryRecord[]; snapshotPath: string | null; latestPath: string | null; snapshotSha256: string | null;
} {
  const params = { ...input, scope: { ...input.scope } }, { forecast, advisories, policy } = calculateForecast(params);
  let latestPath: string | null = null;
  let snapshotPath: string | null = null;
  let snapshotSha256: string | null = null;
  if (params.persist !== false) {
    const saved = saveForecastArtifact(params.workspace, params.scope, forecast);
    latestPath = saved.latestPath;
    snapshotPath = saved.snapshotPath;
    snapshotSha256 = saved.snapshotSha256;
    appendTransparencyEntry({
      workspace: params.workspace,
      type: "FORECAST_CREATED",
      agentId: params.scope.type === "AGENT" ? params.scope.id : "system",
      artifact: {
        kind: "policy",
        id: `${params.scope.type}:${params.scope.id}:${forecast.generatedTs}`,
        sha256: saved.snapshotSha256
      }
    });
    for (const advisory of advisories) {
      const advisorySaved = saveAdvisory(params.workspace, advisory);
      appendTransparencyEntry({
        workspace: params.workspace,
        type: "ADVISORY_CREATED",
        agentId: advisory.scope.type === "AGENT" ? advisory.scope.id : "system",
        artifact: {
          kind: "policy",
          id: advisory.advisoryId,
          sha256: sha256Hex(readUtf8(advisorySaved.path))
        }
      });
    }
    maybeDispatchAdvisories({
      workspace: params.workspace,
      advisories,
      policy
    });
  }
  return {
    forecast,
    advisories,
    snapshotPath,
    latestPath,
    snapshotSha256
  };
}

export function acknowledgeAdvisory(params: {
  workspace: string;
  advisoryId: string;
  by: string;
  note: string;
}): AdvisoryRecord {
  const existing = loadAdvisory(params.workspace, params.advisoryId);
  if (!existing) {
    throw new Error(`advisory not found: ${params.advisoryId}`);
  }
  const updated: AdvisoryRecord = {
    ...existing,
    acknowledged: {
      by: params.by,
      ts: now(),
      note: params.note
    }
  };
  const saved = saveAdvisory(params.workspace, updated);
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "ADVISORY_ACKNOWLEDGED",
    agentId: updated.scope.type === "AGENT" ? updated.scope.id : "system",
    artifact: {
      kind: "policy",
      id: updated.advisoryId,
      sha256: sha256Hex(readUtf8(saved.path))
    }
  });
  return updated;
}

export function listForecastScopesForWorkspace(workspace: string): ForecastScope[] {
  const scopes: ForecastScope[] = [{ type: "WORKSPACE", id: "workspace" }];
  const agents = listAgents(workspace).map((row) => row.id);
  if (!agents.includes("default")) {
    agents.push("default");
  }
  for (const agentId of [...new Set(agents)].sort((a, b) => a.localeCompare(b))) {
    scopes.push({ type: "AGENT", id: agentId });
  }
  try {
    const org = loadOrgConfig(workspace);
    for (const node of org.nodes) {
      scopes.push({ type: "NODE", id: node.id });
    }
  } catch {
    // org config may not exist yet
  }
  return scopes;
}

export function refreshForecastsForWorkspace(params: {
  workspace: string;
  scopes?: ForecastScope[];
}): {
  generated: Array<{ scope: ForecastScope; status: ForecastArtifact["status"] }>;
} {
  const scopes = params.scopes ?? listForecastScopesForWorkspace(params.workspace);
  const generated: Array<{ scope: ForecastScope; status: ForecastArtifact["status"] }> = [];
  for (const scope of scopes) {
    const out = createForecast({
      workspace: params.workspace,
      scope
    });
    generated.push({
      scope,
      status: out.forecast.status
    });
  }
  return { generated };
}

export function schedulerStatus(workspace: string): {
  state: ReturnType<typeof loadForecastSchedulerState>;
  policy: ForecastPolicy;
  signatureValid: boolean;
} {
  const sig = verifyForecastPolicySignature(workspace);
  const policy = loadForecastPolicy(workspace);
  return {
    state: loadForecastSchedulerState(workspace),
    policy,
    signatureValid: sig.valid
  };
}

export function schedulerSetEnabled(workspace: string, enabled: boolean): {
  state: ReturnType<typeof loadForecastSchedulerState>;
  sigPath: string;
} {
  const state = loadForecastSchedulerState(workspace);
  const next = {
    ...state,
    enabled
  };
  const saved = saveForecastSchedulerState(workspace, next);
  return {
    state: next,
    sigPath: saved.sigPath
  };
}

export function schedulerRunNow(params: {
  workspace: string;
  scopes?: ForecastScope[];
}): {
  generated: Array<{ scope: ForecastScope; status: ForecastArtifact["status"] }>;
  state: ReturnType<typeof loadForecastSchedulerState>;
} {
  const policySig = verifyForecastPolicySignature(params.workspace);
  if (!policySig.valid) {
    throw new Error(`forecast policy signature invalid: ${policySig.reason ?? "unknown"}`);
  }
  const generated = refreshForecastsForWorkspace({
    workspace: params.workspace,
    scopes: params.scopes
  }).generated;
  const policy = loadForecastPolicy(params.workspace);
  const state = withSchedulerOutcome(
    loadForecastSchedulerState(params.workspace),
    policy,
    {
      status: "OK",
      reason: "",
      ts: computeNextRefreshTs(policy, now())
    }
  );
  saveForecastSchedulerState(params.workspace, state);
  return {
    generated,
    state
  };
}

export function schedulerTick(params: {
  workspace: string;
  workspaceReady: boolean;
}): {
  ran: boolean;
  reason: string;
  state: ReturnType<typeof loadForecastSchedulerState>;
} {
  const policySig = verifyForecastPolicySignature(params.workspace);
  const state = loadForecastSchedulerState(params.workspace);
  if (!state.enabled) {
    return {
      ran: false,
      reason: "scheduler disabled",
      state
    };
  }
  if (!policySig.valid) {
    const next = withSchedulerOutcome(state, loadForecastPolicy(params.workspace), {
      status: "ERROR",
      reason: `policy signature invalid: ${policySig.reason ?? "unknown"}`
    });
    saveForecastSchedulerState(params.workspace, next);
    return {
      ran: false,
      reason: next.lastOutcome.reason,
      state: next
    };
  }
  if (!params.workspaceReady) {
    const next = withSchedulerOutcome(state, loadForecastPolicy(params.workspace), {
      status: "SKIPPED",
      reason: "workspace not ready"
    });
    saveForecastSchedulerState(params.workspace, next);
    return {
      ran: false,
      reason: next.lastOutcome.reason,
      state: next
    };
  }
  const due = state.nextRefreshTs === null || state.nextRefreshTs <= now();
  if (!due) {
    return {
      ran: false,
      reason: "not due",
      state
    };
  }
  const run = schedulerRunNow({
    workspace: params.workspace
  });
  return {
    ran: true,
    reason: "ok",
    state: run.state
  };
}

export function forecastForScopeOrNull(params: {
  workspace: string;
  scope: ForecastScope;
}): ForecastArtifact | null {
  return loadLatestForecastArtifact(params.workspace, params.scope);
}

export function advisoryId(prefix = "adv"): string {
  return `${prefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
}
