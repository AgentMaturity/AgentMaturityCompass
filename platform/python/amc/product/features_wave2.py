"""AMC product feature catalog — Wave 2 (50 features, agent-cognition focus).

This module records the second 50-feature batch focused on agent reasoning,
autonomy control, tool intelligence, and memory management.  Each entry
is pre-scored for relevance and AMC fit to guide execution planning.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable


class Relevance(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Domain(str, Enum):
    PRODUCTIZATION = "productization"
    DEVX = "developer_experience"
    ORCHESTRATION = "orchestration"
    KNOWLEDGE = "knowledge_data"
    UX = "interaction_ux"
    OBSERVABILITY = "observability"


@dataclass(frozen=True)
class FeatureProposal:
    feature_id: int
    title: str
    lane: Domain
    summary: str
    relevance: Relevance
    amc_fit: bool
    rationale: str
    owner_hint: str
    effort: str
    wave: int = 2
    blockers: tuple[str, ...] = ()


def _features() -> list[FeatureProposal]:  # noqa: PLR0915
    return [
        # ── HIGH band (implement as real modules) ──────────────────────────
        FeatureProposal(
            1,
            "Autonomy Dial — Ask vs Act Controller",
            Domain.ORCHESTRATION,
            "Per-task-type policy that decides whether the agent should ask the "
            "operator before acting or proceed autonomously. SQLite-backed with "
            "per-tenant overrides and a default policy ladder.",
            Relevance.HIGH,
            True,
            "Foundation of safe agentic behaviour; unlocks trust for high-stakes tasks.",
            "Platform + Product",
            "2–3 weeks",
            2,
            ("Policy conflict resolution with existing exec-guard",),
        ),
        FeatureProposal(
            2,
            "Task Spec + Acceptance Criteria Compiler",
            Domain.ORCHESTRATION,
            "Compiles a natural-language task description into a structured spec: "
            "goal, constraints, acceptance criteria, and done-condition checklist.",
            Relevance.HIGH,
            True,
            "Reduces ambiguity at task ingestion; measurably reduces re-work loops.",
            "Product + AI Ops",
            "2–3 weeks",
            2,
            ("LLM quality for spec extraction",),
        ),
        FeatureProposal(
            3,
            "Goal Decomposer with Milestones",
            Domain.ORCHESTRATION,
            "Breaks a high-level goal into ordered milestones with success checks, "
            "estimated effort, and dependency links.  Feeds the drift detector.",
            Relevance.HIGH,
            True,
            "Enables long-horizon task execution with observable progress.",
            "Platform",
            "3–4 weeks",
            2,
            ("Milestone taxonomy", "goal-to-tool mapping quality"),
        ),
        FeatureProposal(
            4,
            "Goal Drift Detector",
            Domain.ORCHESTRATION,
            "Monitors whether ongoing actions remain aligned with the original goal "
            "spec.  Raises alerts and suggests corrective steering.",
            Relevance.HIGH,
            True,
            "Prevents silent task deviations in long-running workflows.",
            "Watch + Platform",
            "2–3 weeks",
            2,
            ("Embedding similarity threshold tuning",),
        ),
        FeatureProposal(
            5,
            "Loop/Thrash Detector + Strategy Switcher",
            Domain.ORCHESTRATION,
            "Detects repeated identical or near-identical action patterns and "
            "automatically switches strategy (e.g., escalate, change tool, clarify).",
            Relevance.HIGH,
            True,
            "Prevents infinite-loop waste and improves agent self-recovery.",
            "Enforce + Platform",
            "2–3 weeks",
            2,
            ("Similarity threshold calibration",),
        ),
        FeatureProposal(
            6,
            "Uncertainty / Confidence Estimator",
            Domain.ORCHESTRATION,
            "Scores the confidence of each decision point based on evidence, "
            "ambiguity signals, and historical outcomes.  Drives ask-vs-act policy.",
            Relevance.HIGH,
            True,
            "Core signal for safe autonomy; composable with the Autonomy Dial.",
            "Platform + Score",
            "2–3 weeks",
            2,
            ("Ground-truth feedback loop",),
        ),
        FeatureProposal(
            10,
            "Clarification Question Minimizer",
            Domain.UX,
            "Before asking the user a question, checks whether the answer can be "
            "inferred from context, memory, or prior messages—cutting unnecessary "
            "interruptions.",
            Relevance.HIGH,
            True,
            "Directly improves UX and reduces operator fatigue.",
            "UX + AI Ops",
            "2 weeks",
            2,
            ("Context retrieval quality",),
        ),
        FeatureProposal(
            13,
            "Tool Semantic Doc Generator",
            Domain.DEVX,
            "Auto-generates semantic documentation for each tool: purpose, "
            "parameters, side effects, and usage examples—formatted for LLM "
            "system-prompt injection.",
            Relevance.HIGH,
            True,
            "Improves tool selection accuracy without manual doc maintenance.",
            "Platform + Docs",
            "2 weeks",
            2,
            ("Tool registry completeness",),
        ),
        FeatureProposal(
            14,
            "Natural Language Tool Discovery Engine",
            Domain.DEVX,
            "Let agents describe what they need in plain English and receive a "
            "ranked list of matching tools with confidence scores.",
            Relevance.HIGH,
            True,
            "Reduces hard-coded tool selection; enables dynamic agent composition.",
            "Platform",
            "3 weeks",
            2,
            ("Embedding index freshness", "tool registry coverage"),
        ),
        FeatureProposal(
            16,
            "Pre-Call Tool Reliability Predictor",
            Domain.OBSERVABILITY,
            "Before issuing a tool call, predicts the probability of success based "
            "on recent failure history, current load, and parameter profile.",
            Relevance.HIGH,
            True,
            "Reduces wasted calls and enables pre-emptive fallback routing.",
            "Watch + Platform",
            "2–3 weeks",
            2,
            ("Tool telemetry coverage",),
        ),
        FeatureProposal(
            17,
            "Error-to-Fix Translator for Tool Failures",
            Domain.ORCHESTRATION,
            "Converts raw tool error messages into structured, actionable fix "
            "suggestions with a confidence score and retry strategy.",
            Relevance.HIGH,
            True,
            "Cuts mean-time-to-recovery for agent tool failures significantly.",
            "Enforce + Platform",
            "2 weeks",
            2,
            ("Error taxonomy coverage",),
        ),
        FeatureProposal(
            22,
            "Tool Call Parallelizer",
            Domain.ORCHESTRATION,
            "Analyses a tool-call plan for independent branches and executes them "
            "concurrently while enforcing dependency ordering.",
            Relevance.HIGH,
            True,
            "Reduces wall-clock time for multi-tool workflows by 40–70%.",
            "Platform",
            "3 weeks",
            2,
            ("Dependency graph correctness", "rate-limit interaction"),
        ),
        FeatureProposal(
            27,
            "Conversation State Snapshotter",
            Domain.KNOWLEDGE,
            "Periodically snapshots the structured state of a conversation "
            "(intent, entities, decisions, pending actions) as versioned JSON "
            "blobs for durable resumability.",
            Relevance.HIGH,
            True,
            "Enables long-running conversations to survive restarts and context resets.",
            "Platform + UX",
            "2–3 weeks",
            2,
            ("Snapshot format governance",),
        ),
        FeatureProposal(
            29,
            "Working Memory Scratchpad Manager",
            Domain.KNOWLEDGE,
            "Provides agents with a structured, scoped working-memory scratchpad: "
            "read/write/clear with TTL and namespace isolation per session.",
            Relevance.HIGH,
            True,
            "Reduces context stuffing; improves coherence across multi-step tasks.",
            "Platform",
            "2 weeks",
            2,
            ("TTL eviction policy",),
        ),
        FeatureProposal(
            30,
            "Memory Consolidation Engine",
            Domain.KNOWLEDGE,
            "Periodically merges short-term scratchpad entries into long-term "
            "compressed memory records, removing redundancies and stale facts.",
            Relevance.HIGH,
            True,
            "Controls memory growth while preserving useful signal over time.",
            "Platform + Data",
            "3 weeks",
            2,
            ("Compression quality metrics",),
        ),
        FeatureProposal(
            31,
            "Memory Contradiction Resolver",
            Domain.KNOWLEDGE,
            "Detects conflicting facts across memory entries and resolves them "
            "using provenance scoring, recency, and source confidence.",
            Relevance.HIGH,
            True,
            "Prevents hallucinations caused by stale or conflicting beliefs.",
            "Platform + Score",
            "3 weeks",
            2,
            ("Source credibility signals",),
        ),
        FeatureProposal(
            42,
            "Determinism Kit for Stable Outputs",
            Domain.DEVX,
            "A suite of utilities (seed management, output canonicaliser, "
            "content-hash verifier) that make agent outputs reproducible across "
            "identical inputs.",
            Relevance.HIGH,
            True,
            "Required for testing, debugging, and enterprise compliance.",
            "Platform + QA",
            "2 weeks",
            2,
            ("LLM temperature clamping",),
        ),
        FeatureProposal(
            43,
            "Tool-First Reasoning Coach",
            Domain.ORCHESTRATION,
            "Intercepts planning steps and nudges the agent to prefer tool calls "
            "over pure LLM inference whenever structured data is available.",
            Relevance.HIGH,
            True,
            "Reduces hallucination by grounding reasoning in verifiable tool outputs.",
            "Platform + Score",
            "2 weeks",
            2,
            ("Tool coverage for common reasoning tasks",),
        ),
        FeatureProposal(
            44,
            "Prompt Modularization System",
            Domain.DEVX,
            "Decompose monolithic system prompts into named, versioned, composable "
            "blocks (persona, policies, tools, context) assembled at runtime.",
            Relevance.HIGH,
            True,
            "Improves maintainability and enables A/B testing prompt components.",
            "Platform + DevEx",
            "2–3 weeks",
            2,
            ("Block dependency resolution",),
        ),
        # ── MEDIUM band (catalog only) ─────────────────────────────────────
        FeatureProposal(
            7,
            "Persona-Aware Instruction Formatter",
            Domain.ORCHESTRATION,
            "Reformats agent instructions to match a configured persona's tone, "
            "vocabulary, and structural preferences before sending.",
            Relevance.MEDIUM,
            True,
            "Useful quality-of-life feature; depends on persona module being stable first.",
            "UX + Platform",
            "2 weeks",
            2,
            ("Persona module stability",),
        ),
        FeatureProposal(
            8,
            "Step-by-Step Plan Generator",
            Domain.ORCHESTRATION,
            "Converts a goal into an ordered, human-readable step plan with "
            "estimated tool calls and decision points.",
            Relevance.MEDIUM,
            True,
            "Helpful for transparency and operator review before execution.",
            "Product + AI Ops",
            "2 weeks",
            2,
            ("Plan format standardisation",),
        ),
        FeatureProposal(
            11,
            "Multi-Agent Task Splitter",
            Domain.ORCHESTRATION,
            "Splits a composite task into parallel sub-tasks distributed across "
            "specialised sub-agents, with result aggregation.",
            Relevance.MEDIUM,
            True,
            "Important for complex workflows; requires stable agent bus.",
            "Platform",
            "4–5 weeks",
            2,
            ("Agent bus stability", "result schema contract"),
        ),
        FeatureProposal(
            12,
            "Dependency Graph Resolver",
            Domain.ORCHESTRATION,
            "Builds and validates a DAG of task dependencies to find the optimal "
            "execution order and surface blocker chains.",
            Relevance.MEDIUM,
            True,
            "Foundational for the tool-call paralleliser and multi-agent splitter.",
            "Platform",
            "2–3 weeks",
            2,
            ("Cycle detection edge cases",),
        ),
        FeatureProposal(
            15,
            "Tool Parameter Auto-Filler",
            Domain.DEVX,
            "Infers missing or optional tool parameters from current context, "
            "memory, and schema defaults to reduce operator input burden.",
            Relevance.MEDIUM,
            True,
            "Reduces friction in tool-call authoring; medium confidence risk.",
            "Platform + DevEx",
            "2 weeks",
            2,
            ("Auto-fill accuracy monitoring",),
        ),
        FeatureProposal(
            18,
            "Tool Response Validator",
            Domain.DEVX,
            "Validates every tool response against its declared output schema and "
            "flags structural deviations before they propagate downstream.",
            Relevance.MEDIUM,
            True,
            "Complements tool-contract validator; adds runtime safety layer.",
            "Platform + QA",
            "2 weeks",
            2,
            ("Schema coverage",),
        ),
        FeatureProposal(
            19,
            "Tool Call Rate Limiter",
            Domain.ORCHESTRATION,
            "Per-tool, per-tenant rate limiting with burst allowances and "
            "backpressure signalling to the agent planner.",
            Relevance.MEDIUM,
            True,
            "Prevents abuse and protects external API quotas.",
            "Enforce",
            "2 weeks",
            2,
            ("Integration with orchestration rate-limit manager",),
        ),
        FeatureProposal(
            20,
            "Tool Cost Estimator",
            Domain.OBSERVABILITY,
            "Pre-flight estimation of a tool call's token cost, latency, and "
            "monetary cost to support budgeted plan execution.",
            Relevance.MEDIUM,
            True,
            "Feeds routing decisions and budget-aware planning.",
            "Analytics + Platform",
            "2 weeks",
            2,
            ("Cost model accuracy per tool",),
        ),
        FeatureProposal(
            21,
            "Tool Chain Builder",
            Domain.ORCHESTRATION,
            "Visual and programmatic composition of tool sequences with "
            "input/output piping and conditional branching.",
            Relevance.MEDIUM,
            True,
            "Power-user feature for building complex deterministic pipelines.",
            "Product + Platform",
            "3–4 weeks",
            2,
            ("UI editor scope",),
        ),
        FeatureProposal(
            23,
            "Tool Fallback Manager",
            Domain.ORCHESTRATION,
            "Defines ordered fallback chains for each tool so the agent can retry "
            "with an alternative if the primary fails.",
            Relevance.MEDIUM,
            True,
            "Improves resilience without hard-coding fallback logic per workflow.",
            "Enforce",
            "2 weeks",
            2,
            ("Fallback semantic equivalence checks",),
        ),
        FeatureProposal(
            25,
            "Structured Output Enforcer",
            Domain.ORCHESTRATION,
            "Wraps LLM calls with schema-enforced output parsing, retrying with "
            "repair prompts when the response doesn't conform.",
            Relevance.MEDIUM,
            True,
            "Reduces parsing failures in downstream consumers.",
            "Platform",
            "2 weeks",
            2,
            ("Repair-prompt quality",),
        ),
        FeatureProposal(
            26,
            "LLM Output Diff Tracker",
            Domain.OBSERVABILITY,
            "Tracks differences between model responses across runs for the same "
            "input to surface non-determinism and regressions.",
            Relevance.MEDIUM,
            True,
            "Enables quality monitoring and regression detection post-deployment.",
            "Watch + Analytics",
            "2–3 weeks",
            2,
            ("Storage and privacy for output history",),
        ),
        FeatureProposal(
            28,
            "Conversation Summarizer",
            Domain.KNOWLEDGE,
            "Produces concise, structured summaries of long conversations for "
            "context compression and handoff notes.",
            Relevance.MEDIUM,
            True,
            "Reduces context window pressure in long-running sessions.",
            "Platform + Knowledge",
            "2 weeks",
            2,
            ("Summary quality metrics",),
        ),
        FeatureProposal(
            32,
            "Long-Term Memory Store",
            Domain.KNOWLEDGE,
            "Persistent cross-session memory with retrieval-augmented lookup, "
            "TTL-based eviction, and tenant isolation.",
            Relevance.MEDIUM,
            True,
            "Enables true personalisation and knowledge persistence.",
            "Platform + Data",
            "4–5 weeks",
            2,
            ("Storage quotas", "PII handling"),
        ),
        FeatureProposal(
            33,
            "Session Replay Debugger (Conversation)",
            Domain.DEVX,
            "Replays a conversation session step-by-step with state diffs for "
            "debugging unexpected agent decisions.",
            Relevance.MEDIUM,
            True,
            "Extends the action-replay debugger to conversational context.",
            "DevEx + Watch",
            "3 weeks",
            2,
            ("Conversation trace storage",),
        ),
        FeatureProposal(
            34,
            "Context Window Optimizer",
            Domain.ORCHESTRATION,
            "Dynamically prunes and prioritises context window content to keep "
            "the most relevant information within token budgets.",
            Relevance.MEDIUM,
            True,
            "Critical for cost control in long-horizon tasks.",
            "Platform",
            "2–3 weeks",
            2,
            ("Relevance scoring quality",),
        ),
        FeatureProposal(
            36,
            "Chunking + Summarization Pipeline",
            Domain.KNOWLEDGE,
            "Configurable document chunking with adaptive overlap plus per-chunk "
            "summarisation for efficient RAG ingestion.",
            Relevance.MEDIUM,
            True,
            "Upstream quality gating for knowledge retrieval modules.",
            "Data + Knowledge",
            "2–3 weeks",
            2,
            ("Chunk size calibration per document type",),
        ),
        FeatureProposal(
            38,
            "Multi-Modal Reasoning Orchestrator",
            Domain.ORCHESTRATION,
            "Routes reasoning steps across text, image, and structured data modalities "
            "and merges results into a unified response.",
            Relevance.MEDIUM,
            True,
            "Enables richer workflows but requires stable multi-modal tool stack.",
            "Platform + AI Ops",
            "5–6 weeks",
            2,
            ("Multi-modal model availability", "output merging quality"),
        ),
        FeatureProposal(
            39,
            "Embedding Cache Manager",
            Domain.KNOWLEDGE,
            "Caches embedding vectors for frequently used text fragments to reduce "
            "repeated embedding costs and latency.",
            Relevance.MEDIUM,
            True,
            "Direct cost reduction for retrieval-heavy workflows.",
            "Platform + Data",
            "2 weeks",
            2,
            ("Cache invalidation on text updates",),
        ),
        FeatureProposal(
            41,
            "Structured Conversation Tree Builder",
            Domain.ORCHESTRATION,
            "Represents a conversation as a branching tree with intent nodes, "
            "allowing non-linear navigation and backtracking.",
            Relevance.MEDIUM,
            True,
            "Enables complex multi-turn dialogue design patterns.",
            "Platform + Product",
            "4 weeks",
            2,
            ("Tree serialisation format",),
        ),
        FeatureProposal(
            45,
            "Prompt Caching Optimizer",
            Domain.DEVX,
            "Identifies reusable prompt prefixes and caches them at the API layer "
            "to exploit model-provider prompt-caching discounts.",
            Relevance.MEDIUM,
            True,
            "Direct cost saving; pairs well with Prompt Modularization System.",
            "Platform + DevEx",
            "2 weeks",
            2,
            ("Provider support for prompt caching",),
        ),
        FeatureProposal(
            46,
            "Prompt Injection Guardrail",
            Domain.ORCHESTRATION,
            "Inspects user and tool-response content for prompt-injection payloads "
            "before they are appended to the agent context.",
            Relevance.MEDIUM,
            True,
            "Important defence layer; can also be hosted in shield module.",
            "Enforce + Shield",
            "2 weeks",
            2,
            ("Injection taxonomy coverage",),
        ),
        FeatureProposal(
            47,
            "Batch Processing Orchestrator",
            Domain.ORCHESTRATION,
            "Groups similar tasks into batches for model APIs that support batch "
            "pricing, with per-item result routing.",
            Relevance.MEDIUM,
            True,
            "Cost efficiency lever for high-volume workloads.",
            "Platform + Ops",
            "3 weeks",
            2,
            ("Batch API compatibility per provider",),
        ),
        FeatureProposal(
            49,
            "Async Callback Manager",
            Domain.ORCHESTRATION,
            "Manages async tool calls with webhook callbacks, retry on missed "
            "callbacks, and result routing back to the originating session.",
            Relevance.MEDIUM,
            True,
            "Required for integrations with slow external APIs.",
            "Platform",
            "3 weeks",
            2,
            ("Callback authentication", "missed-callback detection"),
        ),
        # ── LOW band (catalog only, amc_fit=False) ─────────────────────────
        FeatureProposal(
            9,
            "Auto Code Interpreter",
            Domain.DEVX,
            "Embeds a sandboxed Python/JS interpreter for agents to write and run "
            "code directly during task execution.",
            Relevance.LOW,
            False,
            "High engineering complexity and security surface; defer to phase 3.",
            "Platform + Security",
            "6+ weeks",
            2,
            ("Sandbox escape prevention", "resource quotas"),
        ),
        FeatureProposal(
            24,
            "Browser Automation Generator",
            Domain.DEVX,
            "Records browser sessions and converts them into reusable Playwright "
            "scripts with self-healing selectors.",
            Relevance.LOW,
            False,
            "Useful but duplicates existing browser-guardrail work; high drift risk.",
            "Automation",
            "6+ weeks",
            2,
            ("Selector self-healing", "site drift"),
        ),
        FeatureProposal(
            35,
            "Image Understanding Pipeline",
            Domain.UX,
            "Accepts screenshots, diagrams, and photos; extracts structured "
            "data and triggers appropriate workflows.",
            Relevance.LOW,
            False,
            "Good long-term play but not core to trust-first AMC MVP.",
            "Knowledge + UX",
            "5+ weeks",
            2,
            ("Vision model quality", "PII in images"),
        ),
        FeatureProposal(
            37,
            "Speech-to-Intent Converter",
            Domain.UX,
            "Converts voice input to structured intents using ASR + NLU pipeline.",
            Relevance.LOW,
            False,
            "Voice is a future channel expansion; outside current AMC scope.",
            "UX + Telephony",
            "6+ weeks",
            2,
            ("ASR accuracy", "consent recording"),
        ),
        FeatureProposal(
            40,
            "OCR + Document Parser",
            Domain.KNOWLEDGE,
            "Extracts text and structure from PDFs, scanned images, and spreadsheets.",
            Relevance.LOW,
            False,
            "Valuable for document-heavy verticals but not in core AMC trust stack.",
            "Data",
            "4+ weeks",
            2,
            ("OCR accuracy", "layout preservation"),
        ),
        FeatureProposal(
            48,
            "Real-Time Event Stream Processor",
            Domain.ORCHESTRATION,
            "Kafka/Kinesis-based event ingestion and routing for high-frequency "
            "real-time triggers.",
            Relevance.LOW,
            False,
            "Infrastructure-heavy; better handled via the existing event-router "
            "for current scale.",
            "Platform + Infra",
            "8+ weeks",
            2,
            ("Streaming infra cost", "ordering guarantees"),
        ),
        FeatureProposal(
            50,
            "Visual UI Interaction Planner",
            Domain.UX,
            "Plans and executes multi-step UI interactions from high-level intent "
            "using a vision model to interpret the current screen.",
            Relevance.LOW,
            False,
            "Research-grade capability; reliability not yet enterprise-ready.",
            "AI Research",
            "8+ weeks",
            2,
            ("Vision model reliability", "brittle UI detection"),
        ),
    ]


def get_features(
    relevance: Relevance | None = None,
    amc_fit_only: bool = False,
) -> list[FeatureProposal]:
    feats = _features()
    if amc_fit_only:
        feats = [f for f in feats if f.amc_fit]
    if relevance is not None:
        feats = [f for f in feats if f.relevance == relevance]
    return feats


def count_features() -> int:
    return len(_features())


def select_high_impact(limit: int = 10) -> list[FeatureProposal]:
    """Return top HIGH-fit items for fast execution."""
    ordered = [f for f in _features() if f.amc_fit and f.relevance == Relevance.HIGH]
    return ordered[: max(0, limit)]


def as_dicts(features: Iterable[FeatureProposal]) -> list[dict[str, object]]:
    return [
        {
            "feature_id": f.feature_id,
            "wave": f.wave,
            "title": f.title,
            "lane": f.lane.value,
            "summary": f.summary,
            "relevance": f.relevance.value,
            "amc_fit": f.amc_fit,
            "rationale": f.rationale,
            "owner_hint": f.owner_hint,
            "effort": f.effort,
            "blockers": list(f.blockers),
        }
        for f in features
    ]
