# Org Education → Ownership → Commitment (E/O/C)

AMC extends E/O/C from single-agent planning to node-level (team/function/process/enterprise).

Generated artifacts:
- `/Users/sid/AgentMaturityCompass/.amc/org/commitments/<nodeId>/<commitId>.md`
- `/Users/sid/AgentMaturityCompass/.amc/org/commitments/<nodeId>/<commitId>.md.sig`

Each artifact is signed and appended to transparency.

## Education Brief

```bash
amc org learn --node team-platform --out .amc/reports/team-platform-education.md
```

Includes:
- node-context explanation of 5 layers
- top gap questions
- gate requirements and evidence needed to progress

## Ownership Plan

```bash
amc org own --node team-platform --out .amc/reports/team-platform-ownership.md
```

Role split:
- OWNER: signed policy/target/budget/vault controls
- OPERATOR: run cadence, monitoring, reporting
- APPROVER/AUDITOR: approvals, attestations, cert gates
- AGENT: truth protocol + toolhub discipline + escalation behavior

## Commitment Plan (14/30/90)

```bash
amc org commit --node team-platform --days 30 --out .amc/reports/team-platform-commit.md
```

Includes:
- prioritized initiatives tied to highest gaps
- minimum evidence checklist to unlock next levels
- deterministic command runbook
- regression protection guardrails (freeze/gate patterns)

