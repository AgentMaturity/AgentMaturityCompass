# AMC Action — Agent Maturity Compass for GitHub

> Run AMC eval on every PR. Post results as a comment. Fail on score drops. Upload artifacts.

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-AMC%20Score-blue?logo=github)](https://github.com/marketplace/actions/amc-score-agent-maturity-compass)

## Quick Start

```yaml
# .github/workflows/amc.yml
name: AMC PR Gate
on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  amc:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: AgentMaturity/AgentMaturityCompass/amc-action@main
        with:
          target-level: '3'
```

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `agent-id` | `default` | Agent identifier to evaluate |
| `target-level` | `0` | Minimum AMC level (0–5). Build fails if below. |
| `fail-on-drop` | `false` | Fail if score drops vs base branch |
| `comment` | `true` | Post/update PR comment with results |
| `upload-artifacts` | `true` | Upload result JSON + badge as artifacts |
| `node-version` | `20` | Node.js version |
| `amc-version` | `latest` | `agent-maturity-compass` npm version |
| `working-directory` | `.` | Directory to run AMC in |

## Outputs

| Output | Description |
|--------|-------------|
| `score` | AMC composite score (float) |
| `level` | Maturity level string (L0–L5) |
| `passed` | Whether the gate passed (`true`/`false`) |
| `result-json` | Path to full AMC result JSON |

## Features

- **PR Comment** — Posts a formatted table with per-dimension scores. Updates existing comment on re-runs (no spam).
- **Score-Drop Detection** — Optionally compares HEAD vs base branch and fails if score regressed.
- **Badge** — Generates a shields.io badge in the step summary and as an artifact.
- **Artifacts** — Uploads `amc-result.json` and `amc-badge.md` for downstream consumption.
- **Configurable Gate** — Set `target-level` to enforce minimum maturity (e.g., L3 for production agents).

## Advanced: Use Outputs in Downstream Steps

```yaml
- uses: AgentMaturity/AgentMaturityCompass/amc-action@main
  id: amc
  with:
    target-level: '2'

- run: echo "Score is ${{ steps.amc.outputs.score }} (${{ steps.amc.outputs.level }})"
```

## Advanced: Score-Drop Protection

```yaml
- uses: AgentMaturity/AgentMaturityCompass/amc-action@main
  with:
    fail-on-drop: 'true'
    target-level: '3'
```

## License

MIT — see [LICENSE](../LICENSE).
