import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  type LiveDriftAlert,
  type LiveDriftReceipt,
  type LiveDriftThresholds,
  type LiveDriftWatchAlert,
  type LiveDriftWindow,
  type LiveDriftSampleRow,
} from "./liveDriftAlerts.js";

export type SkillMatchResumeTaskType =
  | "resume_summary"
  | "job_match"
  | "strength_weakness"
  | "improvement_suggestions"
  | "pdf_extraction"
  | "custom";

export type SkillMatchResumeFormat = "pdf" | "docx" | "txt" | "html" | "custom";

export interface SkillMatchResumeSourceProof {
  sourceRefHash: string;
  repositorySnapshotHash: string;
  noLicenseBoundaryHash: string;
  defaultBranchHash: string;
  readmeBlobHash: string;
  dockerfileHash: string;
  frontendTreeHash: string;
  frontendPackageHash: string;
  frontendLockHash: string;
  frontendAnalyzerComponentHash: string;
  frontendPdfExtractorHash: string;
  oldVersionTreeHash: string;
  oldAppHash: string;
  oldNotebookHash: string;
  requirementsHash: string;
  modelProviderManifestHash: string;
  resumeTaskTaxonomyHash: string;
  ragInputCorpusManifestHash: string;
  baselineDistributionHash: string;
  liveSampleManifestHash: string;
  driftStatisticHash: string;
  alertReceiptHash: string;
  replayCommandHash: string;
  ciReceiptHash: string;
  noSourceCopyProofHash: string;
  noResumeCopyProofHash: string;
  privacyBoundaryHash: string;
}

export interface SkillMatchResumeLiveDriftRow extends LiveDriftSampleRow {
  skillMatchTaskType: SkillMatchResumeTaskType;
  skillMatchResumeFormat: SkillMatchResumeFormat;
  skillMatchProviderRouteHash: string;
  skillMatchPromptPolicyHash: string;
  skillMatchResumeInputHash: string;
  skillMatchJobDescriptionHash: string;
  skillMatchRagContextHash: string;
  skillMatchAnalysisOutputHash: string;
  skillMatchEvaluatorTraceHash: string;
  skillMatchNoResumeCopyProofHash: string;
  skillMatchNoSourceCopyProofHash: string;
  skillMatchParserAccuracy0to1?: number;
  skillMatchGroundingScore0to1?: number;
  skillMatchSuggestionQuality0to1?: number;
  skillMatchPiiRedactionPassed?: boolean;
}

export interface SkillMatchResumeRowProof {
  traceId: string;
  scenarioId: string;
  taskType: SkillMatchResumeTaskType;
  resumeFormat: SkillMatchResumeFormat;
  rowProofHash: string;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface RunSkillMatchResumeLiveDriftInput {
  agentId: string;
  sourceProof: SkillMatchResumeSourceProof;
  baselineWindow: Omit<LiveDriftWindow, "rows"> & { rows: SkillMatchResumeLiveDriftRow[] };
  liveWindow: Omit<LiveDriftWindow, "rows"> & { rows: SkillMatchResumeLiveDriftRow[] };
  thresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}

export interface SkillMatchResumeLiveDriftResult {
  receipt: LiveDriftReceipt;
  watchAlerts: LiveDriftWatchAlert[];
  sourceProof: SkillMatchResumeSourceProof;
  rowProofs: SkillMatchResumeRowProof[];
  missingReasons: string[];
  skillMatchEvidenceCoverage0to1: number;
}

const REQUIRED_SOURCE_PROOF_FIELDS: Array<keyof SkillMatchResumeSourceProof> = [
  "sourceRefHash",
  "repositorySnapshotHash",
  "noLicenseBoundaryHash",
  "defaultBranchHash",
  "readmeBlobHash",
  "dockerfileHash",
  "frontendTreeHash",
  "frontendPackageHash",
  "frontendLockHash",
  "frontendAnalyzerComponentHash",
  "frontendPdfExtractorHash",
  "oldVersionTreeHash",
  "oldAppHash",
  "oldNotebookHash",
  "requirementsHash",
  "modelProviderManifestHash",
  "resumeTaskTaxonomyHash",
  "ragInputCorpusManifestHash",
  "baselineDistributionHash",
  "liveSampleManifestHash",
  "driftStatisticHash",
  "alertReceiptHash",
  "replayCommandHash",
  "ciReceiptHash",
  "noSourceCopyProofHash",
  "noResumeCopyProofHash",
  "privacyBoundaryHash",
];

const REQUIRED_ROW_PROOF_FIELDS: Array<keyof SkillMatchResumeLiveDriftRow> = [
  "skillMatchTaskType",
  "skillMatchResumeFormat",
  "skillMatchProviderRouteHash",
  "skillMatchPromptPolicyHash",
  "skillMatchResumeInputHash",
  "skillMatchJobDescriptionHash",
  "skillMatchRagContextHash",
  "skillMatchAnalysisOutputHash",
  "skillMatchEvaluatorTraceHash",
  "skillMatchNoResumeCopyProofHash",
  "skillMatchNoSourceCopyProofHash",
];

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort();
}

function isPresent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function rowProof(row: SkillMatchResumeLiveDriftRow): SkillMatchResumeRowProof {
  const payload = {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    skillMatchTaskType: row.skillMatchTaskType,
    skillMatchResumeFormat: row.skillMatchResumeFormat,
    skillMatchProviderRouteHash: row.skillMatchProviderRouteHash,
    skillMatchPromptPolicyHash: row.skillMatchPromptPolicyHash,
    skillMatchResumeInputHash: row.skillMatchResumeInputHash,
    skillMatchJobDescriptionHash: row.skillMatchJobDescriptionHash,
    skillMatchRagContextHash: row.skillMatchRagContextHash,
    skillMatchAnalysisOutputHash: row.skillMatchAnalysisOutputHash,
    skillMatchEvaluatorTraceHash: row.skillMatchEvaluatorTraceHash,
    skillMatchNoResumeCopyProofHash: row.skillMatchNoResumeCopyProofHash,
    skillMatchNoSourceCopyProofHash: row.skillMatchNoSourceCopyProofHash,
    skillMatchParserAccuracy0to1: row.skillMatchParserAccuracy0to1 ?? null,
    skillMatchGroundingScore0to1: row.skillMatchGroundingScore0to1 ?? null,
    skillMatchSuggestionQuality0to1: row.skillMatchSuggestionQuality0to1 ?? null,
    skillMatchPiiRedactionPassed: row.skillMatchPiiRedactionPassed ?? null,
    evidenceRefs: unique(row.evidenceRefs ?? []),
    signedEvidenceRefs: unique(row.signedEvidenceRefs ?? []),
  };
  return {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    taskType: row.skillMatchTaskType,
    resumeFormat: row.skillMatchResumeFormat,
    rowProofHash: sha256Hex(canonicalize(payload)),
    evidenceRefs: payload.evidenceRefs,
    signedEvidenceRefs: payload.signedEvidenceRefs,
  };
}

function proofStats(proof: SkillMatchResumeSourceProof, rows: SkillMatchResumeLiveDriftRow[]): {
  present: number;
  total: number;
  missingReasons: string[];
} {
  let present = 0;
  let total = 0;
  const missingReasons: string[] = [];

  for (const field of REQUIRED_SOURCE_PROOF_FIELDS) {
    total += 1;
    if (isPresent(proof[field])) {
      present += 1;
    } else {
      missingReasons.push(field);
    }
  }

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

function withSkillMatchReceipt(
  receipt: LiveDriftReceipt,
  coverage: number,
  missingReasons: string[],
  proof: SkillMatchResumeSourceProof,
): LiveDriftReceipt {
  const { receiptHash: _oldHash, ...receiptWithoutHash } = receipt;
  const alertRefs = unique([
    proof.sourceRefHash,
    proof.repositorySnapshotHash,
    proof.readmeBlobHash,
    proof.frontendAnalyzerComponentHash,
    proof.driftStatisticHash,
    proof.alertReceiptHash,
    proof.privacyBoundaryHash,
  ]);
  const signedRefs = unique([proof.ciReceiptHash]);
  const alerts: LiveDriftAlert[] = [...receipt.alerts];

  if (missingReasons.length > 0) {
    alerts.push({
      alertId: `live-drift:${receipt.agentId}:${receipt.baselineWindowId}:${receipt.liveWindowId}:skillMatchEvidenceCoverage0to1`,
      metricId: "skillMatchEvidenceCoverage0to1",
      severity: coverage < 0.75 ? "critical" : "high",
      message: `SkillMatch resume live drift proof is incomplete: ${missingReasons.join(", ")}.`,
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
      proof.sourceRefHash,
      proof.repositorySnapshotHash,
      proof.noLicenseBoundaryHash,
      proof.defaultBranchHash,
      proof.readmeBlobHash,
      proof.frontendTreeHash,
      proof.frontendAnalyzerComponentHash,
      proof.frontendPdfExtractorHash,
      proof.oldVersionTreeHash,
      proof.oldAppHash,
      proof.oldNotebookHash,
      proof.requirementsHash,
      proof.noSourceCopyProofHash,
      proof.noResumeCopyProofHash,
      proof.privacyBoundaryHash,
    ]),
    summary: `${alerts.length} live drift alert(s), recommendation=${recommendation}; SkillMatch evidence coverage=${round(coverage)}`,
  });
}

export function runSkillMatchResumeLiveDrift(input: RunSkillMatchResumeLiveDriftInput): SkillMatchResumeLiveDriftResult {
  const allRows = [...input.baselineWindow.rows, ...input.liveWindow.rows];
  const stats = proofStats(input.sourceProof, allRows);
  const skillMatchEvidenceCoverage0to1 = stats.total === 0 ? 0 : round(stats.present / stats.total);
  const rowProofs = allRows.map(rowProof);
  const receipt = runLiveScoreBehaviorDrift({
    agentId: input.agentId,
    baselineWindow: input.baselineWindow,
    liveWindow: input.liveWindow,
    thresholds: input.thresholds,
    sourceRefs: unique([
      ...(input.sourceRefs ?? []),
      input.sourceProof.sourceRefHash,
      input.sourceProof.repositorySnapshotHash,
      input.sourceProof.noLicenseBoundaryHash,
      input.sourceProof.privacyBoundaryHash,
    ]),
    now: input.now,
  });
  const enrichedReceipt = withSkillMatchReceipt(
    receipt,
    skillMatchEvidenceCoverage0to1,
    stats.missingReasons,
    input.sourceProof,
  );

  return {
    receipt: enrichedReceipt,
    watchAlerts: buildLiveDriftWatchAlerts(enrichedReceipt),
    sourceProof: input.sourceProof,
    rowProofs,
    missingReasons: stats.missingReasons,
    skillMatchEvidenceCoverage0to1,
  };
}
