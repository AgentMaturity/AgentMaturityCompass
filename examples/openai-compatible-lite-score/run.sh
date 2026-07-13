#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! command -v amc >/dev/null 2>&1; then
  echo "AMC CLI not found. Use the checksum-verified GitHub Release installer from the repository README."
  exit 1
fi

echo "== OpenAI-compatible app + AMC lite-score =="
echo "Starting with lite scoring..."
amc lite-score || true

echo "\nSuggested next commands:"
echo "  amc dataset create app-baseline"
echo "  amc dataset import app-baseline --file examples/openai-compatible-lite-score/dataset-cases.example.jsonl"
echo "  amc dataset run app-baseline"
echo "  amc business report"
