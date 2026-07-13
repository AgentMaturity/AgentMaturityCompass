#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! command -v amc >/dev/null 2>&1; then
  echo "AMC CLI not found. Use the checksum-verified GitHub Release installer from the repository README."
  exit 1
fi

echo "== CrewAI + AMC + GitHub Actions baseline =="
amc up || true

echo "\nRunning wrapped CrewAI example..."
echo "(Requires the crewai example dependencies and provider credentials.)"
amc wrap crewai-cli -- python examples/crewai/main.py || true

echo "\nSuggested next commands:"
echo "  amc quickscore"
echo "  amc assurance run --scope full"
echo "  amc leaderboard show"
echo "  Review: examples/crewai-amc-github-actions/github-actions-snippet.example.yml"
