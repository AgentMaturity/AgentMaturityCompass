---
"agent-maturity-compass": patch
---

The Technology station operating profile now requires two approvals from distinct users for `WRITE_HIGH` actions, with a 15-minute approval window. Before, it required one approval with no distinct-user rule and a 60-minute window, which is looser than the shipped default approval policy. Activating that profile, or adapting a Technology agent in A4 Adapt, therefore reported three widenings on `approvalPolicy.WRITE_HIGH` and needed an explicit widening acknowledgement.

The Technology profile's digest changes. A Technology operating profile emitted earlier (`amc-operating-profiles/<agent>/technology.operating-profile.json`) no longer matches a fresh one; emit it again. A4 Adapt records a new `operatingProfile.sha256` for Technology agents. Any compiled plan that embeds the Technology profile must be recompiled and reactivated:

1. `amc catalog compile --profile <profile.json> --request-review`
2. Two distinct reviewers approve the printed request: `amc approvals approve <approvalRequestId> --agent <first agentId in the profile> --mode execute --reason "<why>"`
3. `amc catalog compile --profile <profile.json> --activate <approvalRequestId>`

No other station profile changes. No CLI command changes.
