"""
AMC Score — Dimensions: Maturity Scoring Engine
Evaluates organizations across 7 AI agent maturity dimensions,
producing L1–L4 scores with evidence and gap analysis.

Usage:
    engine = ScoringEngine()
    score = engine.score_dimension(Dimension.SECURITY, answers)
    composite = engine.score_all(all_answers)
    print(composite.overall_level, composite.recommended_platform_modules)
"""
from __future__ import annotations

import uuid
from enum import Enum
from typing import Any

import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Enums & Models
# ---------------------------------------------------------------------------

class Dimension(str, Enum):
    GOVERNANCE = "governance"
    SECURITY = "security"
    RELIABILITY = "reliability"
    EVALUATION = "evaluation"
    OBSERVABILITY = "observability"
    COST_EFFICIENCY = "cost_efficiency"
    OPERATING_MODEL = "operating_model"


class MaturityLevel(str, Enum):
    L1 = "L1"  # Ad-hoc
    L2 = "L2"  # Defined
    L3 = "L3"  # Managed
    L4 = "L4"  # Optimized
    L5 = "L5"  # Autonomous & Self-Improving


class DimensionScore(BaseModel):
    """Score for a single maturity dimension."""
    dimension: Dimension
    level: MaturityLevel
    score: int = Field(ge=0, le=100)
    evidence: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)


class CompositeScore(BaseModel):
    """Aggregate maturity score across all dimensions."""
    score_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    overall_level: MaturityLevel
    overall_score: int = Field(ge=0, le=100)
    dimension_scores: list[DimensionScore] = Field(default_factory=list)
    recommended_platform_modules: dict[str, list[str]] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Scoring Rubrics per Dimension
# ---------------------------------------------------------------------------

# Each question rubric: {question_id: {yes_keywords, no_keywords, evidence_keywords, points, gap_text}}
DIMENSION_RUBRICS: dict[Dimension, list[dict[str, Any]]] = {
    Dimension.GOVERNANCE: [
        {"qid": "gov_1", "yes": ["policy", "documented", "approval", "review"], "no": ["no", "none", "ad-hoc"], "evidence": ["soc2", "iso", "framework", "committee"], "points": 25, "gap": "No formal AI governance policy"},
        {"qid": "gov_2", "yes": ["owner", "accountable", "assigned", "raci"], "no": ["nobody", "unclear"], "evidence": ["raci", "charter", "responsible"], "points": 25, "gap": "No clear ownership for AI agent decisions"},
        {"qid": "gov_3", "yes": ["audit", "log", "trail", "review"], "no": ["no", "never"], "evidence": ["quarterly", "monthly", "annual", "audit-log"], "points": 25, "gap": "No audit trail for agent actions"},
        {"qid": "gov_4", "yes": ["approval", "human", "loop", "escalation"], "no": ["autonomous", "no"], "evidence": ["step-up", "hitl", "approval-flow"], "points": 25, "gap": "No human-in-the-loop for high-risk actions"},
        {"qid": "gov_5", "yes": ["risk", "assessment", "release", "review"], "no": ["skip", "none", "ad-hoc"], "evidence": ["risk-registry", "threat-model", "pre-release", "governance"], "points": 25, "gap": "No pre-release AI risk assessments"},
    ],
    Dimension.SECURITY: [
        {"qid": "sec_1", "yes": ["firewall", "policy", "filter", "block"], "no": ["open", "none", "no"], "evidence": ["waf", "allowlist", "deny-list", "opa"], "points": 20, "gap": "No tool-call policy firewall"},
        {"qid": "sec_2", "yes": ["injection", "detect", "scan", "filter"], "no": ["no", "none"], "evidence": ["prompt-guard", "regex", "classifier", "owasp"], "points": 20, "gap": "No prompt injection detection"},
        {"qid": "sec_3", "yes": ["secret", "vault", "redact", "dlp"], "no": ["plaintext", "none", "no"], "evidence": ["vault", "kms", "redaction", "dlp"], "points": 20, "gap": "No secret management / DLP"},
        {"qid": "sec_4", "yes": ["scan", "lint", "analyze", "review"], "no": ["no", "skip"], "evidence": ["static-analysis", "skill-scan", "code-review"], "points": 20, "gap": "No skill/plugin security scanning"},
    ],
    Dimension.RELIABILITY: [
        {"qid": "rel_1", "yes": ["circuit", "breaker", "retry", "fallback"], "no": ["crash", "no", "none"], "evidence": ["circuit-breaker", "exponential-backoff", "fallback-model"], "points": 25, "gap": "No circuit breaker / retry logic"},
        {"qid": "rel_2", "yes": ["timeout", "limit", "rate", "throttle"], "no": ["unlimited", "no"], "evidence": ["rate-limit", "timeout", "quota"], "points": 25, "gap": "No rate limiting or timeouts"},
        {"qid": "rel_3", "yes": ["monitor", "health", "alert", "uptime"], "no": ["no", "none"], "evidence": ["healthcheck", "pagerduty", "alerting", "sla"], "points": 25, "gap": "No health monitoring or alerting"},
        {"qid": "rel_4", "yes": ["rollback", "version", "canary", "deploy"], "no": ["yolo", "manual", "no"], "evidence": ["canary", "blue-green", "rollback", "ci-cd"], "points": 25, "gap": "No safe deployment / rollback strategy"},
    ],
    Dimension.EVALUATION: [
        {"qid": "eval_1", "yes": ["eval", "test", "benchmark", "measure"], "no": ["no", "vibes", "none"], "evidence": ["eval-suite", "benchmark", "dataset", "metrics"], "points": 25, "gap": "No evaluation framework for agent outputs"},
        {"qid": "eval_2", "yes": ["regression", "ci", "automated", "continuous"], "no": ["manual", "no"], "evidence": ["ci-eval", "regression-test", "nightly"], "points": 25, "gap": "No automated regression testing"},
        {"qid": "eval_3", "yes": ["human", "review", "feedback", "annotation"], "no": ["no", "none"], "evidence": ["rlhf", "human-eval", "annotation", "review-queue"], "points": 25, "gap": "No human evaluation loop"},
        {"qid": "eval_4", "yes": ["safety", "red-team", "adversarial", "attack"], "no": ["no", "never"], "evidence": ["red-team", "adversarial-eval", "owasp", "pentest"], "points": 25, "gap": "No safety / red-team evaluation"},
    ],
    Dimension.OBSERVABILITY: [
        {"qid": "obs_1", "yes": ["log", "trace", "structured", "audit"], "no": ["no", "print", "none"], "evidence": ["structlog", "opentelemetry", "datadog", "splunk"], "points": 25, "gap": "No structured logging"},
        {"qid": "obs_2", "yes": ["cost", "token", "track", "budget"], "no": ["no", "unknown"], "evidence": ["token-counter", "cost-dashboard", "budget-alert"], "points": 25, "gap": "No token / cost tracking"},
        {"qid": "obs_3", "yes": ["dashboard", "metric", "monitor", "grafana"], "no": ["no", "none"], "evidence": ["grafana", "prometheus", "dashboard", "datadog"], "points": 25, "gap": "No observability dashboard"},
        {"qid": "obs_4", "yes": ["receipt", "chain", "tamper", "immutable"], "no": ["no", "none"], "evidence": ["receipt-ledger", "hash-chain", "append-only"], "points": 25, "gap": "No tamper-evident action receipts"},
    ],
    Dimension.COST_EFFICIENCY: [
        {"qid": "cost_1", "yes": ["budget", "limit", "cap", "threshold"], "no": ["unlimited", "no"], "evidence": ["budget-cap", "spending-limit", "alert-threshold"], "points": 25, "gap": "No cost budgets or caps"},
        {"qid": "cost_2", "yes": ["model", "select", "route", "tier"], "no": ["always-gpt4", "one-model", "no"], "evidence": ["model-routing", "cost-tier", "small-model"], "points": 25, "gap": "No model routing for cost optimization"},
        {"qid": "cost_3", "yes": ["cache", "reuse", "dedup", "memo"], "no": ["no", "none"], "evidence": ["semantic-cache", "prompt-cache", "dedup"], "points": 25, "gap": "No response caching or deduplication"},
        {"qid": "cost_4", "yes": ["report", "chargeback", "attribution", "allocate"], "no": ["no", "none"], "evidence": ["chargeback", "cost-allocation", "per-team", "report"], "points": 25, "gap": "No cost attribution / reporting"},
    ],
    Dimension.OPERATING_MODEL: [
        {"qid": "ops_1", "yes": ["platform", "team", "center", "excellence"], "no": ["individual", "no", "shadow"], "evidence": ["coe", "platform-team", "mlops", "aiops"], "points": 25, "gap": "No centralized AI platform team"},
        {"qid": "ops_2", "yes": ["standard", "template", "golden-path", "catalog"], "no": ["ad-hoc", "no"], "evidence": ["template", "golden-path", "catalog", "standard"], "points": 25, "gap": "No standardized agent templates"},
        {"qid": "ops_3", "yes": ["self-serve", "portal", "api", "developer"], "no": ["ticket", "manual", "no"], "evidence": ["developer-portal", "self-serve", "api-catalog"], "points": 25, "gap": "No self-serve developer experience"},
        {"qid": "ops_4", "yes": ["multi-agent", "orchestrat", "coordinate", "workflow"], "no": ["single", "no"], "evidence": ["multi-agent", "orchestration", "dag", "workflow"], "points": 25, "gap": "No multi-agent orchestration capability"},
        {"qid": "ops_5", "yes": ["training", "playbook", "adoption", "enablement"], "no": ["none", "not", "manual"], "evidence": ["enablement", "training", "playbook", "onboarding"], "points": 25, "gap": "No adoption playbook for AI agents"},
        # L5 — Autonomous & Self-Improving
        {"qid": "ops_6", "yes": ["automated-runbook", "auto-remediation", "self-service-ops", "runbook-automation"], "no": ["manual", "no", "none"], "evidence": ["automated-runbook", "auto-remediation", "runbook-automation", "self-service-ops"], "points": 25, "gap": "No automated runbook execution for known incident types"},
        {"qid": "ops_7", "yes": ["okr", "continuous-improvement", "quarterly-review", "measured-improvement"], "no": ["no", "none", "ad-hoc"], "evidence": ["okr", "quarterly-review", "continuous-improvement", "measured-improvement"], "points": 25, "gap": "No OKR framework with measured continuous improvement cadence"},
    ],
}

# L5 rubric additions: inject into each dimension
_L5_RUBRICS: dict[Dimension, list[dict[str, Any]]] = {
    Dimension.GOVERNANCE: [
        {"qid": "gov_6", "yes": ["automated", "continuous-governance", "ai-policy", "self-review"], "no": ["manual", "no", "none"], "evidence": ["automated", "continuous-governance", "ai-policy", "self-review"], "points": 25, "gap": "No automated governance review loop"},
        {"qid": "gov_7", "yes": ["feedback-loop", "incident-learning", "policy-improvement", "retrospective"], "no": ["no", "none"], "evidence": ["feedback-loop", "incident-learning", "policy-improvement", "retrospective"], "points": 25, "gap": "No incident-driven governance feedback loop"},
    ],
    Dimension.SECURITY: [
        {"qid": "sec_5", "yes": ["automated-threat", "adaptive-security", "self-healing", "threat-intelligence"], "no": ["manual", "no", "none"], "evidence": ["automated-threat", "adaptive-security", "threat-intelligence", "self-healing"], "points": 25, "gap": "No automated adaptive threat modeling"},
        {"qid": "sec_6", "yes": ["continuous-red-team", "adversarial-simulation", "attack-simulation", "pentest-automation"], "no": ["no", "never", "none"], "evidence": ["continuous-red-team", "adversarial-simulation", "attack-simulation", "pentest-automation"], "points": 25, "gap": "No continuous red-team or adversarial simulation"},
    ],
    Dimension.RELIABILITY: [
        {"qid": "rel_5", "yes": ["self-healing", "auto-recovery", "autonomous-recovery", "chaos-engineering"], "no": ["manual", "no", "none"], "evidence": ["self-healing", "auto-recovery", "autonomous-recovery", "chaos-engineering"], "points": 25, "gap": "No self-healing autonomous recovery"},
        {"qid": "rel_6", "yes": ["predictive", "ml-reliability", "proactive-alert", "anomaly-detection"], "no": ["reactive", "no", "none"], "evidence": ["predictive", "ml-reliability", "proactive-alert", "anomaly-detection"], "points": 25, "gap": "No predictive reliability with proactive alerting"},
    ],
    Dimension.EVALUATION: [
        {"qid": "eval_5", "yes": ["shadow-eval", "production-eval", "continuous-eval", "online-eval"], "no": ["offline", "no", "none"], "evidence": ["shadow-eval", "production-eval", "continuous-eval", "online-eval"], "points": 25, "gap": "No continuous evaluation on production traffic"},
        {"qid": "eval_6", "yes": ["auto-improvement", "self-improving", "eval-driven-update", "feedback-loop"], "no": ["manual", "no", "none"], "evidence": ["auto-improvement", "self-improving", "eval-driven-update", "feedback-loop"], "points": 25, "gap": "No automated eval-driven improvement loop"},
    ],
    Dimension.OBSERVABILITY: [
        {"qid": "obs_5", "yes": ["ml-anomaly", "ai-ops", "intelligent-alerting", "predictive-observability"], "no": ["manual", "no", "none"], "evidence": ["ml-anomaly", "ai-ops", "intelligent-alerting", "predictive-observability"], "points": 25, "gap": "No AI-powered anomaly detection on observability data"},
        {"qid": "obs_6", "yes": ["distributed-tracing", "root-cause", "opentelemetry", "jaeger"], "no": ["no", "none"], "evidence": ["distributed-tracing", "root-cause", "opentelemetry", "jaeger"], "points": 25, "gap": "No distributed tracing with root cause analysis"},
    ],
    Dimension.COST_EFFICIENCY: [
        {"qid": "cost_5", "yes": ["auto-routing", "cost-optimization", "model-arbitrage", "dynamic-routing"], "no": ["manual", "no", "none"], "evidence": ["auto-routing", "cost-optimization", "model-arbitrage", "dynamic-routing"], "points": 25, "gap": "No automated cost-optimized model routing"},
        {"qid": "cost_6", "yes": ["budget-enforcement", "auto-throttle", "cost-circuit-breaker", "spend-limit"], "no": ["no", "none"], "evidence": ["budget-enforcement", "auto-throttle", "cost-circuit-breaker", "spend-limit"], "points": 25, "gap": "No automated budget enforcement for runaway agents"},
    ],
}

# Merge L5 rubrics into DIMENSION_RUBRICS
for _dim, _extras in _L5_RUBRICS.items():
    DIMENSION_RUBRICS[_dim].extend(_extras)

# Module recommendations: which AMC platform modules address gaps in each dimension
MODULE_RECOMMENDATIONS: dict[Dimension, list[str]] = {
    Dimension.GOVERNANCE: ["amc.enforce.e1_policy", "amc.watch.w1_receipts"],
    Dimension.SECURITY: ["amc.shield.s1_analyzer", "amc.shield.s10_detector", "amc.vault.v2_dlp", "amc.watch.w2_assurance"],
    Dimension.RELIABILITY: ["amc.enforce.e1_policy"],
    Dimension.EVALUATION: ["amc.watch.w2_assurance"],
    Dimension.OBSERVABILITY: ["amc.watch.w1_receipts", "amc.watch.w2_assurance"],
    Dimension.COST_EFFICIENCY: [],
    Dimension.OPERATING_MODEL: ["amc.api.main"],
}


# ---------------------------------------------------------------------------
# ScoringEngine
# ---------------------------------------------------------------------------

class ScoringEngine:
    """
    Scores organizations across 7 AI agent maturity dimensions.
    Uses keyword/evidence pattern matching on free-text answers
    to infer L1–L4 maturity level per dimension.
    """

    def _match_keywords(self, text: str, keywords: list[str]) -> int:
        """Count how many keywords appear in the text (case-insensitive)."""
        lower = text.lower()
        return sum(1 for kw in keywords if kw.lower() in lower)

    def score_dimension(
        self, dimension: Dimension, answers: dict[str, str],
    ) -> DimensionScore:
        """
        Score a single dimension based on questionnaire answers.

        Args:
            dimension: Which dimension to score.
            answers: {question_id: free-text answer} for this dimension's questions.

        Returns:
            DimensionScore with level, score, evidence, and gaps.
        """
        rubrics = DIMENSION_RUBRICS.get(dimension, [])
        total_points = 0
        max_points = 0
        evidence: list[str] = []
        gaps: list[str] = []

        for rubric in rubrics:
            qid = rubric["qid"]
            answer = answers.get(qid, "")
            max_points += rubric["points"]

            if not answer.strip():
                gaps.append(rubric["gap"])
                continue

            yes_hits = self._match_keywords(answer, rubric["yes"])
            no_hits = self._match_keywords(answer, rubric["no"])
            evidence_hits = self._match_keywords(answer, rubric["evidence"])

            if yes_hits > no_hits:
                total_points += rubric["points"]
                if evidence_hits > 0:
                    # Bonus for providing concrete evidence (capped)
                    bonus = min(evidence_hits * 3, 10)
                    total_points += bonus
                    evidence.append(f"{qid}: matched evidence keywords in answer")
            elif no_hits > 0 and yes_hits == 0:
                gaps.append(rubric["gap"])
            else:
                # Ambiguous — partial credit
                total_points += rubric["points"] // 2
                gaps.append(rubric["gap"])

        # Normalize to 0-100
        score = min(100, int((total_points / max(max_points, 1)) * 100)) if max_points else 0

        # Determine level
        if score >= 95:
            level = MaturityLevel.L5
        elif score >= 80:
            level = MaturityLevel.L4
        elif score >= 55:
            level = MaturityLevel.L3
        elif score >= 30:
            level = MaturityLevel.L2
        else:
            level = MaturityLevel.L1

        return DimensionScore(
            dimension=dimension,
            level=level,
            score=score,
            evidence=evidence,
            gaps=gaps,
        )

    def score_all(self, questionnaire_answers: dict[str, str]) -> CompositeScore:
        """
        Score all 7 dimensions from a flat dict of {question_id: answer}.

        The engine routes each question to its dimension based on the
        question ID prefix (gov_, sec_, rel_, eval_, obs_, cost_, ops_).

        Args:
            questionnaire_answers: Flat dict of all answers keyed by question ID.

        Returns:
            CompositeScore with per-dimension scores and recommendations.
        """
        PREFIX_MAP: dict[str, Dimension] = {
            "gov_": Dimension.GOVERNANCE,
            "sec_": Dimension.SECURITY,
            "rel_": Dimension.RELIABILITY,
            "eval_": Dimension.EVALUATION,
            "obs_": Dimension.OBSERVABILITY,
            "cost_": Dimension.COST_EFFICIENCY,
            "ops_": Dimension.OPERATING_MODEL,
        }

        # Partition answers by dimension
        dim_answers: dict[Dimension, dict[str, str]] = {d: {} for d in Dimension}
        for qid, answer in questionnaire_answers.items():
            for prefix, dim in PREFIX_MAP.items():
                if qid.startswith(prefix):
                    dim_answers[dim][qid] = answer
                    break

        # Score each dimension
        dim_scores: list[DimensionScore] = []
        for dim in Dimension:
            ds = self.score_dimension(dim, dim_answers[dim])
            dim_scores.append(ds)

        # Overall score = average
        avg = int(sum(ds.score for ds in dim_scores) / len(dim_scores)) if dim_scores else 0
        if avg >= 95:
            overall = MaturityLevel.L5
        elif avg >= 80:
            overall = MaturityLevel.L4
        elif avg >= 55:
            overall = MaturityLevel.L3
        elif avg >= 30:
            overall = MaturityLevel.L2
        else:
            overall = MaturityLevel.L1

        # Recommendations: for dimensions with gaps, suggest modules
        recommendations: dict[str, list[str]] = {}
        for ds in dim_scores:
            if ds.gaps:
                modules = MODULE_RECOMMENDATIONS.get(ds.dimension, [])
                if modules:
                    recommendations[ds.dimension.value] = modules

        composite = CompositeScore(
            overall_level=overall,
            overall_score=avg,
            dimension_scores=dim_scores,
            recommended_platform_modules=recommendations,
        )

        log.info(
            "scoring.complete",
            overall_level=overall,
            overall_score=avg,
            dimensions_scored=len(dim_scores),
        )
        return composite

    # ------------------------------------------------------------------
    # Evidence-based scoring (anti-gaming)
    # ------------------------------------------------------------------

    def score_with_evidence(
        self, evidence: list[Any],
    ) -> CompositeScore:
        """
        Score all dimensions using EvidenceArtifacts instead of free-text answers.

        Each artifact's trust_score (derived from EvidenceKind) determines the
        fraction of full points awarded, replacing keyword matching entirely.

        Scoring rules:
          KEYWORD_CLAIM:       40% of full points
          CODE_PRESENT:        55% of full points
          IMPORT_VERIFIED:     70% of full points
          EXECUTION_VERIFIED: 100% of full points
          CONTINUOUS_VERIFIED: 110% of full points (bonus)
          execution_error set:   0% regardless of kind

        Args:
            evidence: list of EvidenceArtifact objects.

        Returns:
            CompositeScore with per-dimension scores and recommendations.
        """
        from amc.score.evidence import EvidenceArtifact as _EA, TRUST_MULTIPLIERS

        PREFIX_MAP: dict[str, Dimension] = {
            "gov_": Dimension.GOVERNANCE,
            "sec_": Dimension.SECURITY,
            "rel_": Dimension.RELIABILITY,
            "eval_": Dimension.EVALUATION,
            "obs_": Dimension.OBSERVABILITY,
            "cost_": Dimension.COST_EFFICIENCY,
            "ops_": Dimension.OPERATING_MODEL,
        }

        # Index evidence by qid (take highest-trust artifact per qid)
        best: dict[str, _EA] = {}
        for art in evidence:
            if not isinstance(art, _EA):
                continue
            existing = best.get(art.qid)
            if existing is None or art.trust_score > existing.trust_score:
                best[art.qid] = art

        dim_scores: list[DimensionScore] = []

        for dim in Dimension:
            rubrics = DIMENSION_RUBRICS.get(dim, [])
            total_points = 0
            max_points = 0
            ev_list: list[str] = []
            gaps: list[str] = []

            for rubric in rubrics:
                qid = rubric["qid"]
                max_points += rubric["points"]
                art = best.get(qid)

                if art is None:
                    gaps.append(rubric["gap"])
                    continue

                # Failed execution → 0 points
                if art.execution_error:
                    gaps.append(rubric["gap"])
                    ev_list.append(f"{qid}: execution FAILED — {art.execution_error[:80]}")
                    continue

                multiplier = TRUST_MULTIPLIERS.get(art.kind, 0.4)
                earned = rubric["points"] * multiplier
                total_points += earned
                ev_list.append(f"{qid}: {art.kind.value} (trust={art.trust_score:.2f})")

                if multiplier < 1.0:
                    gaps.append(f"{rubric['gap']} (partial: {art.kind.value})")

            score = min(100, int((total_points / max(max_points, 1)) * 100)) if max_points else 0
            if score >= 95:
                level = MaturityLevel.L5
            elif score >= 80:
                level = MaturityLevel.L4
            elif score >= 55:
                level = MaturityLevel.L3
            elif score >= 30:
                level = MaturityLevel.L2
            else:
                level = MaturityLevel.L1

            dim_scores.append(DimensionScore(
                dimension=dim, level=level, score=score, evidence=ev_list, gaps=gaps,
            ))

        avg = int(sum(ds.score for ds in dim_scores) / len(dim_scores)) if dim_scores else 0
        if avg >= 95:
            overall = MaturityLevel.L5
        elif avg >= 80:
            overall = MaturityLevel.L4
        elif avg >= 55:
            overall = MaturityLevel.L3
        elif avg >= 30:
            overall = MaturityLevel.L2
        else:
            overall = MaturityLevel.L1

        recommendations: dict[str, list[str]] = {}
        for ds in dim_scores:
            if ds.gaps:
                modules = MODULE_RECOMMENDATIONS.get(ds.dimension, [])
                if modules:
                    recommendations[ds.dimension.value] = modules

        composite = CompositeScore(
            overall_level=overall, overall_score=avg,
            dimension_scores=dim_scores,
            recommended_platform_modules=recommendations,
        )
        log.info(
            "scoring.evidence_complete",
            overall_level=overall, overall_score=avg,
            evidence_count=len(evidence), dimensions_scored=len(dim_scores),
        )
        return composite
