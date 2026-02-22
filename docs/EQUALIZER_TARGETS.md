# Equalizer Targets

Equalizer targets define the desired maturity state (`0..5`) for all 67 diagnostic questions.

## Principles

- Targets are governance intent, not measured truth.
- Measured values remain evidence-derived.
- Target artifacts are signed and transparency-logged.
- Agents cannot apply or tamper with targets.

## Commands

Initialize targets:

```bash
amc mechanic targets init --scope workspace
```

Set one question target:

```bash
amc mechanic targets set --q AMC-3.2.4 --value 4 --reason "Require stronger approval discipline"
```

Apply a full target file:

```bash
amc mechanic targets apply --file .amc/mechanic/targets.yaml --reason "Quarterly target refresh"
```

Verify signatures:

```bash
amc mechanic targets verify
```

## Excellence mode

Excellence sets all 67 target values to `5`. This still requires explicit apply + signature + audit trail.

## Profile examples

Code agent:
- stronger scores on tool governance, reproducibility, assurance, policy change controls.

Support agent:
- stronger scores on service reliability, escalation discipline, trustguarded outputs, value consistency.

Ops agent:
- stronger scores on change control, incident evidence, freeze/governance rigor, backup/restore checks.

Research agent:
- stronger scores on evidence traceability, source rigor, unknown handling, controlled experimentation.

## Guardrails

- `preventLoweringBelowMeasured` blocks accidental target regressions.
- `maxStepChangePerApply` prevents extreme one-shot shifts.
- `requireReasonForChange` enforces accountable governance updates.

These controls preserve a compass-over-maps workflow: targets can be tuned, but every change remains signed, reviewable, and tied to evidence-based recurrence.
