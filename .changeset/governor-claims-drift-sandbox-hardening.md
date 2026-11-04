---
"agent-maturity-compass": patch
---

Governor, claims, drift and sandbox attestation hardening (security review 2026-10-31).

- Removing the signed Action Policy no longer turns its check off. `amc init` always signs a policy, so a workspace whose `.amc/action-policy.yaml` and `.sig` are missing now reads as "removed after signing": every governed native tool call is denied, as ToolHub and hook control already did, and `amc doctor` fails with "action policy removed after signing: restore it from backup or run amc policy action init". Only a workspace created without a policy carries a declaration signed with the config-signature key and reads "not configured". Upgrade note: a workspace whose policy pair was removed is now denied until the pair is restored or `amc policy action init` signs a new one.
- `POST /api/v1/score/trust/create-claim` no longer signs a caller-chosen score: the claim's `amcScore` and `amcLevel` come from the agent's latest trusted diagnostic run (409 `NO_TRUSTED_RUN` when there is none), and a request must name its own `sharedSecret`; the server's `AMC_TRUST_SECRET` is never used for a request.
- A drift check that cannot be evaluated (`INSUFFICIENT_EVIDENCE`: an unreadable ledger, a deleted, hidden or unverifiable run or assurance report) is no longer read as clean: `amc drift check` sends a `drift-not-evaluated` owner alert and exits 3, and the continuous monitor alerts and counts it (`driftNotEvaluated`).
- `SANDBOX_EXECUTION_ENABLED` is written only when a real boundary confined the run, naming its backend and receipt digest, and the high-risk level-5 cap ignores a row without them. `amc assurance run --mode sandbox` on an unconfined process writes no such row, says the run was unconfined, and no longer labels it `OBSERVED_HARDENED`.
- Assurance readiness, certificates, drift, the what-if simulator and the per-pack readers count sealed assurance reports only; an unsealed or tampered newer report blocks them (`ASSURANCE_EVIDENCE_UNVERIFIABLE`) instead of being read or skipped. `amc cert verify` checks each carried assurance report's hash and seal.
