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

export type DecibenchVoiceTaskType =
  | "task_completion"
  | "latency"
  | "rag_grounding"
  | "hallucination"
  | "audio_quality"
  | "turn_taking"
  | "mcp_tool"
  | "custom";

export type DecibenchVoiceChannel = "recorded_audio" | "telephony_bridge" | "websocket" | "synthetic" | "custom";

export interface DecibenchVoiceSourceProof {
  sourceRefHash: string;
  repositorySnapshotHash: string;
  licenseReferenceHash: string;
  githubLicenseNoAssertionHash: string;
  defaultBranchHash: string;
  releaseTagHash: string;
  readmeBlobHash: string;
  pyprojectHash: string;
  ciWorkflowHash: string;
  makefileHash: string;
  configExampleHash: string;
  srcTreeHash: string;
  decibenchPackageTreeHash: string;
  cliTreeHash: string;
  cliRunHash: string;
  cliRagHash: string;
  mcpTreeHash: string;
  mcpToolsRagHash: string;
  ragTreeHash: string;
  evaluatorsTreeHash: string;
  audioTreeHash: string;
  scenariosTreeHash: string;
  scenarioSuiteManifestHash: string;
  testsTreeHash: string;
  bridgeSidecarTreeHash: string;
  dashboardTreeHash: string;
  docsTreeHash: string;
  releaseCheckHash: string;
  deterministicEvalManifestHash: string;
  semanticEvalManifestHash: string;
  ragEvalManifestHash: string;
  baselineDistributionHash: string;
  liveSampleManifestHash: string;
  driftStatisticHash: string;
  alertReceiptHash: string;
  replayCommandHash: string;
  ciReceiptHash: string;
  noSourceCopyProofHash: string;
  noTranscriptCopyProofHash: string;
  privacyBoundaryHash: string;
}

export interface DecibenchVoiceLiveDriftRow extends LiveDriftSampleRow {
  decibenchVoiceTaskType: DecibenchVoiceTaskType;
  decibenchChannel: DecibenchVoiceChannel;
  decibenchProviderRouteHash: string;
  decibenchScenarioSuiteHash: string;
  decibenchScenarioHash: string;
  decibenchAudioFixtureHash: string;
  decibenchTranscriptHash: string;
  decibenchExpectedBehaviorHash: string;
  decibenchActualBehaviorHash: string;
  decibenchEvaluatorTraceHash: string;
  decibenchRagContextHash: string;
  decibenchToolTraceHash: string;
  decibenchNoTranscriptCopyProofHash: string;
  decibenchNoSourceCopyProofHash: string;
  decibenchWer0to1?: number;
  decibenchLatencyMs?: number;
  decibenchTaskCompletion0to1?: number;
  decibenchHallucinationRate0to1?: number;
  decibenchRagGrounding0to1?: number;
  decibenchAudioQuality0to1?: number;
}

export interface DecibenchVoiceRowProof {
  traceId: string;
  scenarioId: string;
  taskType: DecibenchVoiceTaskType;
  channel: DecibenchVoiceChannel;
  rowProofHash: string;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface RunDecibenchVoiceLiveDriftInput {
  agentId: string;
  sourceProof: DecibenchVoiceSourceProof;
  baselineWindow: Omit<LiveDriftWindow, "rows"> & { rows: DecibenchVoiceLiveDriftRow[] };
  liveWindow: Omit<LiveDriftWindow, "rows"> & { rows: DecibenchVoiceLiveDriftRow[] };
  thresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}

export interface DecibenchVoiceLiveDriftResult {
  receipt: LiveDriftReceipt;
  watchAlerts: LiveDriftWatchAlert[];
  sourceProof: DecibenchVoiceSourceProof;
  rowProofs: DecibenchVoiceRowProof[];
  missingReasons: string[];
  decibenchEvidenceCoverage0to1: number;
}

const REQUIRED_SOURCE_PROOF_FIELDS: Array<keyof DecibenchVoiceSourceProof> = [
  "sourceRefHash",
  "repositorySnapshotHash",
  "licenseReferenceHash",
  "githubLicenseNoAssertionHash",
  "defaultBranchHash",
  "releaseTagHash",
  "readmeBlobHash",
  "pyprojectHash",
  "ciWorkflowHash",
  "makefileHash",
  "configExampleHash",
  "srcTreeHash",
  "decibenchPackageTreeHash",
  "cliTreeHash",
  "cliRunHash",
  "cliRagHash",
  "mcpTreeHash",
  "mcpToolsRagHash",
  "ragTreeHash",
  "evaluatorsTreeHash",
  "audioTreeHash",
  "scenariosTreeHash",
  "scenarioSuiteManifestHash",
  "testsTreeHash",
  "bridgeSidecarTreeHash",
  "dashboardTreeHash",
  "docsTreeHash",
  "releaseCheckHash",
  "deterministicEvalManifestHash",
  "semanticEvalManifestHash",
  "ragEvalManifestHash",
  "baselineDistributionHash",
  "liveSampleManifestHash",
  "driftStatisticHash",
  "alertReceiptHash",
  "replayCommandHash",
  "ciReceiptHash",
  "noSourceCopyProofHash",
  "noTranscriptCopyProofHash",
  "privacyBoundaryHash",
];

const REQUIRED_ROW_PROOF_FIELDS: Array<keyof DecibenchVoiceLiveDriftRow> = [
  "decibenchVoiceTaskType",
  "decibenchChannel",
  "decibenchProviderRouteHash",
  "decibenchScenarioSuiteHash",
  "decibenchScenarioHash",
  "decibenchAudioFixtureHash",
  "decibenchTranscriptHash",
  "decibenchExpectedBehaviorHash",
  "decibenchActualBehaviorHash",
  "decibenchEvaluatorTraceHash",
  "decibenchRagContextHash",
  "decibenchToolTraceHash",
  "decibenchNoTranscriptCopyProofHash",
  "decibenchNoSourceCopyProofHash",
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

function rowProof(row: DecibenchVoiceLiveDriftRow): DecibenchVoiceRowProof {
  const payload = {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    decibenchVoiceTaskType: row.decibenchVoiceTaskType,
    decibenchChannel: row.decibenchChannel,
    decibenchProviderRouteHash: row.decibenchProviderRouteHash,
    decibenchScenarioSuiteHash: row.decibenchScenarioSuiteHash,
    decibenchScenarioHash: row.decibenchScenarioHash,
    decibenchAudioFixtureHash: row.decibenchAudioFixtureHash,
    decibenchTranscriptHash: row.decibenchTranscriptHash,
    decibenchExpectedBehaviorHash: row.decibenchExpectedBehaviorHash,
    decibenchActualBehaviorHash: row.decibenchActualBehaviorHash,
    decibenchEvaluatorTraceHash: row.decibenchEvaluatorTraceHash,
    decibenchRagContextHash: row.decibenchRagContextHash,
    decibenchToolTraceHash: row.decibenchToolTraceHash,
    decibenchNoTranscriptCopyProofHash: row.decibenchNoTranscriptCopyProofHash,
    decibenchNoSourceCopyProofHash: row.decibenchNoSourceCopyProofHash,
    decibenchWer0to1: row.decibenchWer0to1 ?? null,
    decibenchLatencyMs: row.decibenchLatencyMs ?? null,
    decibenchTaskCompletion0to1: row.decibenchTaskCompletion0to1 ?? null,
    decibenchHallucinationRate0to1: row.decibenchHallucinationRate0to1 ?? null,
    decibenchRagGrounding0to1: row.decibenchRagGrounding0to1 ?? null,
    decibenchAudioQuality0to1: row.decibenchAudioQuality0to1 ?? null,
    evidenceRefs: unique(row.evidenceRefs ?? []),
    signedEvidenceRefs: unique(row.signedEvidenceRefs ?? []),
  };
  return {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    taskType: row.decibenchVoiceTaskType,
    channel: row.decibenchChannel,
    rowProofHash: sha256Hex(canonicalize(payload)),
    evidenceRefs: payload.evidenceRefs,
    signedEvidenceRefs: payload.signedEvidenceRefs,
  };
}

function proofStats(proof: DecibenchVoiceSourceProof, rows: DecibenchVoiceLiveDriftRow[]): {
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

function withDecibenchReceipt(
  receipt: LiveDriftReceipt,
  coverage: number,
  missingReasons: string[],
  proof: DecibenchVoiceSourceProof,
): LiveDriftReceipt {
  const { receiptHash: _oldHash, ...receiptWithoutHash } = receipt;
  const alertRefs = unique([
    proof.sourceRefHash,
    proof.repositorySnapshotHash,
    proof.readmeBlobHash,
    proof.cliRunHash,
    proof.mcpToolsRagHash,
    proof.driftStatisticHash,
    proof.alertReceiptHash,
    proof.privacyBoundaryHash,
  ]);
  const signedRefs = unique([proof.ciReceiptHash]);
  const alerts: LiveDriftAlert[] = [...receipt.alerts];

  if (missingReasons.length > 0) {
    alerts.push({
      alertId: `live-drift:${receipt.agentId}:${receipt.baselineWindowId}:${receipt.liveWindowId}:decibenchEvidenceCoverage0to1`,
      metricId: "decibenchEvidenceCoverage0to1",
      severity: coverage < 0.75 ? "critical" : "high",
      message: `Decibench voice live drift proof is incomplete: ${missingReasons.join(", ")}.`,
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
      proof.licenseReferenceHash,
      proof.githubLicenseNoAssertionHash,
      proof.defaultBranchHash,
      proof.releaseTagHash,
      proof.readmeBlobHash,
      proof.pyprojectHash,
      proof.ciWorkflowHash,
      proof.cliTreeHash,
      proof.cliRunHash,
      proof.cliRagHash,
      proof.mcpTreeHash,
      proof.mcpToolsRagHash,
      proof.ragTreeHash,
      proof.evaluatorsTreeHash,
      proof.audioTreeHash,
      proof.scenariosTreeHash,
      proof.scenarioSuiteManifestHash,
      proof.bridgeSidecarTreeHash,
      proof.dashboardTreeHash,
      proof.noSourceCopyProofHash,
      proof.noTranscriptCopyProofHash,
      proof.privacyBoundaryHash,
    ]),
    summary: `${alerts.length} live drift alert(s), recommendation=${recommendation}; Decibench evidence coverage=${round(coverage)}`,
  });
}

export function runDecibenchVoiceLiveDrift(input: RunDecibenchVoiceLiveDriftInput): DecibenchVoiceLiveDriftResult {
  const allRows = [...input.baselineWindow.rows, ...input.liveWindow.rows];
  const stats = proofStats(input.sourceProof, allRows);
  const decibenchEvidenceCoverage0to1 = stats.total === 0 ? 0 : round(stats.present / stats.total);
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
      input.sourceProof.licenseReferenceHash,
      input.sourceProof.githubLicenseNoAssertionHash,
      input.sourceProof.privacyBoundaryHash,
    ]),
    now: input.now,
  });
  const enrichedReceipt = withDecibenchReceipt(
    receipt,
    decibenchEvidenceCoverage0to1,
    stats.missingReasons,
    input.sourceProof,
  );

  return {
    receipt: enrichedReceipt,
    watchAlerts: buildLiveDriftWatchAlerts(enrichedReceipt),
    sourceProof: input.sourceProof,
    rowProofs,
    missingReasons: stats.missingReasons,
    decibenchEvidenceCoverage0to1,
  };
}
