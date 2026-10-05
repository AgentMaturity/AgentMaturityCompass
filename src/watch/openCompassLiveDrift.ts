import { createLiveDriftMetadataReceiptEnricher } from "./liveDriftReceiptValidation.js";
import { collectLiveDriftProofStats } from "./proofStats.js";
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
  normalizeEvidenceRefs,
} from "./evidenceRefs.js";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  type LiveBehaviorDrift,
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

function unique(values: unknown): string[] {
  return normalizeEvidenceRefs(values).sort();
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
  return collectLiveDriftProofStats(proof, rows, REQUIRED_METADATA_PROOF_FIELDS, REQUIRED_ROW_PROOF_FIELDS, metadataMismatchReasons);
}

const withOpenCompassReceipt = createLiveDriftMetadataReceiptEnricher<OpenCompassLiveDriftMetadataProof>({
  alertSuffix: "openCompassEvidenceCoverage0to1",
  metricId: "agentEvalHarnessEvidenceCoverage0to1",
  messagePrefix: "OpenCompass live drift proof is incomplete or mismatched: ",
  summaryPrefix: "OpenCompass evidence coverage=",
  evidenceRefs: (proof) => unique([
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
  ]),
  signedEvidenceRefs: (proof) => unique([proof.alertReceiptHash, proof.ciReceiptHash, proof.signedEvidencePolicyHash]),
  sourceRefs: (receipt, proof) => unique([
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
});

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
