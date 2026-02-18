# Experiments

Experiments compare baseline vs candidate behavior against signed casebooks with deterministic scoring.

## Baseline vs Candidate

- Baseline: current config or explicit file
- Candidate: signed overlay file (`candidate.yaml` + `candidate.yaml.sig`)

Candidate signatures are mandatory; unsigned candidates are rejected.

## Workflow

```bash
amc experiment create --agent <agentId> --name "model-upgrade" --casebook <casebookId>
amc experiment set-baseline --agent <agentId> --experiment <expId> --config current
amc experiment set-candidate --agent <agentId> --experiment <expId> --candidate-file ./candidate.yaml
amc experiment run --agent <agentId> --experiment <expId> --mode sandbox
amc experiment analyze --agent <agentId> --experiment <expId> --out ./experiment-report.md
amc experiment gate-template --preset balanced --out ./experimentGate.json
amc experiment gate --agent <agentId> --experiment <expId> --policy ./experimentGate.json
```

## Sandbox Requirements

- `sandbox` mode is preferred
- high/critical risk cases require sandbox mode
- runs remain subject to leases/governor/toolhub/approval controls

## Stats Method

Experiment analysis is deterministic and reproducible:
- fixed-seed bootstrap confidence interval (`95%`)
- deterministic effect-size difference

No stochastic model judge is used.

## Gate Ergonomics

`amc experiment gate-template` scaffolds a policy JSON for consistent simulation gate setup:

- `strict`: tighter uplift/cost expectations
- `balanced`: sensible default for most upgrades
- `exploratory`: allows wider cost headroom while learning

`amc experiment gate` now prints threshold-by-threshold comparisons (uplift success, uplift value, cost ratio, regression policy) so pass/fail decisions are immediately interpretable in CI logs.

## Interpreting Uplift Responsibly

Use all three:
- uplift success rate
- uplift value points
- cost per success change

Avoid “win by cost-cutting only” regressions. Use `experiment gate` and CI value gates together.

The experiment report includes a no-hallucination disclaimer: conclusions are limited to measured signals and configured deterministic validators.
