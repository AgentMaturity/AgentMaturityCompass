#!/usr/bin/env bash
# AMC Install Script
# Usage: curl -fsSL https://thewisecrab.github.io/AgentMaturityCompass/install.sh | sh
set -euo pipefail

GREEN='\033[0;32m'
AMBER='\033[0;33m'
RESET='\033[0m'

echo ""
echo "🧭 Agent Maturity Compass — Install"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if command -v amc &>/dev/null; then
  CURRENT=$(amc --version 2>/dev/null || echo "unknown")
  echo "AMC is already installed (${CURRENT})"
  echo "To update: npm update -g agent-maturity-compass"
  exit 0
fi

if command -v npm &>/dev/null; then
  echo "Installing via npm..."
  npm install -g agent-maturity-compass
  echo -e "${GREEN}✓ AMC installed via npm${RESET}"
elif command -v brew &>/dev/null; then
  echo "Installing via Homebrew..."
  brew tap thewisecrab/tap 2>/dev/null || true
  brew install amc
  echo -e "${GREEN}✓ AMC installed via Homebrew${RESET}"
else
  echo -e "${AMBER}Node.js not found.${RESET}"
  echo "Install Node.js 20+ from: https://nodejs.org"
  echo "Then run: npm install -g agent-maturity-compass"
  exit 1
fi

echo ""
echo "Get started:"
echo "  amc init           — initialize workspace"
echo "  amc quickscore     — score your agent in 2 minutes"
echo "  amc guide --go     — generate + apply guardrails"
echo ""
echo "Docs: https://thewisecrab.github.io/AgentMaturityCompass/"
