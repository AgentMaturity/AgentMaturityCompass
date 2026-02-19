"""
AMC API — Shield Router
Endpoints for skill scanning, injection detection, and content sanitization.

Routes:
    POST /api/v1/shield/scan/skill
    POST /api/v1/shield/detect/injection
    POST /api/v1/shield/sanitize
    GET  /api/v1/shield/status
"""
from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from amc.core.models import Finding, RiskLevel, ScanResult

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/shield", tags=["shield"])


# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------

class SkillScanRequest(BaseModel):
    """Request to scan a skill directory."""
    path: str = Field(..., description="Path to the skill directory to scan.")


class InjectionDetectRequest(BaseModel):
    """Request to detect prompt injection in content."""
    content: str = Field(..., description="Content to scan for injection attempts.")
    source: str = Field(default="unknown", description="Content source (email, web, user, etc.).")
    context: dict[str, Any] = Field(default_factory=dict)


class SanitizeRequest(BaseModel):
    """Request to sanitize untrusted content."""
    content: str = Field(..., description="Untrusted content to sanitize.")
    source: str = Field(default="unknown", description="Content source.")


class SanitizedContent(BaseModel):
    """Result of content sanitization."""
    original_length: int
    sanitized: str
    redactions: int = 0
    risk_level: RiskLevel = RiskLevel.SAFE


class DetectorResult(BaseModel):
    """Result from injection detection."""
    risk_level: RiskLevel
    action: str
    findings: list[Finding] = Field(default_factory=list)
    content_preview: str = ""


class ShieldStatus(BaseModel):
    """Shield module status."""
    analyzer_available: bool = False
    detector_available: bool = False
    version: str = "0.1.0"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/scan/skill", response_model=ScanResult)
async def scan_skill(req: SkillScanRequest) -> ScanResult:
    """
    Scan a skill directory for dangerous patterns.
    Uses the S1 SkillAnalyzer to lint the skill before loading.
    """
    try:
        from amc.shield.s1_analyzer import SkillAnalyzer
        analyzer = SkillAnalyzer()
        result = analyzer.scan_directory(req.path)
        log.info("shield.skill_scanned", path=req.path, risk=result.risk_level)
        return result
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Skill path not found: {req.path}")
    except Exception as exc:
        log.error("shield.skill_scan_error", error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/detect/injection", response_model=DetectorResult)
async def detect_injection(req: InjectionDetectRequest) -> DetectorResult:
    """
    Detect prompt injection attacks in the given content.
    Uses the S10 InjectionDetector with hybrid regex + classifier approach.
    """
    try:
        from amc.shield.s10_detector import InjectionDetector
        detector = InjectionDetector()
        result = await detector.scan(
            content=req.content,
            source=req.source,
            context=req.context,
        )
        return DetectorResult(
            risk_level=result.risk_level,
            action=result.action,
            findings=result.findings,
            content_preview=req.content[:200],
        )
    except Exception as exc:
        log.error("shield.detect_error", error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/sanitize", response_model=SanitizedContent)
async def sanitize_content(req: SanitizeRequest) -> SanitizedContent:
    """
    Sanitize untrusted content by stripping dangerous patterns
    and applying DLP redaction.
    """
    try:
        from amc.vault.v2_dlp import DLPRedactor
        dlp = DLPRedactor()
        cleaned, receipts = dlp.redact(req.content)

        # Determine risk based on redaction count
        risk = RiskLevel.SAFE
        if len(receipts) > 5:
            risk = RiskLevel.HIGH
        elif len(receipts) > 2:
            risk = RiskLevel.MEDIUM
        elif len(receipts) > 0:
            risk = RiskLevel.LOW

        return SanitizedContent(
            original_length=len(req.content),
            sanitized=cleaned,
            redactions=len(receipts),
            risk_level=risk,
        )
    except Exception as exc:
        log.error("shield.sanitize_error", error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/status", response_model=ShieldStatus)
async def shield_status() -> ShieldStatus:
    """Return shield module availability status."""
    analyzer_ok = False
    detector_ok = False

    try:
        from amc.shield.s1_analyzer import SkillAnalyzer
        analyzer_ok = True
    except ImportError:
        pass

    try:
        from amc.shield.s10_detector import InjectionDetector
        detector_ok = True
    except ImportError:
        pass

    return ShieldStatus(
        analyzer_available=analyzer_ok,
        detector_available=detector_ok,
    )
