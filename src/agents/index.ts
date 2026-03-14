/**
 * agents/index.ts — Re-exports for all agent harnesses.
 */

export { AMCAgentBase } from './agentBase.js';
export type { AgentConfig, AgentDecision, AgentStats } from './agentBase.js';

export { ContentModerationBot, moderate } from './contentModerationBot.js';
export type { ModerationDecision, ContentCategory, ViolationType } from './contentModerationBot.js';

export { DataPipelineBot } from './dataPipelineBot.js';
export type { PipelineTransform, PipelineResult, TransformType } from './dataPipelineBot.js';

export { LegalContractBot, analyzeContract } from './legalContractBot.js';
export type { ContractAnalysis, ClauseExtraction, ClauseType } from './legalContractBot.js';

export { CustomerSupportBot, handleSupportRequest } from './customerSupportBot.js';
export type {
  SupportTicket, SupportRequest, SupportResponse, BotStats,
  Intent, Sentiment, Priority, TicketStatus,
} from './customerSupportBot.js';

export { HarnessRunner } from './harnessRunner.js';
export type { HarnessConfig, HarnessIteration, HarnessResult, CapabilityProbe } from './harnessRunner.js';

// ── Scorecard-inspired evaluation features ─────────────────────────

export { MetricRegistry, getMetricRegistry, resetMetricRegistry } from './metricTemplates.js';
export type {
  MetricTemplate, MetricResult, MetricInput, MetricGroup, MetricGroupResult,
  MetricOutputType, MetricCategory,
} from './metricTemplates.js';

export { SimRunner } from './simAgent.js';
export type {
  SimPersona, SimMessage, SimConversation, SimResult, SimFinding,
  SimBatchResult, StopReason,
} from './simAgent.js';

export { RunHistoryStore } from './runHistory.js';
export type {
  RunRecord, ABComparison, RegressionAlert as RunHistoryRegressionAlert, TrendAnalysis, TrendPoint,
  Testcase, TestsetResult,
} from './runHistory.js';

export { ProductionMonitor } from './monitor.js';
export type {
  MonitorConfig, MonitorSample, MonitorAlert, MonitorStatus, MonitorDashboard,
} from './monitor.js';

// ── Gap closure modules ───────────────────────────────────────────

export { LLMJudge } from './llmJudge.js';
export type {
  JudgeTemplate, JudgeRubric, JudgeResult, PairwiseResult,
  JudgeConfig,
} from './llmJudge.js';

export { Playground } from './playground.js';
export type {
  PlaygroundPrompt, PlaygroundTestcase,
  PlaygroundVariant, PlaygroundSummary,
} from './playground.js';

export { TraceIngestionPipeline } from './traceIngestion.js';
export type {
  ProductionTrace, IngestionConfig, ScoredTrace, IngestionStats,
} from './traceIngestion.js';

export { AutoTestGenerator } from './autoTestGen.js';
export type {
  FailureSignal, GeneratedTestCase, TestAssertion, TestGenConfig,
  TestGenResult, FailureCluster, FailureSource, AssertionType,
} from './autoTestGen.js';

export { SessionEvaluator } from './sessionEval.js';
export type {
  SessionTurn, SessionGoal, SessionEvalConfig, SessionEvalResult,
  GoalEvaluation, LoopDetection, EscalationAnalysis, TurnRole,
} from './sessionEval.js';
