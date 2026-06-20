import type { DiagnosticMethodologyVersioningReceipt } from "../types.js";
import type { PublicMethodologyManifest } from "../methodology/publicMethodology.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export const METRONOUS_METHODOLOGY_VERSIONING_SOURCE_REF = "github:kiosvantra/metronous";
export const SUTRO_BATCH_METHODOLOGY_VERSIONING_SOURCE_REF = "github:sutro-sh/sutro";
export const AGENT_BELT_METHODOLOGY_VERSIONING_SOURCE_REF = "github:jfrog/agent-belt";
export const ARIZE_PHOENIX_SOURCE_REVIEW_REF = "web:https://phoenix.arize.com; docs:https://arize.com/docs/ax";
export const LUNARY_SOURCE_REVIEW_REF = "web:https://lunary.ai";
export const FACT_CHECKING_FACTUALITY_REVIEW_SOURCE_REVIEW_REF = "doi:https://doi.org/10.1007/s10462-025-11454-w; openalex:https://openalex.org/W7118132038";
export const GOOGLE_ADK_SOURCE_REVIEW_REF = "github:google/adk-python";
export const DIGITAL_MATERIALS_ECOSYSTEM_SOURCE_REVIEW_REF = "doi:10.1039/d5sc09229a; openalex:W7131071926";

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
    sourceReviewBoundaries: manifest.scoreClaimBoundaries.filter((boundary) => boundary.boundary === "arize_phoenix_eval_observability_metric_validity" || boundary.boundary === "lunary_observability_metric_validity" || boundary.boundary === "fact_checking_factuality_review_methodology_integrity" || boundary.boundary === "google_adk_eval_metric_validity" || boundary.boundary === "digital_materials_ecosystem_metric_validity"),
    sourceReviewGates: manifest.metricValidationGates.filter((gate) => gate.gate === "arize_phoenix_observability_eval_coverage" || gate.gate === "lunary_observability_metric_validity" || gate.gate === "fact_checking_factuality_review_methodology_evidence" || gate.gate === "google_adk_eval_metric_validity" || gate.gate === "digital_materials_ecosystem_metric_validity")
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
  const lunaryBoundary = manifest.scoreClaimBoundaries.find((boundary) => boundary.boundary === "lunary_observability_metric_validity");
  const lunaryGate = manifest.metricValidationGates.find((gate) => gate.gate === "lunary_observability_metric_validity");
  const factCheckingReviewBoundary = manifest.scoreClaimBoundaries.find((boundary) => boundary.boundary === "fact_checking_factuality_review_methodology_integrity");
  const factCheckingReviewGate = manifest.metricValidationGates.find((gate) => gate.gate === "fact_checking_factuality_review_methodology_evidence");
  const googleAdkBoundary = manifest.scoreClaimBoundaries.find((boundary) => boundary.boundary === "google_adk_eval_metric_validity");
  const googleAdkGate = manifest.metricValidationGates.find((gate) => gate.gate === "google_adk_eval_metric_validity");
  const digitalMaterialsBoundary = manifest.scoreClaimBoundaries.find((boundary) => boundary.boundary === "digital_materials_ecosystem_metric_validity");
  const digitalMaterialsGate = manifest.metricValidationGates.find((gate) => gate.gate === "digital_materials_ecosystem_metric_validity");
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
    { field: "sourceReview.lunary.boundary", present: lunaryBoundary?.appliesWhen.includes("Score report") === true && lunaryBoundary?.appliesWhen.includes("Shield receipt") === true && lunaryBoundary?.appliesWhen.includes("Watch alert") === true },
    { field: "sourceReview.lunary.validationTable", present: lunaryBoundary?.requiredEvidence.includes("validation table artifact") === true },
    { field: "sourceReview.lunary.metricOwner", present: lunaryBoundary?.requiredEvidence.includes("metric owner") === true },
    { field: "sourceReview.lunary.sampleSize", present: lunaryBoundary?.requiredEvidence.includes("sample size") === true },
    { field: "sourceReview.lunary.confidenceInterval", present: lunaryBoundary?.requiredEvidence.includes("confidence interval") === true },
    { field: "sourceReview.lunary.metadataOnlyFailClosed", present: lunaryBoundary?.publicDisclosure.includes("source metadata alone") === true && lunaryBoundary?.publicDisclosure.includes("not a parity claim") === true },
    { field: "sourceReview.lunary.noCopyBoundary", present: lunaryBoundary?.publicDisclosure.includes("does not authorize copied Lunary website prose") === true },
    { field: "sourceReview.lunary.metricGate", present: lunaryGate?.defaultThreshold.includes("validationTable present") === true && lunaryGate?.defaultThreshold.includes("metadata-only") === true },
    { field: "sourceReview.factCheckingFactualityReview.boundary", present: factCheckingReviewBoundary?.appliesWhen.includes("Score report") === true && factCheckingReviewBoundary?.appliesWhen.includes("Shield receipt") === true && factCheckingReviewBoundary?.appliesWhen.includes("Watch alert") === true },
    { field: "sourceReview.factCheckingFactualityReview.doiMetadata", present: factCheckingReviewBoundary?.requiredEvidence.includes("DOI metadata receipt hash") === true && factCheckingReviewBoundary?.appliesWhen.includes("10.1007/s10462-025-11454-w") === true },
    { field: "sourceReview.factCheckingFactualityReview.openAlexMetadata", present: factCheckingReviewBoundary?.requiredEvidence.includes("OpenAlex metadata receipt hash") === true && factCheckingReviewBoundary?.appliesWhen.includes("W7118132038") === true },
    { field: "sourceReview.factCheckingFactualityReview.noStandaloneSubsystem", present: factCheckingReviewBoundary?.publicDisclosure.includes("standalone fact-checking subsystem") === true },
    { field: "sourceReview.factCheckingFactualityReview.noCopyBoundary", present: factCheckingReviewBoundary?.publicDisclosure.includes("no paper prose") === true && factCheckingReviewBoundary?.publicDisclosure.includes("metric values are copied") === true },
    { field: "sourceReview.factCheckingFactualityReview.methodologyVersioning", present: factCheckingReviewBoundary?.requiredEvidence.includes("changelog row hash") === true && factCheckingReviewBoundary?.requiredEvidence.includes("deprecation notice hash") === true && factCheckingReviewBoundary?.requiredEvidence.includes("migration guidance hash") === true },
    { field: "sourceReview.factCheckingFactualityReview.metricGate", present: factCheckingReviewGate?.defaultThreshold.includes("DOI/OpenAlex metadata") === true && factCheckingReviewGate?.migration.includes("signed evidence") === true && factCheckingReviewGate?.appliesWhen.includes("Score, Shield, or Watch") === true },
    { field: "sourceReview.googleAdk.boundary", present: googleAdkBoundary?.appliesWhen.includes("Score report") === true && googleAdkBoundary?.appliesWhen.includes("Shield receipt") === true && googleAdkBoundary?.appliesWhen.includes("Watch alert") === true },
    { field: "sourceReview.googleAdk.validationTable", present: googleAdkBoundary?.requiredEvidence.includes("validation table artifact") === true },
    { field: "sourceReview.googleAdk.metricOwner", present: googleAdkBoundary?.requiredEvidence.includes("metric owner") === true },
    { field: "sourceReview.googleAdk.sampleSize", present: googleAdkBoundary?.requiredEvidence.includes("sample size") === true },
    { field: "sourceReview.googleAdk.confidenceInterval", present: googleAdkBoundary?.requiredEvidence.includes("confidence interval") === true },
    { field: "sourceReview.googleAdk.noAdapterBoundary", present: googleAdkBoundary?.publicDisclosure.includes("not a Google ADK subsystem, adapter, importer, or parity claim") === true },
    { field: "sourceReview.googleAdk.noCopyBoundary", present: googleAdkBoundary?.publicDisclosure.includes("does not authorize copied Google ADK code") === true },
    { field: "sourceReview.googleAdk.metricGate", present: googleAdkGate?.defaultThreshold.includes("validationTable present") === true && googleAdkGate?.migration.includes("existing evaluator-suite and trace-evaluation primitives") === true },
    { field: "sourceReview.digitalMaterials.boundary", present: digitalMaterialsBoundary?.appliesWhen.includes("Score report") === true && digitalMaterialsBoundary?.appliesWhen.includes("Shield receipt") === true && digitalMaterialsBoundary?.appliesWhen.includes("Watch alert") === true },
    { field: "sourceReview.digitalMaterials.doi", present: digitalMaterialsBoundary?.requiredEvidence.includes("Verified DOI metadata receipt") === true },
    { field: "sourceReview.digitalMaterials.openAlex", present: digitalMaterialsBoundary?.requiredEvidence.includes("verified OpenAlex metadata receipt") === true },
    { field: "sourceReview.digitalMaterials.validationTable", present: digitalMaterialsBoundary?.requiredEvidence.includes("validation table artifact") === true },
    { field: "sourceReview.digitalMaterials.metricOwner", present: digitalMaterialsBoundary?.requiredEvidence.includes("metric owner") === true },
    { field: "sourceReview.digitalMaterials.sampleSize", present: digitalMaterialsBoundary?.requiredEvidence.includes("sample size") === true },
    { field: "sourceReview.digitalMaterials.confidenceInterval", present: digitalMaterialsBoundary?.requiredEvidence.includes("confidence interval") === true },
    { field: "sourceReview.digitalMaterials.metadataOnlyFailClosed", present: digitalMaterialsBoundary?.publicDisclosure.includes("source metadata alone") === true && digitalMaterialsBoundary?.publicDisclosure.includes("not a materials-domain subsystem") === true && digitalMaterialsBoundary?.publicDisclosure.includes("not a parity claim") === true },
    { field: "sourceReview.digitalMaterials.noCopyBoundary", present: digitalMaterialsBoundary?.publicDisclosure.includes("does not authorize copied paper prose") === true },
    { field: "sourceReview.digitalMaterials.metricGate", present: digitalMaterialsGate?.defaultThreshold.includes("DOI/OpenAlex metadata verified") === true && digitalMaterialsGate?.defaultThreshold.includes("validationTable present") === true && digitalMaterialsGate?.defaultThreshold.includes("metadata-only") === true },
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
    sourceRef: `${METRONOUS_METHODOLOGY_VERSIONING_SOURCE_REF}; ${SUTRO_BATCH_METHODOLOGY_VERSIONING_SOURCE_REF}; ${AGENT_BELT_METHODOLOGY_VERSIONING_SOURCE_REF}; ${ARIZE_PHOENIX_SOURCE_REVIEW_REF}; ${LUNARY_SOURCE_REVIEW_REF}; ${FACT_CHECKING_FACTUALITY_REVIEW_SOURCE_REVIEW_REF}; ${GOOGLE_ADK_SOURCE_REVIEW_REF}; ${DIGITAL_MATERIALS_ECOSYSTEM_SOURCE_REVIEW_REF}`,
    sourceKind: "methodology_versioning_assurance_bundle" as const,
    methodology: {
      id: manifest.id,
      version: manifest.version,
      releaseDate: manifest.releaseDate,
      hash: manifest.hash,
      questionSetVersion: manifest.questionSet.version,
      versioningAssuranceHash: assuranceHash,
    },
    requiredAuditFields: [...assurance.requiredAuditFields, ...sutroAssurance.requiredAuditFields, ...agentBeltAssurance.requiredAuditFields, "arizePhoenixPrimarySourceDocsRefs", "arizePhoenixTraceSpanExportManifest", "arizePhoenixEvaluatorTaskConfigManifest", "arizePhoenixDatasetExperimentManifest", "arizePhoenixAnnotationEvalExport", "arizePhoenixThresholdPolicy", "arizePhoenixSignedEvidenceRefs", "arizePhoenixRowHashes", "arizePhoenixNoCopyBoundary", "lunaryLiveSourceReceipt", "lunaryTraceSessionExportManifest", "lunaryValidationTable", "lunaryMetricOwner", "lunarySampleSize", "lunaryConfidenceInterval", "lunarySignedEvidenceRefs", "lunaryNoCopyBoundary", "factCheckingFactualityReviewDoiMetadataReceipt", "factCheckingFactualityReviewOpenAlexMetadataReceipt", "factCheckingFactualityReviewControlMapping", "factCheckingFactualityReviewThresholdPolicy", "factCheckingFactualityReviewSignedEvidenceRefs", "factCheckingFactualityReviewNoCopyBoundary", "googleAdkLiveGithubMetadataReceipt", "googleAdkValidationTable", "googleAdkEvaluatorSuiteProof", "googleAdkTraceEvaluationProofWhenClaimed", "googleAdkThresholdPolicy", "googleAdkMetricOwner", "googleAdkSampleSize", "googleAdkConfidenceInterval", "googleAdkSignedEvidenceRefs", "googleAdkNoCopyBoundary", "digitalMaterialsDoiMetadataReceipt", "digitalMaterialsOpenAlexMetadataReceipt", "digitalMaterialsValidationTable", "digitalMaterialsMetricOwner", "digitalMaterialsSampleSize", "digitalMaterialsConfidenceInterval", "digitalMaterialsSignedEvidenceRefs", "digitalMaterialsNoCopyBoundary"],
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
    evidenceRefs: ["amc:public-methodology", "amc:badge-methodology-binding", "amc:diagnostic-methodology-versioning", "amc:agent-belt-methodology-assurance", "amc:arize-phoenix-source-review-boundary", "amc:lunary-source-review-boundary", "amc:fact-checking-factuality-review-methodology-boundary", "amc:google-adk-source-review-boundary", "amc:digital-materials-ecosystem-source-review-boundary"],
    rejectedEvidenceRefs: ["metadata-only:kiosvantra/metronous", "metadata-only:sutro-sh/sutro", "metadata-only:jfrog/agent-belt", "metadata-only:phoenix.arize.com", "metadata-only:lunary.ai", "metadata-only:doi:10.1007/s10462-025-11454-w", "metadata-only:openalex:W7118132038", "metadata-only:google/adk-python", "metadata-only:doi-10.1039/d5sc09229a", "metadata-only:openalex-W7131071926"],
    failClosedReasons,
    warnings: [
      "Metronous-style repository metadata is a discovery signal only; AMC requires local telemetry, benchmark, calibration, migration, and badge-methodology receipts before public comparability claims.",
      "Sutro-style repository metadata is a discovery signal only; AMC requires function/schema, data-source, priority, dry-run cost, observability, export, retention, multi-model, embedding, and badge-methodology receipts before public comparability claims.",
      "Agent Belt-style repository metadata is a discovery signal only; AMC requires source snapshot, license, release, scenario schema, agent-adapter, workspace-diff, rule-check, judge-config, pass@k/pass^k, isolation, export, CI, package-digest, and badge-methodology receipts before public comparability claims.",
      "Arize Phoenix/AX public docs are relevant source-review signals for observability/evaluation boundaries, but metadata, labels, screenshots, copied website prose, examples, or aggregate eval scores fail closed without AMC-owned eval packs, trace/span exports, evaluator configs, dataset/experiment manifests, thresholds, signed evidence, and row hashes.",
      "Lunary public product metadata is a relevant source-review signal for observability/evaluation boundaries, but metadata, labels, screenshots, copied website prose, examples, response scores, or dashboard exports fail closed without AMC-owned eval packs, validation tables, trace/session exports, evaluator configs, metric owners, sample sizes, confidence intervals, thresholds, signed evidence, and row hashes.",
      "The DOI/OpenAlex-verified fact-checking and factuality-evaluation review is a methodology-versioning source-review signal only; DOI metadata, OpenAlex metadata, abstracts, title/venue/year facts, copied paper prose, taxonomy labels, cited benchmark names, or review conclusions fail closed without AMC-owned control mapping, threshold policies, signed evidence, row hashes, migration guidance, and no-copy proof.",
      "Google ADK GitHub metadata is a relevant source-review signal for agent-toolkit evaluation boundaries, but repository labels, branch/license/star metadata, README/docs summaries, module paths, tool/session labels, local framework runs, aggregate scores, copied upstream code/prose/config, or source metadata fail closed without AMC-owned eval packs, validation tables, evaluator-suite proof, trace-evaluation proof where claimed, metric owners, sample sizes, confidence intervals, thresholds, signed evidence, no-copy proof, and row hashes.",
      "Digital materials ecosystem DOI/OpenAlex metadata is a relevant source-review signal for metric-validity boundaries, but title, citation, abstract, paper metadata, database labels, or autonomous-discovery claims fail closed without AMC-owned eval packs, validation tables, existing metric-validity primitive mapping, metric owners, sample sizes, confidence intervals, thresholds, signed evidence, and row hashes.",
    ],
  };
  return {
    ...receiptWithoutHash,
    receiptHash: sha256Hex(canonicalize(receiptWithoutHash)),
  };
}
