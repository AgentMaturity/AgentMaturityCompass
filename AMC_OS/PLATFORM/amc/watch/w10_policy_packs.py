"""W10 Policy Packs Marketplace

Defines versioned policy packs that can be exchanged and loaded with basic
integrity checks.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

from amc.core.models import Finding, RiskLevel, ScanResult


class PolicyPack(BaseModel):
    """Versioned set of policy modules and enforcement defaults."""

    pack_id: str = Field(default_factory=lambda: f"pack-{uuid.uuid4().hex[:12]}")
    name: str
    version: str = "1.0"
    description: str = ""
    modules: list[str] = Field(default_factory=list)
    rules: list[dict[str, Any]] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    digest: str = ""

    def with_digest(self) -> "PolicyPack":
        payload = self.model_dump(exclude={"digest"})
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        self.digest = hashlib.sha256(raw.encode()).hexdigest()
        return self

    def verify_digest(self) -> bool:
        payload = self.model_dump(exclude={"digest"})
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(raw.encode()).hexdigest() == self.digest


class PackInstallError(Exception):
    """Raised when a policy pack is invalid or incompatible."""


class PolicyPackRegistry:
    """Store and activate versioned policy packs."""

    def __init__(self) -> None:
        self._packs: dict[str, PolicyPack] = {}
        self._active_pack_id: str | None = None

    def install(self, pack: PolicyPack) -> str:
        if not pack.verify_digest():
            raise PackInstallError("Policy pack digest mismatch")
        if not pack.modules:
            raise PackInstallError("Policy pack must include at least one module")
        if not pack.rules:
            raise PackInstallError("Policy pack must include at least one rule")

        pack_id = pack.pack_id
        self._packs[pack_id] = pack
        return pack_id

    def activate(self, pack_id: str) -> None:
        if pack_id not in self._packs:
            raise PackInstallError(f"Unknown pack_id: {pack_id}")
        self._active_pack_id = pack_id

    def active(self) -> PolicyPack | None:
        if self._active_pack_id is None:
            return None
        return self._packs.get(self._active_pack_id)

    def list(self) -> list[PolicyPack]:
        return list(self._packs.values())

    def list_ids(self) -> list[str]:
        return list(self._packs.keys())

    def remove(self, pack_id: str) -> bool:
        if pack_id == self._active_pack_id:
            self._active_pack_id = None
        return self._packs.pop(pack_id, None) is not None

    def run_marketplace_scan(self) -> ScanResult:
        """Validate all packs for integrity and basic quality."""
        failed = 0
        findings: list[Finding] = []

        for pack in self._packs.values():
            if not pack.verify_digest():
                failed += 1
                findings.append(
                    Finding(
                        id="",
                        module="watch.w10_policy_packs",
                        rule_id="PACK-DIGEST",
                        title="Invalid policy pack digest",
                        description=f"Pack {pack.pack_id} digest verification failed.",
                        risk_level=RiskLevel.HIGH,
                        evidence=f"pack={pack.pack_id}, version={pack.version}",
                        remediation="Reinstall from trusted source.",
                    )
                )

        score = min(100, failed * 35)
        risk_level = RiskLevel.SAFE
        if failed >= 3:
            risk_level = RiskLevel.HIGH
        elif failed > 0:
            risk_level = RiskLevel.MEDIUM

        return ScanResult(
            module="watch.w10_policy_packs",
            target="policy-packs",
            risk_score=score,
            risk_level=risk_level,
            findings=findings,
            passed=failed == 0,
            metadata={
                "pack_count": len(self._packs),
                "active_pack_id": self._active_pack_id,
                "failed": failed,
            },
        )
