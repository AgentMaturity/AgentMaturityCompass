export { quickstartWizard, initWorkspace, runDoctor } from "./workspace.js";
export { runDoctorCli } from "./doctor/doctorCli.js";

export { openLedger, verifyLedgerIntegrity } from "./ledger/ledger.js";
export { wrapRuntime, wrapAny, superviseProcess, startMonitor } from "./ledger/monitor.js";

export {
  initGatewayConfig,
  loadGatewayConfig,
  resolveGatewayConfigEnv,
  signGatewayConfig,
  verifyGatewayConfigSignature,
  routeBaseUrls
} from "./gateway/config.js";
export { startGateway, gatewayStatus } from "./gateway/server.js";

export {
  initFleet,
  loadFleetConfig,
  verifyFleetConfigSignature,
  addAgentInteractive,
  listAgents,
  removeAgent,
  useAgent,
  loadAgentConfig,
  verifyAgentConfigSignature,
  scaffoldAgent,
  updateAgentProvider
} from "./fleet/registry.js";
export { getAgentPaths, resolveAgentId, setCurrentAgent, getCurrentAgent } from "./fleet/paths.js";
export { generateFleetReport } from "./fleet/report.js";
export {
  initTrustComposition,
  loadTrustCompositionConfig,
  saveTrustCompositionConfig,
  addDelegationEdge,
  removeDelegationEdge,
  listDelegationEdges,
  detectCycles,
  computeTrustComposition,
  saveTrustCompositionReport,
  renderTrustCompositionMarkdown,
  verifyCrossAgentReceipts
} from "./fleet/trustComposition.js";
// Orchestration DAG
export {
  createDag,
  appendDagNode,
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
} from "./fleet/trustInheritance.js";
export type {
  TrustInheritancePolicyMode,
  TrustInheritancePolicy,
  AgentTrustInput,
  InheritedTrustResult,
} from "./fleet/trustInheritance.js";

// Handoff Packets
export {
  createHandoffPacket,
  loadHandoffPacket,
  listHandoffPackets,
  verifyHandoffPacket,
  renderHandoffPacketMarkdown,
} from "./fleet/handoffPacket.js";
export type {
  HandoffPacket,
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
export { ingestEvidence, attestIngestSession } from "./ingest/ingest.js";
export {
  importEvalResults,
  parseEvalImport,
  parseOpenAIEvalResults,
  parseLangSmithEvalResults,
  parseDeepEvalResults,
  parsePromptfooEvalResults,
  type EvalImportFormat,
  type EvalImportCase,
  type ParsedEvalImport,
  type EvalImportResult
} from "./eval/evalImporters.js";
export { evalImportCli, parseEvalImportFormat, parseEvalImportTrustTier } from "./eval/evalCli.js";
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
  defaultGatePolicy,
  parseGatePolicy,
  writeSignedGatePolicy,
  verifyGatePolicySignature,
  evaluateGatePolicy,
  initCiForAgent,
  printCiSteps,
  runBundleGate
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
  revokeCertificate,
  verifyRevocation
} from "./assurance/certificate.js";
export {
  computeFailureRiskIndices,
  renderFailureRiskMarkdown,
  runIndicesForAgent,
  runFleetIndices
} from "./assurance/indices.js";

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
export { runAutoAnswer } from "./diagnostic/autoAnswer/autoAnswerEngine.js";

export { generateTuningPack, generateUpgradePlan } from "./tuning/upgradeEngine.js";
export { runTuneWizard, runUpgradeWizard } from "./tuning/tuneWizard.js";

export { guardCheck } from "./guardrails/guardEngine.js";
export { buildDashboard } from "./dashboard/build.js";
export { serveDashboard } from "./dashboard/serve.js";
export { learnQuestion, assignOwnership, createCommitmentPlan } from "./eoc/flows.js";

export { questionBank, questionIds } from "./diagnostic/questionBank.js";

export {
  wrapFetch,
  logTrace,
  buildTrace,
  stableTraceString,
  validateTruthProtocol,
  truthProtocolTemplate,
  extractApprovalToken,
  hasValidApprovalToken,
  withApprovalTrace
} from "./runtime/index.js";

export { parseTraceLine, parseTraceLines } from "./correlation/traceSchema.js";
export { correlateTracesAgainstEvidence } from "./correlation/correlate.js";
export { getMode, setMode, assertOwnerMode } from "./mode/mode.js";
export { createUnifiedClaritySnapshot } from "./snapshot/snapshot.js";
export { initLoop, loopPlan, loopRun, loopSchedule } from "./loop/loop.js";
export { buildConnectInstructions } from "./studio/connectWizard.js";
export {
  adaptersInitCli,
  adaptersVerifyCli,
  adaptersListCli,
  adaptersDetectCli,
  adaptersConfigureCli,
  adaptersRunCli,
  adaptersEnvCli,
  adaptersInitProjectCli
} from "./adapters/adapterCli.js";
export { runAdapterCommand, initAdapterProjectSample } from "./adapters/adapterRunner.js";
export { listBuiltInAdapters, getBuiltInAdapter } from "./adapters/registry.js";
export { loadAdaptersConfig, verifyAdaptersConfigSignature } from "./adapters/adapterConfigStore.js";
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
export { inspectSignatures, fixSignatures } from "./studio/signatures.js";
export { startStudioApiServer } from "./studio/studioServer.js";
export { runStudioForeground, startStudioDaemon, stopStudioDaemon, studioStatus } from "./studio/studioSupervisor.js";
export { createVault, unlockVault, lockVault, vaultStatus, ensureVaultAndPublicKeys, rotateMonitorKeyInVault } from "./vault/vault.js";
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
  notaryLogVerifyCli
} from "./notary/notaryCli.js";
export { startNotaryServer } from "./notary/notaryServer.js";
export { loadNotaryConfig, initNotaryConfig, saveNotaryConfig, defaultNotaryConfig } from "./notary/notaryConfigStore.js";
export { checkNotaryTrust, initTrustConfig, verifyTrustConfigSignature, enableNotaryTrust, loadTrustConfig } from "./trust/trustConfig.js";
export { issueLeaseToken } from "./leases/leaseSigner.js";
export { verifyLeaseToken } from "./leases/leaseVerifier.js";
export { loadLeaseRevocations, revokeLease, verifyLeaseRevocationsSignature } from "./leases/leaseStore.js";
export { initBudgets, verifyBudgetsConfigSignature, evaluateBudgetStatus, resetBudgetDay } from "./budgets/budgets.js";
export { driftCheckCli, driftReportCli, freezeStatusCli, freezeLiftCli } from "./drift/driftCli.js";
export { initAlertsConfig, verifyAlertsConfigSignature, sendTestAlert } from "./drift/alerts.js";
export { generateBom } from "./bom/bomGenerator.js";
export { signBomFile, verifyBomSignature } from "./bom/bomVerifier.js";
export {
  createApprovalForIntent,
  decideApprovalForIntent,
  verifyApprovalForExecution,
  approvalStatusPayload
} from "./approvals/approvalEngine.js";
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
export { exportBenchmarkArtifact } from "./benchmarks/benchExport.js";
export { verifyBenchmarkArtifact } from "./benchmarks/benchVerify.js";
export { ingestBenchmarks } from "./benchmarks/benchImport.js";
export { listImportedBenchmarks } from "./benchmarks/benchStore.js";
export { benchmarkStats } from "./benchmarks/benchStats.js";
export {
  benchInitCli,
  benchVerifyPolicyCli,
  benchPrintPolicyCli,
  benchCreateCli,
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
  benchCompareCli,
  benchComparisonLatestCli,
  benchRegistriesCli,
  benchRegistriesApplyCli,
  benchPublishRequestCli,
  benchPublishExecuteCli
} from "./bench/benchCli.js";
export { createBenchArtifact, inspectBenchArtifact, listExportedBenchArtifacts } from "./bench/benchArtifact.js";
export { verifyBenchArtifactFile } from "./bench/benchVerifier.js";
export { initBenchRegistry, verifyBenchRegistry, publishBenchToRegistry, serveBenchRegistry } from "./bench/benchRegistryServer.js";
export { browseBenchRegistry, importBenchFromRegistry, listImportedBenchArtifacts } from "./bench/benchRegistryClient.js";
export { createBenchComparison } from "./bench/benchComparer.js";
export {
  benchInitForApi,
  benchPolicyForApi,
  benchPolicyApplyForApi,
  benchCreateForApi,
  benchExportsForApi,
  benchImportsForApi,
  benchRegistriesForApi,
  benchRegistryApplyForApi,
  benchRegistryBrowseForApi,
  benchImportForApi,
  benchCompareForApi,
  benchComparisonLatestForApi,
  benchPublishRequestForApi,
  benchPublishExecuteForApi
} from "./bench/benchApi.js";
export { serveConsolePath } from "./console/consoleServer.js";
export * from "./sdk/index.js";
export {
  initOutcomeContract,
  loadOutcomeContract,
  signOutcomeContract,
  verifyOutcomeContractSignature,
  upsertOutcomeContract
} from "./outcomes/outcomeContractEngine.js";
export {
  runOutcomeReport,
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
  initCasebook,
  addCaseToCasebook,
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
  initComplianceMaps,
  loadComplianceMaps,
  verifyComplianceMapsSignature,
  generateComplianceReport
} from "./compliance/complianceEngine.js";
export {
  initComplianceMapsCli,
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
  integrationsVerifyCli,
  integrationsStatusCli,
  integrationsTestCli,
  integrationsDispatchCli
} from "./integrations/integrationsCli.js";
export { dispatchIntegrationEvent, dispatchIntegrationTest } from "./integrations/integrationDispatcher.js";
export { verifyOpsReceipt, verifyOpsReceiptForEvent } from "./integrations/opsReceipt.js";
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
  initOrgConfig,
  loadOrgConfig,
  saveOrgConfig,
  verifyOrgConfigSignature,
  addOrgNode,
  assignAgentToNode,
  unassignAgentFromNode
} from "./org/orgStore.js";
export {
  computeOrgScorecard,
  recomputeAndPersistOrgScorecard,
  nodeHierarchy,
  summarizeNodeForUi,
  scorecardNodeComparison
} from "./org/orgEngine.js";
export {
  writeOrgScorecard,
  loadLatestOrgScorecard,
  verifyLatestOrgScorecardSignature,
  compareNodeScorecards
} from "./org/orgScorecard.js";
export { OrgSseHub } from "./org/orgSse.js";
export {
  orgInitCli,
  orgVerifyCli,
  orgAddNodeCli,
  orgAssignCli,
  orgUnassignCli,
  orgScoreCli,
  orgReportCli,
  orgCompareCli,
  orgLearnCli,
  orgOwnCli,
  orgCommitCli
} from "./org/orgCli.js";
export {
  initTransformMap,
  loadTransformMap,
  saveTransformMap,
  verifyTransformMap,
  createTransformPlan
} from "./transformation/transformPlanner.js";
export {
  loadLatestTransformPlan,
  writeSignedTransformPlan,
  writeSignedTransformSnapshot,
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
export {
  forecastInitCli,
  forecastVerifyCli,
  forecastPrintPolicyCli,
  forecastRefreshCli,
  forecastLatestCli,
  advisoryListCli,
  advisoryShowCli,
  advisoryAckCli,
  forecastSchedulerStatusCli,
  forecastSchedulerRunNowCli,
  forecastSchedulerEnableCli,
  forecastSchedulerDisableCli,
  forecastPolicyApplyCli
} from "./forecast/forecastCli.js";
export { renderForecastMarkdown } from "./forecast/forecastReports.js";
export {
  getForecastLatestForApi,
  refreshForecastForApi,
  listAdvisoriesForApi,
  ackAdvisoryForApi,
  getForecastPolicyForApi,
  applyForecastPolicyForApi
} from "./forecast/forecastApi.js";
export { verifyForecastPolicy, verifyLatestForecast } from "./forecast/forecastVerifier.js";
export { runTransformTracker } from "./transformation/transformTracker.js";
export {
  writeTransformAttestation,
  verifyTransformAttestation,
  listTransformAttestations,
  findLatestAttestationForTask
} from "./transformation/transformAttestations.js";
export { renderTransformReportMarkdown, compactTransformStatus } from "./transformation/transformReports.js";
export {
  transformInitCli,
  transformVerifyCli,
  transformMapReadCli,
  transformMapApplyCli,
  transformPlanCli,
  transformStatusCli,
  transformTrackCli,
  transformReportCli,
  transformAttestCli,
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
  promptInitCli,
  promptVerifyCli,
  promptPolicyPrintCli,
  promptPolicyApplyCli,
  promptStatusCli,
  promptPackBuildCli,
  promptPackVerifyCli,
  promptPackShowCli,
  promptPackDiffCli,
  promptSchedulerStatusCli,
  promptSchedulerRunNowCli,
  promptSchedulerEnableCli,
  promptSchedulerDisableCli
} from "./prompt/promptPackCli.js";
export {
  promptInitForApi,
  promptVerifyForApi,
  promptPolicyForApi,
  promptPolicyApplyForApi,
  buildPromptPackForApi,
  promptStatusForApi,
  promptShowForApi,
  promptDiffForApi,
  promptSchedulerStatusForApi,
  promptSchedulerRunNowForApi,
  promptSchedulerSetEnabledForApi,
  promptSchedulerTick,
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
  createRollbackPack,
  getRollbackPacks,
  getLatestRollbackPack,
  activateEmergencyOverride,
  getActiveOverrides,
  filePostmortem,
  getOverridesMissingPostmortem,
  registerPolicyDebt,
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
  createResidencyPolicy,
  getResidencyPolicies,
  getResidencyPolicy,
  getPolicyForRegion,
  registerTenant,
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
  createLabExperiment,
  getLabExperiment,
  listLabExperiments,
  startLabExperiment,
  recordLabProbeResult,
  completeLabExperiment,
  cancelLabExperiment,
  simulateExperiment,
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
  submitFPReport,
  resolveFPReport,
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
export * from "./product/index.js";

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

// ── NL Policy authoring (2026-02-21) ─────────────────────────────────
export { parseNLPolicy, validateParsedPolicy, POLICY_TEMPLATES } from "./governor/nlPolicy.js";
export type { NLPolicyInput, ParsedPolicy, PolicyRule, PolicyValidationResult } from "./governor/nlPolicy.js";
