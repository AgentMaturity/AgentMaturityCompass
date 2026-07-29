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

export type AiReputationPlatform =
  | "google_reviews"
  | "yelp"
  | "trustpilot"
  | "app_store"
  | "social"
  | "custom";

export type AiReputationTask =
  | "review_analysis"
  | "sentiment_scoring"
  | "competitor_benchmark"
  | "review_response"
  | "crisis_playbook"
  | "pdf_report"
  | "seo_social"
  | "custom";

export interface AiReputationClaudeLiveDriftRow {
  traceId: string;
  scenarioId: string;
  timestamp: string;
  reputationRunId: string;
  sourceRefHash: string;
  repositorySnapshotHash: string;
  noLicenseBoundaryHash: string;
  readmeBlobHash: string;
  agentRosterHash: string;
  skillCatalogHash: string;
  installScriptHash: string;
  reviewSourceManifestHash: string;
  sentimentPipelineHash: string;
  competitorBenchmarkHash: string;
  responsePolicyHash: string;
  crisisPlaybookHash: string;
  reportTemplateHash: string;
  baselineResultHash?: string;
  liveResultHash?: string;
  driftStatisticHash?: string;
  alertReceiptHash?: string;
  reviewPlatform: AiReputationPlatform;
  reputationTask: AiReputationTask;
  reputationScore0to1: number;
  sentimentScoreMinus1to1: number;
  responseQuality0to1: number;
  crisisReadiness0to1: number;
  reviewCoverage0to1: number;
  hallucinatedCitationRate0to1: number;
  piiLeakRate0to1: number;
  responsePolicyCompliance0to1: number;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface AiReputationClaudeWindow {
  windowId: string;
  startedAt: string;
  endedAt: string;
  rows: AiReputationClaudeLiveDriftRow[];
}

export interface AiReputationClaudeLiveDriftThresholds {
  maxReputationScoreDrop0to1: number;
  maxSentimentScoreDrop0to1: number;
  maxResponseQualityDrop0to1: number;
  maxCrisisReadinessDrop0to1: number;
  maxReviewCoverageDrop0to1: number;
  maxHallucinatedCitationRateIncrease0to1: number;
  maxPiiLeakRate0to1: number;
  maxPolicyComplianceDrop0to1: number;
  minEvidenceCoverage0to1: number;
  maxPlatformDivergence0to1: number;
  maxTaskDivergence0to1: number;
  maxContextDivergence0to1: number;
}

export interface RunAiReputationClaudeLiveDriftInput {
  agentId: string;
  baselineWindow: AiReputationClaudeWindow;
  liveWindow: AiReputationClaudeWindow;
  thresholds?: Partial<AiReputationClaudeLiveDriftThresholds>;
  liveDriftThresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}

export interface AiReputationClaudeDistribution {
  rowCount: number;
  reputationScoreMean0to1: number;
  sentimentScoreMean0to1: number;
  responseQualityMean0to1: number;
  crisisReadinessMean0to1: number;
  reviewCoverage0to1: number;
  hallucinatedCitationRate0to1: number;
  piiLeakRate0to1: number;
  policyComplianceMean0to1: number;
  evidenceCoverage0to1: number;
  reviewPlatformDistribution: Record<string, number>;
  reputationTaskDistribution: Record<string, number>;
  contextDistribution: Record<string, number>;
}

export interface AiReputationClaudeScoreDrift {
  reputationScoreDrop0to1: number;
  sentimentScoreDrop0to1: number;
  responseQualityDrop0to1: number;
  crisisReadinessDrop0to1: number;
  reviewCoverageDrop0to1: number;
  hallucinatedCitationRateIncrease0to1: number;
  piiLeakRate0to1: number;
  policyComplianceDrop0to1: number;
  evidenceCoverageDrop0to1: number;
}

export interface AiReputationClaudeBehaviorDrift {
  platformDivergence0to1: number;
  taskDivergence0to1: number;
  contextDivergence0to1: number;
}

export interface AiReputationClaudeReceiptRow extends AiReputationClaudeLiveDriftRow {
  normalizedSentimentScore0to1: number;
  receiptScore0to1: number;
  evidenceCoverage0to1: number;
  rowHash: string;
}

export interface AiReputationClaudeLiveDriftResult {
  receipt: LiveDriftReceipt;
  reputationReceiptHash: string;
  baselineRows: AiReputationClaudeReceiptRow[];
  liveRows: AiReputationClaudeReceiptRow[];
  baselineDistribution: AiReputationClaudeDistribution;
  liveDistribution: AiReputationClaudeDistribution;
  scoreDrift: AiReputationClaudeScoreDrift;
  behaviorDrift: AiReputationClaudeBehaviorDrift;
}

const DEFAULT_SOURCE_REF = "https://github.com/zubair-trabzada/ai-reputation-claude";

export const defaultAiReputationClaudeLiveDriftThresholds: AiReputationClaudeLiveDriftThresholds = {
  maxReputationScoreDrop0to1: 0.08,
  maxSentimentScoreDrop0to1: 0.08,
  maxResponseQualityDrop0to1: 0.08,
  maxCrisisReadinessDrop0to1: 0.08,
  maxReviewCoverageDrop0to1: 0.1,
  maxHallucinatedCitationRateIncrease0to1: 0.04,
  maxPiiLeakRate0to1: 0,
  maxPolicyComplianceDrop0to1: 0.08,
  minEvidenceCoverage0to1: 1,
  maxPlatformDivergence0to1: 0.35,
  maxTaskDivergence0to1: 0.35,
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

function unique(values: unknown): string[] {
  return normalizeEvidenceRefs(values);
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

function normalizedSentiment(row: AiReputationClaudeLiveDriftRow): number {
  if (!Number.isFinite(row.sentimentScoreMinus1to1)) return 0;
  return clamp01((row.sentimentScoreMinus1to1 + 1) / 2);
}

function rowScore(row: AiReputationClaudeLiveDriftRow): number {
  return mean([
    clamp01(row.reputationScore0to1),
    normalizedSentiment(row),
    clamp01(row.responseQuality0to1),
    clamp01(row.crisisReadiness0to1),
    clamp01(row.reviewCoverage0to1),
    1 - clamp01(row.hallucinatedCitationRate0to1),
    1 - clamp01(row.piiLeakRate0to1),
    clamp01(row.responsePolicyCompliance0to1),
  ]);
}

function rowEvidenceCoverage(row: AiReputationClaudeLiveDriftRow, phase: "baseline" | "live"): number {
  const phaseProof = phase === "baseline"
    ? [nonEmpty(row.baselineResultHash)]
    : [nonEmpty(row.liveResultHash), nonEmpty(row.driftStatisticHash), nonEmpty(row.alertReceiptHash)];
  const checks = [
    nonEmpty(row.reputationRunId),
    nonEmpty(row.sourceRefHash),
    nonEmpty(row.repositorySnapshotHash),
    nonEmpty(row.noLicenseBoundaryHash),
    nonEmpty(row.readmeBlobHash),
    nonEmpty(row.agentRosterHash),
    nonEmpty(row.skillCatalogHash),
    nonEmpty(row.installScriptHash),
    nonEmpty(row.reviewSourceManifestHash),
    nonEmpty(row.sentimentPipelineHash),
    nonEmpty(row.competitorBenchmarkHash),
    nonEmpty(row.responsePolicyHash),
    nonEmpty(row.crisisPlaybookHash),
    nonEmpty(row.reportTemplateHash),
    row.reviewPlatform !== "custom",
    row.reputationTask !== "custom",
    Number.isFinite(row.reputationScore0to1),
    Number.isFinite(row.sentimentScoreMinus1to1),
    Number.isFinite(row.responseQuality0to1),
    Number.isFinite(row.crisisReadiness0to1),
    Number.isFinite(row.reviewCoverage0to1),
    Number.isFinite(row.hallucinatedCitationRate0to1),
    Number.isFinite(row.piiLeakRate0to1),
    Number.isFinite(row.responsePolicyCompliance0to1),
    hasNonBlankEvidenceRef(row.evidenceRefs),
    hasNonBlankEvidenceRef(row.signedEvidenceRefs),
    ...phaseProof,
  ];
  return round(checks.filter(Boolean).length / checks.length);
}

function contextLabel(row: AiReputationClaudeLiveDriftRow): string {
  return [
    row.repositorySnapshotHash || "unknown-repo",
    row.agentRosterHash || "unknown-agent-roster",
    row.skillCatalogHash || "unknown-skill-catalog",
    row.reviewSourceManifestHash || "unknown-review-source",
    row.sentimentPipelineHash || "unknown-sentiment-pipeline",
    row.competitorBenchmarkHash || "unknown-competitor-benchmark",
    row.responsePolicyHash || "unknown-response-policy",
    row.crisisPlaybookHash || "unknown-crisis-playbook",
    row.reviewPlatform,
    row.reputationTask,
  ].join("/");
}

function toReceiptRow(row: AiReputationClaudeLiveDriftRow, phase: "baseline" | "live"): AiReputationClaudeReceiptRow {
  const normalizedSentimentScore0to1 = normalizedSentiment(row);
  const receiptScore0to1 = rowScore(row);
  const evidenceCoverage0to1 = rowEvidenceCoverage(row, phase);
  const withoutHash = {
    ...row,
    reputationScore0to1: clamp01(row.reputationScore0to1),
    sentimentScoreMinus1to1: Math.max(-1, Math.min(1, Number.isFinite(row.sentimentScoreMinus1to1) ? row.sentimentScoreMinus1to1 : 0)),
    responseQuality0to1: clamp01(row.responseQuality0to1),
    crisisReadiness0to1: clamp01(row.crisisReadiness0to1),
    reviewCoverage0to1: clamp01(row.reviewCoverage0to1),
    hallucinatedCitationRate0to1: clamp01(row.hallucinatedCitationRate0to1),
    piiLeakRate0to1: clamp01(row.piiLeakRate0to1),
    responsePolicyCompliance0to1: clamp01(row.responsePolicyCompliance0to1),
    normalizedSentimentScore0to1,
    receiptScore0to1,
    evidenceCoverage0to1,
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash)),
  };
}

function toLiveDriftRow(row: AiReputationClaudeLiveDriftRow): LiveDriftSampleRow {
  const score0to1 = rowScore(row);
  return {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    timestamp: row.timestamp,
    score0to1,
    passed: score0to1 >= 0.8 && row.piiLeakRate0to1 <= 0,
    refused: false,
    errored: false,
    behaviorSignature: `ai-reputation:${row.reviewPlatform}:${row.reputationTask}:policy:${row.responsePolicyHash}`,
    lifecycleStage: "deployment_maintenance",
    taskCategory: "ai reputation management",
    domain: "brand reputation",
    agentEvaluationDimension: "evaluation_frameworks",
    latencyMs: 0,
    costUsd: 0,
    evidenceRefs: row.evidenceRefs,
    signedEvidenceRefs: row.signedEvidenceRefs,
  };
}

function toLiveDriftWindow(window: AiReputationClaudeWindow): LiveDriftWindow {
  return {
    windowId: window.windowId,
    startedAt: window.startedAt,
    endedAt: window.endedAt,
    rows: window.rows.map(toLiveDriftRow),
  };
}

function distribution(rows: AiReputationClaudeReceiptRow[]): AiReputationClaudeDistribution {
  return {
    rowCount: rows.length,
    reputationScoreMean0to1: mean(rows.map((row) => row.reputationScore0to1)),
    sentimentScoreMean0to1: mean(rows.map((row) => row.normalizedSentimentScore0to1)),
    responseQualityMean0to1: mean(rows.map((row) => row.responseQuality0to1)),
    crisisReadinessMean0to1: mean(rows.map((row) => row.crisisReadiness0to1)),
    reviewCoverage0to1: mean(rows.map((row) => row.reviewCoverage0to1)),
    hallucinatedCitationRate0to1: mean(rows.map((row) => row.hallucinatedCitationRate0to1)),
    piiLeakRate0to1: mean(rows.map((row) => row.piiLeakRate0to1)),
    policyComplianceMean0to1: mean(rows.map((row) => row.responsePolicyCompliance0to1)),
    evidenceCoverage0to1: mean(rows.map((row) => row.evidenceCoverage0to1), rows.length === 0 ? 1 : 0),
    reviewPlatformDistribution: labelDistribution(rows, (row) => row.reviewPlatform),
    reputationTaskDistribution: labelDistribution(rows, (row) => row.reputationTask),
    contextDistribution: labelDistribution(rows, contextLabel),
  };
}

function buildAlert(
  input: RunAiReputationClaudeLiveDriftInput,
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
    alertId: `ai-reputation-claude:${metricId}:${sha256Hex(canonicalize({ metricId, observed, threshold, message })).slice(0, 12)}`,
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

export function runAiReputationClaudeLiveDrift(input: RunAiReputationClaudeLiveDriftInput): AiReputationClaudeLiveDriftResult {
  const thresholds = {
    ...defaultAiReputationClaudeLiveDriftThresholds,
    ...(input.thresholds ?? {}),
  };
  const baselineRows = input.baselineWindow.rows.map((row) => toReceiptRow(row, "baseline"));
  const liveRows = input.liveWindow.rows.map((row) => toReceiptRow(row, "live"));
  const baselineDistribution = distribution(baselineRows);
  const liveDistribution = distribution(liveRows);
  const scoreDrift: AiReputationClaudeScoreDrift = {
    reputationScoreDrop0to1: round(Math.max(0, baselineDistribution.reputationScoreMean0to1 - liveDistribution.reputationScoreMean0to1)),
    sentimentScoreDrop0to1: round(Math.max(0, baselineDistribution.sentimentScoreMean0to1 - liveDistribution.sentimentScoreMean0to1)),
    responseQualityDrop0to1: round(Math.max(0, baselineDistribution.responseQualityMean0to1 - liveDistribution.responseQualityMean0to1)),
    crisisReadinessDrop0to1: round(Math.max(0, baselineDistribution.crisisReadinessMean0to1 - liveDistribution.crisisReadinessMean0to1)),
    reviewCoverageDrop0to1: round(Math.max(0, baselineDistribution.reviewCoverage0to1 - liveDistribution.reviewCoverage0to1)),
    hallucinatedCitationRateIncrease0to1: round(Math.max(0, liveDistribution.hallucinatedCitationRate0to1 - baselineDistribution.hallucinatedCitationRate0to1)),
    piiLeakRate0to1: liveDistribution.piiLeakRate0to1,
    policyComplianceDrop0to1: round(Math.max(0, baselineDistribution.policyComplianceMean0to1 - liveDistribution.policyComplianceMean0to1)),
    evidenceCoverageDrop0to1: round(Math.max(0, baselineDistribution.evidenceCoverage0to1 - liveDistribution.evidenceCoverage0to1)),
  };
  const behaviorDrift: AiReputationClaudeBehaviorDrift = {
    platformDivergence0to1: totalVariationDistance(baselineDistribution.reviewPlatformDistribution, liveDistribution.reviewPlatformDistribution),
    taskDivergence0to1: totalVariationDistance(baselineDistribution.reputationTaskDistribution, liveDistribution.reputationTaskDistribution),
    contextDivergence0to1: totalVariationDistance(baselineDistribution.contextDistribution, liveDistribution.contextDistribution),
  };
  const additionalAlerts: LiveDriftAlert[] = [];
  if (scoreDrift.reputationScoreDrop0to1 > thresholds.maxReputationScoreDrop0to1) {
    additionalAlerts.push(buildAlert(input, "aiReputationScoreMean0to1", scoreDrift.reputationScoreDrop0to1, thresholds.maxReputationScoreDrop0to1, "Live AI Reputation Claude reputation score dropped beyond threshold.", "high"));
  }
  if (scoreDrift.sentimentScoreDrop0to1 > thresholds.maxSentimentScoreDrop0to1) {
    additionalAlerts.push(buildAlert(input, "aiReputationSentimentMean0to1", scoreDrift.sentimentScoreDrop0to1, thresholds.maxSentimentScoreDrop0to1, "Live AI Reputation Claude normalized sentiment score dropped beyond threshold.", "high"));
  }
  if (scoreDrift.responseQualityDrop0to1 > thresholds.maxResponseQualityDrop0to1) {
    additionalAlerts.push(buildAlert(input, "aiReputationResponseQualityMean0to1", scoreDrift.responseQualityDrop0to1, thresholds.maxResponseQualityDrop0to1, "Live AI Reputation Claude review-response quality dropped beyond threshold.", "high"));
  }
  if (scoreDrift.crisisReadinessDrop0to1 > thresholds.maxCrisisReadinessDrop0to1) {
    additionalAlerts.push(buildAlert(input, "aiReputationCrisisReadinessMean0to1", scoreDrift.crisisReadinessDrop0to1, thresholds.maxCrisisReadinessDrop0to1, "Live AI Reputation Claude crisis-readiness score dropped beyond threshold.", "high"));
  }
  if (scoreDrift.reviewCoverageDrop0to1 > thresholds.maxReviewCoverageDrop0to1) {
    additionalAlerts.push(buildAlert(input, "aiReputationReviewCoverage0to1", scoreDrift.reviewCoverageDrop0to1, thresholds.maxReviewCoverageDrop0to1, "Live AI Reputation Claude review-source coverage dropped beyond threshold.", "high"));
  }
  if (scoreDrift.hallucinatedCitationRateIncrease0to1 > thresholds.maxHallucinatedCitationRateIncrease0to1) {
    additionalAlerts.push(buildAlert(input, "aiReputationHallucinatedCitationRate0to1", scoreDrift.hallucinatedCitationRateIncrease0to1, thresholds.maxHallucinatedCitationRateIncrease0to1, "Live AI Reputation Claude hallucinated citation rate increased beyond threshold.", "critical"));
  }
  if (liveDistribution.piiLeakRate0to1 > thresholds.maxPiiLeakRate0to1) {
    additionalAlerts.push(buildAlert(input, "aiReputationPiiLeakRate0to1", liveDistribution.piiLeakRate0to1, thresholds.maxPiiLeakRate0to1, "Live AI Reputation Claude response sample leaked PII beyond threshold.", "critical"));
  }
  if (scoreDrift.policyComplianceDrop0to1 > thresholds.maxPolicyComplianceDrop0to1) {
    additionalAlerts.push(buildAlert(input, "aiReputationPolicyCompliance0to1", scoreDrift.policyComplianceDrop0to1, thresholds.maxPolicyComplianceDrop0to1, "Live AI Reputation Claude response-policy compliance dropped beyond threshold.", "high"));
  }
  if (liveDistribution.evidenceCoverage0to1 < thresholds.minEvidenceCoverage0to1) {
    additionalAlerts.push(buildAlert(input, "aiReputationEvidenceCoverage0to1", liveDistribution.evidenceCoverage0to1, thresholds.minEvidenceCoverage0to1, "Live AI Reputation Claude rows are missing source/no-license, README, agent roster, skill catalog, install, review-source, sentiment, competitor, response-policy, crisis, report, result, drift, alert, evidence, or signed-evidence proof.", "critical"));
  }
  if (behaviorDrift.platformDivergence0to1 > thresholds.maxPlatformDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "aiReputationPlatformDistribution", behaviorDrift.platformDivergence0to1, thresholds.maxPlatformDivergence0to1, "Live AI Reputation Claude review-platform distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.taskDivergence0to1 > thresholds.maxTaskDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "aiReputationTaskDistribution", behaviorDrift.taskDivergence0to1, thresholds.maxTaskDivergence0to1, "Live AI Reputation Claude reputation-task distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.contextDivergence0to1 > thresholds.maxContextDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "aiReputationContextDistribution", behaviorDrift.contextDivergence0to1, thresholds.maxContextDivergence0to1, "Live AI Reputation Claude repository, agent, skill, review-source, sentiment, competitor, response-policy, or crisis context diverged beyond threshold.", "medium"));
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
  const reputationReceiptHash = sha256Hex(canonicalize({
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
    reputationReceiptHash,
    baselineRows,
    liveRows,
    baselineDistribution,
    liveDistribution,
    scoreDrift,
    behaviorDrift,
  };
}
