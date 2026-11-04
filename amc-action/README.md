# AMC Action — Agent Maturity Compass for GitHub

> Run AMC eval on every PR. Post results as a comment. Fail on score drops. Upload artifacts.

> **Preview boundary:** this composite action is repository source, not a verified GitHub Marketplace listing. Pin a reviewed commit when testing it; do not use `@main` as a production trust boundary.

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

      # Replace <reviewed-commit-sha> with an immutable revision you reviewed.
      - uses: AgentMaturity/AgentMaturityCompass/amc-action@<reviewed-commit-sha>
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
| `amc-version` | `1.2.0` | Verified GitHub Release version; `local` builds the action checkout. npm is not a live channel. |
| `working-directory` | `.` | Directory to run AMC in |
| `answers-file` | (none) | JSON answers file: scores self-reported survey answers (`amc quickscore --rapid --answers`) instead of ledger evidence |

## Outputs

| Output | Description |
|--------|-------------|
| `score` | AMC composite score (float); empty when there is no evidence yet |
| `level` | Maturity level string (L0–L5); empty when there is no evidence yet |
| `passed` | Whether the gate passed (`true`/`false`) |
| `result-json` | Path to full AMC result JSON |

## Features

- **PR Comment** — Posts a formatted table with per-dimension scores. Updates existing comment on re-runs (no spam).
- **Score-Drop Detection** — Optionally compares HEAD vs base branch and fails if score regressed.
- **Badge** — Generates a shields.io badge in the step summary and as an artifact.
- **Artifacts** — Uploads `amc-result.json` and `amc-badge.md` for downstream consumption.
- **Configurable Gate** — Set `target-level` to enforce minimum maturity (e.g., L3 for production agents).

## Workspace and "no evidence yet"

When the working directory has no `.amc` workspace, the action creates one with `amc init --minimal --profile ci`. Its
vault passphrase is generated for the job, masked in the log and passed to later steps in `AMC_VAULT_PASSPHRASE`; the
workspace and its keys end with the job. A committed `.amc` workspace is used as it is: set `AMC_VAULT_PASSPHRASE` from a
repository secret in the job's `env`.

A fresh workspace has no evidence yet. The action reports that as a result, not as a crash and not as a score: the step
summary and the PR comment say "AMC: no evidence yet", the badge reads "no evidence yet", `score` and `level` are empty,
and the gate fails when `target-level` is above 0, naming that reason. With `fail-on-drop`, the base branch is still
scored: a measured base with no evidence on this branch fails the gate as "evidence removed", and the comparison is skipped
only when neither branch has evidence. Capture evidence first (`amc wrap <runtime> -- <your-agent-command>`), or score self-reported survey answers with `answers-file`.

## Advanced: Use Outputs in Downstream Steps

```yaml
- uses: AgentMaturity/AgentMaturityCompass/amc-action@<reviewed-commit-sha>
  id: amc
  with:
    target-level: '2'

- run: echo "Score is ${{ steps.amc.outputs.score }} (${{ steps.amc.outputs.level }})"
```

## Advanced: Score-Drop Protection

```yaml
- uses: AgentMaturity/AgentMaturityCompass/amc-action@<reviewed-commit-sha>
  with:
    fail-on-drop: 'true'
    target-level: '3'
```

## License

MIT — see [LICENSE](../LICENSE).
