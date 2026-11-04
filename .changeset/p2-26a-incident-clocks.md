---
"agent-maturity-compass": minor
---

Incident clocks now start when an incident opens (P2-26 slice A, experimental).

- `startIncidentClocks` records once, in the signed, append-only `incident_clock_runs` ledger table (migration 15), which F4 clocks apply, decided from the active compiled plan and the deployment profile it pins. A clock whose jurisdiction or entity type the plan declares absent never starts. One the plan cannot decide is `NEEDS_CLASSIFICATION` until a person records a signed `REPORT_REQUIRED` or `NO_REPORT_REQUIRED` oversight decision naming it. Without an active plan the run is `not_evaluated`.
- The ledger runs incident detectors after each audit row commits: drift, assurance failure, freeze, budget, `outcome_unknown` actions, blocked residency routes and break-glass use each open one incident per trigger id. Auto-assembled incidents are now signed over the payload `verifyIncidentSignature` checks, and drift incidents keep the trigger id they are deduplicated on.
- Notice drafts (JSON and markdown) carry the deadline, recipients, a checklist, the evidence packet's missing items and the banner "Draft for human review. AMC does not file notices." Nothing is sent. `amc incident show <id> --clocks [--packet <dir>]` and `GET /api/v1/incidents/:id/clocks` without `station` show them; the operator inbox lists `NEEDS_CLASSIFICATION`, `DUE_SOON` and `OVERDUE` clocks.
- Every clock stays experimental until the D-08 experts approve it.
