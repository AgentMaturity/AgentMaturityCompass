# Outcomes

AMC Outcomes adds a value layer on top of maturity scoring. It answers: "Is this agent creating measurable value over time without compromising trust and safety?"

## Outcome Contracts

Per-agent contract:
- `/Users/sid/AgentMaturityCompass/.amc/agents/<agentId>/outcomes/contract.yaml`
- `/Users/sid/AgentMaturityCompass/.amc/agents/<agentId>/outcomes/contract.yaml.sig`

The contract defines:
- value metrics
- thresholds
- evidence/trust requirements
- reporting window defaults

Contracts are owner/auditor signed. If signature is invalid, reports are marked `UNTRUSTED CONFIG` and cannot claim green value status.

## Trust Tiers For Outcomes

- `OBSERVED`: strongest; emitted by trusted AMC services (ToolHub, webhook ingest with verified auth)
- `ATTESTED`: imported/manual with auditor attestation
- `SELF_REPORTED`: weakest; cannot support high-stakes claims

Hard behavior:
- low observed coverage forces `UNKNOWN` metric status
- self-reported-only evidence cannot satisfy above level 2

## Ingesting Feedback/KPIs Without Secrets

Studio endpoints:
- `POST /feedback/ingest`
- `POST /outcomes/ingest`

Authentication:
- owner/operator session, or
- HMAC signature with a secret stored in vault

Secrets are referenced by `secretRef` in config and resolved from vault; secrets are never stored in plaintext config files.

## Deterministic Value Computation

AMC does not use model-judging for outcomes.

Computation is deterministic over:
- signed contract
- verified outcome events
- relevant audited evidence (usage/audit signals)

Per-metric output includes:
- measured value
- sample size
- trust coverage
- status (`SATISFIED|PARTIAL|MISSING|UNKNOWN`)
- reasons and evidence refs
- "What would make this SATISFIED?" checklist

Aggregate output includes:
- `ValueScore` (0..100)
- category subscores: Emotional / Functional / Economic / Brand / Lifetime
- `EconomicSignificanceIndex` (0..100)
- `ValueRegressionRisk` (0..100)

## CLI

```bash
amc outcomes init --agent <agentId>
amc outcomes verify --agent <agentId>
amc outcomes report --agent <agentId> --window 14d --out .amc/agents/<agentId>/outcomes/reports/latest.json
amc outcomes report fleet --window 30d --out .amc/reports/fleet-outcomes.md
amc outcomes diff <reportA.json> <reportB.json>
amc outcomes attest --agent <agentId> --metric <metricId> --value <value> --reason "..."
```
