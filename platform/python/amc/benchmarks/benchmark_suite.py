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

Scoring notes
-------------
ScoringEngine._match_keywords() uses substring matching (``kw in answer``),
so answers must NEVER mention a yes-keyword when the intent is to deny it.
L1 answers contain only "no" keywords; L3 answers contain yes-keywords but
deliberately omit evidence-bonus keywords to keep scores below 70.
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
        """True when this agent should be scored via score_with_evidence()."""
        return bool(self.evidence_artifacts)


# ---------------------------------------------------------------------------
# L1_REF_AGENT  –  Ad-hoc / no capabilities
# ---------------------------------------------------------------------------
# Answer strategy: every answer has no_hits >= 1 AND yes_hits = 0.
# We never name the concept being denied — only pure negative vocabulary.
# Expected: all dimensions score 0 → avg = 0 → L1.

L1_REF_AGENT = ReferenceAgent(
    name="L1 Ad-hoc Reference Agent",
    expected_level=MaturityLevel.L1,
    expected_score_range=(0, 25),
    answers={
        # ── Governance  (no=["no","none","ad-hoc"] / ["nobody","unclear"] / ...) ──
        "gov_1": "None of this. It is purely ad-hoc.",
        "gov_2": "Unclear, nobody identified for this.",
        "gov_3": "Never done, no records exist.",
        "gov_4": "Fully autonomous with no oversight.",
        "gov_5": "We skip this entirely, none conducted, ad-hoc.",
        "gov_6": "All manual, no process, none whatsoever.",
        "gov_7": "No, none of this is done.",
        # ── Security ────────────────────────────────────────────────────────
        "sec_1": "Open access, none configured, no controls.",
        "sec_2": "No protections exist, none at all.",
        "sec_3": "Plaintext storage only, none protected, no controls.",
        "sec_4": "We skip all checks, no work done.",
        "sec_5": "All manual work, no automation, none.",
        "sec_6": "Never attempted, no targeted tests, none.",
        # ── Reliability ─────────────────────────────────────────────────────
        "rel_1": "Crashes are expected, no handling, none.",
        "rel_2": "Calls run free with no caps at all.",   # "unlimited" avoided: contains "limit" (yes kw)
        "rel_3": "No visibility configured, none set up.",
        "rel_4": "Manual pushes only, yolo style, no safety.",
        "rel_5": "All manual intervention required, no automation, none.",
        "rel_6": "Reactive only, no foresight, none.",
        # ── Evaluation ──────────────────────────────────────────────────────
        "eval_1": "We go by vibes, no systematic process, none.",
        "eval_2": "All manual, no pipeline exists.",
        "eval_3": "No structured process, none conducted.",
        "eval_4": "Never done, no focused tests.",
        "eval_5": "Offline at best, no online process, none.",
        "eval_6": "All manual, no loops, none.",
        # ── Observability ───────────────────────────────────────────────────
        "obs_1": "Just print to console, no system, none.",
        "obs_2": "Completely unknown, no visibility.",
        "obs_3": "Nothing configured, none available.",
        "obs_4": "No evidence preserved, none kept.",
        "obs_5": "All manual checks, no intelligence, none.",
        "obs_6": "No capability here, none available.",
        # ── Cost Efficiency ─────────────────────────────────────────────────
        "cost_1": "No spending controls, no governance.",   # "unlimited" avoided
        "cost_2": "We always use the same LLM, no variety.", # "one-model" avoided (contains "model" yes kw)
        "cost_3": "No optimization performed, none.",
        "cost_4": "No tracking or visibility, none.",
        "cost_5": "All manual choices, no automation, none.",
        "cost_6": "No safeguards exist, none at all.",
        # ── Operating Model ─────────────────────────────────────────────────
        "ops_1": "Individual contributors only, shadow IT, no hub.",
        "ops_2": "Ad-hoc for everything, no patterns.",
        "ops_3": "Tickets only, manual process, no automation.",
        "ops_4": "Single isolated agents, no coordination.",
        "ops_5": "Not documented, manual only, none provided.",
        "ops_6": "All manual ops, no automation, none.",
        "ops_7": "No goals, none measured, ad-hoc entirely.",
    },
    evidence_artifacts=[],
)


# ---------------------------------------------------------------------------
# L3_REF_AGENT  –  Managed / partial capabilities
# ---------------------------------------------------------------------------
# Answer strategy:
#   • Base rubric questions (non-L5): hit YES keywords, avoid EVIDENCE keywords.
#   • L5 rubric questions: empty string → gap, 0 pts.
#   • ops_2 & ops_5 have all yes-kws == evidence-kws; use neutral partial-credit
#     phrasing (yes=0, no=0 → 12 pts each) for ops_2.
#     ops_5: "adopting" hits yes-kw "adoption" without any evidence keyword.
#
# Predicted per-dimension scores (no bonuses):
#   GOV 125/175=71, SEC 80/130=61, REL 100/150=66, EVAL 100/150=66,
#   OBS 100/150=66, COST 100/150=66, OPS 112/175=64  →  avg ≈ 65  →  L3.

L3_REF_AGENT = ReferenceAgent(
    name="L3 Managed Reference Agent",
    expected_level=MaturityLevel.L3,
    expected_score_range=(50, 70),
    answers={
        # ── Governance ──────────────────────────────────────────────────────
        # evidence kws: soc2, iso, framework, committee  — none appear below
        "gov_1": "We have a documented policy with approval processes.",
        "gov_2": "Assigned owners are accountable for each agent.",
        "gov_3": "We maintain an audit log and review it periodically.",
        "gov_4": "Human approval is in the loop with escalation paths.",
        "gov_5": "Risk assessment is conducted before each release.",
        "gov_6": "",   # L5 gap — no automated continuous-governance loop
        "gov_7": "",   # L5 gap — no incident-driven policy improvement
        # ── Security ────────────────────────────────────────────────────────
        # sec_3 evidence kws: vault, kms, redaction, dlp
        #   → use "secret"+"redact" only; "redact" != "redaction"; "vault" avoided
        "sec_1": "A policy filter blocks disallowed tool calls.",
        "sec_2": "We detect and scan for injection attempts.",
        "sec_3": "Secrets use managed redact controls.",
        "sec_4": "Plugins are scanned and analyzed before deployment.",
        "sec_5": "",   # L5 gap — no automated adaptive threat modeling
        "sec_6": "",   # L5 gap — no continuous red-team simulation
        # ── Reliability ─────────────────────────────────────────────────────
        # rel_2 evidence kws: rate-limit, timeout, quota
        #   → "timeout" is both yes+evidence; use rate+throttle only
        #   → "rate-limit" (hyphen) != "rate limiting" (space) — safe
        # rel_4 evidence kws: canary, blue-green, rollback, ci-cd
        #   → "rollback"/"canary" both yes+evidence; use version+deploy only
        "rel_1": "Circuit breaker patterns with retry logic and fallback.",
        "rel_2": "Rate limiting and throttling are applied to every call.",
        "rel_3": "Health monitoring and alerts notify on incidents.",
        "rel_4": "We version our deploys carefully.",
        "rel_5": "",   # L5 gap — no self-healing autonomous recovery
        "rel_6": "",   # L5 gap — no predictive reliability alerting
        # ── Evaluation ──────────────────────────────────────────────────────
        # eval_1 evidence kws: eval-suite, benchmark, dataset, metrics
        #   → "benchmark" is both yes+evidence; use eval+test+measure only
        #   → "eval-suite" (hyphen) != "eval tests" (space) — safe
        "eval_1": "We run eval tests and measure quality systematically.",
        "eval_2": "Automated regression tests run in CI pipelines.",
        "eval_3": "Humans review outputs and provide structured feedback.",
        "eval_4": "We conduct safety reviews and adversarial testing.",
        "eval_5": "",  # L5 gap — no continuous production eval
        "eval_6": "",  # L5 gap — no automated eval-driven update loop
        # ── Observability ───────────────────────────────────────────────────
        # obs_3 evidence kws: grafana, prometheus, dashboard, datadog
        #   → "dashboard"/"grafana" both yes+evidence; use monitor+metric only
        "obs_1": "Structured logging with trace IDs and audit records.",
        "obs_2": "Token usage and cost are tracked with budget monitoring.",
        "obs_3": "We monitor systems and collect metric data.",
        "obs_4": "Action receipts are kept in an immutable record store.",
        "obs_5": "",   # L5 gap — no AI-powered anomaly detection
        "obs_6": "",   # L5 gap — no distributed tracing root-cause system
        # ── Cost Efficiency ─────────────────────────────────────────────────
        # cost_3 evidence kws: semantic-cache, prompt-cache, dedup
        #   → "dedup" is both yes+evidence; use cache+reuse only
        # cost_4 evidence kws: chargeback, cost-allocation, per-team, report
        #   → "report" is both yes+evidence; use attribution+allocate only
        #   → "per-team" (hyphen) != "per group" (space) — safe
        "cost_1": "Budget caps and spending limits have alert thresholds.",
        "cost_2": "Requests route to model tiers matched to complexity.",
        "cost_3": "Responses are cached and reused to cut costs.",
        "cost_4": "Costs are attributed and allocated per group.",
        "cost_5": "",  # L5 gap — no automated cost-optimized routing
        "cost_6": "",  # L5 gap — no automated budget enforcement circuit
        # ── Operating Model ─────────────────────────────────────────────────
        # ops_2 evidence kws: template, golden-path, catalog, standard (ALL == yes kws!)
        #   → neutral phrase: yes=0, no=0 → partial credit = 12 pts
        # ops_3 evidence kws: developer-portal, self-serve, api-catalog
        #   → "self-serve" is both; use portal+api+developer only
        #   → "developer-portal" (hyphen) != "developers … portal" — safe
        # ops_4 evidence kws: multi-agent, orchestration, dag, workflow
        #   → "multi-agent"/"workflow" both yes+evidence; use coordinate+orchestrat(e) only
        #   → "orchestration" != "orchestrate" (different suffixes) — safe
        # ops_5 evidence kws: enablement, training, playbook, onboarding (ALL == yes kws!)
        #   → "adoption" is a yes kw but NOT an evidence kw → use "adopting"
        "ops_1": "We have a central platform team for AI work.",
        "ops_2": "We follow repeatable processes across our agent builds.",
        "ops_3": "Developers have direct portal access with an API.",
        "ops_4": "We coordinate and orchestrate multiple agent pipelines.",
        "ops_5": "We guide teams in adopting agents.",
        "ops_6": "",   # L5 gap — no automated runbook execution
        "ops_7": "",   # L5 gap — no OKR-driven continuous improvement
    },
    evidence_artifacts=[],
)


# ---------------------------------------------------------------------------
# L5_REF_AGENT  –  Autonomous / all capabilities  (evidence-based scoring)
# ---------------------------------------------------------------------------
# All 44 rubric questions covered with EXECUTION_VERIFIED artifacts (trust=1.0).
# score_with_evidence() awards full points per question → all dims score 100
# → avg = 100 → L5. Expected range 85-100.

_VERIFIED_AT = "2026-02-19T05:21:00Z"


def _ev(qid: str, claim: str) -> EvidenceArtifact:
    """Return an EXECUTION_VERIFIED artifact with no execution errors."""
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
