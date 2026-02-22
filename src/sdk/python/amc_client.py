"""
AMC Python SDK — Agent Maturity Compass

A Python client for the AMC Bridge HTTP API. Provides typed access to all
provider endpoints (OpenAI, Anthropic, Gemini, OpenRouter, xAI, local),
telemetry reporting, evidence hashing, and secret redaction.

Usage:
    from amc_client import AMCClient

    client = AMCClient(bridge_url="http://localhost:3212", token="your-token")
    response = client.openai_chat({"model": "gpt-4", "messages": [{"role": "user", "content": "Hello"}]})
    print(response.body)

Environment variables:
    AMC_BRIDGE_URL: Bridge server URL (default: http://localhost:3212)
    AMC_TOKEN: Authentication token
    AMC_WORKSPACE_ID: Optional workspace identifier
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

@dataclass
class AMCBridgeResponse:
    """Wrapper for Bridge API responses."""
    status: int
    body: Any
    request_id: Optional[str] = None
    receipt: Optional[str] = None
    correlation_id: Optional[str] = None
    deprecated: bool = False
    sunset: Optional[str] = None
    warning: Optional[str] = None

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300


@dataclass
class AMCClientConfig:
    """Configuration for the AMC client."""
    bridge_url: str = ""
    token: str = ""
    workspace_id: Optional[str] = None
    timeout: float = 30.0
    verify_ssl: bool = True


# ---------------------------------------------------------------------------
# Redaction & Hashing utilities
# ---------------------------------------------------------------------------

_SECRET_PATTERNS: List[re.Pattern] = [
    re.compile(r"sk-[A-Za-z0-9]{10,}"),
    re.compile(r"(?:api|secret|token|key)\s*[:=]\s*[A-Za-z0-9._-]{10,}", re.IGNORECASE),
    re.compile(r"bearer\s+[A-Za-z0-9._-]{10,}", re.IGNORECASE),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
]


def redact_text(text: str) -> str:
    """Remove secret-like patterns from text."""
    result = text
    for pattern in _SECRET_PATTERNS:
        result = pattern.sub("[REDACTED]", result)
    return result


def hash_value(value: Union[str, dict, list]) -> str:
    """SHA256 hash of a value (string or JSON-serializable object)."""
    if isinstance(value, str):
        data = value
    else:
        data = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def _assert_no_self_scoring(payload: dict) -> None:
    """Prevent the SDK from scoring its own outputs."""
    messages = payload.get("messages", [])
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, str) and "amc_self_score" in content.lower():
            raise ValueError(
                "Self-scoring detected: AMC SDK cannot be used to score its own outputs."
            )


# ---------------------------------------------------------------------------
# AMCClient
# ---------------------------------------------------------------------------

class AMCClient:
    """
    Python client for the AMC Bridge HTTP API.

    Supports all provider endpoints (OpenAI, Anthropic, Gemini, OpenRouter,
    xAI, local), telemetry, and evidence utilities.

    Args:
        bridge_url: Bridge server URL. Falls back to AMC_BRIDGE_URL env var.
        token: Authentication token. Falls back to AMC_TOKEN env var.
        workspace_id: Optional workspace identifier.
        timeout: HTTP request timeout in seconds (default: 30).
        verify_ssl: Whether to verify SSL certificates (default: True).
    """

    def __init__(
        self,
        bridge_url: Optional[str] = None,
        token: Optional[str] = None,
        workspace_id: Optional[str] = None,
        timeout: float = 30.0,
        verify_ssl: bool = True,
    ):
        self.bridge_url = (bridge_url or os.getenv("AMC_BRIDGE_URL", "http://localhost:3212")).rstrip("/")
        self.token = token or os.getenv("AMC_TOKEN", "")
        self.workspace_id = workspace_id or os.getenv("AMC_WORKSPACE_ID")
        self.timeout = timeout
        self.verify_ssl = verify_ssl

        if not self.bridge_url:
            raise ValueError(
                "bridge_url is required. Set AMC_BRIDGE_URL env var or pass bridge_url parameter."
            )

    @classmethod
    def from_env(cls, **kwargs) -> "AMCClient":
        """Create a client using AMC_* environment variables with optional overrides."""
        return cls(**kwargs)

    def _headers(self, correlation_id: Optional[str] = None, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        """Build request headers."""
        headers: Dict[str, str] = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.token}",
            "x-amc-correlation-id": correlation_id or str(uuid.uuid4()),
            "x-amc-sdk-name": "amc-python-sdk",
            "x-amc-sdk-version": "0.1.0",
        }
        if self.workspace_id:
            headers["x-amc-workspace-id"] = self.workspace_id
        if extra:
            headers.update(extra)
        return headers

    def _call_bridge(
        self,
        path: str,
        payload: dict,
        correlation_id: Optional[str] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> AMCBridgeResponse:
        """
        Make a POST request to the Bridge API.

        Uses urllib.request (stdlib) to avoid external dependencies.
        For production use with async support, consider using httpx.
        """
        import urllib.request
        import urllib.error
        import urllib.parse

        url = f"{self.bridge_url}{path}"
        headers = self._headers(correlation_id, extra_headers)
        data = json.dumps(payload).encode("utf-8")

        req = urllib.request.Request(url, data=data, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body_bytes = resp.read()
                try:
                    body = json.loads(body_bytes)
                except (json.JSONDecodeError, ValueError):
                    body = body_bytes.decode("utf-8", errors="replace")

                return AMCBridgeResponse(
                    status=resp.status,
                    body=body,
                    request_id=resp.headers.get("x-amc-bridge-request-id"),
                    receipt=resp.headers.get("x-amc-receipt"),
                    correlation_id=resp.headers.get("x-amc-correlation-id"),
                    deprecated=(resp.headers.get("deprecation", "").lower() == "true"),
                    sunset=resp.headers.get("sunset"),
                    warning=resp.headers.get("warning"),
                )
        except urllib.error.HTTPError as e:
            body_bytes = e.read()
            try:
                body = json.loads(body_bytes)
            except (json.JSONDecodeError, ValueError):
                body = body_bytes.decode("utf-8", errors="replace")

            return AMCBridgeResponse(
                status=e.code,
                body=body,
                request_id=e.headers.get("x-amc-bridge-request-id") if e.headers else None,
                receipt=e.headers.get("x-amc-receipt") if e.headers else None,
                correlation_id=e.headers.get("x-amc-correlation-id") if e.headers else None,
                deprecated=((e.headers.get("deprecation", "").lower() == "true") if e.headers else False),
                sunset=e.headers.get("sunset") if e.headers else None,
                warning=e.headers.get("warning") if e.headers else None,
            )

    # ── Provider methods ──────────────────────────────────────────────

    def openai_chat(self, payload: dict, **kwargs) -> AMCBridgeResponse:
        """Send a chat completion request via OpenAI provider."""
        _assert_no_self_scoring(payload)
        return self._call_bridge("/bridge/openai/v1/chat/completions", payload, **kwargs)

    def openai_responses(self, payload: dict, **kwargs) -> AMCBridgeResponse:
        """Send a request to the OpenAI responses endpoint."""
        _assert_no_self_scoring(payload)
        return self._call_bridge("/bridge/openai/v1/responses", payload, **kwargs)

    def openai_batches(self, payload: dict, **kwargs) -> AMCBridgeResponse:
        """Send a request to the OpenAI batches endpoint."""
        _assert_no_self_scoring(payload)
        return self._call_bridge("/bridge/openai/v1/batches", payload, **kwargs)

    def anthropic_messages(self, payload: dict, **kwargs) -> AMCBridgeResponse:
        """Send a messages request via Anthropic provider."""
        _assert_no_self_scoring(payload)
        return self._call_bridge("/bridge/anthropic/v1/messages", payload, **kwargs)

    def gemini_generate_content(self, model: str, payload: dict, **kwargs) -> AMCBridgeResponse:
        """Send a generateContent request via Gemini provider."""
        _assert_no_self_scoring(payload)
        import urllib.parse
        model_path = urllib.parse.quote(model, safe="")
        return self._call_bridge(
            f"/bridge/gemini/v1beta/models/{model_path}:generateContent", payload, **kwargs
        )

    def openrouter_chat(self, payload: dict, **kwargs) -> AMCBridgeResponse:
        """Send a chat completion request via OpenRouter provider."""
        _assert_no_self_scoring(payload)
        return self._call_bridge("/bridge/openrouter/v1/chat/completions", payload, **kwargs)

    def xai_chat(self, payload: dict, **kwargs) -> AMCBridgeResponse:
        """Send a chat completion request via xAI/Grok provider."""
        _assert_no_self_scoring(payload)
        return self._call_bridge("/bridge/xai/v1/chat/completions", payload, **kwargs)

    def local_chat(self, payload: dict, **kwargs) -> AMCBridgeResponse:
        """Send a chat completion request via local (OpenAI-compatible) provider."""
        _assert_no_self_scoring(payload)
        return self._call_bridge("/bridge/local/v1/chat/completions", payload, **kwargs)

    # ── Telemetry ─────────────────────────────────────────────────────

    def report_telemetry(
        self,
        session_id: str,
        event_type: str,
        payload: Union[str, dict],
        *,
        correlation_id: Optional[str] = None,
        run_id: Optional[str] = None,
        provider: Optional[str] = None,
    ) -> AMCBridgeResponse:
        """Send a telemetry event to the Bridge."""
        body: Dict[str, Any] = {
            "sessionId": session_id,
            "eventType": event_type,
            "payload": redact_text(payload) if isinstance(payload, str) else payload,
        }
        if correlation_id:
            body["correlationId"] = correlation_id
        if run_id:
            body["runId"] = run_id
        if provider:
            body["provider"] = provider

        return self._call_bridge("/bridge/telemetry", body)

    def report_output(
        self,
        session_id: str,
        value: Union[str, dict],
        *,
        provider: Optional[str] = None,
        run_id: Optional[str] = None,
    ) -> AMCBridgeResponse:
        """Report agent output as a telemetry event."""
        if isinstance(value, str):
            payload_value = redact_text(value)
        else:
            payload_value = json.loads(redact_text(json.dumps(value)))
        return self.report_telemetry(
            session_id=session_id,
            event_type="agent_stdout",
            payload=payload_value,
            run_id=run_id,
            provider=provider,
        )

    # ── Evidence utilities ────────────────────────────────────────────

    @staticmethod
    def output_hash(value: Union[str, dict, list]) -> str:
        """Compute SHA256 hash of output for evidence verification."""
        return hash_value(value)

    @staticmethod
    def redact(text: str) -> str:
        """Redact secret-like patterns from text."""
        return redact_text(text)


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def create_amc_client(
    bridge_url: Optional[str] = None,
    token: Optional[str] = None,
    workspace_id: Optional[str] = None,
    **kwargs,
) -> AMCClient:
    """Create an AMCClient instance with optional configuration."""
    return AMCClient(
        bridge_url=bridge_url,
        token=token,
        workspace_id=workspace_id,
        **kwargs,
    )
