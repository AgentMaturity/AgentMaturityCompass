---
"agent-maturity-compass": minor
---

Studio adds a plan diff, a blocker inbox and verifiable review packets; review timing is opt-in.

- `/api/v1/operator` (P2-22): `GET /plans` and `GET /plans/diff?from=&to=` list and compare the signed compiled plans the workspace holds (A4 Adapt builds and the active plan); every reason in a diff is the compiler's. `POST /plans/activate { planDigest, approvalId }` (OWNER, vault unlocked) activates a signed plan with a plan review approved for exactly that plan, and counts only decisions bound to the review request's digest, by people other than the caller (403 `APPROVAL_REQUIRED`, `PLAN_REVIEW_NOT_APPROVED`, `APPROVAL_NOT_BOUND`; 409 `PLAN_UNSIGNED`).
- `GET /inbox` is the blocker inbox. It reads A4 readiness and the control results' five dimensions, expiring assurance waivers and `outcome_unknown` action receipts. It never reads "all clear" by default: a source that fails adds a `source_unavailable` item, and a workspace with nothing evaluated yields `not_evaluated` items. The expiry window is `operator.inbox.expiryWindowDays` (default 14).
- `POST /review-packets` (AUDITOR or OWNER, vault unlocked; free) builds a review packet: the signed plan, its lockfile and diff, the control results, evidence references and hashes only, action receipts, OSCAL and a PDF summary, under a DSSE in-toto statement signed with the artifact-seal key. Its README tells auditors to verify with the issuer key pinned in their own trust list; keys inside a packet only identify the signer. `GET /review-packets/{id}/download` returns the zip.
- Review timing is off unless `operator.reviewTiming.enabled` is true in a signed amc.config.yaml and the reviewer accepts the notice. Reviewers appear only as a salted pseudonym; `GET /review-timing/export` (OWNER) returns CSV. AMC records time, never correctness.
- Studio pages: `operator-plan`, `operator-inbox` and `review-packet`. The audit binder's PDF summary now wraps long lines instead of cutting them at 110 characters.
