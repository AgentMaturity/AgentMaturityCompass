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

export const BISHENG_OBSERVABILITY_METADATA = {
  repositoryUrl: "https://github.com/dataelement/bisheng",
  owner: "dataelement",
  repository: "bisheng",
  defaultBranch: "main",
  headCommit: "9eb9328e82e70a27b33b847d39639986394bdc09",
  licenseSpdxId: "Apache-2.0",
  primaryLanguage: "TypeScript",
} as const;

export type BishengObservabilitySurface = "Score" | "Shield" | "Watch";
export type BishengObservabilitySignal =
  | "trace"
  | "evaluation"
  | "dataset"
  | "alert"
  | "dashboard"
  | "rag"
  | "agent"
  | "workflow"
  | "model_management"
  | "custom";

export interface BishengObservabilityMetadataProof {
  repositoryUrl: string;
  defaultBranch: string;
  headCommit: string;
  licenseSpdxId: string;
  primaryLanguage: string;
  repoMetadataHash: string;
  readmeBlobSha: string;
  licenseBlobSha: string;
  tagRefsHash: string;
  metadataRetrievedAt: string;
  amcNativeMappingHash: string;
  scoreSurfaceMappingHash: string;
  shieldSurfaceMappingHash: string;
  watchSurfaceMappingHash: string;
  noBishengSubsystemProofHash: string;
  noSdkImporterProofHash: string;
  noCopiedWorkflowConfigProofHash: string;
  baselineDistributionHash: string;
  liveSampleManifestHash: string;
  driftStatisticHash: string;
  alertReceiptHash: string;
  signedEvidencePolicyHash: string;
  failClosedThresholdPolicyHash: string;
  replayCommandHash: string;
  ciReceiptHash: string;
}

export interface BishengObservabilityLiveDriftRow extends LiveDriftSampleRow {
  bishengSurface: BishengObservabilitySurface;
  bishengSignal: BishengObservabilitySignal;
  bishengProjectHash: string;
  bishengTraceHash: string;
  bishengSpanTreeHash: string;
  bishengEvaluationRunHash: string;
  bishengDatasetSnapshotHash: string;
  bishengScoreEventHash: string;
  bishengAlertPolicyHash: string;
  bishengAlertReceiptHash: string;
  bishengTenantBoundaryHash: string;
  bishengNoRawPayloadHash: string;
  bishengNoWorkflowConfigCopyProofHash: string;
}

export interface BishengObservabilityRowProof {
  traceId: string;
  scenarioId: string;
  surface: BishengObservabilitySurface;
  signal: BishengObservabilitySignal;
  rowProofHash: string;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface RunBishengObservabilityLiveDriftInput {
  agentId: string;
  metadataProof: BishengObservabilityMetadataProof;
  baselineWindow: Omit<LiveDriftWindow, "rows"> & { rows: BishengObservabilityLiveDriftRow[] };
  liveWindow: Omit<LiveDriftWindow, "rows"> & { rows: BishengObservabilityLiveDriftRow[] };
  thresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}

export interface BishengObservabilityDriftStatistic {
  scoreDrift: LiveScoreDrift;
  behaviorDrift: LiveBehaviorDrift;
}

export interface BishengObservabilityScoreSurface {
  baselineDistribution: LiveDriftDistribution;
  liveSample: LiveDriftReceiptRow[];
  driftStatistic: BishengObservabilityDriftStatistic;
  evidenceCoverage0to1: number;
  missingReasons: string[];
  sourceRefs: string[];
}

export interface BishengObservabilityShieldSurface {
  verification: "passed" | "failed";
  failClosed: boolean;
  ciGate: {
    passed: boolean;
    receiptHash: string;
  };
  activeAlerts: LiveDriftAlert[];
  requiredProof: Array<keyof BishengObservabilityMetadataProof>;
}

export interface BishengObservabilityWatchSurface {
  alertCount: number;
  alerts: LiveDriftWatchAlert[];
  alertReceiptHash: string;
  evidenceCoverage0to1: number;
}

export interface BishengObservabilityLiveDriftResult {
  receipt: LiveDriftReceipt;
  alertReceipt: LiveDriftReceipt;
  watchAlerts: LiveDriftWatchAlert[];
  metadataProof: BishengObservabilityMetadataProof;
  rowProofs: BishengObservabilityRowProof[];
  missingReasons: string[];
  bishengObservabilityEvidenceCoverage0to1: number;
  baselineDistribution: LiveDriftDistribution;
  liveSample: LiveDriftReceiptRow[];
  driftStatistic: BishengObservabilityDriftStatistic;
  scoreSurface: BishengObservabilityScoreSurface;
  shieldSurface: BishengObservabilityShieldSurface;
  watchSurface: BishengObservabilityWatchSurface;
}

const REQUIRED_METADATA_PROOF_FIELDS: Array<keyof BishengObservabilityMetadataProof> = [
  "repositoryUrl",
  "defaultBranch",
  "headCommit",
  "licenseSpdxId",
  "primaryLanguage",
  "repoMetadataHash",
  "readmeBlobSha",
  "licenseBlobSha",
  "tagRefsHash",
  "metadataRetrievedAt",
  "amcNativeMappingHash",
  "scoreSurfaceMappingHash",
  "shieldSurfaceMappingHash",
  "watchSurfaceMappingHash",
  "noBishengSubsystemProofHash",
  "noSdkImporterProofHash",
  "noCopiedWorkflowConfigProofHash",
  "baselineDistributionHash",
  "liveSampleManifestHash",
  "driftStatisticHash",
  "alertReceiptHash",
  "signedEvidencePolicyHash",
  "failClosedThresholdPolicyHash",
  "replayCommandHash",
  "ciReceiptHash",
];

const REQUIRED_ROW_PROOF_FIELDS: Array<keyof BishengObservabilityLiveDriftRow> = [
  "bishengSurface",
  "bishengSignal",
  "bishengProjectHash",
  "bishengTraceHash",
  "bishengSpanTreeHash",
  "bishengEvaluationRunHash",
  "bishengDatasetSnapshotHash",
  "bishengScoreEventHash",
  "bishengAlertPolicyHash",
  "bishengAlertReceiptHash",
  "bishengTenantBoundaryHash",
  "bishengNoRawPayloadHash",
  "bishengNoWorkflowConfigCopyProofHash",
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
  return value.trim().replace(/:443(?=\/|$)/, "").replace(/\/$/, "").toLowerCase();
}

function metadataMismatchReasons(proof: BishengObservabilityMetadataProof): string[] {
  const reasons: string[] = [];
  if (normalizeUrl(proof.repositoryUrl) !== normalizeUrl(BISHENG_OBSERVABILITY_METADATA.repositoryUrl)) {
    reasons.push("metadataMismatch.repositoryUrl");
  }
  if (normalizeText(proof.defaultBranch) !== BISHENG_OBSERVABILITY_METADATA.defaultBranch) {
    reasons.push("metadataMismatch.defaultBranch");
  }
  if (proof.headCommit !== BISHENG_OBSERVABILITY_METADATA.headCommit) {
    reasons.push("metadataMismatch.headCommit");
  }
  if (normalizeText(proof.licenseSpdxId) !== normalizeText(BISHENG_OBSERVABILITY_METADATA.licenseSpdxId)) {
    reasons.push("metadataMismatch.licenseSpdxId");
  }
  if (normalizeText(proof.primaryLanguage) !== normalizeText(BISHENG_OBSERVABILITY_METADATA.primaryLanguage)) {
    reasons.push("metadataMismatch.primaryLanguage");
  }
  return reasons;
}

function rowProof(row: BishengObservabilityLiveDriftRow): BishengObservabilityRowProof {
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
    bishengSurface: row.bishengSurface,
    bishengSignal: row.bishengSignal,
    bishengProjectHash: row.bishengProjectHash,
    bishengTraceHash: row.bishengTraceHash,
    bishengSpanTreeHash: row.bishengSpanTreeHash,
    bishengEvaluationRunHash: row.bishengEvaluationRunHash,
    bishengDatasetSnapshotHash: row.bishengDatasetSnapshotHash,
    bishengScoreEventHash: row.bishengScoreEventHash,
    bishengAlertPolicyHash: row.bishengAlertPolicyHash,
    bishengAlertReceiptHash: row.bishengAlertReceiptHash,
    bishengTenantBoundaryHash: row.bishengTenantBoundaryHash,
    bishengNoRawPayloadHash: row.bishengNoRawPayloadHash,
    bishengNoWorkflowConfigCopyProofHash: row.bishengNoWorkflowConfigCopyProofHash,
    evidenceRefs: unique(row.evidenceRefs ?? []),
    signedEvidenceRefs: unique(row.signedEvidenceRefs ?? []),
  };
  return {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    surface: row.bishengSurface,
    signal: row.bishengSignal,
    rowProofHash: sha256Hex(canonicalize(payload)),
    evidenceRefs: payload.evidenceRefs,
    signedEvidenceRefs: payload.signedEvidenceRefs,
  };
}

function proofStats(proof: BishengObservabilityMetadataProof, rows: BishengObservabilityLiveDriftRow[]): {
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

function withBishengObservabilityReceipt(
  receipt: LiveDriftReceipt,
  coverage: number,
  missingReasons: string[],
  proof: BishengObservabilityMetadataProof,
): LiveDriftReceipt {
  const { receiptHash: _oldHash, ...receiptWithoutHash } = receipt;
  const alertRefs = unique([
    BISHENG_OBSERVABILITY_METADATA.repositoryUrl,
    proof.repoMetadataHash,
    proof.readmeBlobSha,
    proof.licenseBlobSha,
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
      alertId: `live-drift:${receipt.agentId}:${receipt.baselineWindowId}:${receipt.liveWindowId}:bishengObservabilityEvidenceCoverage0to1`,
      metricId: "observabilityEvidenceCoverage0to1",
      severity: coverage < 0.75 ? "critical" : "high",
      message: `Bisheng-style observability live drift proof is incomplete or mismatched: ${missingReasons.join(", ")}.`,
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
      BISHENG_OBSERVABILITY_METADATA.repositoryUrl,
      `${BISHENG_OBSERVABILITY_METADATA.repositoryUrl}/tree/${BISHENG_OBSERVABILITY_METADATA.headCommit}`,
      proof.repoMetadataHash,
      proof.readmeBlobSha,
      proof.licenseBlobSha,
      proof.tagRefsHash,
      proof.amcNativeMappingHash,
      proof.scoreSurfaceMappingHash,
      proof.shieldSurfaceMappingHash,
      proof.watchSurfaceMappingHash,
      proof.noBishengSubsystemProofHash,
      proof.noSdkImporterProofHash,
      proof.noCopiedWorkflowConfigProofHash,
    ]),
    summary: `${alerts.length} live drift alert(s), recommendation=${recommendation}; Bisheng observability metadata-only evidence coverage=${round(coverage)}`,
  });
}

export function buildBishengObservabilityScoreSurface(
  receipt: LiveDriftReceipt,
  coverage: number,
  missingReasons: string[],
): BishengObservabilityScoreSurface {
  return {
    baselineDistribution: receipt.baselineDistribution,
    liveSample: receipt.liveRows,
    driftStatistic: {
      scoreDrift: receipt.scoreDrift,
      behaviorDrift: receipt.behaviorDrift,
    },
    evidenceCoverage0to1: coverage,
    missingReasons,
    sourceRefs: receipt.sourceRefs,
  };
}

export function buildBishengObservabilityShieldSurface(
  receipt: LiveDriftReceipt,
  metadataProof: BishengObservabilityMetadataProof,
): BishengObservabilityShieldSurface {
  return {
    verification: receipt.failClosed ? "failed" : "passed",
    failClosed: receipt.failClosed,
    ciGate: {
      passed: !receipt.failClosed && metadataProof.ciReceiptHash.trim().length > 0,
      receiptHash: metadataProof.ciReceiptHash,
    },
    activeAlerts: receipt.alerts,
    requiredProof: [...REQUIRED_METADATA_PROOF_FIELDS],
  };
}

export function buildBishengObservabilityWatchSurface(
  receipt: LiveDriftReceipt,
  alerts: LiveDriftWatchAlert[],
  coverage: number,
): BishengObservabilityWatchSurface {
  return {
    alertCount: alerts.length,
    alerts,
    alertReceiptHash: receipt.receiptHash,
    evidenceCoverage0to1: coverage,
  };
}

export function runBishengObservabilityLiveDrift(input: RunBishengObservabilityLiveDriftInput): BishengObservabilityLiveDriftResult {
  const allRows = [...input.baselineWindow.rows, ...input.liveWindow.rows];
  const stats = proofStats(input.metadataProof, allRows);
  const bishengObservabilityEvidenceCoverage0to1 = stats.total === 0 ? 0 : round(stats.present / stats.total);
  const rowProofs = allRows.map(rowProof);
  const receipt = runLiveScoreBehaviorDrift({
    agentId: input.agentId,
    baselineWindow: input.baselineWindow,
    liveWindow: input.liveWindow,
    thresholds: input.thresholds,
    sourceRefs: unique([
      ...(input.sourceRefs ?? []),
      BISHENG_OBSERVABILITY_METADATA.repositoryUrl,
      input.metadataProof.repoMetadataHash,
      input.metadataProof.amcNativeMappingHash,
    ]),
    now: input.now,
  });
  const enrichedReceipt = withBishengObservabilityReceipt(
    receipt,
    bishengObservabilityEvidenceCoverage0to1,
    stats.missingReasons,
    input.metadataProof,
  );
  const watchAlerts = buildLiveDriftWatchAlerts(enrichedReceipt);
  const scoreSurface = buildBishengObservabilityScoreSurface(
    enrichedReceipt,
    bishengObservabilityEvidenceCoverage0to1,
    stats.missingReasons,
  );
  const shieldSurface = buildBishengObservabilityShieldSurface(enrichedReceipt, input.metadataProof);
  const watchSurface = buildBishengObservabilityWatchSurface(
    enrichedReceipt,
    watchAlerts,
    bishengObservabilityEvidenceCoverage0to1,
  );

  return {
    receipt: enrichedReceipt,
    alertReceipt: enrichedReceipt,
    watchAlerts,
    metadataProof: input.metadataProof,
    rowProofs,
    missingReasons: stats.missingReasons,
    bishengObservabilityEvidenceCoverage0to1,
    baselineDistribution: enrichedReceipt.baselineDistribution,
    liveSample: enrichedReceipt.liveRows,
    driftStatistic: scoreSurface.driftStatistic,
    scoreSurface,
    shieldSurface,
    watchSurface,
  };
}
