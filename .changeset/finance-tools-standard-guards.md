---
"agent-maturity-compass": patch
---

The opt-in finance tool composition now runs the standard governed-call guards (compiled policy, prompt injection, runtime firewall, signed budgets, network egress) ahead of its finance guards, requires the session id and the authenticated initiator, records that initiator on every payment approval so the proposer cannot approve its own payment (P1-78), and refuses a workspace with an active compiled policy. Native budget reservations are written inline, so they stay verifiable without the vault's blob key.
