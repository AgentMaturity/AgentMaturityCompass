# Economic Significance

AMC computes `EconomicSignificance` as a deterministic score and `EconomicSignificanceRisk` as a deterministic risk index.

## Inputs

Economic significance combines:

- Benefit signal (from `ValueScore` and economic dimension)
- Cost signal (from observed cost KPIs such as bridge/tool usage)
- Risk-quality signal (from assurance score and evidence context)

Weights come from signed value policy:

- `benefitWeight`
- `costWeight`
- `riskWeight`

## Risk Index

`EconomicSignificanceRisk` is higher-is-worse (`0..100`) and applies deterministic penalties for:

- no recent value events
- value regression
- rising costs
- insufficient evidence

Penalty constants are policy-controlled and signed.

## Regression Detection

AMC raises value regression when:

- `ValueScore` drops beyond configured threshold, or
- economic value declines while cost rises

This emits `VALUE_REGRESSION_DETECTED` and feeds advisories/forecasts for recurrence planning.

## Important Constraint

If evidence gates fail, AMC does not output strong ROI-style numerics. The output is marked `INSUFFICIENT_EVIDENCE` with explicit reasons. When the gates pass but no contract KPI measured a benefit, the score is `null` with the reason `VALUE_NOT_MEASURED`, never a score built on a 0 benefit.
