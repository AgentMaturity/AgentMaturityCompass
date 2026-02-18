# Incident Response Readiness

This runbook defines AMC operator actions for trust, safety, or integrity incidents.

## Trigger Conditions

Start incident workflow immediately when any of the following occurs:

- readiness endpoint fails closed on trust-critical checks
- signature/proof verification failure on policy/bundle/cert/binder artifacts
- unexpected freeze events or repeated governance denials
- notary trust break (unreachable notary, fingerprint mismatch, attestation regression)

## Severity Bands

- **SEV-1**: active integrity compromise or untrusted promoted release
- **SEV-2**: trust degradation with production risk, but no confirmed compromise
- **SEV-3**: contained policy/evidence discrepancy requiring remediation

## First 15 Minutes

1. Contain: pause promotion + new high-risk execution paths.
2. Preserve: collect current signed evidence artifacts (do not mutate originals).
3. Verify: run offline verification commands for bundle/cert/bom/proof.
4. Triage: classify severity and start incident timeline.

## Evidence Collection Commands

```bash
# trust/readiness posture
amc notary status

# verify core attestation artifacts
amc bundle verify .amc/agents/<agentId>/bundles/latest.amcbundle
amc assurance cert verify .amc/assurance/certificates/latest.amccert
amc bom verify --in ./amc-bom.json --sig ./amc-bom.json.sig --pubkey .amc/keys/auditor_ed25519.pub
amc transparency merkle verify-proof .amc/transparency/proofs/<entryHash>.amcproof

# controlled external disclosure (if requested)
amc audit request list
amc audit binder verify ./exports/latest.amcaudit
```

## Communications Discipline

- Use evidence IDs/hashes in status updates, not raw sensitive payloads.
- Separate facts (verified) from hypotheses (unverified).
- Track every decision with timestamp + owner.

## Recovery Exit Criteria

Do not close incident until all are true:

- [ ] root cause identified and documented
- [ ] all impacted attestations regenerated and reverified
- [ ] readiness/trust checks pass in target environment
- [ ] retrospective includes prevention actions and owners

## Drill Cadence

- Monthly: tabletop review of this runbook
- Quarterly: live drill with backup restore + attestation re-verification
- Post-incident: mandatory readiness-check run and checklist refresh

## Automation Check

Run the readiness checker:

```bash
npm run check:incident-readiness
```

Use `--strict` to fail on warning-level gaps:

```bash
node scripts/incident-readiness-check.mjs --strict
```
