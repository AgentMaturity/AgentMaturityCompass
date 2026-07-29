import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  hasNonBlankEvidenceRef,
  normalizeEvidenceRefs,
} from "./evidenceRefs.js";
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

export const LMNR_OBSERVABILITY_METADATA = {
  requestedSourceUrl: "https://www.lmnr.ai/",
  canonicalSourceUrl: "https://laminar.sh/",
  docsUrl: "https://laminar.sh/docs/overview",
  llmsTxtUrl: "https://laminar.sh/docs/llms.txt",
  title: "Laminar - Open-source observability for AI agents",
  productName: "Laminar",
  statusCode: 200,
  contentType: "text/html; charset=utf-8",
} as const;

export type LmnrObservabilitySurface = "Score" | "Shield" | "Watch";
export type LmnrObservabilitySignal =
  | "trace"
  | "evaluation"
  | "dataset"
  | "alert"
  | "pii_redaction"
  | "mcp_query"
  | "dashboard"
  | "custom";

export interface LmnrObservabilityMetadataProof {
  requestedSourceUrl: string;
  canonicalSourceUrl: string;
  homepageStatusCode: number;
  homepageContentType: string;
  homepageTitle: string;
  homepageSnapshotHash: string;
  docsOverviewHash: string;
  llmsTxtHash: string;
  tracingDocsHash: string;
  evaluationsQuickstartHash: string;
  evaluationConceptsHash: string;
  alertsDocsHash: string;
  piiRedactionDocsHash: string;
  integrationOverviewDocsHash: string;
  mcpDocsHash: string;
  metadataSnapshotHash: string;
  metadataRetrievedAt: string;
  amcNativeMappingHash: string;
  scoreSurfaceMappingHash: string;
  shieldSurfaceMappingHash: string;
  watchSurfaceMappingHash: string;
  noSdkImporterSubsystemProofHash: string;
  noCopiedProseProofHash: string;
  baselineDistributionHash: string;
  liveSampleManifestHash: string;
  driftStatisticHash: string;
  alertReceiptHash: string;
  signedEvidencePolicyHash: string;
  failClosedThresholdPolicyHash: string;
  replayCommandHash: string;
  ciReceiptHash: string;
}

export interface LmnrObservabilityLiveDriftRow extends LiveDriftSampleRow {
  lmnrSurface: LmnrObservabilitySurface;
  lmnrSignal: LmnrObservabilitySignal;
  lmnrProjectIdHash: string;
  lmnrTraceIdHash: string;
  lmnrSpanTreeHash: string;
  lmnrEvaluationRunHash: string;
  lmnrDatasetSnapshotHash: string;
  lmnrScoreEventHash: string;
  lmnrAlertPolicyHash: string;
  lmnrAlertReceiptHash: string;
  lmnrPrivacyBoundaryHash: string;
  lmnrNoRawTracePayloadHash: string;
  lmnrNoSdkImporterSubsystemProofHash: string;
}

export interface LmnrObservabilityRowProof {
  traceId: string;
  scenarioId: string;
  surface: LmnrObservabilitySurface;
  signal: LmnrObservabilitySignal;
  rowProofHash: string;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface RunLmnrObservabilityLiveDriftInput {
  agentId: string;
  metadataProof: LmnrObservabilityMetadataProof;
  baselineWindow: Omit<LiveDriftWindow, "rows"> & { rows: LmnrObservabilityLiveDriftRow[] };
  liveWindow: Omit<LiveDriftWindow, "rows"> & { rows: LmnrObservabilityLiveDriftRow[] };
  thresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}

export interface LmnrObservabilityDriftStatistic {
  scoreDrift: LiveScoreDrift;
  behaviorDrift: LiveBehaviorDrift;
}

export interface LmnrObservabilityLiveDriftResult {
  receipt: LiveDriftReceipt;
  alertReceipt: LiveDriftReceipt;
  watchAlerts: LiveDriftWatchAlert[];
  metadataProof: LmnrObservabilityMetadataProof;
  rowProofs: LmnrObservabilityRowProof[];
  missingReasons: string[];
  lmnrObservabilityEvidenceCoverage0to1: number;
  baselineDistribution: LiveDriftDistribution;
  liveSample: LiveDriftReceiptRow[];
  driftStatistic: LmnrObservabilityDriftStatistic;
}

const REQUIRED_METADATA_PROOF_FIELDS: Array<keyof LmnrObservabilityMetadataProof> = [
  "requestedSourceUrl",
  "canonicalSourceUrl",
  "homepageStatusCode",
  "homepageContentType",
  "homepageTitle",
  "homepageSnapshotHash",
  "docsOverviewHash",
  "llmsTxtHash",
  "tracingDocsHash",
  "evaluationsQuickstartHash",
  "evaluationConceptsHash",
  "alertsDocsHash",
  "piiRedactionDocsHash",
  "integrationOverviewDocsHash",
  "mcpDocsHash",
  "metadataSnapshotHash",
  "metadataRetrievedAt",
  "amcNativeMappingHash",
  "scoreSurfaceMappingHash",
  "shieldSurfaceMappingHash",
  "watchSurfaceMappingHash",
  "noSdkImporterSubsystemProofHash",
  "noCopiedProseProofHash",
  "baselineDistributionHash",
  "liveSampleManifestHash",
  "driftStatisticHash",
  "alertReceiptHash",
  "signedEvidencePolicyHash",
  "failClosedThresholdPolicyHash",
  "replayCommandHash",
  "ciReceiptHash",
];

const REQUIRED_ROW_PROOF_FIELDS: Array<keyof LmnrObservabilityLiveDriftRow> = [
  "lmnrSurface",
  "lmnrSignal",
  "lmnrProjectIdHash",
  "lmnrTraceIdHash",
  "lmnrSpanTreeHash",
  "lmnrEvaluationRunHash",
  "lmnrDatasetSnapshotHash",
  "lmnrScoreEventHash",
  "lmnrAlertPolicyHash",
  "lmnrAlertReceiptHash",
  "lmnrPrivacyBoundaryHash",
  "lmnrNoRawTracePayloadHash",
  "lmnrNoSdkImporterSubsystemProofHash",
];

function unique(values: unknown): string[] {
  return normalizeEvidenceRefs(values).sort();
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

function metadataMismatchReasons(proof: LmnrObservabilityMetadataProof): string[] {
  const reasons: string[] = [];
  if (normalizeUrl(proof.requestedSourceUrl) !== normalizeUrl(LMNR_OBSERVABILITY_METADATA.requestedSourceUrl)) {
    reasons.push("metadataMismatch.requestedSourceUrl");
  }
  if (normalizeUrl(proof.canonicalSourceUrl) !== normalizeUrl(LMNR_OBSERVABILITY_METADATA.canonicalSourceUrl)) {
    reasons.push("metadataMismatch.canonicalSourceUrl");
  }
  if (proof.homepageStatusCode !== LMNR_OBSERVABILITY_METADATA.statusCode) {
    reasons.push("metadataMismatch.homepageStatusCode");
  }
  if (normalizeText(proof.homepageContentType) !== normalizeText(LMNR_OBSERVABILITY_METADATA.contentType)) {
    reasons.push("metadataMismatch.homepageContentType");
  }
  if (normalizeText(proof.homepageTitle) !== normalizeText(LMNR_OBSERVABILITY_METADATA.title)) {
    reasons.push("metadataMismatch.homepageTitle");
  }
  return reasons;
}

function rowProof(row: LmnrObservabilityLiveDriftRow): LmnrObservabilityRowProof {
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
    lmnrSurface: row.lmnrSurface,
    lmnrSignal: row.lmnrSignal,
    lmnrProjectIdHash: row.lmnrProjectIdHash,
    lmnrTraceIdHash: row.lmnrTraceIdHash,
    lmnrSpanTreeHash: row.lmnrSpanTreeHash,
    lmnrEvaluationRunHash: row.lmnrEvaluationRunHash,
    lmnrDatasetSnapshotHash: row.lmnrDatasetSnapshotHash,
    lmnrScoreEventHash: row.lmnrScoreEventHash,
    lmnrAlertPolicyHash: row.lmnrAlertPolicyHash,
    lmnrAlertReceiptHash: row.lmnrAlertReceiptHash,
    lmnrPrivacyBoundaryHash: row.lmnrPrivacyBoundaryHash,
    lmnrNoRawTracePayloadHash: row.lmnrNoRawTracePayloadHash,
    lmnrNoSdkImporterSubsystemProofHash: row.lmnrNoSdkImporterSubsystemProofHash,
    evidenceRefs: unique(row.evidenceRefs ?? []),
    signedEvidenceRefs: unique(row.signedEvidenceRefs ?? []),
  };
  return {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    surface: row.lmnrSurface,
    signal: row.lmnrSignal,
    rowProofHash: sha256Hex(canonicalize(payload)),
    evidenceRefs: payload.evidenceRefs,
    signedEvidenceRefs: payload.signedEvidenceRefs,
  };
}

function proofStats(proof: LmnrObservabilityMetadataProof, rows: LmnrObservabilityLiveDriftRow[]): {
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
    if (hasNonBlankEvidenceRef(row.evidenceRefs)) {
      present += 1;
    } else {
      missingReasons.push(`${row.traceId}.evidenceRefs`);
    }
    if (hasNonBlankEvidenceRef(row.signedEvidenceRefs)) {
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

function withLmnrObservabilityReceipt(
  receipt: LiveDriftReceipt,
  coverage: number,
  missingReasons: string[],
  proof: LmnrObservabilityMetadataProof,
): LiveDriftReceipt {
  const { receiptHash: _oldHash, ...receiptWithoutHash } = receipt;
  const alertRefs = unique([
    proof.requestedSourceUrl,
    proof.canonicalSourceUrl,
    proof.homepageSnapshotHash,
    proof.docsOverviewHash,
    proof.llmsTxtHash,
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
      alertId: `live-drift:${receipt.agentId}:${receipt.baselineWindowId}:${receipt.liveWindowId}:lmnrObservabilityEvidenceCoverage0to1`,
      metricId: "observabilityEvidenceCoverage0to1",
      severity: coverage < 0.75 ? "critical" : "high",
      message: `LMNR/Laminar-style observability live drift proof is incomplete or mismatched: ${missingReasons.join(", ")}.`,
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
      LMNR_OBSERVABILITY_METADATA.requestedSourceUrl,
      LMNR_OBSERVABILITY_METADATA.canonicalSourceUrl,
      LMNR_OBSERVABILITY_METADATA.docsUrl,
      LMNR_OBSERVABILITY_METADATA.llmsTxtUrl,
      proof.homepageSnapshotHash,
      proof.docsOverviewHash,
      proof.llmsTxtHash,
      proof.amcNativeMappingHash,
      proof.scoreSurfaceMappingHash,
      proof.shieldSurfaceMappingHash,
      proof.watchSurfaceMappingHash,
      proof.noSdkImporterSubsystemProofHash,
      proof.noCopiedProseProofHash,
    ]),
    summary: `${alerts.length} live drift alert(s), recommendation=${recommendation}; LMNR observability metadata-only evidence coverage=${round(coverage)}`,
  });
}

export function runLmnrObservabilityLiveDrift(input: RunLmnrObservabilityLiveDriftInput): LmnrObservabilityLiveDriftResult {
  const allRows = [...input.baselineWindow.rows, ...input.liveWindow.rows];
  const stats = proofStats(input.metadataProof, allRows);
  const lmnrObservabilityEvidenceCoverage0to1 = stats.total === 0 ? 0 : round(stats.present / stats.total);
  const rowProofs = allRows.map(rowProof);
  const receipt = runLiveScoreBehaviorDrift({
    agentId: input.agentId,
    baselineWindow: input.baselineWindow,
    liveWindow: input.liveWindow,
    thresholds: input.thresholds,
    sourceRefs: unique([
      ...(input.sourceRefs ?? []),
      LMNR_OBSERVABILITY_METADATA.requestedSourceUrl,
      LMNR_OBSERVABILITY_METADATA.canonicalSourceUrl,
      input.metadataProof.homepageSnapshotHash,
      input.metadataProof.llmsTxtHash,
      input.metadataProof.amcNativeMappingHash,
    ]),
    now: input.now,
  });
  const enrichedReceipt = withLmnrObservabilityReceipt(
    receipt,
    lmnrObservabilityEvidenceCoverage0to1,
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
    lmnrObservabilityEvidenceCoverage0to1,
    baselineDistribution: enrichedReceipt.baselineDistribution,
    liveSample: enrichedReceipt.liveRows,
    driftStatistic: {
      scoreDrift: enrichedReceipt.scoreDrift,
      behaviorDrift: enrichedReceipt.behaviorDrift,
    },
  };
}
