#!/usr/bin/env bash
# Claude Code CLI + AMC Integration
#
# This script configures environment variables so that Claude Code CLI
# routes all API calls through the AMC Gateway for evidence collection.
#
# Usage:
#   source setup.sh        # Set env vars in current shell
#   claude "your prompt"   # Claude Code now routes through AMC
#
# Or use amc wrap directly:
#   amc wrap claude-cli -- claude "your prompt"

set -euo pipefail

# ─── AMC Integration ───────────────────────────────────────────────
# Claude Code reads ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY from env.
# AMC's claude-cli adapter sets these to route through the gateway.

# Check if AMC gateway is running
AMC_GATEWAY_URL="${AMC_GATEWAY_URL:-http://localhost:3700}"

echo "[AMC] Configuring Claude Code CLI for AMC evidence collection"
echo "[AMC] Gateway URL: ${AMC_GATEWAY_URL}"

# Set Anthropic-specific env vars to point at AMC Gateway
export ANTHROPIC_BASE_URL="${AMC_GATEWAY_URL}/v1"
export ANTHROPIC_API_URL="${AMC_GATEWAY_URL}/v1"
export AMC_LLM_BASE_URL="${AMC_GATEWAY_URL}/v1"

# Proxy settings for additional capture
export HTTP_PROXY="${AMC_GATEWAY_URL}"
export HTTPS_PROXY="${AMC_GATEWAY_URL}"
export NO_PROXY="localhost,127.0.0.1,::1"

echo "[AMC] Environment configured. Run Claude Code normally:"
echo "  claude \"What is the capital of France?\""
echo ""
echo "[AMC] Or use amc wrap for automatic setup:"
echo "  amc wrap claude-cli -- claude \"your prompt\""
# ────────────────────────────────────────────────────────────────────
