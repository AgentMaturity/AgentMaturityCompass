# Why AMC

AMC is a local-first trust stack for AI agents. It helps teams answer one practical question: can this agent be trusted to run, change things, and produce evidence that another person can inspect?

## The Short Version

Most tools measure prompts, traces, or isolated eval cases. AMC measures operational maturity: what the agent can do, what evidence exists, what controls surround it, and what risks remain.

## What It Gives You

| Need | AMC surface | Output |
|---|---|---|
| Score | Score | L0-L5 maturity, gap analysis, next actions |
| Evidence | Vault, Watch | Signed evidence, traces, drift signals, reports |
| Guardrails | Shield, Enforce | Adversarial packs, runtime checks, approval boundaries |
| Governance | Comply, Fleet, Passport | Compliance maps, fleet comparisons, portable trust identity |
| Business risk | Business commands | Expected annual loss, ROI, heatmaps, GRC treatment-plan export |

## Five-Minute Proof Path

```bash
npx agent-maturity-compass quickscore
amc quickstart --startup-plan --role cto
amc business risk --maturity 3 --baseline-frequency 4 --incident-cost 50000 --json
amc business grc-export --portfolio risk-portfolio.json --out grc-treatment-plan.csv
```

## What Makes AMC Different

- It distinguishes placeholder scores from measured maturity.
- It prefers observed and attested evidence over self-reported claims.
- It connects technical safety to buyer-facing proof: reports, badges, board briefs, and risk registers.
- It is MIT licensed and self-hosted by default.

## Current Boundary

AMC is not a hosted certification authority, legal opinion, insurance model, or third-party benchmark operator. It gives teams a reproducible local trust workflow and exportable artifacts they can verify.
