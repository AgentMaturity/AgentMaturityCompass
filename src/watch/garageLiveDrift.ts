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

export type GarageQuestionType =
  | "slow_changing"
  | "fast_changing"
  | "non_time_sensitive"
  | "custom"
  | "unknown";

export type GarageQuestionComplexity =
  | "simple"
  | "simple_condition"
  | "set"
  | "comparison"
  | "aggregation"
  | "multi_hop"
  | "post_processing_heavy"
  | "custom"
  | "unknown";

export type GarageQuestionSource = "web" | "enterprise" | "mixed" | "custom" | "unknown";

export interface GarageLiveDriftRow {
  traceId: string;
  scenarioId: string;
  timestamp: string;
  evalPackId: string;
  sourceRefHash: string;
  repositorySnapshotHash: string;
  licenseRefHash: string;
  readmeBlobHash: string;
  benchmarkDatasetHash: string;
  datasetManifestHash: string;
  paperRefHash: string;
  groundingAnnotationSchemaHash: string;
  retrievalCorpusSnapshotHash: string;
  promptTemplateHash: string;
  evaluatorConfigHash: string;
  baselineResultHash?: string;
  liveResultHash?: string;
  driftStatisticHash?: string;
  alertReceiptHash?: string;
  sampleId: string;
  questionType: GarageQuestionType;
  questionComplexity: GarageQuestionComplexity;
  questionCategory: string;
  questionSource: GarageQuestionSource;
  topicSource: GarageQuestionSource;
  groundingPassageCount: number;
  relevantPassageCount: number;
  citedPassageCount: number;
  answerValidated: boolean;
  groundingPrecision0to1: number;
  groundingRecall0to1: number;
  citationSupport0to1: number;
  deflectionAccuracy0to1: number;
  answerFaithfulness0to1: number;
  latencyMs: number;
  costUsd: number;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface GarageWindow {
  windowId: string;
  startedAt: string;
  endedAt: string;
  rows: GarageLiveDriftRow[];
}

export interface GarageLiveDriftThresholds {
  maxGroundingPrecisionDrop0to1: number;
  maxGroundingRecallDrop0to1: number;
  maxCitationSupportDrop0to1: number;
  maxDeflectionAccuracyDrop0to1: number;
  maxAnswerFaithfulnessDrop0to1: number;
  minValidationCoverage0to1: number;
  minEvidenceCoverage0to1: number;
  maxQuestionTypeDivergence0to1: number;
  maxComplexityDivergence0to1: number;
  maxCategoryDivergence0to1: number;
  maxSourceDivergence0to1: number;
  maxContextDivergence0to1: number;
  maxLatencyP95IncreaseRatio: number;
  maxCostIncreaseRatio: number;
}

export interface RunGarageLiveDriftInput {
  agentId: string;
  baselineWindow: GarageWindow;
  liveWindow: GarageWindow;
  thresholds?: Partial<GarageLiveDriftThresholds>;
  liveDriftThresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}

export interface GarageDistribution {
  rowCount: number;
  receiptScoreMean0to1: number;
  groundingPrecisionMean0to1: number;
  groundingRecallMean0to1: number;
  citationSupportMean0to1: number;
  deflectionAccuracyMean0to1: number;
  answerFaithfulnessMean0to1: number;
  validationCoverage0to1: number;
  evidenceCoverage0to1: number;
  groundingPassageCountMean: number;
  relevantPassageCountMean: number;
  citedPassageCountMean: number;
  latencyP95Ms: number;
  costUsdMean: number;
  questionTypeDistribution: Record<string, number>;
  complexityDistribution: Record<string, number>;
  categoryDistribution: Record<string, number>;
  sourceDistribution: Record<string, number>;
  contextDistribution: Record<string, number>;
}

export interface GarageScoreDrift {
  groundingPrecisionDrop0to1: number;
  groundingRecallDrop0to1: number;
  citationSupportDrop0to1: number;
  deflectionAccuracyDrop0to1: number;
  answerFaithfulnessDrop0to1: number;
  validationCoverageDrop0to1: number;
  evidenceCoverageDrop0to1: number;
  latencyP95IncreaseRatio: number;
  costIncreaseRatio: number;
}

export interface GarageBehaviorDrift {
  questionTypeDivergence0to1: number;
  complexityDivergence0to1: number;
  categoryDivergence0to1: number;
  sourceDivergence0to1: number;
  contextDivergence0to1: number;
}

export interface GarageReceiptRow extends GarageLiveDriftRow {
  receiptScore0to1: number;
  evidenceCoverage0to1: number;
  rowHash: string;
}

export interface GarageLiveDriftResult {
  receipt: LiveDriftReceipt;
  garageReceiptHash: string;
  baselineRows: GarageReceiptRow[];
  liveRows: GarageReceiptRow[];
  baselineDistribution: GarageDistribution;
  liveDistribution: GarageDistribution;
  scoreDrift: GarageScoreDrift;
  behaviorDrift: GarageBehaviorDrift;
}

const DEFAULT_SOURCE_REF = "https://github.com/amazon-science/GaRAGe";
const DEFAULT_PAPER_REF = "https://arxiv.org/abs/2506.07671";

export const defaultGarageLiveDriftThresholds: GarageLiveDriftThresholds = {
  maxGroundingPrecisionDrop0to1: 0.08,
  maxGroundingRecallDrop0to1: 0.08,
  maxCitationSupportDrop0to1: 0.08,
  maxDeflectionAccuracyDrop0to1: 0.08,
  maxAnswerFaithfulnessDrop0to1: 0.08,
  minValidationCoverage0to1: 0.95,
  minEvidenceCoverage0to1: 1,
  maxQuestionTypeDivergence0to1: 0.35,
  maxComplexityDivergence0to1: 0.35,
  maxCategoryDivergence0to1: 0.35,
  maxSourceDivergence0to1: 0.35,
  maxContextDivergence0to1: 0.35,
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

function rowScore(row: GarageLiveDriftRow): number {
  return mean([
    clamp01(row.groundingPrecision0to1),
    clamp01(row.groundingRecall0to1),
    clamp01(row.citationSupport0to1),
    clamp01(row.deflectionAccuracy0to1),
    clamp01(row.answerFaithfulness0to1),
    row.answerValidated ? 1 : 0,
  ]);
}

function rowEvidenceCoverage(row: GarageLiveDriftRow, phase: "baseline" | "live"): number {
  const phaseProof = phase === "baseline"
    ? [nonEmpty(row.baselineResultHash)]
    : [nonEmpty(row.liveResultHash), nonEmpty(row.driftStatisticHash), nonEmpty(row.alertReceiptHash)];
  const checks = [
    nonEmpty(row.evalPackId),
    nonEmpty(row.sourceRefHash),
    nonEmpty(row.repositorySnapshotHash),
    nonEmpty(row.licenseRefHash),
    nonEmpty(row.readmeBlobHash),
    nonEmpty(row.benchmarkDatasetHash),
    nonEmpty(row.datasetManifestHash),
    nonEmpty(row.paperRefHash),
    nonEmpty(row.groundingAnnotationSchemaHash),
    nonEmpty(row.retrievalCorpusSnapshotHash),
    nonEmpty(row.promptTemplateHash),
    nonEmpty(row.evaluatorConfigHash),
    nonEmpty(row.sampleId),
    row.questionType !== "custom" && row.questionType !== "unknown",
    row.questionComplexity !== "custom" && row.questionComplexity !== "unknown",
    nonEmpty(row.questionCategory),
    row.questionSource !== "custom" && row.questionSource !== "unknown",
    row.topicSource !== "custom" && row.topicSource !== "unknown",
    Number.isFinite(row.groundingPassageCount) && row.groundingPassageCount > 0,
    Number.isFinite(row.relevantPassageCount) && row.relevantPassageCount >= 0,
    Number.isFinite(row.citedPassageCount) && row.citedPassageCount >= 0,
    typeof row.answerValidated === "boolean",
    Number.isFinite(row.groundingPrecision0to1),
    Number.isFinite(row.groundingRecall0to1),
    Number.isFinite(row.citationSupport0to1),
    Number.isFinite(row.deflectionAccuracy0to1),
    Number.isFinite(row.answerFaithfulness0to1),
    Number.isFinite(row.latencyMs),
    Number.isFinite(row.costUsd),
    hasNonBlankEvidenceRef(row.evidenceRefs),
    hasNonBlankEvidenceRef(row.signedEvidenceRefs),
    ...phaseProof,
  ];
  return round(checks.filter(Boolean).length / checks.length);
}

function contextLabel(row: GarageLiveDriftRow): string {
  return [
    row.repositorySnapshotHash || "unknown-repo",
    row.licenseRefHash || "unknown-license",
    row.benchmarkDatasetHash || "unknown-dataset",
    row.datasetManifestHash || "unknown-manifest",
    row.groundingAnnotationSchemaHash || "unknown-schema",
    row.retrievalCorpusSnapshotHash || "unknown-corpus",
    row.promptTemplateHash || "unknown-prompt",
    row.evaluatorConfigHash || "unknown-evaluator",
    row.questionType,
    row.questionComplexity,
    row.questionCategory || "unknown-category",
    row.questionSource,
    row.topicSource,
  ].join("/");
}

function sourceLabel(row: GarageLiveDriftRow): string {
  return `${row.questionSource}/${row.topicSource}`;
}

function toReceiptRow(row: GarageLiveDriftRow, phase: "baseline" | "live"): GarageReceiptRow {
  const receiptScore0to1 = rowScore(row);
  const evidenceCoverage0to1 = rowEvidenceCoverage(row, phase);
  const withoutHash = {
    ...row,
    groundingPassageCount: Number.isFinite(row.groundingPassageCount) ? row.groundingPassageCount : 0,
    relevantPassageCount: Number.isFinite(row.relevantPassageCount) ? row.relevantPassageCount : 0,
    citedPassageCount: Number.isFinite(row.citedPassageCount) ? row.citedPassageCount : 0,
    groundingPrecision0to1: clamp01(row.groundingPrecision0to1),
    groundingRecall0to1: clamp01(row.groundingRecall0to1),
    citationSupport0to1: clamp01(row.citationSupport0to1),
    deflectionAccuracy0to1: clamp01(row.deflectionAccuracy0to1),
    answerFaithfulness0to1: clamp01(row.answerFaithfulness0to1),
    latencyMs: Number.isFinite(row.latencyMs) ? row.latencyMs : 0,
    costUsd: Number.isFinite(row.costUsd) ? row.costUsd : 0,
    receiptScore0to1,
    evidenceCoverage0to1,
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash)),
  };
}

function toLiveDriftRow(row: GarageLiveDriftRow): LiveDriftSampleRow {
  const score0to1 = rowScore(row);
  return {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    timestamp: row.timestamp,
    score0to1,
    passed: score0to1 >= 0.8
      && row.answerValidated
      && row.groundingPrecision0to1 >= 0.75
      && row.groundingRecall0to1 >= 0.75
      && row.citationSupport0to1 >= 0.75,
    refused: row.deflectionAccuracy0to1 >= 0.9 && row.answerFaithfulness0to1 < 0.6,
    errored: row.groundingPassageCount <= 0 || row.relevantPassageCount > row.groundingPassageCount,
    behaviorSignature: `garage:${row.questionType}:${row.questionComplexity}:${row.questionCategory}:${sourceLabel(row)}:${row.evaluatorConfigHash}`,
    lifecycleStage: "deployment_maintenance",
    taskCategory: "garage rag grounding live drift",
    domain: "agent evaluation",
    agentEvaluationDimension: "evaluation_frameworks",
    latencyMs: row.latencyMs,
    toolCallCount: row.groundingPassageCount,
    costUsd: row.costUsd,
    evidenceRefs: row.evidenceRefs,
    signedEvidenceRefs: row.signedEvidenceRefs,
  };
}

function toLiveDriftWindow(window: GarageWindow): LiveDriftWindow {
  return {
    windowId: window.windowId,
    startedAt: window.startedAt,
    endedAt: window.endedAt,
    rows: window.rows.map(toLiveDriftRow),
  };
}

function distribution(rows: GarageReceiptRow[]): GarageDistribution {
  return {
    rowCount: rows.length,
    receiptScoreMean0to1: mean(rows.map((row) => row.receiptScore0to1)),
    groundingPrecisionMean0to1: mean(rows.map((row) => row.groundingPrecision0to1)),
    groundingRecallMean0to1: mean(rows.map((row) => row.groundingRecall0to1)),
    citationSupportMean0to1: mean(rows.map((row) => row.citationSupport0to1)),
    deflectionAccuracyMean0to1: mean(rows.map((row) => row.deflectionAccuracy0to1)),
    answerFaithfulnessMean0to1: mean(rows.map((row) => row.answerFaithfulness0to1)),
    validationCoverage0to1: boolMean(rows.map((row) => row.answerValidated)),
    evidenceCoverage0to1: mean(rows.map((row) => row.evidenceCoverage0to1), rows.length === 0 ? 1 : 0),
    groundingPassageCountMean: mean(rows.map((row) => row.groundingPassageCount)),
    relevantPassageCountMean: mean(rows.map((row) => row.relevantPassageCount)),
    citedPassageCountMean: mean(rows.map((row) => row.citedPassageCount)),
    latencyP95Ms: percentile(rows.map((row) => row.latencyMs), 95),
    costUsdMean: mean(rows.map((row) => row.costUsd)),
    questionTypeDistribution: labelDistribution(rows, (row) => row.questionType),
    complexityDistribution: labelDistribution(rows, (row) => row.questionComplexity),
    categoryDistribution: labelDistribution(rows, (row) => row.questionCategory || "unknown"),
    sourceDistribution: labelDistribution(rows, sourceLabel),
    contextDistribution: labelDistribution(rows, contextLabel),
  };
}

function buildAlert(
  input: RunGarageLiveDriftInput,
  metricId: LiveDriftMetricId,
  observed: number,
  threshold: number,
  message: string,
  severity: LiveDriftSeverity,
): LiveDriftAlert {
  const evidenceRefs = unique([
    ...(input.sourceRefs ?? []),
    DEFAULT_SOURCE_REF,
    DEFAULT_PAPER_REF,
    ...input.baselineWindow.rows.flatMap((row) => normalizeEvidenceRefs(row.evidenceRefs)),
    ...input.liveWindow.rows.flatMap((row) => normalizeEvidenceRefs(row.evidenceRefs)),
  ]);
  const signedEvidenceRefs = unique([
    ...input.baselineWindow.rows.flatMap((row) => normalizeEvidenceRefs(row.signedEvidenceRefs)),
    ...input.liveWindow.rows.flatMap((row) => normalizeEvidenceRefs(row.signedEvidenceRefs)),
  ]);
  return {
    alertId: `garage:${metricId}:${sha256Hex(canonicalize({ metricId, observed, threshold, message })).slice(0, 12)}`,
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

export function runGarageLiveDrift(input: RunGarageLiveDriftInput): GarageLiveDriftResult {
  const thresholds = {
    ...defaultGarageLiveDriftThresholds,
    ...(input.thresholds ?? {}),
  };
  const baselineRows = input.baselineWindow.rows.map((row) => toReceiptRow(row, "baseline"));
  const liveRows = input.liveWindow.rows.map((row) => toReceiptRow(row, "live"));
  const baselineDistribution = distribution(baselineRows);
  const liveDistribution = distribution(liveRows);
  const scoreDrift: GarageScoreDrift = {
    groundingPrecisionDrop0to1: round(Math.max(0, baselineDistribution.groundingPrecisionMean0to1 - liveDistribution.groundingPrecisionMean0to1)),
    groundingRecallDrop0to1: round(Math.max(0, baselineDistribution.groundingRecallMean0to1 - liveDistribution.groundingRecallMean0to1)),
    citationSupportDrop0to1: round(Math.max(0, baselineDistribution.citationSupportMean0to1 - liveDistribution.citationSupportMean0to1)),
    deflectionAccuracyDrop0to1: round(Math.max(0, baselineDistribution.deflectionAccuracyMean0to1 - liveDistribution.deflectionAccuracyMean0to1)),
    answerFaithfulnessDrop0to1: round(Math.max(0, baselineDistribution.answerFaithfulnessMean0to1 - liveDistribution.answerFaithfulnessMean0to1)),
    validationCoverageDrop0to1: round(Math.max(0, baselineDistribution.validationCoverage0to1 - liveDistribution.validationCoverage0to1)),
    evidenceCoverageDrop0to1: round(Math.max(0, baselineDistribution.evidenceCoverage0to1 - liveDistribution.evidenceCoverage0to1)),
    latencyP95IncreaseRatio: ratioIncrease(baselineDistribution.latencyP95Ms, liveDistribution.latencyP95Ms),
    costIncreaseRatio: ratioIncrease(baselineDistribution.costUsdMean, liveDistribution.costUsdMean),
  };
  const behaviorDrift: GarageBehaviorDrift = {
    questionTypeDivergence0to1: totalVariationDistance(baselineDistribution.questionTypeDistribution, liveDistribution.questionTypeDistribution),
    complexityDivergence0to1: totalVariationDistance(baselineDistribution.complexityDistribution, liveDistribution.complexityDistribution),
    categoryDivergence0to1: totalVariationDistance(baselineDistribution.categoryDistribution, liveDistribution.categoryDistribution),
    sourceDivergence0to1: totalVariationDistance(baselineDistribution.sourceDistribution, liveDistribution.sourceDistribution),
    contextDivergence0to1: totalVariationDistance(baselineDistribution.contextDistribution, liveDistribution.contextDistribution),
  };
  const additionalAlerts: LiveDriftAlert[] = [];
  if (scoreDrift.groundingPrecisionDrop0to1 > thresholds.maxGroundingPrecisionDrop0to1) {
    additionalAlerts.push(buildAlert(input, "garageGroundingPrecisionMean0to1", scoreDrift.groundingPrecisionDrop0to1, thresholds.maxGroundingPrecisionDrop0to1, "Live GaRAGe grounding precision dropped beyond threshold.", "critical"));
  }
  if (scoreDrift.groundingRecallDrop0to1 > thresholds.maxGroundingRecallDrop0to1) {
    additionalAlerts.push(buildAlert(input, "garageGroundingRecallMean0to1", scoreDrift.groundingRecallDrop0to1, thresholds.maxGroundingRecallDrop0to1, "Live GaRAGe grounding recall dropped beyond threshold.", "critical"));
  }
  if (scoreDrift.citationSupportDrop0to1 > thresholds.maxCitationSupportDrop0to1) {
    additionalAlerts.push(buildAlert(input, "garageCitationSupportMean0to1", scoreDrift.citationSupportDrop0to1, thresholds.maxCitationSupportDrop0to1, "Live GaRAGe citation support dropped beyond threshold.", "high"));
  }
  if (scoreDrift.deflectionAccuracyDrop0to1 > thresholds.maxDeflectionAccuracyDrop0to1) {
    additionalAlerts.push(buildAlert(input, "garageDeflectionAccuracyMean0to1", scoreDrift.deflectionAccuracyDrop0to1, thresholds.maxDeflectionAccuracyDrop0to1, "Live GaRAGe insufficient-information deflection accuracy dropped beyond threshold.", "high"));
  }
  if (scoreDrift.answerFaithfulnessDrop0to1 > thresholds.maxAnswerFaithfulnessDrop0to1) {
    additionalAlerts.push(buildAlert(input, "garageAnswerFaithfulnessMean0to1", scoreDrift.answerFaithfulnessDrop0to1, thresholds.maxAnswerFaithfulnessDrop0to1, "Live GaRAGe answer faithfulness dropped beyond threshold.", "critical"));
  }
  if (liveDistribution.validationCoverage0to1 < thresholds.minValidationCoverage0to1) {
    additionalAlerts.push(buildAlert(input, "garageValidationCoverage0to1", liveDistribution.validationCoverage0to1, thresholds.minValidationCoverage0to1, "Live GaRAGe rows are missing answer-validation coverage.", "high"));
  }
  if (liveDistribution.evidenceCoverage0to1 < thresholds.minEvidenceCoverage0to1) {
    additionalAlerts.push(buildAlert(input, "garageEvidenceCoverage0to1", liveDistribution.evidenceCoverage0to1, thresholds.minEvidenceCoverage0to1, "Live GaRAGe rows are missing source, license, README, benchmark dataset, manifest, paper, grounding annotation schema, retrieval corpus, prompt, evaluator, baseline/live result, drift statistic, alert receipt, evidence, signed evidence, or row-hash proof.", "critical"));
  }
  if (behaviorDrift.questionTypeDivergence0to1 > thresholds.maxQuestionTypeDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "garageQuestionTypeDistribution", behaviorDrift.questionTypeDivergence0to1, thresholds.maxQuestionTypeDivergence0to1, "Live GaRAGe question-type distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.complexityDivergence0to1 > thresholds.maxComplexityDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "garageComplexityDistribution", behaviorDrift.complexityDivergence0to1, thresholds.maxComplexityDivergence0to1, "Live GaRAGe question-complexity distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.categoryDivergence0to1 > thresholds.maxCategoryDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "garageCategoryDistribution", behaviorDrift.categoryDivergence0to1, thresholds.maxCategoryDivergence0to1, "Live GaRAGe question-category distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.sourceDivergence0to1 > thresholds.maxSourceDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "garageSourceDistribution", behaviorDrift.sourceDivergence0to1, thresholds.maxSourceDivergence0to1, "Live GaRAGe web/enterprise source distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.contextDivergence0to1 > thresholds.maxContextDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "garageContextDistribution", behaviorDrift.contextDivergence0to1, thresholds.maxContextDivergence0to1, "Live GaRAGe source, dataset, annotation, corpus, prompt, evaluator, question, or source context diverged beyond threshold.", "medium"));
  }
  if (scoreDrift.latencyP95IncreaseRatio > thresholds.maxLatencyP95IncreaseRatio) {
    additionalAlerts.push(buildAlert(input, "garageLatencyP95Ms", scoreDrift.latencyP95IncreaseRatio, thresholds.maxLatencyP95IncreaseRatio, "Live GaRAGe p95 latency increased beyond threshold.", "medium"));
  }
  if (scoreDrift.costIncreaseRatio > thresholds.maxCostIncreaseRatio) {
    additionalAlerts.push(buildAlert(input, "garageCostUsdMean", scoreDrift.costIncreaseRatio, thresholds.maxCostIncreaseRatio, "Live GaRAGe mean cost increased beyond threshold.", "medium"));
  }
  const receipt = withAdditionalAlerts(
    runLiveScoreBehaviorDrift({
      agentId: input.agentId,
      baselineWindow: toLiveDriftWindow(input.baselineWindow),
      liveWindow: toLiveDriftWindow(input.liveWindow),
      thresholds: input.liveDriftThresholds,
      sourceRefs: unique([...(input.sourceRefs ?? []), DEFAULT_SOURCE_REF, DEFAULT_PAPER_REF]),
      now: input.now,
    }),
    additionalAlerts,
  );
  const garageReceiptHash = sha256Hex(canonicalize({
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
    garageReceiptHash,
    baselineRows,
    liveRows,
    baselineDistribution,
    liveDistribution,
    scoreDrift,
    behaviorDrift,
  };
}
