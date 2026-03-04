#!/usr/bin/env bash
# Generic CLI — Score ANY Agent with AMC
#
# This script wraps any CLI-based AI agent with AMC evidence collection
# using the generic-cli adapter. It sets up env var proxying so that
# any tool reading standard OpenAI/Anthropic/Gemini env vars will
# route through the AMC Gateway.
#
# Usage:
#   ./score-my-agent.sh python my_agent.py
#   ./score-my-agent.sh node my_agent.js
#   ./score-my-agent.sh ./my-custom-agent --flag value
#
# Or use amc wrap directly:
#   amc wrap generic-cli -- python my_agent.py

set -euo pipefail

# ─── AMC Integration ───────────────────────────────────────────────
# The generic-cli adapter sets ALL common LLM env vars to route
# through the AMC Gateway. This covers:
#   - OpenAI:     OPENAI_BASE_URL, OPENAI_API_BASE, OPENAI_API_HOST
#   - Anthropic:  ANTHROPIC_BASE_URL, ANTHROPIC_API_URL
#   - Gemini:     GEMINI_BASE_URL
#   - xAI:        XAI_BASE_URL
#   - OpenRouter: OPENROUTER_BASE_URL
#   - Generic:    AMC_LLM_BASE_URL

AMC_GATEWAY_URL="${AMC_GATEWAY_URL:-http://localhost:3700}"

if [ $# -eq 0 ]; then
    echo "Usage: $0 <command> [args...]"
    echo ""
    echo "Examples:"
    echo "  $0 python my_agent.py"
    echo "  $0 node my_agent.js --verbose"
    echo "  $0 ./my-custom-binary"
    echo ""
    echo "Or use amc wrap directly:"
    echo "  amc wrap generic-cli -- <command> [args...]"
    exit 1
fi

echo "[AMC] Wrapping command: $*"
echo "[AMC] Gateway URL: ${AMC_GATEWAY_URL}"

# Set ALL provider env vars to point at AMC Gateway
export OPENAI_BASE_URL="${AMC_GATEWAY_URL}/v1"
export OPENAI_API_BASE="${AMC_GATEWAY_URL}/v1"
export OPENAI_API_HOST="${AMC_GATEWAY_URL}"
export ANTHROPIC_BASE_URL="${AMC_GATEWAY_URL}/v1"
export ANTHROPIC_API_URL="${AMC_GATEWAY_URL}/v1"
export GEMINI_BASE_URL="${AMC_GATEWAY_URL}/v1"
export XAI_BASE_URL="${AMC_GATEWAY_URL}/v1"
export OPENROUTER_BASE_URL="${AMC_GATEWAY_URL}/v1"
export AMC_LLM_BASE_URL="${AMC_GATEWAY_URL}/v1"

# Proxy settings
export HTTP_PROXY="${AMC_GATEWAY_URL}"
export HTTPS_PROXY="${AMC_GATEWAY_URL}"
export NO_PROXY="localhost,127.0.0.1,::1"

echo "[AMC] Environment configured — all LLM calls will be captured."
echo "─────────────────────────────────────────────────────"

# Execute the wrapped command
exec "$@"
# ────────────────────────────────────────────────────────────────────
