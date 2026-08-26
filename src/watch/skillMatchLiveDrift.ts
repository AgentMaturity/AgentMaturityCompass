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


/**
 * The shared proof-delegated monitor, specialised for SkillMatch resume live drift (P5.2b).
 *
 * The coverage walk, alert construction, receipt enrichment and rehash used to
 * be ~180 lines here and in four sibling files at 0.97+ token similarity. They
 * now live once in `proofDelegatedMonitor.ts`. What remains is what genuinely
 * differs: which fields must be present, which refs go where, and the exact
 * hashed payload — spelled out rather than derived, because its `?? null`
 * handling reaches the published `rowProofHash`.
 */
const runMonitor = createProofDelegatedMonitor<SkillMatchResumeLiveDriftRow, SkillMatchResumeSourceProof>({
  incompleteSubject: "SkillMatch resume live drift",
  summaryLabel: "SkillMatch evidence coverage",
  coverageMetricId: "skillMatchEvidenceCoverage0to1",
  requiredProofFields: REQUIRED_SOURCE_PROOF_FIELDS,
  requiredRowFields: REQUIRED_ROW_PROOF_FIELDS,
  rowPayload: (row) => ({
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
  }),
  rowDescriptor: (row) => ({ taskType: row.skillMatchTaskType, resumeFormat: row.skillMatchResumeFormat }),
  alertRefs: (proof) => [proof.sourceRefHash, proof.repositorySnapshotHash, proof.readmeBlobHash, proof.frontendAnalyzerComponentHash, proof.driftStatisticHash, proof.alertReceiptHash, proof.privacyBoundaryHash],
  signedRefs: (proof) => [proof.ciReceiptHash],
  enrichedSourceRefs: (proof) => [proof.sourceRefHash, proof.repositorySnapshotHash, proof.noLicenseBoundaryHash, proof.defaultBranchHash, proof.readmeBlobHash, proof.frontendTreeHash, proof.frontendAnalyzerComponentHash, proof.frontendPdfExtractorHash, proof.oldVersionTreeHash, proof.oldAppHash, proof.oldNotebookHash, proof.requirementsHash, proof.noSourceCopyProofHash, proof.noResumeCopyProofHash, proof.privacyBoundaryHash],
  delegatedSourceRefs: (proof) => [proof.sourceRefHash, proof.repositorySnapshotHash, proof.noLicenseBoundaryHash, proof.privacyBoundaryHash],
});

export function runSkillMatchResumeLiveDrift(input: RunSkillMatchResumeLiveDriftInput): SkillMatchResumeLiveDriftResult {
  const result = runMonitor(input);
  return {
    receipt: result.receipt,
    watchAlerts: result.watchAlerts,
    sourceProof: result.sourceProof,
    rowProofs: result.rowProofs as unknown as SkillMatchResumeRowProof[],
    missingReasons: result.missingReasons,
    skillMatchEvidenceCoverage0to1: result.coverage0to1,
  };
}
