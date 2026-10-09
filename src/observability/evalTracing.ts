/**
 * evalTracing.ts — OpenTelemetry trace integration for AMC eval runs.
 *
 * Wraps the eval diagnostic pipeline with OTLP spans so that each eval run,
 * layer score, and per-question assessment is visible in any OTel-compatible
 * backend (Grafana Tempo, Datadog APM, New Relic, Jaeger, etc.).
 *
 * Usage:
 *   import { traceEvalRun } from './evalTracing.js';
 *   const report = await traceEvalRun(diagnosticFn, opts);
 */

import { getSharedObservabilityExporter } from "./otelExporter.js";
import type {
  IncidentLogInput,
  ObservabilityOTELExporter,
  ScoreComputationMetric,
} from "./otelExporter.js";
import { noteTelemetryDropped } from "./telemetryDrops.js";
import { withWorkspaceScope } from "../enforce/evidenceEmitter.js";
import type { DiagnosticReport } from "../types.js";

export interface EvalTraceContext {
  agentId: string;
  runId: string;
  sessionId?: string;
  workspace?: string;
}

/**
 * Record eval run as OTel spans + metrics via the shared observability exporter.
 *
 * Call this AFTER the diagnostic completes — it reads the finished report
 * and emits structured telemetry for every layer and question.
 */
export function emitEvalRunTelemetry(
  report: DiagnosticReport,
  ctx?: Partial<EvalTraceContext>,
): void {
  const workspace = ctx?.workspace;
  if (workspace !== undefined) {
    if (typeof workspace !== "string" || !workspace.trim()) {
      noteTelemetryDropped(1);
      return;
    }
    return withWorkspaceScope(workspace, () => emitEvalRunTelemetry(report, {
      agentId: ctx?.agentId,
      runId: ctx?.runId,
      sessionId: ctx?.sessionId,
      workspace: undefined,
    }));
  }
  const exporter = getSharedObservabilityExporter();
  const agentId = ctx?.agentId ?? report.agentId;
  const runId = ctx?.runId ?? report.runId;
  const sessionId = ctx?.sessionId ?? report.runId;
  const ts = report.ts ?? Date.now();

  // 1. Overall IntegrityIndex metric
  emitMetric(exporter, {
    agentId,
    runId,
    sessionId,
    score: report.integrityIndex,
    maxScore: 1,
    percentage: report.integrityIndex * 100,
    ts,
    source: "eval.run.integrityIndex",
  });

  // 2. Evidence coverage metric
  emitMetric(exporter, {
    agentId,
    runId,
    sessionId,
    score: report.evidenceCoverage,
    maxScore: 1,
    percentage: report.evidenceCoverage * 100,
    ts,
    source: "eval.run.evidenceCoverage",
  });

  // 3. Per-layer metrics
  for (const layer of report.layerScores) {
    emitMetric(exporter, {
      agentId,
      runId,
      sessionId,
      score: layer.avgFinalLevel,
      maxScore: 5,
      percentage: (layer.avgFinalLevel / 5) * 100,
      level: Math.round(layer.avgFinalLevel),
      dimension: layer.layerName,
      ts,
      source: "eval.run.layer",
    });
  }

  // 4. Per-question metrics
  for (const q of report.questionScores) {
    emitMetric(exporter, {
      agentId,
      runId,
      sessionId,
      score: q.finalLevel,
      maxScore: 5,
      percentage: (q.finalLevel / 5) * 100,
      level: q.finalLevel,
      questionId: q.questionId,
      dimension: q.questionId.split(".")[0],
      ts,
      source: "eval.run.question",
    });
  }

  // 5. Inflation attempt count as metric
  emitMetric(exporter, {
    agentId,
    runId,
    sessionId,
    score: report.inflationAttempts.length,
    ts,
    source: "eval.run.inflationAttempts",
  });

  // 6. Log if verification failed or trust boundary violated
  if (!report.verificationPassed) {
    emitIncident(exporter, {
      incidentId: `${runId}-verification-fail`,
      agentId,
      severity: "HIGH",
      state: "open",
      title: "Eval verification failed",
      description: `IntegrityIndex: ${report.integrityIndex.toFixed(3)}, status: ${report.status}`,
      triggerType: "eval_run",
      triggerId: runId,
      ts,
    });
  }

  if (report.trustBoundaryViolated) {
    emitIncident(exporter, {
      incidentId: `${runId}-trust-boundary`,
      agentId,
      severity: "CRITICAL",
      state: "open",
      title: "Trust boundary violated during eval",
      description: `Agent ${agentId} violated trust boundary. Unsupported claims: ${report.unsupportedClaimCount}`,
      triggerType: "eval_run",
      triggerId: runId,
      ts,
    });
  }
}

function emitMetric(
  exporter: ObservabilityOTELExporter,
  metric: ScoreComputationMetric,
): void {
  try {
    exporter.recordScoreComputation(metric);
  } catch {
    noteTelemetryDropped(1);
    // Observability must never block eval.
  }
}

function emitIncident(
  exporter: ObservabilityOTELExporter,
  incident: IncidentLogInput,
): void {
  try {
    exporter.recordIncident(incident);
  } catch {
    noteTelemetryDropped(1);
    // Observability must never block eval.
  }
}

/**
 * Wrap an eval run function to automatically emit OTel telemetry on completion.
 * Returns the original report unmodified.
 */
export async function traceEvalRun<T extends DiagnosticReport>(
  evalFn: () => Promise<T>,
  ctx?: Partial<EvalTraceContext>,
): Promise<T> {
  const report = await evalFn();
  emitEvalRunTelemetry(report, ctx);

  // Best-effort flush
  try {
    const exporter = getSharedObservabilityExporter();
    await exporter.flush();
  } catch {
    // Non-blocking
  }

  return report;
}
