# Score Dispute Runbook

Use this when an assessor, operator, or stakeholder disputes an AMC score/result.

`<monitor sha256>` below is the fingerprint of `.amc/keys/monitor_ed25519.pub` (`shasum -a 256`), recorded outside the workspace when it was created. Without that pin (or `AMC_EXPECTED_MONITOR_FINGERPRINT`, or a trust list), `amc verify all` reports the ledger UNANCHORED and exits 1; that alone is not evidence of corruption.

## Intake Checklist

- disputed `runId`
- agent ID / workspace
- question IDs under dispute (if known)
- claimed issue type: evidence omission, wrong scoring, stale window, or integrity concern

## Evidence Preservation

1. Capture current state and report.
```bash
amc history
amc report <runId>
amc verify all --json --expect-monitor <monitor sha256>
amc transparency verify
```
2. Do not edit policy/evidence files until triage is complete.

## Triage

1. Reconstruct scoring inputs.
   - confirm run window and agent context from `amc report <runId>`
   - confirm gating outcomes (`UNKNOWN`, trust-tier caps, evidence minimums)
2. Validate question interpretation.
```bash
amc explain <questionId>
amc diagnostic render --agent <agentId> --format md
```
3. Compare against neighboring runs for drift/regression context.
```bash
amc compare <runIdA> <runIdB>
```

## Decision Rules

- If evidence/signature integrity fails: invalidate score, open integrity incident, move to corruption runbook.
- If gates were applied correctly and evidence is unchanged: uphold score.
- If data window or agent selection was wrong: re-run diagnostic with corrected scope and supersede prior run.

## Corrective Actions

1. Re-run with explicit, corrected inputs.
```bash
amc agent use <agentId>
amc run --window <window>
```
2. Publish dispute outcome with:
   - original run ID
   - corrected run ID (if any)
   - rationale and evidence references
   - approver/auditor sign-off

## Exit Criteria

- dispute classification resolved (`upheld` or `corrected`)
- decision documented with reproducible commands and run IDs
- affected stakeholders notified with evidence-backed summary
