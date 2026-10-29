# A4 verification debt (P2-35)

This file records what P2-35 owes and what it has paid: the sixteen acceptance scenarios of design §17, the negative
fixtures, the mutation checks, and the "P2-35 debt" paragraphs collected from the A4 closing notes (appendix). A case
marked **pending** has no test yet; the reason is given. Nothing here is skipped silently: the suite has no `skip` or
`todo` for these cases.

## Harness

- `tests/a4/a4Harness.ts` drives `handleA4Route` (the HTTP entry) in process with a Studio-session identity and a real
  native task service. Users are real, signed `users.yaml` rows in the keyed governance fixture workspace
  (`tests/governor/governanceFixture.ts`), so roles, population, SoD and the ratchet read live records. The clock is
  faked only where a case needs it (gate TTL, acknowledgement expiry). `a4Child` runs `tests/fixtures/a4/a4Child.mjs`, a
  second Node process on the built code (`dist/`), for the two-process races and the crashed effect owner.
- `tests/a4/a4Journey.ts` drives one project from Aspire to production through the routes: alice (OWNER) authors and
  builds; bob and a4-owner approve; audrey (AUDITOR) casts Adapt's required role vote. Assemble takes the `other` path
  (no native build session; its unsupported items are acknowledged out of scope). Adapt runs on the shipped catalog
  (P2-42 closed the overflow that made P2-35 mock a five-control catalog; the mock and `tests/a4/thinCatalog.ts` are gone).
  Activate targets helm on a Studio that reads as hosted (`KUBERNETES_SERVICE_HOST`, the v1 same-host restart);
  the destination is a public IPv4 literal and every reachability probe runs the real `probeDestination` with its HTTP
  fetch replaced, so no socket opens. Effect gates are opened by alice and approved through the engine by bob and a4-owner.
- The provider is never called: Aspire runs no model, Assemble's `other` path starts no build session.

## Acceptance scenarios (design §17)

| # | Scenario | Status | Test file | Reason codes asserted |
| --- | --- | --- | --- | --- |
| 1 | Misunderstood intent | covered | `scenario01MisunderstoodIntent.test.ts` | UNDERSTANDING_NOT_CONFIRMED, A4_STEP_ORDER |
| 2 | Requested revisions | covered | `scenario02RequestedRevisions.test.ts` | CHANGES_REQUESTED, A4_GATE_STALE, A4_GATE_SEQ_MISMATCH |
| 3 | Stale approvals | covered (RESOURCE_DRIFTED on an open gate: scenario 16 covers it at the executor) | `scenario03StaleApprovals.test.ts` | A4_GATE_STALE (request, memberSet, consumed), A4_GATE_SEQ_MISMATCH, GATE_EXPIRING, GATE_EXPIRED |
| 4 | Unauthorized progression | covered (cross-plane HTTP session pending) | `scenario04UnauthorizedProgression.test.ts`, `routerAdmission.test.ts`, `scenario16…`, `scenario09…` | SOD_VIOLATION, A4_NOT_A_MEMBER, ADMIN_TOKEN_REFUSED, DEMO_REFUSED, A4_NOT_READY, A4_DUPLICATE_DECISION, PRINCIPAL_ROLE_INSUFFICIENT, A4_USER_DISABLED, EFFECT_QUORUM_INSUFFICIENT |
| 5 | Collaborative conflicts | covered | `scenario05CollaborativeConflicts.test.ts`, `storeDedupe.test.ts`, `twoProcessRace.test.ts` | A4_STALE_HEAD, REQUEST_CONFLICT, SECRET_IN_REQUEST_ROW, replay across processes |
| 6 | Changed operating markets | covered | `scenario06ChangedMarkets.test.ts` | PLAN_STALE, PLAN_MISSING_FACTS, UNRESOLVED:L2-FIX-US-01, A4_GATE_STALE, NO_RELEASE |
| 7 | Unsupported integrations | covered | `scenario07UnsupportedIntegrations.test.ts` | UNSUPPORTED_INTEGRATION, PATH:other, STATUS:preview, OWNER_ACKNOWLEDGED, A4_NOT_ACKNOWLEDGEABLE |
| 8 | Failed deployment | covered | `scenario08FailedDeployment.test.ts` | DEPLOYMENT_UNCHECKED, RECEIPT_NOT_SUCCEEDED, READYZ_FAILED, REDIRECT_REFUSED, DESTINATION_MISMATCH, PACKAGE_DIGEST_MISMATCH, DEPLOYMENT_IDENTITY_NOT_EVALUATED |
| 9 | Rollback | covered (freeze-first for high/critical pending) | `scenario09Rollback.test.ts` | EFFECT_QUORUM_INSUFFICIENT, SOD_VIOLATION, RELEASE_ROLLED_BACK, PACKAGE_DIGEST_MISMATCH |
| 10 | Hold / freeze / kill switch | covered (freeze and kill switch pending) | `scenario10HoldFreeze.test.ts` | A4_ON_HOLD (ON_HOLD), NOT_ON_HOLD |
| 11 | Single-user workspace | covered (hosted rows pending) | `scenario11SingleUser.test.ts`, `scenario15AcknowledgedBlocker.test.ts`, `guards.test.ts` | SOD_DEGRADED_SINGLE_USER (selfApproved), SOD_VIOLATION after the ratchet, SOD_DEGRADED_SELF_PROVISIONED |
| 12 | Vault locked / no-sign | covered | `scenario12VaultLocked.test.ts` | A4_VAULT_LOCKED (423), VAULT_LOCKED, UNSIGNED_STORE |
| 13 | Tampered record | covered | `scenario13TamperedRecord.test.ts`, `recordFixtures.test.ts` | A4_SIDE_ROW_MISMATCH, A4_CHAIN_INVALID, A4_INTEGRITY_FAILED (readiness BLOCKED) |
| 14 | `outcome_unknown` lockout | covered | `scenario14OutcomeUnknown.test.ts` | OUTCOME_UNKNOWN_OPEN, EXECUTION:<id>, A4_NOT_READY, SOD_VIOLATION |
| 15 | Acknowledged blocker | covered | `scenario15AcknowledgedBlocker.test.ts`, `scenario07…`, `guards.test.ts` | SOD_DEGRADED_SELF_PROVISIONED, OWNER_ACKNOWLEDGED (bound, never READY, expires after 90 days), A4_GATE_STALE |
| 16 | Effect drift and crash | covered | `scenario16EffectDriftCrash.test.ts` | EFFECT_QUORUM_INSUFFICIENT, SOD_VIOLATION, EFFECT_FAILED (RESOURCE_DRIFTED signedConfigs.tools, process_lost), EFFECT_RUNNING / EFFECT_NOT_RETRYABLE |

Still open inside covered scenarios: a freeze or kill switch raised mid-effect (scenario 10/16), freeze-first rollback
for a high or critical risk tier (scenario 9), a WORKSPACE_ROUTER session (cross-plane, hosted single-user; needs a
router session record), and Assemble's native path (a stub-provider build session through the native task service).
The D-23 end-to-end qualification (one project Aspire → Activate on a non-stub provider, macOS and Linux ARM64, receipts
under `qualification/<date>-P1-62/`) is Sid's and stays pending.

## Negative fixtures

The fixtures are data tables inside the tests (the published OpenAPI route list, the tamper SQL, the a4-record
verdict table, the trust-list entries) rather than files under `tests/fixtures/a4/`: each is generated from the code
under test, so a new route or table is covered without a fixture edit. `tests/fixtures/a4/a4Child.mjs` is the one file.

| Fixture | Status | Test |
| --- | --- | --- |
| admin-token POST to every mutation route (POST /projects included) | covered | `routerAdmission.test.ts` |
| demo POST to every mutation route and demo GET | covered | `routerAdmission.test.ts` |
| `?trustList=` on `GET …/verify` → 400 QUERY_INVALID; a body → 400 INPUT_INVALID | covered | `routerAdmission.test.ts` |
| no Studio session; preview off; read-only Studio; unknown user | covered | `routerAdmission.test.ts` |
| stale (old request digest; superseded; expired; expired before complete) | covered | `scenario03StaleApprovals.test.ts` |
| replayed (same clientRequestId, concurrent, two processes) | covered | `scenario05…`, `storeDedupe.test.ts`, `twoProcessRace.test.ts` |
| cross-workspace / cross-project request id | covered (cross-project) | `storeDedupe.test.ts` |
| cross-plane vote | covered (pure) | `guards.test.ts`; an HTTP router session is **pending** (no WORKSPACE_ROUTER session record fixture) |
| forged key, rotated-out key (expired, revoked, key-compromise), expired or inactive attestation, own workspace key, wrong purpose, other bytes | covered | `verifiedLane.test.ts` |
| missing evidence, deleted side row | covered | `scenario13TamperedRecord.test.ts`, `recordFixtures.test.ts` |
| digest-less decision | covered | `recordFixtures.test.ts` (stale-approval: DECISION_NOT_BOUND) |
| single-user; self-provisioned regulated quorum | covered | `scenario11SingleUser.test.ts`, `scenario15AcknowledgedBlocker.test.ts` |
| a member or evidence ref added after the gate opened | covered | `scenario03StaleApprovals.test.ts`, `guards.test.ts` |
| an OBSERVED tier declared on an imported row; a `lane = observed` ref on a SELF_REPORTED row | covered | `hypotheses.test.ts` (the ledger refuses the declaration), `guards.test.ts` |
| a hypothesis observed with a SELF_REPORTED ref, outside its window, about another metric, before Aspire is left, dangling, twice | covered | `hypotheses.test.ts` |
| a verify against a host other than the receipt's | covered: the receipt itself is refused (DESTINATION_MISMATCH), so no check can probe another host | `scenario08FailedDeployment.test.ts` |
| a 3xx from the destination; a 503 | covered | `scenario08FailedDeployment.test.ts` |
| drift; effect_failed; `process_lost` | covered | `scenario16EffectDriftCrash.test.ts` |
| head regression | covered | `scenario05CollaborativeConflicts.test.ts` (A4_STALE_HEAD) |
| duplicate vote | covered | `scenario04UnauthorizedProgression.test.ts` (A4_DUPLICATE_DECISION), `guards.test.ts` |
| dangling value ref | covered (ledger ref) | `recordFixtures.test.ts` (REF_DANGLING); value claims **pending** |
| readiness item `section: integrity` with a `claimKind` | covered before P2-35 | `tests/fixtures/contracts/a4-readiness/invalid/integrity-item-with-claim.json` |
| `claimKind: observed` without a resolved OBSERVED ref | covered | `guards.test.ts`, `hypotheses.test.ts` |
| a second vote whose readiness binding differs (`second-vote-lands` must hold) | covered | `recordFixtures.test.ts` |
| a decision while a bound mandatory item is NOT_EVALUATED | **pending** | no stage leaves a bound item unproduced at decision time in the reachable flow |
| an acknowledged item rendered READY or COMPLETE; an expired acknowledgement still unblocking | covered | `scenario07…`, `scenario15AcknowledgedBlocker.test.ts` |
| `a4_evidence_refs.trust_tier` differing from the referenced row's tier | covered by code reading only (TRUST_TIER_CHANGED/INFLATED in `resolveRefs`); a test is **pending** | |
| a composed "experimental" sentence in `src/a4` text | covered before P2-35 | `tests/a4GuardQualification.test.ts` (P0-54 scanner) |
| two POSTs with one clientRequestId from two processes | covered | `twoProcessRace.test.ts` |
| a resource edited between `complete` and the executor still packaged | covered (Assemble's apply effect) | `scenario16EffectDriftCrash.test.ts` |
| a live slow executor swept by a wall-clock bound | covered (not swept at a zero staleness bound) | `scenario16EffectDriftCrash.test.ts` |
| a decision landing on a consumed gate; a post-consume DENY revoking a lease | covered | `scenario03…`, `leases.test.ts` |
| a client `expectedGateSeq` equal to the head seq | covered | `scenario03StaleApprovals.test.ts` |
| a production-scoped lease minted at release | covered (none is) | `leases.test.ts` |
| a package file whose sha256 differs from its bound slot | covered at the receipt (PACKAGE_DIGEST_MISMATCH); a tampered file inside the package directory is **pending** | `scenario08…`, `scenario09…` |
| a monitor ref resolving to lane `observed` | covered | `leases.test.ts` |
| a verify row `passed` without a release-identifying check | covered (`reachable`, never `passed`) | `scenario08FailedDeployment.test.ts` |
| no lease token in `a4_requests.response_json` | covered with real leases | `leases.test.ts`, `scenario05…`, `storeDedupe.test.ts` |

## Mutation checks

Each guard was broken in the worktree (`src/` edited, the named tests run, the file restored with `git checkout`). A
mutation is **killed** when at least one named test failed. Mutations run against `src/` through vitest; the child
processes of `twoProcessRace.test.ts` run `dist/`, so the store dedupe they exercise is mutated through D1 to D3.

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
| E1 | `verifyAndConsumeEffect` quorum count | never refuse a short count | survived: equivalent (the engine's own `verifyApprovalForExecution` refuses the same short quorum first, with the same 409 EFFECT_QUORUM_INSUFFICIENT) | — |
| E2 | `verifyAndConsumeEffect` | skip it (count the caller and return) | killed | scenario16 › the engine quorum is re-counted under A4's SoD before the grant is consumed |
| Q1 | the quorum `now` path (`consumeGate` expiry at `Math.max(now, ts)`) | evaluate at a year earlier | survived: equivalent here (readiness reads the gate EXPIRED at `now` first); only the few-millisecond window where the commit ts passes expiry after the read distinguishes it, which P1-63's dist probe covered and a test cannot time | — |
| V2 | `verifiedDowngradeReason` attestation expiry | drop ATTESTATION_EXPIRED | killed | verifiedLane › an expired attestation … |
| V3 | `verifiedDowngradeReason` rotation | drop KEY_ROTATED_OUT | killed | verifiedLane › a rotated-out key … |
| V4 | `verifiedDowngradeReason` own key | drop the workspace-key refusal | killed | verifiedLane › the workspace's own auditor key never counts … |
| H1 | observe: OBSERVED tier | drop HYPOTHESIS_NOT_OBSERVED | killed | hypotheses › refusals and the one observation that counts |
| H2 | observe: window | drop HYPOTHESIS_OUTSIDE_WINDOW | killed | hypotheses › refusals and the one observation that counts |
| DR1 | executor preamble drift | drop RESOURCE_DRIFTED | killed | scenario16 › a bound resource edited after the attempt started … |
| SW1 | `effectOwnerLost` dead owner | ignore a dead pid | killed | scenario16 › a dead owner is swept to process_lost … |
| SW2 | `effectOwnerLost` live executor | sweep this process's running executor | killed | scenario16 › a dead owner is swept … a live executor is not … |
| DP1 | `recordDeployment` destination | accept any destination | killed | scenario08 › … a receipt for another host is refused |
| DP2 | `deployment.amc_check` on a failed check | never BLOCKED | killed | scenario08 › a failed receipt … a 503 then blocks the approval; … a 3xx is refused and blocks |
| LS1 | `revokeStagingAfterDeny` | revoke nothing | killed | leases › a DENY of the deployment approval revokes the staging lease |
| RB1 | rollback lease revocation | revoke nothing | killed | scenario09 › a production rollback … |
| OU1 | `no_open_outcome_unknown` | READY while an execution is open | killed | scenario14 › an open outcome_unknown blocks Assemble … |

Notes: at the router, `priorReplay` answers a recorded request before the store runs, so the store's dedupe (D1 to D3)
is reachable directly (`storeDedupe.test.ts`) and by two processes that both pass the router check.

## Follow-ups found (no security or fail-open defect was found)

- **Closed by P2-41 · A4 hold refusal code.** Design §17 names `409 A4_ON_HOLD` for every mutation on a held project;
  the routes answered `409 A4_NOT_READY` with `reasonCodes: ["ON_HOLD"]`, a second hold included. `assertAllowed`
  (src/a4/a4Gates.ts) now answers `409 A4_ON_HOLD` whenever the action's reason codes name `ON_HOLD`, with the same
  `detail` (`reasonCodes`, `items`); 403 role refusals and `FREEZE_ACTIVE` still come first, and a rollback still
  settles `ON_HOLD`. `scenario10HoldFreeze.test.ts` asserts it for a stage write, a gate request and a second hold.
- **Closed by P2-41 (same item) · tampered readiness.** Design §17 says readiness reads BLOCKED on a tampered record;
  `GET …/readiness` answered `409 A4_INTEGRITY_FAILED` whose `detail` listed the failed rows (table and key, member
  principal keys included) before membership was checked. It now answers `409 A4_INTEGRITY_FAILED` with the fixed
  `detail: { status: "BLOCKED", reasonCodes: ["A4_INTEGRITY_FAILED"] }` and no row named. The status stays 409, not a
  200 readiness document: no readiness can be evaluated over rows that fail verification, and the member rows that
  decide who may read the project are among them, so the answer stays a fail-closed refusal (design text in
  docs/A4_FORGE.md "The journey"). `scenario13TamperedRecord.test.ts` asserts the verdict and that the body names no
  table, principal or problem.
- **Closed by P2-41 (follow-up) · integrity problems before membership.** Every other project route answered a record
  that fails verification with the store's problem list in `detail` (side-row keys, member principal keys included)
  before `assertVisible`, and a stored row that did not parse with its parse issue in the message. `sendA4Error` now
  gives every `A4_INTEGRITY_FAILED` it sends the fixed `detail` above, and a row that does not parse the fixed message
  `A stored A4 record does not parse.` (the MCP tools' refusal too); the readiness-only wrapper is gone. Only
  `GET …/verify` returns the problems: to a workspace OWNER or AUDITOR, the admin token, or a member proven by member
  rows that verify. When the member rows fail, any other reader now gets `409 A4_INTEGRITY_FAILED` with the fixed
  detail (it was `403 A4_NOT_A_MEMBER`). `scenario13TamperedRecord.test.ts` covers the project, transitions, readiness
  and hold routes on each tamper, a head row that does not parse, a VIEWER member reading the report, a non-member
  refused with 403, and both refused with the verdict when the member rows fail. Kept: workspace OWNERs, AUDITORs and the
  admin token still read the report without membership, since it exists to show a failing chain. Not changed:
  `amc bundle export` still names up to three problems in its refusal; it is an operator export, not a project route.
- **Closed by P2-42 · Adapt cannot propose on the shipped catalog.** With the shipped admitted catalog, Adapt carried
  the compiled plan (about 140 to 150 KiB: the catalog lock, the evidence plan, the requirements) twice, in
  Understand's facts and in the proposal, so every proposal exceeded `SPEC_ROOM_FOR_BUILD` (240 KiB) and
  `POST …/stages/adapt/propose` answered 413 INPUT_TOO_LARGE. Since P2-42 an Adapt row binds the plan by sha256
  (`amc.a4-derived-ref/v1`) and the plan is stored once under `a4-projects/<projectId>/derived/` (src/a4/a4Derived.ts);
  readers get it back checked, and a missing or changed file is `A4_INTEGRITY_FAILED`. The same binding then took the
  why-view, the register entries, the clock candidates, the explanation and Review's control lists out of the rows
  (kind `json`), so a project on all seven stations crosses Review too (about 15 KiB per stored row). The revision
  route keeps the stored form; `GET …/revisions/:n/resolved` is the checked, resolved view the Studio pages read. The
  256 KiB limit stays. `tests/a4/p242ShippedCatalog.test.ts` crosses Adapt on the technology and wealth stations and on
  all seven, with no mock, and the journey scenarios (06, 08, 09, leases) now run on the shipped catalog: scenario 06
  asserts an `UNRESOLVED:<control>` of the shipped catalog instead of the fixture's `L2-FIX-US-01`. Sizes per station
  are in `qualification/2026-10-29-P2-42/spec-sizes.txt` and `spec-sizes-v2.txt`. A restore of the ledger without
  `a4-projects/` now leaves Adapt unreadable (`A4_INTEGRITY_FAILED`); docs/A4_FORGE.md "What carries `a4-projects/`"
  says which backup carries it and how to restore.
- **Note (no defect) · lease ids in `a4_requests`.** The spec's case greps `response_json` for `lease_` and expects
  none; by design (P1-62) a credential-bearing request stores the projection `{ releaseId, leaseIds, tokenDelivered }`,
  so lease *ids* are recorded and the token never is. The tests assert the token, not the id, is absent.

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
