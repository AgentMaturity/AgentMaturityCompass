import type { QuestionScoreSignedEvidenceRef } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type JudgeCalibrationSignedEvidenceRef = QuestionScoreSignedEvidenceRef;
export type JudgeCalibrationMode = "ci" | "lifecycle";
export type JudgeCalibrationAppealStatus = "not_required" | "open" | "upheld" | "overturned" | "rejected";
export type JudgeCalibrationEvaluationStage = "pointwise" | "listwise" | "pairwise";
export type JudgeCalibrationMetricId =
  | "calibrationSet"
  | "judgeDisagreement"
  | "judgeError"
  | "subjectiveJudgeError"
  | "objectiveJudgeError"
  | "judgeVariance"
  | "rankingStability"
  | "dataQuality"
  | "appealOutcome"
  | "artifactHash"
  | "graphProof"
  | "graphMetricBranchCoverage"
  | "graphReportCoverage"
  | "graphCostEstimateDrift"
  | "agentStockSourceEvidence"
  | "agentStockFutureOutcomeEvidence"
  | "agentStockLeaderboardEvidence"
  | "agentStockAppealEvidence"
  | "signedEvidenceRefs";

export interface JudgeCalibrationRubricInput {
  rubricId: string;
  version: string;
  criteria: string[];
  owner?: string;
}

export interface JudgeCalibrationRubric extends JudgeCalibrationRubricInput {
  rubricHash: string;
}

export interface JudgeCalibrationSetRowInput {
  itemId: string;
  expectedScore0to1: number;
  subjectiveExpectedScore0to1?: number;
  objectiveExpectedScore0to1?: number;
  taskCategory?: string;
  promptArtifactHash?: string;
  outputArtifactHash?: string;
  sourceRefs?: string[];
  evidenceRefs: string[];
  signedEvidenceRefs: JudgeCalibrationSignedEvidenceRef[];
}

export interface JudgeCalibrationSetRow extends JudgeCalibrationSetRowInput {
  rowHash: string;
}

export interface JudgeCalibrationSetInput {
  setId: string;
  version: string;
  rows: JudgeCalibrationSetRowInput[];
  datasetHash?: string;
}

export interface JudgeCalibrationSet {
  setId: string;
  version: string;
  rowCount: number;
  datasetHash: string;
  rows: JudgeCalibrationSetRow[];
}

export interface JudgeCalibrationJudgmentInput {
  itemId: string;
  judgeId: string;
  score0to1: number;
  promptHash: string;
  outputHash: string;
  subjectiveScore0to1?: number;
  objectiveScore0to1?: number;
  judgeMemoryRef?: string;
  confidence0to1?: number;
  costUsd?: number;
  latencyMs?: number;
  evidenceRefs: string[];
  signedEvidenceRefs: JudgeCalibrationSignedEvidenceRef[];
}

export interface JudgeCalibrationJudgment extends JudgeCalibrationJudgmentInput {
  rowHash: string;
}

export interface JudgeCalibrationAppealInput {
  appealId: string;
  itemId: string;
  status: Exclude<JudgeCalibrationAppealStatus, "not_required">;
  submittedBy: string;
  reviewer?: string;
  outcomeReasonHash?: string;
  evidenceRefs: string[];
  signedEvidenceRefs: JudgeCalibrationSignedEvidenceRef[];
}

export interface JudgeCalibrationAppealOutcome extends JudgeCalibrationAppealInput {
  appealHash: string;
  resolved: boolean;
}

export interface JudgeCalibrationStabilityCheckInput {
  itemId: string;
  checkpointId?: string;
  stage: JudgeCalibrationEvaluationStage;
  subsampleCount: number;
  rankingStability0to1: number;
  percentileScore0to1?: number;
  tailFailureRate0to1?: number;
  dataQuality0to1?: number;
  ocrReadability0to1?: number;
  pointwiseRank?: number;
  listwiseRank?: number;
  pairwiseWinRate0to1?: number;
  evidenceRefs: string[];
  signedEvidenceRefs: JudgeCalibrationSignedEvidenceRef[];
}

export interface JudgeCalibrationStabilityCheck extends JudgeCalibrationStabilityCheckInput {
  checkpointId?: string;
  percentileScore0to1?: number;
  tailFailureRate0to1?: number;
  dataQuality0to1?: number;
  ocrReadability0to1?: number;
  pointwiseRank?: number;
  listwiseRank?: number;
  pairwiseWinRate0to1?: number;
  checkHash: string;
  failed: boolean;
  failedReasons: string[];
}

export interface JudgeCalibrationGraphProofInput {
  graphId: string;
  graphVersion: string;
  nodeGraphHash: string;
  scanNodeHash: string;
  metricNodeHashes: string[];
  aggregationNodeHash: string;
  reportArtifactHash: string;
  cacheKeyHash: string;
  modelRoutingHash: string;
  promptVersionHash: string;
  parserVersionHash: string;
  costEstimateHash: string;
  caseReportManifestHash: string;
  datasetAdapterHash: string;
  executionPlanHash: string;
  structuredOutputSchemaHash: string;
  requiredMetricBranches: string[];
  executedMetricBranches: string[];
  perCaseReportCoverage0to1: number;
  cacheHitRate0to1?: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  evidenceRefs: string[];
  signedEvidenceRefs: JudgeCalibrationSignedEvidenceRef[];
}

export interface JudgeCalibrationGraphProof extends JudgeCalibrationGraphProofInput {
  graphId: string;
  graphVersion: string;
  metricNodeHashes: string[];
  requiredMetricBranches: string[];
  executedMetricBranches: string[];
  perCaseReportCoverage0to1: number;
  cacheHitRate0to1: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  metricBranchCoverage0to1: number;
  costEstimateDriftRatio: number;
  graphProofHash: string;
  failed: boolean;
  failedReasons: string[];
}

export interface JudgeCalibrationAgentStockBenchmarkProofInput {
  benchmarkId: string;
  benchmarkVersion: string;
  sourceRepository: string;
  sourceCommit: string;
  sourceTreeHash: string;
  licenseRefHash: string;
  readmeBlobHash: string;
  pyprojectHash: string;
  accountingMetricsHash: string;
  leaderboardHash: string;
  leaderboardMarkdownHash: string;
  strategyManifestHash: string;
  promptsTreeHash: string;
  rankingsTreeHash: string;
  portfolioTreeHash: string;
  strategyTreeHash: string;
  dataRawTreeHash: string;
  dataParquetTreeHash: string;
  scriptsTreeHash: string;
  dailyDigestTreeHash: string;
  benchmarkDate: string;
  marketUniverse: string;
  agentRosterHash: string;
  predictionPromptHash: string;
  futureOutcomeWindowHash: string;
  groundTruthPriceDataHash: string;
  rankingResultHash: string;
  pnlMetricHash: string;
  appealWorkflowHash: string;
  replayCommandHash: string;
  ciReceiptHash: string;
  rankedAgentCount: number;
  tickerCount: number;
  tradingDayCount: number;
  futureOutcomeCoverage0to1: number;
  leaderboardCoverage0to1: number;
  appealResolutionCoverage0to1: number;
  replayPassRate0to1: number;
  evidenceRefs: string[];
  signedEvidenceRefs: JudgeCalibrationSignedEvidenceRef[];
}

export interface JudgeCalibrationAgentStockBenchmarkProof extends JudgeCalibrationAgentStockBenchmarkProofInput {
  rankedAgentCount: number;
  tickerCount: number;
  tradingDayCount: number;
  futureOutcomeCoverage0to1: number;
  leaderboardCoverage0to1: number;
  appealResolutionCoverage0to1: number;
  replayPassRate0to1: number;
  proofHash: string;
  failed: boolean;
  failedReasons: string[];
}

export interface JudgeCalibrationThresholds {
  minCalibrationRows: number;
  minJudgesPerItem: number;
  minInterJudgeAgreement0to1: number;
  maxMeanAbsoluteError0to1: number;
  maxSubjectiveMeanAbsoluteError0to1: number;
  maxObjectiveMeanAbsoluteError0to1: number;
  maxScoreVariance0to1: number;
  minStabilitySubsampleCount: number;
  minRankingStability0to1: number;
  maxTailFailureRate0to1: number;
  minDataQuality0to1: number;
  minOcrReadability0to1: number;
  requireGraphProofForLlmJudge: boolean;
  minGraphMetricBranchCoverage0to1: number;
  minGraphPerCaseReportCoverage0to1: number;
  maxGraphCostEstimateDriftRatio: number;
  minAgentStockRankedAgentCount: number;
  minAgentStockTickerCount: number;
  minAgentStockTradingDayCount: number;
  minAgentStockFutureOutcomeCoverage0to1: number;
  minAgentStockLeaderboardCoverage0to1: number;
  minAgentStockAppealResolutionCoverage0to1: number;
  minAgentStockReplayPassRate0to1: number;
  requireSignedEvidence: boolean;
  requireResolvedAppealsForFailedRows: boolean;
}

export interface JudgeCalibrationItemSummary {
  itemId: string;
  expectedScore0to1: number;
  subjectiveExpectedScore0to1: number | null;
  objectiveExpectedScore0to1: number | null;
  taskCategory: string | null;
  judgeCount: number;
  averageJudgeScore0to1: number;
  meanAbsoluteError0to1: number;
  subjectiveMeanAbsoluteError0to1: number;
  objectiveMeanAbsoluteError0to1: number;
  scoreVariance0to1: number;
  interJudgeAgreement0to1: number;
  appealStatus: JudgeCalibrationAppealStatus;
  failed: boolean;
  failedReasons: string[];
}

export interface JudgeCalibrationDisagreement {
  calibratedItemCount: number;
  judgeCount: number;
  interJudgeAgreement0to1: number;
  meanAbsoluteError0to1: number;
  subjectiveMeanAbsoluteError0to1: number;
  objectiveMeanAbsoluteError0to1: number;
  maxScoreVariance0to1: number;
  taskCategoryDistribution: Record<string, number>;
  failedItemIds: string[];
  itemSummaries: JudgeCalibrationItemSummary[];
}

export interface JudgeCalibrationStabilitySummary {
  checkCount: number;
  failedItemIds: string[];
  meanRankingStability0to1: number;
  meanDataQuality0to1: number;
  meanOcrReadability0to1: number;
  maxTailFailureRate0to1: number;
  stageDistribution: Record<string, number>;
}

export interface JudgeCalibrationCiGate {
  mode: JudgeCalibrationMode;
  passed: boolean;
  failClosed: boolean;
  failedReasons: string[];
  failedItemIds: string[];
}

export interface JudgeCalibrationReceipt {
  receiptId: string;
  agentId: string;
  runId: string;
  generatedAt: string;
  mode: JudgeCalibrationMode;
  thresholds: JudgeCalibrationThresholds;
  rubric: JudgeCalibrationRubric;
  calibrationSet: JudgeCalibrationSet;
  judgments: JudgeCalibrationJudgment[];
  disagreement: JudgeCalibrationDisagreement;
  stabilityChecks: JudgeCalibrationStabilityCheck[];
  stabilitySummary: JudgeCalibrationStabilitySummary;
  graphProof: JudgeCalibrationGraphProof | null;
  agentStockBenchmarkProof: JudgeCalibrationAgentStockBenchmarkProof | null;
  appealOutcomes: JudgeCalibrationAppealOutcome[];
  sourceRefs: string[];
  evidenceRefs: string[];
  signedEvidenceRefs: JudgeCalibrationSignedEvidenceRef[];
  replayable: boolean;
  failClosed: boolean;
  ciGate: JudgeCalibrationCiGate;
  receiptHash: string;
  summary: string;
}

export interface JudgeCalibrationWatchAlert {
  id: string;
  agentId: string;
  source: "judge-calibration";
  severity: "medium" | "high" | "critical";
  metricId: JudgeCalibrationMetricId;
  evidenceRefs: string[];
  signedEvidenceRefs: JudgeCalibrationSignedEvidenceRef[];
  message: string;
  receiptHash: string;
  createdAt: string;
}

export interface JudgeCalibrationReceiptVerification {
  valid: boolean;
  receiptHash: string;
  expectedReceiptHash: string;
  errors: string[];
}

export interface BuildJudgeCalibrationReceiptInput {
  agentId: string;
  runId: string;
  generatedAt?: string;
  mode?: JudgeCalibrationMode;
  rubric: JudgeCalibrationRubricInput;
  calibrationSet: JudgeCalibrationSetInput;
  judgments: JudgeCalibrationJudgmentInput[];
  stabilityChecks?: JudgeCalibrationStabilityCheckInput[];
  graphProof?: JudgeCalibrationGraphProofInput;
  agentStockBenchmarkProof?: JudgeCalibrationAgentStockBenchmarkProofInput;
  appeals?: JudgeCalibrationAppealInput[];
  thresholds?: Partial<JudgeCalibrationThresholds>;
  sourceRefs?: string[];
}

export const defaultJudgeCalibrationThresholds: JudgeCalibrationThresholds = {
  minCalibrationRows: 3,
  minJudgesPerItem: 2,
  minInterJudgeAgreement0to1: 0.8,
  maxMeanAbsoluteError0to1: 0.15,
  maxSubjectiveMeanAbsoluteError0to1: 0.15,
  maxObjectiveMeanAbsoluteError0to1: 0.15,
  maxScoreVariance0to1: 0.05,
  minStabilitySubsampleCount: 5,
  minRankingStability0to1: 0.75,
  maxTailFailureRate0to1: 0.2,
  minDataQuality0to1: 0.7,
  minOcrReadability0to1: 0.7,
  requireGraphProofForLlmJudge: false,
  minGraphMetricBranchCoverage0to1: 1,
  minGraphPerCaseReportCoverage0to1: 1,
  maxGraphCostEstimateDriftRatio: 0.25,
  minAgentStockRankedAgentCount: 2,
  minAgentStockTickerCount: 20,
  minAgentStockTradingDayCount: 5,
  minAgentStockFutureOutcomeCoverage0to1: 1,
  minAgentStockLeaderboardCoverage0to1: 1,
  minAgentStockAppealResolutionCoverage0to1: 1,
  minAgentStockReplayPassRate0to1: 0.95,
  requireSignedEvidence: true,
  requireResolvedAppealsForFailedRows: true,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function safeNonNegative(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function round(value: number, places = 6): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return round(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function uniqueNormalizedLabels(values: string[]): string[] {
  return unique(values.map((value) => value.trim().toLowerCase()));
}

function normalizedLabel(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasSignedEvidence(ref: JudgeCalibrationSignedEvidenceRef): boolean {
  return ref.evidenceId.trim().length > 0 &&
    ref.eventHash.trim().length === 64 &&
    ref.writerSig.trim().length > 0;
}

function validHash(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function validSourceRefHash(value: string): boolean {
  return /^[a-f0-9]{40,64}$/i.test(value);
}

function pairwiseAgreement(scores: number[]): number {
  if (scores.length < 2) return 0;
  const agreements: number[] = [];
  for (let left = 0; left < scores.length; left += 1) {
    for (let right = left + 1; right < scores.length; right += 1) {
      agreements.push(1 - Math.abs(scores[left]! - scores[right]!));
    }
  }
  return round(clamp01(mean(agreements)));
}

function hashWithoutHash<T extends Record<string, unknown>>(row: T): string {
  return sha256Hex(canonicalize(row));
}

function costEstimateDriftRatio(estimatedCostUsd: number, actualCostUsd: number): number {
  if (estimatedCostUsd <= 0) return actualCostUsd > 0 ? 1 : 0;
  return round(Math.abs(actualCostUsd - estimatedCostUsd) / estimatedCostUsd);
}

function distribution(values: Array<string | null>): Record<string, number> {
  const labels = values.map((value) => value ?? "unknown");
  if (labels.length === 0) return {};
  const counts = new Map<string, number>();
  for (const label of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, count]) => [label, round(count / labels.length)]),
  );
}

function buildRubric(input: JudgeCalibrationRubricInput): JudgeCalibrationRubric {
  const rubricWithoutHash = {
    rubricId: input.rubricId,
    version: input.version,
    criteria: unique(input.criteria),
    owner: input.owner ?? "AMC Eval",
  };
  return {
    ...rubricWithoutHash,
    rubricHash: hashWithoutHash(rubricWithoutHash),
  };
}

function buildCalibrationSet(input: JudgeCalibrationSetInput): JudgeCalibrationSet {
  const rows = input.rows.map((row) => {
    const rowWithoutHash = {
      itemId: row.itemId,
      expectedScore0to1: clamp01(row.expectedScore0to1),
      subjectiveExpectedScore0to1: row.subjectiveExpectedScore0to1 === undefined ? null : clamp01(row.subjectiveExpectedScore0to1),
      objectiveExpectedScore0to1: row.objectiveExpectedScore0to1 === undefined ? null : clamp01(row.objectiveExpectedScore0to1),
      taskCategory: normalizedLabel(row.taskCategory),
      promptArtifactHash: normalizedLabel(row.promptArtifactHash),
      outputArtifactHash: normalizedLabel(row.outputArtifactHash),
      sourceRefs: unique(row.sourceRefs ?? []),
      evidenceRefs: unique(row.evidenceRefs),
      signedEvidenceRefs: row.signedEvidenceRefs,
    };
    return {
      ...rowWithoutHash,
      subjectiveExpectedScore0to1: rowWithoutHash.subjectiveExpectedScore0to1 ?? undefined,
      objectiveExpectedScore0to1: rowWithoutHash.objectiveExpectedScore0to1 ?? undefined,
      taskCategory: rowWithoutHash.taskCategory ?? undefined,
      promptArtifactHash: rowWithoutHash.promptArtifactHash ?? undefined,
      outputArtifactHash: rowWithoutHash.outputArtifactHash ?? undefined,
      rowHash: hashWithoutHash(rowWithoutHash),
    };
  });
  const datasetHash = input.datasetHash ?? sha256Hex(canonicalize({
    setId: input.setId,
    version: input.version,
    rows: rows.map((row) => ({ itemId: row.itemId, expectedScore0to1: row.expectedScore0to1, rowHash: row.rowHash })),
  }));
  return {
    setId: input.setId,
    version: input.version,
    rowCount: rows.length,
    datasetHash,
    rows,
  };
}

function buildJudgment(input: JudgeCalibrationJudgmentInput): JudgeCalibrationJudgment {
  const rowWithoutHash = {
    itemId: input.itemId,
    judgeId: input.judgeId,
    score0to1: clamp01(input.score0to1),
    subjectiveScore0to1: input.subjectiveScore0to1 === undefined ? null : clamp01(input.subjectiveScore0to1),
    objectiveScore0to1: input.objectiveScore0to1 === undefined ? null : clamp01(input.objectiveScore0to1),
    judgeMemoryRef: normalizedLabel(input.judgeMemoryRef),
    confidence0to1: input.confidence0to1 === undefined ? null : clamp01(input.confidence0to1),
    promptHash: input.promptHash,
    outputHash: input.outputHash,
    costUsd: safeNonNegative(input.costUsd),
    latencyMs: safeNonNegative(input.latencyMs),
    evidenceRefs: unique(input.evidenceRefs),
    signedEvidenceRefs: input.signedEvidenceRefs,
  };
  return {
    ...rowWithoutHash,
    subjectiveScore0to1: rowWithoutHash.subjectiveScore0to1 ?? undefined,
    objectiveScore0to1: rowWithoutHash.objectiveScore0to1 ?? undefined,
    judgeMemoryRef: rowWithoutHash.judgeMemoryRef ?? undefined,
    confidence0to1: rowWithoutHash.confidence0to1 ?? undefined,
    rowHash: hashWithoutHash(rowWithoutHash),
  };
}

function buildAppeal(input: JudgeCalibrationAppealInput): JudgeCalibrationAppealOutcome {
  const status = input.status;
  const rowWithoutHash = {
    appealId: input.appealId,
    itemId: input.itemId,
    status,
    submittedBy: input.submittedBy,
    reviewer: input.reviewer ?? null,
    outcomeReasonHash: input.outcomeReasonHash ?? null,
    evidenceRefs: unique(input.evidenceRefs),
    signedEvidenceRefs: input.signedEvidenceRefs,
  };
  return {
    ...rowWithoutHash,
    reviewer: rowWithoutHash.reviewer ?? undefined,
    outcomeReasonHash: rowWithoutHash.outcomeReasonHash ?? undefined,
    appealHash: hashWithoutHash(rowWithoutHash),
    resolved: status === "upheld" || status === "overturned" || status === "rejected",
  };
}

function positiveInteger(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function buildStabilityCheck(
  input: JudgeCalibrationStabilityCheckInput,
  thresholds: JudgeCalibrationThresholds,
): JudgeCalibrationStabilityCheck {
  const rowWithoutHash = {
    itemId: input.itemId,
    checkpointId: normalizedLabel(input.checkpointId),
    stage: input.stage,
    subsampleCount: positiveInteger(input.subsampleCount),
    rankingStability0to1: clamp01(input.rankingStability0to1),
    percentileScore0to1: input.percentileScore0to1 === undefined ? null : clamp01(input.percentileScore0to1),
    tailFailureRate0to1: input.tailFailureRate0to1 === undefined ? null : clamp01(input.tailFailureRate0to1),
    dataQuality0to1: input.dataQuality0to1 === undefined ? null : clamp01(input.dataQuality0to1),
    ocrReadability0to1: input.ocrReadability0to1 === undefined ? null : clamp01(input.ocrReadability0to1),
    pointwiseRank: positiveInteger(input.pointwiseRank),
    listwiseRank: positiveInteger(input.listwiseRank),
    pairwiseWinRate0to1: input.pairwiseWinRate0to1 === undefined ? null : clamp01(input.pairwiseWinRate0to1),
    evidenceRefs: unique(input.evidenceRefs),
    signedEvidenceRefs: input.signedEvidenceRefs,
  };
  const failedReasons: string[] = [];
  if (!["pointwise", "listwise", "pairwise"].includes(rowWithoutHash.stage)) {
    failedReasons.push(`evaluation stage ${rowWithoutHash.stage} is unsupported`);
  }
  if (rowWithoutHash.subsampleCount < thresholds.minStabilitySubsampleCount) {
    failedReasons.push(`subsample count ${rowWithoutHash.subsampleCount} below ${thresholds.minStabilitySubsampleCount}`);
  }
  if (rowWithoutHash.rankingStability0to1 < thresholds.minRankingStability0to1) {
    failedReasons.push(`ranking stability ${rowWithoutHash.rankingStability0to1} below ${thresholds.minRankingStability0to1}`);
  }
  if ((rowWithoutHash.tailFailureRate0to1 ?? 0) > thresholds.maxTailFailureRate0to1) {
    failedReasons.push(`tail failure rate ${rowWithoutHash.tailFailureRate0to1} exceeds ${thresholds.maxTailFailureRate0to1}`);
  }
  if ((rowWithoutHash.dataQuality0to1 ?? 1) < thresholds.minDataQuality0to1) {
    failedReasons.push(`data quality ${rowWithoutHash.dataQuality0to1} below ${thresholds.minDataQuality0to1}`);
  }
  if ((rowWithoutHash.ocrReadability0to1 ?? 1) < thresholds.minOcrReadability0to1) {
    failedReasons.push(`ocr readability ${rowWithoutHash.ocrReadability0to1} below ${thresholds.minOcrReadability0to1}`);
  }
  return {
    ...rowWithoutHash,
    checkpointId: rowWithoutHash.checkpointId ?? undefined,
    percentileScore0to1: rowWithoutHash.percentileScore0to1 ?? undefined,
    tailFailureRate0to1: rowWithoutHash.tailFailureRate0to1 ?? undefined,
    dataQuality0to1: rowWithoutHash.dataQuality0to1 ?? undefined,
    ocrReadability0to1: rowWithoutHash.ocrReadability0to1 ?? undefined,
    pointwiseRank: rowWithoutHash.pointwiseRank || undefined,
    listwiseRank: rowWithoutHash.listwiseRank || undefined,
    pairwiseWinRate0to1: rowWithoutHash.pairwiseWinRate0to1 ?? undefined,
    checkHash: hashWithoutHash(rowWithoutHash),
    failed: failedReasons.length > 0,
    failedReasons,
  };
}

function buildStabilitySummary(checks: JudgeCalibrationStabilityCheck[]): JudgeCalibrationStabilitySummary {
  const dataQualityScores = checks
    .map((check) => check.dataQuality0to1)
    .filter((value): value is number => value !== undefined);
  const ocrScores = checks
    .map((check) => check.ocrReadability0to1)
    .filter((value): value is number => value !== undefined);
  const tailFailureRates = checks
    .map((check) => check.tailFailureRate0to1)
    .filter((value): value is number => value !== undefined);
  return {
    checkCount: checks.length,
    failedItemIds: unique(checks.filter((check) => check.failed).map((check) => check.itemId)),
    meanRankingStability0to1: mean(checks.map((check) => check.rankingStability0to1)),
    meanDataQuality0to1: dataQualityScores.length === 0 ? 1 : mean(dataQualityScores),
    meanOcrReadability0to1: ocrScores.length === 0 ? 1 : mean(ocrScores),
    maxTailFailureRate0to1: tailFailureRates.length === 0 ? 0 : round(Math.max(...tailFailureRates)),
    stageDistribution: distribution(checks.map((check) => check.stage)),
  };
}

function buildGraphProof(
  input: JudgeCalibrationGraphProofInput,
  thresholds: JudgeCalibrationThresholds,
): JudgeCalibrationGraphProof {
  const requiredMetricBranches = uniqueNormalizedLabels(input.requiredMetricBranches);
  const executedMetricBranches = uniqueNormalizedLabels(input.executedMetricBranches);
  const requiredBranchSet = new Set(requiredMetricBranches);
  const executedBranchSet = new Set(executedMetricBranches);
  const matchedBranches = [...requiredBranchSet].filter((branch) => executedBranchSet.has(branch));
  const metricBranchCoverage0to1 = requiredMetricBranches.length === 0
    ? 0
    : round(matchedBranches.length / requiredMetricBranches.length);
  const estimatedCostUsd = safeNonNegative(input.estimatedCostUsd);
  const actualCostUsd = safeNonNegative(input.actualCostUsd);
  const rowWithoutHash = {
    graphId: normalizedLabel(input.graphId) ?? "",
    graphVersion: normalizedLabel(input.graphVersion) ?? "",
    nodeGraphHash: input.nodeGraphHash,
    scanNodeHash: input.scanNodeHash,
    metricNodeHashes: unique(input.metricNodeHashes),
    aggregationNodeHash: input.aggregationNodeHash,
    reportArtifactHash: input.reportArtifactHash,
    cacheKeyHash: input.cacheKeyHash,
    modelRoutingHash: input.modelRoutingHash,
    promptVersionHash: input.promptVersionHash,
    parserVersionHash: input.parserVersionHash,
    costEstimateHash: input.costEstimateHash,
    caseReportManifestHash: input.caseReportManifestHash,
    datasetAdapterHash: input.datasetAdapterHash,
    executionPlanHash: input.executionPlanHash,
    structuredOutputSchemaHash: input.structuredOutputSchemaHash,
    requiredMetricBranches,
    executedMetricBranches,
    perCaseReportCoverage0to1: clamp01(input.perCaseReportCoverage0to1),
    cacheHitRate0to1: input.cacheHitRate0to1 === undefined ? 0 : clamp01(input.cacheHitRate0to1),
    estimatedCostUsd,
    actualCostUsd,
    evidenceRefs: unique(input.evidenceRefs),
    signedEvidenceRefs: input.signedEvidenceRefs,
    metricBranchCoverage0to1,
    costEstimateDriftRatio: costEstimateDriftRatio(estimatedCostUsd, actualCostUsd),
  };
  const requiredHashes = [
    rowWithoutHash.nodeGraphHash,
    rowWithoutHash.scanNodeHash,
    ...rowWithoutHash.metricNodeHashes,
    rowWithoutHash.aggregationNodeHash,
    rowWithoutHash.reportArtifactHash,
    rowWithoutHash.cacheKeyHash,
    rowWithoutHash.modelRoutingHash,
    rowWithoutHash.promptVersionHash,
    rowWithoutHash.parserVersionHash,
    rowWithoutHash.costEstimateHash,
    rowWithoutHash.caseReportManifestHash,
    rowWithoutHash.datasetAdapterHash,
    rowWithoutHash.executionPlanHash,
    rowWithoutHash.structuredOutputSchemaHash,
  ];
  const failedReasons: string[] = [];
  if (rowWithoutHash.graphId.length === 0 || rowWithoutHash.graphVersion.length === 0) {
    failedReasons.push("graph proof identity missing");
  }
  if (rowWithoutHash.metricNodeHashes.length === 0 || requiredHashes.some((hash) => !validHash(hash))) {
    failedReasons.push("graph proof artifact hash invalid");
  }
  if (rowWithoutHash.metricBranchCoverage0to1 < thresholds.minGraphMetricBranchCoverage0to1) {
    failedReasons.push(`graph metric branch coverage ${rowWithoutHash.metricBranchCoverage0to1} below ${thresholds.minGraphMetricBranchCoverage0to1}`);
  }
  if (rowWithoutHash.perCaseReportCoverage0to1 < thresholds.minGraphPerCaseReportCoverage0to1) {
    failedReasons.push(`per-case report coverage ${rowWithoutHash.perCaseReportCoverage0to1} below ${thresholds.minGraphPerCaseReportCoverage0to1}`);
  }
  if (rowWithoutHash.costEstimateDriftRatio > thresholds.maxGraphCostEstimateDriftRatio) {
    failedReasons.push(`cost estimate drift ${rowWithoutHash.costEstimateDriftRatio} exceeds ${thresholds.maxGraphCostEstimateDriftRatio}`);
  }
  const proofWithoutHash = {
    ...rowWithoutHash,
    failed: failedReasons.length > 0,
    failedReasons,
  };
  return {
    ...proofWithoutHash,
    graphProofHash: hashWithoutHash(proofWithoutHash),
  };
}

function buildAgentStockBenchmarkProof(
  input: JudgeCalibrationAgentStockBenchmarkProofInput,
  thresholds: JudgeCalibrationThresholds,
): JudgeCalibrationAgentStockBenchmarkProof {
  const rankedAgentCount = positiveInteger(input.rankedAgentCount);
  const tickerCount = positiveInteger(input.tickerCount);
  const tradingDayCount = positiveInteger(input.tradingDayCount);
  const rowWithoutHash = {
    benchmarkId: normalizedLabel(input.benchmarkId) ?? "",
    benchmarkVersion: normalizedLabel(input.benchmarkVersion) ?? "",
    sourceRepository: normalizedLabel(input.sourceRepository) ?? "",
    sourceCommit: input.sourceCommit,
    sourceTreeHash: input.sourceTreeHash,
    licenseRefHash: input.licenseRefHash,
    readmeBlobHash: input.readmeBlobHash,
    pyprojectHash: input.pyprojectHash,
    accountingMetricsHash: input.accountingMetricsHash,
    leaderboardHash: input.leaderboardHash,
    leaderboardMarkdownHash: input.leaderboardMarkdownHash,
    strategyManifestHash: input.strategyManifestHash,
    promptsTreeHash: input.promptsTreeHash,
    rankingsTreeHash: input.rankingsTreeHash,
    portfolioTreeHash: input.portfolioTreeHash,
    strategyTreeHash: input.strategyTreeHash,
    dataRawTreeHash: input.dataRawTreeHash,
    dataParquetTreeHash: input.dataParquetTreeHash,
    scriptsTreeHash: input.scriptsTreeHash,
    dailyDigestTreeHash: input.dailyDigestTreeHash,
    benchmarkDate: normalizedLabel(input.benchmarkDate) ?? "",
    marketUniverse: normalizedLabel(input.marketUniverse)?.toLowerCase() ?? "",
    agentRosterHash: input.agentRosterHash,
    predictionPromptHash: input.predictionPromptHash,
    futureOutcomeWindowHash: input.futureOutcomeWindowHash,
    groundTruthPriceDataHash: input.groundTruthPriceDataHash,
    rankingResultHash: input.rankingResultHash,
    pnlMetricHash: input.pnlMetricHash,
    appealWorkflowHash: input.appealWorkflowHash,
    replayCommandHash: input.replayCommandHash,
    ciReceiptHash: input.ciReceiptHash,
    rankedAgentCount,
    tickerCount,
    tradingDayCount,
    futureOutcomeCoverage0to1: clamp01(input.futureOutcomeCoverage0to1),
    leaderboardCoverage0to1: clamp01(input.leaderboardCoverage0to1),
    appealResolutionCoverage0to1: clamp01(input.appealResolutionCoverage0to1),
    replayPassRate0to1: clamp01(input.replayPassRate0to1),
    evidenceRefs: unique(input.evidenceRefs),
    signedEvidenceRefs: input.signedEvidenceRefs,
  };
  const sourceHashes = [
    rowWithoutHash.sourceCommit,
    rowWithoutHash.sourceTreeHash,
    rowWithoutHash.licenseRefHash,
    rowWithoutHash.readmeBlobHash,
    rowWithoutHash.pyprojectHash,
    rowWithoutHash.accountingMetricsHash,
    rowWithoutHash.leaderboardHash,
    rowWithoutHash.leaderboardMarkdownHash,
    rowWithoutHash.strategyManifestHash,
    rowWithoutHash.promptsTreeHash,
    rowWithoutHash.rankingsTreeHash,
    rowWithoutHash.portfolioTreeHash,
    rowWithoutHash.strategyTreeHash,
    rowWithoutHash.dataRawTreeHash,
    rowWithoutHash.dataParquetTreeHash,
    rowWithoutHash.scriptsTreeHash,
    rowWithoutHash.dailyDigestTreeHash,
  ];
  const ownedProofHashes = [
    rowWithoutHash.agentRosterHash,
    rowWithoutHash.predictionPromptHash,
    rowWithoutHash.futureOutcomeWindowHash,
    rowWithoutHash.groundTruthPriceDataHash,
    rowWithoutHash.rankingResultHash,
    rowWithoutHash.pnlMetricHash,
    rowWithoutHash.appealWorkflowHash,
    rowWithoutHash.replayCommandHash,
    rowWithoutHash.ciReceiptHash,
  ];
  const failedReasons: string[] = [];
  if (
    rowWithoutHash.benchmarkId.length === 0 ||
    rowWithoutHash.benchmarkVersion.length === 0 ||
    rowWithoutHash.benchmarkDate.length === 0 ||
    rowWithoutHash.marketUniverse.length === 0
  ) {
    failedReasons.push("AgentStock benchmark identity missing");
  }
  if (
    !rowWithoutHash.sourceRepository.includes("github.com/xsunsim/AgentStockBenchmarkResults") ||
    sourceHashes.some((hash) => !validSourceRefHash(hash))
  ) {
    failedReasons.push("AgentStock source snapshot evidence invalid");
  }
  if (ownedProofHashes.some((hash) => !validHash(hash))) {
    failedReasons.push("AgentStock future-outcome artifact hash invalid");
  }
  if (rankedAgentCount < thresholds.minAgentStockRankedAgentCount) {
    failedReasons.push(`AgentStock ranked agent count ${rankedAgentCount} below ${thresholds.minAgentStockRankedAgentCount}`);
  }
  if (tickerCount < thresholds.minAgentStockTickerCount) {
    failedReasons.push(`AgentStock ticker count ${tickerCount} below ${thresholds.minAgentStockTickerCount}`);
  }
  if (tradingDayCount < thresholds.minAgentStockTradingDayCount) {
    failedReasons.push(`AgentStock trading day count ${tradingDayCount} below ${thresholds.minAgentStockTradingDayCount}`);
  }
  if (rowWithoutHash.futureOutcomeCoverage0to1 < thresholds.minAgentStockFutureOutcomeCoverage0to1) {
    failedReasons.push(`AgentStock future outcome coverage ${rowWithoutHash.futureOutcomeCoverage0to1} below ${thresholds.minAgentStockFutureOutcomeCoverage0to1}`);
  }
  if (rowWithoutHash.leaderboardCoverage0to1 < thresholds.minAgentStockLeaderboardCoverage0to1) {
    failedReasons.push(`AgentStock leaderboard coverage ${rowWithoutHash.leaderboardCoverage0to1} below ${thresholds.minAgentStockLeaderboardCoverage0to1}`);
  }
  if (rowWithoutHash.appealResolutionCoverage0to1 < thresholds.minAgentStockAppealResolutionCoverage0to1) {
    failedReasons.push(`AgentStock appeal resolution coverage ${rowWithoutHash.appealResolutionCoverage0to1} below ${thresholds.minAgentStockAppealResolutionCoverage0to1}`);
  }
  if (rowWithoutHash.replayPassRate0to1 < thresholds.minAgentStockReplayPassRate0to1) {
    failedReasons.push(`AgentStock replay pass rate ${rowWithoutHash.replayPassRate0to1} below ${thresholds.minAgentStockReplayPassRate0to1}`);
  }
  if (
    rowWithoutHash.evidenceRefs.length === 0 ||
    rowWithoutHash.signedEvidenceRefs.length !== rowWithoutHash.evidenceRefs.length ||
    !rowWithoutHash.signedEvidenceRefs.every(hasSignedEvidence)
  ) {
    failedReasons.push("AgentStock signed evidence missing");
  }
  const proofWithoutHash = {
    ...rowWithoutHash,
    failed: failedReasons.length > 0,
    failedReasons,
  };
  return {
    ...proofWithoutHash,
    proofHash: hashWithoutHash(proofWithoutHash),
  };
}

function signedEvidenceIssues(params: {
  calibrationSet: JudgeCalibrationSet;
  judgments: JudgeCalibrationJudgment[];
  stabilityChecks: JudgeCalibrationStabilityCheck[];
  graphProof: JudgeCalibrationGraphProof | null;
  agentStockBenchmarkProof: JudgeCalibrationAgentStockBenchmarkProof | null;
  appeals: JudgeCalibrationAppealOutcome[];
  requireSignedEvidence: boolean;
}): string[] {
  if (!params.requireSignedEvidence) return [];
  const issues: string[] = [];
  for (const row of params.calibrationSet.rows) {
    if (row.evidenceRefs.length === 0 || row.signedEvidenceRefs.length !== row.evidenceRefs.length || !row.signedEvidenceRefs.every(hasSignedEvidence)) {
      issues.push(`calibration row ${row.itemId} missing signed evidence`);
    }
    if ((row.promptArtifactHash && !validHash(row.promptArtifactHash)) || (row.outputArtifactHash && !validHash(row.outputArtifactHash))) {
      issues.push(`calibration row ${row.itemId} missing valid prompt/output artifact hash`);
    }
  }
  for (const judgment of params.judgments) {
    if (
      !validHash(judgment.promptHash) ||
      !validHash(judgment.outputHash) ||
      judgment.evidenceRefs.length === 0 ||
      judgment.signedEvidenceRefs.length !== judgment.evidenceRefs.length ||
      !judgment.signedEvidenceRefs.every(hasSignedEvidence)
    ) {
      issues.push(`judgment ${judgment.itemId}/${judgment.judgeId} missing valid prompt/output hash or signed evidence`);
    }
  }
  for (const appeal of params.appeals) {
    if (
      appeal.evidenceRefs.length === 0 ||
      appeal.signedEvidenceRefs.length !== appeal.evidenceRefs.length ||
      !appeal.signedEvidenceRefs.every(hasSignedEvidence) ||
      (appeal.resolved && !validHash(appeal.outcomeReasonHash ?? ""))
    ) {
      issues.push(`appeal ${appeal.appealId} missing signed evidence or outcome reason hash`);
    }
  }
  for (const check of params.stabilityChecks) {
    if (
      check.evidenceRefs.length === 0 ||
      check.signedEvidenceRefs.length !== check.evidenceRefs.length ||
      !check.signedEvidenceRefs.every(hasSignedEvidence)
    ) {
      issues.push(`stability check ${check.itemId}/${check.stage} missing signed evidence`);
    }
  }
  if (params.graphProof && (
    params.graphProof.evidenceRefs.length === 0 ||
    params.graphProof.signedEvidenceRefs.length !== params.graphProof.evidenceRefs.length ||
    !params.graphProof.signedEvidenceRefs.every(hasSignedEvidence)
  )) {
    issues.push(`graph proof ${params.graphProof.graphId} missing signed evidence`);
  }
  if (params.agentStockBenchmarkProof && (
    params.agentStockBenchmarkProof.evidenceRefs.length === 0 ||
    params.agentStockBenchmarkProof.signedEvidenceRefs.length !== params.agentStockBenchmarkProof.evidenceRefs.length ||
    !params.agentStockBenchmarkProof.signedEvidenceRefs.every(hasSignedEvidence)
  )) {
    issues.push(`AgentStock benchmark proof ${params.agentStockBenchmarkProof.benchmarkId} missing signed evidence`);
  }
  return issues;
}

function buildDisagreement(params: {
  calibrationSet: JudgeCalibrationSet;
  judgments: JudgeCalibrationJudgment[];
  appeals: JudgeCalibrationAppealOutcome[];
  thresholds: JudgeCalibrationThresholds;
}): JudgeCalibrationDisagreement {
  const judgmentsByItem = new Map<string, JudgeCalibrationJudgment[]>();
  for (const judgment of params.judgments) {
    const rows = judgmentsByItem.get(judgment.itemId) ?? [];
    rows.push(judgment);
    judgmentsByItem.set(judgment.itemId, rows);
  }
  const appealsByItem = new Map(params.appeals.map((appeal) => [appeal.itemId, appeal]));
  const itemSummaries = params.calibrationSet.rows.map<JudgeCalibrationItemSummary>((row) => {
    const judgments = judgmentsByItem.get(row.itemId) ?? [];
    const scores = judgments.map((judgment) => judgment.score0to1);
    const subjectiveScores = judgments
      .map((judgment) => judgment.subjectiveScore0to1)
      .filter((score): score is number => score !== undefined);
    const objectiveScores = judgments
      .map((judgment) => judgment.objectiveScore0to1)
      .filter((score): score is number => score !== undefined);
    const averageJudgeScore0to1 = mean(scores);
    const meanAbsoluteError0to1 = round(Math.abs(averageJudgeScore0to1 - row.expectedScore0to1));
    const subjectiveMeanAbsoluteError0to1 = row.subjectiveExpectedScore0to1 === undefined
      ? 0
      : subjectiveScores.length > 0
        ? round(Math.abs(mean(subjectiveScores) - row.subjectiveExpectedScore0to1))
        : row.subjectiveExpectedScore0to1;
    const objectiveMeanAbsoluteError0to1 = row.objectiveExpectedScore0to1 === undefined
      ? 0
      : objectiveScores.length > 0
        ? round(Math.abs(mean(objectiveScores) - row.objectiveExpectedScore0to1))
        : row.objectiveExpectedScore0to1;
    const scoreVariance0to1 = variance(scores);
    const interJudgeAgreement0to1 = pairwiseAgreement(scores);
    const appeal = appealsByItem.get(row.itemId);
    const failedReasons: string[] = [];
    if (judgments.length < params.thresholds.minJudgesPerItem) {
      failedReasons.push(`judge count ${judgments.length} below ${params.thresholds.minJudgesPerItem}`);
    }
    if (interJudgeAgreement0to1 < params.thresholds.minInterJudgeAgreement0to1) {
      failedReasons.push(`inter-judge agreement ${interJudgeAgreement0to1} below ${params.thresholds.minInterJudgeAgreement0to1}`);
    }
    if (meanAbsoluteError0to1 > params.thresholds.maxMeanAbsoluteError0to1) {
      failedReasons.push(`mean absolute error ${meanAbsoluteError0to1} exceeds ${params.thresholds.maxMeanAbsoluteError0to1}`);
    }
    if (subjectiveMeanAbsoluteError0to1 > params.thresholds.maxSubjectiveMeanAbsoluteError0to1) {
      failedReasons.push(`subjective mean absolute error ${subjectiveMeanAbsoluteError0to1} exceeds ${params.thresholds.maxSubjectiveMeanAbsoluteError0to1}`);
    }
    if (objectiveMeanAbsoluteError0to1 > params.thresholds.maxObjectiveMeanAbsoluteError0to1) {
      failedReasons.push(`objective mean absolute error ${objectiveMeanAbsoluteError0to1} exceeds ${params.thresholds.maxObjectiveMeanAbsoluteError0to1}`);
    }
    if (scoreVariance0to1 > params.thresholds.maxScoreVariance0to1) {
      failedReasons.push(`score variance ${scoreVariance0to1} exceeds ${params.thresholds.maxScoreVariance0to1}`);
    }
    if (params.thresholds.requireResolvedAppealsForFailedRows && failedReasons.length > 0 && !appeal?.resolved) {
      failedReasons.push(appeal ? `unresolved appeal ${appeal.appealId}` : "missing appeal outcome for failed calibration row");
    }
    return {
      itemId: row.itemId,
      expectedScore0to1: row.expectedScore0to1,
      subjectiveExpectedScore0to1: row.subjectiveExpectedScore0to1 ?? null,
      objectiveExpectedScore0to1: row.objectiveExpectedScore0to1 ?? null,
      taskCategory: row.taskCategory ?? null,
      judgeCount: judgments.length,
      averageJudgeScore0to1,
      meanAbsoluteError0to1,
      subjectiveMeanAbsoluteError0to1,
      objectiveMeanAbsoluteError0to1,
      scoreVariance0to1,
      interJudgeAgreement0to1,
      appealStatus: appeal?.status ?? "not_required",
      failed: failedReasons.length > 0,
      failedReasons,
    };
  });
  const failedItemIds = itemSummaries.filter((row) => row.failed).map((row) => row.itemId);
  const uniqueJudgeIds = new Set(params.judgments.map((row) => row.judgeId));
  return {
    calibratedItemCount: itemSummaries.length,
    judgeCount: uniqueJudgeIds.size,
    interJudgeAgreement0to1: mean(itemSummaries.map((row) => row.interJudgeAgreement0to1)),
    meanAbsoluteError0to1: mean(itemSummaries.map((row) => row.meanAbsoluteError0to1)),
    subjectiveMeanAbsoluteError0to1: mean(itemSummaries.map((row) => row.subjectiveMeanAbsoluteError0to1)),
    objectiveMeanAbsoluteError0to1: mean(itemSummaries.map((row) => row.objectiveMeanAbsoluteError0to1)),
    maxScoreVariance0to1: itemSummaries.length > 0 ? round(Math.max(...itemSummaries.map((row) => row.scoreVariance0to1))) : 0,
    taskCategoryDistribution: distribution(itemSummaries.map((row) => row.taskCategory)),
    failedItemIds,
    itemSummaries,
  };
}

function receiptHashFor(receipt: Omit<JudgeCalibrationReceipt, "receiptHash">): string {
  return sha256Hex(canonicalize(receipt));
}

export function buildJudgeCalibrationReceipt(input: BuildJudgeCalibrationReceiptInput): JudgeCalibrationReceipt {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const thresholds = { ...defaultJudgeCalibrationThresholds, ...(input.thresholds ?? {}) };
  const claimsAgentStockBenchmark = Boolean(input.agentStockBenchmarkProof) ||
    (input.sourceRefs ?? []).some((ref) => /agentstock|AgentStockBenchmarkResults/i.test(ref));
  const rubric = buildRubric(input.rubric);
  const calibrationSet = buildCalibrationSet(input.calibrationSet);
  const judgments = input.judgments.map(buildJudgment);
  const stabilityChecks = (input.stabilityChecks ?? []).map((check) => buildStabilityCheck(check, thresholds));
  const stabilitySummary = buildStabilitySummary(stabilityChecks);
  const graphProof = input.graphProof ? buildGraphProof(input.graphProof, thresholds) : null;
  const agentStockBenchmarkProof = input.agentStockBenchmarkProof
    ? buildAgentStockBenchmarkProof(input.agentStockBenchmarkProof, thresholds)
    : null;
  const appealOutcomes = (input.appeals ?? []).map(buildAppeal);
  const disagreement = buildDisagreement({ calibrationSet, judgments, appeals: appealOutcomes, thresholds });

  const failedReasons = [
    ...(calibrationSet.rowCount < thresholds.minCalibrationRows
      ? [`calibration set row count ${calibrationSet.rowCount} below ${thresholds.minCalibrationRows}`]
      : []),
    ...disagreement.itemSummaries.flatMap((row) => row.failedReasons.map((reason) => `${row.itemId}: ${reason}`)),
    ...stabilityChecks.flatMap((check) => check.failedReasons.map((reason) => `${check.itemId}: ${reason}`)),
    ...(thresholds.requireGraphProofForLlmJudge && !graphProof ? ["graph proof required for LLM judge calibration"] : []),
    ...(graphProof?.failedReasons.map((reason) => `graph proof: ${reason}`) ?? []),
    ...(claimsAgentStockBenchmark && !agentStockBenchmarkProof ? ["AgentStock benchmark proof required for market-ranking judge calibration"] : []),
    ...(agentStockBenchmarkProof?.failedReasons.map((reason) => `AgentStock proof: ${reason}`) ?? []),
    ...signedEvidenceIssues({ calibrationSet, judgments, stabilityChecks, graphProof, agentStockBenchmarkProof, appeals: appealOutcomes, requireSignedEvidence: thresholds.requireSignedEvidence }),
  ];
  const failedItemIds = unique([
    ...disagreement.failedItemIds,
    ...stabilitySummary.failedItemIds,
    ...(calibrationSet.rowCount < thresholds.minCalibrationRows ? calibrationSet.rows.map((row) => row.itemId) : []),
    ...((thresholds.requireGraphProofForLlmJudge && !graphProof) || graphProof?.failed ? calibrationSet.rows.map((row) => row.itemId) : []),
    ...(claimsAgentStockBenchmark && (!agentStockBenchmarkProof || agentStockBenchmarkProof.failed) ? calibrationSet.rows.map((row) => row.itemId) : []),
  ]);
  const failClosed = failedReasons.length > 0;
  const evidenceRefs = unique([
    ...calibrationSet.rows.flatMap((row) => row.evidenceRefs),
    ...judgments.flatMap((row) => row.evidenceRefs),
    ...stabilityChecks.flatMap((row) => row.evidenceRefs),
    ...(graphProof?.evidenceRefs ?? []),
    ...(agentStockBenchmarkProof?.evidenceRefs ?? []),
    ...appealOutcomes.flatMap((row) => row.evidenceRefs),
  ]);
  const signedEvidenceRefs = [
    ...calibrationSet.rows.flatMap((row) => row.signedEvidenceRefs),
    ...judgments.flatMap((row) => row.signedEvidenceRefs),
    ...stabilityChecks.flatMap((row) => row.signedEvidenceRefs),
    ...(graphProof?.signedEvidenceRefs ?? []),
    ...(agentStockBenchmarkProof?.signedEvidenceRefs ?? []),
    ...appealOutcomes.flatMap((row) => row.signedEvidenceRefs),
  ];
  const structurallyReplayable =
    validHash(rubric.rubricHash) &&
    validHash(calibrationSet.datasetHash) &&
    calibrationSet.rows.every((row) => validHash(row.rowHash)) &&
    judgments.every((row) => validHash(row.rowHash)) &&
    stabilityChecks.every((row) => validHash(row.checkHash)) &&
    (graphProof === null ? !thresholds.requireGraphProofForLlmJudge : validHash(graphProof.graphProofHash)) &&
    (agentStockBenchmarkProof === null ? !claimsAgentStockBenchmark : validHash(agentStockBenchmarkProof.proofHash)) &&
    appealOutcomes.every((row) => validHash(row.appealHash)) &&
    signedEvidenceIssues({ calibrationSet, judgments, stabilityChecks, graphProof, agentStockBenchmarkProof, appeals: appealOutcomes, requireSignedEvidence: thresholds.requireSignedEvidence }).length === 0;
  const ciGate: JudgeCalibrationCiGate = {
    mode: input.mode ?? "ci",
    passed: !failClosed,
    failClosed,
    failedReasons,
    failedItemIds,
  };
  const receiptWithoutHash: Omit<JudgeCalibrationReceipt, "receiptHash"> = {
    receiptId: `judge-calibration:${input.runId}`,
    agentId: input.agentId,
    runId: input.runId,
    generatedAt,
    mode: input.mode ?? "ci",
    thresholds,
    rubric,
    calibrationSet,
    judgments,
    disagreement,
    stabilityChecks,
    stabilitySummary,
    graphProof,
    agentStockBenchmarkProof,
    appealOutcomes,
    sourceRefs: input.sourceRefs ?? ["amc:judge-calibration"],
    evidenceRefs,
    signedEvidenceRefs,
    replayable: structurallyReplayable && !failClosed,
    failClosed,
    ciGate,
    summary: failClosed
      ? `${failedReasons.length} judge calibration gate(s) failed closed`
      : "all judge calibration gates passed",
  };
  return {
    ...receiptWithoutHash,
    receiptHash: receiptHashFor(receiptWithoutHash),
  };
}

export function verifyJudgeCalibrationReceipt(receipt: JudgeCalibrationReceipt): JudgeCalibrationReceiptVerification {
  const { receiptHash, ...receiptWithoutHash } = receipt;
  const expectedReceiptHash = receiptHashFor(receiptWithoutHash);
  const errors: string[] = [];
  if (receiptHash !== expectedReceiptHash) {
    errors.push("receipt hash mismatch");
  }
  if (receipt.rubric.rubricHash !== hashWithoutHash({
    rubricId: receipt.rubric.rubricId,
    version: receipt.rubric.version,
    criteria: receipt.rubric.criteria,
    owner: receipt.rubric.owner ?? "AMC Eval",
  })) {
    errors.push("rubric hash mismatch");
  }
  if (receipt.graphProof) {
    const { graphProofHash, ...graphProofWithoutHash } = receipt.graphProof;
    if (graphProofHash !== hashWithoutHash(graphProofWithoutHash)) {
      errors.push("graph proof hash mismatch");
    }
  }
  if (receipt.agentStockBenchmarkProof) {
    const { proofHash, ...proofWithoutHash } = receipt.agentStockBenchmarkProof;
    if (proofHash !== hashWithoutHash(proofWithoutHash)) {
      errors.push("AgentStock benchmark proof hash mismatch");
    }
  }
  return {
    valid: errors.length === 0,
    receiptHash,
    expectedReceiptHash,
    errors,
  };
}

export function buildJudgeCalibrationWatchAlerts(receipt: JudgeCalibrationReceipt): JudgeCalibrationWatchAlert[] {
  if (!receipt.failClosed) return [];
  const alerts: JudgeCalibrationWatchAlert[] = [];
  const addAlert = (metricId: JudgeCalibrationMetricId, message: string, severity: JudgeCalibrationWatchAlert["severity"] = "high") => {
    alerts.push({
      id: `judge-calibration:${receipt.runId}:${metricId}:${alerts.length + 1}`,
      agentId: receipt.agentId,
      source: "judge-calibration",
      severity,
      metricId,
      evidenceRefs: receipt.evidenceRefs,
      signedEvidenceRefs: receipt.signedEvidenceRefs,
      message,
      receiptHash: receipt.receiptHash,
      createdAt: receipt.generatedAt,
    });
  };
  if (receipt.calibrationSet.rowCount < receipt.thresholds.minCalibrationRows) {
    addAlert("calibrationSet", `Calibration set row count ${receipt.calibrationSet.rowCount} is below ${receipt.thresholds.minCalibrationRows}`);
  }
  if (receipt.disagreement.interJudgeAgreement0to1 < receipt.thresholds.minInterJudgeAgreement0to1) {
    addAlert("judgeDisagreement", `Inter-judge agreement ${receipt.disagreement.interJudgeAgreement0to1} is below ${receipt.thresholds.minInterJudgeAgreement0to1}`, "critical");
  }
  if (receipt.disagreement.meanAbsoluteError0to1 > receipt.thresholds.maxMeanAbsoluteError0to1) {
    addAlert("judgeError", `Judge calibration error ${receipt.disagreement.meanAbsoluteError0to1} exceeds ${receipt.thresholds.maxMeanAbsoluteError0to1}`);
  }
  if (receipt.disagreement.subjectiveMeanAbsoluteError0to1 > receipt.thresholds.maxSubjectiveMeanAbsoluteError0to1) {
    addAlert("subjectiveJudgeError", `Subjective judge calibration error ${receipt.disagreement.subjectiveMeanAbsoluteError0to1} exceeds ${receipt.thresholds.maxSubjectiveMeanAbsoluteError0to1}`);
  }
  if (receipt.disagreement.objectiveMeanAbsoluteError0to1 > receipt.thresholds.maxObjectiveMeanAbsoluteError0to1) {
    addAlert("objectiveJudgeError", `Objective judge calibration error ${receipt.disagreement.objectiveMeanAbsoluteError0to1} exceeds ${receipt.thresholds.maxObjectiveMeanAbsoluteError0to1}`);
  }
  if (receipt.disagreement.maxScoreVariance0to1 > receipt.thresholds.maxScoreVariance0to1) {
    addAlert("judgeVariance", `Judge score variance ${receipt.disagreement.maxScoreVariance0to1} exceeds ${receipt.thresholds.maxScoreVariance0to1}`);
  }
  if (receipt.agentStockBenchmarkProof) {
    const proofReasons = receipt.agentStockBenchmarkProof.failedReasons.join(" ");
    if (/identity|source snapshot|sourceRepository|license|readme|pyproject/i.test(proofReasons)) {
      addAlert("agentStockSourceEvidence", "AgentStock source snapshot evidence is incomplete or invalid", "critical");
    }
    if (/future outcome|artifact hash|ranked agent count|ticker count|trading day count|replay pass rate/i.test(proofReasons)) {
      addAlert("agentStockFutureOutcomeEvidence", "AgentStock future-outcome ranking evidence failed threshold checks", "critical");
    }
    if (/leaderboard coverage/i.test(proofReasons)) {
      addAlert("agentStockLeaderboardEvidence", "AgentStock leaderboard evidence failed threshold checks", "high");
    }
    if (/appeal resolution coverage/i.test(proofReasons)) {
      addAlert("agentStockAppealEvidence", "AgentStock appeal outcome evidence failed threshold checks", "high");
    }
  } else if (receipt.ciGate.failedReasons.some((reason) => reason.includes("AgentStock benchmark proof required"))) {
    addAlert("agentStockSourceEvidence", "AgentStock benchmark proof is required for market-ranking judge calibration", "critical");
  }
  if (
    receipt.stabilityChecks.some((check) => check.failedReasons.some((reason) =>
      reason.includes("subsample count") ||
      reason.includes("ranking stability") ||
      reason.includes("tail failure rate")
    ))
  ) {
    addAlert("rankingStability", "Stability-aware checkpoint ranking evidence failed threshold checks", "critical");
  }
  if (
    receipt.stabilityChecks.some((check) => check.failedReasons.some((reason) =>
      reason.includes("data quality") ||
      reason.includes("ocr readability")
    ))
  ) {
    addAlert("dataQuality", "Calibration data quality or OCR readability evidence failed threshold checks", "high");
  }
  if (receipt.appealOutcomes.some((appeal) => !appeal.resolved)) {
    addAlert("appealOutcome", "One or more judge calibration appeals are unresolved");
  }
  if (receipt.thresholds.requireGraphProofForLlmJudge && !receipt.graphProof) {
    addAlert("graphProof", "Graph-eval judge proof is required but missing", "critical");
  }
  if (receipt.graphProof) {
    if (receipt.graphProof.metricBranchCoverage0to1 < receipt.thresholds.minGraphMetricBranchCoverage0to1) {
      addAlert("graphMetricBranchCoverage", `Graph metric branch coverage ${receipt.graphProof.metricBranchCoverage0to1} is below ${receipt.thresholds.minGraphMetricBranchCoverage0to1}`, "critical");
    }
    if (receipt.graphProof.perCaseReportCoverage0to1 < receipt.thresholds.minGraphPerCaseReportCoverage0to1) {
      addAlert("graphReportCoverage", `Graph per-case report coverage ${receipt.graphProof.perCaseReportCoverage0to1} is below ${receipt.thresholds.minGraphPerCaseReportCoverage0to1}`);
    }
    if (receipt.graphProof.costEstimateDriftRatio > receipt.thresholds.maxGraphCostEstimateDriftRatio) {
      addAlert("graphCostEstimateDrift", `Graph cost estimate drift ${receipt.graphProof.costEstimateDriftRatio} exceeds ${receipt.thresholds.maxGraphCostEstimateDriftRatio}`);
    }
    if (receipt.graphProof.failedReasons.some((reason) => reason.includes("artifact hash") || reason.includes("identity") || reason.includes("signed evidence"))) {
      addAlert("graphProof", "Graph-eval judge proof is incomplete or has invalid proof hashes", "critical");
    }
  }
  if (receipt.ciGate.failedReasons.some((reason) => reason.includes("signed evidence"))) {
    addAlert("signedEvidenceRefs", "Judge calibration receipt is missing required signed evidence");
  }
  if (receipt.ciGate.failedReasons.some((reason) => reason.includes("prompt/output artifact hash"))) {
    addAlert("artifactHash", "Judge calibration receipt has invalid prompt or output artifact hashes");
  }
  return alerts;
}
