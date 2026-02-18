"""Step-by-Step Plan Generator — structured execution plans from goals.

Converts a natural-language goal into an ordered, human-readable plan with
steps, estimated tool calls, decision points, dependencies, and risk flags.
Pure Python — no SQLite required (plans are returned inline).

API: POST /api/v1/product/plan/generate
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import structlog

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class StepType(str, Enum):
    ACTION = "action"
    DECISION = "decision"
    VALIDATION = "validation"
    TOOL_CALL = "tool_call"
    HUMAN_REVIEW = "human_review"
    NOTIFICATION = "notification"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class PlanComplexity(str, Enum):
    SIMPLE = "simple"      # 1–3 steps
    MODERATE = "moderate"  # 4–7 steps
    COMPLEX = "complex"    # 8+ steps


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class PlanStep:
    """A single step in an execution plan."""

    step_number: int
    title: str
    description: str
    step_type: StepType
    estimated_tool_calls: list[str]
    depends_on: list[int]         # Step numbers this step depends on
    risk_level: RiskLevel
    risk_notes: str
    acceptance_criteria: str
    estimated_duration_min: int

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "step_number": self.step_number,
            "title": self.title,
            "description": self.description,
            "step_type": self.step_type.value,
            "estimated_tool_calls": self.estimated_tool_calls,
            "depends_on": self.depends_on,
            "risk_level": self.risk_level.value,
            "risk_notes": self.risk_notes,
            "acceptance_criteria": self.acceptance_criteria,
            "estimated_duration_min": self.estimated_duration_min,
        }


@dataclass
class ExecutionPlan:
    """A structured execution plan derived from a goal."""

    goal: str
    context: str
    steps: list[PlanStep]
    complexity: PlanComplexity
    total_estimated_duration_min: int
    parallel_candidates: list[list[int]]   # Groups of step numbers that can run in parallel
    critical_path: list[int]               # Ordered step numbers on the critical path
    open_questions: list[str]
    assumptions: list[str]
    metadata: dict[str, Any]

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "goal": self.goal,
            "context": self.context,
            "steps": [s.dict for s in self.steps],
            "complexity": self.complexity.value,
            "total_estimated_duration_min": self.total_estimated_duration_min,
            "parallel_candidates": self.parallel_candidates,
            "critical_path": self.critical_path,
            "open_questions": self.open_questions,
            "assumptions": self.assumptions,
            "metadata": self.metadata,
        }


@dataclass
class PlanRequest:
    """Input for the plan generator."""

    goal: str
    context: str = ""
    available_tools: list[str] = field(default_factory=list)
    constraints: list[str] = field(default_factory=list)
    max_steps: int = 10
    include_human_review_steps: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Heuristic keyword → step templates
# ---------------------------------------------------------------------------

# Patterns matched against the goal to produce relevant steps
_GOAL_PATTERNS: list[tuple[re.Pattern, list[dict[str, Any]]]] = [
    (
        re.compile(r"\b(fetch|retrieve|get|collect|pull)\b", re.I),
        [
            {"title": "Identify data sources", "type": StepType.ACTION, "tools": ["search", "list"], "dur": 5},
            {"title": "Fetch target data", "type": StepType.TOOL_CALL, "tools": ["fetch", "query"], "dur": 10},
            {"title": "Validate retrieved data", "type": StepType.VALIDATION, "tools": ["validate"], "dur": 5},
        ],
    ),
    (
        re.compile(r"\b(send|email|notify|message|alert)\b", re.I),
        [
            {"title": "Draft message content", "type": StepType.ACTION, "tools": [], "dur": 5},
            {"title": "Review draft for accuracy", "type": StepType.HUMAN_REVIEW, "tools": [], "dur": 5},
            {"title": "Send notification", "type": StepType.TOOL_CALL, "tools": ["send_email", "notify"], "dur": 3},
        ],
    ),
    (
        re.compile(r"\b(analyze|analyse|report|summarize|summarise)\b", re.I),
        [
            {"title": "Gather input data", "type": StepType.TOOL_CALL, "tools": ["fetch", "query"], "dur": 10},
            {"title": "Run analysis", "type": StepType.ACTION, "tools": ["analyze"], "dur": 15},
            {"title": "Generate summary", "type": StepType.ACTION, "tools": [], "dur": 10},
            {"title": "Review and validate findings", "type": StepType.VALIDATION, "tools": [], "dur": 5},
        ],
    ),
    (
        re.compile(r"\b(create|build|generate|produce|write)\b", re.I),
        [
            {"title": "Define requirements and acceptance criteria", "type": StepType.ACTION, "tools": [], "dur": 5},
            {"title": "Create initial draft/output", "type": StepType.ACTION, "tools": [], "dur": 15},
            {"title": "Review for quality and completeness", "type": StepType.VALIDATION, "tools": [], "dur": 5},
            {"title": "Finalize and deliver", "type": StepType.ACTION, "tools": [], "dur": 5},
        ],
    ),
    (
        re.compile(r"\b(update|modify|change|edit|patch)\b", re.I),
        [
            {"title": "Retrieve current state", "type": StepType.TOOL_CALL, "tools": ["get", "fetch"], "dur": 5},
            {"title": "Validate change intent", "type": StepType.DECISION, "tools": [], "dur": 3},
            {"title": "Apply changes", "type": StepType.ACTION, "tools": ["update", "patch"], "dur": 10},
            {"title": "Confirm changes applied correctly", "type": StepType.VALIDATION, "tools": [], "dur": 5},
        ],
    ),
    (
        re.compile(r"\b(monitor|watch|track|observe)\b", re.I),
        [
            {"title": "Set monitoring parameters", "type": StepType.ACTION, "tools": [], "dur": 5},
            {"title": "Start monitoring loop", "type": StepType.TOOL_CALL, "tools": ["watch", "monitor"], "dur": 10},
            {"title": "Evaluate signals and trigger alerts", "type": StepType.DECISION, "tools": [], "dur": 5},
        ],
    ),
]

_DEFAULT_STEPS: list[dict[str, Any]] = [
    {"title": "Clarify goal and constraints", "type": StepType.ACTION, "tools": [], "dur": 5},
    {"title": "Research and gather context", "type": StepType.TOOL_CALL, "tools": ["search", "fetch"], "dur": 10},
    {"title": "Execute primary task", "type": StepType.ACTION, "tools": [], "dur": 15},
    {"title": "Validate outcome", "type": StepType.VALIDATION, "tools": [], "dur": 5},
]

_RISK_KEYWORDS: dict[str, RiskLevel] = {
    "delete": RiskLevel.HIGH,
    "remove": RiskLevel.HIGH,
    "payment": RiskLevel.HIGH,
    "money": RiskLevel.HIGH,
    "billing": RiskLevel.HIGH,
    "deploy": RiskLevel.MEDIUM,
    "publish": RiskLevel.MEDIUM,
    "send": RiskLevel.MEDIUM,
    "write": RiskLevel.LOW,
    "read": RiskLevel.LOW,
    "fetch": RiskLevel.LOW,
    "analyze": RiskLevel.LOW,
}


def _detect_risk(goal: str) -> RiskLevel:
    gl = goal.lower()
    for kw, level in _RISK_KEYWORDS.items():
        if kw in gl:
            return level
    return RiskLevel.LOW


def _detect_tools(title: str, available_tools: list[str]) -> list[str]:
    """Match available tools against step title keywords."""
    if not available_tools:
        return []
    matched = []
    for tool in available_tools:
        if any(word in title.lower() for word in tool.lower().split("_")):
            matched.append(tool)
    return matched[:3]


def _infer_open_questions(goal: str, constraints: list[str]) -> list[str]:
    questions = []
    if "?" not in goal:
        questions.append("What is the acceptable output format?")
    if not constraints:
        questions.append("Are there time or resource constraints?")
    if re.search(r"\b(all|every|each)\b", goal, re.I):
        questions.append("What is the scope / boundary condition for 'all'?")
    return questions


def _extract_assumptions(goal: str) -> list[str]:
    assumptions = ["Required data sources are accessible."]
    if re.search(r"\b(auto|automatically)\b", goal, re.I):
        assumptions.append("No human intervention required during execution.")
    if re.search(r"\b(latest|current|recent)\b", goal, re.I):
        assumptions.append("Data freshness is sufficient for this task.")
    return assumptions


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class PlanGenerator:
    """Generate structured execution plans from natural-language goals."""

    def generate(self, request: PlanRequest) -> ExecutionPlan:
        goal = request.goal.strip()
        risk = _detect_risk(goal)

        # Match keyword patterns
        raw_steps: list[dict[str, Any]] = []
        for pattern, templates in _GOAL_PATTERNS:
            if pattern.search(goal):
                raw_steps.extend(templates)
                break

        if not raw_steps:
            raw_steps = _DEFAULT_STEPS.copy()

        # Add human review step if requested and risk is medium+
        if request.include_human_review_steps and risk != RiskLevel.LOW:
            review_step: dict[str, Any] = {
                "title": "Human review checkpoint",
                "type": StepType.HUMAN_REVIEW,
                "tools": [],
                "dur": 10,
            }
            # Insert before last step
            raw_steps.insert(-1, review_step)

        # Enforce max_steps
        raw_steps = raw_steps[: request.max_steps]

        # Build PlanStep objects
        steps: list[PlanStep] = []
        for i, s in enumerate(raw_steps):
            step_num = i + 1
            step_tools = list(s.get("tools", []))
            # Supplement with available tools if matched
            step_tools += _detect_tools(s["title"], request.available_tools)
            step_tools = list(dict.fromkeys(step_tools))  # dedup

            steps.append(
                PlanStep(
                    step_number=step_num,
                    title=s["title"],
                    description=f"Perform: {s['title'].lower()}. " + (
                        f"Uses tools: {', '.join(step_tools)}." if step_tools else ""
                    ),
                    step_type=s["type"],
                    estimated_tool_calls=step_tools,
                    depends_on=[step_num - 1] if step_num > 1 else [],
                    risk_level=risk if s["type"] in (StepType.TOOL_CALL, StepType.ACTION) else RiskLevel.LOW,
                    risk_notes=(
                        f"This step involves {risk.value}-risk operations." if s["type"] == StepType.ACTION else ""
                    ),
                    acceptance_criteria=f"{s['title']} completes without errors.",
                    estimated_duration_min=s.get("dur", 10),
                )
            )

        # Complexity classification
        n = len(steps)
        if n <= 3:
            complexity = PlanComplexity.SIMPLE
        elif n <= 7:
            complexity = PlanComplexity.MODERATE
        else:
            complexity = PlanComplexity.COMPLEX

        total_dur = sum(s.estimated_duration_min for s in steps)

        # Parallel candidates: validation steps can often run with prior action step
        parallel_candidates: list[list[int]] = []
        for s in steps:
            if s.step_type == StepType.VALIDATION and s.step_number > 1:
                prior = s.step_number - 1
                if steps[prior - 1].step_type == StepType.ACTION:
                    parallel_candidates.append([prior, s.step_number])

        # Critical path: all steps (simple linear chain)
        critical_path = [s.step_number for s in steps]

        log.info(
            "plan_generated",
            goal=goal[:80],
            steps=n,
            complexity=complexity.value,
            risk=risk.value,
        )

        return ExecutionPlan(
            goal=goal,
            context=request.context,
            steps=steps,
            complexity=complexity,
            total_estimated_duration_min=total_dur,
            parallel_candidates=parallel_candidates,
            critical_path=critical_path,
            open_questions=_infer_open_questions(goal, request.constraints),
            assumptions=_extract_assumptions(goal),
            metadata=request.metadata,
        )


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_generator: PlanGenerator | None = None


def get_plan_generator() -> PlanGenerator:
    global _generator
    if _generator is None:
        _generator = PlanGenerator()
    return _generator


__all__ = [
    "StepType",
    "RiskLevel",
    "PlanComplexity",
    "PlanStep",
    "ExecutionPlan",
    "PlanRequest",
    "PlanGenerator",
    "get_plan_generator",
]
