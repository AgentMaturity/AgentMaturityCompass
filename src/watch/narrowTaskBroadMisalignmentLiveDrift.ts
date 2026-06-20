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

export const NARROW_TASK_BROAD_MISALIGNMENT_METADATA = {
  openAlexWorkId: "W7124177090",
  doi: "10.1038/s41586-025-09937-5",
  doiUrl: "https://doi.org/10.1038/s41586-025-09937-5",
  title: "Training large language models on narrow tasks can lead to broad misalignment",
  venue: "Nature",
  publisher: "Springer Science and Business Media LLC",
  publicationYear: 2026,
  publicationDate: "2026-01-14",
  openAlexType: "article",
  crossrefType: "journal-article",
  openAlexLicense: "cc-by",
} as const;

export type NarrowTaskBroadMisalignmentSurface = "Score" | "Shield" | "Watch";
export type NarrowTaskBroadMisalignmentRiskSignal =
  | "behavioral_generalization"
  | "goal_integrity"
  | "safety_policy_adherence"
  | "authority_handoff";

export interface NarrowTaskBroadMisalignmentMetadataProof {
  openAlexWorkId: string;
  doi: string;
  title: string;
  venue: string;
  publisher: string;
  publicationYear: number;
  publicationDate: string;
  openAlexType: string;
  crossrefType: string;
  openAlexLicense: string;
  openAlexSourceHash: string;
  crossrefSourceHash: string;
  publisherLandingPageHash: string;
  metadataSnapshotHash: string;
  metadataRetrievedAt: string;
  relevanceMappingHash: string;
  scoreSurfaceMappingHash: string;
  shieldSurfaceMappingHash: string;
  watchSurfaceMappingHash: string;
  baselineDistributionHash: string;
  liveSampleManifestHash: string;
  driftStatisticHash: string;
  alertReceiptHash: string;
  noPaperProseCopiedHash: string;
}

export interface NarrowTaskBroadMisalignmentLiveDriftRow extends LiveDriftSampleRow {
  ntbmSurface: NarrowTaskBroadMisalignmentSurface;
  ntbmRiskSignal: NarrowTaskBroadMisalignmentRiskSignal;
  ntbmControlId: string;
  ntbmMetadataSnapshotHash: string;
  ntbmBaselineDistributionHash: string;
  ntbmLiveSampleManifestHash: string;
  ntbmDriftStatisticHash: string;
  ntbmAlertReceiptHash: string;
  ntbmScoreEvidenceHash?: string;
  ntbmShieldPolicyHash?: string;
  ntbmWatchSignalHash?: string;
  ntbmNoPaperProseCopiedHash: string;
}

export interface NarrowTaskBroadMisalignmentRowProof {
  traceId: string;
  scenarioId: string;
  surface: NarrowTaskBroadMisalignmentSurface;
  riskSignal: NarrowTaskBroadMisalignmentRiskSignal;
  rowProofHash: string;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface RunNarrowTaskBroadMisalignmentLiveDriftInput {
  agentId: string;
  metadataProof: NarrowTaskBroadMisalignmentMetadataProof;
  baselineWindow: Omit<LiveDriftWindow, "rows"> & { rows: NarrowTaskBroadMisalignmentLiveDriftRow[] };
  liveWindow: Omit<LiveDriftWindow, "rows"> & { rows: NarrowTaskBroadMisalignmentLiveDriftRow[] };
  thresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}

export interface NarrowTaskBroadMisalignmentDriftStatistic {
  scoreDrift: LiveScoreDrift;
  behaviorDrift: LiveBehaviorDrift;
}

export interface NarrowTaskBroadMisalignmentLiveDriftResult {
  receipt: LiveDriftReceipt;
  alertReceipt: LiveDriftReceipt;
  watchAlerts: LiveDriftWatchAlert[];
  metadataProof: NarrowTaskBroadMisalignmentMetadataProof;
  rowProofs: NarrowTaskBroadMisalignmentRowProof[];
  missingReasons: string[];
  narrowTaskBroadMisalignmentEvidenceCoverage0to1: number;
  baselineDistribution: LiveDriftDistribution;
  liveSample: LiveDriftReceiptRow[];
  driftStatistic: NarrowTaskBroadMisalignmentDriftStatistic;
}

const REQUIRED_METADATA_PROOF_FIELDS: Array<keyof NarrowTaskBroadMisalignmentMetadataProof> = [
  "openAlexWorkId",
  "doi",
  "title",
  "venue",
  "publisher",
  "publicationYear",
  "publicationDate",
  "openAlexType",
  "crossrefType",
  "openAlexLicense",
  "openAlexSourceHash",
  "crossrefSourceHash",
  "publisherLandingPageHash",
  "metadataSnapshotHash",
  "metadataRetrievedAt",
  "relevanceMappingHash",
  "scoreSurfaceMappingHash",
  "shieldSurfaceMappingHash",
  "watchSurfaceMappingHash",
  "baselineDistributionHash",
  "liveSampleManifestHash",
  "driftStatisticHash",
  "alertReceiptHash",
  "noPaperProseCopiedHash",
];

const REQUIRED_ROW_PROOF_FIELDS: Array<keyof NarrowTaskBroadMisalignmentLiveDriftRow> = [
  "ntbmSurface",
  "ntbmRiskSignal",
  "ntbmControlId",
  "ntbmMetadataSnapshotHash",
  "ntbmBaselineDistributionHash",
  "ntbmLiveSampleManifestHash",
  "ntbmDriftStatisticHash",
  "ntbmAlertReceiptHash",
  "ntbmNoPaperProseCopiedHash",
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

function normalizeDoi(value: string): string {
  return normalizeText(value).replace(/^https?:\/\/doi\.org\//, "");
}

function normalizeOpenAlexWorkId(value: string): string {
  const normalized = value.trim().replace(/^https?:\/\/openalex\.org\//i, "");
  return normalized.toUpperCase();
}

function metadataMismatchReasons(proof: NarrowTaskBroadMisalignmentMetadataProof): string[] {
  const reasons: string[] = [];
  if (normalizeOpenAlexWorkId(proof.openAlexWorkId) !== NARROW_TASK_BROAD_MISALIGNMENT_METADATA.openAlexWorkId) {
    reasons.push("metadataMismatch.openAlexWorkId");
  }
  if (normalizeDoi(proof.doi) !== NARROW_TASK_BROAD_MISALIGNMENT_METADATA.doi) {
    reasons.push("metadataMismatch.doi");
  }
  if (normalizeText(proof.title) !== normalizeText(NARROW_TASK_BROAD_MISALIGNMENT_METADATA.title)) {
    reasons.push("metadataMismatch.title");
  }
  if (normalizeText(proof.venue) !== normalizeText(NARROW_TASK_BROAD_MISALIGNMENT_METADATA.venue)) {
    reasons.push("metadataMismatch.venue");
  }
  if (normalizeText(proof.publisher) !== normalizeText(NARROW_TASK_BROAD_MISALIGNMENT_METADATA.publisher)) {
    reasons.push("metadataMismatch.publisher");
  }
  if (proof.publicationYear !== NARROW_TASK_BROAD_MISALIGNMENT_METADATA.publicationYear) {
    reasons.push("metadataMismatch.publicationYear");
  }
  if (proof.publicationDate !== NARROW_TASK_BROAD_MISALIGNMENT_METADATA.publicationDate) {
    reasons.push("metadataMismatch.publicationDate");
  }
  if (normalizeText(proof.openAlexType) !== NARROW_TASK_BROAD_MISALIGNMENT_METADATA.openAlexType) {
    reasons.push("metadataMismatch.openAlexType");
  }
  if (normalizeText(proof.crossrefType) !== NARROW_TASK_BROAD_MISALIGNMENT_METADATA.crossrefType) {
    reasons.push("metadataMismatch.crossrefType");
  }
  if (normalizeText(proof.openAlexLicense) !== NARROW_TASK_BROAD_MISALIGNMENT_METADATA.openAlexLicense) {
    reasons.push("metadataMismatch.openAlexLicense");
  }
  return reasons;
}

function rowProof(row: NarrowTaskBroadMisalignmentLiveDriftRow): NarrowTaskBroadMisalignmentRowProof {
  const payload = {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    ntbmSurface: row.ntbmSurface,
    ntbmRiskSignal: row.ntbmRiskSignal,
    ntbmControlId: row.ntbmControlId,
    ntbmMetadataSnapshotHash: row.ntbmMetadataSnapshotHash,
    ntbmBaselineDistributionHash: row.ntbmBaselineDistributionHash,
    ntbmLiveSampleManifestHash: row.ntbmLiveSampleManifestHash,
    ntbmDriftStatisticHash: row.ntbmDriftStatisticHash,
    ntbmAlertReceiptHash: row.ntbmAlertReceiptHash,
    ntbmScoreEvidenceHash: row.ntbmScoreEvidenceHash ?? null,
    ntbmShieldPolicyHash: row.ntbmShieldPolicyHash ?? null,
    ntbmWatchSignalHash: row.ntbmWatchSignalHash ?? null,
    ntbmNoPaperProseCopiedHash: row.ntbmNoPaperProseCopiedHash,
    evidenceRefs: unique(row.evidenceRefs ?? []),
    signedEvidenceRefs: unique(row.signedEvidenceRefs ?? []),
  };
  return {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    surface: row.ntbmSurface,
    riskSignal: row.ntbmRiskSignal,
    rowProofHash: sha256Hex(canonicalize(payload)),
    evidenceRefs: payload.evidenceRefs,
    signedEvidenceRefs: payload.signedEvidenceRefs,
  };
}

function proofStats(proof: NarrowTaskBroadMisalignmentMetadataProof, rows: NarrowTaskBroadMisalignmentLiveDriftRow[]): {
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

function withNarrowTaskBroadMisalignmentReceipt(
  receipt: LiveDriftReceipt,
  coverage: number,
  missingReasons: string[],
  proof: NarrowTaskBroadMisalignmentMetadataProof,
): LiveDriftReceipt {
  const { receiptHash: _oldHash, ...receiptWithoutHash } = receipt;
  const alertRefs = unique([
    proof.openAlexWorkId,
    proof.doi,
    proof.openAlexSourceHash,
    proof.crossrefSourceHash,
    proof.publisherLandingPageHash,
    proof.metadataSnapshotHash,
    proof.relevanceMappingHash,
    proof.baselineDistributionHash,
    proof.liveSampleManifestHash,
    proof.driftStatisticHash,
    proof.alertReceiptHash,
  ]);
  const signedRefs = unique([proof.alertReceiptHash]);
  const alerts: LiveDriftAlert[] = [...receipt.alerts];

  if (missingReasons.length > 0) {
    alerts.push({
      alertId: `live-drift:${receipt.agentId}:${receipt.baselineWindowId}:${receipt.liveWindowId}:narrowTaskBroadMisalignmentEvidenceCoverage0to1`,
      metricId: "narrowTaskBroadMisalignmentEvidenceCoverage0to1",
      severity: coverage < 0.75 ? "critical" : "high",
      message: `Narrow-task broad-misalignment live drift metadata/proof is incomplete or mismatched: ${missingReasons.join(", ")}.`,
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
      NARROW_TASK_BROAD_MISALIGNMENT_METADATA.doiUrl,
      `https://openalex.org/${NARROW_TASK_BROAD_MISALIGNMENT_METADATA.openAlexWorkId}`,
      proof.openAlexWorkId,
      proof.doi,
      proof.title,
      proof.venue,
      proof.publisher,
      proof.metadataSnapshotHash,
      proof.relevanceMappingHash,
      proof.scoreSurfaceMappingHash,
      proof.shieldSurfaceMappingHash,
      proof.watchSurfaceMappingHash,
      proof.noPaperProseCopiedHash,
    ]),
    summary: `${alerts.length} live drift alert(s), recommendation=${recommendation}; narrow-task broad-misalignment metadata-only evidence coverage=${round(coverage)}`,
  });
}

export function runNarrowTaskBroadMisalignmentLiveDrift(
  input: RunNarrowTaskBroadMisalignmentLiveDriftInput,
): NarrowTaskBroadMisalignmentLiveDriftResult {
  const allRows = [...input.baselineWindow.rows, ...input.liveWindow.rows];
  const stats = proofStats(input.metadataProof, allRows);
  const narrowTaskBroadMisalignmentEvidenceCoverage0to1 = stats.total === 0 ? 0 : round(stats.present / stats.total);
  const rowProofs = allRows.map(rowProof);
  const receipt = runLiveScoreBehaviorDrift({
    agentId: input.agentId,
    baselineWindow: input.baselineWindow,
    liveWindow: input.liveWindow,
    thresholds: input.thresholds,
    sourceRefs: unique([
      ...(input.sourceRefs ?? []),
      NARROW_TASK_BROAD_MISALIGNMENT_METADATA.doiUrl,
      `https://openalex.org/${NARROW_TASK_BROAD_MISALIGNMENT_METADATA.openAlexWorkId}`,
      input.metadataProof.metadataSnapshotHash,
      input.metadataProof.relevanceMappingHash,
    ]),
    now: input.now,
  });
  const enrichedReceipt = withNarrowTaskBroadMisalignmentReceipt(
    receipt,
    narrowTaskBroadMisalignmentEvidenceCoverage0to1,
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
    narrowTaskBroadMisalignmentEvidenceCoverage0to1,
    baselineDistribution: enrichedReceipt.baselineDistribution,
    liveSample: enrichedReceipt.liveRows,
    driftStatistic: {
      scoreDrift: enrichedReceipt.scoreDrift,
      behaviorDrift: enrichedReceipt.behaviorDrift,
    },
  };
}
