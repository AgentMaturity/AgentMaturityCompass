# OpenClaw + AMC Baseline

Runnable starter blueprint for using AMC with OpenClaw.

## What this is

This blueprint gives you a practical path to:
- connect an OpenClaw-style agent to AMC
- generate a first score
- inspect traces
- run assurance
- review operational drift

## Uses these existing working assets

- `../openclaw/` — OpenClaw example config

## Quick start

```bash
./setup.sh
./run.sh
```

Manual flow:

```bash
npm i -g openclaw
curl -fsSL https://agentmaturity.co/install.sh | sh
amc up
amc wrap openclaw-cli -- openclaw run --config examples/openclaw/config.yaml
amc quickscore
amc trace list
amc observe timeline
amc assurance run --scope full
```

## Recommended workflow

1. Start AMC services with `amc up`
2. Run the OpenClaw example through AMC wrapping
3. Generate a baseline score
4. Inspect recent traces and evidence
5. Run the full assurance library
6. Review drift with observability commands

## Expected outputs

- baseline maturity score
- evidence-backed traces
- assurance results
- score history over time

## Next step

Use this blueprint with the docs in:
- `../../docs/STARTER_BLUEPRINTS.md`
- `../../docs/COMPATIBILITY_MATRIX.md`
