import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  type LiveDriftAlert,
  type LiveDriftMetricId,
  type LiveDriftReceipt,
  type LiveDriftRagEvaluationMode,
  type LiveDriftRagJudgeType,
  type LiveDriftRagPipelineStrategy,
  type LiveDriftSampleRow,
  type LiveDriftSeverity,
  type LiveDriftThresholds,
  type LiveDriftWatchAlert,
  type LiveDriftWindow,
} from "./liveDriftAlerts.js";

export interface RagTextGenerationSourceProof {
  openAlexWorkId: string;
  doi: string;
  title: string;
  publisher: string;
  venue: string;
  publicationDate: string;
  openAlexMetadataHash: string;
  crossrefMetadataHash: string;
  publisherMetadataHash: string;
  metadataVerifiedAt: string;
  metadataReviewReceiptHash: string;
  noPaperContentCopyProofHash: string;
}

export interface RagTextGenerationLiveDriftRow {
  traceId: string;
  scenarioId: string;
  timestamp: string;
  queryHash: string;
  retrievedContextHash: string;
  generatedAnswerHash: string;
  referenceAnswerHash: string;
  strategyComparisonId: string;
  strategyRunId: string;
  strategyManifestHash: string;
  indexManifestHash: string;
  querySetHash: string;
  evaluatorConfigHash: string;
  modelConfigHash: string;
  strategyResultHash: string;
  corpusHash: string;
  retrieverId: string;
  generatorId: string;
  frameworkId: string;
  evaluationMode: Exclude<LiveDriftRagEvaluationMode, "unknown">;
  pipelineStrategy: Exclude<LiveDriftRagPipelineStrategy, "unknown">;
  judgeType: Exclude<LiveDriftRagJudgeType, "unknown">;
  retrievalTopK: number;
  accuracy0to1: number;
  completeness0to1: number;
  utilization0to1: number;
  numericalAccuracy0to1: number;
  hallucinationRate0to1: number;
  passageGroundingCoverage0to1: number;
  citationCoverage0to1: number;
  answerSupportCoverage0to1: number;
  latencyMs: number;
  costUsd: number;
  baselineDistributionHash?: string;
  liveSampleManifestHash?: string;
  driftStatisticHash?: string;
  alertReceiptHash?: string;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface RagTextGenerationWindow {
  windowId: string;
  startedAt: string;
  endedAt: string;
  rows: RagTextGenerationLiveDriftRow[];
}

export interface RunRagTextGenerationLiveDriftInput {
  agentId: string;
  sourceProof: RagTextGenerationSourceProof;
  baselineWindow: RagTextGenerationWindow;
  liveWindow: RagTextGenerationWindow;
  thresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}

export interface RagTextGenerationLiveDriftResult {
  receipt: LiveDriftReceipt;
  watchAlerts: LiveDriftWatchAlert[];
  sourceProof: RagTextGenerationSourceProof;
  sourceEvidenceCoverage0to1: number;
  sourceMissingReasons: string[];
  receiptHash: string;
}

const REQUIRED_SOURCE_PROOF_FIELDS: Array<keyof RagTextGenerationSourceProof> = [
  "openAlexWorkId",
  "doi",
  "title",
  "publisher",
  "venue",
  "publicationDate",
  "openAlexMetadataHash",
  "crossrefMetadataHash",
  "publisherMetadataHash",
  "metadataVerifiedAt",
  "metadataReviewReceiptHash",
  "noPaperContentCopyProofHash",
];

const VERIFIED_TITLE = "A Survey on Retrieval-Augmented Text Generation for Large Language Models";
const VERIFIED_OPENALEX_ID = "https://openalex.org/W4394947112";
const VERIFIED_DOI = "https://doi.org/10.1145/3805774";

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

function sourceRefsFor(input: RunRagTextGenerationLiveDriftInput): string[] {
  return unique([
    ...(input.sourceRefs ?? []),
    input.sourceProof.openAlexWorkId,
    input.sourceProof.doi,
  ]);
}

function sourceProofStats(proof: RagTextGenerationSourceProof): { coverage: number; missingReasons: string[] } {
  const missingReasons: string[] = [];
  let present = 0;
  for (const field of REQUIRED_SOURCE_PROOF_FIELDS) {
    if (nonEmpty(proof[field])) {
      present += 1;
    } else {
      missingReasons.push(String(field));
    }
  }
  if (proof.openAlexWorkId.trim() !== VERIFIED_OPENALEX_ID) missingReasons.push("openAlexWorkId.mismatch");
  if (proof.doi.trim().toLowerCase() !== VERIFIED_DOI) missingReasons.push("doi.mismatch");
  if (proof.title.trim() !== VERIFIED_TITLE) missingReasons.push("title.mismatch");
  const denominator = REQUIRED_SOURCE_PROOF_FIELDS.length + 3;
  const mismatchCount = missingReasons.filter((reason) => reason.endsWith(".mismatch")).length;
  return {
    coverage: round(Math.max(0, present + (3 - mismatchCount)) / denominator),
    missingReasons,
  };
}

function rowScore(row: RagTextGenerationLiveDriftRow): number {
  return mean([
    clamp01(row.accuracy0to1),
    clamp01(row.completeness0to1),
    clamp01(row.utilization0to1),
    clamp01(row.numericalAccuracy0to1),
    1 - clamp01(row.hallucinationRate0to1),
    clamp01(row.passageGroundingCoverage0to1),
    clamp01(row.citationCoverage0to1),
    clamp01(row.answerSupportCoverage0to1),
  ]);
}

function toLiveDriftRow(row: RagTextGenerationLiveDriftRow, phase: "baseline" | "live"): LiveDriftSampleRow {
  const score0to1 = rowScore(row);
  return {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    timestamp: row.timestamp,
    score0to1,
    passed: score0to1 >= 0.8 && row.hallucinationRate0to1 <= 0.05 && row.answerSupportCoverage0to1 >= 0.8,
    refused: false,
    errored: row.retrievalTopK <= 0 || row.passageGroundingCoverage0to1 <= 0,
    behaviorSignature: `rag-text-generation:${row.pipelineStrategy}:${row.evaluationMode}:${row.judgeType}:${row.retrieverId}:${row.generatorId}`,
    lifecycleStage: "deployment_maintenance",
    taskCategory: "retrieval augmented text generation live drift",
    domain: "rag text generation",
    agentEvaluationDimension: "evaluation_frameworks",
    latencyMs: row.latencyMs,
    costUsd: row.costUsd,
    evidenceRefs: row.evidenceRefs,
    signedEvidenceRefs: row.signedEvidenceRefs,
    ragEvaluationMode: row.evaluationMode,
    ragPipelineStrategy: row.pipelineStrategy,
    ragStrategyComparisonId: row.strategyComparisonId,
    ragStrategyRunId: row.strategyRunId,
    ragStrategyManifestHash: row.strategyManifestHash,
    ragIndexManifestHash: row.indexManifestHash,
    ragQuerySetHash: row.querySetHash,
    ragReferenceAnswerHash: row.referenceAnswerHash,
    ragEvaluatorConfigHash: row.evaluatorConfigHash,
    ragModelConfigHash: row.modelConfigHash,
    ragStrategyResultHash: row.strategyResultHash,
    ragCorpusHash: row.corpusHash,
    ragRetrieverId: row.retrieverId,
    ragGeneratorId: row.generatorId,
    ragFrameworkId: row.frameworkId,
    ragRetrievalTopK: row.retrievalTopK,
    ragJudgeType: row.judgeType,
    ragHallucinationEvaluatorEnabled: true,
    ragAccuracy0to1: row.accuracy0to1,
    ragCompleteness0to1: row.completeness0to1,
    ragUtilization0to1: row.utilization0to1,
    ragNumericalAccuracy0to1: row.numericalAccuracy0to1,
    ragHallucinationRate0to1: row.hallucinationRate0to1,
    ragGeneratedDataFinalized: phase === "live" ? nonEmpty(row.liveSampleManifestHash) : nonEmpty(row.baselineDistributionHash),
    ragGeneratedDataSuffix: `${row.strategyComparisonId}:generated-data`,
  };
}

function toLiveDriftWindow(window: RagTextGenerationWindow, phase: "baseline" | "live"): LiveDriftWindow {
  return {
    windowId: window.windowId,
    startedAt: window.startedAt,
    endedAt: window.endedAt,
    rows: window.rows.map((row) => toLiveDriftRow(row, phase)),
  };
}

function buildSourceProofAlert(
  input: RunRagTextGenerationLiveDriftInput,
  metricId: LiveDriftMetricId,
  observed: number,
  threshold: number,
  message: string,
  severity: LiveDriftSeverity,
): LiveDriftAlert {
  return {
    alertId: `rag-text-generation:${metricId}:${sha256Hex(canonicalize({ metricId, observed, threshold, message })).slice(0, 12)}`,
    metricId,
    severity,
    message,
    threshold,
    observed: round(observed),
    evidenceRefs: sourceRefsFor(input),
    signedEvidenceRefs: unique([
      input.sourceProof.metadataReviewReceiptHash,
      ...input.baselineWindow.rows.flatMap((row) => row.signedEvidenceRefs),
      ...input.liveWindow.rows.flatMap((row) => row.signedEvidenceRefs),
    ]),
  };
}

function rehashReceipt(receipt: Omit<LiveDriftReceipt, "receiptHash">): LiveDriftReceipt {
  return {
    ...receipt,
    receiptHash: sha256Hex(canonicalize(receipt)),
  };
}

function withSourceProof(
  input: RunRagTextGenerationLiveDriftInput,
  receipt: LiveDriftReceipt,
  sourceCoverage: number,
  missingReasons: string[],
): LiveDriftReceipt {
  const { receiptHash: _receiptHash, ...withoutHash } = receipt;
  const additionalAlerts = missingReasons.length === 0
    ? []
    : [buildSourceProofAlert(
        input,
        "ragStrategyEvidenceCoverage0to1",
        sourceCoverage,
        1,
        `RAG text-generation source metadata proof is incomplete or mismatched: ${missingReasons.join(", ")}.`,
        sourceCoverage < 0.75 ? "critical" : "high",
      )];
  const alerts = [...receipt.alerts, ...additionalAlerts];
  return rehashReceipt({
    ...withoutHash,
    alerts,
    recommendation: alerts.length > 0 ? "alert" : receipt.recommendation,
    failClosed: receipt.failClosed || alerts.length > 0,
    evidenceRefs: unique([
      ...receipt.evidenceRefs,
      input.sourceProof.openAlexMetadataHash,
      input.sourceProof.crossrefMetadataHash,
      input.sourceProof.publisherMetadataHash,
      input.sourceProof.noPaperContentCopyProofHash,
    ]),
    signedEvidenceRefs: unique([
      ...receipt.signedEvidenceRefs,
      input.sourceProof.metadataReviewReceiptHash,
    ]),
    sourceRefs: sourceRefsFor(input),
    summary: `${alerts.length} live drift alert(s), recommendation=${alerts.length > 0 ? "alert" : receipt.recommendation}; RAG text-generation metadata coverage=${round(sourceCoverage)}`,
  });
}

export function runRagTextGenerationLiveDrift(input: RunRagTextGenerationLiveDriftInput): RagTextGenerationLiveDriftResult {
  const sourceStats = sourceProofStats(input.sourceProof);
  const receipt = withSourceProof(
    input,
    runLiveScoreBehaviorDrift({
      agentId: input.agentId,
      baselineWindow: toLiveDriftWindow(input.baselineWindow, "baseline"),
      liveWindow: toLiveDriftWindow(input.liveWindow, "live"),
      thresholds: input.thresholds,
      sourceRefs: sourceRefsFor(input),
      now: input.now,
    }),
    sourceStats.coverage,
    sourceStats.missingReasons,
  );

  return {
    receipt,
    watchAlerts: buildLiveDriftWatchAlerts(receipt),
    sourceProof: input.sourceProof,
    sourceEvidenceCoverage0to1: sourceStats.coverage,
    sourceMissingReasons: sourceStats.missingReasons,
    receiptHash: sha256Hex(canonicalize({
      sourceProof: input.sourceProof,
      baselineDistribution: receipt.baselineDistribution,
      liveSampleHash: receipt.liveSampleHash,
      scoreDrift: receipt.scoreDrift,
      behaviorDrift: receipt.behaviorDrift,
      alertReceiptHash: receipt.receiptHash,
    })),
  };
}
