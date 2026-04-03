export { ScratchpadManager } from './scratchpad.js';
export type { ScratchpadEntry } from './scratchpad.js';
export { PromptModuleRegistry } from './promptModules.js';
export { validateAndRepair } from './structuredOutput.js';
export type { ValidateAndRepairResult } from './structuredOutput.js';
export { diffOutputs } from './outputDiff.js';
export type { DiffResult } from './outputDiff.js';
export { CostLatencyRouter } from './costLatencyRouter.js';
export type { RoutingProfile as ProductRoutingProfile, RouteResult } from './costLatencyRouter.js';
export { AutonomyDial } from './autonomyDial.js';
export type { AutonomyMode, AutonomyDecision } from './autonomyDial.js';
export { ToolReliabilityPredictor } from './toolReliability.js';
export type { CallRecord, ReliabilityPrediction } from './toolReliability.js';
export { Metering } from './metering.js';
export type { MeteringEvent, MeteringBill } from './metering.js';
export { LoopDetector } from './loopDetector.js';
export type { LoopDetectionResult } from './loopDetector.js';
export { withRetry } from './retryEngine.js';
export type { RetryConfig, RetryResult } from './retryEngine.js';
export { generatePlan } from './planGenerator.js';
export type { PlanStep, Plan } from './planGenerator.js';
export { checkContract } from './toolContract.js';
export type { ToolContract, ContractCheckResult } from './toolContract.js';
export { estimateCost, estimateBatchCost, compareModelCosts, getModelPricing, listModels, registerModelPricing } from './toolCostEstimator.js';
export type { CostEstimate, ModelPricing, BatchCostEstimate } from './toolCostEstimator.js';
export { WorkflowEngine } from './workflowEngine.js';
export type { WorkflowStep, Workflow } from './workflowEngine.js';
export { generateFix, generateFixPlan } from './fixGenerator.js';
export type { Gap, Fix, FixPlan } from './fixGenerator.js';

// ── Enhanced modules (redirected from stubs to real implementations) ──

// DependencyGraph
export { buildDependencyGraph, topoSort, detectCycle, criticalPath, executionLayers } from './dependencyGraph.js';
export type { DepGraph, CycleInfo, TopoSortResult, CriticalPathResult, ExecutionLayer } from './dependencyGraph.js';

// Determinism
export { checkDeterminism } from './determinism.js';
export type { DeterminismResult } from './determinism.js';

// ConversationSummarizer
export { summarizeConversation } from './conversationSummarizer.js';
export type { SummaryResult, SummaryStrategy } from './conversationSummarizer.js';

// Clarification
export { checkClarification } from './clarification.js';
export type { ClarificationResult, AmbiguityIssue } from './clarification.js';

// ContextOptimizer
export { optimizeContext, packSections } from './contextOptimizer.js';
export type { ContextOptResult, ContextSection } from './contextOptimizer.js';

// InstructionFormatter
export { formatInstruction, formatInstructions } from './instructionFormatter.js';
export type { FormattedInstruction, FormatStyle } from './instructionFormatter.js';

// ErrorTranslator
export { translateError, translateErrors, errorSummary, registerErrorPattern, clearCustomPatterns } from './errorTranslator.js';
export type { TranslatedError, ErrorPattern } from './errorTranslator.js';

// ToolSemanticDocs
export { buildIndex, searchTools, generateDocs, enrichSpec, generateSemanticDocs } from './toolSemanticDocs.js';
export type { ToolSpec, SemanticDoc, SearchResult } from './toolSemanticDocs.js';

// TaskSplitter
export { split, splitTask, chunkText, estimateTotalMs, registerAgentType } from './taskSplitter.js';
export type { SubTask, SplitTask, ChunkResult, AgentType } from './taskSplitter.js';

// Glossary
export { GlossaryManager } from './glossary.js';
export type { GlossaryEntry, VariantViolation, GlossaryExport } from './glossary.js';

// Compensation
export { CompensationLog, CompensationSaga, compensate } from './compensation.js';
export type { CompensationEntry, CompensationAction, SagaResult, SagaStep } from './compensation.js';

// Improvement
export { suggestImprovement, applyImprovement, recordAfter, trackImpact, listImprovements, setThresholds, getThresholds } from './improvement.js';
export type { PerformanceData, Suggestion, Improvement, ImpactRecord, ImprovementThresholds } from './improvement.js';

// ToolFallback
export { withFallback, getFallbackChain, recordSuccess, recordFailure, executeWithFallback, tryWithFallback, exportChains, importChains } from './toolFallback.js';
export type { FallbackChain, FallbackResult, ChainExport } from './toolFallback.js';

// AsyncCallback
export { CallbackRegistry, registerAsyncCallback } from './asyncCallback.js';
export type { CallbackEntry, AsyncCallback, WebhookConfig, DeliveryResult } from './asyncCallback.js';

// Escalation
export { EscalationManager, escalateIssue } from './escalation.js';
export type { EscalationRecord, Escalation, RoutingRule } from './escalation.js';

// SyncConnector
export { SyncManager, validateMapping, syncData } from './syncConnector.js';
export type { FieldMapping, SyncRecord, SyncResult, TransformType as SyncTransformType, ValidationResult } from './syncConnector.js';

// WhiteLabel
export { WhiteLabelManager, renderTemplate as renderWhiteLabelTemplate, createWhiteLabel } from './whiteLabel.js';
export type { BrandingConfig, Branding, WhiteLabelConfig, TenantConfig } from './whiteLabel.js';

// PersonalizedOutput
export { getProfile, updateProfile, deleteProfile, applyStyle, applyStyleWithProfile, getPreferenceHistory, listProfiles } from './personalizedOutput.js';
export type { StyleProfile, StyledOutput, PreferenceUpdate, Tone, Length, Format } from './personalizedOutput.js';

// BatchProcessor (new)
export { BatchProcessor } from './batchProcessor.js';
export type { BatchRecord, BatchItemRecord, BatchProgress, BatchResult, BatchStatus, ItemStatus } from './batchProcessor.js';

// Portal (new)
export { PortalManager } from './portal.js';
export type { PortalJob, ProgressEvent, ResultFile, JobStatus } from './portal.js';

// ProductDb
export { openProductDb, closeProductDb } from './productDb.js';

// ── Enhanced modules (batch 2) ──

// DocumentAssembler
export { DocumentAssembler, assembleDocument } from './documentAssembler.js';
export type { DocSection, DocAssembly, AssembledDoc } from './documentAssembler.js';

// EventRouter
export { EventRouter, routeEvent } from './eventRouter.js';
export type { RouteRule, EventPayload, DeliveryRecord, RoutedEvent } from './eventRouter.js';

// GoalTracker
export { GoalTracker, trackGoal } from './goalTracker.js';
export type { GoalRecord, MilestoneRecord, DriftEvent, GoalStatus } from './goalTracker.js';

// KnowledgeGraph
export { KnowledgeGraph, addKnowledgeNode } from './knowledgeGraph.js';
export type { KGEntity, KGRelationship, GraphPath, KnowledgeNode } from './knowledgeGraph.js';

// OnboardingWizard
export { OnboardingWizard, getOnboardingSteps } from './onboardingWizard.js';
export type { OnboardingConfig, OnboardingSession, OnboardingStep } from './onboardingWizard.js';

// OutputCorrector
export { OutputCorrector, correctOutput } from './outputCorrector.js';
export type { CorrectionRule, CorrectionResult, CorrectionReport } from './outputCorrector.js';

// ReasoningCoach
export { analyzeReasoning, batchAnalyze, coachReasoning } from './reasoningCoach.js';
export type { CoachingResult, ReasoningAnalysis } from './reasoningCoach.js';

// ReplayDebugger
export { ReplayDebugger, createReplaySession } from './replayDebugger.js';
export type { ReplayEvent, ReplaySession, ReplaySnapshot } from './replayDebugger.js';

// ── Enhanced modules (batch 3) ──

// RolloutManager
export { RolloutManager, checkRollout } from './rolloutManager.js';
export type { RolloutConfig, RolloutStatus, RolloutDecision, RolloutStats } from './rolloutManager.js';

// TaskSpecBuilder
export { TaskSpecBuilder, createTaskSpec } from './taskSpecBuilder.js';
export type { TaskSpec } from './taskSpecBuilder.js';

// ToolChainBuilder
export { ToolChainBuilder, buildToolChain } from './toolChainBuilder.js';
export type { ToolChain, ToolChainStep, ChainValidation } from './toolChainBuilder.js';

// ToolParallelizer
export { ToolParallelizer, parallelizeTools } from './toolParallelizer.js';
export type { ParallelTask, TaskResult as ParallelTaskResult, ParallelResult } from './toolParallelizer.js';

// ApprovalWorkflow
export { ApprovalManager, createApproval } from './approvalWorkflow.js';
export type { ApprovalChain, ApprovalDecision, ApprovalRequest } from './approvalWorkflow.js';

// ContextPackBuilder
export { ContextPackBuilder, createContextPack } from './contextPackBuilder.js';
export type { ContextEntry, ContextPack, PackSummary } from './contextPackBuilder.js';

// DevSandbox
export { DevSandboxManager, createDevSandbox, getDevSandboxManager } from './devSandbox.js';
export type { SandboxConfig, SandboxEvent, SandboxSnapshot, Sandbox, SandboxSession, ExecutionResult as SandboxExecutionResult } from './devSandbox.js';

// LongTermMemory
export { LongTermMemory, getLongTermMemory } from './longTermMemory.js';
export type { MemoryEntry, MemoryStats, SearchResult as MemorySearchResult } from './longTermMemory.js';

// ToolRateLimiter
export { RateLimiter, checkRateLimit } from './toolRateLimiter.js';
export type { RateLimitConfig, RateLimitResult } from './toolRateLimiter.js';

// ── New product modules (Python ports) ──

// ChunkingPipeline
export { ChunkingPipeline, getChunkingPipeline } from './chunkingPipeline.js';
export type { DocChunk, ChunkRequest, ChunkManifest, ChunkStrategy, ChunkType } from './chunkingPipeline.js';

// APIWrapperGenerator
export { APIWrapperGenerator, getApiWrapperGenerator } from './apiWrapperGenerator.js';
export type {
  ParameterDef, ToolEndpoint, GeneratedWrapper,
  WrapperGenerateRequest, WrapperGenerateResult,
} from './apiWrapperGenerator.js';

// AutoDocGenerator
export { AutoDocGenerator, getAutoDocGenerator } from './autodocGenerator.js';
export type {
  WorkflowStep as AutoDocWorkflowStep, TestDefinition,
  DocGenerateRequest, GeneratedDoc, DocGenerateResult,
} from './autodocGenerator.js';

// ClarificationOptimizer
export { ClarificationOptimizer, getClarificationOptimizer } from './clarificationOptimizer.js';
export type {
  ClarificationQuestion,
  ClarificationResult as ClarificationOptResult,
  ResolutionRecord, OptimizeRequest,
} from './clarificationOptimizer.js';

// Batch job helpers
export { createBatchJob } from './jobs.js';
export type { BatchJob } from './jobs.js';
