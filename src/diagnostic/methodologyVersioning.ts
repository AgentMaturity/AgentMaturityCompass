import type { DiagnosticMethodologyVersioningReceipt } from "../types.js";
import type { PublicMethodologyManifest } from "../methodology/publicMethodology.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export const METRONOUS_METHODOLOGY_VERSIONING_SOURCE_REF = "github:kiosvantra/metronous";
export const SUTRO_BATCH_METHODOLOGY_VERSIONING_SOURCE_REF = "github:sutro-sh/sutro";
export const AGENT_BELT_METHODOLOGY_VERSIONING_SOURCE_REF = "github:jfrog/agent-belt";
export const ARIZE_PHOENIX_SOURCE_REVIEW_REF = "web:https://phoenix.arize.com; docs:https://arize.com/docs/ax";

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasArrayValue(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function versioningAssuranceHash(manifest: PublicMethodologyManifest): string {
  return sha256Hex(canonicalize({
    methodologyVersioningAssurance: manifest.methodologyVersioningAssurance,
    sutroBatchMethodologyAssurance: manifest.sutroBatchMethodologyAssurance,
    agentBeltMethodologyAssurance: manifest.agentBeltMethodologyAssurance,
    sourceReviewBoundaries: manifest.scoreClaimBoundaries.filter((boundary) => boundary.boundary === "arize_phoenix_eval_observability_metric_validity"),
    sourceReviewGates: manifest.metricValidationGates.filter((gate) => gate.gate === "arize_phoenix_observability_eval_coverage")
  }));
}

export function buildDiagnosticMethodologyVersioningReceipt(
  manifest: PublicMethodologyManifest,
): DiagnosticMethodologyVersioningReceipt {
  const assurance = manifest.methodologyVersioningAssurance;
  const sutroAssurance = manifest.sutroBatchMethodologyAssurance;
  const agentBeltAssurance = manifest.agentBeltMethodologyAssurance;
  const arizePhoenixBoundary = manifest.scoreClaimBoundaries.find((boundary) => boundary.boundary === "arize_phoenix_eval_observability_metric_validity");
  const arizePhoenixGate = manifest.metricValidationGates.find((gate) => gate.gate === "arize_phoenix_observability_eval_coverage");
  const checks = [
    { field: "methodology.id", present: hasText(manifest.id) },
    { field: "methodology.version", present: hasText(manifest.version) },
    { field: "methodology.hash", present: hasText(manifest.hash) },
    { field: "questionSet.version", present: hasText(manifest.questionSet.version) },
    { field: "changelog.currentVersion", present: manifest.changelog[0]?.version === manifest.version },
    { field: "deprecationNotice", present: hasText(manifest.deprecationNotice) },
    { field: "migrationGuidance", present: hasArrayValue(manifest.migrationGuidance) },
    { field: "badgeQueryParams.amc_methodology_assurance", present: manifest.reportBindings.badgeQueryParams.includes("amc_methodology_assurance") },
    { field: "methodologyVersioningAssurance.telemetrySchemaHash", present: assurance.requiredAuditFields.includes("telemetrySchemaHash") },
    { field: "methodologyVersioningAssurance.benchmarkCorpusHash", present: assurance.requiredAuditFields.includes("benchmarkCorpusHash") },
    { field: "methodologyVersioningAssurance.modelCalibrationReportHash", present: assurance.requiredAuditFields.includes("modelCalibrationReportHash") },
    { field: "methodologyVersioningAssurance.thresholdPolicyHash", present: assurance.requiredAuditFields.includes("thresholdPolicyHash") },
    { field: "methodologyVersioningAssurance.exportSanitizationPolicyHash", present: assurance.requiredAuditFields.includes("exportSanitizationPolicyHash") },
    { field: "methodologyVersioningAssurance.noCopyBoundary", present: hasText(assurance.noCopyBoundary) },
    { field: "sutroBatchMethodologyAssurance.sourceRepositorySnapshotHash", present: sutroAssurance.requiredAuditFields.includes("sourceRepositorySnapshotHash") },
    { field: "sutroBatchMethodologyAssurance.judgeClassifierExtractorSchemaHash", present: sutroAssurance.requiredAuditFields.includes("judgeClassifierExtractorSchemaHash") },
    { field: "sutroBatchMethodologyAssurance.inputDataSourceManifestHash", present: sutroAssurance.requiredAuditFields.includes("inputDataSourceManifestHash") },
    { field: "sutroBatchMethodologyAssurance.inputOrderPreservationHash", present: sutroAssurance.requiredAuditFields.includes("inputOrderPreservationHash") },
    { field: "sutroBatchMethodologyAssurance.dryRunCostEstimateHash", present: sutroAssurance.requiredAuditFields.includes("dryRunCostEstimateHash") },
    { field: "sutroBatchMethodologyAssurance.observabilityTraceSchemaHash", present: sutroAssurance.requiredAuditFields.includes("observabilityTraceSchemaHash") },
    { field: "sutroBatchMethodologyAssurance.resultExportManifestHash", present: sutroAssurance.requiredAuditFields.includes("resultExportManifestHash") },
    { field: "sutroBatchMethodologyAssurance.retentionPolicyHash", present: sutroAssurance.requiredAuditFields.includes("retentionPolicyHash") },
    { field: "sutroBatchMethodologyAssurance.noCopyBoundary", present: hasText(sutroAssurance.noCopyBoundary) },
    { field: "agentBeltMethodologyAssurance.sourceRepositorySnapshotHash", present: agentBeltAssurance.requiredAuditFields.includes("sourceRepositorySnapshotHash") },
    { field: "agentBeltMethodologyAssurance.releaseTagHash", present: agentBeltAssurance.requiredAuditFields.includes("releaseTagHash") },
    { field: "agentBeltMethodologyAssurance.scenarioSchemaHash", present: agentBeltAssurance.requiredAuditFields.includes("scenarioSchemaHash") },
    { field: "agentBeltMethodologyAssurance.scenarioManifestHash", present: agentBeltAssurance.requiredAuditFields.includes("scenarioManifestHash") },
    { field: "agentBeltMethodologyAssurance.agentAdapterRosterHash", present: agentBeltAssurance.requiredAuditFields.includes("agentAdapterRosterHash") },
    { field: "agentBeltMethodologyAssurance.workspaceDiffCheckHash", present: agentBeltAssurance.requiredAuditFields.includes("workspaceDiffCheckHash") },
    { field: "agentBeltMethodologyAssurance.ruleCheckPolicyHash", present: agentBeltAssurance.requiredAuditFields.includes("ruleCheckPolicyHash") },
    { field: "agentBeltMethodologyAssurance.multiJudgeConsensusConfigHash", present: agentBeltAssurance.requiredAuditFields.includes("multiJudgeConsensusConfigHash") },
    { field: "agentBeltMethodologyAssurance.perTurnJudgeConfigHash", present: agentBeltAssurance.requiredAuditFields.includes("perTurnJudgeConfigHash") },
    { field: "agentBeltMethodologyAssurance.passKReliabilityPolicyHash", present: agentBeltAssurance.requiredAuditFields.includes("passKReliabilityPolicyHash") },
    { field: "agentBeltMethodologyAssurance.passPowerKReliabilityPolicyHash", present: agentBeltAssurance.requiredAuditFields.includes("passPowerKReliabilityPolicyHash") },
    { field: "agentBeltMethodologyAssurance.worktreeIsolationPolicyHash", present: agentBeltAssurance.requiredAuditFields.includes("worktreeIsolationPolicyHash") },
    { field: "agentBeltMethodologyAssurance.dockerSandboxPolicyHash", present: agentBeltAssurance.requiredAuditFields.includes("dockerSandboxPolicyHash") },
    { field: "agentBeltMethodologyAssurance.exportFormatManifestHash", present: agentBeltAssurance.requiredAuditFields.includes("exportFormatManifestHash") },
    { field: "agentBeltMethodologyAssurance.ciWorkflowHash", present: agentBeltAssurance.requiredAuditFields.includes("ciWorkflowHash") },
    { field: "agentBeltMethodologyAssurance.packageReleaseDigest", present: agentBeltAssurance.requiredAuditFields.includes("packageReleaseDigest") },
    { field: "agentBeltMethodologyAssurance.noCopyBoundary", present: hasText(agentBeltAssurance.noCopyBoundary) },
    { field: "sourceReview.arizePhoenix.boundary", present: arizePhoenixBoundary?.appliesWhen.includes("Score report") === true && arizePhoenixBoundary?.appliesWhen.includes("Shield receipt") === true && arizePhoenixBoundary?.appliesWhen.includes("Watch alert") === true },
    { field: "sourceReview.arizePhoenix.primarySourceDocs", present: arizePhoenixBoundary?.requiredEvidence.includes("live primary-source docs retrieval refs") === true },
    { field: "sourceReview.arizePhoenix.signedEvidence", present: arizePhoenixBoundary?.requiredEvidence.includes("signed evidence refs") === true },
    { field: "sourceReview.arizePhoenix.thresholdPolicy", present: arizePhoenixBoundary?.requiredEvidence.includes("fail-closed threshold policy") === true },
    { field: "sourceReview.arizePhoenix.metadataOnlyFailClosed", present: arizePhoenixBoundary?.publicDisclosure.includes("source metadata alone") === true && arizePhoenixBoundary?.publicDisclosure.includes("not a parity claim") === true },
    { field: "sourceReview.arizePhoenix.noCopyBoundary", present: arizePhoenixBoundary?.publicDisclosure.includes("does not authorize copied Phoenix website prose") === true },
    { field: "sourceReview.arizePhoenix.metricGate", present: arizePhoenixGate?.defaultThreshold.includes(">= 1.00 when required") === true && arizePhoenixGate?.migration.includes("signed-evidence refs") === true },
  ];
  const presentAuditFields = checks.filter((check) => check.present).map((check) => check.field);
  const missingAuditFields = checks.filter((check) => !check.present).map((check) => check.field);
  const failClosedReasons = missingAuditFields.map((field) => `Missing methodology-versioning audit field: ${field}`);
  const assuranceHash = versioningAssuranceHash(manifest);
  const receiptWithoutHash = {
    schemaVersion: 1 as const,
    id: "amc-methodology-versioning-receipt",
    generatedAt: `${manifest.releaseDate}T00:00:00.000Z`,
    status: missingAuditFields.length === 0 ? "ready" as const : "fail_closed" as const,
    sourceRef: `${METRONOUS_METHODOLOGY_VERSIONING_SOURCE_REF}; ${SUTRO_BATCH_METHODOLOGY_VERSIONING_SOURCE_REF}; ${AGENT_BELT_METHODOLOGY_VERSIONING_SOURCE_REF}; ${ARIZE_PHOENIX_SOURCE_REVIEW_REF}`,
    sourceKind: "methodology_versioning_assurance_bundle" as const,
    methodology: {
      id: manifest.id,
      version: manifest.version,
      releaseDate: manifest.releaseDate,
      hash: manifest.hash,
      questionSetVersion: manifest.questionSet.version,
      versioningAssuranceHash: assuranceHash,
    },
    requiredAuditFields: [...assurance.requiredAuditFields, ...sutroAssurance.requiredAuditFields, ...agentBeltAssurance.requiredAuditFields, "arizePhoenixPrimarySourceDocsRefs", "arizePhoenixTraceSpanExportManifest", "arizePhoenixEvaluatorTaskConfigManifest", "arizePhoenixDatasetExperimentManifest", "arizePhoenixAnnotationEvalExport", "arizePhoenixThresholdPolicy", "arizePhoenixSignedEvidenceRefs", "arizePhoenixRowHashes", "arizePhoenixNoCopyBoundary"],
    presentAuditFields,
    missingAuditFields,
    badgeQueryParams: [...manifest.reportBindings.badgeQueryParams],
    diagnosticFields: Array.from(new Set([...assurance.diagnosticFields, ...sutroAssurance.diagnosticFields, ...agentBeltAssurance.diagnosticFields])),
    telemetryCalibrationProof: {
      telemetrySchemaRequired: true as const,
      benchmarkCorpusRequired: true as const,
      thresholdPolicyRequired: true as const,
      modelCalibrationReportRequired: true as const,
      costAccountingRequired: true as const,
      exportSanitizationRequired: true as const,
      localArchiveBoundaryRequired: true as const,
      sourceMetadataOnlyRejected: true as const,
      noCopyBoundary: assurance.noCopyBoundary,
    },
    batchMethodologyProof: {
      sourceRepositorySnapshotRequired: true as const,
      licenseBoundaryRequired: true as const,
      functionDefinitionRequired: true as const,
      judgeClassifierExtractorSchemaRequired: true as const,
      inputDataSourceRequired: true as const,
      inputOrderPreservationRequired: true as const,
      batchPriorityPolicyRequired: true as const,
      dryRunCostEstimateRequired: true as const,
      modelPoolRequired: true as const,
      observabilityTraceSchemaRequired: true as const,
      resultExportRequired: true as const,
      retentionPolicyRequired: true as const,
      multiModelComparisonRequired: true as const,
      embeddingJobRequired: true as const,
      sourceMetadataOnlyRejected: true as const,
      noCopyBoundary: sutroAssurance.noCopyBoundary,
    },
    agentBeltMethodologyProof: {
      sourceRepositorySnapshotRequired: true as const,
      licenseBoundaryRequired: true as const,
      releaseTagRequired: true as const,
      readmeDocsRequired: true as const,
      scenarioSchemaRequired: true as const,
      scenarioManifestRequired: true as const,
      agentAdapterRosterRequired: true as const,
      customAgentContractRequired: true as const,
      workspaceDiffCheckRequired: true as const,
      ruleCheckPolicyRequired: true as const,
      multiJudgeConsensusRequired: true as const,
      perTurnJudgeConfigRequired: true as const,
      passKReliabilityRequired: true as const,
      passPowerKReliabilityRequired: true as const,
      worktreeIsolationRequired: true as const,
      dockerSandboxRequired: true as const,
      exportFormatRequired: true as const,
      ciWorkflowRequired: true as const,
      packageReleaseDigestRequired: true as const,
      sourceMetadataOnlyRejected: true as const,
      noCopyBoundary: agentBeltAssurance.noCopyBoundary,
    },
    evidenceRefs: ["amc:public-methodology", "amc:badge-methodology-binding", "amc:diagnostic-methodology-versioning", "amc:agent-belt-methodology-assurance", "amc:arize-phoenix-source-review-boundary"],
    rejectedEvidenceRefs: ["metadata-only:kiosvantra/metronous", "metadata-only:sutro-sh/sutro", "metadata-only:jfrog/agent-belt", "metadata-only:phoenix.arize.com"],
    failClosedReasons,
    warnings: [
      "Metronous-style repository metadata is a discovery signal only; AMC requires local telemetry, benchmark, calibration, migration, and badge-methodology receipts before public comparability claims.",
      "Sutro-style repository metadata is a discovery signal only; AMC requires function/schema, data-source, priority, dry-run cost, observability, export, retention, multi-model, embedding, and badge-methodology receipts before public comparability claims.",
      "Agent Belt-style repository metadata is a discovery signal only; AMC requires source snapshot, license, release, scenario schema, agent-adapter, workspace-diff, rule-check, judge-config, pass@k/pass^k, isolation, export, CI, package-digest, and badge-methodology receipts before public comparability claims.",
      "Arize Phoenix/AX public docs are relevant source-review signals for observability/evaluation boundaries, but metadata, labels, screenshots, copied website prose, examples, or aggregate eval scores fail closed without AMC-owned eval packs, trace/span exports, evaluator configs, dataset/experiment manifests, thresholds, signed evidence, and row hashes.",
    ],
  };
  return {
    ...receiptWithoutHash,
    receiptHash: sha256Hex(canonicalize(receiptWithoutHash)),
  };
}
