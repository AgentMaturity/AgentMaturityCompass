"""AMC SDK type definitions."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class DimensionScore:
    """Score for a single AMC dimension."""
    name: str
    score: float
    level: str
    details: str = ""


@dataclass
class ScoreResult:
    """Result of an AMC scoring run."""
    score: float
    level: str
    agent_id: str
    dimensions: dict[str, DimensionScore] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def level_num(self) -> int:
        return int(self.level.replace("L", "")) if self.level.startswith("L") else 0

    def meets(self, target: str) -> bool:
        target_num = int(target.replace("L", "")) if target.startswith("L") else int(target)
        return self.level_num >= target_num


@dataclass
class FixResult:
    """Result of AMC auto-remediation."""
    agent_id: str
    target_level: str
    guardrails: str
    agents_md: str
    ci_gate: str
    files_written: list[str] = field(default_factory=list)


@dataclass
class Finding:
    """A single assurance finding."""
    id: str
    title: str
    severity: str
    passed: bool
    details: str
    pack: str


@dataclass
class AssuranceResult:
    """Result of an assurance/red-team run."""
    agent_id: str
    total: int
    passed: int
    failed: int
    findings: list[Finding] = field(default_factory=list)

    @property
    def pass_rate(self) -> float:
        return self.passed / self.total if self.total > 0 else 0.0


@dataclass
class Report:
    """Generated compliance report."""
    agent_id: str
    framework: str
    content: str
    raw: dict[str, Any] = field(default_factory=dict)

    def save_html(self, path: str) -> None:
        with open(path, "w") as f:
            f.write(self.content)

    def save_json(self, path: str) -> None:
        import json
        with open(path, "w") as f:
            json.dump(self.raw, f, indent=2)


@dataclass
class AMCContext:
    """Context for an active AMC session."""
    agent_id: str
    gateway_url: str = ""
    gateway_pid: int = 0
    result: ScoreResult | None = None

    def current_score(self) -> ScoreResult | None:
        from .core import _run_amc_command
        raw = _run_amc_command(["quickscore", "--json", "--agent", self.agent_id])
        if raw:
            return _parse_score_result(self.agent_id, raw)
        return None


def _parse_score_result(agent_id: str, raw: dict) -> ScoreResult:
    dimensions = {}
    for name, data in raw.get("dimensions", {}).items():
        dimensions[name] = DimensionScore(
            name=name,
            score=data.get("score", 0),
            level=data.get("level", "L0"),
            details=data.get("details", ""),
        )
    return ScoreResult(
        score=raw.get("score", 0),
        level=raw.get("level", "L0"),
        agent_id=agent_id,
        dimensions=dimensions,
        raw=raw,
    )
