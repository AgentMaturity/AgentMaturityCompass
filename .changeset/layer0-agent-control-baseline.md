---
"agent-maturity-compass": major
---

Adds the experimental Layer 0 Agent Control Baseline v0.1: the full Layer 0 control set of the Regulated Control Catalog, in twelve families, under `catalog/layers/l0-baseline/`, with fixtures for every control. Every control is `experimental`, agent-drafted and not independently reviewed; no expert is named (D-08) and no compliance claim is made. A control result is evidence of conformity, never proof of compliance. Citations come from the regulatory register or the strategy, carry `appliesWhen`, and stay `unverified` until fetched and hashed. `docs/catalog/LAYER0.md` lists each control with its test type, producer status and whether an executed test drives a real enforcement point, and states the totals through `scripts/gen-counts.mjs` (new keys `layer0Controls`, `layer0ExecutedControls`, `layer0AwaitingProducer`); most executed tests cover only part of a control's statement, and the page says which part. Review packets for the D-08 reviewers are in `docs/catalog/review-packets/`. `catalog/producers.yaml` now lists the authorization record (P1-02) and the action_state receipts (P1-03) as available, plus the Layer 0 producers that exist and those still planned.

Breaking, for every workspace that compiles or activates control plans:

- Layer 0 applies to every compiled plan, and some of its controls are scoped by the profile's `useCases` or `jurisdictions`. A profile that leaves either fact unknown (`value: null`) leaves those mandatory controls unresolved, and `amc catalog compile` then reports the plan `blocked` (exit 2); a blocked plan cannot be activated. State both facts in the deployment profile.
- The shipped catalog changed, so every plan activated before this release fails the catalog lock check: `loadActiveCompiledPolicy` refuses it ("the shipped catalog differs from the active plan's lockfile; recompile and reactivate"), and sessions under it refuse to start. Recompile and reactivate:
  1. `amc catalog compile --profile <profile.json> --request-review`
  2. Two distinct reviewers approve the printed request: `amc approvals approve <approvalRequestId> --agent <first agentId in the profile> --mode execute --reason "<why>"`
  3. `amc catalog compile --profile <profile.json> --activate <approvalRequestId>`

No CLI command changes.
