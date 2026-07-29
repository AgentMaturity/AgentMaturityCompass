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
  type LiveDriftSampleRow,
  type LiveDriftThresholds,
  type LiveDriftWatchAlert,
  type LiveDriftWindow,
} from "./liveDriftAlerts.js";

export type BraintrustSignalSurface =
  | "trace"
  | "online_score"
  | "experiment"
  | "dataset"
  | "feedback"
  | "deployment_monitor"
  | "custom";

export interface BraintrustSourceProof {
  sourceRefHash: string;
  productPageMetadataHash: string;
  llmsTxtHash: string;
  docsSnapshotHash: string;
  tracingQuickstartHash: string;
  evaluationQuickstartHash: string;
  runEvaluationsDocHash: string;
  compareExperimentsDocHash: string;
  onlineScoringDocHash: string;
  observeDocsHash: string;
  deploymentMonitorDocHash: string;
  amcNativeMappingHash: string;
  noStandaloneSubsystemProofHash: string;
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

export interface BraintrustLiveDriftRow extends LiveDriftSampleRow {
  braintrustSurface: BraintrustSignalSurface;
  braintrustProjectIdHash: string;
  braintrustTraceIdHash: string;
  braintrustSpanTreeHash: string;
  braintrustDatasetSnapshotHash: string;
  braintrustExperimentRunHash: string;
  braintrustScorerManifestHash: string;
  braintrustScoreEventHash: string;
  braintrustFeedbackReceiptHash?: string;
  braintrustAlertReceiptHash?: string;
  braintrustNoProductPageOnlyProofHash?: string;
}

export interface BraintrustRowProof {
  traceId: string;
  scenarioId: string;
  surface: BraintrustSignalSurface;
  rowProofHash: string;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface RunBraintrustLiveDriftInput {
  agentId: string;
  sourceProof: BraintrustSourceProof;
  baselineWindow: Omit<LiveDriftWindow, "rows"> & { rows: BraintrustLiveDriftRow[] };
  liveWindow: Omit<LiveDriftWindow, "rows"> & { rows: BraintrustLiveDriftRow[] };
  thresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}

export interface BraintrustLiveDriftResult {
  receipt: LiveDriftReceipt;
  watchAlerts: LiveDriftWatchAlert[];
  sourceProof: BraintrustSourceProof;
  rowProofs: BraintrustRowProof[];
  missingReasons: string[];
  braintrustEvidenceCoverage0to1: number;
}

const REQUIRED_SOURCE_PROOF_FIELDS: Array<keyof BraintrustSourceProof> = [
  "sourceRefHash",
  "productPageMetadataHash",
  "llmsTxtHash",
  "docsSnapshotHash",
  "tracingQuickstartHash",
  "evaluationQuickstartHash",
  "runEvaluationsDocHash",
  "compareExperimentsDocHash",
  "onlineScoringDocHash",
  "observeDocsHash",
  "deploymentMonitorDocHash",
  "amcNativeMappingHash",
  "noStandaloneSubsystemProofHash",
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

const REQUIRED_ROW_PROOF_FIELDS: Array<keyof BraintrustLiveDriftRow> = [
  "braintrustSurface",
  "braintrustProjectIdHash",
  "braintrustTraceIdHash",
  "braintrustSpanTreeHash",
  "braintrustDatasetSnapshotHash",
  "braintrustExperimentRunHash",
  "braintrustScorerManifestHash",
  "braintrustScoreEventHash",
  "braintrustNoProductPageOnlyProofHash",
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

function rowProof(row: BraintrustLiveDriftRow): BraintrustRowProof {
  const payload = {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    score0to1: row.score0to1,
    passed: row.passed ?? null,
    behaviorSignature: row.behaviorSignature,
    latencyMs: row.latencyMs ?? null,
    costUsd: row.costUsd ?? null,
    braintrustSurface: row.braintrustSurface,
    braintrustProjectIdHash: row.braintrustProjectIdHash,
    braintrustTraceIdHash: row.braintrustTraceIdHash,
    braintrustSpanTreeHash: row.braintrustSpanTreeHash,
    braintrustDatasetSnapshotHash: row.braintrustDatasetSnapshotHash,
    braintrustExperimentRunHash: row.braintrustExperimentRunHash,
    braintrustScorerManifestHash: row.braintrustScorerManifestHash,
    braintrustScoreEventHash: row.braintrustScoreEventHash,
    braintrustFeedbackReceiptHash: row.braintrustFeedbackReceiptHash ?? null,
    braintrustAlertReceiptHash: row.braintrustAlertReceiptHash ?? null,
    braintrustNoProductPageOnlyProofHash: row.braintrustNoProductPageOnlyProofHash ?? null,
    evidenceRefs: unique(row.evidenceRefs ?? []),
    signedEvidenceRefs: unique(row.signedEvidenceRefs ?? []),
  };

  return {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    surface: row.braintrustSurface,
    rowProofHash: sha256Hex(canonicalize(payload)),
    evidenceRefs: payload.evidenceRefs,
    signedEvidenceRefs: payload.signedEvidenceRefs,
  };
}

function proofStats(proof: BraintrustSourceProof, rows: BraintrustLiveDriftRow[]): {
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

function withBraintrustReceipt(
  receipt: LiveDriftReceipt,
  coverage: number,
  missingReasons: string[],
  proof: BraintrustSourceProof,
): LiveDriftReceipt {
  const { receiptHash: _oldHash, ...receiptWithoutHash } = receipt;
  const alertRefs = unique([
    proof.sourceRefHash,
    proof.productPageMetadataHash,
    proof.llmsTxtHash,
    proof.docsSnapshotHash,
    proof.driftStatisticHash,
    proof.alertReceiptHash,
  ]);
  const signedRefs = unique([proof.ciReceiptHash, proof.signedEvidencePolicyHash]);
  const alerts: LiveDriftAlert[] = [...receipt.alerts];

  if (missingReasons.length > 0) {
    alerts.push({
      alertId: `live-drift:${receipt.agentId}:${receipt.baselineWindowId}:${receipt.liveWindowId}:braintrustEvidenceCoverage0to1`,
      metricId: "braintrustEvidenceCoverage0to1",
      severity: coverage < 0.75 ? "critical" : "high",
      message: `Braintrust-style live drift proof is incomplete: ${missingReasons.join(", ")}.`,
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
      proof.productPageMetadataHash,
      proof.llmsTxtHash,
      proof.docsSnapshotHash,
      proof.amcNativeMappingHash,
      proof.noStandaloneSubsystemProofHash,
      proof.noCopiedProseProofHash,
    ]),
    summary: `${alerts.length} live drift alert(s), recommendation=${recommendation}; braintrust evidence coverage=${round(coverage)}`,
  });
}

export function runBraintrustLiveDrift(input: RunBraintrustLiveDriftInput): BraintrustLiveDriftResult {
  const allRows = [...input.baselineWindow.rows, ...input.liveWindow.rows];
  const stats = proofStats(input.sourceProof, allRows);
  const braintrustEvidenceCoverage0to1 = stats.total === 0 ? 0 : round(stats.present / stats.total);
  const rowProofs = allRows.map(rowProof);
  const receipt = runLiveScoreBehaviorDrift({
    agentId: input.agentId,
    baselineWindow: input.baselineWindow,
    liveWindow: input.liveWindow,
    thresholds: input.thresholds,
    sourceRefs: unique([
      ...(input.sourceRefs ?? []),
      input.sourceProof.sourceRefHash,
      input.sourceProof.llmsTxtHash,
      input.sourceProof.docsSnapshotHash,
    ]),
    now: input.now,
  });
  const enrichedReceipt = withBraintrustReceipt(
    receipt,
    braintrustEvidenceCoverage0to1,
    stats.missingReasons,
    input.sourceProof,
  );

  return {
    receipt: enrichedReceipt,
    watchAlerts: buildLiveDriftWatchAlerts(enrichedReceipt),
    sourceProof: input.sourceProof,
    rowProofs,
    missingReasons: stats.missingReasons,
    braintrustEvidenceCoverage0to1,
  };
}
