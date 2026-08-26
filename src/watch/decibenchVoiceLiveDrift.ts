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
import { createProofDelegatedMonitor } from "./proofDelegatedMonitor.js";
import type {
  LiveDriftReceipt,
  LiveDriftSampleRow,
  LiveDriftThresholds,
  LiveDriftWatchAlert,
  LiveDriftWindow,
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


/**
 * The shared proof-delegated monitor, specialised for Decibench voice live drift (P5.2b).
 *
 * The coverage walk, alert construction, receipt enrichment and rehash used to
 * be ~180 lines here and in four sibling files at 0.97+ token similarity. They
 * now live once in `proofDelegatedMonitor.ts`. What remains is what genuinely
 * differs: which fields must be present, which refs go where, and the exact
 * hashed payload — spelled out rather than derived, because its `?? null`
 * handling reaches the published `rowProofHash`.
 */
const runMonitor = createProofDelegatedMonitor<DecibenchVoiceLiveDriftRow, DecibenchVoiceSourceProof>({
  incompleteSubject: "Decibench voice live drift",
  summaryLabel: "Decibench evidence coverage",
  coverageMetricId: "decibenchEvidenceCoverage0to1",
  requiredProofFields: REQUIRED_SOURCE_PROOF_FIELDS,
  requiredRowFields: REQUIRED_ROW_PROOF_FIELDS,
  rowPayload: (row) => ({
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
  }),
  rowDescriptor: (row) => ({ taskType: row.decibenchVoiceTaskType, channel: row.decibenchChannel }),
  alertRefs: (proof) => [proof.sourceRefHash, proof.repositorySnapshotHash, proof.readmeBlobHash, proof.cliRunHash, proof.mcpToolsRagHash, proof.driftStatisticHash, proof.alertReceiptHash, proof.privacyBoundaryHash],
  signedRefs: (proof) => [proof.ciReceiptHash],
  enrichedSourceRefs: (proof) => [proof.sourceRefHash, proof.repositorySnapshotHash, proof.licenseReferenceHash, proof.githubLicenseNoAssertionHash, proof.defaultBranchHash, proof.releaseTagHash, proof.readmeBlobHash, proof.pyprojectHash, proof.ciWorkflowHash, proof.cliTreeHash, proof.cliRunHash, proof.cliRagHash, proof.mcpTreeHash, proof.mcpToolsRagHash, proof.ragTreeHash, proof.evaluatorsTreeHash, proof.audioTreeHash, proof.scenariosTreeHash, proof.scenarioSuiteManifestHash, proof.bridgeSidecarTreeHash, proof.dashboardTreeHash, proof.noSourceCopyProofHash, proof.noTranscriptCopyProofHash, proof.privacyBoundaryHash],
  delegatedSourceRefs: (proof) => [proof.sourceRefHash, proof.repositorySnapshotHash, proof.licenseReferenceHash, proof.githubLicenseNoAssertionHash, proof.privacyBoundaryHash],
});

export function runDecibenchVoiceLiveDrift(input: RunDecibenchVoiceLiveDriftInput): DecibenchVoiceLiveDriftResult {
  const result = runMonitor(input);
  return {
    receipt: result.receipt,
    watchAlerts: result.watchAlerts,
    sourceProof: result.sourceProof,
    rowProofs: result.rowProofs as unknown as DecibenchVoiceRowProof[],
    missingReasons: result.missingReasons,
    decibenchEvidenceCoverage0to1: result.coverage0to1,
  };
}
