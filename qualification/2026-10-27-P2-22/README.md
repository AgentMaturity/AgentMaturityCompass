# P2-22 qualification receipts (2026-10-27)

Branch `rtd/p2-22-operator-workflow` on base `6ddbcadfb`; code commit `a9fdfcd6a` (`receipt.json`). Machine: macOS 26.6.2 arm64, Node v22.23.3, shared with other agents (vitest `--maxWorkers=2`).

## Tests

- New: `tests/operator/planDiffView.test.ts` (5), `tests/operator/blockerInbox.test.ts` (8), `tests/operator/reviewPacket.test.ts` (6), `tests/operator/reviewTiming.test.ts` (5), `tests/api/operatorRouter.test.ts` (6), `tests/operatorWorkflowPage.test.ts` (1, plus 1 opt-in browser scenario). All pass (`receipt.json`: 80/80 with `tests/lineRatchet.test.ts`).
- Browser: `AMC_PUBLIC_TASK_BROWSER=1 npx vitest run tests/operatorWorkflowPage.test.ts` ran against real built Studio and passed (2/2): login, open the inbox, no "all clear". The packet and decision steps need `AMC_OPERATOR_PACKET_PLAN` (a plan an A4 project in the fixture workspace signed and reviewed at Adapt); no such fixture exists yet, so they are **pending**.
- Related existing tests: 111 files that touch the API registry, access policy, OpenAPI, the binder PDF, textPdf, the console pages, evidence emitters, the compiler, OSCAL, attestations and the verifier: 1066 passed, 2 failed. `tests/lineRatchet.test.ts` (openapi.ts one line over its budget) was fixed before commit (net-zero merge). `tests/verifier/parityWithAmc.test.ts` fails on evidence event types (`session/heartbeat`, `session/migration`, `tool/reconciled` missing from the package); this branch does not touch event types or `packages/verifier`.
- Red/green: every guard is new code, so each test failed before its module existed. The binder PDF wrap test fails on the base renderer (cut at 110 characters) and passes now.

## Mutation checks (each made the named test fail, then restored)

| Guard broken | Failing test |
| --- | --- |
| Empty A4 source returns no items ("all clear") | blockerInbox: an empty ledger yields a not_evaluated item |
| Throwing source dropped without an item | blockerInbox: a throwing source adds source_unavailable (and 2 more) |
| Activation counts decisions without the request digest | operatorRouter: only decisions bound to the review request's digest count |
| Activation counts the caller as an approver | planDiffView: refuses … unbound or self decisions |
| Unsigned plan accepted | planDiffView: refuses … unsigned plan |
| Bundled-key line added to the packet README | reviewPacket: the README names no bundled key to trust |
| Private-key scan skipped | reviewPacket: a packet whose content carries key material is refused |
| Binder PDF lines cut at 110 instead of wrapped | reviewPacket: a 300-character PDF line is wrapped, not cut |
| Timing config read without its signature | reviewTiming: an unsigned or edited config does not turn it on |
| Raw subject stored instead of the pseudonym | reviewTiming: pseudonyms only, no email in any event |
| Hidden-page pause removed | reviewTiming: pauses after 60 seconds on a hidden page |
| Vault check removed | operatorRouter: a locked vault refuses activation and packets |

## Checks

build, typecheck, typecheck:tests, lint, check:gates, check:dead-code (0 new; operator.js accepted: loaded by HTML; one stale a4Readiness entry shrunk, since BlockerKind is now used), check:duplicates (2 accepted with reasons: OpenAPI helper consts, the JSON refusal writer), check:counts (after `gen-counts --write`), check:api-ref, check:docs-drift pass. check:architecture-boundaries fails on `src/vault/vault.ts` (803 lines, not in line-budgets.json), which is the base's (P2-08) and untouched here. No CLI command was added, so the freeze counts do not move.

## Samples

- `sample-review-packet.zip`: built by `tests/operator/reviewPacket.test.ts` from the L0-IDN-01 fixture plan in a temporary workspace (synthetic fixture, test keys only, no private key material).
- `sample-verifier-report.json`: that packet's `verifier/report.json`. The test home pins no trust list, so it reads `issuerAdmission: fail (ISSUER_NOT_PINNED)` and the other dimensions not evaluated: the honest build-time result without a pinned issuer. The test itself verifies the same packet against a trust list pinning the workspace's artifact-seal key (integrity, issuerAdmission and completeness pass).
- `sample-review-timing.csv`: the export from `tests/operator/reviewTiming.test.ts`.

## Pending (not done here)

- The G2 metric itself: P1-29 baselines and the P2-03/P2-05 study (Sid and the study's reviewers).
- `OPERATOR_INBOX_UPDATED` on the Studio event stream (needs a hub handle in the API route context; studioServer.ts has no line headroom).
- P2-24 expiring exceptions in the inbox, once P2-24 lands.
- The integrator lands nothing in `allowedExceptionKeys` for this item (no CLI change).
