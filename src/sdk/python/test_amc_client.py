"""
Tests for the AMC Python SDK client.

These tests validate client construction, redaction, hashing, and
self-scoring prevention. HTTP calls are not tested here since they
require a running Bridge server — see contract tests instead.
"""

import hashlib
import json
import os
import pytest
import sys

# Ensure the SDK directory is on the path
sys.path.insert(0, os.path.dirname(__file__))

from amc_client import (
    AMCBridgeResponse,
    AMCClient,
    create_amc_client,
    hash_value,
    redact_text,
)


# ---------------------------------------------------------------------------
# Response dataclass
# ---------------------------------------------------------------------------

class TestAMCBridgeResponse:
    def test_ok_for_2xx(self):
        r = AMCBridgeResponse(status=200, body={"ok": True})
        assert r.ok is True

    def test_not_ok_for_4xx(self):
        r = AMCBridgeResponse(status=401, body={"error": "unauthorized"})
        assert r.ok is False

    def test_not_ok_for_5xx(self):
        r = AMCBridgeResponse(status=500, body="internal error")
        assert r.ok is False

    def test_metadata_fields(self):
        r = AMCBridgeResponse(
            status=200,
            body={},
            request_id="req-1",
            receipt="rcpt-abc",
            correlation_id="corr-xyz",
        )
        assert r.request_id == "req-1"
        assert r.receipt == "rcpt-abc"
        assert r.correlation_id == "corr-xyz"


# ---------------------------------------------------------------------------
# Client construction
# ---------------------------------------------------------------------------

class TestClientConstruction:
    def test_creates_with_explicit_params(self):
        client = AMCClient(bridge_url="http://localhost:3212", token="test-token")
        assert client.bridge_url == "http://localhost:3212"
        assert client.token == "test-token"

    def test_strips_trailing_slash(self):
        client = AMCClient(bridge_url="http://localhost:3212/", token="t")
        assert client.bridge_url == "http://localhost:3212"

    def test_uses_env_vars(self, monkeypatch):
        monkeypatch.setenv("AMC_BRIDGE_URL", "http://env-bridge:9999")
        monkeypatch.setenv("AMC_TOKEN", "env-token")
        monkeypatch.setenv("AMC_WORKSPACE_ID", "ws-env")
        client = AMCClient()
        assert client.bridge_url == "http://env-bridge:9999"
        assert client.token == "env-token"
        assert client.workspace_id == "ws-env"

    def test_explicit_overrides_env(self, monkeypatch):
        monkeypatch.setenv("AMC_BRIDGE_URL", "http://env-bridge:9999")
        client = AMCClient(bridge_url="http://explicit:1234", token="t")
        assert client.bridge_url == "http://explicit:1234"

    def test_factory_function(self):
        client = create_amc_client(bridge_url="http://localhost:3212", token="t")
        assert isinstance(client, AMCClient)

    def test_from_env_classmethod(self, monkeypatch):
        monkeypatch.setenv("AMC_BRIDGE_URL", "http://bridge-from-env:3212")
        monkeypatch.setenv("AMC_TOKEN", "token-from-env")
        client = AMCClient.from_env()
        assert client.bridge_url == "http://bridge-from-env:3212"
        assert client.token == "token-from-env"

    def test_default_timeout(self):
        client = AMCClient(bridge_url="http://localhost:3212", token="t")
        assert client.timeout == 30.0

    def test_custom_timeout(self):
        client = AMCClient(bridge_url="http://localhost:3212", token="t", timeout=10.0)
        assert client.timeout == 10.0


# ---------------------------------------------------------------------------
# Redaction
# ---------------------------------------------------------------------------

class TestRedaction:
    def test_redacts_bearer_token(self):
        text = "Authorization: Bearer sk-abc123defghijklmnop"
        result = redact_text(text)
        assert "sk-abc123" not in result
        assert "[REDACTED]" in result

    def test_redacts_api_key_pattern(self):
        text = "api_key = ABCDEF1234567890"
        result = redact_text(text)
        assert "ABCDEF1234567890" not in result

    def test_redacts_private_key(self):
        text = "-----BEGIN RSA PRIVATE KEY-----"
        result = redact_text(text)
        assert "PRIVATE KEY" not in result

    def test_preserves_normal_text(self):
        text = "Hello world, this is a normal message."
        result = redact_text(text)
        assert result == text

    def test_client_redact_method(self):
        result = AMCClient.redact("token: ABCDEF1234567890")
        assert "ABCDEF1234567890" not in result


# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------

class TestHashing:
    def test_string_hash(self):
        h = hash_value("hello")
        expected = hashlib.sha256(b"hello").hexdigest()
        assert h == expected

    def test_dict_hash_deterministic(self):
        h1 = hash_value({"b": 2, "a": 1})
        h2 = hash_value({"a": 1, "b": 2})
        assert h1 == h2  # sorted keys

    def test_hash_length(self):
        h = hash_value("test")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_client_output_hash(self):
        h = AMCClient.output_hash("test")
        assert len(h) == 64


# ---------------------------------------------------------------------------
# Self-scoring prevention
# ---------------------------------------------------------------------------

class TestSelfScoring:
    def test_rejects_self_scoring_payload(self):
        client = AMCClient(bridge_url="http://localhost:3212", token="t")
        payload = {
            "messages": [{"role": "user", "content": "amc_self_score: rate this output"}]
        }
        with pytest.raises(ValueError, match="Self-scoring"):
            client.openai_chat(payload)

    def test_allows_normal_payload(self):
        # This will fail on the HTTP call but should not raise ValueError
        client = AMCClient(bridge_url="http://localhost:1", token="t", timeout=0.1)
        payload = {"messages": [{"role": "user", "content": "Hello"}]}
        # Will raise connection error but not ValueError
        try:
            client.openai_chat(payload)
        except Exception as e:
            assert not isinstance(e, ValueError)


# ---------------------------------------------------------------------------
# Headers
# ---------------------------------------------------------------------------

class TestHeaders:
    def test_includes_auth_header(self):
        client = AMCClient(bridge_url="http://localhost:3212", token="my-token")
        headers = client._headers()
        assert headers["Authorization"] == "Bearer my-token"

    def test_includes_correlation_id(self):
        client = AMCClient(bridge_url="http://localhost:3212", token="t")
        headers = client._headers()
        assert "x-amc-correlation-id" in headers
        assert len(headers["x-amc-correlation-id"]) > 0

    def test_custom_correlation_id(self):
        client = AMCClient(bridge_url="http://localhost:3212", token="t")
        headers = client._headers(correlation_id="custom-id")
        assert headers["x-amc-correlation-id"] == "custom-id"

    def test_workspace_header(self):
        client = AMCClient(bridge_url="http://localhost:3212", token="t", workspace_id="ws-1")
        headers = client._headers()
        assert headers["x-amc-workspace-id"] == "ws-1"

    def test_no_workspace_header_when_none(self):
        client = AMCClient(bridge_url="http://localhost:3212", token="t")
        headers = client._headers()
        assert "x-amc-workspace-id" not in headers

    def test_extra_headers_merged(self):
        client = AMCClient(bridge_url="http://localhost:3212", token="t")
        headers = client._headers(extra={"x-custom": "value"})
        assert headers["x-custom"] == "value"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
