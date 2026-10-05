import type { LiveDriftSampleRow } from "./liveDriftTypes.js";

/** Exact eager raw field projections; callers retain normalization, admission and domain policy. */
export function agentSecurityEvidenceFields(row: LiveDriftSampleRow): Array<string | undefined> {
  return [
    row.agentSecurityGuardId,
    row.agentSecurityPolicyHash,
    row.agentSecurityTaintTraceHash,
    row.agentSecurityProxyTraceHash,
    row.agentSecurityAuditTrailHash,
    row.agentSecurityRuntimeTelemetryHash,
    row.agentSecurityEvalPackHash,
    row.agentSecurityClassifierHash,
  ];
}

export function agentTestingEvidenceFields(row: LiveDriftSampleRow): Array<string | undefined> {
  return [
    row.agentTestingTaxonomyId,
    row.agentTestingMethodologyHash,
    row.agentTestingScenarioCatalogHash,
    row.agentTestingFaultInjectionPlanHash,
    row.agentTestingObservabilityPlanHash,
    row.agentTestingSafetyPlanHash,
    row.agentTestingStandardsMapHash,
  ];
}

export function adkRuntimeEvidenceFields(row: LiveDriftSampleRow): Array<string | undefined> {
  return [
    row.adkRuntimeId,
    row.adkFrameworkVersion,
    row.adkAgentGraphHash,
    row.adkToolRegistryHash,
    row.adkEvalDatasetHash,
    row.adkEvalCaseHash,
    row.adkRunnerConfigHash,
    row.adkSessionStateHash,
  ];
}

export function ragDatasetBuilderBaseFields(row: LiveDriftSampleRow): Array<string | undefined> {
  return [
    row.ragDatasetBuilderId,
    row.ragDatasetVersion,
    row.ragSourceDocumentManifestHash,
    row.ragSourceDocumentLicenseId,
    row.ragQaPairManifestHash,
    row.ragPassageManifestHash,
    row.ragBuilderConfigHash,
  ];
}

export function agenticSearchTraceFields(row: LiveDriftSampleRow): Array<string | undefined> {
  return [
    row.agenticSearchSourceManifestHash,
    row.agenticSearchToolConfigHash,
    row.agenticSearchPlannerTraceHash,
    row.agenticSearchSearchTraceHash,
    row.agenticSearchCitationTraceHash,
    row.agenticSearchSynthesisTraceHash,
    row.agenticSearchResultManifestHash,
  ];
}

export function localSystemEvidenceFields(row: LiveDriftSampleRow): Array<string | undefined> {
  return [
    row.localSystemMonitorProfileId,
    row.localSystemDeviceProfileHash,
    row.localSystemHardwareScannerHash,
    row.localSystemProcessCatalogHash,
    row.localSystemSensorLogHash,
    row.localSystemAlertReceiptHash,
  ];
}

export function privacyWebIdentityFields(row: LiveDriftSampleRow): Array<string | undefined> {
  return [
    row.privacyWebBenchmarkId,
    row.privacyWebDatasetHash,
    row.privacyWebTaskConfigHash,
  ];
}

export function privacyWebArtifactFields(row: LiveDriftSampleRow): Array<string | undefined> {
  return [
    row.privacyWebInstructionConfigHash,
    row.privacyWebCookieStateHash,
    row.privacyWebEnvironmentResetHash,
    row.privacyWebDataMinimizationPolicyHash,
    row.privacyWebAllowedInfoManifestHash,
    row.privacyWebSensitiveInfoManifestHash,
    row.privacyWebTrajectoryHash,
    row.privacyWebResultArtifactHash,
    row.privacyWebLeakageJudgeHash,
  ];
}

export function ollamaMetricsConfigFields(row: LiveDriftSampleRow): Array<string | undefined> {
  return [
    row.ollamaMetricsSidecarId,
    row.ollamaMetricsSourceRefHash,
    row.ollamaMetricsRepositorySnapshotHash,
    row.ollamaMetricsLicenseRefHash,
    row.ollamaMetricsProxyConfigHash,
    row.ollamaMetricsOllamaHostConfigHash,
    row.ollamaMetricsPrometheusScrapeConfigHash,
  ];
}

export function ollamaMetricsResultFields(row: LiveDriftSampleRow): Array<string | undefined> {
  return [
    row.ollamaMetricsEndpointSnapshotHash,
    row.ollamaMetricsBaselineSnapshotHash,
    row.ollamaMetricsLiveSnapshotHash,
    row.ollamaMetricsAlertPolicyHash,
    row.ollamaMetricsModelId,
  ];
}

export function researchGymSetupFields(row: LiveDriftSampleRow): Array<string | undefined> {
  return [
    row.researchGymBenchmarkId,
    row.researchGymPaperRefHash,
    row.researchGymTaskId,
    row.researchGymTaskManifestHash,
    row.researchGymPrunedRepoHash,
    row.researchGymDatasetManifestHash,
    row.researchGymEvaluationHarnessHash,
    row.researchGymBaselineScoreManifestHash,
    row.researchGymGradingScriptHash,
    row.researchGymWithheldSolutionPolicyHash,
    row.researchGymRunConfigHash,
  ];
}

export function researchGymArtifactFields(row: LiveDriftSampleRow): Array<string | undefined> {
  return [
    row.researchGymAgentAdapterHash,
    row.researchGymWorkspaceSnapshotHash,
    row.researchGymTranscriptHash,
    row.researchGymCostSummaryHash,
    row.researchGymStatusHash,
    row.researchGymPlanHash,
    row.researchGymInspectionReportHash,
    row.researchGymViolationReportHash,
  ];
}

export function osUniverseSetupFields(row: LiveDriftSampleRow): Array<string | undefined> {
  return [
    row.osUniverseBenchmarkId,
    row.osUniverseSourceRefHash,
    row.osUniverseRepositorySnapshotHash,
    row.osUniverseLicenseRefHash,
    row.osUniversePaperRefHash,
    row.osUniverseTestcaseId,
    row.osUniverseTestcaseManifestHash,
    row.osUniverseAgentConfigHash,
    row.osUniverseRunnerConfigHash,
  ];
}

export function osUniverseArtifactFields(row: LiveDriftSampleRow): Array<string | undefined> {
  return [
    row.osUniverseDependencyLockHash,
    row.osUniverseValidatorConfigHash,
    row.osUniverseValidationReportHash,
    row.osUniverseResultArtifactHash,
    row.osUniverseViewerArtifactHash,
    row.osUniverseTrajectoryHash,
    row.osUniverseScreenshotTraceHash,
  ];
}
