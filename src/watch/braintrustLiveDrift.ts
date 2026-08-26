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


/**
 * The shared proof-delegated monitor, specialised for Braintrust (P5.2b).
 *
 * The coverage walk, alert construction, receipt enrichment and rehash used to
 * be ~180 lines here and in four sibling files with 0.97+ token similarity.
 * They now live once in `proofDelegatedMonitor.ts`. What stays is what actually
 * differs: which fields must be present, which refs go where, and the exact
 * hashed payload.
 *
 * `rowPayload` is spelled out rather than derived from a field list because its
 * `?? null` handling reaches the published `rowProofHash` — an undefined key
 * disappears from the canonical JSON while a null key survives. The
 * characterization test pins the whole result hash, so any drift here is loud.
 */
const runMonitor = createProofDelegatedMonitor<BraintrustLiveDriftRow, BraintrustSourceProof>({
  incompleteSubject: "Braintrust-style live drift",
  summaryLabel: "braintrust evidence coverage",
  coverageMetricId: "braintrustEvidenceCoverage0to1",
  requiredProofFields: REQUIRED_SOURCE_PROOF_FIELDS,
  requiredRowFields: REQUIRED_ROW_PROOF_FIELDS,
  rowPayload: (row) => ({
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
  }),
  rowDescriptor: (row) => ({ surface: row.braintrustSurface }),
  alertRefs: (proof) => [
    proof.sourceRefHash,
    proof.productPageMetadataHash,
    proof.llmsTxtHash,
    proof.docsSnapshotHash,
    proof.driftStatisticHash,
    proof.alertReceiptHash,
  ],
  signedRefs: (proof) => [proof.ciReceiptHash, proof.signedEvidencePolicyHash],
  enrichedSourceRefs: (proof) => [
    proof.sourceRefHash,
    proof.productPageMetadataHash,
    proof.llmsTxtHash,
    proof.docsSnapshotHash,
    proof.amcNativeMappingHash,
    proof.noStandaloneSubsystemProofHash,
    proof.noCopiedProseProofHash,
  ],
  delegatedSourceRefs: (proof) => [
    proof.sourceRefHash,
    proof.llmsTxtHash,
    proof.docsSnapshotHash,
  ],
});

export function runBraintrustLiveDrift(input: RunBraintrustLiveDriftInput): BraintrustLiveDriftResult {
  const result = runMonitor(input);
  return {
    receipt: result.receipt,
    watchAlerts: result.watchAlerts,
    sourceProof: result.sourceProof,
    rowProofs: result.rowProofs as unknown as BraintrustRowProof[],
    missingReasons: result.missingReasons,
    braintrustEvidenceCoverage0to1: result.coverage0to1,
  };
}
