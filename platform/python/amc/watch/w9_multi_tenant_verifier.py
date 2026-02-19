"""W9 Multi-Tenant Boundary Verifier

Validates that actions are not crossing tenant boundaries and can detect attempted
cross-tenant reads or writes.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import structlog

from amc.core.models import ScanResult, RiskLevel

log = structlog.get_logger(__name__)


@dataclass
class TenantResource:
    """Record linking a resource ID to an owning tenant."""

    tenant_id: str
    resource_id: str
    resource_type: str


class CrossTenantViolation(Exception):
    """Raised for attempted boundary crossing with no approval."""


class TenantBoundaryState:
    """Keep in-memory ownership map for quick isolation checks."""

    def __init__(self) -> None:
        self._resources: dict[str, TenantResource] = {}

    def set_owner(self, resource_id: str, tenant_id: str, resource_type: str = "generic") -> None:
        self._resources[resource_id] = TenantResource(
            tenant_id=tenant_id, resource_id=resource_id, resource_type=resource_type
        )

    def get_owner(self, resource_id: str) -> str | None:
        item = self._resources.get(resource_id)
        return item.tenant_id if item else None


@dataclass
class BoundaryCheckResult:
    allowed: bool
    reason: str
    risk: RiskLevel


class MultiTenantBoundaryVerifier:
    """Verify isolation and boundary constraints for multi-tenant agents."""

    def __init__(self, state: TenantBoundaryState | None = None) -> None:
        self.state = state or TenantBoundaryState()

    def check_access(
        self,
        requesting_tenant: str,
        resource_id: str,
        *,
        action: str = "read",
        approved: bool = False,
    ) -> BoundaryCheckResult:
        owner = self.state.get_owner(resource_id)
        if owner is None:
            return BoundaryCheckResult(False, "Unknown resource", RiskLevel.MEDIUM)

        if owner == requesting_tenant:
            return BoundaryCheckResult(True, "Access within tenant boundary", RiskLevel.SAFE)

        if approved:
            log.warning(
                "tenant_boundary.cross_tenant_approved",
                requesting_tenant=requesting_tenant,
                resource_id=resource_id,
                owner=owner,
                action=action,
            )
            return BoundaryCheckResult(
                True,
                f"Cross-tenant access approved ({action})",
                RiskLevel.HIGH,
            )

        return BoundaryCheckResult(
            False,
            f"Cross-tenant {action} denied without tenant policy approval",
            RiskLevel.CRITICAL,
        )

    def enforce(self, request: dict[str, Any]) -> None:
        """Raise if request violates boundary."""
        result = self.check_access(
            requesting_tenant=request.get("tenant_id", ""),
            resource_id=request.get("resource_id", ""),
            action=request.get("action", "read"),
            approved=request.get("approved", False),
        )
        if not result.allowed:
            raise CrossTenantViolation(result.reason)

    def run_scan(
        self,
        requests: list[dict[str, Any]],
    ) -> ScanResult:
        """Run multiple tenant boundary checks and return aggregate risk."""
        failures = 0
        findings = []

        for req in requests:
            tenant = req.get("tenant_id", "")
            resource = req.get("resource_id", "")
            action = req.get("action", "read")
            approved = bool(req.get("approved", False))
            result = self.check_access(tenant, resource, action=action, approved=approved)
            if not result.allowed:
                failures += 1
                findings.append(
                    {
                        "resource_id": resource,
                        "tenant": tenant,
                        "risk": result.risk,
                        "reason": result.reason,
                    }
                )

        # aggregate risk score roughly based on failure count
        risk_score = min(100, failures * 25)
        risk_level = RiskLevel.SAFE
        if failures >= 3:
            risk_level = RiskLevel.HIGH
        elif failures == 2:
            risk_level = RiskLevel.MEDIUM
        elif failures == 1:
            risk_level = RiskLevel.LOW

        return ScanResult(
            module="watch.w9_multi_tenant_verifier",
            target="tenant-boundary",
            risk_score=risk_score,
            risk_level=risk_level,
            findings=[],
            passed=failures == 0,
            metadata={
                "total_requests": len(requests),
                "denied": failures,
                "checked_at": datetime.now(timezone.utc).isoformat(),
            },
        )
