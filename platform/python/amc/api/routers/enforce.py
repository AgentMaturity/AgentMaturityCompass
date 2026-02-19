"""
AMC API — Enforce Router
Policy/firewall inspection endpoints.
"""
from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from amc.core.models import PolicyDecision, ToolCategory, SessionTrust

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/enforce", tags=["enforce"])


class PolicyStatusResponse(BaseModel):
    """Policy engine availability and settings summary."""
    firewall_loaded: bool
    preset: str = "enterprise-secure"
    tool_scope_count: int = 0
    notes: list[str] = Field(default_factory=list)


@router.get("/status", response_model=PolicyStatusResponse)
async def policy_status() -> PolicyStatusResponse:
    """Return policy enforcement module status."""
    try:
        from amc.enforce.e1_policy import ToolPolicyFirewall
        # Lightweight runtime check without instantiating a request
        fw = ToolPolicyFirewall.from_preset("enterprise-secure")
        return PolicyStatusResponse(
            firewall_loaded=True,
            preset="enterprise-secure",
            tool_scope_count=len(fw.rules) if hasattr(fw, "rules") else 0,
            notes=["policy service initialized"],
        )
    except Exception as exc:
        log.warning("enforce.status.failed", error=str(exc))
        return PolicyStatusResponse(firewall_loaded=False, notes=[str(exc)])


class EvaluatePolicyRequest(BaseModel):
    """Request to evaluate a tool call against policy."""
    session_id: str
    sender_id: str
    trust_level: str = SessionTrust.UNTRUSTED.value
    tool_name: str = "read"
    tool_category: str = ToolCategory.READ_ONLY.value
    workspace: str = ""
    parameters: dict[str, Any] = Field(default_factory=dict)


class EvaluatePolicyResponse(BaseModel):
    """Policy evaluation decision result."""
    session_id: str
    tool_name: str
    decision: str
    allowed: bool = False
    reasons: list[str] = Field(default_factory=list)


@router.post("/evaluate", response_model=EvaluatePolicyResponse)
async def evaluate_policy(req: EvaluatePolicyRequest) -> EvaluatePolicyResponse:
    """Evaluate a proposed tool action against policy firewall."""
    try:
        from amc.enforce.e1_policy import ToolPolicyFirewall, PolicyRequest

        firewall = ToolPolicyFirewall.from_preset("enterprise-secure")
        trust = SessionTrust(req.trust_level)
        category = ToolCategory(req.tool_category)

        policy_request = PolicyRequest(
            session_id=req.session_id,
            sender_id=req.sender_id,
            trust_level=trust,
            tool_name=req.tool_name,
            tool_category=category,
            parameters=req.parameters,
            context={"workspace": req.workspace},
        )
        result = firewall.evaluate(policy_request)

        return EvaluatePolicyResponse(
            session_id=req.session_id,
            tool_name=req.tool_name,
            decision=result.decision.value,
            allowed=(result.decision.value == "allow"),
            reasons=result.reasons,
        )
    except Exception as exc:
        log.error("enforce.evaluate_failed", error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))
