/**
 * Vendor-named drift receipt builder — NO VENDOR API IS CONTACTED.
 *
 * The caller supplies the sample rows; this module validates them, computes
 * drift against thresholds and emits a hash-canonicalised receipt. The vendor
 * in the module name identifies the ecosystem the samples are expected to come
 * from, and any URLs below are documentation references. Nothing here fetches
 * from, authenticates to, or verifies anything with that vendor, so a receipt
 * attests only to the data the caller provided.
 */
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
import {
  clamp01,
  labelDistribution,
  mean,
  nonEmpty,
  round,
  totalVariationDistance,
  unique,
  withAdditionalAlerts,
  boolMean,
  percentile,
  ratioIncrease,
  toLiveDriftWindow,
  createDriftAlertBuilder,
} from "./driftMath.js";

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

/** The shared Family-B alert builder (driftMath), closed over this monitor's slug and refs. */
const buildAlert = createDriftAlertBuilder("garage", [DEFAULT_SOURCE_REF, DEFAULT_PAPER_REF]);

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
      baselineWindow: toLiveDriftWindow(input.baselineWindow, toLiveDriftRow),
      liveWindow: toLiveDriftWindow(input.liveWindow, toLiveDriftRow),
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
