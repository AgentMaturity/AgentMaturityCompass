#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! command -v amc >/dev/null 2>&1; then
  echo "AMC CLI not found. Use the checksum-verified GitHub Release installer from the repository README."
  exit 1
fi

if ! command -v openclaw >/dev/null 2>&1; then
  echo "OpenClaw CLI not found. Install with: npm i -g openclaw"
  exit 1
fi

echo "== OpenClaw + AMC baseline =="
echo "Starting AMC services..."
amc up || true

echo "\nRunning wrapped OpenClaw example..."
amc wrap openclaw-cli -- openclaw run --config examples/openclaw/config.yaml || true

echo "\nSuggested next commands:"
echo "  amc quickscore"
echo "  amc trace list"
echo "  amc observe timeline"
echo "  amc assurance run --scope full"
