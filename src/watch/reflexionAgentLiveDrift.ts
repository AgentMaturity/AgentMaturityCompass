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
import { createProofDelegatedMonitor, numericAwareIsPresent } from "./proofDelegatedMonitor.js";
import type {
  LiveDriftReceipt,
  LiveDriftSampleRow,
  LiveDriftThresholds,
  LiveDriftWatchAlert,
  LiveDriftWindow,
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


/**
 * The shared proof-delegated monitor, specialised for Reflexion-agent live drift (P5.2b).
 *
 * The coverage walk, alert construction, receipt enrichment and rehash used to
 * be ~180 lines here and in four sibling files at 0.97+ token similarity. They
 * now live once in `proofDelegatedMonitor.ts`. What remains is what genuinely
 * differs: which fields must be present, which refs go where, and the exact
 * hashed payload — spelled out rather than derived, because its `?? null`
 * handling reaches the published `rowProofHash`.
 */
const runMonitor = createProofDelegatedMonitor<ReflexionAgentLiveDriftRow, ReflexionAgentSourceProof>({
  incompleteSubject: "Reflexion-agent live drift",
  summaryLabel: "Reflexion-agent evidence coverage",
  coverageMetricId: "reflexionAgentEvidenceCoverage0to1",
  requiredProofFields: REQUIRED_SOURCE_PROOF_FIELDS,
  requiredRowFields: REQUIRED_ROW_PROOF_FIELDS,
  isPresent: numericAwareIsPresent,
  rowPayload: (row) => ({
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
  }),
  rowDescriptor: (row) => ({ taskType: row.reflexionTaskType }),
  alertRefs: (proof) => [proof.sourceRefHash, proof.repositorySnapshotHash, proof.reflexionAgentBlobHash, proof.evaluatorBlobHash, proof.typesBlobHash, proof.sourceRelevanceMappingHash, proof.driftStatisticHash, proof.alertReceiptHash],
  signedRefs: (proof) => [proof.ciReceiptHash],
  enrichedSourceRefs: (proof) => [proof.sourceRefHash, proof.repositorySnapshotHash, proof.licenseHash, proof.defaultBranchHash, proof.readmeBlobHash, proof.packageJsonHash, proof.reflexionAgentBlobHash, proof.evaluatorBlobHash, proof.typesBlobHash, proof.memoryBlobHash, proof.sourceRelevanceMappingHash, proof.evaluatorPolicyHash, proof.reflectionMemoryPolicyHash, proof.noSourceCopyProofHash],
  delegatedSourceRefs: (proof) => [proof.sourceRefHash, proof.repositorySnapshotHash, proof.licenseHash, proof.defaultBranchHash],
});

export function runReflexionAgentLiveDrift(input: RunReflexionAgentLiveDriftInput): ReflexionAgentLiveDriftResult {
  const result = runMonitor(input);
  return {
    receipt: result.receipt,
    watchAlerts: result.watchAlerts,
    sourceProof: result.sourceProof,
    rowProofs: result.rowProofs as unknown as ReflexionAgentRowProof[],
    missingReasons: result.missingReasons,
    reflexionAgentEvidenceCoverage0to1: result.coverage0to1,
  };
}
