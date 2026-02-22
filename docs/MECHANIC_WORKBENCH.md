# Mechanic Workbench

Mechanic Workbench is the owner/operator control surface for moving from measured maturity to desired maturity without bypassing evidence or governance.

## Core model

- `measured` is computed from OBSERVED and ATTESTED evidence only.
- `desired` is the signed equalizer target (`0..5`) for each of the 67 questions.
- `gap` is deterministic (`desired - measured`) and highlights `UNKNOWN` evidence coverage explicitly.
- `plans` are deterministic and generated from the signed diagnostic bank and transform mappings (no LLM planner).

## What this does

- Captures signed target intent in `.amc/mechanic/targets.yaml`.
- Produces signed gap reports and signed plan artifacts in `.amc/mechanic/plans`.
- Produces signed simulation artifacts in `.amc/mechanic/simulations`.
- Emits transparency events for target/profile/plan/simulation/execute lifecycle.
- Emits SSE updates for realtime device-first console workflows.

## What this does not do

- It does not let agents set targets or run plan execution APIs.
- It does not mark maturity as improved during planning or simulation.
- It does not bypass approvals for SECURITY/GOVERNANCE actions.

## Deterministic planning

Planner output is reproducible for the same signed inputs:

- measured scorecard hash
- targets hash
- canon/bank versions
- CGX pack hash

Plan actions are restricted to AMC-supported execution kinds only:

- `POLICY_PACK_APPLY`
- `BUDGETS_APPLY`
- `TOOLS_APPLY`
- `APPROVAL_POLICY_APPLY`
- `PLUGIN_INSTALL`
- `ASSURANCE_RUN`
- `TRANSFORM_PLAN_CREATE`
- `FREEZE_SET`
- `BENCH_CREATE`
- `FORECAST_REFRESH`

## Simulation honesty rules

- Simulations are labeled as projected outcomes.
- If integrity/correlation evidence gates fail, simulation returns `INSUFFICIENT_EVIDENCE` and omits numeric deltas.
- Numeric outputs are always bands (`low/mid/high`), never promises.

## Execution safety

- Execution requires OWNER role plus valid signatures/trust.
- High-risk actions require approvals and quorum before execution.
- Each execution step is audited and transparency-logged.
- If signed mechanic artifacts are tampered, workspace readiness fails closed.

## Why this fits AMC

Mechanic Workbench supports continuous recurrence by combining recurring diagnostics, forecast checkpoints, and benchmark checkpoints in a repeatable cycle. It keeps unified clarity by showing measured vs desired maturity per question/dimension while preserving risk assurance through signatures, approvals, and fail-closed trust checks.
