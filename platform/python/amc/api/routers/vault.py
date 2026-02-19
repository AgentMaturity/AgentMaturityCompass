"""
AMC API — Vault Router
Secret handling endpoints.
"""
from __future__ import annotations

import structlog
from fastapi import APIRouter
from pydantic import BaseModel, Field

from amc.vault.v2_dlp import DLPRedactor

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/vault", tags=["vault"])


class RedactRequest(BaseModel):
    """Redact candidate text and return receipt summary."""
    content: str


class RedactResponse(BaseModel):
    """Redacted content and redaction metadata summary."""
    redacted: str
    redactions: int


class VaultStatusResponse(BaseModel):
    """Vault service status."""
    dlp_available: bool
    vault_ready: bool


@router.get("/status", response_model=VaultStatusResponse)
async def vault_status() -> VaultStatusResponse:
    """Return vault/dlp availability status."""
    try:
        DLPRedactor()
        return VaultStatusResponse(dlp_available=True, vault_ready=True)
    except Exception as exc:
        log.warning("vault.status.error", error=str(exc))
        return VaultStatusResponse(dlp_available=False, vault_ready=False)


@router.post("/redact", response_model=RedactResponse)
async def redact(req: RedactRequest) -> RedactResponse:
    """Apply DLP redaction and return sanitized content."""
    redactor = DLPRedactor()
    redacted, receipts = redactor.redact(req.content)
    return RedactResponse(redacted=redacted, redactions=len(receipts))
