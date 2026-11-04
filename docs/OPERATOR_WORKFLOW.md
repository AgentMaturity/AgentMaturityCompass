# Operator workflow

The operator workflow (P2-22, backlog A14) is three Studio pages over `/api/v1/operator`: a readable plan diff with signed activation, a blocker inbox, and a review packet an auditor can check without trusting AMC. Opt-in review timing supplies the reviewer-time data the Gate G2 study uses. Everything here is evidence of conformity, never a compliance statement.

## Plans: diff and activation

`operator-plan` lists the signed compiled plans the workspace holds: every plan an A4 project proposed at Adapt (signed when its Build ran) and the active plan in the signed control journal. Each row says where the plan came from and whether its CONTROL_PLAN signature verifies now. A signature checked against the workspace's own keys is a local audit trail, not portable trust.

A diff is `diffPlans` (P1-10): requirements added, removed or changed with the compiler's reasons, conflict resolutions, runtime-policy and evidence-plan changes. Only signed plans are compared.

Activation (`POST /api/v1/operator/plans/activate`, OWNER, vault unlocked) takes `{ planDigest, approvalId }`:

- The plan must be signed (409 `PLAN_UNSIGNED`).
- The approval must be a plan review approved for exactly this plan (403 `APPROVAL_REQUIRED` or `PLAN_REVIEW_NOT_APPROVED`).
- Only decisions bound to the review request's digest count (the bound decision path, `expectedRequestDigestSha256`), from distinct people, never the caller. Too few is 403 `APPROVAL_NOT_BOUND`.
- `activateControlPlan` then re-checks the review, consumes it and refuses any weakening against the active plan (409 with a code).

A plan an A4 project signed is normally activated from that project's effect gate (`a4.adapt.activate_plan`), which journals the effect. Activating it here consumes the same review, so the A4 effect then reports `GRANT_ALREADY_USED`.

## Blocker inbox

`operator-inbox` (`GET /api/v1/operator/inbox`) lists what blocks a regulated claim, in A4's `BlockerKind` vocabulary:

| Source | Kinds |
| --- | --- |
| A4 readiness (every item not READY or COMPLETE) | the item's own kind |
| A4 control results (P1-11 dimensions) | `not_evaluated`, `evidence_missing`, `evidence_stale`, `evidence_contradictory`, `evidence_untrusted`, `review_pending` |
| Assurance waivers expiring inside the window | `waiver_expiring` |
| Action receipts left unresolved (P1-03) | `outcome_unknown` |
| Any source that fails | `source_unavailable` |

The inbox never reads "all clear" by default. A source that fails adds a `source_unavailable` item and is named in `sources`. A workspace without an A4 project, or a project without recorded control results, yields `not_evaluated` items. Order: mandatory first, then due time, then age. The expiry window is `operator.inbox.expiryWindowDays` in amc.config.yaml (default 14). P2-24's exceptions join the inbox once that issue lands.

## Review packet

`review-packet` (`POST /api/v1/operator/review-packets`, AUDITOR or OWNER, vault unlocked) builds a packet for a plan an A4 project signed and reviewed. The body is `{ planDigest, agentIds?, window: { fromTs, toTs }, formats }`, where `formats` lists any of `json`, `oscal` and `pdf`. The zip holds:

- `plan/`: the signed plan, its catalog lockfile, and the diff from the previous plan.
- `results/control-results.json`: control results with their claim kind and five status dimensions.
- `evidence/references.json`: evidence references and payload hashes. No evidence content is included.
- `receipts/action-receipts.json`: action receipts in the window.
- `exports/oscal/`: OSCAL profile and assessment results (P1-28) and the loss report; `exports/summary.pdf`.
- `manifest.json` and `README.md`.
- `attestation/review-packet.dsse.json`: a DSSE in-toto statement (P1-27's control-results predicate) whose subjects are every file above, signed with the workspace's artifact-seal key through its key provider.
- `verifier/report.json`: the standalone verifier's report (P1-06) when the packet was built, against the builder's trust list. It is not a subject.

To verify, run `amc-verify` on `attestation/review-packet.dsse.json` with your own trust list and root, and supply the packet's other files as evidence. Keys inside a packet only identify the signer; never verify a packet with a key it ships. No private key material is ever written: every file is scanned before signing. Verification and export stay free; the paid industry-pack gate is never consulted.

## Review timing (opt-in)

Timing is off unless `operator.reviewTiming.enabled: true` is set in a signed amc.config.yaml and the reviewer accepts the on-screen notice. An unsigned or edited config leaves it off.

- Events: `review_session_started`, `review_item_opened`, `review_item_decided` (`confirmed`, `disputed` or `needs_more`) and `review_session_completed`, each a ledger audit row of type `REVIEW_TIMING` marked self-reported.
- Reviewers appear only as `sha256(providerId:subject:workspaceSalt)`. The salt is 32 random bytes in `.amc/operator/review-timing.salt` (0600).
- The browser measures active time; the timer pauses after 60 seconds on a hidden page.
- `GET /api/v1/operator/review-timing/export?from=&to=` (OWNER) returns CSV with columns `sessionId, reviewerPseudonym, packetId, itemId, decision, startedAt, completedAt, activeSeconds`.

Retention: timing rows are ledger rows and follow the workspace's ledger retention policy. Deleting the salt file makes existing pseudonyms unlinkable to new sessions. Correctness is scored later by the study protocol (P2-03, P2-05), not by AMC.

## Not covered yet

- The `OPERATOR_INBOX_UPDATED` Studio event: the API route context carries no handle to Studio's event hub, and studioServer.ts is at its line budget. Pages reload to refresh.
- The browser scenario's packet step needs a fixture workspace with an A4 project reviewed at Adapt; set `AMC_OPERATOR_PACKET_PLAN` to its plan digest to run it.
