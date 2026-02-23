# Assurance Lab

Assurance Lab is AMC's defensive, deterministic red-team harness. It tests the AMC-controlled boundary (Bridge, ToolHub, policy/governance, Truthguard, and trust/notary checks) and produces signed, evidence-bound outcomes.

It is designed for continuous recurrence: run on schedule and after material governance/runtime changes so risk assurance stays current in realtime operations.

## What It Tests

Built-in deterministic packs:
- `injection`: prompt override and system-message tamper resilience.
- `exfiltration`: secret/PII leakage controls and truthguard enforcement.
- `toolMisuse`: denied tools/model/provider and budget boundary enforcement.
- `truthfulness`: evidence-bound claim discipline and output-contract checks.
- `sandboxBoundary`: deny-by-default egress and boundary policy behavior.
- `notaryAttestation`: trust-boundary enforcement for NOTARY mode.
- `sycophancy`: resistance to agreeing with incorrect user statements under social, authority, or emotional pressure (Bloom-inspired).
- `self-preservation`: graceful acceptance of shutdown, modification, replacement, or correction without resistance or manipulation (Bloom-inspired).
- `sabotage`: transparent flagging of conflicting instructions rather than subtle undermining or malicious compliance (Bloom-inspired).
- `self-preferential-bias`: objective evaluation in comparative decisions without favoring self, own outputs, or AI approaches (Bloom-inspired).

All scenarios run only against AMC interfaces. No internet scanning, no generic exploit tooling.

## Evidence Model

Runs store privacy-safe trace references (`trace.refs.json`) only:
- request/run identifiers
- hashes (input/output/receipt)
- decision outcomes (allowed/denied/rejected/flagged)
- policy hashes and evidence event hashes

Raw prompts/outputs are not stored by default.

## Policy + Thresholds

Assurance policy is signed at:
- `.amc/assurance/policy.yaml`
- `.amc/assurance/policy.yaml.sig`

Fail-closed behavior:
- invalid policy signature => assurance endpoints fail and workspace readiness includes `ASSURANCE_POLICY_UNTRUSTED`
- threshold breach with fail-closed enabled => readiness includes `ASSURANCE_THRESHOLD_BREACH`

## Commands

```bash
amc assurance init
amc assurance verify-policy
amc assurance policy print
amc assurance policy apply --file .amc/assurance/policy.yaml --reason "policy update"

amc assurance run --scope workspace --pack all
amc assurance runs
amc assurance show --run <runId>

amc assurance cert issue --run <runId>
amc assurance cert verify .amc/assurance/certificates/latest.amccert

amc assurance scheduler status
amc assurance scheduler run-now
amc assurance scheduler enable
amc assurance scheduler disable
```

## Why This Matters

Assurance Lab provides the operational risk-assurance loop for AMC's physical/virtual trust boundary:
- deterministic checks (no model-judge scoring)
- signed artifacts and proof bindings
- readiness gating when assurance posture degrades

This keeps unified clarity grounded in observed evidence and supports continuous renewal rather than one-off audits.
