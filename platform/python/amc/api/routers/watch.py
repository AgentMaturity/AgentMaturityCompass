"""
AMC API — Watch Router
Endpoints for receipts querying, chain verification, and assurance suite.

Routes:
    GET  /api/v1/watch/receipts
    GET  /api/v1/watch/receipts/stats
    POST /api/v1/watch/receipts/verify
    GET  /api/v1/watch/assurance/status
    POST /api/v1/watch/assurance/audit
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import structlog
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from amc.core.models import ActionReceipt, PolicyDecision, RiskLevel

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/watch", tags=["watch"])


# ---------------------------------------------------------------------------
# Response Models
# ---------------------------------------------------------------------------

class ReceiptsResponse(BaseModel):
    """Paginated receipts query response."""
    receipts: list[ActionReceipt] = Field(default_factory=list)
    count: int = 0


class ReceiptsStats(BaseModel):
    """Summary statistics for the receipts ledger."""
    total_receipts: int = 0
    last_hash: str = ""
    last_updated: str | None = None
    by_decision: dict[str, int] = Field(default_factory=dict)
    top_tools: dict[str, int] = Field(default_factory=dict)


class ChainVerifyResult(BaseModel):
    """Result of chain integrity verification."""
    ok: bool
    message: str


class AssuranceStatus(BaseModel):
    """Current assurance suite status."""
    drift_findings: int = 0
    owasp_pass: bool | None = None
    owasp_score: str | None = None
    last_audit_risk: str | None = None
    last_audit_findings: int | None = None
    audit_scheduled_interval: int | None = None


class AuditTriggerResponse(BaseModel):
    """Response from triggering a full audit."""
    audit_id: str
    overall_risk: RiskLevel
    findings_count: int
    duration_ms: int
    areas_checked: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Routes: Receipts
# ---------------------------------------------------------------------------

@router.get("/receipts", response_model=ReceiptsResponse)
async def query_receipts(
    session_id: str | None = Query(None, description="Filter by session ID"),
    tool: str | None = Query(None, description="Filter by tool name"),
    decision: str | None = Query(None, description="Filter by policy decision"),
    since: str | None = Query(None, description="ISO datetime — return receipts after this time"),
    limit: int = Query(100, ge=1, le=1000),
) -> ReceiptsResponse:
    """Query receipts with optional filters."""
    from amc.watch.w1_receipts import get_ledger

    ledger = await get_ledger()
    pd = PolicyDecision(decision) if decision else None
    since_dt = datetime.fromisoformat(since) if since else None

    receipts = await ledger.query(
        session_id=session_id,
        tool_name=tool,
        decision=pd,
        since=since_dt,
        limit=limit,
    )
    return ReceiptsResponse(receipts=receipts, count=len(receipts))


@router.get("/receipts/stats", response_model=ReceiptsStats)
async def receipts_stats() -> ReceiptsStats:
    """Return summary statistics for the receipts ledger."""
    from amc.watch.w1_receipts import get_ledger

    ledger = await get_ledger()
    stats = await ledger.stats()
    return ReceiptsStats(**stats)


@router.post("/receipts/verify", response_model=ChainVerifyResult)
async def verify_chain() -> ChainVerifyResult:
    """Verify the integrity of the entire receipt hash chain."""
    from amc.watch.w1_receipts import get_ledger

    ledger = await get_ledger()
    ok, message = await ledger.verify_chain()

    log.info("watch.chain_verified", ok=ok, message=message)
    return ChainVerifyResult(ok=ok, message=message)


# ---------------------------------------------------------------------------
# Routes: Assurance
# ---------------------------------------------------------------------------

# Module-level singleton for assurance suite state
_assurance_suite = None


def _get_suite() -> Any:
    """Lazy-init the assurance suite singleton."""
    global _assurance_suite
    if _assurance_suite is None:
        from amc.watch.w2_assurance import AssuranceSuite
        _assurance_suite = AssuranceSuite()
    return _assurance_suite


@router.get("/assurance/status", response_model=AssuranceStatus)
async def assurance_status() -> AssuranceStatus:
    """Return current assurance suite status summary."""
    suite = _get_suite()
    s = suite.status()
    return AssuranceStatus(**s)


@router.post("/assurance/audit", response_model=AuditTriggerResponse)
async def trigger_audit() -> AuditTriggerResponse:
    """Trigger a full security audit and return results."""
    suite = _get_suite()
    report = await suite.run_full_audit()

    log.info(
        "watch.audit_triggered",
        audit_id=report.audit_id,
        findings=len(report.findings),
        risk=report.overall_risk,
    )
    return AuditTriggerResponse(
        audit_id=report.audit_id,
        overall_risk=report.overall_risk,
        findings_count=len(report.findings),
        duration_ms=report.duration_ms,
        areas_checked=report.areas_checked,
    )
