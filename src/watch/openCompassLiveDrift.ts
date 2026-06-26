import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  type LiveBehaviorDrift,
  type LiveDriftAlert,
  type LiveDriftDistribution,
  type LiveDriftReceipt,
  type LiveDriftReceiptRow,
  type LiveDriftSampleRow,
  type LiveDriftThresholds,
  type LiveDriftWatchAlert,
  type LiveDriftWindow,
  type LiveScoreDrift,
} from "./liveDriftAlerts.js";

export const OPENCOMPASS_LIVE_DRIFT_METADATA = {
  requestedSourceUrl: "https://opencompass.org.cn/",
  canonicalSourceUrl: "https://opencompass.org.cn/home/",
  rankSourceUrl: "https://rank.opencompass.org.cn/",
  docsSourceUrl: "https://doc.opencompass.org.cn/",
  title: "OpenCompass司南",
  rankTitle: "OpenCompass司南 - 评测榜单",
  docsTitle: "Welcome to OpenCompass’ documentation! — OpenCompass 0.5.2 documentation",
  homepageStatusCode: 200,
  rankStatusCode: 200,
  docsStatusCode: 200,
  homepageContentType: "text/html",
  rankContentType: "text/html",
  docsContentType: "text/html",
} as const;

export type OpenCompassLiveDriftSurface = "Score" | "Shield" | "Watch";
export type OpenCompassLiveDriftSignal =
  | "leaderboard"
  | "dataset"
  | "evaluation"
  | "model_card"
  | "safety_rank"
  | "online_eval"
  | "documentation"
  | "custom";

export interface OpenCompassLiveDriftMetadataProof {
  requestedSourceUrl: string;
  canonicalSourceUrl: string;
  rankSourceUrl: string;
  docsSourceUrl: string;
  homepageStatusCode: number;
  rankStatusCode: number;
  docsStatusCode: number;
  homepageContentType: string;
  rankContentType: string;
  docsContentType: string;
  homepageTitle: string;
  rankTitle: string;
  docsTitle: string;
  homepageSnapshotHash: string;
  rankSnapshotHash: string;
  docsSnapshotHash: string;
  spaAssetHash: string;
  rankAssetHash: string;
  headerManifestHash: string;
  datasetManifestHash: string;
  metadataSnapshotHash: string;
  metadataRetrievedAt: string;
  amcNativeMappingHash: string;
  scoreSurfaceMappingHash: string;
  shieldSurfaceMappingHash: string;
  watchSurfaceMappingHash: string;
  noOpenCompassSubsystemProofHash: string;
  noSdkImporterSubsystemProofHash: string;
  noCopiedWebsiteDocsProseHash: string;
  noCopiedConfigOrResultRowsHash: string;
  baselineDistributionHash: string;
  liveSampleManifestHash: string;
  driftStatisticHash: string;
  alertReceiptHash: string;
  signedEvidencePolicyHash: string;
  failClosedThresholdPolicyHash: string;
  replayCommandHash: string;
  ciReceiptHash: string;
}

export interface OpenCompassLiveDriftRow extends LiveDriftSampleRow {
  openCompassSurface: OpenCompassLiveDriftSurface;
  openCompassSignal: OpenCompassLiveDriftSignal;
  openCompassBenchmarkSuiteHash: string;
  openCompassDatasetManifestHash: string;
  openCompassModelOrAgentHash: string;
  openCompassEvaluationConfigHash: string;
  openCompassScoreReportHash: string;
  openCompassLeaderboardSnapshotHash: string;
  openCompassRankTableSchemaHash: string;
  openCompassAlertPolicyHash: string;
  openCompassAlertReceiptHash: string;
  openCompassSourceMetadataHash: string;
  openCompassNoRawResultRowsHash: string;
  openCompassNoSdkImporterSubsystemProofHash: string;
}

export interface OpenCompassLiveDriftRowProof {
  traceId: string;
  scenarioId: string;
  surface: OpenCompassLiveDriftSurface;
  signal: OpenCompassLiveDriftSignal;
  rowProofHash: string;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface RunOpenCompassLiveDriftInput {
  agentId: string;
  metadataProof: OpenCompassLiveDriftMetadataProof;
  baselineWindow: Omit<LiveDriftWindow, "rows"> & { rows: OpenCompassLiveDriftRow[] };
  liveWindow: Omit<LiveDriftWindow, "rows"> & { rows: OpenCompassLiveDriftRow[] };
  thresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}

export interface OpenCompassLiveDriftStatistic {
  scoreDrift: LiveScoreDrift;
  behaviorDrift: LiveBehaviorDrift;
}

export interface OpenCompassLiveDriftResult {
  receipt: LiveDriftReceipt;
  alertReceipt: LiveDriftReceipt;
  watchAlerts: LiveDriftWatchAlert[];
  metadataProof: OpenCompassLiveDriftMetadataProof;
  rowProofs: OpenCompassLiveDriftRowProof[];
  missingReasons: string[];
  openCompassEvidenceCoverage0to1: number;
  baselineDistribution: LiveDriftDistribution;
  liveSample: LiveDriftReceiptRow[];
  driftStatistic: OpenCompassLiveDriftStatistic;
}

const REQUIRED_METADATA_PROOF_FIELDS: Array<keyof OpenCompassLiveDriftMetadataProof> = [
  "requestedSourceUrl",
  "canonicalSourceUrl",
  "rankSourceUrl",
  "docsSourceUrl",
  "homepageStatusCode",
  "rankStatusCode",
  "docsStatusCode",
  "homepageContentType",
  "rankContentType",
  "docsContentType",
  "homepageTitle",
  "rankTitle",
  "docsTitle",
  "homepageSnapshotHash",
  "rankSnapshotHash",
  "docsSnapshotHash",
  "spaAssetHash",
  "rankAssetHash",
  "headerManifestHash",
  "datasetManifestHash",
  "metadataSnapshotHash",
  "metadataRetrievedAt",
  "amcNativeMappingHash",
  "scoreSurfaceMappingHash",
  "shieldSurfaceMappingHash",
  "watchSurfaceMappingHash",
  "noOpenCompassSubsystemProofHash",
  "noSdkImporterSubsystemProofHash",
  "noCopiedWebsiteDocsProseHash",
  "noCopiedConfigOrResultRowsHash",
  "baselineDistributionHash",
  "liveSampleManifestHash",
  "driftStatisticHash",
  "alertReceiptHash",
  "signedEvidencePolicyHash",
  "failClosedThresholdPolicyHash",
  "replayCommandHash",
  "ciReceiptHash",
];

const REQUIRED_ROW_PROOF_FIELDS: Array<keyof OpenCompassLiveDriftRow> = [
  "openCompassSurface",
  "openCompassSignal",
  "openCompassBenchmarkSuiteHash",
  "openCompassDatasetManifestHash",
  "openCompassModelOrAgentHash",
  "openCompassEvaluationConfigHash",
  "openCompassScoreReportHash",
  "openCompassLeaderboardSnapshotHash",
  "openCompassRankTableSchemaHash",
  "openCompassAlertPolicyHash",
  "openCompassAlertReceiptHash",
  "openCompassSourceMetadataHash",
  "openCompassNoRawResultRowsHash",
  "openCompassNoSdkImporterSubsystemProofHash",
];

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort();
}

function isPresent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/:443(?=\/|$)/, "").replace(/\/$/, "/").toLowerCase();
}

function normalizeContentType(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function metadataMismatchReasons(proof: OpenCompassLiveDriftMetadataProof): string[] {
  const reasons: string[] = [];
  if (normalizeUrl(proof.requestedSourceUrl) !== normalizeUrl(OPENCOMPASS_LIVE_DRIFT_METADATA.requestedSourceUrl)) {
    reasons.push("metadataMismatch.requestedSourceUrl");
  }
  if (normalizeUrl(proof.canonicalSourceUrl) !== normalizeUrl(OPENCOMPASS_LIVE_DRIFT_METADATA.canonicalSourceUrl)) {
    reasons.push("metadataMismatch.canonicalSourceUrl");
  }
  if (normalizeUrl(proof.rankSourceUrl) !== normalizeUrl(OPENCOMPASS_LIVE_DRIFT_METADATA.rankSourceUrl)) {
    reasons.push("metadataMismatch.rankSourceUrl");
  }
  if (normalizeUrl(proof.docsSourceUrl) !== normalizeUrl(OPENCOMPASS_LIVE_DRIFT_METADATA.docsSourceUrl)) {
    reasons.push("metadataMismatch.docsSourceUrl");
  }
  if (proof.homepageStatusCode !== OPENCOMPASS_LIVE_DRIFT_METADATA.homepageStatusCode) {
    reasons.push("metadataMismatch.homepageStatusCode");
  }
  if (proof.rankStatusCode !== OPENCOMPASS_LIVE_DRIFT_METADATA.rankStatusCode) {
    reasons.push("metadataMismatch.rankStatusCode");
  }
  if (proof.docsStatusCode !== OPENCOMPASS_LIVE_DRIFT_METADATA.docsStatusCode) {
    reasons.push("metadataMismatch.docsStatusCode");
  }
  if (normalizeContentType(proof.homepageContentType) !== OPENCOMPASS_LIVE_DRIFT_METADATA.homepageContentType) {
    reasons.push("metadataMismatch.homepageContentType");
  }
  if (normalizeContentType(proof.rankContentType) !== OPENCOMPASS_LIVE_DRIFT_METADATA.rankContentType) {
    reasons.push("metadataMismatch.rankContentType");
  }
  if (normalizeContentType(proof.docsContentType) !== OPENCOMPASS_LIVE_DRIFT_METADATA.docsContentType) {
    reasons.push("metadataMismatch.docsContentType");
  }
  if (normalizeText(proof.homepageTitle) !== normalizeText(OPENCOMPASS_LIVE_DRIFT_METADATA.title)) {
    reasons.push("metadataMismatch.homepageTitle");
  }
  if (normalizeText(proof.rankTitle) !== normalizeText(OPENCOMPASS_LIVE_DRIFT_METADATA.rankTitle)) {
    reasons.push("metadataMismatch.rankTitle");
  }
  if (normalizeText(proof.docsTitle) !== normalizeText(OPENCOMPASS_LIVE_DRIFT_METADATA.docsTitle)) {
    reasons.push("metadataMismatch.docsTitle");
  }
  return reasons;
}

function rowProof(row: OpenCompassLiveDriftRow): OpenCompassLiveDriftRowProof {
  const payload = {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    score0to1: row.score0to1,
    passed: row.passed ?? null,
    refused: row.refused ?? null,
    errored: row.errored ?? null,
    behaviorSignature: row.behaviorSignature,
    latencyMs: row.latencyMs ?? null,
    costUsd: row.costUsd ?? null,
    openCompassSurface: row.openCompassSurface,
    openCompassSignal: row.openCompassSignal,
    openCompassBenchmarkSuiteHash: row.openCompassBenchmarkSuiteHash,
    openCompassDatasetManifestHash: row.openCompassDatasetManifestHash,
    openCompassModelOrAgentHash: row.openCompassModelOrAgentHash,
    openCompassEvaluationConfigHash: row.openCompassEvaluationConfigHash,
    openCompassScoreReportHash: row.openCompassScoreReportHash,
    openCompassLeaderboardSnapshotHash: row.openCompassLeaderboardSnapshotHash,
    openCompassRankTableSchemaHash: row.openCompassRankTableSchemaHash,
    openCompassAlertPolicyHash: row.openCompassAlertPolicyHash,
    openCompassAlertReceiptHash: row.openCompassAlertReceiptHash,
    openCompassSourceMetadataHash: row.openCompassSourceMetadataHash,
    openCompassNoRawResultRowsHash: row.openCompassNoRawResultRowsHash,
    openCompassNoSdkImporterSubsystemProofHash: row.openCompassNoSdkImporterSubsystemProofHash,
    evidenceRefs: unique(row.evidenceRefs ?? []),
    signedEvidenceRefs: unique(row.signedEvidenceRefs ?? []),
  };
  return {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    surface: row.openCompassSurface,
    signal: row.openCompassSignal,
    rowProofHash: sha256Hex(canonicalize(payload)),
    evidenceRefs: payload.evidenceRefs,
    signedEvidenceRefs: payload.signedEvidenceRefs,
  };
}

function proofStats(proof: OpenCompassLiveDriftMetadataProof, rows: OpenCompassLiveDriftRow[]): {
  present: number;
  total: number;
  missingReasons: string[];
} {
  let present = 0;
  let total = 0;
  const missingReasons: string[] = [];

  for (const field of REQUIRED_METADATA_PROOF_FIELDS) {
    total += 1;
    if (isPresent(proof[field])) {
      present += 1;
    } else {
      missingReasons.push(field);
    }
  }

  const mismatches = metadataMismatchReasons(proof);
  total += mismatches.length;
  missingReasons.push(...mismatches);

  for (const row of rows) {
    for (const field of REQUIRED_ROW_PROOF_FIELDS) {
      total += 1;
      if (isPresent(row[field])) {
        present += 1;
      } else {
        missingReasons.push(`${row.traceId}.${String(field)}`);
      }
    }
    total += 2;
    if ((row.evidenceRefs ?? []).length > 0) {
      present += 1;
    } else {
      missingReasons.push(`${row.traceId}.evidenceRefs`);
    }
    if ((row.signedEvidenceRefs ?? []).length > 0) {
      present += 1;
    } else {
      missingReasons.push(`${row.traceId}.signedEvidenceRefs`);
    }
  }

  return { present, total, missingReasons };
}

function rehashReceipt(receipt: Omit<LiveDriftReceipt, "receiptHash">): LiveDriftReceipt {
  return {
    ...receipt,
    receiptHash: sha256Hex(canonicalize(receipt)),
  };
}

function withOpenCompassReceipt(
  receipt: LiveDriftReceipt,
  coverage: number,
  missingReasons: string[],
  proof: OpenCompassLiveDriftMetadataProof,
): LiveDriftReceipt {
  const { receiptHash: _oldHash, ...receiptWithoutHash } = receipt;
  const alertRefs = unique([
    proof.requestedSourceUrl,
    proof.canonicalSourceUrl,
    proof.rankSourceUrl,
    proof.docsSourceUrl,
    proof.homepageSnapshotHash,
    proof.rankSnapshotHash,
    proof.docsSnapshotHash,
    proof.headerManifestHash,
    proof.datasetManifestHash,
    proof.amcNativeMappingHash,
    proof.baselineDistributionHash,
    proof.liveSampleManifestHash,
    proof.driftStatisticHash,
    proof.alertReceiptHash,
  ]);
  const signedRefs = unique([proof.alertReceiptHash, proof.ciReceiptHash, proof.signedEvidencePolicyHash]);
  const alerts: LiveDriftAlert[] = [...receipt.alerts];

  if (missingReasons.length > 0) {
    alerts.push({
      alertId: `live-drift:${receipt.agentId}:${receipt.baselineWindowId}:${receipt.liveWindowId}:openCompassEvidenceCoverage0to1`,
      metricId: "agentEvalHarnessEvidenceCoverage0to1",
      severity: coverage < 0.75 ? "critical" : "high",
      message: `OpenCompass live drift proof is incomplete or mismatched: ${missingReasons.join(", ")}.`,
      threshold: 1,
      observed: round(coverage),
      evidenceRefs: alertRefs,
      signedEvidenceRefs: signedRefs,
    });
  }

  const recommendation = alerts.length > 0 ? "alert" : receipt.recommendation;
  return rehashReceipt({
    ...receiptWithoutHash,
    alerts,
    recommendation,
    failClosed: alerts.length > 0,
    sourceRefs: unique([
      ...receipt.sourceRefs,
      OPENCOMPASS_LIVE_DRIFT_METADATA.requestedSourceUrl,
      OPENCOMPASS_LIVE_DRIFT_METADATA.canonicalSourceUrl,
      OPENCOMPASS_LIVE_DRIFT_METADATA.rankSourceUrl,
      OPENCOMPASS_LIVE_DRIFT_METADATA.docsSourceUrl,
      proof.homepageSnapshotHash,
      proof.rankSnapshotHash,
      proof.docsSnapshotHash,
      proof.spaAssetHash,
      proof.rankAssetHash,
      proof.headerManifestHash,
      proof.datasetManifestHash,
      proof.amcNativeMappingHash,
      proof.scoreSurfaceMappingHash,
      proof.shieldSurfaceMappingHash,
      proof.watchSurfaceMappingHash,
      proof.noOpenCompassSubsystemProofHash,
      proof.noSdkImporterSubsystemProofHash,
      proof.noCopiedWebsiteDocsProseHash,
      proof.noCopiedConfigOrResultRowsHash,
    ]),
    summary: `${alerts.length} live drift alert(s), recommendation=${recommendation}; OpenCompass evidence coverage=${round(coverage)}`,
  });
}

export function runOpenCompassLiveDrift(input: RunOpenCompassLiveDriftInput): OpenCompassLiveDriftResult {
  const allRows = [...input.baselineWindow.rows, ...input.liveWindow.rows];
  const stats = proofStats(input.metadataProof, allRows);
  const openCompassEvidenceCoverage0to1 = stats.total === 0 ? 0 : round(stats.present / stats.total);
  const rowProofs = allRows.map(rowProof);
  const receipt = runLiveScoreBehaviorDrift({
    agentId: input.agentId,
    baselineWindow: input.baselineWindow,
    liveWindow: input.liveWindow,
    thresholds: input.thresholds,
    sourceRefs: unique([
      ...(input.sourceRefs ?? []),
      OPENCOMPASS_LIVE_DRIFT_METADATA.requestedSourceUrl,
      OPENCOMPASS_LIVE_DRIFT_METADATA.rankSourceUrl,
      input.metadataProof.homepageSnapshotHash,
      input.metadataProof.rankSnapshotHash,
      input.metadataProof.amcNativeMappingHash,
    ]),
    now: input.now,
  });
  const enrichedReceipt = withOpenCompassReceipt(
    receipt,
    openCompassEvidenceCoverage0to1,
    stats.missingReasons,
    input.metadataProof,
  );

  return {
    receipt: enrichedReceipt,
    alertReceipt: enrichedReceipt,
    watchAlerts: buildLiveDriftWatchAlerts(enrichedReceipt),
    metadataProof: input.metadataProof,
    rowProofs,
    missingReasons: stats.missingReasons,
    openCompassEvidenceCoverage0to1,
    baselineDistribution: enrichedReceipt.baselineDistribution,
    liveSample: enrichedReceipt.liveRows,
    driftStatistic: {
      scoreDrift: enrichedReceipt.scoreDrift,
      behaviorDrift: enrichedReceipt.behaviorDrift,
    },
  };
}
