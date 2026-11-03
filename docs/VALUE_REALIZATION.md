# Value Realization Engine

The Value Realization Engine is AMC's evidence-bound layer for measuring business impact across five value dimensions:

- Emotional Value
- Functional Value
- Economic Value
- Brand Value
- Lifetime Value

It is deterministic and privacy-safe:

- No LLM scoring for value, ROI, or risk.
- No raw prompts or raw model I/O in value artifacts.
- No free-text value claims; only allowlisted numeric/categorical inputs.
- Every policy, contract, snapshot, and report is signed.

## What It Measures

Per scope (`WORKSPACE`, `NODE`, `AGENT`), AMC computes:

- KPI normalization and baseline deltas
- Five value dimensions (0..100)
- Composite `ValueScore` (weighted)
- `EconomicSignificance` and `EconomicSignificanceRisk`
- Deterministic attribution summaries using correlation IDs

## What It Does Not Measure

- It does not infer narrative value from unstructured text.
- It does not trust agent self-claims as strong evidence.
- It does not produce strong numeric claims when gates fail.

## Evidence Gating And Honesty

Strong value claims require policy gates:

- integrity index threshold
- correlation ratio threshold
- observed-share threshold
- self-reported-share ceiling
- notary health check when trust mode requires it

If gates fail:

- status is `INSUFFICIENT_EVIDENCE`
- numeric value outputs are nulled
- reasons are explicit and signed

A gate input that nothing measured is `null` in `gates`, never 0: the integrity index when no diagnostic run is in the lookback, and the observed and self-reported shares when the window has no value event. A KPI with no events has a `null` trust mix. A minimum above 0 then fails with `integrityIndex not measured` or `observedShare not measured (no value events)`.

## Recurrence

Value snapshots/reports are refreshed on cadence and key events (diagnostic completion, prompt updates, plugin installs, approvals, release verification). This supports continuous recurrence with realtime unified clarity.
