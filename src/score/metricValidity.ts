import type {
  DiagnosticConfidenceSummary,
  DiagnosticReport,
  LayerName,
  LayerScore,
  MetricValidationCiGate,
  MetricValidationConfidenceInterval,
  MetricValidationContinualLearningSignal,
  MetricValidationEvalPackManifest,
  MetricValidationEvalPackRow,
  MetricValidationPentestBenchmarkSignal,
  MetricValidationReport,
  MetricValidationRow,
  MetricValidationArchitectureRealitySignal,
  MetricValidationEmbodiedAgentSignal,
  MetricValidationEvaluatorSuiteSignal,
  MetricValidationLivingEnvironmentSignal,
  MetricValidationPersonaAgentSignal,
  MetricValidationMobileAgentSignal,
  MetricValidationScientificLiteratureSignal,
  MetricValidationBioinformaticsAgentSignal,
  MetricValidationMirageDrugRepositioningSignal,
  MetricValidationTraceEvaluationSignal,
  MetricValidationMirageRagSignal,
  MetricValidationLegalCodeRagSignal,
  MetricValidationNetworkTroubleshootingSignal,
  MetricValidationInferenceOptimizationSignal,
  MetricValidationJavaCodingAgentSignal,
  MetricValidationParallelResearchSkillSignal,
  MetricValidationResumeRagEvaluatorSignal,
  MetricValidationChipBenchmarkSignal,
  MetricValidationHermesBenchSignal,
  MetricValidationCooperBenchSignal,
  MetricValidationCoderCupSignal,
  MetricValidationAgenticGraphRagSignal,
  MetricValidationWebEvalDatasetSignal,
  MetricValidationAgentScenarioTestSignal,
  MetricValidationOpenCodeLabSignal,
  MetricValidationCcPluginEvalComponentType,
  MetricValidationCcPluginEvalDetectionMode,
  MetricValidationCcPluginEvalScenarioType,
  MetricValidationCcPluginEvalSignal,
  MetricValidationRealignSimulationSignal,
  MetricValidationAcademiClawSignal,
  MetricValidationRagChunkingTechniqueSignal,
  MetricValidationKubernetesOperationalAgentSignal,
  MetricValidationSecureVibeBenchSignal,
  MetricValidationRavigBenchSignal,
  MetricValidationHumanStudyBenchSignal,
  MetricValidationLegacyBenchSignal,
  MetricValidationSubtleMemorySignal,
  MetricValidationGuardbenchSignal,
  MetricValidationRagEvaluationPipelineSignal,
  MetricValidationRagasNotebookSignal,
  QuestionScoreSignedEvidenceRef,
  QuestionScore,
  TrustLabel
} from "../types.js";
import { computeScoreStability, type ScoreObservation } from "./predictiveValidity.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export interface MetricValidationQuestionRef {
  id: string;
  layerName: LayerName;
}

export const LUNARY_OBSERVABILITY_METRIC_VALIDITY_SOURCE_REF = "web:https://lunary.ai";

export const LUNARY_OBSERVABILITY_METRIC_VALIDITY_REQUIREMENTS = [
  "live source relevance receipt",
  "AMC-owned eval-pack manifest",
  "validation table artifact",
  "trace/session export manifest",
  "prompt template or model-registry snapshot when claimed",
  "evaluator or score-LLM-response config",
  "feedback or annotation export when claimed",
  "production monitoring or alert-policy manifest when Watch is claimed",
  "Score/Shield/Watch surface mapping",
  "fail-closed threshold policy",
  "metric owner",
  "sample size",
  "confidence interval",
  "signed evidence refs",
  "artifact hashes",
  "row hashes",
  "no-copy/source-review boundary proof"
] as const;

export function lunaryObservabilityMetricValidityRequirements(): string[] {
  return [...LUNARY_OBSERVABILITY_METRIC_VALIDITY_REQUIREMENTS];
}

export const GOOGLE_ADK_EVAL_METRIC_VALIDITY_SOURCE_REF = "github:google/adk-python";

export const GOOGLE_ADK_EVAL_METRIC_VALIDITY_REQUIREMENTS = [
  "live GitHub metadata relevance review",
  "AMC-owned eval-pack manifest",
  "validation table artifact",
  "evaluator-suite proof using existing primitives",
  "trace-evaluation proof when traces or Watch are claimed",
  "fail-closed threshold policy",
  "Score/Shield/Watch surface mapping",
  "metric owner",
  "sample size",
  "confidence interval",
  "signed evidence refs",
  "artifact hashes",
  "row hashes",
  "no-copy/source-review boundary proof"
] as const;

export function googleAdkEvalMetricValidityRequirements(): string[] {
  return [...GOOGLE_ADK_EVAL_METRIC_VALIDITY_REQUIREMENTS];
}

export const DIGITAL_MATERIALS_ECOSYSTEM_METRIC_VALIDITY_SOURCE_REF = "doi:10.1039/d5sc09229a; openalex:W7131071926";

export const DIGITAL_MATERIALS_ECOSYSTEM_METRIC_VALIDITY_REQUIREMENTS = [
  "verified DOI metadata receipt",
  "verified OpenAlex metadata receipt",
  "metadata-only source-review proof",
  "AMC-owned eval-pack manifest",
  "validation table artifact",
  "existing metric-validation primitive mapping",
  "trace or evaluator proof when claimed",
  "Score/Shield/Watch surface mapping",
  "fail-closed threshold policy",
  "metric owner",
  "sample size",
  "confidence interval",
  "signed evidence refs",
  "artifact hashes",
  "row hashes",
  "no-copy/source-review boundary proof"
] as const;

export function digitalMaterialsEcosystemMetricValidityRequirements(): string[] {
  return [...DIGITAL_MATERIALS_ECOSYSTEM_METRIC_VALIDITY_REQUIREMENTS];
}

export interface BuildMetricValidationInput {
  agentId: string;
  runId: string;
  ts: number;
  trustLabel: TrustLabel;
  integrityIndex: number;
  evidenceCoverage: number;
  correlationRatio: number;
  unsupportedClaimCount: number;
  layerScores: LayerScore[];
  questionScores: QuestionScore[];
  confidenceSummary?: DiagnosticConfidenceSummary;
  questions?: MetricValidationQuestionRef[];
  signedEvidenceRefs?: QuestionScoreSignedEvidenceRef[];
  counterfactualChecks?: MetricValidationCounterfactualCheck[];
  validationFacetChecks?: MetricValidationFacetCheck[];
  confounderControlChecks?: MetricValidationConfounderControlCheck[];
  outcomeAlignmentChecks?: MetricValidationOutcomeAlignmentCheck[];
  processEvidenceChecks?: MetricValidationProcessEvidenceCheck[];
  safetyUtilityChecks?: MetricValidationSafetyUtilityCheck[];
  modalityTransformationChecks?: MetricValidationModalityTransformationCheck[];
  lifecycleObservabilityChecks?: MetricValidationLifecycleObservabilityCheck[];
  rankingStabilityChecks?: MetricValidationRankingStabilityCheck[];
  toolSandboxChecks?: MetricValidationToolSandboxCheck[];
  continualLearningChecks?: MetricValidationContinualLearningCheck[];
  strategicInteractionChecks?: MetricValidationStrategicInteractionCheck[];
  architectureRealityChecks?: MetricValidationArchitectureRealityCheck[];
  requireArchitectureRealityProof?: boolean;
  ragPipelineChecks?: MetricValidationRagPipelineCheck[];
  requireRagEvaluationPipelineProof?: boolean;
  requireRagasNotebookProof?: boolean;
  requireMirageRagMetricProof?: boolean;
  requireLegalCodeRagProof?: boolean;
  guardbenchChecks?: MetricValidationGuardbenchCheck[];
  requireGuardbenchMetricProof?: boolean;
  businessWorkflowChecks?: MetricValidationBusinessWorkflowCheck[];
  dataAgentAnalyticalChecks?: MetricValidationDataAgentAnalyticalCheck[];
  embodiedAgentChecks?: MetricValidationEmbodiedAgentCheck[];
  evaluatorSuiteChecks?: MetricValidationEvaluatorSuiteCheck[];
  requireEvaluatorSuiteProof?: boolean;
  pentestBenchmarkChecks?: MetricValidationPentestBenchmarkCheck[];
  requirePentestBenchmarkProof?: boolean;
  traceEvaluationChecks?: MetricValidationTraceEvaluationCheck[];
  requireTraceEvaluationProof?: boolean;
  livingEnvironmentChecks?: MetricValidationLivingEnvironmentCheck[];
  requireLivingEnvironmentProof?: boolean;
  mobileAgentChecks?: MetricValidationMobileAgentCheck[];
  requireMobileAgentProof?: boolean;
  personaAgentChecks?: MetricValidationPersonaAgentCheck[];
  requirePersonaAgentProof?: boolean;
  scientificLiteratureChecks?: MetricValidationScientificLiteratureCheck[];
  requireScientificLiteratureProof?: boolean;
  bioinformaticsAgentChecks?: MetricValidationBioinformaticsAgentCheck[];
  requireBioinformaticsAgentProof?: boolean;
  mirageDrugRepositioningChecks?: MetricValidationMirageDrugRepositioningCheck[];
  requireMirageDrugRepositioningProof?: boolean;
  networkTroubleshootingChecks?: MetricValidationNetworkTroubleshootingCheck[];
  requireNetworkTroubleshootingProof?: boolean;
  inferenceOptimizationChecks?: MetricValidationInferenceOptimizationCheck[];
  requireInferenceOptimizationProof?: boolean;
  javaCodingAgentChecks?: MetricValidationJavaCodingAgentCheck[];
  requireJavaCodingAgentProof?: boolean;
  webEvalDatasetChecks?: MetricValidationWebEvalDatasetCheck[];
  requireWebEvalDatasetProof?: boolean;
  parallelResearchSkillChecks?: MetricValidationParallelResearchSkillCheck[];
  requireParallelResearchSkillProof?: boolean;
  resumeRagEvaluatorChecks?: MetricValidationResumeRagEvaluatorCheck[];
  requireResumeRagEvaluatorProof?: boolean;
  chipBenchmarkChecks?: MetricValidationChipBenchmarkCheck[];
  requireChipBenchmarkProof?: boolean;
  hermesBenchChecks?: MetricValidationHermesBenchCheck[];
  requireHermesBenchProof?: boolean;
  cooperBenchChecks?: MetricValidationCooperBenchCheck[];
  requireCooperBenchProof?: boolean;
  coderCupChecks?: MetricValidationCoderCupCheck[];
  requireCoderCupProof?: boolean;
  agenticGraphRagChecks?: MetricValidationAgenticGraphRagCheck[];
  requireAgenticGraphRagProof?: boolean;
  agentScenarioTestChecks?: MetricValidationAgentScenarioTestCheck[];
  requireAgentScenarioTestProof?: boolean;
  openCodeLabChecks?: MetricValidationOpenCodeLabCheck[];
  requireOpenCodeLabProof?: boolean;
  ccPluginEvalChecks?: MetricValidationCcPluginEvalCheck[];
  requireCcPluginEvalProof?: boolean;
  realignSimulationChecks?: MetricValidationRealignSimulationCheck[];
  requireRealignSimulationProof?: boolean;
  academiClawChecks?: MetricValidationAcademiClawCheck[];
  requireAcademiClawProof?: boolean;
  ragChunkingTechniqueChecks?: MetricValidationRagChunkingTechniqueCheck[];
  requireRagChunkingTechniqueProof?: boolean;
  kubernetesOperationalAgentChecks?: MetricValidationKubernetesOperationalAgentCheck[];
  requireKubernetesOperationalAgentProof?: boolean;
  secureVibeBenchChecks?: MetricValidationSecureVibeBenchCheck[];
  requireSecureVibeBenchProof?: boolean;
  ravigBenchChecks?: MetricValidationRavigBenchCheck[];
  requireRavigBenchProof?: boolean;
  humanStudyBenchChecks?: MetricValidationHumanStudyBenchCheck[];
  requireHumanStudyBenchProof?: boolean;
  legacyBenchChecks?: MetricValidationLegacyBenchCheck[];
  requireLegacyBenchProof?: boolean;
  subtleMemoryChecks?: MetricValidationSubtleMemoryCheck[];
  requireSubtleMemoryProof?: boolean;
  sourceRefs?: string[];
  datasetHash?: string;
  gateMode?: "ci" | "lifecycle";
}

export interface MetricValidationCounterfactualCheck {
  metricId?: string;
  interventionId: string;
  passed: boolean;
  evidenceRefs: string[];
}

export interface MetricValidationFacetCheck {
  metricId?: string;
  facetId: string;
  covered: boolean;
  evidenceRefs: string[];
}

export interface MetricValidationConfounderControlCheck {
  metricId?: string;
  confounderId: string;
  controlled: boolean;
  evidenceRefs: string[];
}

export interface MetricValidationOutcomeAlignmentCheck {
  metricId?: string;
  outcomeId: string;
  aligned: boolean;
  evidenceRefs: string[];
}

export interface MetricValidationProcessEvidenceCheck {
  metricId?: string;
  processEvidenceId: string;
  covered: boolean;
  evidenceRefs: string[];
}

export interface MetricValidationSafetyUtilityCheck {
  metricId?: string;
  safetyUtilityId: string;
  covered: boolean;
  evidenceRefs: string[];
}

export interface MetricValidationModalityTransformationCheck {
  metricId?: string;
  transformationId: string;
  covered: boolean;
  evidenceRefs: string[];
}

export interface MetricValidationLifecycleObservabilityCheck {
  metricId?: string;
  lifecycleSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
}

export interface MetricValidationRankingStabilityCheck {
  metricId?: string;
  rankingSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
}

export interface MetricValidationToolSandboxCheck {
  metricId?: string;
  sandboxSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
}

export interface MetricValidationContinualLearningCheck {
  metricId?: string;
  continualSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  continualSignalType?: MetricValidationContinualLearningSignal;
  artifactHash?: string;
  memoryArtifactHash?: string;
  runSummaryArtifactHash?: string;
  gameplayLogArtifactHash?: string;
  runCount?: number;
  metricNames?: string[];
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationStrategicInteractionCheck {
  metricId?: string;
  strategicSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
}

export interface MetricValidationArchitectureRealityCheck {
  metricId?: string;
  architectureSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  architectureSignalType?: MetricValidationArchitectureRealitySignal;
  artifactHash?: string;
  scenarioCount?: number;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
  metricNames?: string[];
}

export interface MetricValidationRagPipelineCheck {
  metricId?: string;
  ragSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  evaluationSignalType?: MetricValidationRagEvaluationPipelineSignal;
  mirageSignalType?: MetricValidationMirageRagSignal;
  legalCodeRagSignalType?: MetricValidationLegalCodeRagSignal;
  ragasNotebookSignalType?: MetricValidationRagasNotebookSignal;
  artifactHash?: string;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
  metricNames?: string[];
  datasetIds?: string[];
  retrieverIds?: string[];
  modelIds?: string[];
  repositoryRefs?: string[];
  licenseBoundaryRefs?: string[];
  notebookIds?: string[];
  dependencyIds?: string[];
  documentCorpusIds?: string[];
  chunkingConfigIds?: string[];
  testsetGeneratorIds?: string[];
  evolutionTypes?: Array<"simple" | "reasoning" | "multi_context" | "custom">;
  testsetIds?: string[];
  ragChainIds?: string[];
  legalCodeIds?: string[];
  jurisdictionIds?: string[];
  retrievalTechniqueIds?: string[];
  vectorStoreIds?: string[];
  embeddingModelIds?: string[];
  answerContextTraceIds?: string[];
  langfuseTraceIds?: string[];
  visualizationIds?: string[];
  evaluationDatasetIds?: string[];
  legalQuestionCount?: number;
  ragasQuestionCount?: number;
  evaluationModes?: Array<"base" | "oracle" | "mixed" | "custom">;
  qaPairCount?: number;
  contextPoolCount?: number;
}

export interface MetricValidationGuardbenchCheck {
  metricId?: string;
  guardbenchSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  guardbenchSignalType?: MetricValidationGuardbenchSignal;
  artifactHash?: string;
  datasetIds?: string[];
  languageIds?: string[];
  modelIds?: string[];
  thresholdIds?: string[];
  metricNames?: string[];
  exportFormats?: string[];
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationBusinessWorkflowCheck {
  metricId?: string;
  workflowSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
}

export interface MetricValidationDataAgentAnalyticalCheck {
  metricId?: string;
  dataAgentSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
}

export interface MetricValidationEmbodiedAgentCheck {
  metricId?: string;
  embodiedSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  embodiedSignalType?: MetricValidationEmbodiedAgentSignal;
  artifactHash?: string;
  taskTypes?: string[];
  baselineIds?: string[];
  metricNames?: string[];
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationEvaluatorSuiteCheck {
  metricId?: string;
  evaluatorSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  evaluatorSignalType?: MetricValidationEvaluatorSuiteSignal;
  artifactHash?: string;
  assertionTypes?: string[];
  reporterFormats?: string[];
  judgeNames?: string[];
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationPentestBenchmarkCheck {
  metricId?: string;
  pentestSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  pentestSignalType?: MetricValidationPentestBenchmarkSignal;
  artifactHash?: string;
  languageStacks?: string[];
  vulnerabilityClasses?: string[];
  difficultyLevels?: string[];
  benchmarkSuiteIds?: string[];
  metricNames?: string[];
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationTraceEvaluationCheck {
  metricId?: string;
  traceEvaluationSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  traceEvaluationSignalType?: MetricValidationTraceEvaluationSignal;
  artifactHash?: string;
  modelIds?: string[];
  agentParameterKeys?: string[];
  toolNames?: string[];
  metricNames?: string[];
  caseSuiteIds?: string[];
  backendModes?: string[];
  runPermutationCount?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationLivingEnvironmentCheck {
  metricId?: string;
  livingEnvironmentSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  livingEnvironmentSignalType?: MetricValidationLivingEnvironmentSignal;
  artifactHash?: string;
  capabilityNames?: string[];
  sandboxProviders?: string[];
  agentAdapters?: string[];
  metricNames?: string[];
  trialCount?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationMobileAgentCheck {
  metricId?: string;
  mobileAgentSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  mobileAgentSignalType?: MetricValidationMobileAgentSignal;
  artifactHash?: string;
  benchmarkIds?: string[];
  environmentIds?: string[];
  appIds?: string[];
  apiCatalogIds?: string[];
  uiTraceIds?: string[];
  taskSetIds?: string[];
  taskComplexityGroups?: string[];
  metricNames?: string[];
  licenseBoundaryRefs?: string[];
  trialCount?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationPersonaAgentCheck {
  metricId?: string;
  personaSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  personaSignalType?: MetricValidationPersonaAgentSignal;
  artifactHash?: string;
  personaIds?: string[];
  environmentIds?: string[];
  questionSetIds?: string[];
  modelIds?: string[];
  providerIds?: string[];
  metricNames?: string[];
  questionCount?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationScientificLiteratureCheck {
  metricId?: string;
  scientificLiteratureSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  scientificLiteratureSignalType?: MetricValidationScientificLiteratureSignal;
  artifactHash?: string;
  benchmarkIds?: string[];
  taskTypes?: string[];
  datasetIds?: string[];
  searchBackendIds?: string[];
  toolIds?: string[];
  metricNames?: string[];
  taskCount?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationBioinformaticsAgentCheck {
  metricId?: string;
  bioinformaticsAgentSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  bioinformaticsAgentSignalType?: MetricValidationBioinformaticsAgentSignal;
  artifactHash?: string;
  benchmarkIds?: string[];
  taskTypes?: string[];
  datasetIds?: string[];
  workflowIds?: string[];
  toolNames?: string[];
  metricNames?: string[];
  perturbationIds?: string[];
  privacyBoundaryRefs?: string[];
  taskCount?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationMirageDrugRepositioningCheck {
  metricId?: string;
  mirageDrugRepositioningSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  mirageDrugRepositioningSignalType?: MetricValidationMirageDrugRepositioningSignal;
  artifactHash?: string;
  benchmarkIds?: string[];
  datasetIds?: string[];
  splitIds?: string[];
  mappingIds?: string[];
  featureSetIds?: string[];
  similarityMatrixIds?: string[];
  negativeSamplingIds?: string[];
  classifierConfigIds?: string[];
  featureSelectionReportIds?: string[];
  scoreCalculationIds?: string[];
  caseStudyIds?: string[];
  metricNames?: string[];
  drugCount?: number;
  diseaseCount?: number;
  mappingCount?: number;
  featureSetCount?: number;
  similarityMatrixCount?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationNetworkTroubleshootingCheck {
  metricId?: string;
  networkTroubleshootingSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  networkTroubleshootingSignalType?: MetricValidationNetworkTroubleshootingSignal;
  artifactHash?: string;
  benchmarkIds?: string[];
  scenarioIds?: string[];
  topologyTiers?: string[];
  issueTypes?: string[];
  agentIds?: string[];
  toolNames?: string[];
  metricNames?: string[];
  incidentCount?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationInferenceOptimizationCheck {
  metricId?: string;
  inferenceOptimizationSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  inferenceOptimizationSignalType?: MetricValidationInferenceOptimizationSignal;
  artifactHash?: string;
  benchmarkIds?: string[];
  scenarioIds?: string[];
  hardwareProfileIds?: string[];
  backendIds?: string[];
  searchSpaceIds?: string[];
  gateIds?: string[];
  agentIds?: string[];
  metricNames?: string[];
  runCount?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationJavaCodingAgentCheck {
  metricId?: string;
  javaCodingAgentSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  javaCodingAgentSignalType?: MetricValidationJavaCodingAgentSignal;
  artifactHash?: string;
  benchmarkIds?: string[];
  taskIds?: string[];
  taskTypes?: string[];
  javaProjectIds?: string[];
  sandboxIds?: string[];
  agentConfigIds?: string[];
  judgeTierIds?: string[];
  checkTypes?: string[];
  metricNames?: string[];
  trialCount?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationWebEvalDatasetCheck {
  metricId?: string;
  webEvalDatasetSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  webEvalDatasetSignalType?: MetricValidationWebEvalDatasetSignal;
  artifactHash?: string;
  benchmarkIds?: string[];
  repositoryRefs?: string[];
  subjectIds?: string[];
  querySetIds?: string[];
  searchProviderIds?: string[];
  documentSetIds?: string[];
  filterPolicyIds?: string[];
  qaGenerationIds?: string[];
  referenceAnswerSetIds?: string[];
  datasetExportIds?: string[];
  outputTargets?: Array<"local" | "langsmith" | "custom">;
  metricNames?: string[];
  questionCount?: number;
  documentCount?: number;
  providerDiversityCount?: number;
  datasetFreshnessHours?: number;
  maxFreshnessHours?: number;
  sourceCoverage?: number;
  answerGrounding?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationParallelResearchSkillCheck {
  metricId?: string;
  parallelResearchSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  parallelResearchSignalType?: MetricValidationParallelResearchSkillSignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  licenseRefs?: string[];
  skillManifestIds?: string[];
  apiSurfaceIds?: string[];
  searchModeIds?: string[];
  processorTiers?: string[];
  securityBoundaryRefs?: string[];
  dependencyLockIds?: string[];
  metricNames?: string[];
  citationCoverage0to1?: number;
  sourcePolicyCoverage0to1?: number;
  batchTaskLimit?: number;
  monitoringCoverage0to1?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationResumeRagEvaluatorCheck {
  metricId?: string;
  resumeRagSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  resumeRagSignalType?: MetricValidationResumeRagEvaluatorSignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  licenseRefs?: string[];
  resumeInputFormats?: string[];
  ragStrategyIds?: string[];
  queryExpansionIds?: string[];
  retrievalKMin?: number;
  retrievalKMax?: number;
  vectorStoreIds?: string[];
  ollamaModelIds?: string[];
  embeddingModelIds?: string[];
  evaluationEndpointIds?: string[];
  candidateRatingScale?: string;
  batchModeIds?: string[];
  privacyBoundaryRefs?: string[];
  dependencyLockIds?: string[];
  metricNames?: string[];
  parserCoverage0to1?: number;
  evaluationGrounding0to1?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationChipBenchmarkCheck {
  metricId?: string;
  chipBenchmarkSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  chipBenchmarkSignalType?: MetricValidationChipBenchmarkSignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  licenseRefs?: string[];
  benchmarkIds?: string[];
  hardwareProfileIds?: string[];
  modelFamilyIds?: string[];
  precisionModeIds?: string[];
  environmentIds?: string[];
  runnerScriptIds?: string[];
  servingBackendIds?: string[];
  datasetIds?: string[];
  frontendDatasetIds?: string[];
  pricingRefs?: string[];
  metricNames?: string[];
  regressionThresholdIds?: string[];
  resultRowCount?: number;
  throughputCoverage0to1?: number;
  latencyCoverage0to1?: number;
  costCoverage0to1?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationHermesBenchCheck {
  metricId?: string;
  hermesBenchSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  hermesBenchSignalType?: MetricValidationHermesBenchSignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  licenseRefs?: string[];
  branchRefs?: string[];
  commitRefs?: string[];
  treeRefs?: string[];
  readmeBlobRefs?: string[];
  buildSpecRefs?: string[];
  backendTreeRefs?: string[];
  frontendTreeRefs?: string[];
  runnerIds?: string[];
  judgeIds?: string[];
  taskRegistryIds?: string[];
  serverConfigIds?: string[];
  adapterIds?: string[];
  resultSchemaIds?: string[];
  frontendComponentIds?: string[];
  backendTestIds?: string[];
  frontendTestIds?: string[];
  dockerRuntimeIds?: string[];
  metricNames?: string[];
  taskCount?: number;
  adapterCount?: number;
  backendTestCount?: number;
  frontendTestCount?: number;
  judgeAgreement0to1?: number;
  regressionPassRate0to1?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationCooperBenchCheck {
  metricId?: string;
  cooperBenchSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  cooperBenchSignalType?: MetricValidationCooperBenchSignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  licenseRefs?: string[];
  releaseRefs?: string[];
  branchRefs?: string[];
  commitRefs?: string[];
  treeRefs?: string[];
  readmeBlobRefs?: string[];
  changelogRefs?: string[];
  datasetTreeRefs?: string[];
  datasetReadmeRefs?: string[];
  runnerIds?: string[];
  evalBackendIds?: string[];
  teamHarnessIds?: string[];
  agentAdapterIds?: string[];
  ciWorkflowIds?: string[];
  packageLockRefs?: string[];
  reportPublicationRefs?: string[];
  metricNames?: string[];
  taskCount?: number;
  featureCount?: number;
  agentAdapterCount?: number;
  testCount?: number;
  cooperationScore0to1?: number;
  conflictResolutionRate0to1?: number;
  regressionPassRate0to1?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationCoderCupCheck {
  metricId?: string;
  coderCupSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  coderCupSignalType?: MetricValidationCoderCupSignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  licenseRefs?: string[];
  homepageRefs?: string[];
  branchRefs?: string[];
  commitRefs?: string[];
  treeRefs?: string[];
  readmeBlobRefs?: string[];
  contributingRefs?: string[];
  ciWorkflowIds?: string[];
  packageManifestRefs?: string[];
  packageLockRefs?: string[];
  taskSpecRefs?: string[];
  testSuiteRefs?: string[];
  suiteIndexRefs?: string[];
  runnerIds?: string[];
  runnerContractRefs?: string[];
  scoreLedgerRefs?: string[];
  liveArtifactRefs?: string[];
  methodologyRefs?: string[];
  referenceRefs?: string[];
  costMethodologyRefs?: string[];
  publicFixtureRefs?: string[];
  metricNames?: string[];
  phaseCount?: number;
  testPlanCount?: number;
  runnerCount?: number;
  scoreLedgerCount?: number;
  liveSurfaceCount?: number;
  interRaterAgreement0to1?: number;
  testRetestReliability0to1?: number;
  regressionPassRate0to1?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationAgenticGraphRagCheck {
  metricId?: string;
  agenticGraphRagSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  agenticGraphRagSignalType?: MetricValidationAgenticGraphRagSignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  licenseRefs?: string[];
  branchRefs?: string[];
  commitRefs?: string[];
  treeRefs?: string[];
  readmeBlobRefs?: string[];
  graphWorkflowIds?: string[];
  orchestratorIds?: string[];
  ragPipelineIds?: string[];
  databaseIds?: string[];
  vectorStoreIds?: string[];
  evaluationIds?: string[];
  experimentTrackerIds?: string[];
  uiComponentIds?: string[];
  dependencyLockRefs?: string[];
  metricNames?: string[];
  graphNodeCount?: number;
  graphEdgeCount?: number;
  evaluationMetricCount?: number;
  experimentCount?: number;
  retrievalGroundingScore0to1?: number;
  regressionPassRate0to1?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationAgentScenarioTestCheck {
  metricId?: string;
  agentScenarioTestSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  agentScenarioTestSignalType?: MetricValidationAgentScenarioTestSignal;
  artifactHash?: string;
  benchmarkIds?: string[];
  repositoryRefs?: string[];
  licenseRefs?: string[];
  scenarioIds?: string[];
  personaIds?: string[];
  goalIds?: string[];
  knowledgeSetIds?: string[];
  toolMockIds?: string[];
  trajectoryAssertionIds?: string[];
  judgeIds?: string[];
  metricNames?: string[];
  reporterFormats?: Array<"json" | "github_actions" | "custom">;
  agentIds?: string[];
  comparisonIds?: string[];
  scenarioCount?: number;
  turnCount?: number;
  toolCallCount?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationOpenCodeLabCheck {
  metricId?: string;
  openCodeLabSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  openCodeLabSignalType?: MetricValidationOpenCodeLabSignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  benchmarkIds?: string[];
  agentContextIds?: string[];
  promptVariantIds?: string[];
  toolDescriptionIds?: string[];
  policyIds?: string[];
  runTraceIds?: string[];
  forkIds?: string[];
  modelIds?: string[];
  groundTruthIds?: string[];
  metricNames?: string[];
  reporterFormats?: Array<"json" | "github_actions" | "markdown" | "custom">;
  resultArtifactIds?: string[];
  runCount?: number;
  forkAgreement0to1?: number;
  minForkAgreement0to1?: number;
  modelVariance0to1?: number;
  maxModelVariance0to1?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationCcPluginEvalCheck {
  metricId?: string;
  ccPluginEvalSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  ccPluginEvalSignalType?: MetricValidationCcPluginEvalSignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  licenseRefs?: string[];
  pluginManifestIds?: string[];
  componentTypes?: MetricValidationCcPluginEvalComponentType[];
  triggerManifestIds?: string[];
  scenarioManifestIds?: string[];
  scenarioTypes?: MetricValidationCcPluginEvalScenarioType[];
  transcriptIds?: string[];
  detectionReportIds?: string[];
  detectionModes?: MetricValidationCcPluginEvalDetectionMode[];
  judgeIds?: string[];
  calibrationIds?: string[];
  conflictReportIds?: string[];
  checkpointStateIds?: string[];
  costEstimateIds?: string[];
  reporterFormats?: Array<"json" | "yaml" | "junit_xml" | "tap" | "github_actions" | "custom">;
  resultArtifactIds?: string[];
  metricNames?: string[];
  triggerAccuracy0to1?: number;
  falsePositiveRate0to1?: number;
  falseNegativeRate0to1?: number;
  componentCount?: number;
  scenarioCount?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationRealignSimulationCheck {
  metricId?: string;
  realignSimulationSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  realignSimulationSignalType?: MetricValidationRealignSimulationSignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  licenseRefs?: string[];
  configIds?: string[];
  appIds?: string[];
  datasetIds?: string[];
  scenarioIds?: string[];
  personaIds?: string[];
  evaluatorIds?: string[];
  targetIds?: string[];
  runTraceIds?: string[];
  repeatedRunTraceIds?: string[];
  judgeIds?: string[];
  calibrationIds?: string[];
  statisticsReportIds?: string[];
  ciReporterIds?: string[];
  reporterFormats?: Array<"json" | "junit_xml" | "github_actions" | "markdown" | "custom">;
  experimentIds?: string[];
  resultArtifactIds?: string[];
  metricNames?: string[];
  judgeAgreement0to1?: number;
  regressionPassRate0to1?: number;
  scenarioCount?: number;
  evaluatorCount?: number;
  repeatCount?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationAcademiClawCheck {
  metricId?: string;
  academiClawSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  academiClawSignalType?: MetricValidationAcademiClawSignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  licenseRefs?: string[];
  branchRefs?: string[];
  commitRefs?: string[];
  treeRefs?: string[];
  readmeBlobRefs?: string[];
  citationRefs?: string[];
  taskCorpusRefs?: string[];
  languageIds?: string[];
  workspaceQueryIds?: string[];
  dockerImageIds?: string[];
  rubricIds?: string[];
  evalTaskRunnerIds?: string[];
  resultManifestIds?: string[];
  conversationTraceIds?: string[];
  metaEvalIds?: string[];
  modelIds?: string[];
  metricNames?: string[];
  ciReporterIds?: string[];
  reporterFormats?: Array<"json" | "github_actions" | "markdown" | "custom">;
  taskCount?: number;
  languageCount?: number;
  rubricCount?: number;
  traceCount?: number;
  metaEvalCount?: number;
  modelCount?: number;
  regressionPassRate0to1?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationRagChunkingTechniqueCheck {
  metricId?: string;
  ragChunkingTechniqueSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  ragChunkingTechniqueSignalType?: MetricValidationRagChunkingTechniqueSignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  licenseRefs?: string[];
  branchRefs?: string[];
  commitRefs?: string[];
  treeRefs?: string[];
  readmeBlobRefs?: string[];
  policyCorpusRefs?: string[];
  notebookIds?: string[];
  chunkingStrategyIds?: string[];
  retrievalPipelineIds?: string[];
  embeddingVectorstoreIds?: string[];
  evaluationDatasetIds?: string[];
  metricNames?: string[];
  ciReporterIds?: string[];
  reporterFormats?: Array<"json" | "github_actions" | "markdown" | "custom">;
  policyDocumentCount?: number;
  notebookCount?: number;
  chunkingStrategyCount?: number;
  evaluationQuestionCount?: number;
  metricCount?: number;
  regressionPassRate0to1?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationKubernetesOperationalAgentCheck {
  metricId?: string;
  kubernetesOperationalAgentSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  kubernetesOperationalAgentSignalType?: MetricValidationKubernetesOperationalAgentSignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  licenseRefs?: string[];
  releaseRefs?: string[];
  branchRefs?: string[];
  commitRefs?: string[];
  treeRefs?: string[];
  readmeBlobRefs?: string[];
  buildWorkflowRefs?: string[];
  agentModuleRefs?: string[];
  mcpServerModuleRefs?: string[];
  toolModuleRefs?: string[];
  toolCategoryIds?: string[];
  diagnosticCapabilityIds?: string[];
  resourceMetricIds?: string[];
  logAnalysisIds?: string[];
  metricNames?: string[];
  ciReporterIds?: string[];
  reporterFormats?: Array<"json" | "github_actions" | "junit_xml" | "markdown" | "custom">;
  toolCategoryCount?: number;
  diagnosticCapabilityCount?: number;
  resourceMetricCount?: number;
  logAnalysisCount?: number;
  regressionPassRate0to1?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationSecureVibeBenchCheck {
  metricId?: string;
  secureVibeBenchSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  secureVibeBenchSignalType?: MetricValidationSecureVibeBenchSignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  licenseRefs?: string[];
  homepageRefs?: string[];
  arxivRefs?: string[];
  branchRefs?: string[];
  commitRefs?: string[];
  treeRefs?: string[];
  readmeBlobRefs?: string[];
  resultsBlobRefs?: string[];
  datasetRefs?: string[];
  formatExampleRefs?: string[];
  evaluationRunnerRefs?: string[];
  agentAdapterIds?: string[];
  vulnerabilityScenarioIds?: string[];
  testScriptIds?: string[];
  parserUtilityRefs?: string[];
  patchDiffUtilityRefs?: string[];
  metricNames?: string[];
  ciReporterIds?: string[];
  reporterFormats?: Array<"json" | "github_actions" | "markdown" | "custom">;
  agentAdapterCount?: number;
  scenarioCount?: number;
  testScriptCount?: number;
  regressionPassRate0to1?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationRavigBenchCheck {
  metricId?: string;
  ravigBenchSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  ravigBenchSignalType?: MetricValidationRavigBenchSignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  licenseRefs?: string[];
  branchRefs?: string[];
  commitRefs?: string[];
  treeRefs?: string[];
  readmeBlobRefs?: string[];
  legalBlobRefs?: string[];
  environmentRefs?: string[];
  configurationRefs?: string[];
  contentEvaluationRefs?: string[];
  designEvaluationRefs?: string[];
  executionEvaluationRefs?: string[];
  functionScoringRefs?: string[];
  datasetRefs?: string[];
  testCaseRefs?: string[];
  modelResultRefs?: string[];
  taxonomyIds?: string[];
  retrievalContextIds?: string[];
  multiModalEvaluatorIds?: string[];
  screenshotEvaluationRefs?: string[];
  runScriptRefs?: string[];
  metricNames?: string[];
  ciReporterIds?: string[];
  reporterFormats?: Array<"json" | "github_actions" | "junit_xml" | "markdown" | "custom">;
  datasetCaseCount?: number;
  visualDesignCheckCount?: number;
  evaluatorCount?: number;
  validationPassRate0to1?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationHumanStudyBenchCheck {
  metricId?: string;
  humanStudyBenchSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  humanStudyBenchSignalType?: MetricValidationHumanStudyBenchSignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  licenseRefs?: string[];
  branchRefs?: string[];
  commitRefs?: string[];
  studyConfigIds?: string[];
  backgroundDatasetIds?: string[];
  humanResponseDatasetIds?: string[];
  agentResponseDatasetIds?: string[];
  evaluatorIds?: string[];
  metricNames?: string[];
  validatorIds?: string[];
  scorerIds?: string[];
  standardizerIds?: string[];
  reliabilityReportIds?: string[];
  validationPipelineIds?: string[];
  resultArtifactIds?: string[];
  ciReporterIds?: string[];
  reporterFormats?: Array<"json" | "pytest" | "github_actions" | "custom">;
  studyCount?: number;
  participantCount?: number;
  responseCount?: number;
  evaluatorCount?: number;
  interRaterAgreement0to1?: number;
  testRetestReliability0to1?: number;
  validationPassRate0to1?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationLegacyBenchCheck {
  metricId?: string;
  legacyBenchSignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  legacyBenchSignalType?: MetricValidationLegacyBenchSignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  licenseRefs?: string[];
  branchRefs?: string[];
  commitRefs?: string[];
  treeRefs?: string[];
  readmeBlobRefs?: string[];
  taskCorpusRefs?: string[];
  legacyLanguageIds?: string[];
  environmentIds?: string[];
  harnessRunnerIds?: string[];
  agentTaskIds?: string[];
  patchSubmissionIds?: string[];
  testOracleIds?: string[];
  evaluatorIds?: string[];
  metricNames?: string[];
  ciReporterIds?: string[];
  reporterFormats?: Array<"json" | "junit_xml" | "github_actions" | "markdown" | "custom">;
  resultArtifactIds?: string[];
  replayCommandIds?: string[];
  taskCount?: number;
  languageCount?: number;
  environmentCount?: number;
  testOracleCount?: number;
  evaluatorCount?: number;
  regressionPassRate0to1?: number;
  replayPassRate0to1?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationSubtleMemoryCheck {
  metricId?: string;
  subtleMemorySignalId: string;
  covered: boolean;
  evidenceRefs: string[];
  subtleMemorySignalType?: MetricValidationSubtleMemorySignal;
  artifactHash?: string;
  repositoryRefs?: string[];
  licenseRefs?: string[];
  branchRefs?: string[];
  commitRefs?: string[];
  treeRefs?: string[];
  arxivRefs?: string[];
  datasetRefs?: string[];
  personaIds?: string[];
  benchInstanceManifestIds?: string[];
  historySessionManifestIds?: string[];
  relationTypes?: string[];
  constructionPipelineIds?: string[];
  evaluationStageIds?: string[];
  adapterIds?: string[];
  judgeIds?: string[];
  evaluatorIds?: string[];
  metricNames?: string[];
  scoreSummaryIds?: string[];
  diagnosticProtocolIds?: string[];
  ciReporterIds?: string[];
  reporterFormats?: string[];
  personaCount?: number;
  benchInstanceCount?: number;
  historyCount?: number;
  memoryVariantSetCount?: number;
  relationTypeCount?: number;
  evaluationStageCount?: number;
  adapterCount?: number;
  judgeAgreement0to1?: number;
  validationPassRate0to1?: number;
  owner?: string;
  sampleSize?: number;
  confidenceInterval?: MetricValidationConfidenceInterval;
}

export interface MetricValidationThresholdPolicy {
  minSampleSize: number;
  minConstructValidity: number;
  minCounterfactualResponsiveness: number;
  minValidationFacetCoverage: number;
  minConfounderControlCoverage: number;
  minOutcomeAlignment: number;
  minProcessEvidenceCoverage: number;
  minSafetyUtilityCoverage: number;
  minModalityTransformationCoverage: number;
  minLifecycleObservabilityCoverage: number;
  minRankingStabilityCoverage: number;
  minToolSandboxCoverage: number;
  minContinualLearningCoverage: number;
  minStrategicInteractionCoverage: number;
  minArchitectureRealityCoverage: number;
  minRagPipelineCoverage: number;
  minRagEvaluationPipelineCoverage: number;
  minRagasNotebookCoverage: number;
  minMirageRagMetricCoverage: number;
  minLegalCodeRagCoverage: number;
  minGuardbenchMetricCoverage: number;
  minBusinessWorkflowCoverage: number;
  minDataAgentAnalyticalCoverage: number;
  minEmbodiedAgentCoverage: number;
  minEvaluatorSuiteCoverage: number;
  minPentestBenchmarkCoverage: number;
  minTraceEvaluationCoverage: number;
  minLivingEnvironmentCoverage: number;
  minMobileAgentCoverage: number;
  minPersonaAgentCoverage: number;
  minScientificLiteratureCoverage: number;
  minBioinformaticsAgentCoverage: number;
  minMirageDrugRepositioningCoverage: number;
  minNetworkTroubleshootingCoverage: number;
  minInferenceOptimizationCoverage: number;
  minJavaCodingAgentCoverage: number;
  minWebEvalDatasetCoverage: number;
  minParallelResearchSkillCoverage: number;
  minResumeRagEvaluatorCoverage: number;
  minChipBenchmarkCoverage: number;
  minHermesBenchCoverage: number;
  minHermesBenchTaskCount: number;
  minHermesBenchAdapterCount: number;
  minHermesBenchBackendTestCount: number;
  minHermesBenchFrontendTestCount: number;
  minHermesBenchJudgeAgreement0to1: number;
  minHermesBenchRegressionPassRate0to1: number;
  minCooperBenchCoverage: number;
  minCooperBenchTaskCount: number;
  minCooperBenchFeatureCount: number;
  minCooperBenchAgentAdapterCount: number;
  minCooperBenchTestCount: number;
  minCooperBenchCooperationScore0to1: number;
  minCooperBenchConflictResolutionRate0to1: number;
  minCooperBenchRegressionPassRate0to1: number;
  minCoderCupCoverage: number;
  minCoderCupPhaseCount: number;
  minCoderCupTestPlanCount: number;
  minCoderCupRunnerCount: number;
  minCoderCupScoreLedgerCount: number;
  minCoderCupLiveSurfaceCount: number;
  minCoderCupInterRaterAgreement0to1: number;
  minCoderCupTestRetestReliability0to1: number;
  minCoderCupRegressionPassRate0to1: number;
  minAgenticGraphRagCoverage: number;
  minAgenticGraphRagGraphNodeCount: number;
  minAgenticGraphRagEvaluationMetricCount: number;
  minAgenticGraphRagExperimentCount: number;
  minAgenticGraphRagRetrievalGroundingScore0to1: number;
  minAgenticGraphRagRegressionPassRate0to1: number;
  minAgentScenarioTestCoverage: number;
  minOpenCodeLabCoverage: number;
  minCcPluginEvalCoverage: number;
  minCcPluginEvalTriggerAccuracy0to1: number;
  maxCcPluginEvalFalsePositiveRate0to1: number;
  maxCcPluginEvalFalseNegativeRate0to1: number;
  minRealignSimulationCoverage: number;
  minRealignSimulationJudgeAgreement0to1: number;
  minRealignSimulationRegressionPassRate0to1: number;
  minAcademiClawCoverage: number;
  minAcademiClawTaskCount: number;
  minAcademiClawLanguageCount: number;
  minAcademiClawRubricCount: number;
  minAcademiClawTraceCount: number;
  minAcademiClawMetaEvalCount: number;
  minAcademiClawModelCount: number;
  minAcademiClawRegressionPassRate0to1: number;
  minRagChunkingTechniqueCoverage: number;
  minRagChunkingTechniquePolicyDocumentCount: number;
  minRagChunkingTechniqueNotebookCount: number;
  minRagChunkingTechniqueChunkingStrategyCount: number;
  minRagChunkingTechniqueEvaluationQuestionCount: number;
  minRagChunkingTechniqueMetricCount: number;
  minRagChunkingTechniqueRegressionPassRate0to1: number;
  minKubernetesOperationalAgentCoverage: number;
  minKubernetesOperationalAgentToolCategoryCount: number;
  minKubernetesOperationalAgentDiagnosticCapabilityCount: number;
  minKubernetesOperationalAgentResourceMetricCount: number;
  minKubernetesOperationalAgentLogAnalysisCount: number;
  minKubernetesOperationalAgentRegressionPassRate0to1: number;
  minSecureVibeBenchCoverage: number;
  minSecureVibeBenchAgentAdapterCount: number;
  minSecureVibeBenchScenarioCount: number;
  minSecureVibeBenchTestScriptCount: number;
  minSecureVibeBenchRegressionPassRate0to1: number;
  minRavigBenchCoverage: number;
  minRavigBenchDatasetCaseCount: number;
  minRavigBenchVisualDesignCheckCount: number;
  minRavigBenchEvaluatorCount: number;
  minRavigBenchValidationPassRate0to1: number;
  minHumanStudyBenchCoverage: number;
  minHumanStudyBenchInterRaterAgreement0to1: number;
  minHumanStudyBenchTestRetestReliability0to1: number;
  minHumanStudyBenchValidationPassRate0to1: number;
  minLegacyBenchCoverage: number;
  minLegacyBenchLanguageCount: number;
  minLegacyBenchRegressionPassRate0to1: number;
  minLegacyBenchReplayPassRate0to1: number;
  minSubtleMemoryCoverage: number;
  minSubtleMemoryPersonaCount: number;
  minSubtleMemoryBenchInstanceCount: number;
  minSubtleMemoryMemoryVariantSetCount: number;
  minSubtleMemoryRelationTypeCount: number;
  minSubtleMemoryEvaluationStageCount: number;
  minSubtleMemoryAdapterCount: number;
  minSubtleMemoryJudgeAgreement0to1: number;
  minSubtleMemoryValidationPassRate0to1: number;
  maxConfidenceIntervalWidth: number;
}

const DEFAULT_THRESHOLDS: MetricValidationThresholdPolicy = {
  minSampleSize: 5,
  minConstructValidity: 0.55,
  minCounterfactualResponsiveness: 0.6,
  minValidationFacetCoverage: 0.75,
  minConfounderControlCoverage: 0.75,
  minOutcomeAlignment: 0.75,
  minProcessEvidenceCoverage: 0.75,
  minSafetyUtilityCoverage: 0.75,
  minModalityTransformationCoverage: 0.75,
  minLifecycleObservabilityCoverage: 0.75,
  minRankingStabilityCoverage: 0.75,
  minToolSandboxCoverage: 0.75,
  minContinualLearningCoverage: 0.75,
  minStrategicInteractionCoverage: 0.75,
  minArchitectureRealityCoverage: 1,
  minRagPipelineCoverage: 0.75,
  minRagEvaluationPipelineCoverage: 1,
  minRagasNotebookCoverage: 1,
  minMirageRagMetricCoverage: 1,
  minLegalCodeRagCoverage: 1,
  minGuardbenchMetricCoverage: 1,
  minBusinessWorkflowCoverage: 0.75,
  minDataAgentAnalyticalCoverage: 0.75,
  minEmbodiedAgentCoverage: 1,
  minEvaluatorSuiteCoverage: 1,
  minPentestBenchmarkCoverage: 1,
  minTraceEvaluationCoverage: 1,
  minLivingEnvironmentCoverage: 1,
  minMobileAgentCoverage: 1,
  minPersonaAgentCoverage: 1,
  minScientificLiteratureCoverage: 1,
  minBioinformaticsAgentCoverage: 1,
  minMirageDrugRepositioningCoverage: 1,
  minNetworkTroubleshootingCoverage: 1,
  minInferenceOptimizationCoverage: 1,
  minJavaCodingAgentCoverage: 1,
  minWebEvalDatasetCoverage: 1,
  minParallelResearchSkillCoverage: 1,
  minResumeRagEvaluatorCoverage: 1,
  minChipBenchmarkCoverage: 1,
  minHermesBenchCoverage: 1,
  minHermesBenchTaskCount: 5,
  minHermesBenchAdapterCount: 2,
  minHermesBenchBackendTestCount: 8,
  minHermesBenchFrontendTestCount: 4,
  minHermesBenchJudgeAgreement0to1: 0.8,
  minHermesBenchRegressionPassRate0to1: 0.9,
  minCooperBenchCoverage: 1,
  minCooperBenchTaskCount: 30,
  minCooperBenchFeatureCount: 100,
  minCooperBenchAgentAdapterCount: 3,
  minCooperBenchTestCount: 30,
  minCooperBenchCooperationScore0to1: 0.75,
  minCooperBenchConflictResolutionRate0to1: 0.75,
  minCooperBenchRegressionPassRate0to1: 0.9,
  minCoderCupCoverage: 1,
  minCoderCupPhaseCount: 10,
  minCoderCupTestPlanCount: 160,
  minCoderCupRunnerCount: 4,
  minCoderCupScoreLedgerCount: 5,
  minCoderCupLiveSurfaceCount: 3,
  minCoderCupInterRaterAgreement0to1: 0.8,
  minCoderCupTestRetestReliability0to1: 0.8,
  minCoderCupRegressionPassRate0to1: 0.9,
  minAgenticGraphRagCoverage: 1,
  minAgenticGraphRagGraphNodeCount: 1,
  minAgenticGraphRagEvaluationMetricCount: 2,
  minAgenticGraphRagExperimentCount: 1,
  minAgenticGraphRagRetrievalGroundingScore0to1: 0.75,
  minAgenticGraphRagRegressionPassRate0to1: 0.9,
  minAgentScenarioTestCoverage: 1,
  minOpenCodeLabCoverage: 1,
  minCcPluginEvalCoverage: 1,
  minCcPluginEvalTriggerAccuracy0to1: 0.85,
  maxCcPluginEvalFalsePositiveRate0to1: 0.1,
  maxCcPluginEvalFalseNegativeRate0to1: 0.1,
  minRealignSimulationCoverage: 1,
  minRealignSimulationJudgeAgreement0to1: 0.85,
  minRealignSimulationRegressionPassRate0to1: 0.9,
  minAcademiClawCoverage: 1,
  minAcademiClawTaskCount: 80,
  minAcademiClawLanguageCount: 2,
  minAcademiClawRubricCount: 80,
  minAcademiClawTraceCount: 80,
  minAcademiClawMetaEvalCount: 80,
  minAcademiClawModelCount: 3,
  minAcademiClawRegressionPassRate0to1: 0.9,
  minRagChunkingTechniqueCoverage: 1,
  minRagChunkingTechniquePolicyDocumentCount: 5,
  minRagChunkingTechniqueNotebookCount: 3,
  minRagChunkingTechniqueChunkingStrategyCount: 2,
  minRagChunkingTechniqueEvaluationQuestionCount: 5,
  minRagChunkingTechniqueMetricCount: 2,
  minRagChunkingTechniqueRegressionPassRate0to1: 0.9,
  minKubernetesOperationalAgentCoverage: 1,
  minKubernetesOperationalAgentToolCategoryCount: 8,
  minKubernetesOperationalAgentDiagnosticCapabilityCount: 3,
  minKubernetesOperationalAgentResourceMetricCount: 3,
  minKubernetesOperationalAgentLogAnalysisCount: 1,
  minKubernetesOperationalAgentRegressionPassRate0to1: 0.9,
  minSecureVibeBenchCoverage: 1,
  minSecureVibeBenchAgentAdapterCount: 5,
  minSecureVibeBenchScenarioCount: 50,
  minSecureVibeBenchTestScriptCount: 50,
  minSecureVibeBenchRegressionPassRate0to1: 0.9,
  minRavigBenchCoverage: 1,
  minRavigBenchDatasetCaseCount: 5,
  minRavigBenchVisualDesignCheckCount: 3,
  minRavigBenchEvaluatorCount: 3,
  minRavigBenchValidationPassRate0to1: 0.9,
  minHumanStudyBenchCoverage: 1,
  minHumanStudyBenchInterRaterAgreement0to1: 0.8,
  minHumanStudyBenchTestRetestReliability0to1: 0.8,
  minHumanStudyBenchValidationPassRate0to1: 0.9,
  minLegacyBenchCoverage: 1,
  minLegacyBenchLanguageCount: 3,
  minLegacyBenchRegressionPassRate0to1: 0.9,
  minLegacyBenchReplayPassRate0to1: 0.9,
  minSubtleMemoryCoverage: 1,
  minSubtleMemoryPersonaCount: 10,
  minSubtleMemoryBenchInstanceCount: 1500,
  minSubtleMemoryMemoryVariantSetCount: 1000,
  minSubtleMemoryRelationTypeCount: 3,
  minSubtleMemoryEvaluationStageCount: 5,
  minSubtleMemoryAdapterCount: 6,
  minSubtleMemoryJudgeAgreement0to1: 0.8,
  minSubtleMemoryValidationPassRate0to1: 0.9,
  maxConfidenceIntervalWidth: 40
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function confidenceInterval(values: number[], level = 0.95): MetricValidationConfidenceInterval {
  if (values.length === 0) {
    return { level, lower: 0, upper: 0, marginOfError: 0 };
  }
  const avg = mean(values);
  const z = level >= 0.99 ? 2.576 : 1.96;
  const margin = values.length >= 2 ? z * (stdDev(values) / Math.sqrt(values.length)) : 0;
  return {
    level,
    lower: Number(clamp(avg - margin, 0, 100).toFixed(6)),
    upper: Number(clamp(avg + margin, 0, 100).toFixed(6)),
    marginOfError: Number(margin.toFixed(6))
  };
}

function reportOverallScore(report: Pick<DiagnosticReport, "layerScores">): number {
  if (report.layerScores.length === 0) return 0;
  return mean(report.layerScores.map((layer) => clamp(layer.avgFinalLevel * 20, 0, 100)));
}

function layerScore(report: Pick<DiagnosticReport, "layerScores">, layerName: LayerName): number | null {
  const row = report.layerScores.find((layer) => layer.layerName === layerName);
  return row ? clamp(row.avgFinalLevel * 20, 0, 100) : null;
}

function scoreValues(questionScores: QuestionScore[]): number[] {
  return questionScores.map((score) => clamp(score.finalLevel * 20, 0, 100));
}

function linkedEvidenceRefs(questionScores: QuestionScore[]): string[] {
  const refs = new Set<string>();
  for (const score of questionScores) {
    for (const id of score.evidenceEventIds) {
      refs.add(id);
      if (refs.size >= 12) return [...refs];
    }
  }
  return [...refs];
}

function counterfactualSummary(
  checks: MetricValidationCounterfactualCheck[] | undefined,
  metricId: string
): { sampleSize: number; responsiveness: number | null; evidenceRefs: string[] } {
  const scoped = (checks ?? []).filter((check) => (check.metricId ?? "overall_maturity_score") === metricId);
  if (scoped.length === 0) {
    return { sampleSize: 0, responsiveness: null, evidenceRefs: [] };
  }
  const passed = scoped.filter((check) => check.passed).length;
  return {
    sampleSize: scoped.length,
    responsiveness: Number((passed / scoped.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))]
  };
}

function validationFacetSummary(
  checks: MetricValidationFacetCheck[] | undefined,
  metricId: string
): { sampleSize: number; coverage: number | null; evidenceRefs: string[] } {
  const scoped = (checks ?? []).filter((check) => (check.metricId ?? "overall_maturity_score") === metricId);
  if (scoped.length === 0) {
    return { sampleSize: 0, coverage: null, evidenceRefs: [] };
  }
  const covered = scoped.filter((check) => check.covered).length;
  return {
    sampleSize: scoped.length,
    coverage: Number((covered / scoped.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))]
  };
}

function confounderControlSummary(
  checks: MetricValidationConfounderControlCheck[] | undefined,
  metricId: string
): { sampleSize: number; coverage: number | null; evidenceRefs: string[] } {
  const scoped = (checks ?? []).filter((check) => (check.metricId ?? "overall_maturity_score") === metricId);
  if (scoped.length === 0) {
    return { sampleSize: 0, coverage: null, evidenceRefs: [] };
  }
  const controlled = scoped.filter((check) => check.controlled).length;
  return {
    sampleSize: scoped.length,
    coverage: Number((controlled / scoped.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))]
  };
}

function outcomeAlignmentSummary(
  checks: MetricValidationOutcomeAlignmentCheck[] | undefined,
  metricId: string
): { sampleSize: number; alignment: number | null; evidenceRefs: string[] } {
  const scoped = (checks ?? []).filter((check) => (check.metricId ?? "overall_maturity_score") === metricId);
  if (scoped.length === 0) {
    return { sampleSize: 0, alignment: null, evidenceRefs: [] };
  }
  const aligned = scoped.filter((check) => check.aligned).length;
  return {
    sampleSize: scoped.length,
    alignment: Number((aligned / scoped.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))]
  };
}

function processEvidenceSummary(
  checks: MetricValidationProcessEvidenceCheck[] | undefined,
  metricId: string
): { sampleSize: number; coverage: number | null; evidenceRefs: string[] } {
  const scoped = (checks ?? []).filter((check) => (check.metricId ?? "overall_maturity_score") === metricId);
  if (scoped.length === 0) {
    return { sampleSize: 0, coverage: null, evidenceRefs: [] };
  }
  const covered = scoped.filter((check) => check.covered).length;
  return {
    sampleSize: scoped.length,
    coverage: Number((covered / scoped.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))]
  };
}

function safetyUtilitySummary(
  checks: MetricValidationSafetyUtilityCheck[] | undefined,
  metricId: string
): { sampleSize: number; coverage: number | null; evidenceRefs: string[] } {
  const scoped = (checks ?? []).filter((check) => (check.metricId ?? "overall_maturity_score") === metricId);
  if (scoped.length === 0) {
    return { sampleSize: 0, coverage: null, evidenceRefs: [] };
  }
  const covered = scoped.filter((check) => check.covered).length;
  return {
    sampleSize: scoped.length,
    coverage: Number((covered / scoped.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))]
  };
}

function modalityTransformationSummary(
  checks: MetricValidationModalityTransformationCheck[] | undefined,
  metricId: string
): { sampleSize: number; coverage: number | null; evidenceRefs: string[] } {
  const scoped = (checks ?? []).filter((check) => (check.metricId ?? "overall_maturity_score") === metricId);
  if (scoped.length === 0) {
    return { sampleSize: 0, coverage: null, evidenceRefs: [] };
  }
  const covered = scoped.filter((check) => check.covered).length;
  return {
    sampleSize: scoped.length,
    coverage: Number((covered / scoped.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))]
  };
}

function lifecycleObservabilitySummary(
  checks: MetricValidationLifecycleObservabilityCheck[] | undefined,
  metricId: string
): { sampleSize: number; coverage: number | null; evidenceRefs: string[] } {
  const scoped = (checks ?? []).filter((check) => (check.metricId ?? "overall_maturity_score") === metricId);
  if (scoped.length === 0) {
    return { sampleSize: 0, coverage: null, evidenceRefs: [] };
  }
  const covered = scoped.filter((check) => check.covered).length;
  return {
    sampleSize: scoped.length,
    coverage: Number((covered / scoped.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))]
  };
}

function rankingStabilitySummary(
  checks: MetricValidationRankingStabilityCheck[] | undefined,
  metricId: string
): { sampleSize: number; coverage: number | null; evidenceRefs: string[] } {
  const scoped = (checks ?? []).filter((check) => (check.metricId ?? "overall_maturity_score") === metricId);
  if (scoped.length === 0) {
    return { sampleSize: 0, coverage: null, evidenceRefs: [] };
  }
  const covered = scoped.filter((check) => check.covered).length;
  return {
    sampleSize: scoped.length,
    coverage: Number((covered / scoped.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))]
  };
}

function toolSandboxSummary(
  checks: MetricValidationToolSandboxCheck[] | undefined,
  metricId: string
): { sampleSize: number; coverage: number | null; evidenceRefs: string[] } {
  const scoped = (checks ?? []).filter((check) => (check.metricId ?? "overall_maturity_score") === metricId);
  if (scoped.length === 0) {
    return { sampleSize: 0, coverage: null, evidenceRefs: [] };
  }
  const covered = scoped.filter((check) => check.covered).length;
  return {
    sampleSize: scoped.length,
    coverage: Number((covered / scoped.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))]
  };
}

const CONTINUAL_LEARNING_REQUIRED_SIGNALS: MetricValidationContinualLearningSignal[] = [
  "task_sequence_version",
  "environment_config",
  "controller_log",
  "longitudinal_run_trace",
  "game_build_config",
  "mod_manifest",
  "llm_config",
  "prompt_language",
  "memory_artifact",
  "conversation_log",
  "run_summary_json",
  "gameplay_log",
  "decision_trace",
  "run_outcome_metric",
  "improvement_trend",
  "fallback_mode_control",
  "sample_size_confidence_interval"
];

function continualLearningSummary(
  checks: MetricValidationContinualLearningCheck[] | undefined,
  metricId: string
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationContinualLearningSignal[];
  runCount: number | null;
  memoryArtifactHashes: string[];
  runSummaryArtifactHashes: string[];
  gameplayLogArtifactHashes: string[];
  metricNames: string[];
} {
  const scoped = (checks ?? []).filter((check) => (check.metricId ?? "overall_maturity_score") === metricId);
  if (scoped.length === 0) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      runCount: null,
      memoryArtifactHashes: [],
      runSummaryArtifactHashes: [],
      gameplayLogArtifactHashes: [],
      metricNames: []
    };
  }
  const typed = scoped.filter((check) => check.continualSignalType !== undefined);
  const covered = scoped.filter((check) => check.covered).length;
  const coveredTypedSignals = new Set(
    typed
      .filter((check) => check.covered)
      .map((check) => check.continualSignalType)
      .filter((signal): signal is MetricValidationContinualLearningSignal => signal !== undefined)
  );
  const missingSignals = typed.length === 0
    ? []
    : CONTINUAL_LEARNING_REQUIRED_SIGNALS.filter((signal) => !coveredTypedSignals.has(signal));
  const typedCoverage = typed.length === 0
    ? null
    : Number(((CONTINUAL_LEARNING_REQUIRED_SIGNALS.length - missingSignals.length) / CONTINUAL_LEARNING_REQUIRED_SIGNALS.length).toFixed(6));
  const runCounts = scoped
    .map((check) => check.runCount)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  return {
    sampleSize: scoped.length,
    coverage: typedCoverage ?? Number((covered / scoped.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))],
    missingSignals,
    runCount: runCounts.length > 0 ? Math.max(...runCounts) : null,
    memoryArtifactHashes: [...new Set(scoped.flatMap((check) => [check.memoryArtifactHash, check.artifactHash]).filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0))],
    runSummaryArtifactHashes: [...new Set(scoped.flatMap((check) => [check.runSummaryArtifactHash, check.artifactHash]).filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0))],
    gameplayLogArtifactHashes: [...new Set(scoped.flatMap((check) => [check.gameplayLogArtifactHash, check.artifactHash]).filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0))],
    metricNames: [...new Set(scoped.flatMap((check) => check.metricNames ?? []).filter((name) => name.trim().length > 0))]
  };
}

function strategicInteractionSummary(
  checks: MetricValidationStrategicInteractionCheck[] | undefined,
  metricId: string
): { sampleSize: number; coverage: number | null; evidenceRefs: string[] } {
  const scoped = (checks ?? []).filter((check) => (check.metricId ?? "overall_maturity_score") === metricId);
  if (scoped.length === 0) {
    return { sampleSize: 0, coverage: null, evidenceRefs: [] };
  }
  const covered = scoped.filter((check) => check.covered).length;
  return {
    sampleSize: scoped.length,
    coverage: Number((covered / scoped.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))]
  };
}

const ARCHITECTURE_REALITY_REQUIRED_SIGNALS: MetricValidationArchitectureRealitySignal[] = [
  "wrapper_agent_baseline",
  "marketing_agent_baseline",
  "real_agent_baseline",
  "planning_hierarchy",
  "memory_context_retention",
  "recovery_strategy",
  "stress_tool_failure",
  "network_resilience",
  "cost_per_success",
  "ensemble_coordination",
  "statistical_confidence"
];

const ARCHITECTURE_REALITY_ARTIFACT_SIGNALS = new Set<MetricValidationArchitectureRealitySignal>([
  "wrapper_agent_baseline",
  "marketing_agent_baseline",
  "real_agent_baseline",
  "planning_hierarchy",
  "memory_context_retention",
  "recovery_strategy",
  "stress_tool_failure",
  "network_resilience",
  "cost_per_success",
  "ensemble_coordination"
]);

function ragPipelineSummary(
  checks: MetricValidationRagPipelineCheck[] | undefined,
  metricId: string
): { sampleSize: number; coverage: number | null; evidenceRefs: string[] } {
  const scoped = (checks ?? []).filter((check) => (check.metricId ?? "overall_maturity_score") === metricId);
  if (scoped.length === 0) {
    return { sampleSize: 0, coverage: null, evidenceRefs: [] };
  }
  const covered = scoped.filter((check) => check.covered).length;
  return {
    sampleSize: scoped.length,
    coverage: Number((covered / scoped.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))]
  };
}

const RAG_EVALUATION_PIPELINE_REQUIRED_SIGNALS: MetricValidationRagEvaluationPipelineSignal[] = [
  "ground_truth_questions",
  "ground_truth_answers",
  "rag_pipeline_config",
  "document_corpus",
  "metric_definition",
  "query_result_trace",
  "retrieval_trace",
  "generation_trace",
  "evaluator_config",
  "evaluation_report",
  "metric_owner",
  "sample_size_confidence_interval"
];

const RAG_EVALUATION_PIPELINE_ARTIFACT_SIGNALS = new Set<MetricValidationRagEvaluationPipelineSignal>([
  "ground_truth_questions",
  "ground_truth_answers",
  "rag_pipeline_config",
  "document_corpus",
  "metric_definition",
  "query_result_trace",
  "retrieval_trace",
  "generation_trace",
  "evaluator_config",
  "evaluation_report"
]);

const RAGAS_NOTEBOOK_REQUIRED_SIGNALS: MetricValidationRagasNotebookSignal[] = [
  "source_repository_boundary",
  "notebook_manifest",
  "dependency_manifest",
  "document_corpus",
  "chunking_config",
  "testset_generator_config",
  "evolution_mix",
  "generated_testset_manifest",
  "rag_chain_config",
  "retriever_vectorstore_config",
  "model_embedding_config",
  "answer_context_trace",
  "ragas_metric_suite",
  "ragas_evaluation_result",
  "langfuse_trace_score_export",
  "visualization_artifact",
  "metric_owner",
  "sample_size_confidence_interval"
];

const RAGAS_NOTEBOOK_ARTIFACT_SIGNALS = new Set<MetricValidationRagasNotebookSignal>([
  "source_repository_boundary",
  "notebook_manifest",
  "dependency_manifest",
  "document_corpus",
  "chunking_config",
  "testset_generator_config",
  "evolution_mix",
  "generated_testset_manifest",
  "rag_chain_config",
  "retriever_vectorstore_config",
  "model_embedding_config",
  "answer_context_trace",
  "ragas_metric_suite",
  "ragas_evaluation_result",
  "langfuse_trace_score_export",
  "visualization_artifact"
]);

const MIRAGE_RAG_METRIC_REQUIRED_SIGNALS: MetricValidationMirageRagSignal[] = [
  "benchmark_identity",
  "dataset_manifest",
  "qa_pair_manifest",
  "context_pool_manifest",
  "retrieval_pool_manifest",
  "base_oracle_mixed_protocol",
  "retriever_config",
  "model_config",
  "llm_result_report",
  "retriever_result_report",
  "mirage_metrics_report",
  "overall_score_formula",
  "metric_owner",
  "sample_size_confidence_interval"
];

const MIRAGE_RAG_METRIC_ARTIFACT_SIGNALS = new Set<MetricValidationMirageRagSignal>([
  "benchmark_identity",
  "dataset_manifest",
  "qa_pair_manifest",
  "context_pool_manifest",
  "retrieval_pool_manifest",
  "base_oracle_mixed_protocol",
  "retriever_config",
  "model_config",
  "llm_result_report",
  "retriever_result_report",
  "mirage_metrics_report",
  "overall_score_formula"
]);

const LEGAL_CODE_RAG_REQUIRED_SIGNALS: MetricValidationLegalCodeRagSignal[] = [
  "legal_corpus_manifest",
  "legifrance_source_boundary",
  "retriever_config",
  "vector_database_config",
  "embedding_model_config",
  "windowing_config",
  "hybrid_search_config",
  "query_rewrite_config",
  "routing_policy_config",
  "evaluation_dataset",
  "reference_answer_manifest",
  "metric_definition",
  "evaluator_config",
  "evaluation_report",
  "metric_owner",
  "sample_size_confidence_interval"
];

const LEGAL_CODE_RAG_ARTIFACT_SIGNALS = new Set<MetricValidationLegalCodeRagSignal>([
  "legal_corpus_manifest",
  "legifrance_source_boundary",
  "retriever_config",
  "vector_database_config",
  "embedding_model_config",
  "windowing_config",
  "hybrid_search_config",
  "query_rewrite_config",
  "routing_policy_config",
  "evaluation_dataset",
  "reference_answer_manifest",
  "metric_definition",
  "evaluator_config",
  "evaluation_report"
]);

const GUARDBENCH_METRIC_REQUIRED_SIGNALS: MetricValidationGuardbenchSignal[] = [
  "benchmark_identity",
  "dataset_manifest",
  "dataset_access_policy",
  "standardized_format",
  "moderation_function_contract",
  "guardrail_model_config",
  "threshold_config",
  "prediction_score_manifest",
  "metric_suite_report",
  "confusion_matrix_report",
  "language_coverage",
  "leaderboard_or_export_report",
  "metric_owner",
  "sample_size_confidence_interval"
];

const GUARDBENCH_METRIC_ARTIFACT_SIGNALS = new Set<MetricValidationGuardbenchSignal>([
  "benchmark_identity",
  "dataset_manifest",
  "dataset_access_policy",
  "standardized_format",
  "moderation_function_contract",
  "guardrail_model_config",
  "threshold_config",
  "prediction_score_manifest",
  "metric_suite_report",
  "confusion_matrix_report",
  "language_coverage",
  "leaderboard_or_export_report"
]);

const EMBODIED_AGENT_REQUIRED_SIGNALS: MetricValidationEmbodiedAgentSignal[] = [
  "task_type_coverage",
  "simulator_environment_config",
  "scene_dataset_package",
  "random_baseline",
  "human_baseline",
  "model_baseline",
  "action_observation_trajectory",
  "result_folder",
  "overall_metric_report",
  "task_type_metric_report",
  "metric_owner",
  "sample_size_confidence_interval"
];

const EMBODIED_AGENT_ARTIFACT_SIGNALS = new Set<MetricValidationEmbodiedAgentSignal>([
  "simulator_environment_config",
  "scene_dataset_package",
  "random_baseline",
  "human_baseline",
  "model_baseline",
  "action_observation_trajectory",
  "result_folder",
  "overall_metric_report",
  "task_type_metric_report"
]);

const EVALUATOR_SUITE_REQUIRED_SIGNALS: MetricValidationEvaluatorSuiteSignal[] = [
  "deterministic_assertion",
  "llm_judge_criterion",
  "safety_assertion",
  "red_team_attack",
  "dataset_eval_manifest",
  "custom_judge_definition",
  "reporter_output",
  "framework_integration",
  "threshold_config",
  "metric_owner",
  "sample_size_confidence_interval"
];

const EVALUATOR_SUITE_ARTIFACT_SIGNALS = new Set<MetricValidationEvaluatorSuiteSignal>([
  "deterministic_assertion",
  "llm_judge_criterion",
  "safety_assertion",
  "red_team_attack",
  "dataset_eval_manifest",
  "custom_judge_definition",
  "reporter_output",
  "framework_integration",
  "threshold_config"
]);

const PENTEST_BENCHMARK_REQUIRED_SIGNALS: MetricValidationPentestBenchmarkSignal[] = [
  "source_repository_license",
  "benchmark_release_manifest",
  "task_id_manifest",
  "target_image_manifest",
  "runtime_controller_manifest",
  "firewall_isolation_config",
  "llm_proxy_config",
  "smart_contract_dataset_manifest",
  "historical_fork_manifest",
  "problem_metadata_manifest",
  "flaw_verifier_contract_manifest",
  "forge_grader_result",
  "profit_threshold_metric",
  "anti_cheat_reset_proof",
  "dataset_cutoff_split",
  "dockerized_app_manifest",
  "language_stack_coverage",
  "vulnerability_class_coverage",
  "difficulty_distribution",
  "multi_step_chain_coverage",
  "flag_ground_truth",
  "threat_model_ground_truth",
  "false_positive_trap",
  "security_control_effectiveness",
  "exploit_execution_trace",
  "exploit_success_metric",
  "threat_model_report",
  "metric_owner",
  "sample_size_confidence_interval"
];

const PENTEST_BENCHMARK_ARTIFACT_SIGNALS = new Set<MetricValidationPentestBenchmarkSignal>([
  "source_repository_license",
  "benchmark_release_manifest",
  "task_id_manifest",
  "target_image_manifest",
  "runtime_controller_manifest",
  "firewall_isolation_config",
  "llm_proxy_config",
  "smart_contract_dataset_manifest",
  "historical_fork_manifest",
  "problem_metadata_manifest",
  "flaw_verifier_contract_manifest",
  "forge_grader_result",
  "profit_threshold_metric",
  "anti_cheat_reset_proof",
  "dataset_cutoff_split",
  "dockerized_app_manifest",
  "multi_step_chain_coverage",
  "flag_ground_truth",
  "threat_model_ground_truth",
  "false_positive_trap",
  "security_control_effectiveness",
  "exploit_execution_trace",
  "exploit_success_metric",
  "threat_model_report"
]);

const TRACE_EVALUATION_REQUIRED_SIGNALS: MetricValidationTraceEvaluationSignal[] = [
  "bedrock_converse_model_config",
  "agent_parameter_manifest",
  "tool_registry_manifest",
  "trace_manifest",
  "repeatable_case_manifest",
  "dynamic_expectation_validator",
  "bulk_case_run_manifest",
  "run_permutation_manifest",
  "mock_llm_backend_control",
  "metric_definition_manifest",
  "measurement_export_manifest",
  "production_monitor_binding",
  "threshold_alarm_config",
  "metric_owner",
  "sample_size_confidence_interval"
];

const TRACE_EVALUATION_ARTIFACT_SIGNALS = new Set<MetricValidationTraceEvaluationSignal>([
  "bedrock_converse_model_config",
  "agent_parameter_manifest",
  "tool_registry_manifest",
  "trace_manifest",
  "repeatable_case_manifest",
  "dynamic_expectation_validator",
  "bulk_case_run_manifest",
  "run_permutation_manifest",
  "mock_llm_backend_control",
  "metric_definition_manifest",
  "measurement_export_manifest",
  "production_monitor_binding",
  "threshold_alarm_config"
]);

const LIVING_ENVIRONMENT_REQUIRED_SIGNALS: MetricValidationLivingEnvironmentSignal[] = [
  "task_program_manifest",
  "living_environment_manifest",
  "environment_mutation_trace",
  "capability_manifest",
  "sandbox_provider_config",
  "agent_adapter_manifest",
  "multi_turn_trajectory",
  "stage_checker_manifest",
  "checker_result_artifact",
  "trial_result_artifact",
  "aggregate_metric_report",
  "pass_at_k_metric",
  "proactive_trigger_trace",
  "metric_owner",
  "sample_size_confidence_interval"
];

const LIVING_ENVIRONMENT_ARTIFACT_SIGNALS = new Set<MetricValidationLivingEnvironmentSignal>([
  "task_program_manifest",
  "living_environment_manifest",
  "environment_mutation_trace",
  "capability_manifest",
  "sandbox_provider_config",
  "agent_adapter_manifest",
  "multi_turn_trajectory",
  "stage_checker_manifest",
  "checker_result_artifact",
  "trial_result_artifact",
  "aggregate_metric_report",
  "pass_at_k_metric",
  "proactive_trigger_trace"
]);

const MOBILE_AGENT_REQUIRED_SIGNALS: MetricValidationMobileAgentSignal[] = [
  "benchmark_manifest",
  "paper_or_source_reference",
  "mobile_environment_manifest",
  "app_inventory_manifest",
  "api_catalog_manifest",
  "ui_automation_trace",
  "task_dataset_manifest",
  "task_complexity_manifest",
  "multi_app_task_manifest",
  "checkpoint_metric_rubric",
  "checkpoint_result_artifact",
  "environment_reset_policy",
  "device_state_fixture",
  "result_report_artifact",
  "dataset_license_boundary",
  "metric_owner",
  "sample_size_confidence_interval"
];

const MOBILE_AGENT_ARTIFACT_SIGNALS = new Set<MetricValidationMobileAgentSignal>([
  "mobile_environment_manifest",
  "app_inventory_manifest",
  "api_catalog_manifest",
  "ui_automation_trace",
  "task_dataset_manifest",
  "task_complexity_manifest",
  "multi_app_task_manifest",
  "checkpoint_metric_rubric",
  "checkpoint_result_artifact",
  "environment_reset_policy",
  "device_state_fixture",
  "result_report_artifact",
  "dataset_license_boundary"
]);

const PERSONA_AGENT_REQUIRED_SIGNALS: MetricValidationPersonaAgentSignal[] = [
  "persona_manifest",
  "static_environment_manifest",
  "benchmark_question_set",
  "persona_agent_config",
  "model_provider_config",
  "response_trace",
  "rubric_manifest",
  "personascore_metric_definition",
  "human_alignment_calibration",
  "evaluation_output_artifact",
  "benchmark_result_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const PERSONA_AGENT_ARTIFACT_SIGNALS = new Set<MetricValidationPersonaAgentSignal>([
  "persona_manifest",
  "static_environment_manifest",
  "benchmark_question_set",
  "persona_agent_config",
  "model_provider_config",
  "response_trace",
  "rubric_manifest",
  "personascore_metric_definition",
  "human_alignment_calibration",
  "evaluation_output_artifact",
  "benchmark_result_manifest"
]);

const SCIENTIFIC_LITERATURE_REQUIRED_SIGNALS: MetricValidationScientificLiteratureSignal[] = [
  "benchmark_manifest",
  "deep_research_task_manifest",
  "wide_research_task_manifest",
  "released_dataset_manifest",
  "dataset_obfuscation_manifest",
  "literature_corpus_manifest",
  "search_backend_config",
  "deepxiv_tool_config",
  "web_search_tool_config",
  "agent_config_manifest",
  "inference_run_manifest",
  "evaluation_pipeline_config",
  "deep_search_accuracy_metric",
  "wide_search_iou_metric",
  "result_report_artifact",
  "metric_owner",
  "sample_size_confidence_interval"
];

const SCIENTIFIC_LITERATURE_ARTIFACT_SIGNALS = new Set<MetricValidationScientificLiteratureSignal>([
  "benchmark_manifest",
  "deep_research_task_manifest",
  "wide_research_task_manifest",
  "released_dataset_manifest",
  "dataset_obfuscation_manifest",
  "literature_corpus_manifest",
  "search_backend_config",
  "deepxiv_tool_config",
  "web_search_tool_config",
  "agent_config_manifest",
  "inference_run_manifest",
  "evaluation_pipeline_config",
  "deep_search_accuracy_metric",
  "wide_search_iou_metric",
  "result_report_artifact"
]);

const BIOINFORMATICS_AGENT_REQUIRED_SIGNALS: MetricValidationBioinformaticsAgentSignal[] = [
  "benchmark_manifest",
  "paper_or_source_reference",
  "bioinformatics_task_manifest",
  "dataset_input_manifest",
  "truth_reference_manifest",
  "workflow_reproduction_manifest",
  "docker_or_environment_manifest",
  "tool_version_manifest",
  "agent_harness_manifest",
  "grader_config_manifest",
  "result_artifact_manifest",
  "perturbation_suite_manifest",
  "privacy_boundary_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const BIOINFORMATICS_AGENT_ARTIFACT_SIGNALS = new Set<MetricValidationBioinformaticsAgentSignal>([
  "benchmark_manifest",
  "paper_or_source_reference",
  "bioinformatics_task_manifest",
  "dataset_input_manifest",
  "truth_reference_manifest",
  "workflow_reproduction_manifest",
  "docker_or_environment_manifest",
  "tool_version_manifest",
  "agent_harness_manifest",
  "grader_config_manifest",
  "result_artifact_manifest",
  "perturbation_suite_manifest",
  "privacy_boundary_manifest"
]);

const MIRAGE_DRUG_REPOSITIONING_REQUIRED_SIGNALS: MetricValidationMirageDrugRepositioningSignal[] = [
  "benchmark_identity",
  "dataset_release_manifest",
  "train_test_split_manifest",
  "drug_disease_mapping_manifest",
  "drug_feature_manifest",
  "disease_feature_manifest",
  "similarity_matrix_manifest",
  "negative_sampling_protocol",
  "classifier_config",
  "feature_selection_report",
  "score_calculation_manifest",
  "evaluation_report",
  "case_study_validation",
  "metric_owner",
  "sample_size_confidence_interval"
];

const MIRAGE_DRUG_REPOSITIONING_ARTIFACT_SIGNALS = new Set<MetricValidationMirageDrugRepositioningSignal>([
  "benchmark_identity",
  "dataset_release_manifest",
  "train_test_split_manifest",
  "drug_disease_mapping_manifest",
  "drug_feature_manifest",
  "disease_feature_manifest",
  "similarity_matrix_manifest",
  "negative_sampling_protocol",
  "classifier_config",
  "feature_selection_report",
  "score_calculation_manifest",
  "evaluation_report",
  "case_study_validation"
]);

const NETWORK_TROUBLESHOOTING_REQUIRED_SIGNALS: MetricValidationNetworkTroubleshootingSignal[] = [
  "benchmark_manifest",
  "paper_or_source_reference",
  "network_scenario_manifest",
  "topology_tier_manifest",
  "incident_catalog_manifest",
  "fault_injection_manifest",
  "session_trace_manifest",
  "agent_interface_manifest",
  "mcp_tool_manifest",
  "environment_runtime_manifest",
  "evaluation_metric_manifest",
  "judge_config_manifest",
  "batch_summary_artifact",
  "root_cause_ground_truth",
  "localization_ground_truth",
  "traffic_workload_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const NETWORK_TROUBLESHOOTING_ARTIFACT_SIGNALS = new Set<MetricValidationNetworkTroubleshootingSignal>([
  "benchmark_manifest",
  "paper_or_source_reference",
  "network_scenario_manifest",
  "topology_tier_manifest",
  "incident_catalog_manifest",
  "fault_injection_manifest",
  "session_trace_manifest",
  "agent_interface_manifest",
  "mcp_tool_manifest",
  "environment_runtime_manifest",
  "evaluation_metric_manifest",
  "judge_config_manifest",
  "batch_summary_artifact",
  "root_cause_ground_truth",
  "localization_ground_truth",
  "traffic_workload_manifest"
]);

const INFERENCE_OPTIMIZATION_REQUIRED_SIGNALS: MetricValidationInferenceOptimizationSignal[] = [
  "benchmark_manifest",
  "paper_or_source_reference",
  "scenario_objective_manifest",
  "hardware_budget_manifest",
  "server_contract_manifest",
  "runtime_backend_manifest",
  "search_space_manifest",
  "baseline_comparison_manifest",
  "quality_gate_result",
  "integrity_gate_result",
  "supervised_relaunch_result",
  "latency_throughput_metrics",
  "tail_latency_metrics",
  "exploration_trace_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const INFERENCE_OPTIMIZATION_ARTIFACT_SIGNALS = new Set<MetricValidationInferenceOptimizationSignal>([
  "benchmark_manifest",
  "paper_or_source_reference",
  "scenario_objective_manifest",
  "hardware_budget_manifest",
  "server_contract_manifest",
  "runtime_backend_manifest",
  "search_space_manifest",
  "baseline_comparison_manifest",
  "quality_gate_result",
  "integrity_gate_result",
  "supervised_relaunch_result",
  "latency_throughput_metrics",
  "tail_latency_metrics",
  "exploration_trace_manifest"
]);

const JAVA_CODING_AGENT_REQUIRED_SIGNALS: MetricValidationJavaCodingAgentSignal[] = [
  "benchmark_manifest",
  "source_repository_license",
  "java_task_manifest",
  "yaml_benchmark_manifest",
  "workspace_template_manifest",
  "isolated_sandbox_manifest",
  "provide_lifecycle_trace",
  "setup_post_script_manifest",
  "cli_agent_config",
  "cascaded_jury_manifest",
  "judge_tier_policy",
  "maven_build_check",
  "junit_test_result",
  "jacoco_coverage_report",
  "result_json_manifest",
  "accuracy_pass_at_k_metric",
  "metric_owner",
  "sample_size_confidence_interval"
];

const JAVA_CODING_AGENT_ARTIFACT_SIGNALS = new Set<MetricValidationJavaCodingAgentSignal>([
  "benchmark_manifest",
  "source_repository_license",
  "java_task_manifest",
  "yaml_benchmark_manifest",
  "workspace_template_manifest",
  "isolated_sandbox_manifest",
  "provide_lifecycle_trace",
  "setup_post_script_manifest",
  "cli_agent_config",
  "cascaded_jury_manifest",
  "judge_tier_policy",
  "maven_build_check",
  "junit_test_result",
  "jacoco_coverage_report",
  "result_json_manifest",
  "accuracy_pass_at_k_metric"
]);

const WEB_EVAL_DATASET_REQUIRED_SIGNALS: MetricValidationWebEvalDatasetSignal[] = [
  "benchmark_manifest",
  "source_repository_reference",
  "subject_manifest",
  "generated_query_manifest",
  "search_provider_config",
  "retrieved_document_manifest",
  "document_filter_manifest",
  "qa_generation_manifest",
  "reference_answer_manifest",
  "dataset_export_manifest",
  "output_target_manifest",
  "validation_report_artifact",
  "freshness_snapshot",
  "provider_diversity_metric",
  "source_coverage_metric",
  "answer_grounding_metric",
  "metric_owner",
  "sample_size_confidence_interval"
];

const WEB_EVAL_DATASET_ARTIFACT_SIGNALS = new Set<MetricValidationWebEvalDatasetSignal>([
  "benchmark_manifest",
  "source_repository_reference",
  "subject_manifest",
  "generated_query_manifest",
  "search_provider_config",
  "retrieved_document_manifest",
  "document_filter_manifest",
  "qa_generation_manifest",
  "reference_answer_manifest",
  "dataset_export_manifest",
  "output_target_manifest",
  "validation_report_artifact",
  "freshness_snapshot",
  "provider_diversity_metric",
  "source_coverage_metric",
  "answer_grounding_metric"
]);

const PARALLEL_RESEARCH_SKILL_REQUIRED_SIGNALS: MetricValidationParallelResearchSkillSignal[] = [
  "source_repository_reference",
  "license_boundary",
  "skill_manifest",
  "api_surface_manifest",
  "search_mode_manifest",
  "deep_research_task_manifest",
  "chat_grounding_manifest",
  "extract_content_manifest",
  "citation_provenance_report",
  "source_policy_manifest",
  "batch_execution_manifest",
  "monitoring_manifest",
  "security_boundary",
  "dependency_lock",
  "benchmark_claim_validation_report",
  "metric_owner",
  "sample_size_confidence_interval"
];

const PARALLEL_RESEARCH_SKILL_ARTIFACT_SIGNALS = new Set<MetricValidationParallelResearchSkillSignal>([
  "source_repository_reference",
  "license_boundary",
  "skill_manifest",
  "api_surface_manifest",
  "search_mode_manifest",
  "deep_research_task_manifest",
  "chat_grounding_manifest",
  "extract_content_manifest",
  "citation_provenance_report",
  "source_policy_manifest",
  "batch_execution_manifest",
  "monitoring_manifest",
  "security_boundary",
  "dependency_lock",
  "benchmark_claim_validation_report"
]);

const RESUME_RAG_EVALUATOR_REQUIRED_SIGNALS: MetricValidationResumeRagEvaluatorSignal[] = [
  "source_repository_reference",
  "license_boundary",
  "resume_upload_manifest",
  "resume_parser_manifest",
  "job_description_manifest",
  "rag_strategy_manifest",
  "query_expansion_manifest",
  "retrieval_config_manifest",
  "vector_store_manifest",
  "ollama_model_manifest",
  "embedding_model_manifest",
  "evaluation_endpoint_manifest",
  "candidate_rating_report",
  "batch_evaluation_manifest",
  "privacy_boundary",
  "dependency_lock",
  "metric_owner",
  "sample_size_confidence_interval"
];

const RESUME_RAG_EVALUATOR_ARTIFACT_SIGNALS = new Set<MetricValidationResumeRagEvaluatorSignal>([
  "source_repository_reference",
  "license_boundary",
  "resume_upload_manifest",
  "resume_parser_manifest",
  "job_description_manifest",
  "rag_strategy_manifest",
  "query_expansion_manifest",
  "retrieval_config_manifest",
  "vector_store_manifest",
  "ollama_model_manifest",
  "embedding_model_manifest",
  "evaluation_endpoint_manifest",
  "candidate_rating_report",
  "batch_evaluation_manifest",
  "privacy_boundary",
  "dependency_lock"
]);

const CHIP_BENCHMARK_REQUIRED_SIGNALS: MetricValidationChipBenchmarkSignal[] = [
  "source_repository_reference",
  "license_boundary",
  "benchmark_manifest",
  "hardware_profile_manifest",
  "model_family_manifest",
  "precision_mode_manifest",
  "environment_setup_script",
  "benchmark_runner_script",
  "serving_backend_script",
  "benchmark_result_dataset",
  "frontend_synced_dataset",
  "pricing_dataset",
  "throughput_metric",
  "latency_metric",
  "cost_metric",
  "regression_threshold",
  "metric_owner",
  "sample_size_confidence_interval"
];

const CHIP_BENCHMARK_ARTIFACT_SIGNALS = new Set<MetricValidationChipBenchmarkSignal>([
  "source_repository_reference",
  "license_boundary",
  "benchmark_manifest",
  "hardware_profile_manifest",
  "model_family_manifest",
  "precision_mode_manifest",
  "environment_setup_script",
  "benchmark_runner_script",
  "serving_backend_script",
  "benchmark_result_dataset",
  "frontend_synced_dataset",
  "pricing_dataset",
  "throughput_metric",
  "latency_metric",
  "cost_metric",
  "regression_threshold"
]);

const HERMES_BENCH_REQUIRED_SIGNALS: MetricValidationHermesBenchSignal[] = [
  "source_repository_license",
  "default_branch_snapshot",
  "readme_build_spec_manifest",
  "backend_runner_manifest",
  "judge_calibration_manifest",
  "task_registry_manifest",
  "model_server_config_manifest",
  "adapter_coverage_manifest",
  "result_schema_manifest",
  "frontend_result_review_manifest",
  "backend_regression_manifest",
  "frontend_regression_manifest",
  "docker_runtime_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const HERMES_BENCH_ARTIFACT_SIGNALS = new Set<MetricValidationHermesBenchSignal>([
  "source_repository_license",
  "default_branch_snapshot",
  "readme_build_spec_manifest",
  "backend_runner_manifest",
  "judge_calibration_manifest",
  "task_registry_manifest",
  "model_server_config_manifest",
  "adapter_coverage_manifest",
  "result_schema_manifest",
  "frontend_result_review_manifest",
  "backend_regression_manifest",
  "frontend_regression_manifest",
  "docker_runtime_manifest"
]);

const COOPER_BENCH_REQUIRED_SIGNALS: MetricValidationCooperBenchSignal[] = [
  "source_repository_license_release",
  "default_branch_snapshot",
  "readme_changelog_manifest",
  "dataset_task_manifest",
  "feature_conflict_manifest",
  "runner_coop_manifest",
  "eval_backend_manifest",
  "team_harness_manifest",
  "agent_adapter_manifest",
  "ci_workflow_manifest",
  "package_lock_manifest",
  "report_publication_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const COOPER_BENCH_ARTIFACT_SIGNALS = new Set<MetricValidationCooperBenchSignal>([
  "source_repository_license_release",
  "default_branch_snapshot",
  "readme_changelog_manifest",
  "dataset_task_manifest",
  "feature_conflict_manifest",
  "runner_coop_manifest",
  "eval_backend_manifest",
  "team_harness_manifest",
  "agent_adapter_manifest",
  "ci_workflow_manifest",
  "package_lock_manifest",
  "report_publication_manifest"
]);

const CODER_CUP_REQUIRED_SIGNALS: MetricValidationCoderCupSignal[] = [
  "source_repository_license_homepage",
  "default_branch_snapshot",
  "readme_contributing_manifest",
  "ci_workflow_manifest",
  "package_lock_manifest",
  "task_spec_manifest",
  "testsuite_manifest",
  "runner_contract_manifest",
  "score_ledger_manifest",
  "live_artifact_manifest",
  "methodology_reference_manifest",
  "cost_accounting_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const CODER_CUP_ARTIFACT_SIGNALS = new Set<MetricValidationCoderCupSignal>([
  "source_repository_license_homepage",
  "default_branch_snapshot",
  "readme_contributing_manifest",
  "ci_workflow_manifest",
  "package_lock_manifest",
  "task_spec_manifest",
  "testsuite_manifest",
  "runner_contract_manifest",
  "score_ledger_manifest",
  "live_artifact_manifest",
  "methodology_reference_manifest",
  "cost_accounting_manifest"
]);

const AGENTIC_GRAPH_RAG_REQUIRED_SIGNALS: MetricValidationAgenticGraphRagSignal[] = [
  "source_repository_no_license",
  "default_branch_snapshot",
  "readme_project_manifest",
  "graph_orchestrator_manifest",
  "rag_pipeline_manifest",
  "database_vector_store_manifest",
  "evaluation_metric_manifest",
  "experiment_tracking_manifest",
  "ui_question_manifest",
  "dependency_lock_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const AGENTIC_GRAPH_RAG_ARTIFACT_SIGNALS = new Set<MetricValidationAgenticGraphRagSignal>([
  "source_repository_no_license",
  "default_branch_snapshot",
  "readme_project_manifest",
  "graph_orchestrator_manifest",
  "rag_pipeline_manifest",
  "database_vector_store_manifest",
  "evaluation_metric_manifest",
  "experiment_tracking_manifest",
  "ui_question_manifest",
  "dependency_lock_manifest"
]);

const AGENT_SCENARIO_TEST_REQUIRED_SIGNALS: MetricValidationAgentScenarioTestSignal[] = [
  "benchmark_manifest",
  "source_repository_license",
  "agent_endpoint_contract",
  "scenario_manifest",
  "simulated_user_persona_manifest",
  "goal_knowledge_manifest",
  "tool_mock_manifest",
  "scripted_turn_manifest",
  "trajectory_assertion_manifest",
  "llm_judge_metric_manifest",
  "comparison_run_manifest",
  "ci_reporter_manifest",
  "result_artifact_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const AGENT_SCENARIO_TEST_ARTIFACT_SIGNALS = new Set<MetricValidationAgentScenarioTestSignal>([
  "benchmark_manifest",
  "source_repository_license",
  "agent_endpoint_contract",
  "scenario_manifest",
  "simulated_user_persona_manifest",
  "goal_knowledge_manifest",
  "tool_mock_manifest",
  "scripted_turn_manifest",
  "trajectory_assertion_manifest",
  "llm_judge_metric_manifest",
  "comparison_run_manifest",
  "ci_reporter_manifest",
  "result_artifact_manifest"
]);

const OPEN_CODE_LAB_REQUIRED_SIGNALS: MetricValidationOpenCodeLabSignal[] = [
  "source_repository_reference",
  "lab_benchmark_manifest",
  "agent_context_manifest",
  "prompt_variant_manifest",
  "tool_description_manifest",
  "agents_policy_manifest",
  "repeated_run_trace",
  "fork_agreement_report",
  "model_variance_report",
  "ground_truth_correction_manifest",
  "metric_definition_manifest",
  "ci_reporter_manifest",
  "result_artifact_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const OPEN_CODE_LAB_ARTIFACT_SIGNALS = new Set<MetricValidationOpenCodeLabSignal>([
  "source_repository_reference",
  "lab_benchmark_manifest",
  "agent_context_manifest",
  "prompt_variant_manifest",
  "tool_description_manifest",
  "agents_policy_manifest",
  "repeated_run_trace",
  "fork_agreement_report",
  "model_variance_report",
  "ground_truth_correction_manifest",
  "metric_definition_manifest",
  "ci_reporter_manifest",
  "result_artifact_manifest"
]);

const CC_PLUGIN_EVAL_REQUIRED_SIGNALS: MetricValidationCcPluginEvalSignal[] = [
  "source_repository_license",
  "plugin_manifest",
  "component_inventory",
  "trigger_phrase_manifest",
  "scenario_generation_manifest",
  "scenario_type_coverage",
  "execution_transcript_bundle",
  "programmatic_detection_report",
  "llm_judge_calibration",
  "conflict_detection_report",
  "checkpoint_resume_state",
  "cost_estimate_report",
  "ci_reporter_manifest",
  "result_artifact_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const CC_PLUGIN_EVAL_ARTIFACT_SIGNALS = new Set<MetricValidationCcPluginEvalSignal>([
  "source_repository_license",
  "plugin_manifest",
  "component_inventory",
  "trigger_phrase_manifest",
  "scenario_generation_manifest",
  "scenario_type_coverage",
  "execution_transcript_bundle",
  "programmatic_detection_report",
  "llm_judge_calibration",
  "conflict_detection_report",
  "checkpoint_resume_state",
  "cost_estimate_report",
  "ci_reporter_manifest",
  "result_artifact_manifest"
]);

const REALIGN_SIMULATION_REQUIRED_SIGNALS: MetricValidationRealignSimulationSignal[] = [
  "source_repository_license",
  "yaml_config_manifest",
  "app_under_test_manifest",
  "dataset_manifest",
  "scenario_manifest",
  "synthetic_user_persona_manifest",
  "evaluator_registry_manifest",
  "evaluator_target_manifest",
  "simulation_run_trace",
  "repeated_run_trace",
  "judge_calibration_report",
  "statistical_rigor_report",
  "ci_regression_manifest",
  "experiment_tracking_manifest",
  "result_artifact_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const REALIGN_SIMULATION_ARTIFACT_SIGNALS = new Set<MetricValidationRealignSimulationSignal>([
  "source_repository_license",
  "yaml_config_manifest",
  "app_under_test_manifest",
  "dataset_manifest",
  "scenario_manifest",
  "synthetic_user_persona_manifest",
  "evaluator_registry_manifest",
  "evaluator_target_manifest",
  "simulation_run_trace",
  "repeated_run_trace",
  "judge_calibration_report",
  "statistical_rigor_report",
  "ci_regression_manifest",
  "experiment_tracking_manifest",
  "result_artifact_manifest"
]);

const ACADEMI_CLAW_REQUIRED_SIGNALS: MetricValidationAcademiClawSignal[] = [
  "source_repository_license",
  "default_branch_snapshot",
  "readme_citation_manifest",
  "task_corpus_manifest",
  "bilingual_task_manifest",
  "workspace_query_manifest",
  "docker_environment_manifest",
  "evaluation_rubric_manifest",
  "eval_task_runner_manifest",
  "openclaw_result_manifest",
  "conversation_trace_manifest",
  "meta_eval_manifest",
  "model_roster_manifest",
  "metric_definition_manifest",
  "ci_regression_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const ACADEMI_CLAW_ARTIFACT_SIGNALS = new Set<MetricValidationAcademiClawSignal>([
  "source_repository_license",
  "default_branch_snapshot",
  "readme_citation_manifest",
  "task_corpus_manifest",
  "bilingual_task_manifest",
  "workspace_query_manifest",
  "docker_environment_manifest",
  "evaluation_rubric_manifest",
  "eval_task_runner_manifest",
  "openclaw_result_manifest",
  "conversation_trace_manifest",
  "meta_eval_manifest",
  "model_roster_manifest",
  "metric_definition_manifest",
  "ci_regression_manifest"
]);

const RAG_CHUNKING_TECHNIQUE_REQUIRED_SIGNALS: MetricValidationRagChunkingTechniqueSignal[] = [
  "source_repository_license",
  "default_branch_snapshot",
  "readme_manifest",
  "policy_corpus_manifest",
  "simple_rag_notebook_manifest",
  "smart_chunking_notebook_manifest",
  "rag_evaluation_notebook_manifest",
  "chunking_strategy_manifest",
  "retrieval_pipeline_manifest",
  "embedding_vectorstore_manifest",
  "evaluation_dataset_manifest",
  "metric_definition_manifest",
  "ci_regression_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const RAG_CHUNKING_TECHNIQUE_ARTIFACT_SIGNALS = new Set<MetricValidationRagChunkingTechniqueSignal>([
  "source_repository_license",
  "default_branch_snapshot",
  "readme_manifest",
  "policy_corpus_manifest",
  "simple_rag_notebook_manifest",
  "smart_chunking_notebook_manifest",
  "rag_evaluation_notebook_manifest",
  "chunking_strategy_manifest",
  "retrieval_pipeline_manifest",
  "embedding_vectorstore_manifest",
  "evaluation_dataset_manifest",
  "metric_definition_manifest",
  "ci_regression_manifest"
]);

const KUBERNETES_OPERATIONAL_AGENT_REQUIRED_SIGNALS: MetricValidationKubernetesOperationalAgentSignal[] = [
  "source_repository_license",
  "default_branch_snapshot",
  "readme_manifest",
  "release_asset_manifest",
  "build_workflow_manifest",
  "agent_module_manifest",
  "mcp_server_manifest",
  "kubernetes_tool_inventory",
  "diagnostic_capability_manifest",
  "resource_monitoring_manifest",
  "log_analysis_manifest",
  "metric_definition_manifest",
  "ci_regression_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const KUBERNETES_OPERATIONAL_AGENT_ARTIFACT_SIGNALS = new Set<MetricValidationKubernetesOperationalAgentSignal>([
  "source_repository_license",
  "default_branch_snapshot",
  "readme_manifest",
  "release_asset_manifest",
  "build_workflow_manifest",
  "agent_module_manifest",
  "mcp_server_manifest",
  "kubernetes_tool_inventory",
  "diagnostic_capability_manifest",
  "resource_monitoring_manifest",
  "log_analysis_manifest",
  "metric_definition_manifest",
  "ci_regression_manifest"
]);

const SECURE_VIBE_BENCH_REQUIRED_SIGNALS: MetricValidationSecureVibeBenchSignal[] = [
  "source_repository_license_homepage",
  "default_branch_snapshot",
  "readme_manifest",
  "results_manifest",
  "dataset_manifest",
  "format_example_manifest",
  "evaluation_runner_manifest",
  "agent_adapter_roster",
  "vulnerability_scenario_manifest",
  "test_script_manifest",
  "parser_utility_manifest",
  "patch_diff_utility_manifest",
  "metric_definition_manifest",
  "ci_regression_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const SECURE_VIBE_BENCH_ARTIFACT_SIGNALS = new Set<MetricValidationSecureVibeBenchSignal>([
  "source_repository_license_homepage",
  "default_branch_snapshot",
  "readme_manifest",
  "results_manifest",
  "dataset_manifest",
  "format_example_manifest",
  "evaluation_runner_manifest",
  "agent_adapter_roster",
  "vulnerability_scenario_manifest",
  "test_script_manifest",
  "parser_utility_manifest",
  "patch_diff_utility_manifest",
  "metric_definition_manifest",
  "ci_regression_manifest"
]);

const RAVIG_BENCH_REQUIRED_SIGNALS: MetricValidationRavigBenchSignal[] = [
  "source_repository_license",
  "default_branch_snapshot",
  "readme_legal_manifest",
  "environment_dependency_manifest",
  "configuration_manifest",
  "content_evaluation_manifest",
  "design_evaluation_manifest",
  "execution_evaluation_manifest",
  "function_scoring_manifest",
  "dataset_manifest",
  "test_case_manifest",
  "model_result_manifest",
  "visual_rich_generation_taxonomy",
  "rag_retrieval_context_manifest",
  "multi_modal_evaluator_manifest",
  "screenshot_evaluation_manifest",
  "run_script_manifest",
  "metric_definition_manifest",
  "ci_regression_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const RAVIG_BENCH_ARTIFACT_SIGNALS = new Set<MetricValidationRavigBenchSignal>([
  "source_repository_license",
  "default_branch_snapshot",
  "readme_legal_manifest",
  "environment_dependency_manifest",
  "configuration_manifest",
  "content_evaluation_manifest",
  "design_evaluation_manifest",
  "execution_evaluation_manifest",
  "function_scoring_manifest",
  "dataset_manifest",
  "test_case_manifest",
  "model_result_manifest",
  "visual_rich_generation_taxonomy",
  "rag_retrieval_context_manifest",
  "multi_modal_evaluator_manifest",
  "screenshot_evaluation_manifest",
  "run_script_manifest",
  "metric_definition_manifest",
  "ci_regression_manifest"
]);

const HUMAN_STUDY_BENCH_REQUIRED_SIGNALS: MetricValidationHumanStudyBenchSignal[] = [
  "source_repository_license",
  "default_branch_snapshot",
  "study_config_manifest",
  "participant_background_manifest",
  "human_response_manifest",
  "agent_response_manifest",
  "evaluator_registry_manifest",
  "metric_definition_manifest",
  "response_validator_manifest",
  "scorer_standardizer_manifest",
  "inter_rater_agreement_report",
  "test_retest_reliability_report",
  "validation_pipeline_manifest",
  "result_artifact_manifest",
  "ci_regression_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const HUMAN_STUDY_BENCH_ARTIFACT_SIGNALS = new Set<MetricValidationHumanStudyBenchSignal>([
  "source_repository_license",
  "default_branch_snapshot",
  "study_config_manifest",
  "participant_background_manifest",
  "human_response_manifest",
  "agent_response_manifest",
  "evaluator_registry_manifest",
  "metric_definition_manifest",
  "response_validator_manifest",
  "scorer_standardizer_manifest",
  "inter_rater_agreement_report",
  "test_retest_reliability_report",
  "validation_pipeline_manifest",
  "result_artifact_manifest",
  "ci_regression_manifest"
]);

const LEGACY_BENCH_REQUIRED_SIGNALS: MetricValidationLegacyBenchSignal[] = [
  "source_repository_license",
  "default_branch_snapshot",
  "readme_manifest",
  "task_corpus_manifest",
  "legacy_language_manifest",
  "environment_manifest",
  "harness_runner_manifest",
  "agent_task_manifest",
  "patch_submission_manifest",
  "test_oracle_manifest",
  "evaluator_registry_manifest",
  "scoring_metric_manifest",
  "regression_ci_manifest",
  "result_artifact_manifest",
  "replay_command_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const LEGACY_BENCH_ARTIFACT_SIGNALS = new Set<MetricValidationLegacyBenchSignal>([
  "source_repository_license",
  "default_branch_snapshot",
  "readme_manifest",
  "task_corpus_manifest",
  "legacy_language_manifest",
  "environment_manifest",
  "harness_runner_manifest",
  "agent_task_manifest",
  "patch_submission_manifest",
  "test_oracle_manifest",
  "evaluator_registry_manifest",
  "scoring_metric_manifest",
  "regression_ci_manifest",
  "result_artifact_manifest",
  "replay_command_manifest"
]);

const SUBTLE_MEMORY_REQUIRED_SIGNALS: MetricValidationSubtleMemorySignal[] = [
  "source_repository_license",
  "default_branch_snapshot",
  "arxiv_paper_version",
  "huggingface_dataset_release",
  "persona_split_manifest",
  "bench_instance_manifest",
  "history_session_manifest",
  "relation_taxonomy_manifest",
  "construction_pipeline_manifest",
  "staged_evaluation_protocol",
  "adapter_roster_manifest",
  "judge_evaluator_config",
  "score_summary_report",
  "diagnostic_protocol_report",
  "ci_validation_manifest",
  "metric_owner",
  "sample_size_confidence_interval"
];

const SUBTLE_MEMORY_ARTIFACT_SIGNALS = new Set<MetricValidationSubtleMemorySignal>([
  "source_repository_license",
  "default_branch_snapshot",
  "arxiv_paper_version",
  "huggingface_dataset_release",
  "persona_split_manifest",
  "bench_instance_manifest",
  "history_session_manifest",
  "relation_taxonomy_manifest",
  "construction_pipeline_manifest",
  "staged_evaluation_protocol",
  "adapter_roster_manifest",
  "judge_evaluator_config",
  "score_summary_report",
  "diagnostic_protocol_report",
  "ci_validation_manifest"
]);

function isSha256Hash(value: string | undefined): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function uniqueTrimmed(values: Array<string | undefined>): string[] {
  return [
    ...new Set(values
      .map((value) => value?.trim() ?? "")
      .filter((value) => value.length > 0))
  ];
}

function confidenceIntervalWidth(interval: MetricValidationConfidenceInterval): number {
  return Math.max(0, interval.upper - interval.lower);
}

function isUsableConfidenceInterval(
  interval: MetricValidationConfidenceInterval | undefined,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!interval) return false;
  return Number.isFinite(interval.level) &&
    interval.level > 0 &&
    interval.level <= 1 &&
    Number.isFinite(interval.lower) &&
    Number.isFinite(interval.upper) &&
    interval.upper >= interval.lower &&
    confidenceIntervalWidth(interval) <= thresholds.maxConfidenceIntervalWidth;
}

function isArchitectureRealityCheckCovered(
  check: MetricValidationArchitectureRealityCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.architectureSignalType) return false;
  if (!ARCHITECTURE_REALITY_REQUIRED_SIGNALS.includes(check.architectureSignalType)) return false;
  if (check.evidenceRefs.filter((ref) => ref.trim().length > 0).length === 0) return false;
  if (ARCHITECTURE_REALITY_ARTIFACT_SIGNALS.has(check.architectureSignalType) && !isSha256Hash(check.artifactHash)) {
    return false;
  }
  if (
    (check.architectureSignalType === "stress_tool_failure" ||
      check.architectureSignalType === "network_resilience" ||
      check.architectureSignalType === "ensemble_coordination") &&
    (!Number.isFinite(check.scenarioCount) || (check.scenarioCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    check.architectureSignalType === "cost_per_success" &&
    (check.metricNames ?? []).filter((metricName) => metricName.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (check.architectureSignalType === "statistical_confidence") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function maxScenarioCount(
  checks: MetricValidationArchitectureRealityCheck[],
  signalType: MetricValidationArchitectureRealitySignal,
  thresholds: MetricValidationThresholdPolicy
): number | null {
  const counts = checks
    .filter((check) =>
      check.architectureSignalType === signalType &&
      isArchitectureRealityCheckCovered(check, thresholds) &&
      typeof check.scenarioCount === "number" &&
      Number.isFinite(check.scenarioCount)
    )
    .map((check) => check.scenarioCount as number);
  return counts.length === 0 ? null : Math.max(...counts);
}

function architectureRealitySummary(
  checks: MetricValidationArchitectureRealityCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationArchitectureRealitySignal[];
  stressScenarioCount: number | null;
  networkScenarioCount: number | null;
  ensemblePatternCount: number | null;
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.architectureSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      stressScenarioCount: null,
      networkScenarioCount: null,
      ensemblePatternCount: null
    };
  }

  const coveredSignals = new Set(
    scoped
      .filter((check) => isArchitectureRealityCheckCovered(check, thresholds))
      .map((check) => check.architectureSignalType as MetricValidationArchitectureRealitySignal)
  );
  const missingSignals = ARCHITECTURE_REALITY_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / ARCHITECTURE_REALITY_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))],
    missingSignals,
    stressScenarioCount: maxScenarioCount(scoped, "stress_tool_failure", thresholds),
    networkScenarioCount: maxScenarioCount(scoped, "network_resilience", thresholds),
    ensemblePatternCount: maxScenarioCount(scoped, "ensemble_coordination", thresholds)
  };
}

function isRagEvaluationPipelineCheckCovered(
  check: MetricValidationRagPipelineCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.evaluationSignalType) return false;
  if (!RAG_EVALUATION_PIPELINE_REQUIRED_SIGNALS.includes(check.evaluationSignalType)) return false;
  if (check.evidenceRefs.filter((ref) => ref.trim().length > 0).length === 0) return false;
  if (RAG_EVALUATION_PIPELINE_ARTIFACT_SIGNALS.has(check.evaluationSignalType) && !isSha256Hash(check.artifactHash)) {
    return false;
  }
  if (
    check.evaluationSignalType === "metric_definition" &&
    (check.metricNames ?? []).filter((metricName) => metricName.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (check.evaluationSignalType === "metric_owner" && (check.owner ?? "").trim().length === 0) {
    return false;
  }
  if (check.evaluationSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function ragEvaluationPipelineSummary(
  checks: MetricValidationRagPipelineCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationRagEvaluationPipelineSignal[];
  metricOwners: string[];
  caseSampleSizeMin: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.evaluationSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      metricOwners: [],
      caseSampleSizeMin: null,
      reportArtifactHashes: []
    };
  }

  const coveredSignals = new Set(
    scoped
      .filter((check) => isRagEvaluationPipelineCheckCovered(check, thresholds))
      .map((check) => check.evaluationSignalType as MetricValidationRagEvaluationPipelineSignal)
  );
  const missingSignals = RAG_EVALUATION_PIPELINE_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal));
  const sampleSizes = scoped
    .map((check) => check.sampleSize)
    .filter((sampleSize): sampleSize is number => typeof sampleSize === "number" && Number.isFinite(sampleSize));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / RAG_EVALUATION_PIPELINE_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))],
    missingSignals,
    metricOwners: [
      ...new Set(scoped
        .map((check) => check.owner?.trim())
        .filter((owner): owner is string => Boolean(owner)))
    ],
    caseSampleSizeMin: sampleSizes.length === 0 ? null : Math.min(...sampleSizes),
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) => check.evaluationSignalType === "evaluation_report" && isSha256Hash(check.artifactHash))
        .map((check) => check.artifactHash as string))
    ]
  };
}

function isRagasNotebookCheckCovered(
  check: MetricValidationRagPipelineCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.ragasNotebookSignalType) return false;
  if (!RAGAS_NOTEBOOK_REQUIRED_SIGNALS.includes(check.ragasNotebookSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (RAGAS_NOTEBOOK_ARTIFACT_SIGNALS.has(check.ragasNotebookSignalType) && !isSha256Hash(check.artifactHash)) {
    return false;
  }
  if (check.ragasNotebookSignalType === "source_repository_boundary") {
    return uniqueTrimmed(check.repositoryRefs ?? []).length > 0 &&
      uniqueTrimmed(check.licenseBoundaryRefs ?? []).length > 0;
  }
  if (check.ragasNotebookSignalType === "notebook_manifest") {
    return uniqueTrimmed(check.notebookIds ?? []).length > 0;
  }
  if (check.ragasNotebookSignalType === "dependency_manifest") {
    return uniqueTrimmed(check.dependencyIds ?? []).length > 0;
  }
  if (check.ragasNotebookSignalType === "document_corpus") {
    return uniqueTrimmed(check.documentCorpusIds ?? []).length > 0;
  }
  if (check.ragasNotebookSignalType === "chunking_config") {
    return uniqueTrimmed(check.chunkingConfigIds ?? []).length > 0;
  }
  if (check.ragasNotebookSignalType === "testset_generator_config") {
    return uniqueTrimmed(check.testsetGeneratorIds ?? []).length > 0;
  }
  if (check.ragasNotebookSignalType === "evolution_mix") {
    const evolutions = new Set(check.evolutionTypes ?? []);
    return evolutions.has("simple") && evolutions.has("reasoning") && evolutions.has("multi_context");
  }
  if (check.ragasNotebookSignalType === "generated_testset_manifest") {
    return uniqueTrimmed(check.testsetIds ?? []).length > 0 &&
      Number.isFinite(check.ragasQuestionCount) &&
      (check.ragasQuestionCount ?? 0) >= thresholds.minSampleSize;
  }
  if (check.ragasNotebookSignalType === "rag_chain_config") {
    return uniqueTrimmed(check.ragChainIds ?? []).length > 0;
  }
  if (check.ragasNotebookSignalType === "retriever_vectorstore_config") {
    return uniqueTrimmed(check.retrieverIds ?? []).length > 0 &&
      uniqueTrimmed(check.vectorStoreIds ?? []).length > 0;
  }
  if (check.ragasNotebookSignalType === "model_embedding_config") {
    return uniqueTrimmed(check.modelIds ?? []).length > 0 &&
      uniqueTrimmed(check.embeddingModelIds ?? []).length > 0;
  }
  if (check.ragasNotebookSignalType === "answer_context_trace") {
    return uniqueTrimmed(check.answerContextTraceIds ?? []).length > 0 &&
      Number.isFinite(check.ragasQuestionCount) &&
      (check.ragasQuestionCount ?? 0) >= thresholds.minSampleSize;
  }
  if (check.ragasNotebookSignalType === "ragas_metric_suite") {
    const metrics = new Set(uniqueTrimmed(check.metricNames ?? []));
    return metrics.has("faithfulness") &&
      metrics.has("answer_relevancy") &&
      metrics.has("context_precision") &&
      metrics.has("context_recall");
  }
  if (check.ragasNotebookSignalType === "ragas_evaluation_result") {
    return uniqueTrimmed(check.metricNames ?? []).length > 0;
  }
  if (check.ragasNotebookSignalType === "langfuse_trace_score_export") {
    return uniqueTrimmed(check.langfuseTraceIds ?? []).length > 0 &&
      uniqueTrimmed(check.metricNames ?? []).length > 0;
  }
  if (check.ragasNotebookSignalType === "visualization_artifact") {
    return uniqueTrimmed(check.visualizationIds ?? []).length > 0;
  }
  if (check.ragasNotebookSignalType === "metric_owner") {
    return (check.owner ?? "").trim().length > 0;
  }
  if (check.ragasNotebookSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function ragasNotebookSummary(
  checks: MetricValidationRagPipelineCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationRagasNotebookSignal[];
  metricNames: string[];
  questionCount: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.ragasNotebookSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      metricNames: [],
      questionCount: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isRagasNotebookCheckCovered(check, thresholds));
  const coveredSignals = new Set(covered.map((check) => check.ragasNotebookSignalType as MetricValidationRagasNotebookSignal));
  const questionCounts = covered
    .map((check) => check.ragasQuestionCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / RAGAS_NOTEBOOK_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: RAGAS_NOTEBOOK_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    questionCount: questionCounts.length > 0 ? Math.max(...questionCounts) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) => RAGAS_NOTEBOOK_ARTIFACT_SIGNALS.has(check.ragasNotebookSignalType as MetricValidationRagasNotebookSignal) && isSha256Hash(check.artifactHash))
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isMirageRagMetricCheckCovered(
  check: MetricValidationRagPipelineCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.mirageSignalType) return false;
  if (!MIRAGE_RAG_METRIC_REQUIRED_SIGNALS.includes(check.mirageSignalType)) return false;
  if (check.evidenceRefs.filter((ref) => ref.trim().length > 0).length === 0) return false;
  if (MIRAGE_RAG_METRIC_ARTIFACT_SIGNALS.has(check.mirageSignalType) && !isSha256Hash(check.artifactHash)) {
    return false;
  }
  if (
    check.mirageSignalType === "dataset_manifest" &&
    (check.datasetIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.mirageSignalType === "qa_pair_manifest" &&
    (!Number.isFinite(check.qaPairCount) || (check.qaPairCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    (check.mirageSignalType === "context_pool_manifest" || check.mirageSignalType === "retrieval_pool_manifest") &&
    (!Number.isFinite(check.contextPoolCount) || (check.contextPoolCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (check.mirageSignalType === "base_oracle_mixed_protocol") {
    const modes = new Set(check.evaluationModes ?? []);
    return modes.has("base") && modes.has("oracle") && modes.has("mixed");
  }
  if (
    check.mirageSignalType === "retriever_config" &&
    (check.retrieverIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.mirageSignalType === "model_config" &&
    (check.modelIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.mirageSignalType === "llm_result_report" ||
      check.mirageSignalType === "retriever_result_report" ||
      check.mirageSignalType === "mirage_metrics_report" ||
      check.mirageSignalType === "overall_score_formula") &&
    (check.metricNames ?? []).filter((metricName) => metricName.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (check.mirageSignalType === "metric_owner" && (check.owner ?? "").trim().length === 0) {
    return false;
  }
  if (check.mirageSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function mirageRagMetricSummary(
  checks: MetricValidationRagPipelineCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationMirageRagSignal[];
  datasetIds: string[];
  evaluationModes: Array<"base" | "oracle" | "mixed" | "custom">;
  retrieverIds: string[];
  modelIds: string[];
  metricNames: string[];
  qaPairCount: number | null;
  contextPoolCount: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.mirageSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      datasetIds: [],
      evaluationModes: [],
      retrieverIds: [],
      modelIds: [],
      metricNames: [],
      qaPairCount: null,
      contextPoolCount: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isMirageRagMetricCheckCovered(check, thresholds));
  const coveredSignals = new Set(covered.map((check) => check.mirageSignalType as MetricValidationMirageRagSignal));
  const qaPairCounts = covered
    .map((check) => check.qaPairCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const contextPoolCounts = covered
    .map((check) => check.contextPoolCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / MIRAGE_RAG_METRIC_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))],
    missingSignals: MIRAGE_RAG_METRIC_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    datasetIds: [
      ...new Set(scoped
        .flatMap((check) => check.datasetIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    evaluationModes: [
      ...new Set(scoped
        .flatMap((check) => check.evaluationModes ?? [])
        .filter((mode): mode is "base" | "oracle" | "mixed" | "custom" =>
          mode === "base" || mode === "oracle" || mode === "mixed" || mode === "custom"
        ))
    ],
    retrieverIds: [
      ...new Set(scoped
        .flatMap((check) => check.retrieverIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    modelIds: [
      ...new Set(scoped
        .flatMap((check) => check.modelIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    metricNames: [
      ...new Set(scoped
        .flatMap((check) => check.metricNames ?? [])
        .map((metricName) => metricName.trim())
        .filter((metricName) => metricName.length > 0))
    ],
    qaPairCount: qaPairCounts.length > 0 ? Math.max(...qaPairCounts) : null,
    contextPoolCount: contextPoolCounts.length > 0 ? Math.max(...contextPoolCounts) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) => MIRAGE_RAG_METRIC_ARTIFACT_SIGNALS.has(check.mirageSignalType as MetricValidationMirageRagSignal) && isSha256Hash(check.artifactHash))
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function legalCodeRagTechniqueForSignal(
  signal: MetricValidationLegalCodeRagSignal
): string | null {
  if (signal === "windowing_config") return "windowing";
  if (signal === "hybrid_search_config") return "hybrid_search";
  if (signal === "query_rewrite_config") return "query_rewriting";
  if (signal === "routing_policy_config") return "routing";
  return null;
}

function isLegalCodeRagMetricCheckCovered(
  check: MetricValidationRagPipelineCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.legalCodeRagSignalType) return false;
  if (!LEGAL_CODE_RAG_REQUIRED_SIGNALS.includes(check.legalCodeRagSignalType)) return false;
  if (check.evidenceRefs.filter((ref) => ref.trim().length > 0).length === 0) return false;
  if (LEGAL_CODE_RAG_ARTIFACT_SIGNALS.has(check.legalCodeRagSignalType) && !isSha256Hash(check.artifactHash)) {
    return false;
  }
  if (
    check.legalCodeRagSignalType === "legal_corpus_manifest" &&
    uniqueTrimmed(check.legalCodeIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.legalCodeRagSignalType === "legifrance_source_boundary" &&
    uniqueTrimmed(check.jurisdictionIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.legalCodeRagSignalType === "retriever_config" &&
    uniqueTrimmed(check.retrieverIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.legalCodeRagSignalType === "vector_database_config" &&
    uniqueTrimmed(check.vectorStoreIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.legalCodeRagSignalType === "embedding_model_config" &&
    uniqueTrimmed(check.embeddingModelIds ?? []).length === 0
  ) {
    return false;
  }
  const requiredTechnique = legalCodeRagTechniqueForSignal(check.legalCodeRagSignalType);
  if (requiredTechnique) {
    return uniqueTrimmed(check.retrievalTechniqueIds ?? []).includes(requiredTechnique);
  }
  if (
    check.legalCodeRagSignalType === "evaluation_dataset" &&
    (uniqueTrimmed(check.evaluationDatasetIds ?? []).length === 0 ||
      !Number.isFinite(check.legalQuestionCount) ||
      (check.legalQuestionCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    check.legalCodeRagSignalType === "reference_answer_manifest" &&
    (!Number.isFinite(check.legalQuestionCount) || (check.legalQuestionCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    check.legalCodeRagSignalType === "metric_definition" &&
    uniqueTrimmed(check.metricNames ?? []).length === 0
  ) {
    return false;
  }
  if (check.legalCodeRagSignalType === "metric_owner" && (check.owner ?? "").trim().length === 0) {
    return false;
  }
  if (check.legalCodeRagSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function legalCodeRagMetricSummary(
  checks: MetricValidationRagPipelineCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationLegalCodeRagSignal[];
  legalCodeIds: string[];
  jurisdictionIds: string[];
  retrievalTechniqueIds: string[];
  vectorStoreIds: string[];
  embeddingModelIds: string[];
  evaluationDatasetIds: string[];
  metricNames: string[];
  legalQuestionCount: number | null;
  metricOwners: string[];
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.legalCodeRagSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      legalCodeIds: [],
      jurisdictionIds: [],
      retrievalTechniqueIds: [],
      vectorStoreIds: [],
      embeddingModelIds: [],
      evaluationDatasetIds: [],
      metricNames: [],
      legalQuestionCount: null,
      metricOwners: [],
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isLegalCodeRagMetricCheckCovered(check, thresholds));
  const coveredSignals = new Set(covered.map((check) => check.legalCodeRagSignalType as MetricValidationLegalCodeRagSignal));
  const legalQuestionCounts = covered
    .map((check) => check.legalQuestionCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / LEGAL_CODE_RAG_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: LEGAL_CODE_RAG_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    legalCodeIds: uniqueTrimmed(scoped.flatMap((check) => check.legalCodeIds ?? [])),
    jurisdictionIds: uniqueTrimmed(scoped.flatMap((check) => check.jurisdictionIds ?? [])),
    retrievalTechniqueIds: uniqueTrimmed(scoped.flatMap((check) => check.retrievalTechniqueIds ?? [])),
    vectorStoreIds: uniqueTrimmed(scoped.flatMap((check) => check.vectorStoreIds ?? [])),
    embeddingModelIds: uniqueTrimmed(scoped.flatMap((check) => check.embeddingModelIds ?? [])),
    evaluationDatasetIds: uniqueTrimmed(scoped.flatMap((check) => check.evaluationDatasetIds ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    legalQuestionCount: legalQuestionCounts.length > 0 ? Math.max(...legalQuestionCounts) : null,
    metricOwners: uniqueTrimmed(scoped.map((check) => check.owner)),
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) => LEGAL_CODE_RAG_ARTIFACT_SIGNALS.has(check.legalCodeRagSignalType as MetricValidationLegalCodeRagSignal) && isSha256Hash(check.artifactHash))
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isGuardbenchMetricCheckCovered(
  check: MetricValidationGuardbenchCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.guardbenchSignalType) return false;
  if (!GUARDBENCH_METRIC_REQUIRED_SIGNALS.includes(check.guardbenchSignalType)) return false;
  if (check.evidenceRefs.filter((ref) => ref.trim().length > 0).length === 0) return false;
  if (GUARDBENCH_METRIC_ARTIFACT_SIGNALS.has(check.guardbenchSignalType) && !isSha256Hash(check.artifactHash)) {
    return false;
  }
  if (
    check.guardbenchSignalType === "dataset_manifest" &&
    (check.datasetIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.guardbenchSignalType === "language_coverage" &&
    (check.languageIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.guardbenchSignalType === "guardrail_model_config" &&
    (check.modelIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.guardbenchSignalType === "threshold_config" &&
    (check.thresholdIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.guardbenchSignalType === "metric_suite_report" ||
      check.guardbenchSignalType === "confusion_matrix_report") &&
    (check.metricNames ?? []).filter((metricName) => metricName.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.guardbenchSignalType === "leaderboard_or_export_report" &&
    (check.exportFormats ?? []).filter((format) => format.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (check.guardbenchSignalType === "metric_owner" && (check.owner ?? "").trim().length === 0) {
    return false;
  }
  if (check.guardbenchSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function guardbenchMetricSummary(
  checks: MetricValidationGuardbenchCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationGuardbenchSignal[];
  datasetIds: string[];
  languageIds: string[];
  modelIds: string[];
  thresholdIds: string[];
  metricNames: string[];
  exportFormats: string[];
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.guardbenchSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      datasetIds: [],
      languageIds: [],
      modelIds: [],
      thresholdIds: [],
      metricNames: [],
      exportFormats: [],
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isGuardbenchMetricCheckCovered(check, thresholds));
  const coveredSignals = new Set(covered.map((check) => check.guardbenchSignalType as MetricValidationGuardbenchSignal));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / GUARDBENCH_METRIC_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))],
    missingSignals: GUARDBENCH_METRIC_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    datasetIds: [
      ...new Set(scoped
        .flatMap((check) => check.datasetIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    languageIds: [
      ...new Set(scoped
        .flatMap((check) => check.languageIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    modelIds: [
      ...new Set(scoped
        .flatMap((check) => check.modelIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    thresholdIds: [
      ...new Set(scoped
        .flatMap((check) => check.thresholdIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    metricNames: [
      ...new Set(scoped
        .flatMap((check) => check.metricNames ?? [])
        .map((metricName) => metricName.trim())
        .filter((metricName) => metricName.length > 0))
    ],
    exportFormats: [
      ...new Set(scoped
        .flatMap((check) => check.exportFormats ?? [])
        .map((format) => format.trim())
        .filter((format) => format.length > 0))
    ],
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) => GUARDBENCH_METRIC_ARTIFACT_SIGNALS.has(check.guardbenchSignalType as MetricValidationGuardbenchSignal) && isSha256Hash(check.artifactHash))
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isEmbodiedAgentCheckCovered(
  check: MetricValidationEmbodiedAgentCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.embodiedSignalType) return false;
  if (!EMBODIED_AGENT_REQUIRED_SIGNALS.includes(check.embodiedSignalType)) return false;
  if (check.evidenceRefs.filter((ref) => ref.trim().length > 0).length === 0) return false;
  if (EMBODIED_AGENT_ARTIFACT_SIGNALS.has(check.embodiedSignalType) && !isSha256Hash(check.artifactHash)) {
    return false;
  }
  if (
    check.embodiedSignalType === "task_type_coverage" &&
    (check.taskTypes ?? []).filter((taskType) => taskType.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.embodiedSignalType === "random_baseline" ||
      check.embodiedSignalType === "human_baseline" ||
      check.embodiedSignalType === "model_baseline") &&
    (check.baselineIds ?? []).filter((baselineId) => baselineId.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.embodiedSignalType === "overall_metric_report" ||
      check.embodiedSignalType === "task_type_metric_report") &&
    (check.metricNames ?? []).filter((metricName) => metricName.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (check.embodiedSignalType === "metric_owner" && (check.owner ?? "").trim().length === 0) {
    return false;
  }
  if (check.embodiedSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function embodiedAgentSummary(
  checks: MetricValidationEmbodiedAgentCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationEmbodiedAgentSignal[];
  taskTypes: string[];
  baselineIds: string[];
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.embodiedSignalType !== undefined
  );
  if (scoped.length === 0) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      taskTypes: [],
      baselineIds: [],
      reportArtifactHashes: []
    };
  }

  const coveredSignals = new Set(
    scoped
      .filter((check) => isEmbodiedAgentCheckCovered(check, thresholds))
      .map((check) => check.embodiedSignalType as MetricValidationEmbodiedAgentSignal)
  );
  const missingSignals = EMBODIED_AGENT_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / EMBODIED_AGENT_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))],
    missingSignals,
    taskTypes: [
      ...new Set(scoped
        .flatMap((check) => check.taskTypes ?? [])
        .map((taskType) => taskType.trim())
        .filter((taskType) => taskType.length > 0))
    ],
    baselineIds: [
      ...new Set(scoped
        .flatMap((check) => check.baselineIds ?? [])
        .map((baselineId) => baselineId.trim())
        .filter((baselineId) => baselineId.length > 0))
    ],
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          (check.embodiedSignalType === "overall_metric_report" ||
            check.embodiedSignalType === "task_type_metric_report") &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => check.artifactHash as string))
    ]
  };
}

function isEvaluatorSuiteCheckCovered(
  check: MetricValidationEvaluatorSuiteCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.evaluatorSignalType) return false;
  if (!EVALUATOR_SUITE_REQUIRED_SIGNALS.includes(check.evaluatorSignalType)) return false;
  if (check.evidenceRefs.filter((ref) => ref.trim().length > 0).length === 0) return false;
  if (EVALUATOR_SUITE_ARTIFACT_SIGNALS.has(check.evaluatorSignalType) && !isSha256Hash(check.artifactHash)) {
    return false;
  }
  if (
    check.evaluatorSignalType === "deterministic_assertion" &&
    (check.assertionTypes ?? []).filter((assertionType) => assertionType.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.evaluatorSignalType === "llm_judge_criterion" || check.evaluatorSignalType === "custom_judge_definition") &&
    (check.judgeNames ?? []).filter((judgeName) => judgeName.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.evaluatorSignalType === "reporter_output" &&
    (check.reporterFormats ?? []).filter((format) => format.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (check.evaluatorSignalType === "metric_owner" && (check.owner ?? "").trim().length === 0) {
    return false;
  }
  if (check.evaluatorSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function evaluatorSuiteSummary(
  checks: MetricValidationEvaluatorSuiteCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationEvaluatorSuiteSignal[];
  assertionTypes: string[];
  reporterFormats: string[];
  judgeNames: string[];
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.evaluatorSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      assertionTypes: [],
      reporterFormats: [],
      judgeNames: [],
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isEvaluatorSuiteCheckCovered(check, thresholds));
  const coveredSignals = new Set(covered.map((check) => check.evaluatorSignalType as MetricValidationEvaluatorSuiteSignal));
  const missingSignals = EVALUATOR_SUITE_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / EVALUATOR_SUITE_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))],
    missingSignals,
    assertionTypes: [
      ...new Set(scoped
        .flatMap((check) => check.assertionTypes ?? [])
        .map((assertionType) => assertionType.trim())
        .filter((assertionType) => assertionType.length > 0))
    ],
    reporterFormats: [
      ...new Set(scoped
        .flatMap((check) => check.reporterFormats ?? [])
        .map((format) => format.trim())
        .filter((format) => format.length > 0))
    ],
    judgeNames: [
      ...new Set(scoped
        .flatMap((check) => check.judgeNames ?? [])
        .map((judgeName) => judgeName.trim())
        .filter((judgeName) => judgeName.length > 0))
    ],
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) => check.evaluatorSignalType === "reporter_output" && isSha256Hash(check.artifactHash))
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isPentestBenchmarkCheckCovered(
  check: MetricValidationPentestBenchmarkCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.pentestSignalType) return false;
  if (!PENTEST_BENCHMARK_REQUIRED_SIGNALS.includes(check.pentestSignalType)) return false;
  if (check.evidenceRefs.filter((ref) => ref.trim().length > 0).length === 0) return false;
  if (PENTEST_BENCHMARK_ARTIFACT_SIGNALS.has(check.pentestSignalType) && !isSha256Hash(check.artifactHash)) {
    return false;
  }
  if (
    check.pentestSignalType === "language_stack_coverage" &&
    (check.languageStacks ?? []).filter((stack) => stack.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.pentestSignalType === "vulnerability_class_coverage" &&
    (check.vulnerabilityClasses ?? []).filter((vulnClass) => vulnClass.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.pentestSignalType === "difficulty_distribution" &&
    (check.difficultyLevels ?? []).filter((level) => level.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.pentestSignalType === "security_control_effectiveness" ||
      check.pentestSignalType === "exploit_success_metric" ||
      check.pentestSignalType === "profit_threshold_metric" ||
      check.pentestSignalType === "false_positive_trap") &&
    (check.metricNames ?? []).filter((metricName) => metricName.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.pentestSignalType === "source_repository_license" ||
      check.pentestSignalType === "benchmark_release_manifest" ||
      check.pentestSignalType === "task_id_manifest" ||
      check.pentestSignalType === "target_image_manifest" ||
      check.pentestSignalType === "runtime_controller_manifest" ||
      check.pentestSignalType === "firewall_isolation_config" ||
      check.pentestSignalType === "llm_proxy_config" ||
      check.pentestSignalType === "smart_contract_dataset_manifest" ||
      check.pentestSignalType === "historical_fork_manifest" ||
      check.pentestSignalType === "problem_metadata_manifest" ||
      check.pentestSignalType === "flaw_verifier_contract_manifest" ||
      check.pentestSignalType === "forge_grader_result" ||
      check.pentestSignalType === "anti_cheat_reset_proof" ||
      check.pentestSignalType === "dataset_cutoff_split" ||
      check.pentestSignalType === "dockerized_app_manifest" ||
      check.pentestSignalType === "multi_step_chain_coverage" ||
      check.pentestSignalType === "threat_model_ground_truth" ||
      check.pentestSignalType === "threat_model_report") &&
    (check.benchmarkSuiteIds ?? []).filter((suiteId) => suiteId.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (check.pentestSignalType === "metric_owner" && (check.owner ?? "").trim().length === 0) {
    return false;
  }
  if (check.pentestSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function pentestBenchmarkSummary(
  checks: MetricValidationPentestBenchmarkCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationPentestBenchmarkSignal[];
  languageStacks: string[];
  vulnerabilityClasses: string[];
  difficultyLevels: string[];
  benchmarkSuiteIds: string[];
  metricNames: string[];
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.pentestSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      languageStacks: [],
      vulnerabilityClasses: [],
      difficultyLevels: [],
      benchmarkSuiteIds: [],
      metricNames: [],
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isPentestBenchmarkCheckCovered(check, thresholds));
  const coveredSignals = new Set(covered.map((check) => check.pentestSignalType as MetricValidationPentestBenchmarkSignal));
  const missingSignals = PENTEST_BENCHMARK_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / PENTEST_BENCHMARK_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))],
    missingSignals,
    languageStacks: [
      ...new Set(scoped
        .flatMap((check) => check.languageStacks ?? [])
        .map((stack) => stack.trim())
        .filter((stack) => stack.length > 0))
    ],
    vulnerabilityClasses: [
      ...new Set(scoped
        .flatMap((check) => check.vulnerabilityClasses ?? [])
        .map((vulnClass) => vulnClass.trim())
        .filter((vulnClass) => vulnClass.length > 0))
    ],
    difficultyLevels: [
      ...new Set(scoped
        .flatMap((check) => check.difficultyLevels ?? [])
        .map((level) => level.trim())
        .filter((level) => level.length > 0))
    ],
    benchmarkSuiteIds: [
      ...new Set(scoped
        .flatMap((check) => check.benchmarkSuiteIds ?? [])
        .map((suiteId) => suiteId.trim())
        .filter((suiteId) => suiteId.length > 0))
    ],
    metricNames: [
      ...new Set(scoped
        .flatMap((check) => check.metricNames ?? [])
        .map((metricName) => metricName.trim())
        .filter((metricName) => metricName.length > 0))
    ],
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          (check.pentestSignalType === "exploit_execution_trace" ||
            check.pentestSignalType === "exploit_success_metric" ||
            check.pentestSignalType === "profit_threshold_metric" ||
            check.pentestSignalType === "threat_model_report") &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isTraceEvaluationCheckCovered(
  check: MetricValidationTraceEvaluationCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.traceEvaluationSignalType) return false;
  if (!TRACE_EVALUATION_REQUIRED_SIGNALS.includes(check.traceEvaluationSignalType)) return false;
  if (check.evidenceRefs.filter((ref) => ref.trim().length > 0).length === 0) return false;
  if (TRACE_EVALUATION_ARTIFACT_SIGNALS.has(check.traceEvaluationSignalType) && !isSha256Hash(check.artifactHash)) {
    return false;
  }
  if (
    check.traceEvaluationSignalType === "bedrock_converse_model_config" &&
    (check.modelIds ?? []).filter((modelId) => modelId.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.traceEvaluationSignalType === "agent_parameter_manifest" &&
    (check.agentParameterKeys ?? []).filter((key) => key.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.traceEvaluationSignalType === "tool_registry_manifest" &&
    (check.toolNames ?? []).filter((toolName) => toolName.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.traceEvaluationSignalType === "repeatable_case_manifest" ||
      check.traceEvaluationSignalType === "bulk_case_run_manifest") &&
    (check.caseSuiteIds ?? []).filter((suiteId) => suiteId.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.traceEvaluationSignalType === "run_permutation_manifest" &&
    (!Number.isFinite(check.runPermutationCount) || (check.runPermutationCount ?? 0) < 1)
  ) {
    return false;
  }
  if (
    (check.traceEvaluationSignalType === "mock_llm_backend_control" ||
      check.traceEvaluationSignalType === "production_monitor_binding") &&
    (check.backendModes ?? []).filter((mode) => mode.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.traceEvaluationSignalType === "metric_definition_manifest" ||
      check.traceEvaluationSignalType === "measurement_export_manifest" ||
      check.traceEvaluationSignalType === "production_monitor_binding" ||
      check.traceEvaluationSignalType === "threshold_alarm_config") &&
    (check.metricNames ?? []).filter((metricName) => metricName.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (check.traceEvaluationSignalType === "metric_owner" && (check.owner ?? "").trim().length === 0) {
    return false;
  }
  if (check.traceEvaluationSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function traceEvaluationSummary(
  checks: MetricValidationTraceEvaluationCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationTraceEvaluationSignal[];
  modelIds: string[];
  agentParameterKeys: string[];
  toolNames: string[];
  metricNames: string[];
  caseSuiteIds: string[];
  backendModes: string[];
  runPermutationCount: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.traceEvaluationSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      modelIds: [],
      agentParameterKeys: [],
      toolNames: [],
      metricNames: [],
      caseSuiteIds: [],
      backendModes: [],
      runPermutationCount: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isTraceEvaluationCheckCovered(check, thresholds));
  const coveredSignals = new Set(covered.map((check) => check.traceEvaluationSignalType as MetricValidationTraceEvaluationSignal));
  const missingSignals = TRACE_EVALUATION_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal));
  const runPermutationCounts = scoped
    .map((check) => check.runPermutationCount ?? 0)
    .filter((count) => Number.isFinite(count) && count > 0);
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / TRACE_EVALUATION_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))],
    missingSignals,
    modelIds: [
      ...new Set(scoped
        .flatMap((check) => check.modelIds ?? [])
        .map((modelId) => modelId.trim())
        .filter((modelId) => modelId.length > 0))
    ],
    agentParameterKeys: [
      ...new Set(scoped
        .flatMap((check) => check.agentParameterKeys ?? [])
        .map((key) => key.trim())
        .filter((key) => key.length > 0))
    ],
    toolNames: [
      ...new Set(scoped
        .flatMap((check) => check.toolNames ?? [])
        .map((toolName) => toolName.trim())
        .filter((toolName) => toolName.length > 0))
    ],
    metricNames: [
      ...new Set(scoped
        .flatMap((check) => check.metricNames ?? [])
        .map((metricName) => metricName.trim())
        .filter((metricName) => metricName.length > 0))
    ],
    caseSuiteIds: [
      ...new Set(scoped
        .flatMap((check) => check.caseSuiteIds ?? [])
        .map((suiteId) => suiteId.trim())
        .filter((suiteId) => suiteId.length > 0))
    ],
    backendModes: [
      ...new Set(scoped
        .flatMap((check) => check.backendModes ?? [])
        .map((mode) => mode.trim())
        .filter((mode) => mode.length > 0))
    ],
    runPermutationCount: runPermutationCounts.length > 0 ? Math.max(...runPermutationCounts) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) => TRACE_EVALUATION_ARTIFACT_SIGNALS.has(check.traceEvaluationSignalType as MetricValidationTraceEvaluationSignal) && isSha256Hash(check.artifactHash))
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isLivingEnvironmentCheckCovered(
  check: MetricValidationLivingEnvironmentCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.livingEnvironmentSignalType) return false;
  if (!LIVING_ENVIRONMENT_REQUIRED_SIGNALS.includes(check.livingEnvironmentSignalType)) return false;
  if (check.evidenceRefs.filter((ref) => ref.trim().length > 0).length === 0) return false;
  if (
    LIVING_ENVIRONMENT_ARTIFACT_SIGNALS.has(check.livingEnvironmentSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (
    check.livingEnvironmentSignalType === "capability_manifest" &&
    (check.capabilityNames ?? []).filter((name) => name.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.livingEnvironmentSignalType === "sandbox_provider_config" &&
    (check.sandboxProviders ?? []).filter((provider) => provider.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.livingEnvironmentSignalType === "agent_adapter_manifest" &&
    (check.agentAdapters ?? []).filter((adapter) => adapter.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.livingEnvironmentSignalType === "trial_result_artifact" ||
      check.livingEnvironmentSignalType === "aggregate_metric_report" ||
      check.livingEnvironmentSignalType === "pass_at_k_metric") &&
    (!Number.isFinite(check.trialCount) || (check.trialCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    (check.livingEnvironmentSignalType === "aggregate_metric_report" ||
      check.livingEnvironmentSignalType === "pass_at_k_metric") &&
    (check.metricNames ?? []).filter((metricName) => metricName.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.livingEnvironmentSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.livingEnvironmentSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function livingEnvironmentSummary(
  checks: MetricValidationLivingEnvironmentCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationLivingEnvironmentSignal[];
  capabilityNames: string[];
  sandboxProviders: string[];
  agentAdapters: string[];
  metricNames: string[];
  trialCount: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.livingEnvironmentSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      capabilityNames: [],
      sandboxProviders: [],
      agentAdapters: [],
      metricNames: [],
      trialCount: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isLivingEnvironmentCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.livingEnvironmentSignalType as MetricValidationLivingEnvironmentSignal)
  );
  const trialCounts = covered
    .map((check) => check.trialCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / LIVING_ENVIRONMENT_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))],
    missingSignals: LIVING_ENVIRONMENT_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    capabilityNames: [
      ...new Set(scoped
        .flatMap((check) => check.capabilityNames ?? [])
        .map((name) => name.trim())
        .filter((name) => name.length > 0))
    ],
    sandboxProviders: [
      ...new Set(scoped
        .flatMap((check) => check.sandboxProviders ?? [])
        .map((provider) => provider.trim())
        .filter((provider) => provider.length > 0))
    ],
    agentAdapters: [
      ...new Set(scoped
        .flatMap((check) => check.agentAdapters ?? [])
        .map((adapter) => adapter.trim())
        .filter((adapter) => adapter.length > 0))
    ],
    metricNames: [
      ...new Set(scoped
        .flatMap((check) => check.metricNames ?? [])
        .map((metricName) => metricName.trim())
        .filter((metricName) => metricName.length > 0))
    ],
    trialCount: trialCounts.length > 0 ? Math.max(...trialCounts) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          LIVING_ENVIRONMENT_ARTIFACT_SIGNALS.has(check.livingEnvironmentSignalType as MetricValidationLivingEnvironmentSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isMobileAgentCheckCovered(
  check: MetricValidationMobileAgentCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.mobileAgentSignalType) return false;
  if (!MOBILE_AGENT_REQUIRED_SIGNALS.includes(check.mobileAgentSignalType)) return false;
  if (check.evidenceRefs.filter((ref) => ref.trim().length > 0).length === 0) return false;
  if (
    MOBILE_AGENT_ARTIFACT_SIGNALS.has(check.mobileAgentSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (
    (check.mobileAgentSignalType === "benchmark_manifest" ||
      check.mobileAgentSignalType === "paper_or_source_reference") &&
    (check.benchmarkIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.mobileAgentSignalType === "mobile_environment_manifest" ||
      check.mobileAgentSignalType === "environment_reset_policy" ||
      check.mobileAgentSignalType === "device_state_fixture") &&
    (check.environmentIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.mobileAgentSignalType === "app_inventory_manifest" &&
    (check.appIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.mobileAgentSignalType === "api_catalog_manifest" &&
    (check.apiCatalogIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.mobileAgentSignalType === "ui_automation_trace" &&
    (check.uiTraceIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.mobileAgentSignalType === "task_dataset_manifest" ||
      check.mobileAgentSignalType === "multi_app_task_manifest") &&
    (check.taskSetIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.mobileAgentSignalType === "task_complexity_manifest" &&
    (check.taskComplexityGroups ?? []).filter((group) => group.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.mobileAgentSignalType === "checkpoint_metric_rubric" ||
      check.mobileAgentSignalType === "checkpoint_result_artifact" ||
      check.mobileAgentSignalType === "result_report_artifact") &&
    (check.metricNames ?? []).filter((metricName) => metricName.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.mobileAgentSignalType === "dataset_license_boundary" &&
    (check.licenseBoundaryRefs ?? []).filter((ref) => ref.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (check.mobileAgentSignalType === "metric_owner" && (check.owner ?? "").trim().length === 0) {
    return false;
  }
  if (check.mobileAgentSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function mobileAgentSummary(
  checks: MetricValidationMobileAgentCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationMobileAgentSignal[];
  benchmarkIds: string[];
  environmentIds: string[];
  appIds: string[];
  apiCatalogIds: string[];
  uiTraceIds: string[];
  taskSetIds: string[];
  taskComplexityGroups: string[];
  checkpointMetricNames: string[];
  licenseBoundaryRefs: string[];
  trialCount: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.mobileAgentSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      benchmarkIds: [],
      environmentIds: [],
      appIds: [],
      apiCatalogIds: [],
      uiTraceIds: [],
      taskSetIds: [],
      taskComplexityGroups: [],
      checkpointMetricNames: [],
      licenseBoundaryRefs: [],
      trialCount: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isMobileAgentCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.mobileAgentSignalType as MetricValidationMobileAgentSignal)
  );
  const trialCounts = covered
    .map((check) => check.trialCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / MOBILE_AGENT_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))],
    missingSignals: MOBILE_AGENT_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    benchmarkIds: [
      ...new Set(scoped
        .flatMap((check) => check.benchmarkIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    environmentIds: [
      ...new Set(scoped
        .flatMap((check) => check.environmentIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    appIds: [
      ...new Set(scoped
        .flatMap((check) => check.appIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    apiCatalogIds: [
      ...new Set(scoped
        .flatMap((check) => check.apiCatalogIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    uiTraceIds: [
      ...new Set(scoped
        .flatMap((check) => check.uiTraceIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    taskSetIds: [
      ...new Set(scoped
        .flatMap((check) => check.taskSetIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    taskComplexityGroups: [
      ...new Set(scoped
        .flatMap((check) => check.taskComplexityGroups ?? [])
        .map((group) => group.trim())
        .filter((group) => group.length > 0))
    ],
    checkpointMetricNames: [
      ...new Set(scoped
        .flatMap((check) => check.metricNames ?? [])
        .map((metricName) => metricName.trim())
        .filter((metricName) => metricName.length > 0))
    ],
    licenseBoundaryRefs: [
      ...new Set(scoped
        .flatMap((check) => check.licenseBoundaryRefs ?? [])
        .map((ref) => ref.trim())
        .filter((ref) => ref.length > 0))
    ],
    trialCount: trialCounts.length > 0 ? Math.max(...trialCounts) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          MOBILE_AGENT_ARTIFACT_SIGNALS.has(check.mobileAgentSignalType as MetricValidationMobileAgentSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isPersonaAgentCheckCovered(
  check: MetricValidationPersonaAgentCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.personaSignalType) return false;
  if (!PERSONA_AGENT_REQUIRED_SIGNALS.includes(check.personaSignalType)) return false;
  if (check.evidenceRefs.filter((ref) => ref.trim().length > 0).length === 0) return false;
  if (PERSONA_AGENT_ARTIFACT_SIGNALS.has(check.personaSignalType) && !isSha256Hash(check.artifactHash)) {
    return false;
  }
  if (
    check.personaSignalType === "persona_manifest" &&
    (check.personaIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.personaSignalType === "static_environment_manifest" &&
    (check.environmentIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.personaSignalType === "benchmark_question_set" &&
    ((check.questionSetIds ?? []).filter((id) => id.trim().length > 0).length === 0 ||
      !Number.isFinite(check.questionCount) ||
      (check.questionCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    check.personaSignalType === "model_provider_config" &&
    ((check.modelIds ?? []).filter((id) => id.trim().length > 0).length === 0 ||
      (check.providerIds ?? []).filter((id) => id.trim().length > 0).length === 0)
  ) {
    return false;
  }
  if (
    (check.personaSignalType === "personascore_metric_definition" ||
      check.personaSignalType === "human_alignment_calibration" ||
      check.personaSignalType === "evaluation_output_artifact" ||
      check.personaSignalType === "benchmark_result_manifest") &&
    (check.metricNames ?? []).filter((metricName) => metricName.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (check.personaSignalType === "metric_owner" && (check.owner ?? "").trim().length === 0) {
    return false;
  }
  if (check.personaSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function personaAgentSummary(
  checks: MetricValidationPersonaAgentCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationPersonaAgentSignal[];
  personaIds: string[];
  environmentIds: string[];
  questionSetIds: string[];
  modelIds: string[];
  providerIds: string[];
  metricNames: string[];
  questionCount: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.personaSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      personaIds: [],
      environmentIds: [],
      questionSetIds: [],
      modelIds: [],
      providerIds: [],
      metricNames: [],
      questionCount: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isPersonaAgentCheckCovered(check, thresholds));
  const coveredSignals = new Set(covered.map((check) => check.personaSignalType as MetricValidationPersonaAgentSignal));
  const questionCounts = covered
    .map((check) => check.questionCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / PERSONA_AGENT_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))],
    missingSignals: PERSONA_AGENT_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    personaIds: [
      ...new Set(scoped
        .flatMap((check) => check.personaIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    environmentIds: [
      ...new Set(scoped
        .flatMap((check) => check.environmentIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    questionSetIds: [
      ...new Set(scoped
        .flatMap((check) => check.questionSetIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    modelIds: [
      ...new Set(scoped
        .flatMap((check) => check.modelIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    providerIds: [
      ...new Set(scoped
        .flatMap((check) => check.providerIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    metricNames: [
      ...new Set(scoped
        .flatMap((check) => check.metricNames ?? [])
        .map((metricName) => metricName.trim())
        .filter((metricName) => metricName.length > 0))
    ],
    questionCount: questionCounts.length > 0 ? Math.max(...questionCounts) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) => PERSONA_AGENT_ARTIFACT_SIGNALS.has(check.personaSignalType as MetricValidationPersonaAgentSignal) && isSha256Hash(check.artifactHash))
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isScientificLiteratureCheckCovered(
  check: MetricValidationScientificLiteratureCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.scientificLiteratureSignalType) return false;
  if (!SCIENTIFIC_LITERATURE_REQUIRED_SIGNALS.includes(check.scientificLiteratureSignalType)) return false;
  if (check.evidenceRefs.filter((ref) => ref.trim().length > 0).length === 0) return false;
  if (
    SCIENTIFIC_LITERATURE_ARTIFACT_SIGNALS.has(check.scientificLiteratureSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (
    check.scientificLiteratureSignalType === "benchmark_manifest" &&
    (check.benchmarkIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.scientificLiteratureSignalType === "deep_research_task_manifest" ||
      check.scientificLiteratureSignalType === "wide_research_task_manifest") &&
    ((check.taskTypes ?? []).filter((taskType) => taskType.trim().length > 0).length === 0 ||
      !Number.isFinite(check.taskCount) ||
      (check.taskCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    (check.scientificLiteratureSignalType === "released_dataset_manifest" ||
      check.scientificLiteratureSignalType === "dataset_obfuscation_manifest" ||
      check.scientificLiteratureSignalType === "literature_corpus_manifest") &&
    (check.datasetIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.scientificLiteratureSignalType === "search_backend_config" &&
    (check.searchBackendIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.scientificLiteratureSignalType === "deepxiv_tool_config" ||
      check.scientificLiteratureSignalType === "web_search_tool_config") &&
    (check.toolIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.scientificLiteratureSignalType === "deep_search_accuracy_metric" ||
      check.scientificLiteratureSignalType === "wide_search_iou_metric" ||
      check.scientificLiteratureSignalType === "result_report_artifact") &&
    (check.metricNames ?? []).filter((metricName) => metricName.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.scientificLiteratureSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.scientificLiteratureSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function scientificLiteratureSummary(
  checks: MetricValidationScientificLiteratureCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationScientificLiteratureSignal[];
  benchmarkIds: string[];
  taskTypes: string[];
  datasetIds: string[];
  searchBackendIds: string[];
  toolIds: string[];
  metricNames: string[];
  taskCount: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.scientificLiteratureSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      benchmarkIds: [],
      taskTypes: [],
      datasetIds: [],
      searchBackendIds: [],
      toolIds: [],
      metricNames: [],
      taskCount: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isScientificLiteratureCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.scientificLiteratureSignalType as MetricValidationScientificLiteratureSignal)
  );
  const taskCounts = covered
    .map((check) => check.taskCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / SCIENTIFIC_LITERATURE_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))],
    missingSignals: SCIENTIFIC_LITERATURE_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    benchmarkIds: [
      ...new Set(scoped
        .flatMap((check) => check.benchmarkIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    taskTypes: [
      ...new Set(scoped
        .flatMap((check) => check.taskTypes ?? [])
        .map((taskType) => taskType.trim())
        .filter((taskType) => taskType.length > 0))
    ],
    datasetIds: [
      ...new Set(scoped
        .flatMap((check) => check.datasetIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    searchBackendIds: [
      ...new Set(scoped
        .flatMap((check) => check.searchBackendIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    toolIds: [
      ...new Set(scoped
        .flatMap((check) => check.toolIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    metricNames: [
      ...new Set(scoped
        .flatMap((check) => check.metricNames ?? [])
        .map((metricName) => metricName.trim())
        .filter((metricName) => metricName.length > 0))
    ],
    taskCount: taskCounts.length > 0 ? Math.max(...taskCounts) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          check.scientificLiteratureSignalType === "result_report_artifact" &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isBioinformaticsAgentCheckCovered(
  check: MetricValidationBioinformaticsAgentCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.bioinformaticsAgentSignalType) return false;
  if (!BIOINFORMATICS_AGENT_REQUIRED_SIGNALS.includes(check.bioinformaticsAgentSignalType)) return false;
  if (check.evidenceRefs.filter((ref) => ref.trim().length > 0).length === 0) return false;
  if (
    BIOINFORMATICS_AGENT_ARTIFACT_SIGNALS.has(check.bioinformaticsAgentSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (
    (check.bioinformaticsAgentSignalType === "benchmark_manifest" ||
      check.bioinformaticsAgentSignalType === "paper_or_source_reference") &&
    (check.benchmarkIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.bioinformaticsAgentSignalType === "bioinformatics_task_manifest" &&
    ((check.taskTypes ?? []).filter((taskType) => taskType.trim().length > 0).length === 0 ||
      !Number.isFinite(check.taskCount) ||
      (check.taskCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    (check.bioinformaticsAgentSignalType === "dataset_input_manifest" ||
      check.bioinformaticsAgentSignalType === "truth_reference_manifest") &&
    (check.datasetIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.bioinformaticsAgentSignalType === "workflow_reproduction_manifest" ||
      check.bioinformaticsAgentSignalType === "docker_or_environment_manifest" ||
      check.bioinformaticsAgentSignalType === "agent_harness_manifest") &&
    (check.workflowIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.bioinformaticsAgentSignalType === "tool_version_manifest" &&
    (check.toolNames ?? []).filter((name) => name.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.bioinformaticsAgentSignalType === "grader_config_manifest" ||
      check.bioinformaticsAgentSignalType === "result_artifact_manifest") &&
    (check.metricNames ?? []).filter((metricName) => metricName.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.bioinformaticsAgentSignalType === "perturbation_suite_manifest" &&
    (check.perturbationIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.bioinformaticsAgentSignalType === "privacy_boundary_manifest" &&
    (check.privacyBoundaryRefs ?? []).filter((ref) => ref.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.bioinformaticsAgentSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.bioinformaticsAgentSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function bioinformaticsAgentSummary(
  checks: MetricValidationBioinformaticsAgentCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationBioinformaticsAgentSignal[];
  benchmarkIds: string[];
  taskTypes: string[];
  datasetIds: string[];
  workflowIds: string[];
  toolNames: string[];
  metricNames: string[];
  perturbationIds: string[];
  privacyBoundaryRefs: string[];
  taskCount: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.bioinformaticsAgentSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      benchmarkIds: [],
      taskTypes: [],
      datasetIds: [],
      workflowIds: [],
      toolNames: [],
      metricNames: [],
      perturbationIds: [],
      privacyBoundaryRefs: [],
      taskCount: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isBioinformaticsAgentCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.bioinformaticsAgentSignalType as MetricValidationBioinformaticsAgentSignal)
  );
  const taskCounts = covered
    .map((check) => check.taskCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / BIOINFORMATICS_AGENT_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))],
    missingSignals: BIOINFORMATICS_AGENT_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    benchmarkIds: [
      ...new Set(scoped
        .flatMap((check) => check.benchmarkIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    taskTypes: [
      ...new Set(scoped
        .flatMap((check) => check.taskTypes ?? [])
        .map((taskType) => taskType.trim())
        .filter((taskType) => taskType.length > 0))
    ],
    datasetIds: [
      ...new Set(scoped
        .flatMap((check) => check.datasetIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    workflowIds: [
      ...new Set(scoped
        .flatMap((check) => check.workflowIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    toolNames: [
      ...new Set(scoped
        .flatMap((check) => check.toolNames ?? [])
        .map((name) => name.trim())
        .filter((name) => name.length > 0))
    ],
    metricNames: [
      ...new Set(scoped
        .flatMap((check) => check.metricNames ?? [])
        .map((metricName) => metricName.trim())
        .filter((metricName) => metricName.length > 0))
    ],
    perturbationIds: [
      ...new Set(scoped
        .flatMap((check) => check.perturbationIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    privacyBoundaryRefs: [
      ...new Set(scoped
        .flatMap((check) => check.privacyBoundaryRefs ?? [])
        .map((ref) => ref.trim())
        .filter((ref) => ref.length > 0))
    ],
    taskCount: taskCounts.length > 0 ? Math.max(...taskCounts) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          BIOINFORMATICS_AGENT_ARTIFACT_SIGNALS.has(check.bioinformaticsAgentSignalType as MetricValidationBioinformaticsAgentSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function positiveFinite(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasNonEmptyValues(values: string[] | undefined): boolean {
  return (values ?? []).some((value) => value.trim().length > 0);
}

function isMirageDrugRepositioningCheckCovered(
  check: MetricValidationMirageDrugRepositioningCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.mirageDrugRepositioningSignalType) return false;
  if (!MIRAGE_DRUG_REPOSITIONING_REQUIRED_SIGNALS.includes(check.mirageDrugRepositioningSignalType)) return false;
  if (!hasNonEmptyValues(check.evidenceRefs)) return false;
  if (
    MIRAGE_DRUG_REPOSITIONING_ARTIFACT_SIGNALS.has(check.mirageDrugRepositioningSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (
    check.mirageDrugRepositioningSignalType === "benchmark_identity" &&
    !hasNonEmptyValues(check.benchmarkIds)
  ) {
    return false;
  }
  if (
    check.mirageDrugRepositioningSignalType === "dataset_release_manifest" &&
    (!hasNonEmptyValues(check.datasetIds) || !positiveFinite(check.drugCount) || !positiveFinite(check.diseaseCount))
  ) {
    return false;
  }
  if (
    check.mirageDrugRepositioningSignalType === "train_test_split_manifest" &&
    !hasNonEmptyValues(check.splitIds)
  ) {
    return false;
  }
  if (
    check.mirageDrugRepositioningSignalType === "drug_disease_mapping_manifest" &&
    (!hasNonEmptyValues(check.mappingIds) || !positiveFinite(check.mappingCount))
  ) {
    return false;
  }
  if (
    check.mirageDrugRepositioningSignalType === "drug_feature_manifest" &&
    (!hasNonEmptyValues(check.featureSetIds) || !positiveFinite(check.drugCount) || !positiveFinite(check.featureSetCount))
  ) {
    return false;
  }
  if (
    check.mirageDrugRepositioningSignalType === "disease_feature_manifest" &&
    (!hasNonEmptyValues(check.featureSetIds) || !positiveFinite(check.diseaseCount) || !positiveFinite(check.featureSetCount))
  ) {
    return false;
  }
  if (
    check.mirageDrugRepositioningSignalType === "similarity_matrix_manifest" &&
    (!hasNonEmptyValues(check.similarityMatrixIds) || !positiveFinite(check.similarityMatrixCount))
  ) {
    return false;
  }
  if (
    check.mirageDrugRepositioningSignalType === "negative_sampling_protocol" &&
    !hasNonEmptyValues(check.negativeSamplingIds)
  ) {
    return false;
  }
  if (
    check.mirageDrugRepositioningSignalType === "classifier_config" &&
    !hasNonEmptyValues(check.classifierConfigIds)
  ) {
    return false;
  }
  if (
    check.mirageDrugRepositioningSignalType === "feature_selection_report" &&
    !hasNonEmptyValues(check.featureSelectionReportIds)
  ) {
    return false;
  }
  if (
    check.mirageDrugRepositioningSignalType === "score_calculation_manifest" &&
    !hasNonEmptyValues(check.scoreCalculationIds)
  ) {
    return false;
  }
  if (
    check.mirageDrugRepositioningSignalType === "evaluation_report" &&
    !hasNonEmptyValues(check.metricNames)
  ) {
    return false;
  }
  if (
    check.mirageDrugRepositioningSignalType === "case_study_validation" &&
    !hasNonEmptyValues(check.caseStudyIds)
  ) {
    return false;
  }
  if (
    check.mirageDrugRepositioningSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.mirageDrugRepositioningSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function maxFinite(values: Array<number | undefined>): number | null {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return finite.length > 0 ? Math.max(...finite) : null;
}

function mirageDrugRepositioningSummary(
  checks: MetricValidationMirageDrugRepositioningCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationMirageDrugRepositioningSignal[];
  benchmarkIds: string[];
  datasetIds: string[];
  splitIds: string[];
  mappingIds: string[];
  featureSetIds: string[];
  similarityMatrixIds: string[];
  negativeSamplingIds: string[];
  classifierConfigIds: string[];
  featureSelectionReportIds: string[];
  scoreCalculationIds: string[];
  caseStudyIds: string[];
  metricNames: string[];
  drugCount: number | null;
  diseaseCount: number | null;
  mappingCount: number | null;
  featureSetCount: number | null;
  similarityMatrixCount: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.mirageDrugRepositioningSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      benchmarkIds: [],
      datasetIds: [],
      splitIds: [],
      mappingIds: [],
      featureSetIds: [],
      similarityMatrixIds: [],
      negativeSamplingIds: [],
      classifierConfigIds: [],
      featureSelectionReportIds: [],
      scoreCalculationIds: [],
      caseStudyIds: [],
      metricNames: [],
      drugCount: null,
      diseaseCount: null,
      mappingCount: null,
      featureSetCount: null,
      similarityMatrixCount: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isMirageDrugRepositioningCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.mirageDrugRepositioningSignalType as MetricValidationMirageDrugRepositioningSignal)
  );
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / MIRAGE_DRUG_REPOSITIONING_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))],
    missingSignals: MIRAGE_DRUG_REPOSITIONING_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    benchmarkIds: uniqueTrimmed(scoped.flatMap((check) => check.benchmarkIds ?? [])),
    datasetIds: uniqueTrimmed(scoped.flatMap((check) => check.datasetIds ?? [])),
    splitIds: uniqueTrimmed(scoped.flatMap((check) => check.splitIds ?? [])),
    mappingIds: uniqueTrimmed(scoped.flatMap((check) => check.mappingIds ?? [])),
    featureSetIds: uniqueTrimmed(scoped.flatMap((check) => check.featureSetIds ?? [])),
    similarityMatrixIds: uniqueTrimmed(scoped.flatMap((check) => check.similarityMatrixIds ?? [])),
    negativeSamplingIds: uniqueTrimmed(scoped.flatMap((check) => check.negativeSamplingIds ?? [])),
    classifierConfigIds: uniqueTrimmed(scoped.flatMap((check) => check.classifierConfigIds ?? [])),
    featureSelectionReportIds: uniqueTrimmed(scoped.flatMap((check) => check.featureSelectionReportIds ?? [])),
    scoreCalculationIds: uniqueTrimmed(scoped.flatMap((check) => check.scoreCalculationIds ?? [])),
    caseStudyIds: uniqueTrimmed(scoped.flatMap((check) => check.caseStudyIds ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    drugCount: maxFinite(scoped.map((check) => check.drugCount)),
    diseaseCount: maxFinite(scoped.map((check) => check.diseaseCount)),
    mappingCount: maxFinite(scoped.map((check) => check.mappingCount)),
    featureSetCount: maxFinite(scoped.map((check) => check.featureSetCount)),
    similarityMatrixCount: maxFinite(scoped.map((check) => check.similarityMatrixCount)),
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          MIRAGE_DRUG_REPOSITIONING_ARTIFACT_SIGNALS.has(
            check.mirageDrugRepositioningSignalType as MetricValidationMirageDrugRepositioningSignal
          ) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isNetworkTroubleshootingCheckCovered(
  check: MetricValidationNetworkTroubleshootingCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.networkTroubleshootingSignalType) return false;
  if (!NETWORK_TROUBLESHOOTING_REQUIRED_SIGNALS.includes(check.networkTroubleshootingSignalType)) return false;
  if (check.evidenceRefs.filter((ref) => ref.trim().length > 0).length === 0) return false;
  if (
    NETWORK_TROUBLESHOOTING_ARTIFACT_SIGNALS.has(check.networkTroubleshootingSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (
    check.networkTroubleshootingSignalType === "benchmark_manifest" &&
    (check.benchmarkIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.networkTroubleshootingSignalType === "network_scenario_manifest" &&
    (check.scenarioIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.networkTroubleshootingSignalType === "topology_tier_manifest" &&
    (check.topologyTiers ?? []).filter((tier) => tier.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.networkTroubleshootingSignalType === "incident_catalog_manifest" ||
      check.networkTroubleshootingSignalType === "fault_injection_manifest" ||
      check.networkTroubleshootingSignalType === "root_cause_ground_truth" ||
      check.networkTroubleshootingSignalType === "localization_ground_truth") &&
    ((check.issueTypes ?? []).filter((issueType) => issueType.trim().length > 0).length === 0 ||
      !Number.isFinite(check.incidentCount) ||
      (check.incidentCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    (check.networkTroubleshootingSignalType === "session_trace_manifest" ||
      check.networkTroubleshootingSignalType === "agent_interface_manifest") &&
    (check.agentIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.networkTroubleshootingSignalType === "mcp_tool_manifest" &&
    (check.toolNames ?? []).filter((name) => name.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.networkTroubleshootingSignalType === "evaluation_metric_manifest" ||
      check.networkTroubleshootingSignalType === "judge_config_manifest" ||
      check.networkTroubleshootingSignalType === "batch_summary_artifact") &&
    (check.metricNames ?? []).filter((metricName) => metricName.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.networkTroubleshootingSignalType === "traffic_workload_manifest" &&
    (check.scenarioIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.networkTroubleshootingSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.networkTroubleshootingSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function networkTroubleshootingSummary(
  checks: MetricValidationNetworkTroubleshootingCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationNetworkTroubleshootingSignal[];
  benchmarkIds: string[];
  scenarioIds: string[];
  topologyTiers: string[];
  issueTypes: string[];
  agentIds: string[];
  toolNames: string[];
  metricNames: string[];
  incidentCount: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.networkTroubleshootingSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      benchmarkIds: [],
      scenarioIds: [],
      topologyTiers: [],
      issueTypes: [],
      agentIds: [],
      toolNames: [],
      metricNames: [],
      incidentCount: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isNetworkTroubleshootingCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.networkTroubleshootingSignalType as MetricValidationNetworkTroubleshootingSignal)
  );
  const incidentCounts = covered
    .map((check) => check.incidentCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / NETWORK_TROUBLESHOOTING_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))],
    missingSignals: NETWORK_TROUBLESHOOTING_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    benchmarkIds: [
      ...new Set(scoped
        .flatMap((check) => check.benchmarkIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    scenarioIds: [
      ...new Set(scoped
        .flatMap((check) => check.scenarioIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    topologyTiers: [
      ...new Set(scoped
        .flatMap((check) => check.topologyTiers ?? [])
        .map((tier) => tier.trim())
        .filter((tier) => tier.length > 0))
    ],
    issueTypes: [
      ...new Set(scoped
        .flatMap((check) => check.issueTypes ?? [])
        .map((issueType) => issueType.trim())
        .filter((issueType) => issueType.length > 0))
    ],
    agentIds: [
      ...new Set(scoped
        .flatMap((check) => check.agentIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    toolNames: [
      ...new Set(scoped
        .flatMap((check) => check.toolNames ?? [])
        .map((name) => name.trim())
        .filter((name) => name.length > 0))
    ],
    metricNames: [
      ...new Set(scoped
        .flatMap((check) => check.metricNames ?? [])
        .map((metricName) => metricName.trim())
        .filter((metricName) => metricName.length > 0))
    ],
    incidentCount: incidentCounts.length > 0 ? Math.max(...incidentCounts) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          NETWORK_TROUBLESHOOTING_ARTIFACT_SIGNALS.has(check.networkTroubleshootingSignalType as MetricValidationNetworkTroubleshootingSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isInferenceOptimizationCheckCovered(
  check: MetricValidationInferenceOptimizationCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.inferenceOptimizationSignalType) return false;
  if (!INFERENCE_OPTIMIZATION_REQUIRED_SIGNALS.includes(check.inferenceOptimizationSignalType)) return false;
  if (check.evidenceRefs.filter((ref) => ref.trim().length > 0).length === 0) return false;
  if (
    INFERENCE_OPTIMIZATION_ARTIFACT_SIGNALS.has(check.inferenceOptimizationSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (
    (check.inferenceOptimizationSignalType === "benchmark_manifest" ||
      check.inferenceOptimizationSignalType === "paper_or_source_reference") &&
    (check.benchmarkIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.inferenceOptimizationSignalType === "scenario_objective_manifest" &&
    (check.scenarioIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.inferenceOptimizationSignalType === "hardware_budget_manifest" &&
    (check.hardwareProfileIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.inferenceOptimizationSignalType === "runtime_backend_manifest" &&
    (check.backendIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.inferenceOptimizationSignalType === "search_space_manifest" &&
    ((check.searchSpaceIds ?? []).filter((id) => id.trim().length > 0).length === 0 ||
      (check.backendIds ?? []).filter((id) => id.trim().length > 0).length === 0)
  ) {
    return false;
  }
  if (
    (check.inferenceOptimizationSignalType === "baseline_comparison_manifest" ||
      check.inferenceOptimizationSignalType === "latency_throughput_metrics" ||
      check.inferenceOptimizationSignalType === "tail_latency_metrics") &&
    (check.metricNames ?? []).filter((name) => name.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    (check.inferenceOptimizationSignalType === "quality_gate_result" ||
      check.inferenceOptimizationSignalType === "integrity_gate_result" ||
      check.inferenceOptimizationSignalType === "supervised_relaunch_result") &&
    (check.gateIds ?? []).filter((id) => id.trim().length > 0).length === 0
  ) {
    return false;
  }
  if (
    check.inferenceOptimizationSignalType === "exploration_trace_manifest" &&
    ((check.agentIds ?? []).filter((id) => id.trim().length > 0).length === 0 ||
      !Number.isFinite(check.runCount) ||
      (check.runCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    check.inferenceOptimizationSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.inferenceOptimizationSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function inferenceOptimizationSummary(
  checks: MetricValidationInferenceOptimizationCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationInferenceOptimizationSignal[];
  benchmarkIds: string[];
  scenarioIds: string[];
  hardwareProfileIds: string[];
  backendIds: string[];
  searchSpaceIds: string[];
  gateIds: string[];
  agentIds: string[];
  metricNames: string[];
  runCount: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.inferenceOptimizationSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      benchmarkIds: [],
      scenarioIds: [],
      hardwareProfileIds: [],
      backendIds: [],
      searchSpaceIds: [],
      gateIds: [],
      agentIds: [],
      metricNames: [],
      runCount: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isInferenceOptimizationCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.inferenceOptimizationSignalType as MetricValidationInferenceOptimizationSignal)
  );
  const runCounts = covered
    .map((check) => check.runCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / INFERENCE_OPTIMIZATION_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))],
    missingSignals: INFERENCE_OPTIMIZATION_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    benchmarkIds: [
      ...new Set(scoped
        .flatMap((check) => check.benchmarkIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    scenarioIds: [
      ...new Set(scoped
        .flatMap((check) => check.scenarioIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    hardwareProfileIds: [
      ...new Set(scoped
        .flatMap((check) => check.hardwareProfileIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    backendIds: [
      ...new Set(scoped
        .flatMap((check) => check.backendIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    searchSpaceIds: [
      ...new Set(scoped
        .flatMap((check) => check.searchSpaceIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    gateIds: [
      ...new Set(scoped
        .flatMap((check) => check.gateIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    agentIds: [
      ...new Set(scoped
        .flatMap((check) => check.agentIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0))
    ],
    metricNames: [
      ...new Set(scoped
        .flatMap((check) => check.metricNames ?? [])
        .map((name) => name.trim())
        .filter((name) => name.length > 0))
    ],
    runCount: runCounts.length > 0 ? Math.max(...runCounts) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          INFERENCE_OPTIMIZATION_ARTIFACT_SIGNALS.has(check.inferenceOptimizationSignalType as MetricValidationInferenceOptimizationSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isJavaCodingAgentCheckCovered(
  check: MetricValidationJavaCodingAgentCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.javaCodingAgentSignalType) return false;
  if (!JAVA_CODING_AGENT_REQUIRED_SIGNALS.includes(check.javaCodingAgentSignalType)) return false;
  if (check.evidenceRefs.filter((ref) => ref.trim().length > 0).length === 0) return false;
  if (
    JAVA_CODING_AGENT_ARTIFACT_SIGNALS.has(check.javaCodingAgentSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (
    (check.javaCodingAgentSignalType === "benchmark_manifest" ||
      check.javaCodingAgentSignalType === "source_repository_license" ||
      check.javaCodingAgentSignalType === "yaml_benchmark_manifest") &&
    uniqueTrimmed(check.benchmarkIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.javaCodingAgentSignalType === "java_task_manifest" &&
    (uniqueTrimmed(check.taskIds ?? []).length === 0 ||
      uniqueTrimmed(check.taskTypes ?? []).length === 0 ||
      uniqueTrimmed(check.javaProjectIds ?? []).length === 0)
  ) {
    return false;
  }
  if (
    (check.javaCodingAgentSignalType === "workspace_template_manifest" ||
      check.javaCodingAgentSignalType === "isolated_sandbox_manifest" ||
      check.javaCodingAgentSignalType === "provide_lifecycle_trace" ||
      check.javaCodingAgentSignalType === "setup_post_script_manifest") &&
    uniqueTrimmed(check.sandboxIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.javaCodingAgentSignalType === "cli_agent_config" &&
    uniqueTrimmed(check.agentConfigIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    (check.javaCodingAgentSignalType === "cascaded_jury_manifest" ||
      check.javaCodingAgentSignalType === "judge_tier_policy") &&
    uniqueTrimmed(check.judgeTierIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    (check.javaCodingAgentSignalType === "maven_build_check" ||
      check.javaCodingAgentSignalType === "junit_test_result" ||
      check.javaCodingAgentSignalType === "jacoco_coverage_report") &&
    uniqueTrimmed(check.checkTypes ?? []).length === 0
  ) {
    return false;
  }
  if (
    (check.javaCodingAgentSignalType === "result_json_manifest" ||
      check.javaCodingAgentSignalType === "accuracy_pass_at_k_metric") &&
    uniqueTrimmed(check.metricNames ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.javaCodingAgentSignalType === "accuracy_pass_at_k_metric" &&
    (!Number.isFinite(check.trialCount) || (check.trialCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    check.javaCodingAgentSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.javaCodingAgentSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function javaCodingAgentSummary(
  checks: MetricValidationJavaCodingAgentCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationJavaCodingAgentSignal[];
  benchmarkIds: string[];
  taskIds: string[];
  taskTypes: string[];
  javaProjectIds: string[];
  sandboxIds: string[];
  agentConfigIds: string[];
  judgeTierIds: string[];
  checkTypes: string[];
  metricNames: string[];
  trialCount: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.javaCodingAgentSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      benchmarkIds: [],
      taskIds: [],
      taskTypes: [],
      javaProjectIds: [],
      sandboxIds: [],
      agentConfigIds: [],
      judgeTierIds: [],
      checkTypes: [],
      metricNames: [],
      trialCount: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isJavaCodingAgentCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.javaCodingAgentSignalType as MetricValidationJavaCodingAgentSignal)
  );
  const trialCounts = covered
    .map((check) => check.trialCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / JAVA_CODING_AGENT_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: JAVA_CODING_AGENT_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    benchmarkIds: uniqueTrimmed(scoped.flatMap((check) => check.benchmarkIds ?? [])),
    taskIds: uniqueTrimmed(scoped.flatMap((check) => check.taskIds ?? [])),
    taskTypes: uniqueTrimmed(scoped.flatMap((check) => check.taskTypes ?? [])),
    javaProjectIds: uniqueTrimmed(scoped.flatMap((check) => check.javaProjectIds ?? [])),
    sandboxIds: uniqueTrimmed(scoped.flatMap((check) => check.sandboxIds ?? [])),
    agentConfigIds: uniqueTrimmed(scoped.flatMap((check) => check.agentConfigIds ?? [])),
    judgeTierIds: uniqueTrimmed(scoped.flatMap((check) => check.judgeTierIds ?? [])),
    checkTypes: uniqueTrimmed(scoped.flatMap((check) => check.checkTypes ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    trialCount: trialCounts.length > 0 ? Math.max(...trialCounts) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          JAVA_CODING_AGENT_ARTIFACT_SIGNALS.has(check.javaCodingAgentSignalType as MetricValidationJavaCodingAgentSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isWebEvalDatasetCheckCovered(
  check: MetricValidationWebEvalDatasetCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.webEvalDatasetSignalType) return false;
  if (!WEB_EVAL_DATASET_REQUIRED_SIGNALS.includes(check.webEvalDatasetSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (
    WEB_EVAL_DATASET_ARTIFACT_SIGNALS.has(check.webEvalDatasetSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (check.webEvalDatasetSignalType === "benchmark_manifest" && uniqueTrimmed(check.benchmarkIds ?? []).length === 0) {
    return false;
  }
  if (
    check.webEvalDatasetSignalType === "source_repository_reference" &&
    uniqueTrimmed(check.repositoryRefs ?? []).length === 0
  ) {
    return false;
  }
  if (check.webEvalDatasetSignalType === "subject_manifest" && uniqueTrimmed(check.subjectIds ?? []).length === 0) {
    return false;
  }
  if (
    check.webEvalDatasetSignalType === "generated_query_manifest" &&
    (uniqueTrimmed(check.querySetIds ?? []).length === 0 ||
      !Number.isFinite(check.questionCount) ||
      (check.questionCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    check.webEvalDatasetSignalType === "search_provider_config" &&
    uniqueTrimmed(check.searchProviderIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.webEvalDatasetSignalType === "retrieved_document_manifest" &&
    (uniqueTrimmed(check.documentSetIds ?? []).length === 0 ||
      !Number.isFinite(check.documentCount) ||
      (check.documentCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    check.webEvalDatasetSignalType === "document_filter_manifest" &&
    uniqueTrimmed(check.filterPolicyIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.webEvalDatasetSignalType === "qa_generation_manifest" &&
    (uniqueTrimmed(check.qaGenerationIds ?? []).length === 0 ||
      !Number.isFinite(check.questionCount) ||
      (check.questionCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    check.webEvalDatasetSignalType === "reference_answer_manifest" &&
    (uniqueTrimmed(check.referenceAnswerSetIds ?? []).length === 0 ||
      !Number.isFinite(check.questionCount) ||
      (check.questionCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    check.webEvalDatasetSignalType === "dataset_export_manifest" &&
    uniqueTrimmed(check.datasetExportIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.webEvalDatasetSignalType === "output_target_manifest" &&
    uniqueTrimmed(check.outputTargets ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.webEvalDatasetSignalType === "validation_report_artifact" &&
    uniqueTrimmed(check.metricNames ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.webEvalDatasetSignalType === "freshness_snapshot" &&
    (uniqueTrimmed(check.querySetIds ?? []).length === 0 ||
      !Number.isFinite(check.datasetFreshnessHours) ||
      (check.datasetFreshnessHours ?? Number.POSITIVE_INFINITY) > (check.maxFreshnessHours ?? 24))
  ) {
    return false;
  }
  if (
    check.webEvalDatasetSignalType === "provider_diversity_metric" &&
    (!Number.isFinite(check.providerDiversityCount) || (check.providerDiversityCount ?? 0) < 1)
  ) {
    return false;
  }
  if (
    check.webEvalDatasetSignalType === "source_coverage_metric" &&
    (!Number.isFinite(check.sourceCoverage) || (check.sourceCoverage ?? 0) < thresholds.minRagPipelineCoverage)
  ) {
    return false;
  }
  if (
    check.webEvalDatasetSignalType === "answer_grounding_metric" &&
    (!Number.isFinite(check.answerGrounding) || (check.answerGrounding ?? 0) < thresholds.minOutcomeAlignment)
  ) {
    return false;
  }
  if (
    check.webEvalDatasetSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.webEvalDatasetSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function webEvalDatasetSummary(
  checks: MetricValidationWebEvalDatasetCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationWebEvalDatasetSignal[];
  benchmarkIds: string[];
  repositoryRefs: string[];
  subjectIds: string[];
  querySetIds: string[];
  searchProviderIds: string[];
  documentSetIds: string[];
  filterPolicyIds: string[];
  qaGenerationIds: string[];
  referenceAnswerSetIds: string[];
  datasetExportIds: string[];
  outputTargets: string[];
  metricNames: string[];
  questionCount: number | null;
  documentCount: number | null;
  providerDiversityCount: number | null;
  freshnessHours: number | null;
  sourceCoverage: number | null;
  answerGrounding: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.webEvalDatasetSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      benchmarkIds: [],
      repositoryRefs: [],
      subjectIds: [],
      querySetIds: [],
      searchProviderIds: [],
      documentSetIds: [],
      filterPolicyIds: [],
      qaGenerationIds: [],
      referenceAnswerSetIds: [],
      datasetExportIds: [],
      outputTargets: [],
      metricNames: [],
      questionCount: null,
      documentCount: null,
      providerDiversityCount: null,
      freshnessHours: null,
      sourceCoverage: null,
      answerGrounding: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isWebEvalDatasetCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.webEvalDatasetSignalType as MetricValidationWebEvalDatasetSignal)
  );
  const questionCounts = covered
    .map((check) => check.questionCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const documentCounts = covered
    .map((check) => check.documentCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const providerCounts = covered
    .map((check) => check.providerDiversityCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const freshnessHours = covered
    .map((check) => check.datasetFreshnessHours)
    .filter((hours): hours is number => typeof hours === "number" && Number.isFinite(hours));
  const sourceCoverage = covered
    .map((check) => check.sourceCoverage)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const answerGrounding = covered
    .map((check) => check.answerGrounding)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / WEB_EVAL_DATASET_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: WEB_EVAL_DATASET_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    benchmarkIds: uniqueTrimmed(scoped.flatMap((check) => check.benchmarkIds ?? [])),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    subjectIds: uniqueTrimmed(scoped.flatMap((check) => check.subjectIds ?? [])),
    querySetIds: uniqueTrimmed(scoped.flatMap((check) => check.querySetIds ?? [])),
    searchProviderIds: uniqueTrimmed(scoped.flatMap((check) => check.searchProviderIds ?? [])),
    documentSetIds: uniqueTrimmed(scoped.flatMap((check) => check.documentSetIds ?? [])),
    filterPolicyIds: uniqueTrimmed(scoped.flatMap((check) => check.filterPolicyIds ?? [])),
    qaGenerationIds: uniqueTrimmed(scoped.flatMap((check) => check.qaGenerationIds ?? [])),
    referenceAnswerSetIds: uniqueTrimmed(scoped.flatMap((check) => check.referenceAnswerSetIds ?? [])),
    datasetExportIds: uniqueTrimmed(scoped.flatMap((check) => check.datasetExportIds ?? [])),
    outputTargets: uniqueTrimmed(scoped.flatMap((check) => check.outputTargets ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    questionCount: questionCounts.length > 0 ? Math.max(...questionCounts) : null,
    documentCount: documentCounts.length > 0 ? Math.max(...documentCounts) : null,
    providerDiversityCount: providerCounts.length > 0 ? Math.max(...providerCounts) : null,
    freshnessHours: freshnessHours.length > 0 ? Math.max(...freshnessHours) : null,
    sourceCoverage: sourceCoverage.length > 0 ? Math.min(...sourceCoverage) : null,
    answerGrounding: answerGrounding.length > 0 ? Math.min(...answerGrounding) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          WEB_EVAL_DATASET_ARTIFACT_SIGNALS.has(check.webEvalDatasetSignalType as MetricValidationWebEvalDatasetSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isParallelResearchSkillCheckCovered(
  check: MetricValidationParallelResearchSkillCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.parallelResearchSignalType) return false;
  if (!PARALLEL_RESEARCH_SKILL_REQUIRED_SIGNALS.includes(check.parallelResearchSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (
    PARALLEL_RESEARCH_SKILL_ARTIFACT_SIGNALS.has(check.parallelResearchSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (
    check.parallelResearchSignalType === "source_repository_reference" &&
    uniqueTrimmed(check.repositoryRefs ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.parallelResearchSignalType === "license_boundary" &&
    uniqueTrimmed(check.licenseRefs ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.parallelResearchSignalType === "skill_manifest" &&
    uniqueTrimmed(check.skillManifestIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    [
      "api_surface_manifest",
      "chat_grounding_manifest",
      "extract_content_manifest"
    ].includes(check.parallelResearchSignalType) &&
    uniqueTrimmed(check.apiSurfaceIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.parallelResearchSignalType === "search_mode_manifest" &&
    (uniqueTrimmed(check.apiSurfaceIds ?? []).length === 0 || uniqueTrimmed(check.searchModeIds ?? []).length < 2)
  ) {
    return false;
  }
  if (
    check.parallelResearchSignalType === "deep_research_task_manifest" &&
    (uniqueTrimmed(check.apiSurfaceIds ?? []).length === 0 || uniqueTrimmed(check.processorTiers ?? []).length < 3)
  ) {
    return false;
  }
  if (
    check.parallelResearchSignalType === "citation_provenance_report" &&
    (!Number.isFinite(check.citationCoverage0to1) ||
      (check.citationCoverage0to1 ?? 0) < thresholds.minOutcomeAlignment)
  ) {
    return false;
  }
  if (
    check.parallelResearchSignalType === "source_policy_manifest" &&
    (!Number.isFinite(check.sourcePolicyCoverage0to1) ||
      (check.sourcePolicyCoverage0to1 ?? 0) < thresholds.minValidationFacetCoverage)
  ) {
    return false;
  }
  if (
    check.parallelResearchSignalType === "batch_execution_manifest" &&
    (!Number.isFinite(check.batchTaskLimit) || (check.batchTaskLimit ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    check.parallelResearchSignalType === "monitoring_manifest" &&
    (!Number.isFinite(check.monitoringCoverage0to1) ||
      (check.monitoringCoverage0to1 ?? 0) < thresholds.minLifecycleObservabilityCoverage)
  ) {
    return false;
  }
  if (
    check.parallelResearchSignalType === "security_boundary" &&
    uniqueTrimmed(check.securityBoundaryRefs ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.parallelResearchSignalType === "dependency_lock" &&
    uniqueTrimmed(check.dependencyLockIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.parallelResearchSignalType === "benchmark_claim_validation_report" &&
    uniqueTrimmed(check.metricNames ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.parallelResearchSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.parallelResearchSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function parallelResearchSkillSummary(
  checks: MetricValidationParallelResearchSkillCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationParallelResearchSkillSignal[];
  repositoryRefs: string[];
  licenseRefs: string[];
  skillManifestIds: string[];
  apiSurfaceIds: string[];
  searchModeIds: string[];
  processorTiers: string[];
  securityBoundaryRefs: string[];
  dependencyLockIds: string[];
  metricNames: string[];
  citationCoverage0to1: number | null;
  sourcePolicyCoverage0to1: number | null;
  batchTaskLimit: number | null;
  monitoringCoverage0to1: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.parallelResearchSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      repositoryRefs: [],
      licenseRefs: [],
      skillManifestIds: [],
      apiSurfaceIds: [],
      searchModeIds: [],
      processorTiers: [],
      securityBoundaryRefs: [],
      dependencyLockIds: [],
      metricNames: [],
      citationCoverage0to1: null,
      sourcePolicyCoverage0to1: null,
      batchTaskLimit: null,
      monitoringCoverage0to1: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isParallelResearchSkillCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.parallelResearchSignalType as MetricValidationParallelResearchSkillSignal)
  );
  const citationCoverage = covered
    .map((check) => check.citationCoverage0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const sourcePolicyCoverage = covered
    .map((check) => check.sourcePolicyCoverage0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const batchTaskLimits = covered
    .map((check) => check.batchTaskLimit)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const monitoringCoverage = covered
    .map((check) => check.monitoringCoverage0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / PARALLEL_RESEARCH_SKILL_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: PARALLEL_RESEARCH_SKILL_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    skillManifestIds: uniqueTrimmed(scoped.flatMap((check) => check.skillManifestIds ?? [])),
    apiSurfaceIds: uniqueTrimmed(scoped.flatMap((check) => check.apiSurfaceIds ?? [])),
    searchModeIds: uniqueTrimmed(scoped.flatMap((check) => check.searchModeIds ?? [])),
    processorTiers: uniqueTrimmed(scoped.flatMap((check) => check.processorTiers ?? [])),
    securityBoundaryRefs: uniqueTrimmed(scoped.flatMap((check) => check.securityBoundaryRefs ?? [])),
    dependencyLockIds: uniqueTrimmed(scoped.flatMap((check) => check.dependencyLockIds ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    citationCoverage0to1: citationCoverage.length > 0 ? Math.min(...citationCoverage) : null,
    sourcePolicyCoverage0to1: sourcePolicyCoverage.length > 0 ? Math.min(...sourcePolicyCoverage) : null,
    batchTaskLimit: batchTaskLimits.length > 0 ? Math.max(...batchTaskLimits) : null,
    monitoringCoverage0to1: monitoringCoverage.length > 0 ? Math.min(...monitoringCoverage) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          PARALLEL_RESEARCH_SKILL_ARTIFACT_SIGNALS.has(
            check.parallelResearchSignalType as MetricValidationParallelResearchSkillSignal
          ) && isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isResumeRagEvaluatorCheckCovered(
  check: MetricValidationResumeRagEvaluatorCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.resumeRagSignalType) return false;
  if (!RESUME_RAG_EVALUATOR_REQUIRED_SIGNALS.includes(check.resumeRagSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (
    RESUME_RAG_EVALUATOR_ARTIFACT_SIGNALS.has(check.resumeRagSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (
    check.resumeRagSignalType === "source_repository_reference" &&
    uniqueTrimmed(check.repositoryRefs ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.resumeRagSignalType === "license_boundary" &&
    uniqueTrimmed(check.licenseRefs ?? []).length === 0
  ) {
    return false;
  }
  if (
    ["resume_upload_manifest", "resume_parser_manifest"].includes(check.resumeRagSignalType) &&
    uniqueTrimmed(check.resumeInputFormats ?? []).length < 2
  ) {
    return false;
  }
  if (
    check.resumeRagSignalType === "resume_parser_manifest" &&
    (!Number.isFinite(check.parserCoverage0to1) ||
      (check.parserCoverage0to1 ?? 0) < thresholds.minProcessEvidenceCoverage)
  ) {
    return false;
  }
  if (check.resumeRagSignalType === "rag_strategy_manifest" && uniqueTrimmed(check.ragStrategyIds ?? []).length < 3) {
    return false;
  }
  if (
    check.resumeRagSignalType === "query_expansion_manifest" &&
    uniqueTrimmed(check.queryExpansionIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.resumeRagSignalType === "retrieval_config_manifest" &&
    (!Number.isFinite(check.retrievalKMin) ||
      !Number.isFinite(check.retrievalKMax) ||
      (check.retrievalKMin ?? 0) < 1 ||
      (check.retrievalKMax ?? 0) < (check.retrievalKMin ?? 0))
  ) {
    return false;
  }
  if (
    check.resumeRagSignalType === "vector_store_manifest" &&
    uniqueTrimmed(check.vectorStoreIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.resumeRagSignalType === "ollama_model_manifest" &&
    uniqueTrimmed(check.ollamaModelIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.resumeRagSignalType === "embedding_model_manifest" &&
    uniqueTrimmed(check.embeddingModelIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.resumeRagSignalType === "evaluation_endpoint_manifest" &&
    uniqueTrimmed(check.evaluationEndpointIds ?? []).length < 2
  ) {
    return false;
  }
  if (
    check.resumeRagSignalType === "candidate_rating_report" &&
    (typeof check.candidateRatingScale !== "string" ||
      check.candidateRatingScale.trim().length === 0 ||
      uniqueTrimmed(check.metricNames ?? []).length === 0 ||
      !Number.isFinite(check.evaluationGrounding0to1) ||
      (check.evaluationGrounding0to1 ?? 0) < thresholds.minOutcomeAlignment)
  ) {
    return false;
  }
  if (
    check.resumeRagSignalType === "batch_evaluation_manifest" &&
    uniqueTrimmed(check.batchModeIds ?? []).length < 2
  ) {
    return false;
  }
  if (
    check.resumeRagSignalType === "privacy_boundary" &&
    uniqueTrimmed(check.privacyBoundaryRefs ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.resumeRagSignalType === "dependency_lock" &&
    uniqueTrimmed(check.dependencyLockIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.resumeRagSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.resumeRagSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function resumeRagEvaluatorSummary(
  checks: MetricValidationResumeRagEvaluatorCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationResumeRagEvaluatorSignal[];
  repositoryRefs: string[];
  licenseRefs: string[];
  resumeInputFormats: string[];
  ragStrategyIds: string[];
  queryExpansionIds: string[];
  retrievalKMin: number | null;
  retrievalKMax: number | null;
  vectorStoreIds: string[];
  ollamaModelIds: string[];
  embeddingModelIds: string[];
  evaluationEndpointIds: string[];
  candidateRatingScale: string | null;
  batchModeIds: string[];
  privacyBoundaryRefs: string[];
  dependencyLockIds: string[];
  metricNames: string[];
  parserCoverage0to1: number | null;
  evaluationGrounding0to1: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.resumeRagSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      repositoryRefs: [],
      licenseRefs: [],
      resumeInputFormats: [],
      ragStrategyIds: [],
      queryExpansionIds: [],
      retrievalKMin: null,
      retrievalKMax: null,
      vectorStoreIds: [],
      ollamaModelIds: [],
      embeddingModelIds: [],
      evaluationEndpointIds: [],
      candidateRatingScale: null,
      batchModeIds: [],
      privacyBoundaryRefs: [],
      dependencyLockIds: [],
      metricNames: [],
      parserCoverage0to1: null,
      evaluationGrounding0to1: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isResumeRagEvaluatorCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.resumeRagSignalType as MetricValidationResumeRagEvaluatorSignal)
  );
  const retrievalKMin = covered
    .map((check) => check.retrievalKMin)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const retrievalKMax = covered
    .map((check) => check.retrievalKMax)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const parserCoverage = covered
    .map((check) => check.parserCoverage0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const evaluationGrounding = covered
    .map((check) => check.evaluationGrounding0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / RESUME_RAG_EVALUATOR_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: RESUME_RAG_EVALUATOR_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    resumeInputFormats: uniqueTrimmed(scoped.flatMap((check) => check.resumeInputFormats ?? [])),
    ragStrategyIds: uniqueTrimmed(scoped.flatMap((check) => check.ragStrategyIds ?? [])),
    queryExpansionIds: uniqueTrimmed(scoped.flatMap((check) => check.queryExpansionIds ?? [])),
    retrievalKMin: retrievalKMin.length > 0 ? Math.min(...retrievalKMin) : null,
    retrievalKMax: retrievalKMax.length > 0 ? Math.max(...retrievalKMax) : null,
    vectorStoreIds: uniqueTrimmed(scoped.flatMap((check) => check.vectorStoreIds ?? [])),
    ollamaModelIds: uniqueTrimmed(scoped.flatMap((check) => check.ollamaModelIds ?? [])),
    embeddingModelIds: uniqueTrimmed(scoped.flatMap((check) => check.embeddingModelIds ?? [])),
    evaluationEndpointIds: uniqueTrimmed(scoped.flatMap((check) => check.evaluationEndpointIds ?? [])),
    candidateRatingScale: uniqueTrimmed(scoped.flatMap((check) => check.candidateRatingScale ? [check.candidateRatingScale] : []))[0] ?? null,
    batchModeIds: uniqueTrimmed(scoped.flatMap((check) => check.batchModeIds ?? [])),
    privacyBoundaryRefs: uniqueTrimmed(scoped.flatMap((check) => check.privacyBoundaryRefs ?? [])),
    dependencyLockIds: uniqueTrimmed(scoped.flatMap((check) => check.dependencyLockIds ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    parserCoverage0to1: parserCoverage.length > 0 ? Math.min(...parserCoverage) : null,
    evaluationGrounding0to1: evaluationGrounding.length > 0 ? Math.min(...evaluationGrounding) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          RESUME_RAG_EVALUATOR_ARTIFACT_SIGNALS.has(
            check.resumeRagSignalType as MetricValidationResumeRagEvaluatorSignal
          ) && isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isChipBenchmarkCheckCovered(
  check: MetricValidationChipBenchmarkCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.chipBenchmarkSignalType) return false;
  if (!CHIP_BENCHMARK_REQUIRED_SIGNALS.includes(check.chipBenchmarkSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (
    CHIP_BENCHMARK_ARTIFACT_SIGNALS.has(check.chipBenchmarkSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (
    check.chipBenchmarkSignalType === "source_repository_reference" &&
    uniqueTrimmed(check.repositoryRefs ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.chipBenchmarkSignalType === "license_boundary" &&
    uniqueTrimmed(check.licenseRefs ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.chipBenchmarkSignalType === "benchmark_manifest" &&
    uniqueTrimmed(check.benchmarkIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.chipBenchmarkSignalType === "hardware_profile_manifest" &&
    uniqueTrimmed(check.hardwareProfileIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.chipBenchmarkSignalType === "model_family_manifest" &&
    uniqueTrimmed(check.modelFamilyIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.chipBenchmarkSignalType === "precision_mode_manifest" &&
    uniqueTrimmed(check.precisionModeIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.chipBenchmarkSignalType === "environment_setup_script" &&
    uniqueTrimmed(check.environmentIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.chipBenchmarkSignalType === "benchmark_runner_script" &&
    uniqueTrimmed(check.runnerScriptIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.chipBenchmarkSignalType === "serving_backend_script" &&
    uniqueTrimmed(check.servingBackendIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.chipBenchmarkSignalType === "benchmark_result_dataset" &&
    (uniqueTrimmed(check.datasetIds ?? []).length === 0 ||
      !Number.isFinite(check.resultRowCount) ||
      (check.resultRowCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    check.chipBenchmarkSignalType === "frontend_synced_dataset" &&
    uniqueTrimmed(check.frontendDatasetIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.chipBenchmarkSignalType === "pricing_dataset" &&
    uniqueTrimmed(check.pricingRefs ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.chipBenchmarkSignalType === "throughput_metric" &&
    (uniqueTrimmed(check.metricNames ?? []).length === 0 ||
      !Number.isFinite(check.throughputCoverage0to1) ||
      (check.throughputCoverage0to1 ?? 0) < thresholds.minOutcomeAlignment)
  ) {
    return false;
  }
  if (
    check.chipBenchmarkSignalType === "latency_metric" &&
    (uniqueTrimmed(check.metricNames ?? []).length === 0 ||
      !Number.isFinite(check.latencyCoverage0to1) ||
      (check.latencyCoverage0to1 ?? 0) < thresholds.minOutcomeAlignment)
  ) {
    return false;
  }
  if (
    check.chipBenchmarkSignalType === "cost_metric" &&
    (uniqueTrimmed(check.metricNames ?? []).length === 0 ||
      !Number.isFinite(check.costCoverage0to1) ||
      (check.costCoverage0to1 ?? 0) < thresholds.minOutcomeAlignment)
  ) {
    return false;
  }
  if (
    check.chipBenchmarkSignalType === "regression_threshold" &&
    uniqueTrimmed(check.regressionThresholdIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.chipBenchmarkSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.chipBenchmarkSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function chipBenchmarkSummary(
  checks: MetricValidationChipBenchmarkCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationChipBenchmarkSignal[];
  repositoryRefs: string[];
  licenseRefs: string[];
  benchmarkIds: string[];
  hardwareProfileIds: string[];
  modelFamilyIds: string[];
  precisionModeIds: string[];
  environmentIds: string[];
  runnerScriptIds: string[];
  servingBackendIds: string[];
  datasetIds: string[];
  frontendDatasetIds: string[];
  pricingRefs: string[];
  metricNames: string[];
  regressionThresholdIds: string[];
  resultRowCount: number | null;
  throughputCoverage0to1: number | null;
  latencyCoverage0to1: number | null;
  costCoverage0to1: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.chipBenchmarkSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      repositoryRefs: [],
      licenseRefs: [],
      benchmarkIds: [],
      hardwareProfileIds: [],
      modelFamilyIds: [],
      precisionModeIds: [],
      environmentIds: [],
      runnerScriptIds: [],
      servingBackendIds: [],
      datasetIds: [],
      frontendDatasetIds: [],
      pricingRefs: [],
      metricNames: [],
      regressionThresholdIds: [],
      resultRowCount: null,
      throughputCoverage0to1: null,
      latencyCoverage0to1: null,
      costCoverage0to1: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isChipBenchmarkCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.chipBenchmarkSignalType as MetricValidationChipBenchmarkSignal)
  );
  const resultRowCounts = covered
    .map((check) => check.resultRowCount)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const throughputCoverage = covered
    .map((check) => check.throughputCoverage0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const latencyCoverage = covered
    .map((check) => check.latencyCoverage0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const costCoverage = covered
    .map((check) => check.costCoverage0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / CHIP_BENCHMARK_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: CHIP_BENCHMARK_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    benchmarkIds: uniqueTrimmed(scoped.flatMap((check) => check.benchmarkIds ?? [])),
    hardwareProfileIds: uniqueTrimmed(scoped.flatMap((check) => check.hardwareProfileIds ?? [])),
    modelFamilyIds: uniqueTrimmed(scoped.flatMap((check) => check.modelFamilyIds ?? [])),
    precisionModeIds: uniqueTrimmed(scoped.flatMap((check) => check.precisionModeIds ?? [])),
    environmentIds: uniqueTrimmed(scoped.flatMap((check) => check.environmentIds ?? [])),
    runnerScriptIds: uniqueTrimmed(scoped.flatMap((check) => check.runnerScriptIds ?? [])),
    servingBackendIds: uniqueTrimmed(scoped.flatMap((check) => check.servingBackendIds ?? [])),
    datasetIds: uniqueTrimmed(scoped.flatMap((check) => check.datasetIds ?? [])),
    frontendDatasetIds: uniqueTrimmed(scoped.flatMap((check) => check.frontendDatasetIds ?? [])),
    pricingRefs: uniqueTrimmed(scoped.flatMap((check) => check.pricingRefs ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    regressionThresholdIds: uniqueTrimmed(scoped.flatMap((check) => check.regressionThresholdIds ?? [])),
    resultRowCount: resultRowCounts.length > 0 ? Math.max(...resultRowCounts) : null,
    throughputCoverage0to1: throughputCoverage.length > 0 ? Math.min(...throughputCoverage) : null,
    latencyCoverage0to1: latencyCoverage.length > 0 ? Math.min(...latencyCoverage) : null,
    costCoverage0to1: costCoverage.length > 0 ? Math.min(...costCoverage) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          CHIP_BENCHMARK_ARTIFACT_SIGNALS.has(
            check.chipBenchmarkSignalType as MetricValidationChipBenchmarkSignal
          ) && isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isHermesBenchCheckCovered(
  check: MetricValidationHermesBenchCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.hermesBenchSignalType) return false;
  if (!HERMES_BENCH_REQUIRED_SIGNALS.includes(check.hermesBenchSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (HERMES_BENCH_ARTIFACT_SIGNALS.has(check.hermesBenchSignalType) && !isSha256Hash(check.artifactHash)) {
    return false;
  }
  if (check.hermesBenchSignalType === "source_repository_license") {
    return uniqueTrimmed(check.repositoryRefs ?? []).length > 0 &&
      uniqueTrimmed(check.licenseRefs ?? []).length > 0;
  }
  if (check.hermesBenchSignalType === "default_branch_snapshot") {
    return uniqueTrimmed(check.branchRefs ?? []).length > 0 &&
      uniqueTrimmed(check.commitRefs ?? []).length > 0 &&
      uniqueTrimmed(check.treeRefs ?? []).length > 0;
  }
  if (check.hermesBenchSignalType === "readme_build_spec_manifest") {
    return uniqueTrimmed(check.readmeBlobRefs ?? []).length > 0 &&
      uniqueTrimmed(check.buildSpecRefs ?? []).length > 0;
  }
  if (check.hermesBenchSignalType === "backend_runner_manifest") {
    return uniqueTrimmed(check.backendTreeRefs ?? []).length > 0 &&
      uniqueTrimmed(check.runnerIds ?? []).length > 0;
  }
  if (check.hermesBenchSignalType === "judge_calibration_manifest") {
    return uniqueTrimmed(check.judgeIds ?? []).length > 0 &&
      Number.isFinite(check.judgeAgreement0to1) &&
      (check.judgeAgreement0to1 ?? 0) >= thresholds.minHermesBenchJudgeAgreement0to1;
  }
  if (check.hermesBenchSignalType === "task_registry_manifest") {
    return uniqueTrimmed(check.taskRegistryIds ?? []).length > 0 &&
      Number.isFinite(check.taskCount) &&
      (check.taskCount ?? 0) >= thresholds.minHermesBenchTaskCount;
  }
  if (check.hermesBenchSignalType === "model_server_config_manifest") {
    return uniqueTrimmed(check.serverConfigIds ?? []).length > 0;
  }
  if (check.hermesBenchSignalType === "adapter_coverage_manifest") {
    return uniqueTrimmed(check.adapterIds ?? []).length >= thresholds.minHermesBenchAdapterCount &&
      Number.isFinite(check.adapterCount) &&
      (check.adapterCount ?? 0) >= thresholds.minHermesBenchAdapterCount;
  }
  if (check.hermesBenchSignalType === "result_schema_manifest") {
    return uniqueTrimmed(check.resultSchemaIds ?? []).length > 0 &&
      uniqueTrimmed(check.metricNames ?? []).length > 0;
  }
  if (check.hermesBenchSignalType === "frontend_result_review_manifest") {
    return uniqueTrimmed(check.frontendTreeRefs ?? []).length > 0 &&
      uniqueTrimmed(check.frontendComponentIds ?? []).length > 0;
  }
  if (check.hermesBenchSignalType === "backend_regression_manifest") {
    return uniqueTrimmed(check.backendTestIds ?? []).length > 0 &&
      Number.isFinite(check.backendTestCount) &&
      (check.backendTestCount ?? 0) >= thresholds.minHermesBenchBackendTestCount &&
      Number.isFinite(check.regressionPassRate0to1) &&
      (check.regressionPassRate0to1 ?? 0) >= thresholds.minHermesBenchRegressionPassRate0to1;
  }
  if (check.hermesBenchSignalType === "frontend_regression_manifest") {
    return uniqueTrimmed(check.frontendTestIds ?? []).length > 0 &&
      Number.isFinite(check.frontendTestCount) &&
      (check.frontendTestCount ?? 0) >= thresholds.minHermesBenchFrontendTestCount &&
      Number.isFinite(check.regressionPassRate0to1) &&
      (check.regressionPassRate0to1 ?? 0) >= thresholds.minHermesBenchRegressionPassRate0to1;
  }
  if (check.hermesBenchSignalType === "docker_runtime_manifest") {
    return uniqueTrimmed(check.dockerRuntimeIds ?? []).length > 0;
  }
  if (
    check.hermesBenchSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.hermesBenchSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function hermesBenchSummary(
  checks: MetricValidationHermesBenchCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationHermesBenchSignal[];
  repositoryRefs: string[];
  licenseRefs: string[];
  branchRefs: string[];
  commitRefs: string[];
  treeRefs: string[];
  readmeBlobRefs: string[];
  buildSpecRefs: string[];
  backendTreeRefs: string[];
  frontendTreeRefs: string[];
  runnerIds: string[];
  judgeIds: string[];
  taskRegistryIds: string[];
  serverConfigIds: string[];
  adapterIds: string[];
  resultSchemaIds: string[];
  frontendComponentIds: string[];
  backendTestIds: string[];
  frontendTestIds: string[];
  dockerRuntimeIds: string[];
  metricNames: string[];
  taskCount: number | null;
  adapterCount: number | null;
  backendTestCount: number | null;
  frontendTestCount: number | null;
  judgeAgreement0to1: number | null;
  regressionPassRate0to1: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.hermesBenchSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      repositoryRefs: [],
      licenseRefs: [],
      branchRefs: [],
      commitRefs: [],
      treeRefs: [],
      readmeBlobRefs: [],
      buildSpecRefs: [],
      backendTreeRefs: [],
      frontendTreeRefs: [],
      runnerIds: [],
      judgeIds: [],
      taskRegistryIds: [],
      serverConfigIds: [],
      adapterIds: [],
      resultSchemaIds: [],
      frontendComponentIds: [],
      backendTestIds: [],
      frontendTestIds: [],
      dockerRuntimeIds: [],
      metricNames: [],
      taskCount: null,
      adapterCount: null,
      backendTestCount: null,
      frontendTestCount: null,
      judgeAgreement0to1: null,
      regressionPassRate0to1: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isHermesBenchCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.hermesBenchSignalType as MetricValidationHermesBenchSignal)
  );
  const taskCounts = covered
    .map((check) => check.taskCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const adapterCounts = covered
    .map((check) => check.adapterCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const backendTestCounts = covered
    .map((check) => check.backendTestCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const frontendTestCounts = covered
    .map((check) => check.frontendTestCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const judgeAgreements = covered
    .map((check) => check.judgeAgreement0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const regressionPassRates = covered
    .map((check) => check.regressionPassRate0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / HERMES_BENCH_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: HERMES_BENCH_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    branchRefs: uniqueTrimmed(scoped.flatMap((check) => check.branchRefs ?? [])),
    commitRefs: uniqueTrimmed(scoped.flatMap((check) => check.commitRefs ?? [])),
    treeRefs: uniqueTrimmed(scoped.flatMap((check) => check.treeRefs ?? [])),
    readmeBlobRefs: uniqueTrimmed(scoped.flatMap((check) => check.readmeBlobRefs ?? [])),
    buildSpecRefs: uniqueTrimmed(scoped.flatMap((check) => check.buildSpecRefs ?? [])),
    backendTreeRefs: uniqueTrimmed(scoped.flatMap((check) => check.backendTreeRefs ?? [])),
    frontendTreeRefs: uniqueTrimmed(scoped.flatMap((check) => check.frontendTreeRefs ?? [])),
    runnerIds: uniqueTrimmed(scoped.flatMap((check) => check.runnerIds ?? [])),
    judgeIds: uniqueTrimmed(scoped.flatMap((check) => check.judgeIds ?? [])),
    taskRegistryIds: uniqueTrimmed(scoped.flatMap((check) => check.taskRegistryIds ?? [])),
    serverConfigIds: uniqueTrimmed(scoped.flatMap((check) => check.serverConfigIds ?? [])),
    adapterIds: uniqueTrimmed(scoped.flatMap((check) => check.adapterIds ?? [])),
    resultSchemaIds: uniqueTrimmed(scoped.flatMap((check) => check.resultSchemaIds ?? [])),
    frontendComponentIds: uniqueTrimmed(scoped.flatMap((check) => check.frontendComponentIds ?? [])),
    backendTestIds: uniqueTrimmed(scoped.flatMap((check) => check.backendTestIds ?? [])),
    frontendTestIds: uniqueTrimmed(scoped.flatMap((check) => check.frontendTestIds ?? [])),
    dockerRuntimeIds: uniqueTrimmed(scoped.flatMap((check) => check.dockerRuntimeIds ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    taskCount: taskCounts.length > 0 ? Math.max(...taskCounts) : null,
    adapterCount: adapterCounts.length > 0 ? Math.max(...adapterCounts) : null,
    backendTestCount: backendTestCounts.length > 0 ? Math.max(...backendTestCounts) : null,
    frontendTestCount: frontendTestCounts.length > 0 ? Math.max(...frontendTestCounts) : null,
    judgeAgreement0to1: judgeAgreements.length > 0 ? Math.min(...judgeAgreements) : null,
    regressionPassRate0to1: regressionPassRates.length > 0 ? Math.min(...regressionPassRates) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          HERMES_BENCH_ARTIFACT_SIGNALS.has(check.hermesBenchSignalType as MetricValidationHermesBenchSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isCooperBenchCheckCovered(
  check: MetricValidationCooperBenchCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.cooperBenchSignalType) return false;
  if (!COOPER_BENCH_REQUIRED_SIGNALS.includes(check.cooperBenchSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (COOPER_BENCH_ARTIFACT_SIGNALS.has(check.cooperBenchSignalType) && !isSha256Hash(check.artifactHash)) {
    return false;
  }
  if (check.cooperBenchSignalType === "source_repository_license_release") {
    return uniqueTrimmed(check.repositoryRefs ?? []).length > 0 &&
      uniqueTrimmed(check.licenseRefs ?? []).length > 0 &&
      uniqueTrimmed(check.releaseRefs ?? []).length > 0;
  }
  if (check.cooperBenchSignalType === "default_branch_snapshot") {
    return uniqueTrimmed(check.branchRefs ?? []).length > 0 &&
      uniqueTrimmed(check.commitRefs ?? []).length > 0 &&
      uniqueTrimmed(check.treeRefs ?? []).length > 0;
  }
  if (check.cooperBenchSignalType === "readme_changelog_manifest") {
    return uniqueTrimmed(check.readmeBlobRefs ?? []).length > 0 &&
      uniqueTrimmed(check.changelogRefs ?? []).length > 0;
  }
  if (check.cooperBenchSignalType === "dataset_task_manifest") {
    return uniqueTrimmed(check.datasetTreeRefs ?? []).length > 0 &&
      uniqueTrimmed(check.datasetReadmeRefs ?? []).length > 0 &&
      Number.isFinite(check.taskCount) &&
      (check.taskCount ?? 0) >= thresholds.minCooperBenchTaskCount;
  }
  if (check.cooperBenchSignalType === "feature_conflict_manifest") {
    return Number.isFinite(check.featureCount) &&
      (check.featureCount ?? 0) >= thresholds.minCooperBenchFeatureCount;
  }
  if (check.cooperBenchSignalType === "runner_coop_manifest") {
    return uniqueTrimmed(check.runnerIds ?? []).length > 0;
  }
  if (check.cooperBenchSignalType === "eval_backend_manifest") {
    return uniqueTrimmed(check.evalBackendIds ?? []).length > 0;
  }
  if (check.cooperBenchSignalType === "team_harness_manifest") {
    return uniqueTrimmed(check.teamHarnessIds ?? []).length > 0 &&
      Number.isFinite(check.cooperationScore0to1) &&
      (check.cooperationScore0to1 ?? 0) >= thresholds.minCooperBenchCooperationScore0to1;
  }
  if (check.cooperBenchSignalType === "agent_adapter_manifest") {
    return uniqueTrimmed(check.agentAdapterIds ?? []).length >= thresholds.minCooperBenchAgentAdapterCount &&
      Number.isFinite(check.agentAdapterCount) &&
      (check.agentAdapterCount ?? 0) >= thresholds.minCooperBenchAgentAdapterCount;
  }
  if (check.cooperBenchSignalType === "ci_workflow_manifest") {
    return uniqueTrimmed(check.ciWorkflowIds ?? []).length > 0 &&
      Number.isFinite(check.testCount) &&
      (check.testCount ?? 0) >= thresholds.minCooperBenchTestCount &&
      Number.isFinite(check.regressionPassRate0to1) &&
      (check.regressionPassRate0to1 ?? 0) >= thresholds.minCooperBenchRegressionPassRate0to1;
  }
  if (check.cooperBenchSignalType === "package_lock_manifest") {
    return uniqueTrimmed(check.packageLockRefs ?? []).length > 0;
  }
  if (check.cooperBenchSignalType === "report_publication_manifest") {
    return uniqueTrimmed(check.reportPublicationRefs ?? []).length > 0 &&
      Number.isFinite(check.conflictResolutionRate0to1) &&
      (check.conflictResolutionRate0to1 ?? 0) >= thresholds.minCooperBenchConflictResolutionRate0to1;
  }
  if (
    check.cooperBenchSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.cooperBenchSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function cooperBenchSummary(
  checks: MetricValidationCooperBenchCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationCooperBenchSignal[];
  repositoryRefs: string[];
  licenseRefs: string[];
  releaseRefs: string[];
  branchRefs: string[];
  commitRefs: string[];
  treeRefs: string[];
  readmeBlobRefs: string[];
  changelogRefs: string[];
  datasetTreeRefs: string[];
  datasetReadmeRefs: string[];
  runnerIds: string[];
  evalBackendIds: string[];
  teamHarnessIds: string[];
  agentAdapterIds: string[];
  ciWorkflowIds: string[];
  packageLockRefs: string[];
  reportPublicationRefs: string[];
  metricNames: string[];
  taskCount: number | null;
  featureCount: number | null;
  agentAdapterCount: number | null;
  testCount: number | null;
  cooperationScore0to1: number | null;
  conflictResolutionRate0to1: number | null;
  regressionPassRate0to1: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.cooperBenchSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      repositoryRefs: [],
      licenseRefs: [],
      releaseRefs: [],
      branchRefs: [],
      commitRefs: [],
      treeRefs: [],
      readmeBlobRefs: [],
      changelogRefs: [],
      datasetTreeRefs: [],
      datasetReadmeRefs: [],
      runnerIds: [],
      evalBackendIds: [],
      teamHarnessIds: [],
      agentAdapterIds: [],
      ciWorkflowIds: [],
      packageLockRefs: [],
      reportPublicationRefs: [],
      metricNames: [],
      taskCount: null,
      featureCount: null,
      agentAdapterCount: null,
      testCount: null,
      cooperationScore0to1: null,
      conflictResolutionRate0to1: null,
      regressionPassRate0to1: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isCooperBenchCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.cooperBenchSignalType as MetricValidationCooperBenchSignal)
  );
  const taskCounts = covered
    .map((check) => check.taskCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const featureCounts = covered
    .map((check) => check.featureCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const agentAdapterCounts = covered
    .map((check) => check.agentAdapterCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const testCounts = covered
    .map((check) => check.testCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const cooperationScores = covered
    .map((check) => check.cooperationScore0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const conflictResolutionRates = covered
    .map((check) => check.conflictResolutionRate0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const regressionPassRates = covered
    .map((check) => check.regressionPassRate0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / COOPER_BENCH_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: COOPER_BENCH_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    releaseRefs: uniqueTrimmed(scoped.flatMap((check) => check.releaseRefs ?? [])),
    branchRefs: uniqueTrimmed(scoped.flatMap((check) => check.branchRefs ?? [])),
    commitRefs: uniqueTrimmed(scoped.flatMap((check) => check.commitRefs ?? [])),
    treeRefs: uniqueTrimmed(scoped.flatMap((check) => check.treeRefs ?? [])),
    readmeBlobRefs: uniqueTrimmed(scoped.flatMap((check) => check.readmeBlobRefs ?? [])),
    changelogRefs: uniqueTrimmed(scoped.flatMap((check) => check.changelogRefs ?? [])),
    datasetTreeRefs: uniqueTrimmed(scoped.flatMap((check) => check.datasetTreeRefs ?? [])),
    datasetReadmeRefs: uniqueTrimmed(scoped.flatMap((check) => check.datasetReadmeRefs ?? [])),
    runnerIds: uniqueTrimmed(scoped.flatMap((check) => check.runnerIds ?? [])),
    evalBackendIds: uniqueTrimmed(scoped.flatMap((check) => check.evalBackendIds ?? [])),
    teamHarnessIds: uniqueTrimmed(scoped.flatMap((check) => check.teamHarnessIds ?? [])),
    agentAdapterIds: uniqueTrimmed(scoped.flatMap((check) => check.agentAdapterIds ?? [])),
    ciWorkflowIds: uniqueTrimmed(scoped.flatMap((check) => check.ciWorkflowIds ?? [])),
    packageLockRefs: uniqueTrimmed(scoped.flatMap((check) => check.packageLockRefs ?? [])),
    reportPublicationRefs: uniqueTrimmed(scoped.flatMap((check) => check.reportPublicationRefs ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    taskCount: taskCounts.length > 0 ? Math.max(...taskCounts) : null,
    featureCount: featureCounts.length > 0 ? Math.max(...featureCounts) : null,
    agentAdapterCount: agentAdapterCounts.length > 0 ? Math.max(...agentAdapterCounts) : null,
    testCount: testCounts.length > 0 ? Math.max(...testCounts) : null,
    cooperationScore0to1: cooperationScores.length > 0 ? Math.min(...cooperationScores) : null,
    conflictResolutionRate0to1: conflictResolutionRates.length > 0 ? Math.min(...conflictResolutionRates) : null,
    regressionPassRate0to1: regressionPassRates.length > 0 ? Math.min(...regressionPassRates) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          COOPER_BENCH_ARTIFACT_SIGNALS.has(check.cooperBenchSignalType as MetricValidationCooperBenchSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isCoderCupCheckCovered(
  check: MetricValidationCoderCupCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.coderCupSignalType) return false;
  if (!CODER_CUP_REQUIRED_SIGNALS.includes(check.coderCupSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (CODER_CUP_ARTIFACT_SIGNALS.has(check.coderCupSignalType) && !isSha256Hash(check.artifactHash)) {
    return false;
  }
  if (check.coderCupSignalType === "source_repository_license_homepage") {
    return uniqueTrimmed(check.repositoryRefs ?? []).length > 0 &&
      uniqueTrimmed(check.licenseRefs ?? []).length > 0 &&
      uniqueTrimmed(check.homepageRefs ?? []).length > 0;
  }
  if (check.coderCupSignalType === "default_branch_snapshot") {
    return uniqueTrimmed(check.branchRefs ?? []).length > 0 &&
      uniqueTrimmed(check.commitRefs ?? []).length > 0 &&
      uniqueTrimmed(check.treeRefs ?? []).length > 0;
  }
  if (check.coderCupSignalType === "readme_contributing_manifest") {
    return uniqueTrimmed(check.readmeBlobRefs ?? []).length > 0 &&
      uniqueTrimmed(check.contributingRefs ?? []).length > 0;
  }
  if (check.coderCupSignalType === "ci_workflow_manifest") {
    return uniqueTrimmed(check.ciWorkflowIds ?? []).length > 0 &&
      Number.isFinite(check.regressionPassRate0to1) &&
      (check.regressionPassRate0to1 ?? 0) >= thresholds.minCoderCupRegressionPassRate0to1;
  }
  if (check.coderCupSignalType === "package_lock_manifest") {
    return uniqueTrimmed(check.packageManifestRefs ?? []).length > 0 &&
      uniqueTrimmed(check.packageLockRefs ?? []).length > 0;
  }
  if (check.coderCupSignalType === "task_spec_manifest") {
    return uniqueTrimmed(check.taskSpecRefs ?? []).length > 0 &&
      Number.isFinite(check.phaseCount) &&
      (check.phaseCount ?? 0) >= thresholds.minCoderCupPhaseCount;
  }
  if (check.coderCupSignalType === "testsuite_manifest") {
    return uniqueTrimmed(check.testSuiteRefs ?? []).length > 0 &&
      uniqueTrimmed(check.suiteIndexRefs ?? []).length >= thresholds.minCoderCupPhaseCount &&
      Number.isFinite(check.testPlanCount) &&
      (check.testPlanCount ?? 0) >= thresholds.minCoderCupTestPlanCount;
  }
  if (check.coderCupSignalType === "runner_contract_manifest") {
    return uniqueTrimmed(check.runnerIds ?? []).length >= thresholds.minCoderCupRunnerCount &&
      uniqueTrimmed(check.runnerContractRefs ?? []).length > 0 &&
      Number.isFinite(check.runnerCount) &&
      (check.runnerCount ?? 0) >= thresholds.minCoderCupRunnerCount;
  }
  if (check.coderCupSignalType === "score_ledger_manifest") {
    return uniqueTrimmed(check.scoreLedgerRefs ?? []).length > 0 &&
      Number.isFinite(check.scoreLedgerCount) &&
      (check.scoreLedgerCount ?? 0) >= thresholds.minCoderCupScoreLedgerCount;
  }
  if (check.coderCupSignalType === "live_artifact_manifest") {
    return uniqueTrimmed(check.liveArtifactRefs ?? []).length > 0 &&
      uniqueTrimmed(check.publicFixtureRefs ?? []).length > 0 &&
      Number.isFinite(check.liveSurfaceCount) &&
      (check.liveSurfaceCount ?? 0) >= thresholds.minCoderCupLiveSurfaceCount;
  }
  if (check.coderCupSignalType === "methodology_reference_manifest") {
    return uniqueTrimmed(check.methodologyRefs ?? []).length > 0 &&
      uniqueTrimmed(check.referenceRefs ?? []).length > 0 &&
      uniqueTrimmed(check.metricNames ?? []).length > 0;
  }
  if (check.coderCupSignalType === "cost_accounting_manifest") {
    return uniqueTrimmed(check.costMethodologyRefs ?? []).length > 0;
  }
  if (
    check.coderCupSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.coderCupSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      Number.isFinite(check.interRaterAgreement0to1) &&
      (check.interRaterAgreement0to1 ?? 0) >= thresholds.minCoderCupInterRaterAgreement0to1 &&
      Number.isFinite(check.testRetestReliability0to1) &&
      (check.testRetestReliability0to1 ?? 0) >= thresholds.minCoderCupTestRetestReliability0to1 &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function coderCupSummary(
  checks: MetricValidationCoderCupCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationCoderCupSignal[];
  repositoryRefs: string[];
  licenseRefs: string[];
  homepageRefs: string[];
  branchRefs: string[];
  commitRefs: string[];
  treeRefs: string[];
  readmeBlobRefs: string[];
  contributingRefs: string[];
  ciWorkflowIds: string[];
  packageManifestRefs: string[];
  packageLockRefs: string[];
  taskSpecRefs: string[];
  testSuiteRefs: string[];
  suiteIndexRefs: string[];
  runnerIds: string[];
  runnerContractRefs: string[];
  scoreLedgerRefs: string[];
  liveArtifactRefs: string[];
  methodologyRefs: string[];
  referenceRefs: string[];
  costMethodologyRefs: string[];
  publicFixtureRefs: string[];
  metricNames: string[];
  phaseCount: number | null;
  testPlanCount: number | null;
  runnerCount: number | null;
  scoreLedgerCount: number | null;
  liveSurfaceCount: number | null;
  interRaterAgreement0to1: number | null;
  testRetestReliability0to1: number | null;
  regressionPassRate0to1: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.coderCupSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      repositoryRefs: [],
      licenseRefs: [],
      homepageRefs: [],
      branchRefs: [],
      commitRefs: [],
      treeRefs: [],
      readmeBlobRefs: [],
      contributingRefs: [],
      ciWorkflowIds: [],
      packageManifestRefs: [],
      packageLockRefs: [],
      taskSpecRefs: [],
      testSuiteRefs: [],
      suiteIndexRefs: [],
      runnerIds: [],
      runnerContractRefs: [],
      scoreLedgerRefs: [],
      liveArtifactRefs: [],
      methodologyRefs: [],
      referenceRefs: [],
      costMethodologyRefs: [],
      publicFixtureRefs: [],
      metricNames: [],
      phaseCount: null,
      testPlanCount: null,
      runnerCount: null,
      scoreLedgerCount: null,
      liveSurfaceCount: null,
      interRaterAgreement0to1: null,
      testRetestReliability0to1: null,
      regressionPassRate0to1: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isCoderCupCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.coderCupSignalType as MetricValidationCoderCupSignal)
  );
  const phaseCounts = covered
    .map((check) => check.phaseCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const testPlanCounts = covered
    .map((check) => check.testPlanCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const runnerCounts = covered
    .map((check) => check.runnerCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const scoreLedgerCounts = covered
    .map((check) => check.scoreLedgerCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const liveSurfaceCounts = covered
    .map((check) => check.liveSurfaceCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const interRaterAgreements = covered
    .map((check) => check.interRaterAgreement0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const testRetestReliabilities = covered
    .map((check) => check.testRetestReliability0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const regressionPassRates = covered
    .map((check) => check.regressionPassRate0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / CODER_CUP_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: CODER_CUP_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    homepageRefs: uniqueTrimmed(scoped.flatMap((check) => check.homepageRefs ?? [])),
    branchRefs: uniqueTrimmed(scoped.flatMap((check) => check.branchRefs ?? [])),
    commitRefs: uniqueTrimmed(scoped.flatMap((check) => check.commitRefs ?? [])),
    treeRefs: uniqueTrimmed(scoped.flatMap((check) => check.treeRefs ?? [])),
    readmeBlobRefs: uniqueTrimmed(scoped.flatMap((check) => check.readmeBlobRefs ?? [])),
    contributingRefs: uniqueTrimmed(scoped.flatMap((check) => check.contributingRefs ?? [])),
    ciWorkflowIds: uniqueTrimmed(scoped.flatMap((check) => check.ciWorkflowIds ?? [])),
    packageManifestRefs: uniqueTrimmed(scoped.flatMap((check) => check.packageManifestRefs ?? [])),
    packageLockRefs: uniqueTrimmed(scoped.flatMap((check) => check.packageLockRefs ?? [])),
    taskSpecRefs: uniqueTrimmed(scoped.flatMap((check) => check.taskSpecRefs ?? [])),
    testSuiteRefs: uniqueTrimmed(scoped.flatMap((check) => check.testSuiteRefs ?? [])),
    suiteIndexRefs: uniqueTrimmed(scoped.flatMap((check) => check.suiteIndexRefs ?? [])),
    runnerIds: uniqueTrimmed(scoped.flatMap((check) => check.runnerIds ?? [])),
    runnerContractRefs: uniqueTrimmed(scoped.flatMap((check) => check.runnerContractRefs ?? [])),
    scoreLedgerRefs: uniqueTrimmed(scoped.flatMap((check) => check.scoreLedgerRefs ?? [])),
    liveArtifactRefs: uniqueTrimmed(scoped.flatMap((check) => check.liveArtifactRefs ?? [])),
    methodologyRefs: uniqueTrimmed(scoped.flatMap((check) => check.methodologyRefs ?? [])),
    referenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.referenceRefs ?? [])),
    costMethodologyRefs: uniqueTrimmed(scoped.flatMap((check) => check.costMethodologyRefs ?? [])),
    publicFixtureRefs: uniqueTrimmed(scoped.flatMap((check) => check.publicFixtureRefs ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    phaseCount: phaseCounts.length > 0 ? Math.max(...phaseCounts) : null,
    testPlanCount: testPlanCounts.length > 0 ? Math.max(...testPlanCounts) : null,
    runnerCount: runnerCounts.length > 0 ? Math.max(...runnerCounts) : null,
    scoreLedgerCount: scoreLedgerCounts.length > 0 ? Math.max(...scoreLedgerCounts) : null,
    liveSurfaceCount: liveSurfaceCounts.length > 0 ? Math.max(...liveSurfaceCounts) : null,
    interRaterAgreement0to1: interRaterAgreements.length > 0 ? Math.min(...interRaterAgreements) : null,
    testRetestReliability0to1: testRetestReliabilities.length > 0 ? Math.min(...testRetestReliabilities) : null,
    regressionPassRate0to1: regressionPassRates.length > 0 ? Math.min(...regressionPassRates) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          CODER_CUP_ARTIFACT_SIGNALS.has(check.coderCupSignalType as MetricValidationCoderCupSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isAgenticGraphRagCheckCovered(
  check: MetricValidationAgenticGraphRagCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.agenticGraphRagSignalType) return false;
  if (!AGENTIC_GRAPH_RAG_REQUIRED_SIGNALS.includes(check.agenticGraphRagSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (
    AGENTIC_GRAPH_RAG_ARTIFACT_SIGNALS.has(check.agenticGraphRagSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (check.agenticGraphRagSignalType === "source_repository_no_license") {
    return uniqueTrimmed(check.repositoryRefs ?? []).length > 0 &&
      uniqueTrimmed(check.licenseRefs ?? []).length > 0;
  }
  if (check.agenticGraphRagSignalType === "default_branch_snapshot") {
    return uniqueTrimmed(check.branchRefs ?? []).length > 0 &&
      uniqueTrimmed(check.commitRefs ?? []).length > 0 &&
      uniqueTrimmed(check.treeRefs ?? []).length > 0;
  }
  if (check.agenticGraphRagSignalType === "readme_project_manifest") {
    return uniqueTrimmed(check.readmeBlobRefs ?? []).length > 0;
  }
  if (check.agenticGraphRagSignalType === "graph_orchestrator_manifest") {
    return uniqueTrimmed(check.graphWorkflowIds ?? []).length > 0 &&
      uniqueTrimmed(check.orchestratorIds ?? []).length > 0 &&
      Number.isFinite(check.graphNodeCount) &&
      (check.graphNodeCount ?? 0) >= thresholds.minAgenticGraphRagGraphNodeCount;
  }
  if (check.agenticGraphRagSignalType === "rag_pipeline_manifest") {
    return uniqueTrimmed(check.ragPipelineIds ?? []).length > 0 &&
      Number.isFinite(check.retrievalGroundingScore0to1) &&
      (check.retrievalGroundingScore0to1 ?? 0) >= thresholds.minAgenticGraphRagRetrievalGroundingScore0to1;
  }
  if (check.agenticGraphRagSignalType === "database_vector_store_manifest") {
    return uniqueTrimmed(check.databaseIds ?? []).length > 0 &&
      uniqueTrimmed(check.vectorStoreIds ?? []).length > 0;
  }
  if (check.agenticGraphRagSignalType === "evaluation_metric_manifest") {
    return uniqueTrimmed(check.evaluationIds ?? []).length > 0 &&
      uniqueTrimmed(check.metricNames ?? []).length > 0 &&
      Number.isFinite(check.evaluationMetricCount) &&
      (check.evaluationMetricCount ?? 0) >= thresholds.minAgenticGraphRagEvaluationMetricCount &&
      Number.isFinite(check.regressionPassRate0to1) &&
      (check.regressionPassRate0to1 ?? 0) >= thresholds.minAgenticGraphRagRegressionPassRate0to1;
  }
  if (check.agenticGraphRagSignalType === "experiment_tracking_manifest") {
    return uniqueTrimmed(check.experimentTrackerIds ?? []).length > 0 &&
      Number.isFinite(check.experimentCount) &&
      (check.experimentCount ?? 0) >= thresholds.minAgenticGraphRagExperimentCount;
  }
  if (check.agenticGraphRagSignalType === "ui_question_manifest") {
    return uniqueTrimmed(check.uiComponentIds ?? []).length > 0;
  }
  if (check.agenticGraphRagSignalType === "dependency_lock_manifest") {
    return uniqueTrimmed(check.dependencyLockRefs ?? []).length > 0;
  }
  if (
    check.agenticGraphRagSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.agenticGraphRagSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function agenticGraphRagSummary(
  checks: MetricValidationAgenticGraphRagCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationAgenticGraphRagSignal[];
  repositoryRefs: string[];
  licenseRefs: string[];
  branchRefs: string[];
  commitRefs: string[];
  treeRefs: string[];
  readmeBlobRefs: string[];
  graphWorkflowIds: string[];
  orchestratorIds: string[];
  ragPipelineIds: string[];
  databaseIds: string[];
  vectorStoreIds: string[];
  evaluationIds: string[];
  experimentTrackerIds: string[];
  uiComponentIds: string[];
  dependencyLockRefs: string[];
  metricNames: string[];
  graphNodeCount: number | null;
  graphEdgeCount: number | null;
  evaluationMetricCount: number | null;
  experimentCount: number | null;
  retrievalGroundingScore0to1: number | null;
  regressionPassRate0to1: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.agenticGraphRagSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      repositoryRefs: [],
      licenseRefs: [],
      branchRefs: [],
      commitRefs: [],
      treeRefs: [],
      readmeBlobRefs: [],
      graphWorkflowIds: [],
      orchestratorIds: [],
      ragPipelineIds: [],
      databaseIds: [],
      vectorStoreIds: [],
      evaluationIds: [],
      experimentTrackerIds: [],
      uiComponentIds: [],
      dependencyLockRefs: [],
      metricNames: [],
      graphNodeCount: null,
      graphEdgeCount: null,
      evaluationMetricCount: null,
      experimentCount: null,
      retrievalGroundingScore0to1: null,
      regressionPassRate0to1: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isAgenticGraphRagCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.agenticGraphRagSignalType as MetricValidationAgenticGraphRagSignal)
  );
  const graphNodeCounts = covered
    .map((check) => check.graphNodeCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const graphEdgeCounts = covered
    .map((check) => check.graphEdgeCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const evaluationMetricCounts = covered
    .map((check) => check.evaluationMetricCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const experimentCounts = covered
    .map((check) => check.experimentCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const retrievalGroundingScores = covered
    .map((check) => check.retrievalGroundingScore0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const regressionPassRates = covered
    .map((check) => check.regressionPassRate0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / AGENTIC_GRAPH_RAG_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: AGENTIC_GRAPH_RAG_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    branchRefs: uniqueTrimmed(scoped.flatMap((check) => check.branchRefs ?? [])),
    commitRefs: uniqueTrimmed(scoped.flatMap((check) => check.commitRefs ?? [])),
    treeRefs: uniqueTrimmed(scoped.flatMap((check) => check.treeRefs ?? [])),
    readmeBlobRefs: uniqueTrimmed(scoped.flatMap((check) => check.readmeBlobRefs ?? [])),
    graphWorkflowIds: uniqueTrimmed(scoped.flatMap((check) => check.graphWorkflowIds ?? [])),
    orchestratorIds: uniqueTrimmed(scoped.flatMap((check) => check.orchestratorIds ?? [])),
    ragPipelineIds: uniqueTrimmed(scoped.flatMap((check) => check.ragPipelineIds ?? [])),
    databaseIds: uniqueTrimmed(scoped.flatMap((check) => check.databaseIds ?? [])),
    vectorStoreIds: uniqueTrimmed(scoped.flatMap((check) => check.vectorStoreIds ?? [])),
    evaluationIds: uniqueTrimmed(scoped.flatMap((check) => check.evaluationIds ?? [])),
    experimentTrackerIds: uniqueTrimmed(scoped.flatMap((check) => check.experimentTrackerIds ?? [])),
    uiComponentIds: uniqueTrimmed(scoped.flatMap((check) => check.uiComponentIds ?? [])),
    dependencyLockRefs: uniqueTrimmed(scoped.flatMap((check) => check.dependencyLockRefs ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    graphNodeCount: graphNodeCounts.length > 0 ? Math.max(...graphNodeCounts) : null,
    graphEdgeCount: graphEdgeCounts.length > 0 ? Math.max(...graphEdgeCounts) : null,
    evaluationMetricCount: evaluationMetricCounts.length > 0 ? Math.max(...evaluationMetricCounts) : null,
    experimentCount: experimentCounts.length > 0 ? Math.max(...experimentCounts) : null,
    retrievalGroundingScore0to1: retrievalGroundingScores.length > 0 ? Math.min(...retrievalGroundingScores) : null,
    regressionPassRate0to1: regressionPassRates.length > 0 ? Math.min(...regressionPassRates) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          AGENTIC_GRAPH_RAG_ARTIFACT_SIGNALS.has(check.agenticGraphRagSignalType as MetricValidationAgenticGraphRagSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isAgentScenarioTestCheckCovered(
  check: MetricValidationAgentScenarioTestCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.agentScenarioTestSignalType) return false;
  if (!AGENT_SCENARIO_TEST_REQUIRED_SIGNALS.includes(check.agentScenarioTestSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (
    AGENT_SCENARIO_TEST_ARTIFACT_SIGNALS.has(check.agentScenarioTestSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (
    check.agentScenarioTestSignalType === "benchmark_manifest" &&
    uniqueTrimmed(check.benchmarkIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.agentScenarioTestSignalType === "source_repository_license" &&
    (uniqueTrimmed(check.repositoryRefs ?? []).length === 0 || uniqueTrimmed(check.licenseRefs ?? []).length === 0)
  ) {
    return false;
  }
  if (
    check.agentScenarioTestSignalType === "agent_endpoint_contract" &&
    uniqueTrimmed(check.agentIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.agentScenarioTestSignalType === "scenario_manifest" &&
    (uniqueTrimmed(check.scenarioIds ?? []).length === 0 ||
      !Number.isFinite(check.scenarioCount) ||
      (check.scenarioCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    check.agentScenarioTestSignalType === "simulated_user_persona_manifest" &&
    uniqueTrimmed(check.personaIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.agentScenarioTestSignalType === "goal_knowledge_manifest" &&
    (uniqueTrimmed(check.goalIds ?? []).length === 0 ||
      uniqueTrimmed(check.knowledgeSetIds ?? []).length === 0)
  ) {
    return false;
  }
  if (
    check.agentScenarioTestSignalType === "tool_mock_manifest" &&
    (uniqueTrimmed(check.toolMockIds ?? []).length === 0 ||
      !Number.isFinite(check.toolCallCount) ||
      (check.toolCallCount ?? 0) < 1)
  ) {
    return false;
  }
  if (
    check.agentScenarioTestSignalType === "scripted_turn_manifest" &&
    (!Number.isFinite(check.turnCount) || (check.turnCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (
    check.agentScenarioTestSignalType === "trajectory_assertion_manifest" &&
    uniqueTrimmed(check.trajectoryAssertionIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.agentScenarioTestSignalType === "llm_judge_metric_manifest" &&
    (uniqueTrimmed(check.judgeIds ?? []).length === 0 ||
      uniqueTrimmed(check.metricNames ?? []).length === 0)
  ) {
    return false;
  }
  if (
    check.agentScenarioTestSignalType === "comparison_run_manifest" &&
    (uniqueTrimmed(check.comparisonIds ?? []).length === 0 ||
      uniqueTrimmed(check.agentIds ?? []).length === 0)
  ) {
    return false;
  }
  if (
    check.agentScenarioTestSignalType === "ci_reporter_manifest" &&
    uniqueTrimmed(check.reporterFormats ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.agentScenarioTestSignalType === "result_artifact_manifest" &&
    uniqueTrimmed(check.metricNames ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.agentScenarioTestSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.agentScenarioTestSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function agentScenarioTestSummary(
  checks: MetricValidationAgentScenarioTestCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationAgentScenarioTestSignal[];
  benchmarkIds: string[];
  repositoryRefs: string[];
  licenseRefs: string[];
  scenarioIds: string[];
  personaIds: string[];
  goalIds: string[];
  knowledgeSetIds: string[];
  toolMockIds: string[];
  trajectoryAssertionIds: string[];
  judgeIds: string[];
  metricNames: string[];
  reporterFormats: string[];
  agentIds: string[];
  comparisonIds: string[];
  scenarioCount: number | null;
  turnCount: number | null;
  toolCallCount: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.agentScenarioTestSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      benchmarkIds: [],
      repositoryRefs: [],
      licenseRefs: [],
      scenarioIds: [],
      personaIds: [],
      goalIds: [],
      knowledgeSetIds: [],
      toolMockIds: [],
      trajectoryAssertionIds: [],
      judgeIds: [],
      metricNames: [],
      reporterFormats: [],
      agentIds: [],
      comparisonIds: [],
      scenarioCount: null,
      turnCount: null,
      toolCallCount: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isAgentScenarioTestCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.agentScenarioTestSignalType as MetricValidationAgentScenarioTestSignal)
  );
  const scenarioCounts = covered
    .map((check) => check.scenarioCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const turnCounts = covered
    .map((check) => check.turnCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const toolCallCounts = covered
    .map((check) => check.toolCallCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / AGENT_SCENARIO_TEST_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: AGENT_SCENARIO_TEST_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    benchmarkIds: uniqueTrimmed(scoped.flatMap((check) => check.benchmarkIds ?? [])),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    scenarioIds: uniqueTrimmed(scoped.flatMap((check) => check.scenarioIds ?? [])),
    personaIds: uniqueTrimmed(scoped.flatMap((check) => check.personaIds ?? [])),
    goalIds: uniqueTrimmed(scoped.flatMap((check) => check.goalIds ?? [])),
    knowledgeSetIds: uniqueTrimmed(scoped.flatMap((check) => check.knowledgeSetIds ?? [])),
    toolMockIds: uniqueTrimmed(scoped.flatMap((check) => check.toolMockIds ?? [])),
    trajectoryAssertionIds: uniqueTrimmed(scoped.flatMap((check) => check.trajectoryAssertionIds ?? [])),
    judgeIds: uniqueTrimmed(scoped.flatMap((check) => check.judgeIds ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    reporterFormats: uniqueTrimmed(scoped.flatMap((check) => check.reporterFormats ?? [])),
    agentIds: uniqueTrimmed(scoped.flatMap((check) => check.agentIds ?? [])),
    comparisonIds: uniqueTrimmed(scoped.flatMap((check) => check.comparisonIds ?? [])),
    scenarioCount: scenarioCounts.length > 0 ? Math.max(...scenarioCounts) : null,
    turnCount: turnCounts.length > 0 ? Math.max(...turnCounts) : null,
    toolCallCount: toolCallCounts.length > 0 ? Math.max(...toolCallCounts) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          AGENT_SCENARIO_TEST_ARTIFACT_SIGNALS.has(check.agentScenarioTestSignalType as MetricValidationAgentScenarioTestSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isOpenCodeLabCheckCovered(
  check: MetricValidationOpenCodeLabCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.openCodeLabSignalType) return false;
  if (!OPEN_CODE_LAB_REQUIRED_SIGNALS.includes(check.openCodeLabSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (
    OPEN_CODE_LAB_ARTIFACT_SIGNALS.has(check.openCodeLabSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (
    check.openCodeLabSignalType === "source_repository_reference" &&
    uniqueTrimmed(check.repositoryRefs ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.openCodeLabSignalType === "lab_benchmark_manifest" &&
    uniqueTrimmed(check.benchmarkIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.openCodeLabSignalType === "agent_context_manifest" &&
    uniqueTrimmed(check.agentContextIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.openCodeLabSignalType === "prompt_variant_manifest" &&
    uniqueTrimmed(check.promptVariantIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.openCodeLabSignalType === "tool_description_manifest" &&
    uniqueTrimmed(check.toolDescriptionIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.openCodeLabSignalType === "agents_policy_manifest" &&
    uniqueTrimmed(check.policyIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.openCodeLabSignalType === "repeated_run_trace" &&
    (uniqueTrimmed(check.runTraceIds ?? []).length === 0 ||
      !Number.isFinite(check.runCount) ||
      (check.runCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (check.openCodeLabSignalType === "fork_agreement_report") {
    const minAgreement = check.minForkAgreement0to1 ?? 0.9;
    return uniqueTrimmed(check.forkIds ?? []).length > 0 &&
      Number.isFinite(check.forkAgreement0to1) &&
      (check.forkAgreement0to1 ?? 0) >= minAgreement;
  }
  if (check.openCodeLabSignalType === "model_variance_report") {
    const maxVariance = check.maxModelVariance0to1 ?? 0.1;
    return uniqueTrimmed(check.modelIds ?? []).length > 0 &&
      Number.isFinite(check.modelVariance0to1) &&
      (check.modelVariance0to1 ?? Number.POSITIVE_INFINITY) <= maxVariance;
  }
  if (
    check.openCodeLabSignalType === "ground_truth_correction_manifest" &&
    uniqueTrimmed(check.groundTruthIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.openCodeLabSignalType === "metric_definition_manifest" &&
    uniqueTrimmed(check.metricNames ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.openCodeLabSignalType === "ci_reporter_manifest" &&
    uniqueTrimmed(check.reporterFormats ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.openCodeLabSignalType === "result_artifact_manifest" &&
    (uniqueTrimmed(check.resultArtifactIds ?? []).length === 0 ||
      uniqueTrimmed(check.metricNames ?? []).length === 0)
  ) {
    return false;
  }
  if (
    check.openCodeLabSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.openCodeLabSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function openCodeLabSummary(
  checks: MetricValidationOpenCodeLabCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationOpenCodeLabSignal[];
  benchmarkIds: string[];
  repositoryRefs: string[];
  agentContextIds: string[];
  promptVariantIds: string[];
  toolDescriptionIds: string[];
  policyIds: string[];
  runTraceIds: string[];
  forkIds: string[];
  modelIds: string[];
  groundTruthIds: string[];
  metricNames: string[];
  reporterFormats: string[];
  resultArtifactIds: string[];
  runCount: number | null;
  forkAgreement0to1: number | null;
  modelVariance0to1: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.openCodeLabSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      benchmarkIds: [],
      repositoryRefs: [],
      agentContextIds: [],
      promptVariantIds: [],
      toolDescriptionIds: [],
      policyIds: [],
      runTraceIds: [],
      forkIds: [],
      modelIds: [],
      groundTruthIds: [],
      metricNames: [],
      reporterFormats: [],
      resultArtifactIds: [],
      runCount: null,
      forkAgreement0to1: null,
      modelVariance0to1: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isOpenCodeLabCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.openCodeLabSignalType as MetricValidationOpenCodeLabSignal)
  );
  const runCounts = covered
    .map((check) => check.runCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const forkAgreements = covered
    .map((check) => check.forkAgreement0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const modelVariances = covered
    .map((check) => check.modelVariance0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / OPEN_CODE_LAB_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: OPEN_CODE_LAB_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    benchmarkIds: uniqueTrimmed(scoped.flatMap((check) => check.benchmarkIds ?? [])),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    agentContextIds: uniqueTrimmed(scoped.flatMap((check) => check.agentContextIds ?? [])),
    promptVariantIds: uniqueTrimmed(scoped.flatMap((check) => check.promptVariantIds ?? [])),
    toolDescriptionIds: uniqueTrimmed(scoped.flatMap((check) => check.toolDescriptionIds ?? [])),
    policyIds: uniqueTrimmed(scoped.flatMap((check) => check.policyIds ?? [])),
    runTraceIds: uniqueTrimmed(scoped.flatMap((check) => check.runTraceIds ?? [])),
    forkIds: uniqueTrimmed(scoped.flatMap((check) => check.forkIds ?? [])),
    modelIds: uniqueTrimmed(scoped.flatMap((check) => check.modelIds ?? [])),
    groundTruthIds: uniqueTrimmed(scoped.flatMap((check) => check.groundTruthIds ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    reporterFormats: uniqueTrimmed(scoped.flatMap((check) => check.reporterFormats ?? [])),
    resultArtifactIds: uniqueTrimmed(scoped.flatMap((check) => check.resultArtifactIds ?? [])),
    runCount: runCounts.length > 0 ? Math.max(...runCounts) : null,
    forkAgreement0to1: forkAgreements.length > 0 ? Math.min(...forkAgreements) : null,
    modelVariance0to1: modelVariances.length > 0 ? Math.max(...modelVariances) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          OPEN_CODE_LAB_ARTIFACT_SIGNALS.has(check.openCodeLabSignalType as MetricValidationOpenCodeLabSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isCcPluginEvalCheckCovered(
  check: MetricValidationCcPluginEvalCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.ccPluginEvalSignalType) return false;
  if (!CC_PLUGIN_EVAL_REQUIRED_SIGNALS.includes(check.ccPluginEvalSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (
    CC_PLUGIN_EVAL_ARTIFACT_SIGNALS.has(check.ccPluginEvalSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (check.ccPluginEvalSignalType === "source_repository_license") {
    return uniqueTrimmed(check.repositoryRefs ?? []).length > 0 &&
      uniqueTrimmed(check.licenseRefs ?? []).length > 0;
  }
  if (
    check.ccPluginEvalSignalType === "plugin_manifest" &&
    uniqueTrimmed(check.pluginManifestIds ?? []).length === 0
  ) {
    return false;
  }
  if (check.ccPluginEvalSignalType === "component_inventory") {
    const componentTypes = new Set(check.componentTypes ?? []);
    return componentTypes.has("skill") &&
      componentTypes.has("agent") &&
      componentTypes.has("command") &&
      Number.isFinite(check.componentCount) &&
      (check.componentCount ?? 0) >= 3;
  }
  if (
    check.ccPluginEvalSignalType === "trigger_phrase_manifest" &&
    uniqueTrimmed(check.triggerManifestIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.ccPluginEvalSignalType === "scenario_generation_manifest" &&
    uniqueTrimmed(check.scenarioManifestIds ?? []).length === 0
  ) {
    return false;
  }
  if (check.ccPluginEvalSignalType === "scenario_type_coverage") {
    const scenarioTypes = new Set(check.scenarioTypes ?? []);
    return scenarioTypes.has("direct") &&
      scenarioTypes.has("paraphrased") &&
      scenarioTypes.has("edge_case") &&
      scenarioTypes.has("negative") &&
      scenarioTypes.has("semantic") &&
      Number.isFinite(check.scenarioCount) &&
      (check.scenarioCount ?? 0) >= thresholds.minSampleSize;
  }
  if (
    check.ccPluginEvalSignalType === "execution_transcript_bundle" &&
    (uniqueTrimmed(check.transcriptIds ?? []).length === 0 ||
      !Number.isFinite(check.scenarioCount) ||
      (check.scenarioCount ?? 0) < thresholds.minSampleSize)
  ) {
    return false;
  }
  if (check.ccPluginEvalSignalType === "programmatic_detection_report") {
    const detectionModes = new Set(check.detectionModes ?? []);
    return uniqueTrimmed(check.detectionReportIds ?? []).length > 0 &&
      (detectionModes.has("programmatic_first") || detectionModes.has("hybrid")) &&
      Number.isFinite(check.triggerAccuracy0to1) &&
      (check.triggerAccuracy0to1 ?? 0) >= thresholds.minCcPluginEvalTriggerAccuracy0to1 &&
      Number.isFinite(check.falsePositiveRate0to1) &&
      (check.falsePositiveRate0to1 ?? Number.POSITIVE_INFINITY) <= thresholds.maxCcPluginEvalFalsePositiveRate0to1 &&
      Number.isFinite(check.falseNegativeRate0to1) &&
      (check.falseNegativeRate0to1 ?? Number.POSITIVE_INFINITY) <= thresholds.maxCcPluginEvalFalseNegativeRate0to1;
  }
  if (check.ccPluginEvalSignalType === "llm_judge_calibration") {
    return uniqueTrimmed(check.judgeIds ?? []).length > 0 &&
      uniqueTrimmed(check.calibrationIds ?? []).length > 0;
  }
  if (
    check.ccPluginEvalSignalType === "conflict_detection_report" &&
    uniqueTrimmed(check.conflictReportIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.ccPluginEvalSignalType === "checkpoint_resume_state" &&
    uniqueTrimmed(check.checkpointStateIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.ccPluginEvalSignalType === "cost_estimate_report" &&
    uniqueTrimmed(check.costEstimateIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.ccPluginEvalSignalType === "ci_reporter_manifest" &&
    uniqueTrimmed(check.reporterFormats ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.ccPluginEvalSignalType === "result_artifact_manifest" &&
    (uniqueTrimmed(check.resultArtifactIds ?? []).length === 0 ||
      uniqueTrimmed(check.metricNames ?? []).length === 0)
  ) {
    return false;
  }
  if (
    check.ccPluginEvalSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.ccPluginEvalSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function ccPluginEvalSummary(
  checks: MetricValidationCcPluginEvalCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationCcPluginEvalSignal[];
  repositoryRefs: string[];
  licenseRefs: string[];
  pluginManifestIds: string[];
  componentTypes: MetricValidationCcPluginEvalComponentType[];
  triggerManifestIds: string[];
  scenarioManifestIds: string[];
  scenarioTypes: MetricValidationCcPluginEvalScenarioType[];
  transcriptIds: string[];
  detectionReportIds: string[];
  detectionModes: MetricValidationCcPluginEvalDetectionMode[];
  judgeIds: string[];
  calibrationIds: string[];
  conflictReportIds: string[];
  checkpointStateIds: string[];
  costEstimateIds: string[];
  reporterFormats: string[];
  resultArtifactIds: string[];
  metricNames: string[];
  triggerAccuracy0to1: number | null;
  falsePositiveRate0to1: number | null;
  falseNegativeRate0to1: number | null;
  componentCount: number | null;
  scenarioCount: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.ccPluginEvalSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      repositoryRefs: [],
      licenseRefs: [],
      pluginManifestIds: [],
      componentTypes: [],
      triggerManifestIds: [],
      scenarioManifestIds: [],
      scenarioTypes: [],
      transcriptIds: [],
      detectionReportIds: [],
      detectionModes: [],
      judgeIds: [],
      calibrationIds: [],
      conflictReportIds: [],
      checkpointStateIds: [],
      costEstimateIds: [],
      reporterFormats: [],
      resultArtifactIds: [],
      metricNames: [],
      triggerAccuracy0to1: null,
      falsePositiveRate0to1: null,
      falseNegativeRate0to1: null,
      componentCount: null,
      scenarioCount: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isCcPluginEvalCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.ccPluginEvalSignalType as MetricValidationCcPluginEvalSignal)
  );
  const triggerAccuracies = covered
    .map((check) => check.triggerAccuracy0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const falsePositiveRates = covered
    .map((check) => check.falsePositiveRate0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const falseNegativeRates = covered
    .map((check) => check.falseNegativeRate0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const componentCounts = covered
    .map((check) => check.componentCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const scenarioCounts = covered
    .map((check) => check.scenarioCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / CC_PLUGIN_EVAL_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: CC_PLUGIN_EVAL_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    pluginManifestIds: uniqueTrimmed(scoped.flatMap((check) => check.pluginManifestIds ?? [])),
    componentTypes: [...new Set(scoped.flatMap((check) => check.componentTypes ?? []))],
    triggerManifestIds: uniqueTrimmed(scoped.flatMap((check) => check.triggerManifestIds ?? [])),
    scenarioManifestIds: uniqueTrimmed(scoped.flatMap((check) => check.scenarioManifestIds ?? [])),
    scenarioTypes: [...new Set(scoped.flatMap((check) => check.scenarioTypes ?? []))],
    transcriptIds: uniqueTrimmed(scoped.flatMap((check) => check.transcriptIds ?? [])),
    detectionReportIds: uniqueTrimmed(scoped.flatMap((check) => check.detectionReportIds ?? [])),
    detectionModes: [...new Set(scoped.flatMap((check) => check.detectionModes ?? []))],
    judgeIds: uniqueTrimmed(scoped.flatMap((check) => check.judgeIds ?? [])),
    calibrationIds: uniqueTrimmed(scoped.flatMap((check) => check.calibrationIds ?? [])),
    conflictReportIds: uniqueTrimmed(scoped.flatMap((check) => check.conflictReportIds ?? [])),
    checkpointStateIds: uniqueTrimmed(scoped.flatMap((check) => check.checkpointStateIds ?? [])),
    costEstimateIds: uniqueTrimmed(scoped.flatMap((check) => check.costEstimateIds ?? [])),
    reporterFormats: uniqueTrimmed(scoped.flatMap((check) => check.reporterFormats ?? [])),
    resultArtifactIds: uniqueTrimmed(scoped.flatMap((check) => check.resultArtifactIds ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    triggerAccuracy0to1: triggerAccuracies.length > 0 ? Math.min(...triggerAccuracies) : null,
    falsePositiveRate0to1: falsePositiveRates.length > 0 ? Math.max(...falsePositiveRates) : null,
    falseNegativeRate0to1: falseNegativeRates.length > 0 ? Math.max(...falseNegativeRates) : null,
    componentCount: componentCounts.length > 0 ? Math.max(...componentCounts) : null,
    scenarioCount: scenarioCounts.length > 0 ? Math.max(...scenarioCounts) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          CC_PLUGIN_EVAL_ARTIFACT_SIGNALS.has(check.ccPluginEvalSignalType as MetricValidationCcPluginEvalSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isRealignSimulationCheckCovered(
  check: MetricValidationRealignSimulationCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.realignSimulationSignalType) return false;
  if (!REALIGN_SIMULATION_REQUIRED_SIGNALS.includes(check.realignSimulationSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (
    REALIGN_SIMULATION_ARTIFACT_SIGNALS.has(check.realignSimulationSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (check.realignSimulationSignalType === "source_repository_license") {
    return uniqueTrimmed(check.repositoryRefs ?? []).length > 0 &&
      uniqueTrimmed(check.licenseRefs ?? []).length > 0;
  }
  if (
    check.realignSimulationSignalType === "yaml_config_manifest" &&
    uniqueTrimmed(check.configIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.realignSimulationSignalType === "app_under_test_manifest" &&
    uniqueTrimmed(check.appIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.realignSimulationSignalType === "dataset_manifest" &&
    uniqueTrimmed(check.datasetIds ?? []).length === 0
  ) {
    return false;
  }
  if (check.realignSimulationSignalType === "scenario_manifest") {
    return uniqueTrimmed(check.scenarioIds ?? []).length > 0 &&
      Number.isFinite(check.scenarioCount) &&
      (check.scenarioCount ?? 0) >= thresholds.minSampleSize;
  }
  if (
    check.realignSimulationSignalType === "synthetic_user_persona_manifest" &&
    uniqueTrimmed(check.personaIds ?? []).length === 0
  ) {
    return false;
  }
  if (check.realignSimulationSignalType === "evaluator_registry_manifest") {
    return uniqueTrimmed(check.evaluatorIds ?? []).length > 0 &&
      Number.isFinite(check.evaluatorCount) &&
      (check.evaluatorCount ?? 0) >= 2;
  }
  if (
    check.realignSimulationSignalType === "evaluator_target_manifest" &&
    (uniqueTrimmed(check.targetIds ?? []).length === 0 ||
      uniqueTrimmed(check.metricNames ?? []).length === 0)
  ) {
    return false;
  }
  if (check.realignSimulationSignalType === "simulation_run_trace") {
    return uniqueTrimmed(check.runTraceIds ?? []).length > 0 &&
      Number.isFinite(check.scenarioCount) &&
      (check.scenarioCount ?? 0) >= thresholds.minSampleSize;
  }
  if (check.realignSimulationSignalType === "repeated_run_trace") {
    return uniqueTrimmed(check.repeatedRunTraceIds ?? []).length > 0 &&
      Number.isFinite(check.repeatCount) &&
      (check.repeatCount ?? 0) >= 3;
  }
  if (check.realignSimulationSignalType === "judge_calibration_report") {
    return uniqueTrimmed(check.judgeIds ?? []).length > 0 &&
      uniqueTrimmed(check.calibrationIds ?? []).length > 0 &&
      Number.isFinite(check.judgeAgreement0to1) &&
      (check.judgeAgreement0to1 ?? 0) >= thresholds.minRealignSimulationJudgeAgreement0to1;
  }
  if (
    check.realignSimulationSignalType === "statistical_rigor_report" &&
    uniqueTrimmed(check.statisticsReportIds ?? []).length === 0
  ) {
    return false;
  }
  if (check.realignSimulationSignalType === "ci_regression_manifest") {
    return uniqueTrimmed(check.ciReporterIds ?? []).length > 0 &&
      uniqueTrimmed(check.reporterFormats ?? []).length > 0 &&
      Number.isFinite(check.regressionPassRate0to1) &&
      (check.regressionPassRate0to1 ?? 0) >= thresholds.minRealignSimulationRegressionPassRate0to1;
  }
  if (
    check.realignSimulationSignalType === "experiment_tracking_manifest" &&
    uniqueTrimmed(check.experimentIds ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.realignSimulationSignalType === "result_artifact_manifest" &&
    (uniqueTrimmed(check.resultArtifactIds ?? []).length === 0 ||
      uniqueTrimmed(check.metricNames ?? []).length === 0)
  ) {
    return false;
  }
  if (
    check.realignSimulationSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.realignSimulationSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function realignSimulationSummary(
  checks: MetricValidationRealignSimulationCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationRealignSimulationSignal[];
  repositoryRefs: string[];
  licenseRefs: string[];
  configIds: string[];
  appIds: string[];
  datasetIds: string[];
  scenarioIds: string[];
  personaIds: string[];
  evaluatorIds: string[];
  targetIds: string[];
  runTraceIds: string[];
  repeatedRunTraceIds: string[];
  judgeIds: string[];
  calibrationIds: string[];
  statisticsReportIds: string[];
  ciReporterIds: string[];
  reporterFormats: string[];
  experimentIds: string[];
  resultArtifactIds: string[];
  metricNames: string[];
  judgeAgreement0to1: number | null;
  regressionPassRate0to1: number | null;
  scenarioCount: number | null;
  evaluatorCount: number | null;
  repeatCount: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.realignSimulationSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      repositoryRefs: [],
      licenseRefs: [],
      configIds: [],
      appIds: [],
      datasetIds: [],
      scenarioIds: [],
      personaIds: [],
      evaluatorIds: [],
      targetIds: [],
      runTraceIds: [],
      repeatedRunTraceIds: [],
      judgeIds: [],
      calibrationIds: [],
      statisticsReportIds: [],
      ciReporterIds: [],
      reporterFormats: [],
      experimentIds: [],
      resultArtifactIds: [],
      metricNames: [],
      judgeAgreement0to1: null,
      regressionPassRate0to1: null,
      scenarioCount: null,
      evaluatorCount: null,
      repeatCount: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isRealignSimulationCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.realignSimulationSignalType as MetricValidationRealignSimulationSignal)
  );
  const judgeAgreements = covered
    .map((check) => check.judgeAgreement0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const regressionPassRates = covered
    .map((check) => check.regressionPassRate0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const scenarioCounts = covered
    .map((check) => check.scenarioCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const evaluatorCounts = covered
    .map((check) => check.evaluatorCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const repeatCounts = covered
    .map((check) => check.repeatCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / REALIGN_SIMULATION_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: REALIGN_SIMULATION_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    configIds: uniqueTrimmed(scoped.flatMap((check) => check.configIds ?? [])),
    appIds: uniqueTrimmed(scoped.flatMap((check) => check.appIds ?? [])),
    datasetIds: uniqueTrimmed(scoped.flatMap((check) => check.datasetIds ?? [])),
    scenarioIds: uniqueTrimmed(scoped.flatMap((check) => check.scenarioIds ?? [])),
    personaIds: uniqueTrimmed(scoped.flatMap((check) => check.personaIds ?? [])),
    evaluatorIds: uniqueTrimmed(scoped.flatMap((check) => check.evaluatorIds ?? [])),
    targetIds: uniqueTrimmed(scoped.flatMap((check) => check.targetIds ?? [])),
    runTraceIds: uniqueTrimmed(scoped.flatMap((check) => check.runTraceIds ?? [])),
    repeatedRunTraceIds: uniqueTrimmed(scoped.flatMap((check) => check.repeatedRunTraceIds ?? [])),
    judgeIds: uniqueTrimmed(scoped.flatMap((check) => check.judgeIds ?? [])),
    calibrationIds: uniqueTrimmed(scoped.flatMap((check) => check.calibrationIds ?? [])),
    statisticsReportIds: uniqueTrimmed(scoped.flatMap((check) => check.statisticsReportIds ?? [])),
    ciReporterIds: uniqueTrimmed(scoped.flatMap((check) => check.ciReporterIds ?? [])),
    reporterFormats: uniqueTrimmed(scoped.flatMap((check) => check.reporterFormats ?? [])),
    experimentIds: uniqueTrimmed(scoped.flatMap((check) => check.experimentIds ?? [])),
    resultArtifactIds: uniqueTrimmed(scoped.flatMap((check) => check.resultArtifactIds ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    judgeAgreement0to1: judgeAgreements.length > 0 ? Math.min(...judgeAgreements) : null,
    regressionPassRate0to1: regressionPassRates.length > 0 ? Math.min(...regressionPassRates) : null,
    scenarioCount: scenarioCounts.length > 0 ? Math.max(...scenarioCounts) : null,
    evaluatorCount: evaluatorCounts.length > 0 ? Math.max(...evaluatorCounts) : null,
    repeatCount: repeatCounts.length > 0 ? Math.max(...repeatCounts) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          REALIGN_SIMULATION_ARTIFACT_SIGNALS.has(check.realignSimulationSignalType as MetricValidationRealignSimulationSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isAcademiClawCheckCovered(
  check: MetricValidationAcademiClawCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.academiClawSignalType) return false;
  if (!ACADEMI_CLAW_REQUIRED_SIGNALS.includes(check.academiClawSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (ACADEMI_CLAW_ARTIFACT_SIGNALS.has(check.academiClawSignalType) && !isSha256Hash(check.artifactHash)) {
    return false;
  }
  if (check.academiClawSignalType === "source_repository_license") {
    return uniqueTrimmed(check.repositoryRefs ?? []).length > 0 &&
      uniqueTrimmed(check.licenseRefs ?? []).length > 0;
  }
  if (check.academiClawSignalType === "default_branch_snapshot") {
    return uniqueTrimmed(check.branchRefs ?? []).length > 0 &&
      uniqueTrimmed(check.commitRefs ?? []).length > 0 &&
      uniqueTrimmed(check.treeRefs ?? []).length > 0;
  }
  if (check.academiClawSignalType === "readme_citation_manifest") {
    return uniqueTrimmed(check.readmeBlobRefs ?? []).length > 0 &&
      uniqueTrimmed(check.citationRefs ?? []).length > 0;
  }
  if (check.academiClawSignalType === "task_corpus_manifest") {
    return uniqueTrimmed(check.taskCorpusRefs ?? []).length > 0 &&
      Number.isFinite(check.taskCount) &&
      (check.taskCount ?? 0) >= thresholds.minAcademiClawTaskCount;
  }
  if (check.academiClawSignalType === "bilingual_task_manifest") {
    return uniqueTrimmed(check.languageIds ?? []).length >= thresholds.minAcademiClawLanguageCount &&
      Number.isFinite(check.languageCount) &&
      (check.languageCount ?? 0) >= thresholds.minAcademiClawLanguageCount;
  }
  if (check.academiClawSignalType === "workspace_query_manifest") {
    return uniqueTrimmed(check.workspaceQueryIds ?? []).length > 0 &&
      Number.isFinite(check.taskCount) &&
      (check.taskCount ?? 0) >= thresholds.minAcademiClawTaskCount;
  }
  if (check.academiClawSignalType === "docker_environment_manifest") {
    return uniqueTrimmed(check.dockerImageIds ?? []).length > 0 &&
      Number.isFinite(check.taskCount) &&
      (check.taskCount ?? 0) >= thresholds.minAcademiClawTaskCount;
  }
  if (check.academiClawSignalType === "evaluation_rubric_manifest") {
    return uniqueTrimmed(check.rubricIds ?? []).length > 0 &&
      Number.isFinite(check.rubricCount) &&
      (check.rubricCount ?? 0) >= thresholds.minAcademiClawRubricCount;
  }
  if (check.academiClawSignalType === "eval_task_runner_manifest") {
    return uniqueTrimmed(check.evalTaskRunnerIds ?? []).length > 0 &&
      Number.isFinite(check.taskCount) &&
      (check.taskCount ?? 0) >= thresholds.minAcademiClawTaskCount;
  }
  if (check.academiClawSignalType === "openclaw_result_manifest") {
    return uniqueTrimmed(check.resultManifestIds ?? []).length > 0 &&
      uniqueTrimmed(check.metricNames ?? []).length > 0;
  }
  if (check.academiClawSignalType === "conversation_trace_manifest") {
    return uniqueTrimmed(check.conversationTraceIds ?? []).length > 0 &&
      Number.isFinite(check.traceCount) &&
      (check.traceCount ?? 0) >= thresholds.minAcademiClawTraceCount;
  }
  if (check.academiClawSignalType === "meta_eval_manifest") {
    return uniqueTrimmed(check.metaEvalIds ?? []).length > 0 &&
      Number.isFinite(check.metaEvalCount) &&
      (check.metaEvalCount ?? 0) >= thresholds.minAcademiClawMetaEvalCount;
  }
  if (check.academiClawSignalType === "model_roster_manifest") {
    return uniqueTrimmed(check.modelIds ?? []).length > 0 &&
      Number.isFinite(check.modelCount) &&
      (check.modelCount ?? 0) >= thresholds.minAcademiClawModelCount;
  }
  if (
    check.academiClawSignalType === "metric_definition_manifest" &&
    uniqueTrimmed(check.metricNames ?? []).length === 0
  ) {
    return false;
  }
  if (check.academiClawSignalType === "ci_regression_manifest") {
    return uniqueTrimmed(check.ciReporterIds ?? []).length > 0 &&
      uniqueTrimmed(check.reporterFormats ?? []).length > 0 &&
      Number.isFinite(check.regressionPassRate0to1) &&
      (check.regressionPassRate0to1 ?? 0) >= thresholds.minAcademiClawRegressionPassRate0to1;
  }
  if (
    check.academiClawSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.academiClawSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minAcademiClawTaskCount &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function academiClawSummary(
  checks: MetricValidationAcademiClawCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationAcademiClawSignal[];
  repositoryRefs: string[];
  licenseRefs: string[];
  branchRefs: string[];
  commitRefs: string[];
  treeRefs: string[];
  readmeBlobRefs: string[];
  citationRefs: string[];
  taskCorpusRefs: string[];
  languageIds: string[];
  workspaceQueryIds: string[];
  dockerImageIds: string[];
  rubricIds: string[];
  evalTaskRunnerIds: string[];
  resultManifestIds: string[];
  conversationTraceIds: string[];
  metaEvalIds: string[];
  modelIds: string[];
  metricNames: string[];
  ciReporterIds: string[];
  reporterFormats: string[];
  taskCount: number | null;
  languageCount: number | null;
  rubricCount: number | null;
  traceCount: number | null;
  metaEvalCount: number | null;
  modelCount: number | null;
  regressionPassRate0to1: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.academiClawSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      repositoryRefs: [],
      licenseRefs: [],
      branchRefs: [],
      commitRefs: [],
      treeRefs: [],
      readmeBlobRefs: [],
      citationRefs: [],
      taskCorpusRefs: [],
      languageIds: [],
      workspaceQueryIds: [],
      dockerImageIds: [],
      rubricIds: [],
      evalTaskRunnerIds: [],
      resultManifestIds: [],
      conversationTraceIds: [],
      metaEvalIds: [],
      modelIds: [],
      metricNames: [],
      ciReporterIds: [],
      reporterFormats: [],
      taskCount: null,
      languageCount: null,
      rubricCount: null,
      traceCount: null,
      metaEvalCount: null,
      modelCount: null,
      regressionPassRate0to1: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isAcademiClawCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.academiClawSignalType as MetricValidationAcademiClawSignal)
  );
  const taskCounts = covered
    .map((check) => check.taskCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const languageCounts = covered
    .map((check) => check.languageCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const rubricCounts = covered
    .map((check) => check.rubricCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const traceCounts = covered
    .map((check) => check.traceCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const metaEvalCounts = covered
    .map((check) => check.metaEvalCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const modelCounts = covered
    .map((check) => check.modelCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const regressionPassRates = covered
    .map((check) => check.regressionPassRate0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / ACADEMI_CLAW_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: ACADEMI_CLAW_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    branchRefs: uniqueTrimmed(scoped.flatMap((check) => check.branchRefs ?? [])),
    commitRefs: uniqueTrimmed(scoped.flatMap((check) => check.commitRefs ?? [])),
    treeRefs: uniqueTrimmed(scoped.flatMap((check) => check.treeRefs ?? [])),
    readmeBlobRefs: uniqueTrimmed(scoped.flatMap((check) => check.readmeBlobRefs ?? [])),
    citationRefs: uniqueTrimmed(scoped.flatMap((check) => check.citationRefs ?? [])),
    taskCorpusRefs: uniqueTrimmed(scoped.flatMap((check) => check.taskCorpusRefs ?? [])),
    languageIds: uniqueTrimmed(scoped.flatMap((check) => check.languageIds ?? [])),
    workspaceQueryIds: uniqueTrimmed(scoped.flatMap((check) => check.workspaceQueryIds ?? [])),
    dockerImageIds: uniqueTrimmed(scoped.flatMap((check) => check.dockerImageIds ?? [])),
    rubricIds: uniqueTrimmed(scoped.flatMap((check) => check.rubricIds ?? [])),
    evalTaskRunnerIds: uniqueTrimmed(scoped.flatMap((check) => check.evalTaskRunnerIds ?? [])),
    resultManifestIds: uniqueTrimmed(scoped.flatMap((check) => check.resultManifestIds ?? [])),
    conversationTraceIds: uniqueTrimmed(scoped.flatMap((check) => check.conversationTraceIds ?? [])),
    metaEvalIds: uniqueTrimmed(scoped.flatMap((check) => check.metaEvalIds ?? [])),
    modelIds: uniqueTrimmed(scoped.flatMap((check) => check.modelIds ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    ciReporterIds: uniqueTrimmed(scoped.flatMap((check) => check.ciReporterIds ?? [])),
    reporterFormats: uniqueTrimmed(scoped.flatMap((check) => check.reporterFormats ?? [])),
    taskCount: taskCounts.length > 0 ? Math.max(...taskCounts) : null,
    languageCount: languageCounts.length > 0 ? Math.max(...languageCounts) : null,
    rubricCount: rubricCounts.length > 0 ? Math.max(...rubricCounts) : null,
    traceCount: traceCounts.length > 0 ? Math.max(...traceCounts) : null,
    metaEvalCount: metaEvalCounts.length > 0 ? Math.max(...metaEvalCounts) : null,
    modelCount: modelCounts.length > 0 ? Math.max(...modelCounts) : null,
    regressionPassRate0to1: regressionPassRates.length > 0 ? Math.min(...regressionPassRates) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          ACADEMI_CLAW_ARTIFACT_SIGNALS.has(check.academiClawSignalType as MetricValidationAcademiClawSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isRagChunkingTechniqueCheckCovered(
  check: MetricValidationRagChunkingTechniqueCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.ragChunkingTechniqueSignalType) return false;
  if (!RAG_CHUNKING_TECHNIQUE_REQUIRED_SIGNALS.includes(check.ragChunkingTechniqueSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (
    RAG_CHUNKING_TECHNIQUE_ARTIFACT_SIGNALS.has(check.ragChunkingTechniqueSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (check.ragChunkingTechniqueSignalType === "source_repository_license") {
    return uniqueTrimmed(check.repositoryRefs ?? []).length > 0 &&
      uniqueTrimmed(check.licenseRefs ?? []).length > 0;
  }
  if (check.ragChunkingTechniqueSignalType === "default_branch_snapshot") {
    return uniqueTrimmed(check.branchRefs ?? []).length > 0 &&
      uniqueTrimmed(check.commitRefs ?? []).length > 0 &&
      uniqueTrimmed(check.treeRefs ?? []).length > 0;
  }
  if (check.ragChunkingTechniqueSignalType === "readme_manifest") {
    return uniqueTrimmed(check.readmeBlobRefs ?? []).length > 0;
  }
  if (check.ragChunkingTechniqueSignalType === "policy_corpus_manifest") {
    return uniqueTrimmed(check.policyCorpusRefs ?? []).length > 0 &&
      Number.isFinite(check.policyDocumentCount) &&
      (check.policyDocumentCount ?? 0) >= thresholds.minRagChunkingTechniquePolicyDocumentCount;
  }
  if (
    check.ragChunkingTechniqueSignalType === "simple_rag_notebook_manifest" ||
    check.ragChunkingTechniqueSignalType === "smart_chunking_notebook_manifest" ||
    check.ragChunkingTechniqueSignalType === "rag_evaluation_notebook_manifest"
  ) {
    return uniqueTrimmed(check.notebookIds ?? []).length > 0 &&
      Number.isFinite(check.notebookCount) &&
      (check.notebookCount ?? 0) >= thresholds.minRagChunkingTechniqueNotebookCount;
  }
  if (check.ragChunkingTechniqueSignalType === "chunking_strategy_manifest") {
    return uniqueTrimmed(check.chunkingStrategyIds ?? []).length > 0 &&
      Number.isFinite(check.chunkingStrategyCount) &&
      (check.chunkingStrategyCount ?? 0) >= thresholds.minRagChunkingTechniqueChunkingStrategyCount;
  }
  if (check.ragChunkingTechniqueSignalType === "retrieval_pipeline_manifest") {
    return uniqueTrimmed(check.retrievalPipelineIds ?? []).length > 0;
  }
  if (check.ragChunkingTechniqueSignalType === "embedding_vectorstore_manifest") {
    return uniqueTrimmed(check.embeddingVectorstoreIds ?? []).length > 0;
  }
  if (check.ragChunkingTechniqueSignalType === "evaluation_dataset_manifest") {
    return uniqueTrimmed(check.evaluationDatasetIds ?? []).length > 0 &&
      Number.isFinite(check.evaluationQuestionCount) &&
      (check.evaluationQuestionCount ?? 0) >= thresholds.minRagChunkingTechniqueEvaluationQuestionCount;
  }
  if (check.ragChunkingTechniqueSignalType === "metric_definition_manifest") {
    return uniqueTrimmed(check.metricNames ?? []).length > 0 &&
      Number.isFinite(check.metricCount) &&
      (check.metricCount ?? 0) >= thresholds.minRagChunkingTechniqueMetricCount;
  }
  if (check.ragChunkingTechniqueSignalType === "ci_regression_manifest") {
    return uniqueTrimmed(check.ciReporterIds ?? []).length > 0 &&
      uniqueTrimmed(check.reporterFormats ?? []).length > 0 &&
      Number.isFinite(check.regressionPassRate0to1) &&
      (check.regressionPassRate0to1 ?? 0) >= thresholds.minRagChunkingTechniqueRegressionPassRate0to1;
  }
  if (
    check.ragChunkingTechniqueSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.ragChunkingTechniqueSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minRagChunkingTechniqueEvaluationQuestionCount &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function ragChunkingTechniqueSummary(
  checks: MetricValidationRagChunkingTechniqueCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationRagChunkingTechniqueSignal[];
  repositoryRefs: string[];
  licenseRefs: string[];
  branchRefs: string[];
  commitRefs: string[];
  treeRefs: string[];
  readmeBlobRefs: string[];
  policyCorpusRefs: string[];
  notebookIds: string[];
  chunkingStrategyIds: string[];
  retrievalPipelineIds: string[];
  embeddingVectorstoreIds: string[];
  evaluationDatasetIds: string[];
  metricNames: string[];
  ciReporterIds: string[];
  reporterFormats: string[];
  policyDocumentCount: number | null;
  notebookCount: number | null;
  chunkingStrategyCount: number | null;
  evaluationQuestionCount: number | null;
  metricCount: number | null;
  regressionPassRate0to1: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.ragChunkingTechniqueSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      repositoryRefs: [],
      licenseRefs: [],
      branchRefs: [],
      commitRefs: [],
      treeRefs: [],
      readmeBlobRefs: [],
      policyCorpusRefs: [],
      notebookIds: [],
      chunkingStrategyIds: [],
      retrievalPipelineIds: [],
      embeddingVectorstoreIds: [],
      evaluationDatasetIds: [],
      metricNames: [],
      ciReporterIds: [],
      reporterFormats: [],
      policyDocumentCount: null,
      notebookCount: null,
      chunkingStrategyCount: null,
      evaluationQuestionCount: null,
      metricCount: null,
      regressionPassRate0to1: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isRagChunkingTechniqueCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.ragChunkingTechniqueSignalType as MetricValidationRagChunkingTechniqueSignal)
  );
  const policyDocumentCounts = covered
    .map((check) => check.policyDocumentCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const notebookCounts = covered
    .map((check) => check.notebookCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const chunkingStrategyCounts = covered
    .map((check) => check.chunkingStrategyCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const evaluationQuestionCounts = covered
    .map((check) => check.evaluationQuestionCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const metricCounts = covered
    .map((check) => check.metricCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const regressionPassRates = covered
    .map((check) => check.regressionPassRate0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / RAG_CHUNKING_TECHNIQUE_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: RAG_CHUNKING_TECHNIQUE_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    branchRefs: uniqueTrimmed(scoped.flatMap((check) => check.branchRefs ?? [])),
    commitRefs: uniqueTrimmed(scoped.flatMap((check) => check.commitRefs ?? [])),
    treeRefs: uniqueTrimmed(scoped.flatMap((check) => check.treeRefs ?? [])),
    readmeBlobRefs: uniqueTrimmed(scoped.flatMap((check) => check.readmeBlobRefs ?? [])),
    policyCorpusRefs: uniqueTrimmed(scoped.flatMap((check) => check.policyCorpusRefs ?? [])),
    notebookIds: uniqueTrimmed(scoped.flatMap((check) => check.notebookIds ?? [])),
    chunkingStrategyIds: uniqueTrimmed(scoped.flatMap((check) => check.chunkingStrategyIds ?? [])),
    retrievalPipelineIds: uniqueTrimmed(scoped.flatMap((check) => check.retrievalPipelineIds ?? [])),
    embeddingVectorstoreIds: uniqueTrimmed(scoped.flatMap((check) => check.embeddingVectorstoreIds ?? [])),
    evaluationDatasetIds: uniqueTrimmed(scoped.flatMap((check) => check.evaluationDatasetIds ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    ciReporterIds: uniqueTrimmed(scoped.flatMap((check) => check.ciReporterIds ?? [])),
    reporterFormats: uniqueTrimmed(scoped.flatMap((check) => check.reporterFormats ?? [])),
    policyDocumentCount: policyDocumentCounts.length > 0 ? Math.max(...policyDocumentCounts) : null,
    notebookCount: notebookCounts.length > 0 ? Math.max(...notebookCounts) : null,
    chunkingStrategyCount: chunkingStrategyCounts.length > 0 ? Math.max(...chunkingStrategyCounts) : null,
    evaluationQuestionCount: evaluationQuestionCounts.length > 0 ? Math.max(...evaluationQuestionCounts) : null,
    metricCount: metricCounts.length > 0 ? Math.max(...metricCounts) : null,
    regressionPassRate0to1: regressionPassRates.length > 0 ? Math.min(...regressionPassRates) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          RAG_CHUNKING_TECHNIQUE_ARTIFACT_SIGNALS.has(check.ragChunkingTechniqueSignalType as MetricValidationRagChunkingTechniqueSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isKubernetesOperationalAgentCheckCovered(
  check: MetricValidationKubernetesOperationalAgentCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.kubernetesOperationalAgentSignalType) return false;
  if (!KUBERNETES_OPERATIONAL_AGENT_REQUIRED_SIGNALS.includes(check.kubernetesOperationalAgentSignalType)) {
    return false;
  }
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (
    KUBERNETES_OPERATIONAL_AGENT_ARTIFACT_SIGNALS.has(check.kubernetesOperationalAgentSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (check.kubernetesOperationalAgentSignalType === "source_repository_license") {
    return uniqueTrimmed(check.repositoryRefs ?? []).length > 0 &&
      uniqueTrimmed(check.licenseRefs ?? []).length > 0;
  }
  if (check.kubernetesOperationalAgentSignalType === "default_branch_snapshot") {
    return uniqueTrimmed(check.branchRefs ?? []).length > 0 &&
      uniqueTrimmed(check.commitRefs ?? []).length > 0 &&
      uniqueTrimmed(check.treeRefs ?? []).length > 0;
  }
  if (check.kubernetesOperationalAgentSignalType === "readme_manifest") {
    return uniqueTrimmed(check.readmeBlobRefs ?? []).length > 0;
  }
  if (check.kubernetesOperationalAgentSignalType === "release_asset_manifest") {
    return uniqueTrimmed(check.releaseRefs ?? []).length > 0;
  }
  if (check.kubernetesOperationalAgentSignalType === "build_workflow_manifest") {
    return uniqueTrimmed(check.buildWorkflowRefs ?? []).length > 0;
  }
  if (check.kubernetesOperationalAgentSignalType === "agent_module_manifest") {
    return uniqueTrimmed(check.agentModuleRefs ?? []).length > 0;
  }
  if (check.kubernetesOperationalAgentSignalType === "mcp_server_manifest") {
    return uniqueTrimmed(check.mcpServerModuleRefs ?? []).length > 0;
  }
  if (check.kubernetesOperationalAgentSignalType === "kubernetes_tool_inventory") {
    return uniqueTrimmed(check.toolModuleRefs ?? []).length > 0 &&
      uniqueTrimmed(check.toolCategoryIds ?? []).length >= thresholds.minKubernetesOperationalAgentToolCategoryCount &&
      Number.isFinite(check.toolCategoryCount) &&
      (check.toolCategoryCount ?? 0) >= thresholds.minKubernetesOperationalAgentToolCategoryCount;
  }
  if (check.kubernetesOperationalAgentSignalType === "diagnostic_capability_manifest") {
    return uniqueTrimmed(check.diagnosticCapabilityIds ?? []).length >= thresholds.minKubernetesOperationalAgentDiagnosticCapabilityCount &&
      Number.isFinite(check.diagnosticCapabilityCount) &&
      (check.diagnosticCapabilityCount ?? 0) >= thresholds.minKubernetesOperationalAgentDiagnosticCapabilityCount;
  }
  if (check.kubernetesOperationalAgentSignalType === "resource_monitoring_manifest") {
    return uniqueTrimmed(check.resourceMetricIds ?? []).length >= thresholds.minKubernetesOperationalAgentResourceMetricCount &&
      Number.isFinite(check.resourceMetricCount) &&
      (check.resourceMetricCount ?? 0) >= thresholds.minKubernetesOperationalAgentResourceMetricCount;
  }
  if (check.kubernetesOperationalAgentSignalType === "log_analysis_manifest") {
    return uniqueTrimmed(check.logAnalysisIds ?? []).length >= thresholds.minKubernetesOperationalAgentLogAnalysisCount &&
      Number.isFinite(check.logAnalysisCount) &&
      (check.logAnalysisCount ?? 0) >= thresholds.minKubernetesOperationalAgentLogAnalysisCount;
  }
  if (check.kubernetesOperationalAgentSignalType === "metric_definition_manifest") {
    return uniqueTrimmed(check.metricNames ?? []).length > 0;
  }
  if (check.kubernetesOperationalAgentSignalType === "ci_regression_manifest") {
    return uniqueTrimmed(check.ciReporterIds ?? []).length > 0 &&
      uniqueTrimmed(check.reporterFormats ?? []).length > 0 &&
      Number.isFinite(check.regressionPassRate0to1) &&
      (check.regressionPassRate0to1 ?? 0) >= thresholds.minKubernetesOperationalAgentRegressionPassRate0to1;
  }
  if (
    check.kubernetesOperationalAgentSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.kubernetesOperationalAgentSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function kubernetesOperationalAgentSummary(
  checks: MetricValidationKubernetesOperationalAgentCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationKubernetesOperationalAgentSignal[];
  repositoryRefs: string[];
  licenseRefs: string[];
  releaseRefs: string[];
  branchRefs: string[];
  commitRefs: string[];
  treeRefs: string[];
  readmeBlobRefs: string[];
  buildWorkflowRefs: string[];
  agentModuleRefs: string[];
  mcpServerModuleRefs: string[];
  toolModuleRefs: string[];
  toolCategoryIds: string[];
  diagnosticCapabilityIds: string[];
  resourceMetricIds: string[];
  logAnalysisIds: string[];
  metricNames: string[];
  ciReporterIds: string[];
  reporterFormats: string[];
  toolCategoryCount: number | null;
  diagnosticCapabilityCount: number | null;
  resourceMetricCount: number | null;
  logAnalysisCount: number | null;
  regressionPassRate0to1: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.kubernetesOperationalAgentSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      repositoryRefs: [],
      licenseRefs: [],
      releaseRefs: [],
      branchRefs: [],
      commitRefs: [],
      treeRefs: [],
      readmeBlobRefs: [],
      buildWorkflowRefs: [],
      agentModuleRefs: [],
      mcpServerModuleRefs: [],
      toolModuleRefs: [],
      toolCategoryIds: [],
      diagnosticCapabilityIds: [],
      resourceMetricIds: [],
      logAnalysisIds: [],
      metricNames: [],
      ciReporterIds: [],
      reporterFormats: [],
      toolCategoryCount: null,
      diagnosticCapabilityCount: null,
      resourceMetricCount: null,
      logAnalysisCount: null,
      regressionPassRate0to1: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isKubernetesOperationalAgentCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.kubernetesOperationalAgentSignalType as MetricValidationKubernetesOperationalAgentSignal)
  );
  const toolCategoryCounts = covered
    .map((check) => check.toolCategoryCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const diagnosticCapabilityCounts = covered
    .map((check) => check.diagnosticCapabilityCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const resourceMetricCounts = covered
    .map((check) => check.resourceMetricCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const logAnalysisCounts = covered
    .map((check) => check.logAnalysisCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const regressionPassRates = covered
    .map((check) => check.regressionPassRate0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / KUBERNETES_OPERATIONAL_AGENT_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: KUBERNETES_OPERATIONAL_AGENT_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    releaseRefs: uniqueTrimmed(scoped.flatMap((check) => check.releaseRefs ?? [])),
    branchRefs: uniqueTrimmed(scoped.flatMap((check) => check.branchRefs ?? [])),
    commitRefs: uniqueTrimmed(scoped.flatMap((check) => check.commitRefs ?? [])),
    treeRefs: uniqueTrimmed(scoped.flatMap((check) => check.treeRefs ?? [])),
    readmeBlobRefs: uniqueTrimmed(scoped.flatMap((check) => check.readmeBlobRefs ?? [])),
    buildWorkflowRefs: uniqueTrimmed(scoped.flatMap((check) => check.buildWorkflowRefs ?? [])),
    agentModuleRefs: uniqueTrimmed(scoped.flatMap((check) => check.agentModuleRefs ?? [])),
    mcpServerModuleRefs: uniqueTrimmed(scoped.flatMap((check) => check.mcpServerModuleRefs ?? [])),
    toolModuleRefs: uniqueTrimmed(scoped.flatMap((check) => check.toolModuleRefs ?? [])),
    toolCategoryIds: uniqueTrimmed(scoped.flatMap((check) => check.toolCategoryIds ?? [])),
    diagnosticCapabilityIds: uniqueTrimmed(scoped.flatMap((check) => check.diagnosticCapabilityIds ?? [])),
    resourceMetricIds: uniqueTrimmed(scoped.flatMap((check) => check.resourceMetricIds ?? [])),
    logAnalysisIds: uniqueTrimmed(scoped.flatMap((check) => check.logAnalysisIds ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    ciReporterIds: uniqueTrimmed(scoped.flatMap((check) => check.ciReporterIds ?? [])),
    reporterFormats: uniqueTrimmed(scoped.flatMap((check) => check.reporterFormats ?? [])),
    toolCategoryCount: toolCategoryCounts.length > 0 ? Math.max(...toolCategoryCounts) : null,
    diagnosticCapabilityCount: diagnosticCapabilityCounts.length > 0 ? Math.max(...diagnosticCapabilityCounts) : null,
    resourceMetricCount: resourceMetricCounts.length > 0 ? Math.max(...resourceMetricCounts) : null,
    logAnalysisCount: logAnalysisCounts.length > 0 ? Math.max(...logAnalysisCounts) : null,
    regressionPassRate0to1: regressionPassRates.length > 0 ? Math.min(...regressionPassRates) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          KUBERNETES_OPERATIONAL_AGENT_ARTIFACT_SIGNALS.has(check.kubernetesOperationalAgentSignalType as MetricValidationKubernetesOperationalAgentSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isSecureVibeBenchCheckCovered(
  check: MetricValidationSecureVibeBenchCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.secureVibeBenchSignalType) return false;
  if (!SECURE_VIBE_BENCH_REQUIRED_SIGNALS.includes(check.secureVibeBenchSignalType)) {
    return false;
  }
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (
    SECURE_VIBE_BENCH_ARTIFACT_SIGNALS.has(check.secureVibeBenchSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (check.secureVibeBenchSignalType === "source_repository_license_homepage") {
    return uniqueTrimmed(check.repositoryRefs ?? []).length > 0 &&
      uniqueTrimmed(check.licenseRefs ?? []).length > 0 &&
      uniqueTrimmed(check.homepageRefs ?? []).length > 0 &&
      uniqueTrimmed(check.arxivRefs ?? []).length > 0;
  }
  if (check.secureVibeBenchSignalType === "default_branch_snapshot") {
    return uniqueTrimmed(check.branchRefs ?? []).length > 0 &&
      uniqueTrimmed(check.commitRefs ?? []).length > 0 &&
      uniqueTrimmed(check.treeRefs ?? []).length > 0;
  }
  if (check.secureVibeBenchSignalType === "readme_manifest") {
    return uniqueTrimmed(check.readmeBlobRefs ?? []).length > 0;
  }
  if (check.secureVibeBenchSignalType === "results_manifest") {
    return uniqueTrimmed(check.resultsBlobRefs ?? []).length > 0;
  }
  if (check.secureVibeBenchSignalType === "dataset_manifest") {
    return uniqueTrimmed(check.datasetRefs ?? []).length > 0;
  }
  if (check.secureVibeBenchSignalType === "format_example_manifest") {
    return uniqueTrimmed(check.formatExampleRefs ?? []).length > 0;
  }
  if (check.secureVibeBenchSignalType === "evaluation_runner_manifest") {
    return uniqueTrimmed(check.evaluationRunnerRefs ?? []).length > 0;
  }
  if (check.secureVibeBenchSignalType === "agent_adapter_roster") {
    return uniqueTrimmed(check.agentAdapterIds ?? []).length >= thresholds.minSecureVibeBenchAgentAdapterCount &&
      Number.isFinite(check.agentAdapterCount) &&
      (check.agentAdapterCount ?? 0) >= thresholds.minSecureVibeBenchAgentAdapterCount;
  }
  if (check.secureVibeBenchSignalType === "vulnerability_scenario_manifest") {
    return uniqueTrimmed(check.vulnerabilityScenarioIds ?? []).length >= thresholds.minSecureVibeBenchScenarioCount &&
      Number.isFinite(check.scenarioCount) &&
      (check.scenarioCount ?? 0) >= thresholds.minSecureVibeBenchScenarioCount;
  }
  if (check.secureVibeBenchSignalType === "test_script_manifest") {
    return uniqueTrimmed(check.testScriptIds ?? []).length >= thresholds.minSecureVibeBenchTestScriptCount &&
      Number.isFinite(check.testScriptCount) &&
      (check.testScriptCount ?? 0) >= thresholds.minSecureVibeBenchTestScriptCount;
  }
  if (check.secureVibeBenchSignalType === "parser_utility_manifest") {
    return uniqueTrimmed(check.parserUtilityRefs ?? []).length > 0;
  }
  if (check.secureVibeBenchSignalType === "patch_diff_utility_manifest") {
    return uniqueTrimmed(check.patchDiffUtilityRefs ?? []).length > 0;
  }
  if (check.secureVibeBenchSignalType === "metric_definition_manifest") {
    return uniqueTrimmed(check.metricNames ?? []).length > 0;
  }
  if (check.secureVibeBenchSignalType === "ci_regression_manifest") {
    return uniqueTrimmed(check.ciReporterIds ?? []).length > 0 &&
      uniqueTrimmed(check.reporterFormats ?? []).length > 0 &&
      Number.isFinite(check.regressionPassRate0to1) &&
      (check.regressionPassRate0to1 ?? 0) >= thresholds.minSecureVibeBenchRegressionPassRate0to1;
  }
  if (
    check.secureVibeBenchSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.secureVibeBenchSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function secureVibeBenchSummary(
  checks: MetricValidationSecureVibeBenchCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationSecureVibeBenchSignal[];
  repositoryRefs: string[];
  licenseRefs: string[];
  homepageRefs: string[];
  arxivRefs: string[];
  branchRefs: string[];
  commitRefs: string[];
  treeRefs: string[];
  readmeBlobRefs: string[];
  resultsBlobRefs: string[];
  datasetRefs: string[];
  formatExampleRefs: string[];
  evaluationRunnerRefs: string[];
  agentAdapterIds: string[];
  vulnerabilityScenarioIds: string[];
  testScriptIds: string[];
  parserUtilityRefs: string[];
  patchDiffUtilityRefs: string[];
  metricNames: string[];
  ciReporterIds: string[];
  reporterFormats: string[];
  agentAdapterCount: number | null;
  scenarioCount: number | null;
  testScriptCount: number | null;
  regressionPassRate0to1: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.secureVibeBenchSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      repositoryRefs: [],
      licenseRefs: [],
      homepageRefs: [],
      arxivRefs: [],
      branchRefs: [],
      commitRefs: [],
      treeRefs: [],
      readmeBlobRefs: [],
      resultsBlobRefs: [],
      datasetRefs: [],
      formatExampleRefs: [],
      evaluationRunnerRefs: [],
      agentAdapterIds: [],
      vulnerabilityScenarioIds: [],
      testScriptIds: [],
      parserUtilityRefs: [],
      patchDiffUtilityRefs: [],
      metricNames: [],
      ciReporterIds: [],
      reporterFormats: [],
      agentAdapterCount: null,
      scenarioCount: null,
      testScriptCount: null,
      regressionPassRate0to1: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isSecureVibeBenchCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.secureVibeBenchSignalType as MetricValidationSecureVibeBenchSignal)
  );
  const agentAdapterCounts = covered
    .map((check) => check.agentAdapterCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const scenarioCounts = covered
    .map((check) => check.scenarioCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const testScriptCounts = covered
    .map((check) => check.testScriptCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const regressionPassRates = covered
    .map((check) => check.regressionPassRate0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / SECURE_VIBE_BENCH_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: SECURE_VIBE_BENCH_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    homepageRefs: uniqueTrimmed(scoped.flatMap((check) => check.homepageRefs ?? [])),
    arxivRefs: uniqueTrimmed(scoped.flatMap((check) => check.arxivRefs ?? [])),
    branchRefs: uniqueTrimmed(scoped.flatMap((check) => check.branchRefs ?? [])),
    commitRefs: uniqueTrimmed(scoped.flatMap((check) => check.commitRefs ?? [])),
    treeRefs: uniqueTrimmed(scoped.flatMap((check) => check.treeRefs ?? [])),
    readmeBlobRefs: uniqueTrimmed(scoped.flatMap((check) => check.readmeBlobRefs ?? [])),
    resultsBlobRefs: uniqueTrimmed(scoped.flatMap((check) => check.resultsBlobRefs ?? [])),
    datasetRefs: uniqueTrimmed(scoped.flatMap((check) => check.datasetRefs ?? [])),
    formatExampleRefs: uniqueTrimmed(scoped.flatMap((check) => check.formatExampleRefs ?? [])),
    evaluationRunnerRefs: uniqueTrimmed(scoped.flatMap((check) => check.evaluationRunnerRefs ?? [])),
    agentAdapterIds: uniqueTrimmed(scoped.flatMap((check) => check.agentAdapterIds ?? [])),
    vulnerabilityScenarioIds: uniqueTrimmed(scoped.flatMap((check) => check.vulnerabilityScenarioIds ?? [])),
    testScriptIds: uniqueTrimmed(scoped.flatMap((check) => check.testScriptIds ?? [])),
    parserUtilityRefs: uniqueTrimmed(scoped.flatMap((check) => check.parserUtilityRefs ?? [])),
    patchDiffUtilityRefs: uniqueTrimmed(scoped.flatMap((check) => check.patchDiffUtilityRefs ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    ciReporterIds: uniqueTrimmed(scoped.flatMap((check) => check.ciReporterIds ?? [])),
    reporterFormats: uniqueTrimmed(scoped.flatMap((check) => check.reporterFormats ?? [])),
    agentAdapterCount: agentAdapterCounts.length > 0 ? Math.max(...agentAdapterCounts) : null,
    scenarioCount: scenarioCounts.length > 0 ? Math.max(...scenarioCounts) : null,
    testScriptCount: testScriptCounts.length > 0 ? Math.max(...testScriptCounts) : null,
    regressionPassRate0to1: regressionPassRates.length > 0 ? Math.min(...regressionPassRates) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          SECURE_VIBE_BENCH_ARTIFACT_SIGNALS.has(check.secureVibeBenchSignalType as MetricValidationSecureVibeBenchSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isRavigBenchCheckCovered(
  check: MetricValidationRavigBenchCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.ravigBenchSignalType) return false;
  if (!RAVIG_BENCH_REQUIRED_SIGNALS.includes(check.ravigBenchSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (
    RAVIG_BENCH_ARTIFACT_SIGNALS.has(check.ravigBenchSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (check.ravigBenchSignalType === "source_repository_license") {
    return uniqueTrimmed(check.repositoryRefs ?? []).length > 0 &&
      uniqueTrimmed(check.licenseRefs ?? []).length > 0;
  }
  if (check.ravigBenchSignalType === "default_branch_snapshot") {
    return uniqueTrimmed(check.branchRefs ?? []).length > 0 &&
      uniqueTrimmed(check.commitRefs ?? []).length > 0;
  }
  if (check.ravigBenchSignalType === "readme_legal_manifest") {
    return uniqueTrimmed(check.readmeBlobRefs ?? []).length > 0 &&
      uniqueTrimmed(check.legalBlobRefs ?? []).length > 0;
  }
  if (check.ravigBenchSignalType === "environment_dependency_manifest") {
    return uniqueTrimmed(check.environmentRefs ?? []).length > 0;
  }
  if (check.ravigBenchSignalType === "configuration_manifest") {
    return uniqueTrimmed(check.configurationRefs ?? []).length > 0;
  }
  if (check.ravigBenchSignalType === "content_evaluation_manifest") {
    return uniqueTrimmed(check.contentEvaluationRefs ?? []).length > 0;
  }
  if (check.ravigBenchSignalType === "design_evaluation_manifest") {
    return uniqueTrimmed(check.designEvaluationRefs ?? []).length > 0 &&
      Number.isFinite(check.visualDesignCheckCount) &&
      (check.visualDesignCheckCount ?? 0) >= thresholds.minRavigBenchVisualDesignCheckCount;
  }
  if (check.ravigBenchSignalType === "execution_evaluation_manifest") {
    return uniqueTrimmed(check.executionEvaluationRefs ?? []).length > 0;
  }
  if (check.ravigBenchSignalType === "function_scoring_manifest") {
    return uniqueTrimmed(check.functionScoringRefs ?? []).length > 0;
  }
  if (check.ravigBenchSignalType === "dataset_manifest") {
    return uniqueTrimmed(check.datasetRefs ?? []).length > 0 &&
      Number.isFinite(check.datasetCaseCount) &&
      (check.datasetCaseCount ?? 0) >= thresholds.minRavigBenchDatasetCaseCount;
  }
  if (check.ravigBenchSignalType === "test_case_manifest") {
    return uniqueTrimmed(check.testCaseRefs ?? []).length > 0;
  }
  if (check.ravigBenchSignalType === "model_result_manifest") {
    return uniqueTrimmed(check.modelResultRefs ?? []).length > 0;
  }
  if (check.ravigBenchSignalType === "visual_rich_generation_taxonomy") {
    return uniqueTrimmed(check.taxonomyIds ?? []).length >= 3;
  }
  if (check.ravigBenchSignalType === "rag_retrieval_context_manifest") {
    return uniqueTrimmed(check.retrievalContextIds ?? []).length > 0;
  }
  if (check.ravigBenchSignalType === "multi_modal_evaluator_manifest") {
    return uniqueTrimmed(check.multiModalEvaluatorIds ?? []).length >= thresholds.minRavigBenchEvaluatorCount &&
      Number.isFinite(check.evaluatorCount) &&
      (check.evaluatorCount ?? 0) >= thresholds.minRavigBenchEvaluatorCount;
  }
  if (check.ravigBenchSignalType === "screenshot_evaluation_manifest") {
    return uniqueTrimmed(check.screenshotEvaluationRefs ?? []).length > 0;
  }
  if (check.ravigBenchSignalType === "run_script_manifest") {
    return uniqueTrimmed(check.runScriptRefs ?? []).length > 0;
  }
  if (check.ravigBenchSignalType === "metric_definition_manifest") {
    return uniqueTrimmed(check.metricNames ?? []).length >= 3;
  }
  if (check.ravigBenchSignalType === "ci_regression_manifest") {
    return uniqueTrimmed(check.ciReporterIds ?? []).length > 0 &&
      uniqueTrimmed(check.reporterFormats ?? []).length > 0 &&
      Number.isFinite(check.validationPassRate0to1) &&
      (check.validationPassRate0to1 ?? 0) >= thresholds.minRavigBenchValidationPassRate0to1;
  }
  if (
    check.ravigBenchSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.ravigBenchSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function ravigBenchSummary(
  checks: MetricValidationRavigBenchCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationRavigBenchSignal[];
  repositoryRefs: string[];
  licenseRefs: string[];
  branchRefs: string[];
  commitRefs: string[];
  treeRefs: string[];
  readmeBlobRefs: string[];
  legalBlobRefs: string[];
  environmentRefs: string[];
  configurationRefs: string[];
  contentEvaluationRefs: string[];
  designEvaluationRefs: string[];
  executionEvaluationRefs: string[];
  functionScoringRefs: string[];
  datasetRefs: string[];
  testCaseRefs: string[];
  modelResultRefs: string[];
  taxonomyIds: string[];
  retrievalContextIds: string[];
  multiModalEvaluatorIds: string[];
  screenshotEvaluationRefs: string[];
  runScriptRefs: string[];
  metricNames: string[];
  ciReporterIds: string[];
  reporterFormats: string[];
  datasetCaseCount: number | null;
  visualDesignCheckCount: number | null;
  evaluatorCount: number | null;
  validationPassRate0to1: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.ravigBenchSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      repositoryRefs: [],
      licenseRefs: [],
      branchRefs: [],
      commitRefs: [],
      treeRefs: [],
      readmeBlobRefs: [],
      legalBlobRefs: [],
      environmentRefs: [],
      configurationRefs: [],
      contentEvaluationRefs: [],
      designEvaluationRefs: [],
      executionEvaluationRefs: [],
      functionScoringRefs: [],
      datasetRefs: [],
      testCaseRefs: [],
      modelResultRefs: [],
      taxonomyIds: [],
      retrievalContextIds: [],
      multiModalEvaluatorIds: [],
      screenshotEvaluationRefs: [],
      runScriptRefs: [],
      metricNames: [],
      ciReporterIds: [],
      reporterFormats: [],
      datasetCaseCount: null,
      visualDesignCheckCount: null,
      evaluatorCount: null,
      validationPassRate0to1: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isRavigBenchCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.ravigBenchSignalType as MetricValidationRavigBenchSignal)
  );
  const datasetCaseCounts = covered
    .map((check) => check.datasetCaseCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const visualDesignCheckCounts = covered
    .map((check) => check.visualDesignCheckCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const evaluatorCounts = covered
    .map((check) => check.evaluatorCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const validationPassRates = covered
    .map((check) => check.validationPassRate0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / RAVIG_BENCH_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: RAVIG_BENCH_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    branchRefs: uniqueTrimmed(scoped.flatMap((check) => check.branchRefs ?? [])),
    commitRefs: uniqueTrimmed(scoped.flatMap((check) => check.commitRefs ?? [])),
    treeRefs: uniqueTrimmed(scoped.flatMap((check) => check.treeRefs ?? [])),
    readmeBlobRefs: uniqueTrimmed(scoped.flatMap((check) => check.readmeBlobRefs ?? [])),
    legalBlobRefs: uniqueTrimmed(scoped.flatMap((check) => check.legalBlobRefs ?? [])),
    environmentRefs: uniqueTrimmed(scoped.flatMap((check) => check.environmentRefs ?? [])),
    configurationRefs: uniqueTrimmed(scoped.flatMap((check) => check.configurationRefs ?? [])),
    contentEvaluationRefs: uniqueTrimmed(scoped.flatMap((check) => check.contentEvaluationRefs ?? [])),
    designEvaluationRefs: uniqueTrimmed(scoped.flatMap((check) => check.designEvaluationRefs ?? [])),
    executionEvaluationRefs: uniqueTrimmed(scoped.flatMap((check) => check.executionEvaluationRefs ?? [])),
    functionScoringRefs: uniqueTrimmed(scoped.flatMap((check) => check.functionScoringRefs ?? [])),
    datasetRefs: uniqueTrimmed(scoped.flatMap((check) => check.datasetRefs ?? [])),
    testCaseRefs: uniqueTrimmed(scoped.flatMap((check) => check.testCaseRefs ?? [])),
    modelResultRefs: uniqueTrimmed(scoped.flatMap((check) => check.modelResultRefs ?? [])),
    taxonomyIds: uniqueTrimmed(scoped.flatMap((check) => check.taxonomyIds ?? [])),
    retrievalContextIds: uniqueTrimmed(scoped.flatMap((check) => check.retrievalContextIds ?? [])),
    multiModalEvaluatorIds: uniqueTrimmed(scoped.flatMap((check) => check.multiModalEvaluatorIds ?? [])),
    screenshotEvaluationRefs: uniqueTrimmed(scoped.flatMap((check) => check.screenshotEvaluationRefs ?? [])),
    runScriptRefs: uniqueTrimmed(scoped.flatMap((check) => check.runScriptRefs ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    ciReporterIds: uniqueTrimmed(scoped.flatMap((check) => check.ciReporterIds ?? [])),
    reporterFormats: uniqueTrimmed(scoped.flatMap((check) => check.reporterFormats ?? [])),
    datasetCaseCount: datasetCaseCounts.length > 0 ? Math.max(...datasetCaseCounts) : null,
    visualDesignCheckCount: visualDesignCheckCounts.length > 0 ? Math.max(...visualDesignCheckCounts) : null,
    evaluatorCount: evaluatorCounts.length > 0 ? Math.max(...evaluatorCounts) : null,
    validationPassRate0to1: validationPassRates.length > 0 ? Math.min(...validationPassRates) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          RAVIG_BENCH_ARTIFACT_SIGNALS.has(check.ravigBenchSignalType as MetricValidationRavigBenchSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isHumanStudyBenchCheckCovered(
  check: MetricValidationHumanStudyBenchCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.humanStudyBenchSignalType) return false;
  if (!HUMAN_STUDY_BENCH_REQUIRED_SIGNALS.includes(check.humanStudyBenchSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (
    HUMAN_STUDY_BENCH_ARTIFACT_SIGNALS.has(check.humanStudyBenchSignalType) &&
    !isSha256Hash(check.artifactHash)
  ) {
    return false;
  }
  if (check.humanStudyBenchSignalType === "source_repository_license") {
    return uniqueTrimmed(check.repositoryRefs ?? []).length > 0 &&
      uniqueTrimmed(check.licenseRefs ?? []).length > 0;
  }
  if (check.humanStudyBenchSignalType === "default_branch_snapshot") {
    return uniqueTrimmed(check.branchRefs ?? []).length > 0 &&
      uniqueTrimmed(check.commitRefs ?? []).length > 0;
  }
  if (check.humanStudyBenchSignalType === "study_config_manifest") {
    return uniqueTrimmed(check.studyConfigIds ?? []).length > 0 &&
      Number.isFinite(check.studyCount) &&
      (check.studyCount ?? 0) >= thresholds.minSampleSize;
  }
  if (check.humanStudyBenchSignalType === "participant_background_manifest") {
    return uniqueTrimmed(check.backgroundDatasetIds ?? []).length > 0 &&
      Number.isFinite(check.participantCount) &&
      (check.participantCount ?? 0) >= thresholds.minSampleSize;
  }
  if (check.humanStudyBenchSignalType === "human_response_manifest") {
    return uniqueTrimmed(check.humanResponseDatasetIds ?? []).length > 0 &&
      Number.isFinite(check.responseCount) &&
      (check.responseCount ?? 0) >= thresholds.minSampleSize;
  }
  if (check.humanStudyBenchSignalType === "agent_response_manifest") {
    return uniqueTrimmed(check.agentResponseDatasetIds ?? []).length > 0 &&
      Number.isFinite(check.responseCount) &&
      (check.responseCount ?? 0) >= thresholds.minSampleSize;
  }
  if (check.humanStudyBenchSignalType === "evaluator_registry_manifest") {
    return uniqueTrimmed(check.evaluatorIds ?? []).length > 0 &&
      Number.isFinite(check.evaluatorCount) &&
      (check.evaluatorCount ?? 0) >= 2;
  }
  if (
    check.humanStudyBenchSignalType === "metric_definition_manifest" &&
    uniqueTrimmed(check.metricNames ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.humanStudyBenchSignalType === "response_validator_manifest" &&
    uniqueTrimmed(check.validatorIds ?? []).length === 0
  ) {
    return false;
  }
  if (check.humanStudyBenchSignalType === "scorer_standardizer_manifest") {
    return uniqueTrimmed(check.scorerIds ?? []).length > 0 &&
      uniqueTrimmed(check.standardizerIds ?? []).length > 0;
  }
  if (check.humanStudyBenchSignalType === "inter_rater_agreement_report") {
    return uniqueTrimmed(check.reliabilityReportIds ?? []).length > 0 &&
      Number.isFinite(check.interRaterAgreement0to1) &&
      (check.interRaterAgreement0to1 ?? 0) >= thresholds.minHumanStudyBenchInterRaterAgreement0to1;
  }
  if (check.humanStudyBenchSignalType === "test_retest_reliability_report") {
    return uniqueTrimmed(check.reliabilityReportIds ?? []).length > 0 &&
      Number.isFinite(check.testRetestReliability0to1) &&
      (check.testRetestReliability0to1 ?? 0) >= thresholds.minHumanStudyBenchTestRetestReliability0to1;
  }
  if (check.humanStudyBenchSignalType === "validation_pipeline_manifest") {
    return uniqueTrimmed(check.validationPipelineIds ?? []).length > 0 &&
      Number.isFinite(check.validationPassRate0to1) &&
      (check.validationPassRate0to1 ?? 0) >= thresholds.minHumanStudyBenchValidationPassRate0to1;
  }
  if (
    check.humanStudyBenchSignalType === "result_artifact_manifest" &&
    (uniqueTrimmed(check.resultArtifactIds ?? []).length === 0 ||
      uniqueTrimmed(check.metricNames ?? []).length === 0)
  ) {
    return false;
  }
  if (check.humanStudyBenchSignalType === "ci_regression_manifest") {
    return uniqueTrimmed(check.ciReporterIds ?? []).length > 0 &&
      uniqueTrimmed(check.reporterFormats ?? []).length > 0 &&
      Number.isFinite(check.validationPassRate0to1) &&
      (check.validationPassRate0to1 ?? 0) >= thresholds.minHumanStudyBenchValidationPassRate0to1;
  }
  if (
    check.humanStudyBenchSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.humanStudyBenchSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function humanStudyBenchSummary(
  checks: MetricValidationHumanStudyBenchCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationHumanStudyBenchSignal[];
  repositoryRefs: string[];
  licenseRefs: string[];
  branchRefs: string[];
  commitRefs: string[];
  studyConfigIds: string[];
  backgroundDatasetIds: string[];
  humanResponseDatasetIds: string[];
  agentResponseDatasetIds: string[];
  evaluatorIds: string[];
  metricNames: string[];
  validatorIds: string[];
  scorerIds: string[];
  standardizerIds: string[];
  reliabilityReportIds: string[];
  validationPipelineIds: string[];
  resultArtifactIds: string[];
  ciReporterIds: string[];
  reporterFormats: string[];
  studyCount: number | null;
  participantCount: number | null;
  responseCount: number | null;
  evaluatorCount: number | null;
  interRaterAgreement0to1: number | null;
  testRetestReliability0to1: number | null;
  validationPassRate0to1: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.humanStudyBenchSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      repositoryRefs: [],
      licenseRefs: [],
      branchRefs: [],
      commitRefs: [],
      studyConfigIds: [],
      backgroundDatasetIds: [],
      humanResponseDatasetIds: [],
      agentResponseDatasetIds: [],
      evaluatorIds: [],
      metricNames: [],
      validatorIds: [],
      scorerIds: [],
      standardizerIds: [],
      reliabilityReportIds: [],
      validationPipelineIds: [],
      resultArtifactIds: [],
      ciReporterIds: [],
      reporterFormats: [],
      studyCount: null,
      participantCount: null,
      responseCount: null,
      evaluatorCount: null,
      interRaterAgreement0to1: null,
      testRetestReliability0to1: null,
      validationPassRate0to1: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isHumanStudyBenchCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.humanStudyBenchSignalType as MetricValidationHumanStudyBenchSignal)
  );
  const studyCounts = covered
    .map((check) => check.studyCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const participantCounts = covered
    .map((check) => check.participantCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const responseCounts = covered
    .map((check) => check.responseCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const evaluatorCounts = covered
    .map((check) => check.evaluatorCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const interRaterAgreements = covered
    .map((check) => check.interRaterAgreement0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const testRetestReliabilities = covered
    .map((check) => check.testRetestReliability0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const validationPassRates = covered
    .map((check) => check.validationPassRate0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / HUMAN_STUDY_BENCH_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: HUMAN_STUDY_BENCH_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    branchRefs: uniqueTrimmed(scoped.flatMap((check) => check.branchRefs ?? [])),
    commitRefs: uniqueTrimmed(scoped.flatMap((check) => check.commitRefs ?? [])),
    studyConfigIds: uniqueTrimmed(scoped.flatMap((check) => check.studyConfigIds ?? [])),
    backgroundDatasetIds: uniqueTrimmed(scoped.flatMap((check) => check.backgroundDatasetIds ?? [])),
    humanResponseDatasetIds: uniqueTrimmed(scoped.flatMap((check) => check.humanResponseDatasetIds ?? [])),
    agentResponseDatasetIds: uniqueTrimmed(scoped.flatMap((check) => check.agentResponseDatasetIds ?? [])),
    evaluatorIds: uniqueTrimmed(scoped.flatMap((check) => check.evaluatorIds ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    validatorIds: uniqueTrimmed(scoped.flatMap((check) => check.validatorIds ?? [])),
    scorerIds: uniqueTrimmed(scoped.flatMap((check) => check.scorerIds ?? [])),
    standardizerIds: uniqueTrimmed(scoped.flatMap((check) => check.standardizerIds ?? [])),
    reliabilityReportIds: uniqueTrimmed(scoped.flatMap((check) => check.reliabilityReportIds ?? [])),
    validationPipelineIds: uniqueTrimmed(scoped.flatMap((check) => check.validationPipelineIds ?? [])),
    resultArtifactIds: uniqueTrimmed(scoped.flatMap((check) => check.resultArtifactIds ?? [])),
    ciReporterIds: uniqueTrimmed(scoped.flatMap((check) => check.ciReporterIds ?? [])),
    reporterFormats: uniqueTrimmed(scoped.flatMap((check) => check.reporterFormats ?? [])),
    studyCount: studyCounts.length > 0 ? Math.max(...studyCounts) : null,
    participantCount: participantCounts.length > 0 ? Math.max(...participantCounts) : null,
    responseCount: responseCounts.length > 0 ? Math.max(...responseCounts) : null,
    evaluatorCount: evaluatorCounts.length > 0 ? Math.max(...evaluatorCounts) : null,
    interRaterAgreement0to1: interRaterAgreements.length > 0 ? Math.min(...interRaterAgreements) : null,
    testRetestReliability0to1: testRetestReliabilities.length > 0 ? Math.min(...testRetestReliabilities) : null,
    validationPassRate0to1: validationPassRates.length > 0 ? Math.min(...validationPassRates) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          HUMAN_STUDY_BENCH_ARTIFACT_SIGNALS.has(check.humanStudyBenchSignalType as MetricValidationHumanStudyBenchSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isLegacyBenchCheckCovered(
  check: MetricValidationLegacyBenchCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.legacyBenchSignalType) return false;
  if (!LEGACY_BENCH_REQUIRED_SIGNALS.includes(check.legacyBenchSignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (LEGACY_BENCH_ARTIFACT_SIGNALS.has(check.legacyBenchSignalType) && !isSha256Hash(check.artifactHash)) {
    return false;
  }
  if (check.legacyBenchSignalType === "source_repository_license") {
    return uniqueTrimmed(check.repositoryRefs ?? []).length > 0 &&
      uniqueTrimmed(check.licenseRefs ?? []).length > 0;
  }
  if (check.legacyBenchSignalType === "default_branch_snapshot") {
    return uniqueTrimmed(check.branchRefs ?? []).length > 0 &&
      uniqueTrimmed(check.commitRefs ?? []).length > 0 &&
      uniqueTrimmed(check.treeRefs ?? []).length > 0;
  }
  if (
    check.legacyBenchSignalType === "readme_manifest" &&
    uniqueTrimmed(check.readmeBlobRefs ?? []).length === 0
  ) {
    return false;
  }
  if (check.legacyBenchSignalType === "task_corpus_manifest") {
    return uniqueTrimmed(check.taskCorpusRefs ?? []).length > 0 &&
      Number.isFinite(check.taskCount) &&
      (check.taskCount ?? 0) >= thresholds.minSampleSize;
  }
  if (check.legacyBenchSignalType === "legacy_language_manifest") {
    return uniqueTrimmed(check.legacyLanguageIds ?? []).length > 0 &&
      Number.isFinite(check.languageCount) &&
      (check.languageCount ?? 0) >= thresholds.minLegacyBenchLanguageCount;
  }
  if (check.legacyBenchSignalType === "environment_manifest") {
    return uniqueTrimmed(check.environmentIds ?? []).length > 0 &&
      Number.isFinite(check.environmentCount) &&
      (check.environmentCount ?? 0) >= thresholds.minSampleSize;
  }
  if (
    check.legacyBenchSignalType === "harness_runner_manifest" &&
    uniqueTrimmed(check.harnessRunnerIds ?? []).length === 0
  ) {
    return false;
  }
  if (check.legacyBenchSignalType === "agent_task_manifest") {
    return uniqueTrimmed(check.agentTaskIds ?? []).length > 0 &&
      Number.isFinite(check.taskCount) &&
      (check.taskCount ?? 0) >= thresholds.minSampleSize;
  }
  if (
    check.legacyBenchSignalType === "patch_submission_manifest" &&
    uniqueTrimmed(check.patchSubmissionIds ?? []).length === 0
  ) {
    return false;
  }
  if (check.legacyBenchSignalType === "test_oracle_manifest") {
    return uniqueTrimmed(check.testOracleIds ?? []).length > 0 &&
      Number.isFinite(check.testOracleCount) &&
      (check.testOracleCount ?? 0) >= thresholds.minSampleSize;
  }
  if (check.legacyBenchSignalType === "evaluator_registry_manifest") {
    return uniqueTrimmed(check.evaluatorIds ?? []).length > 0 &&
      Number.isFinite(check.evaluatorCount) &&
      (check.evaluatorCount ?? 0) >= 1;
  }
  if (
    check.legacyBenchSignalType === "scoring_metric_manifest" &&
    uniqueTrimmed(check.metricNames ?? []).length === 0
  ) {
    return false;
  }
  if (check.legacyBenchSignalType === "regression_ci_manifest") {
    return uniqueTrimmed(check.ciReporterIds ?? []).length > 0 &&
      uniqueTrimmed(check.reporterFormats ?? []).length > 0 &&
      Number.isFinite(check.regressionPassRate0to1) &&
      (check.regressionPassRate0to1 ?? 0) >= thresholds.minLegacyBenchRegressionPassRate0to1;
  }
  if (
    check.legacyBenchSignalType === "result_artifact_manifest" &&
    (uniqueTrimmed(check.resultArtifactIds ?? []).length === 0 ||
      uniqueTrimmed(check.metricNames ?? []).length === 0)
  ) {
    return false;
  }
  if (check.legacyBenchSignalType === "replay_command_manifest") {
    return uniqueTrimmed(check.replayCommandIds ?? []).length > 0 &&
      Number.isFinite(check.replayPassRate0to1) &&
      (check.replayPassRate0to1 ?? 0) >= thresholds.minLegacyBenchReplayPassRate0to1;
  }
  if (
    check.legacyBenchSignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.legacyBenchSignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSampleSize &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function legacyBenchSummary(
  checks: MetricValidationLegacyBenchCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationLegacyBenchSignal[];
  repositoryRefs: string[];
  licenseRefs: string[];
  branchRefs: string[];
  commitRefs: string[];
  treeRefs: string[];
  readmeBlobRefs: string[];
  taskCorpusRefs: string[];
  legacyLanguageIds: string[];
  environmentIds: string[];
  harnessRunnerIds: string[];
  agentTaskIds: string[];
  patchSubmissionIds: string[];
  testOracleIds: string[];
  evaluatorIds: string[];
  metricNames: string[];
  ciReporterIds: string[];
  reporterFormats: string[];
  resultArtifactIds: string[];
  replayCommandIds: string[];
  taskCount: number | null;
  languageCount: number | null;
  environmentCount: number | null;
  testOracleCount: number | null;
  evaluatorCount: number | null;
  regressionPassRate0to1: number | null;
  replayPassRate0to1: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.legacyBenchSignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      repositoryRefs: [],
      licenseRefs: [],
      branchRefs: [],
      commitRefs: [],
      treeRefs: [],
      readmeBlobRefs: [],
      taskCorpusRefs: [],
      legacyLanguageIds: [],
      environmentIds: [],
      harnessRunnerIds: [],
      agentTaskIds: [],
      patchSubmissionIds: [],
      testOracleIds: [],
      evaluatorIds: [],
      metricNames: [],
      ciReporterIds: [],
      reporterFormats: [],
      resultArtifactIds: [],
      replayCommandIds: [],
      taskCount: null,
      languageCount: null,
      environmentCount: null,
      testOracleCount: null,
      evaluatorCount: null,
      regressionPassRate0to1: null,
      replayPassRate0to1: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isLegacyBenchCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.legacyBenchSignalType as MetricValidationLegacyBenchSignal)
  );
  const taskCounts = covered
    .map((check) => check.taskCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const languageCounts = covered
    .map((check) => check.languageCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const environmentCounts = covered
    .map((check) => check.environmentCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const testOracleCounts = covered
    .map((check) => check.testOracleCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const evaluatorCounts = covered
    .map((check) => check.evaluatorCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const regressionPassRates = covered
    .map((check) => check.regressionPassRate0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const replayPassRates = covered
    .map((check) => check.replayPassRate0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / LEGACY_BENCH_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: LEGACY_BENCH_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    branchRefs: uniqueTrimmed(scoped.flatMap((check) => check.branchRefs ?? [])),
    commitRefs: uniqueTrimmed(scoped.flatMap((check) => check.commitRefs ?? [])),
    treeRefs: uniqueTrimmed(scoped.flatMap((check) => check.treeRefs ?? [])),
    readmeBlobRefs: uniqueTrimmed(scoped.flatMap((check) => check.readmeBlobRefs ?? [])),
    taskCorpusRefs: uniqueTrimmed(scoped.flatMap((check) => check.taskCorpusRefs ?? [])),
    legacyLanguageIds: uniqueTrimmed(scoped.flatMap((check) => check.legacyLanguageIds ?? [])),
    environmentIds: uniqueTrimmed(scoped.flatMap((check) => check.environmentIds ?? [])),
    harnessRunnerIds: uniqueTrimmed(scoped.flatMap((check) => check.harnessRunnerIds ?? [])),
    agentTaskIds: uniqueTrimmed(scoped.flatMap((check) => check.agentTaskIds ?? [])),
    patchSubmissionIds: uniqueTrimmed(scoped.flatMap((check) => check.patchSubmissionIds ?? [])),
    testOracleIds: uniqueTrimmed(scoped.flatMap((check) => check.testOracleIds ?? [])),
    evaluatorIds: uniqueTrimmed(scoped.flatMap((check) => check.evaluatorIds ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    ciReporterIds: uniqueTrimmed(scoped.flatMap((check) => check.ciReporterIds ?? [])),
    reporterFormats: uniqueTrimmed(scoped.flatMap((check) => check.reporterFormats ?? [])),
    resultArtifactIds: uniqueTrimmed(scoped.flatMap((check) => check.resultArtifactIds ?? [])),
    replayCommandIds: uniqueTrimmed(scoped.flatMap((check) => check.replayCommandIds ?? [])),
    taskCount: taskCounts.length > 0 ? Math.max(...taskCounts) : null,
    languageCount: languageCounts.length > 0 ? Math.max(...languageCounts) : null,
    environmentCount: environmentCounts.length > 0 ? Math.max(...environmentCounts) : null,
    testOracleCount: testOracleCounts.length > 0 ? Math.max(...testOracleCounts) : null,
    evaluatorCount: evaluatorCounts.length > 0 ? Math.max(...evaluatorCounts) : null,
    regressionPassRate0to1: regressionPassRates.length > 0 ? Math.min(...regressionPassRates) : null,
    replayPassRate0to1: replayPassRates.length > 0 ? Math.min(...replayPassRates) : null,
    reportArtifactHashes: [
      ...new Set(scoped
        .filter((check) =>
          LEGACY_BENCH_ARTIFACT_SIGNALS.has(check.legacyBenchSignalType as MetricValidationLegacyBenchSignal) &&
          isSha256Hash(check.artifactHash)
        )
        .map((check) => (check.artifactHash as string).toLowerCase()))
    ]
  };
}

function isSubtleMemoryCheckCovered(
  check: MetricValidationSubtleMemoryCheck,
  thresholds: MetricValidationThresholdPolicy
): boolean {
  if (!check.covered) return false;
  if (!check.subtleMemorySignalType) return false;
  if (!SUBTLE_MEMORY_REQUIRED_SIGNALS.includes(check.subtleMemorySignalType)) return false;
  if (uniqueTrimmed(check.evidenceRefs).length === 0) return false;
  if (SUBTLE_MEMORY_ARTIFACT_SIGNALS.has(check.subtleMemorySignalType) && !isSha256Hash(check.artifactHash)) {
    return false;
  }
  if (check.subtleMemorySignalType === "source_repository_license") {
    return uniqueTrimmed(check.repositoryRefs ?? []).length > 0 &&
      uniqueTrimmed(check.licenseRefs ?? []).length > 0;
  }
  if (check.subtleMemorySignalType === "default_branch_snapshot") {
    return uniqueTrimmed(check.branchRefs ?? []).length > 0 &&
      uniqueTrimmed(check.commitRefs ?? []).length > 0 &&
      uniqueTrimmed(check.treeRefs ?? []).length > 0;
  }
  if (
    check.subtleMemorySignalType === "arxiv_paper_version" &&
    uniqueTrimmed(check.arxivRefs ?? []).length === 0
  ) {
    return false;
  }
  if (
    check.subtleMemorySignalType === "huggingface_dataset_release" &&
    uniqueTrimmed(check.datasetRefs ?? []).length === 0
  ) {
    return false;
  }
  if (check.subtleMemorySignalType === "persona_split_manifest") {
    return uniqueTrimmed(check.personaIds ?? []).length > 0 &&
      Number.isFinite(check.personaCount) &&
      (check.personaCount ?? 0) >= thresholds.minSubtleMemoryPersonaCount;
  }
  if (check.subtleMemorySignalType === "bench_instance_manifest") {
    return uniqueTrimmed(check.benchInstanceManifestIds ?? []).length > 0 &&
      Number.isFinite(check.benchInstanceCount) &&
      (check.benchInstanceCount ?? 0) >= thresholds.minSubtleMemoryBenchInstanceCount;
  }
  if (check.subtleMemorySignalType === "history_session_manifest") {
    return uniqueTrimmed(check.historySessionManifestIds ?? []).length > 0 &&
      Number.isFinite(check.historyCount) &&
      (check.historyCount ?? 0) >= thresholds.minSubtleMemoryPersonaCount;
  }
  if (check.subtleMemorySignalType === "relation_taxonomy_manifest") {
    return uniqueTrimmed(check.relationTypes ?? []).length >= thresholds.minSubtleMemoryRelationTypeCount &&
      Number.isFinite(check.memoryVariantSetCount) &&
      (check.memoryVariantSetCount ?? 0) >= thresholds.minSubtleMemoryMemoryVariantSetCount &&
      Number.isFinite(check.relationTypeCount) &&
      (check.relationTypeCount ?? 0) >= thresholds.minSubtleMemoryRelationTypeCount;
  }
  if (
    check.subtleMemorySignalType === "construction_pipeline_manifest" &&
    uniqueTrimmed(check.constructionPipelineIds ?? []).length === 0
  ) {
    return false;
  }
  if (check.subtleMemorySignalType === "staged_evaluation_protocol") {
    return uniqueTrimmed(check.evaluationStageIds ?? []).length > 0 &&
      Number.isFinite(check.evaluationStageCount) &&
      (check.evaluationStageCount ?? 0) >= thresholds.minSubtleMemoryEvaluationStageCount;
  }
  if (check.subtleMemorySignalType === "adapter_roster_manifest") {
    return uniqueTrimmed(check.adapterIds ?? []).length > 0 &&
      Number.isFinite(check.adapterCount) &&
      (check.adapterCount ?? 0) >= thresholds.minSubtleMemoryAdapterCount;
  }
  if (check.subtleMemorySignalType === "judge_evaluator_config") {
    return uniqueTrimmed(check.judgeIds ?? []).length > 0 &&
      uniqueTrimmed(check.evaluatorIds ?? []).length > 0 &&
      Number.isFinite(check.judgeAgreement0to1) &&
      (check.judgeAgreement0to1 ?? 0) >= thresholds.minSubtleMemoryJudgeAgreement0to1;
  }
  if (
    check.subtleMemorySignalType === "score_summary_report" &&
    (uniqueTrimmed(check.scoreSummaryIds ?? []).length === 0 ||
      uniqueTrimmed(check.metricNames ?? []).length === 0)
  ) {
    return false;
  }
  if (
    check.subtleMemorySignalType === "diagnostic_protocol_report" &&
    uniqueTrimmed(check.diagnosticProtocolIds ?? []).length === 0
  ) {
    return false;
  }
  if (check.subtleMemorySignalType === "ci_validation_manifest") {
    return uniqueTrimmed(check.ciReporterIds ?? []).length > 0 &&
      uniqueTrimmed(check.reporterFormats ?? []).length > 0 &&
      Number.isFinite(check.validationPassRate0to1) &&
      (check.validationPassRate0to1 ?? 0) >= thresholds.minSubtleMemoryValidationPassRate0to1;
  }
  if (
    check.subtleMemorySignalType === "metric_owner" &&
    (typeof check.owner !== "string" || check.owner.trim().length === 0)
  ) {
    return false;
  }
  if (check.subtleMemorySignalType === "sample_size_confidence_interval") {
    return Number.isFinite(check.sampleSize) &&
      (check.sampleSize ?? 0) >= thresholds.minSubtleMemoryBenchInstanceCount &&
      isUsableConfidenceInterval(check.confidenceInterval, thresholds);
  }
  return true;
}

function subtleMemorySummary(
  checks: MetricValidationSubtleMemoryCheck[] | undefined,
  metricId: string,
  thresholds: MetricValidationThresholdPolicy,
  required: boolean
): {
  sampleSize: number;
  coverage: number | null;
  evidenceRefs: string[];
  missingSignals: MetricValidationSubtleMemorySignal[];
  repositoryRefs: string[];
  licenseRefs: string[];
  branchRefs: string[];
  commitRefs: string[];
  treeRefs: string[];
  arxivRefs: string[];
  datasetRefs: string[];
  personaIds: string[];
  benchInstanceManifestIds: string[];
  historySessionManifestIds: string[];
  relationTypes: string[];
  constructionPipelineIds: string[];
  evaluationStageIds: string[];
  adapterIds: string[];
  judgeIds: string[];
  evaluatorIds: string[];
  metricNames: string[];
  scoreSummaryIds: string[];
  diagnosticProtocolIds: string[];
  ciReporterIds: string[];
  reporterFormats: string[];
  personaCount: number | null;
  benchInstanceCount: number | null;
  historyCount: number | null;
  memoryVariantSetCount: number | null;
  relationTypeCount: number | null;
  evaluationStageCount: number | null;
  adapterCount: number | null;
  judgeAgreement0to1: number | null;
  validationPassRate0to1: number | null;
  reportArtifactHashes: string[];
} {
  const scoped = (checks ?? []).filter((check) =>
    (check.metricId ?? "overall_maturity_score") === metricId &&
    check.subtleMemorySignalType !== undefined
  );
  if (scoped.length === 0 && !required) {
    return {
      sampleSize: 0,
      coverage: null,
      evidenceRefs: [],
      missingSignals: [],
      repositoryRefs: [],
      licenseRefs: [],
      branchRefs: [],
      commitRefs: [],
      treeRefs: [],
      arxivRefs: [],
      datasetRefs: [],
      personaIds: [],
      benchInstanceManifestIds: [],
      historySessionManifestIds: [],
      relationTypes: [],
      constructionPipelineIds: [],
      evaluationStageIds: [],
      adapterIds: [],
      judgeIds: [],
      evaluatorIds: [],
      metricNames: [],
      scoreSummaryIds: [],
      diagnosticProtocolIds: [],
      ciReporterIds: [],
      reporterFormats: [],
      personaCount: null,
      benchInstanceCount: null,
      historyCount: null,
      memoryVariantSetCount: null,
      relationTypeCount: null,
      evaluationStageCount: null,
      adapterCount: null,
      judgeAgreement0to1: null,
      validationPassRate0to1: null,
      reportArtifactHashes: []
    };
  }

  const covered = scoped.filter((check) => isSubtleMemoryCheckCovered(check, thresholds));
  const coveredSignals = new Set(
    covered.map((check) => check.subtleMemorySignalType as MetricValidationSubtleMemorySignal)
  );
  const personaCounts = covered
    .map((check) => check.personaCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const benchInstanceCounts = covered
    .map((check) => check.benchInstanceCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const historyCounts = covered
    .map((check) => check.historyCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const memoryVariantSetCounts = covered
    .map((check) => check.memoryVariantSetCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const relationTypeCounts = covered
    .map((check) => check.relationTypeCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const evaluationStageCounts = covered
    .map((check) => check.evaluationStageCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const adapterCounts = covered
    .map((check) => check.adapterCount)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  const judgeAgreements = covered
    .map((check) => check.judgeAgreement0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const validationPassRates = covered
    .map((check) => check.validationPassRate0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleSize: scoped.length,
    coverage: Number((coveredSignals.size / SUBTLE_MEMORY_REQUIRED_SIGNALS.length).toFixed(6)),
    evidenceRefs: uniqueTrimmed(scoped.flatMap((check) => check.evidenceRefs)),
    missingSignals: SUBTLE_MEMORY_REQUIRED_SIGNALS.filter((signal) => !coveredSignals.has(signal)),
    repositoryRefs: uniqueTrimmed(scoped.flatMap((check) => check.repositoryRefs ?? [])),
    licenseRefs: uniqueTrimmed(scoped.flatMap((check) => check.licenseRefs ?? [])),
    branchRefs: uniqueTrimmed(scoped.flatMap((check) => check.branchRefs ?? [])),
    commitRefs: uniqueTrimmed(scoped.flatMap((check) => check.commitRefs ?? [])),
    treeRefs: uniqueTrimmed(scoped.flatMap((check) => check.treeRefs ?? [])),
    arxivRefs: uniqueTrimmed(scoped.flatMap((check) => check.arxivRefs ?? [])),
    datasetRefs: uniqueTrimmed(scoped.flatMap((check) => check.datasetRefs ?? [])),
    personaIds: uniqueTrimmed(scoped.flatMap((check) => check.personaIds ?? [])),
    benchInstanceManifestIds: uniqueTrimmed(scoped.flatMap((check) => check.benchInstanceManifestIds ?? [])),
    historySessionManifestIds: uniqueTrimmed(scoped.flatMap((check) => check.historySessionManifestIds ?? [])),
    relationTypes: uniqueTrimmed(scoped.flatMap((check) => check.relationTypes ?? [])),
    constructionPipelineIds: uniqueTrimmed(scoped.flatMap((check) => check.constructionPipelineIds ?? [])),
    evaluationStageIds: uniqueTrimmed(scoped.flatMap((check) => check.evaluationStageIds ?? [])),
    adapterIds: uniqueTrimmed(scoped.flatMap((check) => check.adapterIds ?? [])),
    judgeIds: uniqueTrimmed(scoped.flatMap((check) => check.judgeIds ?? [])),
    evaluatorIds: uniqueTrimmed(scoped.flatMap((check) => check.evaluatorIds ?? [])),
    metricNames: uniqueTrimmed(scoped.flatMap((check) => check.metricNames ?? [])),
    scoreSummaryIds: uniqueTrimmed(scoped.flatMap((check) => check.scoreSummaryIds ?? [])),
    diagnosticProtocolIds: uniqueTrimmed(scoped.flatMap((check) => check.diagnosticProtocolIds ?? [])),
    ciReporterIds: uniqueTrimmed(scoped.flatMap((check) => check.ciReporterIds ?? [])),
    reporterFormats: uniqueTrimmed(scoped.flatMap((check) => check.reporterFormats ?? [])),
    personaCount: personaCounts.length > 0 ? Math.max(...personaCounts) : null,
    benchInstanceCount: benchInstanceCounts.length > 0 ? Math.max(...benchInstanceCounts) : null,
    historyCount: historyCounts.length > 0 ? Math.max(...historyCounts) : null,
    memoryVariantSetCount: memoryVariantSetCounts.length > 0 ? Math.max(...memoryVariantSetCounts) : null,
    relationTypeCount: relationTypeCounts.length > 0 ? Math.max(...relationTypeCounts) : null,
    evaluationStageCount: evaluationStageCounts.length > 0 ? Math.max(...evaluationStageCounts) : null,
    adapterCount: adapterCounts.length > 0 ? Math.max(...adapterCounts) : null,
    judgeAgreement0to1: judgeAgreements.length > 0 ? Math.min(...judgeAgreements) : null,
    validationPassRate0to1: validationPassRates.length > 0 ? Math.min(...validationPassRates) : null,
    reportArtifactHashes: scoped
      .filter((check) =>
        SUBTLE_MEMORY_ARTIFACT_SIGNALS.has(check.subtleMemorySignalType as MetricValidationSubtleMemorySignal) &&
        isSha256Hash(check.artifactHash)
      )
      .map((check) => (check.artifactHash as string).toLowerCase())
  };
}

function businessWorkflowSummary(
  checks: MetricValidationBusinessWorkflowCheck[] | undefined,
  metricId: string
): { sampleSize: number; coverage: number | null; evidenceRefs: string[] } {
  const scoped = (checks ?? []).filter((check) => (check.metricId ?? "overall_maturity_score") === metricId);
  if (scoped.length === 0) {
    return { sampleSize: 0, coverage: null, evidenceRefs: [] };
  }
  const covered = scoped.filter((check) => check.covered).length;
  return {
    sampleSize: scoped.length,
    coverage: Number((covered / scoped.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))]
  };
}

function dataAgentAnalyticalSummary(
  checks: MetricValidationDataAgentAnalyticalCheck[] | undefined,
  metricId: string
): { sampleSize: number; coverage: number | null; evidenceRefs: string[] } {
  const scoped = (checks ?? []).filter((check) => (check.metricId ?? "overall_maturity_score") === metricId);
  if (scoped.length === 0) {
    return { sampleSize: 0, coverage: null, evidenceRefs: [] };
  }
  const covered = scoped.filter((check) => check.covered).length;
  return {
    sampleSize: scoped.length,
    coverage: Number((covered / scoped.length).toFixed(6)),
    evidenceRefs: [...new Set(scoped.flatMap((check) => check.evidenceRefs).filter((ref) => ref.trim().length > 0))]
  };
}

function signedEvidenceRefsFor(
  evidenceRefs: string[],
  signedEvidenceRefs: QuestionScoreSignedEvidenceRef[]
): QuestionScoreSignedEvidenceRef[] {
  const byId = new Map(signedEvidenceRefs.map((ref) => [ref.evidenceId, ref]));
  return evidenceRefs
    .map((ref) => byId.get(ref))
    .filter((ref): ref is QuestionScoreSignedEvidenceRef => Boolean(ref));
}

function constructValidity(params: {
  questionScores: QuestionScore[];
  integrityIndex: number;
  evidenceCoverage: number;
  correlationRatio: number;
  unsupportedClaimCount: number;
}): number {
  const sampleSize = params.questionScores.length;
  if (sampleSize === 0) return 0;
  const evidenceLinkedRatio =
    params.questionScores.filter((score) => score.evidenceEventIds.length > 0).length / sampleSize;
  const averageConfidence = mean(params.questionScores.map((score) => clamp(score.confidence, 0, 1)));
  const unsupportedRate = clamp(params.unsupportedClaimCount / Math.max(sampleSize, 1), 0, 1);
  const value =
    evidenceLinkedRatio * 0.3 +
    averageConfidence * 0.25 +
    clamp(params.integrityIndex, 0, 1) * 0.2 +
    clamp(params.evidenceCoverage, 0, 1) * 0.15 +
    clamp(params.correlationRatio, 0, 1) * 0.1 -
    unsupportedRate * 0.15;
  return Number(clamp(value, 0, 1).toFixed(6));
}

function statusForRow(params: {
  sampleSize: number;
  constructValidity: number;
  ciWidth: number;
  testRetestStability: number | null;
  counterfactualResponsiveness: number | null;
  validationFacetCoverage: number | null;
  confounderControlCoverage: number | null;
  outcomeAlignment: number | null;
  processEvidenceCoverage: number | null;
  safetyUtilityCoverage: number | null;
  modalityTransformationCoverage: number | null;
  lifecycleObservabilityCoverage: number | null;
  rankingStabilityCoverage: number | null;
  toolSandboxCoverage: number | null;
  continualLearningCoverage: number | null;
  strategicInteractionCoverage: number | null;
  architectureRealityCoverage: number | null;
  ragPipelineCoverage: number | null;
  ragEvaluationPipelineCoverage: number | null;
  ragasNotebookCoverage: number | null;
  mirageRagMetricCoverage: number | null;
  legalCodeRagCoverage: number | null;
  guardbenchMetricCoverage: number | null;
  businessWorkflowCoverage: number | null;
  dataAgentAnalyticalCoverage: number | null;
  embodiedAgentCoverage: number | null;
  evaluatorSuiteCoverage: number | null;
  pentestBenchmarkCoverage: number | null;
  traceEvaluationCoverage: number | null;
  livingEnvironmentCoverage: number | null;
  mobileAgentCoverage: number | null;
  personaAgentCoverage: number | null;
  scientificLiteratureCoverage: number | null;
  bioinformaticsAgentCoverage: number | null;
  mirageDrugRepositioningCoverage: number | null;
  networkTroubleshootingCoverage: number | null;
  inferenceOptimizationCoverage: number | null;
  javaCodingAgentCoverage: number | null;
  webEvalDatasetCoverage: number | null;
  parallelResearchSkillCoverage: number | null;
  resumeRagEvaluatorCoverage: number | null;
  chipBenchmarkCoverage: number | null;
  hermesBenchCoverage: number | null;
  hermesBenchJudgeAgreement0to1: number | null;
  hermesBenchRegressionPassRate0to1: number | null;
  cooperBenchCoverage: number | null;
  cooperBenchCooperationScore0to1: number | null;
  cooperBenchConflictResolutionRate0to1: number | null;
  cooperBenchRegressionPassRate0to1: number | null;
  coderCupCoverage: number | null;
  coderCupInterRaterAgreement0to1: number | null;
  coderCupTestRetestReliability0to1: number | null;
  coderCupRegressionPassRate0to1: number | null;
  agenticGraphRagCoverage: number | null;
  agenticGraphRagRetrievalGroundingScore0to1: number | null;
  agenticGraphRagRegressionPassRate0to1: number | null;
  agentScenarioTestCoverage: number | null;
  openCodeLabCoverage: number | null;
  ccPluginEvalCoverage: number | null;
  ccPluginEvalTriggerAccuracy0to1: number | null;
  ccPluginEvalFalsePositiveRate0to1: number | null;
  ccPluginEvalFalseNegativeRate0to1: number | null;
  realignSimulationCoverage: number | null;
  realignSimulationJudgeAgreement0to1: number | null;
  realignSimulationRegressionPassRate0to1: number | null;
  academiClawCoverage: number | null;
  academiClawRegressionPassRate0to1: number | null;
  ragChunkingTechniqueCoverage: number | null;
  ragChunkingTechniqueRegressionPassRate0to1: number | null;
  kubernetesOperationalAgentCoverage: number | null;
  kubernetesOperationalAgentRegressionPassRate0to1: number | null;
  secureVibeBenchCoverage: number | null;
  secureVibeBenchRegressionPassRate0to1: number | null;
  ravigBenchCoverage: number | null;
  ravigBenchValidationPassRate0to1: number | null;
  humanStudyBenchCoverage: number | null;
  humanStudyBenchInterRaterAgreement0to1: number | null;
  humanStudyBenchTestRetestReliability0to1: number | null;
  humanStudyBenchValidationPassRate0to1: number | null;
  legacyBenchCoverage: number | null;
  legacyBenchRegressionPassRate0to1: number | null;
  legacyBenchReplayPassRate0to1: number | null;
  subtleMemoryCoverage: number | null;
  subtleMemoryJudgeAgreement0to1: number | null;
  subtleMemoryValidationPassRate0to1: number | null;
  thresholds: MetricValidationThresholdPolicy;
}): MetricValidationRow["status"] {
  if (
    params.sampleSize < params.thresholds.minSampleSize ||
    params.constructValidity < params.thresholds.minConstructValidity ||
    (params.counterfactualResponsiveness !== null &&
      params.counterfactualResponsiveness < params.thresholds.minCounterfactualResponsiveness) ||
    (params.validationFacetCoverage !== null &&
      params.validationFacetCoverage < params.thresholds.minValidationFacetCoverage) ||
    (params.confounderControlCoverage !== null &&
      params.confounderControlCoverage < params.thresholds.minConfounderControlCoverage) ||
    (params.outcomeAlignment !== null &&
      params.outcomeAlignment < params.thresholds.minOutcomeAlignment) ||
    (params.processEvidenceCoverage !== null &&
      params.processEvidenceCoverage < params.thresholds.minProcessEvidenceCoverage) ||
    (params.safetyUtilityCoverage !== null &&
      params.safetyUtilityCoverage < params.thresholds.minSafetyUtilityCoverage) ||
    (params.modalityTransformationCoverage !== null &&
      params.modalityTransformationCoverage < params.thresholds.minModalityTransformationCoverage) ||
    (params.lifecycleObservabilityCoverage !== null &&
      params.lifecycleObservabilityCoverage < params.thresholds.minLifecycleObservabilityCoverage) ||
    (params.rankingStabilityCoverage !== null &&
      params.rankingStabilityCoverage < params.thresholds.minRankingStabilityCoverage) ||
    (params.toolSandboxCoverage !== null &&
      params.toolSandboxCoverage < params.thresholds.minToolSandboxCoverage) ||
    (params.continualLearningCoverage !== null &&
      params.continualLearningCoverage < params.thresholds.minContinualLearningCoverage) ||
    (params.strategicInteractionCoverage !== null &&
      params.strategicInteractionCoverage < params.thresholds.minStrategicInteractionCoverage) ||
    (params.architectureRealityCoverage !== null &&
      params.architectureRealityCoverage < params.thresholds.minArchitectureRealityCoverage) ||
    (params.ragPipelineCoverage !== null &&
      params.ragPipelineCoverage < params.thresholds.minRagPipelineCoverage) ||
    (params.ragEvaluationPipelineCoverage !== null &&
      params.ragEvaluationPipelineCoverage < params.thresholds.minRagEvaluationPipelineCoverage) ||
    (params.ragasNotebookCoverage !== null &&
      params.ragasNotebookCoverage < params.thresholds.minRagasNotebookCoverage) ||
    (params.mirageRagMetricCoverage !== null &&
      params.mirageRagMetricCoverage < params.thresholds.minMirageRagMetricCoverage) ||
    (params.legalCodeRagCoverage !== null &&
      params.legalCodeRagCoverage < params.thresholds.minLegalCodeRagCoverage) ||
    (params.guardbenchMetricCoverage !== null &&
      params.guardbenchMetricCoverage < params.thresholds.minGuardbenchMetricCoverage) ||
    (params.businessWorkflowCoverage !== null &&
      params.businessWorkflowCoverage < params.thresholds.minBusinessWorkflowCoverage) ||
    (params.dataAgentAnalyticalCoverage !== null &&
      params.dataAgentAnalyticalCoverage < params.thresholds.minDataAgentAnalyticalCoverage) ||
    (params.embodiedAgentCoverage !== null &&
      params.embodiedAgentCoverage < params.thresholds.minEmbodiedAgentCoverage) ||
    (params.evaluatorSuiteCoverage !== null &&
      params.evaluatorSuiteCoverage < params.thresholds.minEvaluatorSuiteCoverage) ||
    (params.pentestBenchmarkCoverage !== null &&
      params.pentestBenchmarkCoverage < params.thresholds.minPentestBenchmarkCoverage) ||
    (params.traceEvaluationCoverage !== null &&
      params.traceEvaluationCoverage < params.thresholds.minTraceEvaluationCoverage) ||
    (params.livingEnvironmentCoverage !== null &&
      params.livingEnvironmentCoverage < params.thresholds.minLivingEnvironmentCoverage) ||
    (params.mobileAgentCoverage !== null &&
      params.mobileAgentCoverage < params.thresholds.minMobileAgentCoverage) ||
    (params.personaAgentCoverage !== null &&
      params.personaAgentCoverage < params.thresholds.minPersonaAgentCoverage) ||
    (params.scientificLiteratureCoverage !== null &&
      params.scientificLiteratureCoverage < params.thresholds.minScientificLiteratureCoverage) ||
    (params.bioinformaticsAgentCoverage !== null &&
      params.bioinformaticsAgentCoverage < params.thresholds.minBioinformaticsAgentCoverage) ||
    (params.mirageDrugRepositioningCoverage !== null &&
      params.mirageDrugRepositioningCoverage < params.thresholds.minMirageDrugRepositioningCoverage) ||
    (params.networkTroubleshootingCoverage !== null &&
      params.networkTroubleshootingCoverage < params.thresholds.minNetworkTroubleshootingCoverage) ||
    (params.inferenceOptimizationCoverage !== null &&
      params.inferenceOptimizationCoverage < params.thresholds.minInferenceOptimizationCoverage) ||
    (params.javaCodingAgentCoverage !== null &&
      params.javaCodingAgentCoverage < params.thresholds.minJavaCodingAgentCoverage) ||
    (params.webEvalDatasetCoverage !== null &&
      params.webEvalDatasetCoverage < params.thresholds.minWebEvalDatasetCoverage) ||
    (params.parallelResearchSkillCoverage !== null &&
      params.parallelResearchSkillCoverage < params.thresholds.minParallelResearchSkillCoverage) ||
    (params.resumeRagEvaluatorCoverage !== null &&
      params.resumeRagEvaluatorCoverage < params.thresholds.minResumeRagEvaluatorCoverage) ||
    (params.chipBenchmarkCoverage !== null &&
      params.chipBenchmarkCoverage < params.thresholds.minChipBenchmarkCoverage) ||
    (params.hermesBenchCoverage !== null &&
      params.hermesBenchCoverage < params.thresholds.minHermesBenchCoverage) ||
    (params.hermesBenchJudgeAgreement0to1 !== null &&
      params.hermesBenchJudgeAgreement0to1 < params.thresholds.minHermesBenchJudgeAgreement0to1) ||
    (params.hermesBenchRegressionPassRate0to1 !== null &&
      params.hermesBenchRegressionPassRate0to1 < params.thresholds.minHermesBenchRegressionPassRate0to1) ||
    (params.cooperBenchCoverage !== null &&
      params.cooperBenchCoverage < params.thresholds.minCooperBenchCoverage) ||
    (params.cooperBenchCooperationScore0to1 !== null &&
      params.cooperBenchCooperationScore0to1 < params.thresholds.minCooperBenchCooperationScore0to1) ||
    (params.cooperBenchConflictResolutionRate0to1 !== null &&
      params.cooperBenchConflictResolutionRate0to1 < params.thresholds.minCooperBenchConflictResolutionRate0to1) ||
    (params.cooperBenchRegressionPassRate0to1 !== null &&
      params.cooperBenchRegressionPassRate0to1 < params.thresholds.minCooperBenchRegressionPassRate0to1) ||
    (params.coderCupCoverage !== null &&
      params.coderCupCoverage < params.thresholds.minCoderCupCoverage) ||
    (params.coderCupInterRaterAgreement0to1 !== null &&
      params.coderCupInterRaterAgreement0to1 < params.thresholds.minCoderCupInterRaterAgreement0to1) ||
    (params.coderCupTestRetestReliability0to1 !== null &&
      params.coderCupTestRetestReliability0to1 < params.thresholds.minCoderCupTestRetestReliability0to1) ||
    (params.coderCupRegressionPassRate0to1 !== null &&
      params.coderCupRegressionPassRate0to1 < params.thresholds.minCoderCupRegressionPassRate0to1) ||
    (params.agenticGraphRagCoverage !== null &&
      params.agenticGraphRagCoverage < params.thresholds.minAgenticGraphRagCoverage) ||
    (params.agenticGraphRagRetrievalGroundingScore0to1 !== null &&
      params.agenticGraphRagRetrievalGroundingScore0to1 < params.thresholds.minAgenticGraphRagRetrievalGroundingScore0to1) ||
    (params.agenticGraphRagRegressionPassRate0to1 !== null &&
      params.agenticGraphRagRegressionPassRate0to1 < params.thresholds.minAgenticGraphRagRegressionPassRate0to1) ||
    (params.agentScenarioTestCoverage !== null &&
      params.agentScenarioTestCoverage < params.thresholds.minAgentScenarioTestCoverage) ||
    (params.openCodeLabCoverage !== null &&
      params.openCodeLabCoverage < params.thresholds.minOpenCodeLabCoverage) ||
    (params.ccPluginEvalCoverage !== null &&
      params.ccPluginEvalCoverage < params.thresholds.minCcPluginEvalCoverage) ||
    (params.ccPluginEvalTriggerAccuracy0to1 !== null &&
      params.ccPluginEvalTriggerAccuracy0to1 < params.thresholds.minCcPluginEvalTriggerAccuracy0to1) ||
    (params.ccPluginEvalFalsePositiveRate0to1 !== null &&
      params.ccPluginEvalFalsePositiveRate0to1 > params.thresholds.maxCcPluginEvalFalsePositiveRate0to1) ||
    (params.ccPluginEvalFalseNegativeRate0to1 !== null &&
      params.ccPluginEvalFalseNegativeRate0to1 > params.thresholds.maxCcPluginEvalFalseNegativeRate0to1) ||
    (params.realignSimulationCoverage !== null &&
      params.realignSimulationCoverage < params.thresholds.minRealignSimulationCoverage) ||
    (params.realignSimulationJudgeAgreement0to1 !== null &&
      params.realignSimulationJudgeAgreement0to1 < params.thresholds.minRealignSimulationJudgeAgreement0to1) ||
    (params.realignSimulationRegressionPassRate0to1 !== null &&
      params.realignSimulationRegressionPassRate0to1 < params.thresholds.minRealignSimulationRegressionPassRate0to1) ||
    (params.academiClawCoverage !== null &&
      params.academiClawCoverage < params.thresholds.minAcademiClawCoverage) ||
    (params.academiClawRegressionPassRate0to1 !== null &&
      params.academiClawRegressionPassRate0to1 < params.thresholds.minAcademiClawRegressionPassRate0to1) ||
    (params.ragChunkingTechniqueCoverage !== null &&
      params.ragChunkingTechniqueCoverage < params.thresholds.minRagChunkingTechniqueCoverage) ||
    (params.ragChunkingTechniqueRegressionPassRate0to1 !== null &&
      params.ragChunkingTechniqueRegressionPassRate0to1 < params.thresholds.minRagChunkingTechniqueRegressionPassRate0to1) ||
    (params.kubernetesOperationalAgentCoverage !== null &&
      params.kubernetesOperationalAgentCoverage < params.thresholds.minKubernetesOperationalAgentCoverage) ||
    (params.kubernetesOperationalAgentRegressionPassRate0to1 !== null &&
      params.kubernetesOperationalAgentRegressionPassRate0to1 < params.thresholds.minKubernetesOperationalAgentRegressionPassRate0to1) ||
    (params.secureVibeBenchCoverage !== null &&
      params.secureVibeBenchCoverage < params.thresholds.minSecureVibeBenchCoverage) ||
    (params.secureVibeBenchRegressionPassRate0to1 !== null &&
      params.secureVibeBenchRegressionPassRate0to1 < params.thresholds.minSecureVibeBenchRegressionPassRate0to1) ||
    (params.ravigBenchCoverage !== null &&
      params.ravigBenchCoverage < params.thresholds.minRavigBenchCoverage) ||
    (params.ravigBenchValidationPassRate0to1 !== null &&
      params.ravigBenchValidationPassRate0to1 < params.thresholds.minRavigBenchValidationPassRate0to1) ||
    (params.humanStudyBenchCoverage !== null &&
      params.humanStudyBenchCoverage < params.thresholds.minHumanStudyBenchCoverage) ||
    (params.humanStudyBenchInterRaterAgreement0to1 !== null &&
      params.humanStudyBenchInterRaterAgreement0to1 < params.thresholds.minHumanStudyBenchInterRaterAgreement0to1) ||
    (params.humanStudyBenchTestRetestReliability0to1 !== null &&
      params.humanStudyBenchTestRetestReliability0to1 < params.thresholds.minHumanStudyBenchTestRetestReliability0to1) ||
    (params.humanStudyBenchValidationPassRate0to1 !== null &&
      params.humanStudyBenchValidationPassRate0to1 < params.thresholds.minHumanStudyBenchValidationPassRate0to1) ||
    (params.legacyBenchCoverage !== null &&
      params.legacyBenchCoverage < params.thresholds.minLegacyBenchCoverage) ||
    (params.legacyBenchRegressionPassRate0to1 !== null &&
      params.legacyBenchRegressionPassRate0to1 < params.thresholds.minLegacyBenchRegressionPassRate0to1) ||
    (params.legacyBenchReplayPassRate0to1 !== null &&
      params.legacyBenchReplayPassRate0to1 < params.thresholds.minLegacyBenchReplayPassRate0to1) ||
    (params.subtleMemoryCoverage !== null &&
      params.subtleMemoryCoverage < params.thresholds.minSubtleMemoryCoverage) ||
    (params.subtleMemoryJudgeAgreement0to1 !== null &&
      params.subtleMemoryJudgeAgreement0to1 < params.thresholds.minSubtleMemoryJudgeAgreement0to1) ||
    (params.subtleMemoryValidationPassRate0to1 !== null &&
      params.subtleMemoryValidationPassRate0to1 < params.thresholds.minSubtleMemoryValidationPassRate0to1) ||
    params.ciWidth > params.thresholds.maxConfidenceIntervalWidth
  ) {
    return "fail";
  }
  if (params.testRetestStability === null || params.testRetestStability < 0.65) {
    return "attention";
  }
  return "pass";
}

function warningsForRow(params: {
  sampleSize: number;
  constructValidity: number;
  ciWidth: number;
  testRetestStability: number | null;
  interRaterAgreement: number | null;
  counterfactualResponsiveness: number | null;
  counterfactualSampleSize: number;
  validationFacetCoverage: number | null;
  validationFacetSampleSize: number;
  confounderControlCoverage: number | null;
  confounderControlSampleSize: number;
  outcomeAlignment: number | null;
  outcomeAlignmentSampleSize: number;
  processEvidenceCoverage: number | null;
  processEvidenceSampleSize: number;
  safetyUtilityCoverage: number | null;
  safetyUtilitySampleSize: number;
  modalityTransformationCoverage: number | null;
  modalityTransformationSampleSize: number;
  lifecycleObservabilityCoverage: number | null;
  lifecycleObservabilitySampleSize: number;
  rankingStabilityCoverage: number | null;
  rankingStabilitySampleSize: number;
  toolSandboxCoverage: number | null;
  toolSandboxSampleSize: number;
  continualLearningCoverage: number | null;
  continualLearningSampleSize: number;
  continualLearningRunCount: number | null;
  continualLearningMissingSignals: MetricValidationContinualLearningSignal[];
  strategicInteractionCoverage: number | null;
  strategicInteractionSampleSize: number;
  architectureRealityCoverage: number | null;
  architectureRealitySampleSize: number;
  architectureRealityStressScenarioCount: number | null;
  architectureRealityNetworkScenarioCount: number | null;
  architectureRealityEnsemblePatternCount: number | null;
  architectureRealityMissingSignals: MetricValidationArchitectureRealitySignal[];
  ragPipelineCoverage: number | null;
  ragPipelineSampleSize: number;
  ragEvaluationPipelineCoverage: number | null;
  ragEvaluationPipelineSampleSize: number;
  ragEvaluationPipelineCaseSampleSizeMin: number | null;
  ragEvaluationPipelineMissingSignals: MetricValidationRagEvaluationPipelineSignal[];
  ragasNotebookCoverage: number | null;
  ragasNotebookSampleSize: number;
  ragasNotebookMissingSignals: MetricValidationRagasNotebookSignal[];
  ragasNotebookQuestionCount: number | null;
  mirageRagMetricCoverage: number | null;
  mirageRagMetricSampleSize: number;
  mirageRagMetricMissingSignals: MetricValidationMirageRagSignal[];
  mirageRagMetricQaPairCount: number | null;
  mirageRagMetricContextPoolCount: number | null;
  legalCodeRagCoverage: number | null;
  legalCodeRagSampleSize: number;
  legalCodeRagMissingSignals: MetricValidationLegalCodeRagSignal[];
  legalCodeRagQuestionCount: number | null;
  guardbenchMetricCoverage: number | null;
  guardbenchMetricSampleSize: number;
  guardbenchMetricMissingSignals: MetricValidationGuardbenchSignal[];
  businessWorkflowCoverage: number | null;
  businessWorkflowSampleSize: number;
  dataAgentAnalyticalCoverage: number | null;
  dataAgentAnalyticalSampleSize: number;
  embodiedAgentCoverage: number | null;
  embodiedAgentSampleSize: number;
  embodiedAgentMissingSignals: MetricValidationEmbodiedAgentSignal[];
  evaluatorSuiteCoverage: number | null;
  evaluatorSuiteSampleSize: number;
  evaluatorSuiteMissingSignals: MetricValidationEvaluatorSuiteSignal[];
  pentestBenchmarkCoverage: number | null;
  pentestBenchmarkSampleSize: number;
  pentestBenchmarkMissingSignals: MetricValidationPentestBenchmarkSignal[];
  traceEvaluationCoverage: number | null;
  traceEvaluationSampleSize: number;
  traceEvaluationMissingSignals: MetricValidationTraceEvaluationSignal[];
  livingEnvironmentCoverage: number | null;
  livingEnvironmentSampleSize: number;
  livingEnvironmentMissingSignals: MetricValidationLivingEnvironmentSignal[];
  mobileAgentCoverage: number | null;
  mobileAgentSampleSize: number;
  mobileAgentMissingSignals: MetricValidationMobileAgentSignal[];
  mobileAgentTrialCount: number | null;
  personaAgentCoverage: number | null;
  personaAgentSampleSize: number;
  personaAgentMissingSignals: MetricValidationPersonaAgentSignal[];
  scientificLiteratureCoverage: number | null;
  scientificLiteratureSampleSize: number;
  scientificLiteratureMissingSignals: MetricValidationScientificLiteratureSignal[];
  scientificLiteratureTaskCount: number | null;
  bioinformaticsAgentCoverage: number | null;
  bioinformaticsAgentSampleSize: number;
  bioinformaticsAgentMissingSignals: MetricValidationBioinformaticsAgentSignal[];
  bioinformaticsAgentTaskCount: number | null;
  mirageDrugRepositioningCoverage: number | null;
  mirageDrugRepositioningSampleSize: number;
  mirageDrugRepositioningMissingSignals: MetricValidationMirageDrugRepositioningSignal[];
  mirageDrugRepositioningDrugCount: number | null;
  mirageDrugRepositioningDiseaseCount: number | null;
  mirageDrugRepositioningMappingCount: number | null;
  mirageDrugRepositioningFeatureSetCount: number | null;
  mirageDrugRepositioningSimilarityMatrixCount: number | null;
  networkTroubleshootingCoverage: number | null;
  networkTroubleshootingSampleSize: number;
  networkTroubleshootingMissingSignals: MetricValidationNetworkTroubleshootingSignal[];
  networkTroubleshootingIncidentCount: number | null;
  inferenceOptimizationCoverage: number | null;
  inferenceOptimizationSampleSize: number;
  inferenceOptimizationMissingSignals: MetricValidationInferenceOptimizationSignal[];
  inferenceOptimizationRunCount: number | null;
  javaCodingAgentCoverage: number | null;
  javaCodingAgentSampleSize: number;
  javaCodingAgentMissingSignals: MetricValidationJavaCodingAgentSignal[];
  javaCodingAgentTrialCount: number | null;
  webEvalDatasetCoverage: number | null;
  webEvalDatasetSampleSize: number;
  webEvalDatasetMissingSignals: MetricValidationWebEvalDatasetSignal[];
  webEvalDatasetQuestionCount: number | null;
  webEvalDatasetDocumentCount: number | null;
  parallelResearchSkillCoverage: number | null;
  parallelResearchSkillSampleSize: number;
  parallelResearchSkillMissingSignals: MetricValidationParallelResearchSkillSignal[];
  parallelResearchSkillCitationCoverage0to1: number | null;
  parallelResearchSkillSourcePolicyCoverage0to1: number | null;
  parallelResearchSkillBatchTaskLimit: number | null;
  parallelResearchSkillMonitoringCoverage0to1: number | null;
  resumeRagEvaluatorCoverage: number | null;
  resumeRagEvaluatorSampleSize: number;
  resumeRagEvaluatorMissingSignals: MetricValidationResumeRagEvaluatorSignal[];
  resumeRagEvaluatorParserCoverage0to1: number | null;
  resumeRagEvaluatorEvaluationGrounding0to1: number | null;
  chipBenchmarkCoverage: number | null;
  chipBenchmarkSampleSize: number;
  chipBenchmarkMissingSignals: MetricValidationChipBenchmarkSignal[];
  chipBenchmarkResultRowCount: number | null;
  chipBenchmarkThroughputCoverage0to1: number | null;
  chipBenchmarkLatencyCoverage0to1: number | null;
  chipBenchmarkCostCoverage0to1: number | null;
  hermesBenchCoverage: number | null;
  hermesBenchSampleSize: number;
  hermesBenchMissingSignals: MetricValidationHermesBenchSignal[];
  hermesBenchTaskCount: number | null;
  hermesBenchAdapterCount: number | null;
  hermesBenchBackendTestCount: number | null;
  hermesBenchFrontendTestCount: number | null;
  hermesBenchJudgeAgreement0to1: number | null;
  hermesBenchRegressionPassRate0to1: number | null;
  cooperBenchCoverage: number | null;
  cooperBenchSampleSize: number;
  cooperBenchMissingSignals: MetricValidationCooperBenchSignal[];
  cooperBenchTaskCount: number | null;
  cooperBenchFeatureCount: number | null;
  cooperBenchAgentAdapterCount: number | null;
  cooperBenchTestCount: number | null;
  cooperBenchCooperationScore0to1: number | null;
  cooperBenchConflictResolutionRate0to1: number | null;
  cooperBenchRegressionPassRate0to1: number | null;
  coderCupCoverage: number | null;
  coderCupSampleSize: number;
  coderCupMissingSignals: MetricValidationCoderCupSignal[];
  coderCupPhaseCount: number | null;
  coderCupTestPlanCount: number | null;
  coderCupRunnerCount: number | null;
  coderCupScoreLedgerCount: number | null;
  coderCupLiveSurfaceCount: number | null;
  coderCupInterRaterAgreement0to1: number | null;
  coderCupTestRetestReliability0to1: number | null;
  coderCupRegressionPassRate0to1: number | null;
  agenticGraphRagCoverage: number | null;
  agenticGraphRagSampleSize: number;
  agenticGraphRagMissingSignals: MetricValidationAgenticGraphRagSignal[];
  agenticGraphRagGraphNodeCount: number | null;
  agenticGraphRagEvaluationMetricCount: number | null;
  agenticGraphRagExperimentCount: number | null;
  agenticGraphRagRetrievalGroundingScore0to1: number | null;
  agenticGraphRagRegressionPassRate0to1: number | null;
  agentScenarioTestCoverage: number | null;
  agentScenarioTestSampleSize: number;
  agentScenarioTestMissingSignals: MetricValidationAgentScenarioTestSignal[];
  agentScenarioTestScenarioCount: number | null;
  agentScenarioTestTurnCount: number | null;
  agentScenarioTestToolCallCount: number | null;
  openCodeLabCoverage: number | null;
  openCodeLabSampleSize: number;
  openCodeLabMissingSignals: MetricValidationOpenCodeLabSignal[];
  openCodeLabRunCount: number | null;
  openCodeLabForkAgreement0to1: number | null;
  openCodeLabModelVariance0to1: number | null;
  ccPluginEvalCoverage: number | null;
  ccPluginEvalSampleSize: number;
  ccPluginEvalMissingSignals: MetricValidationCcPluginEvalSignal[];
  ccPluginEvalTriggerAccuracy0to1: number | null;
  ccPluginEvalFalsePositiveRate0to1: number | null;
  ccPluginEvalFalseNegativeRate0to1: number | null;
  ccPluginEvalComponentCount: number | null;
  ccPluginEvalScenarioCount: number | null;
  realignSimulationCoverage: number | null;
  realignSimulationSampleSize: number;
  realignSimulationMissingSignals: MetricValidationRealignSimulationSignal[];
  realignSimulationJudgeAgreement0to1: number | null;
  realignSimulationRegressionPassRate0to1: number | null;
  realignSimulationScenarioCount: number | null;
  realignSimulationEvaluatorCount: number | null;
  realignSimulationRepeatCount: number | null;
  academiClawCoverage: number | null;
  academiClawSampleSize: number;
  academiClawMissingSignals: MetricValidationAcademiClawSignal[];
  academiClawTaskCount: number | null;
  academiClawLanguageCount: number | null;
  academiClawRubricCount: number | null;
  academiClawTraceCount: number | null;
  academiClawMetaEvalCount: number | null;
  academiClawModelCount: number | null;
  academiClawRegressionPassRate0to1: number | null;
  ragChunkingTechniqueCoverage: number | null;
  ragChunkingTechniqueSampleSize: number;
  ragChunkingTechniqueMissingSignals: MetricValidationRagChunkingTechniqueSignal[];
  ragChunkingTechniquePolicyDocumentCount: number | null;
  ragChunkingTechniqueNotebookCount: number | null;
  ragChunkingTechniqueChunkingStrategyCount: number | null;
  ragChunkingTechniqueEvaluationQuestionCount: number | null;
  ragChunkingTechniqueMetricCount: number | null;
  ragChunkingTechniqueRegressionPassRate0to1: number | null;
  kubernetesOperationalAgentCoverage: number | null;
  kubernetesOperationalAgentSampleSize: number;
  kubernetesOperationalAgentMissingSignals: MetricValidationKubernetesOperationalAgentSignal[];
  kubernetesOperationalAgentToolCategoryCount: number | null;
  kubernetesOperationalAgentDiagnosticCapabilityCount: number | null;
  kubernetesOperationalAgentResourceMetricCount: number | null;
  kubernetesOperationalAgentLogAnalysisCount: number | null;
  kubernetesOperationalAgentRegressionPassRate0to1: number | null;
  secureVibeBenchCoverage: number | null;
  secureVibeBenchSampleSize: number;
  secureVibeBenchMissingSignals: MetricValidationSecureVibeBenchSignal[];
  secureVibeBenchAgentAdapterCount: number | null;
  secureVibeBenchScenarioCount: number | null;
  secureVibeBenchTestScriptCount: number | null;
  secureVibeBenchRegressionPassRate0to1: number | null;
  ravigBenchCoverage: number | null;
  ravigBenchSampleSize: number;
  ravigBenchMissingSignals: MetricValidationRavigBenchSignal[];
  ravigBenchDatasetCaseCount: number | null;
  ravigBenchVisualDesignCheckCount: number | null;
  ravigBenchEvaluatorCount: number | null;
  ravigBenchValidationPassRate0to1: number | null;
  humanStudyBenchCoverage: number | null;
  humanStudyBenchSampleSize: number;
  humanStudyBenchMissingSignals: MetricValidationHumanStudyBenchSignal[];
  humanStudyBenchStudyCount: number | null;
  humanStudyBenchParticipantCount: number | null;
  humanStudyBenchResponseCount: number | null;
  humanStudyBenchEvaluatorCount: number | null;
  humanStudyBenchInterRaterAgreement0to1: number | null;
  humanStudyBenchTestRetestReliability0to1: number | null;
  humanStudyBenchValidationPassRate0to1: number | null;
  legacyBenchCoverage: number | null;
  legacyBenchSampleSize: number;
  legacyBenchMissingSignals: MetricValidationLegacyBenchSignal[];
  legacyBenchTaskCount: number | null;
  legacyBenchLanguageCount: number | null;
  legacyBenchEnvironmentCount: number | null;
  legacyBenchTestOracleCount: number | null;
  legacyBenchEvaluatorCount: number | null;
  legacyBenchRegressionPassRate0to1: number | null;
  legacyBenchReplayPassRate0to1: number | null;
  subtleMemoryCoverage: number | null;
  subtleMemorySampleSize: number;
  subtleMemoryMissingSignals: MetricValidationSubtleMemorySignal[];
  subtleMemoryPersonaCount: number | null;
  subtleMemoryBenchInstanceCount: number | null;
  subtleMemoryHistoryCount: number | null;
  subtleMemoryMemoryVariantSetCount: number | null;
  subtleMemoryRelationTypeCount: number | null;
  subtleMemoryEvaluationStageCount: number | null;
  subtleMemoryAdapterCount: number | null;
  subtleMemoryJudgeAgreement0to1: number | null;
  subtleMemoryValidationPassRate0to1: number | null;
  thresholds: MetricValidationThresholdPolicy;
}): string[] {
  const warnings: string[] = [];
  if (params.sampleSize < params.thresholds.minSampleSize) {
    warnings.push(`sample size ${params.sampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (params.constructValidity < params.thresholds.minConstructValidity) {
    warnings.push(`construct validity ${params.constructValidity.toFixed(2)} below ${params.thresholds.minConstructValidity}`);
  }
  if (params.ciWidth > params.thresholds.maxConfidenceIntervalWidth) {
    warnings.push(`confidence interval width ${params.ciWidth.toFixed(2)} exceeds ${params.thresholds.maxConfidenceIntervalWidth}`);
  }
  if (
    params.counterfactualResponsiveness !== null &&
    params.counterfactualResponsiveness < params.thresholds.minCounterfactualResponsiveness
  ) {
    warnings.push(`counterfactual responsiveness ${params.counterfactualResponsiveness.toFixed(2)} below ${params.thresholds.minCounterfactualResponsiveness}`);
  }
  if (params.counterfactualResponsiveness === null) {
    warnings.push("counterfactual responsiveness unavailable; add pre-registered intervention checks for high-stakes metrics");
  } else if (params.counterfactualSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`counterfactual sample size ${params.counterfactualSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.validationFacetCoverage !== null &&
    params.validationFacetCoverage < params.thresholds.minValidationFacetCoverage
  ) {
    warnings.push(`validation facet coverage ${params.validationFacetCoverage.toFixed(2)} below ${params.thresholds.minValidationFacetCoverage}`);
  }
  if (params.validationFacetCoverage === null) {
    warnings.push("validation facet coverage unavailable; add capability facet checks for benchmark-backed metrics");
  } else if (params.validationFacetSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`validation facet sample size ${params.validationFacetSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.confounderControlCoverage !== null &&
    params.confounderControlCoverage < params.thresholds.minConfounderControlCoverage
  ) {
    warnings.push(`confounder control coverage ${params.confounderControlCoverage.toFixed(2)} below ${params.thresholds.minConfounderControlCoverage}`);
  }
  if (params.confounderControlCoverage === null) {
    warnings.push("confounder control coverage unavailable; add framework, scaffold, tool, and environment control checks for benchmark-backed metrics");
  } else if (params.confounderControlSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`confounder control sample size ${params.confounderControlSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.outcomeAlignment !== null &&
    params.outcomeAlignment < params.thresholds.minOutcomeAlignment
  ) {
    warnings.push(`outcome alignment ${params.outcomeAlignment.toFixed(2)} below ${params.thresholds.minOutcomeAlignment}`);
  }
  if (params.outcomeAlignment === null) {
    warnings.push("outcome alignment unavailable; add target-outcome checks for metrics that can pass surface protocol while missing business, safety, or latent-preference outcomes");
  } else if (params.outcomeAlignmentSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`outcome alignment sample size ${params.outcomeAlignmentSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.processEvidenceCoverage !== null &&
    params.processEvidenceCoverage < params.thresholds.minProcessEvidenceCoverage
  ) {
    warnings.push(`process evidence coverage ${params.processEvidenceCoverage.toFixed(2)} below ${params.thresholds.minProcessEvidenceCoverage}`);
  }
  if (params.processEvidenceCoverage === null) {
    warnings.push("process evidence coverage unavailable; add trajectory defect and control-preservation checks for process-sensitive metrics");
  } else if (params.processEvidenceSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`process evidence sample size ${params.processEvidenceSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.safetyUtilityCoverage !== null &&
    params.safetyUtilityCoverage < params.thresholds.minSafetyUtilityCoverage
  ) {
    warnings.push(`safety-utility coverage ${params.safetyUtilityCoverage.toFixed(2)} below ${params.thresholds.minSafetyUtilityCoverage}`);
  }
  if (params.safetyUtilityCoverage === null) {
    warnings.push("safety-utility coverage unavailable; add unsafe-tool, safe-control, final-action risk, and utility-preservation checks for tool-risk metrics");
  } else if (params.safetyUtilitySampleSize < params.thresholds.minSampleSize) {
    warnings.push(`safety-utility sample size ${params.safetyUtilitySampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.modalityTransformationCoverage !== null &&
    params.modalityTransformationCoverage < params.thresholds.minModalityTransformationCoverage
  ) {
    warnings.push(`modality transformation coverage ${params.modalityTransformationCoverage.toFixed(2)} below ${params.thresholds.minModalityTransformationCoverage}`);
  }
  if (params.modalityTransformationCoverage === null) {
    warnings.push("modality transformation coverage unavailable; add paired-modality, transform-configuration, speaker/noise, parity, and judge-validation checks for transformed benchmark metrics");
  } else if (params.modalityTransformationSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`modality transformation sample size ${params.modalityTransformationSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.lifecycleObservabilityCoverage !== null &&
    params.lifecycleObservabilityCoverage < params.thresholds.minLifecycleObservabilityCoverage
  ) {
    warnings.push(`lifecycle observability coverage ${params.lifecycleObservabilityCoverage.toFixed(2)} below ${params.thresholds.minLifecycleObservabilityCoverage}`);
  }
  if (params.lifecycleObservabilityCoverage === null) {
    warnings.push("lifecycle observability coverage unavailable; add input/output validation, evaluator, trace, state-transition, and monitoring checks for runtime metric claims");
  } else if (params.lifecycleObservabilitySampleSize < params.thresholds.minSampleSize) {
    warnings.push(`lifecycle observability sample size ${params.lifecycleObservabilitySampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.rankingStabilityCoverage !== null &&
    params.rankingStabilityCoverage < params.thresholds.minRankingStabilityCoverage
  ) {
    warnings.push(`ranking stability coverage ${params.rankingStabilityCoverage.toFixed(2)} below ${params.thresholds.minRankingStabilityCoverage}`);
  }
  if (params.rankingStabilityCoverage === null) {
    warnings.push("ranking stability coverage unavailable; add subsampling confidence, tail-failure, data-quality, and OCR/readability checks for checkpoint-ranking metrics");
  } else if (params.rankingStabilitySampleSize < params.thresholds.minSampleSize) {
    warnings.push(`ranking stability sample size ${params.rankingStabilitySampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.toolSandboxCoverage !== null &&
    params.toolSandboxCoverage < params.thresholds.minToolSandboxCoverage
  ) {
    warnings.push(`tool sandbox coverage ${params.toolSandboxCoverage.toFixed(2)} below ${params.thresholds.minToolSandboxCoverage}`);
  }
  if (params.toolSandboxCoverage === null) {
    warnings.push("tool sandbox coverage unavailable; add tool registry, dependency graph, seeded state, API-failure, retrieval, verification, trajectory, and recovery checks for dynamic tool-sandbox metrics");
  } else if (params.toolSandboxSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`tool sandbox sample size ${params.toolSandboxSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.continualLearningCoverage !== null &&
    params.continualLearningCoverage < params.thresholds.minContinualLearningCoverage
  ) {
    warnings.push(`continual learning coverage ${params.continualLearningCoverage.toFixed(2)} below ${params.thresholds.minContinualLearningCoverage}`);
  }
  if (params.continualLearningCoverage === null) {
    warnings.push("continual learning coverage unavailable; add task-sequence, dataset-version, retention, adaptation, forgetting-rate, environment/config, controller-log, and longitudinal-run checks for lifelong-learning metrics");
  } else if (params.continualLearningSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`continual learning sample size ${params.continualLearningSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (params.continualLearningMissingSignals.length > 0) {
    warnings.push(`continual learning missing required signals: ${params.continualLearningMissingSignals.join(", ")}`);
  }
  if (params.continualLearningRunCount !== null && params.continualLearningRunCount < params.thresholds.minSampleSize) {
    warnings.push(`continual learning run count ${params.continualLearningRunCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.strategicInteractionCoverage !== null &&
    params.strategicInteractionCoverage < params.thresholds.minStrategicInteractionCoverage
  ) {
    warnings.push(`strategic interaction coverage ${params.strategicInteractionCoverage.toFixed(2)} below ${params.thresholds.minStrategicInteractionCoverage}`);
  }
  if (params.strategicInteractionCoverage === null) {
    warnings.push("strategic interaction coverage unavailable; add player-roster, public-transcript, private-action, collision/rule, scoring/rating, silent-baseline, truncation/context, and pairwise-uncertainty checks for multi-agent strategic metrics");
  } else if (params.strategicInteractionSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`strategic interaction sample size ${params.strategicInteractionSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.architectureRealityCoverage !== null &&
    params.architectureRealityCoverage < params.thresholds.minArchitectureRealityCoverage
  ) {
    warnings.push(`architecture reality coverage ${params.architectureRealityCoverage.toFixed(2)} below ${params.thresholds.minArchitectureRealityCoverage}; missing ${params.architectureRealityMissingSignals.join(", ")}`);
  }
  if (params.architectureRealityCoverage !== null && params.architectureRealitySampleSize < params.thresholds.minSampleSize) {
    warnings.push(`architecture reality sample size ${params.architectureRealitySampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.architectureRealityCoverage !== null &&
    (params.architectureRealityStressScenarioCount ?? 0) < params.thresholds.minSampleSize
  ) {
    warnings.push(`architecture reality stress scenario count ${params.architectureRealityStressScenarioCount ?? 0} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.architectureRealityCoverage !== null &&
    (params.architectureRealityNetworkScenarioCount ?? 0) < params.thresholds.minSampleSize
  ) {
    warnings.push(`architecture reality network scenario count ${params.architectureRealityNetworkScenarioCount ?? 0} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.architectureRealityCoverage !== null &&
    (params.architectureRealityEnsemblePatternCount ?? 0) < params.thresholds.minSampleSize
  ) {
    warnings.push(`architecture reality ensemble pattern count ${params.architectureRealityEnsemblePatternCount ?? 0} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.ragPipelineCoverage !== null &&
    params.ragPipelineCoverage < params.thresholds.minRagPipelineCoverage
  ) {
    warnings.push(`rag pipeline coverage ${params.ragPipelineCoverage.toFixed(2)} below ${params.thresholds.minRagPipelineCoverage}`);
  }
  if (params.ragPipelineCoverage === null) {
    warnings.push("rag pipeline coverage unavailable; add document-set, test-set, domain/jurisdiction/language/task coverage, corpus/chunking, index provenance, solution roster/config, retriever/reranker/model/judge configs, selected metric, query-level result, metric-computation trace, logged-sample, retrieval/generation trace, evaluator, report/export, and performance/cost checks for RAG metrics");
  } else if (params.ragPipelineSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`rag pipeline sample size ${params.ragPipelineSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.ragEvaluationPipelineCoverage !== null &&
    params.ragEvaluationPipelineCoverage < params.thresholds.minRagEvaluationPipelineCoverage
  ) {
    warnings.push(`rag evaluation pipeline coverage ${params.ragEvaluationPipelineCoverage.toFixed(2)} below ${params.thresholds.minRagEvaluationPipelineCoverage}; missing ${params.ragEvaluationPipelineMissingSignals.join(", ")}`);
  }
  if (params.ragEvaluationPipelineCoverage !== null && params.ragEvaluationPipelineSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`rag evaluation pipeline sample size ${params.ragEvaluationPipelineSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.ragEvaluationPipelineCoverage !== null &&
    params.ragEvaluationPipelineCaseSampleSizeMin !== null &&
    params.ragEvaluationPipelineCaseSampleSizeMin < params.thresholds.minSampleSize
  ) {
    warnings.push(`rag evaluation pipeline case sample size ${params.ragEvaluationPipelineCaseSampleSizeMin} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.ragasNotebookCoverage !== null &&
    params.ragasNotebookCoverage < params.thresholds.minRagasNotebookCoverage
  ) {
    warnings.push(`ragas notebook metric coverage ${params.ragasNotebookCoverage.toFixed(2)} below ${params.thresholds.minRagasNotebookCoverage}; missing ${params.ragasNotebookMissingSignals.join(", ")}`);
  }
  if (params.ragasNotebookCoverage !== null && params.ragasNotebookSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`ragas notebook metric sample size ${params.ragasNotebookSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.ragasNotebookCoverage !== null &&
    params.ragasNotebookQuestionCount !== null &&
    params.ragasNotebookQuestionCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`ragas notebook question count ${params.ragasNotebookQuestionCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.mirageRagMetricCoverage !== null &&
    params.mirageRagMetricCoverage < params.thresholds.minMirageRagMetricCoverage
  ) {
    warnings.push(`mirage rag metric coverage ${params.mirageRagMetricCoverage.toFixed(2)} below ${params.thresholds.minMirageRagMetricCoverage}; missing ${params.mirageRagMetricMissingSignals.join(", ")}`);
  }
  if (params.mirageRagMetricCoverage !== null && params.mirageRagMetricSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`mirage rag metric sample size ${params.mirageRagMetricSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.mirageRagMetricCoverage !== null &&
    params.mirageRagMetricQaPairCount !== null &&
    params.mirageRagMetricQaPairCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`mirage rag metric QA pair count ${params.mirageRagMetricQaPairCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.mirageRagMetricCoverage !== null &&
    params.mirageRagMetricContextPoolCount !== null &&
    params.mirageRagMetricContextPoolCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`mirage rag metric context pool count ${params.mirageRagMetricContextPoolCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.legalCodeRagCoverage !== null &&
    params.legalCodeRagCoverage < params.thresholds.minLegalCodeRagCoverage
  ) {
    warnings.push(`legal code rag coverage ${params.legalCodeRagCoverage.toFixed(2)} below ${params.thresholds.minLegalCodeRagCoverage}; missing ${params.legalCodeRagMissingSignals.join(", ")}`);
  }
  if (
    params.legalCodeRagCoverage !== null &&
    params.legalCodeRagSampleSize < params.thresholds.minSampleSize
  ) {
    warnings.push(`legal code rag sample size ${params.legalCodeRagSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.legalCodeRagCoverage !== null &&
    params.legalCodeRagQuestionCount !== null &&
    params.legalCodeRagQuestionCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`legal code rag question count ${params.legalCodeRagQuestionCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.guardbenchMetricCoverage !== null &&
    params.guardbenchMetricCoverage < params.thresholds.minGuardbenchMetricCoverage
  ) {
    warnings.push(`guardbench metric coverage ${params.guardbenchMetricCoverage.toFixed(2)} below ${params.thresholds.minGuardbenchMetricCoverage}; missing ${params.guardbenchMetricMissingSignals.join(", ")}`);
  }
  if (params.guardbenchMetricCoverage !== null && params.guardbenchMetricSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`guardbench metric sample size ${params.guardbenchMetricSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.businessWorkflowCoverage !== null &&
    params.businessWorkflowCoverage < params.thresholds.minBusinessWorkflowCoverage
  ) {
    warnings.push(`business workflow coverage ${params.businessWorkflowCoverage.toFixed(2)} below ${params.thresholds.minBusinessWorkflowCoverage}`);
  }
  if (params.businessWorkflowCoverage === null) {
    warnings.push("business workflow coverage unavailable; add domain/task coverage, simple-baseline, public-private split, toolset/config, programmatic assertion, partial-credit/pass-rate, export, and multi-run comparison checks for workflow automation metrics");
  } else if (params.businessWorkflowSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`business workflow sample size ${params.businessWorkflowSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.dataAgentAnalyticalCoverage !== null &&
    params.dataAgentAnalyticalCoverage < params.thresholds.minDataAgentAnalyticalCoverage
  ) {
    warnings.push(`data-agent analytical coverage ${params.dataAgentAnalyticalCoverage.toFixed(2)} below ${params.thresholds.minDataAgentAnalyticalCoverage}`);
  }
  if (params.dataAgentAnalyticalCoverage === null) {
    warnings.push("data-agent analytical coverage unavailable; add task-type, database/source-modality, difficulty, metric-computation, agent-workflow, expert-validation, cost-latency, and submission-schema checks for data-agent benchmark metrics");
  } else if (params.dataAgentAnalyticalSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`data-agent analytical sample size ${params.dataAgentAnalyticalSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.embodiedAgentCoverage !== null &&
    params.embodiedAgentCoverage < params.thresholds.minEmbodiedAgentCoverage
  ) {
    warnings.push(`embodied-agent coverage ${params.embodiedAgentCoverage.toFixed(2)} below ${params.thresholds.minEmbodiedAgentCoverage}; missing ${params.embodiedAgentMissingSignals.join(", ")}`);
  }
  if (params.embodiedAgentCoverage !== null && params.embodiedAgentSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`embodied-agent sample size ${params.embodiedAgentSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.evaluatorSuiteCoverage !== null &&
    params.evaluatorSuiteCoverage < params.thresholds.minEvaluatorSuiteCoverage
  ) {
    warnings.push(`evaluator-suite coverage ${params.evaluatorSuiteCoverage.toFixed(2)} below ${params.thresholds.minEvaluatorSuiteCoverage}; missing ${params.evaluatorSuiteMissingSignals.join(", ")}`);
  }
  if (params.evaluatorSuiteCoverage !== null && params.evaluatorSuiteSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`evaluator-suite sample size ${params.evaluatorSuiteSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.pentestBenchmarkCoverage !== null &&
    params.pentestBenchmarkCoverage < params.thresholds.minPentestBenchmarkCoverage
  ) {
    warnings.push(`pentest benchmark coverage ${params.pentestBenchmarkCoverage.toFixed(2)} below ${params.thresholds.minPentestBenchmarkCoverage}; missing ${params.pentestBenchmarkMissingSignals.join(", ")}`);
  }
  if (params.pentestBenchmarkCoverage !== null && params.pentestBenchmarkSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`pentest benchmark sample size ${params.pentestBenchmarkSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.traceEvaluationCoverage !== null &&
    params.traceEvaluationCoverage < params.thresholds.minTraceEvaluationCoverage
  ) {
    warnings.push(`trace evaluation coverage ${params.traceEvaluationCoverage.toFixed(2)} below ${params.thresholds.minTraceEvaluationCoverage}; missing ${params.traceEvaluationMissingSignals.join(", ")}`);
  }
  if (params.traceEvaluationCoverage !== null && params.traceEvaluationSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`trace evaluation sample size ${params.traceEvaluationSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.livingEnvironmentCoverage !== null &&
    params.livingEnvironmentCoverage < params.thresholds.minLivingEnvironmentCoverage
  ) {
    warnings.push(`living environment coverage ${params.livingEnvironmentCoverage.toFixed(2)} below ${params.thresholds.minLivingEnvironmentCoverage}; missing ${params.livingEnvironmentMissingSignals.join(", ")}`);
  }
  if (params.livingEnvironmentCoverage !== null && params.livingEnvironmentSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`living environment sample size ${params.livingEnvironmentSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.mobileAgentCoverage !== null &&
    params.mobileAgentCoverage < params.thresholds.minMobileAgentCoverage
  ) {
    warnings.push(`mobile-agent coverage ${params.mobileAgentCoverage.toFixed(2)} below ${params.thresholds.minMobileAgentCoverage}; missing ${params.mobileAgentMissingSignals.join(", ")}`);
  }
  if (params.mobileAgentCoverage !== null && params.mobileAgentSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`mobile-agent sample size ${params.mobileAgentSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.mobileAgentCoverage !== null &&
    params.mobileAgentTrialCount !== null &&
    params.mobileAgentTrialCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`mobile-agent trial count ${params.mobileAgentTrialCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.personaAgentCoverage !== null &&
    params.personaAgentCoverage < params.thresholds.minPersonaAgentCoverage
  ) {
    warnings.push(`persona-agent coverage ${params.personaAgentCoverage.toFixed(2)} below ${params.thresholds.minPersonaAgentCoverage}; missing ${params.personaAgentMissingSignals.join(", ")}`);
  }
  if (params.personaAgentCoverage !== null && params.personaAgentSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`persona-agent sample size ${params.personaAgentSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.scientificLiteratureCoverage !== null &&
    params.scientificLiteratureCoverage < params.thresholds.minScientificLiteratureCoverage
  ) {
    warnings.push(`scientific literature discovery coverage ${params.scientificLiteratureCoverage.toFixed(2)} below ${params.thresholds.minScientificLiteratureCoverage}; missing ${params.scientificLiteratureMissingSignals.join(", ")}`);
  }
  if (params.scientificLiteratureCoverage !== null && params.scientificLiteratureSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`scientific literature discovery sample size ${params.scientificLiteratureSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.scientificLiteratureCoverage !== null &&
    params.scientificLiteratureTaskCount !== null &&
    params.scientificLiteratureTaskCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`scientific literature discovery task count ${params.scientificLiteratureTaskCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.bioinformaticsAgentCoverage !== null &&
    params.bioinformaticsAgentCoverage < params.thresholds.minBioinformaticsAgentCoverage
  ) {
    warnings.push(`bioinformatics-agent coverage ${params.bioinformaticsAgentCoverage.toFixed(2)} below ${params.thresholds.minBioinformaticsAgentCoverage}; missing ${params.bioinformaticsAgentMissingSignals.join(", ")}`);
  }
  if (params.bioinformaticsAgentCoverage !== null && params.bioinformaticsAgentSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`bioinformatics-agent sample size ${params.bioinformaticsAgentSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.bioinformaticsAgentCoverage !== null &&
    params.bioinformaticsAgentTaskCount !== null &&
    params.bioinformaticsAgentTaskCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`bioinformatics-agent task count ${params.bioinformaticsAgentTaskCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.mirageDrugRepositioningCoverage !== null &&
    params.mirageDrugRepositioningCoverage < params.thresholds.minMirageDrugRepositioningCoverage
  ) {
    warnings.push(`mirage drug repositioning coverage ${params.mirageDrugRepositioningCoverage.toFixed(2)} below ${params.thresholds.minMirageDrugRepositioningCoverage}; missing ${params.mirageDrugRepositioningMissingSignals.join(", ")}`);
  }
  if (
    params.mirageDrugRepositioningCoverage !== null &&
    params.mirageDrugRepositioningSampleSize < params.thresholds.minSampleSize
  ) {
    warnings.push(`mirage drug repositioning sample size ${params.mirageDrugRepositioningSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.mirageDrugRepositioningCoverage !== null &&
    params.mirageDrugRepositioningMappingCount !== null &&
    params.mirageDrugRepositioningMappingCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`mirage drug repositioning mapping count ${params.mirageDrugRepositioningMappingCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.mirageDrugRepositioningCoverage !== null &&
    params.mirageDrugRepositioningFeatureSetCount !== null &&
    params.mirageDrugRepositioningFeatureSetCount <= 0
  ) {
    warnings.push("mirage drug repositioning feature-set count must be positive");
  }
  if (
    params.mirageDrugRepositioningCoverage !== null &&
    params.mirageDrugRepositioningSimilarityMatrixCount !== null &&
    params.mirageDrugRepositioningSimilarityMatrixCount <= 0
  ) {
    warnings.push("mirage drug repositioning similarity-matrix count must be positive");
  }
  if (
    params.mirageDrugRepositioningCoverage !== null &&
    (params.mirageDrugRepositioningDrugCount === 0 || params.mirageDrugRepositioningDiseaseCount === 0)
  ) {
    warnings.push("mirage drug repositioning drug and disease counts must be positive");
  }
  if (
    params.networkTroubleshootingCoverage !== null &&
    params.networkTroubleshootingCoverage < params.thresholds.minNetworkTroubleshootingCoverage
  ) {
    warnings.push(`network troubleshooting coverage ${params.networkTroubleshootingCoverage.toFixed(2)} below ${params.thresholds.minNetworkTroubleshootingCoverage}; missing ${params.networkTroubleshootingMissingSignals.join(", ")}`);
  }
  if (params.networkTroubleshootingCoverage !== null && params.networkTroubleshootingSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`network troubleshooting sample size ${params.networkTroubleshootingSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.networkTroubleshootingCoverage !== null &&
    params.networkTroubleshootingIncidentCount !== null &&
    params.networkTroubleshootingIncidentCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`network troubleshooting incident count ${params.networkTroubleshootingIncidentCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.inferenceOptimizationCoverage !== null &&
    params.inferenceOptimizationCoverage < params.thresholds.minInferenceOptimizationCoverage
  ) {
    warnings.push(`inference optimization coverage ${params.inferenceOptimizationCoverage.toFixed(2)} below ${params.thresholds.minInferenceOptimizationCoverage}; missing ${params.inferenceOptimizationMissingSignals.join(", ")}`);
  }
  if (params.inferenceOptimizationCoverage !== null && params.inferenceOptimizationSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`inference optimization sample size ${params.inferenceOptimizationSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.inferenceOptimizationCoverage !== null &&
    params.inferenceOptimizationRunCount !== null &&
    params.inferenceOptimizationRunCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`inference optimization run count ${params.inferenceOptimizationRunCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.javaCodingAgentCoverage !== null &&
    params.javaCodingAgentCoverage < params.thresholds.minJavaCodingAgentCoverage
  ) {
    warnings.push(`java coding-agent coverage ${params.javaCodingAgentCoverage.toFixed(2)} below ${params.thresholds.minJavaCodingAgentCoverage}; missing ${params.javaCodingAgentMissingSignals.join(", ")}`);
  }
  if (params.javaCodingAgentCoverage !== null && params.javaCodingAgentSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`java coding-agent sample size ${params.javaCodingAgentSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.javaCodingAgentCoverage !== null &&
    params.javaCodingAgentTrialCount !== null &&
    params.javaCodingAgentTrialCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`java coding-agent trial count ${params.javaCodingAgentTrialCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.webEvalDatasetCoverage !== null &&
    params.webEvalDatasetCoverage < params.thresholds.minWebEvalDatasetCoverage
  ) {
    warnings.push(`web eval dataset coverage ${params.webEvalDatasetCoverage.toFixed(2)} below ${params.thresholds.minWebEvalDatasetCoverage}; missing ${params.webEvalDatasetMissingSignals.join(", ")}`);
  }
  if (params.webEvalDatasetCoverage !== null && params.webEvalDatasetSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`web eval dataset sample size ${params.webEvalDatasetSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.webEvalDatasetCoverage !== null &&
    params.webEvalDatasetQuestionCount !== null &&
    params.webEvalDatasetQuestionCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`web eval dataset question count ${params.webEvalDatasetQuestionCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.webEvalDatasetCoverage !== null &&
    params.webEvalDatasetDocumentCount !== null &&
    params.webEvalDatasetDocumentCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`web eval dataset document count ${params.webEvalDatasetDocumentCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.parallelResearchSkillCoverage !== null &&
    params.parallelResearchSkillCoverage < params.thresholds.minParallelResearchSkillCoverage
  ) {
    warnings.push(`parallel research-skill coverage ${params.parallelResearchSkillCoverage.toFixed(2)} below ${params.thresholds.minParallelResearchSkillCoverage}; missing ${params.parallelResearchSkillMissingSignals.join(", ")}`);
  }
  if (
    params.parallelResearchSkillCoverage !== null &&
    params.parallelResearchSkillSampleSize < params.thresholds.minSampleSize
  ) {
    warnings.push(`parallel research-skill sample size ${params.parallelResearchSkillSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.parallelResearchSkillCoverage !== null &&
    params.parallelResearchSkillCitationCoverage0to1 !== null &&
    params.parallelResearchSkillCitationCoverage0to1 < params.thresholds.minOutcomeAlignment
  ) {
    warnings.push(`parallel research-skill citation coverage ${params.parallelResearchSkillCitationCoverage0to1.toFixed(2)} below ${params.thresholds.minOutcomeAlignment}`);
  }
  if (
    params.parallelResearchSkillCoverage !== null &&
    params.parallelResearchSkillSourcePolicyCoverage0to1 !== null &&
    params.parallelResearchSkillSourcePolicyCoverage0to1 < params.thresholds.minValidationFacetCoverage
  ) {
    warnings.push(`parallel research-skill source-policy coverage ${params.parallelResearchSkillSourcePolicyCoverage0to1.toFixed(2)} below ${params.thresholds.minValidationFacetCoverage}`);
  }
  if (
    params.parallelResearchSkillCoverage !== null &&
    params.parallelResearchSkillBatchTaskLimit !== null &&
    params.parallelResearchSkillBatchTaskLimit < params.thresholds.minSampleSize
  ) {
    warnings.push(`parallel research-skill batch task limit ${params.parallelResearchSkillBatchTaskLimit} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.parallelResearchSkillCoverage !== null &&
    params.parallelResearchSkillMonitoringCoverage0to1 !== null &&
    params.parallelResearchSkillMonitoringCoverage0to1 < params.thresholds.minLifecycleObservabilityCoverage
  ) {
    warnings.push(`parallel research-skill monitoring coverage ${params.parallelResearchSkillMonitoringCoverage0to1.toFixed(2)} below ${params.thresholds.minLifecycleObservabilityCoverage}`);
  }
  if (
    params.resumeRagEvaluatorCoverage !== null &&
    params.resumeRagEvaluatorCoverage < params.thresholds.minResumeRagEvaluatorCoverage
  ) {
    warnings.push(`resume RAG evaluator coverage ${params.resumeRagEvaluatorCoverage.toFixed(2)} below ${params.thresholds.minResumeRagEvaluatorCoverage}; missing ${params.resumeRagEvaluatorMissingSignals.join(", ")}`);
  }
  if (
    params.resumeRagEvaluatorCoverage !== null &&
    params.resumeRagEvaluatorSampleSize < params.thresholds.minSampleSize
  ) {
    warnings.push(`resume RAG evaluator sample size ${params.resumeRagEvaluatorSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.resumeRagEvaluatorCoverage !== null &&
    params.resumeRagEvaluatorParserCoverage0to1 !== null &&
    params.resumeRagEvaluatorParserCoverage0to1 < params.thresholds.minProcessEvidenceCoverage
  ) {
    warnings.push(`resume RAG evaluator parser coverage ${params.resumeRagEvaluatorParserCoverage0to1.toFixed(2)} below ${params.thresholds.minProcessEvidenceCoverage}`);
  }
  if (
    params.resumeRagEvaluatorCoverage !== null &&
    params.resumeRagEvaluatorEvaluationGrounding0to1 !== null &&
    params.resumeRagEvaluatorEvaluationGrounding0to1 < params.thresholds.minOutcomeAlignment
  ) {
    warnings.push(`resume RAG evaluator evaluation grounding ${params.resumeRagEvaluatorEvaluationGrounding0to1.toFixed(2)} below ${params.thresholds.minOutcomeAlignment}`);
  }
  if (
    params.chipBenchmarkCoverage !== null &&
    params.chipBenchmarkCoverage < params.thresholds.minChipBenchmarkCoverage
  ) {
    warnings.push(`ChipBenchmark coverage ${params.chipBenchmarkCoverage.toFixed(2)} below ${params.thresholds.minChipBenchmarkCoverage}; missing ${params.chipBenchmarkMissingSignals.join(", ")}`);
  }
  if (params.chipBenchmarkCoverage !== null && params.chipBenchmarkSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`ChipBenchmark sample size ${params.chipBenchmarkSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.chipBenchmarkCoverage !== null &&
    params.chipBenchmarkResultRowCount !== null &&
    params.chipBenchmarkResultRowCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`ChipBenchmark result row count ${params.chipBenchmarkResultRowCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.chipBenchmarkCoverage !== null &&
    params.chipBenchmarkThroughputCoverage0to1 !== null &&
    params.chipBenchmarkThroughputCoverage0to1 < params.thresholds.minOutcomeAlignment
  ) {
    warnings.push(`ChipBenchmark throughput coverage ${params.chipBenchmarkThroughputCoverage0to1.toFixed(2)} below ${params.thresholds.minOutcomeAlignment}`);
  }
  if (
    params.chipBenchmarkCoverage !== null &&
    params.chipBenchmarkLatencyCoverage0to1 !== null &&
    params.chipBenchmarkLatencyCoverage0to1 < params.thresholds.minOutcomeAlignment
  ) {
    warnings.push(`ChipBenchmark latency coverage ${params.chipBenchmarkLatencyCoverage0to1.toFixed(2)} below ${params.thresholds.minOutcomeAlignment}`);
  }
  if (
    params.chipBenchmarkCoverage !== null &&
    params.chipBenchmarkCostCoverage0to1 !== null &&
    params.chipBenchmarkCostCoverage0to1 < params.thresholds.minOutcomeAlignment
  ) {
    warnings.push(`ChipBenchmark cost coverage ${params.chipBenchmarkCostCoverage0to1.toFixed(2)} below ${params.thresholds.minOutcomeAlignment}`);
  }
  if (
    params.hermesBenchCoverage !== null &&
    params.hermesBenchCoverage < params.thresholds.minHermesBenchCoverage
  ) {
    warnings.push(`Hermes Bench coverage ${params.hermesBenchCoverage.toFixed(2)} below ${params.thresholds.minHermesBenchCoverage}; missing ${params.hermesBenchMissingSignals.join(", ")}`);
  }
  if (params.hermesBenchCoverage !== null && params.hermesBenchSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`Hermes Bench sample size ${params.hermesBenchSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.hermesBenchCoverage !== null &&
    params.hermesBenchTaskCount !== null &&
    params.hermesBenchTaskCount < params.thresholds.minHermesBenchTaskCount
  ) {
    warnings.push(`Hermes Bench task count ${params.hermesBenchTaskCount} below minimum ${params.thresholds.minHermesBenchTaskCount}`);
  }
  if (
    params.hermesBenchCoverage !== null &&
    params.hermesBenchAdapterCount !== null &&
    params.hermesBenchAdapterCount < params.thresholds.minHermesBenchAdapterCount
  ) {
    warnings.push(`Hermes Bench adapter count ${params.hermesBenchAdapterCount} below minimum ${params.thresholds.minHermesBenchAdapterCount}`);
  }
  if (
    params.hermesBenchCoverage !== null &&
    params.hermesBenchBackendTestCount !== null &&
    params.hermesBenchBackendTestCount < params.thresholds.minHermesBenchBackendTestCount
  ) {
    warnings.push(`Hermes Bench backend test count ${params.hermesBenchBackendTestCount} below minimum ${params.thresholds.minHermesBenchBackendTestCount}`);
  }
  if (
    params.hermesBenchCoverage !== null &&
    params.hermesBenchFrontendTestCount !== null &&
    params.hermesBenchFrontendTestCount < params.thresholds.minHermesBenchFrontendTestCount
  ) {
    warnings.push(`Hermes Bench frontend test count ${params.hermesBenchFrontendTestCount} below minimum ${params.thresholds.minHermesBenchFrontendTestCount}`);
  }
  if (
    params.hermesBenchCoverage !== null &&
    params.hermesBenchJudgeAgreement0to1 !== null &&
    params.hermesBenchJudgeAgreement0to1 < params.thresholds.minHermesBenchJudgeAgreement0to1
  ) {
    warnings.push(`Hermes Bench judge agreement ${params.hermesBenchJudgeAgreement0to1.toFixed(2)} below ${params.thresholds.minHermesBenchJudgeAgreement0to1}`);
  }
  if (
    params.hermesBenchCoverage !== null &&
    params.hermesBenchRegressionPassRate0to1 !== null &&
    params.hermesBenchRegressionPassRate0to1 < params.thresholds.minHermesBenchRegressionPassRate0to1
  ) {
    warnings.push(`Hermes Bench regression pass rate ${params.hermesBenchRegressionPassRate0to1.toFixed(2)} below ${params.thresholds.minHermesBenchRegressionPassRate0to1}`);
  }
  if (
    params.cooperBenchCoverage !== null &&
    params.cooperBenchCoverage < params.thresholds.minCooperBenchCoverage
  ) {
    warnings.push(`CooperBench coverage ${params.cooperBenchCoverage.toFixed(2)} below ${params.thresholds.minCooperBenchCoverage}; missing ${params.cooperBenchMissingSignals.join(", ")}`);
  }
  if (params.cooperBenchCoverage !== null && params.cooperBenchSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`CooperBench sample size ${params.cooperBenchSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.cooperBenchCoverage !== null &&
    params.cooperBenchTaskCount !== null &&
    params.cooperBenchTaskCount < params.thresholds.minCooperBenchTaskCount
  ) {
    warnings.push(`CooperBench task count ${params.cooperBenchTaskCount} below minimum ${params.thresholds.minCooperBenchTaskCount}`);
  }
  if (
    params.cooperBenchCoverage !== null &&
    params.cooperBenchFeatureCount !== null &&
    params.cooperBenchFeatureCount < params.thresholds.minCooperBenchFeatureCount
  ) {
    warnings.push(`CooperBench feature-conflict count ${params.cooperBenchFeatureCount} below minimum ${params.thresholds.minCooperBenchFeatureCount}`);
  }
  if (
    params.cooperBenchCoverage !== null &&
    params.cooperBenchAgentAdapterCount !== null &&
    params.cooperBenchAgentAdapterCount < params.thresholds.minCooperBenchAgentAdapterCount
  ) {
    warnings.push(`CooperBench agent-adapter count ${params.cooperBenchAgentAdapterCount} below minimum ${params.thresholds.minCooperBenchAgentAdapterCount}`);
  }
  if (
    params.cooperBenchCoverage !== null &&
    params.cooperBenchTestCount !== null &&
    params.cooperBenchTestCount < params.thresholds.minCooperBenchTestCount
  ) {
    warnings.push(`CooperBench test count ${params.cooperBenchTestCount} below minimum ${params.thresholds.minCooperBenchTestCount}`);
  }
  if (
    params.cooperBenchCoverage !== null &&
    params.cooperBenchCooperationScore0to1 !== null &&
    params.cooperBenchCooperationScore0to1 < params.thresholds.minCooperBenchCooperationScore0to1
  ) {
    warnings.push(`CooperBench cooperation score ${params.cooperBenchCooperationScore0to1.toFixed(2)} below ${params.thresholds.minCooperBenchCooperationScore0to1}`);
  }
  if (
    params.cooperBenchCoverage !== null &&
    params.cooperBenchConflictResolutionRate0to1 !== null &&
    params.cooperBenchConflictResolutionRate0to1 < params.thresholds.minCooperBenchConflictResolutionRate0to1
  ) {
    warnings.push(`CooperBench conflict-resolution rate ${params.cooperBenchConflictResolutionRate0to1.toFixed(2)} below ${params.thresholds.minCooperBenchConflictResolutionRate0to1}`);
  }
  if (
    params.cooperBenchCoverage !== null &&
    params.cooperBenchRegressionPassRate0to1 !== null &&
    params.cooperBenchRegressionPassRate0to1 < params.thresholds.minCooperBenchRegressionPassRate0to1
  ) {
    warnings.push(`CooperBench regression pass rate ${params.cooperBenchRegressionPassRate0to1.toFixed(2)} below ${params.thresholds.minCooperBenchRegressionPassRate0to1}`);
  }
  if (
    params.coderCupCoverage !== null &&
    params.coderCupCoverage < params.thresholds.minCoderCupCoverage
  ) {
    warnings.push(`CoderCup coverage ${params.coderCupCoverage.toFixed(2)} below ${params.thresholds.minCoderCupCoverage}; missing ${params.coderCupMissingSignals.join(", ")}`);
  }
  if (params.coderCupCoverage !== null && params.coderCupSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`CoderCup sample size ${params.coderCupSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.coderCupCoverage !== null &&
    params.coderCupPhaseCount !== null &&
    params.coderCupPhaseCount < params.thresholds.minCoderCupPhaseCount
  ) {
    warnings.push(`CoderCup phase count ${params.coderCupPhaseCount} below minimum ${params.thresholds.minCoderCupPhaseCount}`);
  }
  if (
    params.coderCupCoverage !== null &&
    params.coderCupTestPlanCount !== null &&
    params.coderCupTestPlanCount < params.thresholds.minCoderCupTestPlanCount
  ) {
    warnings.push(`CoderCup test-plan count ${params.coderCupTestPlanCount} below minimum ${params.thresholds.minCoderCupTestPlanCount}`);
  }
  if (
    params.coderCupCoverage !== null &&
    params.coderCupRunnerCount !== null &&
    params.coderCupRunnerCount < params.thresholds.minCoderCupRunnerCount
  ) {
    warnings.push(`CoderCup runner count ${params.coderCupRunnerCount} below minimum ${params.thresholds.minCoderCupRunnerCount}`);
  }
  if (
    params.coderCupCoverage !== null &&
    params.coderCupScoreLedgerCount !== null &&
    params.coderCupScoreLedgerCount < params.thresholds.minCoderCupScoreLedgerCount
  ) {
    warnings.push(`CoderCup score-ledger count ${params.coderCupScoreLedgerCount} below minimum ${params.thresholds.minCoderCupScoreLedgerCount}`);
  }
  if (
    params.coderCupCoverage !== null &&
    params.coderCupLiveSurfaceCount !== null &&
    params.coderCupLiveSurfaceCount < params.thresholds.minCoderCupLiveSurfaceCount
  ) {
    warnings.push(`CoderCup live-surface count ${params.coderCupLiveSurfaceCount} below minimum ${params.thresholds.minCoderCupLiveSurfaceCount}`);
  }
  if (
    params.coderCupCoverage !== null &&
    params.coderCupInterRaterAgreement0to1 !== null &&
    params.coderCupInterRaterAgreement0to1 < params.thresholds.minCoderCupInterRaterAgreement0to1
  ) {
    warnings.push(`CoderCup inter-rater agreement ${params.coderCupInterRaterAgreement0to1.toFixed(2)} below ${params.thresholds.minCoderCupInterRaterAgreement0to1}`);
  }
  if (
    params.coderCupCoverage !== null &&
    params.coderCupTestRetestReliability0to1 !== null &&
    params.coderCupTestRetestReliability0to1 < params.thresholds.minCoderCupTestRetestReliability0to1
  ) {
    warnings.push(`CoderCup test-retest reliability ${params.coderCupTestRetestReliability0to1.toFixed(2)} below ${params.thresholds.minCoderCupTestRetestReliability0to1}`);
  }
  if (
    params.coderCupCoverage !== null &&
    params.coderCupRegressionPassRate0to1 !== null &&
    params.coderCupRegressionPassRate0to1 < params.thresholds.minCoderCupRegressionPassRate0to1
  ) {
    warnings.push(`CoderCup regression pass rate ${params.coderCupRegressionPassRate0to1.toFixed(2)} below ${params.thresholds.minCoderCupRegressionPassRate0to1}`);
  }
  if (
    params.agenticGraphRagCoverage !== null &&
    params.agenticGraphRagCoverage < params.thresholds.minAgenticGraphRagCoverage
  ) {
    warnings.push(`Agentic Graph RAG coverage ${params.agenticGraphRagCoverage.toFixed(2)} below ${params.thresholds.minAgenticGraphRagCoverage}; missing ${params.agenticGraphRagMissingSignals.join(", ")}`);
  }
  if (params.agenticGraphRagCoverage !== null && params.agenticGraphRagSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`Agentic Graph RAG sample size ${params.agenticGraphRagSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.agenticGraphRagCoverage !== null &&
    params.agenticGraphRagGraphNodeCount !== null &&
    params.agenticGraphRagGraphNodeCount < params.thresholds.minAgenticGraphRagGraphNodeCount
  ) {
    warnings.push(`Agentic Graph RAG graph node count ${params.agenticGraphRagGraphNodeCount} below minimum ${params.thresholds.minAgenticGraphRagGraphNodeCount}`);
  }
  if (
    params.agenticGraphRagCoverage !== null &&
    params.agenticGraphRagEvaluationMetricCount !== null &&
    params.agenticGraphRagEvaluationMetricCount < params.thresholds.minAgenticGraphRagEvaluationMetricCount
  ) {
    warnings.push(`Agentic Graph RAG evaluation metric count ${params.agenticGraphRagEvaluationMetricCount} below minimum ${params.thresholds.minAgenticGraphRagEvaluationMetricCount}`);
  }
  if (
    params.agenticGraphRagCoverage !== null &&
    params.agenticGraphRagExperimentCount !== null &&
    params.agenticGraphRagExperimentCount < params.thresholds.minAgenticGraphRagExperimentCount
  ) {
    warnings.push(`Agentic Graph RAG experiment count ${params.agenticGraphRagExperimentCount} below minimum ${params.thresholds.minAgenticGraphRagExperimentCount}`);
  }
  if (
    params.agenticGraphRagCoverage !== null &&
    params.agenticGraphRagRetrievalGroundingScore0to1 !== null &&
    params.agenticGraphRagRetrievalGroundingScore0to1 < params.thresholds.minAgenticGraphRagRetrievalGroundingScore0to1
  ) {
    warnings.push(`Agentic Graph RAG retrieval grounding ${params.agenticGraphRagRetrievalGroundingScore0to1.toFixed(2)} below ${params.thresholds.minAgenticGraphRagRetrievalGroundingScore0to1}`);
  }
  if (
    params.agenticGraphRagCoverage !== null &&
    params.agenticGraphRagRegressionPassRate0to1 !== null &&
    params.agenticGraphRagRegressionPassRate0to1 < params.thresholds.minAgenticGraphRagRegressionPassRate0to1
  ) {
    warnings.push(`Agentic Graph RAG regression pass rate ${params.agenticGraphRagRegressionPassRate0to1.toFixed(2)} below ${params.thresholds.minAgenticGraphRagRegressionPassRate0to1}`);
  }
  if (
    params.agentScenarioTestCoverage !== null &&
    params.agentScenarioTestCoverage < params.thresholds.minAgentScenarioTestCoverage
  ) {
    warnings.push(`agent scenario-test coverage ${params.agentScenarioTestCoverage.toFixed(2)} below ${params.thresholds.minAgentScenarioTestCoverage}; missing ${params.agentScenarioTestMissingSignals.join(", ")}`);
  }
  if (params.agentScenarioTestCoverage !== null && params.agentScenarioTestSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`agent scenario-test sample size ${params.agentScenarioTestSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.agentScenarioTestCoverage !== null &&
    params.agentScenarioTestScenarioCount !== null &&
    params.agentScenarioTestScenarioCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`agent scenario-test scenario count ${params.agentScenarioTestScenarioCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.agentScenarioTestCoverage !== null &&
    params.agentScenarioTestTurnCount !== null &&
    params.agentScenarioTestTurnCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`agent scenario-test turn count ${params.agentScenarioTestTurnCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.agentScenarioTestCoverage !== null &&
    params.agentScenarioTestToolCallCount !== null &&
    params.agentScenarioTestToolCallCount < 1
  ) {
    warnings.push(`agent scenario-test tool-call count ${params.agentScenarioTestToolCallCount} below minimum 1`);
  }
  if (
    params.openCodeLabCoverage !== null &&
    params.openCodeLabCoverage < params.thresholds.minOpenCodeLabCoverage
  ) {
    warnings.push(`opencode-lab coverage ${params.openCodeLabCoverage.toFixed(2)} below ${params.thresholds.minOpenCodeLabCoverage}; missing ${params.openCodeLabMissingSignals.join(", ")}`);
  }
  if (params.openCodeLabCoverage !== null && params.openCodeLabSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`opencode-lab sample size ${params.openCodeLabSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.openCodeLabCoverage !== null &&
    params.openCodeLabRunCount !== null &&
    params.openCodeLabRunCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`opencode-lab repeated-run count ${params.openCodeLabRunCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.openCodeLabCoverage !== null &&
    params.openCodeLabForkAgreement0to1 !== null &&
    params.openCodeLabForkAgreement0to1 < 0.9
  ) {
    warnings.push(`opencode-lab fork agreement ${params.openCodeLabForkAgreement0to1.toFixed(2)} below 0.9`);
  }
  if (
    params.openCodeLabCoverage !== null &&
    params.openCodeLabModelVariance0to1 !== null &&
    params.openCodeLabModelVariance0to1 > 0.1
  ) {
    warnings.push(`opencode-lab model variance ${params.openCodeLabModelVariance0to1.toFixed(2)} above 0.1`);
  }
  if (
    params.ccPluginEvalCoverage !== null &&
    params.ccPluginEvalCoverage < params.thresholds.minCcPluginEvalCoverage
  ) {
    warnings.push(`cc-plugin-eval coverage ${params.ccPluginEvalCoverage.toFixed(2)} below ${params.thresholds.minCcPluginEvalCoverage}; missing ${params.ccPluginEvalMissingSignals.join(", ")}`);
  }
  if (params.ccPluginEvalCoverage !== null && params.ccPluginEvalSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`cc-plugin-eval sample size ${params.ccPluginEvalSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.ccPluginEvalCoverage !== null &&
    params.ccPluginEvalTriggerAccuracy0to1 !== null &&
    params.ccPluginEvalTriggerAccuracy0to1 < params.thresholds.minCcPluginEvalTriggerAccuracy0to1
  ) {
    warnings.push(`cc-plugin-eval trigger accuracy ${params.ccPluginEvalTriggerAccuracy0to1.toFixed(2)} below ${params.thresholds.minCcPluginEvalTriggerAccuracy0to1}`);
  }
  if (
    params.ccPluginEvalCoverage !== null &&
    params.ccPluginEvalFalsePositiveRate0to1 !== null &&
    params.ccPluginEvalFalsePositiveRate0to1 > params.thresholds.maxCcPluginEvalFalsePositiveRate0to1
  ) {
    warnings.push(`cc-plugin-eval false-positive rate ${params.ccPluginEvalFalsePositiveRate0to1.toFixed(2)} above ${params.thresholds.maxCcPluginEvalFalsePositiveRate0to1}`);
  }
  if (
    params.ccPluginEvalCoverage !== null &&
    params.ccPluginEvalFalseNegativeRate0to1 !== null &&
    params.ccPluginEvalFalseNegativeRate0to1 > params.thresholds.maxCcPluginEvalFalseNegativeRate0to1
  ) {
    warnings.push(`cc-plugin-eval false-negative rate ${params.ccPluginEvalFalseNegativeRate0to1.toFixed(2)} above ${params.thresholds.maxCcPluginEvalFalseNegativeRate0to1}`);
  }
  if (
    params.ccPluginEvalCoverage !== null &&
    params.ccPluginEvalComponentCount !== null &&
    params.ccPluginEvalComponentCount < 3
  ) {
    warnings.push(`cc-plugin-eval component count ${params.ccPluginEvalComponentCount} below minimum 3`);
  }
  if (
    params.ccPluginEvalCoverage !== null &&
    params.ccPluginEvalScenarioCount !== null &&
    params.ccPluginEvalScenarioCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`cc-plugin-eval scenario count ${params.ccPluginEvalScenarioCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.realignSimulationCoverage !== null &&
    params.realignSimulationCoverage < params.thresholds.minRealignSimulationCoverage
  ) {
    warnings.push(`realign simulation coverage ${params.realignSimulationCoverage.toFixed(2)} below ${params.thresholds.minRealignSimulationCoverage}; missing ${params.realignSimulationMissingSignals.join(", ")}`);
  }
  if (params.realignSimulationCoverage !== null && params.realignSimulationSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`realign simulation sample size ${params.realignSimulationSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.realignSimulationCoverage !== null &&
    params.realignSimulationJudgeAgreement0to1 !== null &&
    params.realignSimulationJudgeAgreement0to1 < params.thresholds.minRealignSimulationJudgeAgreement0to1
  ) {
    warnings.push(`realign simulation judge agreement ${params.realignSimulationJudgeAgreement0to1.toFixed(2)} below ${params.thresholds.minRealignSimulationJudgeAgreement0to1}`);
  }
  if (
    params.realignSimulationCoverage !== null &&
    params.realignSimulationRegressionPassRate0to1 !== null &&
    params.realignSimulationRegressionPassRate0to1 < params.thresholds.minRealignSimulationRegressionPassRate0to1
  ) {
    warnings.push(`realign simulation regression pass rate ${params.realignSimulationRegressionPassRate0to1.toFixed(2)} below ${params.thresholds.minRealignSimulationRegressionPassRate0to1}`);
  }
  if (
    params.realignSimulationCoverage !== null &&
    params.realignSimulationScenarioCount !== null &&
    params.realignSimulationScenarioCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`realign simulation scenario count ${params.realignSimulationScenarioCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.realignSimulationCoverage !== null &&
    params.realignSimulationEvaluatorCount !== null &&
    params.realignSimulationEvaluatorCount < 2
  ) {
    warnings.push(`realign simulation evaluator count ${params.realignSimulationEvaluatorCount} below minimum 2`);
  }
  if (
    params.realignSimulationCoverage !== null &&
    params.realignSimulationRepeatCount !== null &&
    params.realignSimulationRepeatCount < 3
  ) {
    warnings.push(`realign simulation repeated-run count ${params.realignSimulationRepeatCount} below minimum 3`);
  }
  if (
    params.academiClawCoverage !== null &&
    params.academiClawCoverage < params.thresholds.minAcademiClawCoverage
  ) {
    warnings.push(`AcademiClaw coverage ${params.academiClawCoverage.toFixed(2)} below ${params.thresholds.minAcademiClawCoverage}; missing ${params.academiClawMissingSignals.join(", ")}`);
  }
  if (params.academiClawCoverage !== null && params.academiClawSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`AcademiClaw sample size ${params.academiClawSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.academiClawCoverage !== null &&
    params.academiClawTaskCount !== null &&
    params.academiClawTaskCount < params.thresholds.minAcademiClawTaskCount
  ) {
    warnings.push(`AcademiClaw task count ${params.academiClawTaskCount} below minimum ${params.thresholds.minAcademiClawTaskCount}`);
  }
  if (
    params.academiClawCoverage !== null &&
    params.academiClawLanguageCount !== null &&
    params.academiClawLanguageCount < params.thresholds.minAcademiClawLanguageCount
  ) {
    warnings.push(`AcademiClaw language count ${params.academiClawLanguageCount} below minimum ${params.thresholds.minAcademiClawLanguageCount}`);
  }
  if (
    params.academiClawCoverage !== null &&
    params.academiClawRubricCount !== null &&
    params.academiClawRubricCount < params.thresholds.minAcademiClawRubricCount
  ) {
    warnings.push(`AcademiClaw rubric count ${params.academiClawRubricCount} below minimum ${params.thresholds.minAcademiClawRubricCount}`);
  }
  if (
    params.academiClawCoverage !== null &&
    params.academiClawTraceCount !== null &&
    params.academiClawTraceCount < params.thresholds.minAcademiClawTraceCount
  ) {
    warnings.push(`AcademiClaw trace count ${params.academiClawTraceCount} below minimum ${params.thresholds.minAcademiClawTraceCount}`);
  }
  if (
    params.academiClawCoverage !== null &&
    params.academiClawMetaEvalCount !== null &&
    params.academiClawMetaEvalCount < params.thresholds.minAcademiClawMetaEvalCount
  ) {
    warnings.push(`AcademiClaw meta-eval count ${params.academiClawMetaEvalCount} below minimum ${params.thresholds.minAcademiClawMetaEvalCount}`);
  }
  if (
    params.academiClawCoverage !== null &&
    params.academiClawModelCount !== null &&
    params.academiClawModelCount < params.thresholds.minAcademiClawModelCount
  ) {
    warnings.push(`AcademiClaw model count ${params.academiClawModelCount} below minimum ${params.thresholds.minAcademiClawModelCount}`);
  }
  if (
    params.academiClawCoverage !== null &&
    params.academiClawRegressionPassRate0to1 !== null &&
    params.academiClawRegressionPassRate0to1 < params.thresholds.minAcademiClawRegressionPassRate0to1
  ) {
    warnings.push(`AcademiClaw regression pass rate ${params.academiClawRegressionPassRate0to1.toFixed(2)} below ${params.thresholds.minAcademiClawRegressionPassRate0to1}`);
  }
  if (
    params.ragChunkingTechniqueCoverage !== null &&
    params.ragChunkingTechniqueCoverage < params.thresholds.minRagChunkingTechniqueCoverage
  ) {
    warnings.push(`RAG chunking technique coverage ${params.ragChunkingTechniqueCoverage.toFixed(2)} below ${params.thresholds.minRagChunkingTechniqueCoverage}; missing ${params.ragChunkingTechniqueMissingSignals.join(", ")}`);
  }
  if (params.ragChunkingTechniqueCoverage !== null && params.ragChunkingTechniqueSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`RAG chunking technique sample size ${params.ragChunkingTechniqueSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.ragChunkingTechniqueCoverage !== null &&
    params.ragChunkingTechniquePolicyDocumentCount !== null &&
    params.ragChunkingTechniquePolicyDocumentCount < params.thresholds.minRagChunkingTechniquePolicyDocumentCount
  ) {
    warnings.push(`RAG chunking technique policy document count ${params.ragChunkingTechniquePolicyDocumentCount} below minimum ${params.thresholds.minRagChunkingTechniquePolicyDocumentCount}`);
  }
  if (
    params.ragChunkingTechniqueCoverage !== null &&
    params.ragChunkingTechniqueNotebookCount !== null &&
    params.ragChunkingTechniqueNotebookCount < params.thresholds.minRagChunkingTechniqueNotebookCount
  ) {
    warnings.push(`RAG chunking technique notebook count ${params.ragChunkingTechniqueNotebookCount} below minimum ${params.thresholds.minRagChunkingTechniqueNotebookCount}`);
  }
  if (
    params.ragChunkingTechniqueCoverage !== null &&
    params.ragChunkingTechniqueChunkingStrategyCount !== null &&
    params.ragChunkingTechniqueChunkingStrategyCount < params.thresholds.minRagChunkingTechniqueChunkingStrategyCount
  ) {
    warnings.push(`RAG chunking technique strategy count ${params.ragChunkingTechniqueChunkingStrategyCount} below minimum ${params.thresholds.minRagChunkingTechniqueChunkingStrategyCount}`);
  }
  if (
    params.ragChunkingTechniqueCoverage !== null &&
    params.ragChunkingTechniqueEvaluationQuestionCount !== null &&
    params.ragChunkingTechniqueEvaluationQuestionCount < params.thresholds.minRagChunkingTechniqueEvaluationQuestionCount
  ) {
    warnings.push(`RAG chunking technique evaluation question count ${params.ragChunkingTechniqueEvaluationQuestionCount} below minimum ${params.thresholds.minRagChunkingTechniqueEvaluationQuestionCount}`);
  }
  if (
    params.ragChunkingTechniqueCoverage !== null &&
    params.ragChunkingTechniqueMetricCount !== null &&
    params.ragChunkingTechniqueMetricCount < params.thresholds.minRagChunkingTechniqueMetricCount
  ) {
    warnings.push(`RAG chunking technique metric count ${params.ragChunkingTechniqueMetricCount} below minimum ${params.thresholds.minRagChunkingTechniqueMetricCount}`);
  }
  if (
    params.ragChunkingTechniqueCoverage !== null &&
    params.ragChunkingTechniqueRegressionPassRate0to1 !== null &&
    params.ragChunkingTechniqueRegressionPassRate0to1 < params.thresholds.minRagChunkingTechniqueRegressionPassRate0to1
  ) {
    warnings.push(`RAG chunking technique regression pass rate ${params.ragChunkingTechniqueRegressionPassRate0to1.toFixed(2)} below ${params.thresholds.minRagChunkingTechniqueRegressionPassRate0to1}`);
  }
  if (
    params.kubernetesOperationalAgentCoverage !== null &&
    params.kubernetesOperationalAgentCoverage < params.thresholds.minKubernetesOperationalAgentCoverage
  ) {
    warnings.push(`Kubernetes operational-agent coverage ${params.kubernetesOperationalAgentCoverage.toFixed(2)} below ${params.thresholds.minKubernetesOperationalAgentCoverage}; missing ${params.kubernetesOperationalAgentMissingSignals.join(", ")}`);
  }
  if (
    params.kubernetesOperationalAgentCoverage !== null &&
    params.kubernetesOperationalAgentSampleSize < params.thresholds.minSampleSize
  ) {
    warnings.push(`Kubernetes operational-agent sample size ${params.kubernetesOperationalAgentSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.kubernetesOperationalAgentCoverage !== null &&
    params.kubernetesOperationalAgentToolCategoryCount !== null &&
    params.kubernetesOperationalAgentToolCategoryCount < params.thresholds.minKubernetesOperationalAgentToolCategoryCount
  ) {
    warnings.push(`Kubernetes operational-agent tool category count ${params.kubernetesOperationalAgentToolCategoryCount} below minimum ${params.thresholds.minKubernetesOperationalAgentToolCategoryCount}`);
  }
  if (
    params.kubernetesOperationalAgentCoverage !== null &&
    params.kubernetesOperationalAgentDiagnosticCapabilityCount !== null &&
    params.kubernetesOperationalAgentDiagnosticCapabilityCount < params.thresholds.minKubernetesOperationalAgentDiagnosticCapabilityCount
  ) {
    warnings.push(`Kubernetes operational-agent diagnostic capability count ${params.kubernetesOperationalAgentDiagnosticCapabilityCount} below minimum ${params.thresholds.minKubernetesOperationalAgentDiagnosticCapabilityCount}`);
  }
  if (
    params.kubernetesOperationalAgentCoverage !== null &&
    params.kubernetesOperationalAgentResourceMetricCount !== null &&
    params.kubernetesOperationalAgentResourceMetricCount < params.thresholds.minKubernetesOperationalAgentResourceMetricCount
  ) {
    warnings.push(`Kubernetes operational-agent resource metric count ${params.kubernetesOperationalAgentResourceMetricCount} below minimum ${params.thresholds.minKubernetesOperationalAgentResourceMetricCount}`);
  }
  if (
    params.kubernetesOperationalAgentCoverage !== null &&
    params.kubernetesOperationalAgentLogAnalysisCount !== null &&
    params.kubernetesOperationalAgentLogAnalysisCount < params.thresholds.minKubernetesOperationalAgentLogAnalysisCount
  ) {
    warnings.push(`Kubernetes operational-agent log analysis count ${params.kubernetesOperationalAgentLogAnalysisCount} below minimum ${params.thresholds.minKubernetesOperationalAgentLogAnalysisCount}`);
  }
  if (
    params.kubernetesOperationalAgentCoverage !== null &&
    params.kubernetesOperationalAgentRegressionPassRate0to1 !== null &&
    params.kubernetesOperationalAgentRegressionPassRate0to1 < params.thresholds.minKubernetesOperationalAgentRegressionPassRate0to1
  ) {
    warnings.push(`Kubernetes operational-agent regression pass rate ${params.kubernetesOperationalAgentRegressionPassRate0to1.toFixed(2)} below ${params.thresholds.minKubernetesOperationalAgentRegressionPassRate0to1}`);
  }
  if (
    params.secureVibeBenchCoverage !== null &&
    params.secureVibeBenchCoverage < params.thresholds.minSecureVibeBenchCoverage
  ) {
    warnings.push(`SecureVibeBench coverage ${params.secureVibeBenchCoverage.toFixed(2)} below ${params.thresholds.minSecureVibeBenchCoverage}; missing ${params.secureVibeBenchMissingSignals.join(", ")}`);
  }
  if (params.secureVibeBenchCoverage !== null && params.secureVibeBenchSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`SecureVibeBench sample size ${params.secureVibeBenchSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.secureVibeBenchCoverage !== null &&
    params.secureVibeBenchAgentAdapterCount !== null &&
    params.secureVibeBenchAgentAdapterCount < params.thresholds.minSecureVibeBenchAgentAdapterCount
  ) {
    warnings.push(`SecureVibeBench agent adapter count ${params.secureVibeBenchAgentAdapterCount} below minimum ${params.thresholds.minSecureVibeBenchAgentAdapterCount}`);
  }
  if (
    params.secureVibeBenchCoverage !== null &&
    params.secureVibeBenchScenarioCount !== null &&
    params.secureVibeBenchScenarioCount < params.thresholds.minSecureVibeBenchScenarioCount
  ) {
    warnings.push(`SecureVibeBench vulnerability scenario count ${params.secureVibeBenchScenarioCount} below minimum ${params.thresholds.minSecureVibeBenchScenarioCount}`);
  }
  if (
    params.secureVibeBenchCoverage !== null &&
    params.secureVibeBenchTestScriptCount !== null &&
    params.secureVibeBenchTestScriptCount < params.thresholds.minSecureVibeBenchTestScriptCount
  ) {
    warnings.push(`SecureVibeBench test script count ${params.secureVibeBenchTestScriptCount} below minimum ${params.thresholds.minSecureVibeBenchTestScriptCount}`);
  }
  if (
    params.secureVibeBenchCoverage !== null &&
    params.secureVibeBenchRegressionPassRate0to1 !== null &&
    params.secureVibeBenchRegressionPassRate0to1 < params.thresholds.minSecureVibeBenchRegressionPassRate0to1
  ) {
    warnings.push(`SecureVibeBench regression pass rate ${params.secureVibeBenchRegressionPassRate0to1.toFixed(2)} below ${params.thresholds.minSecureVibeBenchRegressionPassRate0to1}`);
  }
  if (
    params.ravigBenchCoverage !== null &&
    params.ravigBenchCoverage < params.thresholds.minRavigBenchCoverage
  ) {
    warnings.push(`RAViG-Bench coverage ${params.ravigBenchCoverage.toFixed(2)} below ${params.thresholds.minRavigBenchCoverage}; missing ${params.ravigBenchMissingSignals.join(", ")}`);
  }
  if (params.ravigBenchCoverage !== null && params.ravigBenchSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`RAViG-Bench sample size ${params.ravigBenchSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.ravigBenchCoverage !== null &&
    params.ravigBenchDatasetCaseCount !== null &&
    params.ravigBenchDatasetCaseCount < params.thresholds.minRavigBenchDatasetCaseCount
  ) {
    warnings.push(`RAViG-Bench dataset case count ${params.ravigBenchDatasetCaseCount} below minimum ${params.thresholds.minRavigBenchDatasetCaseCount}`);
  }
  if (
    params.ravigBenchCoverage !== null &&
    params.ravigBenchVisualDesignCheckCount !== null &&
    params.ravigBenchVisualDesignCheckCount < params.thresholds.minRavigBenchVisualDesignCheckCount
  ) {
    warnings.push(`RAViG-Bench visual-design check count ${params.ravigBenchVisualDesignCheckCount} below minimum ${params.thresholds.minRavigBenchVisualDesignCheckCount}`);
  }
  if (
    params.ravigBenchCoverage !== null &&
    params.ravigBenchEvaluatorCount !== null &&
    params.ravigBenchEvaluatorCount < params.thresholds.minRavigBenchEvaluatorCount
  ) {
    warnings.push(`RAViG-Bench evaluator count ${params.ravigBenchEvaluatorCount} below minimum ${params.thresholds.minRavigBenchEvaluatorCount}`);
  }
  if (
    params.ravigBenchCoverage !== null &&
    params.ravigBenchValidationPassRate0to1 !== null &&
    params.ravigBenchValidationPassRate0to1 < params.thresholds.minRavigBenchValidationPassRate0to1
  ) {
    warnings.push(`RAViG-Bench validation pass rate ${params.ravigBenchValidationPassRate0to1.toFixed(2)} below ${params.thresholds.minRavigBenchValidationPassRate0to1}`);
  }
  if (
    params.humanStudyBenchCoverage !== null &&
    params.humanStudyBenchCoverage < params.thresholds.minHumanStudyBenchCoverage
  ) {
    warnings.push(`humanstudy-bench coverage ${params.humanStudyBenchCoverage.toFixed(2)} below ${params.thresholds.minHumanStudyBenchCoverage}; missing ${params.humanStudyBenchMissingSignals.join(", ")}`);
  }
  if (params.humanStudyBenchCoverage !== null && params.humanStudyBenchSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`humanstudy-bench sample size ${params.humanStudyBenchSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.humanStudyBenchCoverage !== null &&
    params.humanStudyBenchStudyCount !== null &&
    params.humanStudyBenchStudyCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`humanstudy-bench study count ${params.humanStudyBenchStudyCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.humanStudyBenchCoverage !== null &&
    params.humanStudyBenchParticipantCount !== null &&
    params.humanStudyBenchParticipantCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`humanstudy-bench participant count ${params.humanStudyBenchParticipantCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.humanStudyBenchCoverage !== null &&
    params.humanStudyBenchResponseCount !== null &&
    params.humanStudyBenchResponseCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`humanstudy-bench response count ${params.humanStudyBenchResponseCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.humanStudyBenchCoverage !== null &&
    params.humanStudyBenchEvaluatorCount !== null &&
    params.humanStudyBenchEvaluatorCount < 2
  ) {
    warnings.push(`humanstudy-bench evaluator count ${params.humanStudyBenchEvaluatorCount} below minimum 2`);
  }
  if (
    params.humanStudyBenchCoverage !== null &&
    params.humanStudyBenchInterRaterAgreement0to1 !== null &&
    params.humanStudyBenchInterRaterAgreement0to1 < params.thresholds.minHumanStudyBenchInterRaterAgreement0to1
  ) {
    warnings.push(`humanstudy-bench inter-rater agreement ${params.humanStudyBenchInterRaterAgreement0to1.toFixed(2)} below ${params.thresholds.minHumanStudyBenchInterRaterAgreement0to1}`);
  }
  if (
    params.humanStudyBenchCoverage !== null &&
    params.humanStudyBenchTestRetestReliability0to1 !== null &&
    params.humanStudyBenchTestRetestReliability0to1 < params.thresholds.minHumanStudyBenchTestRetestReliability0to1
  ) {
    warnings.push(`humanstudy-bench test-retest reliability ${params.humanStudyBenchTestRetestReliability0to1.toFixed(2)} below ${params.thresholds.minHumanStudyBenchTestRetestReliability0to1}`);
  }
  if (
    params.humanStudyBenchCoverage !== null &&
    params.humanStudyBenchValidationPassRate0to1 !== null &&
    params.humanStudyBenchValidationPassRate0to1 < params.thresholds.minHumanStudyBenchValidationPassRate0to1
  ) {
    warnings.push(`humanstudy-bench validation pass rate ${params.humanStudyBenchValidationPassRate0to1.toFixed(2)} below ${params.thresholds.minHumanStudyBenchValidationPassRate0to1}`);
  }
  if (
    params.legacyBenchCoverage !== null &&
    params.legacyBenchCoverage < params.thresholds.minLegacyBenchCoverage
  ) {
    warnings.push(`Legacy-Bench coverage ${params.legacyBenchCoverage.toFixed(2)} below ${params.thresholds.minLegacyBenchCoverage}; missing ${params.legacyBenchMissingSignals.join(", ")}`);
  }
  if (params.legacyBenchCoverage !== null && params.legacyBenchSampleSize < params.thresholds.minSampleSize) {
    warnings.push(`Legacy-Bench sample size ${params.legacyBenchSampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.legacyBenchCoverage !== null &&
    params.legacyBenchTaskCount !== null &&
    params.legacyBenchTaskCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`Legacy-Bench task count ${params.legacyBenchTaskCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.legacyBenchCoverage !== null &&
    params.legacyBenchLanguageCount !== null &&
    params.legacyBenchLanguageCount < params.thresholds.minLegacyBenchLanguageCount
  ) {
    warnings.push(`Legacy-Bench language count ${params.legacyBenchLanguageCount} below minimum ${params.thresholds.minLegacyBenchLanguageCount}`);
  }
  if (
    params.legacyBenchCoverage !== null &&
    params.legacyBenchEnvironmentCount !== null &&
    params.legacyBenchEnvironmentCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`Legacy-Bench environment count ${params.legacyBenchEnvironmentCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.legacyBenchCoverage !== null &&
    params.legacyBenchTestOracleCount !== null &&
    params.legacyBenchTestOracleCount < params.thresholds.minSampleSize
  ) {
    warnings.push(`Legacy-Bench test-oracle count ${params.legacyBenchTestOracleCount} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.legacyBenchCoverage !== null &&
    params.legacyBenchEvaluatorCount !== null &&
    params.legacyBenchEvaluatorCount < 1
  ) {
    warnings.push(`Legacy-Bench evaluator count ${params.legacyBenchEvaluatorCount} below minimum 1`);
  }
  if (
    params.legacyBenchCoverage !== null &&
    params.legacyBenchRegressionPassRate0to1 !== null &&
    params.legacyBenchRegressionPassRate0to1 < params.thresholds.minLegacyBenchRegressionPassRate0to1
  ) {
    warnings.push(`Legacy-Bench regression pass rate ${params.legacyBenchRegressionPassRate0to1.toFixed(2)} below ${params.thresholds.minLegacyBenchRegressionPassRate0to1}`);
  }
  if (
    params.legacyBenchCoverage !== null &&
    params.legacyBenchReplayPassRate0to1 !== null &&
    params.legacyBenchReplayPassRate0to1 < params.thresholds.minLegacyBenchReplayPassRate0to1
  ) {
    warnings.push(`Legacy-Bench replay pass rate ${params.legacyBenchReplayPassRate0to1.toFixed(2)} below ${params.thresholds.minLegacyBenchReplayPassRate0to1}`);
  }
  if (
    params.subtleMemoryCoverage !== null &&
    params.subtleMemoryCoverage < params.thresholds.minSubtleMemoryCoverage
  ) {
    warnings.push(`SubtleMemory coverage ${params.subtleMemoryCoverage.toFixed(2)} below ${params.thresholds.minSubtleMemoryCoverage}; missing ${params.subtleMemoryMissingSignals.join(", ")}`);
  }
  if (params.subtleMemoryCoverage !== null && params.subtleMemorySampleSize < params.thresholds.minSampleSize) {
    warnings.push(`SubtleMemory sample size ${params.subtleMemorySampleSize} below minimum ${params.thresholds.minSampleSize}`);
  }
  if (
    params.subtleMemoryCoverage !== null &&
    params.subtleMemoryPersonaCount !== null &&
    params.subtleMemoryPersonaCount < params.thresholds.minSubtleMemoryPersonaCount
  ) {
    warnings.push(`SubtleMemory persona count ${params.subtleMemoryPersonaCount} below minimum ${params.thresholds.minSubtleMemoryPersonaCount}`);
  }
  if (
    params.subtleMemoryCoverage !== null &&
    params.subtleMemoryBenchInstanceCount !== null &&
    params.subtleMemoryBenchInstanceCount < params.thresholds.minSubtleMemoryBenchInstanceCount
  ) {
    warnings.push(`SubtleMemory bench-instance count ${params.subtleMemoryBenchInstanceCount} below minimum ${params.thresholds.minSubtleMemoryBenchInstanceCount}`);
  }
  if (
    params.subtleMemoryCoverage !== null &&
    params.subtleMemoryHistoryCount !== null &&
    params.subtleMemoryHistoryCount < params.thresholds.minSubtleMemoryPersonaCount
  ) {
    warnings.push(`SubtleMemory history-session count ${params.subtleMemoryHistoryCount} below minimum ${params.thresholds.minSubtleMemoryPersonaCount}`);
  }
  if (
    params.subtleMemoryCoverage !== null &&
    params.subtleMemoryMemoryVariantSetCount !== null &&
    params.subtleMemoryMemoryVariantSetCount < params.thresholds.minSubtleMemoryMemoryVariantSetCount
  ) {
    warnings.push(`SubtleMemory memory-variant set count ${params.subtleMemoryMemoryVariantSetCount} below minimum ${params.thresholds.minSubtleMemoryMemoryVariantSetCount}`);
  }
  if (
    params.subtleMemoryCoverage !== null &&
    params.subtleMemoryRelationTypeCount !== null &&
    params.subtleMemoryRelationTypeCount < params.thresholds.minSubtleMemoryRelationTypeCount
  ) {
    warnings.push(`SubtleMemory relation type count ${params.subtleMemoryRelationTypeCount} below minimum ${params.thresholds.minSubtleMemoryRelationTypeCount}`);
  }
  if (
    params.subtleMemoryCoverage !== null &&
    params.subtleMemoryEvaluationStageCount !== null &&
    params.subtleMemoryEvaluationStageCount < params.thresholds.minSubtleMemoryEvaluationStageCount
  ) {
    warnings.push(`SubtleMemory evaluation-stage count ${params.subtleMemoryEvaluationStageCount} below minimum ${params.thresholds.minSubtleMemoryEvaluationStageCount}`);
  }
  if (
    params.subtleMemoryCoverage !== null &&
    params.subtleMemoryAdapterCount !== null &&
    params.subtleMemoryAdapterCount < params.thresholds.minSubtleMemoryAdapterCount
  ) {
    warnings.push(`SubtleMemory adapter count ${params.subtleMemoryAdapterCount} below minimum ${params.thresholds.minSubtleMemoryAdapterCount}`);
  }
  if (
    params.subtleMemoryCoverage !== null &&
    params.subtleMemoryJudgeAgreement0to1 !== null &&
    params.subtleMemoryJudgeAgreement0to1 < params.thresholds.minSubtleMemoryJudgeAgreement0to1
  ) {
    warnings.push(`SubtleMemory judge agreement ${params.subtleMemoryJudgeAgreement0to1.toFixed(2)} below ${params.thresholds.minSubtleMemoryJudgeAgreement0to1}`);
  }
  if (
    params.subtleMemoryCoverage !== null &&
    params.subtleMemoryValidationPassRate0to1 !== null &&
    params.subtleMemoryValidationPassRate0to1 < params.thresholds.minSubtleMemoryValidationPassRate0to1
  ) {
    warnings.push(`SubtleMemory validation pass rate ${params.subtleMemoryValidationPassRate0to1.toFixed(2)} below ${params.thresholds.minSubtleMemoryValidationPassRate0to1}`);
  }
  if (params.testRetestStability === null) {
    warnings.push("test-retest stability requires at least 3 comparable runs");
  } else if (params.testRetestStability < 0.65) {
    warnings.push(`test-retest stability ${params.testRetestStability.toFixed(2)} is low`);
  }
  if (params.interRaterAgreement === null) {
    warnings.push("inter-rater agreement unavailable; add evaluator or judge agreement evidence");
  }
  return warnings;
}

function stabilityForMetric(params: {
  current: ScoreObservation;
  previous: ScoreObservation[];
}): number | null {
  const observations = [...params.previous, params.current].sort((a, b) => {
    const left = typeof a.timestamp === "number" ? a.timestamp : new Date(a.timestamp).getTime();
    const right = typeof b.timestamp === "number" ? b.timestamp : new Date(b.timestamp).getTime();
    return left - right;
  });
  if (observations.length < 3) return null;
  return computeScoreStability(observations).stabilityIndex;
}

function buildRow(params: {
  metricId: string;
  owner: string;
  agentId: string;
  timestamp: number;
  values: number[];
  questionScores: QuestionScore[];
  constructValidity: number;
  interRaterAgreement: number | null;
  counterfactualResponsiveness: number | null;
  counterfactualSampleSize: number;
  counterfactualEvidenceRefs: string[];
  validationFacetCoverage: number | null;
  validationFacetSampleSize: number;
  validationFacetEvidenceRefs: string[];
  confounderControlCoverage: number | null;
  confounderControlSampleSize: number;
  confounderControlEvidenceRefs: string[];
  outcomeAlignment: number | null;
  outcomeAlignmentSampleSize: number;
  outcomeAlignmentEvidenceRefs: string[];
  processEvidenceCoverage: number | null;
  processEvidenceSampleSize: number;
  processEvidenceRefs: string[];
  safetyUtilityCoverage: number | null;
  safetyUtilitySampleSize: number;
  safetyUtilityEvidenceRefs: string[];
  modalityTransformationCoverage: number | null;
  modalityTransformationSampleSize: number;
  modalityTransformationEvidenceRefs: string[];
  lifecycleObservabilityCoverage: number | null;
  lifecycleObservabilitySampleSize: number;
  lifecycleObservabilityEvidenceRefs: string[];
  rankingStabilityCoverage: number | null;
  rankingStabilitySampleSize: number;
  rankingStabilityEvidenceRefs: string[];
  toolSandboxCoverage: number | null;
  toolSandboxSampleSize: number;
  toolSandboxEvidenceRefs: string[];
  continualLearningCoverage: number | null;
  continualLearningSampleSize: number;
  continualLearningEvidenceRefs: string[];
  continualLearningRunCount: number | null;
  continualLearningMissingSignals: MetricValidationContinualLearningSignal[];
  continualLearningMemoryArtifactHashes: string[];
  continualLearningRunSummaryArtifactHashes: string[];
  continualLearningGameplayLogArtifactHashes: string[];
  continualLearningMetricNames: string[];
  strategicInteractionCoverage: number | null;
  strategicInteractionSampleSize: number;
  strategicInteractionEvidenceRefs: string[];
  architectureRealityCoverage: number | null;
  architectureRealitySampleSize: number;
  architectureRealityEvidenceRefs: string[];
  architectureRealityStressScenarioCount: number | null;
  architectureRealityNetworkScenarioCount: number | null;
  architectureRealityEnsemblePatternCount: number | null;
  architectureRealityMissingSignals: MetricValidationArchitectureRealitySignal[];
  ragPipelineCoverage: number | null;
  ragPipelineSampleSize: number;
  ragPipelineEvidenceRefs: string[];
  ragEvaluationPipelineCoverage: number | null;
  ragEvaluationPipelineSampleSize: number;
  ragEvaluationPipelineEvidenceRefs: string[];
  ragEvaluationPipelineCaseSampleSizeMin: number | null;
  ragEvaluationPipelineMissingSignals: MetricValidationRagEvaluationPipelineSignal[];
  ragEvaluationPipelineMetricOwners: string[];
  ragEvaluationPipelineReportArtifactHashes: string[];
  ragasNotebookCoverage: number | null;
  ragasNotebookSampleSize: number;
  ragasNotebookEvidenceRefs: string[];
  ragasNotebookMissingSignals: MetricValidationRagasNotebookSignal[];
  ragasNotebookMetricNames: string[];
  ragasNotebookQuestionCount: number | null;
  ragasNotebookReportArtifactHashes: string[];
  mirageRagMetricCoverage: number | null;
  mirageRagMetricSampleSize: number;
  mirageRagMetricEvidenceRefs: string[];
  mirageRagMetricMissingSignals: MetricValidationMirageRagSignal[];
  mirageRagMetricDatasetIds: string[];
  mirageRagMetricEvaluationModes: Array<"base" | "oracle" | "mixed" | "custom">;
  mirageRagMetricRetrieverIds: string[];
  mirageRagMetricModelIds: string[];
  mirageRagMetricNames: string[];
  mirageRagMetricQaPairCount: number | null;
  mirageRagMetricContextPoolCount: number | null;
  mirageRagMetricReportArtifactHashes: string[];
  legalCodeRagCoverage: number | null;
  legalCodeRagSampleSize: number;
  legalCodeRagEvidenceRefs: string[];
  legalCodeRagMissingSignals: MetricValidationLegalCodeRagSignal[];
  legalCodeRagLegalCodeIds: string[];
  legalCodeRagJurisdictionIds: string[];
  legalCodeRagRetrievalTechniqueIds: string[];
  legalCodeRagVectorStoreIds: string[];
  legalCodeRagEmbeddingModelIds: string[];
  legalCodeRagEvaluationDatasetIds: string[];
  legalCodeRagMetricNames: string[];
  legalCodeRagQuestionCount: number | null;
  legalCodeRagMetricOwners: string[];
  legalCodeRagReportArtifactHashes: string[];
  guardbenchMetricCoverage: number | null;
  guardbenchMetricSampleSize: number;
  guardbenchMetricEvidenceRefs: string[];
  guardbenchMetricMissingSignals: MetricValidationGuardbenchSignal[];
  guardbenchDatasetIds: string[];
  guardbenchLanguageIds: string[];
  guardbenchModelIds: string[];
  guardbenchThresholdIds: string[];
  guardbenchMetricNames: string[];
  guardbenchExportFormats: string[];
  guardbenchReportArtifactHashes: string[];
  businessWorkflowCoverage: number | null;
  businessWorkflowSampleSize: number;
  businessWorkflowEvidenceRefs: string[];
  dataAgentAnalyticalCoverage: number | null;
  dataAgentAnalyticalSampleSize: number;
  dataAgentAnalyticalEvidenceRefs: string[];
  embodiedAgentCoverage: number | null;
  embodiedAgentSampleSize: number;
  embodiedAgentEvidenceRefs: string[];
  embodiedAgentMissingSignals: MetricValidationEmbodiedAgentSignal[];
  embodiedAgentTaskTypes: string[];
  embodiedAgentBaselineIds: string[];
  embodiedAgentReportArtifactHashes: string[];
  evaluatorSuiteCoverage: number | null;
  evaluatorSuiteSampleSize: number;
  evaluatorSuiteEvidenceRefs: string[];
  evaluatorSuiteMissingSignals: MetricValidationEvaluatorSuiteSignal[];
  evaluatorSuiteAssertionTypes: string[];
  evaluatorSuiteReporterFormats: string[];
  evaluatorSuiteJudgeNames: string[];
  evaluatorSuiteReportArtifactHashes: string[];
  pentestBenchmarkCoverage: number | null;
  pentestBenchmarkSampleSize: number;
  pentestBenchmarkEvidenceRefs: string[];
  pentestBenchmarkMissingSignals: MetricValidationPentestBenchmarkSignal[];
  pentestBenchmarkLanguageStacks: string[];
  pentestBenchmarkVulnerabilityClasses: string[];
  pentestBenchmarkDifficultyLevels: string[];
  pentestBenchmarkSuiteIds: string[];
  pentestBenchmarkMetricNames: string[];
  pentestBenchmarkReportArtifactHashes: string[];
  traceEvaluationCoverage: number | null;
  traceEvaluationSampleSize: number;
  traceEvaluationEvidenceRefs: string[];
  traceEvaluationMissingSignals: MetricValidationTraceEvaluationSignal[];
  traceEvaluationModelIds: string[];
  traceEvaluationAgentParameterKeys: string[];
  traceEvaluationToolNames: string[];
  traceEvaluationMetricNames: string[];
  traceEvaluationCaseSuiteIds: string[];
  traceEvaluationBackendModes: string[];
  traceEvaluationRunPermutationCount: number | null;
  traceEvaluationReportArtifactHashes: string[];
  livingEnvironmentCoverage: number | null;
  livingEnvironmentSampleSize: number;
  livingEnvironmentEvidenceRefs: string[];
  livingEnvironmentMissingSignals: MetricValidationLivingEnvironmentSignal[];
  livingEnvironmentCapabilityNames: string[];
  livingEnvironmentSandboxProviders: string[];
  livingEnvironmentAgentAdapters: string[];
  livingEnvironmentMetricNames: string[];
  livingEnvironmentTrialCount: number | null;
  livingEnvironmentReportArtifactHashes: string[];
  mobileAgentCoverage: number | null;
  mobileAgentSampleSize: number;
  mobileAgentEvidenceRefs: string[];
  mobileAgentMissingSignals: MetricValidationMobileAgentSignal[];
  mobileAgentBenchmarkIds: string[];
  mobileAgentEnvironmentIds: string[];
  mobileAgentAppIds: string[];
  mobileAgentApiCatalogIds: string[];
  mobileAgentUiTraceIds: string[];
  mobileAgentTaskSetIds: string[];
  mobileAgentTaskComplexityGroups: string[];
  mobileAgentCheckpointMetricNames: string[];
  mobileAgentLicenseBoundaryRefs: string[];
  mobileAgentTrialCount: number | null;
  mobileAgentReportArtifactHashes: string[];
  personaAgentCoverage: number | null;
  personaAgentSampleSize: number;
  personaAgentEvidenceRefs: string[];
  personaAgentMissingSignals: MetricValidationPersonaAgentSignal[];
  personaAgentPersonaIds: string[];
  personaAgentEnvironmentIds: string[];
  personaAgentQuestionSetIds: string[];
  personaAgentModelIds: string[];
  personaAgentProviderIds: string[];
  personaAgentMetricNames: string[];
  personaAgentQuestionCount: number | null;
  personaAgentReportArtifactHashes: string[];
  scientificLiteratureCoverage: number | null;
  scientificLiteratureSampleSize: number;
  scientificLiteratureEvidenceRefs: string[];
  scientificLiteratureMissingSignals: MetricValidationScientificLiteratureSignal[];
  scientificLiteratureBenchmarkIds: string[];
  scientificLiteratureTaskTypes: string[];
  scientificLiteratureDatasetIds: string[];
  scientificLiteratureSearchBackendIds: string[];
  scientificLiteratureToolIds: string[];
  scientificLiteratureMetricNames: string[];
  scientificLiteratureTaskCount: number | null;
  scientificLiteratureReportArtifactHashes: string[];
  bioinformaticsAgentCoverage: number | null;
  bioinformaticsAgentSampleSize: number;
  bioinformaticsAgentEvidenceRefs: string[];
  bioinformaticsAgentMissingSignals: MetricValidationBioinformaticsAgentSignal[];
  bioinformaticsAgentBenchmarkIds: string[];
  bioinformaticsAgentTaskTypes: string[];
  bioinformaticsAgentDatasetIds: string[];
  bioinformaticsAgentWorkflowIds: string[];
  bioinformaticsAgentToolNames: string[];
  bioinformaticsAgentMetricNames: string[];
  bioinformaticsAgentPerturbationIds: string[];
  bioinformaticsAgentPrivacyBoundaryRefs: string[];
  bioinformaticsAgentTaskCount: number | null;
  bioinformaticsAgentReportArtifactHashes: string[];
  mirageDrugRepositioningCoverage: number | null;
  mirageDrugRepositioningSampleSize: number;
  mirageDrugRepositioningEvidenceRefs: string[];
  mirageDrugRepositioningMissingSignals: MetricValidationMirageDrugRepositioningSignal[];
  mirageDrugRepositioningBenchmarkIds: string[];
  mirageDrugRepositioningDatasetIds: string[];
  mirageDrugRepositioningSplitIds: string[];
  mirageDrugRepositioningMappingIds: string[];
  mirageDrugRepositioningFeatureSetIds: string[];
  mirageDrugRepositioningSimilarityMatrixIds: string[];
  mirageDrugRepositioningNegativeSamplingIds: string[];
  mirageDrugRepositioningClassifierConfigIds: string[];
  mirageDrugRepositioningFeatureSelectionReportIds: string[];
  mirageDrugRepositioningScoreCalculationIds: string[];
  mirageDrugRepositioningCaseStudyIds: string[];
  mirageDrugRepositioningMetricNames: string[];
  mirageDrugRepositioningDrugCount: number | null;
  mirageDrugRepositioningDiseaseCount: number | null;
  mirageDrugRepositioningMappingCount: number | null;
  mirageDrugRepositioningFeatureSetCount: number | null;
  mirageDrugRepositioningSimilarityMatrixCount: number | null;
  mirageDrugRepositioningReportArtifactHashes: string[];
  networkTroubleshootingCoverage: number | null;
  networkTroubleshootingSampleSize: number;
  networkTroubleshootingEvidenceRefs: string[];
  networkTroubleshootingMissingSignals: MetricValidationNetworkTroubleshootingSignal[];
  networkTroubleshootingBenchmarkIds: string[];
  networkTroubleshootingScenarioIds: string[];
  networkTroubleshootingTopologyTiers: string[];
  networkTroubleshootingIssueTypes: string[];
  networkTroubleshootingAgentIds: string[];
  networkTroubleshootingToolNames: string[];
  networkTroubleshootingMetricNames: string[];
  networkTroubleshootingIncidentCount: number | null;
  networkTroubleshootingReportArtifactHashes: string[];
  inferenceOptimizationCoverage: number | null;
  inferenceOptimizationSampleSize: number;
  inferenceOptimizationEvidenceRefs: string[];
  inferenceOptimizationMissingSignals: MetricValidationInferenceOptimizationSignal[];
  inferenceOptimizationBenchmarkIds: string[];
  inferenceOptimizationScenarioIds: string[];
  inferenceOptimizationHardwareProfileIds: string[];
  inferenceOptimizationBackendIds: string[];
  inferenceOptimizationSearchSpaceIds: string[];
  inferenceOptimizationGateIds: string[];
  inferenceOptimizationAgentIds: string[];
  inferenceOptimizationMetricNames: string[];
  inferenceOptimizationRunCount: number | null;
  inferenceOptimizationReportArtifactHashes: string[];
  javaCodingAgentCoverage: number | null;
  javaCodingAgentSampleSize: number;
  javaCodingAgentEvidenceRefs: string[];
  javaCodingAgentMissingSignals: MetricValidationJavaCodingAgentSignal[];
  javaCodingAgentBenchmarkIds: string[];
  javaCodingAgentTaskIds: string[];
  javaCodingAgentTaskTypes: string[];
  javaCodingAgentJavaProjectIds: string[];
  javaCodingAgentSandboxIds: string[];
  javaCodingAgentAgentConfigIds: string[];
  javaCodingAgentJudgeTierIds: string[];
  javaCodingAgentCheckTypes: string[];
  javaCodingAgentMetricNames: string[];
  javaCodingAgentTrialCount: number | null;
  javaCodingAgentReportArtifactHashes: string[];
  webEvalDatasetCoverage: number | null;
  webEvalDatasetSampleSize: number;
  webEvalDatasetEvidenceRefs: string[];
  webEvalDatasetMissingSignals: MetricValidationWebEvalDatasetSignal[];
  webEvalDatasetBenchmarkIds: string[];
  webEvalDatasetRepositoryRefs: string[];
  webEvalDatasetSubjectIds: string[];
  webEvalDatasetQuerySetIds: string[];
  webEvalDatasetSearchProviderIds: string[];
  webEvalDatasetDocumentSetIds: string[];
  webEvalDatasetFilterPolicyIds: string[];
  webEvalDatasetQaGenerationIds: string[];
  webEvalDatasetReferenceAnswerSetIds: string[];
  webEvalDatasetExportIds: string[];
  webEvalDatasetOutputTargets: string[];
  webEvalDatasetMetricNames: string[];
  webEvalDatasetQuestionCount: number | null;
  webEvalDatasetDocumentCount: number | null;
  webEvalDatasetProviderDiversityCount: number | null;
  webEvalDatasetFreshnessHours: number | null;
  webEvalDatasetSourceCoverage: number | null;
  webEvalDatasetAnswerGrounding: number | null;
  webEvalDatasetReportArtifactHashes: string[];
  parallelResearchSkillCoverage: number | null;
  parallelResearchSkillSampleSize: number;
  parallelResearchSkillEvidenceRefs: string[];
  parallelResearchSkillMissingSignals: MetricValidationParallelResearchSkillSignal[];
  parallelResearchSkillRepositoryRefs: string[];
  parallelResearchSkillLicenseRefs: string[];
  parallelResearchSkillManifestIds: string[];
  parallelResearchSkillApiSurfaceIds: string[];
  parallelResearchSkillSearchModeIds: string[];
  parallelResearchSkillProcessorTiers: string[];
  parallelResearchSkillSecurityBoundaryRefs: string[];
  parallelResearchSkillDependencyLockIds: string[];
  parallelResearchSkillMetricNames: string[];
  parallelResearchSkillCitationCoverage0to1: number | null;
  parallelResearchSkillSourcePolicyCoverage0to1: number | null;
  parallelResearchSkillBatchTaskLimit: number | null;
  parallelResearchSkillMonitoringCoverage0to1: number | null;
  parallelResearchSkillReportArtifactHashes: string[];
  resumeRagEvaluatorCoverage: number | null;
  resumeRagEvaluatorSampleSize: number;
  resumeRagEvaluatorEvidenceRefs: string[];
  resumeRagEvaluatorMissingSignals: MetricValidationResumeRagEvaluatorSignal[];
  resumeRagEvaluatorRepositoryRefs: string[];
  resumeRagEvaluatorLicenseRefs: string[];
  resumeRagEvaluatorResumeInputFormats: string[];
  resumeRagEvaluatorRagStrategyIds: string[];
  resumeRagEvaluatorQueryExpansionIds: string[];
  resumeRagEvaluatorRetrievalKMin: number | null;
  resumeRagEvaluatorRetrievalKMax: number | null;
  resumeRagEvaluatorVectorStoreIds: string[];
  resumeRagEvaluatorOllamaModelIds: string[];
  resumeRagEvaluatorEmbeddingModelIds: string[];
  resumeRagEvaluatorEvaluationEndpointIds: string[];
  resumeRagEvaluatorCandidateRatingScale: string | null;
  resumeRagEvaluatorBatchModeIds: string[];
  resumeRagEvaluatorPrivacyBoundaryRefs: string[];
  resumeRagEvaluatorDependencyLockIds: string[];
  resumeRagEvaluatorMetricNames: string[];
  resumeRagEvaluatorParserCoverage0to1: number | null;
  resumeRagEvaluatorEvaluationGrounding0to1: number | null;
  resumeRagEvaluatorReportArtifactHashes: string[];
  chipBenchmarkCoverage: number | null;
  chipBenchmarkSampleSize: number;
  chipBenchmarkEvidenceRefs: string[];
  chipBenchmarkMissingSignals: MetricValidationChipBenchmarkSignal[];
  chipBenchmarkRepositoryRefs: string[];
  chipBenchmarkLicenseRefs: string[];
  chipBenchmarkBenchmarkIds: string[];
  chipBenchmarkHardwareProfileIds: string[];
  chipBenchmarkModelFamilyIds: string[];
  chipBenchmarkPrecisionModeIds: string[];
  chipBenchmarkEnvironmentIds: string[];
  chipBenchmarkRunnerScriptIds: string[];
  chipBenchmarkServingBackendIds: string[];
  chipBenchmarkDatasetIds: string[];
  chipBenchmarkFrontendDatasetIds: string[];
  chipBenchmarkPricingRefs: string[];
  chipBenchmarkMetricNames: string[];
  chipBenchmarkRegressionThresholdIds: string[];
  chipBenchmarkResultRowCount: number | null;
  chipBenchmarkThroughputCoverage0to1: number | null;
  chipBenchmarkLatencyCoverage0to1: number | null;
  chipBenchmarkCostCoverage0to1: number | null;
  chipBenchmarkReportArtifactHashes: string[];
  hermesBenchCoverage: number | null;
  hermesBenchSampleSize: number;
  hermesBenchEvidenceRefs: string[];
  hermesBenchMissingSignals: MetricValidationHermesBenchSignal[];
  hermesBenchRepositoryRefs: string[];
  hermesBenchLicenseRefs: string[];
  hermesBenchBranchRefs: string[];
  hermesBenchCommitRefs: string[];
  hermesBenchTreeRefs: string[];
  hermesBenchReadmeBlobRefs: string[];
  hermesBenchBuildSpecRefs: string[];
  hermesBenchBackendTreeRefs: string[];
  hermesBenchFrontendTreeRefs: string[];
  hermesBenchRunnerIds: string[];
  hermesBenchJudgeIds: string[];
  hermesBenchTaskRegistryIds: string[];
  hermesBenchServerConfigIds: string[];
  hermesBenchAdapterIds: string[];
  hermesBenchResultSchemaIds: string[];
  hermesBenchFrontendComponentIds: string[];
  hermesBenchBackendTestIds: string[];
  hermesBenchFrontendTestIds: string[];
  hermesBenchDockerRuntimeIds: string[];
  hermesBenchMetricNames: string[];
  hermesBenchTaskCount: number | null;
  hermesBenchAdapterCount: number | null;
  hermesBenchBackendTestCount: number | null;
  hermesBenchFrontendTestCount: number | null;
  hermesBenchJudgeAgreement0to1: number | null;
  hermesBenchRegressionPassRate0to1: number | null;
  hermesBenchReportArtifactHashes: string[];
  cooperBenchCoverage: number | null;
  cooperBenchSampleSize: number;
  cooperBenchEvidenceRefs: string[];
  cooperBenchMissingSignals: MetricValidationCooperBenchSignal[];
  cooperBenchRepositoryRefs: string[];
  cooperBenchLicenseRefs: string[];
  cooperBenchReleaseRefs: string[];
  cooperBenchBranchRefs: string[];
  cooperBenchCommitRefs: string[];
  cooperBenchTreeRefs: string[];
  cooperBenchReadmeBlobRefs: string[];
  cooperBenchChangelogRefs: string[];
  cooperBenchDatasetTreeRefs: string[];
  cooperBenchDatasetReadmeRefs: string[];
  cooperBenchRunnerIds: string[];
  cooperBenchEvalBackendIds: string[];
  cooperBenchTeamHarnessIds: string[];
  cooperBenchAgentAdapterIds: string[];
  cooperBenchCiWorkflowIds: string[];
  cooperBenchPackageLockRefs: string[];
  cooperBenchReportPublicationRefs: string[];
  cooperBenchMetricNames: string[];
  cooperBenchTaskCount: number | null;
  cooperBenchFeatureCount: number | null;
  cooperBenchAgentAdapterCount: number | null;
  cooperBenchTestCount: number | null;
  cooperBenchCooperationScore0to1: number | null;
  cooperBenchConflictResolutionRate0to1: number | null;
  cooperBenchRegressionPassRate0to1: number | null;
  cooperBenchReportArtifactHashes: string[];
  coderCupCoverage: number | null;
  coderCupSampleSize: number;
  coderCupEvidenceRefs: string[];
  coderCupMissingSignals: MetricValidationCoderCupSignal[];
  coderCupRepositoryRefs: string[];
  coderCupLicenseRefs: string[];
  coderCupHomepageRefs: string[];
  coderCupBranchRefs: string[];
  coderCupCommitRefs: string[];
  coderCupTreeRefs: string[];
  coderCupReadmeBlobRefs: string[];
  coderCupContributingRefs: string[];
  coderCupCiWorkflowIds: string[];
  coderCupPackageManifestRefs: string[];
  coderCupPackageLockRefs: string[];
  coderCupTaskSpecRefs: string[];
  coderCupTestSuiteRefs: string[];
  coderCupSuiteIndexRefs: string[];
  coderCupRunnerIds: string[];
  coderCupRunnerContractRefs: string[];
  coderCupScoreLedgerRefs: string[];
  coderCupLiveArtifactRefs: string[];
  coderCupMethodologyRefs: string[];
  coderCupReferenceRefs: string[];
  coderCupCostMethodologyRefs: string[];
  coderCupPublicFixtureRefs: string[];
  coderCupMetricNames: string[];
  coderCupPhaseCount: number | null;
  coderCupTestPlanCount: number | null;
  coderCupRunnerCount: number | null;
  coderCupScoreLedgerCount: number | null;
  coderCupLiveSurfaceCount: number | null;
  coderCupInterRaterAgreement0to1: number | null;
  coderCupTestRetestReliability0to1: number | null;
  coderCupRegressionPassRate0to1: number | null;
  coderCupReportArtifactHashes: string[];
  agenticGraphRagCoverage: number | null;
  agenticGraphRagSampleSize: number;
  agenticGraphRagEvidenceRefs: string[];
  agenticGraphRagMissingSignals: MetricValidationAgenticGraphRagSignal[];
  agenticGraphRagRepositoryRefs: string[];
  agenticGraphRagLicenseRefs: string[];
  agenticGraphRagBranchRefs: string[];
  agenticGraphRagCommitRefs: string[];
  agenticGraphRagTreeRefs: string[];
  agenticGraphRagReadmeBlobRefs: string[];
  agenticGraphRagGraphWorkflowIds: string[];
  agenticGraphRagOrchestratorIds: string[];
  agenticGraphRagRagPipelineIds: string[];
  agenticGraphRagDatabaseIds: string[];
  agenticGraphRagVectorStoreIds: string[];
  agenticGraphRagEvaluationIds: string[];
  agenticGraphRagExperimentTrackerIds: string[];
  agenticGraphRagUiComponentIds: string[];
  agenticGraphRagDependencyLockRefs: string[];
  agenticGraphRagMetricNames: string[];
  agenticGraphRagGraphNodeCount: number | null;
  agenticGraphRagGraphEdgeCount: number | null;
  agenticGraphRagEvaluationMetricCount: number | null;
  agenticGraphRagExperimentCount: number | null;
  agenticGraphRagRetrievalGroundingScore0to1: number | null;
  agenticGraphRagRegressionPassRate0to1: number | null;
  agenticGraphRagReportArtifactHashes: string[];
  agentScenarioTestCoverage: number | null;
  agentScenarioTestSampleSize: number;
  agentScenarioTestEvidenceRefs: string[];
  agentScenarioTestMissingSignals: MetricValidationAgentScenarioTestSignal[];
  agentScenarioTestBenchmarkIds: string[];
  agentScenarioTestRepositoryRefs: string[];
  agentScenarioTestLicenseRefs: string[];
  agentScenarioTestScenarioIds: string[];
  agentScenarioTestPersonaIds: string[];
  agentScenarioTestGoalIds: string[];
  agentScenarioTestKnowledgeSetIds: string[];
  agentScenarioTestToolMockIds: string[];
  agentScenarioTestTrajectoryAssertionIds: string[];
  agentScenarioTestJudgeIds: string[];
  agentScenarioTestMetricNames: string[];
  agentScenarioTestReporterFormats: string[];
  agentScenarioTestAgentIds: string[];
  agentScenarioTestComparisonIds: string[];
  agentScenarioTestScenarioCount: number | null;
  agentScenarioTestTurnCount: number | null;
  agentScenarioTestToolCallCount: number | null;
  agentScenarioTestReportArtifactHashes: string[];
  openCodeLabCoverage: number | null;
  openCodeLabSampleSize: number;
  openCodeLabEvidenceRefs: string[];
  openCodeLabMissingSignals: MetricValidationOpenCodeLabSignal[];
  openCodeLabBenchmarkIds: string[];
  openCodeLabRepositoryRefs: string[];
  openCodeLabAgentContextIds: string[];
  openCodeLabPromptVariantIds: string[];
  openCodeLabToolDescriptionIds: string[];
  openCodeLabPolicyIds: string[];
  openCodeLabRunTraceIds: string[];
  openCodeLabForkIds: string[];
  openCodeLabModelIds: string[];
  openCodeLabGroundTruthIds: string[];
  openCodeLabMetricNames: string[];
  openCodeLabReporterFormats: string[];
  openCodeLabResultArtifactIds: string[];
  openCodeLabRunCount: number | null;
  openCodeLabForkAgreement0to1: number | null;
  openCodeLabModelVariance0to1: number | null;
  openCodeLabReportArtifactHashes: string[];
  ccPluginEvalCoverage: number | null;
  ccPluginEvalSampleSize: number;
  ccPluginEvalEvidenceRefs: string[];
  ccPluginEvalMissingSignals: MetricValidationCcPluginEvalSignal[];
  ccPluginEvalRepositoryRefs: string[];
  ccPluginEvalLicenseRefs: string[];
  ccPluginEvalPluginManifestIds: string[];
  ccPluginEvalComponentTypes: MetricValidationCcPluginEvalComponentType[];
  ccPluginEvalTriggerManifestIds: string[];
  ccPluginEvalScenarioManifestIds: string[];
  ccPluginEvalScenarioTypes: MetricValidationCcPluginEvalScenarioType[];
  ccPluginEvalTranscriptIds: string[];
  ccPluginEvalDetectionReportIds: string[];
  ccPluginEvalDetectionModes: MetricValidationCcPluginEvalDetectionMode[];
  ccPluginEvalJudgeIds: string[];
  ccPluginEvalCalibrationIds: string[];
  ccPluginEvalConflictReportIds: string[];
  ccPluginEvalCheckpointStateIds: string[];
  ccPluginEvalCostEstimateIds: string[];
  ccPluginEvalReporterFormats: string[];
  ccPluginEvalResultArtifactIds: string[];
  ccPluginEvalMetricNames: string[];
  ccPluginEvalTriggerAccuracy0to1: number | null;
  ccPluginEvalFalsePositiveRate0to1: number | null;
  ccPluginEvalFalseNegativeRate0to1: number | null;
  ccPluginEvalComponentCount: number | null;
  ccPluginEvalScenarioCount: number | null;
  ccPluginEvalReportArtifactHashes: string[];
  realignSimulationCoverage: number | null;
  realignSimulationSampleSize: number;
  realignSimulationEvidenceRefs: string[];
  realignSimulationMissingSignals: MetricValidationRealignSimulationSignal[];
  realignSimulationRepositoryRefs: string[];
  realignSimulationLicenseRefs: string[];
  realignSimulationConfigIds: string[];
  realignSimulationAppIds: string[];
  realignSimulationDatasetIds: string[];
  realignSimulationScenarioIds: string[];
  realignSimulationPersonaIds: string[];
  realignSimulationEvaluatorIds: string[];
  realignSimulationTargetIds: string[];
  realignSimulationRunTraceIds: string[];
  realignSimulationRepeatedRunTraceIds: string[];
  realignSimulationJudgeIds: string[];
  realignSimulationCalibrationIds: string[];
  realignSimulationStatisticsReportIds: string[];
  realignSimulationCiReporterIds: string[];
  realignSimulationReporterFormats: string[];
  realignSimulationExperimentIds: string[];
  realignSimulationResultArtifactIds: string[];
  realignSimulationMetricNames: string[];
  realignSimulationJudgeAgreement0to1: number | null;
  realignSimulationRegressionPassRate0to1: number | null;
  realignSimulationScenarioCount: number | null;
  realignSimulationEvaluatorCount: number | null;
  realignSimulationRepeatCount: number | null;
  realignSimulationReportArtifactHashes: string[];
  academiClawCoverage: number | null;
  academiClawSampleSize: number;
  academiClawEvidenceRefs: string[];
  academiClawMissingSignals: MetricValidationAcademiClawSignal[];
  academiClawRepositoryRefs: string[];
  academiClawLicenseRefs: string[];
  academiClawBranchRefs: string[];
  academiClawCommitRefs: string[];
  academiClawTreeRefs: string[];
  academiClawReadmeBlobRefs: string[];
  academiClawCitationRefs: string[];
  academiClawTaskCorpusRefs: string[];
  academiClawLanguageIds: string[];
  academiClawWorkspaceQueryIds: string[];
  academiClawDockerImageIds: string[];
  academiClawRubricIds: string[];
  academiClawEvalTaskRunnerIds: string[];
  academiClawResultManifestIds: string[];
  academiClawConversationTraceIds: string[];
  academiClawMetaEvalIds: string[];
  academiClawModelIds: string[];
  academiClawMetricNames: string[];
  academiClawCiReporterIds: string[];
  academiClawReporterFormats: string[];
  academiClawTaskCount: number | null;
  academiClawLanguageCount: number | null;
  academiClawRubricCount: number | null;
  academiClawTraceCount: number | null;
  academiClawMetaEvalCount: number | null;
  academiClawModelCount: number | null;
  academiClawRegressionPassRate0to1: number | null;
  academiClawReportArtifactHashes: string[];
  ragChunkingTechniqueCoverage: number | null;
  ragChunkingTechniqueSampleSize: number;
  ragChunkingTechniqueEvidenceRefs: string[];
  ragChunkingTechniqueMissingSignals: MetricValidationRagChunkingTechniqueSignal[];
  ragChunkingTechniqueRepositoryRefs: string[];
  ragChunkingTechniqueLicenseRefs: string[];
  ragChunkingTechniqueBranchRefs: string[];
  ragChunkingTechniqueCommitRefs: string[];
  ragChunkingTechniqueTreeRefs: string[];
  ragChunkingTechniqueReadmeBlobRefs: string[];
  ragChunkingTechniquePolicyCorpusRefs: string[];
  ragChunkingTechniqueNotebookIds: string[];
  ragChunkingTechniqueChunkingStrategyIds: string[];
  ragChunkingTechniqueRetrievalPipelineIds: string[];
  ragChunkingTechniqueEmbeddingVectorstoreIds: string[];
  ragChunkingTechniqueEvaluationDatasetIds: string[];
  ragChunkingTechniqueMetricNames: string[];
  ragChunkingTechniqueCiReporterIds: string[];
  ragChunkingTechniqueReporterFormats: string[];
  ragChunkingTechniquePolicyDocumentCount: number | null;
  ragChunkingTechniqueNotebookCount: number | null;
  ragChunkingTechniqueChunkingStrategyCount: number | null;
  ragChunkingTechniqueEvaluationQuestionCount: number | null;
  ragChunkingTechniqueMetricCount: number | null;
  ragChunkingTechniqueRegressionPassRate0to1: number | null;
  ragChunkingTechniqueReportArtifactHashes: string[];
  kubernetesOperationalAgentCoverage: number | null;
  kubernetesOperationalAgentSampleSize: number;
  kubernetesOperationalAgentEvidenceRefs: string[];
  kubernetesOperationalAgentMissingSignals: MetricValidationKubernetesOperationalAgentSignal[];
  kubernetesOperationalAgentRepositoryRefs: string[];
  kubernetesOperationalAgentLicenseRefs: string[];
  kubernetesOperationalAgentReleaseRefs: string[];
  kubernetesOperationalAgentBranchRefs: string[];
  kubernetesOperationalAgentCommitRefs: string[];
  kubernetesOperationalAgentTreeRefs: string[];
  kubernetesOperationalAgentReadmeBlobRefs: string[];
  kubernetesOperationalAgentBuildWorkflowRefs: string[];
  kubernetesOperationalAgentAgentModuleRefs: string[];
  kubernetesOperationalAgentMcpServerModuleRefs: string[];
  kubernetesOperationalAgentToolModuleRefs: string[];
  kubernetesOperationalAgentToolCategoryIds: string[];
  kubernetesOperationalAgentDiagnosticCapabilityIds: string[];
  kubernetesOperationalAgentResourceMetricIds: string[];
  kubernetesOperationalAgentLogAnalysisIds: string[];
  kubernetesOperationalAgentMetricNames: string[];
  kubernetesOperationalAgentCiReporterIds: string[];
  kubernetesOperationalAgentReporterFormats: string[];
  kubernetesOperationalAgentToolCategoryCount: number | null;
  kubernetesOperationalAgentDiagnosticCapabilityCount: number | null;
  kubernetesOperationalAgentResourceMetricCount: number | null;
  kubernetesOperationalAgentLogAnalysisCount: number | null;
  kubernetesOperationalAgentRegressionPassRate0to1: number | null;
  kubernetesOperationalAgentReportArtifactHashes: string[];
  secureVibeBenchCoverage: number | null;
  secureVibeBenchSampleSize: number;
  secureVibeBenchEvidenceRefs: string[];
  secureVibeBenchMissingSignals: MetricValidationSecureVibeBenchSignal[];
  secureVibeBenchRepositoryRefs: string[];
  secureVibeBenchLicenseRefs: string[];
  secureVibeBenchHomepageRefs: string[];
  secureVibeBenchArxivRefs: string[];
  secureVibeBenchBranchRefs: string[];
  secureVibeBenchCommitRefs: string[];
  secureVibeBenchTreeRefs: string[];
  secureVibeBenchReadmeBlobRefs: string[];
  secureVibeBenchResultsBlobRefs: string[];
  secureVibeBenchDatasetRefs: string[];
  secureVibeBenchFormatExampleRefs: string[];
  secureVibeBenchEvaluationRunnerRefs: string[];
  secureVibeBenchAgentAdapterIds: string[];
  secureVibeBenchVulnerabilityScenarioIds: string[];
  secureVibeBenchTestScriptIds: string[];
  secureVibeBenchParserUtilityRefs: string[];
  secureVibeBenchPatchDiffUtilityRefs: string[];
  secureVibeBenchMetricNames: string[];
  secureVibeBenchCiReporterIds: string[];
  secureVibeBenchReporterFormats: string[];
  secureVibeBenchAgentAdapterCount: number | null;
  secureVibeBenchScenarioCount: number | null;
  secureVibeBenchTestScriptCount: number | null;
  secureVibeBenchRegressionPassRate0to1: number | null;
  secureVibeBenchReportArtifactHashes: string[];
  ravigBenchCoverage: number | null;
  ravigBenchSampleSize: number;
  ravigBenchEvidenceRefs: string[];
  ravigBenchMissingSignals: MetricValidationRavigBenchSignal[];
  ravigBenchRepositoryRefs: string[];
  ravigBenchLicenseRefs: string[];
  ravigBenchBranchRefs: string[];
  ravigBenchCommitRefs: string[];
  ravigBenchTreeRefs: string[];
  ravigBenchReadmeBlobRefs: string[];
  ravigBenchLegalBlobRefs: string[];
  ravigBenchEnvironmentRefs: string[];
  ravigBenchConfigurationRefs: string[];
  ravigBenchContentEvaluationRefs: string[];
  ravigBenchDesignEvaluationRefs: string[];
  ravigBenchExecutionEvaluationRefs: string[];
  ravigBenchFunctionScoringRefs: string[];
  ravigBenchDatasetRefs: string[];
  ravigBenchTestCaseRefs: string[];
  ravigBenchModelResultRefs: string[];
  ravigBenchTaxonomyIds: string[];
  ravigBenchRetrievalContextIds: string[];
  ravigBenchMultiModalEvaluatorIds: string[];
  ravigBenchScreenshotEvaluationRefs: string[];
  ravigBenchRunScriptRefs: string[];
  ravigBenchMetricNames: string[];
  ravigBenchCiReporterIds: string[];
  ravigBenchReporterFormats: string[];
  ravigBenchDatasetCaseCount: number | null;
  ravigBenchVisualDesignCheckCount: number | null;
  ravigBenchEvaluatorCount: number | null;
  ravigBenchValidationPassRate0to1: number | null;
  ravigBenchReportArtifactHashes: string[];
  humanStudyBenchCoverage: number | null;
  humanStudyBenchSampleSize: number;
  humanStudyBenchEvidenceRefs: string[];
  humanStudyBenchMissingSignals: MetricValidationHumanStudyBenchSignal[];
  humanStudyBenchRepositoryRefs: string[];
  humanStudyBenchLicenseRefs: string[];
  humanStudyBenchBranchRefs: string[];
  humanStudyBenchCommitRefs: string[];
  humanStudyBenchStudyConfigIds: string[];
  humanStudyBenchBackgroundDatasetIds: string[];
  humanStudyBenchHumanResponseDatasetIds: string[];
  humanStudyBenchAgentResponseDatasetIds: string[];
  humanStudyBenchEvaluatorIds: string[];
  humanStudyBenchMetricNames: string[];
  humanStudyBenchValidatorIds: string[];
  humanStudyBenchScorerIds: string[];
  humanStudyBenchStandardizerIds: string[];
  humanStudyBenchReliabilityReportIds: string[];
  humanStudyBenchValidationPipelineIds: string[];
  humanStudyBenchResultArtifactIds: string[];
  humanStudyBenchCiReporterIds: string[];
  humanStudyBenchReporterFormats: string[];
  humanStudyBenchStudyCount: number | null;
  humanStudyBenchParticipantCount: number | null;
  humanStudyBenchResponseCount: number | null;
  humanStudyBenchEvaluatorCount: number | null;
  humanStudyBenchInterRaterAgreement0to1: number | null;
  humanStudyBenchTestRetestReliability0to1: number | null;
  humanStudyBenchValidationPassRate0to1: number | null;
  humanStudyBenchReportArtifactHashes: string[];
  legacyBenchCoverage: number | null;
  legacyBenchSampleSize: number;
  legacyBenchEvidenceRefs: string[];
  legacyBenchMissingSignals: MetricValidationLegacyBenchSignal[];
  legacyBenchRepositoryRefs: string[];
  legacyBenchLicenseRefs: string[];
  legacyBenchBranchRefs: string[];
  legacyBenchCommitRefs: string[];
  legacyBenchTreeRefs: string[];
  legacyBenchReadmeBlobRefs: string[];
  legacyBenchTaskCorpusRefs: string[];
  legacyBenchLegacyLanguageIds: string[];
  legacyBenchEnvironmentIds: string[];
  legacyBenchHarnessRunnerIds: string[];
  legacyBenchAgentTaskIds: string[];
  legacyBenchPatchSubmissionIds: string[];
  legacyBenchTestOracleIds: string[];
  legacyBenchEvaluatorIds: string[];
  legacyBenchMetricNames: string[];
  legacyBenchCiReporterIds: string[];
  legacyBenchReporterFormats: string[];
  legacyBenchResultArtifactIds: string[];
  legacyBenchReplayCommandIds: string[];
  legacyBenchTaskCount: number | null;
  legacyBenchLanguageCount: number | null;
  legacyBenchEnvironmentCount: number | null;
  legacyBenchTestOracleCount: number | null;
  legacyBenchEvaluatorCount: number | null;
  legacyBenchRegressionPassRate0to1: number | null;
  legacyBenchReplayPassRate0to1: number | null;
  legacyBenchReportArtifactHashes: string[];
  subtleMemoryCoverage: number | null;
  subtleMemorySampleSize: number;
  subtleMemoryEvidenceRefs: string[];
  subtleMemoryMissingSignals: MetricValidationSubtleMemorySignal[];
  subtleMemoryRepositoryRefs: string[];
  subtleMemoryLicenseRefs: string[];
  subtleMemoryBranchRefs: string[];
  subtleMemoryCommitRefs: string[];
  subtleMemoryTreeRefs: string[];
  subtleMemoryArxivRefs: string[];
  subtleMemoryDatasetRefs: string[];
  subtleMemoryPersonaIds: string[];
  subtleMemoryBenchInstanceManifestIds: string[];
  subtleMemoryHistorySessionManifestIds: string[];
  subtleMemoryRelationTypes: string[];
  subtleMemoryConstructionPipelineIds: string[];
  subtleMemoryEvaluationStageIds: string[];
  subtleMemoryAdapterIds: string[];
  subtleMemoryJudgeIds: string[];
  subtleMemoryEvaluatorIds: string[];
  subtleMemoryMetricNames: string[];
  subtleMemoryScoreSummaryIds: string[];
  subtleMemoryDiagnosticProtocolIds: string[];
  subtleMemoryCiReporterIds: string[];
  subtleMemoryReporterFormats: string[];
  subtleMemoryPersonaCount: number | null;
  subtleMemoryBenchInstanceCount: number | null;
  subtleMemoryHistoryCount: number | null;
  subtleMemoryMemoryVariantSetCount: number | null;
  subtleMemoryRelationTypeCount: number | null;
  subtleMemoryEvaluationStageCount: number | null;
  subtleMemoryAdapterCount: number | null;
  subtleMemoryJudgeAgreement0to1: number | null;
  subtleMemoryValidationPassRate0to1: number | null;
  subtleMemoryReportArtifactHashes: string[];
  previousObservations: ScoreObservation[];
  thresholds: MetricValidationThresholdPolicy;
}): MetricValidationRow {
  const interval = confidenceInterval(params.values);
  const score = mean(params.values);
  const testRetestStability = stabilityForMetric({
    current: {
      agentId: params.agentId,
      score,
      timestamp: params.timestamp,
      runId: params.metricId
    },
    previous: params.previousObservations
  });
  const ciWidth = interval.upper - interval.lower;
  const status = statusForRow({
    sampleSize: params.values.length,
    constructValidity: params.constructValidity,
    ciWidth,
    testRetestStability,
    counterfactualResponsiveness: params.counterfactualResponsiveness,
    validationFacetCoverage: params.validationFacetCoverage,
    confounderControlCoverage: params.confounderControlCoverage,
    outcomeAlignment: params.outcomeAlignment,
    processEvidenceCoverage: params.processEvidenceCoverage,
    safetyUtilityCoverage: params.safetyUtilityCoverage,
    modalityTransformationCoverage: params.modalityTransformationCoverage,
    lifecycleObservabilityCoverage: params.lifecycleObservabilityCoverage,
    rankingStabilityCoverage: params.rankingStabilityCoverage,
    toolSandboxCoverage: params.toolSandboxCoverage,
    continualLearningCoverage: params.continualLearningCoverage,
    strategicInteractionCoverage: params.strategicInteractionCoverage,
    architectureRealityCoverage: params.architectureRealityCoverage,
    ragPipelineCoverage: params.ragPipelineCoverage,
    ragEvaluationPipelineCoverage: params.ragEvaluationPipelineCoverage,
    ragasNotebookCoverage: params.ragasNotebookCoverage,
    mirageRagMetricCoverage: params.mirageRagMetricCoverage,
    legalCodeRagCoverage: params.legalCodeRagCoverage,
    guardbenchMetricCoverage: params.guardbenchMetricCoverage,
    businessWorkflowCoverage: params.businessWorkflowCoverage,
    dataAgentAnalyticalCoverage: params.dataAgentAnalyticalCoverage,
    embodiedAgentCoverage: params.embodiedAgentCoverage,
    evaluatorSuiteCoverage: params.evaluatorSuiteCoverage,
    pentestBenchmarkCoverage: params.pentestBenchmarkCoverage,
    traceEvaluationCoverage: params.traceEvaluationCoverage,
    livingEnvironmentCoverage: params.livingEnvironmentCoverage,
    mobileAgentCoverage: params.mobileAgentCoverage,
    personaAgentCoverage: params.personaAgentCoverage,
    scientificLiteratureCoverage: params.scientificLiteratureCoverage,
    bioinformaticsAgentCoverage: params.bioinformaticsAgentCoverage,
    mirageDrugRepositioningCoverage: params.mirageDrugRepositioningCoverage,
    networkTroubleshootingCoverage: params.networkTroubleshootingCoverage,
    inferenceOptimizationCoverage: params.inferenceOptimizationCoverage,
    javaCodingAgentCoverage: params.javaCodingAgentCoverage,
    webEvalDatasetCoverage: params.webEvalDatasetCoverage,
    parallelResearchSkillCoverage: params.parallelResearchSkillCoverage,
    resumeRagEvaluatorCoverage: params.resumeRagEvaluatorCoverage,
    chipBenchmarkCoverage: params.chipBenchmarkCoverage,
    hermesBenchCoverage: params.hermesBenchCoverage,
    hermesBenchJudgeAgreement0to1: params.hermesBenchJudgeAgreement0to1,
    hermesBenchRegressionPassRate0to1: params.hermesBenchRegressionPassRate0to1,
    cooperBenchCoverage: params.cooperBenchCoverage,
    cooperBenchCooperationScore0to1: params.cooperBenchCooperationScore0to1,
    cooperBenchConflictResolutionRate0to1: params.cooperBenchConflictResolutionRate0to1,
    cooperBenchRegressionPassRate0to1: params.cooperBenchRegressionPassRate0to1,
    coderCupCoverage: params.coderCupCoverage,
    coderCupInterRaterAgreement0to1: params.coderCupInterRaterAgreement0to1,
    coderCupTestRetestReliability0to1: params.coderCupTestRetestReliability0to1,
    coderCupRegressionPassRate0to1: params.coderCupRegressionPassRate0to1,
    agenticGraphRagCoverage: params.agenticGraphRagCoverage,
    agenticGraphRagRetrievalGroundingScore0to1: params.agenticGraphRagRetrievalGroundingScore0to1,
    agenticGraphRagRegressionPassRate0to1: params.agenticGraphRagRegressionPassRate0to1,
    agentScenarioTestCoverage: params.agentScenarioTestCoverage,
    openCodeLabCoverage: params.openCodeLabCoverage,
    ccPluginEvalCoverage: params.ccPluginEvalCoverage,
    ccPluginEvalTriggerAccuracy0to1: params.ccPluginEvalTriggerAccuracy0to1,
    ccPluginEvalFalsePositiveRate0to1: params.ccPluginEvalFalsePositiveRate0to1,
    ccPluginEvalFalseNegativeRate0to1: params.ccPluginEvalFalseNegativeRate0to1,
    realignSimulationCoverage: params.realignSimulationCoverage,
    realignSimulationJudgeAgreement0to1: params.realignSimulationJudgeAgreement0to1,
    realignSimulationRegressionPassRate0to1: params.realignSimulationRegressionPassRate0to1,
    academiClawCoverage: params.academiClawCoverage,
    academiClawRegressionPassRate0to1: params.academiClawRegressionPassRate0to1,
    ragChunkingTechniqueCoverage: params.ragChunkingTechniqueCoverage,
    ragChunkingTechniqueRegressionPassRate0to1: params.ragChunkingTechniqueRegressionPassRate0to1,
    kubernetesOperationalAgentCoverage: params.kubernetesOperationalAgentCoverage,
    kubernetesOperationalAgentRegressionPassRate0to1: params.kubernetesOperationalAgentRegressionPassRate0to1,
    secureVibeBenchCoverage: params.secureVibeBenchCoverage,
    secureVibeBenchRegressionPassRate0to1: params.secureVibeBenchRegressionPassRate0to1,
    ravigBenchCoverage: params.ravigBenchCoverage,
    ravigBenchValidationPassRate0to1: params.ravigBenchValidationPassRate0to1,
    humanStudyBenchCoverage: params.humanStudyBenchCoverage,
    humanStudyBenchInterRaterAgreement0to1: params.humanStudyBenchInterRaterAgreement0to1,
    humanStudyBenchTestRetestReliability0to1: params.humanStudyBenchTestRetestReliability0to1,
    humanStudyBenchValidationPassRate0to1: params.humanStudyBenchValidationPassRate0to1,
    legacyBenchCoverage: params.legacyBenchCoverage,
    legacyBenchRegressionPassRate0to1: params.legacyBenchRegressionPassRate0to1,
    legacyBenchReplayPassRate0to1: params.legacyBenchReplayPassRate0to1,
    subtleMemoryCoverage: params.subtleMemoryCoverage,
    subtleMemoryJudgeAgreement0to1: params.subtleMemoryJudgeAgreement0to1,
    subtleMemoryValidationPassRate0to1: params.subtleMemoryValidationPassRate0to1,
    thresholds: params.thresholds
  });
  const evidenceRefs = [...new Set([
    ...linkedEvidenceRefs(params.questionScores),
    ...params.counterfactualEvidenceRefs,
    ...params.validationFacetEvidenceRefs,
    ...params.confounderControlEvidenceRefs,
    ...params.outcomeAlignmentEvidenceRefs,
    ...params.processEvidenceRefs,
    ...params.safetyUtilityEvidenceRefs,
    ...params.modalityTransformationEvidenceRefs,
    ...params.lifecycleObservabilityEvidenceRefs,
    ...params.rankingStabilityEvidenceRefs,
    ...params.toolSandboxEvidenceRefs,
    ...params.continualLearningEvidenceRefs,
    ...params.strategicInteractionEvidenceRefs,
    ...params.architectureRealityEvidenceRefs,
    ...params.ragPipelineEvidenceRefs,
    ...params.ragEvaluationPipelineEvidenceRefs,
    ...params.ragasNotebookEvidenceRefs,
    ...params.mirageRagMetricEvidenceRefs,
    ...params.legalCodeRagEvidenceRefs,
    ...params.guardbenchMetricEvidenceRefs,
    ...params.businessWorkflowEvidenceRefs,
    ...params.dataAgentAnalyticalEvidenceRefs,
    ...params.embodiedAgentEvidenceRefs,
    ...params.evaluatorSuiteEvidenceRefs,
    ...params.pentestBenchmarkEvidenceRefs,
    ...params.traceEvaluationEvidenceRefs,
    ...params.livingEnvironmentEvidenceRefs,
    ...params.mobileAgentEvidenceRefs,
    ...params.personaAgentEvidenceRefs,
    ...params.scientificLiteratureEvidenceRefs,
    ...params.bioinformaticsAgentEvidenceRefs,
    ...params.mirageDrugRepositioningEvidenceRefs,
    ...params.networkTroubleshootingEvidenceRefs,
    ...params.inferenceOptimizationEvidenceRefs,
    ...params.javaCodingAgentEvidenceRefs,
    ...params.webEvalDatasetEvidenceRefs,
    ...params.parallelResearchSkillEvidenceRefs,
    ...params.resumeRagEvaluatorEvidenceRefs,
    ...params.chipBenchmarkEvidenceRefs,
    ...params.agentScenarioTestEvidenceRefs,
    ...params.openCodeLabEvidenceRefs,
    ...params.ccPluginEvalEvidenceRefs,
    ...params.realignSimulationEvidenceRefs,
    ...params.academiClawEvidenceRefs,
    ...params.ragChunkingTechniqueEvidenceRefs,
    ...params.kubernetesOperationalAgentEvidenceRefs,
    ...params.secureVibeBenchEvidenceRefs,
    ...params.ravigBenchEvidenceRefs,
    ...params.humanStudyBenchEvidenceRefs,
    ...params.legacyBenchEvidenceRefs,
    ...params.hermesBenchEvidenceRefs,
    ...params.cooperBenchEvidenceRefs,
    ...params.coderCupEvidenceRefs,
    ...params.agenticGraphRagEvidenceRefs,
    ...params.subtleMemoryEvidenceRefs
  ])];
  return {
    metricId: params.metricId,
    owner: params.owner,
    sampleSize: params.values.length,
    constructValidity: params.constructValidity,
    interRaterAgreement: params.interRaterAgreement,
    testRetestStability,
    counterfactualResponsiveness: params.counterfactualResponsiveness,
    counterfactualSampleSize: params.counterfactualSampleSize,
    validationFacetCoverage: params.validationFacetCoverage,
    validationFacetSampleSize: params.validationFacetSampleSize,
    confounderControlCoverage: params.confounderControlCoverage,
    confounderControlSampleSize: params.confounderControlSampleSize,
    outcomeAlignment: params.outcomeAlignment,
    outcomeAlignmentSampleSize: params.outcomeAlignmentSampleSize,
    processEvidenceCoverage: params.processEvidenceCoverage,
    processEvidenceSampleSize: params.processEvidenceSampleSize,
    safetyUtilityCoverage: params.safetyUtilityCoverage,
    safetyUtilitySampleSize: params.safetyUtilitySampleSize,
    modalityTransformationCoverage: params.modalityTransformationCoverage,
    modalityTransformationSampleSize: params.modalityTransformationSampleSize,
    lifecycleObservabilityCoverage: params.lifecycleObservabilityCoverage,
    lifecycleObservabilitySampleSize: params.lifecycleObservabilitySampleSize,
    rankingStabilityCoverage: params.rankingStabilityCoverage,
    rankingStabilitySampleSize: params.rankingStabilitySampleSize,
    toolSandboxCoverage: params.toolSandboxCoverage,
    toolSandboxSampleSize: params.toolSandboxSampleSize,
    continualLearningCoverage: params.continualLearningCoverage,
    continualLearningSampleSize: params.continualLearningSampleSize,
    continualLearningRunCount: params.continualLearningRunCount,
    continualLearningMissingSignals: params.continualLearningMissingSignals,
    continualLearningMemoryArtifactHashes: params.continualLearningMemoryArtifactHashes,
    continualLearningRunSummaryArtifactHashes: params.continualLearningRunSummaryArtifactHashes,
    continualLearningGameplayLogArtifactHashes: params.continualLearningGameplayLogArtifactHashes,
    continualLearningMetricNames: params.continualLearningMetricNames,
    strategicInteractionCoverage: params.strategicInteractionCoverage,
    strategicInteractionSampleSize: params.strategicInteractionSampleSize,
    architectureRealityCoverage: params.architectureRealityCoverage,
    architectureRealitySampleSize: params.architectureRealitySampleSize,
    architectureRealityStressScenarioCount: params.architectureRealityStressScenarioCount,
    architectureRealityNetworkScenarioCount: params.architectureRealityNetworkScenarioCount,
    architectureRealityEnsemblePatternCount: params.architectureRealityEnsemblePatternCount,
    architectureRealityMissingSignals: params.architectureRealityMissingSignals,
    ragPipelineCoverage: params.ragPipelineCoverage,
    ragPipelineSampleSize: params.ragPipelineSampleSize,
    ragEvaluationPipelineCoverage: params.ragEvaluationPipelineCoverage,
    ragEvaluationPipelineSampleSize: params.ragEvaluationPipelineSampleSize,
    ragEvaluationPipelineCaseSampleSizeMin: params.ragEvaluationPipelineCaseSampleSizeMin,
    ragEvaluationPipelineMissingSignals: params.ragEvaluationPipelineMissingSignals,
    ragEvaluationPipelineMetricOwners: params.ragEvaluationPipelineMetricOwners,
    ragEvaluationPipelineReportArtifactHashes: params.ragEvaluationPipelineReportArtifactHashes,
    ragasNotebookCoverage: params.ragasNotebookCoverage,
    ragasNotebookSampleSize: params.ragasNotebookSampleSize,
    ragasNotebookMissingSignals: params.ragasNotebookMissingSignals,
    ragasNotebookMetricNames: params.ragasNotebookMetricNames,
    ragasNotebookQuestionCount: params.ragasNotebookQuestionCount,
    ragasNotebookReportArtifactHashes: params.ragasNotebookReportArtifactHashes,
    mirageRagMetricCoverage: params.mirageRagMetricCoverage,
    mirageRagMetricSampleSize: params.mirageRagMetricSampleSize,
    mirageRagMetricMissingSignals: params.mirageRagMetricMissingSignals,
    mirageRagMetricDatasetIds: params.mirageRagMetricDatasetIds,
    mirageRagMetricEvaluationModes: params.mirageRagMetricEvaluationModes,
    mirageRagMetricRetrieverIds: params.mirageRagMetricRetrieverIds,
    mirageRagMetricModelIds: params.mirageRagMetricModelIds,
    mirageRagMetricNames: params.mirageRagMetricNames,
    mirageRagMetricQaPairCount: params.mirageRagMetricQaPairCount,
    mirageRagMetricContextPoolCount: params.mirageRagMetricContextPoolCount,
    mirageRagMetricReportArtifactHashes: params.mirageRagMetricReportArtifactHashes,
    legalCodeRagCoverage: params.legalCodeRagCoverage,
    legalCodeRagSampleSize: params.legalCodeRagSampleSize,
    legalCodeRagMissingSignals: params.legalCodeRagMissingSignals,
    legalCodeRagLegalCodeIds: params.legalCodeRagLegalCodeIds,
    legalCodeRagJurisdictionIds: params.legalCodeRagJurisdictionIds,
    legalCodeRagRetrievalTechniqueIds: params.legalCodeRagRetrievalTechniqueIds,
    legalCodeRagVectorStoreIds: params.legalCodeRagVectorStoreIds,
    legalCodeRagEmbeddingModelIds: params.legalCodeRagEmbeddingModelIds,
    legalCodeRagEvaluationDatasetIds: params.legalCodeRagEvaluationDatasetIds,
    legalCodeRagMetricNames: params.legalCodeRagMetricNames,
    legalCodeRagQuestionCount: params.legalCodeRagQuestionCount,
    legalCodeRagMetricOwners: params.legalCodeRagMetricOwners,
    legalCodeRagReportArtifactHashes: params.legalCodeRagReportArtifactHashes,
    guardbenchMetricCoverage: params.guardbenchMetricCoverage,
    guardbenchMetricSampleSize: params.guardbenchMetricSampleSize,
    guardbenchMetricMissingSignals: params.guardbenchMetricMissingSignals,
    guardbenchDatasetIds: params.guardbenchDatasetIds,
    guardbenchLanguageIds: params.guardbenchLanguageIds,
    guardbenchModelIds: params.guardbenchModelIds,
    guardbenchThresholdIds: params.guardbenchThresholdIds,
    guardbenchMetricNames: params.guardbenchMetricNames,
    guardbenchExportFormats: params.guardbenchExportFormats,
    guardbenchReportArtifactHashes: params.guardbenchReportArtifactHashes,
    businessWorkflowCoverage: params.businessWorkflowCoverage,
    businessWorkflowSampleSize: params.businessWorkflowSampleSize,
    dataAgentAnalyticalCoverage: params.dataAgentAnalyticalCoverage,
    dataAgentAnalyticalSampleSize: params.dataAgentAnalyticalSampleSize,
    embodiedAgentCoverage: params.embodiedAgentCoverage,
    embodiedAgentSampleSize: params.embodiedAgentSampleSize,
    embodiedAgentMissingSignals: params.embodiedAgentMissingSignals,
    embodiedAgentTaskTypes: params.embodiedAgentTaskTypes,
    embodiedAgentBaselineIds: params.embodiedAgentBaselineIds,
    embodiedAgentReportArtifactHashes: params.embodiedAgentReportArtifactHashes,
    evaluatorSuiteCoverage: params.evaluatorSuiteCoverage,
    evaluatorSuiteSampleSize: params.evaluatorSuiteSampleSize,
    evaluatorSuiteMissingSignals: params.evaluatorSuiteMissingSignals,
    evaluatorSuiteAssertionTypes: params.evaluatorSuiteAssertionTypes,
    evaluatorSuiteReporterFormats: params.evaluatorSuiteReporterFormats,
    evaluatorSuiteJudgeNames: params.evaluatorSuiteJudgeNames,
    evaluatorSuiteReportArtifactHashes: params.evaluatorSuiteReportArtifactHashes,
    pentestBenchmarkCoverage: params.pentestBenchmarkCoverage,
    pentestBenchmarkSampleSize: params.pentestBenchmarkSampleSize,
    pentestBenchmarkMissingSignals: params.pentestBenchmarkMissingSignals,
    pentestBenchmarkLanguageStacks: params.pentestBenchmarkLanguageStacks,
    pentestBenchmarkVulnerabilityClasses: params.pentestBenchmarkVulnerabilityClasses,
    pentestBenchmarkDifficultyLevels: params.pentestBenchmarkDifficultyLevels,
    pentestBenchmarkSuiteIds: params.pentestBenchmarkSuiteIds,
    pentestBenchmarkMetricNames: params.pentestBenchmarkMetricNames,
    pentestBenchmarkReportArtifactHashes: params.pentestBenchmarkReportArtifactHashes,
    traceEvaluationCoverage: params.traceEvaluationCoverage,
    traceEvaluationSampleSize: params.traceEvaluationSampleSize,
    traceEvaluationMissingSignals: params.traceEvaluationMissingSignals,
    traceEvaluationModelIds: params.traceEvaluationModelIds,
    traceEvaluationAgentParameterKeys: params.traceEvaluationAgentParameterKeys,
    traceEvaluationToolNames: params.traceEvaluationToolNames,
    traceEvaluationMetricNames: params.traceEvaluationMetricNames,
    traceEvaluationCaseSuiteIds: params.traceEvaluationCaseSuiteIds,
    traceEvaluationBackendModes: params.traceEvaluationBackendModes,
    traceEvaluationRunPermutationCount: params.traceEvaluationRunPermutationCount,
    traceEvaluationReportArtifactHashes: params.traceEvaluationReportArtifactHashes,
    livingEnvironmentCoverage: params.livingEnvironmentCoverage,
    livingEnvironmentSampleSize: params.livingEnvironmentSampleSize,
    livingEnvironmentMissingSignals: params.livingEnvironmentMissingSignals,
    livingEnvironmentCapabilityNames: params.livingEnvironmentCapabilityNames,
    livingEnvironmentSandboxProviders: params.livingEnvironmentSandboxProviders,
    livingEnvironmentAgentAdapters: params.livingEnvironmentAgentAdapters,
    livingEnvironmentMetricNames: params.livingEnvironmentMetricNames,
    livingEnvironmentTrialCount: params.livingEnvironmentTrialCount,
    livingEnvironmentReportArtifactHashes: params.livingEnvironmentReportArtifactHashes,
    mobileAgentCoverage: params.mobileAgentCoverage,
    mobileAgentSampleSize: params.mobileAgentSampleSize,
    mobileAgentMissingSignals: params.mobileAgentMissingSignals,
    mobileAgentBenchmarkIds: params.mobileAgentBenchmarkIds,
    mobileAgentEnvironmentIds: params.mobileAgentEnvironmentIds,
    mobileAgentAppIds: params.mobileAgentAppIds,
    mobileAgentApiCatalogIds: params.mobileAgentApiCatalogIds,
    mobileAgentUiTraceIds: params.mobileAgentUiTraceIds,
    mobileAgentTaskSetIds: params.mobileAgentTaskSetIds,
    mobileAgentTaskComplexityGroups: params.mobileAgentTaskComplexityGroups,
    mobileAgentCheckpointMetricNames: params.mobileAgentCheckpointMetricNames,
    mobileAgentLicenseBoundaryRefs: params.mobileAgentLicenseBoundaryRefs,
    mobileAgentTrialCount: params.mobileAgentTrialCount,
    mobileAgentReportArtifactHashes: params.mobileAgentReportArtifactHashes,
    personaAgentCoverage: params.personaAgentCoverage,
    personaAgentSampleSize: params.personaAgentSampleSize,
    personaAgentMissingSignals: params.personaAgentMissingSignals,
    personaAgentPersonaIds: params.personaAgentPersonaIds,
    personaAgentEnvironmentIds: params.personaAgentEnvironmentIds,
    personaAgentQuestionSetIds: params.personaAgentQuestionSetIds,
    personaAgentModelIds: params.personaAgentModelIds,
    personaAgentProviderIds: params.personaAgentProviderIds,
    personaAgentMetricNames: params.personaAgentMetricNames,
    personaAgentQuestionCount: params.personaAgentQuestionCount,
    personaAgentReportArtifactHashes: params.personaAgentReportArtifactHashes,
    scientificLiteratureCoverage: params.scientificLiteratureCoverage,
    scientificLiteratureSampleSize: params.scientificLiteratureSampleSize,
    scientificLiteratureMissingSignals: params.scientificLiteratureMissingSignals,
    scientificLiteratureBenchmarkIds: params.scientificLiteratureBenchmarkIds,
    scientificLiteratureTaskTypes: params.scientificLiteratureTaskTypes,
    scientificLiteratureDatasetIds: params.scientificLiteratureDatasetIds,
    scientificLiteratureSearchBackendIds: params.scientificLiteratureSearchBackendIds,
    scientificLiteratureToolIds: params.scientificLiteratureToolIds,
    scientificLiteratureMetricNames: params.scientificLiteratureMetricNames,
    scientificLiteratureTaskCount: params.scientificLiteratureTaskCount,
    scientificLiteratureReportArtifactHashes: params.scientificLiteratureReportArtifactHashes,
    bioinformaticsAgentCoverage: params.bioinformaticsAgentCoverage,
    bioinformaticsAgentSampleSize: params.bioinformaticsAgentSampleSize,
    bioinformaticsAgentMissingSignals: params.bioinformaticsAgentMissingSignals,
    bioinformaticsAgentBenchmarkIds: params.bioinformaticsAgentBenchmarkIds,
    bioinformaticsAgentTaskTypes: params.bioinformaticsAgentTaskTypes,
    bioinformaticsAgentDatasetIds: params.bioinformaticsAgentDatasetIds,
    bioinformaticsAgentWorkflowIds: params.bioinformaticsAgentWorkflowIds,
    bioinformaticsAgentToolNames: params.bioinformaticsAgentToolNames,
    bioinformaticsAgentMetricNames: params.bioinformaticsAgentMetricNames,
    bioinformaticsAgentPerturbationIds: params.bioinformaticsAgentPerturbationIds,
    bioinformaticsAgentPrivacyBoundaryRefs: params.bioinformaticsAgentPrivacyBoundaryRefs,
    bioinformaticsAgentTaskCount: params.bioinformaticsAgentTaskCount,
    bioinformaticsAgentReportArtifactHashes: params.bioinformaticsAgentReportArtifactHashes,
    mirageDrugRepositioningCoverage: params.mirageDrugRepositioningCoverage,
    mirageDrugRepositioningSampleSize: params.mirageDrugRepositioningSampleSize,
    mirageDrugRepositioningMissingSignals: params.mirageDrugRepositioningMissingSignals,
    mirageDrugRepositioningBenchmarkIds: params.mirageDrugRepositioningBenchmarkIds,
    mirageDrugRepositioningDatasetIds: params.mirageDrugRepositioningDatasetIds,
    mirageDrugRepositioningSplitIds: params.mirageDrugRepositioningSplitIds,
    mirageDrugRepositioningMappingIds: params.mirageDrugRepositioningMappingIds,
    mirageDrugRepositioningFeatureSetIds: params.mirageDrugRepositioningFeatureSetIds,
    mirageDrugRepositioningSimilarityMatrixIds: params.mirageDrugRepositioningSimilarityMatrixIds,
    mirageDrugRepositioningNegativeSamplingIds: params.mirageDrugRepositioningNegativeSamplingIds,
    mirageDrugRepositioningClassifierConfigIds: params.mirageDrugRepositioningClassifierConfigIds,
    mirageDrugRepositioningFeatureSelectionReportIds: params.mirageDrugRepositioningFeatureSelectionReportIds,
    mirageDrugRepositioningScoreCalculationIds: params.mirageDrugRepositioningScoreCalculationIds,
    mirageDrugRepositioningCaseStudyIds: params.mirageDrugRepositioningCaseStudyIds,
    mirageDrugRepositioningMetricNames: params.mirageDrugRepositioningMetricNames,
    mirageDrugRepositioningDrugCount: params.mirageDrugRepositioningDrugCount,
    mirageDrugRepositioningDiseaseCount: params.mirageDrugRepositioningDiseaseCount,
    mirageDrugRepositioningMappingCount: params.mirageDrugRepositioningMappingCount,
    mirageDrugRepositioningFeatureSetCount: params.mirageDrugRepositioningFeatureSetCount,
    mirageDrugRepositioningSimilarityMatrixCount: params.mirageDrugRepositioningSimilarityMatrixCount,
    mirageDrugRepositioningReportArtifactHashes: params.mirageDrugRepositioningReportArtifactHashes,
    networkTroubleshootingCoverage: params.networkTroubleshootingCoverage,
    networkTroubleshootingSampleSize: params.networkTroubleshootingSampleSize,
    networkTroubleshootingMissingSignals: params.networkTroubleshootingMissingSignals,
    networkTroubleshootingBenchmarkIds: params.networkTroubleshootingBenchmarkIds,
    networkTroubleshootingScenarioIds: params.networkTroubleshootingScenarioIds,
    networkTroubleshootingTopologyTiers: params.networkTroubleshootingTopologyTiers,
    networkTroubleshootingIssueTypes: params.networkTroubleshootingIssueTypes,
    networkTroubleshootingAgentIds: params.networkTroubleshootingAgentIds,
    networkTroubleshootingToolNames: params.networkTroubleshootingToolNames,
    networkTroubleshootingMetricNames: params.networkTroubleshootingMetricNames,
    networkTroubleshootingIncidentCount: params.networkTroubleshootingIncidentCount,
    networkTroubleshootingReportArtifactHashes: params.networkTroubleshootingReportArtifactHashes,
    inferenceOptimizationCoverage: params.inferenceOptimizationCoverage,
    inferenceOptimizationSampleSize: params.inferenceOptimizationSampleSize,
    inferenceOptimizationMissingSignals: params.inferenceOptimizationMissingSignals,
    inferenceOptimizationBenchmarkIds: params.inferenceOptimizationBenchmarkIds,
    inferenceOptimizationScenarioIds: params.inferenceOptimizationScenarioIds,
    inferenceOptimizationHardwareProfileIds: params.inferenceOptimizationHardwareProfileIds,
    inferenceOptimizationBackendIds: params.inferenceOptimizationBackendIds,
    inferenceOptimizationSearchSpaceIds: params.inferenceOptimizationSearchSpaceIds,
    inferenceOptimizationGateIds: params.inferenceOptimizationGateIds,
    inferenceOptimizationAgentIds: params.inferenceOptimizationAgentIds,
    inferenceOptimizationMetricNames: params.inferenceOptimizationMetricNames,
    inferenceOptimizationRunCount: params.inferenceOptimizationRunCount,
    inferenceOptimizationReportArtifactHashes: params.inferenceOptimizationReportArtifactHashes,
    javaCodingAgentCoverage: params.javaCodingAgentCoverage,
    javaCodingAgentSampleSize: params.javaCodingAgentSampleSize,
    javaCodingAgentMissingSignals: params.javaCodingAgentMissingSignals,
    javaCodingAgentBenchmarkIds: params.javaCodingAgentBenchmarkIds,
    javaCodingAgentTaskIds: params.javaCodingAgentTaskIds,
    javaCodingAgentTaskTypes: params.javaCodingAgentTaskTypes,
    javaCodingAgentJavaProjectIds: params.javaCodingAgentJavaProjectIds,
    javaCodingAgentSandboxIds: params.javaCodingAgentSandboxIds,
    javaCodingAgentAgentConfigIds: params.javaCodingAgentAgentConfigIds,
    javaCodingAgentJudgeTierIds: params.javaCodingAgentJudgeTierIds,
    javaCodingAgentCheckTypes: params.javaCodingAgentCheckTypes,
    javaCodingAgentMetricNames: params.javaCodingAgentMetricNames,
    javaCodingAgentTrialCount: params.javaCodingAgentTrialCount,
    javaCodingAgentReportArtifactHashes: params.javaCodingAgentReportArtifactHashes,
    webEvalDatasetCoverage: params.webEvalDatasetCoverage,
    webEvalDatasetSampleSize: params.webEvalDatasetSampleSize,
    webEvalDatasetMissingSignals: params.webEvalDatasetMissingSignals,
    webEvalDatasetBenchmarkIds: params.webEvalDatasetBenchmarkIds,
    webEvalDatasetRepositoryRefs: params.webEvalDatasetRepositoryRefs,
    webEvalDatasetSubjectIds: params.webEvalDatasetSubjectIds,
    webEvalDatasetQuerySetIds: params.webEvalDatasetQuerySetIds,
    webEvalDatasetSearchProviderIds: params.webEvalDatasetSearchProviderIds,
    webEvalDatasetDocumentSetIds: params.webEvalDatasetDocumentSetIds,
    webEvalDatasetFilterPolicyIds: params.webEvalDatasetFilterPolicyIds,
    webEvalDatasetQaGenerationIds: params.webEvalDatasetQaGenerationIds,
    webEvalDatasetReferenceAnswerSetIds: params.webEvalDatasetReferenceAnswerSetIds,
    webEvalDatasetExportIds: params.webEvalDatasetExportIds,
    webEvalDatasetOutputTargets: params.webEvalDatasetOutputTargets,
    webEvalDatasetMetricNames: params.webEvalDatasetMetricNames,
    webEvalDatasetQuestionCount: params.webEvalDatasetQuestionCount,
    webEvalDatasetDocumentCount: params.webEvalDatasetDocumentCount,
    webEvalDatasetProviderDiversityCount: params.webEvalDatasetProviderDiversityCount,
    webEvalDatasetFreshnessHours: params.webEvalDatasetFreshnessHours,
    webEvalDatasetSourceCoverage: params.webEvalDatasetSourceCoverage,
    webEvalDatasetAnswerGrounding: params.webEvalDatasetAnswerGrounding,
    webEvalDatasetReportArtifactHashes: params.webEvalDatasetReportArtifactHashes,
    parallelResearchSkillCoverage: params.parallelResearchSkillCoverage,
    parallelResearchSkillSampleSize: params.parallelResearchSkillSampleSize,
    parallelResearchSkillMissingSignals: params.parallelResearchSkillMissingSignals,
    parallelResearchSkillRepositoryRefs: params.parallelResearchSkillRepositoryRefs,
    parallelResearchSkillLicenseRefs: params.parallelResearchSkillLicenseRefs,
    parallelResearchSkillManifestIds: params.parallelResearchSkillManifestIds,
    parallelResearchSkillApiSurfaceIds: params.parallelResearchSkillApiSurfaceIds,
    parallelResearchSkillSearchModeIds: params.parallelResearchSkillSearchModeIds,
    parallelResearchSkillProcessorTiers: params.parallelResearchSkillProcessorTiers,
    parallelResearchSkillSecurityBoundaryRefs: params.parallelResearchSkillSecurityBoundaryRefs,
    parallelResearchSkillDependencyLockIds: params.parallelResearchSkillDependencyLockIds,
    parallelResearchSkillMetricNames: params.parallelResearchSkillMetricNames,
    parallelResearchSkillCitationCoverage0to1: params.parallelResearchSkillCitationCoverage0to1,
    parallelResearchSkillSourcePolicyCoverage0to1: params.parallelResearchSkillSourcePolicyCoverage0to1,
    parallelResearchSkillBatchTaskLimit: params.parallelResearchSkillBatchTaskLimit,
    parallelResearchSkillMonitoringCoverage0to1: params.parallelResearchSkillMonitoringCoverage0to1,
    parallelResearchSkillReportArtifactHashes: params.parallelResearchSkillReportArtifactHashes,
    resumeRagEvaluatorCoverage: params.resumeRagEvaluatorCoverage,
    resumeRagEvaluatorSampleSize: params.resumeRagEvaluatorSampleSize,
    resumeRagEvaluatorMissingSignals: params.resumeRagEvaluatorMissingSignals,
    resumeRagEvaluatorRepositoryRefs: params.resumeRagEvaluatorRepositoryRefs,
    resumeRagEvaluatorLicenseRefs: params.resumeRagEvaluatorLicenseRefs,
    resumeRagEvaluatorResumeInputFormats: params.resumeRagEvaluatorResumeInputFormats,
    resumeRagEvaluatorRagStrategyIds: params.resumeRagEvaluatorRagStrategyIds,
    resumeRagEvaluatorQueryExpansionIds: params.resumeRagEvaluatorQueryExpansionIds,
    resumeRagEvaluatorRetrievalKMin: params.resumeRagEvaluatorRetrievalKMin,
    resumeRagEvaluatorRetrievalKMax: params.resumeRagEvaluatorRetrievalKMax,
    resumeRagEvaluatorVectorStoreIds: params.resumeRagEvaluatorVectorStoreIds,
    resumeRagEvaluatorOllamaModelIds: params.resumeRagEvaluatorOllamaModelIds,
    resumeRagEvaluatorEmbeddingModelIds: params.resumeRagEvaluatorEmbeddingModelIds,
    resumeRagEvaluatorEvaluationEndpointIds: params.resumeRagEvaluatorEvaluationEndpointIds,
    resumeRagEvaluatorCandidateRatingScale: params.resumeRagEvaluatorCandidateRatingScale,
    resumeRagEvaluatorBatchModeIds: params.resumeRagEvaluatorBatchModeIds,
    resumeRagEvaluatorPrivacyBoundaryRefs: params.resumeRagEvaluatorPrivacyBoundaryRefs,
    resumeRagEvaluatorDependencyLockIds: params.resumeRagEvaluatorDependencyLockIds,
    resumeRagEvaluatorMetricNames: params.resumeRagEvaluatorMetricNames,
    resumeRagEvaluatorParserCoverage0to1: params.resumeRagEvaluatorParserCoverage0to1,
    resumeRagEvaluatorEvaluationGrounding0to1: params.resumeRagEvaluatorEvaluationGrounding0to1,
    resumeRagEvaluatorReportArtifactHashes: params.resumeRagEvaluatorReportArtifactHashes,
    chipBenchmarkCoverage: params.chipBenchmarkCoverage,
    chipBenchmarkSampleSize: params.chipBenchmarkSampleSize,
    chipBenchmarkMissingSignals: params.chipBenchmarkMissingSignals,
    chipBenchmarkRepositoryRefs: params.chipBenchmarkRepositoryRefs,
    chipBenchmarkLicenseRefs: params.chipBenchmarkLicenseRefs,
    chipBenchmarkBenchmarkIds: params.chipBenchmarkBenchmarkIds,
    chipBenchmarkHardwareProfileIds: params.chipBenchmarkHardwareProfileIds,
    chipBenchmarkModelFamilyIds: params.chipBenchmarkModelFamilyIds,
    chipBenchmarkPrecisionModeIds: params.chipBenchmarkPrecisionModeIds,
    chipBenchmarkEnvironmentIds: params.chipBenchmarkEnvironmentIds,
    chipBenchmarkRunnerScriptIds: params.chipBenchmarkRunnerScriptIds,
    chipBenchmarkServingBackendIds: params.chipBenchmarkServingBackendIds,
    chipBenchmarkDatasetIds: params.chipBenchmarkDatasetIds,
    chipBenchmarkFrontendDatasetIds: params.chipBenchmarkFrontendDatasetIds,
    chipBenchmarkPricingRefs: params.chipBenchmarkPricingRefs,
    chipBenchmarkMetricNames: params.chipBenchmarkMetricNames,
    chipBenchmarkRegressionThresholdIds: params.chipBenchmarkRegressionThresholdIds,
    chipBenchmarkResultRowCount: params.chipBenchmarkResultRowCount,
    chipBenchmarkThroughputCoverage0to1: params.chipBenchmarkThroughputCoverage0to1,
    chipBenchmarkLatencyCoverage0to1: params.chipBenchmarkLatencyCoverage0to1,
    chipBenchmarkCostCoverage0to1: params.chipBenchmarkCostCoverage0to1,
    chipBenchmarkReportArtifactHashes: params.chipBenchmarkReportArtifactHashes,
    hermesBenchCoverage: params.hermesBenchCoverage,
    hermesBenchSampleSize: params.hermesBenchSampleSize,
    hermesBenchMissingSignals: params.hermesBenchMissingSignals,
    hermesBenchRepositoryRefs: params.hermesBenchRepositoryRefs,
    hermesBenchLicenseRefs: params.hermesBenchLicenseRefs,
    hermesBenchBranchRefs: params.hermesBenchBranchRefs,
    hermesBenchCommitRefs: params.hermesBenchCommitRefs,
    hermesBenchTreeRefs: params.hermesBenchTreeRefs,
    hermesBenchReadmeBlobRefs: params.hermesBenchReadmeBlobRefs,
    hermesBenchBuildSpecRefs: params.hermesBenchBuildSpecRefs,
    hermesBenchBackendTreeRefs: params.hermesBenchBackendTreeRefs,
    hermesBenchFrontendTreeRefs: params.hermesBenchFrontendTreeRefs,
    hermesBenchRunnerIds: params.hermesBenchRunnerIds,
    hermesBenchJudgeIds: params.hermesBenchJudgeIds,
    hermesBenchTaskRegistryIds: params.hermesBenchTaskRegistryIds,
    hermesBenchServerConfigIds: params.hermesBenchServerConfigIds,
    hermesBenchAdapterIds: params.hermesBenchAdapterIds,
    hermesBenchResultSchemaIds: params.hermesBenchResultSchemaIds,
    hermesBenchFrontendComponentIds: params.hermesBenchFrontendComponentIds,
    hermesBenchBackendTestIds: params.hermesBenchBackendTestIds,
    hermesBenchFrontendTestIds: params.hermesBenchFrontendTestIds,
    hermesBenchDockerRuntimeIds: params.hermesBenchDockerRuntimeIds,
    hermesBenchMetricNames: params.hermesBenchMetricNames,
    hermesBenchTaskCount: params.hermesBenchTaskCount,
    hermesBenchAdapterCount: params.hermesBenchAdapterCount,
    hermesBenchBackendTestCount: params.hermesBenchBackendTestCount,
    hermesBenchFrontendTestCount: params.hermesBenchFrontendTestCount,
    hermesBenchJudgeAgreement0to1: params.hermesBenchJudgeAgreement0to1,
    hermesBenchRegressionPassRate0to1: params.hermesBenchRegressionPassRate0to1,
    hermesBenchReportArtifactHashes: params.hermesBenchReportArtifactHashes,
    cooperBenchCoverage: params.cooperBenchCoverage,
    cooperBenchSampleSize: params.cooperBenchSampleSize,
    cooperBenchMissingSignals: params.cooperBenchMissingSignals,
    cooperBenchRepositoryRefs: params.cooperBenchRepositoryRefs,
    cooperBenchLicenseRefs: params.cooperBenchLicenseRefs,
    cooperBenchReleaseRefs: params.cooperBenchReleaseRefs,
    cooperBenchBranchRefs: params.cooperBenchBranchRefs,
    cooperBenchCommitRefs: params.cooperBenchCommitRefs,
    cooperBenchTreeRefs: params.cooperBenchTreeRefs,
    cooperBenchReadmeBlobRefs: params.cooperBenchReadmeBlobRefs,
    cooperBenchChangelogRefs: params.cooperBenchChangelogRefs,
    cooperBenchDatasetTreeRefs: params.cooperBenchDatasetTreeRefs,
    cooperBenchDatasetReadmeRefs: params.cooperBenchDatasetReadmeRefs,
    cooperBenchRunnerIds: params.cooperBenchRunnerIds,
    cooperBenchEvalBackendIds: params.cooperBenchEvalBackendIds,
    cooperBenchTeamHarnessIds: params.cooperBenchTeamHarnessIds,
    cooperBenchAgentAdapterIds: params.cooperBenchAgentAdapterIds,
    cooperBenchCiWorkflowIds: params.cooperBenchCiWorkflowIds,
    cooperBenchPackageLockRefs: params.cooperBenchPackageLockRefs,
    cooperBenchReportPublicationRefs: params.cooperBenchReportPublicationRefs,
    cooperBenchMetricNames: params.cooperBenchMetricNames,
    cooperBenchTaskCount: params.cooperBenchTaskCount,
    cooperBenchFeatureCount: params.cooperBenchFeatureCount,
    cooperBenchAgentAdapterCount: params.cooperBenchAgentAdapterCount,
    cooperBenchTestCount: params.cooperBenchTestCount,
    cooperBenchCooperationScore0to1: params.cooperBenchCooperationScore0to1,
    cooperBenchConflictResolutionRate0to1: params.cooperBenchConflictResolutionRate0to1,
    cooperBenchRegressionPassRate0to1: params.cooperBenchRegressionPassRate0to1,
    cooperBenchReportArtifactHashes: params.cooperBenchReportArtifactHashes,
    coderCupCoverage: params.coderCupCoverage,
    coderCupSampleSize: params.coderCupSampleSize,
    coderCupMissingSignals: params.coderCupMissingSignals,
    coderCupRepositoryRefs: params.coderCupRepositoryRefs,
    coderCupLicenseRefs: params.coderCupLicenseRefs,
    coderCupHomepageRefs: params.coderCupHomepageRefs,
    coderCupBranchRefs: params.coderCupBranchRefs,
    coderCupCommitRefs: params.coderCupCommitRefs,
    coderCupTreeRefs: params.coderCupTreeRefs,
    coderCupReadmeBlobRefs: params.coderCupReadmeBlobRefs,
    coderCupContributingRefs: params.coderCupContributingRefs,
    coderCupCiWorkflowIds: params.coderCupCiWorkflowIds,
    coderCupPackageManifestRefs: params.coderCupPackageManifestRefs,
    coderCupPackageLockRefs: params.coderCupPackageLockRefs,
    coderCupTaskSpecRefs: params.coderCupTaskSpecRefs,
    coderCupTestSuiteRefs: params.coderCupTestSuiteRefs,
    coderCupSuiteIndexRefs: params.coderCupSuiteIndexRefs,
    coderCupRunnerIds: params.coderCupRunnerIds,
    coderCupRunnerContractRefs: params.coderCupRunnerContractRefs,
    coderCupScoreLedgerRefs: params.coderCupScoreLedgerRefs,
    coderCupLiveArtifactRefs: params.coderCupLiveArtifactRefs,
    coderCupMethodologyRefs: params.coderCupMethodologyRefs,
    coderCupReferenceRefs: params.coderCupReferenceRefs,
    coderCupCostMethodologyRefs: params.coderCupCostMethodologyRefs,
    coderCupPublicFixtureRefs: params.coderCupPublicFixtureRefs,
    coderCupMetricNames: params.coderCupMetricNames,
    coderCupPhaseCount: params.coderCupPhaseCount,
    coderCupTestPlanCount: params.coderCupTestPlanCount,
    coderCupRunnerCount: params.coderCupRunnerCount,
    coderCupScoreLedgerCount: params.coderCupScoreLedgerCount,
    coderCupLiveSurfaceCount: params.coderCupLiveSurfaceCount,
    coderCupInterRaterAgreement0to1: params.coderCupInterRaterAgreement0to1,
    coderCupTestRetestReliability0to1: params.coderCupTestRetestReliability0to1,
    coderCupRegressionPassRate0to1: params.coderCupRegressionPassRate0to1,
    coderCupReportArtifactHashes: params.coderCupReportArtifactHashes,
    agenticGraphRagCoverage: params.agenticGraphRagCoverage,
    agenticGraphRagSampleSize: params.agenticGraphRagSampleSize,
    agenticGraphRagMissingSignals: params.agenticGraphRagMissingSignals,
    agenticGraphRagRepositoryRefs: params.agenticGraphRagRepositoryRefs,
    agenticGraphRagLicenseRefs: params.agenticGraphRagLicenseRefs,
    agenticGraphRagBranchRefs: params.agenticGraphRagBranchRefs,
    agenticGraphRagCommitRefs: params.agenticGraphRagCommitRefs,
    agenticGraphRagTreeRefs: params.agenticGraphRagTreeRefs,
    agenticGraphRagReadmeBlobRefs: params.agenticGraphRagReadmeBlobRefs,
    agenticGraphRagGraphWorkflowIds: params.agenticGraphRagGraphWorkflowIds,
    agenticGraphRagOrchestratorIds: params.agenticGraphRagOrchestratorIds,
    agenticGraphRagRagPipelineIds: params.agenticGraphRagRagPipelineIds,
    agenticGraphRagDatabaseIds: params.agenticGraphRagDatabaseIds,
    agenticGraphRagVectorStoreIds: params.agenticGraphRagVectorStoreIds,
    agenticGraphRagEvaluationIds: params.agenticGraphRagEvaluationIds,
    agenticGraphRagExperimentTrackerIds: params.agenticGraphRagExperimentTrackerIds,
    agenticGraphRagUiComponentIds: params.agenticGraphRagUiComponentIds,
    agenticGraphRagDependencyLockRefs: params.agenticGraphRagDependencyLockRefs,
    agenticGraphRagMetricNames: params.agenticGraphRagMetricNames,
    agenticGraphRagGraphNodeCount: params.agenticGraphRagGraphNodeCount,
    agenticGraphRagGraphEdgeCount: params.agenticGraphRagGraphEdgeCount,
    agenticGraphRagEvaluationMetricCount: params.agenticGraphRagEvaluationMetricCount,
    agenticGraphRagExperimentCount: params.agenticGraphRagExperimentCount,
    agenticGraphRagRetrievalGroundingScore0to1: params.agenticGraphRagRetrievalGroundingScore0to1,
    agenticGraphRagRegressionPassRate0to1: params.agenticGraphRagRegressionPassRate0to1,
    agenticGraphRagReportArtifactHashes: params.agenticGraphRagReportArtifactHashes,
    agentScenarioTestCoverage: params.agentScenarioTestCoverage,
    agentScenarioTestSampleSize: params.agentScenarioTestSampleSize,
    agentScenarioTestMissingSignals: params.agentScenarioTestMissingSignals,
    agentScenarioTestBenchmarkIds: params.agentScenarioTestBenchmarkIds,
    agentScenarioTestRepositoryRefs: params.agentScenarioTestRepositoryRefs,
    agentScenarioTestLicenseRefs: params.agentScenarioTestLicenseRefs,
    agentScenarioTestScenarioIds: params.agentScenarioTestScenarioIds,
    agentScenarioTestPersonaIds: params.agentScenarioTestPersonaIds,
    agentScenarioTestGoalIds: params.agentScenarioTestGoalIds,
    agentScenarioTestKnowledgeSetIds: params.agentScenarioTestKnowledgeSetIds,
    agentScenarioTestToolMockIds: params.agentScenarioTestToolMockIds,
    agentScenarioTestTrajectoryAssertionIds: params.agentScenarioTestTrajectoryAssertionIds,
    agentScenarioTestJudgeIds: params.agentScenarioTestJudgeIds,
    agentScenarioTestMetricNames: params.agentScenarioTestMetricNames,
    agentScenarioTestReporterFormats: params.agentScenarioTestReporterFormats,
    agentScenarioTestAgentIds: params.agentScenarioTestAgentIds,
    agentScenarioTestComparisonIds: params.agentScenarioTestComparisonIds,
    agentScenarioTestScenarioCount: params.agentScenarioTestScenarioCount,
    agentScenarioTestTurnCount: params.agentScenarioTestTurnCount,
    agentScenarioTestToolCallCount: params.agentScenarioTestToolCallCount,
    agentScenarioTestReportArtifactHashes: params.agentScenarioTestReportArtifactHashes,
    openCodeLabCoverage: params.openCodeLabCoverage,
    openCodeLabSampleSize: params.openCodeLabSampleSize,
    openCodeLabMissingSignals: params.openCodeLabMissingSignals,
    openCodeLabBenchmarkIds: params.openCodeLabBenchmarkIds,
    openCodeLabRepositoryRefs: params.openCodeLabRepositoryRefs,
    openCodeLabAgentContextIds: params.openCodeLabAgentContextIds,
    openCodeLabPromptVariantIds: params.openCodeLabPromptVariantIds,
    openCodeLabToolDescriptionIds: params.openCodeLabToolDescriptionIds,
    openCodeLabPolicyIds: params.openCodeLabPolicyIds,
    openCodeLabRunTraceIds: params.openCodeLabRunTraceIds,
    openCodeLabForkIds: params.openCodeLabForkIds,
    openCodeLabModelIds: params.openCodeLabModelIds,
    openCodeLabGroundTruthIds: params.openCodeLabGroundTruthIds,
    openCodeLabMetricNames: params.openCodeLabMetricNames,
    openCodeLabReporterFormats: params.openCodeLabReporterFormats,
    openCodeLabResultArtifactIds: params.openCodeLabResultArtifactIds,
    openCodeLabRunCount: params.openCodeLabRunCount,
    openCodeLabForkAgreement0to1: params.openCodeLabForkAgreement0to1,
    openCodeLabModelVariance0to1: params.openCodeLabModelVariance0to1,
    openCodeLabReportArtifactHashes: params.openCodeLabReportArtifactHashes,
    ccPluginEvalCoverage: params.ccPluginEvalCoverage,
    ccPluginEvalSampleSize: params.ccPluginEvalSampleSize,
    ccPluginEvalMissingSignals: params.ccPluginEvalMissingSignals,
    ccPluginEvalRepositoryRefs: params.ccPluginEvalRepositoryRefs,
    ccPluginEvalLicenseRefs: params.ccPluginEvalLicenseRefs,
    ccPluginEvalPluginManifestIds: params.ccPluginEvalPluginManifestIds,
    ccPluginEvalComponentTypes: params.ccPluginEvalComponentTypes,
    ccPluginEvalTriggerManifestIds: params.ccPluginEvalTriggerManifestIds,
    ccPluginEvalScenarioManifestIds: params.ccPluginEvalScenarioManifestIds,
    ccPluginEvalScenarioTypes: params.ccPluginEvalScenarioTypes,
    ccPluginEvalTranscriptIds: params.ccPluginEvalTranscriptIds,
    ccPluginEvalDetectionReportIds: params.ccPluginEvalDetectionReportIds,
    ccPluginEvalDetectionModes: params.ccPluginEvalDetectionModes,
    ccPluginEvalJudgeIds: params.ccPluginEvalJudgeIds,
    ccPluginEvalCalibrationIds: params.ccPluginEvalCalibrationIds,
    ccPluginEvalConflictReportIds: params.ccPluginEvalConflictReportIds,
    ccPluginEvalCheckpointStateIds: params.ccPluginEvalCheckpointStateIds,
    ccPluginEvalCostEstimateIds: params.ccPluginEvalCostEstimateIds,
    ccPluginEvalReporterFormats: params.ccPluginEvalReporterFormats,
    ccPluginEvalResultArtifactIds: params.ccPluginEvalResultArtifactIds,
    ccPluginEvalMetricNames: params.ccPluginEvalMetricNames,
    ccPluginEvalTriggerAccuracy0to1: params.ccPluginEvalTriggerAccuracy0to1,
    ccPluginEvalFalsePositiveRate0to1: params.ccPluginEvalFalsePositiveRate0to1,
    ccPluginEvalFalseNegativeRate0to1: params.ccPluginEvalFalseNegativeRate0to1,
    ccPluginEvalComponentCount: params.ccPluginEvalComponentCount,
    ccPluginEvalScenarioCount: params.ccPluginEvalScenarioCount,
    ccPluginEvalReportArtifactHashes: params.ccPluginEvalReportArtifactHashes,
    realignSimulationCoverage: params.realignSimulationCoverage,
    realignSimulationSampleSize: params.realignSimulationSampleSize,
    realignSimulationMissingSignals: params.realignSimulationMissingSignals,
    realignSimulationRepositoryRefs: params.realignSimulationRepositoryRefs,
    realignSimulationLicenseRefs: params.realignSimulationLicenseRefs,
    realignSimulationConfigIds: params.realignSimulationConfigIds,
    realignSimulationAppIds: params.realignSimulationAppIds,
    realignSimulationDatasetIds: params.realignSimulationDatasetIds,
    realignSimulationScenarioIds: params.realignSimulationScenarioIds,
    realignSimulationPersonaIds: params.realignSimulationPersonaIds,
    realignSimulationEvaluatorIds: params.realignSimulationEvaluatorIds,
    realignSimulationTargetIds: params.realignSimulationTargetIds,
    realignSimulationRunTraceIds: params.realignSimulationRunTraceIds,
    realignSimulationRepeatedRunTraceIds: params.realignSimulationRepeatedRunTraceIds,
    realignSimulationJudgeIds: params.realignSimulationJudgeIds,
    realignSimulationCalibrationIds: params.realignSimulationCalibrationIds,
    realignSimulationStatisticsReportIds: params.realignSimulationStatisticsReportIds,
    realignSimulationCiReporterIds: params.realignSimulationCiReporterIds,
    realignSimulationReporterFormats: params.realignSimulationReporterFormats,
    realignSimulationExperimentIds: params.realignSimulationExperimentIds,
    realignSimulationResultArtifactIds: params.realignSimulationResultArtifactIds,
    realignSimulationMetricNames: params.realignSimulationMetricNames,
    realignSimulationJudgeAgreement0to1: params.realignSimulationJudgeAgreement0to1,
    realignSimulationRegressionPassRate0to1: params.realignSimulationRegressionPassRate0to1,
    realignSimulationScenarioCount: params.realignSimulationScenarioCount,
    realignSimulationEvaluatorCount: params.realignSimulationEvaluatorCount,
    realignSimulationRepeatCount: params.realignSimulationRepeatCount,
    realignSimulationReportArtifactHashes: params.realignSimulationReportArtifactHashes,
    academiClawCoverage: params.academiClawCoverage,
    academiClawSampleSize: params.academiClawSampleSize,
    academiClawMissingSignals: params.academiClawMissingSignals,
    academiClawRepositoryRefs: params.academiClawRepositoryRefs,
    academiClawLicenseRefs: params.academiClawLicenseRefs,
    academiClawBranchRefs: params.academiClawBranchRefs,
    academiClawCommitRefs: params.academiClawCommitRefs,
    academiClawTreeRefs: params.academiClawTreeRefs,
    academiClawReadmeBlobRefs: params.academiClawReadmeBlobRefs,
    academiClawCitationRefs: params.academiClawCitationRefs,
    academiClawTaskCorpusRefs: params.academiClawTaskCorpusRefs,
    academiClawLanguageIds: params.academiClawLanguageIds,
    academiClawWorkspaceQueryIds: params.academiClawWorkspaceQueryIds,
    academiClawDockerImageIds: params.academiClawDockerImageIds,
    academiClawRubricIds: params.academiClawRubricIds,
    academiClawEvalTaskRunnerIds: params.academiClawEvalTaskRunnerIds,
    academiClawResultManifestIds: params.academiClawResultManifestIds,
    academiClawConversationTraceIds: params.academiClawConversationTraceIds,
    academiClawMetaEvalIds: params.academiClawMetaEvalIds,
    academiClawModelIds: params.academiClawModelIds,
    academiClawMetricNames: params.academiClawMetricNames,
    academiClawCiReporterIds: params.academiClawCiReporterIds,
    academiClawReporterFormats: params.academiClawReporterFormats,
    academiClawTaskCount: params.academiClawTaskCount,
    academiClawLanguageCount: params.academiClawLanguageCount,
    academiClawRubricCount: params.academiClawRubricCount,
    academiClawTraceCount: params.academiClawTraceCount,
    academiClawMetaEvalCount: params.academiClawMetaEvalCount,
    academiClawModelCount: params.academiClawModelCount,
    academiClawRegressionPassRate0to1: params.academiClawRegressionPassRate0to1,
    academiClawReportArtifactHashes: params.academiClawReportArtifactHashes,
    ragChunkingTechniqueCoverage: params.ragChunkingTechniqueCoverage,
    ragChunkingTechniqueSampleSize: params.ragChunkingTechniqueSampleSize,
    ragChunkingTechniqueMissingSignals: params.ragChunkingTechniqueMissingSignals,
    ragChunkingTechniqueRepositoryRefs: params.ragChunkingTechniqueRepositoryRefs,
    ragChunkingTechniqueLicenseRefs: params.ragChunkingTechniqueLicenseRefs,
    ragChunkingTechniqueBranchRefs: params.ragChunkingTechniqueBranchRefs,
    ragChunkingTechniqueCommitRefs: params.ragChunkingTechniqueCommitRefs,
    ragChunkingTechniqueTreeRefs: params.ragChunkingTechniqueTreeRefs,
    ragChunkingTechniqueReadmeBlobRefs: params.ragChunkingTechniqueReadmeBlobRefs,
    ragChunkingTechniquePolicyCorpusRefs: params.ragChunkingTechniquePolicyCorpusRefs,
    ragChunkingTechniqueNotebookIds: params.ragChunkingTechniqueNotebookIds,
    ragChunkingTechniqueChunkingStrategyIds: params.ragChunkingTechniqueChunkingStrategyIds,
    ragChunkingTechniqueRetrievalPipelineIds: params.ragChunkingTechniqueRetrievalPipelineIds,
    ragChunkingTechniqueEmbeddingVectorstoreIds: params.ragChunkingTechniqueEmbeddingVectorstoreIds,
    ragChunkingTechniqueEvaluationDatasetIds: params.ragChunkingTechniqueEvaluationDatasetIds,
    ragChunkingTechniqueMetricNames: params.ragChunkingTechniqueMetricNames,
    ragChunkingTechniqueCiReporterIds: params.ragChunkingTechniqueCiReporterIds,
    ragChunkingTechniqueReporterFormats: params.ragChunkingTechniqueReporterFormats,
    ragChunkingTechniquePolicyDocumentCount: params.ragChunkingTechniquePolicyDocumentCount,
    ragChunkingTechniqueNotebookCount: params.ragChunkingTechniqueNotebookCount,
    ragChunkingTechniqueChunkingStrategyCount: params.ragChunkingTechniqueChunkingStrategyCount,
    ragChunkingTechniqueEvaluationQuestionCount: params.ragChunkingTechniqueEvaluationQuestionCount,
    ragChunkingTechniqueMetricCount: params.ragChunkingTechniqueMetricCount,
    ragChunkingTechniqueRegressionPassRate0to1: params.ragChunkingTechniqueRegressionPassRate0to1,
    ragChunkingTechniqueReportArtifactHashes: params.ragChunkingTechniqueReportArtifactHashes,
    kubernetesOperationalAgentCoverage: params.kubernetesOperationalAgentCoverage,
    kubernetesOperationalAgentSampleSize: params.kubernetesOperationalAgentSampleSize,
    kubernetesOperationalAgentMissingSignals: params.kubernetesOperationalAgentMissingSignals,
    kubernetesOperationalAgentRepositoryRefs: params.kubernetesOperationalAgentRepositoryRefs,
    kubernetesOperationalAgentLicenseRefs: params.kubernetesOperationalAgentLicenseRefs,
    kubernetesOperationalAgentReleaseRefs: params.kubernetesOperationalAgentReleaseRefs,
    kubernetesOperationalAgentBranchRefs: params.kubernetesOperationalAgentBranchRefs,
    kubernetesOperationalAgentCommitRefs: params.kubernetesOperationalAgentCommitRefs,
    kubernetesOperationalAgentTreeRefs: params.kubernetesOperationalAgentTreeRefs,
    kubernetesOperationalAgentReadmeBlobRefs: params.kubernetesOperationalAgentReadmeBlobRefs,
    kubernetesOperationalAgentBuildWorkflowRefs: params.kubernetesOperationalAgentBuildWorkflowRefs,
    kubernetesOperationalAgentAgentModuleRefs: params.kubernetesOperationalAgentAgentModuleRefs,
    kubernetesOperationalAgentMcpServerModuleRefs: params.kubernetesOperationalAgentMcpServerModuleRefs,
    kubernetesOperationalAgentToolModuleRefs: params.kubernetesOperationalAgentToolModuleRefs,
    kubernetesOperationalAgentToolCategoryIds: params.kubernetesOperationalAgentToolCategoryIds,
    kubernetesOperationalAgentDiagnosticCapabilityIds: params.kubernetesOperationalAgentDiagnosticCapabilityIds,
    kubernetesOperationalAgentResourceMetricIds: params.kubernetesOperationalAgentResourceMetricIds,
    kubernetesOperationalAgentLogAnalysisIds: params.kubernetesOperationalAgentLogAnalysisIds,
    kubernetesOperationalAgentMetricNames: params.kubernetesOperationalAgentMetricNames,
    kubernetesOperationalAgentCiReporterIds: params.kubernetesOperationalAgentCiReporterIds,
    kubernetesOperationalAgentReporterFormats: params.kubernetesOperationalAgentReporterFormats,
    kubernetesOperationalAgentToolCategoryCount: params.kubernetesOperationalAgentToolCategoryCount,
    kubernetesOperationalAgentDiagnosticCapabilityCount: params.kubernetesOperationalAgentDiagnosticCapabilityCount,
    kubernetesOperationalAgentResourceMetricCount: params.kubernetesOperationalAgentResourceMetricCount,
    kubernetesOperationalAgentLogAnalysisCount: params.kubernetesOperationalAgentLogAnalysisCount,
    kubernetesOperationalAgentRegressionPassRate0to1: params.kubernetesOperationalAgentRegressionPassRate0to1,
    kubernetesOperationalAgentReportArtifactHashes: params.kubernetesOperationalAgentReportArtifactHashes,
    secureVibeBenchCoverage: params.secureVibeBenchCoverage,
    secureVibeBenchSampleSize: params.secureVibeBenchSampleSize,
    secureVibeBenchMissingSignals: params.secureVibeBenchMissingSignals,
    secureVibeBenchRepositoryRefs: params.secureVibeBenchRepositoryRefs,
    secureVibeBenchLicenseRefs: params.secureVibeBenchLicenseRefs,
    secureVibeBenchHomepageRefs: params.secureVibeBenchHomepageRefs,
    secureVibeBenchArxivRefs: params.secureVibeBenchArxivRefs,
    secureVibeBenchBranchRefs: params.secureVibeBenchBranchRefs,
    secureVibeBenchCommitRefs: params.secureVibeBenchCommitRefs,
    secureVibeBenchTreeRefs: params.secureVibeBenchTreeRefs,
    secureVibeBenchReadmeBlobRefs: params.secureVibeBenchReadmeBlobRefs,
    secureVibeBenchResultsBlobRefs: params.secureVibeBenchResultsBlobRefs,
    secureVibeBenchDatasetRefs: params.secureVibeBenchDatasetRefs,
    secureVibeBenchFormatExampleRefs: params.secureVibeBenchFormatExampleRefs,
    secureVibeBenchEvaluationRunnerRefs: params.secureVibeBenchEvaluationRunnerRefs,
    secureVibeBenchAgentAdapterIds: params.secureVibeBenchAgentAdapterIds,
    secureVibeBenchVulnerabilityScenarioIds: params.secureVibeBenchVulnerabilityScenarioIds,
    secureVibeBenchTestScriptIds: params.secureVibeBenchTestScriptIds,
    secureVibeBenchParserUtilityRefs: params.secureVibeBenchParserUtilityRefs,
    secureVibeBenchPatchDiffUtilityRefs: params.secureVibeBenchPatchDiffUtilityRefs,
    secureVibeBenchMetricNames: params.secureVibeBenchMetricNames,
    secureVibeBenchCiReporterIds: params.secureVibeBenchCiReporterIds,
    secureVibeBenchReporterFormats: params.secureVibeBenchReporterFormats,
    secureVibeBenchAgentAdapterCount: params.secureVibeBenchAgentAdapterCount,
    secureVibeBenchScenarioCount: params.secureVibeBenchScenarioCount,
    secureVibeBenchTestScriptCount: params.secureVibeBenchTestScriptCount,
    secureVibeBenchRegressionPassRate0to1: params.secureVibeBenchRegressionPassRate0to1,
    secureVibeBenchReportArtifactHashes: params.secureVibeBenchReportArtifactHashes,
    ravigBenchCoverage: params.ravigBenchCoverage,
    ravigBenchSampleSize: params.ravigBenchSampleSize,
    ravigBenchMissingSignals: params.ravigBenchMissingSignals,
    ravigBenchRepositoryRefs: params.ravigBenchRepositoryRefs,
    ravigBenchLicenseRefs: params.ravigBenchLicenseRefs,
    ravigBenchBranchRefs: params.ravigBenchBranchRefs,
    ravigBenchCommitRefs: params.ravigBenchCommitRefs,
    ravigBenchTreeRefs: params.ravigBenchTreeRefs,
    ravigBenchReadmeBlobRefs: params.ravigBenchReadmeBlobRefs,
    ravigBenchLegalBlobRefs: params.ravigBenchLegalBlobRefs,
    ravigBenchEnvironmentRefs: params.ravigBenchEnvironmentRefs,
    ravigBenchConfigurationRefs: params.ravigBenchConfigurationRefs,
    ravigBenchContentEvaluationRefs: params.ravigBenchContentEvaluationRefs,
    ravigBenchDesignEvaluationRefs: params.ravigBenchDesignEvaluationRefs,
    ravigBenchExecutionEvaluationRefs: params.ravigBenchExecutionEvaluationRefs,
    ravigBenchFunctionScoringRefs: params.ravigBenchFunctionScoringRefs,
    ravigBenchDatasetRefs: params.ravigBenchDatasetRefs,
    ravigBenchTestCaseRefs: params.ravigBenchTestCaseRefs,
    ravigBenchModelResultRefs: params.ravigBenchModelResultRefs,
    ravigBenchTaxonomyIds: params.ravigBenchTaxonomyIds,
    ravigBenchRetrievalContextIds: params.ravigBenchRetrievalContextIds,
    ravigBenchMultiModalEvaluatorIds: params.ravigBenchMultiModalEvaluatorIds,
    ravigBenchScreenshotEvaluationRefs: params.ravigBenchScreenshotEvaluationRefs,
    ravigBenchRunScriptRefs: params.ravigBenchRunScriptRefs,
    ravigBenchMetricNames: params.ravigBenchMetricNames,
    ravigBenchCiReporterIds: params.ravigBenchCiReporterIds,
    ravigBenchReporterFormats: params.ravigBenchReporterFormats,
    ravigBenchDatasetCaseCount: params.ravigBenchDatasetCaseCount,
    ravigBenchVisualDesignCheckCount: params.ravigBenchVisualDesignCheckCount,
    ravigBenchEvaluatorCount: params.ravigBenchEvaluatorCount,
    ravigBenchValidationPassRate0to1: params.ravigBenchValidationPassRate0to1,
    ravigBenchReportArtifactHashes: params.ravigBenchReportArtifactHashes,
    humanStudyBenchCoverage: params.humanStudyBenchCoverage,
    humanStudyBenchSampleSize: params.humanStudyBenchSampleSize,
    humanStudyBenchMissingSignals: params.humanStudyBenchMissingSignals,
    humanStudyBenchRepositoryRefs: params.humanStudyBenchRepositoryRefs,
    humanStudyBenchLicenseRefs: params.humanStudyBenchLicenseRefs,
    humanStudyBenchBranchRefs: params.humanStudyBenchBranchRefs,
    humanStudyBenchCommitRefs: params.humanStudyBenchCommitRefs,
    humanStudyBenchStudyConfigIds: params.humanStudyBenchStudyConfigIds,
    humanStudyBenchBackgroundDatasetIds: params.humanStudyBenchBackgroundDatasetIds,
    humanStudyBenchHumanResponseDatasetIds: params.humanStudyBenchHumanResponseDatasetIds,
    humanStudyBenchAgentResponseDatasetIds: params.humanStudyBenchAgentResponseDatasetIds,
    humanStudyBenchEvaluatorIds: params.humanStudyBenchEvaluatorIds,
    humanStudyBenchMetricNames: params.humanStudyBenchMetricNames,
    humanStudyBenchValidatorIds: params.humanStudyBenchValidatorIds,
    humanStudyBenchScorerIds: params.humanStudyBenchScorerIds,
    humanStudyBenchStandardizerIds: params.humanStudyBenchStandardizerIds,
    humanStudyBenchReliabilityReportIds: params.humanStudyBenchReliabilityReportIds,
    humanStudyBenchValidationPipelineIds: params.humanStudyBenchValidationPipelineIds,
    humanStudyBenchResultArtifactIds: params.humanStudyBenchResultArtifactIds,
    humanStudyBenchCiReporterIds: params.humanStudyBenchCiReporterIds,
    humanStudyBenchReporterFormats: params.humanStudyBenchReporterFormats,
    humanStudyBenchStudyCount: params.humanStudyBenchStudyCount,
    humanStudyBenchParticipantCount: params.humanStudyBenchParticipantCount,
    humanStudyBenchResponseCount: params.humanStudyBenchResponseCount,
    humanStudyBenchEvaluatorCount: params.humanStudyBenchEvaluatorCount,
    humanStudyBenchInterRaterAgreement0to1: params.humanStudyBenchInterRaterAgreement0to1,
    humanStudyBenchTestRetestReliability0to1: params.humanStudyBenchTestRetestReliability0to1,
    humanStudyBenchValidationPassRate0to1: params.humanStudyBenchValidationPassRate0to1,
    humanStudyBenchReportArtifactHashes: params.humanStudyBenchReportArtifactHashes,
    legacyBenchCoverage: params.legacyBenchCoverage,
    legacyBenchSampleSize: params.legacyBenchSampleSize,
    legacyBenchMissingSignals: params.legacyBenchMissingSignals,
    legacyBenchRepositoryRefs: params.legacyBenchRepositoryRefs,
    legacyBenchLicenseRefs: params.legacyBenchLicenseRefs,
    legacyBenchBranchRefs: params.legacyBenchBranchRefs,
    legacyBenchCommitRefs: params.legacyBenchCommitRefs,
    legacyBenchTreeRefs: params.legacyBenchTreeRefs,
    legacyBenchReadmeBlobRefs: params.legacyBenchReadmeBlobRefs,
    legacyBenchTaskCorpusRefs: params.legacyBenchTaskCorpusRefs,
    legacyBenchLegacyLanguageIds: params.legacyBenchLegacyLanguageIds,
    legacyBenchEnvironmentIds: params.legacyBenchEnvironmentIds,
    legacyBenchHarnessRunnerIds: params.legacyBenchHarnessRunnerIds,
    legacyBenchAgentTaskIds: params.legacyBenchAgentTaskIds,
    legacyBenchPatchSubmissionIds: params.legacyBenchPatchSubmissionIds,
    legacyBenchTestOracleIds: params.legacyBenchTestOracleIds,
    legacyBenchEvaluatorIds: params.legacyBenchEvaluatorIds,
    legacyBenchMetricNames: params.legacyBenchMetricNames,
    legacyBenchCiReporterIds: params.legacyBenchCiReporterIds,
    legacyBenchReporterFormats: params.legacyBenchReporterFormats,
    legacyBenchResultArtifactIds: params.legacyBenchResultArtifactIds,
    legacyBenchReplayCommandIds: params.legacyBenchReplayCommandIds,
    legacyBenchTaskCount: params.legacyBenchTaskCount,
    legacyBenchLanguageCount: params.legacyBenchLanguageCount,
    legacyBenchEnvironmentCount: params.legacyBenchEnvironmentCount,
    legacyBenchTestOracleCount: params.legacyBenchTestOracleCount,
    legacyBenchEvaluatorCount: params.legacyBenchEvaluatorCount,
    legacyBenchRegressionPassRate0to1: params.legacyBenchRegressionPassRate0to1,
    legacyBenchReplayPassRate0to1: params.legacyBenchReplayPassRate0to1,
    legacyBenchReportArtifactHashes: params.legacyBenchReportArtifactHashes,
    subtleMemoryCoverage: params.subtleMemoryCoverage,
    subtleMemorySampleSize: params.subtleMemorySampleSize,
    subtleMemoryMissingSignals: params.subtleMemoryMissingSignals,
    subtleMemoryRepositoryRefs: params.subtleMemoryRepositoryRefs,
    subtleMemoryLicenseRefs: params.subtleMemoryLicenseRefs,
    subtleMemoryBranchRefs: params.subtleMemoryBranchRefs,
    subtleMemoryCommitRefs: params.subtleMemoryCommitRefs,
    subtleMemoryTreeRefs: params.subtleMemoryTreeRefs,
    subtleMemoryArxivRefs: params.subtleMemoryArxivRefs,
    subtleMemoryDatasetRefs: params.subtleMemoryDatasetRefs,
    subtleMemoryPersonaIds: params.subtleMemoryPersonaIds,
    subtleMemoryBenchInstanceManifestIds: params.subtleMemoryBenchInstanceManifestIds,
    subtleMemoryHistorySessionManifestIds: params.subtleMemoryHistorySessionManifestIds,
    subtleMemoryRelationTypes: params.subtleMemoryRelationTypes,
    subtleMemoryConstructionPipelineIds: params.subtleMemoryConstructionPipelineIds,
    subtleMemoryEvaluationStageIds: params.subtleMemoryEvaluationStageIds,
    subtleMemoryAdapterIds: params.subtleMemoryAdapterIds,
    subtleMemoryJudgeIds: params.subtleMemoryJudgeIds,
    subtleMemoryEvaluatorIds: params.subtleMemoryEvaluatorIds,
    subtleMemoryMetricNames: params.subtleMemoryMetricNames,
    subtleMemoryScoreSummaryIds: params.subtleMemoryScoreSummaryIds,
    subtleMemoryDiagnosticProtocolIds: params.subtleMemoryDiagnosticProtocolIds,
    subtleMemoryCiReporterIds: params.subtleMemoryCiReporterIds,
    subtleMemoryReporterFormats: params.subtleMemoryReporterFormats,
    subtleMemoryPersonaCount: params.subtleMemoryPersonaCount,
    subtleMemoryBenchInstanceCount: params.subtleMemoryBenchInstanceCount,
    subtleMemoryHistoryCount: params.subtleMemoryHistoryCount,
    subtleMemoryMemoryVariantSetCount: params.subtleMemoryMemoryVariantSetCount,
    subtleMemoryRelationTypeCount: params.subtleMemoryRelationTypeCount,
    subtleMemoryEvaluationStageCount: params.subtleMemoryEvaluationStageCount,
    subtleMemoryAdapterCount: params.subtleMemoryAdapterCount,
    subtleMemoryJudgeAgreement0to1: params.subtleMemoryJudgeAgreement0to1,
    subtleMemoryValidationPassRate0to1: params.subtleMemoryValidationPassRate0to1,
    subtleMemoryReportArtifactHashes: params.subtleMemoryReportArtifactHashes,
    confidenceInterval: interval,
    status,
    evidenceRefs,
    warnings: warningsForRow({
      sampleSize: params.values.length,
      constructValidity: params.constructValidity,
      ciWidth,
      testRetestStability,
      interRaterAgreement: params.interRaterAgreement,
      counterfactualResponsiveness: params.counterfactualResponsiveness,
      counterfactualSampleSize: params.counterfactualSampleSize,
      validationFacetCoverage: params.validationFacetCoverage,
      validationFacetSampleSize: params.validationFacetSampleSize,
      confounderControlCoverage: params.confounderControlCoverage,
      confounderControlSampleSize: params.confounderControlSampleSize,
      outcomeAlignment: params.outcomeAlignment,
      outcomeAlignmentSampleSize: params.outcomeAlignmentSampleSize,
      processEvidenceCoverage: params.processEvidenceCoverage,
      processEvidenceSampleSize: params.processEvidenceSampleSize,
      safetyUtilityCoverage: params.safetyUtilityCoverage,
      safetyUtilitySampleSize: params.safetyUtilitySampleSize,
      modalityTransformationCoverage: params.modalityTransformationCoverage,
      modalityTransformationSampleSize: params.modalityTransformationSampleSize,
      lifecycleObservabilityCoverage: params.lifecycleObservabilityCoverage,
      lifecycleObservabilitySampleSize: params.lifecycleObservabilitySampleSize,
      rankingStabilityCoverage: params.rankingStabilityCoverage,
      rankingStabilitySampleSize: params.rankingStabilitySampleSize,
      toolSandboxCoverage: params.toolSandboxCoverage,
      toolSandboxSampleSize: params.toolSandboxSampleSize,
      continualLearningCoverage: params.continualLearningCoverage,
      continualLearningSampleSize: params.continualLearningSampleSize,
      continualLearningRunCount: params.continualLearningRunCount,
      continualLearningMissingSignals: params.continualLearningMissingSignals,
      strategicInteractionCoverage: params.strategicInteractionCoverage,
      strategicInteractionSampleSize: params.strategicInteractionSampleSize,
      architectureRealityCoverage: params.architectureRealityCoverage,
      architectureRealitySampleSize: params.architectureRealitySampleSize,
      architectureRealityStressScenarioCount: params.architectureRealityStressScenarioCount,
      architectureRealityNetworkScenarioCount: params.architectureRealityNetworkScenarioCount,
      architectureRealityEnsemblePatternCount: params.architectureRealityEnsemblePatternCount,
      architectureRealityMissingSignals: params.architectureRealityMissingSignals,
      ragPipelineCoverage: params.ragPipelineCoverage,
      ragPipelineSampleSize: params.ragPipelineSampleSize,
      ragEvaluationPipelineCoverage: params.ragEvaluationPipelineCoverage,
      ragEvaluationPipelineSampleSize: params.ragEvaluationPipelineSampleSize,
      ragEvaluationPipelineCaseSampleSizeMin: params.ragEvaluationPipelineCaseSampleSizeMin,
      ragEvaluationPipelineMissingSignals: params.ragEvaluationPipelineMissingSignals,
      ragasNotebookCoverage: params.ragasNotebookCoverage,
      ragasNotebookSampleSize: params.ragasNotebookSampleSize,
      ragasNotebookMissingSignals: params.ragasNotebookMissingSignals,
      ragasNotebookQuestionCount: params.ragasNotebookQuestionCount,
      mirageRagMetricCoverage: params.mirageRagMetricCoverage,
      mirageRagMetricSampleSize: params.mirageRagMetricSampleSize,
      mirageRagMetricMissingSignals: params.mirageRagMetricMissingSignals,
      mirageRagMetricQaPairCount: params.mirageRagMetricQaPairCount,
      mirageRagMetricContextPoolCount: params.mirageRagMetricContextPoolCount,
      legalCodeRagCoverage: params.legalCodeRagCoverage,
      legalCodeRagSampleSize: params.legalCodeRagSampleSize,
      legalCodeRagMissingSignals: params.legalCodeRagMissingSignals,
      legalCodeRagQuestionCount: params.legalCodeRagQuestionCount,
      guardbenchMetricCoverage: params.guardbenchMetricCoverage,
      guardbenchMetricSampleSize: params.guardbenchMetricSampleSize,
      guardbenchMetricMissingSignals: params.guardbenchMetricMissingSignals,
      businessWorkflowCoverage: params.businessWorkflowCoverage,
      businessWorkflowSampleSize: params.businessWorkflowSampleSize,
      dataAgentAnalyticalCoverage: params.dataAgentAnalyticalCoverage,
      dataAgentAnalyticalSampleSize: params.dataAgentAnalyticalSampleSize,
      embodiedAgentCoverage: params.embodiedAgentCoverage,
      embodiedAgentSampleSize: params.embodiedAgentSampleSize,
      embodiedAgentMissingSignals: params.embodiedAgentMissingSignals,
      evaluatorSuiteCoverage: params.evaluatorSuiteCoverage,
      evaluatorSuiteSampleSize: params.evaluatorSuiteSampleSize,
      evaluatorSuiteMissingSignals: params.evaluatorSuiteMissingSignals,
      pentestBenchmarkCoverage: params.pentestBenchmarkCoverage,
      pentestBenchmarkSampleSize: params.pentestBenchmarkSampleSize,
      pentestBenchmarkMissingSignals: params.pentestBenchmarkMissingSignals,
      traceEvaluationCoverage: params.traceEvaluationCoverage,
      traceEvaluationSampleSize: params.traceEvaluationSampleSize,
      traceEvaluationMissingSignals: params.traceEvaluationMissingSignals,
      livingEnvironmentCoverage: params.livingEnvironmentCoverage,
      livingEnvironmentSampleSize: params.livingEnvironmentSampleSize,
      livingEnvironmentMissingSignals: params.livingEnvironmentMissingSignals,
      mobileAgentCoverage: params.mobileAgentCoverage,
      mobileAgentSampleSize: params.mobileAgentSampleSize,
      mobileAgentMissingSignals: params.mobileAgentMissingSignals,
      mobileAgentTrialCount: params.mobileAgentTrialCount,
      personaAgentCoverage: params.personaAgentCoverage,
      personaAgentSampleSize: params.personaAgentSampleSize,
      personaAgentMissingSignals: params.personaAgentMissingSignals,
      scientificLiteratureCoverage: params.scientificLiteratureCoverage,
      scientificLiteratureSampleSize: params.scientificLiteratureSampleSize,
      scientificLiteratureMissingSignals: params.scientificLiteratureMissingSignals,
      scientificLiteratureTaskCount: params.scientificLiteratureTaskCount,
      bioinformaticsAgentCoverage: params.bioinformaticsAgentCoverage,
      bioinformaticsAgentSampleSize: params.bioinformaticsAgentSampleSize,
      bioinformaticsAgentMissingSignals: params.bioinformaticsAgentMissingSignals,
      bioinformaticsAgentTaskCount: params.bioinformaticsAgentTaskCount,
      mirageDrugRepositioningCoverage: params.mirageDrugRepositioningCoverage,
      mirageDrugRepositioningSampleSize: params.mirageDrugRepositioningSampleSize,
      mirageDrugRepositioningMissingSignals: params.mirageDrugRepositioningMissingSignals,
      mirageDrugRepositioningDrugCount: params.mirageDrugRepositioningDrugCount,
      mirageDrugRepositioningDiseaseCount: params.mirageDrugRepositioningDiseaseCount,
      mirageDrugRepositioningMappingCount: params.mirageDrugRepositioningMappingCount,
      mirageDrugRepositioningFeatureSetCount: params.mirageDrugRepositioningFeatureSetCount,
      mirageDrugRepositioningSimilarityMatrixCount: params.mirageDrugRepositioningSimilarityMatrixCount,
      networkTroubleshootingCoverage: params.networkTroubleshootingCoverage,
      networkTroubleshootingSampleSize: params.networkTroubleshootingSampleSize,
      networkTroubleshootingMissingSignals: params.networkTroubleshootingMissingSignals,
      networkTroubleshootingIncidentCount: params.networkTroubleshootingIncidentCount,
      inferenceOptimizationCoverage: params.inferenceOptimizationCoverage,
      inferenceOptimizationSampleSize: params.inferenceOptimizationSampleSize,
      inferenceOptimizationMissingSignals: params.inferenceOptimizationMissingSignals,
      inferenceOptimizationRunCount: params.inferenceOptimizationRunCount,
      javaCodingAgentCoverage: params.javaCodingAgentCoverage,
      javaCodingAgentSampleSize: params.javaCodingAgentSampleSize,
      javaCodingAgentMissingSignals: params.javaCodingAgentMissingSignals,
      javaCodingAgentTrialCount: params.javaCodingAgentTrialCount,
      webEvalDatasetCoverage: params.webEvalDatasetCoverage,
      webEvalDatasetSampleSize: params.webEvalDatasetSampleSize,
      webEvalDatasetMissingSignals: params.webEvalDatasetMissingSignals,
      webEvalDatasetQuestionCount: params.webEvalDatasetQuestionCount,
      webEvalDatasetDocumentCount: params.webEvalDatasetDocumentCount,
      parallelResearchSkillCoverage: params.parallelResearchSkillCoverage,
      parallelResearchSkillSampleSize: params.parallelResearchSkillSampleSize,
      parallelResearchSkillMissingSignals: params.parallelResearchSkillMissingSignals,
      parallelResearchSkillCitationCoverage0to1: params.parallelResearchSkillCitationCoverage0to1,
      parallelResearchSkillSourcePolicyCoverage0to1: params.parallelResearchSkillSourcePolicyCoverage0to1,
      parallelResearchSkillBatchTaskLimit: params.parallelResearchSkillBatchTaskLimit,
      parallelResearchSkillMonitoringCoverage0to1: params.parallelResearchSkillMonitoringCoverage0to1,
      resumeRagEvaluatorCoverage: params.resumeRagEvaluatorCoverage,
      resumeRagEvaluatorSampleSize: params.resumeRagEvaluatorSampleSize,
      resumeRagEvaluatorMissingSignals: params.resumeRagEvaluatorMissingSignals,
      resumeRagEvaluatorParserCoverage0to1: params.resumeRagEvaluatorParserCoverage0to1,
      resumeRagEvaluatorEvaluationGrounding0to1: params.resumeRagEvaluatorEvaluationGrounding0to1,
      chipBenchmarkCoverage: params.chipBenchmarkCoverage,
      chipBenchmarkSampleSize: params.chipBenchmarkSampleSize,
      chipBenchmarkMissingSignals: params.chipBenchmarkMissingSignals,
      chipBenchmarkResultRowCount: params.chipBenchmarkResultRowCount,
      chipBenchmarkThroughputCoverage0to1: params.chipBenchmarkThroughputCoverage0to1,
      chipBenchmarkLatencyCoverage0to1: params.chipBenchmarkLatencyCoverage0to1,
      chipBenchmarkCostCoverage0to1: params.chipBenchmarkCostCoverage0to1,
      hermesBenchCoverage: params.hermesBenchCoverage,
      hermesBenchSampleSize: params.hermesBenchSampleSize,
      hermesBenchMissingSignals: params.hermesBenchMissingSignals,
      hermesBenchTaskCount: params.hermesBenchTaskCount,
      hermesBenchAdapterCount: params.hermesBenchAdapterCount,
      hermesBenchBackendTestCount: params.hermesBenchBackendTestCount,
      hermesBenchFrontendTestCount: params.hermesBenchFrontendTestCount,
      hermesBenchJudgeAgreement0to1: params.hermesBenchJudgeAgreement0to1,
      hermesBenchRegressionPassRate0to1: params.hermesBenchRegressionPassRate0to1,
      cooperBenchCoverage: params.cooperBenchCoverage,
      cooperBenchSampleSize: params.cooperBenchSampleSize,
      cooperBenchMissingSignals: params.cooperBenchMissingSignals,
      cooperBenchTaskCount: params.cooperBenchTaskCount,
      cooperBenchFeatureCount: params.cooperBenchFeatureCount,
      cooperBenchAgentAdapterCount: params.cooperBenchAgentAdapterCount,
      cooperBenchTestCount: params.cooperBenchTestCount,
      cooperBenchCooperationScore0to1: params.cooperBenchCooperationScore0to1,
      cooperBenchConflictResolutionRate0to1: params.cooperBenchConflictResolutionRate0to1,
      cooperBenchRegressionPassRate0to1: params.cooperBenchRegressionPassRate0to1,
      coderCupCoverage: params.coderCupCoverage,
      coderCupSampleSize: params.coderCupSampleSize,
      coderCupMissingSignals: params.coderCupMissingSignals,
      coderCupPhaseCount: params.coderCupPhaseCount,
      coderCupTestPlanCount: params.coderCupTestPlanCount,
      coderCupRunnerCount: params.coderCupRunnerCount,
      coderCupScoreLedgerCount: params.coderCupScoreLedgerCount,
      coderCupLiveSurfaceCount: params.coderCupLiveSurfaceCount,
      coderCupInterRaterAgreement0to1: params.coderCupInterRaterAgreement0to1,
      coderCupTestRetestReliability0to1: params.coderCupTestRetestReliability0to1,
      coderCupRegressionPassRate0to1: params.coderCupRegressionPassRate0to1,
      agenticGraphRagCoverage: params.agenticGraphRagCoverage,
      agenticGraphRagSampleSize: params.agenticGraphRagSampleSize,
      agenticGraphRagMissingSignals: params.agenticGraphRagMissingSignals,
      agenticGraphRagGraphNodeCount: params.agenticGraphRagGraphNodeCount,
      agenticGraphRagEvaluationMetricCount: params.agenticGraphRagEvaluationMetricCount,
      agenticGraphRagExperimentCount: params.agenticGraphRagExperimentCount,
      agenticGraphRagRetrievalGroundingScore0to1: params.agenticGraphRagRetrievalGroundingScore0to1,
      agenticGraphRagRegressionPassRate0to1: params.agenticGraphRagRegressionPassRate0to1,
      agentScenarioTestCoverage: params.agentScenarioTestCoverage,
      agentScenarioTestSampleSize: params.agentScenarioTestSampleSize,
      agentScenarioTestMissingSignals: params.agentScenarioTestMissingSignals,
      agentScenarioTestScenarioCount: params.agentScenarioTestScenarioCount,
      agentScenarioTestTurnCount: params.agentScenarioTestTurnCount,
      agentScenarioTestToolCallCount: params.agentScenarioTestToolCallCount,
      openCodeLabCoverage: params.openCodeLabCoverage,
      openCodeLabSampleSize: params.openCodeLabSampleSize,
      openCodeLabMissingSignals: params.openCodeLabMissingSignals,
      openCodeLabRunCount: params.openCodeLabRunCount,
      openCodeLabForkAgreement0to1: params.openCodeLabForkAgreement0to1,
      openCodeLabModelVariance0to1: params.openCodeLabModelVariance0to1,
      ccPluginEvalCoverage: params.ccPluginEvalCoverage,
      ccPluginEvalSampleSize: params.ccPluginEvalSampleSize,
      ccPluginEvalMissingSignals: params.ccPluginEvalMissingSignals,
      ccPluginEvalTriggerAccuracy0to1: params.ccPluginEvalTriggerAccuracy0to1,
      ccPluginEvalFalsePositiveRate0to1: params.ccPluginEvalFalsePositiveRate0to1,
      ccPluginEvalFalseNegativeRate0to1: params.ccPluginEvalFalseNegativeRate0to1,
      ccPluginEvalComponentCount: params.ccPluginEvalComponentCount,
      ccPluginEvalScenarioCount: params.ccPluginEvalScenarioCount,
      realignSimulationCoverage: params.realignSimulationCoverage,
      realignSimulationSampleSize: params.realignSimulationSampleSize,
      realignSimulationMissingSignals: params.realignSimulationMissingSignals,
      realignSimulationJudgeAgreement0to1: params.realignSimulationJudgeAgreement0to1,
      realignSimulationRegressionPassRate0to1: params.realignSimulationRegressionPassRate0to1,
      realignSimulationScenarioCount: params.realignSimulationScenarioCount,
      realignSimulationEvaluatorCount: params.realignSimulationEvaluatorCount,
      realignSimulationRepeatCount: params.realignSimulationRepeatCount,
      academiClawCoverage: params.academiClawCoverage,
      academiClawSampleSize: params.academiClawSampleSize,
      academiClawMissingSignals: params.academiClawMissingSignals,
      academiClawTaskCount: params.academiClawTaskCount,
      academiClawLanguageCount: params.academiClawLanguageCount,
      academiClawRubricCount: params.academiClawRubricCount,
      academiClawTraceCount: params.academiClawTraceCount,
      academiClawMetaEvalCount: params.academiClawMetaEvalCount,
      academiClawModelCount: params.academiClawModelCount,
      academiClawRegressionPassRate0to1: params.academiClawRegressionPassRate0to1,
      ragChunkingTechniqueCoverage: params.ragChunkingTechniqueCoverage,
      ragChunkingTechniqueSampleSize: params.ragChunkingTechniqueSampleSize,
      ragChunkingTechniqueMissingSignals: params.ragChunkingTechniqueMissingSignals,
      ragChunkingTechniquePolicyDocumentCount: params.ragChunkingTechniquePolicyDocumentCount,
      ragChunkingTechniqueNotebookCount: params.ragChunkingTechniqueNotebookCount,
      ragChunkingTechniqueChunkingStrategyCount: params.ragChunkingTechniqueChunkingStrategyCount,
      ragChunkingTechniqueEvaluationQuestionCount: params.ragChunkingTechniqueEvaluationQuestionCount,
      ragChunkingTechniqueMetricCount: params.ragChunkingTechniqueMetricCount,
      ragChunkingTechniqueRegressionPassRate0to1: params.ragChunkingTechniqueRegressionPassRate0to1,
      kubernetesOperationalAgentCoverage: params.kubernetesOperationalAgentCoverage,
      kubernetesOperationalAgentSampleSize: params.kubernetesOperationalAgentSampleSize,
      kubernetesOperationalAgentMissingSignals: params.kubernetesOperationalAgentMissingSignals,
      kubernetesOperationalAgentToolCategoryCount: params.kubernetesOperationalAgentToolCategoryCount,
      kubernetesOperationalAgentDiagnosticCapabilityCount: params.kubernetesOperationalAgentDiagnosticCapabilityCount,
      kubernetesOperationalAgentResourceMetricCount: params.kubernetesOperationalAgentResourceMetricCount,
      kubernetesOperationalAgentLogAnalysisCount: params.kubernetesOperationalAgentLogAnalysisCount,
      kubernetesOperationalAgentRegressionPassRate0to1: params.kubernetesOperationalAgentRegressionPassRate0to1,
      secureVibeBenchCoverage: params.secureVibeBenchCoverage,
      secureVibeBenchSampleSize: params.secureVibeBenchSampleSize,
      secureVibeBenchMissingSignals: params.secureVibeBenchMissingSignals,
      secureVibeBenchAgentAdapterCount: params.secureVibeBenchAgentAdapterCount,
      secureVibeBenchScenarioCount: params.secureVibeBenchScenarioCount,
      secureVibeBenchTestScriptCount: params.secureVibeBenchTestScriptCount,
      secureVibeBenchRegressionPassRate0to1: params.secureVibeBenchRegressionPassRate0to1,
      ravigBenchCoverage: params.ravigBenchCoverage,
      ravigBenchSampleSize: params.ravigBenchSampleSize,
      ravigBenchMissingSignals: params.ravigBenchMissingSignals,
      ravigBenchDatasetCaseCount: params.ravigBenchDatasetCaseCount,
      ravigBenchVisualDesignCheckCount: params.ravigBenchVisualDesignCheckCount,
      ravigBenchEvaluatorCount: params.ravigBenchEvaluatorCount,
      ravigBenchValidationPassRate0to1: params.ravigBenchValidationPassRate0to1,
      humanStudyBenchCoverage: params.humanStudyBenchCoverage,
      humanStudyBenchSampleSize: params.humanStudyBenchSampleSize,
      humanStudyBenchMissingSignals: params.humanStudyBenchMissingSignals,
      humanStudyBenchStudyCount: params.humanStudyBenchStudyCount,
      humanStudyBenchParticipantCount: params.humanStudyBenchParticipantCount,
      humanStudyBenchResponseCount: params.humanStudyBenchResponseCount,
      humanStudyBenchEvaluatorCount: params.humanStudyBenchEvaluatorCount,
      humanStudyBenchInterRaterAgreement0to1: params.humanStudyBenchInterRaterAgreement0to1,
      humanStudyBenchTestRetestReliability0to1: params.humanStudyBenchTestRetestReliability0to1,
      humanStudyBenchValidationPassRate0to1: params.humanStudyBenchValidationPassRate0to1,
      legacyBenchCoverage: params.legacyBenchCoverage,
      legacyBenchSampleSize: params.legacyBenchSampleSize,
      legacyBenchMissingSignals: params.legacyBenchMissingSignals,
      legacyBenchTaskCount: params.legacyBenchTaskCount,
      legacyBenchLanguageCount: params.legacyBenchLanguageCount,
      legacyBenchEnvironmentCount: params.legacyBenchEnvironmentCount,
      legacyBenchTestOracleCount: params.legacyBenchTestOracleCount,
      legacyBenchEvaluatorCount: params.legacyBenchEvaluatorCount,
      legacyBenchRegressionPassRate0to1: params.legacyBenchRegressionPassRate0to1,
      legacyBenchReplayPassRate0to1: params.legacyBenchReplayPassRate0to1,
      subtleMemoryCoverage: params.subtleMemoryCoverage,
      subtleMemorySampleSize: params.subtleMemorySampleSize,
      subtleMemoryMissingSignals: params.subtleMemoryMissingSignals,
      subtleMemoryPersonaCount: params.subtleMemoryPersonaCount,
      subtleMemoryBenchInstanceCount: params.subtleMemoryBenchInstanceCount,
      subtleMemoryHistoryCount: params.subtleMemoryHistoryCount,
      subtleMemoryMemoryVariantSetCount: params.subtleMemoryMemoryVariantSetCount,
      subtleMemoryRelationTypeCount: params.subtleMemoryRelationTypeCount,
      subtleMemoryEvaluationStageCount: params.subtleMemoryEvaluationStageCount,
      subtleMemoryAdapterCount: params.subtleMemoryAdapterCount,
      subtleMemoryJudgeAgreement0to1: params.subtleMemoryJudgeAgreement0to1,
      subtleMemoryValidationPassRate0to1: params.subtleMemoryValidationPassRate0to1,
      thresholds: params.thresholds
    })
  };
}

function buildEvalPackRow(params: {
  row: MetricValidationRow;
  signedEvidenceRefs: QuestionScoreSignedEvidenceRef[];
}): MetricValidationEvalPackRow {
  const rowWithoutHash: Omit<MetricValidationEvalPackRow, "rowHash"> = {
    metricId: params.row.metricId,
    owner: params.row.owner,
    sampleSize: params.row.sampleSize,
    counterfactualResponsiveness: params.row.counterfactualResponsiveness,
    counterfactualSampleSize: params.row.counterfactualSampleSize,
    validationFacetCoverage: params.row.validationFacetCoverage,
    validationFacetSampleSize: params.row.validationFacetSampleSize,
    confounderControlCoverage: params.row.confounderControlCoverage,
    confounderControlSampleSize: params.row.confounderControlSampleSize,
    outcomeAlignment: params.row.outcomeAlignment,
    outcomeAlignmentSampleSize: params.row.outcomeAlignmentSampleSize,
    processEvidenceCoverage: params.row.processEvidenceCoverage,
    processEvidenceSampleSize: params.row.processEvidenceSampleSize,
    safetyUtilityCoverage: params.row.safetyUtilityCoverage,
    safetyUtilitySampleSize: params.row.safetyUtilitySampleSize,
    modalityTransformationCoverage: params.row.modalityTransformationCoverage,
    modalityTransformationSampleSize: params.row.modalityTransformationSampleSize,
    lifecycleObservabilityCoverage: params.row.lifecycleObservabilityCoverage,
    lifecycleObservabilitySampleSize: params.row.lifecycleObservabilitySampleSize,
    rankingStabilityCoverage: params.row.rankingStabilityCoverage,
    rankingStabilitySampleSize: params.row.rankingStabilitySampleSize,
    toolSandboxCoverage: params.row.toolSandboxCoverage,
    toolSandboxSampleSize: params.row.toolSandboxSampleSize,
    continualLearningCoverage: params.row.continualLearningCoverage,
    continualLearningSampleSize: params.row.continualLearningSampleSize,
    continualLearningRunCount: params.row.continualLearningRunCount,
    continualLearningMissingSignals: params.row.continualLearningMissingSignals,
    continualLearningMemoryArtifactHashes: params.row.continualLearningMemoryArtifactHashes,
    continualLearningRunSummaryArtifactHashes: params.row.continualLearningRunSummaryArtifactHashes,
    continualLearningGameplayLogArtifactHashes: params.row.continualLearningGameplayLogArtifactHashes,
    continualLearningMetricNames: params.row.continualLearningMetricNames,
    strategicInteractionCoverage: params.row.strategicInteractionCoverage,
    strategicInteractionSampleSize: params.row.strategicInteractionSampleSize,
    architectureRealityCoverage: params.row.architectureRealityCoverage,
    architectureRealitySampleSize: params.row.architectureRealitySampleSize,
    architectureRealityStressScenarioCount: params.row.architectureRealityStressScenarioCount,
    architectureRealityNetworkScenarioCount: params.row.architectureRealityNetworkScenarioCount,
    architectureRealityEnsemblePatternCount: params.row.architectureRealityEnsemblePatternCount,
    architectureRealityMissingSignals: params.row.architectureRealityMissingSignals,
    ragPipelineCoverage: params.row.ragPipelineCoverage,
    ragPipelineSampleSize: params.row.ragPipelineSampleSize,
    ragEvaluationPipelineCoverage: params.row.ragEvaluationPipelineCoverage,
    ragEvaluationPipelineSampleSize: params.row.ragEvaluationPipelineSampleSize,
    ragEvaluationPipelineCaseSampleSizeMin: params.row.ragEvaluationPipelineCaseSampleSizeMin,
    ragEvaluationPipelineMissingSignals: params.row.ragEvaluationPipelineMissingSignals,
    ragEvaluationPipelineMetricOwners: params.row.ragEvaluationPipelineMetricOwners,
    ragEvaluationPipelineReportArtifactHashes: params.row.ragEvaluationPipelineReportArtifactHashes,
    ragasNotebookCoverage: params.row.ragasNotebookCoverage,
    ragasNotebookSampleSize: params.row.ragasNotebookSampleSize,
    ragasNotebookMissingSignals: params.row.ragasNotebookMissingSignals,
    ragasNotebookMetricNames: params.row.ragasNotebookMetricNames,
    ragasNotebookQuestionCount: params.row.ragasNotebookQuestionCount,
    ragasNotebookReportArtifactHashes: params.row.ragasNotebookReportArtifactHashes,
    mirageRagMetricCoverage: params.row.mirageRagMetricCoverage,
    mirageRagMetricSampleSize: params.row.mirageRagMetricSampleSize,
    mirageRagMetricMissingSignals: params.row.mirageRagMetricMissingSignals,
    mirageRagMetricDatasetIds: params.row.mirageRagMetricDatasetIds,
    mirageRagMetricEvaluationModes: params.row.mirageRagMetricEvaluationModes,
    mirageRagMetricRetrieverIds: params.row.mirageRagMetricRetrieverIds,
    mirageRagMetricModelIds: params.row.mirageRagMetricModelIds,
    mirageRagMetricNames: params.row.mirageRagMetricNames,
    mirageRagMetricQaPairCount: params.row.mirageRagMetricQaPairCount,
    mirageRagMetricContextPoolCount: params.row.mirageRagMetricContextPoolCount,
    mirageRagMetricReportArtifactHashes: params.row.mirageRagMetricReportArtifactHashes,
    legalCodeRagCoverage: params.row.legalCodeRagCoverage,
    legalCodeRagSampleSize: params.row.legalCodeRagSampleSize,
    legalCodeRagMissingSignals: params.row.legalCodeRagMissingSignals,
    legalCodeRagLegalCodeIds: params.row.legalCodeRagLegalCodeIds,
    legalCodeRagJurisdictionIds: params.row.legalCodeRagJurisdictionIds,
    legalCodeRagRetrievalTechniqueIds: params.row.legalCodeRagRetrievalTechniqueIds,
    legalCodeRagVectorStoreIds: params.row.legalCodeRagVectorStoreIds,
    legalCodeRagEmbeddingModelIds: params.row.legalCodeRagEmbeddingModelIds,
    legalCodeRagEvaluationDatasetIds: params.row.legalCodeRagEvaluationDatasetIds,
    legalCodeRagMetricNames: params.row.legalCodeRagMetricNames,
    legalCodeRagQuestionCount: params.row.legalCodeRagQuestionCount,
    legalCodeRagMetricOwners: params.row.legalCodeRagMetricOwners,
    legalCodeRagReportArtifactHashes: params.row.legalCodeRagReportArtifactHashes,
    guardbenchMetricCoverage: params.row.guardbenchMetricCoverage,
    guardbenchMetricSampleSize: params.row.guardbenchMetricSampleSize,
    guardbenchMetricMissingSignals: params.row.guardbenchMetricMissingSignals,
    guardbenchDatasetIds: params.row.guardbenchDatasetIds,
    guardbenchLanguageIds: params.row.guardbenchLanguageIds,
    guardbenchModelIds: params.row.guardbenchModelIds,
    guardbenchThresholdIds: params.row.guardbenchThresholdIds,
    guardbenchMetricNames: params.row.guardbenchMetricNames,
    guardbenchExportFormats: params.row.guardbenchExportFormats,
    guardbenchReportArtifactHashes: params.row.guardbenchReportArtifactHashes,
    businessWorkflowCoverage: params.row.businessWorkflowCoverage,
    businessWorkflowSampleSize: params.row.businessWorkflowSampleSize,
    dataAgentAnalyticalCoverage: params.row.dataAgentAnalyticalCoverage,
    dataAgentAnalyticalSampleSize: params.row.dataAgentAnalyticalSampleSize,
    embodiedAgentCoverage: params.row.embodiedAgentCoverage,
    embodiedAgentSampleSize: params.row.embodiedAgentSampleSize,
    embodiedAgentMissingSignals: params.row.embodiedAgentMissingSignals,
    embodiedAgentTaskTypes: params.row.embodiedAgentTaskTypes,
    embodiedAgentBaselineIds: params.row.embodiedAgentBaselineIds,
    embodiedAgentReportArtifactHashes: params.row.embodiedAgentReportArtifactHashes,
    evaluatorSuiteCoverage: params.row.evaluatorSuiteCoverage,
    evaluatorSuiteSampleSize: params.row.evaluatorSuiteSampleSize,
    evaluatorSuiteMissingSignals: params.row.evaluatorSuiteMissingSignals,
    evaluatorSuiteAssertionTypes: params.row.evaluatorSuiteAssertionTypes,
    evaluatorSuiteReporterFormats: params.row.evaluatorSuiteReporterFormats,
    evaluatorSuiteJudgeNames: params.row.evaluatorSuiteJudgeNames,
    evaluatorSuiteReportArtifactHashes: params.row.evaluatorSuiteReportArtifactHashes,
    pentestBenchmarkCoverage: params.row.pentestBenchmarkCoverage,
    pentestBenchmarkSampleSize: params.row.pentestBenchmarkSampleSize,
    pentestBenchmarkMissingSignals: params.row.pentestBenchmarkMissingSignals,
    pentestBenchmarkLanguageStacks: params.row.pentestBenchmarkLanguageStacks,
    pentestBenchmarkVulnerabilityClasses: params.row.pentestBenchmarkVulnerabilityClasses,
    pentestBenchmarkDifficultyLevels: params.row.pentestBenchmarkDifficultyLevels,
    pentestBenchmarkSuiteIds: params.row.pentestBenchmarkSuiteIds,
    pentestBenchmarkMetricNames: params.row.pentestBenchmarkMetricNames,
    pentestBenchmarkReportArtifactHashes: params.row.pentestBenchmarkReportArtifactHashes,
    traceEvaluationCoverage: params.row.traceEvaluationCoverage,
    traceEvaluationSampleSize: params.row.traceEvaluationSampleSize,
    traceEvaluationMissingSignals: params.row.traceEvaluationMissingSignals,
    traceEvaluationModelIds: params.row.traceEvaluationModelIds,
    traceEvaluationAgentParameterKeys: params.row.traceEvaluationAgentParameterKeys,
    traceEvaluationToolNames: params.row.traceEvaluationToolNames,
    traceEvaluationMetricNames: params.row.traceEvaluationMetricNames,
    traceEvaluationCaseSuiteIds: params.row.traceEvaluationCaseSuiteIds,
    traceEvaluationBackendModes: params.row.traceEvaluationBackendModes,
    traceEvaluationRunPermutationCount: params.row.traceEvaluationRunPermutationCount,
    traceEvaluationReportArtifactHashes: params.row.traceEvaluationReportArtifactHashes,
    livingEnvironmentCoverage: params.row.livingEnvironmentCoverage,
    livingEnvironmentSampleSize: params.row.livingEnvironmentSampleSize,
    livingEnvironmentMissingSignals: params.row.livingEnvironmentMissingSignals,
    livingEnvironmentCapabilityNames: params.row.livingEnvironmentCapabilityNames,
    livingEnvironmentSandboxProviders: params.row.livingEnvironmentSandboxProviders,
    livingEnvironmentAgentAdapters: params.row.livingEnvironmentAgentAdapters,
    livingEnvironmentMetricNames: params.row.livingEnvironmentMetricNames,
    livingEnvironmentTrialCount: params.row.livingEnvironmentTrialCount,
    livingEnvironmentReportArtifactHashes: params.row.livingEnvironmentReportArtifactHashes,
    mobileAgentCoverage: params.row.mobileAgentCoverage,
    mobileAgentSampleSize: params.row.mobileAgentSampleSize,
    mobileAgentMissingSignals: params.row.mobileAgentMissingSignals,
    mobileAgentBenchmarkIds: params.row.mobileAgentBenchmarkIds,
    mobileAgentEnvironmentIds: params.row.mobileAgentEnvironmentIds,
    mobileAgentAppIds: params.row.mobileAgentAppIds,
    mobileAgentApiCatalogIds: params.row.mobileAgentApiCatalogIds,
    mobileAgentUiTraceIds: params.row.mobileAgentUiTraceIds,
    mobileAgentTaskSetIds: params.row.mobileAgentTaskSetIds,
    mobileAgentTaskComplexityGroups: params.row.mobileAgentTaskComplexityGroups,
    mobileAgentCheckpointMetricNames: params.row.mobileAgentCheckpointMetricNames,
    mobileAgentLicenseBoundaryRefs: params.row.mobileAgentLicenseBoundaryRefs,
    mobileAgentTrialCount: params.row.mobileAgentTrialCount,
    mobileAgentReportArtifactHashes: params.row.mobileAgentReportArtifactHashes,
    personaAgentCoverage: params.row.personaAgentCoverage,
    personaAgentSampleSize: params.row.personaAgentSampleSize,
    personaAgentMissingSignals: params.row.personaAgentMissingSignals,
    personaAgentPersonaIds: params.row.personaAgentPersonaIds,
    personaAgentEnvironmentIds: params.row.personaAgentEnvironmentIds,
    personaAgentQuestionSetIds: params.row.personaAgentQuestionSetIds,
    personaAgentModelIds: params.row.personaAgentModelIds,
    personaAgentProviderIds: params.row.personaAgentProviderIds,
    personaAgentMetricNames: params.row.personaAgentMetricNames,
    personaAgentQuestionCount: params.row.personaAgentQuestionCount,
    personaAgentReportArtifactHashes: params.row.personaAgentReportArtifactHashes,
    scientificLiteratureCoverage: params.row.scientificLiteratureCoverage,
    scientificLiteratureSampleSize: params.row.scientificLiteratureSampleSize,
    scientificLiteratureMissingSignals: params.row.scientificLiteratureMissingSignals,
    scientificLiteratureBenchmarkIds: params.row.scientificLiteratureBenchmarkIds,
    scientificLiteratureTaskTypes: params.row.scientificLiteratureTaskTypes,
    scientificLiteratureDatasetIds: params.row.scientificLiteratureDatasetIds,
    scientificLiteratureSearchBackendIds: params.row.scientificLiteratureSearchBackendIds,
    scientificLiteratureToolIds: params.row.scientificLiteratureToolIds,
    scientificLiteratureMetricNames: params.row.scientificLiteratureMetricNames,
    scientificLiteratureTaskCount: params.row.scientificLiteratureTaskCount,
    scientificLiteratureReportArtifactHashes: params.row.scientificLiteratureReportArtifactHashes,
    bioinformaticsAgentCoverage: params.row.bioinformaticsAgentCoverage,
    bioinformaticsAgentSampleSize: params.row.bioinformaticsAgentSampleSize,
    bioinformaticsAgentMissingSignals: params.row.bioinformaticsAgentMissingSignals,
    bioinformaticsAgentBenchmarkIds: params.row.bioinformaticsAgentBenchmarkIds,
    bioinformaticsAgentTaskTypes: params.row.bioinformaticsAgentTaskTypes,
    bioinformaticsAgentDatasetIds: params.row.bioinformaticsAgentDatasetIds,
    bioinformaticsAgentWorkflowIds: params.row.bioinformaticsAgentWorkflowIds,
    bioinformaticsAgentToolNames: params.row.bioinformaticsAgentToolNames,
    bioinformaticsAgentMetricNames: params.row.bioinformaticsAgentMetricNames,
    bioinformaticsAgentPerturbationIds: params.row.bioinformaticsAgentPerturbationIds,
    bioinformaticsAgentPrivacyBoundaryRefs: params.row.bioinformaticsAgentPrivacyBoundaryRefs,
    bioinformaticsAgentTaskCount: params.row.bioinformaticsAgentTaskCount,
    bioinformaticsAgentReportArtifactHashes: params.row.bioinformaticsAgentReportArtifactHashes,
    mirageDrugRepositioningCoverage: params.row.mirageDrugRepositioningCoverage,
    mirageDrugRepositioningSampleSize: params.row.mirageDrugRepositioningSampleSize,
    mirageDrugRepositioningMissingSignals: params.row.mirageDrugRepositioningMissingSignals,
    mirageDrugRepositioningBenchmarkIds: params.row.mirageDrugRepositioningBenchmarkIds,
    mirageDrugRepositioningDatasetIds: params.row.mirageDrugRepositioningDatasetIds,
    mirageDrugRepositioningSplitIds: params.row.mirageDrugRepositioningSplitIds,
    mirageDrugRepositioningMappingIds: params.row.mirageDrugRepositioningMappingIds,
    mirageDrugRepositioningFeatureSetIds: params.row.mirageDrugRepositioningFeatureSetIds,
    mirageDrugRepositioningSimilarityMatrixIds: params.row.mirageDrugRepositioningSimilarityMatrixIds,
    mirageDrugRepositioningNegativeSamplingIds: params.row.mirageDrugRepositioningNegativeSamplingIds,
    mirageDrugRepositioningClassifierConfigIds: params.row.mirageDrugRepositioningClassifierConfigIds,
    mirageDrugRepositioningFeatureSelectionReportIds: params.row.mirageDrugRepositioningFeatureSelectionReportIds,
    mirageDrugRepositioningScoreCalculationIds: params.row.mirageDrugRepositioningScoreCalculationIds,
    mirageDrugRepositioningCaseStudyIds: params.row.mirageDrugRepositioningCaseStudyIds,
    mirageDrugRepositioningMetricNames: params.row.mirageDrugRepositioningMetricNames,
    mirageDrugRepositioningDrugCount: params.row.mirageDrugRepositioningDrugCount,
    mirageDrugRepositioningDiseaseCount: params.row.mirageDrugRepositioningDiseaseCount,
    mirageDrugRepositioningMappingCount: params.row.mirageDrugRepositioningMappingCount,
    mirageDrugRepositioningFeatureSetCount: params.row.mirageDrugRepositioningFeatureSetCount,
    mirageDrugRepositioningSimilarityMatrixCount: params.row.mirageDrugRepositioningSimilarityMatrixCount,
    mirageDrugRepositioningReportArtifactHashes: params.row.mirageDrugRepositioningReportArtifactHashes,
    networkTroubleshootingCoverage: params.row.networkTroubleshootingCoverage,
    networkTroubleshootingSampleSize: params.row.networkTroubleshootingSampleSize,
    networkTroubleshootingMissingSignals: params.row.networkTroubleshootingMissingSignals,
    networkTroubleshootingBenchmarkIds: params.row.networkTroubleshootingBenchmarkIds,
    networkTroubleshootingScenarioIds: params.row.networkTroubleshootingScenarioIds,
    networkTroubleshootingTopologyTiers: params.row.networkTroubleshootingTopologyTiers,
    networkTroubleshootingIssueTypes: params.row.networkTroubleshootingIssueTypes,
    networkTroubleshootingAgentIds: params.row.networkTroubleshootingAgentIds,
    networkTroubleshootingToolNames: params.row.networkTroubleshootingToolNames,
    networkTroubleshootingMetricNames: params.row.networkTroubleshootingMetricNames,
    networkTroubleshootingIncidentCount: params.row.networkTroubleshootingIncidentCount,
    networkTroubleshootingReportArtifactHashes: params.row.networkTroubleshootingReportArtifactHashes,
    inferenceOptimizationCoverage: params.row.inferenceOptimizationCoverage,
    inferenceOptimizationSampleSize: params.row.inferenceOptimizationSampleSize,
    inferenceOptimizationMissingSignals: params.row.inferenceOptimizationMissingSignals,
    inferenceOptimizationBenchmarkIds: params.row.inferenceOptimizationBenchmarkIds,
    inferenceOptimizationScenarioIds: params.row.inferenceOptimizationScenarioIds,
    inferenceOptimizationHardwareProfileIds: params.row.inferenceOptimizationHardwareProfileIds,
    inferenceOptimizationBackendIds: params.row.inferenceOptimizationBackendIds,
    inferenceOptimizationSearchSpaceIds: params.row.inferenceOptimizationSearchSpaceIds,
    inferenceOptimizationGateIds: params.row.inferenceOptimizationGateIds,
    inferenceOptimizationAgentIds: params.row.inferenceOptimizationAgentIds,
    inferenceOptimizationMetricNames: params.row.inferenceOptimizationMetricNames,
    inferenceOptimizationRunCount: params.row.inferenceOptimizationRunCount,
    inferenceOptimizationReportArtifactHashes: params.row.inferenceOptimizationReportArtifactHashes,
    javaCodingAgentCoverage: params.row.javaCodingAgentCoverage,
    javaCodingAgentSampleSize: params.row.javaCodingAgentSampleSize,
    javaCodingAgentMissingSignals: params.row.javaCodingAgentMissingSignals,
    javaCodingAgentBenchmarkIds: params.row.javaCodingAgentBenchmarkIds,
    javaCodingAgentTaskIds: params.row.javaCodingAgentTaskIds,
    javaCodingAgentTaskTypes: params.row.javaCodingAgentTaskTypes,
    javaCodingAgentJavaProjectIds: params.row.javaCodingAgentJavaProjectIds,
    javaCodingAgentSandboxIds: params.row.javaCodingAgentSandboxIds,
    javaCodingAgentAgentConfigIds: params.row.javaCodingAgentAgentConfigIds,
    javaCodingAgentJudgeTierIds: params.row.javaCodingAgentJudgeTierIds,
    javaCodingAgentCheckTypes: params.row.javaCodingAgentCheckTypes,
    javaCodingAgentMetricNames: params.row.javaCodingAgentMetricNames,
    javaCodingAgentTrialCount: params.row.javaCodingAgentTrialCount,
    javaCodingAgentReportArtifactHashes: params.row.javaCodingAgentReportArtifactHashes,
    webEvalDatasetCoverage: params.row.webEvalDatasetCoverage,
    webEvalDatasetSampleSize: params.row.webEvalDatasetSampleSize,
    webEvalDatasetMissingSignals: params.row.webEvalDatasetMissingSignals,
    webEvalDatasetBenchmarkIds: params.row.webEvalDatasetBenchmarkIds,
    webEvalDatasetRepositoryRefs: params.row.webEvalDatasetRepositoryRefs,
    webEvalDatasetSubjectIds: params.row.webEvalDatasetSubjectIds,
    webEvalDatasetQuerySetIds: params.row.webEvalDatasetQuerySetIds,
    webEvalDatasetSearchProviderIds: params.row.webEvalDatasetSearchProviderIds,
    webEvalDatasetDocumentSetIds: params.row.webEvalDatasetDocumentSetIds,
    webEvalDatasetFilterPolicyIds: params.row.webEvalDatasetFilterPolicyIds,
    webEvalDatasetQaGenerationIds: params.row.webEvalDatasetQaGenerationIds,
    webEvalDatasetReferenceAnswerSetIds: params.row.webEvalDatasetReferenceAnswerSetIds,
    webEvalDatasetExportIds: params.row.webEvalDatasetExportIds,
    webEvalDatasetOutputTargets: params.row.webEvalDatasetOutputTargets,
    webEvalDatasetMetricNames: params.row.webEvalDatasetMetricNames,
    webEvalDatasetQuestionCount: params.row.webEvalDatasetQuestionCount,
    webEvalDatasetDocumentCount: params.row.webEvalDatasetDocumentCount,
    webEvalDatasetProviderDiversityCount: params.row.webEvalDatasetProviderDiversityCount,
    webEvalDatasetFreshnessHours: params.row.webEvalDatasetFreshnessHours,
    webEvalDatasetSourceCoverage: params.row.webEvalDatasetSourceCoverage,
    webEvalDatasetAnswerGrounding: params.row.webEvalDatasetAnswerGrounding,
    webEvalDatasetReportArtifactHashes: params.row.webEvalDatasetReportArtifactHashes,
    parallelResearchSkillCoverage: params.row.parallelResearchSkillCoverage,
    parallelResearchSkillSampleSize: params.row.parallelResearchSkillSampleSize,
    parallelResearchSkillMissingSignals: params.row.parallelResearchSkillMissingSignals,
    parallelResearchSkillRepositoryRefs: params.row.parallelResearchSkillRepositoryRefs,
    parallelResearchSkillLicenseRefs: params.row.parallelResearchSkillLicenseRefs,
    parallelResearchSkillManifestIds: params.row.parallelResearchSkillManifestIds,
    parallelResearchSkillApiSurfaceIds: params.row.parallelResearchSkillApiSurfaceIds,
    parallelResearchSkillSearchModeIds: params.row.parallelResearchSkillSearchModeIds,
    parallelResearchSkillProcessorTiers: params.row.parallelResearchSkillProcessorTiers,
    parallelResearchSkillSecurityBoundaryRefs: params.row.parallelResearchSkillSecurityBoundaryRefs,
    parallelResearchSkillDependencyLockIds: params.row.parallelResearchSkillDependencyLockIds,
    parallelResearchSkillMetricNames: params.row.parallelResearchSkillMetricNames,
    parallelResearchSkillCitationCoverage0to1: params.row.parallelResearchSkillCitationCoverage0to1,
    parallelResearchSkillSourcePolicyCoverage0to1: params.row.parallelResearchSkillSourcePolicyCoverage0to1,
    parallelResearchSkillBatchTaskLimit: params.row.parallelResearchSkillBatchTaskLimit,
    parallelResearchSkillMonitoringCoverage0to1: params.row.parallelResearchSkillMonitoringCoverage0to1,
    parallelResearchSkillReportArtifactHashes: params.row.parallelResearchSkillReportArtifactHashes,
    resumeRagEvaluatorCoverage: params.row.resumeRagEvaluatorCoverage,
    resumeRagEvaluatorSampleSize: params.row.resumeRagEvaluatorSampleSize,
    resumeRagEvaluatorMissingSignals: params.row.resumeRagEvaluatorMissingSignals,
    resumeRagEvaluatorRepositoryRefs: params.row.resumeRagEvaluatorRepositoryRefs,
    resumeRagEvaluatorLicenseRefs: params.row.resumeRagEvaluatorLicenseRefs,
    resumeRagEvaluatorResumeInputFormats: params.row.resumeRagEvaluatorResumeInputFormats,
    resumeRagEvaluatorRagStrategyIds: params.row.resumeRagEvaluatorRagStrategyIds,
    resumeRagEvaluatorQueryExpansionIds: params.row.resumeRagEvaluatorQueryExpansionIds,
    resumeRagEvaluatorRetrievalKMin: params.row.resumeRagEvaluatorRetrievalKMin,
    resumeRagEvaluatorRetrievalKMax: params.row.resumeRagEvaluatorRetrievalKMax,
    resumeRagEvaluatorVectorStoreIds: params.row.resumeRagEvaluatorVectorStoreIds,
    resumeRagEvaluatorOllamaModelIds: params.row.resumeRagEvaluatorOllamaModelIds,
    resumeRagEvaluatorEmbeddingModelIds: params.row.resumeRagEvaluatorEmbeddingModelIds,
    resumeRagEvaluatorEvaluationEndpointIds: params.row.resumeRagEvaluatorEvaluationEndpointIds,
    resumeRagEvaluatorCandidateRatingScale: params.row.resumeRagEvaluatorCandidateRatingScale,
    resumeRagEvaluatorBatchModeIds: params.row.resumeRagEvaluatorBatchModeIds,
    resumeRagEvaluatorPrivacyBoundaryRefs: params.row.resumeRagEvaluatorPrivacyBoundaryRefs,
    resumeRagEvaluatorDependencyLockIds: params.row.resumeRagEvaluatorDependencyLockIds,
    resumeRagEvaluatorMetricNames: params.row.resumeRagEvaluatorMetricNames,
    resumeRagEvaluatorParserCoverage0to1: params.row.resumeRagEvaluatorParserCoverage0to1,
    resumeRagEvaluatorEvaluationGrounding0to1: params.row.resumeRagEvaluatorEvaluationGrounding0to1,
    resumeRagEvaluatorReportArtifactHashes: params.row.resumeRagEvaluatorReportArtifactHashes,
    chipBenchmarkCoverage: params.row.chipBenchmarkCoverage,
    chipBenchmarkSampleSize: params.row.chipBenchmarkSampleSize,
    chipBenchmarkMissingSignals: params.row.chipBenchmarkMissingSignals,
    chipBenchmarkRepositoryRefs: params.row.chipBenchmarkRepositoryRefs,
    chipBenchmarkLicenseRefs: params.row.chipBenchmarkLicenseRefs,
    chipBenchmarkBenchmarkIds: params.row.chipBenchmarkBenchmarkIds,
    chipBenchmarkHardwareProfileIds: params.row.chipBenchmarkHardwareProfileIds,
    chipBenchmarkModelFamilyIds: params.row.chipBenchmarkModelFamilyIds,
    chipBenchmarkPrecisionModeIds: params.row.chipBenchmarkPrecisionModeIds,
    chipBenchmarkEnvironmentIds: params.row.chipBenchmarkEnvironmentIds,
    chipBenchmarkRunnerScriptIds: params.row.chipBenchmarkRunnerScriptIds,
    chipBenchmarkServingBackendIds: params.row.chipBenchmarkServingBackendIds,
    chipBenchmarkDatasetIds: params.row.chipBenchmarkDatasetIds,
    chipBenchmarkFrontendDatasetIds: params.row.chipBenchmarkFrontendDatasetIds,
    chipBenchmarkPricingRefs: params.row.chipBenchmarkPricingRefs,
    chipBenchmarkMetricNames: params.row.chipBenchmarkMetricNames,
    chipBenchmarkRegressionThresholdIds: params.row.chipBenchmarkRegressionThresholdIds,
    chipBenchmarkResultRowCount: params.row.chipBenchmarkResultRowCount,
    chipBenchmarkThroughputCoverage0to1: params.row.chipBenchmarkThroughputCoverage0to1,
    chipBenchmarkLatencyCoverage0to1: params.row.chipBenchmarkLatencyCoverage0to1,
    chipBenchmarkCostCoverage0to1: params.row.chipBenchmarkCostCoverage0to1,
    chipBenchmarkReportArtifactHashes: params.row.chipBenchmarkReportArtifactHashes,
    hermesBenchCoverage: params.row.hermesBenchCoverage,
    hermesBenchSampleSize: params.row.hermesBenchSampleSize,
    hermesBenchMissingSignals: params.row.hermesBenchMissingSignals,
    hermesBenchRepositoryRefs: params.row.hermesBenchRepositoryRefs,
    hermesBenchLicenseRefs: params.row.hermesBenchLicenseRefs,
    hermesBenchBranchRefs: params.row.hermesBenchBranchRefs,
    hermesBenchCommitRefs: params.row.hermesBenchCommitRefs,
    hermesBenchTreeRefs: params.row.hermesBenchTreeRefs,
    hermesBenchReadmeBlobRefs: params.row.hermesBenchReadmeBlobRefs,
    hermesBenchBuildSpecRefs: params.row.hermesBenchBuildSpecRefs,
    hermesBenchBackendTreeRefs: params.row.hermesBenchBackendTreeRefs,
    hermesBenchFrontendTreeRefs: params.row.hermesBenchFrontendTreeRefs,
    hermesBenchRunnerIds: params.row.hermesBenchRunnerIds,
    hermesBenchJudgeIds: params.row.hermesBenchJudgeIds,
    hermesBenchTaskRegistryIds: params.row.hermesBenchTaskRegistryIds,
    hermesBenchServerConfigIds: params.row.hermesBenchServerConfigIds,
    hermesBenchAdapterIds: params.row.hermesBenchAdapterIds,
    hermesBenchResultSchemaIds: params.row.hermesBenchResultSchemaIds,
    hermesBenchFrontendComponentIds: params.row.hermesBenchFrontendComponentIds,
    hermesBenchBackendTestIds: params.row.hermesBenchBackendTestIds,
    hermesBenchFrontendTestIds: params.row.hermesBenchFrontendTestIds,
    hermesBenchDockerRuntimeIds: params.row.hermesBenchDockerRuntimeIds,
    hermesBenchMetricNames: params.row.hermesBenchMetricNames,
    hermesBenchTaskCount: params.row.hermesBenchTaskCount,
    hermesBenchAdapterCount: params.row.hermesBenchAdapterCount,
    hermesBenchBackendTestCount: params.row.hermesBenchBackendTestCount,
    hermesBenchFrontendTestCount: params.row.hermesBenchFrontendTestCount,
    hermesBenchJudgeAgreement0to1: params.row.hermesBenchJudgeAgreement0to1,
    hermesBenchRegressionPassRate0to1: params.row.hermesBenchRegressionPassRate0to1,
    hermesBenchReportArtifactHashes: params.row.hermesBenchReportArtifactHashes,
    cooperBenchCoverage: params.row.cooperBenchCoverage,
    cooperBenchSampleSize: params.row.cooperBenchSampleSize,
    cooperBenchMissingSignals: params.row.cooperBenchMissingSignals,
    cooperBenchRepositoryRefs: params.row.cooperBenchRepositoryRefs,
    cooperBenchLicenseRefs: params.row.cooperBenchLicenseRefs,
    cooperBenchReleaseRefs: params.row.cooperBenchReleaseRefs,
    cooperBenchBranchRefs: params.row.cooperBenchBranchRefs,
    cooperBenchCommitRefs: params.row.cooperBenchCommitRefs,
    cooperBenchTreeRefs: params.row.cooperBenchTreeRefs,
    cooperBenchReadmeBlobRefs: params.row.cooperBenchReadmeBlobRefs,
    cooperBenchChangelogRefs: params.row.cooperBenchChangelogRefs,
    cooperBenchDatasetTreeRefs: params.row.cooperBenchDatasetTreeRefs,
    cooperBenchDatasetReadmeRefs: params.row.cooperBenchDatasetReadmeRefs,
    cooperBenchRunnerIds: params.row.cooperBenchRunnerIds,
    cooperBenchEvalBackendIds: params.row.cooperBenchEvalBackendIds,
    cooperBenchTeamHarnessIds: params.row.cooperBenchTeamHarnessIds,
    cooperBenchAgentAdapterIds: params.row.cooperBenchAgentAdapterIds,
    cooperBenchCiWorkflowIds: params.row.cooperBenchCiWorkflowIds,
    cooperBenchPackageLockRefs: params.row.cooperBenchPackageLockRefs,
    cooperBenchReportPublicationRefs: params.row.cooperBenchReportPublicationRefs,
    cooperBenchMetricNames: params.row.cooperBenchMetricNames,
    cooperBenchTaskCount: params.row.cooperBenchTaskCount,
    cooperBenchFeatureCount: params.row.cooperBenchFeatureCount,
    cooperBenchAgentAdapterCount: params.row.cooperBenchAgentAdapterCount,
    cooperBenchTestCount: params.row.cooperBenchTestCount,
    cooperBenchCooperationScore0to1: params.row.cooperBenchCooperationScore0to1,
    cooperBenchConflictResolutionRate0to1: params.row.cooperBenchConflictResolutionRate0to1,
    cooperBenchRegressionPassRate0to1: params.row.cooperBenchRegressionPassRate0to1,
    cooperBenchReportArtifactHashes: params.row.cooperBenchReportArtifactHashes,
    coderCupCoverage: params.row.coderCupCoverage,
    coderCupSampleSize: params.row.coderCupSampleSize,
    coderCupMissingSignals: params.row.coderCupMissingSignals,
    coderCupRepositoryRefs: params.row.coderCupRepositoryRefs,
    coderCupLicenseRefs: params.row.coderCupLicenseRefs,
    coderCupHomepageRefs: params.row.coderCupHomepageRefs,
    coderCupBranchRefs: params.row.coderCupBranchRefs,
    coderCupCommitRefs: params.row.coderCupCommitRefs,
    coderCupTreeRefs: params.row.coderCupTreeRefs,
    coderCupReadmeBlobRefs: params.row.coderCupReadmeBlobRefs,
    coderCupContributingRefs: params.row.coderCupContributingRefs,
    coderCupCiWorkflowIds: params.row.coderCupCiWorkflowIds,
    coderCupPackageManifestRefs: params.row.coderCupPackageManifestRefs,
    coderCupPackageLockRefs: params.row.coderCupPackageLockRefs,
    coderCupTaskSpecRefs: params.row.coderCupTaskSpecRefs,
    coderCupTestSuiteRefs: params.row.coderCupTestSuiteRefs,
    coderCupSuiteIndexRefs: params.row.coderCupSuiteIndexRefs,
    coderCupRunnerIds: params.row.coderCupRunnerIds,
    coderCupRunnerContractRefs: params.row.coderCupRunnerContractRefs,
    coderCupScoreLedgerRefs: params.row.coderCupScoreLedgerRefs,
    coderCupLiveArtifactRefs: params.row.coderCupLiveArtifactRefs,
    coderCupMethodologyRefs: params.row.coderCupMethodologyRefs,
    coderCupReferenceRefs: params.row.coderCupReferenceRefs,
    coderCupCostMethodologyRefs: params.row.coderCupCostMethodologyRefs,
    coderCupPublicFixtureRefs: params.row.coderCupPublicFixtureRefs,
    coderCupMetricNames: params.row.coderCupMetricNames,
    coderCupPhaseCount: params.row.coderCupPhaseCount,
    coderCupTestPlanCount: params.row.coderCupTestPlanCount,
    coderCupRunnerCount: params.row.coderCupRunnerCount,
    coderCupScoreLedgerCount: params.row.coderCupScoreLedgerCount,
    coderCupLiveSurfaceCount: params.row.coderCupLiveSurfaceCount,
    coderCupInterRaterAgreement0to1: params.row.coderCupInterRaterAgreement0to1,
    coderCupTestRetestReliability0to1: params.row.coderCupTestRetestReliability0to1,
    coderCupRegressionPassRate0to1: params.row.coderCupRegressionPassRate0to1,
    coderCupReportArtifactHashes: params.row.coderCupReportArtifactHashes,
    agenticGraphRagCoverage: params.row.agenticGraphRagCoverage,
    agenticGraphRagSampleSize: params.row.agenticGraphRagSampleSize,
    agenticGraphRagMissingSignals: params.row.agenticGraphRagMissingSignals,
    agenticGraphRagRepositoryRefs: params.row.agenticGraphRagRepositoryRefs,
    agenticGraphRagLicenseRefs: params.row.agenticGraphRagLicenseRefs,
    agenticGraphRagBranchRefs: params.row.agenticGraphRagBranchRefs,
    agenticGraphRagCommitRefs: params.row.agenticGraphRagCommitRefs,
    agenticGraphRagTreeRefs: params.row.agenticGraphRagTreeRefs,
    agenticGraphRagReadmeBlobRefs: params.row.agenticGraphRagReadmeBlobRefs,
    agenticGraphRagGraphWorkflowIds: params.row.agenticGraphRagGraphWorkflowIds,
    agenticGraphRagOrchestratorIds: params.row.agenticGraphRagOrchestratorIds,
    agenticGraphRagRagPipelineIds: params.row.agenticGraphRagRagPipelineIds,
    agenticGraphRagDatabaseIds: params.row.agenticGraphRagDatabaseIds,
    agenticGraphRagVectorStoreIds: params.row.agenticGraphRagVectorStoreIds,
    agenticGraphRagEvaluationIds: params.row.agenticGraphRagEvaluationIds,
    agenticGraphRagExperimentTrackerIds: params.row.agenticGraphRagExperimentTrackerIds,
    agenticGraphRagUiComponentIds: params.row.agenticGraphRagUiComponentIds,
    agenticGraphRagDependencyLockRefs: params.row.agenticGraphRagDependencyLockRefs,
    agenticGraphRagMetricNames: params.row.agenticGraphRagMetricNames,
    agenticGraphRagGraphNodeCount: params.row.agenticGraphRagGraphNodeCount,
    agenticGraphRagGraphEdgeCount: params.row.agenticGraphRagGraphEdgeCount,
    agenticGraphRagEvaluationMetricCount: params.row.agenticGraphRagEvaluationMetricCount,
    agenticGraphRagExperimentCount: params.row.agenticGraphRagExperimentCount,
    agenticGraphRagRetrievalGroundingScore0to1: params.row.agenticGraphRagRetrievalGroundingScore0to1,
    agenticGraphRagRegressionPassRate0to1: params.row.agenticGraphRagRegressionPassRate0to1,
    agenticGraphRagReportArtifactHashes: params.row.agenticGraphRagReportArtifactHashes,
    agentScenarioTestCoverage: params.row.agentScenarioTestCoverage,
    agentScenarioTestSampleSize: params.row.agentScenarioTestSampleSize,
    agentScenarioTestMissingSignals: params.row.agentScenarioTestMissingSignals,
    agentScenarioTestBenchmarkIds: params.row.agentScenarioTestBenchmarkIds,
    agentScenarioTestRepositoryRefs: params.row.agentScenarioTestRepositoryRefs,
    agentScenarioTestLicenseRefs: params.row.agentScenarioTestLicenseRefs,
    agentScenarioTestScenarioIds: params.row.agentScenarioTestScenarioIds,
    agentScenarioTestPersonaIds: params.row.agentScenarioTestPersonaIds,
    agentScenarioTestGoalIds: params.row.agentScenarioTestGoalIds,
    agentScenarioTestKnowledgeSetIds: params.row.agentScenarioTestKnowledgeSetIds,
    agentScenarioTestToolMockIds: params.row.agentScenarioTestToolMockIds,
    agentScenarioTestTrajectoryAssertionIds: params.row.agentScenarioTestTrajectoryAssertionIds,
    agentScenarioTestJudgeIds: params.row.agentScenarioTestJudgeIds,
    agentScenarioTestMetricNames: params.row.agentScenarioTestMetricNames,
    agentScenarioTestReporterFormats: params.row.agentScenarioTestReporterFormats,
    agentScenarioTestAgentIds: params.row.agentScenarioTestAgentIds,
    agentScenarioTestComparisonIds: params.row.agentScenarioTestComparisonIds,
    agentScenarioTestScenarioCount: params.row.agentScenarioTestScenarioCount,
    agentScenarioTestTurnCount: params.row.agentScenarioTestTurnCount,
    agentScenarioTestToolCallCount: params.row.agentScenarioTestToolCallCount,
    agentScenarioTestReportArtifactHashes: params.row.agentScenarioTestReportArtifactHashes,
    openCodeLabCoverage: params.row.openCodeLabCoverage,
    openCodeLabSampleSize: params.row.openCodeLabSampleSize,
    openCodeLabMissingSignals: params.row.openCodeLabMissingSignals,
    openCodeLabBenchmarkIds: params.row.openCodeLabBenchmarkIds,
    openCodeLabRepositoryRefs: params.row.openCodeLabRepositoryRefs,
    openCodeLabAgentContextIds: params.row.openCodeLabAgentContextIds,
    openCodeLabPromptVariantIds: params.row.openCodeLabPromptVariantIds,
    openCodeLabToolDescriptionIds: params.row.openCodeLabToolDescriptionIds,
    openCodeLabPolicyIds: params.row.openCodeLabPolicyIds,
    openCodeLabRunTraceIds: params.row.openCodeLabRunTraceIds,
    openCodeLabForkIds: params.row.openCodeLabForkIds,
    openCodeLabModelIds: params.row.openCodeLabModelIds,
    openCodeLabGroundTruthIds: params.row.openCodeLabGroundTruthIds,
    openCodeLabMetricNames: params.row.openCodeLabMetricNames,
    openCodeLabReporterFormats: params.row.openCodeLabReporterFormats,
    openCodeLabResultArtifactIds: params.row.openCodeLabResultArtifactIds,
    openCodeLabRunCount: params.row.openCodeLabRunCount,
    openCodeLabForkAgreement0to1: params.row.openCodeLabForkAgreement0to1,
    openCodeLabModelVariance0to1: params.row.openCodeLabModelVariance0to1,
    openCodeLabReportArtifactHashes: params.row.openCodeLabReportArtifactHashes,
    ccPluginEvalCoverage: params.row.ccPluginEvalCoverage,
    ccPluginEvalSampleSize: params.row.ccPluginEvalSampleSize,
    ccPluginEvalMissingSignals: params.row.ccPluginEvalMissingSignals,
    ccPluginEvalRepositoryRefs: params.row.ccPluginEvalRepositoryRefs,
    ccPluginEvalLicenseRefs: params.row.ccPluginEvalLicenseRefs,
    ccPluginEvalPluginManifestIds: params.row.ccPluginEvalPluginManifestIds,
    ccPluginEvalComponentTypes: params.row.ccPluginEvalComponentTypes,
    ccPluginEvalTriggerManifestIds: params.row.ccPluginEvalTriggerManifestIds,
    ccPluginEvalScenarioManifestIds: params.row.ccPluginEvalScenarioManifestIds,
    ccPluginEvalScenarioTypes: params.row.ccPluginEvalScenarioTypes,
    ccPluginEvalTranscriptIds: params.row.ccPluginEvalTranscriptIds,
    ccPluginEvalDetectionReportIds: params.row.ccPluginEvalDetectionReportIds,
    ccPluginEvalDetectionModes: params.row.ccPluginEvalDetectionModes,
    ccPluginEvalJudgeIds: params.row.ccPluginEvalJudgeIds,
    ccPluginEvalCalibrationIds: params.row.ccPluginEvalCalibrationIds,
    ccPluginEvalConflictReportIds: params.row.ccPluginEvalConflictReportIds,
    ccPluginEvalCheckpointStateIds: params.row.ccPluginEvalCheckpointStateIds,
    ccPluginEvalCostEstimateIds: params.row.ccPluginEvalCostEstimateIds,
    ccPluginEvalReporterFormats: params.row.ccPluginEvalReporterFormats,
    ccPluginEvalResultArtifactIds: params.row.ccPluginEvalResultArtifactIds,
    ccPluginEvalMetricNames: params.row.ccPluginEvalMetricNames,
    ccPluginEvalTriggerAccuracy0to1: params.row.ccPluginEvalTriggerAccuracy0to1,
    ccPluginEvalFalsePositiveRate0to1: params.row.ccPluginEvalFalsePositiveRate0to1,
    ccPluginEvalFalseNegativeRate0to1: params.row.ccPluginEvalFalseNegativeRate0to1,
    ccPluginEvalComponentCount: params.row.ccPluginEvalComponentCount,
    ccPluginEvalScenarioCount: params.row.ccPluginEvalScenarioCount,
    ccPluginEvalReportArtifactHashes: params.row.ccPluginEvalReportArtifactHashes,
    realignSimulationCoverage: params.row.realignSimulationCoverage,
    realignSimulationSampleSize: params.row.realignSimulationSampleSize,
    realignSimulationMissingSignals: params.row.realignSimulationMissingSignals,
    realignSimulationRepositoryRefs: params.row.realignSimulationRepositoryRefs,
    realignSimulationLicenseRefs: params.row.realignSimulationLicenseRefs,
    realignSimulationConfigIds: params.row.realignSimulationConfigIds,
    realignSimulationAppIds: params.row.realignSimulationAppIds,
    realignSimulationDatasetIds: params.row.realignSimulationDatasetIds,
    realignSimulationScenarioIds: params.row.realignSimulationScenarioIds,
    realignSimulationPersonaIds: params.row.realignSimulationPersonaIds,
    realignSimulationEvaluatorIds: params.row.realignSimulationEvaluatorIds,
    realignSimulationTargetIds: params.row.realignSimulationTargetIds,
    realignSimulationRunTraceIds: params.row.realignSimulationRunTraceIds,
    realignSimulationRepeatedRunTraceIds: params.row.realignSimulationRepeatedRunTraceIds,
    realignSimulationJudgeIds: params.row.realignSimulationJudgeIds,
    realignSimulationCalibrationIds: params.row.realignSimulationCalibrationIds,
    realignSimulationStatisticsReportIds: params.row.realignSimulationStatisticsReportIds,
    realignSimulationCiReporterIds: params.row.realignSimulationCiReporterIds,
    realignSimulationReporterFormats: params.row.realignSimulationReporterFormats,
    realignSimulationExperimentIds: params.row.realignSimulationExperimentIds,
    realignSimulationResultArtifactIds: params.row.realignSimulationResultArtifactIds,
    realignSimulationMetricNames: params.row.realignSimulationMetricNames,
    realignSimulationJudgeAgreement0to1: params.row.realignSimulationJudgeAgreement0to1,
    realignSimulationRegressionPassRate0to1: params.row.realignSimulationRegressionPassRate0to1,
    realignSimulationScenarioCount: params.row.realignSimulationScenarioCount,
    realignSimulationEvaluatorCount: params.row.realignSimulationEvaluatorCount,
    realignSimulationRepeatCount: params.row.realignSimulationRepeatCount,
    realignSimulationReportArtifactHashes: params.row.realignSimulationReportArtifactHashes,
    academiClawCoverage: params.row.academiClawCoverage,
    academiClawSampleSize: params.row.academiClawSampleSize,
    academiClawMissingSignals: params.row.academiClawMissingSignals,
    academiClawRepositoryRefs: params.row.academiClawRepositoryRefs,
    academiClawLicenseRefs: params.row.academiClawLicenseRefs,
    academiClawBranchRefs: params.row.academiClawBranchRefs,
    academiClawCommitRefs: params.row.academiClawCommitRefs,
    academiClawTreeRefs: params.row.academiClawTreeRefs,
    academiClawReadmeBlobRefs: params.row.academiClawReadmeBlobRefs,
    academiClawCitationRefs: params.row.academiClawCitationRefs,
    academiClawTaskCorpusRefs: params.row.academiClawTaskCorpusRefs,
    academiClawLanguageIds: params.row.academiClawLanguageIds,
    academiClawWorkspaceQueryIds: params.row.academiClawWorkspaceQueryIds,
    academiClawDockerImageIds: params.row.academiClawDockerImageIds,
    academiClawRubricIds: params.row.academiClawRubricIds,
    academiClawEvalTaskRunnerIds: params.row.academiClawEvalTaskRunnerIds,
    academiClawResultManifestIds: params.row.academiClawResultManifestIds,
    academiClawConversationTraceIds: params.row.academiClawConversationTraceIds,
    academiClawMetaEvalIds: params.row.academiClawMetaEvalIds,
    academiClawModelIds: params.row.academiClawModelIds,
    academiClawMetricNames: params.row.academiClawMetricNames,
    academiClawCiReporterIds: params.row.academiClawCiReporterIds,
    academiClawReporterFormats: params.row.academiClawReporterFormats,
    academiClawTaskCount: params.row.academiClawTaskCount,
    academiClawLanguageCount: params.row.academiClawLanguageCount,
    academiClawRubricCount: params.row.academiClawRubricCount,
    academiClawTraceCount: params.row.academiClawTraceCount,
    academiClawMetaEvalCount: params.row.academiClawMetaEvalCount,
    academiClawModelCount: params.row.academiClawModelCount,
    academiClawRegressionPassRate0to1: params.row.academiClawRegressionPassRate0to1,
    academiClawReportArtifactHashes: params.row.academiClawReportArtifactHashes,
    ragChunkingTechniqueCoverage: params.row.ragChunkingTechniqueCoverage,
    ragChunkingTechniqueSampleSize: params.row.ragChunkingTechniqueSampleSize,
    ragChunkingTechniqueMissingSignals: params.row.ragChunkingTechniqueMissingSignals,
    ragChunkingTechniqueRepositoryRefs: params.row.ragChunkingTechniqueRepositoryRefs,
    ragChunkingTechniqueLicenseRefs: params.row.ragChunkingTechniqueLicenseRefs,
    ragChunkingTechniqueBranchRefs: params.row.ragChunkingTechniqueBranchRefs,
    ragChunkingTechniqueCommitRefs: params.row.ragChunkingTechniqueCommitRefs,
    ragChunkingTechniqueTreeRefs: params.row.ragChunkingTechniqueTreeRefs,
    ragChunkingTechniqueReadmeBlobRefs: params.row.ragChunkingTechniqueReadmeBlobRefs,
    ragChunkingTechniquePolicyCorpusRefs: params.row.ragChunkingTechniquePolicyCorpusRefs,
    ragChunkingTechniqueNotebookIds: params.row.ragChunkingTechniqueNotebookIds,
    ragChunkingTechniqueChunkingStrategyIds: params.row.ragChunkingTechniqueChunkingStrategyIds,
    ragChunkingTechniqueRetrievalPipelineIds: params.row.ragChunkingTechniqueRetrievalPipelineIds,
    ragChunkingTechniqueEmbeddingVectorstoreIds: params.row.ragChunkingTechniqueEmbeddingVectorstoreIds,
    ragChunkingTechniqueEvaluationDatasetIds: params.row.ragChunkingTechniqueEvaluationDatasetIds,
    ragChunkingTechniqueMetricNames: params.row.ragChunkingTechniqueMetricNames,
    ragChunkingTechniqueCiReporterIds: params.row.ragChunkingTechniqueCiReporterIds,
    ragChunkingTechniqueReporterFormats: params.row.ragChunkingTechniqueReporterFormats,
    ragChunkingTechniquePolicyDocumentCount: params.row.ragChunkingTechniquePolicyDocumentCount,
    ragChunkingTechniqueNotebookCount: params.row.ragChunkingTechniqueNotebookCount,
    ragChunkingTechniqueChunkingStrategyCount: params.row.ragChunkingTechniqueChunkingStrategyCount,
    ragChunkingTechniqueEvaluationQuestionCount: params.row.ragChunkingTechniqueEvaluationQuestionCount,
    ragChunkingTechniqueMetricCount: params.row.ragChunkingTechniqueMetricCount,
    ragChunkingTechniqueRegressionPassRate0to1: params.row.ragChunkingTechniqueRegressionPassRate0to1,
    ragChunkingTechniqueReportArtifactHashes: params.row.ragChunkingTechniqueReportArtifactHashes,
    kubernetesOperationalAgentCoverage: params.row.kubernetesOperationalAgentCoverage,
    kubernetesOperationalAgentSampleSize: params.row.kubernetesOperationalAgentSampleSize,
    kubernetesOperationalAgentMissingSignals: params.row.kubernetesOperationalAgentMissingSignals,
    kubernetesOperationalAgentRepositoryRefs: params.row.kubernetesOperationalAgentRepositoryRefs,
    kubernetesOperationalAgentLicenseRefs: params.row.kubernetesOperationalAgentLicenseRefs,
    kubernetesOperationalAgentReleaseRefs: params.row.kubernetesOperationalAgentReleaseRefs,
    kubernetesOperationalAgentBranchRefs: params.row.kubernetesOperationalAgentBranchRefs,
    kubernetesOperationalAgentCommitRefs: params.row.kubernetesOperationalAgentCommitRefs,
    kubernetesOperationalAgentTreeRefs: params.row.kubernetesOperationalAgentTreeRefs,
    kubernetesOperationalAgentReadmeBlobRefs: params.row.kubernetesOperationalAgentReadmeBlobRefs,
    kubernetesOperationalAgentBuildWorkflowRefs: params.row.kubernetesOperationalAgentBuildWorkflowRefs,
    kubernetesOperationalAgentAgentModuleRefs: params.row.kubernetesOperationalAgentAgentModuleRefs,
    kubernetesOperationalAgentMcpServerModuleRefs: params.row.kubernetesOperationalAgentMcpServerModuleRefs,
    kubernetesOperationalAgentToolModuleRefs: params.row.kubernetesOperationalAgentToolModuleRefs,
    kubernetesOperationalAgentToolCategoryIds: params.row.kubernetesOperationalAgentToolCategoryIds,
    kubernetesOperationalAgentDiagnosticCapabilityIds: params.row.kubernetesOperationalAgentDiagnosticCapabilityIds,
    kubernetesOperationalAgentResourceMetricIds: params.row.kubernetesOperationalAgentResourceMetricIds,
    kubernetesOperationalAgentLogAnalysisIds: params.row.kubernetesOperationalAgentLogAnalysisIds,
    kubernetesOperationalAgentMetricNames: params.row.kubernetesOperationalAgentMetricNames,
    kubernetesOperationalAgentCiReporterIds: params.row.kubernetesOperationalAgentCiReporterIds,
    kubernetesOperationalAgentReporterFormats: params.row.kubernetesOperationalAgentReporterFormats,
    kubernetesOperationalAgentToolCategoryCount: params.row.kubernetesOperationalAgentToolCategoryCount,
    kubernetesOperationalAgentDiagnosticCapabilityCount: params.row.kubernetesOperationalAgentDiagnosticCapabilityCount,
    kubernetesOperationalAgentResourceMetricCount: params.row.kubernetesOperationalAgentResourceMetricCount,
    kubernetesOperationalAgentLogAnalysisCount: params.row.kubernetesOperationalAgentLogAnalysisCount,
    kubernetesOperationalAgentRegressionPassRate0to1: params.row.kubernetesOperationalAgentRegressionPassRate0to1,
    kubernetesOperationalAgentReportArtifactHashes: params.row.kubernetesOperationalAgentReportArtifactHashes,
    secureVibeBenchCoverage: params.row.secureVibeBenchCoverage,
    secureVibeBenchSampleSize: params.row.secureVibeBenchSampleSize,
    secureVibeBenchMissingSignals: params.row.secureVibeBenchMissingSignals,
    secureVibeBenchRepositoryRefs: params.row.secureVibeBenchRepositoryRefs,
    secureVibeBenchLicenseRefs: params.row.secureVibeBenchLicenseRefs,
    secureVibeBenchHomepageRefs: params.row.secureVibeBenchHomepageRefs,
    secureVibeBenchArxivRefs: params.row.secureVibeBenchArxivRefs,
    secureVibeBenchBranchRefs: params.row.secureVibeBenchBranchRefs,
    secureVibeBenchCommitRefs: params.row.secureVibeBenchCommitRefs,
    secureVibeBenchTreeRefs: params.row.secureVibeBenchTreeRefs,
    secureVibeBenchReadmeBlobRefs: params.row.secureVibeBenchReadmeBlobRefs,
    secureVibeBenchResultsBlobRefs: params.row.secureVibeBenchResultsBlobRefs,
    secureVibeBenchDatasetRefs: params.row.secureVibeBenchDatasetRefs,
    secureVibeBenchFormatExampleRefs: params.row.secureVibeBenchFormatExampleRefs,
    secureVibeBenchEvaluationRunnerRefs: params.row.secureVibeBenchEvaluationRunnerRefs,
    secureVibeBenchAgentAdapterIds: params.row.secureVibeBenchAgentAdapterIds,
    secureVibeBenchVulnerabilityScenarioIds: params.row.secureVibeBenchVulnerabilityScenarioIds,
    secureVibeBenchTestScriptIds: params.row.secureVibeBenchTestScriptIds,
    secureVibeBenchParserUtilityRefs: params.row.secureVibeBenchParserUtilityRefs,
    secureVibeBenchPatchDiffUtilityRefs: params.row.secureVibeBenchPatchDiffUtilityRefs,
    secureVibeBenchMetricNames: params.row.secureVibeBenchMetricNames,
    secureVibeBenchCiReporterIds: params.row.secureVibeBenchCiReporterIds,
    secureVibeBenchReporterFormats: params.row.secureVibeBenchReporterFormats,
    secureVibeBenchAgentAdapterCount: params.row.secureVibeBenchAgentAdapterCount,
    secureVibeBenchScenarioCount: params.row.secureVibeBenchScenarioCount,
    secureVibeBenchTestScriptCount: params.row.secureVibeBenchTestScriptCount,
    secureVibeBenchRegressionPassRate0to1: params.row.secureVibeBenchRegressionPassRate0to1,
    secureVibeBenchReportArtifactHashes: params.row.secureVibeBenchReportArtifactHashes,
    ravigBenchCoverage: params.row.ravigBenchCoverage,
    ravigBenchSampleSize: params.row.ravigBenchSampleSize,
    ravigBenchMissingSignals: params.row.ravigBenchMissingSignals,
    ravigBenchRepositoryRefs: params.row.ravigBenchRepositoryRefs,
    ravigBenchLicenseRefs: params.row.ravigBenchLicenseRefs,
    ravigBenchBranchRefs: params.row.ravigBenchBranchRefs,
    ravigBenchCommitRefs: params.row.ravigBenchCommitRefs,
    ravigBenchTreeRefs: params.row.ravigBenchTreeRefs,
    ravigBenchReadmeBlobRefs: params.row.ravigBenchReadmeBlobRefs,
    ravigBenchLegalBlobRefs: params.row.ravigBenchLegalBlobRefs,
    ravigBenchEnvironmentRefs: params.row.ravigBenchEnvironmentRefs,
    ravigBenchConfigurationRefs: params.row.ravigBenchConfigurationRefs,
    ravigBenchContentEvaluationRefs: params.row.ravigBenchContentEvaluationRefs,
    ravigBenchDesignEvaluationRefs: params.row.ravigBenchDesignEvaluationRefs,
    ravigBenchExecutionEvaluationRefs: params.row.ravigBenchExecutionEvaluationRefs,
    ravigBenchFunctionScoringRefs: params.row.ravigBenchFunctionScoringRefs,
    ravigBenchDatasetRefs: params.row.ravigBenchDatasetRefs,
    ravigBenchTestCaseRefs: params.row.ravigBenchTestCaseRefs,
    ravigBenchModelResultRefs: params.row.ravigBenchModelResultRefs,
    ravigBenchTaxonomyIds: params.row.ravigBenchTaxonomyIds,
    ravigBenchRetrievalContextIds: params.row.ravigBenchRetrievalContextIds,
    ravigBenchMultiModalEvaluatorIds: params.row.ravigBenchMultiModalEvaluatorIds,
    ravigBenchScreenshotEvaluationRefs: params.row.ravigBenchScreenshotEvaluationRefs,
    ravigBenchRunScriptRefs: params.row.ravigBenchRunScriptRefs,
    ravigBenchMetricNames: params.row.ravigBenchMetricNames,
    ravigBenchCiReporterIds: params.row.ravigBenchCiReporterIds,
    ravigBenchReporterFormats: params.row.ravigBenchReporterFormats,
    ravigBenchDatasetCaseCount: params.row.ravigBenchDatasetCaseCount,
    ravigBenchVisualDesignCheckCount: params.row.ravigBenchVisualDesignCheckCount,
    ravigBenchEvaluatorCount: params.row.ravigBenchEvaluatorCount,
    ravigBenchValidationPassRate0to1: params.row.ravigBenchValidationPassRate0to1,
    ravigBenchReportArtifactHashes: params.row.ravigBenchReportArtifactHashes,
    humanStudyBenchCoverage: params.row.humanStudyBenchCoverage,
    humanStudyBenchSampleSize: params.row.humanStudyBenchSampleSize,
    humanStudyBenchMissingSignals: params.row.humanStudyBenchMissingSignals,
    humanStudyBenchRepositoryRefs: params.row.humanStudyBenchRepositoryRefs,
    humanStudyBenchLicenseRefs: params.row.humanStudyBenchLicenseRefs,
    humanStudyBenchBranchRefs: params.row.humanStudyBenchBranchRefs,
    humanStudyBenchCommitRefs: params.row.humanStudyBenchCommitRefs,
    humanStudyBenchStudyConfigIds: params.row.humanStudyBenchStudyConfigIds,
    humanStudyBenchBackgroundDatasetIds: params.row.humanStudyBenchBackgroundDatasetIds,
    humanStudyBenchHumanResponseDatasetIds: params.row.humanStudyBenchHumanResponseDatasetIds,
    humanStudyBenchAgentResponseDatasetIds: params.row.humanStudyBenchAgentResponseDatasetIds,
    humanStudyBenchEvaluatorIds: params.row.humanStudyBenchEvaluatorIds,
    humanStudyBenchMetricNames: params.row.humanStudyBenchMetricNames,
    humanStudyBenchValidatorIds: params.row.humanStudyBenchValidatorIds,
    humanStudyBenchScorerIds: params.row.humanStudyBenchScorerIds,
    humanStudyBenchStandardizerIds: params.row.humanStudyBenchStandardizerIds,
    humanStudyBenchReliabilityReportIds: params.row.humanStudyBenchReliabilityReportIds,
    humanStudyBenchValidationPipelineIds: params.row.humanStudyBenchValidationPipelineIds,
    humanStudyBenchResultArtifactIds: params.row.humanStudyBenchResultArtifactIds,
    humanStudyBenchCiReporterIds: params.row.humanStudyBenchCiReporterIds,
    humanStudyBenchReporterFormats: params.row.humanStudyBenchReporterFormats,
    humanStudyBenchStudyCount: params.row.humanStudyBenchStudyCount,
    humanStudyBenchParticipantCount: params.row.humanStudyBenchParticipantCount,
    humanStudyBenchResponseCount: params.row.humanStudyBenchResponseCount,
    humanStudyBenchEvaluatorCount: params.row.humanStudyBenchEvaluatorCount,
    humanStudyBenchInterRaterAgreement0to1: params.row.humanStudyBenchInterRaterAgreement0to1,
    humanStudyBenchTestRetestReliability0to1: params.row.humanStudyBenchTestRetestReliability0to1,
    humanStudyBenchValidationPassRate0to1: params.row.humanStudyBenchValidationPassRate0to1,
    humanStudyBenchReportArtifactHashes: params.row.humanStudyBenchReportArtifactHashes,
    legacyBenchCoverage: params.row.legacyBenchCoverage,
    legacyBenchSampleSize: params.row.legacyBenchSampleSize,
    legacyBenchMissingSignals: params.row.legacyBenchMissingSignals,
    legacyBenchRepositoryRefs: params.row.legacyBenchRepositoryRefs,
    legacyBenchLicenseRefs: params.row.legacyBenchLicenseRefs,
    legacyBenchBranchRefs: params.row.legacyBenchBranchRefs,
    legacyBenchCommitRefs: params.row.legacyBenchCommitRefs,
    legacyBenchTreeRefs: params.row.legacyBenchTreeRefs,
    legacyBenchReadmeBlobRefs: params.row.legacyBenchReadmeBlobRefs,
    legacyBenchTaskCorpusRefs: params.row.legacyBenchTaskCorpusRefs,
    legacyBenchLegacyLanguageIds: params.row.legacyBenchLegacyLanguageIds,
    legacyBenchEnvironmentIds: params.row.legacyBenchEnvironmentIds,
    legacyBenchHarnessRunnerIds: params.row.legacyBenchHarnessRunnerIds,
    legacyBenchAgentTaskIds: params.row.legacyBenchAgentTaskIds,
    legacyBenchPatchSubmissionIds: params.row.legacyBenchPatchSubmissionIds,
    legacyBenchTestOracleIds: params.row.legacyBenchTestOracleIds,
    legacyBenchEvaluatorIds: params.row.legacyBenchEvaluatorIds,
    legacyBenchMetricNames: params.row.legacyBenchMetricNames,
    legacyBenchCiReporterIds: params.row.legacyBenchCiReporterIds,
    legacyBenchReporterFormats: params.row.legacyBenchReporterFormats,
    legacyBenchResultArtifactIds: params.row.legacyBenchResultArtifactIds,
    legacyBenchReplayCommandIds: params.row.legacyBenchReplayCommandIds,
    legacyBenchTaskCount: params.row.legacyBenchTaskCount,
    legacyBenchLanguageCount: params.row.legacyBenchLanguageCount,
    legacyBenchEnvironmentCount: params.row.legacyBenchEnvironmentCount,
    legacyBenchTestOracleCount: params.row.legacyBenchTestOracleCount,
    legacyBenchEvaluatorCount: params.row.legacyBenchEvaluatorCount,
    legacyBenchRegressionPassRate0to1: params.row.legacyBenchRegressionPassRate0to1,
    legacyBenchReplayPassRate0to1: params.row.legacyBenchReplayPassRate0to1,
    legacyBenchReportArtifactHashes: params.row.legacyBenchReportArtifactHashes,
    subtleMemoryCoverage: params.row.subtleMemoryCoverage,
    subtleMemorySampleSize: params.row.subtleMemorySampleSize,
    subtleMemoryMissingSignals: params.row.subtleMemoryMissingSignals,
    subtleMemoryRepositoryRefs: params.row.subtleMemoryRepositoryRefs,
    subtleMemoryLicenseRefs: params.row.subtleMemoryLicenseRefs,
    subtleMemoryBranchRefs: params.row.subtleMemoryBranchRefs,
    subtleMemoryCommitRefs: params.row.subtleMemoryCommitRefs,
    subtleMemoryTreeRefs: params.row.subtleMemoryTreeRefs,
    subtleMemoryArxivRefs: params.row.subtleMemoryArxivRefs,
    subtleMemoryDatasetRefs: params.row.subtleMemoryDatasetRefs,
    subtleMemoryPersonaIds: params.row.subtleMemoryPersonaIds,
    subtleMemoryBenchInstanceManifestIds: params.row.subtleMemoryBenchInstanceManifestIds,
    subtleMemoryHistorySessionManifestIds: params.row.subtleMemoryHistorySessionManifestIds,
    subtleMemoryRelationTypes: params.row.subtleMemoryRelationTypes,
    subtleMemoryConstructionPipelineIds: params.row.subtleMemoryConstructionPipelineIds,
    subtleMemoryEvaluationStageIds: params.row.subtleMemoryEvaluationStageIds,
    subtleMemoryAdapterIds: params.row.subtleMemoryAdapterIds,
    subtleMemoryJudgeIds: params.row.subtleMemoryJudgeIds,
    subtleMemoryEvaluatorIds: params.row.subtleMemoryEvaluatorIds,
    subtleMemoryMetricNames: params.row.subtleMemoryMetricNames,
    subtleMemoryScoreSummaryIds: params.row.subtleMemoryScoreSummaryIds,
    subtleMemoryDiagnosticProtocolIds: params.row.subtleMemoryDiagnosticProtocolIds,
    subtleMemoryCiReporterIds: params.row.subtleMemoryCiReporterIds,
    subtleMemoryReporterFormats: params.row.subtleMemoryReporterFormats,
    subtleMemoryPersonaCount: params.row.subtleMemoryPersonaCount,
    subtleMemoryBenchInstanceCount: params.row.subtleMemoryBenchInstanceCount,
    subtleMemoryHistoryCount: params.row.subtleMemoryHistoryCount,
    subtleMemoryMemoryVariantSetCount: params.row.subtleMemoryMemoryVariantSetCount,
    subtleMemoryRelationTypeCount: params.row.subtleMemoryRelationTypeCount,
    subtleMemoryEvaluationStageCount: params.row.subtleMemoryEvaluationStageCount,
    subtleMemoryAdapterCount: params.row.subtleMemoryAdapterCount,
    subtleMemoryJudgeAgreement0to1: params.row.subtleMemoryJudgeAgreement0to1,
    subtleMemoryValidationPassRate0to1: params.row.subtleMemoryValidationPassRate0to1,
    subtleMemoryReportArtifactHashes: params.row.subtleMemoryReportArtifactHashes,
    status: params.row.status,
    confidenceInterval: params.row.confidenceInterval,
    evidenceRefs: params.row.evidenceRefs,
    signedEvidenceRefs: signedEvidenceRefsFor(params.row.evidenceRefs, params.signedEvidenceRefs),
    warnings: params.row.warnings
  };
  return {
    ...rowWithoutHash,
    rowHash: sha256Hex(canonicalize(rowWithoutHash))
  };
}

function buildMetricValidationEvalPack(params: {
  agentId: string;
  runId: string;
  generatedAt: string;
  rows: MetricValidationRow[];
  signedEvidenceRefs: QuestionScoreSignedEvidenceRef[];
  sourceRefs: string[];
  datasetHash?: string;
}): MetricValidationEvalPackManifest {
  const rows = params.rows.map((row) => buildEvalPackRow({
    row,
    signedEvidenceRefs: params.signedEvidenceRefs
  }));
  const datasetHash = params.datasetHash ??
    sha256Hex(canonicalize({
      runId: params.runId,
      metricIds: params.rows.map((row) => row.metricId),
      evidenceRefs: params.rows.map((row) => row.evidenceRefs)
    }));
  const replayable = rows.length > 0 &&
    rows.every((row) =>
      row.rowHash.length === 64 &&
      row.evidenceRefs.length > 0 &&
      row.signedEvidenceRefs.length === row.evidenceRefs.length &&
      row.signedEvidenceRefs.every((ref) => ref.eventHash.length > 0 && ref.writerSig.length > 0)
    );
  const manifestWithoutHash = {
    packId: `metric-validation:${params.runId}`,
    reportId: params.runId,
    agentId: params.agentId,
    createdAt: params.generatedAt,
    datasetHash,
    sourceRefs: params.sourceRefs,
    rowCount: rows.length,
    replayable,
    rows
  };
  return {
    ...manifestWithoutHash,
    manifestHash: sha256Hex(canonicalize(manifestWithoutHash))
  };
}

function buildMetricValidationCiGate(
  rows: MetricValidationRow[],
  mode: "ci" | "lifecycle",
  evalPackReplayable: boolean
): MetricValidationCiGate {
  const rowFailedMetricIds = rows.filter((row) => row.status === "fail").map((row) => row.metricId);
  const failedMetricIds = evalPackReplayable
    ? rowFailedMetricIds
    : [...new Set([...rowFailedMetricIds, ...rows.map((row) => row.metricId)])];
  const attentionMetricIds = rows.filter((row) => row.status === "attention").map((row) => row.metricId);
  const failClosed = failedMetricIds.length > 0;
  return {
    mode,
    passed: !failClosed,
    failClosed,
    failedMetricIds,
    attentionMetricIds,
    summary: failClosed
      ? evalPackReplayable
        ? `${failedMetricIds.length} metric validation gate(s) failed closed`
        : `${failedMetricIds.length} metric validation gate(s) failed closed because the eval pack is not replayable`
      : attentionMetricIds.length > 0
        ? `${attentionMetricIds.length} metric validation gate(s) need attention`
        : "all metric validation gates passed"
  };
}

export function buildMetricValidationReport(
  input: BuildMetricValidationInput,
  priorReports: DiagnosticReport[] = [],
  thresholds: MetricValidationThresholdPolicy = DEFAULT_THRESHOLDS
): MetricValidationReport {
  const layerByQuestion = new Map(input.questions?.map((question) => [question.id, question.layerName]) ?? []);
  const questionScoresByLayer = new Map<LayerName, QuestionScore[]>();
  for (const score of input.questionScores) {
    const layerName = layerByQuestion.get(score.questionId);
    if (!layerName) continue;
    const rows = questionScoresByLayer.get(layerName) ?? [];
    rows.push(score);
    questionScoresByLayer.set(layerName, rows);
  }

  const interRaterAgreement = input.confidenceSummary
    ? Number(clamp(input.confidenceSummary.averageJudgeAgreement, 0, 1).toFixed(6))
    : null;
  const overallValidity = constructValidity({
    questionScores: input.questionScores,
    integrityIndex: input.integrityIndex,
    evidenceCoverage: input.evidenceCoverage,
    correlationRatio: input.correlationRatio,
    unsupportedClaimCount: input.unsupportedClaimCount
  });
  const overallCounterfactuals = counterfactualSummary(input.counterfactualChecks, "overall_maturity_score");
  const overallFacets = validationFacetSummary(input.validationFacetChecks, "overall_maturity_score");
  const overallConfounders = confounderControlSummary(input.confounderControlChecks, "overall_maturity_score");
  const overallOutcomes = outcomeAlignmentSummary(input.outcomeAlignmentChecks, "overall_maturity_score");
  const overallProcessEvidence = processEvidenceSummary(input.processEvidenceChecks, "overall_maturity_score");
  const overallSafetyUtility = safetyUtilitySummary(input.safetyUtilityChecks, "overall_maturity_score");
  const overallModalityTransformation = modalityTransformationSummary(input.modalityTransformationChecks, "overall_maturity_score");
  const overallLifecycleObservability = lifecycleObservabilitySummary(input.lifecycleObservabilityChecks, "overall_maturity_score");
  const overallRankingStability = rankingStabilitySummary(input.rankingStabilityChecks, "overall_maturity_score");
  const overallToolSandbox = toolSandboxSummary(input.toolSandboxChecks, "overall_maturity_score");
  const overallContinualLearning = continualLearningSummary(input.continualLearningChecks, "overall_maturity_score");
  const overallStrategicInteraction = strategicInteractionSummary(input.strategicInteractionChecks, "overall_maturity_score");
  const overallArchitectureReality = architectureRealitySummary(
    input.architectureRealityChecks,
    "overall_maturity_score",
    thresholds,
    input.requireArchitectureRealityProof === true
  );
  const overallRagPipeline = ragPipelineSummary(input.ragPipelineChecks, "overall_maturity_score");
  const overallRagEvaluationPipeline = ragEvaluationPipelineSummary(
    input.ragPipelineChecks,
    "overall_maturity_score",
    thresholds,
    input.requireRagEvaluationPipelineProof === true
  );
  const overallRagasNotebook = ragasNotebookSummary(
    input.ragPipelineChecks,
    "overall_maturity_score",
    thresholds,
    input.requireRagasNotebookProof === true
  );
  const overallMirageRagMetric = mirageRagMetricSummary(
    input.ragPipelineChecks,
    "overall_maturity_score",
    thresholds,
    input.requireMirageRagMetricProof === true
  );
  const overallLegalCodeRagMetric = legalCodeRagMetricSummary(
    input.ragPipelineChecks,
    "overall_maturity_score",
    thresholds,
    input.requireLegalCodeRagProof === true
  );
  const overallGuardbenchMetric = guardbenchMetricSummary(
    input.guardbenchChecks,
    "overall_maturity_score",
    thresholds,
    input.requireGuardbenchMetricProof === true
  );
  const overallBusinessWorkflow = businessWorkflowSummary(input.businessWorkflowChecks, "overall_maturity_score");
  const overallDataAgentAnalytical = dataAgentAnalyticalSummary(input.dataAgentAnalyticalChecks, "overall_maturity_score");
  const overallEmbodiedAgent = embodiedAgentSummary(input.embodiedAgentChecks, "overall_maturity_score", thresholds);
  const overallEvaluatorSuite = evaluatorSuiteSummary(
    input.evaluatorSuiteChecks,
    "overall_maturity_score",
    thresholds,
    input.requireEvaluatorSuiteProof === true
  );
  const overallPentestBenchmark = pentestBenchmarkSummary(
    input.pentestBenchmarkChecks,
    "overall_maturity_score",
    thresholds,
    input.requirePentestBenchmarkProof === true
  );
  const overallTraceEvaluation = traceEvaluationSummary(
    input.traceEvaluationChecks,
    "overall_maturity_score",
    thresholds,
    input.requireTraceEvaluationProof === true
  );
  const overallLivingEnvironment = livingEnvironmentSummary(
    input.livingEnvironmentChecks,
    "overall_maturity_score",
    thresholds,
    input.requireLivingEnvironmentProof === true
  );
  const overallMobileAgent = mobileAgentSummary(
    input.mobileAgentChecks,
    "overall_maturity_score",
    thresholds,
    input.requireMobileAgentProof === true
  );
  const overallPersonaAgent = personaAgentSummary(
    input.personaAgentChecks,
    "overall_maturity_score",
    thresholds,
    input.requirePersonaAgentProof === true
  );
  const overallScientificLiterature = scientificLiteratureSummary(
    input.scientificLiteratureChecks,
    "overall_maturity_score",
    thresholds,
    input.requireScientificLiteratureProof === true
  );
  const overallBioinformaticsAgent = bioinformaticsAgentSummary(
    input.bioinformaticsAgentChecks,
    "overall_maturity_score",
    thresholds,
    input.requireBioinformaticsAgentProof === true
  );
  const overallMirageDrugRepositioning = mirageDrugRepositioningSummary(
    input.mirageDrugRepositioningChecks,
    "overall_maturity_score",
    thresholds,
    input.requireMirageDrugRepositioningProof === true
  );
  const overallNetworkTroubleshooting = networkTroubleshootingSummary(
    input.networkTroubleshootingChecks,
    "overall_maturity_score",
    thresholds,
    input.requireNetworkTroubleshootingProof === true
  );
  const overallInferenceOptimization = inferenceOptimizationSummary(
    input.inferenceOptimizationChecks,
    "overall_maturity_score",
    thresholds,
    input.requireInferenceOptimizationProof === true
  );
  const overallJavaCodingAgent = javaCodingAgentSummary(
    input.javaCodingAgentChecks,
    "overall_maturity_score",
    thresholds,
    input.requireJavaCodingAgentProof === true
  );
  const overallWebEvalDataset = webEvalDatasetSummary(
    input.webEvalDatasetChecks,
    "overall_maturity_score",
    thresholds,
    input.requireWebEvalDatasetProof === true
  );
  const overallParallelResearchSkill = parallelResearchSkillSummary(
    input.parallelResearchSkillChecks,
    "overall_maturity_score",
    thresholds,
    input.requireParallelResearchSkillProof === true
  );
  const overallResumeRagEvaluator = resumeRagEvaluatorSummary(
    input.resumeRagEvaluatorChecks,
    "overall_maturity_score",
    thresholds,
    input.requireResumeRagEvaluatorProof === true
  );
  const overallChipBenchmark = chipBenchmarkSummary(
    input.chipBenchmarkChecks,
    "overall_maturity_score",
    thresholds,
    input.requireChipBenchmarkProof === true
  );
  const overallHermesBench = hermesBenchSummary(
    input.hermesBenchChecks,
    "overall_maturity_score",
    thresholds,
    input.requireHermesBenchProof === true
  );
  const overallCooperBench = cooperBenchSummary(
    input.cooperBenchChecks,
    "overall_maturity_score",
    thresholds,
    input.requireCooperBenchProof === true
  );
  const overallCoderCup = coderCupSummary(
    input.coderCupChecks,
    "overall_maturity_score",
    thresholds,
    input.requireCoderCupProof === true
  );
  const overallAgenticGraphRag = agenticGraphRagSummary(
    input.agenticGraphRagChecks,
    "overall_maturity_score",
    thresholds,
    input.requireAgenticGraphRagProof === true
  );
  const overallAgentScenarioTest = agentScenarioTestSummary(
    input.agentScenarioTestChecks,
    "overall_maturity_score",
    thresholds,
    input.requireAgentScenarioTestProof === true
  );
  const overallOpenCodeLab = openCodeLabSummary(
    input.openCodeLabChecks,
    "overall_maturity_score",
    thresholds,
    input.requireOpenCodeLabProof === true
  );
  const overallCcPluginEval = ccPluginEvalSummary(
    input.ccPluginEvalChecks,
    "overall_maturity_score",
    thresholds,
    input.requireCcPluginEvalProof === true
  );
  const overallRealignSimulation = realignSimulationSummary(
    input.realignSimulationChecks,
    "overall_maturity_score",
    thresholds,
    input.requireRealignSimulationProof === true
  );
  const overallAcademiClaw = academiClawSummary(
    input.academiClawChecks,
    "overall_maturity_score",
    thresholds,
    input.requireAcademiClawProof === true
  );
  const overallRagChunkingTechnique = ragChunkingTechniqueSummary(
    input.ragChunkingTechniqueChecks,
    "overall_maturity_score",
    thresholds,
    input.requireRagChunkingTechniqueProof === true
  );
  const overallKubernetesOperationalAgent = kubernetesOperationalAgentSummary(
    input.kubernetesOperationalAgentChecks,
    "overall_maturity_score",
    thresholds,
    input.requireKubernetesOperationalAgentProof === true
  );
  const overallSecureVibeBench = secureVibeBenchSummary(
    input.secureVibeBenchChecks,
    "overall_maturity_score",
    thresholds,
    input.requireSecureVibeBenchProof === true
  );
  const overallRavigBench = ravigBenchSummary(
    input.ravigBenchChecks,
    "overall_maturity_score",
    thresholds,
    input.requireRavigBenchProof === true
  );
  const overallHumanStudyBench = humanStudyBenchSummary(
    input.humanStudyBenchChecks,
    "overall_maturity_score",
    thresholds,
    input.requireHumanStudyBenchProof === true
  );
  const overallLegacyBench = legacyBenchSummary(
    input.legacyBenchChecks,
    "overall_maturity_score",
    thresholds,
    input.requireLegacyBenchProof === true
  );
  const overallSubtleMemory = subtleMemorySummary(
    input.subtleMemoryChecks,
    "overall_maturity_score",
    thresholds,
    input.requireSubtleMemoryProof === true
  );

  const rows: MetricValidationRow[] = [
    buildRow({
      metricId: "overall_maturity_score",
      owner: "AMC Score",
      agentId: input.agentId,
      timestamp: input.ts,
      values: scoreValues(input.questionScores),
      questionScores: input.questionScores,
      constructValidity: overallValidity,
      interRaterAgreement,
      counterfactualResponsiveness: overallCounterfactuals.responsiveness,
      counterfactualSampleSize: overallCounterfactuals.sampleSize,
      counterfactualEvidenceRefs: overallCounterfactuals.evidenceRefs,
      validationFacetCoverage: overallFacets.coverage,
      validationFacetSampleSize: overallFacets.sampleSize,
      validationFacetEvidenceRefs: overallFacets.evidenceRefs,
      confounderControlCoverage: overallConfounders.coverage,
      confounderControlSampleSize: overallConfounders.sampleSize,
      confounderControlEvidenceRefs: overallConfounders.evidenceRefs,
      outcomeAlignment: overallOutcomes.alignment,
      outcomeAlignmentSampleSize: overallOutcomes.sampleSize,
      outcomeAlignmentEvidenceRefs: overallOutcomes.evidenceRefs,
      processEvidenceCoverage: overallProcessEvidence.coverage,
      processEvidenceSampleSize: overallProcessEvidence.sampleSize,
      processEvidenceRefs: overallProcessEvidence.evidenceRefs,
      safetyUtilityCoverage: overallSafetyUtility.coverage,
      safetyUtilitySampleSize: overallSafetyUtility.sampleSize,
      safetyUtilityEvidenceRefs: overallSafetyUtility.evidenceRefs,
      modalityTransformationCoverage: overallModalityTransformation.coverage,
      modalityTransformationSampleSize: overallModalityTransformation.sampleSize,
      modalityTransformationEvidenceRefs: overallModalityTransformation.evidenceRefs,
      lifecycleObservabilityCoverage: overallLifecycleObservability.coverage,
      lifecycleObservabilitySampleSize: overallLifecycleObservability.sampleSize,
      lifecycleObservabilityEvidenceRefs: overallLifecycleObservability.evidenceRefs,
      rankingStabilityCoverage: overallRankingStability.coverage,
      rankingStabilitySampleSize: overallRankingStability.sampleSize,
      rankingStabilityEvidenceRefs: overallRankingStability.evidenceRefs,
      toolSandboxCoverage: overallToolSandbox.coverage,
      toolSandboxSampleSize: overallToolSandbox.sampleSize,
      toolSandboxEvidenceRefs: overallToolSandbox.evidenceRefs,
      continualLearningCoverage: overallContinualLearning.coverage,
      continualLearningSampleSize: overallContinualLearning.sampleSize,
      continualLearningEvidenceRefs: overallContinualLearning.evidenceRefs,
      continualLearningRunCount: overallContinualLearning.runCount,
      continualLearningMissingSignals: overallContinualLearning.missingSignals,
      continualLearningMemoryArtifactHashes: overallContinualLearning.memoryArtifactHashes,
      continualLearningRunSummaryArtifactHashes: overallContinualLearning.runSummaryArtifactHashes,
      continualLearningGameplayLogArtifactHashes: overallContinualLearning.gameplayLogArtifactHashes,
      continualLearningMetricNames: overallContinualLearning.metricNames,
      strategicInteractionCoverage: overallStrategicInteraction.coverage,
      strategicInteractionSampleSize: overallStrategicInteraction.sampleSize,
      strategicInteractionEvidenceRefs: overallStrategicInteraction.evidenceRefs,
      architectureRealityCoverage: overallArchitectureReality.coverage,
      architectureRealitySampleSize: overallArchitectureReality.sampleSize,
      architectureRealityEvidenceRefs: overallArchitectureReality.evidenceRefs,
      architectureRealityStressScenarioCount: overallArchitectureReality.stressScenarioCount,
      architectureRealityNetworkScenarioCount: overallArchitectureReality.networkScenarioCount,
      architectureRealityEnsemblePatternCount: overallArchitectureReality.ensemblePatternCount,
      architectureRealityMissingSignals: overallArchitectureReality.missingSignals,
      ragPipelineCoverage: overallRagPipeline.coverage,
      ragPipelineSampleSize: overallRagPipeline.sampleSize,
      ragPipelineEvidenceRefs: overallRagPipeline.evidenceRefs,
      ragEvaluationPipelineCoverage: overallRagEvaluationPipeline.coverage,
      ragEvaluationPipelineSampleSize: overallRagEvaluationPipeline.sampleSize,
      ragEvaluationPipelineEvidenceRefs: overallRagEvaluationPipeline.evidenceRefs,
      ragEvaluationPipelineCaseSampleSizeMin: overallRagEvaluationPipeline.caseSampleSizeMin,
      ragEvaluationPipelineMissingSignals: overallRagEvaluationPipeline.missingSignals,
      ragEvaluationPipelineMetricOwners: overallRagEvaluationPipeline.metricOwners,
      ragEvaluationPipelineReportArtifactHashes: overallRagEvaluationPipeline.reportArtifactHashes,
      ragasNotebookCoverage: overallRagasNotebook.coverage,
      ragasNotebookSampleSize: overallRagasNotebook.sampleSize,
      ragasNotebookEvidenceRefs: overallRagasNotebook.evidenceRefs,
      ragasNotebookMissingSignals: overallRagasNotebook.missingSignals,
      ragasNotebookMetricNames: overallRagasNotebook.metricNames,
      ragasNotebookQuestionCount: overallRagasNotebook.questionCount,
      ragasNotebookReportArtifactHashes: overallRagasNotebook.reportArtifactHashes,
      mirageRagMetricCoverage: overallMirageRagMetric.coverage,
      mirageRagMetricSampleSize: overallMirageRagMetric.sampleSize,
      mirageRagMetricEvidenceRefs: overallMirageRagMetric.evidenceRefs,
      mirageRagMetricMissingSignals: overallMirageRagMetric.missingSignals,
      mirageRagMetricDatasetIds: overallMirageRagMetric.datasetIds,
      mirageRagMetricEvaluationModes: overallMirageRagMetric.evaluationModes,
      mirageRagMetricRetrieverIds: overallMirageRagMetric.retrieverIds,
      mirageRagMetricModelIds: overallMirageRagMetric.modelIds,
      mirageRagMetricNames: overallMirageRagMetric.metricNames,
      mirageRagMetricQaPairCount: overallMirageRagMetric.qaPairCount,
      mirageRagMetricContextPoolCount: overallMirageRagMetric.contextPoolCount,
      mirageRagMetricReportArtifactHashes: overallMirageRagMetric.reportArtifactHashes,
      legalCodeRagCoverage: overallLegalCodeRagMetric.coverage,
      legalCodeRagSampleSize: overallLegalCodeRagMetric.sampleSize,
      legalCodeRagEvidenceRefs: overallLegalCodeRagMetric.evidenceRefs,
      legalCodeRagMissingSignals: overallLegalCodeRagMetric.missingSignals,
      legalCodeRagLegalCodeIds: overallLegalCodeRagMetric.legalCodeIds,
      legalCodeRagJurisdictionIds: overallLegalCodeRagMetric.jurisdictionIds,
      legalCodeRagRetrievalTechniqueIds: overallLegalCodeRagMetric.retrievalTechniqueIds,
      legalCodeRagVectorStoreIds: overallLegalCodeRagMetric.vectorStoreIds,
      legalCodeRagEmbeddingModelIds: overallLegalCodeRagMetric.embeddingModelIds,
      legalCodeRagEvaluationDatasetIds: overallLegalCodeRagMetric.evaluationDatasetIds,
      legalCodeRagMetricNames: overallLegalCodeRagMetric.metricNames,
      legalCodeRagQuestionCount: overallLegalCodeRagMetric.legalQuestionCount,
      legalCodeRagMetricOwners: overallLegalCodeRagMetric.metricOwners,
      legalCodeRagReportArtifactHashes: overallLegalCodeRagMetric.reportArtifactHashes,
      guardbenchMetricCoverage: overallGuardbenchMetric.coverage,
      guardbenchMetricSampleSize: overallGuardbenchMetric.sampleSize,
      guardbenchMetricEvidenceRefs: overallGuardbenchMetric.evidenceRefs,
      guardbenchMetricMissingSignals: overallGuardbenchMetric.missingSignals,
      guardbenchDatasetIds: overallGuardbenchMetric.datasetIds,
      guardbenchLanguageIds: overallGuardbenchMetric.languageIds,
      guardbenchModelIds: overallGuardbenchMetric.modelIds,
      guardbenchThresholdIds: overallGuardbenchMetric.thresholdIds,
      guardbenchMetricNames: overallGuardbenchMetric.metricNames,
      guardbenchExportFormats: overallGuardbenchMetric.exportFormats,
      guardbenchReportArtifactHashes: overallGuardbenchMetric.reportArtifactHashes,
      businessWorkflowCoverage: overallBusinessWorkflow.coverage,
      businessWorkflowSampleSize: overallBusinessWorkflow.sampleSize,
      businessWorkflowEvidenceRefs: overallBusinessWorkflow.evidenceRefs,
      dataAgentAnalyticalCoverage: overallDataAgentAnalytical.coverage,
      dataAgentAnalyticalSampleSize: overallDataAgentAnalytical.sampleSize,
      dataAgentAnalyticalEvidenceRefs: overallDataAgentAnalytical.evidenceRefs,
      embodiedAgentCoverage: overallEmbodiedAgent.coverage,
      embodiedAgentSampleSize: overallEmbodiedAgent.sampleSize,
      embodiedAgentEvidenceRefs: overallEmbodiedAgent.evidenceRefs,
      embodiedAgentMissingSignals: overallEmbodiedAgent.missingSignals,
      embodiedAgentTaskTypes: overallEmbodiedAgent.taskTypes,
      embodiedAgentBaselineIds: overallEmbodiedAgent.baselineIds,
      embodiedAgentReportArtifactHashes: overallEmbodiedAgent.reportArtifactHashes,
      evaluatorSuiteCoverage: overallEvaluatorSuite.coverage,
      evaluatorSuiteSampleSize: overallEvaluatorSuite.sampleSize,
      evaluatorSuiteEvidenceRefs: overallEvaluatorSuite.evidenceRefs,
      evaluatorSuiteMissingSignals: overallEvaluatorSuite.missingSignals,
      evaluatorSuiteAssertionTypes: overallEvaluatorSuite.assertionTypes,
      evaluatorSuiteReporterFormats: overallEvaluatorSuite.reporterFormats,
      evaluatorSuiteJudgeNames: overallEvaluatorSuite.judgeNames,
      evaluatorSuiteReportArtifactHashes: overallEvaluatorSuite.reportArtifactHashes,
      pentestBenchmarkCoverage: overallPentestBenchmark.coverage,
      pentestBenchmarkSampleSize: overallPentestBenchmark.sampleSize,
      pentestBenchmarkEvidenceRefs: overallPentestBenchmark.evidenceRefs,
      pentestBenchmarkMissingSignals: overallPentestBenchmark.missingSignals,
      pentestBenchmarkLanguageStacks: overallPentestBenchmark.languageStacks,
      pentestBenchmarkVulnerabilityClasses: overallPentestBenchmark.vulnerabilityClasses,
      pentestBenchmarkDifficultyLevels: overallPentestBenchmark.difficultyLevels,
      pentestBenchmarkSuiteIds: overallPentestBenchmark.benchmarkSuiteIds,
      pentestBenchmarkMetricNames: overallPentestBenchmark.metricNames,
      pentestBenchmarkReportArtifactHashes: overallPentestBenchmark.reportArtifactHashes,
      traceEvaluationCoverage: overallTraceEvaluation.coverage,
      traceEvaluationSampleSize: overallTraceEvaluation.sampleSize,
      traceEvaluationEvidenceRefs: overallTraceEvaluation.evidenceRefs,
      traceEvaluationMissingSignals: overallTraceEvaluation.missingSignals,
      traceEvaluationModelIds: overallTraceEvaluation.modelIds,
      traceEvaluationAgentParameterKeys: overallTraceEvaluation.agentParameterKeys,
      traceEvaluationToolNames: overallTraceEvaluation.toolNames,
      traceEvaluationMetricNames: overallTraceEvaluation.metricNames,
      traceEvaluationCaseSuiteIds: overallTraceEvaluation.caseSuiteIds,
      traceEvaluationBackendModes: overallTraceEvaluation.backendModes,
      traceEvaluationRunPermutationCount: overallTraceEvaluation.runPermutationCount,
      traceEvaluationReportArtifactHashes: overallTraceEvaluation.reportArtifactHashes,
      livingEnvironmentCoverage: overallLivingEnvironment.coverage,
      livingEnvironmentSampleSize: overallLivingEnvironment.sampleSize,
      livingEnvironmentEvidenceRefs: overallLivingEnvironment.evidenceRefs,
      livingEnvironmentMissingSignals: overallLivingEnvironment.missingSignals,
      livingEnvironmentCapabilityNames: overallLivingEnvironment.capabilityNames,
      livingEnvironmentSandboxProviders: overallLivingEnvironment.sandboxProviders,
      livingEnvironmentAgentAdapters: overallLivingEnvironment.agentAdapters,
      livingEnvironmentMetricNames: overallLivingEnvironment.metricNames,
      livingEnvironmentTrialCount: overallLivingEnvironment.trialCount,
      livingEnvironmentReportArtifactHashes: overallLivingEnvironment.reportArtifactHashes,
      mobileAgentCoverage: overallMobileAgent.coverage,
      mobileAgentSampleSize: overallMobileAgent.sampleSize,
      mobileAgentEvidenceRefs: overallMobileAgent.evidenceRefs,
      mobileAgentMissingSignals: overallMobileAgent.missingSignals,
      mobileAgentBenchmarkIds: overallMobileAgent.benchmarkIds,
      mobileAgentEnvironmentIds: overallMobileAgent.environmentIds,
      mobileAgentAppIds: overallMobileAgent.appIds,
      mobileAgentApiCatalogIds: overallMobileAgent.apiCatalogIds,
      mobileAgentUiTraceIds: overallMobileAgent.uiTraceIds,
      mobileAgentTaskSetIds: overallMobileAgent.taskSetIds,
      mobileAgentTaskComplexityGroups: overallMobileAgent.taskComplexityGroups,
      mobileAgentCheckpointMetricNames: overallMobileAgent.checkpointMetricNames,
      mobileAgentLicenseBoundaryRefs: overallMobileAgent.licenseBoundaryRefs,
      mobileAgentTrialCount: overallMobileAgent.trialCount,
      mobileAgentReportArtifactHashes: overallMobileAgent.reportArtifactHashes,
      personaAgentCoverage: overallPersonaAgent.coverage,
      personaAgentSampleSize: overallPersonaAgent.sampleSize,
      personaAgentEvidenceRefs: overallPersonaAgent.evidenceRefs,
      personaAgentMissingSignals: overallPersonaAgent.missingSignals,
      personaAgentPersonaIds: overallPersonaAgent.personaIds,
      personaAgentEnvironmentIds: overallPersonaAgent.environmentIds,
      personaAgentQuestionSetIds: overallPersonaAgent.questionSetIds,
      personaAgentModelIds: overallPersonaAgent.modelIds,
      personaAgentProviderIds: overallPersonaAgent.providerIds,
      personaAgentMetricNames: overallPersonaAgent.metricNames,
      personaAgentQuestionCount: overallPersonaAgent.questionCount,
      personaAgentReportArtifactHashes: overallPersonaAgent.reportArtifactHashes,
      scientificLiteratureCoverage: overallScientificLiterature.coverage,
      scientificLiteratureSampleSize: overallScientificLiterature.sampleSize,
      scientificLiteratureEvidenceRefs: overallScientificLiterature.evidenceRefs,
      scientificLiteratureMissingSignals: overallScientificLiterature.missingSignals,
      scientificLiteratureBenchmarkIds: overallScientificLiterature.benchmarkIds,
      scientificLiteratureTaskTypes: overallScientificLiterature.taskTypes,
      scientificLiteratureDatasetIds: overallScientificLiterature.datasetIds,
      scientificLiteratureSearchBackendIds: overallScientificLiterature.searchBackendIds,
      scientificLiteratureToolIds: overallScientificLiterature.toolIds,
      scientificLiteratureMetricNames: overallScientificLiterature.metricNames,
      scientificLiteratureTaskCount: overallScientificLiterature.taskCount,
      scientificLiteratureReportArtifactHashes: overallScientificLiterature.reportArtifactHashes,
      bioinformaticsAgentCoverage: overallBioinformaticsAgent.coverage,
      bioinformaticsAgentSampleSize: overallBioinformaticsAgent.sampleSize,
      bioinformaticsAgentEvidenceRefs: overallBioinformaticsAgent.evidenceRefs,
      bioinformaticsAgentMissingSignals: overallBioinformaticsAgent.missingSignals,
      bioinformaticsAgentBenchmarkIds: overallBioinformaticsAgent.benchmarkIds,
      bioinformaticsAgentTaskTypes: overallBioinformaticsAgent.taskTypes,
      bioinformaticsAgentDatasetIds: overallBioinformaticsAgent.datasetIds,
      bioinformaticsAgentWorkflowIds: overallBioinformaticsAgent.workflowIds,
      bioinformaticsAgentToolNames: overallBioinformaticsAgent.toolNames,
      bioinformaticsAgentMetricNames: overallBioinformaticsAgent.metricNames,
      bioinformaticsAgentPerturbationIds: overallBioinformaticsAgent.perturbationIds,
      bioinformaticsAgentPrivacyBoundaryRefs: overallBioinformaticsAgent.privacyBoundaryRefs,
      bioinformaticsAgentTaskCount: overallBioinformaticsAgent.taskCount,
      bioinformaticsAgentReportArtifactHashes: overallBioinformaticsAgent.reportArtifactHashes,
      mirageDrugRepositioningCoverage: overallMirageDrugRepositioning.coverage,
      mirageDrugRepositioningSampleSize: overallMirageDrugRepositioning.sampleSize,
      mirageDrugRepositioningEvidenceRefs: overallMirageDrugRepositioning.evidenceRefs,
      mirageDrugRepositioningMissingSignals: overallMirageDrugRepositioning.missingSignals,
      mirageDrugRepositioningBenchmarkIds: overallMirageDrugRepositioning.benchmarkIds,
      mirageDrugRepositioningDatasetIds: overallMirageDrugRepositioning.datasetIds,
      mirageDrugRepositioningSplitIds: overallMirageDrugRepositioning.splitIds,
      mirageDrugRepositioningMappingIds: overallMirageDrugRepositioning.mappingIds,
      mirageDrugRepositioningFeatureSetIds: overallMirageDrugRepositioning.featureSetIds,
      mirageDrugRepositioningSimilarityMatrixIds: overallMirageDrugRepositioning.similarityMatrixIds,
      mirageDrugRepositioningNegativeSamplingIds: overallMirageDrugRepositioning.negativeSamplingIds,
      mirageDrugRepositioningClassifierConfigIds: overallMirageDrugRepositioning.classifierConfigIds,
      mirageDrugRepositioningFeatureSelectionReportIds: overallMirageDrugRepositioning.featureSelectionReportIds,
      mirageDrugRepositioningScoreCalculationIds: overallMirageDrugRepositioning.scoreCalculationIds,
      mirageDrugRepositioningCaseStudyIds: overallMirageDrugRepositioning.caseStudyIds,
      mirageDrugRepositioningMetricNames: overallMirageDrugRepositioning.metricNames,
      mirageDrugRepositioningDrugCount: overallMirageDrugRepositioning.drugCount,
      mirageDrugRepositioningDiseaseCount: overallMirageDrugRepositioning.diseaseCount,
      mirageDrugRepositioningMappingCount: overallMirageDrugRepositioning.mappingCount,
      mirageDrugRepositioningFeatureSetCount: overallMirageDrugRepositioning.featureSetCount,
      mirageDrugRepositioningSimilarityMatrixCount: overallMirageDrugRepositioning.similarityMatrixCount,
      mirageDrugRepositioningReportArtifactHashes: overallMirageDrugRepositioning.reportArtifactHashes,
      networkTroubleshootingCoverage: overallNetworkTroubleshooting.coverage,
      networkTroubleshootingSampleSize: overallNetworkTroubleshooting.sampleSize,
      networkTroubleshootingEvidenceRefs: overallNetworkTroubleshooting.evidenceRefs,
      networkTroubleshootingMissingSignals: overallNetworkTroubleshooting.missingSignals,
      networkTroubleshootingBenchmarkIds: overallNetworkTroubleshooting.benchmarkIds,
      networkTroubleshootingScenarioIds: overallNetworkTroubleshooting.scenarioIds,
      networkTroubleshootingTopologyTiers: overallNetworkTroubleshooting.topologyTiers,
      networkTroubleshootingIssueTypes: overallNetworkTroubleshooting.issueTypes,
      networkTroubleshootingAgentIds: overallNetworkTroubleshooting.agentIds,
      networkTroubleshootingToolNames: overallNetworkTroubleshooting.toolNames,
      networkTroubleshootingMetricNames: overallNetworkTroubleshooting.metricNames,
      networkTroubleshootingIncidentCount: overallNetworkTroubleshooting.incidentCount,
      networkTroubleshootingReportArtifactHashes: overallNetworkTroubleshooting.reportArtifactHashes,
      inferenceOptimizationCoverage: overallInferenceOptimization.coverage,
      inferenceOptimizationSampleSize: overallInferenceOptimization.sampleSize,
      inferenceOptimizationEvidenceRefs: overallInferenceOptimization.evidenceRefs,
      inferenceOptimizationMissingSignals: overallInferenceOptimization.missingSignals,
      inferenceOptimizationBenchmarkIds: overallInferenceOptimization.benchmarkIds,
      inferenceOptimizationScenarioIds: overallInferenceOptimization.scenarioIds,
      inferenceOptimizationHardwareProfileIds: overallInferenceOptimization.hardwareProfileIds,
      inferenceOptimizationBackendIds: overallInferenceOptimization.backendIds,
      inferenceOptimizationSearchSpaceIds: overallInferenceOptimization.searchSpaceIds,
      inferenceOptimizationGateIds: overallInferenceOptimization.gateIds,
      inferenceOptimizationAgentIds: overallInferenceOptimization.agentIds,
      inferenceOptimizationMetricNames: overallInferenceOptimization.metricNames,
      inferenceOptimizationRunCount: overallInferenceOptimization.runCount,
      inferenceOptimizationReportArtifactHashes: overallInferenceOptimization.reportArtifactHashes,
      javaCodingAgentCoverage: overallJavaCodingAgent.coverage,
      javaCodingAgentSampleSize: overallJavaCodingAgent.sampleSize,
      javaCodingAgentEvidenceRefs: overallJavaCodingAgent.evidenceRefs,
      javaCodingAgentMissingSignals: overallJavaCodingAgent.missingSignals,
      javaCodingAgentBenchmarkIds: overallJavaCodingAgent.benchmarkIds,
      javaCodingAgentTaskIds: overallJavaCodingAgent.taskIds,
      javaCodingAgentTaskTypes: overallJavaCodingAgent.taskTypes,
      javaCodingAgentJavaProjectIds: overallJavaCodingAgent.javaProjectIds,
      javaCodingAgentSandboxIds: overallJavaCodingAgent.sandboxIds,
      javaCodingAgentAgentConfigIds: overallJavaCodingAgent.agentConfigIds,
      javaCodingAgentJudgeTierIds: overallJavaCodingAgent.judgeTierIds,
      javaCodingAgentCheckTypes: overallJavaCodingAgent.checkTypes,
      javaCodingAgentMetricNames: overallJavaCodingAgent.metricNames,
      javaCodingAgentTrialCount: overallJavaCodingAgent.trialCount,
      javaCodingAgentReportArtifactHashes: overallJavaCodingAgent.reportArtifactHashes,
      webEvalDatasetCoverage: overallWebEvalDataset.coverage,
      webEvalDatasetSampleSize: overallWebEvalDataset.sampleSize,
      webEvalDatasetEvidenceRefs: overallWebEvalDataset.evidenceRefs,
      webEvalDatasetMissingSignals: overallWebEvalDataset.missingSignals,
      webEvalDatasetBenchmarkIds: overallWebEvalDataset.benchmarkIds,
      webEvalDatasetRepositoryRefs: overallWebEvalDataset.repositoryRefs,
      webEvalDatasetSubjectIds: overallWebEvalDataset.subjectIds,
      webEvalDatasetQuerySetIds: overallWebEvalDataset.querySetIds,
      webEvalDatasetSearchProviderIds: overallWebEvalDataset.searchProviderIds,
      webEvalDatasetDocumentSetIds: overallWebEvalDataset.documentSetIds,
      webEvalDatasetFilterPolicyIds: overallWebEvalDataset.filterPolicyIds,
      webEvalDatasetQaGenerationIds: overallWebEvalDataset.qaGenerationIds,
      webEvalDatasetReferenceAnswerSetIds: overallWebEvalDataset.referenceAnswerSetIds,
      webEvalDatasetExportIds: overallWebEvalDataset.datasetExportIds,
      webEvalDatasetOutputTargets: overallWebEvalDataset.outputTargets,
      webEvalDatasetMetricNames: overallWebEvalDataset.metricNames,
      webEvalDatasetQuestionCount: overallWebEvalDataset.questionCount,
      webEvalDatasetDocumentCount: overallWebEvalDataset.documentCount,
      webEvalDatasetProviderDiversityCount: overallWebEvalDataset.providerDiversityCount,
      webEvalDatasetFreshnessHours: overallWebEvalDataset.freshnessHours,
      webEvalDatasetSourceCoverage: overallWebEvalDataset.sourceCoverage,
      webEvalDatasetAnswerGrounding: overallWebEvalDataset.answerGrounding,
      webEvalDatasetReportArtifactHashes: overallWebEvalDataset.reportArtifactHashes,
      parallelResearchSkillCoverage: overallParallelResearchSkill.coverage,
      parallelResearchSkillSampleSize: overallParallelResearchSkill.sampleSize,
      parallelResearchSkillEvidenceRefs: overallParallelResearchSkill.evidenceRefs,
      parallelResearchSkillMissingSignals: overallParallelResearchSkill.missingSignals,
      parallelResearchSkillRepositoryRefs: overallParallelResearchSkill.repositoryRefs,
      parallelResearchSkillLicenseRefs: overallParallelResearchSkill.licenseRefs,
      parallelResearchSkillManifestIds: overallParallelResearchSkill.skillManifestIds,
      parallelResearchSkillApiSurfaceIds: overallParallelResearchSkill.apiSurfaceIds,
      parallelResearchSkillSearchModeIds: overallParallelResearchSkill.searchModeIds,
      parallelResearchSkillProcessorTiers: overallParallelResearchSkill.processorTiers,
      parallelResearchSkillSecurityBoundaryRefs: overallParallelResearchSkill.securityBoundaryRefs,
      parallelResearchSkillDependencyLockIds: overallParallelResearchSkill.dependencyLockIds,
      parallelResearchSkillMetricNames: overallParallelResearchSkill.metricNames,
      parallelResearchSkillCitationCoverage0to1: overallParallelResearchSkill.citationCoverage0to1,
      parallelResearchSkillSourcePolicyCoverage0to1: overallParallelResearchSkill.sourcePolicyCoverage0to1,
      parallelResearchSkillBatchTaskLimit: overallParallelResearchSkill.batchTaskLimit,
      parallelResearchSkillMonitoringCoverage0to1: overallParallelResearchSkill.monitoringCoverage0to1,
      parallelResearchSkillReportArtifactHashes: overallParallelResearchSkill.reportArtifactHashes,
      resumeRagEvaluatorCoverage: overallResumeRagEvaluator.coverage,
      resumeRagEvaluatorSampleSize: overallResumeRagEvaluator.sampleSize,
      resumeRagEvaluatorEvidenceRefs: overallResumeRagEvaluator.evidenceRefs,
      resumeRagEvaluatorMissingSignals: overallResumeRagEvaluator.missingSignals,
      resumeRagEvaluatorRepositoryRefs: overallResumeRagEvaluator.repositoryRefs,
      resumeRagEvaluatorLicenseRefs: overallResumeRagEvaluator.licenseRefs,
      resumeRagEvaluatorResumeInputFormats: overallResumeRagEvaluator.resumeInputFormats,
      resumeRagEvaluatorRagStrategyIds: overallResumeRagEvaluator.ragStrategyIds,
      resumeRagEvaluatorQueryExpansionIds: overallResumeRagEvaluator.queryExpansionIds,
      resumeRagEvaluatorRetrievalKMin: overallResumeRagEvaluator.retrievalKMin,
      resumeRagEvaluatorRetrievalKMax: overallResumeRagEvaluator.retrievalKMax,
      resumeRagEvaluatorVectorStoreIds: overallResumeRagEvaluator.vectorStoreIds,
      resumeRagEvaluatorOllamaModelIds: overallResumeRagEvaluator.ollamaModelIds,
      resumeRagEvaluatorEmbeddingModelIds: overallResumeRagEvaluator.embeddingModelIds,
      resumeRagEvaluatorEvaluationEndpointIds: overallResumeRagEvaluator.evaluationEndpointIds,
      resumeRagEvaluatorCandidateRatingScale: overallResumeRagEvaluator.candidateRatingScale,
      resumeRagEvaluatorBatchModeIds: overallResumeRagEvaluator.batchModeIds,
      resumeRagEvaluatorPrivacyBoundaryRefs: overallResumeRagEvaluator.privacyBoundaryRefs,
      resumeRagEvaluatorDependencyLockIds: overallResumeRagEvaluator.dependencyLockIds,
      resumeRagEvaluatorMetricNames: overallResumeRagEvaluator.metricNames,
      resumeRagEvaluatorParserCoverage0to1: overallResumeRagEvaluator.parserCoverage0to1,
      resumeRagEvaluatorEvaluationGrounding0to1: overallResumeRagEvaluator.evaluationGrounding0to1,
      resumeRagEvaluatorReportArtifactHashes: overallResumeRagEvaluator.reportArtifactHashes,
      chipBenchmarkCoverage: overallChipBenchmark.coverage,
      chipBenchmarkSampleSize: overallChipBenchmark.sampleSize,
      chipBenchmarkEvidenceRefs: overallChipBenchmark.evidenceRefs,
      chipBenchmarkMissingSignals: overallChipBenchmark.missingSignals,
      chipBenchmarkRepositoryRefs: overallChipBenchmark.repositoryRefs,
      chipBenchmarkLicenseRefs: overallChipBenchmark.licenseRefs,
      chipBenchmarkBenchmarkIds: overallChipBenchmark.benchmarkIds,
      chipBenchmarkHardwareProfileIds: overallChipBenchmark.hardwareProfileIds,
      chipBenchmarkModelFamilyIds: overallChipBenchmark.modelFamilyIds,
      chipBenchmarkPrecisionModeIds: overallChipBenchmark.precisionModeIds,
      chipBenchmarkEnvironmentIds: overallChipBenchmark.environmentIds,
      chipBenchmarkRunnerScriptIds: overallChipBenchmark.runnerScriptIds,
      chipBenchmarkServingBackendIds: overallChipBenchmark.servingBackendIds,
      chipBenchmarkDatasetIds: overallChipBenchmark.datasetIds,
      chipBenchmarkFrontendDatasetIds: overallChipBenchmark.frontendDatasetIds,
      chipBenchmarkPricingRefs: overallChipBenchmark.pricingRefs,
      chipBenchmarkMetricNames: overallChipBenchmark.metricNames,
      chipBenchmarkRegressionThresholdIds: overallChipBenchmark.regressionThresholdIds,
      chipBenchmarkResultRowCount: overallChipBenchmark.resultRowCount,
      chipBenchmarkThroughputCoverage0to1: overallChipBenchmark.throughputCoverage0to1,
      chipBenchmarkLatencyCoverage0to1: overallChipBenchmark.latencyCoverage0to1,
      chipBenchmarkCostCoverage0to1: overallChipBenchmark.costCoverage0to1,
      chipBenchmarkReportArtifactHashes: overallChipBenchmark.reportArtifactHashes,
      hermesBenchCoverage: overallHermesBench.coverage,
      hermesBenchSampleSize: overallHermesBench.sampleSize,
      hermesBenchEvidenceRefs: overallHermesBench.evidenceRefs,
      hermesBenchMissingSignals: overallHermesBench.missingSignals,
      hermesBenchRepositoryRefs: overallHermesBench.repositoryRefs,
      hermesBenchLicenseRefs: overallHermesBench.licenseRefs,
      hermesBenchBranchRefs: overallHermesBench.branchRefs,
      hermesBenchCommitRefs: overallHermesBench.commitRefs,
      hermesBenchTreeRefs: overallHermesBench.treeRefs,
      hermesBenchReadmeBlobRefs: overallHermesBench.readmeBlobRefs,
      hermesBenchBuildSpecRefs: overallHermesBench.buildSpecRefs,
      hermesBenchBackendTreeRefs: overallHermesBench.backendTreeRefs,
      hermesBenchFrontendTreeRefs: overallHermesBench.frontendTreeRefs,
      hermesBenchRunnerIds: overallHermesBench.runnerIds,
      hermesBenchJudgeIds: overallHermesBench.judgeIds,
      hermesBenchTaskRegistryIds: overallHermesBench.taskRegistryIds,
      hermesBenchServerConfigIds: overallHermesBench.serverConfigIds,
      hermesBenchAdapterIds: overallHermesBench.adapterIds,
      hermesBenchResultSchemaIds: overallHermesBench.resultSchemaIds,
      hermesBenchFrontendComponentIds: overallHermesBench.frontendComponentIds,
      hermesBenchBackendTestIds: overallHermesBench.backendTestIds,
      hermesBenchFrontendTestIds: overallHermesBench.frontendTestIds,
      hermesBenchDockerRuntimeIds: overallHermesBench.dockerRuntimeIds,
      hermesBenchMetricNames: overallHermesBench.metricNames,
      hermesBenchTaskCount: overallHermesBench.taskCount,
      hermesBenchAdapterCount: overallHermesBench.adapterCount,
      hermesBenchBackendTestCount: overallHermesBench.backendTestCount,
      hermesBenchFrontendTestCount: overallHermesBench.frontendTestCount,
      hermesBenchJudgeAgreement0to1: overallHermesBench.judgeAgreement0to1,
      hermesBenchRegressionPassRate0to1: overallHermesBench.regressionPassRate0to1,
      hermesBenchReportArtifactHashes: overallHermesBench.reportArtifactHashes,
      cooperBenchCoverage: overallCooperBench.coverage,
      cooperBenchSampleSize: overallCooperBench.sampleSize,
      cooperBenchEvidenceRefs: overallCooperBench.evidenceRefs,
      cooperBenchMissingSignals: overallCooperBench.missingSignals,
      cooperBenchRepositoryRefs: overallCooperBench.repositoryRefs,
      cooperBenchLicenseRefs: overallCooperBench.licenseRefs,
      cooperBenchReleaseRefs: overallCooperBench.releaseRefs,
      cooperBenchBranchRefs: overallCooperBench.branchRefs,
      cooperBenchCommitRefs: overallCooperBench.commitRefs,
      cooperBenchTreeRefs: overallCooperBench.treeRefs,
      cooperBenchReadmeBlobRefs: overallCooperBench.readmeBlobRefs,
      cooperBenchChangelogRefs: overallCooperBench.changelogRefs,
      cooperBenchDatasetTreeRefs: overallCooperBench.datasetTreeRefs,
      cooperBenchDatasetReadmeRefs: overallCooperBench.datasetReadmeRefs,
      cooperBenchRunnerIds: overallCooperBench.runnerIds,
      cooperBenchEvalBackendIds: overallCooperBench.evalBackendIds,
      cooperBenchTeamHarnessIds: overallCooperBench.teamHarnessIds,
      cooperBenchAgentAdapterIds: overallCooperBench.agentAdapterIds,
      cooperBenchCiWorkflowIds: overallCooperBench.ciWorkflowIds,
      cooperBenchPackageLockRefs: overallCooperBench.packageLockRefs,
      cooperBenchReportPublicationRefs: overallCooperBench.reportPublicationRefs,
      cooperBenchMetricNames: overallCooperBench.metricNames,
      cooperBenchTaskCount: overallCooperBench.taskCount,
      cooperBenchFeatureCount: overallCooperBench.featureCount,
      cooperBenchAgentAdapterCount: overallCooperBench.agentAdapterCount,
      cooperBenchTestCount: overallCooperBench.testCount,
      cooperBenchCooperationScore0to1: overallCooperBench.cooperationScore0to1,
      cooperBenchConflictResolutionRate0to1: overallCooperBench.conflictResolutionRate0to1,
      cooperBenchRegressionPassRate0to1: overallCooperBench.regressionPassRate0to1,
      cooperBenchReportArtifactHashes: overallCooperBench.reportArtifactHashes,
      coderCupCoverage: overallCoderCup.coverage,
      coderCupSampleSize: overallCoderCup.sampleSize,
      coderCupEvidenceRefs: overallCoderCup.evidenceRefs,
      coderCupMissingSignals: overallCoderCup.missingSignals,
      coderCupRepositoryRefs: overallCoderCup.repositoryRefs,
      coderCupLicenseRefs: overallCoderCup.licenseRefs,
      coderCupHomepageRefs: overallCoderCup.homepageRefs,
      coderCupBranchRefs: overallCoderCup.branchRefs,
      coderCupCommitRefs: overallCoderCup.commitRefs,
      coderCupTreeRefs: overallCoderCup.treeRefs,
      coderCupReadmeBlobRefs: overallCoderCup.readmeBlobRefs,
      coderCupContributingRefs: overallCoderCup.contributingRefs,
      coderCupCiWorkflowIds: overallCoderCup.ciWorkflowIds,
      coderCupPackageManifestRefs: overallCoderCup.packageManifestRefs,
      coderCupPackageLockRefs: overallCoderCup.packageLockRefs,
      coderCupTaskSpecRefs: overallCoderCup.taskSpecRefs,
      coderCupTestSuiteRefs: overallCoderCup.testSuiteRefs,
      coderCupSuiteIndexRefs: overallCoderCup.suiteIndexRefs,
      coderCupRunnerIds: overallCoderCup.runnerIds,
      coderCupRunnerContractRefs: overallCoderCup.runnerContractRefs,
      coderCupScoreLedgerRefs: overallCoderCup.scoreLedgerRefs,
      coderCupLiveArtifactRefs: overallCoderCup.liveArtifactRefs,
      coderCupMethodologyRefs: overallCoderCup.methodologyRefs,
      coderCupReferenceRefs: overallCoderCup.referenceRefs,
      coderCupCostMethodologyRefs: overallCoderCup.costMethodologyRefs,
      coderCupPublicFixtureRefs: overallCoderCup.publicFixtureRefs,
      coderCupMetricNames: overallCoderCup.metricNames,
      coderCupPhaseCount: overallCoderCup.phaseCount,
      coderCupTestPlanCount: overallCoderCup.testPlanCount,
      coderCupRunnerCount: overallCoderCup.runnerCount,
      coderCupScoreLedgerCount: overallCoderCup.scoreLedgerCount,
      coderCupLiveSurfaceCount: overallCoderCup.liveSurfaceCount,
      coderCupInterRaterAgreement0to1: overallCoderCup.interRaterAgreement0to1,
      coderCupTestRetestReliability0to1: overallCoderCup.testRetestReliability0to1,
      coderCupRegressionPassRate0to1: overallCoderCup.regressionPassRate0to1,
      coderCupReportArtifactHashes: overallCoderCup.reportArtifactHashes,
      agenticGraphRagCoverage: overallAgenticGraphRag.coverage,
      agenticGraphRagSampleSize: overallAgenticGraphRag.sampleSize,
      agenticGraphRagEvidenceRefs: overallAgenticGraphRag.evidenceRefs,
      agenticGraphRagMissingSignals: overallAgenticGraphRag.missingSignals,
      agenticGraphRagRepositoryRefs: overallAgenticGraphRag.repositoryRefs,
      agenticGraphRagLicenseRefs: overallAgenticGraphRag.licenseRefs,
      agenticGraphRagBranchRefs: overallAgenticGraphRag.branchRefs,
      agenticGraphRagCommitRefs: overallAgenticGraphRag.commitRefs,
      agenticGraphRagTreeRefs: overallAgenticGraphRag.treeRefs,
      agenticGraphRagReadmeBlobRefs: overallAgenticGraphRag.readmeBlobRefs,
      agenticGraphRagGraphWorkflowIds: overallAgenticGraphRag.graphWorkflowIds,
      agenticGraphRagOrchestratorIds: overallAgenticGraphRag.orchestratorIds,
      agenticGraphRagRagPipelineIds: overallAgenticGraphRag.ragPipelineIds,
      agenticGraphRagDatabaseIds: overallAgenticGraphRag.databaseIds,
      agenticGraphRagVectorStoreIds: overallAgenticGraphRag.vectorStoreIds,
      agenticGraphRagEvaluationIds: overallAgenticGraphRag.evaluationIds,
      agenticGraphRagExperimentTrackerIds: overallAgenticGraphRag.experimentTrackerIds,
      agenticGraphRagUiComponentIds: overallAgenticGraphRag.uiComponentIds,
      agenticGraphRagDependencyLockRefs: overallAgenticGraphRag.dependencyLockRefs,
      agenticGraphRagMetricNames: overallAgenticGraphRag.metricNames,
      agenticGraphRagGraphNodeCount: overallAgenticGraphRag.graphNodeCount,
      agenticGraphRagGraphEdgeCount: overallAgenticGraphRag.graphEdgeCount,
      agenticGraphRagEvaluationMetricCount: overallAgenticGraphRag.evaluationMetricCount,
      agenticGraphRagExperimentCount: overallAgenticGraphRag.experimentCount,
      agenticGraphRagRetrievalGroundingScore0to1: overallAgenticGraphRag.retrievalGroundingScore0to1,
      agenticGraphRagRegressionPassRate0to1: overallAgenticGraphRag.regressionPassRate0to1,
      agenticGraphRagReportArtifactHashes: overallAgenticGraphRag.reportArtifactHashes,
      agentScenarioTestCoverage: overallAgentScenarioTest.coverage,
      agentScenarioTestSampleSize: overallAgentScenarioTest.sampleSize,
      agentScenarioTestEvidenceRefs: overallAgentScenarioTest.evidenceRefs,
      agentScenarioTestMissingSignals: overallAgentScenarioTest.missingSignals,
      agentScenarioTestBenchmarkIds: overallAgentScenarioTest.benchmarkIds,
      agentScenarioTestRepositoryRefs: overallAgentScenarioTest.repositoryRefs,
      agentScenarioTestLicenseRefs: overallAgentScenarioTest.licenseRefs,
      agentScenarioTestScenarioIds: overallAgentScenarioTest.scenarioIds,
      agentScenarioTestPersonaIds: overallAgentScenarioTest.personaIds,
      agentScenarioTestGoalIds: overallAgentScenarioTest.goalIds,
      agentScenarioTestKnowledgeSetIds: overallAgentScenarioTest.knowledgeSetIds,
      agentScenarioTestToolMockIds: overallAgentScenarioTest.toolMockIds,
      agentScenarioTestTrajectoryAssertionIds: overallAgentScenarioTest.trajectoryAssertionIds,
      agentScenarioTestJudgeIds: overallAgentScenarioTest.judgeIds,
      agentScenarioTestMetricNames: overallAgentScenarioTest.metricNames,
      agentScenarioTestReporterFormats: overallAgentScenarioTest.reporterFormats,
      agentScenarioTestAgentIds: overallAgentScenarioTest.agentIds,
      agentScenarioTestComparisonIds: overallAgentScenarioTest.comparisonIds,
      agentScenarioTestScenarioCount: overallAgentScenarioTest.scenarioCount,
      agentScenarioTestTurnCount: overallAgentScenarioTest.turnCount,
      agentScenarioTestToolCallCount: overallAgentScenarioTest.toolCallCount,
      agentScenarioTestReportArtifactHashes: overallAgentScenarioTest.reportArtifactHashes,
      openCodeLabCoverage: overallOpenCodeLab.coverage,
      openCodeLabSampleSize: overallOpenCodeLab.sampleSize,
      openCodeLabEvidenceRefs: overallOpenCodeLab.evidenceRefs,
      openCodeLabMissingSignals: overallOpenCodeLab.missingSignals,
      openCodeLabBenchmarkIds: overallOpenCodeLab.benchmarkIds,
      openCodeLabRepositoryRefs: overallOpenCodeLab.repositoryRefs,
      openCodeLabAgentContextIds: overallOpenCodeLab.agentContextIds,
      openCodeLabPromptVariantIds: overallOpenCodeLab.promptVariantIds,
      openCodeLabToolDescriptionIds: overallOpenCodeLab.toolDescriptionIds,
      openCodeLabPolicyIds: overallOpenCodeLab.policyIds,
      openCodeLabRunTraceIds: overallOpenCodeLab.runTraceIds,
      openCodeLabForkIds: overallOpenCodeLab.forkIds,
      openCodeLabModelIds: overallOpenCodeLab.modelIds,
      openCodeLabGroundTruthIds: overallOpenCodeLab.groundTruthIds,
      openCodeLabMetricNames: overallOpenCodeLab.metricNames,
      openCodeLabReporterFormats: overallOpenCodeLab.reporterFormats,
      openCodeLabResultArtifactIds: overallOpenCodeLab.resultArtifactIds,
      openCodeLabRunCount: overallOpenCodeLab.runCount,
      openCodeLabForkAgreement0to1: overallOpenCodeLab.forkAgreement0to1,
      openCodeLabModelVariance0to1: overallOpenCodeLab.modelVariance0to1,
      openCodeLabReportArtifactHashes: overallOpenCodeLab.reportArtifactHashes,
      ccPluginEvalCoverage: overallCcPluginEval.coverage,
      ccPluginEvalSampleSize: overallCcPluginEval.sampleSize,
      ccPluginEvalEvidenceRefs: overallCcPluginEval.evidenceRefs,
      ccPluginEvalMissingSignals: overallCcPluginEval.missingSignals,
      ccPluginEvalRepositoryRefs: overallCcPluginEval.repositoryRefs,
      ccPluginEvalLicenseRefs: overallCcPluginEval.licenseRefs,
      ccPluginEvalPluginManifestIds: overallCcPluginEval.pluginManifestIds,
      ccPluginEvalComponentTypes: overallCcPluginEval.componentTypes,
      ccPluginEvalTriggerManifestIds: overallCcPluginEval.triggerManifestIds,
      ccPluginEvalScenarioManifestIds: overallCcPluginEval.scenarioManifestIds,
      ccPluginEvalScenarioTypes: overallCcPluginEval.scenarioTypes,
      ccPluginEvalTranscriptIds: overallCcPluginEval.transcriptIds,
      ccPluginEvalDetectionReportIds: overallCcPluginEval.detectionReportIds,
      ccPluginEvalDetectionModes: overallCcPluginEval.detectionModes,
      ccPluginEvalJudgeIds: overallCcPluginEval.judgeIds,
      ccPluginEvalCalibrationIds: overallCcPluginEval.calibrationIds,
      ccPluginEvalConflictReportIds: overallCcPluginEval.conflictReportIds,
      ccPluginEvalCheckpointStateIds: overallCcPluginEval.checkpointStateIds,
      ccPluginEvalCostEstimateIds: overallCcPluginEval.costEstimateIds,
      ccPluginEvalReporterFormats: overallCcPluginEval.reporterFormats,
      ccPluginEvalResultArtifactIds: overallCcPluginEval.resultArtifactIds,
      ccPluginEvalMetricNames: overallCcPluginEval.metricNames,
      ccPluginEvalTriggerAccuracy0to1: overallCcPluginEval.triggerAccuracy0to1,
      ccPluginEvalFalsePositiveRate0to1: overallCcPluginEval.falsePositiveRate0to1,
      ccPluginEvalFalseNegativeRate0to1: overallCcPluginEval.falseNegativeRate0to1,
      ccPluginEvalComponentCount: overallCcPluginEval.componentCount,
      ccPluginEvalScenarioCount: overallCcPluginEval.scenarioCount,
      ccPluginEvalReportArtifactHashes: overallCcPluginEval.reportArtifactHashes,
      realignSimulationCoverage: overallRealignSimulation.coverage,
      realignSimulationSampleSize: overallRealignSimulation.sampleSize,
      realignSimulationEvidenceRefs: overallRealignSimulation.evidenceRefs,
      realignSimulationMissingSignals: overallRealignSimulation.missingSignals,
      realignSimulationRepositoryRefs: overallRealignSimulation.repositoryRefs,
      realignSimulationLicenseRefs: overallRealignSimulation.licenseRefs,
      realignSimulationConfigIds: overallRealignSimulation.configIds,
      realignSimulationAppIds: overallRealignSimulation.appIds,
      realignSimulationDatasetIds: overallRealignSimulation.datasetIds,
      realignSimulationScenarioIds: overallRealignSimulation.scenarioIds,
      realignSimulationPersonaIds: overallRealignSimulation.personaIds,
      realignSimulationEvaluatorIds: overallRealignSimulation.evaluatorIds,
      realignSimulationTargetIds: overallRealignSimulation.targetIds,
      realignSimulationRunTraceIds: overallRealignSimulation.runTraceIds,
      realignSimulationRepeatedRunTraceIds: overallRealignSimulation.repeatedRunTraceIds,
      realignSimulationJudgeIds: overallRealignSimulation.judgeIds,
      realignSimulationCalibrationIds: overallRealignSimulation.calibrationIds,
      realignSimulationStatisticsReportIds: overallRealignSimulation.statisticsReportIds,
      realignSimulationCiReporterIds: overallRealignSimulation.ciReporterIds,
      realignSimulationReporterFormats: overallRealignSimulation.reporterFormats,
      realignSimulationExperimentIds: overallRealignSimulation.experimentIds,
      realignSimulationResultArtifactIds: overallRealignSimulation.resultArtifactIds,
      realignSimulationMetricNames: overallRealignSimulation.metricNames,
      realignSimulationJudgeAgreement0to1: overallRealignSimulation.judgeAgreement0to1,
      realignSimulationRegressionPassRate0to1: overallRealignSimulation.regressionPassRate0to1,
      realignSimulationScenarioCount: overallRealignSimulation.scenarioCount,
      realignSimulationEvaluatorCount: overallRealignSimulation.evaluatorCount,
      realignSimulationRepeatCount: overallRealignSimulation.repeatCount,
      realignSimulationReportArtifactHashes: overallRealignSimulation.reportArtifactHashes,
      academiClawCoverage: overallAcademiClaw.coverage,
      academiClawSampleSize: overallAcademiClaw.sampleSize,
      academiClawEvidenceRefs: overallAcademiClaw.evidenceRefs,
      academiClawMissingSignals: overallAcademiClaw.missingSignals,
      academiClawRepositoryRefs: overallAcademiClaw.repositoryRefs,
      academiClawLicenseRefs: overallAcademiClaw.licenseRefs,
      academiClawBranchRefs: overallAcademiClaw.branchRefs,
      academiClawCommitRefs: overallAcademiClaw.commitRefs,
      academiClawTreeRefs: overallAcademiClaw.treeRefs,
      academiClawReadmeBlobRefs: overallAcademiClaw.readmeBlobRefs,
      academiClawCitationRefs: overallAcademiClaw.citationRefs,
      academiClawTaskCorpusRefs: overallAcademiClaw.taskCorpusRefs,
      academiClawLanguageIds: overallAcademiClaw.languageIds,
      academiClawWorkspaceQueryIds: overallAcademiClaw.workspaceQueryIds,
      academiClawDockerImageIds: overallAcademiClaw.dockerImageIds,
      academiClawRubricIds: overallAcademiClaw.rubricIds,
      academiClawEvalTaskRunnerIds: overallAcademiClaw.evalTaskRunnerIds,
      academiClawResultManifestIds: overallAcademiClaw.resultManifestIds,
      academiClawConversationTraceIds: overallAcademiClaw.conversationTraceIds,
      academiClawMetaEvalIds: overallAcademiClaw.metaEvalIds,
      academiClawModelIds: overallAcademiClaw.modelIds,
      academiClawMetricNames: overallAcademiClaw.metricNames,
      academiClawCiReporterIds: overallAcademiClaw.ciReporterIds,
      academiClawReporterFormats: overallAcademiClaw.reporterFormats,
      academiClawTaskCount: overallAcademiClaw.taskCount,
      academiClawLanguageCount: overallAcademiClaw.languageCount,
      academiClawRubricCount: overallAcademiClaw.rubricCount,
      academiClawTraceCount: overallAcademiClaw.traceCount,
      academiClawMetaEvalCount: overallAcademiClaw.metaEvalCount,
      academiClawModelCount: overallAcademiClaw.modelCount,
      academiClawRegressionPassRate0to1: overallAcademiClaw.regressionPassRate0to1,
      academiClawReportArtifactHashes: overallAcademiClaw.reportArtifactHashes,
      ragChunkingTechniqueCoverage: overallRagChunkingTechnique.coverage,
      ragChunkingTechniqueSampleSize: overallRagChunkingTechnique.sampleSize,
      ragChunkingTechniqueEvidenceRefs: overallRagChunkingTechnique.evidenceRefs,
      ragChunkingTechniqueMissingSignals: overallRagChunkingTechnique.missingSignals,
      ragChunkingTechniqueRepositoryRefs: overallRagChunkingTechnique.repositoryRefs,
      ragChunkingTechniqueLicenseRefs: overallRagChunkingTechnique.licenseRefs,
      ragChunkingTechniqueBranchRefs: overallRagChunkingTechnique.branchRefs,
      ragChunkingTechniqueCommitRefs: overallRagChunkingTechnique.commitRefs,
      ragChunkingTechniqueTreeRefs: overallRagChunkingTechnique.treeRefs,
      ragChunkingTechniqueReadmeBlobRefs: overallRagChunkingTechnique.readmeBlobRefs,
      ragChunkingTechniquePolicyCorpusRefs: overallRagChunkingTechnique.policyCorpusRefs,
      ragChunkingTechniqueNotebookIds: overallRagChunkingTechnique.notebookIds,
      ragChunkingTechniqueChunkingStrategyIds: overallRagChunkingTechnique.chunkingStrategyIds,
      ragChunkingTechniqueRetrievalPipelineIds: overallRagChunkingTechnique.retrievalPipelineIds,
      ragChunkingTechniqueEmbeddingVectorstoreIds: overallRagChunkingTechnique.embeddingVectorstoreIds,
      ragChunkingTechniqueEvaluationDatasetIds: overallRagChunkingTechnique.evaluationDatasetIds,
      ragChunkingTechniqueMetricNames: overallRagChunkingTechnique.metricNames,
      ragChunkingTechniqueCiReporterIds: overallRagChunkingTechnique.ciReporterIds,
      ragChunkingTechniqueReporterFormats: overallRagChunkingTechnique.reporterFormats,
      ragChunkingTechniquePolicyDocumentCount: overallRagChunkingTechnique.policyDocumentCount,
      ragChunkingTechniqueNotebookCount: overallRagChunkingTechnique.notebookCount,
      ragChunkingTechniqueChunkingStrategyCount: overallRagChunkingTechnique.chunkingStrategyCount,
      ragChunkingTechniqueEvaluationQuestionCount: overallRagChunkingTechnique.evaluationQuestionCount,
      ragChunkingTechniqueMetricCount: overallRagChunkingTechnique.metricCount,
      ragChunkingTechniqueRegressionPassRate0to1: overallRagChunkingTechnique.regressionPassRate0to1,
      ragChunkingTechniqueReportArtifactHashes: overallRagChunkingTechnique.reportArtifactHashes,
      kubernetesOperationalAgentCoverage: overallKubernetesOperationalAgent.coverage,
      kubernetesOperationalAgentSampleSize: overallKubernetesOperationalAgent.sampleSize,
      kubernetesOperationalAgentEvidenceRefs: overallKubernetesOperationalAgent.evidenceRefs,
      kubernetesOperationalAgentMissingSignals: overallKubernetesOperationalAgent.missingSignals,
      kubernetesOperationalAgentRepositoryRefs: overallKubernetesOperationalAgent.repositoryRefs,
      kubernetesOperationalAgentLicenseRefs: overallKubernetesOperationalAgent.licenseRefs,
      kubernetesOperationalAgentReleaseRefs: overallKubernetesOperationalAgent.releaseRefs,
      kubernetesOperationalAgentBranchRefs: overallKubernetesOperationalAgent.branchRefs,
      kubernetesOperationalAgentCommitRefs: overallKubernetesOperationalAgent.commitRefs,
      kubernetesOperationalAgentTreeRefs: overallKubernetesOperationalAgent.treeRefs,
      kubernetesOperationalAgentReadmeBlobRefs: overallKubernetesOperationalAgent.readmeBlobRefs,
      kubernetesOperationalAgentBuildWorkflowRefs: overallKubernetesOperationalAgent.buildWorkflowRefs,
      kubernetesOperationalAgentAgentModuleRefs: overallKubernetesOperationalAgent.agentModuleRefs,
      kubernetesOperationalAgentMcpServerModuleRefs: overallKubernetesOperationalAgent.mcpServerModuleRefs,
      kubernetesOperationalAgentToolModuleRefs: overallKubernetesOperationalAgent.toolModuleRefs,
      kubernetesOperationalAgentToolCategoryIds: overallKubernetesOperationalAgent.toolCategoryIds,
      kubernetesOperationalAgentDiagnosticCapabilityIds: overallKubernetesOperationalAgent.diagnosticCapabilityIds,
      kubernetesOperationalAgentResourceMetricIds: overallKubernetesOperationalAgent.resourceMetricIds,
      kubernetesOperationalAgentLogAnalysisIds: overallKubernetesOperationalAgent.logAnalysisIds,
      kubernetesOperationalAgentMetricNames: overallKubernetesOperationalAgent.metricNames,
      kubernetesOperationalAgentCiReporterIds: overallKubernetesOperationalAgent.ciReporterIds,
      kubernetesOperationalAgentReporterFormats: overallKubernetesOperationalAgent.reporterFormats,
      kubernetesOperationalAgentToolCategoryCount: overallKubernetesOperationalAgent.toolCategoryCount,
      kubernetesOperationalAgentDiagnosticCapabilityCount: overallKubernetesOperationalAgent.diagnosticCapabilityCount,
      kubernetesOperationalAgentResourceMetricCount: overallKubernetesOperationalAgent.resourceMetricCount,
      kubernetesOperationalAgentLogAnalysisCount: overallKubernetesOperationalAgent.logAnalysisCount,
      kubernetesOperationalAgentRegressionPassRate0to1: overallKubernetesOperationalAgent.regressionPassRate0to1,
      kubernetesOperationalAgentReportArtifactHashes: overallKubernetesOperationalAgent.reportArtifactHashes,
      secureVibeBenchCoverage: overallSecureVibeBench.coverage,
      secureVibeBenchSampleSize: overallSecureVibeBench.sampleSize,
      secureVibeBenchEvidenceRefs: overallSecureVibeBench.evidenceRefs,
      secureVibeBenchMissingSignals: overallSecureVibeBench.missingSignals,
      secureVibeBenchRepositoryRefs: overallSecureVibeBench.repositoryRefs,
      secureVibeBenchLicenseRefs: overallSecureVibeBench.licenseRefs,
      secureVibeBenchHomepageRefs: overallSecureVibeBench.homepageRefs,
      secureVibeBenchArxivRefs: overallSecureVibeBench.arxivRefs,
      secureVibeBenchBranchRefs: overallSecureVibeBench.branchRefs,
      secureVibeBenchCommitRefs: overallSecureVibeBench.commitRefs,
      secureVibeBenchTreeRefs: overallSecureVibeBench.treeRefs,
      secureVibeBenchReadmeBlobRefs: overallSecureVibeBench.readmeBlobRefs,
      secureVibeBenchResultsBlobRefs: overallSecureVibeBench.resultsBlobRefs,
      secureVibeBenchDatasetRefs: overallSecureVibeBench.datasetRefs,
      secureVibeBenchFormatExampleRefs: overallSecureVibeBench.formatExampleRefs,
      secureVibeBenchEvaluationRunnerRefs: overallSecureVibeBench.evaluationRunnerRefs,
      secureVibeBenchAgentAdapterIds: overallSecureVibeBench.agentAdapterIds,
      secureVibeBenchVulnerabilityScenarioIds: overallSecureVibeBench.vulnerabilityScenarioIds,
      secureVibeBenchTestScriptIds: overallSecureVibeBench.testScriptIds,
      secureVibeBenchParserUtilityRefs: overallSecureVibeBench.parserUtilityRefs,
      secureVibeBenchPatchDiffUtilityRefs: overallSecureVibeBench.patchDiffUtilityRefs,
      secureVibeBenchMetricNames: overallSecureVibeBench.metricNames,
      secureVibeBenchCiReporterIds: overallSecureVibeBench.ciReporterIds,
      secureVibeBenchReporterFormats: overallSecureVibeBench.reporterFormats,
      secureVibeBenchAgentAdapterCount: overallSecureVibeBench.agentAdapterCount,
      secureVibeBenchScenarioCount: overallSecureVibeBench.scenarioCount,
      secureVibeBenchTestScriptCount: overallSecureVibeBench.testScriptCount,
      secureVibeBenchRegressionPassRate0to1: overallSecureVibeBench.regressionPassRate0to1,
      secureVibeBenchReportArtifactHashes: overallSecureVibeBench.reportArtifactHashes,
      ravigBenchCoverage: overallRavigBench.coverage,
      ravigBenchSampleSize: overallRavigBench.sampleSize,
      ravigBenchEvidenceRefs: overallRavigBench.evidenceRefs,
      ravigBenchMissingSignals: overallRavigBench.missingSignals,
      ravigBenchRepositoryRefs: overallRavigBench.repositoryRefs,
      ravigBenchLicenseRefs: overallRavigBench.licenseRefs,
      ravigBenchBranchRefs: overallRavigBench.branchRefs,
      ravigBenchCommitRefs: overallRavigBench.commitRefs,
      ravigBenchTreeRefs: overallRavigBench.treeRefs,
      ravigBenchReadmeBlobRefs: overallRavigBench.readmeBlobRefs,
      ravigBenchLegalBlobRefs: overallRavigBench.legalBlobRefs,
      ravigBenchEnvironmentRefs: overallRavigBench.environmentRefs,
      ravigBenchConfigurationRefs: overallRavigBench.configurationRefs,
      ravigBenchContentEvaluationRefs: overallRavigBench.contentEvaluationRefs,
      ravigBenchDesignEvaluationRefs: overallRavigBench.designEvaluationRefs,
      ravigBenchExecutionEvaluationRefs: overallRavigBench.executionEvaluationRefs,
      ravigBenchFunctionScoringRefs: overallRavigBench.functionScoringRefs,
      ravigBenchDatasetRefs: overallRavigBench.datasetRefs,
      ravigBenchTestCaseRefs: overallRavigBench.testCaseRefs,
      ravigBenchModelResultRefs: overallRavigBench.modelResultRefs,
      ravigBenchTaxonomyIds: overallRavigBench.taxonomyIds,
      ravigBenchRetrievalContextIds: overallRavigBench.retrievalContextIds,
      ravigBenchMultiModalEvaluatorIds: overallRavigBench.multiModalEvaluatorIds,
      ravigBenchScreenshotEvaluationRefs: overallRavigBench.screenshotEvaluationRefs,
      ravigBenchRunScriptRefs: overallRavigBench.runScriptRefs,
      ravigBenchMetricNames: overallRavigBench.metricNames,
      ravigBenchCiReporterIds: overallRavigBench.ciReporterIds,
      ravigBenchReporterFormats: overallRavigBench.reporterFormats,
      ravigBenchDatasetCaseCount: overallRavigBench.datasetCaseCount,
      ravigBenchVisualDesignCheckCount: overallRavigBench.visualDesignCheckCount,
      ravigBenchEvaluatorCount: overallRavigBench.evaluatorCount,
      ravigBenchValidationPassRate0to1: overallRavigBench.validationPassRate0to1,
      ravigBenchReportArtifactHashes: overallRavigBench.reportArtifactHashes,
      humanStudyBenchCoverage: overallHumanStudyBench.coverage,
      humanStudyBenchSampleSize: overallHumanStudyBench.sampleSize,
      humanStudyBenchEvidenceRefs: overallHumanStudyBench.evidenceRefs,
      humanStudyBenchMissingSignals: overallHumanStudyBench.missingSignals,
      humanStudyBenchRepositoryRefs: overallHumanStudyBench.repositoryRefs,
      humanStudyBenchLicenseRefs: overallHumanStudyBench.licenseRefs,
      humanStudyBenchBranchRefs: overallHumanStudyBench.branchRefs,
      humanStudyBenchCommitRefs: overallHumanStudyBench.commitRefs,
      humanStudyBenchStudyConfigIds: overallHumanStudyBench.studyConfigIds,
      humanStudyBenchBackgroundDatasetIds: overallHumanStudyBench.backgroundDatasetIds,
      humanStudyBenchHumanResponseDatasetIds: overallHumanStudyBench.humanResponseDatasetIds,
      humanStudyBenchAgentResponseDatasetIds: overallHumanStudyBench.agentResponseDatasetIds,
      humanStudyBenchEvaluatorIds: overallHumanStudyBench.evaluatorIds,
      humanStudyBenchMetricNames: overallHumanStudyBench.metricNames,
      humanStudyBenchValidatorIds: overallHumanStudyBench.validatorIds,
      humanStudyBenchScorerIds: overallHumanStudyBench.scorerIds,
      humanStudyBenchStandardizerIds: overallHumanStudyBench.standardizerIds,
      humanStudyBenchReliabilityReportIds: overallHumanStudyBench.reliabilityReportIds,
      humanStudyBenchValidationPipelineIds: overallHumanStudyBench.validationPipelineIds,
      humanStudyBenchResultArtifactIds: overallHumanStudyBench.resultArtifactIds,
      humanStudyBenchCiReporterIds: overallHumanStudyBench.ciReporterIds,
      humanStudyBenchReporterFormats: overallHumanStudyBench.reporterFormats,
      humanStudyBenchStudyCount: overallHumanStudyBench.studyCount,
      humanStudyBenchParticipantCount: overallHumanStudyBench.participantCount,
      humanStudyBenchResponseCount: overallHumanStudyBench.responseCount,
      humanStudyBenchEvaluatorCount: overallHumanStudyBench.evaluatorCount,
      humanStudyBenchInterRaterAgreement0to1: overallHumanStudyBench.interRaterAgreement0to1,
      humanStudyBenchTestRetestReliability0to1: overallHumanStudyBench.testRetestReliability0to1,
      humanStudyBenchValidationPassRate0to1: overallHumanStudyBench.validationPassRate0to1,
      humanStudyBenchReportArtifactHashes: overallHumanStudyBench.reportArtifactHashes,
      legacyBenchCoverage: overallLegacyBench.coverage,
      legacyBenchSampleSize: overallLegacyBench.sampleSize,
      legacyBenchEvidenceRefs: overallLegacyBench.evidenceRefs,
      legacyBenchMissingSignals: overallLegacyBench.missingSignals,
      legacyBenchRepositoryRefs: overallLegacyBench.repositoryRefs,
      legacyBenchLicenseRefs: overallLegacyBench.licenseRefs,
      legacyBenchBranchRefs: overallLegacyBench.branchRefs,
      legacyBenchCommitRefs: overallLegacyBench.commitRefs,
      legacyBenchTreeRefs: overallLegacyBench.treeRefs,
      legacyBenchReadmeBlobRefs: overallLegacyBench.readmeBlobRefs,
      legacyBenchTaskCorpusRefs: overallLegacyBench.taskCorpusRefs,
      legacyBenchLegacyLanguageIds: overallLegacyBench.legacyLanguageIds,
      legacyBenchEnvironmentIds: overallLegacyBench.environmentIds,
      legacyBenchHarnessRunnerIds: overallLegacyBench.harnessRunnerIds,
      legacyBenchAgentTaskIds: overallLegacyBench.agentTaskIds,
      legacyBenchPatchSubmissionIds: overallLegacyBench.patchSubmissionIds,
      legacyBenchTestOracleIds: overallLegacyBench.testOracleIds,
      legacyBenchEvaluatorIds: overallLegacyBench.evaluatorIds,
      legacyBenchMetricNames: overallLegacyBench.metricNames,
      legacyBenchCiReporterIds: overallLegacyBench.ciReporterIds,
      legacyBenchReporterFormats: overallLegacyBench.reporterFormats,
      legacyBenchResultArtifactIds: overallLegacyBench.resultArtifactIds,
      legacyBenchReplayCommandIds: overallLegacyBench.replayCommandIds,
      legacyBenchTaskCount: overallLegacyBench.taskCount,
      legacyBenchLanguageCount: overallLegacyBench.languageCount,
      legacyBenchEnvironmentCount: overallLegacyBench.environmentCount,
      legacyBenchTestOracleCount: overallLegacyBench.testOracleCount,
      legacyBenchEvaluatorCount: overallLegacyBench.evaluatorCount,
      legacyBenchRegressionPassRate0to1: overallLegacyBench.regressionPassRate0to1,
      legacyBenchReplayPassRate0to1: overallLegacyBench.replayPassRate0to1,
      legacyBenchReportArtifactHashes: overallLegacyBench.reportArtifactHashes,
      subtleMemoryCoverage: overallSubtleMemory.coverage,
      subtleMemorySampleSize: overallSubtleMemory.sampleSize,
      subtleMemoryEvidenceRefs: overallSubtleMemory.evidenceRefs,
      subtleMemoryMissingSignals: overallSubtleMemory.missingSignals,
      subtleMemoryRepositoryRefs: overallSubtleMemory.repositoryRefs,
      subtleMemoryLicenseRefs: overallSubtleMemory.licenseRefs,
      subtleMemoryBranchRefs: overallSubtleMemory.branchRefs,
      subtleMemoryCommitRefs: overallSubtleMemory.commitRefs,
      subtleMemoryTreeRefs: overallSubtleMemory.treeRefs,
      subtleMemoryArxivRefs: overallSubtleMemory.arxivRefs,
      subtleMemoryDatasetRefs: overallSubtleMemory.datasetRefs,
      subtleMemoryPersonaIds: overallSubtleMemory.personaIds,
      subtleMemoryBenchInstanceManifestIds: overallSubtleMemory.benchInstanceManifestIds,
      subtleMemoryHistorySessionManifestIds: overallSubtleMemory.historySessionManifestIds,
      subtleMemoryRelationTypes: overallSubtleMemory.relationTypes,
      subtleMemoryConstructionPipelineIds: overallSubtleMemory.constructionPipelineIds,
      subtleMemoryEvaluationStageIds: overallSubtleMemory.evaluationStageIds,
      subtleMemoryAdapterIds: overallSubtleMemory.adapterIds,
      subtleMemoryJudgeIds: overallSubtleMemory.judgeIds,
      subtleMemoryEvaluatorIds: overallSubtleMemory.evaluatorIds,
      subtleMemoryMetricNames: overallSubtleMemory.metricNames,
      subtleMemoryScoreSummaryIds: overallSubtleMemory.scoreSummaryIds,
      subtleMemoryDiagnosticProtocolIds: overallSubtleMemory.diagnosticProtocolIds,
      subtleMemoryCiReporterIds: overallSubtleMemory.ciReporterIds,
      subtleMemoryReporterFormats: overallSubtleMemory.reporterFormats,
      subtleMemoryPersonaCount: overallSubtleMemory.personaCount,
      subtleMemoryBenchInstanceCount: overallSubtleMemory.benchInstanceCount,
      subtleMemoryHistoryCount: overallSubtleMemory.historyCount,
      subtleMemoryMemoryVariantSetCount: overallSubtleMemory.memoryVariantSetCount,
      subtleMemoryRelationTypeCount: overallSubtleMemory.relationTypeCount,
      subtleMemoryEvaluationStageCount: overallSubtleMemory.evaluationStageCount,
      subtleMemoryAdapterCount: overallSubtleMemory.adapterCount,
      subtleMemoryJudgeAgreement0to1: overallSubtleMemory.judgeAgreement0to1,
      subtleMemoryValidationPassRate0to1: overallSubtleMemory.validationPassRate0to1,
      subtleMemoryReportArtifactHashes: overallSubtleMemory.reportArtifactHashes,
      previousObservations: priorReports.map((report) => ({
        agentId: report.agentId,
        score: reportOverallScore(report),
        timestamp: report.ts,
        runId: report.runId
      })),
      thresholds
    })
  ];

  for (const layer of input.layerScores) {
    const metricId = `layer:${layer.layerName}`;
    const layerQuestions = questionScoresByLayer.get(layer.layerName) ?? [];
    const layerValidity = layerQuestions.length > 0
      ? constructValidity({
          questionScores: layerQuestions,
          integrityIndex: input.integrityIndex,
          evidenceCoverage: input.evidenceCoverage,
          correlationRatio: input.correlationRatio,
          unsupportedClaimCount: layerQuestions.filter((score) => score.flags.includes("FLAG_UNSUPPORTED_CLAIM")).length
        })
      : overallValidity;
    const layerCounterfactuals = counterfactualSummary(input.counterfactualChecks, metricId);
    const layerFacets = validationFacetSummary(input.validationFacetChecks, metricId);
    const layerConfounders = confounderControlSummary(input.confounderControlChecks, metricId);
    const layerOutcomes = outcomeAlignmentSummary(input.outcomeAlignmentChecks, metricId);
    const layerProcessEvidence = processEvidenceSummary(input.processEvidenceChecks, metricId);
    const layerSafetyUtility = safetyUtilitySummary(input.safetyUtilityChecks, metricId);
    const layerModalityTransformation = modalityTransformationSummary(input.modalityTransformationChecks, metricId);
    const layerLifecycleObservability = lifecycleObservabilitySummary(input.lifecycleObservabilityChecks, metricId);
    const layerRankingStability = rankingStabilitySummary(input.rankingStabilityChecks, metricId);
    const layerToolSandbox = toolSandboxSummary(input.toolSandboxChecks, metricId);
    const layerContinualLearning = continualLearningSummary(input.continualLearningChecks, metricId);
    const layerStrategicInteraction = strategicInteractionSummary(input.strategicInteractionChecks, metricId);
    const layerHasArchitectureRealityChecks = (input.architectureRealityChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.architectureSignalType !== undefined
    );
    const layerArchitectureReality = architectureRealitySummary(
      input.architectureRealityChecks,
      metricId,
      thresholds,
      layerHasArchitectureRealityChecks
    );
    const layerRagPipeline = ragPipelineSummary(input.ragPipelineChecks, metricId);
    const layerHasRagEvaluationPipelineChecks = (input.ragPipelineChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.evaluationSignalType !== undefined
    );
    const layerRagEvaluationPipeline = ragEvaluationPipelineSummary(
      input.ragPipelineChecks,
      metricId,
      thresholds,
      layerHasRagEvaluationPipelineChecks
    );
    const layerHasRagasNotebookChecks = (input.ragPipelineChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.ragasNotebookSignalType !== undefined
    );
    const layerRagasNotebook = ragasNotebookSummary(
      input.ragPipelineChecks,
      metricId,
      thresholds,
      layerHasRagasNotebookChecks
    );
    const layerHasMirageRagMetricChecks = (input.ragPipelineChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.mirageSignalType !== undefined
    );
    const layerMirageRagMetric = mirageRagMetricSummary(
      input.ragPipelineChecks,
      metricId,
      thresholds,
      layerHasMirageRagMetricChecks
    );
    const layerHasLegalCodeRagChecks = (input.ragPipelineChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.legalCodeRagSignalType !== undefined
    );
    const layerLegalCodeRagMetric = legalCodeRagMetricSummary(
      input.ragPipelineChecks,
      metricId,
      thresholds,
      layerHasLegalCodeRagChecks
    );
    const layerHasGuardbenchMetricChecks = (input.guardbenchChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.guardbenchSignalType !== undefined
    );
    const layerGuardbenchMetric = guardbenchMetricSummary(
      input.guardbenchChecks,
      metricId,
      thresholds,
      layerHasGuardbenchMetricChecks
    );
    const layerBusinessWorkflow = businessWorkflowSummary(input.businessWorkflowChecks, metricId);
    const layerDataAgentAnalytical = dataAgentAnalyticalSummary(input.dataAgentAnalyticalChecks, metricId);
    const layerEmbodiedAgent = embodiedAgentSummary(input.embodiedAgentChecks, metricId, thresholds);
    const layerHasEvaluatorSuiteChecks = (input.evaluatorSuiteChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.evaluatorSignalType !== undefined
    );
    const layerEvaluatorSuite = evaluatorSuiteSummary(
      input.evaluatorSuiteChecks,
      metricId,
      thresholds,
      layerHasEvaluatorSuiteChecks
    );
    const layerHasPentestBenchmarkChecks = (input.pentestBenchmarkChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.pentestSignalType !== undefined
    );
    const layerPentestBenchmark = pentestBenchmarkSummary(
      input.pentestBenchmarkChecks,
      metricId,
      thresholds,
      layerHasPentestBenchmarkChecks
    );
    const layerHasTraceEvaluationChecks = (input.traceEvaluationChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.traceEvaluationSignalType !== undefined
    );
    const layerTraceEvaluation = traceEvaluationSummary(
      input.traceEvaluationChecks,
      metricId,
      thresholds,
      layerHasTraceEvaluationChecks
    );
    const layerHasLivingEnvironmentChecks = (input.livingEnvironmentChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.livingEnvironmentSignalType !== undefined
    );
    const layerLivingEnvironment = livingEnvironmentSummary(
      input.livingEnvironmentChecks,
      metricId,
      thresholds,
      layerHasLivingEnvironmentChecks
    );
    const layerHasMobileAgentChecks = (input.mobileAgentChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.mobileAgentSignalType !== undefined
    );
    const layerMobileAgent = mobileAgentSummary(
      input.mobileAgentChecks,
      metricId,
      thresholds,
      layerHasMobileAgentChecks
    );
    const layerHasPersonaAgentChecks = (input.personaAgentChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.personaSignalType !== undefined
    );
    const layerPersonaAgent = personaAgentSummary(
      input.personaAgentChecks,
      metricId,
      thresholds,
      layerHasPersonaAgentChecks
    );
    const layerHasScientificLiteratureChecks = (input.scientificLiteratureChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.scientificLiteratureSignalType !== undefined
    );
    const layerScientificLiterature = scientificLiteratureSummary(
      input.scientificLiteratureChecks,
      metricId,
      thresholds,
      layerHasScientificLiteratureChecks
    );
    const layerHasBioinformaticsAgentChecks = (input.bioinformaticsAgentChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.bioinformaticsAgentSignalType !== undefined
    );
    const layerBioinformaticsAgent = bioinformaticsAgentSummary(
      input.bioinformaticsAgentChecks,
      metricId,
      thresholds,
      layerHasBioinformaticsAgentChecks
    );
    const layerHasMirageDrugRepositioningChecks = (input.mirageDrugRepositioningChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.mirageDrugRepositioningSignalType !== undefined
    );
    const layerMirageDrugRepositioning = mirageDrugRepositioningSummary(
      input.mirageDrugRepositioningChecks,
      metricId,
      thresholds,
      layerHasMirageDrugRepositioningChecks
    );
    const layerHasNetworkTroubleshootingChecks = (input.networkTroubleshootingChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.networkTroubleshootingSignalType !== undefined
    );
    const layerNetworkTroubleshooting = networkTroubleshootingSummary(
      input.networkTroubleshootingChecks,
      metricId,
      thresholds,
      layerHasNetworkTroubleshootingChecks
    );
    const layerHasInferenceOptimizationChecks = (input.inferenceOptimizationChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.inferenceOptimizationSignalType !== undefined
    );
    const layerInferenceOptimization = inferenceOptimizationSummary(
      input.inferenceOptimizationChecks,
      metricId,
      thresholds,
      layerHasInferenceOptimizationChecks
    );
    const layerHasJavaCodingAgentChecks = (input.javaCodingAgentChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.javaCodingAgentSignalType !== undefined
    );
    const layerJavaCodingAgent = javaCodingAgentSummary(
      input.javaCodingAgentChecks,
      metricId,
      thresholds,
      layerHasJavaCodingAgentChecks
    );
    const layerHasWebEvalDatasetChecks = (input.webEvalDatasetChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.webEvalDatasetSignalType !== undefined
    );
    const layerWebEvalDataset = webEvalDatasetSummary(
      input.webEvalDatasetChecks,
      metricId,
      thresholds,
      layerHasWebEvalDatasetChecks
    );
    const layerHasParallelResearchSkillChecks = (input.parallelResearchSkillChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.parallelResearchSignalType !== undefined
    );
    const layerParallelResearchSkill = parallelResearchSkillSummary(
      input.parallelResearchSkillChecks,
      metricId,
      thresholds,
      layerHasParallelResearchSkillChecks
    );
    const layerHasResumeRagEvaluatorChecks = (input.resumeRagEvaluatorChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.resumeRagSignalType !== undefined
    );
    const layerResumeRagEvaluator = resumeRagEvaluatorSummary(
      input.resumeRagEvaluatorChecks,
      metricId,
      thresholds,
      layerHasResumeRagEvaluatorChecks
    );
    const layerHasChipBenchmarkChecks = (input.chipBenchmarkChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.chipBenchmarkSignalType !== undefined
    );
    const layerChipBenchmark = chipBenchmarkSummary(
      input.chipBenchmarkChecks,
      metricId,
      thresholds,
      layerHasChipBenchmarkChecks
    );
    const layerHasHermesBenchChecks = (input.hermesBenchChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.hermesBenchSignalType !== undefined
    );
    const layerHermesBench = hermesBenchSummary(
      input.hermesBenchChecks,
      metricId,
      thresholds,
      layerHasHermesBenchChecks
    );
    const layerHasCooperBenchChecks = (input.cooperBenchChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.cooperBenchSignalType !== undefined
    );
    const layerCooperBench = cooperBenchSummary(
      input.cooperBenchChecks,
      metricId,
      thresholds,
      layerHasCooperBenchChecks
    );
    const layerHasCoderCupChecks = (input.coderCupChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.coderCupSignalType !== undefined
    );
    const layerCoderCup = coderCupSummary(
      input.coderCupChecks,
      metricId,
      thresholds,
      layerHasCoderCupChecks
    );
    const layerHasAgenticGraphRagChecks = (input.agenticGraphRagChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.agenticGraphRagSignalType !== undefined
    );
    const layerAgenticGraphRag = agenticGraphRagSummary(
      input.agenticGraphRagChecks,
      metricId,
      thresholds,
      layerHasAgenticGraphRagChecks
    );
    const layerHasAgentScenarioTestChecks = (input.agentScenarioTestChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.agentScenarioTestSignalType !== undefined
    );
    const layerAgentScenarioTest = agentScenarioTestSummary(
      input.agentScenarioTestChecks,
      metricId,
      thresholds,
      layerHasAgentScenarioTestChecks
    );
    const layerHasOpenCodeLabChecks = (input.openCodeLabChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.openCodeLabSignalType !== undefined
    );
    const layerOpenCodeLab = openCodeLabSummary(
      input.openCodeLabChecks,
      metricId,
      thresholds,
      layerHasOpenCodeLabChecks
    );
    const layerHasCcPluginEvalChecks = (input.ccPluginEvalChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.ccPluginEvalSignalType !== undefined
    );
    const layerCcPluginEval = ccPluginEvalSummary(
      input.ccPluginEvalChecks,
      metricId,
      thresholds,
      layerHasCcPluginEvalChecks
    );
    const layerHasRealignSimulationChecks = (input.realignSimulationChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.realignSimulationSignalType !== undefined
    );
    const layerRealignSimulation = realignSimulationSummary(
      input.realignSimulationChecks,
      metricId,
      thresholds,
      layerHasRealignSimulationChecks
    );
    const layerHasAcademiClawChecks = (input.academiClawChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.academiClawSignalType !== undefined
    );
    const layerAcademiClaw = academiClawSummary(
      input.academiClawChecks,
      metricId,
      thresholds,
      layerHasAcademiClawChecks
    );
    const layerHasRagChunkingTechniqueChecks = (input.ragChunkingTechniqueChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.ragChunkingTechniqueSignalType !== undefined
    );
    const layerRagChunkingTechnique = ragChunkingTechniqueSummary(
      input.ragChunkingTechniqueChecks,
      metricId,
      thresholds,
      layerHasRagChunkingTechniqueChecks
    );
    const layerHasKubernetesOperationalAgentChecks = (input.kubernetesOperationalAgentChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.kubernetesOperationalAgentSignalType !== undefined
    );
    const layerKubernetesOperationalAgent = kubernetesOperationalAgentSummary(
      input.kubernetesOperationalAgentChecks,
      metricId,
      thresholds,
      layerHasKubernetesOperationalAgentChecks
    );
    const layerHasSecureVibeBenchChecks = (input.secureVibeBenchChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.secureVibeBenchSignalType !== undefined
    );
    const layerSecureVibeBench = secureVibeBenchSummary(
      input.secureVibeBenchChecks,
      metricId,
      thresholds,
      layerHasSecureVibeBenchChecks
    );
    const layerHasRavigBenchChecks = (input.ravigBenchChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.ravigBenchSignalType !== undefined
    );
    const layerRavigBench = ravigBenchSummary(
      input.ravigBenchChecks,
      metricId,
      thresholds,
      layerHasRavigBenchChecks
    );
    const layerHasHumanStudyBenchChecks = (input.humanStudyBenchChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.humanStudyBenchSignalType !== undefined
    );
    const layerHumanStudyBench = humanStudyBenchSummary(
      input.humanStudyBenchChecks,
      metricId,
      thresholds,
      layerHasHumanStudyBenchChecks
    );
    const layerHasLegacyBenchChecks = (input.legacyBenchChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.legacyBenchSignalType !== undefined
    );
    const layerLegacyBench = legacyBenchSummary(
      input.legacyBenchChecks,
      metricId,
      thresholds,
      layerHasLegacyBenchChecks
    );
    const layerHasSubtleMemoryChecks = (input.subtleMemoryChecks ?? []).some((check) =>
      (check.metricId ?? "overall_maturity_score") === metricId &&
      check.subtleMemorySignalType !== undefined
    );
    const layerSubtleMemory = subtleMemorySummary(
      input.subtleMemoryChecks,
      metricId,
      thresholds,
      layerHasSubtleMemoryChecks
    );
    rows.push(buildRow({
      metricId,
      owner: `AMC Score:${layer.layerName}`,
      agentId: input.agentId,
      timestamp: input.ts,
      values: layerQuestions.length > 0 ? scoreValues(layerQuestions) : [clamp(layer.avgFinalLevel * 20, 0, 100)],
      questionScores: layerQuestions,
      constructValidity: layerValidity,
      interRaterAgreement,
      counterfactualResponsiveness: layerCounterfactuals.responsiveness,
      counterfactualSampleSize: layerCounterfactuals.sampleSize,
      counterfactualEvidenceRefs: layerCounterfactuals.evidenceRefs,
      validationFacetCoverage: layerFacets.coverage,
      validationFacetSampleSize: layerFacets.sampleSize,
      validationFacetEvidenceRefs: layerFacets.evidenceRefs,
      confounderControlCoverage: layerConfounders.coverage,
      confounderControlSampleSize: layerConfounders.sampleSize,
      confounderControlEvidenceRefs: layerConfounders.evidenceRefs,
      outcomeAlignment: layerOutcomes.alignment,
      outcomeAlignmentSampleSize: layerOutcomes.sampleSize,
      outcomeAlignmentEvidenceRefs: layerOutcomes.evidenceRefs,
      processEvidenceCoverage: layerProcessEvidence.coverage,
      processEvidenceSampleSize: layerProcessEvidence.sampleSize,
      processEvidenceRefs: layerProcessEvidence.evidenceRefs,
      safetyUtilityCoverage: layerSafetyUtility.coverage,
      safetyUtilitySampleSize: layerSafetyUtility.sampleSize,
      safetyUtilityEvidenceRefs: layerSafetyUtility.evidenceRefs,
      modalityTransformationCoverage: layerModalityTransformation.coverage,
      modalityTransformationSampleSize: layerModalityTransformation.sampleSize,
      modalityTransformationEvidenceRefs: layerModalityTransformation.evidenceRefs,
      lifecycleObservabilityCoverage: layerLifecycleObservability.coverage,
      lifecycleObservabilitySampleSize: layerLifecycleObservability.sampleSize,
      lifecycleObservabilityEvidenceRefs: layerLifecycleObservability.evidenceRefs,
      rankingStabilityCoverage: layerRankingStability.coverage,
      rankingStabilitySampleSize: layerRankingStability.sampleSize,
      rankingStabilityEvidenceRefs: layerRankingStability.evidenceRefs,
      toolSandboxCoverage: layerToolSandbox.coverage,
      toolSandboxSampleSize: layerToolSandbox.sampleSize,
      toolSandboxEvidenceRefs: layerToolSandbox.evidenceRefs,
      continualLearningCoverage: layerContinualLearning.coverage,
      continualLearningSampleSize: layerContinualLearning.sampleSize,
      continualLearningEvidenceRefs: layerContinualLearning.evidenceRefs,
      continualLearningRunCount: layerContinualLearning.runCount,
      continualLearningMissingSignals: layerContinualLearning.missingSignals,
      continualLearningMemoryArtifactHashes: layerContinualLearning.memoryArtifactHashes,
      continualLearningRunSummaryArtifactHashes: layerContinualLearning.runSummaryArtifactHashes,
      continualLearningGameplayLogArtifactHashes: layerContinualLearning.gameplayLogArtifactHashes,
      continualLearningMetricNames: layerContinualLearning.metricNames,
      strategicInteractionCoverage: layerStrategicInteraction.coverage,
      strategicInteractionSampleSize: layerStrategicInteraction.sampleSize,
      strategicInteractionEvidenceRefs: layerStrategicInteraction.evidenceRefs,
      architectureRealityCoverage: layerArchitectureReality.coverage,
      architectureRealitySampleSize: layerArchitectureReality.sampleSize,
      architectureRealityEvidenceRefs: layerArchitectureReality.evidenceRefs,
      architectureRealityStressScenarioCount: layerArchitectureReality.stressScenarioCount,
      architectureRealityNetworkScenarioCount: layerArchitectureReality.networkScenarioCount,
      architectureRealityEnsemblePatternCount: layerArchitectureReality.ensemblePatternCount,
      architectureRealityMissingSignals: layerArchitectureReality.missingSignals,
      ragPipelineCoverage: layerRagPipeline.coverage,
      ragPipelineSampleSize: layerRagPipeline.sampleSize,
      ragPipelineEvidenceRefs: layerRagPipeline.evidenceRefs,
      ragEvaluationPipelineCoverage: layerRagEvaluationPipeline.coverage,
      ragEvaluationPipelineSampleSize: layerRagEvaluationPipeline.sampleSize,
      ragEvaluationPipelineEvidenceRefs: layerRagEvaluationPipeline.evidenceRefs,
      ragEvaluationPipelineCaseSampleSizeMin: layerRagEvaluationPipeline.caseSampleSizeMin,
      ragEvaluationPipelineMissingSignals: layerRagEvaluationPipeline.missingSignals,
      ragEvaluationPipelineMetricOwners: layerRagEvaluationPipeline.metricOwners,
      ragEvaluationPipelineReportArtifactHashes: layerRagEvaluationPipeline.reportArtifactHashes,
      ragasNotebookCoverage: layerRagasNotebook.coverage,
      ragasNotebookSampleSize: layerRagasNotebook.sampleSize,
      ragasNotebookEvidenceRefs: layerRagasNotebook.evidenceRefs,
      ragasNotebookMissingSignals: layerRagasNotebook.missingSignals,
      ragasNotebookMetricNames: layerRagasNotebook.metricNames,
      ragasNotebookQuestionCount: layerRagasNotebook.questionCount,
      ragasNotebookReportArtifactHashes: layerRagasNotebook.reportArtifactHashes,
      mirageRagMetricCoverage: layerMirageRagMetric.coverage,
      mirageRagMetricSampleSize: layerMirageRagMetric.sampleSize,
      mirageRagMetricEvidenceRefs: layerMirageRagMetric.evidenceRefs,
      mirageRagMetricMissingSignals: layerMirageRagMetric.missingSignals,
      mirageRagMetricDatasetIds: layerMirageRagMetric.datasetIds,
      mirageRagMetricEvaluationModes: layerMirageRagMetric.evaluationModes,
      mirageRagMetricRetrieverIds: layerMirageRagMetric.retrieverIds,
      mirageRagMetricModelIds: layerMirageRagMetric.modelIds,
      mirageRagMetricNames: layerMirageRagMetric.metricNames,
      mirageRagMetricQaPairCount: layerMirageRagMetric.qaPairCount,
      mirageRagMetricContextPoolCount: layerMirageRagMetric.contextPoolCount,
      mirageRagMetricReportArtifactHashes: layerMirageRagMetric.reportArtifactHashes,
      legalCodeRagCoverage: layerLegalCodeRagMetric.coverage,
      legalCodeRagSampleSize: layerLegalCodeRagMetric.sampleSize,
      legalCodeRagEvidenceRefs: layerLegalCodeRagMetric.evidenceRefs,
      legalCodeRagMissingSignals: layerLegalCodeRagMetric.missingSignals,
      legalCodeRagLegalCodeIds: layerLegalCodeRagMetric.legalCodeIds,
      legalCodeRagJurisdictionIds: layerLegalCodeRagMetric.jurisdictionIds,
      legalCodeRagRetrievalTechniqueIds: layerLegalCodeRagMetric.retrievalTechniqueIds,
      legalCodeRagVectorStoreIds: layerLegalCodeRagMetric.vectorStoreIds,
      legalCodeRagEmbeddingModelIds: layerLegalCodeRagMetric.embeddingModelIds,
      legalCodeRagEvaluationDatasetIds: layerLegalCodeRagMetric.evaluationDatasetIds,
      legalCodeRagMetricNames: layerLegalCodeRagMetric.metricNames,
      legalCodeRagQuestionCount: layerLegalCodeRagMetric.legalQuestionCount,
      legalCodeRagMetricOwners: layerLegalCodeRagMetric.metricOwners,
      legalCodeRagReportArtifactHashes: layerLegalCodeRagMetric.reportArtifactHashes,
      guardbenchMetricCoverage: layerGuardbenchMetric.coverage,
      guardbenchMetricSampleSize: layerGuardbenchMetric.sampleSize,
      guardbenchMetricEvidenceRefs: layerGuardbenchMetric.evidenceRefs,
      guardbenchMetricMissingSignals: layerGuardbenchMetric.missingSignals,
      guardbenchDatasetIds: layerGuardbenchMetric.datasetIds,
      guardbenchLanguageIds: layerGuardbenchMetric.languageIds,
      guardbenchModelIds: layerGuardbenchMetric.modelIds,
      guardbenchThresholdIds: layerGuardbenchMetric.thresholdIds,
      guardbenchMetricNames: layerGuardbenchMetric.metricNames,
      guardbenchExportFormats: layerGuardbenchMetric.exportFormats,
      guardbenchReportArtifactHashes: layerGuardbenchMetric.reportArtifactHashes,
      businessWorkflowCoverage: layerBusinessWorkflow.coverage,
      businessWorkflowSampleSize: layerBusinessWorkflow.sampleSize,
      businessWorkflowEvidenceRefs: layerBusinessWorkflow.evidenceRefs,
      dataAgentAnalyticalCoverage: layerDataAgentAnalytical.coverage,
      dataAgentAnalyticalSampleSize: layerDataAgentAnalytical.sampleSize,
      dataAgentAnalyticalEvidenceRefs: layerDataAgentAnalytical.evidenceRefs,
      embodiedAgentCoverage: layerEmbodiedAgent.coverage,
      embodiedAgentSampleSize: layerEmbodiedAgent.sampleSize,
      embodiedAgentEvidenceRefs: layerEmbodiedAgent.evidenceRefs,
      embodiedAgentMissingSignals: layerEmbodiedAgent.missingSignals,
      embodiedAgentTaskTypes: layerEmbodiedAgent.taskTypes,
      embodiedAgentBaselineIds: layerEmbodiedAgent.baselineIds,
      embodiedAgentReportArtifactHashes: layerEmbodiedAgent.reportArtifactHashes,
      evaluatorSuiteCoverage: layerEvaluatorSuite.coverage,
      evaluatorSuiteSampleSize: layerEvaluatorSuite.sampleSize,
      evaluatorSuiteEvidenceRefs: layerEvaluatorSuite.evidenceRefs,
      evaluatorSuiteMissingSignals: layerEvaluatorSuite.missingSignals,
      evaluatorSuiteAssertionTypes: layerEvaluatorSuite.assertionTypes,
      evaluatorSuiteReporterFormats: layerEvaluatorSuite.reporterFormats,
      evaluatorSuiteJudgeNames: layerEvaluatorSuite.judgeNames,
      evaluatorSuiteReportArtifactHashes: layerEvaluatorSuite.reportArtifactHashes,
      pentestBenchmarkCoverage: layerPentestBenchmark.coverage,
      pentestBenchmarkSampleSize: layerPentestBenchmark.sampleSize,
      pentestBenchmarkEvidenceRefs: layerPentestBenchmark.evidenceRefs,
      pentestBenchmarkMissingSignals: layerPentestBenchmark.missingSignals,
      pentestBenchmarkLanguageStacks: layerPentestBenchmark.languageStacks,
      pentestBenchmarkVulnerabilityClasses: layerPentestBenchmark.vulnerabilityClasses,
      pentestBenchmarkDifficultyLevels: layerPentestBenchmark.difficultyLevels,
      pentestBenchmarkSuiteIds: layerPentestBenchmark.benchmarkSuiteIds,
      pentestBenchmarkMetricNames: layerPentestBenchmark.metricNames,
      pentestBenchmarkReportArtifactHashes: layerPentestBenchmark.reportArtifactHashes,
      traceEvaluationCoverage: layerTraceEvaluation.coverage,
      traceEvaluationSampleSize: layerTraceEvaluation.sampleSize,
      traceEvaluationEvidenceRefs: layerTraceEvaluation.evidenceRefs,
      traceEvaluationMissingSignals: layerTraceEvaluation.missingSignals,
      traceEvaluationModelIds: layerTraceEvaluation.modelIds,
      traceEvaluationAgentParameterKeys: layerTraceEvaluation.agentParameterKeys,
      traceEvaluationToolNames: layerTraceEvaluation.toolNames,
      traceEvaluationMetricNames: layerTraceEvaluation.metricNames,
      traceEvaluationCaseSuiteIds: layerTraceEvaluation.caseSuiteIds,
      traceEvaluationBackendModes: layerTraceEvaluation.backendModes,
      traceEvaluationRunPermutationCount: layerTraceEvaluation.runPermutationCount,
      traceEvaluationReportArtifactHashes: layerTraceEvaluation.reportArtifactHashes,
      livingEnvironmentCoverage: layerLivingEnvironment.coverage,
      livingEnvironmentSampleSize: layerLivingEnvironment.sampleSize,
      livingEnvironmentEvidenceRefs: layerLivingEnvironment.evidenceRefs,
      livingEnvironmentMissingSignals: layerLivingEnvironment.missingSignals,
      livingEnvironmentCapabilityNames: layerLivingEnvironment.capabilityNames,
      livingEnvironmentSandboxProviders: layerLivingEnvironment.sandboxProviders,
      livingEnvironmentAgentAdapters: layerLivingEnvironment.agentAdapters,
      livingEnvironmentMetricNames: layerLivingEnvironment.metricNames,
      livingEnvironmentTrialCount: layerLivingEnvironment.trialCount,
      livingEnvironmentReportArtifactHashes: layerLivingEnvironment.reportArtifactHashes,
      mobileAgentCoverage: layerMobileAgent.coverage,
      mobileAgentSampleSize: layerMobileAgent.sampleSize,
      mobileAgentEvidenceRefs: layerMobileAgent.evidenceRefs,
      mobileAgentMissingSignals: layerMobileAgent.missingSignals,
      mobileAgentBenchmarkIds: layerMobileAgent.benchmarkIds,
      mobileAgentEnvironmentIds: layerMobileAgent.environmentIds,
      mobileAgentAppIds: layerMobileAgent.appIds,
      mobileAgentApiCatalogIds: layerMobileAgent.apiCatalogIds,
      mobileAgentUiTraceIds: layerMobileAgent.uiTraceIds,
      mobileAgentTaskSetIds: layerMobileAgent.taskSetIds,
      mobileAgentTaskComplexityGroups: layerMobileAgent.taskComplexityGroups,
      mobileAgentCheckpointMetricNames: layerMobileAgent.checkpointMetricNames,
      mobileAgentLicenseBoundaryRefs: layerMobileAgent.licenseBoundaryRefs,
      mobileAgentTrialCount: layerMobileAgent.trialCount,
      mobileAgentReportArtifactHashes: layerMobileAgent.reportArtifactHashes,
      personaAgentCoverage: layerPersonaAgent.coverage,
      personaAgentSampleSize: layerPersonaAgent.sampleSize,
      personaAgentEvidenceRefs: layerPersonaAgent.evidenceRefs,
      personaAgentMissingSignals: layerPersonaAgent.missingSignals,
      personaAgentPersonaIds: layerPersonaAgent.personaIds,
      personaAgentEnvironmentIds: layerPersonaAgent.environmentIds,
      personaAgentQuestionSetIds: layerPersonaAgent.questionSetIds,
      personaAgentModelIds: layerPersonaAgent.modelIds,
      personaAgentProviderIds: layerPersonaAgent.providerIds,
      personaAgentMetricNames: layerPersonaAgent.metricNames,
      personaAgentQuestionCount: layerPersonaAgent.questionCount,
      personaAgentReportArtifactHashes: layerPersonaAgent.reportArtifactHashes,
      scientificLiteratureCoverage: layerScientificLiterature.coverage,
      scientificLiteratureSampleSize: layerScientificLiterature.sampleSize,
      scientificLiteratureEvidenceRefs: layerScientificLiterature.evidenceRefs,
      scientificLiteratureMissingSignals: layerScientificLiterature.missingSignals,
      scientificLiteratureBenchmarkIds: layerScientificLiterature.benchmarkIds,
      scientificLiteratureTaskTypes: layerScientificLiterature.taskTypes,
      scientificLiteratureDatasetIds: layerScientificLiterature.datasetIds,
      scientificLiteratureSearchBackendIds: layerScientificLiterature.searchBackendIds,
      scientificLiteratureToolIds: layerScientificLiterature.toolIds,
      scientificLiteratureMetricNames: layerScientificLiterature.metricNames,
      scientificLiteratureTaskCount: layerScientificLiterature.taskCount,
      scientificLiteratureReportArtifactHashes: layerScientificLiterature.reportArtifactHashes,
      bioinformaticsAgentCoverage: layerBioinformaticsAgent.coverage,
      bioinformaticsAgentSampleSize: layerBioinformaticsAgent.sampleSize,
      bioinformaticsAgentEvidenceRefs: layerBioinformaticsAgent.evidenceRefs,
      bioinformaticsAgentMissingSignals: layerBioinformaticsAgent.missingSignals,
      bioinformaticsAgentBenchmarkIds: layerBioinformaticsAgent.benchmarkIds,
      bioinformaticsAgentTaskTypes: layerBioinformaticsAgent.taskTypes,
      bioinformaticsAgentDatasetIds: layerBioinformaticsAgent.datasetIds,
      bioinformaticsAgentWorkflowIds: layerBioinformaticsAgent.workflowIds,
      bioinformaticsAgentToolNames: layerBioinformaticsAgent.toolNames,
      bioinformaticsAgentMetricNames: layerBioinformaticsAgent.metricNames,
      bioinformaticsAgentPerturbationIds: layerBioinformaticsAgent.perturbationIds,
      bioinformaticsAgentPrivacyBoundaryRefs: layerBioinformaticsAgent.privacyBoundaryRefs,
      bioinformaticsAgentTaskCount: layerBioinformaticsAgent.taskCount,
      bioinformaticsAgentReportArtifactHashes: layerBioinformaticsAgent.reportArtifactHashes,
      mirageDrugRepositioningCoverage: layerMirageDrugRepositioning.coverage,
      mirageDrugRepositioningSampleSize: layerMirageDrugRepositioning.sampleSize,
      mirageDrugRepositioningEvidenceRefs: layerMirageDrugRepositioning.evidenceRefs,
      mirageDrugRepositioningMissingSignals: layerMirageDrugRepositioning.missingSignals,
      mirageDrugRepositioningBenchmarkIds: layerMirageDrugRepositioning.benchmarkIds,
      mirageDrugRepositioningDatasetIds: layerMirageDrugRepositioning.datasetIds,
      mirageDrugRepositioningSplitIds: layerMirageDrugRepositioning.splitIds,
      mirageDrugRepositioningMappingIds: layerMirageDrugRepositioning.mappingIds,
      mirageDrugRepositioningFeatureSetIds: layerMirageDrugRepositioning.featureSetIds,
      mirageDrugRepositioningSimilarityMatrixIds: layerMirageDrugRepositioning.similarityMatrixIds,
      mirageDrugRepositioningNegativeSamplingIds: layerMirageDrugRepositioning.negativeSamplingIds,
      mirageDrugRepositioningClassifierConfigIds: layerMirageDrugRepositioning.classifierConfigIds,
      mirageDrugRepositioningFeatureSelectionReportIds: layerMirageDrugRepositioning.featureSelectionReportIds,
      mirageDrugRepositioningScoreCalculationIds: layerMirageDrugRepositioning.scoreCalculationIds,
      mirageDrugRepositioningCaseStudyIds: layerMirageDrugRepositioning.caseStudyIds,
      mirageDrugRepositioningMetricNames: layerMirageDrugRepositioning.metricNames,
      mirageDrugRepositioningDrugCount: layerMirageDrugRepositioning.drugCount,
      mirageDrugRepositioningDiseaseCount: layerMirageDrugRepositioning.diseaseCount,
      mirageDrugRepositioningMappingCount: layerMirageDrugRepositioning.mappingCount,
      mirageDrugRepositioningFeatureSetCount: layerMirageDrugRepositioning.featureSetCount,
      mirageDrugRepositioningSimilarityMatrixCount: layerMirageDrugRepositioning.similarityMatrixCount,
      mirageDrugRepositioningReportArtifactHashes: layerMirageDrugRepositioning.reportArtifactHashes,
      networkTroubleshootingCoverage: layerNetworkTroubleshooting.coverage,
      networkTroubleshootingSampleSize: layerNetworkTroubleshooting.sampleSize,
      networkTroubleshootingEvidenceRefs: layerNetworkTroubleshooting.evidenceRefs,
      networkTroubleshootingMissingSignals: layerNetworkTroubleshooting.missingSignals,
      networkTroubleshootingBenchmarkIds: layerNetworkTroubleshooting.benchmarkIds,
      networkTroubleshootingScenarioIds: layerNetworkTroubleshooting.scenarioIds,
      networkTroubleshootingTopologyTiers: layerNetworkTroubleshooting.topologyTiers,
      networkTroubleshootingIssueTypes: layerNetworkTroubleshooting.issueTypes,
      networkTroubleshootingAgentIds: layerNetworkTroubleshooting.agentIds,
      networkTroubleshootingToolNames: layerNetworkTroubleshooting.toolNames,
      networkTroubleshootingMetricNames: layerNetworkTroubleshooting.metricNames,
      networkTroubleshootingIncidentCount: layerNetworkTroubleshooting.incidentCount,
      networkTroubleshootingReportArtifactHashes: layerNetworkTroubleshooting.reportArtifactHashes,
      inferenceOptimizationCoverage: layerInferenceOptimization.coverage,
      inferenceOptimizationSampleSize: layerInferenceOptimization.sampleSize,
      inferenceOptimizationEvidenceRefs: layerInferenceOptimization.evidenceRefs,
      inferenceOptimizationMissingSignals: layerInferenceOptimization.missingSignals,
      inferenceOptimizationBenchmarkIds: layerInferenceOptimization.benchmarkIds,
      inferenceOptimizationScenarioIds: layerInferenceOptimization.scenarioIds,
      inferenceOptimizationHardwareProfileIds: layerInferenceOptimization.hardwareProfileIds,
      inferenceOptimizationBackendIds: layerInferenceOptimization.backendIds,
      inferenceOptimizationSearchSpaceIds: layerInferenceOptimization.searchSpaceIds,
      inferenceOptimizationGateIds: layerInferenceOptimization.gateIds,
      inferenceOptimizationAgentIds: layerInferenceOptimization.agentIds,
      inferenceOptimizationMetricNames: layerInferenceOptimization.metricNames,
      inferenceOptimizationRunCount: layerInferenceOptimization.runCount,
      inferenceOptimizationReportArtifactHashes: layerInferenceOptimization.reportArtifactHashes,
      javaCodingAgentCoverage: layerJavaCodingAgent.coverage,
      javaCodingAgentSampleSize: layerJavaCodingAgent.sampleSize,
      javaCodingAgentEvidenceRefs: layerJavaCodingAgent.evidenceRefs,
      javaCodingAgentMissingSignals: layerJavaCodingAgent.missingSignals,
      javaCodingAgentBenchmarkIds: layerJavaCodingAgent.benchmarkIds,
      javaCodingAgentTaskIds: layerJavaCodingAgent.taskIds,
      javaCodingAgentTaskTypes: layerJavaCodingAgent.taskTypes,
      javaCodingAgentJavaProjectIds: layerJavaCodingAgent.javaProjectIds,
      javaCodingAgentSandboxIds: layerJavaCodingAgent.sandboxIds,
      javaCodingAgentAgentConfigIds: layerJavaCodingAgent.agentConfigIds,
      javaCodingAgentJudgeTierIds: layerJavaCodingAgent.judgeTierIds,
      javaCodingAgentCheckTypes: layerJavaCodingAgent.checkTypes,
      javaCodingAgentMetricNames: layerJavaCodingAgent.metricNames,
      javaCodingAgentTrialCount: layerJavaCodingAgent.trialCount,
      javaCodingAgentReportArtifactHashes: layerJavaCodingAgent.reportArtifactHashes,
      webEvalDatasetCoverage: layerWebEvalDataset.coverage,
      webEvalDatasetSampleSize: layerWebEvalDataset.sampleSize,
      webEvalDatasetEvidenceRefs: layerWebEvalDataset.evidenceRefs,
      webEvalDatasetMissingSignals: layerWebEvalDataset.missingSignals,
      webEvalDatasetBenchmarkIds: layerWebEvalDataset.benchmarkIds,
      webEvalDatasetRepositoryRefs: layerWebEvalDataset.repositoryRefs,
      webEvalDatasetSubjectIds: layerWebEvalDataset.subjectIds,
      webEvalDatasetQuerySetIds: layerWebEvalDataset.querySetIds,
      webEvalDatasetSearchProviderIds: layerWebEvalDataset.searchProviderIds,
      webEvalDatasetDocumentSetIds: layerWebEvalDataset.documentSetIds,
      webEvalDatasetFilterPolicyIds: layerWebEvalDataset.filterPolicyIds,
      webEvalDatasetQaGenerationIds: layerWebEvalDataset.qaGenerationIds,
      webEvalDatasetReferenceAnswerSetIds: layerWebEvalDataset.referenceAnswerSetIds,
      webEvalDatasetExportIds: layerWebEvalDataset.datasetExportIds,
      webEvalDatasetOutputTargets: layerWebEvalDataset.outputTargets,
      webEvalDatasetMetricNames: layerWebEvalDataset.metricNames,
      webEvalDatasetQuestionCount: layerWebEvalDataset.questionCount,
      webEvalDatasetDocumentCount: layerWebEvalDataset.documentCount,
      webEvalDatasetProviderDiversityCount: layerWebEvalDataset.providerDiversityCount,
      webEvalDatasetFreshnessHours: layerWebEvalDataset.freshnessHours,
      webEvalDatasetSourceCoverage: layerWebEvalDataset.sourceCoverage,
      webEvalDatasetAnswerGrounding: layerWebEvalDataset.answerGrounding,
      webEvalDatasetReportArtifactHashes: layerWebEvalDataset.reportArtifactHashes,
      parallelResearchSkillCoverage: layerParallelResearchSkill.coverage,
      parallelResearchSkillSampleSize: layerParallelResearchSkill.sampleSize,
      parallelResearchSkillEvidenceRefs: layerParallelResearchSkill.evidenceRefs,
      parallelResearchSkillMissingSignals: layerParallelResearchSkill.missingSignals,
      parallelResearchSkillRepositoryRefs: layerParallelResearchSkill.repositoryRefs,
      parallelResearchSkillLicenseRefs: layerParallelResearchSkill.licenseRefs,
      parallelResearchSkillManifestIds: layerParallelResearchSkill.skillManifestIds,
      parallelResearchSkillApiSurfaceIds: layerParallelResearchSkill.apiSurfaceIds,
      parallelResearchSkillSearchModeIds: layerParallelResearchSkill.searchModeIds,
      parallelResearchSkillProcessorTiers: layerParallelResearchSkill.processorTiers,
      parallelResearchSkillSecurityBoundaryRefs: layerParallelResearchSkill.securityBoundaryRefs,
      parallelResearchSkillDependencyLockIds: layerParallelResearchSkill.dependencyLockIds,
      parallelResearchSkillMetricNames: layerParallelResearchSkill.metricNames,
      parallelResearchSkillCitationCoverage0to1: layerParallelResearchSkill.citationCoverage0to1,
      parallelResearchSkillSourcePolicyCoverage0to1: layerParallelResearchSkill.sourcePolicyCoverage0to1,
      parallelResearchSkillBatchTaskLimit: layerParallelResearchSkill.batchTaskLimit,
      parallelResearchSkillMonitoringCoverage0to1: layerParallelResearchSkill.monitoringCoverage0to1,
      parallelResearchSkillReportArtifactHashes: layerParallelResearchSkill.reportArtifactHashes,
      resumeRagEvaluatorCoverage: layerResumeRagEvaluator.coverage,
      resumeRagEvaluatorSampleSize: layerResumeRagEvaluator.sampleSize,
      resumeRagEvaluatorEvidenceRefs: layerResumeRagEvaluator.evidenceRefs,
      resumeRagEvaluatorMissingSignals: layerResumeRagEvaluator.missingSignals,
      resumeRagEvaluatorRepositoryRefs: layerResumeRagEvaluator.repositoryRefs,
      resumeRagEvaluatorLicenseRefs: layerResumeRagEvaluator.licenseRefs,
      resumeRagEvaluatorResumeInputFormats: layerResumeRagEvaluator.resumeInputFormats,
      resumeRagEvaluatorRagStrategyIds: layerResumeRagEvaluator.ragStrategyIds,
      resumeRagEvaluatorQueryExpansionIds: layerResumeRagEvaluator.queryExpansionIds,
      resumeRagEvaluatorRetrievalKMin: layerResumeRagEvaluator.retrievalKMin,
      resumeRagEvaluatorRetrievalKMax: layerResumeRagEvaluator.retrievalKMax,
      resumeRagEvaluatorVectorStoreIds: layerResumeRagEvaluator.vectorStoreIds,
      resumeRagEvaluatorOllamaModelIds: layerResumeRagEvaluator.ollamaModelIds,
      resumeRagEvaluatorEmbeddingModelIds: layerResumeRagEvaluator.embeddingModelIds,
      resumeRagEvaluatorEvaluationEndpointIds: layerResumeRagEvaluator.evaluationEndpointIds,
      resumeRagEvaluatorCandidateRatingScale: layerResumeRagEvaluator.candidateRatingScale,
      resumeRagEvaluatorBatchModeIds: layerResumeRagEvaluator.batchModeIds,
      resumeRagEvaluatorPrivacyBoundaryRefs: layerResumeRagEvaluator.privacyBoundaryRefs,
      resumeRagEvaluatorDependencyLockIds: layerResumeRagEvaluator.dependencyLockIds,
      resumeRagEvaluatorMetricNames: layerResumeRagEvaluator.metricNames,
      resumeRagEvaluatorParserCoverage0to1: layerResumeRagEvaluator.parserCoverage0to1,
      resumeRagEvaluatorEvaluationGrounding0to1: layerResumeRagEvaluator.evaluationGrounding0to1,
      resumeRagEvaluatorReportArtifactHashes: layerResumeRagEvaluator.reportArtifactHashes,
      chipBenchmarkCoverage: layerChipBenchmark.coverage,
      chipBenchmarkSampleSize: layerChipBenchmark.sampleSize,
      chipBenchmarkEvidenceRefs: layerChipBenchmark.evidenceRefs,
      chipBenchmarkMissingSignals: layerChipBenchmark.missingSignals,
      chipBenchmarkRepositoryRefs: layerChipBenchmark.repositoryRefs,
      chipBenchmarkLicenseRefs: layerChipBenchmark.licenseRefs,
      chipBenchmarkBenchmarkIds: layerChipBenchmark.benchmarkIds,
      chipBenchmarkHardwareProfileIds: layerChipBenchmark.hardwareProfileIds,
      chipBenchmarkModelFamilyIds: layerChipBenchmark.modelFamilyIds,
      chipBenchmarkPrecisionModeIds: layerChipBenchmark.precisionModeIds,
      chipBenchmarkEnvironmentIds: layerChipBenchmark.environmentIds,
      chipBenchmarkRunnerScriptIds: layerChipBenchmark.runnerScriptIds,
      chipBenchmarkServingBackendIds: layerChipBenchmark.servingBackendIds,
      chipBenchmarkDatasetIds: layerChipBenchmark.datasetIds,
      chipBenchmarkFrontendDatasetIds: layerChipBenchmark.frontendDatasetIds,
      chipBenchmarkPricingRefs: layerChipBenchmark.pricingRefs,
      chipBenchmarkMetricNames: layerChipBenchmark.metricNames,
      chipBenchmarkRegressionThresholdIds: layerChipBenchmark.regressionThresholdIds,
      chipBenchmarkResultRowCount: layerChipBenchmark.resultRowCount,
      chipBenchmarkThroughputCoverage0to1: layerChipBenchmark.throughputCoverage0to1,
      chipBenchmarkLatencyCoverage0to1: layerChipBenchmark.latencyCoverage0to1,
      chipBenchmarkCostCoverage0to1: layerChipBenchmark.costCoverage0to1,
      chipBenchmarkReportArtifactHashes: layerChipBenchmark.reportArtifactHashes,
      hermesBenchCoverage: layerHermesBench.coverage,
      hermesBenchSampleSize: layerHermesBench.sampleSize,
      hermesBenchEvidenceRefs: layerHermesBench.evidenceRefs,
      hermesBenchMissingSignals: layerHermesBench.missingSignals,
      hermesBenchRepositoryRefs: layerHermesBench.repositoryRefs,
      hermesBenchLicenseRefs: layerHermesBench.licenseRefs,
      hermesBenchBranchRefs: layerHermesBench.branchRefs,
      hermesBenchCommitRefs: layerHermesBench.commitRefs,
      hermesBenchTreeRefs: layerHermesBench.treeRefs,
      hermesBenchReadmeBlobRefs: layerHermesBench.readmeBlobRefs,
      hermesBenchBuildSpecRefs: layerHermesBench.buildSpecRefs,
      hermesBenchBackendTreeRefs: layerHermesBench.backendTreeRefs,
      hermesBenchFrontendTreeRefs: layerHermesBench.frontendTreeRefs,
      hermesBenchRunnerIds: layerHermesBench.runnerIds,
      hermesBenchJudgeIds: layerHermesBench.judgeIds,
      hermesBenchTaskRegistryIds: layerHermesBench.taskRegistryIds,
      hermesBenchServerConfigIds: layerHermesBench.serverConfigIds,
      hermesBenchAdapterIds: layerHermesBench.adapterIds,
      hermesBenchResultSchemaIds: layerHermesBench.resultSchemaIds,
      hermesBenchFrontendComponentIds: layerHermesBench.frontendComponentIds,
      hermesBenchBackendTestIds: layerHermesBench.backendTestIds,
      hermesBenchFrontendTestIds: layerHermesBench.frontendTestIds,
      hermesBenchDockerRuntimeIds: layerHermesBench.dockerRuntimeIds,
      hermesBenchMetricNames: layerHermesBench.metricNames,
      hermesBenchTaskCount: layerHermesBench.taskCount,
      hermesBenchAdapterCount: layerHermesBench.adapterCount,
      hermesBenchBackendTestCount: layerHermesBench.backendTestCount,
      hermesBenchFrontendTestCount: layerHermesBench.frontendTestCount,
      hermesBenchJudgeAgreement0to1: layerHermesBench.judgeAgreement0to1,
      hermesBenchRegressionPassRate0to1: layerHermesBench.regressionPassRate0to1,
      hermesBenchReportArtifactHashes: layerHermesBench.reportArtifactHashes,
      cooperBenchCoverage: layerCooperBench.coverage,
      cooperBenchSampleSize: layerCooperBench.sampleSize,
      cooperBenchEvidenceRefs: layerCooperBench.evidenceRefs,
      cooperBenchMissingSignals: layerCooperBench.missingSignals,
      cooperBenchRepositoryRefs: layerCooperBench.repositoryRefs,
      cooperBenchLicenseRefs: layerCooperBench.licenseRefs,
      cooperBenchReleaseRefs: layerCooperBench.releaseRefs,
      cooperBenchBranchRefs: layerCooperBench.branchRefs,
      cooperBenchCommitRefs: layerCooperBench.commitRefs,
      cooperBenchTreeRefs: layerCooperBench.treeRefs,
      cooperBenchReadmeBlobRefs: layerCooperBench.readmeBlobRefs,
      cooperBenchChangelogRefs: layerCooperBench.changelogRefs,
      cooperBenchDatasetTreeRefs: layerCooperBench.datasetTreeRefs,
      cooperBenchDatasetReadmeRefs: layerCooperBench.datasetReadmeRefs,
      cooperBenchRunnerIds: layerCooperBench.runnerIds,
      cooperBenchEvalBackendIds: layerCooperBench.evalBackendIds,
      cooperBenchTeamHarnessIds: layerCooperBench.teamHarnessIds,
      cooperBenchAgentAdapterIds: layerCooperBench.agentAdapterIds,
      cooperBenchCiWorkflowIds: layerCooperBench.ciWorkflowIds,
      cooperBenchPackageLockRefs: layerCooperBench.packageLockRefs,
      cooperBenchReportPublicationRefs: layerCooperBench.reportPublicationRefs,
      cooperBenchMetricNames: layerCooperBench.metricNames,
      cooperBenchTaskCount: layerCooperBench.taskCount,
      cooperBenchFeatureCount: layerCooperBench.featureCount,
      cooperBenchAgentAdapterCount: layerCooperBench.agentAdapterCount,
      cooperBenchTestCount: layerCooperBench.testCount,
      cooperBenchCooperationScore0to1: layerCooperBench.cooperationScore0to1,
      cooperBenchConflictResolutionRate0to1: layerCooperBench.conflictResolutionRate0to1,
      cooperBenchRegressionPassRate0to1: layerCooperBench.regressionPassRate0to1,
      cooperBenchReportArtifactHashes: layerCooperBench.reportArtifactHashes,
      coderCupCoverage: layerCoderCup.coverage,
      coderCupSampleSize: layerCoderCup.sampleSize,
      coderCupEvidenceRefs: layerCoderCup.evidenceRefs,
      coderCupMissingSignals: layerCoderCup.missingSignals,
      coderCupRepositoryRefs: layerCoderCup.repositoryRefs,
      coderCupLicenseRefs: layerCoderCup.licenseRefs,
      coderCupHomepageRefs: layerCoderCup.homepageRefs,
      coderCupBranchRefs: layerCoderCup.branchRefs,
      coderCupCommitRefs: layerCoderCup.commitRefs,
      coderCupTreeRefs: layerCoderCup.treeRefs,
      coderCupReadmeBlobRefs: layerCoderCup.readmeBlobRefs,
      coderCupContributingRefs: layerCoderCup.contributingRefs,
      coderCupCiWorkflowIds: layerCoderCup.ciWorkflowIds,
      coderCupPackageManifestRefs: layerCoderCup.packageManifestRefs,
      coderCupPackageLockRefs: layerCoderCup.packageLockRefs,
      coderCupTaskSpecRefs: layerCoderCup.taskSpecRefs,
      coderCupTestSuiteRefs: layerCoderCup.testSuiteRefs,
      coderCupSuiteIndexRefs: layerCoderCup.suiteIndexRefs,
      coderCupRunnerIds: layerCoderCup.runnerIds,
      coderCupRunnerContractRefs: layerCoderCup.runnerContractRefs,
      coderCupScoreLedgerRefs: layerCoderCup.scoreLedgerRefs,
      coderCupLiveArtifactRefs: layerCoderCup.liveArtifactRefs,
      coderCupMethodologyRefs: layerCoderCup.methodologyRefs,
      coderCupReferenceRefs: layerCoderCup.referenceRefs,
      coderCupCostMethodologyRefs: layerCoderCup.costMethodologyRefs,
      coderCupPublicFixtureRefs: layerCoderCup.publicFixtureRefs,
      coderCupMetricNames: layerCoderCup.metricNames,
      coderCupPhaseCount: layerCoderCup.phaseCount,
      coderCupTestPlanCount: layerCoderCup.testPlanCount,
      coderCupRunnerCount: layerCoderCup.runnerCount,
      coderCupScoreLedgerCount: layerCoderCup.scoreLedgerCount,
      coderCupLiveSurfaceCount: layerCoderCup.liveSurfaceCount,
      coderCupInterRaterAgreement0to1: layerCoderCup.interRaterAgreement0to1,
      coderCupTestRetestReliability0to1: layerCoderCup.testRetestReliability0to1,
      coderCupRegressionPassRate0to1: layerCoderCup.regressionPassRate0to1,
      coderCupReportArtifactHashes: layerCoderCup.reportArtifactHashes,
      agenticGraphRagCoverage: layerAgenticGraphRag.coverage,
      agenticGraphRagSampleSize: layerAgenticGraphRag.sampleSize,
      agenticGraphRagEvidenceRefs: layerAgenticGraphRag.evidenceRefs,
      agenticGraphRagMissingSignals: layerAgenticGraphRag.missingSignals,
      agenticGraphRagRepositoryRefs: layerAgenticGraphRag.repositoryRefs,
      agenticGraphRagLicenseRefs: layerAgenticGraphRag.licenseRefs,
      agenticGraphRagBranchRefs: layerAgenticGraphRag.branchRefs,
      agenticGraphRagCommitRefs: layerAgenticGraphRag.commitRefs,
      agenticGraphRagTreeRefs: layerAgenticGraphRag.treeRefs,
      agenticGraphRagReadmeBlobRefs: layerAgenticGraphRag.readmeBlobRefs,
      agenticGraphRagGraphWorkflowIds: layerAgenticGraphRag.graphWorkflowIds,
      agenticGraphRagOrchestratorIds: layerAgenticGraphRag.orchestratorIds,
      agenticGraphRagRagPipelineIds: layerAgenticGraphRag.ragPipelineIds,
      agenticGraphRagDatabaseIds: layerAgenticGraphRag.databaseIds,
      agenticGraphRagVectorStoreIds: layerAgenticGraphRag.vectorStoreIds,
      agenticGraphRagEvaluationIds: layerAgenticGraphRag.evaluationIds,
      agenticGraphRagExperimentTrackerIds: layerAgenticGraphRag.experimentTrackerIds,
      agenticGraphRagUiComponentIds: layerAgenticGraphRag.uiComponentIds,
      agenticGraphRagDependencyLockRefs: layerAgenticGraphRag.dependencyLockRefs,
      agenticGraphRagMetricNames: layerAgenticGraphRag.metricNames,
      agenticGraphRagGraphNodeCount: layerAgenticGraphRag.graphNodeCount,
      agenticGraphRagGraphEdgeCount: layerAgenticGraphRag.graphEdgeCount,
      agenticGraphRagEvaluationMetricCount: layerAgenticGraphRag.evaluationMetricCount,
      agenticGraphRagExperimentCount: layerAgenticGraphRag.experimentCount,
      agenticGraphRagRetrievalGroundingScore0to1: layerAgenticGraphRag.retrievalGroundingScore0to1,
      agenticGraphRagRegressionPassRate0to1: layerAgenticGraphRag.regressionPassRate0to1,
      agenticGraphRagReportArtifactHashes: layerAgenticGraphRag.reportArtifactHashes,
      agentScenarioTestCoverage: layerAgentScenarioTest.coverage,
      agentScenarioTestSampleSize: layerAgentScenarioTest.sampleSize,
      agentScenarioTestEvidenceRefs: layerAgentScenarioTest.evidenceRefs,
      agentScenarioTestMissingSignals: layerAgentScenarioTest.missingSignals,
      agentScenarioTestBenchmarkIds: layerAgentScenarioTest.benchmarkIds,
      agentScenarioTestRepositoryRefs: layerAgentScenarioTest.repositoryRefs,
      agentScenarioTestLicenseRefs: layerAgentScenarioTest.licenseRefs,
      agentScenarioTestScenarioIds: layerAgentScenarioTest.scenarioIds,
      agentScenarioTestPersonaIds: layerAgentScenarioTest.personaIds,
      agentScenarioTestGoalIds: layerAgentScenarioTest.goalIds,
      agentScenarioTestKnowledgeSetIds: layerAgentScenarioTest.knowledgeSetIds,
      agentScenarioTestToolMockIds: layerAgentScenarioTest.toolMockIds,
      agentScenarioTestTrajectoryAssertionIds: layerAgentScenarioTest.trajectoryAssertionIds,
      agentScenarioTestJudgeIds: layerAgentScenarioTest.judgeIds,
      agentScenarioTestMetricNames: layerAgentScenarioTest.metricNames,
      agentScenarioTestReporterFormats: layerAgentScenarioTest.reporterFormats,
      agentScenarioTestAgentIds: layerAgentScenarioTest.agentIds,
      agentScenarioTestComparisonIds: layerAgentScenarioTest.comparisonIds,
      agentScenarioTestScenarioCount: layerAgentScenarioTest.scenarioCount,
      agentScenarioTestTurnCount: layerAgentScenarioTest.turnCount,
      agentScenarioTestToolCallCount: layerAgentScenarioTest.toolCallCount,
      agentScenarioTestReportArtifactHashes: layerAgentScenarioTest.reportArtifactHashes,
      openCodeLabCoverage: layerOpenCodeLab.coverage,
      openCodeLabSampleSize: layerOpenCodeLab.sampleSize,
      openCodeLabEvidenceRefs: layerOpenCodeLab.evidenceRefs,
      openCodeLabMissingSignals: layerOpenCodeLab.missingSignals,
      openCodeLabBenchmarkIds: layerOpenCodeLab.benchmarkIds,
      openCodeLabRepositoryRefs: layerOpenCodeLab.repositoryRefs,
      openCodeLabAgentContextIds: layerOpenCodeLab.agentContextIds,
      openCodeLabPromptVariantIds: layerOpenCodeLab.promptVariantIds,
      openCodeLabToolDescriptionIds: layerOpenCodeLab.toolDescriptionIds,
      openCodeLabPolicyIds: layerOpenCodeLab.policyIds,
      openCodeLabRunTraceIds: layerOpenCodeLab.runTraceIds,
      openCodeLabForkIds: layerOpenCodeLab.forkIds,
      openCodeLabModelIds: layerOpenCodeLab.modelIds,
      openCodeLabGroundTruthIds: layerOpenCodeLab.groundTruthIds,
      openCodeLabMetricNames: layerOpenCodeLab.metricNames,
      openCodeLabReporterFormats: layerOpenCodeLab.reporterFormats,
      openCodeLabResultArtifactIds: layerOpenCodeLab.resultArtifactIds,
      openCodeLabRunCount: layerOpenCodeLab.runCount,
      openCodeLabForkAgreement0to1: layerOpenCodeLab.forkAgreement0to1,
      openCodeLabModelVariance0to1: layerOpenCodeLab.modelVariance0to1,
      openCodeLabReportArtifactHashes: layerOpenCodeLab.reportArtifactHashes,
      ccPluginEvalCoverage: layerCcPluginEval.coverage,
      ccPluginEvalSampleSize: layerCcPluginEval.sampleSize,
      ccPluginEvalEvidenceRefs: layerCcPluginEval.evidenceRefs,
      ccPluginEvalMissingSignals: layerCcPluginEval.missingSignals,
      ccPluginEvalRepositoryRefs: layerCcPluginEval.repositoryRefs,
      ccPluginEvalLicenseRefs: layerCcPluginEval.licenseRefs,
      ccPluginEvalPluginManifestIds: layerCcPluginEval.pluginManifestIds,
      ccPluginEvalComponentTypes: layerCcPluginEval.componentTypes,
      ccPluginEvalTriggerManifestIds: layerCcPluginEval.triggerManifestIds,
      ccPluginEvalScenarioManifestIds: layerCcPluginEval.scenarioManifestIds,
      ccPluginEvalScenarioTypes: layerCcPluginEval.scenarioTypes,
      ccPluginEvalTranscriptIds: layerCcPluginEval.transcriptIds,
      ccPluginEvalDetectionReportIds: layerCcPluginEval.detectionReportIds,
      ccPluginEvalDetectionModes: layerCcPluginEval.detectionModes,
      ccPluginEvalJudgeIds: layerCcPluginEval.judgeIds,
      ccPluginEvalCalibrationIds: layerCcPluginEval.calibrationIds,
      ccPluginEvalConflictReportIds: layerCcPluginEval.conflictReportIds,
      ccPluginEvalCheckpointStateIds: layerCcPluginEval.checkpointStateIds,
      ccPluginEvalCostEstimateIds: layerCcPluginEval.costEstimateIds,
      ccPluginEvalReporterFormats: layerCcPluginEval.reporterFormats,
      ccPluginEvalResultArtifactIds: layerCcPluginEval.resultArtifactIds,
      ccPluginEvalMetricNames: layerCcPluginEval.metricNames,
      ccPluginEvalTriggerAccuracy0to1: layerCcPluginEval.triggerAccuracy0to1,
      ccPluginEvalFalsePositiveRate0to1: layerCcPluginEval.falsePositiveRate0to1,
      ccPluginEvalFalseNegativeRate0to1: layerCcPluginEval.falseNegativeRate0to1,
      ccPluginEvalComponentCount: layerCcPluginEval.componentCount,
      ccPluginEvalScenarioCount: layerCcPluginEval.scenarioCount,
      ccPluginEvalReportArtifactHashes: layerCcPluginEval.reportArtifactHashes,
      realignSimulationCoverage: layerRealignSimulation.coverage,
      realignSimulationSampleSize: layerRealignSimulation.sampleSize,
      realignSimulationEvidenceRefs: layerRealignSimulation.evidenceRefs,
      realignSimulationMissingSignals: layerRealignSimulation.missingSignals,
      realignSimulationRepositoryRefs: layerRealignSimulation.repositoryRefs,
      realignSimulationLicenseRefs: layerRealignSimulation.licenseRefs,
      realignSimulationConfigIds: layerRealignSimulation.configIds,
      realignSimulationAppIds: layerRealignSimulation.appIds,
      realignSimulationDatasetIds: layerRealignSimulation.datasetIds,
      realignSimulationScenarioIds: layerRealignSimulation.scenarioIds,
      realignSimulationPersonaIds: layerRealignSimulation.personaIds,
      realignSimulationEvaluatorIds: layerRealignSimulation.evaluatorIds,
      realignSimulationTargetIds: layerRealignSimulation.targetIds,
      realignSimulationRunTraceIds: layerRealignSimulation.runTraceIds,
      realignSimulationRepeatedRunTraceIds: layerRealignSimulation.repeatedRunTraceIds,
      realignSimulationJudgeIds: layerRealignSimulation.judgeIds,
      realignSimulationCalibrationIds: layerRealignSimulation.calibrationIds,
      realignSimulationStatisticsReportIds: layerRealignSimulation.statisticsReportIds,
      realignSimulationCiReporterIds: layerRealignSimulation.ciReporterIds,
      realignSimulationReporterFormats: layerRealignSimulation.reporterFormats,
      realignSimulationExperimentIds: layerRealignSimulation.experimentIds,
      realignSimulationResultArtifactIds: layerRealignSimulation.resultArtifactIds,
      realignSimulationMetricNames: layerRealignSimulation.metricNames,
      realignSimulationJudgeAgreement0to1: layerRealignSimulation.judgeAgreement0to1,
      realignSimulationRegressionPassRate0to1: layerRealignSimulation.regressionPassRate0to1,
      realignSimulationScenarioCount: layerRealignSimulation.scenarioCount,
      realignSimulationEvaluatorCount: layerRealignSimulation.evaluatorCount,
      realignSimulationRepeatCount: layerRealignSimulation.repeatCount,
      realignSimulationReportArtifactHashes: layerRealignSimulation.reportArtifactHashes,
      academiClawCoverage: layerAcademiClaw.coverage,
      academiClawSampleSize: layerAcademiClaw.sampleSize,
      academiClawEvidenceRefs: layerAcademiClaw.evidenceRefs,
      academiClawMissingSignals: layerAcademiClaw.missingSignals,
      academiClawRepositoryRefs: layerAcademiClaw.repositoryRefs,
      academiClawLicenseRefs: layerAcademiClaw.licenseRefs,
      academiClawBranchRefs: layerAcademiClaw.branchRefs,
      academiClawCommitRefs: layerAcademiClaw.commitRefs,
      academiClawTreeRefs: layerAcademiClaw.treeRefs,
      academiClawReadmeBlobRefs: layerAcademiClaw.readmeBlobRefs,
      academiClawCitationRefs: layerAcademiClaw.citationRefs,
      academiClawTaskCorpusRefs: layerAcademiClaw.taskCorpusRefs,
      academiClawLanguageIds: layerAcademiClaw.languageIds,
      academiClawWorkspaceQueryIds: layerAcademiClaw.workspaceQueryIds,
      academiClawDockerImageIds: layerAcademiClaw.dockerImageIds,
      academiClawRubricIds: layerAcademiClaw.rubricIds,
      academiClawEvalTaskRunnerIds: layerAcademiClaw.evalTaskRunnerIds,
      academiClawResultManifestIds: layerAcademiClaw.resultManifestIds,
      academiClawConversationTraceIds: layerAcademiClaw.conversationTraceIds,
      academiClawMetaEvalIds: layerAcademiClaw.metaEvalIds,
      academiClawModelIds: layerAcademiClaw.modelIds,
      academiClawMetricNames: layerAcademiClaw.metricNames,
      academiClawCiReporterIds: layerAcademiClaw.ciReporterIds,
      academiClawReporterFormats: layerAcademiClaw.reporterFormats,
      academiClawTaskCount: layerAcademiClaw.taskCount,
      academiClawLanguageCount: layerAcademiClaw.languageCount,
      academiClawRubricCount: layerAcademiClaw.rubricCount,
      academiClawTraceCount: layerAcademiClaw.traceCount,
      academiClawMetaEvalCount: layerAcademiClaw.metaEvalCount,
      academiClawModelCount: layerAcademiClaw.modelCount,
      academiClawRegressionPassRate0to1: layerAcademiClaw.regressionPassRate0to1,
      academiClawReportArtifactHashes: layerAcademiClaw.reportArtifactHashes,
      ragChunkingTechniqueCoverage: layerRagChunkingTechnique.coverage,
      ragChunkingTechniqueSampleSize: layerRagChunkingTechnique.sampleSize,
      ragChunkingTechniqueEvidenceRefs: layerRagChunkingTechnique.evidenceRefs,
      ragChunkingTechniqueMissingSignals: layerRagChunkingTechnique.missingSignals,
      ragChunkingTechniqueRepositoryRefs: layerRagChunkingTechnique.repositoryRefs,
      ragChunkingTechniqueLicenseRefs: layerRagChunkingTechnique.licenseRefs,
      ragChunkingTechniqueBranchRefs: layerRagChunkingTechnique.branchRefs,
      ragChunkingTechniqueCommitRefs: layerRagChunkingTechnique.commitRefs,
      ragChunkingTechniqueTreeRefs: layerRagChunkingTechnique.treeRefs,
      ragChunkingTechniqueReadmeBlobRefs: layerRagChunkingTechnique.readmeBlobRefs,
      ragChunkingTechniquePolicyCorpusRefs: layerRagChunkingTechnique.policyCorpusRefs,
      ragChunkingTechniqueNotebookIds: layerRagChunkingTechnique.notebookIds,
      ragChunkingTechniqueChunkingStrategyIds: layerRagChunkingTechnique.chunkingStrategyIds,
      ragChunkingTechniqueRetrievalPipelineIds: layerRagChunkingTechnique.retrievalPipelineIds,
      ragChunkingTechniqueEmbeddingVectorstoreIds: layerRagChunkingTechnique.embeddingVectorstoreIds,
      ragChunkingTechniqueEvaluationDatasetIds: layerRagChunkingTechnique.evaluationDatasetIds,
      ragChunkingTechniqueMetricNames: layerRagChunkingTechnique.metricNames,
      ragChunkingTechniqueCiReporterIds: layerRagChunkingTechnique.ciReporterIds,
      ragChunkingTechniqueReporterFormats: layerRagChunkingTechnique.reporterFormats,
      ragChunkingTechniquePolicyDocumentCount: layerRagChunkingTechnique.policyDocumentCount,
      ragChunkingTechniqueNotebookCount: layerRagChunkingTechnique.notebookCount,
      ragChunkingTechniqueChunkingStrategyCount: layerRagChunkingTechnique.chunkingStrategyCount,
      ragChunkingTechniqueEvaluationQuestionCount: layerRagChunkingTechnique.evaluationQuestionCount,
      ragChunkingTechniqueMetricCount: layerRagChunkingTechnique.metricCount,
      ragChunkingTechniqueRegressionPassRate0to1: layerRagChunkingTechnique.regressionPassRate0to1,
      ragChunkingTechniqueReportArtifactHashes: layerRagChunkingTechnique.reportArtifactHashes,
      kubernetesOperationalAgentCoverage: layerKubernetesOperationalAgent.coverage,
      kubernetesOperationalAgentSampleSize: layerKubernetesOperationalAgent.sampleSize,
      kubernetesOperationalAgentEvidenceRefs: layerKubernetesOperationalAgent.evidenceRefs,
      kubernetesOperationalAgentMissingSignals: layerKubernetesOperationalAgent.missingSignals,
      kubernetesOperationalAgentRepositoryRefs: layerKubernetesOperationalAgent.repositoryRefs,
      kubernetesOperationalAgentLicenseRefs: layerKubernetesOperationalAgent.licenseRefs,
      kubernetesOperationalAgentReleaseRefs: layerKubernetesOperationalAgent.releaseRefs,
      kubernetesOperationalAgentBranchRefs: layerKubernetesOperationalAgent.branchRefs,
      kubernetesOperationalAgentCommitRefs: layerKubernetesOperationalAgent.commitRefs,
      kubernetesOperationalAgentTreeRefs: layerKubernetesOperationalAgent.treeRefs,
      kubernetesOperationalAgentReadmeBlobRefs: layerKubernetesOperationalAgent.readmeBlobRefs,
      kubernetesOperationalAgentBuildWorkflowRefs: layerKubernetesOperationalAgent.buildWorkflowRefs,
      kubernetesOperationalAgentAgentModuleRefs: layerKubernetesOperationalAgent.agentModuleRefs,
      kubernetesOperationalAgentMcpServerModuleRefs: layerKubernetesOperationalAgent.mcpServerModuleRefs,
      kubernetesOperationalAgentToolModuleRefs: layerKubernetesOperationalAgent.toolModuleRefs,
      kubernetesOperationalAgentToolCategoryIds: layerKubernetesOperationalAgent.toolCategoryIds,
      kubernetesOperationalAgentDiagnosticCapabilityIds: layerKubernetesOperationalAgent.diagnosticCapabilityIds,
      kubernetesOperationalAgentResourceMetricIds: layerKubernetesOperationalAgent.resourceMetricIds,
      kubernetesOperationalAgentLogAnalysisIds: layerKubernetesOperationalAgent.logAnalysisIds,
      kubernetesOperationalAgentMetricNames: layerKubernetesOperationalAgent.metricNames,
      kubernetesOperationalAgentCiReporterIds: layerKubernetesOperationalAgent.ciReporterIds,
      kubernetesOperationalAgentReporterFormats: layerKubernetesOperationalAgent.reporterFormats,
      kubernetesOperationalAgentToolCategoryCount: layerKubernetesOperationalAgent.toolCategoryCount,
      kubernetesOperationalAgentDiagnosticCapabilityCount: layerKubernetesOperationalAgent.diagnosticCapabilityCount,
      kubernetesOperationalAgentResourceMetricCount: layerKubernetesOperationalAgent.resourceMetricCount,
      kubernetesOperationalAgentLogAnalysisCount: layerKubernetesOperationalAgent.logAnalysisCount,
      kubernetesOperationalAgentRegressionPassRate0to1: layerKubernetesOperationalAgent.regressionPassRate0to1,
      kubernetesOperationalAgentReportArtifactHashes: layerKubernetesOperationalAgent.reportArtifactHashes,
      secureVibeBenchCoverage: layerSecureVibeBench.coverage,
      secureVibeBenchSampleSize: layerSecureVibeBench.sampleSize,
      secureVibeBenchEvidenceRefs: layerSecureVibeBench.evidenceRefs,
      secureVibeBenchMissingSignals: layerSecureVibeBench.missingSignals,
      secureVibeBenchRepositoryRefs: layerSecureVibeBench.repositoryRefs,
      secureVibeBenchLicenseRefs: layerSecureVibeBench.licenseRefs,
      secureVibeBenchHomepageRefs: layerSecureVibeBench.homepageRefs,
      secureVibeBenchArxivRefs: layerSecureVibeBench.arxivRefs,
      secureVibeBenchBranchRefs: layerSecureVibeBench.branchRefs,
      secureVibeBenchCommitRefs: layerSecureVibeBench.commitRefs,
      secureVibeBenchTreeRefs: layerSecureVibeBench.treeRefs,
      secureVibeBenchReadmeBlobRefs: layerSecureVibeBench.readmeBlobRefs,
      secureVibeBenchResultsBlobRefs: layerSecureVibeBench.resultsBlobRefs,
      secureVibeBenchDatasetRefs: layerSecureVibeBench.datasetRefs,
      secureVibeBenchFormatExampleRefs: layerSecureVibeBench.formatExampleRefs,
      secureVibeBenchEvaluationRunnerRefs: layerSecureVibeBench.evaluationRunnerRefs,
      secureVibeBenchAgentAdapterIds: layerSecureVibeBench.agentAdapterIds,
      secureVibeBenchVulnerabilityScenarioIds: layerSecureVibeBench.vulnerabilityScenarioIds,
      secureVibeBenchTestScriptIds: layerSecureVibeBench.testScriptIds,
      secureVibeBenchParserUtilityRefs: layerSecureVibeBench.parserUtilityRefs,
      secureVibeBenchPatchDiffUtilityRefs: layerSecureVibeBench.patchDiffUtilityRefs,
      secureVibeBenchMetricNames: layerSecureVibeBench.metricNames,
      secureVibeBenchCiReporterIds: layerSecureVibeBench.ciReporterIds,
      secureVibeBenchReporterFormats: layerSecureVibeBench.reporterFormats,
      secureVibeBenchAgentAdapterCount: layerSecureVibeBench.agentAdapterCount,
      secureVibeBenchScenarioCount: layerSecureVibeBench.scenarioCount,
      secureVibeBenchTestScriptCount: layerSecureVibeBench.testScriptCount,
      secureVibeBenchRegressionPassRate0to1: layerSecureVibeBench.regressionPassRate0to1,
      secureVibeBenchReportArtifactHashes: layerSecureVibeBench.reportArtifactHashes,
      ravigBenchCoverage: layerRavigBench.coverage,
      ravigBenchSampleSize: layerRavigBench.sampleSize,
      ravigBenchEvidenceRefs: layerRavigBench.evidenceRefs,
      ravigBenchMissingSignals: layerRavigBench.missingSignals,
      ravigBenchRepositoryRefs: layerRavigBench.repositoryRefs,
      ravigBenchLicenseRefs: layerRavigBench.licenseRefs,
      ravigBenchBranchRefs: layerRavigBench.branchRefs,
      ravigBenchCommitRefs: layerRavigBench.commitRefs,
      ravigBenchTreeRefs: layerRavigBench.treeRefs,
      ravigBenchReadmeBlobRefs: layerRavigBench.readmeBlobRefs,
      ravigBenchLegalBlobRefs: layerRavigBench.legalBlobRefs,
      ravigBenchEnvironmentRefs: layerRavigBench.environmentRefs,
      ravigBenchConfigurationRefs: layerRavigBench.configurationRefs,
      ravigBenchContentEvaluationRefs: layerRavigBench.contentEvaluationRefs,
      ravigBenchDesignEvaluationRefs: layerRavigBench.designEvaluationRefs,
      ravigBenchExecutionEvaluationRefs: layerRavigBench.executionEvaluationRefs,
      ravigBenchFunctionScoringRefs: layerRavigBench.functionScoringRefs,
      ravigBenchDatasetRefs: layerRavigBench.datasetRefs,
      ravigBenchTestCaseRefs: layerRavigBench.testCaseRefs,
      ravigBenchModelResultRefs: layerRavigBench.modelResultRefs,
      ravigBenchTaxonomyIds: layerRavigBench.taxonomyIds,
      ravigBenchRetrievalContextIds: layerRavigBench.retrievalContextIds,
      ravigBenchMultiModalEvaluatorIds: layerRavigBench.multiModalEvaluatorIds,
      ravigBenchScreenshotEvaluationRefs: layerRavigBench.screenshotEvaluationRefs,
      ravigBenchRunScriptRefs: layerRavigBench.runScriptRefs,
      ravigBenchMetricNames: layerRavigBench.metricNames,
      ravigBenchCiReporterIds: layerRavigBench.ciReporterIds,
      ravigBenchReporterFormats: layerRavigBench.reporterFormats,
      ravigBenchDatasetCaseCount: layerRavigBench.datasetCaseCount,
      ravigBenchVisualDesignCheckCount: layerRavigBench.visualDesignCheckCount,
      ravigBenchEvaluatorCount: layerRavigBench.evaluatorCount,
      ravigBenchValidationPassRate0to1: layerRavigBench.validationPassRate0to1,
      ravigBenchReportArtifactHashes: layerRavigBench.reportArtifactHashes,
      humanStudyBenchCoverage: layerHumanStudyBench.coverage,
      humanStudyBenchSampleSize: layerHumanStudyBench.sampleSize,
      humanStudyBenchEvidenceRefs: layerHumanStudyBench.evidenceRefs,
      humanStudyBenchMissingSignals: layerHumanStudyBench.missingSignals,
      humanStudyBenchRepositoryRefs: layerHumanStudyBench.repositoryRefs,
      humanStudyBenchLicenseRefs: layerHumanStudyBench.licenseRefs,
      humanStudyBenchBranchRefs: layerHumanStudyBench.branchRefs,
      humanStudyBenchCommitRefs: layerHumanStudyBench.commitRefs,
      humanStudyBenchStudyConfigIds: layerHumanStudyBench.studyConfigIds,
      humanStudyBenchBackgroundDatasetIds: layerHumanStudyBench.backgroundDatasetIds,
      humanStudyBenchHumanResponseDatasetIds: layerHumanStudyBench.humanResponseDatasetIds,
      humanStudyBenchAgentResponseDatasetIds: layerHumanStudyBench.agentResponseDatasetIds,
      humanStudyBenchEvaluatorIds: layerHumanStudyBench.evaluatorIds,
      humanStudyBenchMetricNames: layerHumanStudyBench.metricNames,
      humanStudyBenchValidatorIds: layerHumanStudyBench.validatorIds,
      humanStudyBenchScorerIds: layerHumanStudyBench.scorerIds,
      humanStudyBenchStandardizerIds: layerHumanStudyBench.standardizerIds,
      humanStudyBenchReliabilityReportIds: layerHumanStudyBench.reliabilityReportIds,
      humanStudyBenchValidationPipelineIds: layerHumanStudyBench.validationPipelineIds,
      humanStudyBenchResultArtifactIds: layerHumanStudyBench.resultArtifactIds,
      humanStudyBenchCiReporterIds: layerHumanStudyBench.ciReporterIds,
      humanStudyBenchReporterFormats: layerHumanStudyBench.reporterFormats,
      humanStudyBenchStudyCount: layerHumanStudyBench.studyCount,
      humanStudyBenchParticipantCount: layerHumanStudyBench.participantCount,
      humanStudyBenchResponseCount: layerHumanStudyBench.responseCount,
      humanStudyBenchEvaluatorCount: layerHumanStudyBench.evaluatorCount,
      humanStudyBenchInterRaterAgreement0to1: layerHumanStudyBench.interRaterAgreement0to1,
      humanStudyBenchTestRetestReliability0to1: layerHumanStudyBench.testRetestReliability0to1,
      humanStudyBenchValidationPassRate0to1: layerHumanStudyBench.validationPassRate0to1,
      humanStudyBenchReportArtifactHashes: layerHumanStudyBench.reportArtifactHashes,
      legacyBenchCoverage: layerLegacyBench.coverage,
      legacyBenchSampleSize: layerLegacyBench.sampleSize,
      legacyBenchEvidenceRefs: layerLegacyBench.evidenceRefs,
      legacyBenchMissingSignals: layerLegacyBench.missingSignals,
      legacyBenchRepositoryRefs: layerLegacyBench.repositoryRefs,
      legacyBenchLicenseRefs: layerLegacyBench.licenseRefs,
      legacyBenchBranchRefs: layerLegacyBench.branchRefs,
      legacyBenchCommitRefs: layerLegacyBench.commitRefs,
      legacyBenchTreeRefs: layerLegacyBench.treeRefs,
      legacyBenchReadmeBlobRefs: layerLegacyBench.readmeBlobRefs,
      legacyBenchTaskCorpusRefs: layerLegacyBench.taskCorpusRefs,
      legacyBenchLegacyLanguageIds: layerLegacyBench.legacyLanguageIds,
      legacyBenchEnvironmentIds: layerLegacyBench.environmentIds,
      legacyBenchHarnessRunnerIds: layerLegacyBench.harnessRunnerIds,
      legacyBenchAgentTaskIds: layerLegacyBench.agentTaskIds,
      legacyBenchPatchSubmissionIds: layerLegacyBench.patchSubmissionIds,
      legacyBenchTestOracleIds: layerLegacyBench.testOracleIds,
      legacyBenchEvaluatorIds: layerLegacyBench.evaluatorIds,
      legacyBenchMetricNames: layerLegacyBench.metricNames,
      legacyBenchCiReporterIds: layerLegacyBench.ciReporterIds,
      legacyBenchReporterFormats: layerLegacyBench.reporterFormats,
      legacyBenchResultArtifactIds: layerLegacyBench.resultArtifactIds,
      legacyBenchReplayCommandIds: layerLegacyBench.replayCommandIds,
      legacyBenchTaskCount: layerLegacyBench.taskCount,
      legacyBenchLanguageCount: layerLegacyBench.languageCount,
      legacyBenchEnvironmentCount: layerLegacyBench.environmentCount,
      legacyBenchTestOracleCount: layerLegacyBench.testOracleCount,
      legacyBenchEvaluatorCount: layerLegacyBench.evaluatorCount,
      legacyBenchRegressionPassRate0to1: layerLegacyBench.regressionPassRate0to1,
      legacyBenchReplayPassRate0to1: layerLegacyBench.replayPassRate0to1,
      legacyBenchReportArtifactHashes: layerLegacyBench.reportArtifactHashes,
      subtleMemoryCoverage: layerSubtleMemory.coverage,
      subtleMemorySampleSize: layerSubtleMemory.sampleSize,
      subtleMemoryEvidenceRefs: layerSubtleMemory.evidenceRefs,
      subtleMemoryMissingSignals: layerSubtleMemory.missingSignals,
      subtleMemoryRepositoryRefs: layerSubtleMemory.repositoryRefs,
      subtleMemoryLicenseRefs: layerSubtleMemory.licenseRefs,
      subtleMemoryBranchRefs: layerSubtleMemory.branchRefs,
      subtleMemoryCommitRefs: layerSubtleMemory.commitRefs,
      subtleMemoryTreeRefs: layerSubtleMemory.treeRefs,
      subtleMemoryArxivRefs: layerSubtleMemory.arxivRefs,
      subtleMemoryDatasetRefs: layerSubtleMemory.datasetRefs,
      subtleMemoryPersonaIds: layerSubtleMemory.personaIds,
      subtleMemoryBenchInstanceManifestIds: layerSubtleMemory.benchInstanceManifestIds,
      subtleMemoryHistorySessionManifestIds: layerSubtleMemory.historySessionManifestIds,
      subtleMemoryRelationTypes: layerSubtleMemory.relationTypes,
      subtleMemoryConstructionPipelineIds: layerSubtleMemory.constructionPipelineIds,
      subtleMemoryEvaluationStageIds: layerSubtleMemory.evaluationStageIds,
      subtleMemoryAdapterIds: layerSubtleMemory.adapterIds,
      subtleMemoryJudgeIds: layerSubtleMemory.judgeIds,
      subtleMemoryEvaluatorIds: layerSubtleMemory.evaluatorIds,
      subtleMemoryMetricNames: layerSubtleMemory.metricNames,
      subtleMemoryScoreSummaryIds: layerSubtleMemory.scoreSummaryIds,
      subtleMemoryDiagnosticProtocolIds: layerSubtleMemory.diagnosticProtocolIds,
      subtleMemoryCiReporterIds: layerSubtleMemory.ciReporterIds,
      subtleMemoryReporterFormats: layerSubtleMemory.reporterFormats,
      subtleMemoryPersonaCount: layerSubtleMemory.personaCount,
      subtleMemoryBenchInstanceCount: layerSubtleMemory.benchInstanceCount,
      subtleMemoryHistoryCount: layerSubtleMemory.historyCount,
      subtleMemoryMemoryVariantSetCount: layerSubtleMemory.memoryVariantSetCount,
      subtleMemoryRelationTypeCount: layerSubtleMemory.relationTypeCount,
      subtleMemoryEvaluationStageCount: layerSubtleMemory.evaluationStageCount,
      subtleMemoryAdapterCount: layerSubtleMemory.adapterCount,
      subtleMemoryJudgeAgreement0to1: layerSubtleMemory.judgeAgreement0to1,
      subtleMemoryValidationPassRate0to1: layerSubtleMemory.validationPassRate0to1,
      subtleMemoryReportArtifactHashes: layerSubtleMemory.reportArtifactHashes,
      previousObservations: priorReports
        .map((report): ScoreObservation | null => {
          const score = layerScore(report, layer.layerName);
          if (score === null) return null;
          return {
            agentId: report.agentId,
            score,
            timestamp: report.ts,
            runId: report.runId
          } satisfies ScoreObservation;
        })
        .filter((row): row is ScoreObservation => row !== null),
      thresholds
    }));
  }

  const warnings = [
    ...new Set(rows.flatMap((row) => row.warnings.map((warning) => `${row.metricId}: ${warning}`)))
  ];
  const generatedAt = new Date(input.ts).toISOString();
  const evalPack = buildMetricValidationEvalPack({
    agentId: input.agentId,
    runId: input.runId,
    generatedAt,
    rows,
    signedEvidenceRefs: input.signedEvidenceRefs ?? [],
    sourceRefs: input.sourceRefs ?? ["amc:diagnostic-metric-validation"],
    datasetHash: input.datasetHash
  });
  if (!evalPack.replayable) {
    warnings.push("metric validation eval pack is not replayable; signed evidence refs are required for all row evidence refs");
  }
  const failClosed = rows.some((row) => row.status === "fail") || !evalPack.replayable;
  const ciGate = buildMetricValidationCiGate(rows, input.gateMode ?? "ci", evalPack.replayable);

  return {
    generatedAt,
    agentId: input.agentId,
    runId: input.runId,
    thresholdPolicy: thresholds,
    failClosed,
    rows,
    warnings,
    evalPack,
    ciGate
  };
}
