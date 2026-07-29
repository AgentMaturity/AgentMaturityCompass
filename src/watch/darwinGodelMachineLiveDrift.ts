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
import {
  hasNonBlankEvidenceRef,
  normalizeEvidenceRefs,
} from "./evidenceRefs.js";

export type DarwinGodelMachineBenchmarkFamily =
  | "humaneval_calibrated"
  | "humaneval_headroom"
  | "humaneval_style"
  | "list_processing"
  | "simple_algorithm"
  | "string_manipulation"
  | "custom";

export type DarwinGodelMachineSandboxMode =
  | "docker_full_process"
  | "docker_command"
  | "host_fallback"
  | "none";

export interface DarwinGodelMachineLiveDriftRow {
  traceId: string;
  scenarioId: string;
  timestamp: string;
  dgmRunId: string;
  sourceRefHash: string;
  repositorySnapshotHash: string;
  noLicenseBoundaryHash: string;
  readmeBlobHash: string;
  securityPolicyHash: string;
  ciWorkflowHash: string;
  controllerHash: string;
  archiveHash: string;
  selfModificationHash: string;
  evaluationHarnessHash: string;
  scorerHash: string;
  sandboxDockerfileHash: string;
  sandboxManagerHash: string;
  liveRunConfigHash: string;
  liveProofConfigHash: string;
  modelMatrixConfigHash: string;
  benchmarkManifestHash: string;
  scoreMovementManifestHash: string;
  livePlanVerifierHash: string;
  sandboxVerifierHash: string;
  archiveScoreSummarizerHash: string;
  fullProcessSandboxRunnerHash: string;
  baselineResultHash?: string;
  liveResultHash?: string;
  driftStatisticHash?: string;
  alertReceiptHash?: string;
  generation: number;
  parentAgentHash: string;
  candidateAgentHash: string;
  lineageGraphHash: string;
  providerRouteHash: string;
  modelId: string;
  sandboxMode: DarwinGodelMachineSandboxMode;
  benchmarkFamily: DarwinGodelMachineBenchmarkFamily;
  parentScore0to1: number;
  candidateScore0to1: number;
  passRate0to1: number;
  mutationAccepted: boolean;
  regressionFailureRate0to1: number;
  latencyMs: number;
  costUsd: number;
  agentStepCount: number;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface DarwinGodelMachineWindow {
  windowId: string;
  startedAt: string;
  endedAt: string;
  rows: DarwinGodelMachineLiveDriftRow[];
}

export interface DarwinGodelMachineLiveDriftThresholds {
  maxCandidateScoreDrop0to1: number;
  maxScoreMovementDrop0to1: number;
  maxPassRateDrop0to1: number;
  maxMutationAcceptanceDrop0to1: number;
  maxRegressionFailureRateIncrease0to1: number;
  minLineageCoverage0to1: number;
  minSandboxCoverage0to1: number;
  minEvidenceCoverage0to1: number;
  maxGenerationDivergence0to1: number;
  maxProviderRouteDivergence0to1: number;
  maxModelDivergence0to1: number;
  maxBenchmarkFamilyDivergence0to1: number;
  maxSandboxModeDivergence0to1: number;
  maxContextDivergence0to1: number;
  maxLatencyP95IncreaseRatio: number;
  maxCostIncreaseRatio: number;
}

export interface RunDarwinGodelMachineLiveDriftInput {
  agentId: string;
  baselineWindow: DarwinGodelMachineWindow;
  liveWindow: DarwinGodelMachineWindow;
  thresholds?: Partial<DarwinGodelMachineLiveDriftThresholds>;
  liveDriftThresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}

export interface DarwinGodelMachineDistribution {
  rowCount: number;
  receiptScoreMean0to1: number;
  parentScoreMean0to1: number;
  candidateScoreMean0to1: number;
  scoreMovementMean0to1: number;
  passRateMean0to1: number;
  mutationAcceptanceRate0to1: number;
  regressionFailureRate0to1: number;
  lineageCoverage0to1: number;
  sandboxCoverage0to1: number;
  evidenceCoverage0to1: number;
  agentStepCountMean: number;
  latencyP95Ms: number;
  costUsdMean: number;
  generationDistribution: Record<string, number>;
  providerRouteDistribution: Record<string, number>;
  modelDistribution: Record<string, number>;
  benchmarkFamilyDistribution: Record<string, number>;
  sandboxModeDistribution: Record<string, number>;
  contextDistribution: Record<string, number>;
}

export interface DarwinGodelMachineScoreDrift {
  candidateScoreDrop0to1: number;
  scoreMovementDrop0to1: number;
  passRateDrop0to1: number;
  mutationAcceptanceDrop0to1: number;
  regressionFailureRateIncrease0to1: number;
  lineageCoverageDrop0to1: number;
  sandboxCoverageDrop0to1: number;
  evidenceCoverageDrop0to1: number;
  latencyP95IncreaseRatio: number;
  costIncreaseRatio: number;
}

export interface DarwinGodelMachineBehaviorDrift {
  generationDivergence0to1: number;
  providerRouteDivergence0to1: number;
  modelDivergence0to1: number;
  benchmarkFamilyDivergence0to1: number;
  sandboxModeDivergence0to1: number;
  contextDivergence0to1: number;
}

export interface DarwinGodelMachineReceiptRow extends DarwinGodelMachineLiveDriftRow {
  scoreMovement0to1: number;
  receiptScore0to1: number;
  lineageCoverage0to1: number;
  sandboxCoverage0to1: number;
  evidenceCoverage0to1: number;
  rowHash: string;
}

export interface DarwinGodelMachineLiveDriftResult {
  receipt: LiveDriftReceipt;
  darwinGodelMachineReceiptHash: string;
  baselineRows: DarwinGodelMachineReceiptRow[];
  liveRows: DarwinGodelMachineReceiptRow[];
  baselineDistribution: DarwinGodelMachineDistribution;
  liveDistribution: DarwinGodelMachineDistribution;
  scoreDrift: DarwinGodelMachineScoreDrift;
  behaviorDrift: DarwinGodelMachineBehaviorDrift;
}

const DEFAULT_SOURCE_REF = "https://github.com/lemoz/darwin-godel-machine";

export const defaultDarwinGodelMachineLiveDriftThresholds: DarwinGodelMachineLiveDriftThresholds = {
  maxCandidateScoreDrop0to1: 0.08,
  maxScoreMovementDrop0to1: 0.08,
  maxPassRateDrop0to1: 0.08,
  maxMutationAcceptanceDrop0to1: 0.2,
  maxRegressionFailureRateIncrease0to1: 0.05,
  minLineageCoverage0to1: 1,
  minSandboxCoverage0to1: 1,
  minEvidenceCoverage0to1: 1,
  maxGenerationDivergence0to1: 0.35,
  maxProviderRouteDivergence0to1: 0.25,
  maxModelDivergence0to1: 0.35,
  maxBenchmarkFamilyDivergence0to1: 0.35,
  maxSandboxModeDivergence0to1: 0.35,
  maxContextDivergence0to1: 0.25,
  maxLatencyP95IncreaseRatio: 0.35,
  maxCostIncreaseRatio: 0.35,
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

function unique(values: unknown): string[] {
  return normalizeEvidenceRefs(values);
}

function mean(values: number[], fallback = 0): number {
  return values.length === 0 ? fallback : round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function boolMean(values: boolean[]): number {
  return values.length === 0 ? 0 : round(values.filter(Boolean).length / values.length);
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

function percentile(values: number[], p: number): number {
  const finite = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (finite.length === 0) return 0;
  const index = Math.min(finite.length - 1, Math.max(0, Math.ceil((p / 100) * finite.length) - 1));
  return round(finite[index]!);
}

function ratioIncrease(baseline: number, live: number): number {
  if (!Number.isFinite(baseline) || !Number.isFinite(live) || baseline <= 0) return live > baseline ? 1 : 0;
  return round(Math.max(0, (live - baseline) / baseline));
}

function scoreMovement(row: DarwinGodelMachineLiveDriftRow): number {
  return round(clamp01(row.candidateScore0to1 - row.parentScore0to1));
}

function lineageCoverage(row: DarwinGodelMachineLiveDriftRow): number {
  return mean([
    nonEmpty(row.parentAgentHash) ? 1 : 0,
    nonEmpty(row.candidateAgentHash) ? 1 : 0,
    nonEmpty(row.lineageGraphHash) ? 1 : 0,
  ]);
}

function sandboxCoverage(row: DarwinGodelMachineLiveDriftRow): number {
  return mean([
    nonEmpty(row.sandboxDockerfileHash) ? 1 : 0,
    nonEmpty(row.sandboxManagerHash) ? 1 : 0,
    nonEmpty(row.livePlanVerifierHash) ? 1 : 0,
    nonEmpty(row.sandboxVerifierHash) ? 1 : 0,
    nonEmpty(row.fullProcessSandboxRunnerHash) ? 1 : 0,
    row.sandboxMode !== "none" ? 1 : 0,
  ]);
}

function rowScore(row: DarwinGodelMachineLiveDriftRow): number {
  return mean([
    clamp01(row.candidateScore0to1),
    clamp01(row.passRate0to1),
    clamp01(scoreMovement(row)),
    row.mutationAccepted ? 1 : 0,
    1 - clamp01(row.regressionFailureRate0to1),
    lineageCoverage(row),
    sandboxCoverage(row),
  ]);
}

function rowEvidenceCoverage(row: DarwinGodelMachineLiveDriftRow, phase: "baseline" | "live"): number {
  const phaseProof = phase === "baseline"
    ? [nonEmpty(row.baselineResultHash)]
    : [nonEmpty(row.liveResultHash), nonEmpty(row.driftStatisticHash), nonEmpty(row.alertReceiptHash)];
  const checks = [
    nonEmpty(row.dgmRunId),
    nonEmpty(row.sourceRefHash),
    nonEmpty(row.repositorySnapshotHash),
    nonEmpty(row.noLicenseBoundaryHash),
    nonEmpty(row.readmeBlobHash),
    nonEmpty(row.securityPolicyHash),
    nonEmpty(row.ciWorkflowHash),
    nonEmpty(row.controllerHash),
    nonEmpty(row.archiveHash),
    nonEmpty(row.selfModificationHash),
    nonEmpty(row.evaluationHarnessHash),
    nonEmpty(row.scorerHash),
    nonEmpty(row.sandboxDockerfileHash),
    nonEmpty(row.sandboxManagerHash),
    nonEmpty(row.liveRunConfigHash),
    nonEmpty(row.liveProofConfigHash),
    nonEmpty(row.modelMatrixConfigHash),
    nonEmpty(row.benchmarkManifestHash),
    nonEmpty(row.scoreMovementManifestHash),
    nonEmpty(row.livePlanVerifierHash),
    nonEmpty(row.sandboxVerifierHash),
    nonEmpty(row.archiveScoreSummarizerHash),
    nonEmpty(row.fullProcessSandboxRunnerHash),
    Number.isFinite(row.generation) && row.generation > 0,
    nonEmpty(row.parentAgentHash),
    nonEmpty(row.candidateAgentHash),
    nonEmpty(row.lineageGraphHash),
    nonEmpty(row.providerRouteHash),
    nonEmpty(row.modelId),
    row.sandboxMode !== "none",
    row.benchmarkFamily !== "custom",
    Number.isFinite(row.parentScore0to1),
    Number.isFinite(row.candidateScore0to1),
    Number.isFinite(row.passRate0to1),
    typeof row.mutationAccepted === "boolean",
    Number.isFinite(row.regressionFailureRate0to1),
    Number.isFinite(row.latencyMs),
    Number.isFinite(row.costUsd),
    Number.isFinite(row.agentStepCount),
    hasNonBlankEvidenceRef(row.evidenceRefs),
    hasNonBlankEvidenceRef(row.signedEvidenceRefs),
    ...phaseProof,
  ];
  return round(checks.filter(Boolean).length / checks.length);
}

function contextLabel(row: DarwinGodelMachineLiveDriftRow): string {
  return [
    row.repositorySnapshotHash || "unknown-repo",
    row.controllerHash || "unknown-controller",
    row.archiveHash || "unknown-archive",
    row.selfModificationHash || "unknown-self-mod",
    row.evaluationHarnessHash || "unknown-eval",
    row.scorerHash || "unknown-scorer",
    row.liveRunConfigHash || "unknown-live-config",
    row.benchmarkManifestHash || "unknown-benchmark",
    row.scoreMovementManifestHash || "unknown-score-movement",
    row.providerRouteHash || "unknown-provider-route",
    row.modelId || "unknown-model",
    row.sandboxMode,
    row.benchmarkFamily,
  ].join("/");
}

function toReceiptRow(
  row: DarwinGodelMachineLiveDriftRow,
  phase: "baseline" | "live",
): DarwinGodelMachineReceiptRow {
  const movement = scoreMovement(row);
  const receiptScore0to1 = rowScore(row);
  const lineageCoverage0to1 = lineageCoverage(row);
  const sandboxCoverage0to1 = sandboxCoverage(row);
  const evidenceCoverage0to1 = rowEvidenceCoverage(row, phase);
  const withoutHash = {
    ...row,
    generation: Number.isFinite(row.generation) ? row.generation : 0,
    parentScore0to1: clamp01(row.parentScore0to1),
    candidateScore0to1: clamp01(row.candidateScore0to1),
    passRate0to1: clamp01(row.passRate0to1),
    regressionFailureRate0to1: clamp01(row.regressionFailureRate0to1),
    latencyMs: Number.isFinite(row.latencyMs) ? row.latencyMs : 0,
    costUsd: Number.isFinite(row.costUsd) ? row.costUsd : 0,
    agentStepCount: Number.isFinite(row.agentStepCount) ? row.agentStepCount : 0,
    scoreMovement0to1: movement,
    receiptScore0to1,
    lineageCoverage0to1,
    sandboxCoverage0to1,
    evidenceCoverage0to1,
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash)),
  };
}

function toLiveDriftRow(row: DarwinGodelMachineLiveDriftRow): LiveDriftSampleRow {
  const score0to1 = rowScore(row);
  return {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    timestamp: row.timestamp,
    score0to1,
    passed: row.candidateScore0to1 >= row.parentScore0to1
      && row.passRate0to1 >= 0.8
      && row.mutationAccepted
      && row.regressionFailureRate0to1 <= 0.05,
    refused: false,
    errored: row.regressionFailureRate0to1 > 0.1 || lineageCoverage(row) < 1 || sandboxCoverage(row) < 1,
    behaviorSignature: `dgm:${row.benchmarkFamily}:${row.sandboxMode}:${row.providerRouteHash}:${row.modelId}:gen-${row.generation}:${row.mutationAccepted ? "accepted" : "rejected"}`,
    lifecycleStage: "deployment_maintenance",
    taskCategory: "darwin godel machine self-improvement",
    domain: "agent evaluation",
    agentEvaluationDimension: "evaluation_frameworks",
    latencyMs: row.latencyMs,
    toolCallCount: row.agentStepCount,
    costUsd: row.costUsd,
    evidenceRefs: row.evidenceRefs,
    signedEvidenceRefs: row.signedEvidenceRefs,
  };
}

function toLiveDriftWindow(window: DarwinGodelMachineWindow): LiveDriftWindow {
  return {
    windowId: window.windowId,
    startedAt: window.startedAt,
    endedAt: window.endedAt,
    rows: window.rows.map(toLiveDriftRow),
  };
}

function distribution(rows: DarwinGodelMachineReceiptRow[]): DarwinGodelMachineDistribution {
  return {
    rowCount: rows.length,
    receiptScoreMean0to1: mean(rows.map((row) => row.receiptScore0to1)),
    parentScoreMean0to1: mean(rows.map((row) => row.parentScore0to1)),
    candidateScoreMean0to1: mean(rows.map((row) => row.candidateScore0to1)),
    scoreMovementMean0to1: mean(rows.map((row) => row.scoreMovement0to1)),
    passRateMean0to1: mean(rows.map((row) => row.passRate0to1)),
    mutationAcceptanceRate0to1: boolMean(rows.map((row) => row.mutationAccepted)),
    regressionFailureRate0to1: mean(rows.map((row) => row.regressionFailureRate0to1)),
    lineageCoverage0to1: mean(rows.map((row) => row.lineageCoverage0to1), rows.length === 0 ? 1 : 0),
    sandboxCoverage0to1: mean(rows.map((row) => row.sandboxCoverage0to1), rows.length === 0 ? 1 : 0),
    evidenceCoverage0to1: mean(rows.map((row) => row.evidenceCoverage0to1), rows.length === 0 ? 1 : 0),
    agentStepCountMean: mean(rows.map((row) => row.agentStepCount)),
    latencyP95Ms: percentile(rows.map((row) => row.latencyMs), 95),
    costUsdMean: mean(rows.map((row) => row.costUsd)),
    generationDistribution: labelDistribution(rows, (row) => `gen-${row.generation}`),
    providerRouteDistribution: labelDistribution(rows, (row) => row.providerRouteHash || "unknown"),
    modelDistribution: labelDistribution(rows, (row) => row.modelId || "unknown"),
    benchmarkFamilyDistribution: labelDistribution(rows, (row) => row.benchmarkFamily || "unknown"),
    sandboxModeDistribution: labelDistribution(rows, (row) => row.sandboxMode || "unknown"),
    contextDistribution: labelDistribution(rows, contextLabel),
  };
}

function buildAlert(
  input: RunDarwinGodelMachineLiveDriftInput,
  metricId: LiveDriftMetricId,
  observed: number,
  threshold: number,
  message: string,
  severity: LiveDriftSeverity,
): LiveDriftAlert {
  const evidenceRefs = unique([
    ...(input.sourceRefs ?? []),
    DEFAULT_SOURCE_REF,
    ...input.baselineWindow.rows.flatMap((row) => normalizeEvidenceRefs(row.evidenceRefs)),
    ...input.liveWindow.rows.flatMap((row) => normalizeEvidenceRefs(row.evidenceRefs)),
  ]);
  const signedEvidenceRefs = unique([
    ...input.baselineWindow.rows.flatMap((row) => normalizeEvidenceRefs(row.signedEvidenceRefs)),
    ...input.liveWindow.rows.flatMap((row) => normalizeEvidenceRefs(row.signedEvidenceRefs)),
  ]);
  return {
    alertId: `dgm:${metricId}:${sha256Hex(canonicalize({ metricId, observed, threshold, message })).slice(0, 12)}`,
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

export function runDarwinGodelMachineLiveDrift(
  input: RunDarwinGodelMachineLiveDriftInput,
): DarwinGodelMachineLiveDriftResult {
  const thresholds = {
    ...defaultDarwinGodelMachineLiveDriftThresholds,
    ...(input.thresholds ?? {}),
  };
  const baselineRows = input.baselineWindow.rows.map((row) => toReceiptRow(row, "baseline"));
  const liveRows = input.liveWindow.rows.map((row) => toReceiptRow(row, "live"));
  const baselineDistribution = distribution(baselineRows);
  const liveDistribution = distribution(liveRows);
  const scoreDrift: DarwinGodelMachineScoreDrift = {
    candidateScoreDrop0to1: round(Math.max(0, baselineDistribution.candidateScoreMean0to1 - liveDistribution.candidateScoreMean0to1)),
    scoreMovementDrop0to1: round(Math.max(0, baselineDistribution.scoreMovementMean0to1 - liveDistribution.scoreMovementMean0to1)),
    passRateDrop0to1: round(Math.max(0, baselineDistribution.passRateMean0to1 - liveDistribution.passRateMean0to1)),
    mutationAcceptanceDrop0to1: round(Math.max(0, baselineDistribution.mutationAcceptanceRate0to1 - liveDistribution.mutationAcceptanceRate0to1)),
    regressionFailureRateIncrease0to1: round(Math.max(0, liveDistribution.regressionFailureRate0to1 - baselineDistribution.regressionFailureRate0to1)),
    lineageCoverageDrop0to1: round(Math.max(0, baselineDistribution.lineageCoverage0to1 - liveDistribution.lineageCoverage0to1)),
    sandboxCoverageDrop0to1: round(Math.max(0, baselineDistribution.sandboxCoverage0to1 - liveDistribution.sandboxCoverage0to1)),
    evidenceCoverageDrop0to1: round(Math.max(0, baselineDistribution.evidenceCoverage0to1 - liveDistribution.evidenceCoverage0to1)),
    latencyP95IncreaseRatio: ratioIncrease(baselineDistribution.latencyP95Ms, liveDistribution.latencyP95Ms),
    costIncreaseRatio: ratioIncrease(baselineDistribution.costUsdMean, liveDistribution.costUsdMean),
  };
  const behaviorDrift: DarwinGodelMachineBehaviorDrift = {
    generationDivergence0to1: totalVariationDistance(baselineDistribution.generationDistribution, liveDistribution.generationDistribution),
    providerRouteDivergence0to1: totalVariationDistance(baselineDistribution.providerRouteDistribution, liveDistribution.providerRouteDistribution),
    modelDivergence0to1: totalVariationDistance(baselineDistribution.modelDistribution, liveDistribution.modelDistribution),
    benchmarkFamilyDivergence0to1: totalVariationDistance(baselineDistribution.benchmarkFamilyDistribution, liveDistribution.benchmarkFamilyDistribution),
    sandboxModeDivergence0to1: totalVariationDistance(baselineDistribution.sandboxModeDistribution, liveDistribution.sandboxModeDistribution),
    contextDivergence0to1: totalVariationDistance(baselineDistribution.contextDistribution, liveDistribution.contextDistribution),
  };
  const additionalAlerts: LiveDriftAlert[] = [];
  if (scoreDrift.candidateScoreDrop0to1 > thresholds.maxCandidateScoreDrop0to1) {
    additionalAlerts.push(buildAlert(input, "darwinGodelCandidateScoreMean0to1", scoreDrift.candidateScoreDrop0to1, thresholds.maxCandidateScoreDrop0to1, "Live Darwin Godel Machine candidate score dropped beyond threshold.", "high"));
  }
  if (scoreDrift.scoreMovementDrop0to1 > thresholds.maxScoreMovementDrop0to1) {
    additionalAlerts.push(buildAlert(input, "darwinGodelScoreMovementMean0to1", scoreDrift.scoreMovementDrop0to1, thresholds.maxScoreMovementDrop0to1, "Live Darwin Godel Machine score movement dropped beyond threshold.", "critical"));
  }
  if (scoreDrift.passRateDrop0to1 > thresholds.maxPassRateDrop0to1) {
    additionalAlerts.push(buildAlert(input, "darwinGodelPassRate0to1", scoreDrift.passRateDrop0to1, thresholds.maxPassRateDrop0to1, "Live Darwin Godel Machine benchmark pass rate dropped beyond threshold.", "high"));
  }
  if (scoreDrift.mutationAcceptanceDrop0to1 > thresholds.maxMutationAcceptanceDrop0to1) {
    additionalAlerts.push(buildAlert(input, "darwinGodelMutationAcceptanceRate0to1", scoreDrift.mutationAcceptanceDrop0to1, thresholds.maxMutationAcceptanceDrop0to1, "Live Darwin Godel Machine mutation acceptance dropped beyond threshold.", "high"));
  }
  if (scoreDrift.regressionFailureRateIncrease0to1 > thresholds.maxRegressionFailureRateIncrease0to1) {
    additionalAlerts.push(buildAlert(input, "darwinGodelRegressionFailureRate0to1", scoreDrift.regressionFailureRateIncrease0to1, thresholds.maxRegressionFailureRateIncrease0to1, "Live Darwin Godel Machine regression failure rate increased beyond threshold.", "critical"));
  }
  if (liveDistribution.lineageCoverage0to1 < thresholds.minLineageCoverage0to1) {
    additionalAlerts.push(buildAlert(input, "darwinGodelLineageCoverage0to1", liveDistribution.lineageCoverage0to1, thresholds.minLineageCoverage0to1, "Live Darwin Godel Machine rows are missing parent, candidate, or lineage graph proof.", "critical"));
  }
  if (liveDistribution.sandboxCoverage0to1 < thresholds.minSandboxCoverage0to1) {
    additionalAlerts.push(buildAlert(input, "darwinGodelSandboxCoverage0to1", liveDistribution.sandboxCoverage0to1, thresholds.minSandboxCoverage0to1, "Live Darwin Godel Machine rows are missing Docker, sandbox manager, live-plan verifier, sandbox verifier, full-process runner, or sandbox mode proof.", "critical"));
  }
  if (liveDistribution.evidenceCoverage0to1 < thresholds.minEvidenceCoverage0to1) {
    additionalAlerts.push(buildAlert(input, "darwinGodelEvidenceCoverage0to1", liveDistribution.evidenceCoverage0to1, thresholds.minEvidenceCoverage0to1, "Live Darwin Godel Machine rows are missing source snapshot, no-license boundary, README, security, CI, controller, archive, self-modification, evaluation, sandbox, benchmark, baseline/live result, drift statistic, alert receipt, evidence, or signed evidence proof.", "critical"));
  }
  if (behaviorDrift.generationDivergence0to1 > thresholds.maxGenerationDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "darwinGodelGenerationDistribution", behaviorDrift.generationDivergence0to1, thresholds.maxGenerationDivergence0to1, "Live Darwin Godel Machine generation distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.providerRouteDivergence0to1 > thresholds.maxProviderRouteDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "darwinGodelProviderRouteDistribution", behaviorDrift.providerRouteDivergence0to1, thresholds.maxProviderRouteDivergence0to1, "Live Darwin Godel Machine provider route distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.modelDivergence0to1 > thresholds.maxModelDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "darwinGodelModelDistribution", behaviorDrift.modelDivergence0to1, thresholds.maxModelDivergence0to1, "Live Darwin Godel Machine model distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.benchmarkFamilyDivergence0to1 > thresholds.maxBenchmarkFamilyDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "darwinGodelBenchmarkFamilyDistribution", behaviorDrift.benchmarkFamilyDivergence0to1, thresholds.maxBenchmarkFamilyDivergence0to1, "Live Darwin Godel Machine benchmark family distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.sandboxModeDivergence0to1 > thresholds.maxSandboxModeDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "darwinGodelSandboxModeDistribution", behaviorDrift.sandboxModeDivergence0to1, thresholds.maxSandboxModeDivergence0to1, "Live Darwin Godel Machine sandbox mode distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.contextDivergence0to1 > thresholds.maxContextDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "darwinGodelContextDistribution", behaviorDrift.contextDivergence0to1, thresholds.maxContextDivergence0to1, "Live Darwin Godel Machine source, controller, archive, self-modification, evaluation, sandbox, benchmark, provider, model, or score-movement context diverged beyond threshold.", "medium"));
  }
  if (scoreDrift.latencyP95IncreaseRatio > thresholds.maxLatencyP95IncreaseRatio) {
    additionalAlerts.push(buildAlert(input, "darwinGodelLatencyP95Ms", scoreDrift.latencyP95IncreaseRatio, thresholds.maxLatencyP95IncreaseRatio, "Live Darwin Godel Machine p95 latency increased beyond threshold.", "medium"));
  }
  if (scoreDrift.costIncreaseRatio > thresholds.maxCostIncreaseRatio) {
    additionalAlerts.push(buildAlert(input, "darwinGodelCostUsdMean", scoreDrift.costIncreaseRatio, thresholds.maxCostIncreaseRatio, "Live Darwin Godel Machine mean cost increased beyond threshold.", "medium"));
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
  const darwinGodelMachineReceiptHash = sha256Hex(canonicalize({
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
    darwinGodelMachineReceiptHash,
    baselineRows,
    liveRows,
    baselineDistribution,
    liveDistribution,
    scoreDrift,
    behaviorDrift,
  };
}
