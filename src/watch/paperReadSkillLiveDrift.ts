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


/**
 * The shared proof-delegated monitor, specialised for Paper-read-skill live drift (P5.2b).
 *
 * The coverage walk, alert construction, receipt enrichment and rehash used to
 * be ~180 lines here and in four sibling files at 0.97+ token similarity. They
 * now live once in `proofDelegatedMonitor.ts`. What remains is what genuinely
 * differs: which fields must be present, which refs go where, and the exact
 * hashed payload — spelled out rather than derived, because its `?? null`
 * handling reaches the published `rowProofHash`.
 */
const runMonitor = createProofDelegatedMonitor<PaperReadSkillLiveDriftRow, PaperReadSkillSourceProof>({
  incompleteSubject: "Paper-read-skill live drift",
  summaryLabel: "paper-read-skill evidence coverage",
  coverageMetricId: "paperReadSkillEvidenceCoverage0to1",
  requiredProofFields: REQUIRED_SOURCE_PROOF_FIELDS,
  requiredRowFields: REQUIRED_ROW_PROOF_FIELDS,
  rowPayload: (row) => ({
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
  }),
  rowDescriptor: (row) => ({ route: row.paperReadSkillRoute, taskId: row.paperReadSkillTaskId }),
  alertRefs: (proof) => [proof.sourceRefHash, proof.repositorySnapshotHash, proof.readmeBlobHash, proof.llmsManifestHash, proof.driftStatisticHash, proof.alertReceiptHash],
  signedRefs: (proof) => [proof.ciReceiptHash],
  enrichedSourceRefs: (proof) => [proof.sourceRefHash, proof.repositorySnapshotHash, proof.noLicenseBoundaryHash, proof.readmeBlobHash, proof.llmsManifestHash, proof.skillsTreeHash, proof.paperAnalysisSkillHash, proof.paperAnalysisPromptCatalogHash, proof.blogReadingSkillHash, proof.blogReadingPromptCatalogHash],
  delegatedSourceRefs: (proof) => [proof.sourceRefHash, proof.repositorySnapshotHash, proof.noLicenseBoundaryHash],
});

export function runPaperReadSkillLiveDrift(input: RunPaperReadSkillLiveDriftInput): PaperReadSkillLiveDriftResult {
  const result = runMonitor(input);
  return {
    receipt: result.receipt,
    watchAlerts: result.watchAlerts,
    sourceProof: result.sourceProof,
    rowProofs: result.rowProofs as unknown as PaperReadSkillRowProof[],
    missingReasons: result.missingReasons,
    paperReadSkillEvidenceCoverage0to1: result.coverage0to1,
  };
}
