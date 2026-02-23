# Compliance Maps

AMC compliance reports are **evidence-linked signals**, not legal certifications.

## What It Does
- Loads signed `.amc/compliance-maps.yaml` (+ `.sig`).
- Evaluates deterministic requirements per category:
  - required evidence event types with minimum OBSERVED ratio
  - required assurance pack score thresholds
  - required absence of denylisted audit events
- Produces category status: `SATISFIED | PARTIAL | MISSING | UNKNOWN`.
- Includes exact evidence references (event IDs/hashes, run context) and a "what to collect next" checklist.

## Built-in Framework Families
- `SOC2` (Trust Services categories)
- `NIST_AI_RMF` (Govern/Map/Measure/Manage)
- `ISO_27001` (high-level control families)
- `ISO_42001` (ISO/IEC 42001:2023 AIMS clauses 4-10 + ISO 42005 Impact Assessment + ISO 42006 Conformity Evidence)
- `EU_AI_ACT` (Regulation (EU) 2024/1689 — high-risk AI obligations: Arts. 9-15, 17, 27, 72, 73, 86)

AMC intentionally avoids legal-claim language and does not infer unseen controls.

## Commands
- `amc compliance init`
- `amc compliance verify`
- `amc compliance report --framework SOC2 --window 14d --out .amc/reports/soc2.md`
- `amc compliance fleet --framework SOC2 --window 30d --out .amc/reports/fleet-compliance.json`
- `amc compliance diff <reportA.json> <reportB.json>`

## Console
Use `/console/compliance` to view per-agent and fleet coverage with trust-tier breakdown.
