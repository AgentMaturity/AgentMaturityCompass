#!/usr/bin/env bash
# OpenHands (formerly OpenDevin) + AMC Integration
#
# This script configures environment variables so that OpenHands
# routes all LLM calls through the AMC Gateway for evidence collection.
#
# Usage:
#   source setup.sh          # Set env vars in current shell
#   openhands "your task"    # OpenHands now routes through AMC
#
# Or use amc wrap directly:
#   amc wrap openhands-cli -- openhands "your task"

set -euo pipefail

# ─── AMC Integration ───────────────────────────────────────────────
# OpenHands reads OPENAI_BASE_URL and OPENAI_API_KEY from env.
# AMC's openhands-cli adapter sets these to route through the gateway.

AMC_GATEWAY_URL="${AMC_GATEWAY_URL:-http://localhost:3700}"

echo "[AMC] Configuring OpenHands for AMC evidence collection"
echo "[AMC] Gateway URL: ${AMC_GATEWAY_URL}"

# Set OpenAI-compatible env vars to point at AMC Gateway
export OPENAI_BASE_URL="${AMC_GATEWAY_URL}/v1"
export OPENAI_API_BASE="${AMC_GATEWAY_URL}/v1"
export OPENAI_API_HOST="${AMC_GATEWAY_URL}"
export AMC_LLM_BASE_URL="${AMC_GATEWAY_URL}/v1"

# Proxy settings for additional capture
export HTTP_PROXY="${AMC_GATEWAY_URL}"
export HTTPS_PROXY="${AMC_GATEWAY_URL}"
export NO_PROXY="localhost,127.0.0.1,::1"

echo "[AMC] Environment configured. Run OpenHands normally:"
echo "  openhands \"Fix the bug in src/main.py\""
echo ""
echo "[AMC] Or use amc wrap for automatic setup:"
echo "  amc wrap openhands-cli -- openhands \"your task\""
echo ""
echo "[AMC] For Docker-based OpenHands:"
echo "  docker run -e OPENAI_BASE_URL=${OPENAI_BASE_URL} \\"
echo "             -e OPENAI_API_KEY=\${OPENAI_API_KEY} \\"
echo "             ghcr.io/all-hands-ai/openhands:latest"
# ────────────────────────────────────────────────────────────────────
