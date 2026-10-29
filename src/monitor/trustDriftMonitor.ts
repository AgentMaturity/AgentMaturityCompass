import { join } from "node:path";
import { resolveAgentId } from "../fleet/paths.js";
import { listVerifiedRuns } from "../diagnostic/runReportResolution.js";
import type { DiagnosticReport } from "../types.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

export type TrustDriftSeverity = "medium" | "high" | "critical";

export interface TrustDriftPoint {
  runId: string;
  ts: number;
  integrityIndex: number;
  score0to100: number;
}

export interface TrustDriftAlert {
  alertId: string;
  agentId: string;
  severity: TrustDriftSeverity;
  threshold: number;
  drop: number;
  previousRunId: string;
  currentRunId: string;
  previousScore0to100: number;
  currentScore0to100: number;
  triggeredTs: number;
  message: string;
}

export interface TrustDriftMonitorState {
  schemaVersion: 1;
  agentId: string;
  alertThreshold: number;
  lastProcessedRunId: string | null;
  lastProcessedTs: number | null;
  lastScore0to100: number | null;
  alerts: TrustDriftAlert[];
  updatedTs: number;
}

export interface StartTrustDriftMonitorInput {
  workspace: string;
  agentId: string;
  alertThreshold: number;
  nowTs?: number;
}

export interface TrustDriftMonitorResult {
  agentId: string;
  threshold: number;
  analyzedRuns: number;
  latestPoint: TrustDriftPoint | null;
  alerts: TrustDriftAlert[];
  statePath: string;
}

const MAX_STORED_ALERTS = 300;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeThreshold(value: number): number {
  if (!Number.isFinite(value)) {
    return 10;
  }
  return Math.max(0.1, Math.min(100, value));
}

function trustMonitorRoot(workspace: string): string {
  return join(workspace, ".amc", "monitor", "trust-drift");
}

function trustMonitorStatePath(workspace: string, agentId: string): string {
  return join(trustMonitorRoot(workspace), `${agentId}.json`);
}

function deriveIntegrityIndex(report: Partial<DiagnosticReport>): number {
  if (typeof report.integrityIndex === "number" && Number.isFinite(report.integrityIndex)) {
    return clamp01(report.integrityIndex);
  }
  if (Array.isArray(report.layerScores) && report.layerScores.length > 0) {
    const scores = report.layerScores
      .map((row) => row?.avgFinalLevel)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (scores.length > 0) {
      const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
      return clamp01(avg / 5);
    }
  }
  return 0;
}

/** Only sealed runs form the series (WP37): an edited run must neither raise nor fake a drift alert. */
function loadTrustSeries(workspace: string, agentId: string): TrustDriftPoint[] {
  return listVerifiedRuns(workspace, agentId)
    .map((run) => {
      const integrityIndex = deriveIntegrityIndex(run);
      return { runId: run.runId, ts: run.ts, integrityIndex, score0to100: round2(integrityIndex * 100) };
    })
    .sort((a, b) => a.ts - b.ts || a.runId.localeCompare(b.runId));
}

function severityFromDrop(drop: number, threshold: number): TrustDriftSeverity {
  if (drop >= threshold * 2) {
    return "critical";
  }
  if (drop >= threshold * 1.5) {
    return "high";
  }
  return "medium";
}

function loadState(workspace: string, agentId: string): TrustDriftMonitorState | null {
  const file = trustMonitorStatePath(workspace, agentId);
  if (!pathExists(file)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readUtf8(file)) as Partial<TrustDriftMonitorState>;
    if (parsed.schemaVersion !== 1 || parsed.agentId !== agentId) {
      return null;
    }
    return {
      schemaVersion: 1,
      agentId,
      alertThreshold: typeof parsed.alertThreshold === "number" ? normalizeThreshold(parsed.alertThreshold) : 10,
      lastProcessedRunId: typeof parsed.lastProcessedRunId === "string" ? parsed.lastProcessedRunId : null,
      lastProcessedTs: typeof parsed.lastProcessedTs === "number" ? parsed.lastProcessedTs : null,
      lastScore0to100: typeof parsed.lastScore0to100 === "number" ? parsed.lastScore0to100 : null,
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts as TrustDriftAlert[] : [],
      updatedTs: typeof parsed.updatedTs === "number" ? parsed.updatedTs : Date.now()
    };
  } catch {
    return null;
  }
}

function saveState(workspace: string, state: TrustDriftMonitorState): string {
  const file = trustMonitorStatePath(workspace, state.agentId);
  ensureDir(trustMonitorRoot(workspace));
  writeFileAtomic(file, `${JSON.stringify(state, null, 2)}\n`, 0o644);
  return file;
}

function buildAlert(params: {
  agentId: string;
  threshold: number;
  previous: TrustDriftPoint;
  current: TrustDriftPoint;
  nowTs: number;
}): TrustDriftAlert {
  const drop = round2(params.previous.score0to100 - params.current.score0to100);
  const severity = severityFromDrop(drop, params.threshold);
  const idDigest = sha256Hex(
    `${params.agentId}|${params.previous.runId}|${params.current.runId}|${drop}|${params.nowTs}`
  );
  return {
    alertId: `tda_${idDigest.slice(0, 16)}`,
    agentId: params.agentId,
    severity,
    threshold: params.threshold,
    drop,
    previousRunId: params.previous.runId,
    currentRunId: params.current.runId,
    previousScore0to100: params.previous.score0to100,
    currentScore0to100: params.current.score0to100,
    triggeredTs: params.nowTs,
    message: `Trust degraded by ${drop.toFixed(2)} points (${params.previous.runId} -> ${params.current.runId}).`
  };
}

export function startTrustDriftMonitor(input: StartTrustDriftMonitorInput): TrustDriftMonitorResult {
  const workspace = input.workspace;
  const agentId = resolveAgentId(workspace, input.agentId);
  const threshold = normalizeThreshold(input.alertThreshold);
  const nowTs = typeof input.nowTs === "number" ? input.nowTs : Date.now();
  const points = loadTrustSeries(workspace, agentId);
  const existingState = loadState(workspace, agentId);

  let startIndex = 0;
  let baseline: TrustDriftPoint | null = null;
  if (existingState?.lastProcessedRunId) {
    const index = points.findIndex((point) => point.runId === existingState.lastProcessedRunId);
    if (index >= 0) {
      startIndex = index + 1;
      if (index >= 0 && points[index]) {
        baseline = points[index]!;
      }
    }
  }

  if (!baseline && typeof existingState?.lastScore0to100 === "number" && existingState.lastProcessedRunId) {
    baseline = {
      runId: existingState.lastProcessedRunId,
      ts: existingState.lastProcessedTs ?? 0,
      integrityIndex: clamp01(existingState.lastScore0to100 / 100),
      score0to100: existingState.lastScore0to100
    };
  }

  if (!baseline && startIndex > 0 && points[startIndex - 1]) {
    baseline = points[startIndex - 1]!;
  }

  const newPoints = points.slice(startIndex);
  const alerts: TrustDriftAlert[] = [];
  for (const point of newPoints) {
    if (baseline) {
      const drop = baseline.score0to100 - point.score0to100;
      if (drop >= threshold) {
        alerts.push(buildAlert({
          agentId,
          threshold,
          previous: baseline,
          current: point,
          nowTs
        }));
      }
    }
    baseline = point;
  }

  const lastPoint = points.length > 0 ? points[points.length - 1]! : null;
  const mergedAlerts = [...(existingState?.alerts ?? []), ...alerts];
  const nextState: TrustDriftMonitorState = {
    schemaVersion: 1,
    agentId,
    alertThreshold: threshold,
    lastProcessedRunId: lastPoint?.runId ?? existingState?.lastProcessedRunId ?? null,
    lastProcessedTs: lastPoint?.ts ?? existingState?.lastProcessedTs ?? null,
    lastScore0to100: lastPoint?.score0to100 ?? existingState?.lastScore0to100 ?? null,
    alerts: mergedAlerts.slice(-MAX_STORED_ALERTS),
    updatedTs: nowTs
  };
  const statePath = saveState(workspace, nextState);

  return {
    agentId,
    threshold,
    analyzedRuns: newPoints.length,
    latestPoint: lastPoint,
    alerts,
    statePath
  };
}

