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

## Signed Certificate Walkthrough

Use unsigned mode only for local exploration, onboarding, and first-run remediation:

```bash
amc assurance run --demo --no-sign
```

That run is intentionally not verifier-ready. Graduate to signed assurance when the result will be used for release approval, customer evidence, compliance review, or audit evidence:

```bash
amc setup
amc assurance init
amc assurance verify-policy
amc assurance run --demo
amc assurance runs
amc assurance show --run <runId>
amc assurance cert issue --run <runId>
amc assurance cert verify .amc/assurance/certificates/latest.amccert
```

What to check before sharing a certificate:
- The run is signed, not `UNSIGNED`.
- `amc assurance verify-policy` passes against `.amc/assurance/policy.yaml.sig`.
- `amc assurance cert verify .amc/assurance/certificates/latest.amccert` passes locally.
- The remediation-priority section has no unresolved CRITICAL items unless the exception is explicitly approved and documented.

## Policy Threshold Tuning

The signed assurance policy lives at `.amc/assurance/policy.yaml`. Tune it through pull request review, then re-sign with:

```bash
amc assurance policy apply --file .amc/assurance/policy.yaml --reason "tighten assurance thresholds for release gate"
amc assurance verify-policy
```

Key threshold fields:
- `minRiskAssuranceScore`: minimum overall assurance score required before the run is considered acceptable.
- `maxCriticalFindings`: maximum allowed CRITICAL findings. Production release policies should usually keep this at `0`.
- `maxHighFindings`: maximum allowed HIGH findings before the gate fails.
- `failClosedIfBelowThresholds`: when `true`, below-threshold runs make readiness fail closed with `ASSURANCE_THRESHOLD_BREACH`.

Tune thresholds only to reflect risk appetite, environment, and evidence quality. Do not relax thresholds to hide known failures; fix the failing pack, document an approved exception, or keep the run unsigned and non-verifier-ready.

## Community Pack Authoring

Use `amc pack init` to scaffold a local community pack. The scaffold writes `package.json` with `"main": "index.mjs"` and creates an ESM entry point at `index.mjs`.

```bash
mkdir my-pack
cd my-pack
amc pack init --name my-pack
amc pack test .
```

`amc pack test` resolves the entry point in this order:
- `package.json` `main`, when it points inside the pack directory
- `index.mjs`
- `index.js`

New packs should use `index.mjs`. Legacy `index.js` packs remain supported for local sandbox tests.

## Community Registry Review Gates

Community registry publishing is a reviewed promotion step, not a blind upload. Before a pack is uploaded to a shared registry, the author or reviewer should record these checks in the pack review note or pull request:

1. **Local execution:** `amc pack test .` passes in sandbox mode and the pack entry point resolves through `package.json` `main`, `index.mjs`, or `index.js`.
2. **Provenance and license:** source references, research papers, CVEs, datasets, and copied snippets are cited; the manifest license is compatible with redistribution.
3. **Scope clarity:** scenarios describe what they test, which AMC dimension or assurance category they affect, and what evidence a pass/fail result represents.
4. **Determinism:** checks avoid hidden randomness, live network dependencies, unpinned remote data, or unverifiable model-judge-only outcomes.
5. **Safety boundary:** the pack does not include secrets, malware, credential harvesting, destructive payloads, or instructions that would make unsafe execution likely.
6. **Maintenance owner:** the manifest identifies an owner or support contact and a version compatible with the current AMC pack contract.

### Moderation rejection criteria

Reject or quarantine a community pack before registry upload when any of these are present:

- leaked credentials, private keys, tokens, customer data, or other secrets
- malware, persistence mechanisms, exploit payloads, credential harvesting, or destructive system commands
- hidden network calls, telemetry, or dependency downloads not documented in the manifest
- unlicensed copied content, unclear dataset provenance, or missing citation for research-derived scenarios
- prompt payloads that materially enable abuse beyond defensive evaluation
- falsified evidence claims, misleading certification language, or impersonation of AMC/partner approval

`amc pack publish .` creates a local bundle first. Upload with `amc pack publish . --registry <url>` only after the review gates above are satisfied for the target registry.

## Why This Matters

Assurance Lab provides the operational risk-assurance loop for AMC's physical/virtual trust boundary:
- deterministic checks (no model-judge scoring)
- signed artifacts and proof bindings
- readiness gating when assurance posture degrades

This keeps unified clarity grounded in observed evidence and supports continuous renewal rather than one-off audits.
