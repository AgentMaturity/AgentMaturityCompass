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

export type ReflexionAgentTaskType =
  | "code_fix"
  | "math"
  | "qa"
  | "tool_use"
  | "policy_eval"
  | "custom";

export interface ReflexionAgentSourceProof {
  sourceRefHash: string;
  repositorySnapshotHash: string;
  licenseHash: string;
  defaultBranchHash: string;
  readmeBlobHash: string;
  packageJsonHash: string;
  reflexionAgentBlobHash: string;
  evaluatorBlobHash: string;
  typesBlobHash: string;
  memoryBlobHash: string;
  sourceRelevanceMappingHash: string;
  evaluatorPolicyHash: string;
  reflectionMemoryPolicyHash: string;
  baselineDistributionHash: string;
  liveSampleManifestHash: string;
  driftStatisticHash: string;
  alertReceiptHash: string;
  ciReceiptHash: string;
  noSourceCopyProofHash: string;
}

export interface ReflexionAgentLiveDriftRow extends LiveDriftSampleRow {
  reflexionTaskType: ReflexionAgentTaskType;
  reflexionMaxAttempts: number;
  reflexionAttemptCount: number;
  reflexionEvaluatorPassed: boolean;
  reflexionEvaluatorScore0to1?: number;
  reflexionFeedbackHistoryHash: string;
  reflexionMemoryRetrievalHash: string;
  reflexionReflectionPolicyHash: string;
  reflexionOutputHash: string;
  reflexionExpectedHash: string;
  reflexionNoSourceCopyProofHash: string;
}

export interface ReflexionAgentRowProof {
  traceId: string;
  scenarioId: string;
  taskType: ReflexionAgentTaskType;
  rowProofHash: string;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface RunReflexionAgentLiveDriftInput {
  agentId: string;
  sourceProof: ReflexionAgentSourceProof;
  baselineWindow: Omit<LiveDriftWindow, "rows"> & { rows: ReflexionAgentLiveDriftRow[] };
  liveWindow: Omit<LiveDriftWindow, "rows"> & { rows: ReflexionAgentLiveDriftRow[] };
  thresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}

export interface ReflexionAgentLiveDriftResult {
  receipt: LiveDriftReceipt;
  watchAlerts: LiveDriftWatchAlert[];
  sourceProof: ReflexionAgentSourceProof;
  rowProofs: ReflexionAgentRowProof[];
  missingReasons: string[];
  reflexionAgentEvidenceCoverage0to1: number;
}

const REQUIRED_SOURCE_PROOF_FIELDS: Array<keyof ReflexionAgentSourceProof> = [
  "sourceRefHash",
  "repositorySnapshotHash",
  "licenseHash",
  "defaultBranchHash",
  "readmeBlobHash",
  "packageJsonHash",
  "reflexionAgentBlobHash",
  "evaluatorBlobHash",
  "typesBlobHash",
  "memoryBlobHash",
  "sourceRelevanceMappingHash",
  "evaluatorPolicyHash",
  "reflectionMemoryPolicyHash",
  "baselineDistributionHash",
  "liveSampleManifestHash",
  "driftStatisticHash",
  "alertReceiptHash",
  "ciReceiptHash",
  "noSourceCopyProofHash",
];

const REQUIRED_ROW_PROOF_FIELDS: Array<keyof ReflexionAgentLiveDriftRow> = [
  "reflexionTaskType",
  "reflexionMaxAttempts",
  "reflexionAttemptCount",
  "reflexionEvaluatorPassed",
  "reflexionFeedbackHistoryHash",
  "reflexionMemoryRetrievalHash",
  "reflexionReflectionPolicyHash",
  "reflexionOutputHash",
  "reflexionExpectedHash",
  "reflexionNoSourceCopyProofHash",
];

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort();
}

function isPresent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function rowProof(row: ReflexionAgentLiveDriftRow): ReflexionAgentRowProof {
  const payload = {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    reflexionTaskType: row.reflexionTaskType,
    reflexionMaxAttempts: row.reflexionMaxAttempts,
    reflexionAttemptCount: row.reflexionAttemptCount,
    reflexionEvaluatorPassed: row.reflexionEvaluatorPassed,
    reflexionEvaluatorScore0to1: row.reflexionEvaluatorScore0to1 ?? null,
    reflexionFeedbackHistoryHash: row.reflexionFeedbackHistoryHash,
    reflexionMemoryRetrievalHash: row.reflexionMemoryRetrievalHash,
    reflexionReflectionPolicyHash: row.reflexionReflectionPolicyHash,
    reflexionOutputHash: row.reflexionOutputHash,
    reflexionExpectedHash: row.reflexionExpectedHash,
    reflexionNoSourceCopyProofHash: row.reflexionNoSourceCopyProofHash,
    evidenceRefs: unique(row.evidenceRefs ?? []),
    signedEvidenceRefs: unique(row.signedEvidenceRefs ?? []),
  };
  return {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    taskType: row.reflexionTaskType,
    rowProofHash: sha256Hex(canonicalize(payload)),
    evidenceRefs: payload.evidenceRefs,
    signedEvidenceRefs: payload.signedEvidenceRefs,
  };
}

function proofStats(proof: ReflexionAgentSourceProof, rows: ReflexionAgentLiveDriftRow[]): {
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

function withReflexionAgentReceipt(
  receipt: LiveDriftReceipt,
  coverage: number,
  missingReasons: string[],
  proof: ReflexionAgentSourceProof,
): LiveDriftReceipt {
  const { receiptHash: _oldHash, ...receiptWithoutHash } = receipt;
  const alertRefs = unique([
    proof.sourceRefHash,
    proof.repositorySnapshotHash,
    proof.reflexionAgentBlobHash,
    proof.evaluatorBlobHash,
    proof.typesBlobHash,
    proof.sourceRelevanceMappingHash,
    proof.driftStatisticHash,
    proof.alertReceiptHash,
  ]);
  const signedRefs = unique([proof.ciReceiptHash]);
  const alerts: LiveDriftAlert[] = [...receipt.alerts];

  if (missingReasons.length > 0) {
    alerts.push({
      alertId: `live-drift:${receipt.agentId}:${receipt.baselineWindowId}:${receipt.liveWindowId}:reflexionAgentEvidenceCoverage0to1`,
      metricId: "reflexionAgentEvidenceCoverage0to1",
      severity: coverage < 0.75 ? "critical" : "high",
      message: `Reflexion-agent live drift proof is incomplete: ${missingReasons.join(", ")}.`,
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
      proof.licenseHash,
      proof.defaultBranchHash,
      proof.readmeBlobHash,
      proof.packageJsonHash,
      proof.reflexionAgentBlobHash,
      proof.evaluatorBlobHash,
      proof.typesBlobHash,
      proof.memoryBlobHash,
      proof.sourceRelevanceMappingHash,
      proof.evaluatorPolicyHash,
      proof.reflectionMemoryPolicyHash,
      proof.noSourceCopyProofHash,
    ]),
    summary: `${alerts.length} live drift alert(s), recommendation=${recommendation}; Reflexion-agent evidence coverage=${round(coverage)}`,
  });
}

export function runReflexionAgentLiveDrift(input: RunReflexionAgentLiveDriftInput): ReflexionAgentLiveDriftResult {
  const allRows = [...input.baselineWindow.rows, ...input.liveWindow.rows];
  const stats = proofStats(input.sourceProof, allRows);
  const reflexionAgentEvidenceCoverage0to1 = stats.total === 0 ? 0 : round(stats.present / stats.total);
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
      input.sourceProof.licenseHash,
      input.sourceProof.defaultBranchHash,
    ]),
    now: input.now,
  });
  const enrichedReceipt = withReflexionAgentReceipt(
    receipt,
    reflexionAgentEvidenceCoverage0to1,
    stats.missingReasons,
    input.sourceProof,
  );

  return {
    receipt: enrichedReceipt,
    watchAlerts: buildLiveDriftWatchAlerts(enrichedReceipt),
    sourceProof: input.sourceProof,
    rowProofs,
    missingReasons: stats.missingReasons,
    reflexionAgentEvidenceCoverage0to1,
  };
}
