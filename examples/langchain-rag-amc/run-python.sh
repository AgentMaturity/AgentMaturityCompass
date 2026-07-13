#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! command -v amc >/dev/null 2>&1; then
  echo "AMC CLI not found. Use the checksum-verified GitHub Release installer from the repository README."
  exit 1
fi

echo "== LangChain Python + AMC baseline =="
echo "Starting AMC services..."
amc up || true

echo "\nRunning wrapped LangChain example..."
echo "(Requires the langchain-python example dependencies and provider credentials.)"
amc wrap langchain-python -- python examples/langchain-python/main.py || true

echo "\nSuggested next commands:"
echo "  amc quickscore"
echo "  amc dataset create rag-baseline"
echo "  amc dataset import rag-baseline --file examples/langchain-rag-amc/dataset-cases.example.jsonl"
echo "  amc dataset run rag-baseline"
echo "  amc trace list"
