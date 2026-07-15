# Run AMC in CI (GitHub Action)

Tools become defaults when they live in the loop, not when they're run by hand.
This Action makes "is this agent safe to ship?" a check on every push and PR —
it installs AMC, scores the agent across all 8 surfaces, emits GitHub
annotations, and fails the build below a grade you choose.

```yaml
name: agent-trust
on: [pull_request, push]

jobs:
  amc:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: AgentMaturity/AgentMaturityCompass@main   # pin to a release tag for stability
        with:
          fail-below: B      # fail the build if the overall grade drops below B
          fix: "true"        # also generate a signed fix plan for any gaps
```

## Inputs

| Input | Default | Meaning |
|---|---|---|
| `fail-below` | `B` | Fail the job if the overall grade is below this (`A+`…`F`). |
| `fix` | `false` | Also run `amc run --fix` to generate a signed fix plan for any gaps. |

## What you get in the PR

- **Inline annotations** on the failing surfaces (via `amc run --ci`).
- **A hard gate**: the job exits non-zero when the grade is below `fail-below`,
  so the PR can be blocked until the agent meets the bar.
- **A fix plan** (when `fix: "true"`) staged under `.amc/fix-plan/` with the
  exact one-command to close each gap — so a red check comes with its remedy.

## Equivalent local command

The Action is a thin wrapper over the same command you run locally, so CI and
your terminal agree:

```bash
amc run --ci --fail-below B --fix
```

## Notes

- The Action installs AMC from the pinned public release via the verified
  installer (`install.sh` checks archives against the published `SHA256SUMS`),
  so it works today, before the npm package is live. Once `agent-maturity-compass`
  is on npm, you can swap the install step for `npx agent-maturity-compass`.
- Pin `uses:` to a release tag (not `@main`) for reproducible CI.
