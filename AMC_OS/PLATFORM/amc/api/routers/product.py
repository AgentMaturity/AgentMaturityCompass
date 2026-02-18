"""AMC API — Product Feature Router.

Routes for navigating AMC’s feature roadmap and readiness posture.
This keeps non-core productization work visible to operators and automations
without hardcoding roadmap context in clients.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from amc.core.models import PolicyDecision
from amc.product import Relevance, get_features
from amc.product.improvement import (
    FeedbackInput as FeedbackStoreInput,
    FeedbackLoop,
    FeedbackSentiment,
    get_feedback_loop,
)
from amc.product.metering import BillingInvoice, UsageEventInput, get_metering_ledger
from amc.product.version_control import get_version_control_store
from amc.product.tool_contract import ToolContractRegistry, repair_tool_call, validate_tool_contract
from amc.product.failure_clustering import (
    FailureClusterRequest,
    FailureClusterResponse,
    summarize_failure_clusters,
)
from amc.product.persona import (
    PersonaInput,
    PersonaRecord,
    get_persona_manager,
    apply_persona,
)
from amc.product.glossary import (
    TermInput,
    TermRecord,
    get_glossary_manager,
)
from amc.product.extractor import (
    ExtractionInput,
    ExtractionResult,
    get_extractor,
)
from amc.product.context_pack import (
    ContextPackInput,
    ContextPackRecord,
    ContextSource,
    get_context_pack_generator,
)
# Alias so existing code referencing PackSource still works
PackSource = ContextSource
from amc.product.data_quality import (
    CheckInput,
    ThresholdInput,
    QualityReport,
    BatchQualitySummary,
    get_data_quality_monitor,
)
from amc.product.cost_latency_router import (
    TaskDescriptor,
    TaskType,
    ModelTier,
    RoutingProfile,
    get_cost_latency_router,
)
from amc.product.ab_testing import (
    ExperimentStatus,
    get_ab_platform,
)
from amc.product.rollout_manager import (
    RolloutStatus,
    get_rollout_manager,
)
from amc.product.replay_debugger import (
    EventType,
    TraceStatus,
    get_replay_debugger,
)
from amc.product.scaffolding import (
    AgentTemplate,
    get_scaffolder,
)
from amc.product.dev_sandbox import (
    MockMode,
    get_dev_sandbox,
)
from amc.product.determinism_kit import (
    DeterminismKit,
    get_determinism_kit,
)
from amc.product.prompt_modules import (
    PromptModuleRegistry,
    MODULE_TYPES,
    get_prompt_registry,
)
from amc.product.tool_semantic_docs import (
    ToolSemanticDocGenerator,
    get_doc_generator,
)
from amc.product.tool_parallelizer import (
    ToolCall,
    ToolParallelizer,
    SideEffectPolicy,
    build_execution_plan,
    get_parallelizer,
)
from amc.product.tool_discovery import (
    ToolRegistration,
    ToolDiscoveryEngine,
    get_tool_discovery_engine,
)
from amc.product.tool_reliability import (
    CallRecord,
    get_tool_reliability_predictor,
)
from amc.product.error_translator import (
    get_error_translator,
)
from amc.product.memory_consolidation import (
    MemoryItem,
    get_memory_consolidation_engine,
)
from amc.product.scratchpad import (
    Lifecycle,
    ScratchEntry,
    get_scratchpad_manager,
)

from fastapi import FastAPI
from amc.core.config import get_settings

# ── Wave-2 module imports ─────────────────────────────────────────────────
from amc.product.autonomy_dial import (
    AutonomyMode,
    PolicyInput,
    get_autonomy_dial,
)
from amc.product.goal_tracker import (
    GoalInput,
    MilestoneInput,
    GoalStatus,
    MilestoneStatus,
    get_goal_tracker,
)
from amc.product.loop_detector import (
    PatternType,
    RecoveryStrategy,
    get_loop_detector,
)
from amc.product.confidence import (
    ConfidenceBand,
    ConfidenceInput,
    EvidenceItem,
    get_confidence_estimator,
)
from amc.product.conversation_state import (
    DecisionOutcome,
    DecisionRecord,
    PendingAction,
    PendingActionStatus,
    SnapshotInput,
    get_state_manager,
)

# ── Wave-2 output/memory/intelligence module imports ─────────────────────
from amc.product.structured_output import (
    OutputFormat,
    OutputSchema,
    EnforceRequest as _StructuredEnforceRequest,
    StructuredOutputEnforcer,
    get_structured_output_enforcer,
)
from amc.product.output_diff import (
    OutputDiffTracker,
    get_output_diff_tracker,
)
from amc.product.instruction_formatter import (
    AudienceRole,
    Tone,
    StructureStyle,
    FormatRequest as _FormatRequest,
    get_instruction_formatter,
)
from amc.product.plan_generator import (
    PlanRequest as _PlanRequest,
    get_plan_generator,
)
from amc.product.conversation_summarizer import (
    MessageRole,
    ConversationMessage as _ConvMessage,
    SummarizeRequest as _SummarizeRequest,
    get_conversation_summarizer,
)
from amc.product.long_term_memory import (
    MemoryEntry as _LTMemoryEntry,
    get_long_term_memory_store,
)
from amc.product.context_optimizer import (
    SelectionStrategy,
    TokenEstimateMode,
    ContextItem as _ContextItem,
    OptimizeRequest as _OptimizeRequest,
    get_context_optimizer,
)
from amc.product.chunking_pipeline import (
    ChunkStrategy,
    ChunkRequest as _ChunkRequest,
    get_chunking_pipeline,
)
from amc.product.reasoning_coach import (
    Severity as CoachSeverity,
    CoachRequest as _CoachRequest,
    get_reasoning_coach,
)

# Wave-2 Tool Intelligence imports
from amc.product.task_spec import TaskSpecCompiler, get_task_spec_compiler
from amc.product.clarification_optimizer import (
    ClarificationOptimizer,
    get_clarification_optimizer,
)
from amc.product.task_splitter import MultiAgentTaskSplitter, get_task_splitter
from amc.product.dependency_graph import DependencyGraphResolver, get_dependency_graph_resolver
from amc.product.param_autofiller import ToolParamAutoFiller, get_param_autofiller
from amc.product.response_validator import ToolResponseValidator, get_response_validator
from amc.product.tool_cost_estimator import CostModel, ToolCostEstimator, get_tool_cost_estimator
from amc.product.tool_chain_builder import ToolChainBuilder, get_tool_chain_builder
from amc.product.tool_fallback import ToolFallbackManager, get_tool_fallback_manager
from amc.product.tool_rate_limiter import ToolRateLimiter, get_tool_rate_limiter

# ── Wave-5: Knowledge + DevX module imports ──────────────────────────────
from amc.product.sop_compiler import (
    SOPCompileRequest,
    get_sop_compiler,
)
from amc.product.api_wrapper_generator import (
    WrapperGenerateRequest,
    get_api_wrapper_generator,
)
from amc.product.autodoc_generator import (
    DocGenerateRequest,
    get_autodoc_generator,
)
from amc.product.docs_ingestion import (
    IngestRequest as DocsIngestRequest,
    WeeklySummaryRequest,
    get_docs_ingestion_manager,
)
from amc.product.kb_builder import (
    TicketInput,
    KBSearchRequest,
    get_kb_builder,
)
from amc.product.workflow_templates import (
    TemplateCreateRequest,
    TemplateUpdateRequest,
    TemplateInstallRequest,
    TemplateSearchRequest,
    get_workflow_template_marketplace,
)
from amc.product.async_callback import (
    CallbackRegisterRequest,
    TriggerRequest,
    RetryRequest,
    get_async_callback_manager,
)
from amc.product.output_corrector import (
    CorrectRequest,
    CorrectionRuleCreate,
    SectionOrderConfigCreate,
    NamingNormCreate,
    get_output_corrector,
)

# ── Wave-Final: Product/UX/Channel modules ────────────────────────────────
from amc.product.onboarding_wizard import (
    StartSessionInput as OnboardStartInput,
    StepAdvanceInput,
    OAuthConnectionInput,
    WorkflowSelectionInput,
    FirstRunInput,
    PreferencesInput,
    get_onboarding_wizard,
)
from amc.product.portal import (
    JobSubmitInput,
    JobStatusUpdateInput,
    ProgressEventInput,
    ResultFileInput,
    JobStatus,
    get_portal_manager,
)
from amc.product.approval_workflow import (
    DraftCreateInput,
    DraftUpdateInput,
    SubmitForApprovalInput,
    ApprovalDecisionInput,
    RevisionInput,
    SendInput,
    get_approval_manager,
)
from amc.product.collaboration import (
    TaskCreateInput,
    TaskUpdateInput,
    AssignInput,
    HandoffInput,
    HandoffAckInput,
    CommentInput,
    get_collaboration_manager,
)
from amc.product.retention_autopilot import (
    UsageSignalInput,
    ChurnScoreInput,
    WinbackTriggerInput,
    FlowEventInput,
    get_retention_autopilot,
)
from amc.product.personalized_output import (
    StyleProfileInput,
    StyleProfileUpdateInput,
    ApplyStyleInput,
    get_output_manager,
)
from amc.product.proactive_reminders import (
    SubscriptionInput,
    ReminderCreateInput,
    SnoozeInput,
    get_reminder_manager,
)
from amc.product.outcome_pricing import (
    ContractCreateInput,
    ContractUpdateInput,
    OutcomeRecordInput,
    OutcomeVerifyInput,
    BillingEventInput,
    BillingStatusUpdateInput,
    get_outcome_manager,
)
from amc.product.white_label import (
    TemplateCreateInput as WLTemplateCreateInput,
    TemplateUpdateInput as WLTemplateUpdateInput,
    EnvironmentProvisionInput,
    BrandingAssetInput,
    get_white_label_manager,
)

router = APIRouter(prefix="/api/v1/product", tags=["product"])
features_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-features"])
metering_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-metering"])
feedback_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-feedback"])
analytics_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-analytics"])
versions_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-versions"])
tool_contract_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-tool-contract"])
failure_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-failures"])
persona_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-personas"])
glossary_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-glossary"])
extractor_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-extract"])
context_pack_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-context-pack"])
data_quality_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-data-quality"])
routing_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-routing"])
ab_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-ab"])
rollout_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-rollout"])
replay_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-replay"])
scaffold_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-scaffold"])
devsandbox_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-devsandbox"])
orchestration_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-orchestration"])
determinism_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-determinism"])
prompt_modules_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-prompts"])
tool_docs_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-tool-docs"])
tool_parallel_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-tool-parallel"])

# Wave-5: Knowledge + DevX routers
sop_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-sop"])
api_wrapper_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-api-wrapper"])
autodoc_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-autodoc"])
docs_ingest_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-docs-ingest"])
kb_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-kb"])
templates_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-templates"])
callbacks_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-callbacks"])
output_corrector_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-output-corrector"])

tool_discovery_router  = APIRouter(prefix="/api/v1/product", tags=["product", "product-tool-discovery"])
tool_reliability_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-tool-reliability"])
error_translator_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-error-translator"])
memory_consolidation_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-memory-consolidation"])
scratchpad_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-scratchpad"])

# Wave-2 routers
autonomy_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-autonomy"])
goals_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-goals"])
loops_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-loops"])
confidence_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-confidence"])
state_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-state"])

# Wave-2 output/memory/intelligence routers
structured_output_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-structured-output"])
output_diff_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-output-diff"])
instruction_fmt_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-instruction-fmt"])
plan_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-plan"])
conv_summarizer_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-conv-summarizer"])
lt_memory_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-lt-memory"])
ctx_optimizer_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-ctx-optimizer"])
chunking_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-chunking"])
reasoning_coach_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-reasoning-coach"])

# Wave-2 Tool Intelligence routers
task_spec_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-task-spec"])
clarify_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-clarify"])
task_split_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-task-split"])
dep_graph_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-dep-graph"])
param_autofill_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-param-autofill"])
resp_validator_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-resp-validator"])
tool_cost_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-tool-cost"])
tool_chain_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-tool-chain"])
tool_fallback_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-tool-fallback"])
tool_rate_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-tool-rate"])

# Wave-Final: Product/UX/Channel routers
onboarding_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-onboarding"])
portal_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-portal"])
approvals_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-approvals"])
collab_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-collab"])
retention_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-retention"])
output_style_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-output-style"])
reminders_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-reminders"])
outcome_pricing_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-outcome-pricing"])
white_label_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-white-label"])


def register_product_routes(app: FastAPI) -> None:
    """Register product subrouters according to module flags."""
    settings = get_settings()
    if not getattr(settings, "module_product_enabled", True):
        return

    module_routes = [
        (features_router, getattr(settings, "module_product_features_enabled", True)),
        (metering_router, getattr(settings, "module_product_metering_enabled", True)),
        (feedback_router, getattr(settings, "module_product_feedback_enabled", True)),
        (analytics_router, getattr(settings, "module_product_analytics_enabled", True)),
        (versions_router, getattr(settings, "module_product_versions_enabled", True)),
        (tool_contract_router, getattr(settings, "module_product_tool_contract_enabled", True)),
        (failure_router, getattr(settings, "module_product_failures_enabled", True)),
        (persona_router, getattr(settings, "module_product_personas_enabled", True)),
        (glossary_router, getattr(settings, "module_product_glossary_enabled", True)),
        (extractor_router, getattr(settings, "module_product_extractor_enabled", True)),
        (context_pack_router, getattr(settings, "module_product_context_pack_enabled", True)),
        (data_quality_router, getattr(settings, "module_product_data_quality_enabled", True)),
        (routing_router, getattr(settings, "module_product_routing_enabled", True)),
        (ab_router, getattr(settings, "module_product_ab_enabled", True)),
        (rollout_router, getattr(settings, "module_product_rollout_enabled", True)),
        (replay_router, getattr(settings, "module_product_replay_enabled", True)),
        (scaffold_router, getattr(settings, "module_product_scaffold_enabled", True)),
        (devsandbox_router, getattr(settings, "module_product_devsandbox_enabled", True)),
        (orchestration_router, getattr(settings, "module_product_orchestration_enabled", True)),
        # Wave-4: Tools + Memory
        (tool_discovery_router, getattr(settings, "module_product_tool_discovery_enabled", True)),
        (tool_reliability_router, getattr(settings, "module_product_tool_reliability_enabled", True)),
        (error_translator_router, getattr(settings, "module_product_error_translator_enabled", True)),
        (memory_consolidation_router, getattr(settings, "module_product_memory_consolidation_enabled", True)),
        (scratchpad_router, getattr(settings, "module_product_scratchpad_enabled", True)),
        # Wave-2
        (autonomy_router, getattr(settings, "module_product_autonomy_enabled", True)),
        (goals_router, getattr(settings, "module_product_goals_enabled", True)),
        (loops_router, getattr(settings, "module_product_loops_enabled", True)),
        (confidence_router, getattr(settings, "module_product_confidence_enabled", True)),
        (state_router, getattr(settings, "module_product_state_enabled", True)),
        # Wave-4: model-ops + reliability
        (determinism_router, getattr(settings, "module_product_determinism_enabled", True)),
        (prompt_modules_router, getattr(settings, "module_product_prompts_enabled", True)),
        (tool_docs_router, getattr(settings, "module_product_tool_docs_enabled", True)),
        (tool_parallel_router, getattr(settings, "module_product_tool_parallel_enabled", True)),
        # Wave-5: Knowledge + DevX
        (sop_router, getattr(settings, "module_product_sop_enabled", True)),
        (api_wrapper_router, getattr(settings, "module_product_api_wrapper_enabled", True)),
        (autodoc_router, getattr(settings, "module_product_autodoc_enabled", True)),
        (docs_ingest_router, getattr(settings, "module_product_docs_ingest_enabled", True)),
        (kb_router, getattr(settings, "module_product_kb_enabled", True)),
        (templates_router, getattr(settings, "module_product_templates_enabled", True)),
        (callbacks_router, getattr(settings, "module_product_callbacks_enabled", True)),
        (output_corrector_router, getattr(settings, "module_product_output_corrector_enabled", True)),
        # Wave-2 Tool Intelligence
        (task_spec_router, getattr(settings, "module_product_task_spec_enabled", True)),
        (clarify_router, getattr(settings, "module_product_clarify_enabled", True)),
        (task_split_router, getattr(settings, "module_product_task_split_enabled", True)),
        (dep_graph_router, getattr(settings, "module_product_dep_graph_enabled", True)),
        (param_autofill_router, getattr(settings, "module_product_param_autofill_enabled", True)),
        (resp_validator_router, getattr(settings, "module_product_resp_validator_enabled", True)),
        (tool_cost_router, getattr(settings, "module_product_tool_cost_enabled", True)),
        (tool_chain_router, getattr(settings, "module_product_tool_chain_enabled", True)),
        (tool_fallback_router, getattr(settings, "module_product_tool_fallback_enabled", True)),
        (tool_rate_router, getattr(settings, "module_product_tool_rate_enabled", True)),
        # Wave-2: output/memory/intelligence
        (structured_output_router, getattr(settings, "module_product_structured_output_enabled", True)),
        (output_diff_router, getattr(settings, "module_product_output_diff_enabled", True)),
        (instruction_fmt_router, getattr(settings, "module_product_instruction_fmt_enabled", True)),
        (plan_router, getattr(settings, "module_product_plan_enabled", True)),
        (conv_summarizer_router, getattr(settings, "module_product_conv_summarizer_enabled", True)),
        (lt_memory_router, getattr(settings, "module_product_lt_memory_enabled", True)),
        (ctx_optimizer_router, getattr(settings, "module_product_ctx_optimizer_enabled", True)),
        (chunking_router, getattr(settings, "module_product_chunking_enabled", True)),
        (reasoning_coach_router, getattr(settings, "module_product_reasoning_coach_enabled", True)),
        # Wave-Final: Orchestration + Reliability
        (workflow_engine_router, getattr(settings, "module_product_workflow_engine_enabled", True)),
        (event_router_r, getattr(settings, "module_product_event_router_enabled", True)),
        (retry_engine_router, getattr(settings, "module_product_retry_engine_enabled", True)),
        (compensation_router, getattr(settings, "module_product_compensation_enabled", True)),
        (rate_limits_router, getattr(settings, "module_product_rate_limits_enabled", True)),
        (sync_router, getattr(settings, "module_product_sync_enabled", True)),
        (graph_router, getattr(settings, "module_product_graph_enabled", True)),
        (doc_assemble_router, getattr(settings, "module_product_doc_assemble_enabled", True)),
        (batch_router, getattr(settings, "module_product_batch_enabled", True)),
        # Wave-Final: Product/UX/Channel
        (onboarding_router, getattr(settings, "module_product_onboarding_enabled", True)),
        (portal_router, getattr(settings, "module_product_portal_enabled", True)),
        (approvals_router, getattr(settings, "module_product_approvals_enabled", True)),
        (collab_router, getattr(settings, "module_product_collab_enabled", True)),
        (retention_router, getattr(settings, "module_product_retention_enabled", True)),
        (output_style_router, getattr(settings, "module_product_output_style_enabled", True)),
        (reminders_router, getattr(settings, "module_product_reminders_enabled", True)),
        (outcome_pricing_router, getattr(settings, "module_product_outcome_pricing_enabled", True)),
        (white_label_router, getattr(settings, "module_product_white_label_enabled", True)),
    ]
    for route, enabled in module_routes:
        if enabled:
            app.include_router(route)


class ProductFeatureRow(BaseModel):
    feature_id: int
    title: str
    lane: str
    summary: str
    relevance: str
    amc_fit: bool
    rationale: str
    owner_hint: str
    effort: str
    blockers: list[str] = Field(default_factory=list)


class ProductFeaturesResponse(BaseModel):
    count: int
    relevance: str | None = None
    amc_fit_only: bool = True
    features: list[ProductFeatureRow] = Field(default_factory=list)


class ProductFeatureSummary(BaseModel):
    total: int
    by_lane: dict[str, int]
    by_relevance: dict[str, int]
    fit_count: int
    recommendation_count: int


class MeteringUsageInput(BaseModel):
    tenant_id: str
    workflow_id: str
    run_id: str
    actor_id: str
    session_id: str | None = None
    started_at: datetime | None = None
    duration_ms: int = 0
    tool_calls: int = 0
    model_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    browser_minutes: float = 0.0
    metadata: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str | None = None


class MeteringUsageResponse(BaseModel):
    event: dict[str, Any]


class MeteringQueryResponse(BaseModel):
    count: int
    events: list[dict[str, Any]] = Field(default_factory=list)


class MeteringBillingLineItem(BaseModel):
    workflow_id: str
    total_events: int
    total_cost_usd: float
    total_billing_units: float
    total_duration_ms: int
    total_tool_calls: int
    total_model_calls: int


class MeteringBillingResponse(BaseModel):
    tenant_id: str
    since: str | None = None
    until: str | None = None
    total_events: int
    total_cost_usd: float
    total_billing_units: float
    lines: list[MeteringBillingLineItem] = Field(default_factory=list)


class FeedbackInput(BaseModel):
    tenant_id: str
    workflow_id: str
    run_id: str | None = None
    session_id: str | None = None
    sentiment: FeedbackSentiment = FeedbackSentiment.POSITIVE
    rating: int = 5
    correction_note: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class FeedbackResponse(BaseModel):
    feedback: dict[str, Any]


class FeedbackListResponse(BaseModel):
    count: int
    feedback: list[dict[str, Any]] = Field(default_factory=list)


class FeedbackBucketResponse(BaseModel):
    bucket_start: str
    bucket_end: str
    total_feedback: int
    positive: int
    corrected: int
    negative: int
    score: float


class FeedbackScoreResponse(BaseModel):
    tenant_id: str
    workflow_id: str
    window_days: int
    total_feedback: int
    mean_rating: float
    current_score: float
    trend_vs_previous: float
    buckets: list[FeedbackBucketResponse] = Field(default_factory=list)


class ProductAnalyticsResponse(BaseModel):
    period_since: str | None = None
    period_until: str | None = None
    total_receipts: int = 0
    allowed_receipts: int = 0
    denied_receipts: int = 0
    other_receipts: int = 0
    success_rate: float = 0.0
    by_tool: dict[str, int] = Field(default_factory=dict)
    total_metering_events: int = 0
    total_metering_cost_usd: float = 0.0
    avg_run_duration_ms: float = 0.0
    unique_tenants: int = 0
    unique_workflows: int = 0
    top_workflows_by_cost: list[str] = Field(default_factory=list)
    improvement_score: float | None = None


@features_router.get("/features", response_model=ProductFeaturesResponse)
def list_product_features(
    relevance: str | None = None,
    amc_fit: bool = True,
    limit: int = 0,
) -> ProductFeaturesResponse:
    """Return the 50-feature extension catalog with optional filters."""
    rel = None
    if relevance is not None:
        try:
            rel = Relevance(relevance.lower())
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=(
                    "invalid relevance value. Use one of: "
                    + ", ".join(r.value for r in Relevance)
                ),
            ) from exc

    feats = get_features(relevance=rel, amc_fit_only=amc_fit)
    if limit > 0:
        feats = feats[:limit]

    out = [
        ProductFeatureRow(
            feature_id=f.feature_id,
            title=f.title,
            lane=f.lane.value,
            summary=f.summary,
            relevance=f.relevance.value,
            amc_fit=f.amc_fit,
            rationale=f.rationale,
            owner_hint=f.owner_hint,
            effort=f.effort,
            blockers=list(f.blockers),
        )
        for f in feats
    ]

    return ProductFeaturesResponse(
        count=len(out),
        relevance=relevance.lower() if relevance else None,
        amc_fit_only=amc_fit,
        features=out,
    )


@features_router.get("/features/summary", response_model=ProductFeatureSummary)
def product_features_summary() -> ProductFeatureSummary:
    """Summary counts for quick planning automation and dashboards."""
    feats = get_features(amc_fit_only=True)

    by_lane: dict[str, int] = {}
    by_relevance: dict[str, int] = {}

    for feat in feats:
        by_lane[feat.lane.value] = by_lane.get(feat.lane.value, 0) + 1
        by_relevance[feat.relevance.value] = by_relevance.get(feat.relevance.value, 0) + 1

    recommendations = get_features(relevance=Relevance.HIGH, amc_fit_only=True)

    return ProductFeatureSummary(
        total=50,
        by_lane=by_lane,
        by_relevance=by_relevance,
        fit_count=len(feats),
        recommendation_count=len(recommendations),
    )


@metering_router.post("/metering", response_model=MeteringUsageResponse)
def add_usage_event(payload: MeteringUsageInput) -> MeteringUsageResponse:
    """Record a billable usage event for a tenant/run/workflow."""
    ledger = get_metering_ledger()
    usage = ledger.record_event(
        UsageEventInput(
            tenant_id=payload.tenant_id,
            workflow_id=payload.workflow_id,
            run_id=payload.run_id,
            actor_id=payload.actor_id,
            session_id=payload.session_id,
            started_at=payload.started_at,
            duration_ms=payload.duration_ms,
            tool_calls=payload.tool_calls,
            model_calls=payload.model_calls,
            input_tokens=payload.input_tokens,
            output_tokens=payload.output_tokens,
            browser_minutes=payload.browser_minutes,
            metadata=payload.metadata,
            idempotency_key=payload.idempotency_key,
        )
    )
    return MeteringUsageResponse(event=usage.dict)


@metering_router.get("/metering", response_model=MeteringQueryResponse)
def list_metering_events(
    tenant_id: str | None = None,
    workflow_id: str | None = None,
    run_id: str | None = None,
    session_id: str | None = None,
    since: str | None = None,
    until: str | None = None,
    limit: int = 100,
) -> MeteringQueryResponse:
    """Query usage events."""
    ledger = get_metering_ledger()
    since_dt = datetime.fromisoformat(since) if since else None
    until_dt = datetime.fromisoformat(until) if until else None

    events = ledger.query_events(
        tenant_id=tenant_id,
        workflow_id=workflow_id,
        run_id=run_id,
        session_id=session_id,
        since=since_dt,
        until=until_dt,
        limit=limit,
    )
    return MeteringQueryResponse(
        count=len(events),
        events=[e.dict for e in events],
    )


@metering_router.get("/metering/billing", response_model=MeteringBillingResponse)
def meter_billing(
    tenant_id: str,
    since: str | None = None,
    until: str | None = None,
) -> MeteringBillingResponse:
    """Return billing totals for a tenant across a date window."""
    ledger = get_metering_ledger()
    since_dt = datetime.fromisoformat(since) if since else None
    until_dt = datetime.fromisoformat(until) if until else None

    invoice: BillingInvoice = ledger.generate_invoice(
        tenant_id=tenant_id,
        since=since_dt,
        until=until_dt,
    )

    return MeteringBillingResponse(
        tenant_id=tenant_id,
        since=invoice.since_iso,
        until=invoice.until_iso,
        total_events=invoice.total_events,
        total_cost_usd=invoice.total_cost_usd,
        total_billing_units=invoice.total_billing_units,
        lines=[
            MeteringBillingLineItem(
                workflow_id=line.workflow_id,
                total_events=line.total_events,
                total_cost_usd=line.total_cost_usd,
                total_billing_units=line.total_billing_units,
                total_duration_ms=line.total_duration_ms,
                total_tool_calls=line.total_tool_calls,
                total_model_calls=line.total_model_calls,
            )
            for line in invoice.lines
        ],
    )


@feedback_router.post("/feedback", response_model=FeedbackResponse)
def capture_feedback(payload: FeedbackInput) -> FeedbackResponse:
    """Store user feedback/corrections used by the improvement loop."""
    ledger: FeedbackLoop = get_feedback_loop()
    item = ledger.record(
        FeedbackStoreInput(
            tenant_id=payload.tenant_id,
            workflow_id=payload.workflow_id,
            run_id=payload.run_id,
            session_id=payload.session_id,
            sentiment=payload.sentiment,
            rating=payload.rating,
            correction_note=payload.correction_note,
            metadata=payload.metadata,
        )
    )
    return FeedbackResponse(feedback=item.dict)


@feedback_router.get("/feedback", response_model=FeedbackListResponse)
def list_feedback(
    tenant_id: str | None = None,
    workflow_id: str | None = None,
    limit: int = 100,
) -> FeedbackListResponse:
    """List captured feedback events."""
    ledger = get_feedback_loop()
    items = ledger.query(tenant_id=tenant_id, workflow_id=workflow_id, limit=limit)
    return FeedbackListResponse(count=len(items), feedback=[item.dict for item in items])


@feedback_router.get("/feedback/score", response_model=FeedbackScoreResponse)
def feedback_score(
    tenant_id: str,
    workflow_id: str,
    window_days: int = Query(7, ge=1, le=60),
) -> FeedbackScoreResponse:
    """Compute a simple rolling improvement score over time for feedback data."""
    series = get_feedback_loop().compute_improvement(
        tenant_id=tenant_id,
        workflow_id=workflow_id,
        window_days=window_days,
    )

    return FeedbackScoreResponse(
        tenant_id=series.tenant_id,
        workflow_id=series.workflow_id,
        window_days=series.window_days,
        total_feedback=series.total_feedback,
        mean_rating=series.mean_rating,
        current_score=series.current_score,
        trend_vs_previous=series.trend_vs_previous,
        buckets=[
            FeedbackBucketResponse(
                bucket_start=b.bucket_start.isoformat(),
                bucket_end=b.bucket_end.isoformat(),
                total_feedback=b.total_feedback,
                positive=b.positive,
                corrected=b.corrected,
                negative=b.negative,
                score=b.score,
            )
            for b in series.buckets
        ],
    )


@analytics_router.get("/analytics", response_model=ProductAnalyticsResponse)
async def product_analytics(
    since: str | None = None,
    until: str | None = None,
    feedback_tenant_id: str | None = None,
    feedback_workflow_id: str | None = None,
    usage_tenant_id: str | None = None,
    usage_workflow_id: str | None = None,
    limit: int = Query(5000, ge=1, le=20000),
) -> ProductAnalyticsResponse:
    """Aggregate metering + watch-receipt signals into a lightweight dashboard."""
    from amc.watch.w1_receipts import get_ledger

    since_dt = datetime.fromisoformat(since) if since else None
    until_dt = datetime.fromisoformat(until) if until else None

    ledger = await get_ledger()
    receipts = await ledger.query(
        since=since_dt,
        limit=limit,
    )
    if until_dt is not None:
        receipts = [r for r in receipts if r.timestamp <= until_dt]

    total_receipts = len(receipts)
    by_tool: dict[str, int] = {}
    allowed = 0
    denied = 0
    others = 0

    for r in receipts:
        by_tool[r.tool_name] = by_tool.get(r.tool_name, 0) + 1
        if r.policy_decision == PolicyDecision.ALLOW:
            allowed += 1
        elif r.policy_decision == PolicyDecision.DENY:
            denied += 1
        else:
            others += 1

    success_rate = round((allowed / total_receipts) * 100.0, 4) if total_receipts else 0.0

    ledger = get_metering_ledger()
    events = ledger.query_events(
        tenant_id=usage_tenant_id,
        workflow_id=usage_workflow_id,
        since=since_dt,
        until=until_dt,
        limit=limit,
    )

    meter_cost = round(sum(e.cost_usd for e in events), 6)
    avg_duration = (
        round(sum(e.duration_ms for e in events) / len(events), 3)
        if events else 0.0
    )
    tenants = {e.tenant_id for e in events}
    workflows = {e.workflow_id for e in events}

    workflow_costs = {
        e.workflow_id: round(
            sum(x.cost_usd for x in events if x.workflow_id == e.workflow_id), 6
        )
        for e in events
    }
    top_workflows = [
        wf
        for wf, _ in sorted(
            workflow_costs.items(),
            key=lambda item: item[1],
            reverse=True,
        )
    ]

    improvement_score = None
    if feedback_tenant_id and feedback_workflow_id:
        improvement_score = get_feedback_loop().compute_improvement(
            tenant_id=feedback_tenant_id,
            workflow_id=feedback_workflow_id,
        ).current_score

    return ProductAnalyticsResponse(
        period_since=since,
        period_until=until,
        total_receipts=total_receipts,
        allowed_receipts=allowed,
        denied_receipts=denied,
        other_receipts=others,
        success_rate=success_rate,
        by_tool=by_tool,
        total_metering_events=len(events),
        total_metering_cost_usd=meter_cost,
        avg_run_duration_ms=avg_duration,
        unique_tenants=len(tenants),
        unique_workflows=len(workflows),
        top_workflows_by_cost=top_workflows[:5],
        improvement_score=improvement_score,
    )


def product_feature_matrix() -> dict[str, Any]:
    """Internal helper for matrix export from roadmap tools."""
    feats = get_features(amc_fit_only=True)
    out: dict[str, Any] = {"high": 0, "medium": 0, "low": 0}
    for feat in feats:
        out[feat.relevance.value] = out.get(feat.relevance.value, 0) + 1
    return out


# ---------------------------------------------------------------------------
# Prompt & workflow version control API
# ---------------------------------------------------------------------------


class ArtifactType(str, Enum):
    PROMPT = "prompt"
    WORKFLOW = "workflow"


class VersionSnapshotRequest(BaseModel):
    artifact_type: ArtifactType
    artifact_id: str
    content: dict[str, Any]
    note: str = ""


class VersionSnapshotResponse(BaseModel):
    artifact_type: str
    artifact_id: str
    version: int
    parent_version: int | None = None
    created_at: str
    note: str


class VersionDiffRequest(BaseModel):
    artifact_type: ArtifactType
    artifact_id: str
    from_version: int | None = None
    to_version: int | None = None


class VersionDiffResponse(BaseModel):
    artifact_type: str
    artifact_id: str
    from_version: int | None = None
    to_version: int | None = None
    added: list[str] = Field(default_factory=list)
    removed: list[str] = Field(default_factory=list)
    changed: list[str] = Field(default_factory=list)
    from_content: dict[str, Any] = Field(default_factory=dict)
    to_content: dict[str, Any] = Field(default_factory=dict)


class VersionRollbackRequest(BaseModel):
    artifact_type: ArtifactType
    artifact_id: str
    target_version: int


class VersionRollbackResponse(BaseModel):
    artifact_type: str
    artifact_id: str
    version: int
    note: str
    created_at: str
    parent_version: int | None = None


@versions_router.post("/versions/snapshot", response_model=VersionSnapshotResponse)
def version_snapshot(payload: VersionSnapshotRequest) -> VersionSnapshotResponse:
    """Create a prompt/workflow snapshot and return its metadata."""
    store = get_version_control_store()
    record = store.snapshot(
        artifact_type=payload.artifact_type.value,
        artifact_id=payload.artifact_id,
        content=payload.content,
        note=payload.note,
    )
    return VersionSnapshotResponse(
        artifact_type=record.artifact_type,
        artifact_id=record.artifact_id,
        version=record.version,
        parent_version=record.parent_version,
        created_at=record.created_at,
        note=record.note,
    )


@versions_router.post("/versions/diff", response_model=VersionDiffResponse)
def version_diff(payload: VersionDiffRequest) -> VersionDiffResponse:
    """Compute a key-aware diff between two snapshots of the same artifact."""
    store = get_version_control_store()
    diff = store.diff(
        artifact_type=payload.artifact_type.value,
        artifact_id=payload.artifact_id,
        from_version=payload.from_version,
        to_version=payload.to_version,
    )
    return VersionDiffResponse(**diff.model_dump())


@versions_router.post("/versions/rollback", response_model=VersionRollbackResponse)
def version_rollback(payload: VersionRollbackRequest) -> VersionRollbackResponse:
    """Rollback an artifact by creating a new snapshot at target content."""
    store = get_version_control_store()
    record = store.rollback(
        artifact_type=payload.artifact_type.value,
        artifact_id=payload.artifact_id,
        target_version=payload.target_version,
        create_new_snapshot=True,
    )
    return VersionRollbackResponse(
        artifact_type=record.artifact_type,
        artifact_id=record.artifact_id,
        version=record.version,
        note=record.note,
        created_at=record.created_at,
        parent_version=record.parent_version,
    )


# ---------------------------------------------------------------------------
# Tool contract validator APIs
# ---------------------------------------------------------------------------


_contract_registry = ToolContractRegistry()


class ToolContractCheckRequest(BaseModel):
    tool_name: str
    contract: dict[str, Any]
    invocation: dict[str, Any]


class ToolContractCheckResponse(BaseModel):
    tool_name: str
    valid: bool
    missing: list[str] = Field(default_factory=list)
    unexpected: list[str] = Field(default_factory=list)
    type_issues: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    repaired_payload: dict[str, Any] = Field(default_factory=dict)


class ToolContractRepairRequest(BaseModel):
    tool_name: str
    contract: dict[str, Any]
    invocation: dict[str, Any]


class ToolContractRepairResponse(BaseModel):
    tool_name: str
    repaired_payload: dict[str, Any]
    notes: list[str]


@tool_contract_router.post("/tool-contract/check", response_model=ToolContractCheckResponse)
def tool_contract_check(payload: ToolContractCheckRequest) -> ToolContractCheckResponse:
    """Validate invocation parameters against a contract and return schema checks."""
    _contract_registry.register(payload.contract)
    result = validate_tool_contract(_contract_registry, payload.tool_name, payload.invocation)
    return ToolContractCheckResponse(**result.model_dump())


@tool_contract_router.post("/tool-contract/repair", response_model=ToolContractRepairResponse)
def tool_contract_repair(payload: ToolContractRepairRequest) -> ToolContractRepairResponse:
    """Return a repaired copy of invocation for this contract."""
    contract = _contract_registry.register(payload.contract)
    repaired, notes = repair_tool_call(payload.invocation, contract)
    return ToolContractRepairResponse(
        tool_name=payload.tool_name,
        repaired_payload=repaired,
        notes=notes,
    )


# ---------------------------------------------------------------------------
# Failure clustering API
# ---------------------------------------------------------------------------


@failure_router.post("/failures/cluster", response_model=FailureClusterResponse)
def cluster_failures_route(payload: FailureClusterRequest) -> FailureClusterResponse:
    """Group watch findings/failures by pattern and return root-cause summaries."""
    summary = summarize_failure_clusters(payload.findings)
    return summary


# ===========================================================================
# Persona & preference manager API  (Feature #27)
# ===========================================================================


class PersonaCreateRequest(BaseModel):
    tenant_id: str
    name: str
    tone: str = "professional"
    style: str = "concise"
    brand_voice: str = ""
    forbidden_words: list[str] = Field(default_factory=list)
    preferred_words: dict[str, str] = Field(default_factory=dict)
    signature: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class PersonaUpdateRequest(BaseModel):
    tone: str | None = None
    style: str | None = None
    brand_voice: str | None = None
    forbidden_words: list[str] | None = None
    preferred_words: dict[str, str] | None = None
    signature: str | None = None
    active: bool | None = None
    metadata: dict[str, Any] | None = None


class PersonaApplyRequest(BaseModel):
    text: str
    persona_id: str


class PersonaApplyResponse(BaseModel):
    original: str
    transformed: str
    persona_id: str
    replacements_made: list[str] = Field(default_factory=list)
    forbidden_hits: list[str] = Field(default_factory=list)
    signature_appended: bool = False


@persona_router.post("/personas", response_model=dict)
def create_persona(payload: PersonaCreateRequest) -> dict:
    """Create a new tenant persona."""
    mgr = get_persona_manager()
    try:
        inp = PersonaInput(
            tenant_id=payload.tenant_id,
            name=payload.name,
            tone=payload.tone,
            style=payload.style,
            brand_voice=payload.brand_voice,
            forbidden_words=payload.forbidden_words,
            preferred_words=payload.preferred_words,
            signature=payload.signature,
            metadata=payload.metadata,
        )
        record = mgr.create(inp)
        return record.dict
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@persona_router.get("/personas/{persona_id}", response_model=dict)
def get_persona(persona_id: str) -> dict:
    """Fetch a persona by ID."""
    mgr = get_persona_manager()
    record = mgr.get(persona_id)
    if not record:
        raise HTTPException(status_code=404, detail="Persona not found")
    return record.dict


@persona_router.get("/personas", response_model=list)
def list_personas(
    tenant_id: str = Query(...),
    active_only: bool = True,
) -> list:
    """List all personas for a tenant."""
    mgr = get_persona_manager()
    return [r.dict for r in mgr.list_for_tenant(tenant_id, active_only=active_only)]


@persona_router.patch("/personas/{persona_id}", response_model=dict)
def update_persona(persona_id: str, payload: PersonaUpdateRequest) -> dict:
    """Partially update a persona."""
    mgr = get_persona_manager()
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    try:
        record = mgr.update(persona_id, updates)
        return record.dict
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@persona_router.delete("/personas/{persona_id}", response_model=dict)
def delete_persona(persona_id: str) -> dict:
    """Soft-delete (deactivate) a persona."""
    mgr = get_persona_manager()
    deleted = mgr.delete(persona_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Persona not found")
    return {"persona_id": persona_id, "deleted": True}


@persona_router.post("/personas/apply", response_model=PersonaApplyResponse)
def apply_persona_route(payload: PersonaApplyRequest) -> PersonaApplyResponse:
    """Apply a persona's preferences to text."""
    mgr = get_persona_manager()
    try:
        result = mgr.apply(payload.text, payload.persona_id)
        return PersonaApplyResponse(
            original=result.original,
            transformed=result.transformed,
            persona_id=result.persona_id,
            replacements_made=result.replacements_made,
            forbidden_hits=result.forbidden_hits,
            signature_appended=result.signature_appended,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ===========================================================================
# Domain glossary + terminology enforcer API  (Feature #29)
# ===========================================================================


class TermRegisterRequest(BaseModel):
    tenant_id: str
    canonical: str
    variants: list[str] = Field(default_factory=list)
    definition: str = ""
    domain: str = "general"
    severity: str = "warning"
    metadata: dict[str, Any] = Field(default_factory=dict)


class EnforceRequest(BaseModel):
    tenant_id: str
    text: str
    auto_correct: bool = True


@glossary_router.post("/glossary/terms", response_model=dict)
def register_term(payload: TermRegisterRequest) -> dict:
    """Register or update a glossary term."""
    mgr = get_glossary_manager()
    try:
        inp = TermInput(
            tenant_id=payload.tenant_id,
            canonical=payload.canonical,
            variants=payload.variants,
            definition=payload.definition,
            domain=payload.domain,
            severity=payload.severity,
            metadata=payload.metadata,
        )
        record = mgr.register(inp)
        return record.dict
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@glossary_router.get("/glossary/terms", response_model=list)
def list_glossary_terms(
    tenant_id: str = Query(...),
    domain: str | None = None,
    active_only: bool = True,
) -> list:
    """List glossary terms for a tenant."""
    mgr = get_glossary_manager()
    return [t.dict for t in mgr.list_terms(tenant_id, domain=domain, active_only=active_only)]


@glossary_router.get("/glossary/terms/{term_id}", response_model=dict)
def get_glossary_term(term_id: str) -> dict:
    mgr = get_glossary_manager()
    term = mgr.get(term_id)
    if not term:
        raise HTTPException(status_code=404, detail="Term not found")
    return term.dict


@glossary_router.delete("/glossary/terms/{term_id}", response_model=dict)
def delete_glossary_term(term_id: str) -> dict:
    mgr = get_glossary_manager()
    ok = mgr.delete(term_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Term not found")
    return {"term_id": term_id, "deleted": True}


@glossary_router.post("/glossary/enforce", response_model=dict)
def enforce_terminology(payload: EnforceRequest) -> dict:
    """Check text for terminology violations and return corrections."""
    mgr = get_glossary_manager()
    result = mgr.enforce(payload.text, payload.tenant_id, auto_correct=payload.auto_correct)
    return result.dict


# ===========================================================================
# Unstructured-to-structured extractor API  (Feature #30)
# ===========================================================================


class ExtractRequest(BaseModel):
    text: str
    entity_types: list[str] = Field(default_factory=list)
    context_window: int = 40
    metadata: dict[str, Any] = Field(default_factory=dict)


@extractor_router.post("/extract", response_model=dict)
def extract_entities(payload: ExtractRequest) -> dict:
    """Extract entities (vendors, amounts, dates, SKUs, etc.) from text."""
    extractor = get_extractor()
    result = extractor.extract(
        ExtractionInput(
            text=payload.text,
            entity_types=payload.entity_types,
            context_window=payload.context_window,
            metadata=payload.metadata,
        )
    )
    return result.dict


# ===========================================================================
# Context pack generator API  (Feature #31)
# ===========================================================================


class ContextSourceRequest(BaseModel):
    source_type: str
    source_id: str
    title: str
    content: str
    relevance_score: float = 1.0
    metadata: dict[str, Any] = Field(default_factory=dict)


class ContextPackBuildRequest(BaseModel):
    tenant_id: str
    task_type: str
    task_ref: str = ""
    sources: list[ContextSourceRequest] = Field(default_factory=list)
    token_budget: int = 2000
    priority_fields: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


@context_pack_router.post("/context-pack", response_model=dict)
def build_context_pack(payload: ContextPackBuildRequest) -> dict:
    """Build a minimal task-specific context pack from provided sources."""
    gen = get_context_pack_generator()
    sources = [
        PackSource(
            source_type=s.source_type,
            source_id=s.source_id,
            title=s.title,
            content=s.content,
            relevance_score=s.relevance_score,
            metadata=s.metadata,
        )
        for s in payload.sources
    ]
    inp = ContextPackInput(
        tenant_id=payload.tenant_id,
        task_type=payload.task_type,
        task_ref=payload.task_ref,
        sources=sources,
        token_budget=payload.token_budget,
        priority_fields=payload.priority_fields,
        keywords=payload.keywords,
        metadata=payload.metadata,
    )
    record = gen.build(inp)
    return record.dict


@context_pack_router.get("/context-pack/{pack_id}", response_model=dict)
def get_context_pack(pack_id: str) -> dict:
    """Retrieve a stored context pack by ID."""
    gen = get_context_pack_generator()
    record = gen.get(pack_id)
    if not record:
        raise HTTPException(status_code=404, detail="Context pack not found")
    return record.dict


@context_pack_router.get("/context-pack", response_model=list)
def list_context_packs(
    tenant_id: str = Query(...),
    task_type: str | None = None,
    task_ref: str | None = None,
    limit: int = 50,
) -> list:
    """List context packs for a tenant."""
    gen = get_context_pack_generator()
    return [
        r.dict
        for r in gen.list_packs(tenant_id, task_type=task_type, task_ref=task_ref, limit=limit)
    ]


@context_pack_router.delete("/context-pack/{pack_id}", response_model=dict)
def delete_context_pack(pack_id: str) -> dict:
    gen = get_context_pack_generator()
    ok = gen.delete(pack_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Context pack not found")
    return {"pack_id": pack_id, "deleted": True}


# ===========================================================================
# Data quality monitor API  (Feature #35)
# ===========================================================================


class DQCheckRequest(BaseModel):
    tenant_id: str
    record_type: str
    record_id: str
    record: dict[str, Any]
    required_fields: list[str] = Field(default_factory=list)
    stale_fields: dict[str, int] = Field(default_factory=dict)
    unique_fields: list[str] = Field(default_factory=list)
    corpus: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class DQThresholdRequest(BaseModel):
    tenant_id: str
    record_type: str
    check_type: str
    threshold_value: float
    field_name: str = "*"
    severity: str = "warning"
    metadata: dict[str, Any] = Field(default_factory=dict)


@data_quality_router.post("/data-quality/check", response_model=dict)
def dq_check(payload: DQCheckRequest) -> dict:
    """Run data quality checks on a record."""
    monitor = get_data_quality_monitor()
    inp = CheckInput(
        tenant_id=payload.tenant_id,
        record_type=payload.record_type,
        record_id=payload.record_id,
        record=payload.record,
        required_fields=payload.required_fields,
        stale_fields=payload.stale_fields,
        unique_fields=payload.unique_fields,
        corpus=payload.corpus,
        metadata=payload.metadata,
    )
    report = monitor.check(inp)
    return report.dict


@data_quality_router.get("/data-quality/reports", response_model=list)
def list_dq_reports(
    tenant_id: str = Query(...),
    record_type: str | None = None,
    record_id: str | None = None,
    min_score: float | None = None,
    max_score: float | None = None,
    limit: int = 100,
) -> list:
    """List data quality reports for a tenant."""
    monitor = get_data_quality_monitor()
    reports = monitor.list_reports(
        tenant_id=tenant_id,
        record_type=record_type,
        record_id=record_id,
        min_score=min_score,
        max_score=max_score,
        limit=limit,
    )
    return [r.dict for r in reports]


@data_quality_router.get("/data-quality/reports/{report_id}", response_model=dict)
def get_dq_report(report_id: str) -> dict:
    monitor = get_data_quality_monitor()
    report = monitor.get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report.dict


@data_quality_router.get("/data-quality/summary", response_model=dict)
def dq_batch_summary(
    tenant_id: str = Query(...),
    record_type: str = Query(...),
    limit: int = 500,
) -> dict:
    """Aggregate quality summary for a record type."""
    monitor = get_data_quality_monitor()
    return monitor.batch_summary(tenant_id, record_type, limit=limit).dict


@data_quality_router.post("/data-quality/thresholds", response_model=dict)
def set_dq_threshold(payload: DQThresholdRequest) -> dict:
    """Create or update an alert threshold."""
    monitor = get_data_quality_monitor()
    try:
        inp = ThresholdInput(
            tenant_id=payload.tenant_id,
            record_type=payload.record_type,
            check_type=payload.check_type,
            threshold_value=payload.threshold_value,
            field_name=payload.field_name,
            severity=payload.severity,
            metadata=payload.metadata,
        )
        record = monitor.set_threshold(inp)
        return record.dict
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@data_quality_router.get("/data-quality/thresholds", response_model=list)
def list_dq_thresholds(
    tenant_id: str = Query(...),
    record_type: str | None = None,
    active_only: bool = True,
) -> list:
    """List alert thresholds for a tenant."""
    monitor = get_data_quality_monitor()
    return [
        t.dict
        for t in monitor.list_thresholds(tenant_id, record_type=record_type, active_only=active_only)
    ]


@data_quality_router.delete("/data-quality/thresholds/{threshold_id}", response_model=dict)
def delete_dq_threshold(threshold_id: str) -> dict:
    monitor = get_data_quality_monitor()
    ok = monitor.delete_threshold(threshold_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Threshold not found")
    return {"threshold_id": threshold_id, "deleted": True}


# ==========================================================================
# F47 — Cost + Latency Optimization Router
# ==========================================================================


class RoutingRequest(BaseModel):
    task_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    task_type: str = TaskType.GENERIC.value
    quality_floor: float = Field(0.7, ge=0.0, le=1.0)
    latency_sla_ms: int = Field(10000, ge=100)
    cost_cap_usd: float = Field(0.10, ge=0.0)
    estimated_tokens: int = Field(1000, ge=1)
    tenant_id: str = ""
    workflow_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class RoutingOutcomeRequest(BaseModel):
    observed_cost_usd: float = Field(..., ge=0.0)
    observed_latency_ms: int = Field(..., ge=0)
    outcome_quality: float | None = Field(None, ge=0.0, le=1.0)


class RegisterProfileRequest(BaseModel):
    profile_name: str
    model_tier: str = ModelTier.STANDARD.value
    max_tokens: int = 2048
    tool_timeout_ms: int = 5000
    cost_per_1k_tokens_usd: float = 0.002
    avg_latency_ms: int = 1500
    quality_score: float = Field(0.85, ge=0.0, le=1.0)
    task_types: list[str] = Field(default_factory=lambda: ["generic"])


@routing_router.post("/routing/route", response_model=dict)
def route_task(payload: RoutingRequest) -> dict:
    """Select the optimal model/tool profile for a task."""
    router_svc = get_cost_latency_router()
    task = TaskDescriptor(
        task_id=payload.task_id,
        task_type=TaskType(payload.task_type) if payload.task_type in TaskType.__members__.values() else TaskType.GENERIC,
        quality_floor=payload.quality_floor,
        latency_sla_ms=payload.latency_sla_ms,
        cost_cap_usd=payload.cost_cap_usd,
        estimated_tokens=payload.estimated_tokens,
        tenant_id=payload.tenant_id,
        workflow_id=payload.workflow_id,
        metadata=payload.metadata,
    )
    decision = router_svc.route(task)
    return decision.as_dict


@routing_router.post("/routing/{decision_id}/outcome", response_model=dict)
def record_routing_outcome(decision_id: str, payload: RoutingOutcomeRequest) -> dict:
    """Feed observed performance back to update the routing record."""
    router_svc = get_cost_latency_router()
    router_svc.record_outcome(
        decision_id=decision_id,
        observed_cost_usd=payload.observed_cost_usd,
        observed_latency_ms=payload.observed_latency_ms,
        outcome_quality=payload.outcome_quality,
    )
    return {"decision_id": decision_id, "updated": True}


@routing_router.get("/routing/decisions", response_model=list)
def list_routing_decisions(
    tenant_id: str | None = None,
    workflow_id: str | None = None,
    profile: str | None = None,
    limit: int = Query(100, ge=1, le=1000),
) -> list:
    """Query routing decisions."""
    router_svc = get_cost_latency_router()
    decisions = router_svc.query_decisions(
        tenant_id=tenant_id,
        workflow_id=workflow_id,
        profile=profile,
        limit=limit,
    )
    return [d.as_dict for d in decisions]


@routing_router.get("/routing/summary", response_model=dict)
def routing_cost_summary(tenant_id: str | None = None) -> dict:
    """Aggregate cost/latency statistics by profile."""
    router_svc = get_cost_latency_router()
    return router_svc.cost_summary(tenant_id=tenant_id)


@routing_router.post("/routing/profiles", response_model=dict)
def register_routing_profile(payload: RegisterProfileRequest) -> dict:
    """Register or update a routing profile."""
    from amc.product.cost_latency_router import RoutingProfile as _RoutingProfile
    router_svc = get_cost_latency_router()
    profile = _RoutingProfile(
        profile_name=payload.profile_name,
        model_tier=ModelTier(payload.model_tier),
        max_tokens=payload.max_tokens,
        tool_timeout_ms=payload.tool_timeout_ms,
        cost_per_1k_tokens_usd=payload.cost_per_1k_tokens_usd,
        avg_latency_ms=payload.avg_latency_ms,
        quality_score=payload.quality_score,
        task_types=payload.task_types,
    )
    router_svc.register_profile(profile)
    return {"profile_name": payload.profile_name, "registered": True}


# ==========================================================================
# F48 — A/B Testing Platform
# ==========================================================================


class ExperimentCreateRequest(BaseModel):
    name: str
    description: str = ""
    primary_metric: str = "success_rate"
    traffic_percent: float = Field(100.0, ge=0.0, le=100.0)
    min_sample_size: int = Field(100, ge=1)
    variants: list[dict[str, Any]] | None = None


class ObservationRequest(BaseModel):
    variant_id: str
    subject_id: str
    primary_metric_value: float
    run_id: str = ""
    secondary_metrics: dict[str, float] | None = None


@ab_router.post("/ab/experiments", response_model=dict)
def create_ab_experiment(payload: ExperimentCreateRequest) -> dict:
    """Create a new A/B experiment."""
    platform = get_ab_platform()
    exp = platform.create_experiment(
        name=payload.name,
        description=payload.description,
        primary_metric=payload.primary_metric,
        traffic_percent=payload.traffic_percent,
        min_sample_size=payload.min_sample_size,
        variants=payload.variants,
    )
    return exp.as_dict


@ab_router.post("/ab/experiments/{experiment_id}/start", response_model=dict)
def start_ab_experiment(experiment_id: str) -> dict:
    """Start an experiment."""
    platform = get_ab_platform()
    try:
        exp = platform.start_experiment(experiment_id)
        return exp.as_dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@ab_router.post("/ab/experiments/{experiment_id}/stop", response_model=dict)
def stop_ab_experiment(experiment_id: str, conclude: bool = False) -> dict:
    """Stop an experiment (optionally mark as concluded)."""
    platform = get_ab_platform()
    try:
        exp = platform.stop_experiment(experiment_id, conclude=conclude)
        return exp.as_dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@ab_router.get("/ab/experiments/{experiment_id}/assign", response_model=dict)
def assign_ab_variant(experiment_id: str, subject_id: str) -> dict:
    """Get (or create) a deterministic variant assignment for a subject."""
    platform = get_ab_platform()
    assignment = platform.assign_variant(experiment_id, subject_id)
    if assignment is None:
        raise HTTPException(status_code=409, detail="Experiment not running or not found")
    return {
        "experiment_id": assignment.experiment_id,
        "subject_id": assignment.subject_id,
        "variant_id": assignment.variant_id,
        "assigned_at": assignment.assigned_at,
        "variant_config": assignment.variant_config,
    }


@ab_router.post("/ab/experiments/{experiment_id}/observe", response_model=dict)
def record_ab_observation(experiment_id: str, payload: ObservationRequest) -> dict:
    """Record a metric observation for an experiment variant."""
    platform = get_ab_platform()
    obs_id = platform.record_observation(
        experiment_id=experiment_id,
        variant_id=payload.variant_id,
        subject_id=payload.subject_id,
        primary_metric_value=payload.primary_metric_value,
        run_id=payload.run_id,
        secondary_metrics=payload.secondary_metrics,
    )
    return {"obs_id": obs_id, "experiment_id": experiment_id}


@ab_router.get("/ab/experiments/{experiment_id}/analyze", response_model=dict)
def analyze_ab_experiment(experiment_id: str) -> dict:
    """Run statistical analysis and return winner/stats."""
    platform = get_ab_platform()
    try:
        analysis = platform.analyze(experiment_id)
        return analysis.as_dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@ab_router.get("/ab/experiments", response_model=list)
def list_ab_experiments(
    status: str | None = None,
    limit: int = Query(50, ge=1, le=500),
) -> list:
    """List experiments with optional status filter."""
    platform = get_ab_platform()
    status_enum = ExperimentStatus(status) if status else None
    experiments = platform.list_experiments(status=status_enum, limit=limit)
    return [e.as_dict for e in experiments]


@ab_router.get("/ab/experiments/{experiment_id}", response_model=dict)
def get_ab_experiment(experiment_id: str) -> dict:
    """Get a single experiment by ID."""
    platform = get_ab_platform()
    exp = platform.get_experiment(experiment_id)
    if exp is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return exp.as_dict


# ==========================================================================
# F25 — Workflow Rollout Manager
# ==========================================================================


class RolloutCreateRequest(BaseModel):
    artifact_id: str
    artifact_type: str = "workflow"
    description: str = ""
    stages: list[dict[str, Any]] | None = None
    success_metric: str = "success_rate"
    min_sample: int = Field(50, ge=1)
    promote_threshold: float = Field(0.95, ge=0.0, le=1.0)
    rollback_threshold: float = Field(0.80, ge=0.0, le=1.0)


class RolloutMetricRequest(BaseModel):
    metric_value: float
    subject_id: str = ""
    metric_name: str | None = None


@rollout_router.post("/rollout/plans", response_model=dict)
def create_rollout_plan(payload: RolloutCreateRequest) -> dict:
    """Create a staged rollout plan for a workflow or prompt artifact."""
    mgr = get_rollout_manager()
    plan = mgr.create_plan(
        artifact_id=payload.artifact_id,
        artifact_type=payload.artifact_type,
        description=payload.description,
        stages=payload.stages,
        success_metric=payload.success_metric,
        min_sample=payload.min_sample,
        promote_threshold=payload.promote_threshold,
        rollback_threshold=payload.rollback_threshold,
    )
    return plan.as_dict


@rollout_router.post("/rollout/plans/{plan_id}/start", response_model=dict)
def start_rollout_plan(plan_id: str) -> dict:
    """Start a rollout plan."""
    mgr = get_rollout_manager()
    try:
        plan = mgr.start_plan(plan_id)
        return plan.as_dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@rollout_router.get("/rollout/plans/{plan_id}/traffic", response_model=dict)
def check_traffic_split(plan_id: str, subject_id: str) -> dict:
    """Check whether a subject should receive the new version."""
    mgr = get_rollout_manager()
    is_new = mgr.is_new_version(plan_id=plan_id, subject_id=subject_id)
    plan = mgr.get_plan(plan_id)
    return {
        "plan_id": plan_id,
        "subject_id": subject_id,
        "use_new_version": is_new,
        "current_traffic_percent": plan.current_traffic_percent if plan else None,
    }


@rollout_router.post("/rollout/plans/{plan_id}/metrics", response_model=dict)
def record_rollout_metric(plan_id: str, payload: RolloutMetricRequest) -> dict:
    """Record an observed metric for the current rollout stage."""
    mgr = get_rollout_manager()
    try:
        metric_id = mgr.record_metric(
            plan_id=plan_id,
            metric_value=payload.metric_value,
            subject_id=payload.subject_id,
            metric_name=payload.metric_name,
        )
        return {"metric_id": metric_id, "plan_id": plan_id, "recorded": True}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@rollout_router.post("/rollout/plans/{plan_id}/gate", response_model=dict)
def evaluate_rollout_gate(plan_id: str) -> dict:
    """Evaluate the promotion gate for the current rollout stage."""
    mgr = get_rollout_manager()
    try:
        result = mgr.evaluate_gate(plan_id)
        return result.as_dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@rollout_router.get("/rollout/plans/{plan_id}", response_model=dict)
def get_rollout_plan(plan_id: str) -> dict:
    """Get a rollout plan by ID."""
    mgr = get_rollout_manager()
    plan = mgr.get_plan(plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan.as_dict


@rollout_router.get("/rollout/plans", response_model=list)
def list_rollout_plans(
    artifact_id: str | None = None,
    status: str | None = None,
    limit: int = Query(50, ge=1, le=500),
) -> list:
    """List rollout plans with optional filters."""
    mgr = get_rollout_manager()
    status_enum = RolloutStatus(status) if status else None
    plans = mgr.list_plans(artifact_id=artifact_id, status=status_enum, limit=limit)
    return [p.as_dict for p in plans]


# ==========================================================================
# F11 — Deterministic Replay Debugger
# ==========================================================================


class TraceStartRequest(BaseModel):
    run_id: str
    session_id: str = ""
    tenant_id: str = ""
    workflow_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class TraceEventRequest(BaseModel):
    event_type: str = EventType.TOOL_CALL.value
    actor: str = "agent"
    tool_name: str = ""
    inputs: dict[str, Any] = Field(default_factory=dict)
    outputs: dict[str, Any] = Field(default_factory=dict)
    state_before: dict[str, Any] = Field(default_factory=dict)
    state_after: dict[str, Any] = Field(default_factory=dict)
    duration_ms: int = 0
    error: str = ""


class TraceEndRequest(BaseModel):
    outcome: str = "completed"
    error: str = ""


class ReplayRequest(BaseModel):
    mock_tool_results: dict[str, Any] | None = None


@replay_router.post("/replay/traces", response_model=dict)
def start_trace(payload: TraceStartRequest) -> dict:
    """Start a new run trace recording."""
    debugger = get_replay_debugger()
    trace = debugger.start_trace(
        run_id=payload.run_id,
        session_id=payload.session_id,
        tenant_id=payload.tenant_id,
        workflow_id=payload.workflow_id,
        metadata=payload.metadata,
    )
    return {"trace_id": trace.trace_id, "run_id": trace.run_id, "started_at": trace.started_at}


@replay_router.post("/replay/traces/{trace_id}/events", response_model=dict)
def record_trace_event(trace_id: str, payload: TraceEventRequest) -> dict:
    """Record a single event within an active trace."""
    debugger = get_replay_debugger()
    try:
        event_type = EventType(payload.event_type)
    except ValueError:
        event_type = EventType.TOOL_CALL
    event = debugger.record_event(
        trace_id=trace_id,
        event_type=event_type,
        actor=payload.actor,
        tool_name=payload.tool_name,
        inputs=payload.inputs,
        outputs=payload.outputs,
        state_before=payload.state_before,
        state_after=payload.state_after,
        duration_ms=payload.duration_ms,
        error=payload.error,
    )
    return {"event_id": event.event_id, "seq": event.seq, "event_hash": event.event_hash}


@replay_router.post("/replay/traces/{trace_id}/end", response_model=dict)
def end_trace(trace_id: str, payload: TraceEndRequest) -> dict:
    """Mark a trace as completed."""
    debugger = get_replay_debugger()
    trace = debugger.end_trace(
        trace_id=trace_id,
        outcome=payload.outcome,
        error=payload.error,
    )
    return {"trace_id": trace.trace_id, "status": trace.status.value, "event_count": len(trace.events)}


@replay_router.post("/replay/traces/{trace_id}/replay", response_model=dict)
def replay_trace(trace_id: str, payload: ReplayRequest) -> dict:
    """Replay a recorded trace and return divergence analysis."""
    debugger = get_replay_debugger()
    try:
        result = debugger.replay(trace_id=trace_id, mock_tool_results=payload.mock_tool_results)
        return result.as_dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@replay_router.get("/replay/traces/{trace_id}", response_model=dict)
def get_trace(trace_id: str) -> dict:
    """Fetch a trace with all its events."""
    debugger = get_replay_debugger()
    trace = debugger.get_trace(trace_id)
    if trace is None:
        raise HTTPException(status_code=404, detail="Trace not found")
    return trace.as_dict


@replay_router.get("/replay/traces", response_model=list)
def list_traces(
    tenant_id: str | None = None,
    workflow_id: str | None = None,
    run_id: str | None = None,
    limit: int = Query(50, ge=1, le=500),
) -> list:
    """List traces with optional filters."""
    debugger = get_replay_debugger()
    traces = debugger.list_traces(
        tenant_id=tenant_id,
        workflow_id=workflow_id,
        run_id=run_id,
        limit=limit,
    )
    return [t.as_dict for t in traces]


# ==========================================================================
# F6 — Agent Scaffolding CLI
# ==========================================================================


class ScaffoldRequest(BaseModel):
    agent_name: str
    template: str = AgentTemplate.BASIC.value
    tools: list[str] | None = None
    description: str = ""


@scaffold_router.post("/scaffold/generate", response_model=dict)
def scaffold_agent(payload: ScaffoldRequest) -> dict:
    """Generate an AMC-compatible agent project skeleton."""
    scaffolder = get_scaffolder()
    try:
        template = AgentTemplate(payload.template)
    except ValueError:
        template = AgentTemplate.BASIC

    project = scaffolder.generate(
        agent_name=payload.agent_name,
        template=template,
        tools=payload.tools,
        description=payload.description,
    )
    return {
        "agent_name": project.agent_name,
        "template": project.template.value,
        "description": project.description,
        "file_count": project.file_count,
        "file_paths": project.file_paths,
        "files": [
            {"path": f.path, "content": f.content}
            for f in project.files
        ],
    }


@scaffold_router.get("/scaffold/templates", response_model=list)
def list_scaffold_templates() -> list:
    """List available agent scaffold templates."""
    scaffolder = get_scaffolder()
    return [
        {
            "template": t.value,
            "default_tools": scaffolder._DEFAULT_TOOLS.get(t, []),
        }
        for t in AgentTemplate
    ]


# ==========================================================================
# F12 — Local Dev Sandbox with Mocked Tools
# ==========================================================================


class MockRegisterRequest(BaseModel):
    name: str
    mode: str = MockMode.STATIC.value
    response: dict[str, Any] | None = None
    sequence: list[dict[str, Any]] | None = None
    error_message: str = "Mock error"
    input_schema: dict[str, Any] | None = None
    output_schema: dict[str, Any] | None = None
    latency_ms: int = 0


class SandboxCallRequest(BaseModel):
    tool_name: str
    params: dict[str, Any] = Field(default_factory=dict)


@devsandbox_router.post("/devsandbox/sessions", response_model=dict)
def create_sandbox_session() -> dict:
    """Create a new isolated dev sandbox session."""
    sandbox = get_dev_sandbox()
    session = sandbox.create_session()
    return {
        "session_id": session.session_id,
        "created_at": session.created_at,
        "available_tools": sandbox.registry.list_tools(),
    }


@devsandbox_router.post("/devsandbox/sessions/{session_id}/call", response_model=dict)
def sandbox_call_tool(session_id: str, payload: SandboxCallRequest) -> dict:
    """Call a mock tool within a sandbox session."""
    sandbox = get_dev_sandbox()
    try:
        result = sandbox.call_tool(
            session_id=session_id,
            tool_name=payload.tool_name,
            params=payload.params,
        )
        return {"result": result, "tool_name": payload.tool_name}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@devsandbox_router.get("/devsandbox/sessions/{session_id}", response_model=dict)
def get_sandbox_session(session_id: str) -> dict:
    """Get sandbox session details including call log."""
    sandbox = get_dev_sandbox()
    session = sandbox.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.as_dict


@devsandbox_router.post("/devsandbox/mocks", response_model=dict)
def register_mock_tool(payload: MockRegisterRequest) -> dict:
    """Register or replace a mock tool definition."""
    sandbox = get_dev_sandbox()
    try:
        mode = MockMode(payload.mode)
    except ValueError:
        mode = MockMode.STATIC
    tool = sandbox.register_mock(
        name=payload.name,
        mode=mode,
        response=payload.response,
        sequence=payload.sequence,
        error_message=payload.error_message,
        input_schema=payload.input_schema,
        output_schema=payload.output_schema,
    )
    return {"tool_name": tool.name, "mode": tool.response.mode.value, "registered": True}


@devsandbox_router.get("/devsandbox/mocks", response_model=list)
def list_mock_tools() -> list:
    """List all available mock tools."""
    sandbox = get_dev_sandbox()
    tools = sandbox.registry.list_tools()
    return [{"tool_name": t, "call_count": sandbox.registry.stats().get(t, 0)} for t in tools]


# ---------------------------------------------------------------------------
# Orchestration: Job Queue + Escalation Queue
# ---------------------------------------------------------------------------

from amc.product.jobs import SubmitParams, get_queue, reset_queue as _reset_job_queue
from amc.product.escalation import (
    EscalationTicket,
    get_queue as get_escalation_queue,
)


class QueueSubmitRequest(BaseModel):
    task_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    priority: int = 5
    sla_seconds: float | None = None
    idempotency_key: str | None = None


class QueueClaimRequest(BaseModel):
    worker_id: str = "worker"


class QueueAckRequest(BaseModel):
    job_id: str
    worker_id: str | None = None
    success: bool = True
    error: str | None = None


class EscalationSubmitRequest(BaseModel):
    source: str
    summary: str
    category: str = "general"
    severity: str = "low"
    metadata: dict[str, Any] = Field(default_factory=dict)


class EscalationClaimRequest(BaseModel):
    agent: str


class EscalationHandoffRequest(BaseModel):
    to_team: str
    reason: str


@orchestration_router.post("/queue/submit")
def queue_submit(payload: QueueSubmitRequest) -> dict[str, Any]:
    """Submit a job to the priority queue."""
    q = get_queue()
    job_payload = {"task_type": payload.task_type, **payload.payload}
    job = q.submit(SubmitParams(
        payload=job_payload,
        priority=payload.priority,
        sla_seconds=int(payload.sla_seconds) if payload.sla_seconds else 300,
    ))
    return {"job_id": job.id, "state": job.status, "priority": job.priority}


@orchestration_router.post("/queue/claim")
def queue_claim(payload: QueueClaimRequest) -> dict[str, Any]:
    """Claim the next available job."""
    q = get_queue()
    job = q.claim(worker_id=payload.worker_id)
    if job is None:
        return {"job_id": None, "message": "no jobs available"}
    return {"job_id": job.id, "payload": job.payload}


@orchestration_router.post("/queue/ack")
def queue_ack(payload: QueueAckRequest) -> dict[str, Any]:
    """Acknowledge completion or failure for a claimed job."""
    q = get_queue()
    job = q.ack(job_id=payload.job_id, worker_id=payload.worker_id, success=payload.success, error=payload.error)
    return {"job_id": job.id, "state": job.status}


@orchestration_router.get("/queue/retry-stats")
def queue_retry_stats() -> dict[str, Any]:
    """Return queue health stats."""
    stats = get_queue().retry_stats()
    return stats.model_dump() if hasattr(stats, "model_dump") else dict(stats.__dict__)


@orchestration_router.post("/escalation/submit")
def submit_escalation(payload: EscalationSubmitRequest) -> dict[str, Any]:
    """Submit an escalation ticket."""
    eq = get_escalation_queue()
    ticket = eq.submit(
        source=payload.source,
        summary=payload.summary,
        category=payload.category,
        severity=payload.severity,
    )
    return {"id": ticket.id, "route_team": ticket.route_team, "state": ticket.state}


@orchestration_router.post("/escalation/{ticket_id}/claim")
def claim_escalation(ticket_id: str, payload: EscalationClaimRequest) -> dict[str, Any]:
    """Claim an escalation ticket."""
    eq = get_escalation_queue()
    ticket = eq.claim(ticket_id=ticket_id, agent=payload.agent)
    return {"id": ticket.id, "state": ticket.state, "assigned_to": ticket.assigned_to}


@orchestration_router.post("/escalation/{ticket_id}/handoff")
def handoff_escalation(ticket_id: str, payload: EscalationHandoffRequest) -> dict[str, Any]:
    """Handoff an escalation ticket to another team."""
    eq = get_escalation_queue()
    ticket = eq.handoff(ticket_id=ticket_id, to_team=payload.to_team, reason=payload.reason)
    return {"id": ticket.id, "state": ticket.state, "route_team": ticket.route_team}


@orchestration_router.post("/escalation/{ticket_id}/resolve")
def resolve_escalation(ticket_id: str) -> dict[str, Any]:
    """Resolve an escalation ticket."""
    eq = get_escalation_queue()
    ticket = eq.resolve(ticket_id=ticket_id)
    return {"id": ticket.id, "state": ticket.state}


@orchestration_router.get("/escalation/stats")
def escalation_stats() -> dict[str, Any]:
    """Return escalation queue summary."""
    from amc.product.escalation import escalation_summary
    return escalation_summary(get_escalation_queue()).model_dump()


# ===========================================================================
# WAVE 2 — Autonomy Dial  (/api/v1/product/autonomy)
# ===========================================================================


class PolicySetRequest(BaseModel):
    tenant_id: str
    task_type: str
    mode: str = AutonomyMode.CONDITIONAL.value
    confidence_threshold: float = Field(0.85, ge=0.0, le=1.0)
    description: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class AutonomyDecideRequest(BaseModel):
    tenant_id: str
    task_type: str
    confidence: float = Field(1.0, ge=0.0, le=1.0)
    context: dict[str, Any] = Field(default_factory=dict)


@autonomy_router.post("/autonomy/policies", response_model=dict)
def set_autonomy_policy(payload: PolicySetRequest) -> dict:
    """Create or update the ask-vs-act policy for a task type."""
    dial = get_autonomy_dial()
    try:
        mode = AutonomyMode(payload.mode)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid mode '{payload.mode}'.")
    record = dial.set_policy(
        PolicyInput(
            tenant_id=payload.tenant_id,
            task_type=payload.task_type,
            mode=mode,
            confidence_threshold=payload.confidence_threshold,
            description=payload.description,
            metadata=payload.metadata,
        )
    )
    return record.dict


@autonomy_router.get("/autonomy/policies", response_model=list)
def list_autonomy_policies(tenant_id: str = Query(...), active_only: bool = True) -> list:
    """List all autonomy policies for a tenant."""
    return [p.dict for p in get_autonomy_dial().list_policies(tenant_id, active_only=active_only)]


@autonomy_router.delete("/autonomy/policies/{policy_id}", response_model=dict)
def delete_autonomy_policy(policy_id: str) -> dict:
    ok = get_autonomy_dial().delete_policy(policy_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Policy not found")
    return {"policy_id": policy_id, "deleted": True}


@autonomy_router.post("/autonomy/decide", response_model=dict)
def autonomy_decide(payload: AutonomyDecideRequest) -> dict:
    """Resolve the ask-vs-act decision for a task, returns should_ask bool."""
    decision = get_autonomy_dial().decide(
        tenant_id=payload.tenant_id,
        task_type=payload.task_type,
        confidence=payload.confidence,
        context=payload.context,
    )
    return decision.dict


@autonomy_router.get("/autonomy/decisions", response_model=list)
def list_autonomy_decisions(
    tenant_id: str | None = None,
    task_type: str | None = None,
    limit: int = Query(50, ge=1, le=500),
) -> list:
    return [d.dict for d in get_autonomy_dial().list_decisions(tenant_id, task_type, limit)]


@autonomy_router.get("/autonomy/defaults", response_model=dict)
def get_default_modes() -> dict:
    """Return the built-in default autonomy ladder."""
    return get_autonomy_dial().default_modes()


# ===========================================================================
# WAVE 2 — Goal Tracker  (/api/v1/product/goals)
# ===========================================================================


class GoalCreateRequest(BaseModel):
    tenant_id: str
    title: str
    description: str = ""
    session_id: str = ""
    keywords: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class GoalDecomposeRequest(BaseModel):
    milestones: list[dict[str, Any]]


class MilestoneUpdateRequest(BaseModel):
    status: str


class DriftCheckRequest(BaseModel):
    action_summary: str
    metadata: dict[str, Any] = Field(default_factory=dict)


@goals_router.post("/goals", response_model=dict)
def create_goal(payload: GoalCreateRequest) -> dict:
    """Create a new goal."""
    tracker = get_goal_tracker()
    record = tracker.create_goal(
        GoalInput(
            tenant_id=payload.tenant_id,
            title=payload.title,
            description=payload.description,
            session_id=payload.session_id,
            keywords=payload.keywords,
            metadata=payload.metadata,
        )
    )
    return record.dict


@goals_router.get("/goals/{goal_id}", response_model=dict)
def get_goal(goal_id: str) -> dict:
    record = get_goal_tracker().get_goal(goal_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    return record.dict


@goals_router.get("/goals", response_model=list)
def list_goals(
    tenant_id: str = Query(...),
    session_id: str | None = None,
    status: str | None = None,
    limit: int = Query(50, ge=1, le=500),
) -> list:
    tracker = get_goal_tracker()
    status_enum = GoalStatus(status) if status else None
    return [g.dict for g in tracker.list_goals(tenant_id, session_id=session_id, status=status_enum, limit=limit)]


@goals_router.post("/goals/{goal_id}/decompose", response_model=list)
def decompose_goal(goal_id: str, payload: GoalDecomposeRequest) -> list:
    """Add milestones to a goal."""
    return [m.dict for m in get_goal_tracker().decompose(goal_id, payload.milestones)]


@goals_router.patch("/goals/{goal_id}/status", response_model=dict)
def update_goal_status_route(goal_id: str, payload: MilestoneUpdateRequest) -> dict:
    try:
        status = GoalStatus(payload.status)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid status '{payload.status}'.")
    record = get_goal_tracker().update_goal_status(goal_id, status)
    if record is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    return record.dict


@goals_router.patch("/goals/milestones/{milestone_id}/status", response_model=dict)
def update_milestone_status_route(milestone_id: str, payload: MilestoneUpdateRequest) -> dict:
    try:
        status = MilestoneStatus(payload.status)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid status '{payload.status}'.")
    record = get_goal_tracker().update_milestone_status(milestone_id, status)
    if record is None:
        raise HTTPException(status_code=404, detail="Milestone not found")
    return record.dict


@goals_router.post("/goals/{goal_id}/drift-check", response_model=dict)
def check_goal_drift(goal_id: str, payload: DriftCheckRequest) -> dict:
    """Evaluate whether an action aligns with the goal."""
    try:
        event = get_goal_tracker().check_drift(
            goal_id=goal_id,
            action_summary=payload.action_summary,
            metadata=payload.metadata,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return event.dict


@goals_router.get("/goals/{goal_id}/drift-events", response_model=list)
def list_drift_events_route(
    goal_id: str,
    aligned_only: bool | None = None,
    limit: int = Query(50, ge=1, le=500),
) -> list:
    return [e.dict for e in get_goal_tracker().list_drift_events(goal_id, aligned_only=aligned_only, limit=limit)]


# ===========================================================================
# WAVE 2 — Loop Detector  (/api/v1/product/loops)
# ===========================================================================


class ActionRecordRequest(BaseModel):
    session_id: str
    tenant_id: str
    action_type: str
    action_summary: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class ActionCheckRequest(BaseModel):
    session_id: str
    tenant_id: str
    metadata: dict[str, Any] = Field(default_factory=dict)


@loops_router.post("/loops/actions", response_model=dict)
def record_action(payload: ActionRecordRequest) -> dict:
    """Record an agent action to history."""
    entry = get_loop_detector().record_action(
        session_id=payload.session_id,
        tenant_id=payload.tenant_id,
        action_type=payload.action_type,
        action_summary=payload.action_summary,
        metadata=payload.metadata,
    )
    return entry.dict


@loops_router.post("/loops/check", response_model=dict)
def check_loops(payload: ActionCheckRequest) -> dict:
    """Check the session for loop/thrash patterns."""
    result = get_loop_detector().check(
        session_id=payload.session_id,
        tenant_id=payload.tenant_id,
        metadata=payload.metadata,
    )
    return result.dict


@loops_router.post("/loops/record-and-check", response_model=dict)
def record_and_check(payload: ActionRecordRequest) -> dict:
    """Record action then immediately check for loops — single call convenience."""
    result = get_loop_detector().record_action_and_check(
        session_id=payload.session_id,
        tenant_id=payload.tenant_id,
        action_type=payload.action_type,
        action_summary=payload.action_summary,
        metadata=payload.metadata,
    )
    return result.dict


@loops_router.post("/loops/detections/{detection_id}/resolve", response_model=dict)
def resolve_loop_detection(detection_id: str) -> dict:
    ok = get_loop_detector().resolve_detection(detection_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Detection not found")
    return {"detection_id": detection_id, "resolved": True}


@loops_router.get("/loops/detections", response_model=list)
def list_loop_detections(
    session_id: str | None = None,
    tenant_id: str | None = None,
    resolved: bool | None = None,
    limit: int = Query(50, ge=1, le=500),
) -> list:
    return [
        d.dict
        for d in get_loop_detector().list_detections(
            session_id=session_id, tenant_id=tenant_id, resolved=resolved, limit=limit
        )
    ]


@loops_router.get("/loops/sessions/{session_id}/history", response_model=list)
def session_action_history(session_id: str, limit: int = Query(50, ge=1, le=500)) -> list:
    return [e.dict for e in get_loop_detector().session_history(session_id, limit=limit)]


# ===========================================================================
# WAVE 2 — Confidence Estimator  (/api/v1/product/confidence)
# ===========================================================================


class EvidenceItemRequest(BaseModel):
    content: str
    source: str = "unknown"
    credibility: float = Field(0.8, ge=0.0, le=1.0)


class ConfidenceEstimateRequest(BaseModel):
    decision_type: str
    description: str
    evidence: list[EvidenceItemRequest] = Field(default_factory=list)
    required_fields: list[str] = Field(default_factory=list)
    available_fields: list[str] = Field(default_factory=list)
    prior_accuracy: float | None = Field(None, ge=0.0, le=1.0)
    session_id: str = ""
    tenant_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class ConfidenceOutcomeRequest(BaseModel):
    outcome: str
    correct: bool


@confidence_router.post("/confidence/estimate", response_model=dict)
def estimate_confidence(payload: ConfidenceEstimateRequest) -> dict:
    """Estimate confidence for a decision point."""
    estimator = get_confidence_estimator()
    inp = ConfidenceInput(
        decision_type=payload.decision_type,
        description=payload.description,
        evidence=[
            EvidenceItem(content=e.content, source=e.source, credibility=e.credibility)
            for e in payload.evidence
        ],
        required_fields=payload.required_fields,
        available_fields=payload.available_fields,
        prior_accuracy=payload.prior_accuracy,
        session_id=payload.session_id,
        tenant_id=payload.tenant_id,
        metadata=payload.metadata,
    )
    return estimator.estimate(inp).dict


@confidence_router.post("/confidence/estimates/{estimate_id}/outcome", response_model=dict)
def record_confidence_outcome(estimate_id: str, payload: ConfidenceOutcomeRequest) -> dict:
    ok = get_confidence_estimator().record_outcome(
        estimate_id=estimate_id, outcome=payload.outcome, correct=payload.correct
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Estimate not found")
    return {"estimate_id": estimate_id, "recorded": True}


@confidence_router.get("/confidence/estimates/{estimate_id}", response_model=dict)
def get_confidence_estimate(estimate_id: str) -> dict:
    est = get_confidence_estimator().get_estimate(estimate_id)
    if est is None:
        raise HTTPException(status_code=404, detail="Estimate not found")
    return est.dict


@confidence_router.get("/confidence/estimates", response_model=list)
def list_confidence_estimates(
    tenant_id: str | None = None,
    session_id: str | None = None,
    decision_type: str | None = None,
    band: str | None = None,
    limit: int = Query(100, ge=1, le=1000),
) -> list:
    band_enum = ConfidenceBand(band) if band else None
    return [
        e.dict
        for e in get_confidence_estimator().list_estimates(
            tenant_id=tenant_id,
            session_id=session_id,
            decision_type=decision_type,
            band=band_enum,
            limit=limit,
        )
    ]


@confidence_router.get("/confidence/accuracy", response_model=dict)
def confidence_accuracy_summary(tenant_id: str = Query(...), decision_type: str | None = None) -> dict:
    """Calibration accuracy by band for a tenant."""
    return get_confidence_estimator().accuracy_summary(tenant_id, decision_type=decision_type)


# ===========================================================================
# WAVE 2 — Conversation State Snapshotter  (/api/v1/product/state)
# ===========================================================================


class DecisionRecordRequest(BaseModel):
    key: str
    value: Any
    outcome: str = DecisionOutcome.CONFIRMED.value
    rationale: str = ""
    turn: int = 0


class PendingActionRequest(BaseModel):
    action_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    action_type: str
    description: str
    status: str = PendingActionStatus.QUEUED.value
    priority: int = 5
    metadata: dict[str, Any] = Field(default_factory=dict)


class SnapshotCreateRequest(BaseModel):
    conversation_id: str
    tenant_id: str
    intent: str
    entities: dict[str, Any] = Field(default_factory=dict)
    decisions: list[DecisionRecordRequest] = Field(default_factory=list)
    pending_actions: list[PendingActionRequest] = Field(default_factory=list)
    context: dict[str, Any] = Field(default_factory=dict)
    summary: str = ""
    session_id: str = ""
    turn_count: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


class RestoreRequest(BaseModel):
    target_version: int
    restored_by: str = "system"
    reason: str = ""


class EntityUpdateRequest(BaseModel):
    updates: dict[str, Any]


@state_router.post("/state/snapshots", response_model=dict)
def create_snapshot(payload: SnapshotCreateRequest) -> dict:
    """Snapshot the current conversation state."""
    mgr = get_state_manager()
    inp = SnapshotInput(
        conversation_id=payload.conversation_id,
        tenant_id=payload.tenant_id,
        intent=payload.intent,
        entities=payload.entities,
        decisions=[
            DecisionRecord(
                key=d.key,
                value=d.value,
                outcome=DecisionOutcome(d.outcome),
                rationale=d.rationale,
                turn=d.turn,
            )
            for d in payload.decisions
        ],
        pending_actions=[
            PendingAction(
                action_id=p.action_id,
                action_type=p.action_type,
                description=p.description,
                status=PendingActionStatus(p.status),
                priority=p.priority,
                metadata=p.metadata,
            )
            for p in payload.pending_actions
        ],
        context=payload.context,
        summary=payload.summary,
        session_id=payload.session_id,
        turn_count=payload.turn_count,
        metadata=payload.metadata,
    )
    return mgr.snapshot(inp).dict


@state_router.get("/state/conversations/{conversation_id}/latest", response_model=dict)
def get_latest_snapshot(conversation_id: str) -> dict:
    snap = get_state_manager().get_latest(conversation_id)
    if snap is None:
        raise HTTPException(status_code=404, detail="No snapshot found")
    return snap.dict


@state_router.get("/state/snapshots/{snapshot_id}", response_model=dict)
def get_snapshot(snapshot_id: str) -> dict:
    snap = get_state_manager().get_snapshot(snapshot_id)
    if snap is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snap.dict


@state_router.get("/state/conversations/{conversation_id}/history", response_model=list)
def list_conversation_snapshots(
    conversation_id: str, limit: int = Query(20, ge=1, le=100)
) -> list:
    return [s.dict for s in get_state_manager().list_snapshots(conversation_id, limit=limit)]


@state_router.get("/state/conversations", response_model=list)
def list_tenant_conversations(
    tenant_id: str = Query(...),
    session_id: str | None = None,
    latest_only: bool = True,
    limit: int = Query(50, ge=1, le=500),
) -> list:
    return [
        s.dict
        for s in get_state_manager().list_for_tenant(
            tenant_id, session_id=session_id, latest_only=latest_only, limit=limit
        )
    ]


@state_router.post("/state/conversations/{conversation_id}/restore", response_model=dict)
def restore_conversation(conversation_id: str, payload: RestoreRequest) -> dict:
    """Restore conversation to a historical snapshot version."""
    try:
        record = get_state_manager().restore(
            conversation_id=conversation_id,
            target_version=payload.target_version,
            restored_by=payload.restored_by,
            reason=payload.reason,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return record.dict


@state_router.patch("/state/conversations/{conversation_id}/entities", response_model=dict)
def update_conversation_entities(conversation_id: str, payload: EntityUpdateRequest) -> dict:
    snap = get_state_manager().update_latest_entities(conversation_id, payload.updates)
    if snap is None:
        raise HTTPException(status_code=404, detail="No snapshot found for conversation")
    return snap.dict


@state_router.delete("/state/conversations/{conversation_id}", response_model=dict)
def delete_conversation_snapshots(conversation_id: str) -> dict:
    deleted = get_state_manager().delete_snapshots(conversation_id)
    return {"conversation_id": conversation_id, "snapshots_deleted": deleted}


# ==========================================================================
# Wave-4: Tool Discovery  — /api/v1/product/tools/discover
# ==========================================================================


class ToolRegisterRequest(BaseModel):
    tool_name: str
    description: str
    capabilities: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    category: str = "general"
    input_schema: dict[str, Any] = Field(default_factory=dict)
    output_schema: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ToolDiscoverRequest(BaseModel):
    intent: str
    top_k: int = Field(5, ge=1, le=20)
    category: str | None = None
    min_success_rate: float = Field(0.0, ge=0.0, le=1.0)


class ToolUsageRecordRequest(BaseModel):
    tool_id: str
    session_id: str = ""
    intent: str = ""
    succeeded: bool = True
    latency_ms: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


@tool_discovery_router.post("/tools/register", response_model=dict)
def register_tool(payload: ToolRegisterRequest) -> dict:
    """Register or update a tool in the discovery registry."""
    engine = get_tool_discovery_engine()
    record = engine.register_tool(
        ToolRegistration(
            tool_name=payload.tool_name,
            description=payload.description,
            capabilities=payload.capabilities,
            tags=payload.tags,
            category=payload.category,
            input_schema=payload.input_schema,
            output_schema=payload.output_schema,
            metadata=payload.metadata,
        )
    )
    return record.dict


@tool_discovery_router.post("/tools/discover", response_model=list)
def discover_tools(payload: ToolDiscoverRequest) -> list:
    """Search tools by natural language intent and rank by relevance + history."""
    engine = get_tool_discovery_engine()
    results = engine.discover(
        intent=payload.intent,
        top_k=payload.top_k,
        category=payload.category,
        min_success_rate=payload.min_success_rate,
    )
    return [r.dict for r in results]


@tool_discovery_router.get("/tools/registry", response_model=list)
def list_registered_tools(
    category: str | None = None,
    active_only: bool = True,
) -> list:
    """List all registered tools."""
    engine = get_tool_discovery_engine()
    return [t.dict for t in engine.list_tools(category=category, active_only=active_only)]


@tool_discovery_router.get("/tools/registry/{tool_id}", response_model=dict)
def get_registered_tool(tool_id: str) -> dict:
    """Fetch a tool record by ID."""
    engine = get_tool_discovery_engine()
    record = engine.get_tool(tool_id)
    if not record:
        raise HTTPException(status_code=404, detail="Tool not found")
    return record.dict


@tool_discovery_router.delete("/tools/registry/{tool_id}", response_model=dict)
def deactivate_registered_tool(tool_id: str) -> dict:
    """Deactivate a tool (soft-delete)."""
    engine = get_tool_discovery_engine()
    ok = engine.deactivate_tool(tool_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Tool not found")
    return {"tool_id": tool_id, "deactivated": True}


@tool_discovery_router.post("/tools/usage", response_model=dict)
def record_tool_usage(payload: ToolUsageRecordRequest) -> dict:
    """Record a tool usage outcome for historical success tracking."""
    engine = get_tool_discovery_engine()
    history_id = engine.record_usage(
        tool_id=payload.tool_id,
        session_id=payload.session_id,
        intent=payload.intent,
        succeeded=payload.succeeded,
        latency_ms=payload.latency_ms,
        metadata=payload.metadata,
    )
    return {"history_id": history_id, "tool_id": payload.tool_id}


# ==========================================================================
# Wave-4: Tool Reliability  — /api/v1/product/tools/reliability
# ==========================================================================


class RecordCallRequest(BaseModel):
    tool_name: str
    params: dict[str, Any] = Field(default_factory=dict)
    succeeded: bool = True
    error_type: str = ""
    error_msg: str = ""
    latency_ms: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


class PredictReliabilityRequest(BaseModel):
    tool_name: str
    params: dict[str, Any] = Field(default_factory=dict)
    alternate_tools: list[str] = Field(default_factory=list)


@tool_reliability_router.post("/tools/reliability/record", response_model=dict)
def record_tool_call(payload: RecordCallRequest) -> dict:
    """Record a tool call outcome for reliability tracking."""
    predictor = get_tool_reliability_predictor()
    call_id = predictor.record_call(
        CallRecord(
            tool_name=payload.tool_name,
            params=payload.params,
            succeeded=payload.succeeded,
            error_type=payload.error_type,
            error_msg=payload.error_msg,
            latency_ms=payload.latency_ms,
            metadata=payload.metadata,
        )
    )
    return {"call_id": call_id, "tool_name": payload.tool_name}


@tool_reliability_router.post("/tools/reliability/predict", response_model=dict)
def predict_tool_reliability(payload: PredictReliabilityRequest) -> dict:
    """Predict failure probability for a prospective tool call."""
    predictor = get_tool_reliability_predictor()
    prediction = predictor.predict(
        tool_name=payload.tool_name,
        params=payload.params,
        alternate_tools=payload.alternate_tools,
    )
    return prediction.dict


@tool_reliability_router.get("/tools/reliability/stats", response_model=list)
def list_reliability_stats(limit: int = Query(50, ge=1, le=500)) -> list:
    """List reliability stats for all tracked tools (worst first)."""
    predictor = get_tool_reliability_predictor()
    return [s.dict for s in predictor.list_stats(limit=limit)]


@tool_reliability_router.get("/tools/reliability/stats/{tool_name}", response_model=dict)
def get_tool_reliability_stats(tool_name: str) -> dict:
    """Get reliability stats for a specific tool."""
    predictor = get_tool_reliability_predictor()
    stats = predictor.get_stats(tool_name)
    if stats is None:
        raise HTTPException(status_code=404, detail="No stats found for tool")
    return stats.dict


# ==========================================================================
# Wave-4: Error Translator  — /api/v1/product/tools/errors
# ==========================================================================


class TranslateErrorRequest(BaseModel):
    error_string: str
    tool_name: str = ""
    params: dict[str, Any] = Field(default_factory=dict)


@error_translator_router.post("/tools/errors/translate", response_model=dict)
def translate_tool_error(payload: TranslateErrorRequest) -> dict:
    """Translate a tool error string into concrete remediation steps."""
    translator = get_error_translator()
    result = translator.translate(
        error_string=payload.error_string,
        tool_name=payload.tool_name,
        params=payload.params or None,
    )
    return result.dict


@error_translator_router.get("/tools/errors/categories", response_model=list)
def list_error_categories() -> list:
    """List all known error categories in the built-in library."""
    translator = get_error_translator()
    return translator.get_categories()


@error_translator_router.get("/tools/errors/history", response_model=list)
def get_error_history(
    tool_name: str | None = None,
    category: str | None = None,
    limit: int = Query(100, ge=1, le=1000),
) -> list:
    """Query the error translation log."""
    translator = get_error_translator()
    return translator.get_error_history(
        tool_name=tool_name,
        category=category,
        limit=limit,
    )


# ==========================================================================
# Wave-4: Memory Consolidation  — /api/v1/product/memory/consolidate
# ==========================================================================


class MemoryItemRequest(BaseModel):
    content: str
    session_id: str = ""
    tenant_id: str = ""
    content_type: str = "fact"
    source: str = ""
    confidence: float = Field(1.0, ge=0.0, le=1.0)
    importance: float = Field(0.5, ge=0.0, le=1.0)
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ConsolidateRequest(BaseModel):
    session_id: str = ""
    tenant_id: str = ""
    content_type: str | None = None
    min_items: int = Field(2, ge=1)


@memory_consolidation_router.post("/memory/items", response_model=dict)
def add_memory_item(payload: MemoryItemRequest) -> dict:
    """Add a memory item to the store."""
    engine = get_memory_consolidation_engine()
    record = engine.add_item(
        MemoryItem(
            content=payload.content,
            session_id=payload.session_id,
            tenant_id=payload.tenant_id,
            content_type=payload.content_type,
            source=payload.source,
            confidence=payload.confidence,
            importance=payload.importance,
            tags=payload.tags,
            metadata=payload.metadata,
        )
    )
    return record.dict


@memory_consolidation_router.get("/memory/items", response_model=list)
def list_memory_items(
    session_id: str | None = None,
    tenant_id: str | None = None,
    content_type: str | None = None,
    consolidated: bool | None = None,
    limit: int = Query(100, ge=1, le=1000),
) -> list:
    """List memory items with optional filters."""
    engine = get_memory_consolidation_engine()
    return [
        r.dict
        for r in engine.list_items(
            session_id=session_id,
            tenant_id=tenant_id,
            content_type=content_type,
            consolidated=consolidated,
            limit=limit,
        )
    ]


@memory_consolidation_router.get("/memory/items/{item_id}", response_model=dict)
def get_memory_item(item_id: str) -> dict:
    """Fetch a memory item by ID."""
    engine = get_memory_consolidation_engine()
    record = engine.get_item(item_id)
    if not record:
        raise HTTPException(status_code=404, detail="Memory item not found")
    return record.dict


@memory_consolidation_router.delete("/memory/items/{item_id}", response_model=dict)
def delete_memory_item(item_id: str) -> dict:
    engine = get_memory_consolidation_engine()
    ok = engine.delete_item(item_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Memory item not found")
    return {"item_id": item_id, "deleted": True}


@memory_consolidation_router.post("/memory/consolidate", response_model=dict)
def consolidate_memory(payload: ConsolidateRequest) -> dict:
    """Consolidate memory items: merge duplicates, detect contradictions."""
    engine = get_memory_consolidation_engine()
    result = engine.consolidate(
        session_id=payload.session_id,
        tenant_id=payload.tenant_id,
        content_type=payload.content_type,
        min_items=payload.min_items,
    )
    return result.dict


@memory_consolidation_router.get("/memory/consolidations", response_model=list)
def list_consolidations(
    session_id: str | None = None,
    tenant_id: str | None = None,
    limit: int = Query(50, ge=1, le=500),
) -> list:
    """List past consolidation results."""
    engine = get_memory_consolidation_engine()
    return [
        r.dict
        for r in engine.list_consolidations(
            session_id=session_id,
            tenant_id=tenant_id,
            limit=limit,
        )
    ]


@memory_consolidation_router.get("/memory/consolidations/{consolidation_id}", response_model=dict)
def get_consolidation(consolidation_id: str) -> dict:
    """Fetch a consolidation result by ID."""
    engine = get_memory_consolidation_engine()
    result = engine.get_consolidation(consolidation_id)
    if not result:
        raise HTTPException(status_code=404, detail="Consolidation not found")
    return result.dict


# ==========================================================================
# Wave-4: Scratchpad  — /api/v1/product/memory/scratchpad
# ==========================================================================


class ScratchSetRequest(BaseModel):
    session_id: str
    key: str
    value: Any
    content_type: str = "text"
    lifecycle: str = Lifecycle.KEEP.value
    ttl_seconds: int | None = None
    tags: list[str] = Field(default_factory=list)
    tenant_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class ScratchSweepRequest(BaseModel):
    session_id: str


@scratchpad_router.post("/memory/scratchpad", response_model=dict)
def scratch_set(payload: ScratchSetRequest) -> dict:
    """Create or update a scratchpad entry."""
    mgr = get_scratchpad_manager()
    try:
        lc = Lifecycle(payload.lifecycle)
    except ValueError:
        lc = Lifecycle.KEEP
    record = mgr.set(
        ScratchEntry(
            session_id=payload.session_id,
            key=payload.key,
            value=payload.value,
            content_type=payload.content_type,
            lifecycle=lc,
            ttl_seconds=payload.ttl_seconds,
            tags=payload.tags,
            tenant_id=payload.tenant_id,
            metadata=payload.metadata,
        )
    )
    return record.dict


@scratchpad_router.get("/memory/scratchpad/{session_id}/{key}", response_model=dict)
def scratch_get(session_id: str, key: str) -> dict:
    """Get a scratchpad entry by session and key."""
    mgr = get_scratchpad_manager()
    record = mgr.get(session_id, key)
    if not record:
        raise HTTPException(status_code=404, detail="Scratchpad entry not found or expired")
    return record.dict


@scratchpad_router.get("/memory/scratchpad/{session_id}", response_model=list)
def scratch_list_session(
    session_id: str,
    lifecycle: str | None = None,
    tag: str | None = None,
    include_expired: bool = False,
) -> list:
    """List all scratchpad entries for a session."""
    mgr = get_scratchpad_manager()
    lc = None
    if lifecycle:
        try:
            lc = Lifecycle(lifecycle)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid lifecycle: {lifecycle}")
    records = mgr.list_session(
        session_id=session_id,
        lifecycle=lc,
        include_expired=include_expired,
        tag=tag,
    )
    return [r.dict for r in records]


@scratchpad_router.delete("/memory/scratchpad/{session_id}/{key}", response_model=dict)
def scratch_delete(session_id: str, key: str) -> dict:
    """Delete a scratchpad entry."""
    mgr = get_scratchpad_manager()
    ok = mgr.delete(session_id, key)
    if not ok:
        raise HTTPException(status_code=404, detail="Scratchpad entry not found")
    return {"session_id": session_id, "key": key, "deleted": True}


@scratchpad_router.delete("/memory/scratchpad/{session_id}", response_model=dict)
def scratch_clear_session(
    session_id: str,
    lifecycle: str | None = None,
) -> dict:
    """Clear all entries for a session (optionally scoped by lifecycle)."""
    mgr = get_scratchpad_manager()
    lc = None
    if lifecycle:
        try:
            lc = Lifecycle(lifecycle)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid lifecycle: {lifecycle}")
    count = mgr.clear_session(session_id, lifecycle=lc)
    return {"session_id": session_id, "cleared": count}


@scratchpad_router.post("/memory/scratchpad/sweep", response_model=dict)
def scratch_sweep(payload: ScratchSweepRequest) -> dict:
    """Apply lifecycle rules for a session: discard ephemeral, mark promoted."""
    mgr = get_scratchpad_manager()
    result = mgr.sweep_session(payload.session_id)
    return result.dict


@scratchpad_router.post("/memory/scratchpad/purge-expired", response_model=dict)
def scratch_purge_expired() -> dict:
    """Remove all globally expired scratchpad entries."""
    mgr = get_scratchpad_manager()
    count = mgr.purge_expired()
    return {"purged": count}


@scratchpad_router.get("/memory/scratchpad/{session_id}/promoted", response_model=list)
def scratch_get_promoted(session_id: str) -> list:
    """Get all entries promoted during lifecycle sweep."""
    mgr = get_scratchpad_manager()
    return [r.dict for r in mgr.get_promoted(session_id)]


# ==========================================================================
# Wave-4: Model-Ops + Reliability Modules
# ==========================================================================

# --------------------------------------------------------------------------
# Determinism Kit — /api/v1/product/determinism
# --------------------------------------------------------------------------


class TemplateRegisterRequest(BaseModel):
    name: str
    template_text: str
    description: str = ""
    variables: list[str] | None = None
    workflow_id: str = ""


class CanonRuleRequest(BaseModel):
    name: str
    rule_type: str
    pattern: str = ""
    replacement: str = ""
    flags: str = ""
    priority: int = 50
    description: str = ""


class WorkflowSettingsRequest(BaseModel):
    workflow_id: str
    settings: dict[str, Any]
    description: str = ""


class RunOutputRequest(BaseModel):
    workflow_id: str
    run_id: str
    raw_output: str
    output_key: str = "default"


class CompareRunsRequest(BaseModel):
    workflow_id: str
    run_a_id: str
    run_b_id: str
    output_key: str = "default"
    method: str = "exact"


@determinism_router.post("/determinism/templates", response_model=dict)
def create_determinism_template(payload: TemplateRegisterRequest) -> dict:
    """Register or update a deterministic output template."""
    kit = get_determinism_kit()
    tpl = kit.register_template(
        name=payload.name,
        template_text=payload.template_text,
        description=payload.description,
        variables=payload.variables,
        workflow_id=payload.workflow_id,
    )
    return tpl.dict


@determinism_router.get("/determinism/templates", response_model=list)
def list_determinism_templates(
    workflow_id: str | None = None,
    active_only: bool = True,
) -> list:
    """List output templates."""
    return [t.dict for t in get_determinism_kit().list_templates(workflow_id=workflow_id, active_only=active_only)]


@determinism_router.get("/determinism/templates/{template_id}", response_model=dict)
def get_determinism_template(template_id: str) -> dict:
    kit = get_determinism_kit()
    tpl = kit.get_template(template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl.dict


@determinism_router.post("/determinism/templates/{template_id}/render", response_model=dict)
def render_determinism_template(template_id: str, context: dict[str, Any]) -> dict:
    """Render a template with the given context variables."""
    kit = get_determinism_kit()
    try:
        rendered = kit.render_template(template_id, context)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"template_id": template_id, "rendered": rendered}


@determinism_router.delete("/determinism/templates/{template_id}", response_model=dict)
def delete_determinism_template(template_id: str) -> dict:
    ok = get_determinism_kit().delete_template(template_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"template_id": template_id, "deleted": True}


@determinism_router.post("/determinism/rules", response_model=dict)
def create_canon_rule(payload: CanonRuleRequest) -> dict:
    """Register or update a canonicalization rule."""
    try:
        rule = get_determinism_kit().register_canon_rule(
            name=payload.name,
            rule_type=payload.rule_type,
            pattern=payload.pattern,
            replacement=payload.replacement,
            flags=payload.flags,
            priority=payload.priority,
            description=payload.description,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return rule.dict


@determinism_router.get("/determinism/rules", response_model=list)
def list_canon_rules(active_only: bool = True) -> list:
    """List canonicalization rules."""
    return [r.dict for r in get_determinism_kit().list_canon_rules(active_only=active_only)]


@determinism_router.delete("/determinism/rules/{rule_id}", response_model=dict)
def delete_canon_rule(rule_id: str) -> dict:
    ok = get_determinism_kit().delete_canon_rule(rule_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"rule_id": rule_id, "deleted": True}


@determinism_router.post("/determinism/canonicalize", response_model=dict)
def canonicalize_text(payload: dict[str, Any]) -> dict:
    """Apply all active canonicalization rules to text and return result + hash."""
    text = str(payload.get("text", ""))
    canon_text, c_hash = get_determinism_kit().canonicalize_text(text)
    return {"original": text, "canonical": canon_text, "hash": c_hash}


@determinism_router.post("/determinism/settings", response_model=dict)
def set_workflow_det_settings(payload: WorkflowSettingsRequest) -> dict:
    """Set fixed LLM/tool settings for a workflow."""
    ws = get_determinism_kit().set_workflow_settings(
        workflow_id=payload.workflow_id,
        settings=payload.settings,
        description=payload.description,
    )
    return ws.dict


@determinism_router.get("/determinism/settings/{workflow_id}", response_model=dict)
def get_workflow_det_settings(workflow_id: str) -> dict:
    ws = get_determinism_kit().get_workflow_settings(workflow_id)
    if ws is None:
        raise HTTPException(status_code=404, detail="Workflow settings not found")
    return ws.dict


@determinism_router.get("/determinism/settings", response_model=list)
def list_workflow_det_settings() -> list:
    return [ws.dict for ws in get_determinism_kit().list_workflow_settings()]


@determinism_router.delete("/determinism/settings/{workflow_id}", response_model=dict)
def delete_workflow_det_settings(workflow_id: str) -> dict:
    ok = get_determinism_kit().delete_workflow_settings(workflow_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Workflow settings not found")
    return {"workflow_id": workflow_id, "deleted": True}


@determinism_router.post("/determinism/runs", response_model=dict)
def record_run_output(payload: RunOutputRequest) -> dict:
    """Record a run output for consistency tracking."""
    out = get_determinism_kit().record_run_output(
        workflow_id=payload.workflow_id,
        run_id=payload.run_id,
        raw_output=payload.raw_output,
        output_key=payload.output_key,
    )
    return out.dict


@determinism_router.get("/determinism/runs", response_model=list)
def list_run_outputs_route(
    workflow_id: str = Query(...),
    output_key: str | None = None,
    limit: int = 100,
) -> list:
    """List recorded run outputs."""
    return [o.dict for o in get_determinism_kit().list_run_outputs(workflow_id, output_key=output_key, limit=limit)]


@determinism_router.post("/determinism/compare", response_model=dict)
def compare_runs_route(payload: CompareRunsRequest) -> dict:
    """Compare two run outputs and return their consistency score."""
    try:
        score = get_determinism_kit().compare_runs(
            workflow_id=payload.workflow_id,
            run_a_id=payload.run_a_id,
            run_b_id=payload.run_b_id,
            output_key=payload.output_key,
            method=payload.method,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return score.dict


@determinism_router.get("/determinism/summary", response_model=dict)
def consistency_summary_route(
    workflow_id: str = Query(...),
    output_key: str = "default",
) -> dict:
    """Aggregate consistency stats for a workflow."""
    return get_determinism_kit().consistency_summary(workflow_id, output_key=output_key).dict


# --------------------------------------------------------------------------
# Prompt Modules — /api/v1/product/prompts
# --------------------------------------------------------------------------


class PromptModuleCreateRequest(BaseModel):
    name: str
    module_type: str
    content: str
    description: str = ""
    tags: list[str] = Field(default_factory=list)


class PromptModuleUpdateRequest(BaseModel):
    module_type: str | None = None
    content: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    active: bool | None = None


class PromptTemplateCreateRequest(BaseModel):
    name: str
    module_refs: list[dict[str, Any]]
    description: str = ""
    separator: str = "\n\n"


class PromptComposeRequest(BaseModel):
    template_id: str
    context: dict[str, Any] = Field(default_factory=dict)


class PromptSnapshotRequest(BaseModel):
    template_id: str
    note: str = ""
    context: dict[str, Any] = Field(default_factory=dict)


@prompt_modules_router.post("/prompts/modules", response_model=dict)
def create_prompt_module(payload: PromptModuleCreateRequest) -> dict:
    """Create or update a reusable prompt module."""
    try:
        mod = get_prompt_registry().create_module(
            name=payload.name,
            module_type=payload.module_type,
            content=payload.content,
            description=payload.description,
            tags=payload.tags,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return mod.dict


@prompt_modules_router.get("/prompts/modules", response_model=list)
def list_prompt_modules(
    module_type: str | None = None,
    tag: str | None = None,
    active_only: bool = True,
) -> list:
    """List prompt modules."""
    return [m.dict for m in get_prompt_registry().list_modules(
        module_type=module_type, tag=tag, active_only=active_only
    )]


@prompt_modules_router.get("/prompts/modules/{module_id}", response_model=dict)
def get_prompt_module(module_id: str) -> dict:
    reg = get_prompt_registry()
    mod = reg.get_module(module_id)
    if mod is None:
        raise HTTPException(status_code=404, detail="Module not found")
    return mod.dict


@prompt_modules_router.patch("/prompts/modules/{module_id}", response_model=dict)
def update_prompt_module(module_id: str, payload: PromptModuleUpdateRequest) -> dict:
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    try:
        mod = get_prompt_registry().update_module(module_id, updates)
    except (KeyError, ValueError) as exc:
        code = 404 if isinstance(exc, KeyError) else 422
        raise HTTPException(status_code=code, detail=str(exc)) from exc
    return mod.dict


@prompt_modules_router.delete("/prompts/modules/{module_id}", response_model=dict)
def delete_prompt_module(module_id: str) -> dict:
    ok = get_prompt_registry().delete_module(module_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Module not found")
    return {"module_id": module_id, "deleted": True}


@prompt_modules_router.get("/prompts/module-types", response_model=list)
def list_module_types() -> list:
    """Return valid module type names."""
    return sorted(MODULE_TYPES)


@prompt_modules_router.post("/prompts/templates", response_model=dict)
def create_prompt_template(payload: PromptTemplateCreateRequest) -> dict:
    """Create or update a prompt template."""
    tmpl = get_prompt_registry().create_template(
        name=payload.name,
        module_refs=payload.module_refs,
        description=payload.description,
        separator=payload.separator,
    )
    return tmpl.dict


@prompt_modules_router.get("/prompts/templates", response_model=list)
def list_prompt_templates(active_only: bool = True) -> list:
    return [t.dict for t in get_prompt_registry().list_templates(active_only=active_only)]


@prompt_modules_router.get("/prompts/templates/{template_id}", response_model=dict)
def get_prompt_template(template_id: str) -> dict:
    reg = get_prompt_registry()
    tmpl = reg.get_template(template_id)
    if tmpl is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl.dict


@prompt_modules_router.delete("/prompts/templates/{template_id}", response_model=dict)
def delete_prompt_template(template_id: str) -> dict:
    ok = get_prompt_registry().delete_template(template_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"template_id": template_id, "deleted": True}


@prompt_modules_router.post("/prompts/compose", response_model=dict)
def compose_prompt(payload: PromptComposeRequest) -> dict:
    """Compose a prompt from a template with optional context substitution."""
    try:
        text = get_prompt_registry().compose(payload.template_id, context=payload.context)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"template_id": payload.template_id, "composed": text}


@prompt_modules_router.post("/prompts/versions/snapshot", response_model=dict)
def snapshot_prompt_version(payload: PromptSnapshotRequest) -> dict:
    """Create an immutable versioned snapshot of a prompt template."""
    try:
        v = get_prompt_registry().snapshot_version(
            template_id=payload.template_id,
            note=payload.note,
            context=payload.context or None,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return v.dict


@prompt_modules_router.get("/prompts/versions", response_model=list)
def list_prompt_versions(
    template_id: str = Query(...),
    limit: int = Query(50, ge=1, le=200),
) -> list:
    """List versions for a template."""
    return [v.dict for v in get_prompt_registry().list_versions(template_id, limit=limit)]


@prompt_modules_router.get("/prompts/versions/latest", response_model=dict)
def latest_prompt_version(template_id: str = Query(...)) -> dict:
    v = get_prompt_registry().latest_version(template_id)
    if v is None:
        raise HTTPException(status_code=404, detail="No versions found")
    return v.dict


@prompt_modules_router.get("/prompts/versions/{version_id}", response_model=dict)
def get_prompt_version(version_id: str) -> dict:
    v = get_prompt_registry().get_version(version_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return v.dict


# --------------------------------------------------------------------------
# Tool Semantic Docs — /api/v1/product/tools/docs
# --------------------------------------------------------------------------


class ToolDocRequest(BaseModel):
    tool_spec: dict[str, Any]


class ToolDocBatchRequest(BaseModel):
    tool_specs: list[dict[str, Any]]


@tool_docs_router.post("/tools/docs/generate", response_model=dict)
def generate_tool_doc(payload: ToolDocRequest) -> dict:
    """Generate semantic documentation for a single tool specification."""
    doc = get_doc_generator().generate(payload.tool_spec)
    return doc.dict


@tool_docs_router.post("/tools/docs/batch", response_model=list)
def generate_tool_docs_batch(payload: ToolDocBatchRequest) -> list:
    """Generate semantic documentation for multiple tool specifications."""
    docs = get_doc_generator().generate_batch(payload.tool_specs)
    return [d.dict for d in docs]


@tool_docs_router.delete("/tools/docs/cache", response_model=dict)
def clear_tool_doc_cache() -> dict:
    """Invalidate the doc generation cache."""
    n = get_doc_generator().clear_cache()
    return {"cleared": n}


# --------------------------------------------------------------------------
# Tool Parallelizer — /api/v1/product/tools/parallel
# --------------------------------------------------------------------------


class ToolCallRequest(BaseModel):
    call_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    tool_name: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    depends_on: list[str] = Field(default_factory=list)
    has_side_effects: bool = False
    timeout_ms: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ParallelAnalyzeRequest(BaseModel):
    calls: list[ToolCallRequest]
    side_effect_policy: str = SideEffectPolicy.SERIALIZE.value


class ParallelPlanRequest(BaseModel):
    calls: list[ToolCallRequest]
    side_effect_policy: str = SideEffectPolicy.SERIALIZE.value


@tool_parallel_router.post("/tools/parallel/analyze", response_model=dict)
def analyze_parallelism(payload: ParallelAnalyzeRequest) -> dict:
    """Analyze tool call list for parallelism without executing."""
    try:
        policy = SideEffectPolicy(payload.side_effect_policy)
    except ValueError:
        policy = SideEffectPolicy.SERIALIZE
    p = get_parallelizer()
    calls = [ToolCall.from_dict(c.model_dump()) for c in payload.calls]
    return p.analyze_parallelism(calls)


@tool_parallel_router.post("/tools/parallel/plan", response_model=dict)
def build_parallel_plan(payload: ParallelPlanRequest) -> dict:
    """Build an execution plan (dry run, no execution)."""
    try:
        policy = SideEffectPolicy(payload.side_effect_policy)
    except ValueError:
        policy = SideEffectPolicy.SERIALIZE
    calls = [ToolCall.from_dict(c.model_dump()) for c in payload.calls]
    try:
        plan = build_execution_plan(calls, side_effect_policy=policy)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return plan.dict


# =============================================================================
# Wave-5: Knowledge + DevX Routes
# =============================================================================

# ---------------------------------------------------------------------------
# SOP Compiler — /api/v1/product/sop/*
# ---------------------------------------------------------------------------


@sop_router.post("/sop/compile", response_model=dict)
def compile_sop(payload: SOPCompileRequest) -> dict:
    """Compile an SOP document into a structured workflow."""
    try:
        result = get_sop_compiler().compile(payload)
        return result.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@sop_router.get("/sop/history", response_model=list)
def list_sop_history(limit: int = 20) -> list:
    """Return recent SOP compile history."""
    return get_sop_compiler().get_history(limit=limit)


# ---------------------------------------------------------------------------
# API Wrapper Generator — /api/v1/product/tools/generate
# ---------------------------------------------------------------------------


@api_wrapper_router.post("/tools/generate", response_model=dict)
def generate_api_wrapper(payload: WrapperGenerateRequest) -> dict:
    """Generate a typed Python tool wrapper from an OpenAPI or Postman spec."""
    try:
        result = get_api_wrapper_generator().generate(payload)
        return result.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@api_wrapper_router.get("/tools/generate/history", response_model=list)
def list_wrapper_history(limit: int = 20) -> list:
    """Return recent wrapper generation history."""
    return get_api_wrapper_generator().get_history(limit=limit)


# ---------------------------------------------------------------------------
# AutoDoc Generator — /api/v1/product/docs/generate
# ---------------------------------------------------------------------------


@autodoc_router.post("/docs/generate", response_model=dict)
def generate_docs(payload: DocGenerateRequest) -> dict:
    """Generate README/documentation from workflow + test definitions."""
    try:
        result = get_autodoc_generator().generate(payload)
        return result.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@autodoc_router.get("/docs/history", response_model=list)
def list_doc_history(limit: int = 20) -> list:
    """Return recent doc generation history."""
    return get_autodoc_generator().get_history(limit=limit)


@autodoc_router.get("/docs/{doc_id}", response_model=dict)
def get_generated_doc(doc_id: str) -> dict:
    """Retrieve a previously generated doc by ID."""
    doc = get_autodoc_generator().get_doc(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Doc {doc_id!r} not found")
    return doc


# ---------------------------------------------------------------------------
# Docs Ingestion — /api/v1/product/docs/ingest/*
# ---------------------------------------------------------------------------


@docs_ingest_router.post("/docs/ingest", response_model=dict)
def ingest_doc(payload: DocsIngestRequest) -> dict:
    """Ingest a document, detect changes, and generate diff summary."""
    try:
        result = get_docs_ingestion_manager().ingest(payload)
        return result.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@docs_ingest_router.get("/docs/ingest/sources", response_model=list)
def list_doc_sources() -> list:
    """List all registered doc sources."""
    return [s.model_dump() for s in get_docs_ingestion_manager().list_sources()]


@docs_ingest_router.get("/docs/ingest/sources/{source_id}/versions", response_model=list)
def get_doc_versions(source_id: str, limit: int = 10) -> list:
    """Get version history for a doc source."""
    return [v.model_dump() for v in get_docs_ingestion_manager().get_versions(source_id, limit=limit)]


@docs_ingest_router.post("/docs/ingest/summary", response_model=dict)
def generate_weekly_summary(payload: WeeklySummaryRequest) -> dict:
    """Generate a weekly change summary across ingested docs."""
    try:
        summary = get_docs_ingestion_manager().generate_weekly_summary(payload)
        return summary.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# KB Builder — /api/v1/product/kb/*
# ---------------------------------------------------------------------------


@kb_router.post("/kb/ingest", response_model=dict)
def ingest_kb_ticket(payload: TicketInput) -> dict:
    """Ingest a support ticket/email into the KB."""
    try:
        result = get_kb_builder().ingest_ticket(payload)
        return result.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@kb_router.post("/kb/search", response_model=dict)
def search_kb(payload: KBSearchRequest) -> dict:
    """Full-text search the KB."""
    try:
        result = get_kb_builder().search(payload)
        return result.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@kb_router.get("/kb/faq", response_model=dict)
def get_kb_faq(categories: str = "") -> dict:
    """Return KB entries organized as FAQ sections."""
    cats = [c.strip() for c in categories.split(",") if c.strip()] if categories else None
    return get_kb_builder().get_faq(categories=cats).model_dump()


@kb_router.get("/kb/entries", response_model=list)
def list_kb_entries(limit: int = 50, offset: int = 0) -> list:
    """List all KB entries."""
    return [e.model_dump() for e in get_kb_builder().list_entries(limit=limit, offset=offset)]


@kb_router.get("/kb/entries/{entry_id}", response_model=dict)
def get_kb_entry(entry_id: str) -> dict:
    """Get a specific KB entry."""
    entry = get_kb_builder().get_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"KB entry {entry_id!r} not found")
    return entry.model_dump()


@kb_router.post("/kb/entries/{entry_id}/vote", response_model=dict)
def vote_kb_entry(entry_id: str, helpful: bool = True) -> dict:
    """Vote on whether a KB entry is helpful."""
    ok = get_kb_builder().vote(entry_id, helpful=helpful)
    return {"success": ok, "entry_id": entry_id, "helpful": helpful}


# ---------------------------------------------------------------------------
# Workflow Templates — /api/v1/product/templates/*
# ---------------------------------------------------------------------------


@templates_router.post("/templates", response_model=dict)
def create_template(payload: TemplateCreateRequest) -> dict:
    """Create a new workflow template."""
    try:
        t = get_workflow_template_marketplace().create_template(payload)
        return t.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@templates_router.get("/templates", response_model=list)
def search_templates(
    query: str = "",
    category: str = "",
    min_rating: float = 0.0,
    limit: int = 20,
    offset: int = 0,
) -> list:
    """Search workflow templates."""
    req = TemplateSearchRequest(
        query=query, category=category, min_rating=min_rating,
        limit=limit, offset=offset,
    )
    return [t.model_dump() for t in get_workflow_template_marketplace().search_templates(req)]


@templates_router.get("/templates/categories", response_model=list)
def list_template_categories() -> list:
    """List all template categories."""
    return get_workflow_template_marketplace().list_categories()


@templates_router.get("/templates/{template_id}", response_model=dict)
def get_template(template_id: str) -> dict:
    """Get a workflow template by ID."""
    t = get_workflow_template_marketplace().get_template(template_id)
    if not t:
        raise HTTPException(status_code=404, detail=f"Template {template_id!r} not found")
    return t.model_dump()


@templates_router.patch("/templates/{template_id}", response_model=dict)
def update_template(template_id: str, payload: TemplateUpdateRequest) -> dict:
    """Update a workflow template."""
    t = get_workflow_template_marketplace().update_template(template_id, payload)
    if not t:
        raise HTTPException(status_code=404, detail=f"Template {template_id!r} not found")
    return t.model_dump()


@templates_router.delete("/templates/{template_id}", response_model=dict)
def delete_template(template_id: str) -> dict:
    """Delete a workflow template."""
    ok = get_workflow_template_marketplace().delete_template(template_id)
    return {"deleted": ok, "template_id": template_id}


@templates_router.post("/templates/{template_id}/publish", response_model=dict)
def publish_template(template_id: str) -> dict:
    """Publish a template to the marketplace."""
    ok = get_workflow_template_marketplace().publish_template(template_id)
    return {"published": ok, "template_id": template_id}


@templates_router.post("/templates/{template_id}/rate", response_model=dict)
def rate_template(template_id: str, rating: float) -> dict:
    """Rate a template (0.0–5.0)."""
    if not 0.0 <= rating <= 5.0:
        raise HTTPException(status_code=422, detail="Rating must be between 0.0 and 5.0")
    ok = get_workflow_template_marketplace().rate_template(template_id, rating)
    return {"success": ok, "template_id": template_id, "rating": rating}


@templates_router.get("/templates/{template_id}/versions", response_model=list)
def get_template_versions(template_id: str) -> list:
    """Get version history of a template."""
    return get_workflow_template_marketplace().get_versions(template_id)


@templates_router.post("/templates/install", response_model=dict)
def install_template(payload: TemplateInstallRequest) -> dict:
    """Install a template for a tenant."""
    try:
        install = get_workflow_template_marketplace().install_template(payload)
        return install.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@templates_router.delete("/templates/installs/{install_id}", response_model=dict)
def uninstall_template(install_id: str) -> dict:
    """Uninstall a template."""
    ok = get_workflow_template_marketplace().uninstall_template(install_id)
    return {"uninstalled": ok, "install_id": install_id}


@templates_router.get("/templates/installs/tenant/{tenant_id}", response_model=list)
def list_tenant_installs(tenant_id: str) -> list:
    """List all template installs for a tenant."""
    return [i.model_dump() for i in get_workflow_template_marketplace().list_installs(tenant_id)]


# ---------------------------------------------------------------------------
# Async Callback Manager — /api/v1/product/callbacks/*
# ---------------------------------------------------------------------------


@callbacks_router.post("/callbacks", response_model=dict)
def register_callback_route(payload: CallbackRegisterRequest) -> dict:
    """Register a new callback."""
    try:
        reg = get_async_callback_manager().register(payload)
        return reg.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@callbacks_router.get("/callbacks", response_model=list)
def list_callbacks(trigger: str = "", active_only: bool = True) -> list:
    """List registered callbacks."""
    regs = get_async_callback_manager().list_registrations(
        trigger=trigger or None, active_only=active_only
    )
    return [r.model_dump() for r in regs]


@callbacks_router.get("/callbacks/{callback_id}", response_model=dict)
def get_callback(callback_id: str) -> dict:
    """Get a specific callback registration."""
    reg = get_async_callback_manager().get_registration(callback_id)
    if not reg:
        raise HTTPException(status_code=404, detail=f"Callback {callback_id!r} not found")
    return reg.model_dump()


@callbacks_router.delete("/callbacks/{callback_id}", response_model=dict)
def unregister_callback_route(callback_id: str) -> dict:
    """Unregister a callback."""
    ok = get_async_callback_manager().unregister(callback_id)
    return {"unregistered": ok, "callback_id": callback_id}


@callbacks_router.post("/callbacks/trigger", response_model=dict)
def trigger_callbacks(payload: TriggerRequest) -> dict:
    """Trigger callbacks for an event."""
    try:
        result = get_async_callback_manager().trigger(payload)
        return result.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@callbacks_router.post("/callbacks/retry", response_model=dict)
def retry_callback_delivery(payload: RetryRequest) -> dict:
    """Manually retry a failed delivery."""
    delivery = get_async_callback_manager().retry_delivery(payload)
    if not delivery:
        raise HTTPException(status_code=404, detail=f"Delivery {payload.delivery_id!r} not found")
    return delivery.model_dump()


@callbacks_router.post("/callbacks/retry-pending", response_model=dict)
def retry_pending_callbacks() -> dict:
    """Retry all eligible pending/failed deliveries."""
    count = get_async_callback_manager().retry_pending()
    return {"retried_count": count}


@callbacks_router.get("/callbacks/deliveries", response_model=list)
def list_callback_deliveries(
    callback_id: str = "",
    status: str = "",
    limit: int = 50,
) -> list:
    """List callback deliveries."""
    deliveries = get_async_callback_manager().list_deliveries(
        callback_id=callback_id or None,
        status=status or None,
        limit=limit,
    )
    return [d.model_dump() for d in deliveries]


@callbacks_router.get("/callbacks/deliveries/{delivery_id}", response_model=dict)
def get_delivery(delivery_id: str) -> dict:
    """Get a specific delivery record."""
    d = get_async_callback_manager().get_delivery(delivery_id)
    if not d:
        raise HTTPException(status_code=404, detail=f"Delivery {delivery_id!r} not found")
    return d.model_dump()


@callbacks_router.get("/callbacks/status/summary", response_model=dict)
def get_callback_status_summary() -> dict:
    """Get callback delivery status summary."""
    return get_async_callback_manager().get_status_summary().model_dump()


# ---------------------------------------------------------------------------
# Output Corrector — /api/v1/product/output/correct
# ---------------------------------------------------------------------------


@output_corrector_router.post("/output/correct", response_model=dict)
def correct_output(payload: CorrectRequest) -> dict:
    """Correct and normalize output text (formatting, ordering, naming, consistency)."""
    try:
        result = get_output_corrector().correct(payload)
        return result.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@output_corrector_router.post("/output/rules", response_model=dict)
def create_correction_rule(payload: CorrectionRuleCreate) -> dict:
    """Create a custom correction rule."""
    try:
        rule = get_output_corrector().create_rule(payload)
        return rule.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@output_corrector_router.get("/output/rules", response_model=list)
def list_correction_rules(rule_type: str = "", active_only: bool = True) -> list:
    """List all correction rules."""
    rules = get_output_corrector().list_rules(
        rule_type=rule_type or None, active_only=active_only
    )
    return [r.model_dump() for r in rules]


@output_corrector_router.delete("/output/rules/{rule_id}", response_model=dict)
def delete_correction_rule(rule_id: str) -> dict:
    """Delete a correction rule."""
    ok = get_output_corrector().delete_rule(rule_id)
    return {"deleted": ok, "rule_id": rule_id}


@output_corrector_router.post("/output/section-configs", response_model=dict)
def create_section_config(payload: SectionOrderConfigCreate) -> dict:
    """Create a section ordering config."""
    try:
        config = get_output_corrector().create_section_config(payload)
        return config.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@output_corrector_router.get("/output/section-configs", response_model=list)
def list_section_configs() -> list:
    """List all section order configs."""
    return [c.model_dump() for c in get_output_corrector().list_section_configs()]


@output_corrector_router.post("/output/naming-norms", response_model=dict)
def add_naming_norm(payload: NamingNormCreate) -> dict:
    """Add a naming normalization rule."""
    try:
        norm = get_output_corrector().add_naming_norm(payload)
        return norm.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@output_corrector_router.get("/output/naming-norms", response_model=list)
def list_naming_norms() -> list:
    """List all naming normalization rules."""
    return [n.model_dump() for n in get_output_corrector().list_naming_norms()]


@output_corrector_router.get("/output/history", response_model=list)
def get_output_correction_history(limit: int = 20) -> list:
    """Return recent output correction history."""
    return get_output_corrector().get_history(limit=limit)


# ===========================================================================
# WAVE-2 TOOL INTELLIGENCE ROUTES
# ===========================================================================

# ---------------------------------------------------------------------------
# 1. Task Spec — /api/v1/product/task/spec
# ---------------------------------------------------------------------------


class TaskSpecCompileRequest(BaseModel):
    raw_request: str
    session_id: str = ""
    tenant_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class TaskSpecListRequest(BaseModel):
    tenant_id: str | None = None
    session_id: str | None = None
    limit: int = 50


@task_spec_router.post("/task/spec", response_model=dict)
def compile_task_spec(payload: TaskSpecCompileRequest) -> dict:
    """Compile a natural-language task request into a formal structured spec."""
    compiler = get_task_spec_compiler()
    spec = compiler.compile(
        raw_request=payload.raw_request,
        session_id=payload.session_id,
        tenant_id=payload.tenant_id,
        metadata=payload.metadata,
    )
    return spec.dict


@task_spec_router.get("/task/spec/{spec_id}", response_model=dict)
def get_task_spec(spec_id: str) -> dict:
    """Retrieve a compiled task spec by ID."""
    spec = get_task_spec_compiler().get(spec_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Spec not found")
    return spec.dict


@task_spec_router.get("/task/specs", response_model=list)
def list_task_specs(
    tenant_id: str | None = None,
    session_id: str | None = None,
    limit: int = Query(50, ge=1, le=500),
) -> list:
    """List compiled task specs with optional filters."""
    return [s.dict for s in get_task_spec_compiler().list_specs(tenant_id=tenant_id, session_id=session_id, limit=limit)]


@task_spec_router.delete("/task/spec/{spec_id}", response_model=dict)
def delete_task_spec(spec_id: str) -> dict:
    ok = get_task_spec_compiler().delete(spec_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Spec not found")
    return {"spec_id": spec_id, "deleted": True}


# ---------------------------------------------------------------------------
# 2. Clarification Optimizer — /api/v1/product/task/clarify
# ---------------------------------------------------------------------------


class ClarifyRequest(BaseModel):
    candidates: list[str]
    context: dict[str, Any] = Field(default_factory=dict)
    task_summary: str = ""
    max_questions: int = Field(3, ge=1, le=3)
    tenant_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class ClarifyResolveRequest(BaseModel):
    question: str
    answer: str


@clarify_router.post("/task/clarify", response_model=dict)
def optimize_clarifications(payload: ClarifyRequest) -> dict:
    """Select the 1-3 highest-information clarification questions from candidates."""
    optimizer = get_clarification_optimizer()
    result = optimizer.optimize(
        candidates=payload.candidates,
        context=payload.context,
        task_summary=payload.task_summary,
        max_questions=payload.max_questions,
        tenant_id=payload.tenant_id,
        metadata=payload.metadata,
    )
    return result.dict


@clarify_router.post("/task/clarify/{session_id}/resolve", response_model=dict)
def resolve_clarification(session_id: str, payload: ClarifyResolveRequest) -> dict:
    """Record a user's answer to a clarification question."""
    resolution = get_clarification_optimizer().record_resolution(
        session_id=session_id, question=payload.question, answer=payload.answer
    )
    return resolution.dict


@clarify_router.get("/task/clarify/{session_id}", response_model=dict)
def get_clarification_session(session_id: str) -> dict:
    session = get_clarification_optimizer().get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.dict


@clarify_router.get("/task/clarify/{session_id}/resolutions", response_model=list)
def list_clarification_resolutions(session_id: str) -> list:
    return [r.dict for r in get_clarification_optimizer().list_resolutions(session_id)]


# ---------------------------------------------------------------------------
# 3. Task Splitter — /api/v1/product/task/split
# ---------------------------------------------------------------------------


class TaskSplitRequest(BaseModel):
    parent_task: str
    manual_sub_tasks: list[dict[str, Any]] | None = None
    session_id: str = ""
    tenant_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


@task_split_router.post("/task/split", response_model=dict)
def split_task(payload: TaskSplitRequest) -> dict:
    """Decompose a complex task into sub-tasks assignable to different agents."""
    split = get_task_splitter().split(
        parent_task=payload.parent_task,
        manual_sub_tasks=payload.manual_sub_tasks,
        session_id=payload.session_id,
        tenant_id=payload.tenant_id,
        metadata=payload.metadata,
    )
    return split.dict


@task_split_router.get("/task/split/{split_id}", response_model=dict)
def get_task_split(split_id: str) -> dict:
    split = get_task_splitter().get(split_id)
    if not split:
        raise HTTPException(status_code=404, detail="Split not found")
    return split.dict


@task_split_router.get("/task/splits", response_model=list)
def list_task_splits(
    tenant_id: str | None = None,
    session_id: str | None = None,
    limit: int = Query(50, ge=1, le=500),
) -> list:
    return [s.dict for s in get_task_splitter().list_splits(tenant_id=tenant_id, session_id=session_id, limit=limit)]


# ---------------------------------------------------------------------------
# 4. Dependency Graph — /api/v1/product/task/deps
# ---------------------------------------------------------------------------


class DepNodeRequest(BaseModel):
    node_id: str
    label: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class DepEdgeRequest(BaseModel):
    from_node: str
    to_node: str
    label: str = ""


class DepsResolveRequest(BaseModel):
    nodes: list[DepNodeRequest]
    edges: list[DepEdgeRequest]
    name: str = ""
    tenant_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


@dep_graph_router.post("/task/deps", response_model=dict)
def resolve_deps(payload: DepsResolveRequest) -> dict:
    """Resolve dependencies, detect cycles, and produce execution order."""
    resolver = get_dependency_graph_resolver()
    graph = resolver.resolve(
        nodes=[n.model_dump() for n in payload.nodes],
        edges=[e.model_dump() for e in payload.edges],
        name=payload.name,
        tenant_id=payload.tenant_id,
        metadata=payload.metadata,
    )
    return graph.dict


@dep_graph_router.get("/task/deps/{graph_id}", response_model=dict)
def get_dep_graph(graph_id: str) -> dict:
    g = get_dependency_graph_resolver().get(graph_id)
    if not g:
        raise HTTPException(status_code=404, detail="Graph not found")
    return g.dict


@dep_graph_router.get("/task/deps", response_model=list)
def list_dep_graphs(
    tenant_id: str | None = None,
    limit: int = Query(50, ge=1, le=500),
) -> list:
    return [g.dict for g in get_dependency_graph_resolver().list_graphs(tenant_id=tenant_id, limit=limit)]


@dep_graph_router.delete("/task/deps/{graph_id}", response_model=dict)
def delete_dep_graph(graph_id: str) -> dict:
    ok = get_dependency_graph_resolver().delete(graph_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Graph not found")
    return {"graph_id": graph_id, "deleted": True}


# ---------------------------------------------------------------------------
# 5. Param Auto-Filler — /api/v1/product/tools/autofill
# ---------------------------------------------------------------------------


class ParamAutofillRequest(BaseModel):
    tool_name: str
    tool_schema: dict[str, Any]
    existing_params: dict[str, Any] = Field(default_factory=dict)
    context: dict[str, Any] = Field(default_factory=dict)
    tenant_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


@param_autofill_router.post("/tools/autofill", response_model=dict)
def autofill_params(payload: ParamAutofillRequest) -> dict:
    """Suggest and fill missing tool parameters from schema defaults and context."""
    result = get_param_autofiller().autofill(
        tool_name=payload.tool_name,
        tool_schema=payload.tool_schema,
        existing_params=payload.existing_params,
        context=payload.context,
        tenant_id=payload.tenant_id,
        metadata=payload.metadata,
    )
    return result.dict


@param_autofill_router.get("/tools/autofill/{session_id}", response_model=dict)
def get_autofill_session(session_id: str) -> dict:
    result = get_param_autofiller().get_session(session_id)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result.dict


@param_autofill_router.get("/tools/autofill", response_model=list)
def list_autofill_sessions(
    tool_name: str | None = None,
    tenant_id: str | None = None,
    limit: int = Query(50, ge=1, le=500),
) -> list:
    return [r.dict for r in get_param_autofiller().list_sessions(tool_name=tool_name, tenant_id=tenant_id, limit=limit)]


# ---------------------------------------------------------------------------
# 6. Response Validator — /api/v1/product/tools/validate-response
# ---------------------------------------------------------------------------


class ValidateResponseRequest(BaseModel):
    tool_name: str
    response: Any
    expected_schema: dict[str, Any] = Field(default_factory=dict, alias="schema")
    constraints: list[dict[str, Any]] = Field(default_factory=list)
    tenant_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


@resp_validator_router.post("/tools/validate-response", response_model=dict)
def validate_tool_response(payload: ValidateResponseRequest) -> dict:
    """Validate a tool response against expected schema and constraints."""
    report = get_response_validator().validate(
        tool_name=payload.tool_name,
        response=payload.response,
        schema=payload.expected_schema,
        constraints=payload.constraints or None,
        tenant_id=payload.tenant_id,
        metadata=payload.metadata,
    )
    return report.dict


@resp_validator_router.get("/tools/validate-response/reports", response_model=list)
def list_validation_reports(
    tool_name: str | None = None,
    valid_only: bool | None = None,
    tenant_id: str | None = None,
    limit: int = Query(100, ge=1, le=1000),
) -> list:
    return [r.dict for r in get_response_validator().list_reports(
        tool_name=tool_name, valid_only=valid_only, tenant_id=tenant_id, limit=limit
    )]


@resp_validator_router.get("/tools/validate-response/summary", response_model=dict)
def validation_summary(tool_name: str | None = None) -> dict:
    return get_response_validator().summary(tool_name=tool_name)


@resp_validator_router.get("/tools/validate-response/reports/{validation_id}", response_model=dict)
def get_validation_report(validation_id: str) -> dict:
    report = get_response_validator().get_report(validation_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report.dict


# ---------------------------------------------------------------------------
# 7. Tool Cost Estimator — /api/v1/product/tools/cost
# ---------------------------------------------------------------------------


class CostModelRegisterRequest(BaseModel):
    tool_name: str
    cost_per_call_usd: float = 0.0
    cost_per_1k_input_tokens_usd: float = 0.0025
    cost_per_1k_output_tokens_usd: float = 0.010
    avg_latency_ms: int = 1200
    avg_input_tokens: int = 0
    avg_output_tokens: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


class CostEstimateRequest(BaseModel):
    tool_name: str
    input_text: str | None = None
    output_text: str | None = None
    estimated_input_tokens: int | None = None
    estimated_output_tokens: int | None = None
    budget_cap_usd: float | None = None
    tenant_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class CostChainRequest(BaseModel):
    tools: list[str]
    budget_cap_usd: float | None = None
    tenant_id: str = ""


@tool_cost_router.post("/tools/cost/models", response_model=dict)
def register_cost_model(payload: CostModelRegisterRequest) -> dict:
    """Register or update the cost model for a tool."""
    model = CostModel(
        tool_name=payload.tool_name,
        cost_per_call_usd=payload.cost_per_call_usd,
        cost_per_1k_input_tokens_usd=payload.cost_per_1k_input_tokens_usd,
        cost_per_1k_output_tokens_usd=payload.cost_per_1k_output_tokens_usd,
        avg_latency_ms=payload.avg_latency_ms,
        avg_input_tokens=payload.avg_input_tokens,
        avg_output_tokens=payload.avg_output_tokens,
        metadata=payload.metadata,
    )
    get_tool_cost_estimator().register_model(model)
    return {"tool_name": payload.tool_name, "registered": True}


@tool_cost_router.get("/tools/cost/models", response_model=list)
def list_cost_models() -> list:
    return [m.dict for m in get_tool_cost_estimator().list_models()]


@tool_cost_router.post("/tools/cost", response_model=dict)
def estimate_tool_cost(payload: CostEstimateRequest) -> dict:
    """Estimate token/API/time cost before calling a tool."""
    est = get_tool_cost_estimator().estimate(
        tool_name=payload.tool_name,
        input_text=payload.input_text,
        output_text=payload.output_text,
        estimated_input_tokens=payload.estimated_input_tokens,
        estimated_output_tokens=payload.estimated_output_tokens,
        budget_cap_usd=payload.budget_cap_usd,
        tenant_id=payload.tenant_id,
        metadata=payload.metadata,
    )
    return est.dict


@tool_cost_router.post("/tools/cost/chain", response_model=dict)
def estimate_chain_cost(payload: CostChainRequest) -> dict:
    """Estimate total cost for a chain of tool calls."""
    return get_tool_cost_estimator().estimate_chain(
        tools=payload.tools,
        budget_cap_usd=payload.budget_cap_usd,
        tenant_id=payload.tenant_id,
    )


@tool_cost_router.get("/tools/cost/estimates", response_model=list)
def list_cost_estimates(
    tool_name: str | None = None,
    tenant_id: str | None = None,
    limit: int = Query(100, ge=1, le=1000),
) -> list:
    return [e.dict for e in get_tool_cost_estimator().list_estimates(tool_name=tool_name, tenant_id=tenant_id, limit=limit)]


# ---------------------------------------------------------------------------
# 8. Tool Chain Builder — /api/v1/product/tools/chain
# ---------------------------------------------------------------------------


class ChainToolRegisterRequest(BaseModel):
    tool_name: str
    capabilities: list[str]
    input_types: list[str] = Field(default_factory=list)
    output_types: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ChainBuildRequest(BaseModel):
    goal: str
    max_steps: int = Field(6, ge=1, le=10)
    tenant_id: str = ""
    session_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


@tool_chain_router.post("/tools/chain/catalog", response_model=dict)
def register_chain_tool(payload: ChainToolRegisterRequest) -> dict:
    """Register a tool in the chain builder catalog."""
    tool = get_tool_chain_builder().register_tool(
        tool_name=payload.tool_name,
        capabilities=payload.capabilities,
        input_types=payload.input_types,
        output_types=payload.output_types,
        metadata=payload.metadata,
    )
    return tool.dict


@tool_chain_router.get("/tools/chain/catalog", response_model=list)
def list_chain_catalog(active_only: bool = True) -> list:
    return [t.dict for t in get_tool_chain_builder().list_catalog(active_only=active_only)]


@tool_chain_router.post("/tools/chain", response_model=dict)
def build_tool_chain(payload: ChainBuildRequest) -> dict:
    """Synthesize a minimal tool sequence to satisfy a goal."""
    chain = get_tool_chain_builder().build(
        goal=payload.goal,
        max_steps=payload.max_steps,
        tenant_id=payload.tenant_id,
        session_id=payload.session_id,
        metadata=payload.metadata,
    )
    return chain.dict


@tool_chain_router.get("/tools/chain/{chain_id}", response_model=dict)
def get_tool_chain(chain_id: str) -> dict:
    chain = get_tool_chain_builder().get_chain(chain_id)
    if not chain:
        raise HTTPException(status_code=404, detail="Chain not found")
    return chain.dict


@tool_chain_router.get("/tools/chains", response_model=list)
def list_tool_chains(
    tenant_id: str | None = None,
    session_id: str | None = None,
    limit: int = Query(50, ge=1, le=500),
) -> list:
    return [c.dict for c in get_tool_chain_builder().list_chains(tenant_id=tenant_id, session_id=session_id, limit=limit)]


# ---------------------------------------------------------------------------
# 9. Tool Fallback Manager — /api/v1/product/tools/fallback
# ---------------------------------------------------------------------------


class FallbackChainRegisterRequest(BaseModel):
    primary_tool: str
    fallbacks: list[dict[str, Any]]
    error_triggers: list[str] = Field(default_factory=list)
    max_attempts: int = 3
    escalate_after: int = 3
    tenant_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class FallbackDecideRequest(BaseModel):
    primary_tool: str
    failed_tool: str
    error_type: str = ""
    attempt_number: int = 0
    session_id: str = ""
    tenant_id: str = ""


class FallbackAttemptLogRequest(BaseModel):
    chain_id: str
    primary_tool: str
    attempted_tool: str
    position: int = 0
    error_type: str = ""
    error_message: str = ""
    succeeded: bool = False
    latency_ms: int = 0
    session_id: str = ""
    tenant_id: str = ""


class EquivalenceGroupRequest(BaseModel):
    name: str
    tool_names: list[str]
    description: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


@tool_fallback_router.post("/tools/fallback/chains", response_model=dict)
def register_fallback_chain(payload: FallbackChainRegisterRequest) -> dict:
    """Register or update a fallback chain for a primary tool."""
    chain = get_tool_fallback_manager().register_chain(
        primary_tool=payload.primary_tool,
        fallbacks=payload.fallbacks,
        error_triggers=payload.error_triggers,
        max_attempts=payload.max_attempts,
        escalate_after=payload.escalate_after,
        tenant_id=payload.tenant_id,
        metadata=payload.metadata,
    )
    return chain.dict


@tool_fallback_router.get("/tools/fallback/chains", response_model=list)
def list_fallback_chains(
    tenant_id: str | None = None,
    active_only: bool = True,
    limit: int = Query(100, ge=1, le=500),
) -> list:
    return [c.dict for c in get_tool_fallback_manager().list_chains(tenant_id=tenant_id, active_only=active_only, limit=limit)]


@tool_fallback_router.get("/tools/fallback/chains/{primary_tool}", response_model=dict)
def get_fallback_chain(primary_tool: str, tenant_id: str = "") -> dict:
    chain = get_tool_fallback_manager().get_chain(primary_tool, tenant_id=tenant_id)
    if not chain:
        raise HTTPException(status_code=404, detail="Chain not found")
    return chain.dict


@tool_fallback_router.delete("/tools/fallback/chains/{chain_id}", response_model=dict)
def deactivate_fallback_chain(chain_id: str) -> dict:
    ok = get_tool_fallback_manager().deactivate_chain(chain_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Chain not found")
    return {"chain_id": chain_id, "deactivated": True}


@tool_fallback_router.post("/tools/fallback/decide", response_model=dict)
def decide_fallback(payload: FallbackDecideRequest) -> dict:
    """Get the next tool to try after a failure, or escalation recommendation."""
    decision = get_tool_fallback_manager().decide_next(
        primary_tool=payload.primary_tool,
        failed_tool=payload.failed_tool,
        error_type=payload.error_type,
        attempt_number=payload.attempt_number,
        session_id=payload.session_id,
        tenant_id=payload.tenant_id,
    )
    return decision.dict


@tool_fallback_router.post("/tools/fallback/attempts", response_model=dict)
def log_fallback_attempt(payload: FallbackAttemptLogRequest) -> dict:
    """Log a tool attempt (success or failure) for audit."""
    attempt = get_tool_fallback_manager().log_attempt(
        chain_id=payload.chain_id,
        primary_tool=payload.primary_tool,
        attempted_tool=payload.attempted_tool,
        position=payload.position,
        error_type=payload.error_type,
        error_message=payload.error_message,
        succeeded=payload.succeeded,
        latency_ms=payload.latency_ms,
        session_id=payload.session_id,
        tenant_id=payload.tenant_id,
    )
    return attempt.dict


@tool_fallback_router.get("/tools/fallback/attempts", response_model=list)
def list_fallback_attempts(
    chain_id: str | None = None,
    session_id: str | None = None,
    tenant_id: str | None = None,
    limit: int = Query(100, ge=1, le=1000),
) -> list:
    return [a.dict for a in get_tool_fallback_manager().list_attempts(
        chain_id=chain_id, session_id=session_id, tenant_id=tenant_id, limit=limit
    )]


@tool_fallback_router.post("/tools/fallback/equivalence-groups", response_model=dict)
def register_equivalence_group(payload: EquivalenceGroupRequest) -> dict:
    """Register a semantic equivalence group for tools."""
    group = get_tool_fallback_manager().register_equivalence_group(
        name=payload.name, tool_names=payload.tool_names,
        description=payload.description, metadata=payload.metadata,
    )
    return group.dict


@tool_fallback_router.get("/tools/fallback/equivalence-groups", response_model=list)
def list_equivalence_groups() -> list:
    return [g.dict for g in get_tool_fallback_manager().list_equivalence_groups()]


# ---------------------------------------------------------------------------
# 10. Tool Rate Limiter — /api/v1/product/tools/rate-limit
# ---------------------------------------------------------------------------


class RateLimitPolicyRequest(BaseModel):
    tool_name: str
    calls_per_minute: int = Field(60, ge=1)
    calls_per_hour: int = Field(1000, ge=1)
    burst_capacity: int = Field(10, ge=1)
    queue_max_depth: int = Field(50, ge=0)
    tenant_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class RateLimitCheckRequest(BaseModel):
    tool_name: str
    tenant_id: str = ""
    session_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


@tool_rate_router.post("/tools/rate-limit/policies", response_model=dict)
def set_rate_limit_policy(payload: RateLimitPolicyRequest) -> dict:
    """Create or update a rate limit policy for a tool."""
    policy = get_tool_rate_limiter().set_policy(
        tool_name=payload.tool_name,
        calls_per_minute=payload.calls_per_minute,
        calls_per_hour=payload.calls_per_hour,
        burst_capacity=payload.burst_capacity,
        queue_max_depth=payload.queue_max_depth,
        tenant_id=payload.tenant_id,
        metadata=payload.metadata,
    )
    return policy.dict


@tool_rate_router.get("/tools/rate-limit/policies", response_model=list)
def list_rate_limit_policies(
    tenant_id: str | None = None,
    active_only: bool = True,
) -> list:
    return [p.dict for p in get_tool_rate_limiter().list_policies(tenant_id=tenant_id, active_only=active_only)]


@tool_rate_router.get("/tools/rate-limit/policies/{tool_name}", response_model=dict)
def get_rate_limit_policy(tool_name: str, tenant_id: str = "") -> dict:
    policy = get_tool_rate_limiter().get_policy(tool_name, tenant_id=tenant_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy.dict


@tool_rate_router.delete("/tools/rate-limit/policies/{policy_id}", response_model=dict)
def deactivate_rate_limit_policy(policy_id: str) -> dict:
    ok = get_tool_rate_limiter().deactivate_policy(policy_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Policy not found")
    return {"policy_id": policy_id, "deactivated": True}


@tool_rate_router.post("/tools/rate-limit/check", response_model=dict)
def check_rate_limit(payload: RateLimitCheckRequest) -> dict:
    """Consume one token for a tool call. Returns allowed/denied + wait_ms."""
    decision = get_tool_rate_limiter().check_and_consume(
        tool_name=payload.tool_name,
        tenant_id=payload.tenant_id,
        session_id=payload.session_id,
        metadata=payload.metadata,
    )
    return decision.dict


@tool_rate_router.get("/tools/rate-limit/bucket/{tool_name}", response_model=dict)
def get_rate_limit_bucket(tool_name: str, tenant_id: str = "") -> dict:
    """Get current token bucket state for a tool."""
    bucket = get_tool_rate_limiter().get_bucket(tool_name, tenant_id=tenant_id)
    if not bucket:
        raise HTTPException(status_code=404, detail="Bucket not found (no policy registered)")
    return bucket.dict


@tool_rate_router.get("/tools/rate-limit/events", response_model=list)
def list_rate_limit_events(
    tool_name: str | None = None,
    tenant_id: str | None = None,
    allowed_only: bool | None = None,
    limit: int = Query(200, ge=1, le=2000),
) -> list:
    return [e.dict for e in get_tool_rate_limiter().list_events(
        tool_name=tool_name, tenant_id=tenant_id,
        allowed_only=allowed_only, limit=limit
    )]


@tool_rate_router.get("/tools/rate-limit/stats", response_model=dict)
def rate_limit_stats(
    tool_name: str | None = None,
    tenant_id: str | None = None,
) -> dict:
    """Aggregate rate limit usage statistics."""
    return get_tool_rate_limiter().stats(tool_name=tool_name, tenant_id=tenant_id)


# =============================================================================
# Wave-Final: Orchestration + Reliability Routes
# =============================================================================

# ── imports ───────────────────────────────────────────────────────────────────
from amc.product.workflow_engine import (
    WorkflowStatus,
    StepStatus as WFStepStatus,
    StepDefinition,
    WorkflowEngine,
    _get_engine as get_workflow_engine,
    reset_engine as reset_workflow_engine,
)
from amc.product.event_router import (
    EventType,
    TargetType,
    DeliveryStatus,
    EventPayload,
    _get_router as get_event_router,
)
from amc.product.retry_engine import (
    RetryStrategy,
    RetryJobStatus,
    RetryEngine,
    _get_retry_engine as get_retry_engine,
)
from amc.product.compensation import (
    CompensationStatus,
    CompensationEngine,
    get_compensation_engine,
)
from amc.product.rate_limiter import (
    QuotaPeriod,
    RateLimitManager,
    get_rate_limit_manager,
)
from amc.product.sync_connector import (
    SyncStatus,
    ChangeType,
    SourceType as SyncSourceType,
    SyncManager,
    get_sync_manager,
)
from amc.product.knowledge_graph import (
    EntityType,
    RelType,
    KnowledgeGraph,
    get_knowledge_graph,
)
from amc.product.document_assembler import (
    AssemblyStatus,
    OutputFormat as DocOutputFormat,
    DocumentAssembler,
    get_document_assembler,
)
from amc.product.batch_processor import (
    BatchStatus,
    ItemStatus,
    BatchProcessor,
    get_batch_processor,
)

# ── routers ───────────────────────────────────────────────────────────────────
workflow_engine_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-workflow-engine"])
event_router_r = APIRouter(prefix="/api/v1/product", tags=["product", "product-events"])
retry_engine_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-retry"])
compensation_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-compensation"])
rate_limits_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-rate-limits"])
sync_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-sync"])
graph_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-graph"])
doc_assemble_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-doc-assemble"])
batch_router = APIRouter(prefix="/api/v1/product", tags=["product", "product-batch"])


# ==========================================================================
# 1. Workflow Engine — /api/v1/product/workflows/*
# ==========================================================================

class WFCreateRequest(BaseModel):
    name: str
    description: str = ""
    steps: list[dict[str, Any]] = Field(default_factory=list)
    input_data: dict[str, Any] = Field(default_factory=dict)


class WFCheckpointRequest(BaseModel):
    step_id: str
    state: dict[str, Any] = Field(default_factory=dict)


class WFStepResultRequest(BaseModel):
    output_data: dict[str, Any] = Field(default_factory=dict)
    error: str = ""


@workflow_engine_router.post("/workflows", response_model=dict)
def create_workflow(payload: WFCreateRequest) -> dict:
    """Create a new durable workflow."""
    steps = [StepDefinition(**s) for s in payload.steps]
    wf = get_workflow_engine().create_workflow(
        name=payload.name,
        description=payload.description,
        steps=steps,
        input_data=payload.input_data,
    )
    return wf.dict


@workflow_engine_router.post("/workflows/{workflow_id}/start", response_model=dict)
def start_workflow(workflow_id: str) -> dict:
    """Start a workflow run."""
    try:
        wf = get_workflow_engine().start_workflow(workflow_id)
        return wf.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@workflow_engine_router.post("/workflows/{workflow_id}/resume", response_model=dict)
def resume_workflow(workflow_id: str) -> dict:
    """Resume a paused/interrupted workflow from its last checkpoint."""
    try:
        wf = get_workflow_engine().resume_workflow(workflow_id)
        return wf.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@workflow_engine_router.post("/workflows/{workflow_id}/complete", response_model=dict)
def complete_workflow(workflow_id: str, payload: WFStepResultRequest = WFStepResultRequest()) -> dict:
    """Mark a workflow as completed."""
    try:
        wf = get_workflow_engine().complete_workflow(workflow_id, payload.output_data)
        return wf.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@workflow_engine_router.post("/workflows/{workflow_id}/fail", response_model=dict)
def fail_workflow(workflow_id: str, payload: WFStepResultRequest = WFStepResultRequest()) -> dict:
    """Mark a workflow as failed."""
    try:
        wf = get_workflow_engine().fail_workflow(workflow_id, payload.error)
        return wf.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@workflow_engine_router.post("/workflows/{workflow_id}/checkpoint", response_model=dict)
def checkpoint_workflow(workflow_id: str, payload: WFCheckpointRequest) -> dict:
    """Save a checkpoint for a workflow step."""
    cp = get_workflow_engine().checkpoint(workflow_id, payload.step_id, payload.state)
    return cp.dict


@workflow_engine_router.post("/workflows/{workflow_id}/steps/{step_id}/complete", response_model=dict)
def complete_step(workflow_id: str, step_id: str, payload: WFStepResultRequest = WFStepResultRequest()) -> dict:
    """Mark a workflow step as completed."""
    try:
        step = get_workflow_engine().complete_step(workflow_id, step_id, payload.output_data)
        return step.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@workflow_engine_router.post("/workflows/{workflow_id}/steps/{step_id}/fail", response_model=dict)
def fail_step(workflow_id: str, step_id: str, payload: WFStepResultRequest = WFStepResultRequest()) -> dict:
    """Mark a workflow step as failed."""
    try:
        step = get_workflow_engine().fail_step(workflow_id, step_id, payload.error)
        return step.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@workflow_engine_router.get("/workflows/{workflow_id}", response_model=dict)
def get_workflow(workflow_id: str) -> dict:
    """Get a workflow by ID."""
    wf = get_workflow_engine().get_workflow(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id!r} not found")
    return wf.dict


@workflow_engine_router.get("/workflows", response_model=list)
def list_workflows(status: str = "", limit: int = 50) -> list:
    """List workflows, optionally filtered by status."""
    wfs = get_workflow_engine().list_workflows(status=status or None, limit=limit)
    return [w.dict for w in wfs]


@workflow_engine_router.get("/workflows/{workflow_id}/steps", response_model=list)
def get_workflow_steps(workflow_id: str) -> list:
    """List all steps for a workflow."""
    return [s.dict for s in get_workflow_engine().get_steps(workflow_id)]


@workflow_engine_router.get("/workflows/{workflow_id}/checkpoints", response_model=list)
def get_workflow_checkpoints(workflow_id: str) -> list:
    """List all checkpoints for a workflow."""
    return [c.dict for c in get_workflow_engine().get_checkpoints(workflow_id)]


# ==========================================================================
# 2. Event Router — /api/v1/product/events/*
# ==========================================================================

class RouteCreateRequest(BaseModel):
    name: str
    event_type: str
    source_filter: dict[str, Any] = Field(default_factory=dict)
    target_type: str = "log"
    target_config: dict[str, Any] = Field(default_factory=dict)
    enrichment: dict[str, Any] = Field(default_factory=dict)
    priority: int = 0


class RouteUpdateRequest(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    priority: int | None = None
    target_config: dict[str, Any] | None = None
    enrichment: dict[str, Any] | None = None


class EventDispatchRequest(BaseModel):
    event_type: str
    source: str = ""
    data: dict[str, Any] = Field(default_factory=dict)


@event_router_r.post("/events/routes", response_model=dict)
def create_event_route(payload: RouteCreateRequest) -> dict:
    """Create an event routing rule."""
    try:
        route = get_event_router().create_route(
            name=payload.name,
            event_type=payload.event_type,
            source_filter=payload.source_filter,
            target_type=payload.target_type,
            target_config=payload.target_config,
            enrichment=payload.enrichment,
            priority=payload.priority,
        )
        return route.dict
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@event_router_r.get("/events/routes", response_model=list)
def list_event_routes(event_type: str = "", enabled: str = "") -> list:
    """List event routing rules."""
    en = None if enabled == "" else (enabled.lower() == "true")
    routes = get_event_router().list_routes(event_type=event_type or None, enabled=en)
    return [r.dict for r in routes]


@event_router_r.get("/events/routes/{route_id}", response_model=dict)
def get_event_route(route_id: str) -> dict:
    """Get a specific event route."""
    route = get_event_router().get_route(route_id)
    if not route:
        raise HTTPException(status_code=404, detail=f"Route {route_id!r} not found")
    return route.dict


@event_router_r.patch("/events/routes/{route_id}", response_model=dict)
def update_event_route(route_id: str, payload: RouteUpdateRequest) -> dict:
    """Update an event routing rule."""
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    try:
        route = get_event_router().update_route(route_id, **updates)
        return route.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@event_router_r.delete("/events/routes/{route_id}", response_model=dict)
def delete_event_route(route_id: str) -> dict:
    """Delete an event routing rule."""
    ok = get_event_router().delete_route(route_id)
    return {"deleted": ok, "route_id": route_id}


@event_router_r.post("/events/dispatch", response_model=list)
def dispatch_event(payload: EventDispatchRequest) -> list:
    """Dispatch an event through the router."""
    event = EventPayload(
        event_type=payload.event_type,
        source=payload.source,
        data=payload.data,
    )
    deliveries = get_event_router().route_event(event)
    return [d.dict for d in deliveries]


@event_router_r.get("/events/log", response_model=list)
def get_event_delivery_log(route_id: str = "", status: str = "", limit: int = 50) -> list:
    """Get event delivery log."""
    records = get_event_router().get_delivery_log(
        route_id=route_id or None,
        status=status or None,
        limit=limit,
    )
    return [r.dict for r in records]


@event_router_r.post("/events/log/{log_id}/retry", response_model=dict)
def retry_event_delivery(log_id: str) -> dict:
    """Retry a failed event delivery."""
    try:
        record = get_event_router().retry_delivery(log_id)
        return record.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ==========================================================================
# 3. Retry Engine — /api/v1/product/retry/*
# ==========================================================================

class RetryPolicyCreateRequest(BaseModel):
    name: str
    strategy: str = "exponential"
    max_attempts: int = 5
    base_delay_s: float = 1.0
    max_delay_s: float = 300.0
    multiplier: float = 2.0
    jitter: bool = True


class RetryJobSubmitRequest(BaseModel):
    policy_id: str
    segment_id: str
    context: dict[str, Any] = Field(default_factory=dict)


class RetryContextUpdateRequest(BaseModel):
    context_update: dict[str, Any]


@retry_engine_router.post("/retry/policies", response_model=dict)
def create_retry_policy(payload: RetryPolicyCreateRequest) -> dict:
    """Create a retry policy."""
    try:
        policy = get_retry_engine().create_policy(
            name=payload.name,
            strategy=payload.strategy,
            max_attempts=payload.max_attempts,
            base_delay_s=payload.base_delay_s,
            max_delay_s=payload.max_delay_s,
            multiplier=payload.multiplier,
            jitter=payload.jitter,
        )
        return policy.dict
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@retry_engine_router.get("/retry/policies", response_model=list)
def list_retry_policies() -> list:
    """List all retry policies."""
    return [p.dict for p in get_retry_engine().list_policies()]


@retry_engine_router.get("/retry/policies/{policy_id}", response_model=dict)
def get_retry_policy(policy_id: str) -> dict:
    """Get a retry policy by ID."""
    p = get_retry_engine().get_policy(policy_id)
    if not p:
        raise HTTPException(status_code=404, detail=f"Policy {policy_id!r} not found")
    return p.dict


@retry_engine_router.post("/retry/jobs", response_model=dict)
def submit_retry_job(payload: RetryJobSubmitRequest) -> dict:
    """Submit a segment-level retry job."""
    try:
        job = get_retry_engine().submit_job(
            policy_id=payload.policy_id,
            segment_id=payload.segment_id,
            context=payload.context,
        )
        return job.dict
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@retry_engine_router.get("/retry/jobs", response_model=list)
def list_retry_jobs(status: str = "", segment_id: str = "", limit: int = 50) -> list:
    """List retry jobs."""
    jobs = get_retry_engine().list_jobs(
        status=status or None,
        segment_id=segment_id or None,
        limit=limit,
    )
    return [j.dict for j in jobs]


@retry_engine_router.get("/retry/jobs/{job_id}", response_model=dict)
def get_retry_job(job_id: str) -> dict:
    """Get a retry job by ID."""
    job = get_retry_engine().get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")
    return job.dict


@retry_engine_router.post("/retry/jobs/{job_id}/attempt", response_model=dict)
def attempt_retry_job(job_id: str) -> dict:
    """Mark a retry job as running (attempt)."""
    try:
        job = get_retry_engine().attempt_job(job_id)
        return job.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@retry_engine_router.post("/retry/jobs/{job_id}/complete", response_model=dict)
def complete_retry_job(job_id: str) -> dict:
    """Mark a retry job as completed."""
    try:
        job = get_retry_engine().complete_job(job_id)
        return job.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@retry_engine_router.post("/retry/jobs/{job_id}/fail", response_model=dict)
def fail_retry_attempt(job_id: str, error: str = "") -> dict:
    """Record a failed attempt and schedule the next retry."""
    try:
        job = get_retry_engine().fail_attempt(job_id, error=error)
        return job.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@retry_engine_router.patch("/retry/jobs/{job_id}/context", response_model=dict)
def update_retry_context(job_id: str, payload: RetryContextUpdateRequest) -> dict:
    """Preserve/merge context for a retry job."""
    try:
        job = get_retry_engine().preserve_context(job_id, payload.context_update)
        return job.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@retry_engine_router.get("/retry/jobs/{job_id}/log", response_model=list)
def get_retry_job_log(job_id: str) -> list:
    """Get retry log entries for a job."""
    return [e.dict for e in get_retry_engine().get_retry_log(job_id)]


@retry_engine_router.get("/retry/due", response_model=list)
def get_due_retry_jobs() -> list:
    """Get all retry jobs that are due for execution."""
    return [j.dict for j in get_retry_engine().get_due_jobs()]


# ==========================================================================
# 4. Compensation Engine — /api/v1/product/compensation/*
# ==========================================================================

class CompPlanCreateRequest(BaseModel):
    name: str
    description: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class CompStepRegisterRequest(BaseModel):
    name: str
    seq: int = 0
    action_fn: str = ""
    compensate_fn: str = ""
    input_data: dict[str, Any] = Field(default_factory=dict)


class CompStepResultRequest(BaseModel):
    output_data: dict[str, Any] = Field(default_factory=dict)
    error: str = ""


@compensation_router.post("/compensation/plans", response_model=dict)
def create_compensation_plan(payload: CompPlanCreateRequest) -> dict:
    """Create a compensation plan."""
    plan = get_compensation_engine().create_plan(
        name=payload.name,
        description=payload.description,
        metadata=payload.metadata,
    )
    return plan.dict


@compensation_router.get("/compensation/plans", response_model=list)
def list_compensation_plans(status: str = "") -> list:
    """List compensation plans."""
    plans = get_compensation_engine().list_plans(status=status or None)
    return [p.dict for p in plans]


@compensation_router.get("/compensation/plans/{plan_id}", response_model=dict)
def get_compensation_plan(plan_id: str) -> dict:
    """Get a compensation plan by ID."""
    plan = get_compensation_engine().get_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail=f"Plan {plan_id!r} not found")
    return plan.dict


@compensation_router.post("/compensation/plans/{plan_id}/steps", response_model=dict)
def register_compensation_step(plan_id: str, payload: CompStepRegisterRequest) -> dict:
    """Register a step with its compensating action."""
    try:
        step = get_compensation_engine().register_step(
            plan_id=plan_id,
            name=payload.name,
            seq=payload.seq,
            action_fn=payload.action_fn,
            compensate_fn=payload.compensate_fn,
            input_data=payload.input_data,
        )
        return step.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@compensation_router.post("/compensation/plans/{plan_id}/steps/{step_id}/execute", response_model=dict)
def execute_compensation_step(plan_id: str, step_id: str, payload: CompStepResultRequest = CompStepResultRequest()) -> dict:
    """Mark a step as executed."""
    try:
        step = get_compensation_engine().execute_step(plan_id, step_id, payload.output_data)
        return step.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@compensation_router.post("/compensation/plans/{plan_id}/steps/{step_id}/fail", response_model=dict)
def fail_compensation_step(plan_id: str, step_id: str, payload: CompStepResultRequest = CompStepResultRequest()) -> dict:
    """Mark a step as failed (triggers compensation chain)."""
    try:
        step = get_compensation_engine().fail_step(plan_id, step_id, payload.error)
        return step.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@compensation_router.post("/compensation/plans/{plan_id}/steps/{step_id}/compensate", response_model=dict)
def compensate_step(plan_id: str, step_id: str) -> dict:
    """Run compensating action for a specific step."""
    try:
        step = get_compensation_engine().compensate_step(plan_id, step_id)
        return step.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@compensation_router.post("/compensation/plans/{plan_id}/compensate-from/{failed_step_id}", response_model=list)
def compensate_from(plan_id: str, failed_step_id: str) -> list:
    """Run partial failure recovery from the failed step backwards."""
    try:
        steps = get_compensation_engine().compensate_from(plan_id, failed_step_id)
        return [s.dict for s in steps]
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@compensation_router.get("/compensation/plans/{plan_id}/steps", response_model=list)
def get_compensation_steps(plan_id: str) -> list:
    """Get all steps for a compensation plan."""
    return [s.dict for s in get_compensation_engine().get_steps(plan_id)]


@compensation_router.get("/compensation/plans/{plan_id}/log", response_model=list)
def get_compensation_log(plan_id: str) -> list:
    """Get execution log for a compensation plan."""
    return [e.dict for e in get_compensation_engine().get_log(plan_id)]


@compensation_router.post("/compensation/plans/{plan_id}/complete", response_model=dict)
def complete_compensation_plan(plan_id: str) -> dict:
    """Mark a compensation plan as completed."""
    try:
        plan = get_compensation_engine().complete_plan(plan_id)
        return plan.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ==========================================================================
# 5. Rate Limiter — /api/v1/product/rate-limits/*
# ==========================================================================

class RLConfigCreateRequest(BaseModel):
    connector_id: str
    name: str
    requests_per_window: int = 100
    window_s: float = 60.0
    burst_limit: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


class QuotaCreateRequest(BaseModel):
    connector_id: str
    period: str = "day"
    quota_limit: int = 1000
    reset_at: str = ""


class QueueCallRequest(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)
    priority: int = 0


@rate_limits_router.post("/rate-limits/configs", response_model=dict)
def create_rate_limit_config(payload: RLConfigCreateRequest) -> dict:
    """Create a rate limit config for a connector."""
    cfg = get_rate_limit_manager().create_config(
        connector_id=payload.connector_id,
        name=payload.name,
        requests_per_window=payload.requests_per_window,
        window_s=payload.window_s,
        burst_limit=payload.burst_limit,
    )
    return cfg.dict


@rate_limits_router.get("/rate-limits/configs", response_model=list)
def list_rate_limit_configs() -> list:
    """List all rate limit configs."""
    return [c.dict for c in get_rate_limit_manager().list_configs()]


@rate_limits_router.get("/rate-limits/configs/{config_id}", response_model=dict)
def get_rate_limit_config(config_id: str) -> dict:
    """Get a rate limit config by ID."""
    cfg = get_rate_limit_manager().get_config(config_id)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Config {config_id!r} not found")
    return cfg.dict


@rate_limits_router.get("/rate-limits/connectors/{connector_id}/check", response_model=dict)
def check_rate_limit(connector_id: str) -> dict:
    """Check if a connector is within its rate limit."""
    return get_rate_limit_manager().check_limit(connector_id)


@rate_limits_router.post("/rate-limits/connectors/{connector_id}/record", response_model=dict)
def record_rate_limit_call(connector_id: str) -> dict:
    """Record a call against the connector's rate limit."""
    try:
        window = get_rate_limit_manager().record_call(connector_id)
        return window.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@rate_limits_router.post("/rate-limits/connectors/{connector_id}/enqueue", response_model=dict)
def enqueue_rate_limited_call(connector_id: str, payload: QueueCallRequest) -> dict:
    """Enqueue a call to be executed when rate limit allows."""
    try:
        call = get_rate_limit_manager().enqueue_call(
            connector_id=connector_id,
            payload=payload.payload,
            priority=payload.priority,
        )
        return call.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@rate_limits_router.get("/rate-limits/connectors/{connector_id}/queue", response_model=list)
def get_rate_limit_queue(connector_id: str, status: str = "") -> list:
    """Get queued calls for a connector."""
    calls = get_rate_limit_manager().get_queue(
        connector_id=connector_id, status=status or None
    )
    return [c.dict for c in calls]


@rate_limits_router.get("/rate-limits/connectors/{connector_id}/summary", response_model=dict)
def get_rate_limit_summary(connector_id: str) -> dict:
    """Get usage summary for a connector."""
    return get_rate_limit_manager().get_usage_summary(connector_id)


@rate_limits_router.post("/rate-limits/quotas", response_model=dict)
def track_quota(payload: QuotaCreateRequest) -> dict:
    """Create/update a quota tracker for a connector."""
    from datetime import datetime, timezone
    reset_at = (
        datetime.fromisoformat(payload.reset_at)
        if payload.reset_at
        else datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    )
    quota = get_rate_limit_manager().track_quota(
        connector_id=payload.connector_id,
        period=payload.period,
        quota_limit=payload.quota_limit,
        reset_at=reset_at,
    )
    return quota.dict


@rate_limits_router.post("/rate-limits/connectors/{connector_id}/quotas/{period}/consume", response_model=dict)
def consume_quota(connector_id: str, period: str, amount: int = 1) -> dict:
    """Consume quota for a connector."""
    try:
        quota = get_rate_limit_manager().consume_quota(connector_id, period, amount)
        return quota.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@rate_limits_router.get("/rate-limits/connectors/{connector_id}/quotas/{period}", response_model=dict)
def get_quota(connector_id: str, period: str) -> dict:
    """Get quota status for a connector."""
    quota = get_rate_limit_manager().get_quota(connector_id, period)
    if not quota:
        raise HTTPException(status_code=404, detail=f"Quota not found for {connector_id}/{period}")
    return quota.dict


# ==========================================================================
# 6. Sync Connector — /api/v1/product/sync/*
# ==========================================================================

class SyncConnectorCreateRequest(BaseModel):
    name: str
    source_type: str = "api"
    config: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SyncRunStartRequest(BaseModel):
    cursor_start: str = ""


class SyncDetectChangesRequest(BaseModel):
    records: list[dict[str, Any]]
    id_field: str = "id"


class SyncRunCompleteRequest(BaseModel):
    cursor_end: str = ""
    records_synced: int = 0
    records_failed: int = 0


@sync_router.post("/sync/connectors", response_model=dict)
def register_sync_connector(payload: SyncConnectorCreateRequest) -> dict:
    """Register a new sync connector."""
    connector = get_sync_manager().register_connector(
        name=payload.name,
        source_type=payload.source_type,
        config=payload.config,
        metadata=payload.metadata,
    )
    return connector.dict


@sync_router.get("/sync/connectors", response_model=list)
def list_sync_connectors(status: str = "") -> list:
    """List sync connectors."""
    return [c.dict for c in get_sync_manager().list_connectors(status=status or None)]


@sync_router.get("/sync/connectors/{connector_id}", response_model=dict)
def get_sync_connector(connector_id: str) -> dict:
    """Get a sync connector by ID."""
    c = get_sync_manager().get_connector(connector_id)
    if not c:
        raise HTTPException(status_code=404, detail=f"Connector {connector_id!r} not found")
    return c.dict


@sync_router.delete("/sync/connectors/{connector_id}", response_model=dict)
def delete_sync_connector(connector_id: str) -> dict:
    """Delete a sync connector."""
    ok = get_sync_manager().delete_connector(connector_id)
    return {"deleted": ok, "connector_id": connector_id}


@sync_router.post("/sync/connectors/{connector_id}/runs", response_model=dict)
def start_sync_run(connector_id: str, payload: SyncRunStartRequest = SyncRunStartRequest()) -> dict:
    """Start a sync run for a connector."""
    try:
        run = get_sync_manager().start_run(connector_id, cursor_start=payload.cursor_start or None)
        return run.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@sync_router.post("/sync/runs/{run_id}/detect-changes", response_model=list)
def detect_sync_changes(run_id: str, payload: SyncDetectChangesRequest) -> list:
    """Detect changes in a batch of records (delta sync)."""
    changes = get_sync_manager().detect_changes(run_id, payload.records, id_field=payload.id_field)
    return [c.dict for c in changes]


@sync_router.post("/sync/runs/{run_id}/complete", response_model=dict)
def complete_sync_run(run_id: str, payload: SyncRunCompleteRequest = SyncRunCompleteRequest()) -> dict:
    """Mark a sync run as completed."""
    try:
        run = get_sync_manager().complete_run(
            run_id,
            cursor_end=payload.cursor_end or None,
            records_synced=payload.records_synced,
            records_failed=payload.records_failed,
        )
        return run.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@sync_router.post("/sync/runs/{run_id}/fail", response_model=dict)
def fail_sync_run(run_id: str, error: str = "") -> dict:
    """Mark a sync run as failed."""
    try:
        run = get_sync_manager().fail_run(run_id, error)
        return run.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@sync_router.get("/sync/runs", response_model=list)
def list_sync_runs(connector_id: str = "", status: str = "", limit: int = 20) -> list:
    """List sync runs."""
    return [r.dict for r in get_sync_manager().list_runs(
        connector_id=connector_id or None,
        status=status or None,
        limit=limit,
    )]


@sync_router.get("/sync/runs/{run_id}", response_model=dict)
def get_sync_run(run_id: str) -> dict:
    """Get a sync run by ID."""
    run = get_sync_manager().get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    return run.dict


@sync_router.get("/sync/changes", response_model=list)
def get_sync_changes(run_id: str = "", connector_id: str = "", change_type: str = "", limit: int = 100) -> list:
    """Get sync change records."""
    return [c.dict for c in get_sync_manager().get_changes(
        run_id=run_id or None,
        connector_id=connector_id or None,
        change_type=change_type or None,
        limit=limit,
    )]


@sync_router.get("/sync/log", response_model=list)
def get_sync_log(connector_id: str = "", run_id: str = "", limit: int = 100) -> list:
    """Get sync log entries."""
    return [e.dict for e in get_sync_manager().get_log(
        connector_id=connector_id or None,
        run_id=run_id or None,
        limit=limit,
    )]


# ==========================================================================
# 7. Knowledge Graph — /api/v1/product/graph/*
# ==========================================================================

class EntityCreateRequest(BaseModel):
    entity_type: str
    name: str
    properties: dict[str, Any] = Field(default_factory=dict)
    tenant_id: str = ""


class EntityUpdateRequest(BaseModel):
    name: str | None = None
    properties: dict[str, Any] | None = None


class RelationshipCreateRequest(BaseModel):
    from_entity_id: str
    to_entity_id: str
    rel_type: str
    properties: dict[str, Any] = Field(default_factory=dict)
    weight: float = 1.0


class CustomerContractInvoiceLinkRequest(BaseModel):
    customer_id: str
    contract_id: str
    invoice_id: str


class TypeChainQueryRequest(BaseModel):
    types: list[str]
    tenant_id: str = ""


@graph_router.post("/graph/entities", response_model=dict)
def add_graph_entity(payload: EntityCreateRequest) -> dict:
    """Add an entity to the knowledge graph."""
    entity = get_knowledge_graph().add_entity(
        entity_type=payload.entity_type,
        name=payload.name,
        properties=payload.properties,
        tenant_id=payload.tenant_id,
    )
    return entity.dict


@graph_router.get("/graph/entities", response_model=list)
def find_graph_entities(entity_type: str = "", name: str = "", tenant_id: str = "", limit: int = 50) -> list:
    """Find entities by type/name/tenant."""
    return [e.dict for e in get_knowledge_graph().find_entities(
        entity_type=entity_type or None,
        name=name or None,
        tenant_id=tenant_id or None,
        limit=limit,
    )]


@graph_router.get("/graph/entities/{entity_id}", response_model=dict)
def get_graph_entity(entity_id: str) -> dict:
    """Get an entity by ID."""
    entity = get_knowledge_graph().get_entity(entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail=f"Entity {entity_id!r} not found")
    return entity.dict


@graph_router.patch("/graph/entities/{entity_id}", response_model=dict)
def update_graph_entity(entity_id: str, payload: EntityUpdateRequest) -> dict:
    """Update an entity."""
    try:
        entity = get_knowledge_graph().update_entity(
            entity_id, name=payload.name, properties=payload.properties
        )
        return entity.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@graph_router.delete("/graph/entities/{entity_id}", response_model=dict)
def delete_graph_entity(entity_id: str) -> dict:
    """Delete an entity and its relationships."""
    ok = get_knowledge_graph().delete_entity(entity_id)
    return {"deleted": ok, "entity_id": entity_id}


@graph_router.post("/graph/relationships", response_model=dict)
def add_graph_relationship(payload: RelationshipCreateRequest) -> dict:
    """Add a relationship between entities."""
    try:
        rel = get_knowledge_graph().add_relationship(
            from_entity_id=payload.from_entity_id,
            to_entity_id=payload.to_entity_id,
            rel_type=payload.rel_type,
            properties=payload.properties,
            weight=payload.weight,
        )
        return rel.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@graph_router.get("/graph/relationships", response_model=list)
def find_graph_relationships(from_entity_id: str = "", to_entity_id: str = "", rel_type: str = "") -> list:
    """Find relationships."""
    return [r.dict for r in get_knowledge_graph().find_relationships(
        from_entity_id=from_entity_id or None,
        to_entity_id=to_entity_id or None,
        rel_type=rel_type or None,
    )]


@graph_router.delete("/graph/relationships/{rel_id}", response_model=dict)
def delete_graph_relationship(rel_id: str) -> dict:
    """Delete a relationship."""
    ok = get_knowledge_graph().delete_relationship(rel_id)
    return {"deleted": ok, "rel_id": rel_id}


@graph_router.get("/graph/entities/{entity_id}/neighbors", response_model=list)
def get_graph_neighbors(entity_id: str, rel_type: str = "", direction: str = "both") -> list:
    """Get neighbors of an entity."""
    return [e.dict for e in get_knowledge_graph().get_neighbors(
        entity_id, rel_type=rel_type or None, direction=direction
    )]


@graph_router.get("/graph/entities/{entity_id}/subgraph", response_model=dict)
def get_subgraph(entity_id: str, depth: int = 2) -> dict:
    """Get a subgraph centered on an entity."""
    return get_knowledge_graph().get_subgraph(entity_id, depth=depth)


@graph_router.get("/graph/path", response_model=dict)
def get_shortest_path(from_entity_id: str, to_entity_id: str, max_depth: int = 5) -> dict:
    """Get shortest path between two entities."""
    path = get_knowledge_graph().shortest_path(from_entity_id, to_entity_id, max_depth=max_depth)
    return path.dict if path else {"found": False, "path": []}


@graph_router.post("/graph/link/customer-contract-invoice", response_model=dict)
def link_customer_contract_invoice(payload: CustomerContractInvoiceLinkRequest) -> dict:
    """Convenience: link customer → contract → invoice."""
    return get_knowledge_graph().link_customer_contract_invoice(
        payload.customer_id, payload.contract_id, payload.invoice_id
    )


@graph_router.post("/graph/query/type-chain", response_model=list)
def query_type_chain(payload: TypeChainQueryRequest) -> list:
    """Query a chain of entity types (e.g. customer→contract→invoice)."""
    return get_knowledge_graph().query_by_type_chain(
        payload.types, tenant_id=payload.tenant_id or None
    )


@graph_router.get("/graph/stats", response_model=dict)
def get_graph_stats(tenant_id: str = "") -> dict:
    """Get knowledge graph statistics."""
    return get_knowledge_graph().get_graph_stats(tenant_id=tenant_id or None)


# ==========================================================================
# 8. Document Assembler — /api/v1/product/docs/assemble/*
# ==========================================================================

class DocTemplateCreateRequest(BaseModel):
    name: str
    description: str = ""
    format: str = "markdown"
    sections: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class DocAssemblyCreateRequest(BaseModel):
    name: str
    template_id: str = ""
    output_format: str = "markdown"
    metadata: dict[str, Any] = Field(default_factory=dict)


class DocSectionAddRequest(BaseModel):
    title: str
    seq: int = 0
    level: int = 1
    content: str = ""
    source_type: str = "manual"
    source_ref: str = ""


class DocSectionUpdateRequest(BaseModel):
    content: str | None = None
    status: str | None = None
    source_type: str | None = None
    source_ref: str | None = None


class DocArtifactAddRequest(BaseModel):
    section_id: str = ""
    artifact_type: str = "text"
    content: str = ""
    source_url: str = ""


@doc_assemble_router.post("/docs/assemble/templates", response_model=dict)
def create_doc_template(payload: DocTemplateCreateRequest) -> dict:
    """Create a document assembly template."""
    tpl = get_document_assembler().create_template(
        name=payload.name,
        description=payload.description,
        format=payload.format,
        sections=payload.sections,
    )
    return tpl.dict


@doc_assemble_router.get("/docs/assemble/templates", response_model=list)
def list_doc_templates() -> list:
    """List all document templates."""
    return [t.dict for t in get_document_assembler().list_templates()]


@doc_assemble_router.get("/docs/assemble/templates/{template_id}", response_model=dict)
def get_doc_template(template_id: str) -> dict:
    """Get a document template."""
    tpl = get_document_assembler().get_template(template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail=f"Template {template_id!r} not found")
    return tpl.dict


@doc_assemble_router.post("/docs/assemble/assemblies", response_model=dict)
def create_doc_assembly(payload: DocAssemblyCreateRequest) -> dict:
    """Create a new document assembly."""
    assembly = get_document_assembler().create_assembly(
        name=payload.name,
        template_id=payload.template_id or None,
        output_format=payload.output_format,
        metadata=payload.metadata,
    )
    return assembly.dict


@doc_assemble_router.get("/docs/assemble/assemblies", response_model=list)
def list_doc_assemblies(status: str = "") -> list:
    """List document assemblies."""
    return [a.dict for a in get_document_assembler().list_assemblies(status=status or None)]


@doc_assemble_router.get("/docs/assemble/assemblies/{assembly_id}", response_model=dict)
def get_doc_assembly(assembly_id: str) -> dict:
    """Get a document assembly."""
    assembly = get_document_assembler().get_assembly(assembly_id)
    if not assembly:
        raise HTTPException(status_code=404, detail=f"Assembly {assembly_id!r} not found")
    return assembly.dict


@doc_assemble_router.post("/docs/assemble/assemblies/{assembly_id}/sections", response_model=dict)
def add_doc_section(assembly_id: str, payload: DocSectionAddRequest) -> dict:
    """Add a section to a document assembly."""
    section = get_document_assembler().add_section(
        assembly_id=assembly_id,
        title=payload.title,
        seq=payload.seq,
        level=payload.level,
        content=payload.content,
        source_type=payload.source_type,
        source_ref=payload.source_ref,
    )
    return section.dict


@doc_assemble_router.patch("/docs/assemble/sections/{section_id}", response_model=dict)
def update_doc_section(section_id: str, payload: DocSectionUpdateRequest) -> dict:
    """Update a document section."""
    try:
        section = get_document_assembler().update_section(
            section_id,
            content=payload.content,
            status=payload.status,
            source_type=payload.source_type,
            source_ref=payload.source_ref,
        )
        return section.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@doc_assemble_router.get("/docs/assemble/assemblies/{assembly_id}/sections", response_model=list)
def get_doc_sections(assembly_id: str) -> list:
    """Get all sections for an assembly (ordered)."""
    return [s.dict for s in get_document_assembler().get_sections(assembly_id)]


@doc_assemble_router.post("/docs/assemble/assemblies/{assembly_id}/artifacts", response_model=dict)
def add_doc_artifact(assembly_id: str, payload: DocArtifactAddRequest) -> dict:
    """Add a sourced artifact to an assembly."""
    artifact = get_document_assembler().add_artifact(
        assembly_id=assembly_id,
        section_id=payload.section_id or None,
        artifact_type=payload.artifact_type,
        content=payload.content,
        source_url=payload.source_url,
    )
    return artifact.dict


@doc_assemble_router.get("/docs/assemble/assemblies/{assembly_id}/artifacts", response_model=list)
def get_doc_artifacts(assembly_id: str) -> list:
    """Get all artifacts for an assembly."""
    return [a.dict for a in get_document_assembler().get_artifacts(assembly_id=assembly_id)]


@doc_assemble_router.get("/docs/assemble/assemblies/{assembly_id}/toc", response_model=list)
def get_doc_toc(assembly_id: str) -> list:
    """Generate table of contents for an assembly."""
    return get_document_assembler().generate_toc(assembly_id)


@doc_assemble_router.post("/docs/assemble/assemblies/{assembly_id}/compile", response_model=dict)
def compile_doc_assembly(assembly_id: str) -> dict:
    """Compile all sections into the final document."""
    try:
        document = get_document_assembler().assemble_document(assembly_id)
        return {"assembly_id": assembly_id, "document": document}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@doc_assemble_router.post("/docs/assemble/assemblies/{assembly_id}/complete", response_model=dict)
def complete_doc_assembly(assembly_id: str) -> dict:
    """Mark a document assembly as completed."""
    try:
        assembly = get_document_assembler().complete_assembly(assembly_id)
        return assembly.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@doc_assemble_router.get("/docs/assemble/assemblies/{assembly_id}/word-counts", response_model=dict)
def get_doc_word_counts(assembly_id: str) -> dict:
    """Get per-section and total word counts."""
    return get_document_assembler().get_word_counts(assembly_id)


# ==========================================================================
# 9. Batch Processor — /api/v1/product/batch/*
# ==========================================================================

class BatchCreateRequest(BaseModel):
    name: str
    concurrency_limit: int = 5
    priority: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


class BatchItemAddRequest(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)
    seq: int | None = None


class BatchItemsBulkRequest(BaseModel):
    payloads: list[dict[str, Any]]


class BatchClaimRequest(BaseModel):
    worker_id: str
    count: int = 1


class BatchItemResultRequest(BaseModel):
    result: dict[str, Any] = Field(default_factory=dict)
    error: str = ""
    retry: bool = False


@batch_router.post("/batch/batches", response_model=dict)
def create_batch(payload: BatchCreateRequest) -> dict:
    """Create a new batch."""
    batch = get_batch_processor().create_batch(
        name=payload.name,
        concurrency_limit=payload.concurrency_limit,
        priority=payload.priority,
        metadata=payload.metadata,
    )
    return batch.dict


@batch_router.get("/batch/batches", response_model=list)
def list_batches(status: str = "", limit: int = 50) -> list:
    """List batches."""
    return [b.dict for b in get_batch_processor().list_batches(
        status=status or None, limit=limit
    )]


@batch_router.get("/batch/batches/{batch_id}", response_model=dict)
def get_batch(batch_id: str) -> dict:
    """Get a batch by ID."""
    batch = get_batch_processor().get_batch(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id!r} not found")
    return batch.dict


@batch_router.post("/batch/batches/{batch_id}/items", response_model=dict)
def add_batch_item(batch_id: str, payload: BatchItemAddRequest) -> dict:
    """Add a single item to a batch."""
    try:
        item = get_batch_processor().add_item(batch_id, payload.payload, seq=payload.seq)
        return item.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@batch_router.post("/batch/batches/{batch_id}/items/bulk", response_model=list)
def add_batch_items_bulk(batch_id: str, payload: BatchItemsBulkRequest) -> list:
    """Add multiple items to a batch in bulk."""
    try:
        items = get_batch_processor().add_items(batch_id, payload.payloads)
        return [i.dict for i in items]
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@batch_router.get("/batch/batches/{batch_id}/items", response_model=list)
def get_batch_items(batch_id: str, status: str = "") -> list:
    """Get all items for a batch."""
    return [i.dict for i in get_batch_processor().get_items(
        batch_id, status=status or None
    )]


@batch_router.post("/batch/batches/{batch_id}/start", response_model=dict)
def start_batch(batch_id: str) -> dict:
    """Start processing a batch."""
    try:
        batch = get_batch_processor().start_batch(batch_id)
        return batch.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@batch_router.post("/batch/batches/{batch_id}/claim", response_model=list)
def claim_batch_items(batch_id: str, payload: BatchClaimRequest) -> list:
    """Claim pending batch items for a worker."""
    items = get_batch_processor().claim_items(
        batch_id, worker_id=payload.worker_id, count=payload.count
    )
    return [i.dict for i in items]


@batch_router.post("/batch/items/{item_id}/complete", response_model=dict)
def complete_batch_item(item_id: str, payload: BatchItemResultRequest) -> dict:
    """Mark a batch item as completed."""
    try:
        item = get_batch_processor().complete_item(item_id, payload.result)
        return item.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@batch_router.post("/batch/items/{item_id}/fail", response_model=dict)
def fail_batch_item(item_id: str, payload: BatchItemResultRequest) -> dict:
    """Mark a batch item as failed."""
    try:
        item = get_batch_processor().fail_item(item_id, payload.error, retry=payload.retry)
        return item.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@batch_router.post("/batch/batches/{batch_id}/pause", response_model=dict)
def pause_batch(batch_id: str) -> dict:
    """Pause a running batch."""
    try:
        batch = get_batch_processor().pause_batch(batch_id)
        return batch.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@batch_router.post("/batch/batches/{batch_id}/resume", response_model=dict)
def resume_batch(batch_id: str) -> dict:
    """Resume a paused batch."""
    try:
        batch = get_batch_processor().resume_batch(batch_id)
        return batch.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@batch_router.post("/batch/batches/{batch_id}/cancel", response_model=dict)
def cancel_batch(batch_id: str) -> dict:
    """Cancel a batch."""
    try:
        batch = get_batch_processor().cancel_batch(batch_id)
        return batch.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@batch_router.post("/batch/batches/{batch_id}/aggregate", response_model=dict)
def aggregate_batch_results(batch_id: str) -> dict:
    """Aggregate all item results for a batch."""
    try:
        result = get_batch_processor().aggregate_results(batch_id)
        return result.dict
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@batch_router.get("/batch/batches/{batch_id}/progress", response_model=dict)
def get_batch_progress(batch_id: str) -> dict:
    """Get batch progress (completion %, ETA)."""
    try:
        return get_batch_processor().get_progress(batch_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@batch_router.get("/batch/batches/{batch_id}/result", response_model=dict)
def get_batch_result(batch_id: str) -> dict:
    """Get aggregated result for a completed batch."""
    result = get_batch_processor().get_result(batch_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"No result for batch {batch_id!r}")
    return result.dict


# ==========================================================================
# Wave-2: Structured Output Enforcer — /api/v1/product/output/enforce
# ==========================================================================


class OutputSchemaRequest(BaseModel):
    format: str = OutputFormat.JSON.value
    fields: dict[str, str] = Field(default_factory=dict)
    required_headings: list[str] = Field(default_factory=list)
    required_columns: list[str] = Field(default_factory=list)
    strict: bool = False


class StructuredOutputEnforceRequest(BaseModel):
    raw_output: str
    schema_def: OutputSchemaRequest
    max_repair_attempts: int = Field(2, ge=1, le=5)
    metadata: dict[str, Any] = Field(default_factory=dict)


@structured_output_router.post("/output/enforce", response_model=dict)
def enforce_structured_output(payload: StructuredOutputEnforceRequest) -> dict:
    """Validate and auto-repair LLM output against a declared schema."""
    from amc.product.structured_output import OutputSchema as _OSchema
    try:
        fmt = OutputFormat(payload.schema_def.format)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid format: {payload.schema_def.format}")
    schema = _OSchema(
        format=fmt,
        fields=payload.schema_def.fields,
        required_headings=payload.schema_def.required_headings,
        required_columns=payload.schema_def.required_columns,
        strict=payload.schema_def.strict,
    )
    result = get_structured_output_enforcer().enforce(
        _StructuredEnforceRequest(
            raw_output=payload.raw_output,
            schema=schema,
            max_repair_attempts=payload.max_repair_attempts,
            metadata=payload.metadata,
        )
    )
    return result.dict


# ==========================================================================
# Wave-2: Output Diff Tracker — /api/v1/product/output/diff/*
# ==========================================================================


class OutputRunRecordRequest(BaseModel):
    output_text: str
    workflow_id: str = ""
    prompt_key: str = ""
    tenant_id: str = ""
    session_id: str = ""
    run_id: str | None = None
    auto_diff: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


class OutputDiffComputeRequest(BaseModel):
    run_a_id: str
    run_b_id: str
    metadata: dict[str, Any] = Field(default_factory=dict)


@output_diff_router.post("/output/diff/runs", response_model=dict)
def record_output_run(payload: OutputRunRecordRequest) -> dict:
    """Record an LLM output run (optionally auto-diff against previous)."""
    tracker = get_output_diff_tracker()
    rec = tracker.record_run(
        output_text=payload.output_text,
        workflow_id=payload.workflow_id,
        prompt_key=payload.prompt_key,
        tenant_id=payload.tenant_id,
        session_id=payload.session_id,
        run_id=payload.run_id,
        metadata=payload.metadata,
        auto_diff=payload.auto_diff,
    )
    return rec.dict


@output_diff_router.get("/output/diff/runs/{run_id}", response_model=dict)
def get_output_run(run_id: str) -> dict:
    rec = get_output_diff_tracker().get_run(run_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Run not found")
    return rec.dict


@output_diff_router.get("/output/diff/runs", response_model=list)
def list_output_runs(
    workflow_id: str | None = None,
    prompt_key: str | None = None,
    tenant_id: str | None = None,
    limit: int = Query(50, ge=1, le=500),
) -> list:
    """List recorded output runs."""
    return [r.dict for r in get_output_diff_tracker().list_runs(
        workflow_id=workflow_id, prompt_key=prompt_key, tenant_id=tenant_id, limit=limit
    )]


@output_diff_router.post("/output/diff/compute", response_model=dict)
def compute_output_diff(payload: OutputDiffComputeRequest) -> dict:
    """Compute a diff between two output runs."""
    try:
        diff = get_output_diff_tracker().compute_diff(
            run_a_id=payload.run_a_id,
            run_b_id=payload.run_b_id,
            metadata=payload.metadata,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return diff.dict


@output_diff_router.get("/output/diff/diffs", response_model=list)
def list_output_diffs(
    workflow_id: str | None = None,
    prompt_key: str | None = None,
    regressions_only: bool = False,
    limit: int = Query(50, ge=1, le=500),
) -> list:
    return [d.dict for d in get_output_diff_tracker().list_diffs(
        workflow_id=workflow_id, prompt_key=prompt_key,
        regressions_only=regressions_only, limit=limit
    )]


@output_diff_router.get("/output/diff/regression-summary", response_model=dict)
def output_regression_summary(
    workflow_id: str = Query(...),
    prompt_key: str = Query(""),
) -> dict:
    """Return regression statistics for a workflow/prompt pair."""
    return get_output_diff_tracker().regression_summary(workflow_id, prompt_key).dict


# ==========================================================================
# Wave-2: Instruction Formatter — /api/v1/product/instructions/format
# ==========================================================================


class InstructionFormatRequest(BaseModel):
    instruction: str
    audience_role: str = AudienceRole.GENERIC.value
    tone: str | None = None
    structure: str | None = None
    context: str = ""
    include_rationale: bool = False
    max_length: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


@instruction_fmt_router.post("/instructions/format", response_model=dict)
def format_instruction(payload: InstructionFormatRequest) -> dict:
    """Format an instruction for a specific persona/role/audience."""
    try:
        role = AudienceRole(payload.audience_role)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid role: {payload.audience_role}")
    tone = None
    if payload.tone:
        try:
            tone = Tone(payload.tone)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid tone: {payload.tone}")
    structure = None
    if payload.structure:
        try:
            structure = StructureStyle(payload.structure)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid structure: {payload.structure}")
    result = get_instruction_formatter().format(
        _FormatRequest(
            instruction=payload.instruction,
            audience_role=role,
            tone=tone,
            structure=structure,
            context=payload.context,
            include_rationale=payload.include_rationale,
            max_length=payload.max_length,
            metadata=payload.metadata,
        )
    )
    return result.dict


@instruction_fmt_router.get("/instructions/roles", response_model=list)
def list_instruction_roles() -> list:
    return get_instruction_formatter().list_roles()


@instruction_fmt_router.get("/instructions/roles/{role}/preset", response_model=dict)
def get_instruction_role_preset(role: str) -> dict:
    try:
        role_enum = AudienceRole(role)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Role not found: {role}")
    return get_instruction_formatter().role_preset(role_enum)


# ==========================================================================
# Wave-2: Plan Generator — /api/v1/product/plan/generate
# ==========================================================================


class PlanGenerateRequest(BaseModel):
    goal: str
    context: str = ""
    available_tools: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    max_steps: int = Field(10, ge=1, le=20)
    include_human_review_steps: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


@plan_router.post("/plan/generate", response_model=dict)
def generate_plan(payload: PlanGenerateRequest) -> dict:
    """Generate a structured execution plan from a goal."""
    plan = get_plan_generator().generate(
        _PlanRequest(
            goal=payload.goal,
            context=payload.context,
            available_tools=payload.available_tools,
            constraints=payload.constraints,
            max_steps=payload.max_steps,
            include_human_review_steps=payload.include_human_review_steps,
            metadata=payload.metadata,
        )
    )
    return plan.dict


# ==========================================================================
# Wave-2: Conversation Summarizer — /api/v1/product/conversation/summarize
# ==========================================================================


class ConvMessageRequest(BaseModel):
    role: str = MessageRole.USER.value
    content: str
    turn: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


class ConvSummarizeRequest(BaseModel):
    messages: list[ConvMessageRequest]
    max_summary_length: int = 500
    extract_tasks: bool = True
    extract_decisions: bool = True
    extract_open_items: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


@conv_summarizer_router.post("/conversation/summarize", response_model=dict)
def summarize_conversation(payload: ConvSummarizeRequest) -> dict:
    """Summarize conversation history into structured state."""
    messages = []
    for m in payload.messages:
        try:
            role = MessageRole(m.role)
        except ValueError:
            role = MessageRole.USER
        messages.append(_ConvMessage(role=role, content=m.content, turn=m.turn, metadata=m.metadata))
    result = get_conversation_summarizer().summarize(
        _SummarizeRequest(
            messages=messages,
            max_summary_length=payload.max_summary_length,
            extract_tasks=payload.extract_tasks,
            extract_decisions=payload.extract_decisions,
            extract_open_items=payload.extract_open_items,
            metadata=payload.metadata,
        )
    )
    return result.dict


# ==========================================================================
# Wave-2: Long-Term Memory Store — /api/v1/product/memory/long-term/*
# ==========================================================================


class LTMemoryStoreRequest(BaseModel):
    content: str
    tenant_id: str
    session_id: str = ""
    key: str = ""
    content_type: str = "fact"
    importance: float = Field(0.5, ge=0.0, le=1.0)
    confidence: float = Field(1.0, ge=0.0, le=1.0)
    tags: list[str] = Field(default_factory=list)
    source: str = ""
    ttl_seconds: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class LTMemoryRetrieveRequest(BaseModel):
    query: str
    tenant_id: str
    top_k: int = Field(5, ge=1, le=50)
    content_type: str | None = None
    tags: list[str] | None = None


@lt_memory_router.post("/memory/long-term", response_model=dict)
def store_lt_memory(payload: LTMemoryStoreRequest) -> dict:
    """Store a long-term memory entry."""
    store = get_long_term_memory_store()
    rec = store.store(
        _LTMemoryEntry(
            content=payload.content,
            tenant_id=payload.tenant_id,
            session_id=payload.session_id,
            key=payload.key,
            content_type=payload.content_type,
            importance=payload.importance,
            confidence=payload.confidence,
            tags=payload.tags,
            source=payload.source,
            ttl_seconds=payload.ttl_seconds,
            metadata=payload.metadata,
        )
    )
    return rec.dict


@lt_memory_router.get("/memory/long-term/{memory_id}", response_model=dict)
def get_lt_memory(memory_id: str) -> dict:
    rec = get_long_term_memory_store().get(memory_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Memory not found or expired")
    return rec.dict


@lt_memory_router.get("/memory/long-term", response_model=list)
def list_lt_memories(
    tenant_id: str = Query(...),
    session_id: str | None = None,
    content_type: str | None = None,
    include_expired: bool = False,
    limit: int = Query(50, ge=1, le=500),
    min_importance: float = Query(0.0, ge=0.0, le=1.0),
) -> list:
    return [r.dict for r in get_long_term_memory_store().list(
        tenant_id=tenant_id,
        session_id=session_id,
        content_type=content_type,
        include_expired=include_expired,
        limit=limit,
        min_importance=min_importance,
    )]


@lt_memory_router.post("/memory/long-term/retrieve", response_model=dict)
def retrieve_lt_memories(payload: LTMemoryRetrieveRequest) -> dict:
    """Keyword-ranked retrieval from long-term memory."""
    result = get_long_term_memory_store().retrieve(
        query=payload.query,
        tenant_id=payload.tenant_id,
        top_k=payload.top_k,
        content_type=payload.content_type,
        tags=payload.tags,
    )
    return result.dict


@lt_memory_router.delete("/memory/long-term/{memory_id}", response_model=dict)
def delete_lt_memory(memory_id: str) -> dict:
    ok = get_long_term_memory_store().delete(memory_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"memory_id": memory_id, "deleted": True}


@lt_memory_router.post("/memory/long-term/purge-expired", response_model=dict)
def purge_expired_lt_memories() -> dict:
    count = get_long_term_memory_store().purge_expired()
    return {"purged": count}


@lt_memory_router.get("/memory/long-term/stats/{tenant_id}", response_model=dict)
def lt_memory_stats(tenant_id: str) -> dict:
    return get_long_term_memory_store().stats(tenant_id)


# ==========================================================================
# Wave-2: Context Window Optimizer — /api/v1/product/context/optimize
# ==========================================================================


class ContextItemRequest(BaseModel):
    item_id: str
    source_type: str = "document"
    title: str = ""
    content: str
    token_count: int = 0
    relevance_score: float = Field(1.0, ge=0.0, le=1.0)
    recency_score: float = Field(1.0, ge=0.0, le=1.0)
    importance: float = Field(0.5, ge=0.0, le=1.0)
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ContextOptimizeRequest(BaseModel):
    query: str
    items: list[ContextItemRequest]
    token_budget: int = Field(4000, ge=100)
    strategy: str = SelectionStrategy.BALANCED.value
    token_estimate_mode: str = TokenEstimateMode.CHAR.value
    weight_relevance: float = Field(0.50, ge=0.0, le=1.0)
    weight_recency: float = Field(0.25, ge=0.0, le=1.0)
    weight_importance: float = Field(0.25, ge=0.0, le=1.0)
    max_items: int = Field(20, ge=1, le=200)
    max_per_source_type: int = Field(5, ge=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


@ctx_optimizer_router.post("/context/optimize", response_model=dict)
def optimize_context(payload: ContextOptimizeRequest) -> dict:
    """Select and rank context items within a token budget."""
    try:
        strategy = SelectionStrategy(payload.strategy)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid strategy: {payload.strategy}")
    try:
        mode = TokenEstimateMode(payload.token_estimate_mode)
    except ValueError:
        mode = TokenEstimateMode.CHAR
    items = [
        _ContextItem(
            item_id=i.item_id,
            source_type=i.source_type,
            title=i.title,
            content=i.content,
            token_count=i.token_count,
            relevance_score=i.relevance_score,
            recency_score=i.recency_score,
            importance=i.importance,
            tags=i.tags,
            metadata=i.metadata,
        )
        for i in payload.items
    ]
    result = get_context_optimizer().optimize(
        _OptimizeRequest(
            query=payload.query,
            items=items,
            token_budget=payload.token_budget,
            strategy=strategy,
            token_estimate_mode=mode,
            weight_relevance=payload.weight_relevance,
            weight_recency=payload.weight_recency,
            weight_importance=payload.weight_importance,
            max_items=payload.max_items,
            max_per_source_type=payload.max_per_source_type,
            metadata=payload.metadata,
        )
    )
    return result.dict


# ==========================================================================
# Wave-2: Chunking Pipeline — /api/v1/product/docs/chunk
# ==========================================================================


class DocChunkRequest(BaseModel):
    doc_id: str
    content: str
    strategy: str = ChunkStrategy.HYBRID.value
    max_chunk_tokens: int = Field(512, ge=10)
    overlap_tokens: int = Field(64, ge=0)
    min_chunk_tokens: int = Field(20, ge=1)
    generate_summaries: bool = True
    max_summary_length: int = Field(150, ge=20)
    metadata: dict[str, Any] = Field(default_factory=dict)


@chunking_router.post("/docs/chunk", response_model=dict)
def chunk_document(payload: DocChunkRequest) -> dict:
    """Split a document into chunks with optional per-chunk summaries."""
    try:
        strategy = ChunkStrategy(payload.strategy)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid strategy: {payload.strategy}")
    manifest = get_chunking_pipeline().chunk(
        _ChunkRequest(
            doc_id=payload.doc_id,
            content=payload.content,
            strategy=strategy,
            max_chunk_tokens=payload.max_chunk_tokens,
            overlap_tokens=payload.overlap_tokens,
            min_chunk_tokens=payload.min_chunk_tokens,
            generate_summaries=payload.generate_summaries,
            max_summary_length=payload.max_summary_length,
            metadata=payload.metadata,
        )
    )
    return manifest.dict


@chunking_router.get("/docs/chunk/strategies", response_model=list)
def list_chunk_strategies() -> list:
    """List available chunking strategies."""
    return [s.value for s in ChunkStrategy]


# ==========================================================================
# Wave-2: Reasoning Coach — /api/v1/product/reasoning/coach
# ==========================================================================


class ReasoningCoachRequest(BaseModel):
    output_text: str
    available_tools: list[str] = Field(default_factory=list)
    min_severity: str = CoachSeverity.MEDIUM.value
    grounding_window: int = Field(150, ge=50, le=500)
    metadata: dict[str, Any] = Field(default_factory=dict)


@reasoning_coach_router.post("/reasoning/coach", response_model=dict)
def coach_reasoning(payload: ReasoningCoachRequest) -> dict:
    """Detect unsupported claims and suggest tool calls to ground them."""
    try:
        severity = CoachSeverity(payload.min_severity)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid severity: {payload.min_severity}")
    report = get_reasoning_coach().coach(
        _CoachRequest(
            output_text=payload.output_text,
            available_tools=payload.available_tools,
            min_severity=severity,
            grounding_window=payload.grounding_window,
            metadata=payload.metadata,
        )
    )
    return report.dict


# =============================================================================
# Wave-Final: Product/UX/Channel API Routes
# =============================================================================

# ---------------------------------------------------------------------------
# Onboarding Wizard — /api/v1/product/onboarding/*
# ---------------------------------------------------------------------------

@onboarding_router.post("/onboarding/sessions", response_model=dict)
def start_onboarding_session(payload: OnboardStartInput) -> dict:
    """Start a new agent onboarding session."""
    sess = get_onboarding_wizard().start_session(payload)
    return sess.model_dump()


@onboarding_router.get("/onboarding/sessions/{session_id}", response_model=dict)
def get_onboarding_session(session_id: str) -> dict:
    sess = get_onboarding_wizard().get_session(session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id!r} not found")
    return sess.model_dump()


@onboarding_router.post("/onboarding/sessions/{session_id}/advance", response_model=dict)
def advance_onboarding_step(session_id: str, payload: StepAdvanceInput) -> dict:
    """Advance the onboarding session to the next step."""
    payload.session_id = session_id
    try:
        sess = get_onboarding_wizard().advance_step(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return sess.model_dump()


@onboarding_router.post("/onboarding/sessions/{session_id}/abandon", response_model=dict)
def abandon_onboarding_session(session_id: str) -> dict:
    sess = get_onboarding_wizard().abandon_session(session_id)
    return sess.model_dump()


@onboarding_router.get("/onboarding/sessions", response_model=list)
def list_onboarding_sessions(
    tenant_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list:
    return [s.model_dump() for s in get_onboarding_wizard().list_sessions(
        tenant_id=tenant_id, status=status, limit=limit
    )]


@onboarding_router.post("/onboarding/sessions/{session_id}/oauth", response_model=dict)
def add_oauth_connection(session_id: str, payload: OAuthConnectionInput) -> dict:
    payload.session_id = session_id
    conn = get_onboarding_wizard().add_oauth_connection(payload)
    return conn.model_dump()


@onboarding_router.get("/onboarding/sessions/{session_id}/oauth", response_model=list)
def list_oauth_connections(session_id: str) -> list:
    return [c.model_dump() for c in get_onboarding_wizard().list_oauth_connections(session_id)]


@onboarding_router.post("/onboarding/sessions/{session_id}/workflows", response_model=dict)
def select_workflow(session_id: str, payload: WorkflowSelectionInput) -> dict:
    payload.session_id = session_id
    sel = get_onboarding_wizard().select_workflow(payload)
    return sel.model_dump()


@onboarding_router.get("/onboarding/sessions/{session_id}/workflows", response_model=list)
def list_workflow_selections(session_id: str) -> list:
    return [s.model_dump() for s in get_onboarding_wizard().list_workflow_selections(session_id)]


@onboarding_router.post("/onboarding/sessions/{session_id}/first-run", response_model=dict)
def record_first_run(session_id: str, payload: FirstRunInput) -> dict:
    payload.session_id = session_id
    result = get_onboarding_wizard().record_first_run(payload)
    return result.model_dump()


@onboarding_router.get("/onboarding/sessions/{session_id}/first-run", response_model=dict)
def get_first_run_result(session_id: str) -> dict:
    result = get_onboarding_wizard().get_first_run_result(session_id)
    if result is None:
        raise HTTPException(status_code=404, detail="No first-run result found")
    return result.model_dump()


# ---------------------------------------------------------------------------
# Self-Serve Portal — /api/v1/product/portal/*
# ---------------------------------------------------------------------------

@portal_router.post("/portal/jobs", response_model=dict)
def submit_portal_job(payload: JobSubmitInput) -> dict:
    """Submit a new job via the self-serve portal."""
    job = get_portal_manager().submit_job(payload)
    return job.model_dump()


@portal_router.get("/portal/jobs/{job_id}", response_model=dict)
def get_portal_job(job_id: str) -> dict:
    job = get_portal_manager().get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")
    return job.model_dump()


@portal_router.get("/portal/jobs", response_model=list)
def list_portal_jobs(
    tenant_id: str | None = None,
    submitter_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list:
    return [j.model_dump() for j in get_portal_manager().list_jobs(
        tenant_id=tenant_id, submitter_id=submitter_id,
        status=status, limit=limit,
    )]


@portal_router.patch("/portal/jobs/{job_id}/status", response_model=dict)
def update_portal_job_status(job_id: str, payload: JobStatusUpdateInput) -> dict:
    payload.job_id = job_id
    try:
        job = get_portal_manager().update_status(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return job.model_dump()


@portal_router.post("/portal/jobs/{job_id}/cancel", response_model=dict)
def cancel_portal_job(job_id: str, reason: str = "") -> dict:
    try:
        job = get_portal_manager().cancel_job(job_id, reason=reason)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return job.model_dump()


@portal_router.post("/portal/jobs/{job_id}/progress", response_model=dict)
def record_job_progress(job_id: str, payload: ProgressEventInput) -> dict:
    payload.job_id = job_id
    ev = get_portal_manager().record_progress(payload)
    return ev.model_dump()


@portal_router.get("/portal/jobs/{job_id}/progress", response_model=list)
def get_job_progress(job_id: str, limit: int = 100) -> list:
    return [e.model_dump() for e in get_portal_manager().get_progress_events(job_id, limit=limit)]


@portal_router.post("/portal/jobs/{job_id}/files", response_model=dict)
def attach_result_file(job_id: str, payload: ResultFileInput) -> dict:
    payload.job_id = job_id
    f = get_portal_manager().attach_result_file(payload)
    return f.model_dump()


@portal_router.get("/portal/jobs/{job_id}/files", response_model=list)
def list_result_files(job_id: str) -> list:
    return [f.model_dump() for f in get_portal_manager().list_result_files(job_id)]


# ---------------------------------------------------------------------------
# Approval Workflow — /api/v1/product/approvals/*
# ---------------------------------------------------------------------------

@approvals_router.post("/approvals/drafts", response_model=dict)
def create_draft(payload: DraftCreateInput) -> dict:
    """Create a new draft for approval."""
    draft = get_approval_manager().create_draft(payload)
    return draft.model_dump()


@approvals_router.get("/approvals/drafts/{draft_id}", response_model=dict)
def get_draft(draft_id: str) -> dict:
    draft = get_approval_manager().get_draft(draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail=f"Draft {draft_id!r} not found")
    return draft.model_dump()


@approvals_router.patch("/approvals/drafts/{draft_id}", response_model=dict)
def update_draft(draft_id: str, payload: DraftUpdateInput) -> dict:
    payload.draft_id = draft_id
    try:
        draft = get_approval_manager().update_draft(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return draft.model_dump()


@approvals_router.get("/approvals/drafts", response_model=list)
def list_drafts(
    tenant_id: str | None = None,
    author_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list:
    return [d.model_dump() for d in get_approval_manager().list_drafts(
        tenant_id=tenant_id, author_id=author_id, status=status, limit=limit
    )]


@approvals_router.post("/approvals/drafts/{draft_id}/submit", response_model=list)
def submit_for_approval(draft_id: str, payload: SubmitForApprovalInput) -> list:
    payload.draft_id = draft_id
    try:
        reqs = get_approval_manager().submit_for_approval(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return [r.model_dump() for r in reqs]


@approvals_router.post("/approvals/requests/{request_id}/decide", response_model=dict)
def decide_approval(request_id: str, payload: ApprovalDecisionInput) -> dict:
    payload.request_id = request_id
    try:
        req = get_approval_manager().decide(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return req.model_dump()


@approvals_router.get("/approvals/requests", response_model=list)
def list_approval_requests(
    draft_id: str | None = None,
    approver_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list:
    return [r.model_dump() for r in get_approval_manager().list_requests(
        draft_id=draft_id, approver_id=approver_id, status=status, limit=limit
    )]


@approvals_router.post("/approvals/drafts/{draft_id}/revise", response_model=dict)
def submit_revision(draft_id: str, payload: RevisionInput) -> dict:
    payload.draft_id = draft_id
    try:
        rev = get_approval_manager().submit_revision(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return rev.model_dump()


@approvals_router.post("/approvals/drafts/{draft_id}/send", response_model=dict)
def send_draft(draft_id: str, payload: SendInput) -> dict:
    payload.draft_id = draft_id
    try:
        send_ev = get_approval_manager().send_draft(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return send_ev.model_dump()


@approvals_router.get("/approvals/drafts/{draft_id}/send-events", response_model=list)
def get_send_events(draft_id: str) -> list:
    return [e.model_dump() for e in get_approval_manager().get_send_events(draft_id)]


# ---------------------------------------------------------------------------
# Collaboration — /api/v1/product/collab/*
# ---------------------------------------------------------------------------

@collab_router.post("/collab/tasks", response_model=dict)
def create_collab_task(payload: TaskCreateInput) -> dict:
    task = get_collaboration_manager().create_task(payload)
    return task.model_dump()


@collab_router.get("/collab/tasks/{task_id}", response_model=dict)
def get_collab_task(task_id: str) -> dict:
    task = get_collaboration_manager().get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task {task_id!r} not found")
    return task.model_dump()


@collab_router.patch("/collab/tasks/{task_id}", response_model=dict)
def update_collab_task(task_id: str, payload: TaskUpdateInput) -> dict:
    payload.task_id = task_id
    task = get_collaboration_manager().update_task(payload)
    return task.model_dump()


@collab_router.post("/collab/tasks/{task_id}/assign", response_model=dict)
def assign_collab_task(task_id: str, payload: AssignInput) -> dict:
    payload.task_id = task_id
    task = get_collaboration_manager().assign_task(payload)
    return task.model_dump()


@collab_router.get("/collab/tasks", response_model=list)
def list_collab_tasks(
    tenant_id: str | None = None,
    owner_id: str | None = None,
    assignee_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list:
    return [t.model_dump() for t in get_collaboration_manager().list_tasks(
        tenant_id=tenant_id, owner_id=owner_id,
        assignee_id=assignee_id, status=status, limit=limit,
    )]


@collab_router.post("/collab/tasks/{task_id}/handoffs", response_model=dict)
def create_handoff(task_id: str, payload: HandoffInput) -> dict:
    payload.task_id = task_id
    handoff = get_collaboration_manager().create_handoff(payload)
    return handoff.model_dump()


@collab_router.post("/collab/handoffs/{handoff_id}/acknowledge", response_model=dict)
def acknowledge_handoff(handoff_id: str, payload: HandoffAckInput) -> dict:
    payload.handoff_id = handoff_id
    handoff = get_collaboration_manager().acknowledge_handoff(payload)
    return handoff.model_dump()


@collab_router.get("/collab/tasks/{task_id}/handoffs", response_model=list)
def list_handoffs(task_id: str) -> list:
    return [h.model_dump() for h in get_collaboration_manager().list_handoffs(task_id)]


@collab_router.post("/collab/tasks/{task_id}/comments", response_model=dict)
def add_comment(task_id: str, payload: CommentInput) -> dict:
    payload.task_id = task_id
    comment = get_collaboration_manager().add_comment(payload)
    return comment.model_dump()


@collab_router.get("/collab/tasks/{task_id}/comments", response_model=list)
def list_comments(task_id: str) -> list:
    return [c.model_dump() for c in get_collaboration_manager().list_comments(task_id)]


@collab_router.get("/collab/notifications", response_model=list)
def get_collab_notifications(
    recipient_id: str, unread_only: bool = False, limit: int = 50
) -> list:
    return [n.model_dump() for n in get_collaboration_manager().get_notifications(
        recipient_id=recipient_id, unread_only=unread_only, limit=limit
    )]


@collab_router.post("/collab/notifications/{notif_id}/delivered", response_model=dict)
def mark_notif_delivered(notif_id: str) -> dict:
    get_collaboration_manager().mark_notification_delivered(notif_id)
    return {"notif_id": notif_id, "delivered": True}


# ---------------------------------------------------------------------------
# Retention Autopilot — /api/v1/product/retention/*
# ---------------------------------------------------------------------------

@retention_router.post("/retention/signals", response_model=dict)
def record_usage_signal(payload: UsageSignalInput) -> dict:
    sig = get_retention_autopilot().record_signal(payload)
    return sig.model_dump()


@retention_router.get("/retention/signals", response_model=list)
def list_usage_signals(
    tenant_id: str, signal_type: str | None = None, limit: int = 100
) -> list:
    return [s.model_dump() for s in get_retention_autopilot().get_signals(
        tenant_id, signal_type=signal_type, limit=limit
    )]


@retention_router.post("/retention/scores", response_model=dict)
def compute_churn_score(payload: ChurnScoreInput) -> dict:
    score = get_retention_autopilot().compute_churn_score(payload)
    return score.model_dump()


@retention_router.get("/retention/scores/latest", response_model=dict)
def get_latest_churn_score(tenant_id: str) -> dict:
    score = get_retention_autopilot().get_latest_score(tenant_id)
    if score is None:
        raise HTTPException(status_code=404, detail="No score found for tenant")
    return score.model_dump()


@retention_router.get("/retention/scores", response_model=list)
def list_churn_scores(tenant_id: str, limit: int = 10) -> list:
    return [s.model_dump() for s in get_retention_autopilot().list_scores(tenant_id, limit=limit)]


@retention_router.post("/retention/winback", response_model=dict)
def trigger_winback_flow(payload: WinbackTriggerInput) -> dict:
    flow = get_retention_autopilot().trigger_winback(payload)
    return flow.model_dump()


@retention_router.get("/retention/winback", response_model=list)
def list_winback_flows(tenant_id: str, status: str | None = None, limit: int = 50) -> list:
    return [f.model_dump() for f in get_retention_autopilot().list_flows(
        tenant_id, status=status, limit=limit
    )]


@retention_router.post("/retention/winback/{flow_id}/events", response_model=dict)
def record_winback_event(flow_id: str, payload: FlowEventInput) -> dict:
    payload.flow_id = flow_id
    ev = get_retention_autopilot().record_flow_event(payload)
    return ev.model_dump()


@retention_router.post("/retention/winback/{flow_id}/complete", response_model=dict)
def complete_winback_flow(flow_id: str, outcome: str = "retained") -> dict:
    flow = get_retention_autopilot().complete_flow(flow_id, outcome=outcome)
    return flow.model_dump()


# ---------------------------------------------------------------------------
# Personalized Output Styles — /api/v1/product/output/style/*
# ---------------------------------------------------------------------------

@output_style_router.post("/output/style/profiles", response_model=dict)
def create_style_profile(payload: StyleProfileInput) -> dict:
    try:
        profile = get_output_manager().create_profile(payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return profile.model_dump()


@output_style_router.get("/output/style/profiles/{profile_id}", response_model=dict)
def get_style_profile(profile_id: str) -> dict:
    p = get_output_manager().get_profile(profile_id)
    if p is None:
        raise HTTPException(status_code=404, detail=f"Profile {profile_id!r} not found")
    return p.model_dump()


@output_style_router.patch("/output/style/profiles/{profile_id}", response_model=dict)
def update_style_profile(profile_id: str, payload: StyleProfileUpdateInput) -> dict:
    payload.profile_id = profile_id
    try:
        p = get_output_manager().update_profile(payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return p.model_dump()


@output_style_router.get("/output/style/profiles", response_model=list)
def list_style_profiles(
    tenant_id: str, active_only: bool = True, limit: int = 100
) -> list:
    return [p.model_dump() for p in get_output_manager().list_profiles(
        tenant_id, active_only=active_only, limit=limit
    )]


@output_style_router.delete("/output/style/profiles/{profile_id}", response_model=dict)
def delete_style_profile(profile_id: str) -> dict:
    ok = get_output_manager().delete_profile(profile_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Profile {profile_id!r} not found")
    return {"profile_id": profile_id, "deleted": True}


@output_style_router.post("/output/style/apply", response_model=dict)
def apply_style(payload: ApplyStyleInput) -> dict:
    try:
        result = get_output_manager().apply_style(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return result.model_dump()


@output_style_router.get("/output/style/profiles/{profile_id}/history", response_model=list)
def get_style_history(profile_id: str, limit: int = 50) -> list:
    return [a.model_dump() for a in get_output_manager().get_application_history(
        profile_id, limit=limit
    )]


# ---------------------------------------------------------------------------
# Proactive Reminders — /api/v1/product/reminders/*
# ---------------------------------------------------------------------------

@reminders_router.post("/reminders/subscriptions", response_model=dict)
def subscribe_reminders(payload: SubscriptionInput) -> dict:
    sub = get_reminder_manager().subscribe(payload)
    return sub.model_dump()


@reminders_router.post("/reminders/subscriptions/unsubscribe", response_model=dict)
def unsubscribe_reminders(
    tenant_id: str, owner_id: str, reminder_type: str
) -> dict:
    ok = get_reminder_manager().unsubscribe(tenant_id, owner_id, reminder_type)
    return {"unsubscribed": ok}


@reminders_router.get("/reminders/subscriptions", response_model=list)
def list_reminder_subscriptions(
    tenant_id: str, owner_id: str | None = None, opt_in_only: bool = True
) -> list:
    return [s.model_dump() for s in get_reminder_manager().list_subscriptions(
        tenant_id, owner_id=owner_id, opt_in_only=opt_in_only
    )]


@reminders_router.post("/reminders", response_model=dict)
def create_reminder(payload: ReminderCreateInput) -> dict:
    rem = get_reminder_manager().create_reminder(payload)
    return rem.model_dump()


@reminders_router.get("/reminders/due", response_model=list)
def get_due_reminders(as_of: str | None = None) -> list:
    return [r.model_dump() for r in get_reminder_manager().get_due_reminders(as_of=as_of)]


@reminders_router.post("/reminders/{reminder_id}/sent", response_model=dict)
def mark_reminder_sent(reminder_id: str) -> dict:
    rem = get_reminder_manager().mark_sent(reminder_id)
    return rem.model_dump()


@reminders_router.post("/reminders/{reminder_id}/cancel", response_model=dict)
def cancel_reminder(reminder_id: str) -> dict:
    rem = get_reminder_manager().cancel_reminder(reminder_id)
    return rem.model_dump()


@reminders_router.post("/reminders/{reminder_id}/snooze", response_model=dict)
def snooze_reminder(reminder_id: str, payload: SnoozeInput) -> dict:
    payload.reminder_id = reminder_id
    rem = get_reminder_manager().snooze_reminder(payload)
    return rem.model_dump()


@reminders_router.get("/reminders", response_model=list)
def list_reminders(
    tenant_id: str,
    owner_id: str | None = None,
    status: str | None = None,
    reminder_type: str | None = None,
    limit: int = 100,
) -> list:
    return [r.model_dump() for r in get_reminder_manager().list_reminders(
        tenant_id, owner_id=owner_id, status=status,
        reminder_type=reminder_type, limit=limit,
    )]


# ---------------------------------------------------------------------------
# Outcome-Based Pricing — /api/v1/product/outcome-pricing/*
# ---------------------------------------------------------------------------

@outcome_pricing_router.post("/outcome-pricing/contracts", response_model=dict)
def create_outcome_contract(payload: ContractCreateInput) -> dict:
    contract = get_outcome_manager().create_contract(payload)
    return contract.model_dump()


@outcome_pricing_router.get("/outcome-pricing/contracts/{contract_id}", response_model=dict)
def get_outcome_contract(contract_id: str) -> dict:
    c = get_outcome_manager().get_contract(contract_id)
    if c is None:
        raise HTTPException(status_code=404, detail=f"Contract {contract_id!r} not found")
    return c.model_dump()


@outcome_pricing_router.patch("/outcome-pricing/contracts/{contract_id}", response_model=dict)
def update_outcome_contract(contract_id: str, payload: ContractUpdateInput) -> dict:
    payload.contract_id = contract_id
    c = get_outcome_manager().update_contract(payload)
    return c.model_dump()


@outcome_pricing_router.get("/outcome-pricing/contracts", response_model=list)
def list_outcome_contracts(tenant_id: str, active_only: bool = True) -> list:
    return [c.model_dump() for c in get_outcome_manager().list_contracts(
        tenant_id, active_only=active_only
    )]


@outcome_pricing_router.post("/outcome-pricing/outcomes", response_model=dict)
def record_outcome(payload: OutcomeRecordInput) -> dict:
    try:
        outcome = get_outcome_manager().record_outcome(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return outcome.model_dump()


@outcome_pricing_router.get("/outcome-pricing/outcomes/{outcome_id}", response_model=dict)
def get_outcome(outcome_id: str) -> dict:
    o = get_outcome_manager().get_outcome(outcome_id)
    if o is None:
        raise HTTPException(status_code=404, detail=f"Outcome {outcome_id!r} not found")
    return o.model_dump()


@outcome_pricing_router.post("/outcome-pricing/outcomes/{outcome_id}/verify", response_model=dict)
def verify_outcome(outcome_id: str, payload: OutcomeVerifyInput) -> dict:
    payload.outcome_id = outcome_id
    outcome = get_outcome_manager().verify_outcome(payload)
    return outcome.model_dump()


@outcome_pricing_router.get("/outcome-pricing/outcomes", response_model=list)
def list_outcomes(
    tenant_id: str, contract_id: str | None = None,
    status: str | None = None, limit: int = 100
) -> list:
    return [o.model_dump() for o in get_outcome_manager().list_outcomes(
        tenant_id, contract_id=contract_id, status=status, limit=limit
    )]


@outcome_pricing_router.post("/outcome-pricing/billing/events", response_model=dict)
def emit_billing_event(payload: BillingEventInput) -> dict:
    try:
        event = get_outcome_manager().emit_billing_event(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return event.model_dump()


@outcome_pricing_router.patch("/outcome-pricing/billing/events/{event_id}", response_model=dict)
def update_billing_status(event_id: str, payload: BillingStatusUpdateInput) -> dict:
    payload.event_id = event_id
    event = get_outcome_manager().update_billing_status(payload)
    return event.model_dump()


@outcome_pricing_router.get("/outcome-pricing/billing/events", response_model=list)
def list_billing_events(
    tenant_id: str, billing_status: str | None = None, limit: int = 100
) -> list:
    return [e.model_dump() for e in get_outcome_manager().list_billing_events(
        tenant_id, billing_status=billing_status, limit=limit
    )]


@outcome_pricing_router.get("/outcome-pricing/billing/summary", response_model=dict)
def billing_summary(tenant_id: str) -> dict:
    return get_outcome_manager().billing_summary(tenant_id)


# ---------------------------------------------------------------------------
# White-Label Agency Launcher — /api/v1/product/white-label/*
# ---------------------------------------------------------------------------

@white_label_router.post("/white-label/templates", response_model=dict)
def create_wl_template(payload: WLTemplateCreateInput) -> dict:
    try:
        tmpl = get_white_label_manager().create_template(payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return tmpl.model_dump()


@white_label_router.get("/white-label/templates/{template_id}", response_model=dict)
def get_wl_template(template_id: str) -> dict:
    t = get_white_label_manager().get_template(template_id)
    if t is None:
        raise HTTPException(status_code=404, detail=f"Template {template_id!r} not found")
    return t.model_dump()


@white_label_router.patch("/white-label/templates/{template_id}", response_model=dict)
def update_wl_template(template_id: str, payload: WLTemplateUpdateInput) -> dict:
    payload.template_id = template_id
    tmpl = get_white_label_manager().update_template(payload)
    return tmpl.model_dump()


@white_label_router.get("/white-label/templates", response_model=list)
def list_wl_templates(agency_id: str, active_only: bool = True) -> list:
    return [t.model_dump() for t in get_white_label_manager().list_templates(
        agency_id, active_only=active_only
    )]


@white_label_router.post("/white-label/environments", response_model=dict)
def provision_wl_environment(payload: EnvironmentProvisionInput) -> dict:
    try:
        env = get_white_label_manager().provision_environment(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return env.model_dump()


@white_label_router.get("/white-label/environments/{env_id}", response_model=dict)
def get_wl_environment(env_id: str) -> dict:
    env = get_white_label_manager().get_environment(env_id)
    if env is None:
        raise HTTPException(status_code=404, detail=f"Environment {env_id!r} not found")
    return env.model_dump()


@white_label_router.post("/white-label/environments/{env_id}/activate", response_model=dict)
def activate_wl_environment(env_id: str, actor_id: str = "system") -> dict:
    env = get_white_label_manager().activate_environment(env_id, actor_id=actor_id)
    return env.model_dump()


@white_label_router.post("/white-label/environments/{env_id}/suspend", response_model=dict)
def suspend_wl_environment(env_id: str, actor_id: str = "system", reason: str = "") -> dict:
    env = get_white_label_manager().suspend_environment(env_id, actor_id=actor_id, reason=reason)
    return env.model_dump()


@white_label_router.post("/white-label/environments/{env_id}/terminate", response_model=dict)
def terminate_wl_environment(env_id: str, actor_id: str = "system") -> dict:
    env = get_white_label_manager().terminate_environment(env_id, actor_id=actor_id)
    return env.model_dump()


@white_label_router.get("/white-label/environments", response_model=list)
def list_wl_environments(
    agency_id: str, status: str | None = None, limit: int = 100
) -> list:
    return [e.model_dump() for e in get_white_label_manager().list_environments(
        agency_id, status=status, limit=limit
    )]


@white_label_router.post("/white-label/environments/{env_id}/branding", response_model=dict)
def upsert_branding_asset(env_id: str, payload: BrandingAssetInput) -> dict:
    payload.env_id = env_id
    asset = get_white_label_manager().upsert_branding_asset(payload)
    return asset.model_dump()


@white_label_router.get("/white-label/environments/{env_id}/branding", response_model=list)
def list_branding_assets(env_id: str, asset_type: str | None = None) -> list:
    return [a.model_dump() for a in get_white_label_manager().list_branding_assets(
        env_id, asset_type=asset_type
    )]


@white_label_router.get("/white-label/environments/{env_id}/log", response_model=list)
def get_provision_log(env_id: str, limit: int = 50) -> list:
    return [e.model_dump() for e in get_white_label_manager().get_provision_log(env_id, limit=limit)]


@white_label_router.get("/white-label/environments/by-tenant/{tenant_id}", response_model=dict)
def get_wl_env_by_tenant(tenant_id: str) -> dict:
    env = get_white_label_manager().get_environment_by_tenant(tenant_id)
    if env is None:
        raise HTTPException(status_code=404, detail=f"No environment for tenant {tenant_id!r}")
    return env.model_dump()
