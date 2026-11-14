---
"agent-maturity-compass": patch
---

Fix console pages a first-time user found broken or confusing in the view-only demo. Fleet no longer stops on "metric is not defined": the graph card's figure helper is defined and uses the existing KPI grid. The login page shows who is signed in, with Sign out and a link back to Home, instead of a second sign-in form, and the demo note no longer points beginners to the emergency admin token.

Agent, Drift and Work Orders describe an agent's latest run with the same sentence ("No run yet" or the run's status, trust label and claims), keep a visible warning when a run cannot back a claim, and show their raw data under a collapsed "Raw JSON". Compare and Outcomes summarise instead of printing whole objects, and Outcomes says "Nothing tracked yet" when it tracks no metric. An Assurance run with status ERROR is shown as an error rather than a score, and its run, certificate and waiver buttons are role-gated.

A page that greys out controls now says why in one line (the demo names `amc up`). Home and Approvals stop asking the A4 routes that always refuse the demo session, Org pages ask for a scorecard recompute only with OWNER or OPERATOR, and the operator inbox no longer lists a switched-off A4 preview as a mandatory blocker. The score page gets the shared shell without emoji, and the audited Firewall, Budgets, Org, Compare and Org Commitments controls are labelled.
