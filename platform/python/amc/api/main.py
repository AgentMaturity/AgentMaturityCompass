"""
AMC Platform — FastAPI Application Entry Point
---------------------------------------------
Serves the AMC API with routers for score, shield, enforce, vault, and watch.

Features:
- Request logging with lightweight request-body redaction.
- In-memory, fixed-window rate limiting.
- Structured AMCError responses.
- CORS with configurable origins.
- Startup hooks to initialize ledger, policy firewall, and circuit breaker.

Usage:
    uvicorn amc.api.main:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Callable

import structlog
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Error model
# ---------------------------------------------------------------------------

class AMCError(BaseModel):
    """Structured error payload for AMC API responses."""
    error: str
    detail: str = ""
    request_id: str = ""
    module: str = ""
    code: int = 500


# ---------------------------------------------------------------------------
# DLP redaction (request body logging)
# ---------------------------------------------------------------------------

_DLP_PATTERNS = [
    (re.compile(r"(sk-[a-zA-Z0-9]{20,})"), "[REDACTED:api_key]"),
    (re.compile(r"(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})"), "[REDACTED:jwt]"),
    (re.compile(r"(AKIA[0-9A-Z]{16})"), "[REDACTED:aws_key]"),
    (re.compile(r"(\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b)", re.IGNORECASE), "[REDACTED:email]"),
    (re.compile(r"(password\s*[:=]\s*\S+)", re.IGNORECASE), "[REDACTED:password]"),
]


def _redact_body(text: str) -> str:
    """Redact secrets from request body before logging."""
    for pattern, replacement in _DLP_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------

class _RateLimiter:
    """Simple in-memory fixed-window request limiter."""

    def __init__(self, max_requests: int = 120, window_seconds: int = 60) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, list[float]] = {}

    def allow(self, identity: str) -> bool:
        now = time.time()
        hits = self._hits.setdefault(identity, [])
        expiry = now - self.window_seconds
        self._hits[identity] = [t for t in hits if t > expiry]
        if len(self._hits[identity]) >= self.max_requests:
            return False
        self._hits[identity].append(now)
        return True


_rate_limiter = _RateLimiter(
    max_requests=int(os.environ.get("AMC_RATE_LIMIT", "120")),
    window_seconds=60,
)


# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialize shared runtime components before serving requests."""
    log.info("amc_api.starting")

    # Receipts ledger
    try:
        from amc.watch.w1_receipts import get_ledger

        await get_ledger()
        log.info("amc_api.receipts_ledger_initialized")
    except Exception as exc:
        log.warning("amc_api.receipts_ledger_init_failed", error=str(exc))

    # Policy firewall
    try:
        from amc.enforce.e1_policy import ToolPolicyFirewall

        app.state.firewall = ToolPolicyFirewall.from_preset("enterprise-secure")
        log.info("amc_api.policy_firewall_loaded")
    except Exception as exc:
        log.warning("amc_api.policy_firewall_load_failed", error=str(exc))
        app.state.firewall = None

    # Circuit breaker
    try:
        from amc.enforce.e5_circuit_breaker import CircuitBreaker

        app.state.circuit_breaker = CircuitBreaker()
        log.info("amc_api.circuit_breaker_initialized")
    except Exception as exc:
        log.warning("amc_api.circuit_breaker_init_failed", error=str(exc))
        app.state.circuit_breaker = None

    # Injection detector
    try:
        from amc.shield.s10_detector import InjectionDetector

        app.state.detector = InjectionDetector()
        log.info("amc_api.detector_loaded")
    except Exception as exc:
        log.warning("amc_api.detector_load_failed", error=str(exc))
        app.state.detector = None

    log.info("amc_api.started")
    yield
    log.info("amc_api.shutdown")


# ---------------------------------------------------------------------------
# FastAPI app + CORS
# ---------------------------------------------------------------------------

app = FastAPI(
    title="AMC Platform API",
    description="Agent Maturity & Control Platform",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

cors_origins = os.environ.get("AMC_CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Middleware: request ID, logging, DLP, rate limiting
# ---------------------------------------------------------------------------

@app.middleware("http")
async def request_middleware(request: Request, call_next: Callable[[Request], Any]) -> Response:
    """Attach request id, log request metadata, and apply simple rate limiting."""
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())

    identity = request.client.host if request.client else "unknown"
    if not _rate_limiter.allow(identity):
        log.warning("rate_limit.exceeded", ip=identity, request_id=request_id)
        return JSONResponse(
            status_code=429,
            content=AMCError(
                error="rate_limit_exceeded",
                detail="Too many requests. Retry later.",
                request_id=request_id,
                code=429,
            ).model_dump(),
        )

    start = time.monotonic()

    body_preview = None
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        try:
            raw_body = await request.body()
            body_preview = _redact_body(raw_body.decode("utf-8", errors="replace"))[:2000]
            # Restore body for downstream readers
            async def receive() -> dict[str, Any]:
                return {"type": "http.request", "body": raw_body, "more_body": False}

            request = Request(request.scope, receive)
        except Exception:
            body_preview = None

    log.info(
        "request.start",
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        ip=identity,
        body_preview=body_preview,
    )

    response = await call_next(request)
    duration_ms = int((time.monotonic() - start) * 1000)

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Duration-Ms"] = str(duration_ms)
    log.info(
        "request.complete",
        request_id=request_id,
        status=response.status_code,
        duration_ms=duration_ms,
    )
    return response


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Translate HTTP errors to AMCError format."""
    rid = request.headers.get("x-request-id", "")
    return JSONResponse(
        status_code=exc.status_code,
        content=AMCError(
            error="http_error",
            detail=exc.detail,
            request_id=rid,
            code=exc.status_code,
        ).model_dump(),
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Translate unexpected exceptions to structured AMCError."""
    rid = request.headers.get("x-request-id", str(uuid.uuid4()))
    log.exception("unhandled_exception", request_id=rid, error=str(exc))
    return JSONResponse(
        status_code=500,
        content=AMCError(
            error="internal_error",
            detail="An unexpected error occurred.",
            request_id=rid,
            module="api.main",
            code=500,
        ).model_dump(),
    )


# ---------------------------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------------------------

@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    """Liveness probe endpoint."""
    return {"status": "healthy", "service": "amc-platform"}


# ---------------------------------------------------------------------------
# Include routers
# ---------------------------------------------------------------------------

def _include_router_if_available(module_path: str, attr: str) -> None:
    """Import and include router when module is available."""
    try:
        module = __import__(module_path, fromlist=[attr])
        app.include_router(getattr(module, attr))
        log.info("router.loaded", module=module_path)
    except Exception as exc:
        log.warning("router.load_failed", module=module_path, error=str(exc))


_include_router_if_available("amc.api.routers.score", "router")
_include_router_if_available("amc.api.routers.shield", "router")
_include_router_if_available("amc.api.routers.enforce", "router")
_include_router_if_available("amc.api.routers.vault", "router")
_include_router_if_available("amc.api.routers.watch", "router")
try:
    from amc.api.routers.product import register_product_routes
    register_product_routes(app)
    log.info("router.loaded", module="amc.api.routers.product")
except Exception as _product_exc:
    log.warning("router.load_failed", module="amc.api.routers.product", error=str(_product_exc))
