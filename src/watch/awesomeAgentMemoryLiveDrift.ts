import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  runLiveScoreBehaviorDrift,
  type LiveDriftAlert,
  type LiveDriftMetricId,
  type LiveDriftReceipt,
  type LiveDriftSampleRow,
  type LiveDriftSeverity,
  type LiveDriftThresholds,
  type LiveDriftWindow,
} from "./liveDriftAlerts.js";

export type AwesomeAgentMemoryCategory =
  | "survey"
  | "memory_architecture"
  | "rl_memory_management"
  | "long_term_conversation"
  | "multi_agent_memory"
  | "benchmark_evaluation"
  | "project_framework"
  | "workshop_community"
  | "custom";

export type AwesomeAgentMemoryEvaluationTask =
  | "retrieval"
  | "test_time_learning"
  | "long_range_understanding"
  | "selective_forgetting"
  | "conversational_recall"
  | "memory_hallucination"
  | "framework_smoke"
  | "custom";

export interface AwesomeAgentMemoryLiveDriftRow {
  traceId: string;
  scenarioId: string;
  timestamp: string;
  catalogId: string;
  sourceRefHash: string;
  repositorySnapshotHash: string;
  noLicenseBoundaryHash: string;
  readmeBlobHash: string;
  catalogSnapshotHash: string;
  entryId: string;
  entrySourceRefHash: string;
  taxonomyManifestHash: string;
  benchmarkManifestHash: string;
  evalDatasetHash: string;
  baselineResultHash?: string;
  liveResultHash?: string;
  driftStatisticHash?: string;
  alertReceiptHash?: string;
  memoryCategory: AwesomeAgentMemoryCategory;
  evaluationTask: AwesomeAgentMemoryEvaluationTask;
  retrievalScore0to1: number;
  persistenceScore0to1: number;
  forgettingScore0to1: number;
  hallucinationRate0to1: number;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface AwesomeAgentMemoryWindow {
  windowId: string;
  startedAt: string;
  endedAt: string;
  rows: AwesomeAgentMemoryLiveDriftRow[];
}

export interface AwesomeAgentMemoryLiveDriftThresholds {
  maxRetrievalScoreDrop0to1: number;
  maxPersistenceScoreDrop0to1: number;
  maxForgettingScoreDrop0to1: number;
  maxHallucinationRateIncrease0to1: number;
  minEvidenceCoverage0to1: number;
  maxTaxonomyDivergence0to1: number;
  maxEvaluationTaskDivergence0to1: number;
  maxContextDivergence0to1: number;
}

export interface RunAwesomeAgentMemoryLiveDriftInput {
  agentId: string;
  baselineWindow: AwesomeAgentMemoryWindow;
  liveWindow: AwesomeAgentMemoryWindow;
  thresholds?: Partial<AwesomeAgentMemoryLiveDriftThresholds>;
  liveDriftThresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}

export interface AwesomeAgentMemoryDistribution {
  rowCount: number;
  retrievalScoreMean0to1: number;
  persistenceScoreMean0to1: number;
  forgettingScoreMean0to1: number;
  hallucinationRate0to1: number;
  evidenceCoverage0to1: number;
  taxonomyDistribution: Record<string, number>;
  evaluationTaskDistribution: Record<string, number>;
  contextDistribution: Record<string, number>;
}

export interface AwesomeAgentMemoryScoreDrift {
  retrievalScoreDrop0to1: number;
  persistenceScoreDrop0to1: number;
  forgettingScoreDrop0to1: number;
  hallucinationRateIncrease0to1: number;
  evidenceCoverageDrop0to1: number;
}

export interface AwesomeAgentMemoryBehaviorDrift {
  taxonomyDivergence0to1: number;
  evaluationTaskDivergence0to1: number;
  contextDivergence0to1: number;
}

export interface AwesomeAgentMemoryReceiptRow extends AwesomeAgentMemoryLiveDriftRow {
  score0to1: number;
  evidenceCoverage0to1: number;
  rowHash: string;
}

export interface AwesomeAgentMemoryLiveDriftResult {
  receipt: LiveDriftReceipt;
  catalogReceiptHash: string;
  baselineRows: AwesomeAgentMemoryReceiptRow[];
  liveRows: AwesomeAgentMemoryReceiptRow[];
  baselineDistribution: AwesomeAgentMemoryDistribution;
  liveDistribution: AwesomeAgentMemoryDistribution;
  scoreDrift: AwesomeAgentMemoryScoreDrift;
  behaviorDrift: AwesomeAgentMemoryBehaviorDrift;
}

const DEFAULT_SOURCE_REF = "https://github.com/wfnuser/Awesome-Agent-Memory";

export const defaultAwesomeAgentMemoryLiveDriftThresholds: AwesomeAgentMemoryLiveDriftThresholds = {
  maxRetrievalScoreDrop0to1: 0.08,
  maxPersistenceScoreDrop0to1: 0.08,
  maxForgettingScoreDrop0to1: 0.08,
  maxHallucinationRateIncrease0to1: 0.05,
  minEvidenceCoverage0to1: 1,
  maxTaxonomyDivergence0to1: 0.35,
  maxEvaluationTaskDivergence0to1: 0.35,
  maxContextDivergence0to1: 0.35,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value: number, places = 6): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function mean(values: number[], fallback = 0): number {
  return values.length === 0 ? fallback : round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function labelDistribution<T>(rows: T[], labelFor: (row: T) => string): Record<string, number> {
  if (rows.length === 0) return {};
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = labelFor(row);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].map(([label, count]) => [label, round(count / rows.length)]));
}

function totalVariationDistance(left: Record<string, number>, right: Record<string, number>): number {
  const labels = new Set([...Object.keys(left), ...Object.keys(right)]);
  let total = 0;
  for (const label of labels) {
    total += Math.abs((left[label] ?? 0) - (right[label] ?? 0));
  }
  return round(total / 2);
}

function rowScore(row: AwesomeAgentMemoryLiveDriftRow): number {
  return mean([
    clamp01(row.retrievalScore0to1),
    clamp01(row.persistenceScore0to1),
    clamp01(row.forgettingScore0to1),
    1 - clamp01(row.hallucinationRate0to1),
  ]);
}

function rowEvidenceCoverage(row: AwesomeAgentMemoryLiveDriftRow, phase: "baseline" | "live"): number {
  const phaseProof = phase === "baseline"
    ? [nonEmpty(row.baselineResultHash)]
    : [nonEmpty(row.liveResultHash), nonEmpty(row.driftStatisticHash), nonEmpty(row.alertReceiptHash)];
  const checks = [
    nonEmpty(row.catalogId),
    nonEmpty(row.sourceRefHash),
    nonEmpty(row.repositorySnapshotHash),
    nonEmpty(row.noLicenseBoundaryHash),
    nonEmpty(row.readmeBlobHash),
    nonEmpty(row.catalogSnapshotHash),
    nonEmpty(row.entryId),
    nonEmpty(row.entrySourceRefHash),
    nonEmpty(row.taxonomyManifestHash),
    nonEmpty(row.benchmarkManifestHash),
    nonEmpty(row.evalDatasetHash),
    row.memoryCategory !== "custom",
    row.evaluationTask !== "custom",
    Number.isFinite(row.retrievalScore0to1),
    Number.isFinite(row.persistenceScore0to1),
    Number.isFinite(row.forgettingScore0to1),
    Number.isFinite(row.hallucinationRate0to1),
    row.evidenceRefs.length > 0,
    row.signedEvidenceRefs.length > 0,
    ...phaseProof,
  ];
  return round(checks.filter(Boolean).length / checks.length);
}

function contextLabel(row: AwesomeAgentMemoryLiveDriftRow): string {
  return [
    row.repositorySnapshotHash || "unknown-repo",
    row.catalogSnapshotHash || "unknown-catalog",
    row.taxonomyManifestHash || "unknown-taxonomy",
    row.benchmarkManifestHash || "unknown-benchmark-manifest",
    row.evalDatasetHash || "unknown-eval-dataset",
    row.memoryCategory,
    row.evaluationTask,
  ].join("/");
}

function toReceiptRow(row: AwesomeAgentMemoryLiveDriftRow, phase: "baseline" | "live"): AwesomeAgentMemoryReceiptRow {
  const score0to1 = rowScore(row);
  const evidenceCoverage0to1 = rowEvidenceCoverage(row, phase);
  const withoutHash = {
    ...row,
    retrievalScore0to1: clamp01(row.retrievalScore0to1),
    persistenceScore0to1: clamp01(row.persistenceScore0to1),
    forgettingScore0to1: clamp01(row.forgettingScore0to1),
    hallucinationRate0to1: clamp01(row.hallucinationRate0to1),
    score0to1,
    evidenceCoverage0to1,
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash)),
  };
}

function toLiveDriftRow(row: AwesomeAgentMemoryLiveDriftRow): LiveDriftSampleRow {
  const score0to1 = rowScore(row);
  return {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    timestamp: row.timestamp,
    score0to1,
    passed: score0to1 >= 0.8,
    refused: false,
    errored: false,
    behaviorSignature: `awesome-agent-memory:${row.memoryCategory}:${row.evaluationTask}:${row.entryId}`,
    lifecycleStage: "deployment_maintenance",
    taskCategory: "memory live drift",
    domain: "agent memory",
    agentEvaluationDimension: "memory",
    latencyMs: 0,
    costUsd: 0,
    evidenceRefs: row.evidenceRefs,
    signedEvidenceRefs: row.signedEvidenceRefs,
  };
}

function toLiveDriftWindow(window: AwesomeAgentMemoryWindow): LiveDriftWindow {
  return {
    windowId: window.windowId,
    startedAt: window.startedAt,
    endedAt: window.endedAt,
    rows: window.rows.map(toLiveDriftRow),
  };
}

function distribution(rows: AwesomeAgentMemoryReceiptRow[]): AwesomeAgentMemoryDistribution {
  return {
    rowCount: rows.length,
    retrievalScoreMean0to1: mean(rows.map((row) => row.retrievalScore0to1)),
    persistenceScoreMean0to1: mean(rows.map((row) => row.persistenceScore0to1)),
    forgettingScoreMean0to1: mean(rows.map((row) => row.forgettingScore0to1)),
    hallucinationRate0to1: mean(rows.map((row) => row.hallucinationRate0to1)),
    evidenceCoverage0to1: mean(rows.map((row) => row.evidenceCoverage0to1), rows.length === 0 ? 1 : 0),
    taxonomyDistribution: labelDistribution(rows, (row) => row.memoryCategory),
    evaluationTaskDistribution: labelDistribution(rows, (row) => row.evaluationTask),
    contextDistribution: labelDistribution(rows, contextLabel),
  };
}

function buildAlert(
  input: RunAwesomeAgentMemoryLiveDriftInput,
  metricId: LiveDriftMetricId,
  observed: number,
  threshold: number,
  message: string,
  severity: LiveDriftSeverity,
): LiveDriftAlert {
  const evidenceRefs = unique([
    ...(input.sourceRefs ?? []),
    DEFAULT_SOURCE_REF,
    ...input.baselineWindow.rows.flatMap((row) => row.evidenceRefs),
    ...input.liveWindow.rows.flatMap((row) => row.evidenceRefs),
  ]);
  const signedEvidenceRefs = unique([
    ...input.baselineWindow.rows.flatMap((row) => row.signedEvidenceRefs),
    ...input.liveWindow.rows.flatMap((row) => row.signedEvidenceRefs),
  ]);
  return {
    alertId: `awesome-agent-memory:${metricId}:${sha256Hex(canonicalize({ metricId, observed, threshold, message })).slice(0, 12)}`,
    metricId,
    severity,
    message,
    threshold,
    observed: round(observed),
    evidenceRefs,
    signedEvidenceRefs,
  };
}

function withAdditionalAlerts(receipt: LiveDriftReceipt, additionalAlerts: LiveDriftAlert[]): LiveDriftReceipt {
  if (additionalAlerts.length === 0) return receipt;
  const { receiptHash: _receiptHash, ...withoutHash } = receipt;
  const alerts = [...receipt.alerts, ...additionalAlerts];
  const updatedWithoutHash = {
    ...withoutHash,
    alerts,
    recommendation: "alert" as const,
    failClosed: true,
    summary: `${alerts.length} live drift alert(s), recommendation=alert`,
  };
  return {
    ...updatedWithoutHash,
    receiptHash: sha256Hex(canonicalize(updatedWithoutHash)),
  };
}

export function runAwesomeAgentMemoryLiveDrift(input: RunAwesomeAgentMemoryLiveDriftInput): AwesomeAgentMemoryLiveDriftResult {
  const thresholds = {
    ...defaultAwesomeAgentMemoryLiveDriftThresholds,
    ...(input.thresholds ?? {}),
  };
  const baselineRows = input.baselineWindow.rows.map((row) => toReceiptRow(row, "baseline"));
  const liveRows = input.liveWindow.rows.map((row) => toReceiptRow(row, "live"));
  const baselineDistribution = distribution(baselineRows);
  const liveDistribution = distribution(liveRows);
  const scoreDrift: AwesomeAgentMemoryScoreDrift = {
    retrievalScoreDrop0to1: round(Math.max(0, baselineDistribution.retrievalScoreMean0to1 - liveDistribution.retrievalScoreMean0to1)),
    persistenceScoreDrop0to1: round(Math.max(0, baselineDistribution.persistenceScoreMean0to1 - liveDistribution.persistenceScoreMean0to1)),
    forgettingScoreDrop0to1: round(Math.max(0, baselineDistribution.forgettingScoreMean0to1 - liveDistribution.forgettingScoreMean0to1)),
    hallucinationRateIncrease0to1: round(Math.max(0, liveDistribution.hallucinationRate0to1 - baselineDistribution.hallucinationRate0to1)),
    evidenceCoverageDrop0to1: round(Math.max(0, baselineDistribution.evidenceCoverage0to1 - liveDistribution.evidenceCoverage0to1)),
  };
  const behaviorDrift: AwesomeAgentMemoryBehaviorDrift = {
    taxonomyDivergence0to1: totalVariationDistance(baselineDistribution.taxonomyDistribution, liveDistribution.taxonomyDistribution),
    evaluationTaskDivergence0to1: totalVariationDistance(baselineDistribution.evaluationTaskDistribution, liveDistribution.evaluationTaskDistribution),
    contextDivergence0to1: totalVariationDistance(baselineDistribution.contextDistribution, liveDistribution.contextDistribution),
  };
  const additionalAlerts: LiveDriftAlert[] = [];
  if (scoreDrift.retrievalScoreDrop0to1 > thresholds.maxRetrievalScoreDrop0to1) {
    additionalAlerts.push(buildAlert(input, "awesomeAgentMemoryRetrievalScoreMean0to1", scoreDrift.retrievalScoreDrop0to1, thresholds.maxRetrievalScoreDrop0to1, "Live Awesome-Agent-Memory-style retrieval score dropped beyond threshold.", "high"));
  }
  if (scoreDrift.persistenceScoreDrop0to1 > thresholds.maxPersistenceScoreDrop0to1) {
    additionalAlerts.push(buildAlert(input, "awesomeAgentMemoryPersistenceScoreMean0to1", scoreDrift.persistenceScoreDrop0to1, thresholds.maxPersistenceScoreDrop0to1, "Live Awesome-Agent-Memory-style persistence score dropped beyond threshold.", "high"));
  }
  if (scoreDrift.forgettingScoreDrop0to1 > thresholds.maxForgettingScoreDrop0to1) {
    additionalAlerts.push(buildAlert(input, "awesomeAgentMemoryForgettingScoreMean0to1", scoreDrift.forgettingScoreDrop0to1, thresholds.maxForgettingScoreDrop0to1, "Live Awesome-Agent-Memory-style selective-forgetting score dropped beyond threshold.", "high"));
  }
  if (scoreDrift.hallucinationRateIncrease0to1 > thresholds.maxHallucinationRateIncrease0to1) {
    additionalAlerts.push(buildAlert(input, "awesomeAgentMemoryHallucinationRate0to1", scoreDrift.hallucinationRateIncrease0to1, thresholds.maxHallucinationRateIncrease0to1, "Live Awesome-Agent-Memory-style memory hallucination rate increased beyond threshold.", "critical"));
  }
  if (liveDistribution.evidenceCoverage0to1 < thresholds.minEvidenceCoverage0to1) {
    additionalAlerts.push(buildAlert(input, "awesomeAgentMemoryEvidenceCoverage0to1", liveDistribution.evidenceCoverage0to1, thresholds.minEvidenceCoverage0to1, "Live Awesome-Agent-Memory-style rows are missing source snapshot, no-license boundary, README blob, catalog snapshot, entry source, taxonomy, benchmark manifest, eval dataset, result, drift statistic, alert receipt, evidence, or signed evidence proof.", "critical"));
  }
  if (behaviorDrift.taxonomyDivergence0to1 > thresholds.maxTaxonomyDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "awesomeAgentMemoryTaxonomyDistribution", behaviorDrift.taxonomyDivergence0to1, thresholds.maxTaxonomyDivergence0to1, "Live Awesome-Agent-Memory-style memory taxonomy distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.evaluationTaskDivergence0to1 > thresholds.maxEvaluationTaskDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "awesomeAgentMemoryEvaluationTaskDistribution", behaviorDrift.evaluationTaskDivergence0to1, thresholds.maxEvaluationTaskDivergence0to1, "Live Awesome-Agent-Memory-style evaluation task distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.contextDivergence0to1 > thresholds.maxContextDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "awesomeAgentMemoryContextDistribution", behaviorDrift.contextDivergence0to1, thresholds.maxContextDivergence0to1, "Live Awesome-Agent-Memory-style source, catalog, taxonomy, benchmark, or dataset context diverged beyond threshold.", "medium"));
  }
  const receipt = withAdditionalAlerts(
    runLiveScoreBehaviorDrift({
      agentId: input.agentId,
      baselineWindow: toLiveDriftWindow(input.baselineWindow),
      liveWindow: toLiveDriftWindow(input.liveWindow),
      thresholds: input.liveDriftThresholds,
      sourceRefs: unique([...(input.sourceRefs ?? []), DEFAULT_SOURCE_REF]),
      now: input.now,
    }),
    additionalAlerts,
  );
  const catalogReceiptHash = sha256Hex(canonicalize({
    baselineRows,
    liveRows,
    baselineDistribution,
    liveDistribution,
    scoreDrift,
    behaviorDrift,
    thresholds,
    receiptHash: receipt.receiptHash,
  }));
  return {
    receipt,
    catalogReceiptHash,
    baselineRows,
    liveRows,
    baselineDistribution,
    liveDistribution,
    scoreDrift,
    behaviorDrift,
  };
}
