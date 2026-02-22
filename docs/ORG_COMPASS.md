# ORG Compass

ORG Compass adds signed, trust-aware comparative scorecards across:
- individual agent
- team
- function
- process
- enterprise
- ecosystem (via federation benchmarks)

## Org Model

`/Users/thewisecrab/AMC/.amc/org.yaml` defines:
- `nodes`: `ENTERPRISE | TEAM | FUNCTION | PROCESS | ECOSYSTEM`
- `memberships`: agent-to-node assignments (one agent can be in multiple nodes)
- `policies.defaultsByNode`: inherited node-level defaults (risk tier, policy refs)

`org.yaml` is signed (`/Users/thewisecrab/AMC/.amc/org.yaml.sig`). Invalid signature marks org views untrusted and applies display-level caps.

## Commands

```bash
amc org init
amc org verify
amc org add node --type TEAM --id team-ml --name "ML Team" --parent enterprise
amc org assign --agent agent_prbot --node team-ml
amc org unassign --agent agent_prbot --node team-ml
amc org score --window 14d
amc org report --node team-ml --out .amc/reports/team-ml.md
amc org compare --node-a team-ml --node-b function-eng --out .amc/reports/compare.md
```

## Honest Aggregation

Node scorecards use deterministic robust operators:
- weighted median (headline)
- weighted trimmed mean (supporting analytics)
- weighted P10/P50/P90 and IQR distributions

Weights:
- base membership weight
- trust multiplier (`OBSERVED_HARDENED/OBSERVED/ATTESTED/SELF_REPORTED`)
- integrity multiplier (`clamp(IntegrityIndex, 0.2..1.0)`)
- freeze/config penalty multiplier (`0.8`)

## Evidence-Gap Protection

At org-node level, if:
- OBSERVED coverage `< 0.5`, or
- median correlation ratio `< 0.9`

then:
- trust label becomes `LOW TRUST`
- headline maturity is capped at `<= 3.0` for display
- console shows an explicit evidence-gap warning

## Unified Clarity

Org scorecards summarize:
- headline overall + layers + 67 question medians
- trust/integrity/evidence coverage
- top 10 maturity gaps vs target medians
- top 5 systemic risks (indices)
- deterministic “why capped” reasons
