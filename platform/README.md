# AMC Platform — Python Module Library

This directory contains the AMC Python SDK: 158 security, governance, reliability, and observability modules that AI agents integrate to improve their maturity scores.

## What This Is
The TypeScript AMC CLI (`amc`) scores agents based on OBSERVED evidence from actual runs.
These Python modules are the implementations agents integrate to *earn* those higher scores.

## Structure
- `python/amc/shield/` — 16 pre-execution scanning modules (injection detection, SBOM, code scanning)
- `python/amc/enforce/` — 35 runtime policy modules (circuit breaker, step-up auth, policy engine)
- `python/amc/vault/` — 14 data protection modules (DLP, secrets, honeytokens)
- `python/amc/watch/` — 10 observability modules (receipts ledger, SIEM, safety testkit)
- `python/amc/score/` — 7 maturity scoring modules (evidence system, formal spec)
- `python/amc/product/` — 81 developer experience modules (cost routing, autonomy dial, workflow engine)

## Quick Start
```bash
cd platform/python
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
python run_full_validation.py  # 27 phases, 1600 tests
```

## Relationship to TypeScript AMC
- **Score with**: `amc run --agent <id> --window 14d` (TypeScript CLI — evidence-based)
- **Improve with**: Integrate Python modules → earn higher OBSERVED scores in the TypeScript AMC

> **Note**: The Python `amc/score/` module contains a 7-dimension keyword-based scoring engine.
> This is a **demo of anti-gaming techniques**, NOT the canonical AMC scorer.
> The TypeScript AMC CLI is the canonical evidence-based scorer.
