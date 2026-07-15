# One-command fix — `amc run --fix`

AMC does not just grade an agent; it can hand you the fixes. `amc run --fix`
scores the agent across all eight surfaces and then generates a **signed,
prioritized fix plan** that turns every weak surface into a concrete next step.

```bash
amc run --fix
```

For each surface below target the plan gives you:

- **The problem**, in plain language (the flagged gap for that surface).
- **The fix** — what to do to raise it.
- **The exact one-command to apply it** (reusing AMC's own commands — `amc
  domain apply`, `amc vault init`, `amc monitor`, `amc comply init`, `amc
  passport create`, `amc shield analyze`, `amc improve`), so nothing is invented.
- **A generated starter artifact where one applies** — e.g. a ready-to-review
  `guardrails.yaml` for Enforce or a `metrics.yaml` for Watch.

The whole plan is canonicalized and hashed into a tamper-evident receipt, and
written to `.amc/fix-plan/<runId>/`:

```
.amc/fix-plan/<runId>/
  fix-plan.json        # the signed plan (with receiptHash)
  fix-plan.md          # human-readable
  enforce-guardrails.yaml   # generated starter artifacts (when applicable)
  watch-metrics.yaml
```

Because the plan is generated right after the score, `amc run --fix` pairs
naturally with the CI gate: when a run fails `--fail-below`, you also get the
exact plan to get back above the bar.

```bash
amc run --fail-below B --fix
```

The plan is a deterministic, signed artifact: the same score always produces
the same plan and the same receipt, so plans are diffable and verifiable.

> This is the first step of "AMC steers agents, not just scores them." The
> generated artifacts are staged for review rather than force-applied, so you
> stay in control of what changes; apply each with its one-command.
