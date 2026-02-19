"""Failure clustering and root-cause summaries for watch findings/failures."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

from amc.core.models import Finding, RiskLevel


class FailureFinding(BaseModel):
    """Normalized finding input used for clustering."""

    module: str
    rule_id: str
    title: str
    description: str = ""
    risk_level: str = RiskLevel.MEDIUM.value
    evidence: str = ""
    file_path: str | None = None
    line_number: int | None = None
    source: str | None = None
    timestamp: str | None = None


class FailureCluster(BaseModel):
    """Summary of one failure cluster."""

    cluster_id: str
    module: str
    rule_id: str
    title: str
    count: int
    risk_level: str
    first_seen: str
    last_seen: str
    impacted_files: list[str] = Field(default_factory=list)
    sample_evidence: list[str] = Field(default_factory=list)
    root_cause: str


class FailureClusterRequest(BaseModel):
    findings: list[FailureFinding]


class FailureClusterResponse(BaseModel):
    total_findings: int
    total_clusters: int
    top_cluster_id: str | None = None
    clusters: list[FailureCluster] = Field(default_factory=list)


@dataclass(frozen=True)
class _ClusterBucket:
    module: str
    rule_id: str
    title: str
    risk_level: str
    findings: list[Finding]


def _normalize_text(value: str) -> str:
    return " ".join((value or "").strip().lower().split())


def _cluster_key(item: Finding | FailureFinding) -> tuple[str, str, str]:
    return (
        item.module,
        item.rule_id,
        _normalize_text(item.title or item.rule_id),
    )


def _extract_timestamp(item: Finding | FailureFinding) -> datetime:
    if isinstance(item, Finding):
        # Finding model has no timestamp; use now for determinism in this context.
        return datetime.now(timezone.utc)
    if item.timestamp:
        try:
            return datetime.fromisoformat(item.timestamp)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def _normalized_from_objects(findings: list[Finding | FailureFinding] | list[dict[str, Any]]) -> list[Finding | FailureFinding]:
    normalized: list[Finding | FailureFinding] = []
    for raw in findings:
        if isinstance(raw, dict):
            if "module" not in raw or "rule_id" not in raw or "title" not in raw:
                continue
            normalized.append(FailureFinding(**raw))
        else:
            normalized.append(raw)
    return normalized


def cluster_failures(
    findings: list[Finding | FailureFinding | dict[str, Any]],
    include_untagged_as_other: bool = True,
    max_examples: int = 3,
) -> list[FailureCluster]:
    """Cluster watch findings by pattern and generate root-cause style summaries."""
    items = _normalized_from_objects(findings)
    if not items:
        return []

    buckets: dict[tuple[str, str, str], list[Finding | FailureFinding]] = defaultdict(list)
    for item in items:
        key = _cluster_key(item)
        buckets[key].append(item)

    clusters: list[FailureCluster] = []
    for (module, rule_id, title_norm), grouped in buckets.items():
        first = min(_extract_timestamp(i) for i in grouped)
        last = max(_extract_timestamp(i) for i in grouped)

        # Use the first item's title for display; normalize again to keep stable.
        title = grouped[0].title
        risk_levels = [
            _to_risk(i.risk_level.value if hasattr(i.risk_level, "value") else str(i.risk_level))
            for i in grouped
        ]

        # Highest risk bucket drives cluster risk.
        severity_rank = {
            RiskLevel.SAFE.value: 0,
            RiskLevel.LOW.value: 1,
            RiskLevel.MEDIUM.value: 2,
            RiskLevel.HIGH.value: 3,
            RiskLevel.CRITICAL.value: 4,
        }
        risk = sorted(risk_levels, key=lambda r: severity_rank.get(r, 0))[-1]

        files = sorted({
            f.file_path
            for f in grouped
            if isinstance(f, Finding) and f.file_path
        })
        evidence = [
            f.evidence if isinstance(f, Finding) else f.evidence
            for f in grouped
            if (f.evidence if isinstance(f, Finding) else f.evidence)
        ]

        cluster_id = f"{module}::{rule_id}::{title_norm[:18] if title_norm else 'no-title'}"
        root = _build_root_cause(
            module=module,
            rule_id=rule_id,
            title=title,
            risk=risk,
            count=len(grouped),
            files=[
                x for x in [grouped[0].file_path if isinstance(grouped[0], Finding) else grouped[0].file_path] if x
            ],
        )

        if include_untagged_as_other and not grouped[0].module:
            root += " (untagged/other findings mixed)"

        clusters.append(
            FailureCluster(
                cluster_id=cluster_id,
                module=module,
                rule_id=rule_id,
                title=title,
                count=len(grouped),
                risk_level=risk,
                first_seen=first.isoformat(),
                last_seen=last.isoformat(),
                impacted_files=files,
                sample_evidence=evidence[:max_examples],
                root_cause=root,
            )
        )

    clusters.sort(key=lambda c: (c.count, c.risk_level, c.rule_id), reverse=True)
    return clusters


def _to_risk(value: str) -> str:
    try:
        return RiskLevel(value).value
    except Exception:
        return str(value) if str(value) else RiskLevel.MEDIUM.value


def _build_root_cause(
    module: str,
    rule_id: str,
    title: str,
    risk: str,
    count: int,
    files: list[str],
) -> str:
    if count == 1:
        base = f"Single failure in {module} (rule {rule_id}) suggests a localised {risk} issue."
    else:
        base = (
            f"Recurring {risk} failure pattern in {module} ({rule_id}) across {count} events "
            f"with title '{title}'."
        )

    if files:
        return base + f" Impacted files: {', '.join(files)}."
    return base + " Investigate upstream input/assumption changes before control-flow diverges."


def summarize_failure_clusters(
    findings: list[Finding | FailureFinding | dict[str, Any]],
    max_examples: int = 3,
) -> FailureClusterResponse:
    clusters = cluster_failures(findings, include_untagged_as_other=False, max_examples=max_examples)
    top = clusters[0].cluster_id if clusters else None
    return FailureClusterResponse(
        total_findings=len(findings),
        total_clusters=len(clusters),
        top_cluster_id=top,
        clusters=clusters,
    )


__all__ = [
    "FailureFinding",
    "FailureCluster",
    "FailureClusterRequest",
    "FailureClusterResponse",
    "cluster_failures",
    "summarize_failure_clusters",
]
    