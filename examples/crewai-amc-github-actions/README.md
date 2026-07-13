# CrewAI + AMC + GitHub Actions

Starter blueprint for evaluating CrewAI workflows with AMC and preparing for CI gating.

## Uses these existing working assets

- `../crewai/`
- `../../docs/integrations/ci-cd.md`

## Quick start

```bash
./setup.sh
./run.sh
```

Manual flow:

```bash
curl -fsSL https://agentmaturity.co/install.sh | sh
amc up
amc wrap crewai-cli -- python examples/crewai/main.py
amc quickscore
amc assurance run --scope full
amc leaderboard show
```

## Suggested CI path

Use AMC in CI to:
- run a baseline score
- fail builds below target maturity
- export assurance or compliance artifacts

## Follow-up docs

- `../../docs/STARTER_BLUEPRINTS.md`
- `../../docs/integrations/ci-cd.md`
- `../../docs/COMPATIBILITY_MATRIX.md`
