from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

import structlog
from pydantic import BaseModel

from amc.vault.v2_dlp import DLPRedactor

log = structlog.get_logger(__name__)


class DataClass(str, Enum):
    PII = "pii"
    FINANCIAL = "financial"
    HEALTH = "health"
    GENERAL = "general"
    PUBLIC = "public"


@dataclass
class RegionPolicy:
    allowed_regions: list[str]
    forbidden_regions: list[str]
    anonymize_before_transfer: bool


class ModelEndpoint(BaseModel):
    provider: str
    endpoint_url: str
    region: str
    data_classes_allowed: list[DataClass]
    policy: RegionPolicy | None = None


class RoutingDecision(BaseModel):
    allowed: bool
    reason: str
    requires_anonymization: bool = False
    alternative_endpoint: ModelEndpoint | None = None


class AnonymizationPipeline:
    def __init__(self, redactor: DLPRedactor | None = None) -> None:
        self._redactor = redactor or DLPRedactor()

    def anonymize(self, text: str, data_class: DataClass) -> str:
        if data_class in {DataClass.PUBLIC, DataClass.GENERAL}:
            return text
        clean, _ = self._redactor.redact(text)
        return clean


class DataResidencyGate:
    def __init__(self, db_path: str = "data_residency.db") -> None:
        self._db_path = Path(db_path)
        self._init_db()
        self.anonymizer = AnonymizationPipeline()
        self._endpoints: dict[str, ModelEndpoint] = {}
        self._load_builtin_endpoints()
        log.info("data_residency.init", endpoint_count=len(self._endpoints))

    def _init_db(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS residency_audit (
                    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id TEXT,
                    data_class TEXT NOT NULL,
                    target TEXT NOT NULL,
                    subject_region TEXT NOT NULL,
                    allowed INTEGER NOT NULL,
                    requires_anonymization INTEGER NOT NULL,
                    alternative_endpoint TEXT,
                    reason TEXT NOT NULL,
                    decision_at TEXT NOT NULL
                )
                """
            )

    def _load_builtin_endpoints(self) -> None:
        self._endpoints.update(
            {
                "openai-eu": ModelEndpoint(
                    provider="openai",
                    endpoint_url="https://api.openai.eu/v1/chat/completions",
                    region="EU",
                    data_classes_allowed=[DataClass.PII, DataClass.GENERAL, DataClass.PUBLIC, DataClass.HEALTH, DataClass.FINANCIAL],
                    policy=RegionPolicy(
                        allowed_regions=["EU", "IN"],
                        forbidden_regions=["US"],
                        anonymize_before_transfer=True,
                    ),
                ),
                "anthropic-eu": ModelEndpoint(
                    provider="anthropic",
                    endpoint_url="https://api.anthropic.eu/v1/messages",
                    region="EU",
                    data_classes_allowed=[DataClass.PII, DataClass.GENERAL, DataClass.PUBLIC],
                    policy=RegionPolicy(
                        allowed_regions=["EU", "IN"],
                        forbidden_regions=["US"],
                        anonymize_before_transfer=True,
                    ),
                ),
                "india-safe": ModelEndpoint(
                    provider="cloud",
                    endpoint_url="https://api.india-region.example/v1/infer",
                    region="IN",
                    data_classes_allowed=[DataClass.PII, DataClass.GENERAL, DataClass.PUBLIC, DataClass.FINANCIAL],
                    policy=RegionPolicy(
                        allowed_regions=["IN"],
                        forbidden_regions=["US", "EU"],
                        anonymize_before_transfer=True,
                    ),
                ),
                "openai-us": ModelEndpoint(
                    provider="openai",
                    endpoint_url="https://api.openai.com/v1/chat/completions",
                    region="US",
                    data_classes_allowed=[
                        DataClass.PII,
                        DataClass.GENERAL,
                        DataClass.PUBLIC,
                        DataClass.FINANCIAL,
                        DataClass.HEALTH,
                    ],
                    policy=RegionPolicy(
                        allowed_regions=["US"],
                        forbidden_regions=[],
                        anonymize_before_transfer=True,
                    ),
                ),
            }
        )

    @property
    def endpoints(self) -> dict[str, ModelEndpoint]:
        return dict(self._endpoints)

    def register_endpoint(self, endpoint: ModelEndpoint) -> None:
        self._endpoints[endpoint.endpoint_url] = endpoint

    def _requires_eu_residency(self, data_class: DataClass) -> bool:
        return data_class in {DataClass.PII, DataClass.FINANCIAL, DataClass.HEALTH}

    def check_routing(
        self,
        data_class: DataClass,
        target_endpoint: ModelEndpoint,
        data_subject_region: str,
    ) -> RoutingDecision:
        data_subject_region = data_subject_region.upper()
        target_region = target_endpoint.region.upper()

        if data_class not in target_endpoint.data_classes_allowed:
            return RoutingDecision(
                allowed=False,
                reason=(
                    f"Endpoint policy does not allow data class {data_class.value} "
                    f"(allowed={[c.value for c in target_endpoint.data_classes_allowed]})."
                ),
                requires_anonymization=False,
                alternative_endpoint=None,
            )

        policy = target_endpoint.policy or RegionPolicy(
            allowed_regions=[target_region],
            forbidden_regions=[],
            anonymize_before_transfer=False,
        )

        # Cross-border rule for sensitive classes.
        if self._requires_eu_residency(data_class) and data_subject_region == "EU" and target_region == "US":
            alt = self._find_alternative(target_endpoint, data_subject_region, allow_anonymized=True)
            if alt and policy.anonymize_before_transfer:
                return RoutingDecision(
                    allowed=False,
                    reason="EU-sensitive data requires residency; anonymize before transfer.",
                    requires_anonymization=True,
                    alternative_endpoint=alt,
                )
            return RoutingDecision(
                allowed=False,
                reason="EU-sensitive data blocked from US endpoint",
                requires_anonymization=False,
                alternative_endpoint=None,
            )

        if data_subject_region in {r.upper() for r in policy.forbidden_regions}:
            return RoutingDecision(
                allowed=False,
                reason=f"data_subject_region {data_subject_region} forbidden by endpoint policy",
                requires_anonymization=False,
                alternative_endpoint=None,
            )

        return RoutingDecision(
            allowed=True,
            reason="routing_allowed",
            requires_anonymization=False,
            alternative_endpoint=None,
        )

    def _find_alternative(
        self,
        current: ModelEndpoint,
        subject_region: str,
        allow_anonymized: bool,
    ) -> ModelEndpoint | None:
        for ep in self._endpoints.values():
            if ep.endpoint_url == current.endpoint_url:
                continue
            if ep.region.upper() == current.region.upper():
                continue
            if ep.region.upper() == "US":
                continue
            if ep.region.upper() == subject_region.upper():
                return ep

        if allow_anonymized:
            for ep in self._endpoints.values():
                if ep.region.upper() != "US":
                    return ep
        return None

    def audit_log(self, decision: RoutingDecision) -> None:
        request_id = f"route-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                """INSERT INTO residency_audit(
                    request_id, data_class, target, subject_region, allowed,
                    requires_anonymization, alternative_endpoint, reason, decision_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    request_id,
                    "unknown",
                    "unknown",
                    "unknown",
                    int(decision.allowed),
                    int(decision.requires_anonymization),
                    decision.alternative_endpoint.endpoint_url if decision.alternative_endpoint else None,
                    decision.reason,
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
        log.info(
            "data_residency.audit",
            allowed=decision.allowed,
            requires_anonymization=decision.requires_anonymization,
            reason=decision.reason,
        )

    def anonymize_text(self, text: str, data_class: DataClass) -> str:
        return self.anonymizer.anonymize(text, data_class)


__all__ = [
    "DataResidencyGate",
    "DataClass",
    "RegionPolicy",
    "ModelEndpoint",
    "RoutingDecision",
    "AnonymizationPipeline",
]
