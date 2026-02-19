"""
AMC Enforce — E14: Signed Webhook Trigger Gateway with Replay Protection

Validates inbound webhooks (Stripe, GitHub, Slack, custom) with signature
verification, timestamp enforcement, nonce/replay protection, schema
validation, and event-type allowlisting.

Usage:
    gw = WebhookGateway("/tmp/webhooks.db")
    gw.register_source(
        name="stripe",
        secret="whsec_abc123",
        algorithm="hmac-sha256",
        event_types=["checkout.session.completed", "invoice.paid"],
        schema={"type": "object", "required": ["id", "type"]},
    )

    result = gw.validate_request(
        source_name="stripe",
        headers={"stripe-signature": "t=123,v1=abc"},
        body_bytes=b'{"id":"evt_1","type":"checkout.session.completed"}',
        timestamp_header="stripe-signature",
    )
    assert result.valid
"""
from __future__ import annotations

import hashlib
import hmac
import json
import sqlite3
import time
from datetime import datetime, timezone
from enum import Enum
from typing import Any

import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class SignatureAlgorithm(str, Enum):
    HMAC_SHA256 = "hmac-sha256"
    RSA_SHA256 = "rsa-sha256"
    ED25519 = "ed25519"


class WebhookSource(BaseModel):
    """A registered webhook source configuration."""
    name: str
    secret: str
    algorithm: SignatureAlgorithm = SignatureAlgorithm.HMAC_SHA256
    event_types: list[str] = Field(default_factory=list)
    schema: dict[str, Any] | None = None
    timestamp_tolerance_seconds: int = 300  # 5 minutes
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WebhookValidation(BaseModel):
    """Result of webhook request validation."""
    valid: bool
    reason: str
    event_type: str = ""
    safe_payload: dict[str, Any] = Field(default_factory=dict)
    source_name: str = ""
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Schema validation (minimal, no jsonschema dependency)
# ---------------------------------------------------------------------------

def _validate_schema(payload: dict[str, Any], schema: dict[str, Any]) -> str | None:
    """
    Minimal JSON schema validator covering 'type', 'required', and 'properties'.
    Returns error string or None if valid.
    """
    schema_type = schema.get("type")
    if schema_type == "object" and not isinstance(payload, dict):
        return f"Expected object, got {type(payload).__name__}"
    if schema_type == "array" and not isinstance(payload, list):
        return f"Expected array, got {type(payload).__name__}"

    if isinstance(payload, dict):
        required = schema.get("required", [])
        for field_name in required:
            if field_name not in payload:
                return f"Missing required field: {field_name}"

        properties = schema.get("properties", {})
        for prop_name, prop_schema in properties.items():
            if prop_name in payload:
                prop_type = prop_schema.get("type")
                val = payload[prop_name]
                type_map = {
                    "string": str, "integer": int, "number": (int, float),
                    "boolean": bool, "array": list, "object": dict,
                }
                expected = type_map.get(prop_type)
                if expected and not isinstance(val, expected):
                    return f"Field '{prop_name}' expected {prop_type}, got {type(val).__name__}"
    return None


# ---------------------------------------------------------------------------
# SQLite for nonce/replay cache
# ---------------------------------------------------------------------------

_NONCE_SCHEMA = """
CREATE TABLE IF NOT EXISTS webhook_nonces (
    event_id TEXT PRIMARY KEY,
    source_name TEXT NOT NULL,
    received_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nonce_ts ON webhook_nonces(received_at);
"""


# ---------------------------------------------------------------------------
# Gateway
# ---------------------------------------------------------------------------

class WebhookGateway:
    """
    Signed webhook validation gateway with replay protection.

    Features:
    - HMAC-SHA256 signature verification (Stripe/GitHub/Slack compatible)
    - Timestamp window enforcement (±5 min default)
    - Nonce/replay cache in SQLite
    - JSON schema validation per source
    - Event type allowlisting
    """

    def __init__(self, db_path: str = ":memory:") -> None:
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.executescript(_NONCE_SCHEMA)
        self._conn.commit()
        self._sources: dict[str, WebhookSource] = {}

    def close(self) -> None:
        self._conn.close()

    # -----------------------------------------------------------------------
    # Source registration
    # -----------------------------------------------------------------------

    def register_source(
        self,
        name: str,
        secret: str,
        algorithm: str = "hmac-sha256",
        event_types: list[str] | None = None,
        schema: dict[str, Any] | None = None,
        timestamp_tolerance_seconds: int = 300,
    ) -> WebhookSource:
        """
        Register a webhook source for validation.

        Args:
            name: Unique source identifier (e.g. "stripe", "github").
            secret: Shared secret or public key (depending on algorithm).
            algorithm: One of "hmac-sha256", "rsa-sha256", "ed25519".
            event_types: Allowlisted event types. Empty = allow all.
            schema: JSON schema dict for body validation.
            timestamp_tolerance_seconds: Max age for timestamps (default 300s).

        Returns:
            The registered WebhookSource.
        """
        source = WebhookSource(
            name=name,
            secret=secret,
            algorithm=SignatureAlgorithm(algorithm),
            event_types=event_types or [],
            schema=schema,
            timestamp_tolerance_seconds=timestamp_tolerance_seconds,
        )
        self._sources[name] = source
        log.info("webhook.source.registered", name=name, algorithm=algorithm)
        return source

    def unregister_source(self, name: str) -> bool:
        """Remove a registered source. Returns True if it existed."""
        return self._sources.pop(name, None) is not None

    # -----------------------------------------------------------------------
    # Validation
    # -----------------------------------------------------------------------

    def validate_request(
        self,
        source_name: str,
        headers: dict[str, str],
        body_bytes: bytes,
        timestamp_header: str = "",
    ) -> WebhookValidation:
        """
        Validate an inbound webhook request.

        Args:
            source_name: Registered source name.
            headers: HTTP headers (case-insensitive keys recommended).
            body_bytes: Raw request body bytes.
            timestamp_header: Header name containing the timestamp/signature.

        Returns:
            WebhookValidation with valid/invalid status and parsed payload.
        """
        # Normalize headers to lowercase
        hdrs = {k.lower(): v for k, v in headers.items()}

        source = self._sources.get(source_name)
        if not source:
            return WebhookValidation(
                valid=False, reason=f"Unknown source: {source_name}",
                source_name=source_name,
            )

        # 1. Parse body
        try:
            payload = json.loads(body_bytes)
        except (json.JSONDecodeError, ValueError) as e:
            return WebhookValidation(
                valid=False, reason=f"Invalid JSON body: {e}",
                source_name=source_name,
            )

        # 2. Signature verification
        sig_result = self._verify_signature(source, hdrs, body_bytes, timestamp_header)
        if sig_result is not None:
            return WebhookValidation(
                valid=False, reason=sig_result, source_name=source_name,
            )

        # 3. Timestamp window
        ts_result = self._check_timestamp(source, hdrs, timestamp_header)
        if ts_result is not None:
            return WebhookValidation(
                valid=False, reason=ts_result, source_name=source_name,
            )

        # 4. Replay / nonce check
        event_id = self._extract_event_id(payload, hdrs)
        if event_id:
            replay_result = self._check_replay(source_name, event_id)
            if replay_result is not None:
                return WebhookValidation(
                    valid=False, reason=replay_result, source_name=source_name,
                )

        # 5. Event type allowlist
        event_type = str(payload.get("type", payload.get("event_type", payload.get("action", ""))))
        if source.event_types and event_type not in source.event_types:
            return WebhookValidation(
                valid=False,
                reason=f"Event type '{event_type}' not in allowlist",
                event_type=event_type,
                source_name=source_name,
            )

        # 6. Schema validation
        if source.schema:
            schema_err = _validate_schema(payload, source.schema)
            if schema_err:
                return WebhookValidation(
                    valid=False, reason=f"Schema validation failed: {schema_err}",
                    event_type=event_type, source_name=source_name,
                )

        log.info("webhook.validated", source=source_name, event_type=event_type)
        return WebhookValidation(
            valid=True,
            reason="OK",
            event_type=event_type,
            safe_payload=payload,
            source_name=source_name,
        )

    # -----------------------------------------------------------------------
    # Signature verification
    # -----------------------------------------------------------------------

    def _verify_signature(
        self, source: WebhookSource, hdrs: dict[str, str],
        body_bytes: bytes, timestamp_header: str,
    ) -> str | None:
        """Returns error string or None if signature is valid."""
        if source.algorithm == SignatureAlgorithm.HMAC_SHA256:
            return self._verify_hmac_sha256(source, hdrs, body_bytes, timestamp_header)
        elif source.algorithm == SignatureAlgorithm.ED25519:
            return self._verify_ed25519(source, hdrs, body_bytes)
        elif source.algorithm == SignatureAlgorithm.RSA_SHA256:
            return self._verify_rsa_sha256(source, hdrs, body_bytes)
        return f"Unsupported algorithm: {source.algorithm}"

    def _verify_hmac_sha256(
        self, source: WebhookSource, hdrs: dict[str, str],
        body_bytes: bytes, timestamp_header: str,
    ) -> str | None:
        """
        HMAC-SHA256 verification supporting multiple formats:
        - Stripe: "t=timestamp,v1=signature" in a single header
        - GitHub: "sha256=signature" in X-Hub-Signature-256
        - Slack: separate header with hex signature
        - Generic: plain hex signature in any header
        """
        # Try common signature headers
        sig_header_names = [
            timestamp_header.lower() if timestamp_header else "",
            "x-hub-signature-256",
            "x-signature",
            "x-webhook-signature",
            "stripe-signature",
            "x-slack-signature",
        ]

        raw_sig = ""
        for name in sig_header_names:
            if name and name in hdrs:
                raw_sig = hdrs[name]
                break

        if not raw_sig:
            return "No signature header found"

        # Stripe-style: t=timestamp,v1=hex
        if raw_sig.startswith("t=") or ",v1=" in raw_sig:
            return self._verify_stripe_style(source, raw_sig, body_bytes)

        # GitHub-style: sha256=hex
        if raw_sig.startswith("sha256="):
            expected_sig = raw_sig[7:]
            computed = hmac.new(
                source.secret.encode(), body_bytes, hashlib.sha256,
            ).hexdigest()
            if not hmac.compare_digest(computed, expected_sig):
                return "HMAC signature mismatch"
            return None

        # Slack v0 style: v0=hex (with signing body = v0:timestamp:body)
        if raw_sig.startswith("v0="):
            ts = hdrs.get("x-slack-request-timestamp", "")
            sig_basestring = f"v0:{ts}:{body_bytes.decode('utf-8', errors='replace')}"
            computed = "v0=" + hmac.new(
                source.secret.encode(), sig_basestring.encode(), hashlib.sha256,
            ).hexdigest()
            if not hmac.compare_digest(computed, raw_sig):
                return "Slack HMAC signature mismatch"
            return None

        # Generic hex signature
        computed = hmac.new(
            source.secret.encode(), body_bytes, hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(computed, raw_sig):
            return "HMAC signature mismatch"
        return None

    def _verify_stripe_style(
        self, source: WebhookSource, raw_sig: str, body_bytes: bytes,
    ) -> str | None:
        """Parse Stripe t=...,v1=... format."""
        parts: dict[str, str] = {}
        for segment in raw_sig.split(","):
            if "=" in segment:
                k, _, v = segment.partition("=")
                parts[k.strip()] = v.strip()

        timestamp = parts.get("t", "")
        signature = parts.get("v1", "")
        if not timestamp or not signature:
            return "Invalid Stripe signature format (missing t or v1)"

        signed_payload = f"{timestamp}.{body_bytes.decode('utf-8', errors='replace')}"
        computed = hmac.new(
            source.secret.encode(), signed_payload.encode(), hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(computed, signature):
            return "Stripe HMAC signature mismatch"
        return None

    def _verify_ed25519(
        self, source: WebhookSource, hdrs: dict[str, str], body_bytes: bytes,
    ) -> str | None:
        """Ed25519 signature verification. Requires PyNaCl or similar."""
        sig_hex = hdrs.get("x-signature-ed25519", "")
        ts = hdrs.get("x-signature-timestamp", "")
        if not sig_hex:
            return "Missing X-Signature-Ed25519 header"
        try:
            from nacl.signing import VerifyKey  # type: ignore[import-untyped]
            verify_key = VerifyKey(bytes.fromhex(source.secret))
            message = ts.encode() + body_bytes
            verify_key.verify(message, bytes.fromhex(sig_hex))
            return None
        except ImportError:
            return "Ed25519 verification requires PyNaCl (pip install pynacl)"
        except Exception as e:
            return f"Ed25519 signature verification failed: {e}"

    def _verify_rsa_sha256(
        self, source: WebhookSource, hdrs: dict[str, str], body_bytes: bytes,
    ) -> str | None:
        """RSA-SHA256 signature verification (PEM public key in source.secret)."""
        sig_b64 = hdrs.get("x-signature", hdrs.get("x-rsa-signature", ""))
        if not sig_b64:
            return "Missing RSA signature header"
        try:
            import base64
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding

            pub_key = serialization.load_pem_public_key(source.secret.encode())
            signature = base64.b64decode(sig_b64)
            pub_key.verify(signature, body_bytes, padding.PKCS1v15(), hashes.SHA256())  # type: ignore[union-attr]
            return None
        except ImportError:
            return "RSA verification requires cryptography package"
        except Exception as e:
            return f"RSA signature verification failed: {e}"

    # -----------------------------------------------------------------------
    # Timestamp check
    # -----------------------------------------------------------------------

    def _check_timestamp(
        self, source: WebhookSource, hdrs: dict[str, str],
        timestamp_header: str,
    ) -> str | None:
        """Reject if timestamp is outside tolerance window."""
        ts_val = ""

        # Try to extract from Stripe-style signature header
        sig_header = hdrs.get((timestamp_header or "").lower(), "")
        if "t=" in sig_header:
            for part in sig_header.split(","):
                if part.strip().startswith("t="):
                    ts_val = part.strip()[2:]
                    break

        # Try common timestamp headers
        if not ts_val:
            for name in ("x-slack-request-timestamp", "x-timestamp",
                         "x-webhook-timestamp", "x-signature-timestamp"):
                if name in hdrs:
                    ts_val = hdrs[name]
                    break

        if not ts_val:
            return None  # No timestamp to check — skip (some sources don't send one)

        try:
            ts_epoch = int(ts_val)
        except ValueError:
            return f"Invalid timestamp value: {ts_val}"

        now = int(time.time())
        diff = abs(now - ts_epoch)
        if diff > source.timestamp_tolerance_seconds:
            return (
                f"Timestamp too old: {diff}s ago "
                f"(tolerance: {source.timestamp_tolerance_seconds}s)"
            )
        return None

    # -----------------------------------------------------------------------
    # Replay protection
    # -----------------------------------------------------------------------

    def _extract_event_id(self, payload: dict[str, Any], hdrs: dict[str, str]) -> str:
        """Extract a unique event ID from payload or headers."""
        for key in ("id", "event_id", "idempotency_key", "delivery_id"):
            val = payload.get(key)
            if val:
                return str(val)
        for hdr in ("x-github-delivery", "x-request-id", "x-idempotency-key"):
            if hdr in hdrs:
                return hdrs[hdr]
        return ""

    def _check_replay(self, source_name: str, event_id: str) -> str | None:
        """Check and record event ID. Returns error if replay detected."""
        # Cleanup old nonces (older than 24 hours)
        cutoff = time.time() - 86400
        self._conn.execute(
            "DELETE FROM webhook_nonces WHERE received_at < ?", (cutoff,),
        )

        existing = self._conn.execute(
            "SELECT 1 FROM webhook_nonces WHERE event_id = ? AND source_name = ?",
            (event_id, source_name),
        ).fetchone()

        if existing:
            return f"Replay detected: event_id={event_id} already processed"

        self._conn.execute(
            "INSERT INTO webhook_nonces (event_id, source_name, received_at) VALUES (?, ?, ?)",
            (event_id, source_name, time.time()),
        )
        self._conn.commit()
        return None

    def cleanup_nonces(self, max_age_seconds: int = 86400) -> int:
        """Remove expired nonces. Returns count deleted."""
        cutoff = time.time() - max_age_seconds
        cur = self._conn.execute(
            "DELETE FROM webhook_nonces WHERE received_at < ?", (cutoff,),
        )
        self._conn.commit()
        return cur.rowcount
