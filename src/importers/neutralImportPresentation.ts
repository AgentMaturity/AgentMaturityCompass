import type { AMCTraceV1 } from "../correlation/traceSchema.js";
import type { ProductionTrace } from "../agents/traceIngestion.js";
import type { DiagnosticReport } from "../types.js";
import { evaluateDiagnosticEvidenceReadiness } from "../diagnostic/evidenceReadiness.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { NeutralImportCandidate, NeutralImportPlan } from "./neutralImporter.js";

/** Already-redacted projection supplied by the parser, before any persistence. */
export interface NeutralImportProjection {
  candidate: NeutralImportCandidate;
  redacted: unknown;
  traces: Array<AMCTraceV1 | ProductionTrace>;
  evidenceRefs: string[];
}

export function buildImportedDiagnosticReport(input: {
  workspace: string;
  agentId: string;
  importId: string;
  plan: NeutralImportPlan;
  parsedCandidates: NeutralImportProjection[];
}): DiagnosticReport {
  const ts = Date.now();
  // Keep the legacy report envelope for existing import consumers, but do not
  // manufacture a maturity measurement from file counts or parseable fields.
  // Zero numeric values mean no accepted diagnostic evidence; no questions or
  // layers were evaluated. Source trust is separate from artifact signing.
  const reportBase: Omit<DiagnosticReport, "reportJsonSha256"> = {
    agentId: input.agentId,
    runId: input.importId,
    ts,
    windowStartTs: ts,
    windowEndTs: ts,
    status: "UNSIGNED",
    verificationPassed: false,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0,
    trustLabel: "UNRELIABLE — DO NOT USE FOR CLAIMS",
    targetProfileId: null,
    layerScores: [],
    questionScores: [],
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 0,
    invalidReceiptsCount: 0,
    correlationWarnings: input.plan.warnings,
    evidenceCoverage: 0,
    evidenceTrustCoverage: {
      observed: 0,
      attested: 0,
      selfReported: 1
    },
    importProvenance: {
      evaluationPerformed: false,
      sourceTrustTier: "SELF_REPORTED",
      artifactCount: input.plan.candidateCount,
      recordCount: input.plan.candidates.reduce((sum, candidate) => sum + candidate.recordCount, 0),
      evidenceRefs: [...new Set(input.parsedCandidates.flatMap((candidate) => candidate.evidenceRefs))].sort()
    },
    targetDiff: [],
    prioritizedUpgradeActions: input.plan.unsupported.length > 0
      ? ["Review skipped files and convert them to JSON, JSONL, YAML, or NDJSON with recognized trace, run, graph, config, memory, eval, or benchmark fields."]
      : [],
    evidenceToCollectNext: ["Run a full AMC score after importing to correlate imported evidence with live maturity questions."],
    runSealSig: "unsigned-import",
  };
  reportBase.evidenceReadiness = evaluateDiagnosticEvidenceReadiness(reportBase);
  return {
    ...reportBase,
    reportJsonSha256: sha256Hex(canonicalize(reportBase))
  };
}

export function renderImportedReportMarkdown(report: DiagnosticReport, plan: NeutralImportPlan): string {
  return [
    `# AMC Neutral Import ${plan.importId}`,
    "",
    `- Agent: ${report.agentId}`,
    `- Source: ${plan.sourcePath}`,
    `- Categories: ${plan.categories.join(", ") || "none"}`,
    `- Candidates: ${plan.candidateCount}`,
    `- Redactions: ${plan.redactionCount}`,
    `- Status: ${plan.status}`,
    "- Source trust: SELF_REPORTED — source claims have not been verified.",
    "- Evaluation: No maturity evaluation was performed. Import completion is not a score.",
    "",
    "## Imported Artifacts",
    ...plan.candidates.map((candidate) => `- ${candidate.category}: ${candidate.path} (${candidate.recordCount} record(s))`),
    "",
    "## Warnings",
    ...(plan.warnings.length > 0 ? plan.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    ""
  ].join("\n");
}

export function normalizedImportBody(input: {
  plan: NeutralImportPlan;
  parsedCandidates: NeutralImportProjection[];
}): string {
  const artifacts = input.parsedCandidates.map((candidate) => ({
    category: candidate.candidate.category,
    path: candidate.candidate.path,
    digest: candidate.candidate.digest,
    redactionCount: candidate.candidate.redactionCount,
    recordCount: candidate.candidate.recordCount,
    data: candidate.redacted,
    // Derived from the redacted rows above, so the mapping is auditable in place.
    traces: candidate.traces
  }));
  return `${JSON.stringify({
    schemaVersion: "2026-05-22",
    importId: input.plan.importId,
    createdAt: new Date().toISOString(),
    redactionPolicy: {
      persistedRawPayloads: false,
      redactedBeforeWrite: true
    },
    plan: input.plan,
    artifacts
  }, null, 2)}\n`;
}

