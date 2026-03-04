"""
AMC Python SDK — Agent Maturity Compass

A Python client library for the AMC Bridge HTTP API.
Provides typed access to all provider endpoints, telemetry reporting,
evidence hashing, secret redaction, and framework middleware.

Usage:
    from amc_sdk import AMCClient
    client = AMCClient(bridge_url="http://localhost:3212", token="your-token")
"""

from amc_client import (
    AMCBridgeResponse,
    AMCClient,
    AMCClientConfig,
    create_amc_client,
    hash_value,
    redact_text,
)

from amc_middleware import (
    AMCFastAPIMiddleware,
    AMCFlaskMiddleware,
    AMCLangChainCallback,
)

__all__ = [
    # Client
    "AMCBridgeResponse",
    "AMCClient",
    "AMCClientConfig",
    "create_amc_client",
    "hash_value",
    "redact_text",
    # Middleware
    "AMCFastAPIMiddleware",
    "AMCFlaskMiddleware",
    "AMCLangChainCallback",
]

__version__ = "0.1.0"
