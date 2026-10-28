# A4 verification debt (P2-35)

This file records what P2-35 owes and what it has paid: the sixteen acceptance scenarios of design §17, the negative
fixtures, the mutation checks, and the "P2-35 debt" paragraphs collected from the A4 closing notes (appendix). A case
marked **pending** has no test yet; the reason is given. Nothing here is skipped silently: the suite has no `skip` or
`todo` for these cases.

## Harness

`tests/a4/a4Harness.ts` drives `handleA4Route` (the HTTP entry) in process with a Studio-session identity. Users are
real, signed `users.yaml` rows in the keyed governance fixture workspace (`tests/governor/governanceFixture.ts`), so
roles, population, SoD and the ratchet read live records. The clock is faked only where a case needs it (gate TTL).
The provider is never called: Aspire runs no model.

## Acceptance scenarios (design §17)

| # | Scenario | Status | Test file | Reason codes asserted |
| --- | --- | --- | --- | --- |
| 1 | Misunderstood intent | covered | `scenario01MisunderstoodIntent.test.ts` | UNDERSTANDING_NOT_CONFIRMED, A4_STEP_ORDER |
| 2 | Requested revisions | covered | `scenario02RequestedRevisions.test.ts` | CHANGES_REQUESTED, A4_GATE_STALE, A4_GATE_SEQ_MISMATCH |
| 3 | Stale approvals | covered (RESOURCE_DRIFTED pending) | `scenario03StaleApprovals.test.ts` | A4_GATE_STALE (request, memberSet, consumed), A4_GATE_SEQ_MISMATCH, GATE_EXPIRING, GATE_EXPIRED |
| 4 | Unauthorized progression | covered (effect-gate and cross-plane HTTP rows pending) | `scenario04UnauthorizedProgression.test.ts`, `routerAdmission.test.ts` | SOD_VIOLATION, A4_NOT_A_MEMBER, ADMIN_TOKEN_REFUSED, DEMO_REFUSED, A4_NOT_READY, A4_DUPLICATE_DECISION, PRINCIPAL_ROLE_INSUFFICIENT, A4_USER_DISABLED |
| 5 | Collaborative conflicts | covered (two-process case pending) | `scenario05CollaborativeConflicts.test.ts`, `storeDedupe.test.ts` | A4_STALE_HEAD, REQUEST_CONFLICT, SECRET_IN_REQUEST_ROW |
| 6 | Changed operating markets | **pending** | — | needs Adapt (compiled plan, plan digest) and Activate (deployed release) |
| 7 | Unsupported integrations | **pending** | — | needs Assemble's path card and plan items |
| 8 | Failed deployment | **pending** | — | needs an Activate release, a deploy receipt and `verify` against a destination |
| 9 | Rollback | **pending** | — | needs a deployed release and the rollback effect gate |
| 10 | Hold / freeze / kill switch | covered (freeze and kill switch pending) | `scenario10HoldFreeze.test.ts` | ON_HOLD, NOT_ON_HOLD |
| 11 | Single-user workspace | covered (regulated and hosted rows pending) | `scenario11SingleUser.test.ts`, `guards.test.ts` | SOD_DEGRADED_SINGLE_USER (selfApproved), SOD_VIOLATION after the ratchet |
| 12 | Vault locked / no-sign | covered | `scenario12VaultLocked.test.ts` | A4_VAULT_LOCKED (423), VAULT_LOCKED, UNSIGNED_STORE |
| 13 | Tampered record | covered | `scenario13TamperedRecord.test.ts`, `recordFixtures.test.ts` | A4_SIDE_ROW_MISMATCH, A4_CHAIN_INVALID, A4_INTEGRITY_FAILED |
| 14 | `outcome_unknown` lockout | **pending** | — | needs an Assemble build execution left `outcome_unknown` |
| 15 | Acknowledged blocker | partial: the acknowledgeable rule only | `guards.test.ts` | BLOCKED never acknowledgeable; the listed items only; regulated `plan_unresolved` refused |
| 16 | Effect drift and crash | **pending** | — | needs an effect gate (Assemble build or Activate release) and a second process for liveness |

The pending scenarios share one blocker: the harness reaches Aspire's completion only. Assemble needs native build
sessions on the stub provider, Adapt a compiled and activated plan, Activate a release package, a deploy receipt and a
destination for `verify`. Each is a fixture of its own (the P1-62 qualification under `qualification/<date>-P1-62/`
is Sid's and needs a non-stub provider; D-23).

## Negative fixtures

The fixtures are data tables inside the tests (the published OpenAPI route list, the tamper SQL, the a4-record
verdict table) rather than files under `tests/fixtures/a4/`: each is generated from the code under test, so a new
route or table is covered without a fixture edit.

| Fixture | Status | Test |
| --- | --- | --- |
| admin-token POST to every mutation route (POST /projects included) | covered | `routerAdmission.test.ts` |
| demo POST to every mutation route and demo GET | covered | `routerAdmission.test.ts` |
| `?trustList=` on `GET …/verify` → 400 QUERY_INVALID; a body → 400 INPUT_INVALID | covered | `routerAdmission.test.ts` |
| no Studio session; preview off; read-only Studio; unknown user | covered | `routerAdmission.test.ts` |
| stale (old request digest; superseded; expired) | covered | `scenario03StaleApprovals.test.ts` |
| replayed (same clientRequestId, concurrent) | covered | `scenario05CollaborativeConflicts.test.ts`, `storeDedupe.test.ts` |
| cross-workspace / cross-project request id | covered (cross-project) | `storeDedupe.test.ts` |
| cross-plane vote | covered (pure) | `guards.test.ts` (one_plane); an HTTP router session is **pending** (needs a WORKSPACE_ROUTER session record) |
| forged key, rotated-out key, expired attestation | **pending** | needs a verified-lane ref (P1-06 attestations) |
| missing evidence, deleted side row | covered | `scenario13TamperedRecord.test.ts`, `recordFixtures.test.ts` |
| digest-less decision | covered | `recordFixtures.test.ts` (stale-approval: DECISION_NOT_BOUND) |
| single-user | covered | `scenario11SingleUser.test.ts`, `guards.test.ts` |
| self-provisioned quorum | covered (pure) | `guards.test.ts` (SOD_DEGRADED_SELF_PROVISIONED) |
| a member or evidence ref added after the gate opened | covered | `scenario03StaleApprovals.test.ts`, `guards.test.ts` |
| an OBSERVED `A4_STATE` row; a `lane = observed` ref on a SELF_REPORTED row | covered (lane rule) | `guards.test.ts` (laneForClaimKind); the stored-row writer case is **pending** |
| a hypothesis observed with a SELF_REPORTED ref, outside its window, or with another metric | **pending** | needs a project past Aspire and a runtime-written ledger row |
| verify against another host, a 3xx, drift, effect_failed, `process_lost` | **pending** | Activate and effects (scenarios 8, 16) |
| head regression | covered | `scenario05CollaborativeConflicts.test.ts` (A4_STALE_HEAD) |
| duplicate vote | covered | `scenario04UnauthorizedProgression.test.ts` (A4_DUPLICATE_DECISION), `guards.test.ts` |
| dangling value ref | covered (ledger ref) | `recordFixtures.test.ts` (REF_DANGLING); value claims **pending** |
| readiness item `section: integrity` with a `claimKind` | covered before P2-35 | `tests/fixtures/contracts/a4-readiness/invalid/integrity-item-with-claim.json` |
| `claimKind: observed` without a resolved OBSERVED ref | covered (lane rule) | `guards.test.ts` |
| a second vote whose readiness binding differs (`second-vote-lands` must hold) | covered | `recordFixtures.test.ts` |
| a decision while a bound mandatory item is NOT_EVALUATED | **pending** | needs a stage whose bound item is unproduced at decision time |
| an acknowledged item rendered READY or COMPLETE; an expired acknowledgement | **pending** | needs an acknowledgeable WAITING item (regulated or Assemble) |
| `a4_evidence_refs.trust_tier` differing from the row's tier | **pending** | |
| a composed "experimental" sentence in `src/a4` text | covered before P2-35 | `tests/a4GuardQualification.test.ts` (P0-54 scanner) |
| two POSTs with one clientRequestId from two processes | **pending** | in-process concurrency is covered; a two-process runner is not built |
| resource edited between `complete` and the executor; slow executor swept; production lease at release; package file sha mismatch; monitor ref lane | **pending** | effects and Activate |
| decision on a consumed gate | covered | `scenario03StaleApprovals.test.ts` |
| post-consume DENY revoking a lease | **pending** | Activate staging lease |
| client `expectedGateSeq` equal to the head seq | covered | `scenario03StaleApprovals.test.ts` |
| verify row `passed` without a release-identifying check | **pending** | Activate |
| no `lease_` in `a4_requests.response_json` | covered | `scenario05CollaborativeConflicts.test.ts`; the store refusal of an `eyJ…` token in `storeDedupe.test.ts` |

## Mutation checks

Each guard was broken in the worktree (`src/` edited, the named tests run, the file restored with `git checkout`). A
mutation is **killed** when at least one named test failed.

| Id | Guard | Mutation | Result | Failing test |
| --- | --- | --- | --- | --- |
| M1 | `evaluateSod` author rule | drop `author_not_approver` | killed | guards › the revision author is refused |
| M2 | `evaluateSod` one plane | invert `plane !== approver.authSource` | killed | guards › a second account in the other auth plane is refused |
| M3 | `laneForClaimKind` | drop the OBSERVED tier check | killed | guards › observed on a SELF_REPORTED row |
| M4 | `deriveSelfApprovalAllowed` | drop `!input.ratcheted` | killed | guards › a ratcheted project …: false |
| M5 | `gateSupersededBy` | drop the bound-revision check on EVIDENCE_REF/ACKNOWLEDGED | killed | guards › an EVIDENCE_REF on another revision does not supersede |
| M6 | `resolveAndCheck` | allow an unresolved name | killed | egressAllowlist › refuses an empty DNS answer as unresolved |
| K1 | `acknowledgeable` | accept any non-READY status | killed | guards › a BLOCKED item |
| R1 | `resolveA4Principal` admin token | never refuse a mutation | killed | routerAdmission › admin token: 403 ADMIN_TOKEN_REFUSED on every mutation route |
| R2 | `handleA4Route` demo | drop the demo refusal | killed | routerAdmission › demo: 403 DEMO_REFUSED … preview on or off |
| R3 | `verifyRead` | drop `assertQuery` | killed | routerAdmission › ?trustList= is 400 QUERY_INVALID … |
| R4 | `resolveA4Principal` read-only | drop NATIVE_READ_ONLY | killed | routerAdmission › a read-only Studio … |
| S1 | `consumeGate` QUORUM_MET | drop the quorum check | survived: equivalent (readiness `allowed.progress` refuses a PENDING or DENIED gate first with the same 409 A4_NOT_READY) | — |
| S2 | `consumeGate` liveness | drop `assertGateLive` | killed | scenario03 › a decision or a second complete on a consumed gate … |
| S4 | `recordDecision` gate seq | drop the expectedGateSeq check | killed | scenario03 › a client expectedGateSeq that is not the gate's stored seq … |
| S5 | `recordDecision` expiry guard | drop GATE_EXPIRING | killed | scenario03 › TTL … |
| S6 | `evaluateA4Readiness` hold | never answer ON_HOLD | killed | scenario10 › a held project refuses stage writes … |
| S8 | `recordDecision` request digest | drop the digest check | killed | scenario03 › a decision bound to another request digest … |
| W1 | `recordDecision` SoD wiring | never throw SOD_VIOLATION | killed | scenario04 › only a distinct member approver …; scenario11 › … |
| D1 | `dedupeRequest` replay | never replay | killed | storeDedupe › a repeated request key answers the recorded result … |
| D2 | `dedupeRequest` body hash | drop the body-hash comparison | killed | storeDedupe › the same key with another body … |
| D3 | `dedupeRequest` credential | drop the lease-token check | killed | storeDedupe › a response carrying a lease token is refused … |
| T1 | `verifyChain` side rows | accept a mismatched side row | killed | scenario13 › each tamper case |
| V1 | `verifyA4Record` decision binding | drop the request-digest comparison | killed | recordFixtures › stale-approval |
| — | `verifyAndConsumeEffect`, the quorum `now` path (`Math.max(now, ts)`) | — | **pending** | no effect gate is reached (scenario 16) |

Notes: at the router, `priorReplay` answers a recorded request before the store runs, so the store's dedupe (D1 to D3)
is only reachable directly (`storeDedupe.test.ts`); the in-process concurrent POSTs in scenario 5 are served by either.

## Follow-ups found (not fixed here; no security or fail-open defect was found)

- **Proposed P2-41 · A4 hold refusal code.** Design §17 names `409 A4_ON_HOLD` for every mutation on a held project;
  the routes answer `409 A4_NOT_READY` with `reasonCodes: ["ON_HOLD"]`, a second hold included (the `A4_ON_HOLD`
  throw in `autoHold` is reached only by the automatic hold). Fail-closed either way; only the code differs from the
  design.
- **Proposed P2-41 (same item) · tampered readiness.** Design §17 says readiness reads BLOCKED on a tampered record;
  `GET …/readiness` answers `409 A4_INTEGRITY_FAILED` instead (no body to read BLOCKED from). Fail-closed; the
  wording or the route should be aligned.

## Pinned suites

Re-run on this branch (base e95619acb): `tests/apiRouterResponseParity.test.ts`, `tests/openapiContracts.test.ts`,
`tests/studioApiAuthorization.test.ts` (A4 role-class rows added), `tests/threatModelMap.test.ts`,
`tests/nativeSecondSharingRestoration.test.ts`, `tests/amc1472OutcomeOnboarding.test.ts`,
`tests/architectureBoundaries.test.ts`. Results are in the closing note and the receipt.

## Appendix: the debt paragraphs, as recorded

The "P2-35 debt" paragraphs of the A4 closing notes (P1-56 to P1-67 and P0-55) in the operator's `pending-checks.md`,
copied verbatim. Many name cases from Assemble, Adapt and Activate that the pending rows above cover.


### P1-67 (amc-a4-4, branch rtd/p1-67-native-lease, 3 commits on 2a592a00) — closing note 2026-10-09

- P2-35 debt (failing cases to write): (1) active plan with L0-IDN-01 + stub-provider workspace task: approved call admitted, record delegation.leaseId set and principal `authenticatedVia: approval-engine` (the approvers; `lease:<id>` only for a call with no approval id), EFFECTIVE_POLICY leaseId set; (2) same plan, session without a lease: IDENTITY_UNRESOLVED; (3) no plan: no lease minted, no leaseId on descriptor, records unchanged; (4) stop/verify/archive put leaseId in the signed revocation list; a bind with that token after archive is lease_revoked; (5) resume revokes the prior lease and records a new one only after resumeSession succeeds; a resume refused for a live writer in another process leaves that process's lease unrevoked and the descriptor unchanged; (6) tools digest changed between pin and mint: SCOPE_CHANGED, nothing minted; (7) call of a class outside the pinned classes: scope_widened; (8) archive with an unverifiable revocation store: NATIVE_LEASE_UNREVOKED, not archived; (9) receipt leaseId null when the lease is revoked or expired at receipt time; (10) child env: AMC_NATIVE_TASK_LEASE absent from a bash tool's `env`, token scrubbed from output. Review-fix cases: (11) plan with only requirePrincipal: no lease minted or bound; (12) resume refused with LEASE_UNAVAILABLE keeps `Native resume was refused: …` plus any lease note; (13) two processes revoking concurrently keep every row (scratch probe scratchpad/p167-probe/probe.mjs passed 31/31 on dist); (14) runtime stopped by the sweeper before its lease's expiresTs.

### P1-66 (branch rtd/p1-66-gateway-proxy-dns, c1dfd3b3..1d3893a3, not merged) — closing note 2026-10-09

- P2-35 debt (no tests written): allowed name -> 10.0.0.5 refused with address in reason; public name allowed and receipt has resolvedAddresses; unresolved -> EGRESS_UNRESOLVED; unlisted name -> no DNS query; denyByDefault:false + localhost refused; CONNECT dual-stack fallback across checked addresses; field guard sees a provider address added after start; /etc/hosts re-resolution acceptance run (needs root, not done); upstream name -> 10.0.0.5/169.254.169.254 refused 403 with upstreamId; env-expanded loopback literal refused without allowLocalhost, allowed with it; allowNonPublicAddresses ["::1"] still refuses 127.0.0.1; schema rejects a non-IP entry; client reset during lookup (GET and partial POST) -> no unhandled rejection; 5 CONNECTs reset during lookup -> 0 upstream sockets; CONNECT :99999 -> 400; tunnel row connectedAddress; request_error row resolvedAddresses. Scratch probes passed: scratchpad/a4-p166-probe/{probe,gateway-smoke}.mjs.

### P0-55 (amc-a4-2, branch rtd/p0-55-security-followups, 30 commits on 2a592a00, head 1fa70e00, not pushed) — closing note 2026-10-09 (updated after the fourth review pass)

- P2-35 debt (failing cases to write): (1) POST trust-token/verify `{token:{…}, secret:"s"}` -> 400 `request field "secret" is refused…`; `{token:{…}, allowUnpinned:true}` -> 400; `{token:{…}}` -> 200 `data.status "not_evaluated"`, `valid false`, never `valid: true`. (2) POST formal/certificate with a `boundedModelCheck` certificate -> 200 `status "UNTRUSTED"`, `valid false`, `integrityValid true`, reason `certificateHash (artifact-seal): not-pinned…`. (3) verify-profile: profile signed by K with `signature.authorityId = keyId(K)`, trust list entry {K, evidence-authority, authority{producers:[p], captureMethods:[producer-callback], maxTrustTier:ATTESTED}}, no --authorities -> exit 0, ATTESTED (main: exit 1 not-pinned); same entry revoked -> exit 1, trustTier SELF_REPORTED; same id also in --authorities -> exit 1. (4) AMC_NO_SIGN=1 runDiagnostic on a fresh workspace -> `.amc/evidence.sqlite` evidence_events and runs unchanged, `.amc/unsigned/evidence.sqlite` runs = 1 (checked by hand on dist); `amc evidence collect --first-run` without a passphrase -> no `writer_sig='unsigned'` row in the signed store. (5) startAssuranceSession with appendEvidence throwing -> no `sessions` row for that id (main: an unsealed session). (6) ATTESTED row with entry.ts = row.ts + 10 min -> SELF_REPORTED; row without ts -> SELF_REPORTED; two bound copies of one original event for one agent in two sessions -> counted once (tests/claims/evidenceProvenance.test.ts gained the first two as replay cases). (7) evaluateControl with every admitted item OBSERVED but fewer than minItems (incomplete), or stale, or contradictory -> claimKind `self_reported` (main: observed). (8) Studio binder verify: `exports/link.json` -> symlink to a file outside or inside exports, or `exports/dirlink/a.json` through a linked directory (target outside or inside exports) -> `ok false`, errors `[UNREADABLE]`, `audit null` (main: reads and echoes the outside file); a real file inside still verifies; `auditBinderVerifyFile` on a file outside still verifies (CLI). (9) AMC_NO_SIGN=1 foreign subagent whose child prints "ok" -> `{ ok: true, text: "ok" }` (without the fix: refused "produced no output"). (10) 85be32ba: AMC_NO_SIGN=1 runDiagnostic in a workspace with signed evidence -> status UNSIGNED, integrity 0, never VALID / "Verified evidence chain", the signed rows still scored, `.amc/evidence.sqlite` unchanged, one run in the unsigned store. (11) 5b950fba: runDiagnostic({ noSign: true }) without AMC_NO_SIGN -> report file written, no `runs` row in `.amc/evidence.sqlite`, verifyLedgerIntegrity still ok. (12) af5f70ec: AMC_NO_SIGN=1 `amc sandbox run` -> SANDBOX_EXECUTION_ENABLED and network-cleanup rows in the unsigned store, none in the signed one; same for `amc monitor --stdin` rows and `amc monitor start` alert rows. (13) 68e8eec4: `amc evidence collect --first-run --dry-run` unsigned -> prints `Next: AMC_NO_SIGN=1 amc quickscore --auto`. (14) third pass: Studio binder verify with `exports` (or `binders`, or `.amc/audit`) a symlink to an outside dir -> UNREADABLE, `audit null`; a hard link inside exports and a FIFO -> UNREADABLE (FIFO returns at once); a missing ?file= -> 404 at the route (auditBinderVerifyForApi alone -> UNREADABLE); a regular file in exports or a subdirectory still verifies; workspace path given through a symlink still verifies; a binder's `fileSha256` equals sha256 of the bytes extracted. Probes: scratchpad/p055-r3/probe/{binder-guard,binder-tar}.mjs and p055-r2/probe/binder-root-link.mjs, all pass on dist. Probes run on dist: scratchpad/p055-sanity/*.mjs, p055r-binder.mjs; `AMC_NO_SIGN=1 amc --json` in a fresh workspace -> `.amc/evidence.sqlite` 0 events / 0 runs, `.amc/unsigned/evidence.sqlite` 1 unsigned event / 1 run. tests/apiRouterResponseParity.test.ts has no passport/formal routes, so no parity change. Fourth pass (1fa70e00): (15) b04e00fc: POST /api/v1/score/trust/verify-claim with a claim signed under 'amc-trust-default' and policy {} -> 200 `status "not_evaluated"`, `trusted false`, `trustLevel "untrusted"`, `grantedScopes []` (main: trusted, full, four scopes); body `sharedSecret` or `publicKeyPem` -> 400; create-claim with no body secret and no AMC_TRUST_SECRET -> 400 (main: signed under the default). tests/apiRouters.test.ts:1261 now sends no sharedSecret and expects `status "not_evaluated"`. (16) 5f27fa4b: AMC_NO_SIGN=1 runDiagnostic after editing the signed gateway.yaml -> UNSIGNED_GATEWAY_CONFIG and MISSING_LLM_EVIDENCE audit rows in `.amc/unsigned/evidence.sqlite` (as the signed run writes to the signed store), `.amc/evidence.sqlite` rows unchanged. (17) 452f64d2: AMC_NO_SIGN=1 runDiagnostic on a clean fresh workspace -> status UNSIGNED, integrity 0, verificationPassed false (NOT CRYPTOGRAPHICALLY VERIFIED), zero FLAG_LEDGER_INVALID (third pass: 244/244); with the signed gateway.yaml edited -> FLAG_LEDGER_INVALID on every question, as the signed run (verifyLedgerIntegrity reports the governance error). (18) f09de79e: verify-profile whose profile.json is replaced between the verify read and the report -> artifact.sha256 is the digest of the verified bytes (main and third pass: a second read). Probes: scratchpad/p055-review/{probe,routes,unsigned-diag,derived-audits}.mjs and p055-fix/{probe,why}.mjs, all as expected on dist. Follow-up (not P0-55): create-claim still signs under the operator's AMC_TRUST_SECRET for any API caller with any amcScore; AMC's own verify-claim no longer grants on it, but an external verifier sharing that secret would.

### P0-54 + P1-56 (amc-a4-1, branch rtd/p1-56-a4-store on rtd/p0-54-a4-guards, 54b2ca30..a9bae6c4, not merged) — closing note 2026-10-09

- P2-35 debt (failing cases to write): every acceptance bullet of the issue (the probe covers them: 12 tables, base_release_id UPDATE ok / stage+agent_id refused, A4_STATE meta, UPDATE a4_transitions ABORT, AMC_NO_SIGN refused, partial index + retire, APPROVAL_POLICY_MISSING, 401/DEMO_REFUSED GET+POST/admin read-only/ADMIN_TOKEN_REFUSED/users_yaml/session_record, observed+self_reported CHECK, TRUST_TIER_INFLATED downgrade, no comment text in evidence_events, .enc named by ciphertext sha, salted hashes differ, blob write with vault locked + read VAULT_LOCKED, destroyProjectKey, two-process createProject with one clientRequestId → one project, credential projection only, lease-token refused, one re-sign then A4_STALE_HEAD, kinds/provenance/deleteVaultSecret/createdBy parse, isNativeStudioPath); plus a side row omitting a defaulted/nullable column → A4_SIDE_ROW_MISMATCH and rollback, and an unbacked external ref → unsigned.

### P1-58 (amc-a4-2, branch rtd/p1-58-a4-studio, 1727d557..69b8d94a on d2cf4c0f, not merged) — closing note 2026-10-09

- P2-35 debt: every acceptance bullet of the issue (two-session approve with SOD_VIOLATION on the author's button, comment visible within one poll, presence line, stale-head merge creating `parent_revision_no = head`, preview-off absence), validateA4Poll refusals (head regression, backwards cursor, out-of-order events, foreign projectId), applyChanges reserved-key refusal, nextAction route allowlist (no `javascript:`), sw.js precache of both pages, restoration parity of app.js.

### P1-57 slice A (amc-a4-1, branch rtd/p1-57-a4-gates, 18b90570..17fcb649 on d2cf4c0f, not merged) — closing note 2026-10-09

- Scratch probe (dist, not a test): scratchpad/a4-p157-probe/probe.mjs, 42 PASS. P2-35 debt (cases to write): router 401/DEMO_REFUSED/A4_PREVIEW_DISABLED/ADMIN_TOKEN_REFUSED; createProject VIEWER 403; recordMember non-owner 403; foreign-agent ledger ref 409 + own-agent control; readiness schema-valid and self_reported; A4_GATE_OPEN; GATE_REQUESTED envelope; author approve SOD_VIOLATION; head seq → A4_GATE_SEQ_MISMATCH; stale digest A4_GATE_STALE; tools.yaml edit RESOURCE_DRIFTED; second vote 409; consume once + vote on consumed → A4_GATE_STALE; policy gate → GATE_POLICY_CHANGED; requiredReviews removal GATE_POLICY_BELOW_FLOOR; loosening by non-owner 403; requester's engine approval SOD_VIOLATION at verifyAndConsumeEffect; GATE_CONSUMED+EFFECT_STARTED in one commit; executor EFFECT_FINISHED; solo self-approval facts; regulated solo SOD_VIOLATION hint; freeze → amc-runtime HOLD, resume refused then allowed; quorumFloor raise/narrow/TTL cap; bound Studio decide roles [] → 403; quorum `now`. Not probed: DENY terminal per revision, CROSS_PLANE, expiring guard, sweeper process_lost, retry, tune/reopen/retire/acknowledge, notary 409.

### P1-57 slice B (amc-a4-1, branch rtd/p1-57-a4-gates, f0e403d5..5e10bf48 on slice A, on d2cf4c0f, not merged) — closing note 2026-10-09

- P2-35 debt (cases to write): every acceptance bullet of the issue through HTTP (two-process same clientRequestId, concurrent A+B approvals, member/evidence added after open → A4_GATE_STALE memberSet/evidenceRefs, tools.yaml edit → RESOURCE_DRIFTED at decide and EFFECT_FAILED in the executor preamble, hand-inserted digest-less decision → freshness fail, admin token on members/gate-policy/releases/comments/approve, local-demo on readiness, read-only, regulated solo SOD_VIOLATION hint, ratchet after user add/revoke, WORKSPACE_ROUTER never self-approves, CROSS_PLANE, SOD_DEGRADED_SELF_PROVISIONED + ACKNOWLEDGED, effect gate open/re-open/requiredApprovals 2, builder/complete-caller/non-member engine approval → SOD_VIOLATION, sweeper process_lost vs live slow executor, freeze → amc-runtime HOLD); router-specific: identity/trust body fields 400, `?trustList=` 400, priorReplay before prechecks, A4_STALE_HEAD head+diff, projectRoles, comments/presence membership, hypothesis source mismatch/window/not observed, verifyAll skip below migration 13 and fail at 13 without tables, readiness GET report vs complete equality of items, openapi yaml publisher `--check`.

### P1-57 merge record (2026-10-09)

- Re-verify these two commits at the start of P1-59 (the gate-supersession rule in gateStatus, and nonVoterMayComplete/roleRefusals), and list them as P2-35 debt.

### P1-64 (amc-a4-5, branch rtd/p1-64-a4-mcp-sdk, 8579878a9..135ef91a6 on 06961457, not merged) — closing note 2026-10-11

- Untested in the repo suite (P2-35 debt): MCP comment replay and `REQUEST_CONFLICT`; `A4_NOT_A_MEMBER` for non-members; the token path never being printed; the `A4_SESSION_TOO_PRIVILEGED` refusal; the read-only refusal (`NATIVE_READ_ONLY`); the tool count of 11 without `AMC_A4_PREVIEW` and 16 with it (`amc mcp list-tools` too); the SDK passing `400 SOD_VIOLATION` through unchanged; the SDK refusing redirects (`redirect: "error"`). From the dropped `tests/a4McpTools.test.ts`: the vault-variable refusal reaching no Studio; the cookie, CSRF proof, `Origin` and body sent to Studio; a Studio refusal passed through with its status and code; 503 `A4_STUDIO_NOT_RUNNING` without Studio; `A4_SESSION_TOO_PRIVILEGED`. From the third round: the `AMC_VAULT_PASSPHRASE_FILE` refusal; a dead pid, pid 0, a bad port and an unreadable state.json each giving 503 with nothing sent; a non-local host giving 403 `A4_STUDIO_NOT_LOCAL` with nothing sent; a wildcard bind sent with its Host unchanged; 502 `A4_STUDIO_BAD_ANSWER` for `{ok:true,data:{}}`, another project's answer, a non-JSON answer, and `ok:false` with a 2xx status; 504 `A4_STUDIO_TIMEOUT`; the signing note in the readiness and project text; a tampered row giving 409 `A4_INTEGRITY_FAILED`; the SDK's `timeoutMs`.

### P1-63 (amc-a4-4, branch rtd/p1-63-a4-rules, 5c30f2ab9..e8eef32b9 on 06961457, not merged) — closing note 2026-10-11

- P2-35 debt (untested in the repo suite): the list-equality test for the sign/artifact/transparency kinds; each fixture's expected verdict as a test (and the no-trust-list "integrity only" report); the `?trustList=` and body negatives on GET …/verify; VIEWER and OWNER reports identical; a bundle round trip whose manifest lists the slice and whose verify recomputes every digest; `containsSyntheticExamples: true` and `SYNTHETIC_VALUES`; `A4_SLICE_HEAD_MISMATCH` and `A4_SLICE_UNLISTED`; the binder writing only under the exports dir with no spec text, comment body or username; the binder refusing on a PII or key-material hit; `A4_INTENT_MISMATCH` on a policy gate and a completion gate; the acceptance scenarios of design §17.
- P2-35 debt added by round 1: tests for each new code above; the bundle export refusing an unverifiable project; a bundle exported while a long legacy session (a gateway) is open passing `amc bundle verify` and `amc certify`; the binder leaving nothing after a scan refusal or a signing failure.
- P2-35 debt added by round 2: tests for each of the cases above.

### P1-59 review round 4 (amc-a4-1, rtd/p1-59-a4-aspire, rebased on origin/main 691a041dc; cff02c00c..50429f50a; not merged), 2026-10-11

- P2-35 debt: none of this round's refusals or the completion effect has a repo test.

### P1-59 review round 5 (amc-a4-1, rtd/p1-59-a4-aspire, 50429f50a..04c968447; not merged), 2026-10-11

- P2-35 debt: none of this round's refusals, the enforce drift or the Retry control has a repo test.

### P1-61 review fixes (amc-a4-1, rtd/p1-61-a4-adapt, 93fcb0455..e24e8b8dc; not merged), 2026-10-11

- P2-35 debt: none of these refusals has a repo test.

### P1-62 slice A closing note (amc-a4-2, rtd/p1-62-a4-activate, 161b67b87..cc297d287; not merged), 2026-10-11

- P2-35 debt: no repo test covers any of it (list equality of the sign kinds, release from content-addressed inputs, RESOURCE_DRIFTED before packaging, token once/replay null, DENY revocation, same_host BLOCKED, amc_check BLOCKED on failed).

### P1-62 slice C closing note (amc-a4-2, rtd/p1-62-a4-activate, a8a257109..e82d3b385 on d6fcc88fa; not merged), 2026-10-11

- P2-35 debt (none of this is tested):
  - Review records exactly one monitor ref.
  - The SLO envelope reads self_reported / evidence incomplete.
  - A source that is not read is `source_unavailable` with `value: null`.
  - A deleted or edited monitor file makes `monitoring.source` BLOCKED and drops `monitoring_slo_enabled`.
  - A value claim with one dangling ref has `observed.value: null` and `danglingRefs: 1`.
  - A foreign-agent or unsigned row dangles.
  - An unsigned contract gives `instrumentation: none`.
  - `GET …/value` appends no value event (count events before and after).
  - A replayed review does not re-run `createValueReport`.
  - A second post-commit recording is refused with `REVIEW_RESULTS_RECORDED`.
  - The hypotheses view (expired, proposed, downgraded).
  - Every card renders with `esc()` on every server string.
  - The generic Complete button is held on both Activate gates.

### P1-65 closing note (amc-a4-1, rtd/p1-65-a4-cli, 31199a9aa..f7f4c2ae0; not merged), 2026-10-12

- P2-35 debt (cases to cover): preview off refuses every leaf; --username/--roles/--user-id refused; symlinked and 0644 token files refused; demoted-since-login token refused; NATIVE_READ_ONLY on writes; decision row admission native_login_token + identity_check users_yaml; binding digest and gate seq mismatches refused inside recordDecision; request-changes binding-digest pre-check; replay with --request-id; after-response effect drained and EFFECT_FAILED exits 1; release token printed once and replay answers TOKEN_ALREADY_DELIVERED; verify exit 0/1/2 for project and file; export --out containment, symlink refusal, run id segment; strict claim mode on the seven registered result paths; REPL mappings. A scratch probe (p165-probe/probe.mjs) exercised the first eight and the policy-gate approve path.
