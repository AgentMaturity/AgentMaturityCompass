---
"agent-maturity-compass": patch
---

Read run history the way gates read the latest run. Bench export, forecasts, org scorecards and fleet failure-risk indices now count a diagnostic run only when its seal verifies, it names the agent being read and the ledger `runs` table anchors it with the same hash, seal and status. They refuse with the reason when a sealed run was copied from another agent, has no ledger row, or the ledger records a sealed run of the agent whose file is missing or no longer trusted, so history cannot be thinned by deleting files. The drift detector and the trust-drift monitor leave such runs out and report them as UNVERIFIED instead of refusing, so a planted run can neither trigger nor silence an alert.
