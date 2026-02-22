"""
AMC Python Middleware — FastAPI & Flask Integration

Drop-in middleware for FastAPI and Flask that automatically captures
evidence from API requests and forwards them to the AMC Bridge.

FastAPI usage:
    from fastapi import FastAPI
    from amc_middleware import AMCFastAPIMiddleware

    app = FastAPI()
    app.add_middleware(AMCFastAPIMiddleware, bridge_url="http://localhost:3212", token="your-token")

Flask usage:
    from flask import Flask
    from amc_middleware import AMCFlaskMiddleware

    app = Flask(__name__)
    AMCFlaskMiddleware(app, bridge_url="http://localhost:3212", token="your-token")
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, Callable, Dict, Optional

from amc_client import AMCClient, redact_text


# ---------------------------------------------------------------------------
# FastAPI Middleware
# ---------------------------------------------------------------------------

class AMCFastAPIMiddleware:
    """
    ASGI middleware for FastAPI that captures request/response evidence
    and forwards it to the AMC Bridge telemetry endpoint.
    """

    def __init__(
        self,
        app: Any,
        bridge_url: Optional[str] = None,
        token: Optional[str] = None,
        session_id: Optional[str] = None,
        exclude_paths: Optional[list] = None,
    ):
        self.app = app
        self.client = AMCClient(bridge_url=bridge_url, token=token)
        self.session_id = session_id or str(uuid.uuid4())
        self.exclude_paths = set(exclude_paths or ["/health", "/healthz", "/readyz", "/metrics"])

    async def __call__(self, scope: Dict, receive: Callable, send: Callable) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path in self.exclude_paths:
            await self.app(scope, receive, send)
            return

        correlation_id = str(uuid.uuid4())
        start_time = time.monotonic()
        status_code = 200
        response_body_parts: list = []

        async def send_wrapper(message: Dict) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 200)
                # Inject correlation header
                headers = list(message.get("headers", []))
                headers.append((b"x-amc-correlation-id", correlation_id.encode()))
                message = {**message, "headers": headers}
            elif message["type"] == "http.response.body":
                body = message.get("body", b"")
                if body:
                    response_body_parts.append(body)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            elapsed_ms = (time.monotonic() - start_time) * 1000
            method = scope.get("method", "UNKNOWN")

            try:
                self.client.report_telemetry(
                    session_id=self.session_id,
                    event_type="api_request",
                    payload={
                        "method": method,
                        "path": path,
                        "status": status_code,
                        "latency_ms": round(elapsed_ms, 2),
                        "correlation_id": correlation_id,
                    },
                    correlation_id=correlation_id,
                )
            except Exception:
                pass  # Non-blocking: don't fail requests on telemetry errors


# ---------------------------------------------------------------------------
# Flask Middleware
# ---------------------------------------------------------------------------

class AMCFlaskMiddleware:
    """
    Flask middleware that captures request/response evidence
    and forwards it to the AMC Bridge telemetry endpoint.

    Usage:
        app = Flask(__name__)
        AMCFlaskMiddleware(app, bridge_url="...", token="...")
    """

    def __init__(
        self,
        app: Any,
        bridge_url: Optional[str] = None,
        token: Optional[str] = None,
        session_id: Optional[str] = None,
        exclude_paths: Optional[list] = None,
    ):
        self.app = app
        self.client = AMCClient(bridge_url=bridge_url, token=token)
        self.session_id = session_id or str(uuid.uuid4())
        self.exclude_paths = set(exclude_paths or ["/health", "/healthz", "/readyz", "/metrics"])

        # Register hooks
        app.before_request(self._before_request)
        app.after_request(self._after_request)

    def _before_request(self) -> None:
        """Record request start time and correlation ID."""
        try:
            from flask import request, g
            g.amc_start_time = time.monotonic()
            g.amc_correlation_id = str(uuid.uuid4())
        except Exception:
            pass

    def _after_request(self, response: Any) -> Any:
        """Report request evidence to AMC Bridge."""
        try:
            from flask import request, g

            if request.path in self.exclude_paths:
                return response

            elapsed_ms = (time.monotonic() - getattr(g, "amc_start_time", time.monotonic())) * 1000
            correlation_id = getattr(g, "amc_correlation_id", str(uuid.uuid4()))

            response.headers["x-amc-correlation-id"] = correlation_id

            self.client.report_telemetry(
                session_id=self.session_id,
                event_type="api_request",
                payload={
                    "method": request.method,
                    "path": request.path,
                    "status": response.status_code,
                    "latency_ms": round(elapsed_ms, 2),
                    "correlation_id": correlation_id,
                },
                correlation_id=correlation_id,
            )
        except Exception:
            pass  # Non-blocking

        return response


# ---------------------------------------------------------------------------
# LangChain Callback Handler
# ---------------------------------------------------------------------------

class AMCLangChainCallback:
    """
    LangChain callback handler that reports LLM and tool events
    to the AMC Bridge for evidence collection.

    Usage:
        from langchain.llms import OpenAI
        from amc_middleware import AMCLangChainCallback

        callback = AMCLangChainCallback(bridge_url="...", token="...")
        llm = OpenAI(callbacks=[callback])
    """

    def __init__(
        self,
        bridge_url: Optional[str] = None,
        token: Optional[str] = None,
        session_id: Optional[str] = None,
    ):
        self.client = AMCClient(bridge_url=bridge_url, token=token)
        self.session_id = session_id or str(uuid.uuid4())

    def on_llm_start(self, serialized: Dict[str, Any], prompts: list, **kwargs: Any) -> None:
        """Called when LLM starts generating."""
        try:
            model = serialized.get("name", serialized.get("id", ["unknown"])[-1])
            self.client.report_telemetry(
                session_id=self.session_id,
                event_type="llm_start",
                payload={
                    "model": str(model),
                    "prompt_count": len(prompts),
                    "run_id": str(kwargs.get("run_id", "")),
                },
            )
        except Exception:
            pass

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:
        """Called when LLM finishes generating."""
        try:
            generations = getattr(response, "generations", [])
            total_tokens = 0
            if hasattr(response, "llm_output") and response.llm_output:
                token_usage = response.llm_output.get("token_usage", {})
                total_tokens = token_usage.get("total_tokens", 0)

            self.client.report_telemetry(
                session_id=self.session_id,
                event_type="llm_end",
                payload={
                    "generation_count": len(generations),
                    "total_tokens": total_tokens,
                    "run_id": str(kwargs.get("run_id", "")),
                },
            )
        except Exception:
            pass

    def on_llm_error(self, error: Exception, **kwargs: Any) -> None:
        """Called when LLM encounters an error."""
        try:
            self.client.report_telemetry(
                session_id=self.session_id,
                event_type="llm_error",
                payload={
                    "error": redact_text(str(error)),
                    "run_id": str(kwargs.get("run_id", "")),
                },
            )
        except Exception:
            pass

    def on_tool_start(self, serialized: Dict[str, Any], input_str: str, **kwargs: Any) -> None:
        """Called when a tool starts executing."""
        try:
            self.client.report_telemetry(
                session_id=self.session_id,
                event_type="tool_start",
                payload={
                    "tool": serialized.get("name", "unknown"),
                    "input_length": len(input_str),
                    "run_id": str(kwargs.get("run_id", "")),
                },
            )
        except Exception:
            pass

    def on_tool_end(self, output: str, **kwargs: Any) -> None:
        """Called when a tool finishes executing."""
        try:
            self.client.report_telemetry(
                session_id=self.session_id,
                event_type="tool_end",
                payload={
                    "output_length": len(output),
                    "run_id": str(kwargs.get("run_id", "")),
                },
            )
        except Exception:
            pass

    def on_tool_error(self, error: Exception, **kwargs: Any) -> None:
        """Called when a tool encounters an error."""
        try:
            self.client.report_telemetry(
                session_id=self.session_id,
                event_type="tool_error",
                payload={
                    "error": redact_text(str(error)),
                    "run_id": str(kwargs.get("run_id", "")),
                },
            )
        except Exception:
            pass
