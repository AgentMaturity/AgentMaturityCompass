/**
 * Public package API for `agent-maturity-compass`.
 *
 * Library callers use this barrel; AMC's CLI, routers and Studio import their
 * modules directly. Exported embedding toolkits do not establish that a feature
 * runs in a deployment. tests/publicApiSurface guards this external contract,
 * which internal builds alone cannot exercise. See docs/API_SURFACES.md.
 *
 * @packageDocumentation
 */

export { quickstartWizard, initWorkspace, runDoctor, saveAMCConfigAsync, signAmcConfigAsync, type InitWorkspaceOptions } from "./workspace.js";
export { runDoctorCli } from "./doctor/doctorCli.js";
export {
  buildSupplyChainGuardDecisionReceiptInput,
  buildSupplyChainPostureReport,
  computeSupplyChainVersionHash,
  verifySupplyChainPostureReportIntegrity,
  type BuildSupplyChainPostureReportInput,
  type SupplyChainAllowedSourcePolicy,
  type SupplyChainComponentInput,
  type SupplyChainComponentKind,
  type SupplyChainComponentPosture,
  type SupplyChainPostureIntegrityResult,
  type SupplyChainPostureReport,
  type SupplyChainPostureSummary,
  type SupplyChainVulnerabilityState,
} from "./security/index.js";

export { openLedger, verifyLedgerIntegrity } from "./ledger/ledger.js";
export { inventorySessionSpills, inventorySessionSpillReferences, eraseSessionSpills, exportSessionSpills, restoreSessionSpills } from "./session/spill/spillLifecycle.js";
export { inspectSpilledEvent, retrieveSpilledContent, verifySpilledContent } from "./session/spill/spillEvidence.js";
export { readSessionSpillRange, MAX_SPILL_READ_BYTES } from "./session/spill/spillRead.js";
export type { SessionSpillRange } from "./session/spill/spillRead.js";
export { loadSessionEventHistory, SessionHistoryRefused, type SessionHistoryRefusal, type SessionEventHistory, type SessionEventHistoryOptions } from "./session/sessionEventHistory.js";
export { wrapRuntime, wrapAny, superviseProcess, startMonitor } from "./ledger/monitor.js";

export {
  initGatewayConfig, initGatewayConfigAsync, bindGatewayAgentAsync,
  loadGatewayConfig,
  resolveGatewayConfigEnv,
  signGatewayConfig, signGatewayConfigAsync,
  verifyGatewayConfigSignature,
  routeBaseUrls
} from "./gateway/config.js";
export { startGateway, gatewayStatus } from "./gateway/server.js";

export {
  initFleet, initFleetAsync, signFleetConfigAsync, signAgentConfigAsync,
  loadFleetConfig,
  verifyFleetConfigSignature,
  addAgentInteractive,
  listAgents,
  removeAgent,
  useAgent,
  loadAgentConfig,
  verifyAgentConfigSignature,
  scaffoldAgent, scaffoldAgentAsync,
  updateAgentProvider
} from "./fleet/registry.js";
export { getAgentPaths, resolveAgentId, setCurrentAgent, getCurrentAgent } from "./fleet/paths.js";
export { generateFleetReport } from "./fleet/report.js";
export {
  normalizeFleetEnvironment,
  parseFleetSloObjective,
  defineFleetSlo,
  listFleetSlos,
  listFleetGovernancePolicies,
  tagFleetAgentEnvironment,
  applyFleetGovernancePolicy,
  buildFleetHealthDashboard,
  fleetSloStatus,
  generateFleetComplianceReport
} from "./fleet/governance.js";
export {
  initTrustComposition,
  loadTrustCompositionConfig,
  saveTrustCompositionConfig,
  addDelegationEdge,
  removeDelegationEdge,
  listDelegationEdges,
  detectCycles,
  computeTrustComposition, generateTrustCompositionReportAsync,
  saveTrustCompositionReport,
  renderTrustCompositionMarkdown,
  verifyCrossAgentReceipts
} from "./fleet/trustComposition.js";
// Orchestration DAG
export {
  createDag, createDagAsync,
  appendDagNode, appendDagNodeAsync,
  loadDag,
  listDags,
  queryDagsByAgent,
  visualizeDag,
  renderDagMarkdown,
} from "./fleet/orchestrationDag.js";
export type {
  OrchestrationEventType,
  DagNode,
  OrchestrationDag,
  DagVisualization,
} from "./fleet/orchestrationDag.js";

// Trust Inheritance Policy
export {
  loadTrustInheritancePolicy,
  saveTrustInheritancePolicy,
  setTrustInheritanceMode,
  computeInheritedTrust,
  renderTrustInheritanceMarkdown,
  computeTrustInheritanceGraph,
  renderTrustInheritanceGraphMarkdown,
} from "./fleet/trustInheritance.js";
export type {
  TrustInheritancePolicyMode,
  TrustInheritancePolicy,
  AgentTrustInput,
  InheritedTrustResult,
  TrustInheritanceGraphNode,
  TrustInheritanceGraphEdge,
  TrustInheritanceGraphBound,
  TrustInheritanceGraphNodeResult,
  TrustInheritanceGraphResult,
} from "./fleet/trustInheritance.js";

// Handoff Packets
export { acceptHandoffPacketAsync, createHandoffPacketAsync } from "./fleet/handoffPacketSigning.js";
export {
  acceptHandoffPacket,
  createHandoffPacket,
  loadHandoffReceiverReceipt,
  loadHandoffUnresolvedDependencyLog,
  loadHandoffPacket,
  listHandoffPackets,
  verifyHandoffContract,
  verifyHandoffPacket,
  renderHandoffPacketMarkdown,
} from "./fleet/handoffPacket.js";
export type {
  HandoffContractVerificationResult,
  HandoffDependencyStatus,
  HandoffOwnershipTransfer,
  HandoffPacket,
  HandoffReceiverReceipt,
  HandoffRefusalReason,
  HandoffSenderReceipt,
  HandoffUnresolvedDependencyLog,
  HandoffVerificationResult,
} from "./fleet/handoffPacket.js";

// Cross-Agent Contradiction Detection
export {
  detectContradictions,
  renderContradictionReportMarkdown,
} from "./fleet/contradictionDetector.js";
export type {
  ContradictionSeverity,
  AgentContradiction,
  ContradictionReport,
} from "./fleet/contradictionDetector.js";

export type {
  TrustInheritanceMode,
  DelegationEdge,
  TrustCompositionConfig,
  AgentTrustSnapshot,
  CompositeTrustResult,
  DependencyTrustDetail,
  CrossAgentContradiction,
  TrustCompositionReport,
  CrossAgentReceiptChain
} from "./fleet/trustComposition.js";
export { listProviderTemplates, getProviderTemplateById } from "./providers/providerTemplates.js";
export { runSandboxCommand, buildSandboxDockerArgs } from "./sandbox/sandbox.js";
export { ingestEvidence, attestIngestSession, attestIngestSessionAsync } from "./ingest/ingest.js";
export {
  importEvalResults,
  evalImportCoverageStatus,
  parseEvalImport,
  parseOpenAIEvalResults,
  parseLangSmithEvalResults,
  parseDeepEvalResults,
  parsePromptfooEvalResults,
  parseWandbEvalResults,
  parseLangfuseEvalResults,
  type EvalImportFormat,
  type EvalImportCase,
  type ParsedEvalImport,
  type EvalImportResult,
  type EvalFrameworkStatus,
  type EvalDimensionCoverage,
  type EvalCoverageStatus
} from "./eval/evalImporters.js";
export { evalImportCli, evalStatusCli, parseEvalImportFormat } from "./eval/evalCli.js";
export {
  buildEvalReplayCorpusEvidenceReceipt,
  type EvalReplayCorpusEvidenceReceipt,
  type EvalReplayCorpusEvidenceStatus
} from "./eval/replayCorpusEvidenceReceipt.js";
export {
  buildJudgeCalibrationReceipt,
  buildJudgeCalibrationWatchAlerts,
  verifyJudgeCalibrationReceipt,
  defaultJudgeCalibrationThresholds,
  type BuildJudgeCalibrationReceiptInput,
  type JudgeCalibrationReceipt,
  type JudgeCalibrationWatchAlert,
  type JudgeCalibrationReceiptVerification
} from "./eval/judgeCalibration.js";
export {
  runEffectAutoAgentReplayCorpus,
  verifyEffectAutoAgentReplayReceipt,
  type EffectAutoAgentReplayCiReceipt,
  type EffectAutoAgentReplayGateMode,
  type EffectAutoAgentReplayManifest,
  type EffectAutoAgentReplayProviderRoute,
  type EffectAutoAgentReplayReceiptVerification,
  type EffectAutoAgentReplayResult,
  type EffectAutoAgentReplayRow,
  type EffectAutoAgentReplayRowInput,
  type EffectAutoAgentReplayRuntime,
  type EffectAutoAgentReplaySeverity,
  type EffectAutoAgentReplayStatus,
  type EffectAutoAgentReplayTaskFamily,
  type EffectAutoAgentReplayWatchAlert,
  type RunEffectAutoAgentReplayCorpusInput,
} from "./eval/effectAutoAgentReplayCorpus.js";
export {
  exportEvidenceBundle,
  verifyEvidenceBundle,
  inspectEvidenceBundle,
  diffEvidenceBundles,
  loadBundleRunAndTrustMap
} from "./bundles/bundle.js";
export {
  collectVerifierEvidence,
  renderVerifierEvidence,
  renderVerifierEvidenceCsv,
  renderVerifierEvidenceJson,
  renderVerifierEvidencePdf,
  defaultEvidenceExportPath,
  exportVerifierEvidence,
  canonicalEvidenceDatasetHash,
  hashFile,
  generateAuditPacket,
  createZipArchive
} from "./evidence/index.js";
export {
  buildReviewerIndependenceReceipt,
  verifyReviewerIndependenceReceipt,
  renderReviewerIndependenceAuditExport,
  type ReviewerConflictCheck,
  type ReviewerIndependenceApproval,
  type ReviewerIndependenceDecision,
  type ReviewerIndependenceEvidenceLink,
  type ReviewerIndependenceReceipt,
  type ReviewerIndependenceRiskTier,
  type ReviewerIndependenceRow,
  type ReviewerIndependenceSourceCitation,
  type ReviewerIndependenceVerification,
  type ReviewerSecondReview
} from "./audit/reviewerIndependence.js";
export {
  buildPosthocAuditSamplingReceipt,
  verifyPosthocAuditSamplingReceipt,
  renderPosthocAuditSamplingAuditExport,
  type PosthocAuditCorrectiveAction,
  type PosthocAuditCorrectiveActionStatus,
  type PosthocAuditFinding,
  type PosthocAuditFindingSeverity,
  type PosthocAuditReviewedAction,
  type PosthocAuditReviewDecision,
  type PosthocAuditSamplePlan,
  type PosthocAuditSamplingEvidenceLink,
  type PosthocAuditSamplingMethod,
  type PosthocAuditSamplingReceipt,
  type PosthocAuditSamplingRiskTier,
  type PosthocAuditSamplingRow,
  type PosthocAuditSamplingSourceCitation,
  type PosthocAuditSamplingVerification,
  type PosthocAuditScoreImpact
} from "./audit/posthocAuditSampling.js";
export {
  artifactProvenanceManifestSchema,
  artifactProvenanceSignatureSchema,
  signArtifactProvenance, signArtifactProvenanceAsync,
  signArtifactOutput, signArtifactOutputAsync,
  verifyArtifactProvenance,
  detectArtifactTampering
} from "./artifact/artifactProvenance.js";
export {
  defaultGatePolicy,
  parseGatePolicy,
  writeSignedGatePolicy,
  verifyGatePolicySignature,
  evaluateGatePolicy,
  initCiForAgent,
  printCiSteps,
  runBundleGate,
  buildReleaseGateReceipt,
  verifyReleaseGateReceipt,
  renderReleaseGateAuditExport
} from "./ci/gate.js";
export type {
  ReleaseGateControlEvidence,
  ReleaseGateControlKind,
  ReleaseGateControlStatus,
  ReleaseGateOverrideStatus,
  ReleaseGateSourceCitation,
  ReleaseGateEvidenceLink,
  ReleaseGateOverrideRecord,
  ReleaseGateRunRecord,
  ReleaseGateReceiptRow,
  ReleaseGateReceipt,
  ReleaseGateReceiptVerification
} from "./ci/gate.js";
export {
  listArchetypes,
  describeArchetype,
  previewArchetypeApply,
  applyArchetype
} from "./archetypes/index.js";
export { exportPolicyPack, exportBadge, generateBadgeSvg } from "./exports/policyExport.js";
export {
  runAssurance,
  listAssuranceHistory,
  loadAssuranceReport,
  verifyAssuranceRun,
  generateAssurancePatchKit,
  applyAssurancePatchKit,
  latestAssuranceByPack,
  latestAssuranceReports
} from "./assurance/assuranceRunner.js";
export { listAssurancePacks, getAssurancePack } from "./assurance/packs/index.js";
export {
  issueCertificate,
  verifyCertificate,
  inspectCertificate,
  revokeCertificate, revokeCertificateAsync,
  verifyRevocation
} from "./assurance/certificate.js";
export {
  generateTrustCertificate, generateTrustCertificateAsync,
  verifyTrustCertificateEnvelope
} from "./cert/trustCertificate.js";
export type {
  TrustCertificateEvidenceHashChain,
  TrustCertificatePayload,
  TrustCertificateEnvelope,
  GenerateTrustCertificateInput,
  GeneratedTrustCertificate,
  TrustCertificateVerificationResult
} from "./cert/trustCertificate.js";
export {
  computeFailureRiskIndices,
  renderFailureRiskMarkdown,
  runIndicesForAgent,
  runFleetIndices
} from "./assurance/indices.js";
export {
  startTrustDriftMonitor
} from "./monitor/trustDriftMonitor.js";
export type {
  TrustDriftSeverity,
  TrustDriftPoint,
  TrustDriftAlert,
  TrustDriftMonitorState,
  StartTrustDriftMonitorInput,
  TrustDriftMonitorResult
} from "./monitor/trustDriftMonitor.js";

export {
  loadContextGraph,
  validateContextGraph,
  alignmentCheck,
  driftDetection,
  summarizeContextGraphForPrompt
} from "./context/contextGraph.js";

export {
  setTargetProfileInteractive,
  loadTargetProfile,
  verifyTargetProfileSignature,
  diffRunToTarget
} from "./targets/targetProfile.js";

export { runDiagnostic, generateReport, compareRuns } from "./diagnostic/runner.js";
export {
  CLAIM_READY_INTEGRITY,
  INSUFFICIENT_INTEGRITY_BELOW,
  evaluateDiagnosticEvidenceReadiness
} from "./diagnostic/evidenceReadiness.js";
export type { DiagnosticEvidenceReadinessInput } from "./diagnostic/evidenceReadiness.js";
export type {
  DiagnosticEvidenceReadiness,
  EvidenceReadinessReasonCode,
  EvidenceReadinessStatus
} from "./types.js";
export { runAutoAnswer } from "./diagnostic/autoAnswer/autoAnswerEngine.js";
export {
  diagnoseEvalReplayCorpusBoundary,
  type DiagnosticEvalReplayCorpusBoundary,
  type DiagnosticEvalReplaySurfaceStatus
} from "./diagnostic/evalReplayCorpusBoundary.js";

export { generateTuningPack, generateUpgradePlan } from "./tuning/upgradeEngine.js";
export { runTuneWizard, runUpgradeWizard } from "./tuning/tuneWizard.js";

export { guardCheck } from "./guardrails/guardEngine.js";
export { buildDashboard } from "./dashboard/build.js";
export { serveDashboard } from "./dashboard/serve.js";
export { learnQuestion, assignOwnership, createCommitmentPlan } from "./eoc/flows.js";

export { questionBank, questionIds } from "./diagnostic/questionBank.js";
export {
  exportAsRewardFunction,
  exportAsDSPyTargets,
  exportAsFineTuneRecipe,
  type RewardSignal,
  type RewardFunctionExport,
  type DSPyMetric,
  type DSPyTargetExport,
  type FocusArea,
  type FineTuneRecipe
} from "./mechanic/tuneExport.js";

export {
  wrapFetch,
  logTrace,
  buildTrace,
  stableTraceString,
  validateTruthProtocol,
  truthProtocolTemplate,
  extractApprovalToken,
  hasValidApprovalToken,
  withApprovalTrace,
  buildDegradedModeBehaviorReceipt,
  verifyDegradedModeBehaviorReceipt,
  renderDegradedModeBehaviorMarkdown,
  type BuildDegradedModeBehaviorReceiptInput,
  type DegradedModeAllowedBehavior,
  type DegradedModeBehaviorReceipt,
  type DegradedModeBehaviorSourceCitation,
  type DegradedModeBehaviorStatus,
  type DegradedModeBehaviorTestRun,
  type DegradedModeBehaviorVerification,
  type DegradedModeFailureMode,
  type DegradedModeOperatorMessage
} from "./runtime/index.js";

export { parseTraceLine, parseTraceLines } from "./correlation/traceSchema.js";
export { correlateTracesAgainstEvidence } from "./correlation/correlate.js";
export { getMode, setMode, assertOwnerMode } from "./mode/mode.js";
export { createUnifiedClaritySnapshot } from "./snapshot/snapshot.js";
export { initLoop, loopPlan, loopRun, loopSchedule } from "./loop/loop.js";
export { buildConnectInstructions } from "./studio/connectWizard.js";
export {
  projectOnboardingActivation,
  renderOnboardingActivationText
} from "./setup/onboardingActivation.js";
export type {
  OnboardingActivationEvidenceRef,
  OnboardingActivationMilestone,
  OnboardingActivationMilestoneId,
  OnboardingActivationMilestoneStatus,
  OnboardingActivationProjection,
  OnboardingActivationReasonCode,
  OnboardingActivationStatus
} from "./setup/onboardingActivation.js";
export {
  adaptersInitCli, adaptersInitCliAsync,
  adaptersVerifyCli,
  adaptersListCli,
  adaptersDetectCli,
  adaptersConfigureCli, adaptersConfigureCliAsync,
  adaptersCapabilitiesCli, adaptersCapabilitiesCliAsync,
  adaptersRunCli,
  adaptersEnvCli,
  adaptersInitProjectCli
} from "./adapters/adapterCli.js";
export { runAdapterCommand, initAdapterProjectSample } from "./adapters/adapterRunner.js";
export { listBuiltInAdapters, getBuiltInAdapter } from "./adapters/registry.js";
export {
  adapterCapabilityActivationSchema,
  adapterCapabilityControlIdSchema,
  adapterCapabilityDeclarationSchema,
  adapterCapabilityEventIdSchema,
  adapterVersionSourceSchema
} from "./adapters/adapterTypes.js";
export type {
  AdapterCapabilityActivation,
  AdapterCapabilityControlId,
  AdapterCapabilityDeclaration,
  AdapterCapabilityEventId,
  AdapterVersionSource
} from "./adapters/adapterTypes.js";
export { loadAdaptersConfig, verifyAdaptersConfigSignature } from "./adapters/adapterConfigStore.js";
export {
  CLAUDE_CODE_HOOK_SOURCE,
  GEMINI_CLI_HOOK_SOURCE,
  HOOK_INTEGRATION_ID,
  HookIntegrationError,
  getHookIntegrationStatus,
  installHookIntegration,
  mapProviderHookEvent,
  removeHookIntegration,
  type HookFileChange,
  type HookIntegrationStatus,
  type HookMutationResult,
  type HookProvider
} from "./adapters/hookIntegration.js";
export { forwardProviderHookEvent } from "./adapters/hookForwarder.js";
export {
  defaultBridgeConfig,
  bridgeConfigSchema,
  bridgeProviderSchema,
  type BridgeConfig,
  type BridgeProvider
} from "./bridge/bridgeConfigSchema.js";
export {
  bridgeConfigPath,
  bridgeConfigSigPath,
  initBridgeConfig,
  loadBridgeConfig,
  saveBridgeConfig,
  signBridgeConfig,
  verifyBridgeConfigSignature
} from "./bridge/bridgeConfigStore.js";
export { matchBridgeRoute, providerDisplayName, type BridgeRouteMatch } from "./bridge/bridgeModelRouter.js";
export { resolveBridgeRoute, buildModelIntent, type ModelIntent } from "./bridge/bridgeRoutes.js";
export { handleBridgeRequest, startBridgeServer } from "./bridge/bridgeServer.js";
export { createBridgePairingCode, redeemBridgePairingCode, verifyBridgeLease } from "./bridge/bridgeAuth.js";
export {
  modelTaxonomySchema,
  defaultModelTaxonomy,
  modelTaxonomyPath,
  modelTaxonomySigPath,
  loadModelTaxonomy,
  saveModelTaxonomy,
  signModelTaxonomy,
  verifyModelTaxonomySignature,
  initModelTaxonomy,
  taxonomyAllowsModel,
  type ModelTaxonomy
} from "./bridge/modelTaxonomy.js";
export { inspectSignatures, fixSignatures, fixSignaturesAsync } from "./studio/signatures.js";
export { startStudioApiServer } from "./studio/studioServer.js";
export { runStudioForeground, startStudioDaemon, stopStudioDaemon, studioStatus } from "./studio/studioSupervisor.js";
export { createVault, unlockVault, lockVault, vaultStatus, ensureVaultAndPublicKeys } from "./vault/vault.js"; export { rotateMonitorKeyInVault } from "./keys/purposeKeys.js"; // P1-08: index.ts line budget
export { scanForPII } from "./vault/dlp.js";
export type { ScanResult } from "./vault/dlp.js";
export { generateHoneytoken, isHoneytoken } from "./vault/honeytokens.js";
export type { HoneytokenResult } from "./vault/honeytokens.js";
export { getAmcPolicy, listAmcPolicies, AMC_POLICIES } from "./governor/amcPolicies.js";
export type { AmcPolicy } from "./governor/amcPolicies.js";
export {
  notaryInitCli,
  notaryInitInteractiveCli,
  notaryStartCli,
  notaryStatusCli,
  notaryPubkeyCli,
  notaryAttestCli,
  notaryVerifyAttestCli,
  notarySignCli,
  notaryLogVerifyCli, notaryStatusCliAsync, notaryPubkeyCliAsync, notaryAttestCliAsync, notarySignCliAsync
} from "./notary/notaryCli.js";
export { startNotaryServer } from "./notary/notaryServer.js";
export { loadNotaryConfig, initNotaryConfig, saveNotaryConfig, defaultNotaryConfig } from "./notary/notaryConfigStore.js";
export { checkNotaryTrust, initTrustConfig, verifyTrustConfigSignature, enableNotaryTrust, loadTrustConfig } from "./trust/trustConfig.js";
export { issueLeaseToken } from "./leases/leaseSigner.js";
export { verifyLeaseToken } from "./leases/leaseVerifier.js";
export { loadLeaseRevocations, revokeLease, verifyLeaseRevocationsSignature } from "./leases/leaseStore.js";
export { initBudgets, initBudgetsAsync, verifyBudgetsConfigSignature, evaluateBudgetStatus, resetBudgetDay } from "./budgets/budgets.js";
export { driftCheckCli, driftReportCli, freezeStatusCli, freezeLiftCli, driftCheckCliAsync, driftReportCliAsync, freezeLiftCliAsync } from "./drift/driftCli.js";
export { initAlertsConfig, verifyAlertsConfigSignature, sendTestAlert } from "./drift/alerts.js";
export { generateBom } from "./bom/bomGenerator.js";
export { signBomFile, signBomFileAsync, verifyBomSignature } from "./bom/bomVerifier.js";
export {
  createApprovalForIntent,
  decideApprovalForIntent,
  verifyApprovalForExecution,
  approvalStatusPayload
} from "./approvals/approvalEngine.js";
export { reconcile, requestManualResolution, resolveManually, type ReconcileAdapter, type ReconcileResult, type SystemOfRecordObservation } from "./actions/reconcile.js";
export { mintIdempotencyKey } from "./actions/idempotency.js";
export {
  getApprovalInboxItem,
  listApprovalInbox,
  parseApprovalInboxStatus,
  projectApprovalInboxSummary,
  summarizeApprovalInbox
} from "./approvals/approvalInbox.js";
export type {
  ApprovalInboxItem,
  ApprovalInboxSummary
} from "./approvals/approvalInbox.js";
export {
  approvalDeliveryEnvelopeSchema,
  approvalDeliveryTriggerSchema,
  buildApprovalDeliveryEnvelope,
  deliverApprovalLifecycle
} from "./approvals/approvalDelivery.js";
export {
  createApprovalRequest,
  listApprovals,
  loadApproval,
  consumeApproval,
  verifyApprovalSignature
} from "./approvals/approvalStore.js";
export { simulateTargetWhatIf } from "./simulator/targetWhatIf.js";
export { predictBudgetPressure } from "./simulator/budgetsWhatIf.js";
export { predictGovernorPermissions } from "./simulator/governorWhatIf.js";
export { predictCiGateOutcome } from "./simulator/ciGateWhatIf.js";
export { exportBenchmarkArtifact, exportBenchmarkArtifactAsync } from "./benchmarks/benchExport.js";
export { verifyBenchmarkArtifact } from "./benchmarks/benchVerify.js";
export { ingestBenchmarks } from "./benchmarks/benchImport.js";
export { listImportedBenchmarks } from "./benchmarks/benchStore.js";
export { benchmarkStats } from "./benchmarks/benchStats.js";
export {
  benchInitCli, benchInitCliAsync,
  benchVerifyPolicyCli,
  benchPrintPolicyCli,
  benchCreateCli, benchCreateCliAsync,
  benchVerifyCli,
  benchPrintCli,
  benchRegistryInitCli,
  benchRegistryPublishCli,
  benchRegistryVerifyCli,
  benchRegistryServeCli,
  benchSearchCli,
  benchImportCli,
  benchListImportsCli,
  benchListExportsCli,
  benchCompareCli, benchCompareCliAsync,
  benchComparisonLatestCli,
  benchRegistriesCli, benchRegistriesCliAsync,
  benchRegistriesApplyCli, benchRegistriesApplyCliAsync,
  benchPublishRequestCli,
  benchPublishExecuteCli, benchPublishExecuteCliAsync
} from "./bench/benchCli.js";
export { createBenchArtifact, createBenchArtifactAsync, inspectBenchArtifact, listExportedBenchArtifacts } from "./bench/benchArtifact.js";
export { verifyBenchArtifactFile } from "./bench/benchVerifier.js";
export { initBenchRegistry, verifyBenchRegistry, publishBenchToRegistry, serveBenchRegistry } from "./bench/benchRegistryServer.js";
export { browseBenchRegistry, importBenchFromRegistry, listImportedBenchArtifacts } from "./bench/benchRegistryClient.js";
export { createBenchComparison, createBenchComparisonAsync } from "./bench/benchComparer.js";
export {
  benchInitForApi, benchInitForApiAsync,
  benchPolicyForApi,
  benchPolicyApplyForApi, benchPolicyApplyForApiAsync,
  benchCreateForApi, benchCreateForApiAsync,
  benchExportsForApi,
  benchImportsForApi,
  benchRegistriesForApi, benchRegistriesForApiAsync,
  benchRegistryApplyForApi, benchRegistryApplyForApiAsync,
  benchRegistryBrowseForApi,
  benchImportForApi,
  benchCompareForApi, benchCompareForApiAsync,
  benchComparisonLatestForApi,
  benchPublishRequestForApi,
  benchPublishExecuteForApi, benchPublishExecuteForApiAsync
} from "./bench/benchApi.js";
export { serveConsolePath } from "./console/consoleServer.js";
export * from "./sdk/index.js";
export {
  initOutcomeContract,
  initOutcomeContractAsync,
  loadOutcomeContract,
  signOutcomeContract,
  signOutcomeContractAsync,
  verifyOutcomeContractSignature,
  upsertOutcomeContract,
  upsertOutcomeContractAsync
} from "./outcomes/outcomeContractEngine.js";
export {
  runOutcomeReport, runOutcomeReportAsync,
  loadOutcomeReport,
  fleetOutcomeReport,
  diffOutcomeReports,
  renderOutcomeReportMarkdown
} from "./outcomes/outcomeReport.js";
export {
  ingestFeedbackOutcome,
  ingestOutcomeWebhook,
  verifyHmacSignature as verifyOutcomeIngestHmac
} from "./outcomes/outcomeApi.js";
export { latestOutcomeReport, outcomeTrend, topValueGaps } from "./outcomes/outcomeDashboard.js";
export {
  initCasebook, initCasebookAsync,
  addCaseToCasebook, addCaseToCasebookAsync,
  listCasebooks,
  verifyCasebook,
  loadCasebook
} from "./casebooks/casebookStore.js";
export { runCasebook } from "./casebooks/casebookRunner.js";
export {
  createExperiment,
  setExperimentBaseline,
  setExperimentCandidate,
  runExperiment,
  analyzeExperiment,
  gateExperiment,
  listExperiments
} from "./experiments/experimentRunner.js";
export { bootstrapDifferenceCI, effectSizeDifference, deterministicSeed } from "./experiments/stats.js";
export {
  initComplianceMaps, initComplianceMapsAsync, ComplianceMapsPublicationError,
  loadComplianceMaps,
  verifyComplianceMapsSignature,
  generateComplianceReport
} from "./compliance/complianceEngine.js";
export {
  buildControlCrosswalkReceipt,
  verifyControlCrosswalkReceipt,
  renderControlCrosswalkAuditExport
} from "./compliance/controlCrosswalk.js";
export {
  buildGovernanceExceptionLifecycleReceipt,
  verifyGovernanceExceptionLifecycleReceipt,
  renderGovernanceExceptionLifecycleAuditExport,
  type GovernanceExceptionApprovalDecision,
  type GovernanceExceptionCompensatingControl,
  type GovernanceExceptionLifecycleEvidenceLink,
  type GovernanceExceptionLifecycleReceipt,
  type GovernanceExceptionLifecycleRecord,
  type GovernanceExceptionLifecycleRow,
  type GovernanceExceptionLifecycleSourceCitation,
  type GovernanceExceptionLifecycleVerification,
  type GovernanceExceptionRenewalDecision,
  type GovernanceExceptionRenewalOutcome
} from "./compliance/exceptionLifecycle.js";
export {
  buildPolicyDriftImpactReceipt,
  verifyPolicyDriftImpactReceipt,
  renderPolicyDriftImpactAuditExport,
  type PolicyDriftAffectedAgent,
  type PolicyDriftAffectedControl,
  type PolicyDriftAffectedTest,
  type PolicyDriftControlChangeType,
  type PolicyDriftEnvironment,
  type PolicyDriftImpactChange,
  type PolicyDriftImpactEvidenceLink,
  type PolicyDriftImpactLevel,
  type PolicyDriftImpactReceipt,
  type PolicyDriftImpactRow,
  type PolicyDriftImpactSourceCitation,
  type PolicyDriftImpactVerification,
  type PolicyDriftPriorDecision,
  type PolicyDriftRecheckItem,
  type PolicyDriftRecheckStatus,
  type PolicyDriftRolloutReceipt
} from "./compliance/policyDrift.js";
export {
  buildThirdPartyProviderRiskReceipt,
  verifyThirdPartyProviderRiskReceipt,
  renderThirdPartyProviderRiskAuditExport,
  type ThirdPartyContractControlStatus,
  type ThirdPartyProviderAttestation,
  type ThirdPartyProviderContractualControl,
  type ThirdPartyProviderDataBoundary,
  type ThirdPartyProviderDataPosture,
  type ThirdPartyProviderExceptionState,
  type ThirdPartyProviderRiskEvidenceLink,
  type ThirdPartyProviderRiskException,
  type ThirdPartyProviderRiskReceipt,
  type ThirdPartyProviderRiskRecord,
  type ThirdPartyProviderRiskRow,
  type ThirdPartyProviderRiskSourceCitation,
  type ThirdPartyProviderRiskVerification,
  type ThirdPartyProviderType
} from "./compliance/providerRisk.js";
export {
  buildRouterFallbackSafetyReceipt,
  verifyRouterFallbackSafetyReceipt,
  renderRouterFallbackSafetyMarkdown,
  type BuildRouterFallbackSafetyReceiptInput,
  type RouterFallbackCostBudget,
  type RouterFallbackEvalThreshold,
  type RouterFallbackLatencySlo,
  type RouterFallbackProviderSnapshot,
  type RouterFallbackSafetyDecision,
  type RouterFallbackSafetyReceipt,
  type RouterFallbackSafetySourceCitation,
  type RouterFallbackSafetyVerification
} from "./observability/routerFallbackSafety.js";
export {
  buildPerAgentCostBudgetEvidenceReceipt,
  verifyPerAgentCostBudgetEvidenceReceipt,
  renderPerAgentCostBudgetEvidenceMarkdown,
  type BuildPerAgentCostBudgetEvidenceReceiptInput,
  type CostBudgetDefinition,
  type CostBudgetOwnerDecision,
  type CostBudgetOwnerDecisionRecord,
  type CostBudgetPeriod,
  type CostBudgetRowStatus,
  type CostBudgetSpendSnapshot,
  type CostBudgetToolPathSpendSnapshot,
  type PerAgentCostBudgetEvidenceReceipt,
  type PerAgentCostBudgetEvidenceVerification,
  type PerAgentCostBudgetReceiptStatus,
  type PerAgentCostBudgetSourceCitation,
  type PerAgentCostBudgetToolPathRow,
  type PerAgentCostBudgetRow
} from "./observability/costBudgetEvidence.js";
export {
  buildRiskCostLatencySloReceipt,
  buildRiskCostLatencySloWatchAlerts,
  type BuildRiskCostLatencySloReceiptInput,
  type RiskCostLatencyAlertRoute,
  type RiskCostLatencyAlertSeverity,
  type RiskCostLatencyFailureCluster,
  type RiskCostLatencyLiveTrends,
  type RiskCostLatencySloAlert,
  type RiskCostLatencySloBreachEvidence,
  type RiskCostLatencySloDefinition,
  type RiskCostLatencySloObjectives,
  type RiskCostLatencySloReceipt,
  type RiskCostLatencySloStatus,
  type RiskCostLatencySloTimeWindow,
  type RiskCostLatencyTraceIndex,
  type RiskCostLatencyTraceIndexEntry,
  type RiskCostLatencyTraceRow,
  type RiskCostLatencyTraceStatus
} from "./observability/riskCostLatencySlo.js";
export {
  initComplianceMapsCli, initComplianceMapsCliAsync,
  verifyComplianceMapsCli,
  complianceReportCli,
  complianceFleetReportCli,
  complianceDiffCli
} from "./compliance/complianceCli.js";
export { complianceFrameworkFamilies, getFrameworkFamily, frameworkChoices } from "./compliance/frameworks.js";
export {
  rebuildTransparencyMerkle,
  verifyTransparencyMerkle,
  currentTransparencyMerkleRoot,
  listTransparencyMerkleRoots,
  exportTransparencyProofBundle,
  verifyTransparencyProofBundle,
  generateTransparencyInclusionProof
} from "./transparency/merkleIndexStore.js";
export {
  federateInitCli,
  federateVerifyCli,
  federatePeerAddCli,
  federatePeerListCli,
  federateExportCli,
  federateImportCli,
  federateVerifyBundleCli
} from "./federation/federationCli.js";
export { exportFederationPackage, importFederationPackage, verifyFederationPackage } from "./federation/federationSync.js";
export {
  integrationsInitCli,
  integrationsInitCliAsync,
  integrationsVerifyCli,
  integrationsStatusCli,
  integrationsTestCli,
  integrationsDispatchCli,
  integrationsDispatchBatchCli,
  integrationsRequeueDeadLettersCli,
  integrationsExportJournalCli,
  integrationsExportDeliverySnapshotCli
} from "./integrations/integrationsCli.js";
export {
  dispatchIntegrationEvent,
  dispatchIntegrationEventsBatch,
  dispatchIntegrationTest
} from "./integrations/integrationDispatcher.js";
export { verifyOpsReceipt, verifyOpsReceiptForEvent } from "./integrations/opsReceipt.js";
export { noCodeAdapterAddCli, noCodeAdapterAddCliAsync } from "./integrations/noCodeGovernanceCli.js";
export {
  addNoCodeAdapter, addNoCodeAdapterAsync,
  initNoCodeGovernanceConfig, initNoCodeGovernanceConfigAsync,
  loadNoCodeGovernanceConfig,
  noCodeGovernanceConfigPath,
  noCodeGovernanceConfigSigPath,
  signNoCodeGovernanceConfig, signNoCodeGovernanceConfigAsync,
  verifyNoCodeGovernanceConfigSignature
} from "./integrations/noCodeGovernanceStore.js";
export {
  ingestNoCodeWebhookEvent,
  parseNoCodeExecutionEvent
} from "./integrations/noCodeWebhookAdapters.js";
export type {
  NoCodeWebhookIngestResult,
  NoCodeAgentAction,
  ParsedNoCodeExecutionEvent
} from "./integrations/noCodeWebhookAdapters.js";
export type { NoCodeAdapterType, WebhookPlatform, NoCodeAdapterRecord, NoCodeGovernanceConfig } from "./integrations/noCodeGovernanceSchema.js";
export { createScimAdapter, handleScimRequest, InMemoryScimUserStore } from "./integrations/scimAdapter.js";
export type {
  ScimAdapterOptions,
  ScimProvisionedUser,
  ScimRequest,
  ScimResponse,
  ScimUserStore
} from "./integrations/scimAdapter.js";
export {
  buildWebhookHeaders,
  computeBackoffDelayMs,
  defaultWebhookHttpClient,
  deliverTrackedWebhook,
  deliverWebhookWithRetry,
  signWebhookPayload,
  verifyWebhookSignature,
  WebhookDeliveryTracker
} from "./integrations/webhookDelivery.js";
export type {
  WebhookAttemptReceipt,
  WebhookDeliveryDependencies,
  WebhookDeliveryPolicy,
  WebhookDeliveryReceipt,
  WebhookDeliveryRequest,
  WebhookHttpClient,
  WebhookHttpResponse
} from "./integrations/webhookDelivery.js";
export {
  addIntegrationDeadLetter,
  exportIntegrationDeliveryJournal,
  integrationDeliveryJournalPath,
  listIntegrationDeadLetters,
  listIntegrationDeliveries,
  loadIntegrationDeliveryJournal,
  nextIntegrationChannelSequence,
  recordIntegrationDelivery,
  resolveIntegrationDeadLetter
} from "./integrations/integrationDeliveryStore.js";
export type {
  IntegrationDeadLetter,
  IntegrationDeliveryJournal,
  IntegrationDeliveryRecord
} from "./integrations/integrationDeliveryStore.js";
export {
  enqueueIntegrationDeliveries, enqueueIntegrationDeliveriesAsync,
  exportIntegrationDeliverySnapshot,
  getIntegrationDeliveryStatusByQueueId,
  getIntegrationDeliveryStatusByQueueIds,
  integrationQueueStats,
  listIntegrationDeadLetters as listQueueIntegrationDeadLetters,
  processIntegrationChannelQueue,
  requeueIntegrationDeadLetters
} from "./integrations/integrationDeliveryQueue.js";
export type {
  IntegrationChannelType,
  IntegrationDeliveryArtifacts,
  IntegrationQueueDeliveryStatus,
  IntegrationQueueItemInput,
  IntegrationQueueState,
  IntegrationQueueStats,
  ProcessIntegrationQueueResult,
  QueuedIntegrationDelivery
} from "./integrations/integrationDeliveryQueue.js";
export {
  buildPartnerInteroperabilityFixture,
  exportRuntimeLifecycleGraphForPartner,
  partnerInteroperabilityFixturePath,
  renderPartnerInteroperabilityFixtureAuditExport,
  verifyPartnerInteroperabilityFixture,
  writePartnerInteroperabilityFixture
} from "./integrations/partnerInteroperability.js";
export type {
  PartnerFieldReviewDecision,
  PartnerInteroperabilityFixture,
  PartnerInteroperabilityOwner,
  PartnerInteroperabilityRoundTrip,
  PartnerInteroperabilitySourceCitation,
  PartnerInteroperabilityVerification,
  PartnerInteroperabilityWriteResult,
  PartnerLifecycleGraphEdgeExport,
  PartnerLifecycleGraphExport,
  PartnerLifecycleGraphNodeExport,
  PartnerUnsupportedField
} from "./integrations/partnerInteroperability.js";
export { defaultSsoConfig, mapSsoGroupsToRole, normalizeEnterpriseRole, resolveSsoRole } from "./auth/ssoConfig.js";
export type {
  EnterpriseRole,
  OidcSsoConfig,
  SamlSsoConfig,
  SsoConfig,
  SsoRoleMapping,
  SsoRoleMappingRule
} from "./auth/ssoConfig.js";
export { ApiKeyManager, scopeAllows } from "./auth/apiKeyManager.js";
export type {
  ApiKeyAuthResult,
  ApiKeyIssueResult,
  ApiKeyRecord,
  ApiKeyRotateResult,
  ApiKeyScope,
  ApiKeyStatus,
  ApiKeyUsageEvent,
  ApiKeyUsageSummary
} from "./auth/apiKeyManager.js";
export {
  buildEnterpriseAuditPayload,
  collectEnterpriseAuditRecords,
  eventToEnterpriseAuditRecord,
  exportEnterpriseAudit,
  exportEnterpriseAuditFromRecords
} from "./audit/enterpriseAuditExport.js";
export type {
  AzureMonitorEvent,
  CloudTrailEvent,
  CloudTrailExportPayload,
  DatadogLogEvent,
  EnterpriseAuditExportFormat,
  EnterpriseAuditExportPayload,
  EnterpriseAuditOutcome,
  EnterpriseAuditRecord,
  SplunkHecEvent
} from "./audit/enterpriseAuditExport.js";
export {
  configureCircuitBreaker,
  getCircuitBreakerPolicy,
  registerCircuit,
  getCircuit,
  listCircuits,
  resetCircuit,
  resetAllCircuits,
  withCircuitBreaker,
  withCircuitBreakerSync,
  addDeadLetter,
  getDeadLetters,
  resolveDeadLetter,
  retryDeadLetter,
  reportWritePending,
  reportWriteComplete,
  getBackpressureStatus,
  reportStuckSession,
  reportOrphanedProcess,
  getWatchdogAlerts,
  clearWatchdogAlerts,
  generateCircuitBreakerReport,
  loadCircuitBreakerPolicy,
  saveCircuitBreakerPolicy,
  renderCircuitBreakerMarkdown,
  CircuitOpenError,
  TimeoutError
} from "./ops/circuitBreaker.js";
export type {
  CircuitState,
  CircuitBreakerPolicy,
  CircuitBreakerState,
  DeadLetterEntry,
  BackpressureStatus,
  WatchdogAlert,
  CircuitBreakerReport
} from "./ops/circuitBreaker.js";
export {
  defaultOrgConfig,
  initOrgConfig, initOrgConfigAsync,
  loadOrgConfig,
  saveOrgConfig, saveOrgConfigAsync,
  verifyOrgConfigSignature,
  addOrgNode, addOrgNodeAsync,
  assignAgentToNode, assignAgentToNodeAsync,
  unassignAgentFromNode, unassignAgentFromNodeAsync
} from "./org/orgStore.js";
export {
  computeOrgScorecard,
  recomputeAndPersistOrgScorecard, recomputeAndPersistOrgScorecardAsync,
  nodeHierarchy,
  summarizeNodeForUi,
  scorecardNodeComparison
} from "./org/orgEngine.js";
export {
  writeOrgScorecard, writeOrgScorecardAsync,
  loadLatestOrgScorecard,
  verifyLatestOrgScorecardSignature,
  compareNodeScorecards
} from "./org/orgScorecard.js";
export { OrgSseHub } from "./org/orgSse.js";
export {
  orgInitCli, orgInitCliAsync,
  orgVerifyCli,
  orgAddNodeCli, orgAddNodeCliAsync,
  orgAssignCli, orgAssignCliAsync,
  orgUnassignCli, orgUnassignCliAsync,
  orgScoreCli, orgScoreCliAsync,
  orgReportCli,
  orgCompareCli,
  orgLearnCli, orgLearnCliAsync,
  orgOwnCli, orgOwnCliAsync,
  orgCommitCli, orgCommitCliAsync
} from "./org/orgCli.js";
export {
  initTransformMap, initTransformMapAsync,
  loadTransformMap,
  saveTransformMap, saveTransformMapAsync,
  verifyTransformMap,
  createTransformPlan, createTransformPlanAsync
} from "./transformation/transformPlanner.js";
export {
  loadLatestTransformPlan,
  writeSignedTransformPlan, writeSignedTransformPlanAsync,
  writeSignedTransformSnapshot, writeSignedTransformSnapshotAsync,
  verifyLatestTransformPlan
} from "./transformation/transformTasks.js";
export {
  defaultForecastPolicy,
  initForecastPolicy,
  createForecast,
  refreshForecastsForWorkspace,
  schedulerStatus as forecastSchedulerStatus,
  schedulerRunNow as forecastSchedulerRunNow,
  schedulerTick as forecastSchedulerTick
} from "./forecast/forecastEngine.js";
export { createForecastAsync, initForecastPolicyAsync, refreshForecastsForWorkspaceAsync, schedulerRunNowAsync as forecastSchedulerRunNowAsync, schedulerTickAsync as forecastSchedulerTickAsync } from "./forecast/forecastPublication.js";
export {
  forecastInitCli, forecastInitCliAsync,
  forecastVerifyCli,
  forecastPrintPolicyCli,
  forecastRefreshCli, forecastRefreshCliAsync,
  forecastLatestCli,
  advisoryListCli,
  advisoryShowCli,
  advisoryAckCli, advisoryAckCliAsync,
  forecastSchedulerStatusCli,
  forecastSchedulerRunNowCli, forecastSchedulerRunNowCliAsync,
  forecastSchedulerEnableCli, forecastSchedulerEnableCliAsync,
  forecastSchedulerDisableCli, forecastSchedulerDisableCliAsync,
  forecastPolicyApplyCli, forecastPolicyApplyCliAsync
} from "./forecast/forecastCli.js";
export { renderForecastMarkdown } from "./forecast/forecastReports.js";
export {
  getForecastLatestForApi,
  refreshForecastForApi, refreshForecastForApiAsync,
  listAdvisoriesForApi,
  ackAdvisoryForApi, ackAdvisoryForApiAsync,
  getForecastPolicyForApi,
  applyForecastPolicyForApi, applyForecastPolicyForApiAsync
} from "./forecast/forecastApi.js";
export { verifyForecastPolicy, verifyLatestForecast } from "./forecast/forecastVerifier.js";
export { runTransformTracker, runTransformTrackerAsync } from "./transformation/transformTracker.js";
export {
  writeTransformAttestation, writeTransformAttestationAsync,
  verifyTransformAttestation,
  listTransformAttestations,
  findLatestAttestationForTask
} from "./transformation/transformAttestations.js";
export { renderTransformReportMarkdown, compactTransformStatus } from "./transformation/transformReports.js";
export {
  transformInitCli, transformInitCliAsync,
  transformVerifyCli,
  transformMapReadCli,
  transformMapApplyCli, transformMapApplyCliAsync,
  transformPlanCli, transformPlanCliAsync,
  transformStatusCli,
  transformTrackCli, transformTrackCliAsync,
  transformReportCli,
  transformAttestCli, transformAttestCliAsync,
  transformAttestVerifyCli
} from "./transformation/transformCli.js";
export { releaseManifestSchema } from "./release/releaseSchema.js";
export { buildReleaseManifest, detectGitInfo, packageMeta } from "./release/releaseManifest.js";
export {
  initReleaseSigningKey,
  loadReleasePrivateKey,
  loadReleasePublicKey,
  signReleaseManifest,
  verifyReleaseManifest,
  releasePublicKeyFingerprint
} from "./release/releaseSigner.js";
export { createReleaseBundle } from "./release/releaseBundle.js";
export { verifyReleaseBundle, printReleaseBundleSummary } from "./release/releaseVerifier.js";
export { generateCycloneDxSbom, writeSbom } from "./release/releaseSbom.js";
export { generateLicenseInventory, writeLicenseInventory } from "./release/releaseLicenses.js";
export { generateProvenanceRecord, writeProvenanceRecord } from "./release/releaseProvenance.js";
export { scanDirectoryForSecrets, scanReleaseArchive, secretScanSchema } from "./release/releaseSecretScan.js";
export {
  releaseInitCli,
  releasePackCli,
  releaseVerifyCli,
  releaseSbomCli,
  releaseLicensesCli,
  releaseProvenanceCli,
  releaseScanCli,
  releasePrintCli
} from "./release/releaseCli.js";
export {
  promptInitCli, promptInitCliAsync,
  promptVerifyCli,
  promptPolicyPrintCli, promptPolicyPrintCliAsync,
  promptPolicyApplyCli, promptPolicyApplyCliAsync,
  promptStatusCli, promptStatusCliAsync,
  promptPackBuildCli, promptPackBuildCliAsync,
  promptPackVerifyCli,
  promptPackShowCli,
  promptPackDiffCli,
  promptSchedulerStatusCli,
  promptSchedulerRunNowCli, promptSchedulerRunNowCliAsync,
  promptSchedulerEnableCli, promptSchedulerEnableCliAsync,
  promptSchedulerDisableCli, promptSchedulerDisableCliAsync
} from "./prompt/promptPackCli.js";
export {
  promptInitForApi, promptInitForApiAsync,
  promptVerifyForApi,
  promptPolicyForApi, promptPolicyForApiAsync,
  promptPolicyApplyForApi, promptPolicyApplyForApiAsync,
  buildPromptPackForApi, buildPromptPackForApiAsync,
  promptStatusForApi, promptStatusForApiAsync,
  promptShowForApi,
  promptDiffForApi,
  promptSchedulerStatusForApi,
  promptSchedulerRunNowForApi, promptSchedulerRunNowForApiAsync,
  promptSchedulerSetEnabledForApi, promptSchedulerSetEnabledForApiAsync,
  promptSchedulerTick, promptSchedulerTickAsync,
  preparePromptForBridgeRequest,
  validateBridgeResponseWithPromptPolicy
} from "./prompt/promptPackApi.js";

// Correction Memory (Closed-Loop Trace Learning)
export {
  initLessonTables,
  insertLesson,
  getActiveLessons,
  getLessonById,
  getAllLessons,
  getLastLessonHash,
  updateLessonStatus,
  updateLessonInjection,
  updateLessonPostInjectionRun,
  extractLessonsFromCorrections,
  buildLessonAdvisories,
  expireStaleLessons,
  detectLessonDrift,
  generateCorrectionMemoryReport,
  renderCorrectionMemoryMarkdown,
  defaultCorrectionMemoryConfig
} from "./learning/correctionMemory.js";
export type {
  LessonStatus,
  CorrectionLesson,
  LessonInjectionPayload,
  CorrectionMemoryConfig,
  CorrectionMemoryReport
} from "./learning/correctionMemory.js";

// Claim-Level Governance Lineage
export {
  initGovernanceLineageTables,
  policyChangeIntentSchema,
  linkTransitionToTransparency,
  getTransparencyLinksForClaim,
  getTransparencyLinkByTransition,
  getAllTransparencyLinks,
  getLastIntentHash,
  recordPolicyChangeIntent,
  getPolicyIntentById,
  getPolicyIntentsByAgent,
  getPolicyIntentsByClaim,
  linkClaimToPolicy,
  getClaimPolicyLinks,
  getPolicyClaimLinks,
  buildClaimLineageView,
  buildAgentClaimLineage,
  generateGovernanceLineageReport,
  renderGovernanceLineageMarkdown,
  renderClaimLineageMarkdown
} from "./claims/governanceLineage.js";
export { linkTransitionToTransparencyAsync, recordPolicyChangeIntentAsync } from "./claims/governanceLineageAsync.js";
export type {
  ClaimTransparencyLink,
  PolicyChangeCategory,
  PolicyChangeIntent,
  ClaimPolicyLink,
  ClaimLineageView,
  GovernanceLineageReport
} from "./claims/governanceLineage.js";

// Per-Claim Confidence with Citation-Backed Scoring
export {
  defaultConfidenceThresholdPolicy,
  classifyConfidenceDomain,
  computeCitationQuality,
  assessClaimConfidence,
  assessAgentClaimConfidence,
  checkConfidenceGate,
  buildConfidenceHistograms,
  generateClaimConfidenceReport,
  renderClaimConfidenceMarkdown
} from "./claims/claimConfidence.js";
export type {
  ConfidenceDomain,
  CitationQualityScore,
  ClaimConfidenceAssessment,
  ConfidencePenalty,
  ConfidenceThresholdPolicy,
  ConfidenceHistogram,
  ConfidenceHistogramBin,
  ClaimConfidenceReport
} from "./claims/claimConfidence.js";
export * from "./claims/eligibility/index.js";

// Incident Management (Store/Model/Graph/Timeline/Auto-Assembly)
export * as IncidentStore from "./incidents/incidentStore.js";
export * as IncidentModel from "./incidents/incidentTypes.js";
export * as IncidentAutoAssembly from "./incidents/autoAssembly.js";
export { IncidentGraph } from "./incidents/incidentGraph.js";
export { IncidentTimeline } from "./incidents/incidentTimeline.js";
export type { IncidentStoreInstance } from "./incidents/incidentStore.js";
export {
  createIncidentStore,
  verifyIncidentSignature,
  computeIncidentHash
} from "./incidents/incidentStore.js";
export type {
  IncidentSeverity,
  IncidentState,
  CausalRelationship,
  CausalEdge,
  Incident,
  IncidentTransition
} from "./incidents/incidentTypes.js";
export {
  assembleFromDrift,
  assembleFromAssuranceFailure,
  assembleFromFreeze,
  assembleFromBudgetExceed,
  autoDetectAndAssemble
} from "./incidents/autoAssembly.js";
export {
  buildIncidentRegressionReceipt,
  buildIncidentRegressionWatchAlerts,
  type BuildIncidentRegressionReceiptInput,
  type IncidentRegressionAlertSeverity,
  type IncidentRegressionClosureStatus,
  type IncidentRegressionFailureCluster,
  type IncidentRegressionGeneratedTest,
  type IncidentRegressionGeneratedTestReceipt,
  type IncidentRegressionLiveTrends,
  type IncidentRegressionReceipt,
  type IncidentRegressionReceiptStatus,
  type IncidentRegressionTraceIndex,
  type IncidentRegressionTraceIndexEntry,
  type IncidentRegressionTraceRow,
  type IncidentRegressionValidationRun,
  type IncidentRegressionValidationRunReceipt,
  type IncidentRegressionValidationStatus,
  type IncidentRegressionWatchAlert
} from "./incidents/incidentRegression.js";

// Enhanced CGX Edge Semantics & Risk Propagation
export {
  semanticEdgeTypeSchema,
  createSemanticOverlay,
  addSemanticEdge,
  verifySemanticEdge,
  markStaleEdges,
  simulateRiskPropagation,
  diffGraphs,
  checkGraphIntegrity,
  detectHotspots,
  renderPropagationMarkdown,
  renderGraphDiffMarkdown,
  renderIntegrityCheckMarkdown
} from "./cgx/cgxPropagation.js";
export type {
  SemanticEdgeType,
  SemanticEdge,
  SemanticEdgeOverlay,
  PropagationResult,
  GraphDiffResult,
  GraphIntegrityCheckResult,
  GraphHotspot
} from "./cgx/cgxPropagation.js";

// Policy Canary Mode & Rollback Packs
export {
  canaryConfigSchema,
  startCanary,
  stopCanary,
  getCanaryConfig,
  makeCanaryDecision,
  recordCanaryOutcome,
  computeCanaryStats,
  createRollbackPack, createRollbackPackAsync,
  getRollbackPacks,
  getLatestRollbackPack,
  activateEmergencyOverride,
  activateEmergencyOverrideAsync,
  getActiveOverrides,
  filePostmortem, filePostmortemAsync,
  getOverridesMissingPostmortem,
  registerPolicyDebt, registerPolicyDebtAsync,
  getActivePolicyDebt,
  getExpiredPolicyDebt,
  expirePolicyDebt,
  recordSLOMeasurement,
  computeGovernanceSLO,
  defaultGovernanceSLOTarget,
  checkSLOCompliance,
  detectGovernanceDrift,
  generatePolicyCanaryReport,
  renderPolicyCanaryMarkdown,
  resetPolicyCanaryState
} from "./governor/policyCanary.js";
// SDK Parity & Developer Onboarding
export {
  generateScaffold,
  generateContractTests,
  validateContractTest,
  defaultSimulatorConfig,
  simulateBridgeRequest,
  generateBridgeOpenApiSpec,
  listAvailableFrameworks
} from "./setup/integrationScaffold.js";
export type {
  IntegrationFramework,
  IntegrationScaffold,
  ContractTestCase,
  ContractTestResult,
  ContractTestSuite,
  SimulatorConfig,
  SimulatorResponse,
  OpenApiEndpoint,
  OpenApiSpec
} from "./setup/integrationScaffold.js";

// Per-Feature Overhead Accounting
export {
  defaultOverheadProfile,
  setOverheadProfile,
  getOverheadProfile,
  recordOverhead,
  computeFeatureSummaries,
  computeAgentCostAttribution,
  getOverheadAnomalies,
  checkBudgetViolations,
  generateOverheadReport,
  renderOverheadReportMarkdown,
  resetOverheadAccounting
} from "./ops/overheadAccounting.js";
export type {
  OverheadFeature,
  OverheadModeProfile,
  OverheadMeasurement,
  OverheadBudget,
  OverheadProfile,
  FeatureOverheadSummary,
  OverheadAnomaly,
  AgentCostAttribution,
  OverheadReport
} from "./ops/overheadAccounting.js";

// Operator UX — Why Capped + How to Unlock View
export {
  computeWhyCaps,
  computeConfidenceHeatmap,
  computeActionQueue,
  computeNarrativeDiff,
  computeIncidentTimeline,
  computeTrustSummary,
  getRolePreset,
  listRolePresets,
  generateOperatorDashboard,
  renderOperatorDashboardMarkdown,
} from "./ops/operatorUx.js";
export type {
  OperatorRole,
  WhyCapReason,
  WhyCapView,
  ConfidenceCell,
  ConfidenceHeatmap,
  ActionItem,
  ActionQueue,
  NarrativeDiffEntry,
  NarrativeDiff,
  IncidentTimelineEntry,
  IncidentTimeline as OperatorIncidentTimeline,
  TrustSummary,
  RolePreset,
  OperatorDashboard,
} from "./ops/operatorUx.js";

// Data Residency & Tenant Isolation Controls
export {
  createResidencyPolicy, createResidencyPolicyAsync,
  getResidencyPolicies,
  getResidencyPolicy,
  getPolicyForRegion,
  registerTenant, registerTenantAsync,
  getTenants,
  getTenant,
  checkTenantIsolation,
  checkAllTenantIsolation,
  issueLegalHold,
  releaseLegalHold,
  getActiveLegalHolds,
  isTenantUnderLegalHold,
  getBuiltInRedactionRules,
  applyRedaction,
  runRedactionTests,
  getKeyCustodyConfig,
  listKeyCustodyModes,
  isRegionAllowed,
  validateDataTransfer,
  generateResidencyReport,
  renderResidencyReportMarkdown,
  resetDataResidencyState,
} from "./compliance/dataResidency.js";
export type {
  DataRegion,
  KeyCustodyMode,
  IsolationLevel,
  ResidencyPolicy,
  TenantBoundary,
  TenantIsolationCheck,
  TenantViolation,
  LegalHold,
  PrivacyRedactionRule,
  RedactionTestResult,
  RedactionTestSuite,
  KeyCustodyConfig,
  ResidencyComplianceReport,
} from "./compliance/dataResidency.js";

// Insider Risk Analytics
export {
  configureInsiderRisk,
  getInsiderRiskConfig,
  recordApprovalEvent,
  recordToolUsageEvent,
  recordPolicyChangeEvent,
  analyzeRubberStamping,
  detectSelfApprovals,
  detectUnusualHours,
  detectPermissionAnomalies,
  detectFrequencyAnomalies,
  computeInsiderRiskScores,
  exportAttestationBundle,
  generateInsiderRiskReport,
  getInsiderAlerts,
  acknowledgeInsiderAlert,
  renderInsiderRiskMarkdown,
  resetInsiderRiskState,
} from "./audit/insiderRisk.js";
export type {
  RiskSeverity,
  InsiderRiskCategory,
  ApprovalEvent,
  ToolUsageEvent,
  PolicyChangeEvent,
  InsiderRiskAlert,
  RubberStampAnalysis,
  SelfApprovalAttempt,
  UnusualHoursActivity,
  PermissionAnomalyResult,
  InsiderRiskScore,
  AttestationBundle,
  InsiderRiskReport,
  InsiderRiskConfig,
} from "./audit/insiderRisk.js";

// Model Cognition Lab
export {
  getLabTemplates,
  getLabTemplate,
  createLabExperiment, createLabExperimentAsync,
  getLabExperiment,
  listLabExperiments,
  startLabExperiment, startLabExperimentAsync,
  recordLabProbeResult, recordLabProbeResultAsync,
  completeLabExperiment, completeLabExperimentAsync,
  cancelLabExperiment, cancelLabExperimentAsync,
  simulateExperiment, simulateExperimentAsync,
  compareExperiments,
  importModelSignal,
  getSignalImports,
  generateLabReport,
  renderLabReportMarkdown,
  resetLabState,
} from "./lab/cognitionLab.js";
export type {
  LabExperimentKind,
  LabExperimentStatus,
  LabBoundaryMarker,
  LabExperimentTemplate,
  LabParameter,
  LabProbe,
  LabExperiment,
  LabProbeResult,
  LabComparisonPair,
  LabExperimentReport,
  ModelSignalImport,
} from "./lab/cognitionLab.js";

// Always-On Micro-Canary Assurance
export {
  defaultMicroCanaryConfig,
  configureMicroCanary,
  getMicroCanaryConfig,
  registerProbe,
  listRegisteredProbes,
  getProbesByTier,
  registerBuiltInProbes,
  isProbedue,
  executeProbe,
  runDueProbes,
  runAllProbes,
  getExecutionHistory,
  getActiveAlerts,
  getAllAlerts,
  acknowledgeAlert,
  acknowledgeAllAlerts,
  generateMicroCanaryReport,
  renderMicroCanaryMarkdown,
  computeCanaryHealthScore,
  resetMicroCanaryState,
  microCanaryConfigSchema
} from "./assurance/microCanary.js";
export type {
  CanaryProbeRiskTier,
  CanaryProbeCategory,
  CanaryProbeStatus,
  MicroCanaryProbeDefinition,
  MicroCanaryContext,
  MicroCanaryProbeResult,
  MicroCanaryExecution,
  MicroCanaryConfig,
  MicroCanaryAlert,
  MicroCanaryReport
} from "./assurance/microCanary.js";

// Controlled Architecture Experiment Harness
export {
  architectureSpecSchema,
  architectureProbeSchema,
  createArchitectureSpec,
  createProbe,
  createStandardProbeSet,
  createArchitectureExperiment,
  simulateProbeOutcomes,
  runArchitectureExperiment,
  analyzeArchitectureExperiment,
  renderArchitectureComparisonMarkdown,
  quickArchitectureComparison
} from "./experiments/architectureExperiment.js";
export type {
  ArchitectureSpecKind,
  ArchitectureSpec,
  ArchitectureProbe,
  ProbeOutcomeVerdict,
  ProbeOutcome,
  ArchitectureExperiment,
  DimensionComparison,
  BehavioralDiff,
  ArchitectureComparisonReport
} from "./experiments/architectureExperiment.js";

export type {
  CanaryMode,
  CanaryConfig,
  CanaryDecision,
  CanaryStats,
  RollbackPack,
  EmergencyOverride,
  PolicyDebtEntry,
  GovernanceSLO,
  GovernanceSLOTarget,
  GovernanceDriftResult,
  PolicyCanaryReport
} from "./governor/policyCanary.js";

// False Positive Cost Tracking & Tuning Loop
export {
  resetFPTrackerState,
  configureFPCostModel,
  getFPCostModel,
  submitFPReport, submitFPReportAsync,
  resolveFPReport, resolveFPReportAsync,
  getFPReport,
  listFPReports,
  computeFPCostSummary,
  generateTuningRecommendations,
  generateFPTuningReport,
  renderFPTuningReportMarkdown,
} from "./assurance/falsePositiveTracker.js";
export type {
  FalsePositiveReport,
  FPCostModel,
  FPCostSummary,
  TuningRecommendation,
  FPTuningReport,
} from "./assurance/falsePositiveTracker.js";

// Python SDK Generator
export {
  generatePythonSdkPackage,
  listPythonSdkEndpoints,
  validatePythonSdkCoverage,
} from "./sdk/pythonSdkGenerator.js";
export type {
  PythonSdkFile,
  PythonSdkPackage,
} from "./sdk/pythonSdkGenerator.js";

// Production Wiring
export {
  resetWiringState,
  gatewayOverheadHook,
  gatewayOverheadBudgetCheck,
  bridgeResidencyHook,
  diagnosticOperatorHook,
  insiderRiskHook,
  labSignalBridge,
  fpTrackerHook,
  getWiringDiagnostics,
  getOverheadMeasurements,
  getResidencyChecks,
  getInsiderCaptures,
  getLabBridgeResults,
  renderWiringDiagnosticsMarkdown,
} from "./ops/productionWiring.js";
// Community Governance
export {
  initCommunityPlatform,
  addCommunitySignal,
  detectGamingPatterns,
  scoreCommunityGovernance,
  renderCommunityGovernanceMarkdown,
  communitySignalSchema,
  communityPlatformConfigSchema,
  COMMUNITY_TRUST_TIERS,
  COMMUNITY_DIMENSIONS,
  GAMING_PATTERNS,
} from "./org/communityGovernance.js";
export type {
  CommunityTrustTier,
  CommunityDimension,
  GamingPattern,
  CommunitySignal,
  GamingDetection,
  DimensionScore,
  CommunityGovernanceReport,
  CommunityPlatformConfig,
} from "./org/communityGovernance.js";

// Agent Discovery & Reputation Portability
export {
  createDiscoveryRegistry,
  ensureAgentEntry,
  addCapability,
  linkPlatform,
  searchCapabilities,
  exportPortableReputation,
  verifyPortableReputation,
  capabilityDeclarationSchema,
  platformLinkSchema,
} from "./passport/agentDiscovery.js";
export type {
  CapabilityDeclaration,
  PlatformLink,
  CapabilitySearchQuery,
  CapabilitySearchResult,
  PortableReputationBundle,
  AgentDiscoveryRegistry,
  AgentDiscoveryEntry,
} from "./passport/agentDiscovery.js";

// Known Unknowns
export {
  analyzeQuestionUnknowns,
  generateKnownUnknownsReport,
  renderKnownUnknownsMarkdown,
  UNKNOWN_CATEGORIES,
} from "./diagnostic/knownUnknowns.js";
export type {
  UnknownCategory,
  KnownUnknown,
  KnownUnknownsReport,
} from "./diagnostic/knownUnknowns.js";

// Identity Stability
export {
  computeIdentityStability,
  renderIdentityStabilityMarkdown,
  renderAnomaliesMarkdown,
  DEFAULT_IDENTITY_STABILITY_CONFIG,
} from "./diagnostic/identityStability.js";
export type {
  AnomalyType,
  AnomalySeverity,
  IdentityAnomaly,
  IdentityStabilityReport,
  BehavioralTrace,
  StyleVector,
  DecisionVector,
  ValueVector,
  IdentityStabilityConfig,
} from "./diagnostic/identityStability.js";

// Meta-Confidence
export {
  computeQuestionMetaConfidence,
  computeDiagnosticMetaConfidence,
  renderMetaConfidenceMarkdown,
} from "./diagnostic/metaConfidence.js";
export type {
  QuestionMetaConfidence,
  DiagnosticMetaConfidence,
  ConfidenceHeatmapCell,
  MetaConfidenceOptions,
} from "./diagnostic/metaConfidence.js";

// Confidence-Threshold Governor
export {
  computeEffectiveLevel,
  confidenceCheck,
  renderConfidenceGovernorMarkdown,
  DEFAULT_CONFIDENCE_GOVERNOR_CONFIG,
} from "./governor/confidenceGovernor.js";
export type {
  ConfidenceGovernorConfig,
  ConfidenceGovernorDecision,
  ConfidenceCheckInput,
} from "./governor/confidenceGovernor.js";

// Per-Component Confidence
export {
  computeComponentConfidence,
  renderComponentConfidenceMarkdown,
  CONFIDENCE_COMPONENTS,
} from "./diagnostic/componentConfidence.js";
export type {
  ConfidenceComponentName,
  ConfidenceTrend,
  ConfidenceComponent,
  ComponentConfidenceReport,
  ComponentHeatmapCell,
} from "./diagnostic/componentConfidence.js";

// Prediction-vs-Outcome Self-Calibration
export {
  computeConfidenceQuality,
  renderConfidenceQualityMarkdown,
} from "./diagnostic/selfCalibration.js";
export type {
  PredictionOutcome,
  CalibrationBin,
  ConfidenceQualityReport,
  CalibrationOptions,
} from "./diagnostic/selfCalibration.js";

export type {
  AuditEventInput,
  AppendEvidenceFn,
  OverheadMeasurement as WiringOverheadMeasurement,
  ResidencyCheckResult,
  InsiderEventCapture,
  LabSignalBridgeResult,
  WiringDiagnostic,
} from "./ops/productionWiring.js";

// ── Timing Side-Channel Pack ──────────────────────────────────────────
export { timingSideChannelPack } from "./assurance/packs/timingSideChannelPack.js";

// ── Studio OpenAPI ────────────────────────────────────────────────────
export { generateFullOpenApiSpec, renderOpenApiYaml, openapiGenerateCli } from "./studio/openapi.js";

// ── Plugin Sandbox Limits ─────────────────────────────────────────────
export {
  sandboxLimitsSchema,
  DEFAULT_SANDBOX_LIMITS,
  withCpuTimeout,
  assertNetworkAllowed,
  buildProcessResourceArgs,
  checkUsageViolations,
  resolveSandboxLimits,
  formatSandboxLimits,
  pluginResourceMetric,
  PluginSandboxError,
} from "./plugins/sandboxLimits.js";
export type { SandboxLimits, PluginResourceUsage, LimitViolation } from "./plugins/sandboxLimits.js";

// ── Semantic Code Edges ───────────────────────────────────────────────
export {
  scanCodeGraph,
  propagateCodeChanges,
  renderCodeGraphMarkdown,
} from "./cgx/semanticCodeEdges.js";
export type { CodeNode, CodeEdge, CodeGraph, CodeNodeType, CodeEdgeType } from "./cgx/semanticCodeEdges.js";

// ── Shield modules ────────────────────────────────────────────────────
export * from "./shield/index.js";

// ── Enforce modules ───────────────────────────────────────────────────
export * from "./enforce/index.js";

// ── Watch modules ─────────────────────────────────────────────────────
export * from "./watch/index.js";

// ── Score modules ─────────────────────────────────────────────────────
export * from "./score/index.js";

// ── Domain modules ────────────────────────────────────────────────────
export * from "./domains/index.js";

// ── Product modules ───────────────────────────────────────────────────
// AutonomyMode conflicts with score/graduatedAutonomy — skip product barrel, import directly
export { type AutonomyMode as ProductAutonomyMode, type AutonomyDecision } from "./product/autonomyDial.js";


// ── Agent harnesses ───────────────────────────────────────────────────
export * from "./agents/index.js";

// ── REST API ──────────────────────────────────────────────────────────
export { handleApiRoute } from "./api/index.js";

// ── OpenTelemetry export ──────────────────────────────────────────
export { OTELExporter, createTraceparent, parseTraceparent } from "./ops/otelExporter.js";
export type {
  OTELExporterConfig, OTLPSpan, OTLPResource,
  TraceContext as OTELTraceContext,
} from "./ops/otelExporter.js";
export {
  ObservabilityOTELExporter,
  createObservabilityOTELExporterFromEnv,
  getSharedObservabilityExporter,
  resetSharedObservabilityExporterForTests,
  queueEvidenceEventSpan,
  queueScoreComputationMetric,
  queueIncidentLog
} from "./observability/otelExporter.js";
export type {
  ObservabilityOTELConfig,
  ObservabilityExporterKind,
  ObservabilityExporterTarget,
  ObservabilitySignal,
  ScoreComputationMetric,
  IncidentLogInput
} from "./observability/otelExporter.js";
export {
  detectEvidenceRateDrop,
  detectTrustTierRegression,
  detectScoreVolatilitySpike,
  detectEvidenceStreamAnomalies
} from "./observability/anomalyDetector.js";
export type {
  ObservabilityAnomaly,
  ObservabilityAnomalyType,
  ObservabilityAnomalySeverity,
  EvidenceSignalPoint,
  ScoreSignalPoint
} from "./observability/anomalyDetector.js";
export {
  listEvidenceDebugEvents,
  streamEvidenceDebugEvents,
  formatDebugEventLine,
  formatAnomalyLine,
  runDebugModeCli
} from "./observability/debugMode.js";
export type {
  EvidenceDebugEvent,
  DebugEventFilter,
  ListDebugEventsOptions,
  StreamDebugEventsOptions,
  RunDebugCliOptions
} from "./observability/debugMode.js";
export { buildAgentTimelineData, evidenceEventToSignalPoint } from "./observability/timeline.js";
export type {
  AgentTimelineData,
  TimelineEvent,
  TimelineEvidencePoint,
  TimelineScorePoint
} from "./observability/timeline.js";

// ── Eval run OTel tracing ────────────────────────────────────────
export { emitEvalRunTelemetry, traceEvalRun } from "./observability/evalTracing.js";
export type { EvalTraceContext } from "./observability/evalTracing.js";

// ── Platform OTel configs (Grafana, Datadog, New Relic) ──────────
export {
  getGrafanaConfig,
  getDatadogConfig,
  getNewRelicConfig,
  detectPlatform,
  autoConfigFromEnv,
} from "./observability/platformConfigs.js";
export type {
  GrafanaCloudOptions,
  DatadogOptions,
  NewRelicOptions,
  PlatformName,
} from "./observability/platformConfigs.js";

// ── Multi-provider model routing ─────────────────────────────────
export { ModelRouter } from "./ops/modelRouter.js";
export type {
  ModelProvider, ModelSpec, RoutingStrategy, RoutingRequest,
  RoutingDecision, RoutingStats,
} from "./ops/modelRouter.js";

// ── Vault extensions ──────────────────────────────────────────────────
export * from "./vault/ragGuard.js";
export * from "./vault/dataClassification.js";
export * from "./vault/metadataScrubber.js";
export * from "./vault/invoiceFraud.js";
export * from "./vault/dsarAutopilot.js";
export * from "./vault/privacyBudget.js";
export * from "./vault/knowledgeRefreshLineage.js";

// ── NL Policy authoring (2026-02-21) ─────────────────────────────────
export { parseNLPolicy, validateParsedPolicy, POLICY_TEMPLATES } from "./governor/nlPolicy.js";
export type { NLPolicyInput, ParsedPolicy, PolicyRule, PolicyValidationResult } from "./governor/nlPolicy.js";

// ── Lifecycle responsibility mapping ───────────────────────────────────
export {
  lifecycleStages,
  lifecycleRoles,
  lifecycleStageDefinitions,
  lifecycleResponsibilityMatrix,
  lifecycleGovernanceGatesByTargetStage,
  lifecyclePath,
  lifecycleStatus,
  advanceLifecycleStage,
  requiredControlsForStage,
  parseLifecycleStage,
  parseLifecycleRole
} from "./lifecycle/lifecycle.js";
export type {
  AgentLifecycleStage,
  LifecycleRole,
  LifecycleStageDefinition,
  LifecycleResponsibilityAssignment,
  GovernanceGateRequirement,
  LifecycleTransitionRecord,
  AgentLifecycleState,
  AgentLifecycleStatus,
  AdvanceLifecycleInput,
  AdvanceLifecycleResult
} from "./lifecycle/lifecycle.js";
export { lifecycleStatusCli, lifecycleAdvanceCli, parseControlsCsv } from "./lifecycle/lifecycleCli.js";
export type { LifecycleStatusCliInput, LifecycleAdvanceCliInput } from "./lifecycle/lifecycleCli.js";

// ── ZK Privacy (Pedersen commitments, Schnorr proofs, Shamir sharing) ─────
export {
  pedersenCommit,
  pedersenVerify,
  pedersenAdd,
  schnorrProve,
  schnorrVerify,
  createZKRangeProof,
  verifyZKRangeProof,
  createSelectiveDisclosure,
  verifySelectiveDisclosure,
  shamirSplit,
  shamirReconstruct,
  createMultiPartyVerification,
  reconstructMultiPartyResult,
  commitToEvidence,
  revealEvidence,
} from "./vault/zkPrivacy.js";
export type {
  PedersenCommitment,
  SchnorrProof,
  ZKRangeProof,
  BitProof,
  SelectiveDisclosure,
  MerkleProof,
  ShamirShare,
  MultiPartyVerification,
  EvidenceCommitment,
} from "./vault/zkPrivacy.js";

// ── Trust Interchange (AMC Trust Token, cross-platform credential exchange) ─
export {
  issueTrustToken,
  verifyTrustToken,
  TRUST_TRANSLATIONS,
  translateTrustScores,
  createVerificationRequest,
  processVerificationRequest,
} from "./passport/trustInterchange.js";
export type {
  AMCTrustToken,
  TrustClaim,
  TrustTranslation,
  DimensionMapping,
  FederatedVerificationRequest,
  FederatedVerificationResponse,
  TrustNetwork,
  TrustNetworkNode,
  TrustNetworkEdge,
} from "./passport/trustInterchange.js";

// ── Receipt Interchange (versioned external receipt schema) ─
export {
  INTEROPERABLE_RECEIPT_SCHEMA_VERSION,
  buildInteroperableReceipt,
  interoperableReceiptJsonSchema,
  parseInteroperableReceipt,
  serializeInteroperableReceipt,
  verifyInteroperableReceipt,
} from "./passport/receiptInterchange.js";
export type {
  BuildInteroperableReceiptInput,
  InteroperableReceipt,
  InteroperableReceiptEventRef,
  InteroperableReceiptIssuer,
  InteroperableReceiptKind,
  InteroperableReceiptSignature,
  InteroperableReceiptSourceCitation,
  InteroperableReceiptSubject,
  InteroperableReceiptVerification,
} from "./passport/receiptInterchange.js";

// ── Adapter Capability Receipts (portable signed adapter truth) ─
export {
  ADAPTER_CAPABILITY_RECEIPT_VERSION,
  adapterCapabilityInspectionSchema,
  adapterCapabilityReceiptSchema,
  issueAdapterCapabilityReceipt, issueAdapterCapabilityReceiptAsync,
  trustedAdapterCapabilityReceiptKeys,
  verifyAdapterCapabilityReceipt
} from "./passport/adapterCapabilityReceipt.js";
export type {
  AdapterCapabilityInspection,
  AdapterCapabilityReceipt,
  AdapterCapabilityVerification,
  IssueAdapterCapabilityReceiptInput,
  VerifyAdapterCapabilityReceiptOptions
} from "./passport/adapterCapabilityReceipt.js";

// ── Passport Schema Compatibility (versioned import/export matrix) ─
export {
  CURRENT_PASSPORT_SCHEMA_VERSION,
  PASSPORT_SCHEMA_COMPATIBILITY_VERSION,
  PASSPORT_SCHEMA_ID,
  buildPassportSchemaCompatibilityReport,
  passportSchemaCompatibilityDirections,
  verifyPassportSchemaCompatibilityReport,
} from "./passport/passportSchemaCompatibility.js";
export type {
  BuildPassportSchemaCompatibilityReportInput,
  PassportSchemaCompatibilityDirection,
  PassportSchemaCompatibilityFixture,
  PassportSchemaCompatibilityMatrixRow,
  PassportSchemaCompatibilityReport,
  PassportSchemaCompatibilitySourceCitation,
  PassportSchemaCompatibilityStatus,
  PassportSchemaCompatibilityVerification,
  PassportSchemaImportExportResult,
} from "./passport/passportSchemaCompatibility.js";

export { createPassportArtifactAsync } from "./passport/passportArtifact.js";
export { savePassportPolicyAsync, loadPassportPolicyAsync, savePassportCacheAsync } from "./passport/passportStore.js";
export { signPassportJsonAsync } from "./passport/passportSigner.js";

// ── Regulatory Automation (RegulatoryMonitor, feed configs, gap analysis) ─
export {
  DEFAULT_REGULATORY_FEEDS,
  RegulatoryMonitor,
  getRegulatoryChanges,
} from "./compliance/regulatoryAutomation.js";
export type {
  RegulatoryChange,
  RegulatoryFeed,
  FeedCheckResult,
  ComplianceGapAnalysis,
  ComplianceGap,
  RemediationStep,
  RegulatoryImpactAssessment,
  RegulatoryMonitorConfig,
} from "./compliance/regulatoryAutomation.js";

// ── i18n Framework (MF-08: Localization & Cultural Adaptability) ─
export {
  SUPPORTED_LOCALES,
  RTL_LOCALES,
  localeMetadata,
  isRtl,
  isSupportedLocale,
  getLocaleMetadata,
  getTranslationKeys,
  getDefaultTranslationBundle,
  t,
  CULTURAL_CONTEXTS,
  getCulturalContext,
  checkTranslationCompleteness,
  i18nConfigSchema,
  defaultI18nConfig,
  saveTranslationBundle,
} from "./i18n/i18nFramework.js";
export type {
  SupportedLocale,
  TranslationBundle,
  TranslationKey,
  CulturalContext,
  I18nConfig,
} from "./i18n/i18nFramework.js";

// ── Anti-Gaming Defenses (MF-09) ─
export {
  detectGaming,
  randomizeQuestions,
  analyzeSessionFingerprints,
  stabilizeScores,
} from "./score/antiGaming.js";
export type {
  GamingDetectionResult,
  GamingIndicator,
  SessionFingerprint,
  CrossSessionAnalysis,
  SuspiciousPattern,
  CollusionIndicator,
  StabilizedScore,
} from "./score/antiGaming.js";

// ── Enterprise IAM (MF-12: Authentication & Access Control) ─
export {
  ssoProviderSchema,
  createSsoSession,
  isSessionValid,
  refreshSession,
  BUILT_IN_ROLES,
  DEFAULT_ROLE_DEFINITIONS,
  getRoleDefinition,
  resolvePermissions,
  hasPermission,
  checkAccess,
  AuditLog,
  saveSsoConfig,
  loadSsoConfig,
} from "./auth/enterpriseIam.js";
export type {
  SsoProvider,
  SsoSession,
  BuiltInRole,
  Permission,
  RoleDefinition,
  AuditLogEntry,
} from "./auth/enterpriseIam.js";

// ── Fleet Cascade Simulator (MF-11: Fleet-Level Impact Analysis) ─
export {
  runCascadeSimulation,
  saveCascadeReport,
  listCascadeScenarios,
  listFaultTemplates,
  FAULT_TEMPLATES,
  CASCADE_SCENARIOS,
} from "./fleet/cascadeSimulator.js";
export type {
  SimulatedAgent,
  FaultInjection,
  FaultType,
  PropagationStep,
  CascadePattern,
  CascadePatternType,
  CascadeSimulationResult,
  CascadeScenario,
  CascadeSimulationOptions,
} from "./fleet/cascadeSimulator.js";

// ── Multi-Tenant Federated Scoring (R4-02) ─
export {
  TenantManager,
  tenantSchema,
} from "./fleet/multiTenant.js";
export type {
  Tenant,
  FederatedBenchmark,
  TenantIsolation,
} from "./fleet/multiTenant.js";

// ── Continuous Monitor (drift + anomaly detection) ─
export {
  continuousMonitorConfigSchema,
  runMonitorTick,
  createMonitorSession,
  executeSessionTick,
  renderMonitorTickMarkdown,
  renderMonitorSessionMarkdown,
  saveMonitorTickReport,
  defaultMonitorConfig,
} from "./drift/continuousMonitor.js";
export type {
  ContinuousMonitorConfig,
  MetricPoint,
  TimeSeriesStore,
  AnomalyResult,
  InjectionDetection,
  ContextPollutionResult,
  ToolApiChangeResult,
  MonitorTickResult,
  MonitorSession,
} from "./drift/continuousMonitor.js";

// ── Real-Time Dashboard Monitoring ─
export {
  RealtimeMonitor,
  DEFAULT_DASHBOARD_CONFIG,
} from "./monitoring/realtimeDashboard.js";
export type {
  DashboardMetric,
  DashboardWidget,
  DashboardConfig,
  AlertThreshold,
  MonitoringAlert,
} from "./monitoring/realtimeDashboard.js";

// ── Drift Detection Alerts ─
export {
  DriftDetector,
  DEFAULT_DRIFT_CONFIG,
} from "./monitoring/driftDetection.js";
export type {
  DriftSample,
  DriftAlert,
  DriftConfig,
} from "./monitoring/driftDetection.js";

// ── Risk Tiers (diagnostic severity classification) ─
export {
  riskTierConfigSchema,
  RISK_TIER_PROFILES,
  getRiskTierProfile,
  autoDetectRiskTier,
  shouldEscalateTier,
} from "./diagnostic/riskTiers.js";
export type {
  RiskTierConfig,
  AutoTierResult,
} from "./diagnostic/riskTiers.js";

// ── Longitudinal Time-Series Tracking (MF-19) ─
export {
  analyzeTimeSeries,
  detectRegressionAlert,
} from "./diagnostic/longitudinalTracking.js";
export type {
  ScoreDataPoint,
  TimeSeriesAnalysis,
} from "./diagnostic/longitudinalTracking.js";

// ── Deep Industry Packs (MF-07) ─
export {
  DEEP_HEALTHCARE_QUESTIONS,
  DEEP_FINANCE_QUESTIONS,
  DEEP_GOVERNMENT_QUESTIONS,
  getAllDeepIndustryQuestions,
  getDeepQuestionsByIndustry,
  getDeepQuestionsByRegulation,
  getDeepIndustryPackStats,
} from "./domains/deepIndustryPacks.js";
export type {
  DeepIndustryQuestion,
} from "./domains/deepIndustryPacks.js";
// The DEEP_* arrays and every pack question are AI-drafted and experimental: self-reported questionnaires (P1-42).
export { QUESTIONNAIRE_CONTENT_STATUS, QUESTIONNAIRE_NOTICE } from "./domains/questionnaireLabel.js";

// ── Adapter Standardization (MF-11) ─
export {
  ADAPTER_CAPABILITY_TIERS,
  ADAPTER_PROFILES,
  getAdapterProfile,
  getAdaptersByTier,
  meetsMinimumSpec,
  getAdapterScoreAdjustment,
  getAdapterComparisonMatrix,
} from "./adapters/adapterStandardization.js";
export type {
  AdapterCapabilityTier,
  AdapterCapabilityProfile,
  AdapterCapabilities,
} from "./adapters/adapterStandardization.js";

// ── Offline / Lite Mode (MF-08) ─
export {
  offlineConfigSchema,
  offlineModeConfig,
  liteModeConfig,
  defaultOfflineConfig,
  checkOfflineCapability,
  validateOfflineEnvironment,
} from "./cli/offlineMode.js";
export type { OfflineConfig } from "./cli/offlineMode.js";

// ── Red Team: Adversarial Generator ─
export {
  ATTACK_CATEGORIES,
  generateAdversarialSuite,
  evaluateAdversarialResults,
  getTemplateRegistry,
} from "./redteam/adversarialGenerator.js";
export type {
  AttackCategory,
  AdversarialTemplate,
  AgentProfile,
  AdversarialSample,
  AdversarialReport,
} from "./redteam/adversarialGenerator.js";

// ── Red Team: Multilingual Attacks ─
export {
  MULTILINGUAL_ATTACKS,
  getAttacksByLanguage,
  getAttacksByType,
  getMultilingualAttackStats,
} from "./redteam/multilingualAttacks.js";
export type {
  MultilingualAttack,
} from "./redteam/multilingualAttacks.js";

// ── Red Team: Prompt Injection Regression Suite ─
export {
  PROMPT_INJECTION_REGRESSION_SUITE_SCHEMA_VERSION,
  buildPromptInjectionRegressionSuiteReceipt,
  renderPromptInjectionRegressionSuiteMarkdown,
  verifyPromptInjectionRegressionSuiteReceipt,
} from "./redteam/promptInjectionRegressionSuite.js";
export type {
  PromptInjectionRegressionDecision,
  PromptInjectionRegressionFixtureInput,
  PromptInjectionRegressionFixtureStatus,
  PromptInjectionRegressionRowStatus,
  PromptInjectionRegressionSourceMetadata,
  PromptInjectionRegressionSuiteCoverage,
  PromptInjectionRegressionSuiteInput,
  PromptInjectionRegressionSuiteReceipt,
  PromptInjectionRegressionSuiteRow,
  PromptInjectionRegressionSuiteStatus,
  PromptInjectionRegressionSuiteVerification,
  PromptInjectionRegressionVector,
} from "./redteam/promptInjectionRegressionSuite.js";

// ── Red Team: Exploit Ledger ─
export {
  RED_TEAM_EXPLOIT_LEDGER_SCHEMA_VERSION,
  buildRedTeamExploitLedgerReceipt,
  renderRedTeamExploitLedgerMarkdown,
  verifyRedTeamExploitLedgerReceipt,
} from "./redteam/exploitLedger.js";
export type {
  RedTeamExploitLedgerInput,
  RedTeamExploitLedgerReceipt,
  RedTeamExploitLedgerRow,
  RedTeamExploitLedgerRowStatus,
  RedTeamExploitLedgerSourceMetadata,
  RedTeamExploitLedgerStatus,
  RedTeamExploitLedgerVerification,
  RedTeamExploitRecordInput,
  RedTeamExploitReproducibility,
  RedTeamExploitRetestStatus,
  RedTeamExploitSeverity,
} from "./redteam/exploitLedger.js";

// ── Score Explainer (human-readable score breakdowns) ─
export {
  decomposeScore,
  computeConfidenceInterval,
  computeBenchmarkComparison,
  buildAuditTrail,
  generateScoreExplanationReport,
  renderExplanationMarkdown,
} from "./score/scoreExplainer.js";
export type {
  ScoreContribution,
  ScoreDecomposition,
  NaturalLanguageExplanation,
  ConfidenceInterval,
  BenchmarkComparison,
  ScoreExplanationReport,
  AuditTrailEntry,
} from "./score/scoreExplainer.js";

// ── Plugin API Versioning ─
export {
  PLUGIN_API_VERSION,
  PLUGIN_API_MIN_VERSION,
  PLUGIN_API_STABILITY,
  parseSemVer,
  compareSemVer,
  semVerToString,
  checkPluginCompatibility,
  getActiveDeprecations,
  getAllDeprecations,
  getApiChangelog,
  getBreakingChanges,
  computeApiSurfaceFingerprint,
  verifyApiSurface,
  generateMigrationGuide,
  pluginApiVersionSchema,
} from "./plugins/pluginApiVersion.js";
export type {
  SemVer,
  CompatibilityResult,
  DeprecationWarning,
  ApiChangelogEntry,
  MigrationGuide,
} from "./plugins/pluginApiVersion.js";
