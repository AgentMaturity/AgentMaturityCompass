# MECHANIC MODE

Mechanic Mode is the owner-controlled equalizer for target setting and upgrade planning. It is intentionally strict: targets are human-set and signed; completion is evidence-validated.

## What it controls

- 67-question equalizer targets (`0..5`) for an agent or org node.
- Target modes:
  - signed equalizer targets
  - excellence profile (`5` with evidence gates)
  - custom mixed targets
- Transformation plan regeneration when targets change.

## Core owner workflow

1. Open Mechanic Mode in console (`/console/mechanic.html` or `/w/:id/console/mechanic.html`).
2. Review current maturity vs target per question/layer.
3. Adjust target sliders (OWNER-only edit path).
4. Apply target changes (signed write + `HUMAN_TARGET_APPLY` audit).
5. Generate/refresh transformation plan.
6. Execute tasks through governance flow (work orders, approvals, assurance, policy updates).
7. Re-run loop and let tracker update statuses from evidence checkpoints.

## CLI equivalents

```bash
# target tuning
amc target set --question AMC-1.1 --level 3
amc target verify

# plan generation and tracking
amc transform plan --agent <agentId> --to excellence --window 14d
amc transform status --agent <agentId>
amc transform track --agent <agentId>

# renewal loop
amc loop run --agent <agentId>
amc forecast refresh --scope agent --target-id <agentId>
```

## How upgrade paths are produced

- Planner reads current signed evidence state.
- Gaps are mapped through signed transform-map interventions.
- Tasks are phase-grouped:
  - Phase 0 evidence/integrity foundations
  - Phase 1 governance/safety
  - Phase 2 capability uplift
  - Phase 3 concept/ecosystem alignment
  - Phase 4 sustainment/recurrence
- Tasks remain `BLOCKED`/`IN_PROGRESS`/`DONE`/`ATTESTED` based on deterministic checkpoints and signed attestations.

## Honest self-evaluation rules

- No free self-report completion.
- No agent ability to mark tasks done.
- Trust tiers and integrity/correlation gates cap claims when evidence is weak.
- Advisories and forecasts are deterministic and evidence-bound.

## Periodic recurrence

- Scheduler refreshes forecast and plan state after run/events and on cadence.
- Recommended cadence:
  - weekly for high/critical risk or low trust
  - biweekly otherwise
- Every cycle should end with:
  - signed artifacts updated
  - transparency/merkle roots advanced
  - `amc verify all --json` green.
