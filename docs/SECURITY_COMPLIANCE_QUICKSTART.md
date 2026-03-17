# Security & Compliance Quickstart

If you care about agent risk, evidence quality, auditability, and deployment trust, start here.

## Goal

Understand whether AMC produces evidence and control surfaces strong enough for real security/compliance workflows.

## Start here

1. `docs/SECURITY.md`
2. `docs/THREAT_MODEL.md`
3. `docs/OPS_HARDENING.md`
4. `docs/EU_AI_ACT_COMPLIANCE.md`
5. `docs/AUDIT_BINDER.md`

## Suggested first commands

```bash
amc doctor
amc assurance run --all
amc audit binder create --framework eu-ai-act
amc compliance report --framework iso-42001
```

## Questions this path should answer

- Is the evidence chain tamper-resistant?
- Can the evaluated agent fake its maturity score?
- Are the controls documented clearly enough for review?
- Is there a deployment hardening story?
- Are the outputs usable in an audit or readiness review?
