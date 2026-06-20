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

export const TRISM_AGENTIC_AI_METADATA = {
  openAlexWorkId: "W7133236347",
  doi: "10.1016/j.aiopen.2026.02.006",
  doiUrl: "https://doi.org/10.1016/j.aiopen.2026.02.006",
  title: "TRiSM for Agentic AI: A review of Trust, Risk, and Security Management in LLM-based Agentic Multi-Agent Systems",
  venue: "AI Open",
  publisher: "Elsevier BV",
  publicationYear: 2026,
  publicationDate: "2026-01-01",
  openAlexType: "article",
  crossrefType: "journal-article",
  openAlexLicense: "cc-by-nc-nd",
} as const;

export type TrismAgenticSurface = "Score" | "Shield" | "Watch";
export type TrismAgenticRiskSignal =
  | "trust"
  | "risk"
  | "security"
  | "privacy"
  | "modelops"
  | "lifecycle_governance";

export interface TrismAgenticMetadataProof {
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

export interface TrismAgenticLiveDriftRow extends LiveDriftSampleRow {
  trismSurface: TrismAgenticSurface;
  trismRiskSignal: TrismAgenticRiskSignal;
  trismControlId: string;
  trismMetadataSnapshotHash: string;
  trismBaselineDistributionHash: string;
  trismLiveSampleManifestHash: string;
  trismDriftStatisticHash: string;
  trismAlertReceiptHash: string;
  trismScoreEvidenceHash?: string;
  trismShieldPolicyHash?: string;
  trismWatchSignalHash?: string;
  trismNoPaperProseCopiedHash: string;
}

export interface TrismAgenticRowProof {
  traceId: string;
  scenarioId: string;
  surface: TrismAgenticSurface;
  riskSignal: TrismAgenticRiskSignal;
  rowProofHash: string;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface RunTrismAgenticLiveDriftInput {
  agentId: string;
  metadataProof: TrismAgenticMetadataProof;
  baselineWindow: Omit<LiveDriftWindow, "rows"> & { rows: TrismAgenticLiveDriftRow[] };
  liveWindow: Omit<LiveDriftWindow, "rows"> & { rows: TrismAgenticLiveDriftRow[] };
  thresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}

export interface TrismAgenticDriftStatistic {
  scoreDrift: LiveScoreDrift;
  behaviorDrift: LiveBehaviorDrift;
}

export interface TrismAgenticLiveDriftResult {
  receipt: LiveDriftReceipt;
  alertReceipt: LiveDriftReceipt;
  watchAlerts: LiveDriftWatchAlert[];
  metadataProof: TrismAgenticMetadataProof;
  rowProofs: TrismAgenticRowProof[];
  missingReasons: string[];
  trismAgenticEvidenceCoverage0to1: number;
  baselineDistribution: LiveDriftDistribution;
  liveSample: LiveDriftReceiptRow[];
  driftStatistic: TrismAgenticDriftStatistic;
}

const REQUIRED_METADATA_PROOF_FIELDS: Array<keyof TrismAgenticMetadataProof> = [
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

const REQUIRED_ROW_PROOF_FIELDS: Array<keyof TrismAgenticLiveDriftRow> = [
  "trismSurface",
  "trismRiskSignal",
  "trismControlId",
  "trismMetadataSnapshotHash",
  "trismBaselineDistributionHash",
  "trismLiveSampleManifestHash",
  "trismDriftStatisticHash",
  "trismAlertReceiptHash",
  "trismNoPaperProseCopiedHash",
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

function metadataMismatchReasons(proof: TrismAgenticMetadataProof): string[] {
  const reasons: string[] = [];
  if (normalizeOpenAlexWorkId(proof.openAlexWorkId) !== TRISM_AGENTIC_AI_METADATA.openAlexWorkId) {
    reasons.push("metadataMismatch.openAlexWorkId");
  }
  if (normalizeDoi(proof.doi) !== TRISM_AGENTIC_AI_METADATA.doi) {
    reasons.push("metadataMismatch.doi");
  }
  if (normalizeText(proof.title) !== normalizeText(TRISM_AGENTIC_AI_METADATA.title)) {
    reasons.push("metadataMismatch.title");
  }
  if (normalizeText(proof.venue) !== normalizeText(TRISM_AGENTIC_AI_METADATA.venue)) {
    reasons.push("metadataMismatch.venue");
  }
  if (normalizeText(proof.publisher) !== normalizeText(TRISM_AGENTIC_AI_METADATA.publisher)) {
    reasons.push("metadataMismatch.publisher");
  }
  if (proof.publicationYear !== TRISM_AGENTIC_AI_METADATA.publicationYear) {
    reasons.push("metadataMismatch.publicationYear");
  }
  if (proof.publicationDate !== TRISM_AGENTIC_AI_METADATA.publicationDate) {
    reasons.push("metadataMismatch.publicationDate");
  }
  if (normalizeText(proof.openAlexType) !== TRISM_AGENTIC_AI_METADATA.openAlexType) {
    reasons.push("metadataMismatch.openAlexType");
  }
  if (normalizeText(proof.crossrefType) !== TRISM_AGENTIC_AI_METADATA.crossrefType) {
    reasons.push("metadataMismatch.crossrefType");
  }
  if (normalizeText(proof.openAlexLicense) !== TRISM_AGENTIC_AI_METADATA.openAlexLicense) {
    reasons.push("metadataMismatch.openAlexLicense");
  }
  return reasons;
}

function rowProof(row: TrismAgenticLiveDriftRow): TrismAgenticRowProof {
  const payload = {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    trismSurface: row.trismSurface,
    trismRiskSignal: row.trismRiskSignal,
    trismControlId: row.trismControlId,
    trismMetadataSnapshotHash: row.trismMetadataSnapshotHash,
    trismBaselineDistributionHash: row.trismBaselineDistributionHash,
    trismLiveSampleManifestHash: row.trismLiveSampleManifestHash,
    trismDriftStatisticHash: row.trismDriftStatisticHash,
    trismAlertReceiptHash: row.trismAlertReceiptHash,
    trismScoreEvidenceHash: row.trismScoreEvidenceHash ?? null,
    trismShieldPolicyHash: row.trismShieldPolicyHash ?? null,
    trismWatchSignalHash: row.trismWatchSignalHash ?? null,
    trismNoPaperProseCopiedHash: row.trismNoPaperProseCopiedHash,
    evidenceRefs: unique(row.evidenceRefs ?? []),
    signedEvidenceRefs: unique(row.signedEvidenceRefs ?? []),
  };
  return {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    surface: row.trismSurface,
    riskSignal: row.trismRiskSignal,
    rowProofHash: sha256Hex(canonicalize(payload)),
    evidenceRefs: payload.evidenceRefs,
    signedEvidenceRefs: payload.signedEvidenceRefs,
  };
}

function proofStats(proof: TrismAgenticMetadataProof, rows: TrismAgenticLiveDriftRow[]): {
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

function withTrismAgenticReceipt(
  receipt: LiveDriftReceipt,
  coverage: number,
  missingReasons: string[],
  proof: TrismAgenticMetadataProof,
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
      alertId: `live-drift:${receipt.agentId}:${receipt.baselineWindowId}:${receipt.liveWindowId}:trismAgenticEvidenceCoverage0to1`,
      metricId: "trismAgenticEvidenceCoverage0to1",
      severity: coverage < 0.75 ? "critical" : "high",
      message: `TRiSM agentic live drift metadata/proof is incomplete or mismatched: ${missingReasons.join(", ")}.`,
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
      TRISM_AGENTIC_AI_METADATA.doiUrl,
      `https://openalex.org/${TRISM_AGENTIC_AI_METADATA.openAlexWorkId}`,
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
    summary: `${alerts.length} live drift alert(s), recommendation=${recommendation}; TRiSM metadata-only evidence coverage=${round(coverage)}`,
  });
}

export function runTrismAgenticLiveDrift(input: RunTrismAgenticLiveDriftInput): TrismAgenticLiveDriftResult {
  const allRows = [...input.baselineWindow.rows, ...input.liveWindow.rows];
  const stats = proofStats(input.metadataProof, allRows);
  const trismAgenticEvidenceCoverage0to1 = stats.total === 0 ? 0 : round(stats.present / stats.total);
  const rowProofs = allRows.map(rowProof);
  const receipt = runLiveScoreBehaviorDrift({
    agentId: input.agentId,
    baselineWindow: input.baselineWindow,
    liveWindow: input.liveWindow,
    thresholds: input.thresholds,
    sourceRefs: unique([
      ...(input.sourceRefs ?? []),
      TRISM_AGENTIC_AI_METADATA.doiUrl,
      `https://openalex.org/${TRISM_AGENTIC_AI_METADATA.openAlexWorkId}`,
      input.metadataProof.metadataSnapshotHash,
      input.metadataProof.relevanceMappingHash,
    ]),
    now: input.now,
  });
  const enrichedReceipt = withTrismAgenticReceipt(
    receipt,
    trismAgenticEvidenceCoverage0to1,
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
    trismAgenticEvidenceCoverage0to1,
    baselineDistribution: enrichedReceipt.baselineDistribution,
    liveSample: enrichedReceipt.liveRows,
    driftStatistic: {
      scoreDrift: enrichedReceipt.scoreDrift,
      behaviorDrift: enrichedReceipt.behaviorDrift,
    },
  };
}
