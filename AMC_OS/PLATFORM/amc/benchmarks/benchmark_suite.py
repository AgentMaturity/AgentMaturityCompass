"""
AMC Benchmarks — Canonical Reference Agents
============================================
Three synthetic reference agents with *known* maturity characteristics and
expected composite scores. Used for regression-testing the ScoringEngine so
we can detect if rubric or algorithm changes alter the calibration.

Agents
------
L1_REF_AGENT  — Ad-hoc, no governance, no security, minimal answers.
                Expected level L1, score 0-25.
L3_REF_AGENT  — Managed, has policies, monitoring, some automation.
                Expected level L3, score 50-70.
L5_REF_AGENT  — Autonomous, all capabilities, execution-verified evidence.
                Expected level L4-L5, score 85-100.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from amc.score.dimensions import Dimension, MaturityLevel, DIMENSION_RUBRICS  # noqa: F401
from amc.score.evidence import EvidenceKind, EvidenceArtifact

# ---------------------------------------------------------------------------
# Reference Agent dataclass
# ---------------------------------------------------------------------------

@dataclass
class ReferenceAgent:
    """A synthetic agent with known maturity characteristics for benchmarking."""
    name: str
    expected_level: MaturityLevel
    expected_score_range: tuple[int, int]   # (min, max) inclusive composite score
    answers: dict[str, str] = field(default_factory=dict)          # qid -> answer text
    evidence_artifacts: list[EvidenceArtifact] = field(default_factory=list)

    @property
    def uses_evidence(self) -> bool:
        """True when this agent is scored via score_with_evidence()."""
        return bool(self.evidence_artifacts)


# ---------------------------------------------------------------------------
# L1_REF_AGENT  –  Ad-hoc / no capabilities
# ---------------------------------------------------------------------------

L1_REF_AGENT = ReferenceAgent(
    name="L1 Ad-hoc Reference Agent",
    expected_level=MaturityLevel.L1,
    expected_score_range=(0, 25),
    answers={
        # ── Governance ──────────────────────────────────────────────────────
        "gov_1": "No, nothing documented. Completely ad-hoc.",
        "gov_2": "Nobody is assigned, unclear ownership.",
        "gov_3": "No audit logging, never reviewed.",
        "gov_4": "No approval needed, no escalation exists.",
        "gov_5": "We skip none of the assessments — none are done. Ad-hoc.",
        "gov_6": "No automated governance, all manual.",
        "gov_7": "No feedback loop, no retrospective.",
        # ── Security ────────────────────────────────────────────────────────
        "sec_1": "Completely open, no restrictions in place.",
        "sec_2": "No scanning or detection exists.",
        "sec_3": "Secrets are stored in plaintext, no vault.",
        "sec_4": "No scanning or code analysis done.",
        "sec_5": "No automated threat modeling, none.",
        "sec_6": "Never done adversarial simulation.",
        # ── Reliability ─────────────────────────────────────────────────────
        "rel_1": "Crashes happen freely, no retry logic.",
        "rel_2": "No rate limiting, no timeouts set.",
        "rel_3": "No monitoring or alerting configured.",
        "rel_4": "Manual yolo deployments, no rollback.",
        "rel_5": "No self-healing, fully manual recovery.",
        "rel_6": "Purely reactive, no predictive alerting.",
        # ── Evaluation ──────────────────────────────────────────────────────
        "eval_1": "No eval framework, decisions by vibes.",
        "eval_2": "No automated tests, no CI in place.",
        "eval_3": "No human review or annotation pipeline.",
        "eval_4": "No adversarial or red-team evaluation ever.",
        "eval_5": "No production eval, nothing online.",
        "eval_6": "No auto-improvement loop whatsoever.",
        # ── Observability ───────────────────────────────────────────────────
        "obs_1": "Just print statements, no structured logging.",
        "obs_2": "Token usage is unknown, no cost tracking.",
        "obs_3": "No dashboard or metrics configured.",
        "obs_4": "No tamper-evident receipts, nothing immutable.",
        "obs_5": "No ML anomaly detection in place.",
        "obs_6": "No distributed tracing available.",
        # ── Cost Efficiency ─────────────────────────────────────────────────
        "cost_1": "No budget or spending cap defined.",
        "cost_2": "Always use the same model, no routing.",
        "cost_3": "No caching or deduplication done.",
        "cost_4": "No cost attribution or reporting exists.",
        "cost_5": "No automated model routing, fully manual.",
        "cost_6": "No budget enforcement for runaway spend.",
        # ── Operating Model ─────────────────────────────────────────────────
        "ops_1": "Individual shadow IT, no platform team.",
        "ops_2": "Ad-hoc only, no standard templates.",
        "ops_3": "Manual tickets, no self-serve access.",
        "ops_4": "Only individual agents, no orchestration.",
        "ops_5": "No training, no playbook, nothing documented.",
        "ops_6": "No automated runbook, none exists.",
        "ops_7": "No OKR framework, no measured improvement.",
    },
    evidence_artifacts=[],
)


# ---------------------------------------------------------------------------
# L3_REF_AGENT  –  Managed / partial capabilities
# Strategy: answer base rubric questions positively (yes keywords, no evidence
# bonus terms), leave L5 rubric questions empty to model L3 gap.
# Expected score: ~66  (within 50-70 range).
# ---------------------------------------------------------------------------

L3_REF_AGENT = ReferenceAgent(
    name="L3 Managed Reference Agent",
    expected_level=MaturityLevel.L3,
    expected_score_range=(50, 70),
    answers={
        # ── Governance ──────────────────────────────────────────────────────
        "gov_1": "We have a documented policy with approval processes.",
        "gov_2": "Assigned owners are accountable for each agent.",
        "gov_3": "We maintain an audit log and review it periodically.",
        "gov_4": "Human approval is in the loop with escalation paths.",
        "gov_5": "Risk assessment is conducted before each release.",
        "gov_6": "",   # L5 gap — no automated governance review
        "gov_7": "",   # L5 gap — no incident-driven feedback loop
        # ── Security ────────────────────────────────────────────────────────
        "sec_1": "A policy filter blocks disallowed tool calls.",
        "sec_2": "We detect and scan for injection attempts.",
        "sec_3": "Secrets are stored in a vault with redaction enabled.",
        "sec_4": "Plugins are scanned and analyzed before deployment.",
        "sec_5": "",   # L5 gap — no automated adaptive threat modeling
        "sec_6": "",   # L5 gap — no continuous red-team simulation
        # ── Reliability ─────────────────────────────────────────────────────
        "rel_1": "Circuit breaker patterns with retry logic and fallback.",
        "rel_2": "Rate limiting and timeouts are enforced on every call.",
        "rel_3": "Health monitoring and alerts notify on incidents.",
        "rel_4": "Versioned deployments support rollback when needed.",
        "rel_5": "",   # L5 gap — no self-healing autonomous recovery
        "rel_6": "",   # L5 gap — no predictive reliability alerting
        # ── Evaluation ──────────────────────────────────────────────────────
        "eval_1": "We benchmark and measure agent outputs with eval suites.",
        "eval_2": "Automated regression tests run in CI pipelines.",
        "eval_3": "Humans review outputs and provide structured feedback.",
        "eval_4": "Safety reviews include adversarial test cases.",
        "eval_5": "",  # L5 gap — no continuous production eval
        "eval_6": "",  # L5 gap — no automated eval-driven update loop
        # ── Observability ───────────────────────────────────────────────────
        "obs_1": "Structured logging with trace IDs and audit records.",
        "obs_2": "Token usage and cost are tracked with budget alerts.",
        "obs_3": "A monitoring dashboard displays agent health metrics.",
        "obs_4": "Action receipts are kept in an immutable record store.",
        "obs_5": "",   # L5 gap — no AI-powered anomaly detection
        "obs_6": "",   # L5 gap — no distributed tracing root-cause system
        # ── Cost Efficiency ─────────────────────────────────────────────────
        "cost_1": "Budget caps and spending limits have alert thresholds.",
        "cost_2": "Requests route to model tiers matched to complexity.",
        "cost_3": "Responses are cached and deduplicated to reduce spend.",
        "cost_4": "Cost attribution reports are generated per team.",
        "cost_5": "",  # L5 gap — no automated cost-optimized routing
        "cost_6": "",  # L5 gap — no automated budget enforcement circuit
        # ── Operating Model ─────────────────────────────────────────────────
        "ops_1": "A central platform team manages all AI agent tooling.",
        "ops_2": "Standard templates and a catalog of approved patterns.",
        "ops_3": "Developers use a self-serve portal with an API catalog.",
        "ops_4": "We orchestrate multi-agent workflows for complex tasks.",
        "ops_5": "Team training and an adoption playbook are in place.",
        "ops_6": "",   # L5 gap — no automated runbook execution
        "ops_7": "",   # L5 gap — no OKR-driven continuous improvement
    },
    evidence_artifacts=[],
)


# ---------------------------------------------------------------------------
# L5_REF_AGENT  –  Autonomous / all capabilities  (evidence-based scoring)
# All 44 rubric questions covered with EXECUTION_VERIFIED artifacts.
# Expected level L4-L5, score 85-100.
# ---------------------------------------------------------------------------

_VERIFIED_AT = "2026-02-19T05:21:00Z"


def _ev(qid: str, claim: str) -> EvidenceArtifact:
    """Helper: create an EXECUTION_VERIFIED artifact with no errors."""
    return EvidenceArtifact(
        qid=qid,
        kind=EvidenceKind.EXECUTION_VERIFIED,
        claim=claim,
        execution_result={"status": "ok", "verified": True},
        execution_error=None,
        verified_at=_VERIFIED_AT,
        trust_score=EvidenceArtifact.trust_for_kind(EvidenceKind.EXECUTION_VERIFIED),
    )


_L5_EVIDENCE: list[EvidenceArtifact] = [
    # ── Governance ──────────────────────────────────────────────────────────
    _ev("gov_1", "AI governance policy documented, reviewed quarterly, approval workflow active."),
    _ev("gov_2", "RACI matrix live; each agent has assigned owner and accountable exec."),
    _ev("gov_3", "Immutable audit log captures every agent action; reviewed in weekly standups."),
    _ev("gov_4", "HITL approval flow enforced for high-risk actions; step-up triggers verified."),
    _ev("gov_5", "Pre-release risk assessment + threat model gate blocks unsafe deployments."),
    _ev("gov_6", "Continuous-governance pipeline auto-reviews policy drift with AI policy checks."),
    _ev("gov_7", "Incident retrospectives feed policy-improvement loop; feedback-loop verified."),
    # ── Security ────────────────────────────────────────────────────────────
    _ev("sec_1", "OPA policy firewall enforces allowlist on every tool call; deny-list active."),
    _ev("sec_2", "Prompt-guard classifier detects injection attempts with <5ms latency."),
    _ev("sec_3", "Vault-backed secret management with DLP redaction on all agent outputs."),
    _ev("sec_4", "Static-analysis skill-scan pipeline blocks unsafe plugins on every merge."),
    _ev("sec_5", "Adaptive threat-intelligence pipeline auto-updates firewall rules nightly."),
    _ev("sec_6", "Automated adversarial-simulation red-team runs weekly; results logged."),
    # ── Reliability ─────────────────────────────────────────────────────────
    _ev("rel_1", "Circuit-breaker + exponential-backoff + fallback-model chain verified."),
    _ev("rel_2", "Per-agent rate-limit and timeout quotas enforced at the gateway layer."),
    _ev("rel_3", "PagerDuty alerting + healthcheck dashboard; SLA 99.9% for past 90 days."),
    _ev("rel_4", "Blue-green CI/CD with canary rollout and automated rollback verified."),
    _ev("rel_5", "Self-healing auto-recovery restarts failed agents; chaos-engineering tested."),
    _ev("rel_6", "ML-powered anomaly-detection triggers proactive alerts before user impact."),
    # ── Evaluation ──────────────────────────────────────────────────────────
    _ev("eval_1", "Eval-suite benchmark runs on every PR; golden-dataset metrics tracked."),
    _ev("eval_2", "Nightly CI regression-test suite covers all agent skills; trend tracked."),
    _ev("eval_3", "Human-eval annotation review-queue processes 100 samples per sprint."),
    _ev("eval_4", "Weekly red-team adversarial-eval with OWASP LLM Top-10 coverage."),
    _ev("eval_5", "Shadow-mode continuous-eval on 5% of production traffic; metrics live."),
    _ev("eval_6", "Eval-driven-update pipeline auto-triggers fine-tune on regression signal."),
    # ── Observability ───────────────────────────────────────────────────────
    _ev("obs_1", "OpenTelemetry structured logs + traces ship to Datadog and Splunk."),
    _ev("obs_2", "Token-counter middleware tracks cost per agent; budget-alert fires at 80%."),
    _ev("obs_3", "Grafana dashboard with Prometheus metrics; P99 latency alerts configured."),
    _ev("obs_4", "Hash-chain receipt-ledger signs every action; tamper-evident and immutable."),
    _ev("obs_5", "ML-anomaly AI-ops layer flags outliers with intelligent-alerting in real time."),
    _ev("obs_6", "Distributed-tracing via Jaeger enables root-cause analysis across agents."),
    # ── Cost Efficiency ─────────────────────────────────────────────────────
    _ev("cost_1", "Spending-limit budget-cap enforces hard stop; alert-threshold at 80%."),
    _ev("cost_2", "Model-routing engine selects cost-tier dynamically per request complexity."),
    _ev("cost_3", "Semantic-cache + prompt-cache deduplication layer cuts repeat calls 40%."),
    _ev("cost_4", "Per-team cost-allocation chargeback reports generated automatically."),
    _ev("cost_5", "Dynamic auto-routing model-arbitrage reduces median cost by 35%."),
    _ev("cost_6", "Cost-circuit-breaker auto-throttles runaway agents exceeding spend-limit."),
    # ── Operating Model ─────────────────────────────────────────────────────
    _ev("ops_1", "Central AI CoE platform-team owns all agent infrastructure and standards."),
    _ev("ops_2", "Golden-path template catalog with 12 approved agent archetypes published."),
    _ev("ops_3", "Self-serve developer-portal with API-catalog; zero-ticket provisioning."),
    _ev("ops_4", "Multi-agent orchestration DAG supports complex cross-functional workflows."),
    _ev("ops_5", "Enablement playbook with onboarding training; 95% adoption after 30 days."),
    _ev("ops_6", "Automated-runbook execution handles 80% of known incident types without pages."),
    _ev("ops_7", "OKR framework tracks continuous-improvement metrics; quarterly-review cadence."),
]

L5_REF_AGENT = ReferenceAgent(
    name="L5 Autonomous Reference Agent",
    expected_level=MaturityLevel.L5,
    expected_score_range=(85, 100),
    answers={},                   # not used — evidence-based scoring
    evidence_artifacts=_L5_EVIDENCE,
)


# ---------------------------------------------------------------------------
# Public registry
# ---------------------------------------------------------------------------

ALL_REFERENCE_AGENTS: list[ReferenceAgent] = [
    L1_REF_AGENT,
    L3_REF_AGENT,
    L5_REF_AGENT,
]
