import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  hasNonBlankEvidenceRef,
  normalizeEvidenceRefs,
} from "./evidenceRefs.js";
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

export type PaperReadSkillRoute = "benchmark" | "methodology" | "survey_opinion" | "blog_research" | "custom";

export interface PaperReadSkillSourceProof {
  sourceRefHash: string;
  repositorySnapshotHash: string;
  noLicenseBoundaryHash: string;
  readmeBlobHash: string;
  llmsManifestHash: string;
  skillsTreeHash: string;
  paperAnalysisSkillHash: string;
  paperAnalysisPromptCatalogHash: string;
  blogReadingSkillHash: string;
  blogReadingPromptCatalogHash: string;
  benchmarkPromptHash: string;
  methodologyPromptHash: string;
  surveyOpinionPromptHash: string;
  routePolicyHash: string;
  researchTaskManifestHash: string;
  evaluationRubricHash: string;
  baselineDistributionHash: string;
  liveSampleManifestHash: string;
  driftStatisticHash: string;
  alertReceiptHash: string;
  replayCommandHash: string;
  ciReceiptHash: string;
  noPromptCopyProofHash: string;
}

export interface PaperReadSkillLiveDriftRow extends LiveDriftSampleRow {
  paperReadSkillRoute: PaperReadSkillRoute;
  paperReadSkillTaskId: string;
  paperReadSkillPaperCorpusHash: string;
  paperReadSkillPromptRouteHash: string;
  paperReadSkillResponseHash: string;
  paperReadSkillEvaluatorTraceHash: string;
  paperReadSkillClaimExtractionScore0to1?: number;
  paperReadSkillCitationGroundingScore0to1?: number;
  paperReadSkillRouteMatched?: boolean;
  paperReadSkillNoPromptCopyProofHash?: string;
}

export interface PaperReadSkillRowProof {
  traceId: string;
  scenarioId: string;
  route: PaperReadSkillRoute;
  taskId: string;
  rowProofHash: string;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface RunPaperReadSkillLiveDriftInput {
  agentId: string;
  sourceProof: PaperReadSkillSourceProof;
  baselineWindow: Omit<LiveDriftWindow, "rows"> & { rows: PaperReadSkillLiveDriftRow[] };
  liveWindow: Omit<LiveDriftWindow, "rows"> & { rows: PaperReadSkillLiveDriftRow[] };
  thresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}

export interface PaperReadSkillLiveDriftResult {
  receipt: LiveDriftReceipt;
  watchAlerts: LiveDriftWatchAlert[];
  sourceProof: PaperReadSkillSourceProof;
  rowProofs: PaperReadSkillRowProof[];
  missingReasons: string[];
  paperReadSkillEvidenceCoverage0to1: number;
}

const REQUIRED_SOURCE_PROOF_FIELDS: Array<keyof PaperReadSkillSourceProof> = [
  "sourceRefHash",
  "repositorySnapshotHash",
  "noLicenseBoundaryHash",
  "readmeBlobHash",
  "llmsManifestHash",
  "skillsTreeHash",
  "paperAnalysisSkillHash",
  "paperAnalysisPromptCatalogHash",
  "blogReadingSkillHash",
  "blogReadingPromptCatalogHash",
  "benchmarkPromptHash",
  "methodologyPromptHash",
  "surveyOpinionPromptHash",
  "routePolicyHash",
  "researchTaskManifestHash",
  "evaluationRubricHash",
  "baselineDistributionHash",
  "liveSampleManifestHash",
  "driftStatisticHash",
  "alertReceiptHash",
  "replayCommandHash",
  "ciReceiptHash",
  "noPromptCopyProofHash",
];

const REQUIRED_ROW_PROOF_FIELDS: Array<keyof PaperReadSkillLiveDriftRow> = [
  "paperReadSkillRoute",
  "paperReadSkillTaskId",
  "paperReadSkillPaperCorpusHash",
  "paperReadSkillPromptRouteHash",
  "paperReadSkillResponseHash",
  "paperReadSkillEvaluatorTraceHash",
  "paperReadSkillNoPromptCopyProofHash",
];

function unique(values: unknown): string[] {
  return normalizeEvidenceRefs(values).sort();
}

function isPresent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function rowProof(row: PaperReadSkillLiveDriftRow): PaperReadSkillRowProof {
  const payload = {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    paperReadSkillRoute: row.paperReadSkillRoute,
    paperReadSkillTaskId: row.paperReadSkillTaskId,
    paperReadSkillPaperCorpusHash: row.paperReadSkillPaperCorpusHash,
    paperReadSkillPromptRouteHash: row.paperReadSkillPromptRouteHash,
    paperReadSkillResponseHash: row.paperReadSkillResponseHash,
    paperReadSkillEvaluatorTraceHash: row.paperReadSkillEvaluatorTraceHash,
    paperReadSkillClaimExtractionScore0to1: row.paperReadSkillClaimExtractionScore0to1 ?? null,
    paperReadSkillCitationGroundingScore0to1: row.paperReadSkillCitationGroundingScore0to1 ?? null,
    paperReadSkillRouteMatched: row.paperReadSkillRouteMatched ?? null,
    paperReadSkillNoPromptCopyProofHash: row.paperReadSkillNoPromptCopyProofHash ?? null,
    evidenceRefs: unique(row.evidenceRefs ?? []),
    signedEvidenceRefs: unique(row.signedEvidenceRefs ?? []),
  };
  return {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    route: row.paperReadSkillRoute,
    taskId: row.paperReadSkillTaskId,
    rowProofHash: sha256Hex(canonicalize(payload)),
    evidenceRefs: payload.evidenceRefs,
    signedEvidenceRefs: payload.signedEvidenceRefs,
  };
}

function proofStats(proof: PaperReadSkillSourceProof, rows: PaperReadSkillLiveDriftRow[]): {
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

function withPaperReadSkillReceipt(
  receipt: LiveDriftReceipt,
  coverage: number,
  missingReasons: string[],
  proof: PaperReadSkillSourceProof,
): LiveDriftReceipt {
  const { receiptHash: _oldHash, ...receiptWithoutHash } = receipt;
  const alertRefs = unique([
    proof.sourceRefHash,
    proof.repositorySnapshotHash,
    proof.readmeBlobHash,
    proof.llmsManifestHash,
    proof.driftStatisticHash,
    proof.alertReceiptHash,
  ]);
  const signedRefs = unique([proof.ciReceiptHash]);
  const alerts: LiveDriftAlert[] = [...receipt.alerts];

  if (missingReasons.length > 0) {
    alerts.push({
      alertId: `live-drift:${receipt.agentId}:${receipt.baselineWindowId}:${receipt.liveWindowId}:paperReadSkillEvidenceCoverage0to1`,
      metricId: "paperReadSkillEvidenceCoverage0to1",
      severity: coverage < 0.75 ? "critical" : "high",
      message: `Paper-read-skill live drift proof is incomplete: ${missingReasons.join(", ")}.`,
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
      proof.readmeBlobHash,
      proof.llmsManifestHash,
      proof.skillsTreeHash,
      proof.paperAnalysisSkillHash,
      proof.paperAnalysisPromptCatalogHash,
      proof.blogReadingSkillHash,
      proof.blogReadingPromptCatalogHash,
    ]),
    summary: `${alerts.length} live drift alert(s), recommendation=${recommendation}; paper-read-skill evidence coverage=${round(coverage)}`,
  });
}

export function runPaperReadSkillLiveDrift(input: RunPaperReadSkillLiveDriftInput): PaperReadSkillLiveDriftResult {
  const allRows = [...input.baselineWindow.rows, ...input.liveWindow.rows];
  const stats = proofStats(input.sourceProof, allRows);
  const paperReadSkillEvidenceCoverage0to1 = stats.total === 0 ? 0 : round(stats.present / stats.total);
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
    ]),
    now: input.now,
  });
  const enrichedReceipt = withPaperReadSkillReceipt(
    receipt,
    paperReadSkillEvidenceCoverage0to1,
    stats.missingReasons,
    input.sourceProof,
  );

  return {
    receipt: enrichedReceipt,
    watchAlerts: buildLiveDriftWatchAlerts(enrichedReceipt),
    sourceProof: input.sourceProof,
    rowProofs,
    missingReasons: stats.missingReasons,
    paperReadSkillEvidenceCoverage0to1,
  };
}
