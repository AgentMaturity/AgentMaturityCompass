export { computeMaturityScore, evidenceDecay, improvementVelocity } from "./formalSpec.js";
export type { EvidenceArtifact, DimensionScore, MaturityScore, MaturityLevel } from "./formalSpec.js";

export { testGamingResistance } from "./adversarial.js";
export type { AdversarialTestResult } from "./adversarial.js";

export { collectEvidence } from "./evidenceCollector.js";
export type { CollectedEvidence } from "./evidenceCollector.js";

export { assessProductionReadiness } from "./productionReadiness.js";
export type { ProductionReadinessResult } from "./productionReadiness.js";

export {
  scoreOperationalIndependence,
  scoreOperationalIndependenceFromEvents,
  buildExternalDependencyInventory,
  detectDependencyDrift,
  scoreGracefulDegradation,
  scoreVendorLockInRisk
} from "./operationalIndependence.js";
export type {
  OperationalIndependenceScore,
  ExternalDependencyKind,
  ExternalDependencyInventoryEntry,
  ExternalDependencyInventory,
  DependencyDriftSignal,
  DependencyDriftReport,
  GracefulDegradationScore,
  VendorLockInRiskScore
} from "./operationalIndependence.js";

export { getLeanAMCProfile } from "./leanAMC.js";
export type { LeanAMCProfile } from "./leanAMC.js";

export { getEvidenceCoverageReport } from "./evidenceCoverageGap.js";
export type { EvidenceCoverageReport } from "./evidenceCoverageGap.js";

export { auditVibeCode, auditVibeCodeFiles } from "./vibeCodeAudit.js";
export type { VibeCodeAuditResult, VibeCodeFinding } from "./vibeCodeAudit.js";

export { scoreMcpCompliance, getMcpComplianceGuide, detectMcpPromptInjection } from "./mcpCompliance.js";
export type {
  MCPComplianceResult,
  MCPCapabilityDeclaration,
  MCPSafetyDimensionResult,
  MCPSafetyScorecard,
  MCPPromptInjectionSignal,
  MCPPromptInjectionDetectionResult
} from "./mcpCompliance.js";

export { scoreRAGMaturity } from "./ragMaturity.js";
export type {
  RAGMaturityResult,
  RAGCapabilityProfile,
  RAGMaturityDiagnostics,
  RetrievalQualityDiagnostics,
  MetadataQualityDiagnostics,
  RetrievalDriftDiagnostics,
  HallucinationRiskDiagnostics,
  CitationIntegrityDiagnostics,
  RAGRetrievalEvaluation,
  RAGChunkMetadataSample,
  RAGRetrievalQualitySnapshot,
  RAGOutputEvaluation,
  RAGCitationEvaluation,
} from "./ragMaturity.js";

export { scoreMultiAgentDimension } from "./multiAgentDimension.js";
export type { MultiAgentDimensionScore, MultiAgentProfile } from "./multiAgentDimension.js";

export { scoreDomainPack, getDomainPackQuestions, listDomainPacks } from "./domainPacks.js";
export type { DomainPackResult, DomainPackAssessment } from "./domainPacks.js";

export { computeTrajectory, analyzePopulationRisk } from "./predictiveMaturity.js";
export type { MaturityTrajectory, PopulationRiskReport } from "./predictiveMaturity.js";

export {
  parsePredictionLogMarkdown,
  computeCalibrationScore,
  computeInterRaterReliability,
  computeScoreStability,
  detectLongitudinalDrift,
  analyzePredictionLog,
  trackPredictionLog,
} from "./predictiveValidity.js";
export type {
  ValidityPredictionEntry,
  CalibrationBin as PredictiveCalibrationBin,
  CalibrationScore,
  InterRaterScore,
  InterRaterTargetAgreement,
  InterRaterReliabilityReport,
  ScoreObservation,
  ScoreStabilityReport,
  LongitudinalDriftReport,
  PredictionLogAnalysis,
  PredictionLogTrackingReport,
} from "./predictiveValidity.js";

export { generateFrameworkReport, listSupportedFrameworks } from "./crossFrameworkMapping.js";
export type { FrameworkComplianceReport } from "./crossFrameworkMapping.js";

export { scorePlatformDependency } from "./platformDependency.js";
export type { PlatformDependencyScore, PlatformDependencyProfile } from "./platformDependency.js";

export { verifyAgentClaim, createAgentClaim } from "./crossAgentTrust.js";
export type { AgentIdentityClaim, TrustVerificationResult } from "./crossAgentTrust.js";

export {
  assessMemoryMaturity,
  scoreMemoryDimension,
  verifyMemoryPersistence,
  verifyMemoryHashChain,
  computeMemoryEntryHash,
  detectMemoryPoisoning,
  scoreMemoryContinuity
} from "./memoryMaturity.js";
export type {
  MemoryMaturityProfile,
  MemoryMaturityInput,
  MemoryHashChainEntry,
  MemoryPersistenceProbe,
  MemoryContinuityCheckpoint,
  MemoryPoisoningOptions,
  MemoryPersistenceAssessment,
  MemoryHashChainAssessment,
  MemoryPoisoningAssessment,
  MemoryPoisoningAnomaly,
  MemoryContinuityAssessment
} from "./memoryMaturity.js";

export { assessOversightQuality } from "./humanOversightQuality.js";
export type { OversightQualityProfile } from "./humanOversightQuality.js";

export { checkClaimExpiry, CLAIM_TTL } from "./claimExpiry.js";
export type { ClaimExpiryProfile } from "./claimExpiry.js";

export { captureDAG, scoreDAGGovernance } from "./orchestrationDAG.js";
export type { DAGNode, OrchestrationDAG } from "./orchestrationDAG.js";

export { assessCommunityGovernance } from "./communityGovernance.js";
export type { CommunityGovernanceProfile, GovernanceTarget } from "./communityGovernance.js";

export { trackConfidenceDrift, applyConfidencePenalty } from "./confidenceDrift.js";
export type { ConfidencePrediction, ConfidenceDriftProfile } from "./confidenceDrift.js";

export { classifyAgentVsWorkflow } from "./agentVsWorkflow.js";
export type { AgentClassification, AgentClassificationResult } from "./agentVsWorkflow.js";

export { addLesson, queryLessons, getLearningMaturityScore } from "./lessonLearnedDatabase.js";
export type { Lesson, LessonDatabase } from "./lessonLearnedDatabase.js";

export { assessSimplicity } from "./simplicityScoring.js";
export type { SimplicityProfile } from "./simplicityScoring.js";

export {
  scoreArchitectureTaskFit,
  detectErrorAmplification,
  scoreComplexityTax,
  analyzeFailureModes,
  scoreRedundancy,
  evaluateArchitectureTaskAlignment
} from "./architectureTaskAlignment.js";
export type {
  TaskRiskTier,
  TaskComplexityProfile,
  ArchitectureProfile,
  PipelineStageProfile,
  ArchitectureTaskFitScore,
  ErrorAmplificationHotspot,
  ErrorAmplificationResult,
  ComplexityTaxScore,
  FailureModeRisk,
  FailureModeAnalysisResult,
  RedundancyScore,
  ArchitectureTaskAlignmentInput,
  ArchitectureTaskAlignmentReport
} from "./architectureTaskAlignment.js";

export { assessIdentityContinuity } from "./identityContinuity.js";
export type { IdentityContinuityProfile } from "./identityContinuity.js";

export { assessReputationPortability } from "./reputationPortability.js";
export type { ReputationPortabilityProfile } from "./reputationPortability.js";

// ── Gap-closure modules (2026-02-21) ─────────────────────────────────

export {
  createClaim, promoteClaim, quarantineClaim, isPromotionValid,
  ClaimProvenanceRegistry, CLAIM_TIER_WEIGHTS, CLAIM_TIER_TO_EVIDENCE_KIND,
} from "./claimProvenance.js";
export type { Claim, ClaimTier, ClaimProvenanceStore, PromotionResult } from "./claimProvenance.js";

export { KnowledgeGraph as AMCKnowledgeGraph } from "./knowledgeGraph.js";
export type { KnowledgeNode as AMCKnowledgeNode, KnowledgeEdge, EdgeType, NodeType, ImpactReport, ConflictReport } from "./knowledgeGraph.js";

export {
  detectModelDrift, tagEvidenceWithModel, extractModelFromEvidence,
  buildSnapshot, parseModelVersion,
} from "./modelDrift.js";
export type { ModelVersion, ModelTaggedEvidence, EvidenceSnapshot, DriftSignal, DriftReport } from "./modelDrift.js";

export {
  runSimulation, getBuiltinScenarios, generateSimReport,
} from "./agentSimulator.js";
export type { SimScenario, SimResult as AgentSimResult, SimReport as AgentSimReport, AgentSimConfig, ScenarioCategory, ExpectedBehavior } from "./agentSimulator.js";

// ── New gap-closure modules (2026-02-21 research: HN/OWASP/MITRE/EUAIAct/research) ──

export { scoreBehavioralContractMaturity } from "./behavioralContractMaturity.js";
export type { BehavioralContractResult } from "./behavioralContractMaturity.js";

export { scoreFailSecureGovernance } from "./failSecureGovernance.js";
export type { FailSecureGovernanceResult } from "./failSecureGovernance.js";

export { scoreOutputIntegrityMaturity } from "./outputIntegrityMaturity.js";
export type { OutputIntegrityResult } from "./outputIntegrityMaturity.js";

export { scoreAgentStatePortability } from "./agentStatePortability.js";
export type { AgentStatePortabilityResult } from "./agentStatePortability.js";

export { scoreEUAIActCompliance } from "./euAIActCompliance.js";
export type { EUAIActComplianceResult } from "./euAIActCompliance.js";

export { scoreOWASPLLMCoverage } from "./owaspLLMCoverage.js";
export type { OWASPLLMCoverageResult } from "./owaspLLMCoverage.js";

export { scoreISO42001Coverage, scoreRegulatoryReadiness } from "./regulatoryReadiness.js";
export type { ISO42001CoverageResult, RegulatoryReadinessResult, RegulatoryReadinessInput } from "./regulatoryReadiness.js";

export { scoreSelfKnowledgeMaturity } from "./selfKnowledgeMaturity.js";
export type { SelfKnowledgeMaturityResult } from "./selfKnowledgeMaturity.js";

export { scoreKernelSandboxMaturity } from "./kernelSandboxMaturity.js";
export type { KernelSandboxResult } from "./kernelSandboxMaturity.js";

export { scoreRuntimeIdentityMaturity } from "./runtimeIdentityMaturity.js";
export type { RuntimeIdentityResult } from "./runtimeIdentityMaturity.js";

export {
  scoreAutonomyDuration,
  getDomainRiskProfile,
  listDomainRiskProfiles
} from "./autonomyDuration.js";
export type {
  DomainRiskClass,
  DomainRiskProfile,
  AutonomyDurationSignal,
  AutonomyDurationInput
} from "./autonomyDuration.js";

// ── METR Task Horizon (2026-02-23) ───────────────────────────────────

export {
  scoreTaskHorizon,
  classifyTaskHorizon,
  TASK_HORIZON_BANDS,
} from "./taskHorizon.js";
export type {
  TaskHorizonBand,
  TaskHorizonEvidence,
  TaskHorizonResult,
} from "./taskHorizon.js";

// ── FACTS Factuality Dimensions (2026-02-23) ─────────────────────────

export {
  scoreFactuality,
  scoreParametricFactuality,
  scoreSearchRetrievalFactuality,
  scoreGroundedFactuality,
} from "./factuality.js";
export type {
  ParametricFactualityInput,
  SearchRetrievalFactualityInput,
  GroundedFactualityInput,
  FactualityDimensionScore,
  FactualityResult,
} from "./factuality.js";

export { assessAutonomy, getDeescalationTriggers, getDomainRiskCap } from "./graduatedAutonomy.js";
export type { AutonomyMode, AutonomyTransitionRule, AutonomyState, AutonomyAssessment, RiskOverride } from "./graduatedAutonomy.js";

export { scorePauseQuality } from "./pauseQuality.js";
export type { PauseEvent, PauseReason, PauseQualityScore, PauseQualityInput } from "./pauseQuality.js";

export { scoreMemoryIntegrity } from "./memoryIntegrity.js";
export type { MemoryEvent, MemoryEventType, MemoryIntegrityScore, MemoryIntegrityInput } from "./memoryIntegrity.js";

export { computeAlignmentIndex } from "./alignmentIndex.js";
export type { AlignmentDimension, AlignmentIndex, AlignmentGrade, AlignmentInput } from "./alignmentIndex.js";

export { scoreInterpretability } from "./interpretability.js";
export type { InterpretabilityEvent, InterpretabilityScore } from "./interpretability.js";

export { scoreCalibrationGap, scanCalibrationInfrastructure } from "./calibrationGap.js";
export type { CalibrationReport, CalibrationInput } from "./calibrationGap.js";

export { scoreEvidenceConflict, scanEvidenceConflicts } from "./evidenceConflict.js";
export type { EvidenceConflictReport, EvidenceItem } from "./evidenceConflict.js";

export { scoreSleeperDetection } from "./sleeperDetection.js";
export type { SleeperDetectionReport } from "./sleeperDetection.js";

export { scoreAuditDepth } from "./auditDepth.js";
export type { AuditDepthReport } from "./auditDepth.js";

export { scorePolicyConsistency, scanPolicyConsistency } from "./policyConsistency.js";
export type { PolicyConsistencyReport, PolicyTrialResult } from "./policyConsistency.js";

export { scoreTransitionQuality, scoreLevelTransitions, scanLevelTransitionInfra } from "./levelTransition.js";
export type { LevelTransition, LevelTransitionReport } from "./levelTransition.js";

export { scoreGamingResistance } from "./gamingResistance.js";
export type { GamingResistanceReport } from "./gamingResistance.js";

export { buildDensityMap, scanDensityMapInfra } from "./densityMap.js";
export type { DensityCell, DimensionDensity, DensityMapReport, EvidenceRecord } from "./densityMap.js";

export { ingestEvidence, TRUST_WEIGHTS } from "./evidenceIngestion.js";
export type { TrustTier, IngestFormat, IngestInput, NormalizedEvidence, IngestReport } from "./evidenceIngestion.js";

export { createAttestation, verifyAttestation, scoreOutputAttestation } from "./outputAttestation.js";
export type { AttestationInput, Attestation, AttestationVerification, OutputAttestationReport } from "./outputAttestation.js";

export { createChallenge, respondToChallenge, verifyMutualTrust, scoreMutualVerification } from "./mutualVerification.js";
export type { AgentIdentity, VerificationChallenge, VerificationResponse, MutualTrustResult, MutualVerificationReport } from "./mutualVerification.js";

export { TransparencyLog } from "./networkTransparencyLog.js";
export type { LogEntry, LogEntryType, InclusionProof, TransparencyLogReport } from "./networkTransparencyLog.js";
