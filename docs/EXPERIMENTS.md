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

## Evidence Binding

A casebook result is `passed`, `failed` or `unavailable`. A case with no execution evidence, no tool action receipt to verify (when `requireReceipts` is set) or no readable correlation ratio (when `minCorrelationRatio` is above 0) is `unavailable`: it is neither a pass nor a behavioural failure. Named `requiredToolActions` must match a recorded tool name exactly, and every tool action receipt is verified against the ledger. Tokens come from `measuredUsage`, so a total and its components count once and partial usage stays unknown.

Two evidence designs exist:

- **Bound trials** (API: `baselineTrialId` and `candidateTrialId` on `runExperiment`, with a pinned baseline configuration file). Each case counts only signed ledger rows whose `caseExecution` meta is exactly `{ v: 1, casebookId, caseId, caseSha256, trialId, configDigest }`. Only bound reports can pass a gate.
- **Legacy windows.** Every case sees the whole agent window and no case gets a cost. A same-agent baseline window ends where the candidate window starts, so both sides never read the same evidence. Legacy reports stay readable but are never promotion-eligible.

An empty casebook, or a run in which no case is determinate on both sides, is refused instead of sealed.

## Stats Method

Experiment analysis is deterministic and reproducible. Rates, value points and statistics use only paired cases (determinate on both sides); the report counts cases, paired cases and excluded cases.

- fixed-seed paired bootstrap confidence interval (`95%`) over per-case value-point differences; fewer than two pairs is reported as `insufficient`, not as an interval
- `meanDifference`: raw difference of mean value points
- `effectSize`: standardized paired effect (Cohen's d_z), `null` when undefined (legacy reports stored the raw difference here)
- cost per success in tokens (`costUnit: "tokens"`), `null` when there is no success or usage is incomplete

No stochastic model judge is used.

## Gate Ergonomics

`amc experiment gate-template` scaffolds a policy JSON for consistent simulation gate setup:

- `strict`: tighter uplift/cost expectations
- `balanced`: sensible default for most upgrades
- `exploratory`: allows wider cost headroom while learning

`amc experiment gate` now prints threshold-by-threshold comparisons (uplift success, uplift value, cost ratio, regression policy) so pass/fail decisions are immediately interpretable in CI logs.

The gate and the bundle gate's `requireExperimentPass` share one evaluator, which returns `pass`, `fail` or `inconclusive`. A legacy report, fewer than `minPairedCases` paired cases (default 3), an insufficient interval and unknown cost are inconclusive; a zero baseline cost does not skip the cost check. `requireIntervalAboveZero` additionally requires the paired interval to exclude zero. Before deciding, `amc experiment gate` verifies the report seal, that the casebook is unchanged and that the experiment's candidate file is still admitted with the same digest. Its decision is `promote-candidate`, `keep-baseline` (the candidate fails policy) or `abstain` (the evidence cannot decide); only `promote-candidate` passes.

## Interpreting Uplift Responsibly

Use all three:
- uplift success rate
- uplift value points
- cost per success change

Avoid “win by cost-cutting only” regressions. Use `experiment gate` and CI value gates together.

The experiment report includes a no-hallucination disclaimer: conclusions are limited to measured signals and configured deterministic validators.
