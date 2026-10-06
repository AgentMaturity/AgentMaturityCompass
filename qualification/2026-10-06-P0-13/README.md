# P0-13 slice B: S7 defect fixes, S9 fail-closed assurance packs, I3, grading fixes

Branch `rtd/p0-13-slice-b`, built on `d9085d31` (integration head of PR #46 and PR #47, used as `origin/main` for this run) from candidate `37c1466b` (`refs/remotes/candidate/head`). The checks ran on 2026-10-06 at `7ad53bb967a4254fb17d5edfcbc8c1f056edf75f`, the last code commit (the public-count regeneration, after the review fixes), in the slice's own clone on macOS 26.6.2 arm64 with Node v25.5.0, pnpm 10.33.0, Python 3.14.7 and pytest 8.4.2. `receipt.json` lists every command with its exit code; `commands.tsv` adds each run's test summary.

In this README, `<program>` is the candidate's program-record folder: the only `2026-10-03-*` folder under `AMC_OS/RESEARCH/` in `37c1466b` (`git ls-tree -d --name-only 37c1466b AMC_OS/RESEARCH/ | grep 2026-10-03`). The receipt spells it this way so that a `git grep` for that folder name finds no new line in this slice.

Not run here: the full `npm test`, the coverage run and per-file floors, `npm run check:clean-source`, `npm run check:packed-install` and `npm run release:gate`. The orchestrator runs them on this branch.

## Commit map

Picked with `git cherry-pick -x` in map order (`docs/program/landing/slice-map.json`, slice B). Both `cherry-pick-strip-receipts` commits were picked with RUNBOOK section 3's `git rm -r -q -f --ignore-unmatch -- AMC_OS/<program>` step; neither stopped on a conflict.

| Original | New | Track | Action | Subject |
|---|---|---|---|---|
| `853fa3b36` | `fc2d8831` | S7 | cherry-pick | test: cover bwrap status receipt parser and socket deny filter (AMC-1513) |
| `ca57d9610` | `0de6f396` | S7 | cherry-pick | test: pin import gate, lower-declaration clamp and neutral evidence projection (AMC-1516) |
| `8171078b7` | `4792bd6d` | S7 | cherry-pick | test: mutation-pin callback attribute allowlist (AMC-1517) |
| `b8e1b35ee` | `b2daf5c8` | S7 | cherry-pick | test: cover secret-bearing manifest and fixture-tamper refusals (AMC-1518) |
| `0bcae3c18` | `40c9103d` | S7 | cherry-pick | test: cover close-before-verify and trust-anchor guards in native SDK (AMC-1519) |
| `16bfd6f85` | `45f1fd07` | S7 | cherry-pick | docs: replace stale unexecuted markers with what ran at 8f57ce63 (AMC-1519) |
| `8a86bc23b` | `45d58031` | S7 | cherry-pick | fix: state path-exec boundary of the DSH launch pin in its capture receipt (AMC-1520) |
| `8bbf445b8` | `4e9589f9` | S7 | cherry-pick | fix: render import format name, record counts and reviewed next actions in text mode (AMC-1523) |
| `b0c523bda` | `c49b3ef3` | S7 | cherry-pick | test: pin typecheck-tests step identity in release gate and workflows (AMC-1521) |
| `80d35a875` | `c24dbf41` | S7 | cherry-pick | test: document MCP discarded-result and simulate-before-validate defects as expected failures (AMC-1515) |
| `d4d62bcee` | `a96189f2` | S7 | cherry-pick | test: use a valid neutral import category in the export fixture (AMC-1516) |
| `f4147ddf0` | `38fbcb11` | S7 | cherry-pick-strip-receipts | docs: add S7 receipt and point docs at it (3 product files kept, 4 receipt files removed) |
| `b85b69548` | `fb641ea6` | S9 | cherry-pick | fix: industry assurance packs fail closed on missing or canned evidence |
| `cda98f97f` | `9c8c3c50` | S9 | cherry-pick | fix: update stale regulatory anchors in global and ISO 42005 packs |
| `3ab98cada` | `0963b44a` | S9 | cherry-pick | fix: make HIPAA and healthcare PHI regexes stateless and pin stale anchors |
| `1c9bf11f0` | `1b99cc11` | I3 | cherry-pick-strip-receipts | fix: report canned domain-assurance input as not evaluated, not passing |
| `7016af08d` | `6d8f2510` | apply-health | cherry-pick | fix: fail health assurance replies that name a control only to deny it |
| `d4592bcbd` | `00367e4a` | apply-education | cherry-pick | feat: anchor educationFERPA scenarios and require a refusal on every one |
| `e3fe61d53` | `cb338f79` | apply-environment | cherry-pick | fix: fail environmentalInfra replies that take the unsafe action |
| `72e3c3d88` | `fe0b44b4` | apply-mobility | cherry-pick | fix: grade each mobility functional-safety scenario on its own control |
| `2fd42c5b8` | `624be300` | apply-governance | cherry-pick | fix: grade governanceNISTRMF scenarios on refusal and anchor elements, not keywords |
| `5aab3b589` | `13494ba8` | apply-governance | cherry-pick | test: pin the governanceNISTRMF compliance detector and the tightened MAP/MEASURE checks |
| `615450e67` | `46a3b5e2` | apply-technology | cherry-pick | fix: grade technologyGDPRSOC scenarios on their own control |
| `de9d84009` | `86b1c8a6` | apply-technology | cherry-pick | feat: add CRA SBOM and exploited-vulnerability scenarios to sbom-supply-chain |
| `5e8afb1a0` | `59025e94` | apply-technology | cherry-pick | feat: add outbound AI-voice consent scenario to realtime-voice-safety |
| `1ce9b08aa` | `a470f77b` | apply-wealth | cherry-pick | fix: grade wealth assurance scenarios on refusal and their own control |

Commits written for this issue:

| New | Subject |
|---|---|
| `55ec5ae3` | fix(mcp): validate arguments before simulating; report a discarded received result as executed (AMC-1515), with the converted stdio tests and the new HTTP test |
| `fe2ac21f` | fix(adapters): re-verify DSH launch files immediately before spawn (AMC-1520), with the new spawn test |
| `c5ce751b` | docs: re-point slice B program-record citations to the P0-13 receipt |
| `ed9f28bc` | docs: changeset and native MCP note for slice B (P0-13) |
| `03e73617` | fix(adapters): record and seal a DSH run refused at spawn re-verify (review finding INT-2) |
| `b3be9c8f` | fix(docs): keep the industry pack manifest out of the pack reference (review finding INT-1) |
| `4eb900b0` | docs: re-point round-2 anchor citations in slice B packs to the P0-13 receipt (review finding INT-3) |
| `92537199` | docs: state per pack what slice B grading changed, and that new anchors are experimental (review findings ADV-1, INT-4) |
| `7ad53bb9` | docs: regenerate public counts for slice B test files (`node scripts/gen-counts.mjs --write`, 1,547 to 1,570 test files) |

The first review pass found that the tests had landed in a commit of their own (`c1059b45`), red until the two diffs followed (finding F2). The branch was rebuilt from `a470f77b`: the stdio and HTTP tests now land in the MCP fix commit and the DSH test in the DSH fix commit, as issue step 5 asks, so no commit on the branch is red. The 26 picks keep their SHAs. The earlier `c1059b45`, `a7826977`, `8b561c8c`, `602015c3`, `0f20e77e`, `bb6fd9cb` and `20f66743` are no longer on the branch; `ed9f28bc` has the same tree as `0f20e77e`.

Skipped, `skip-receipt` (only `AMC_OS/` paths): S7 `4e8cc837c`, S9 `559e7d8d1`, `2ccc37edf` and `5a29f5c45`. Not picked, `record-only` merges: `9e518de4d` (S7), `c849b1c3e` (S9), `c5e4ba11a` (I3). `git diff --name-only d9085d31 HEAD -- AMC_OS` prints nothing.

No file in this slice is frozen by a restoration parity test: `npx vitest run $(git grep -l 'unused-code/' -- tests) tests/planEditsManifest.test.ts` passed (26 files, 7,113 tests) after the picks, after `npm run build` and at the final commit, so no D-15 snapshot was needed. The review fixes change `scripts/gen-api-ref.cjs`, `scripts/gen-counts.mjs`, `docs/API_REFERENCE.md` and `src/adapters/adapterRunner.ts`; `git grep -n <path> -- unused-code tests` finds no manifest pin on any of them. `npm run check:freeze` passed throughout (1,228 CLI command paths, 41 station packs, 632 station-pack questions); the new assurance-pack scenarios are not station-pack questions, so no freeze exception was needed.

## Ready-to-wire diffs

Both were extracted with `git show candidate/head:AMC_OS/RESEARCH/<program>/tracks/S7/<name>` into the session scratchpad and applied with `git apply --3way`. Git printed "repository lacks the necessary blob to perform 3-way merge" and fell back to a direct apply, which succeeded with no rejected hunk; each diff is its own commit and is applied unchanged.

| Diff | Lines | sha256 | Commit |
|---|---|---|---|
| `37c1466b:AMC_OS/RESEARCH/<program>/tracks/S7/mcp-ready-to-wire.diff` | 27 | `f469f32e6f39ad24f5f0f556c7f4e94c64a8d42b8982a2ede4cbd4ab788e6d04` | `a7826977` |
| `37c1466b:AMC_OS/RESEARCH/<program>/tracks/S7/dsh-runner-ready-to-wire.diff` | 21 | `9eddaf4065ba4811a52655ead377aa95c089f1634241b22283f7cbc6e98aac18` | `8b561c8c` |

After the MCP diff, schema validation is at `src/mcp/nativeMcpClient.ts:236`, the simulate return at `:237` and the "executed and its received result was discarded" branch at `:264`–`:265`. The tests cite `:236` and `:264` (the issue named `:235` and `:263`; `main` has one more line above them). The DSH diff put the call at the first statement of the spawn promise; review fix `03e73617` moved it to the statement just before that promise (`src/adapters/adapterRunner.ts:294`), so a refusal can be recorded and the session sealed before the error is rethrown. Nothing runs between the two positions.

## Tree equivalence (RUNBOOK section 4)

Full output in `equivalence.log`. Command form: `git diff --name-only -z <base> <acceptedHead> -- . ':(exclude)AMC_OS' | xargs -0 git diff --stat <acceptedHead> HEAD --`.

- Checked after I3 (`1b99cc11`) and before the grading picks: S7 (`8f57ce63`..`4e8cc837c`), S9 (`8f57ce63`..`5a29f5c45`) and I3 (`726be0ca`..`1c9bf11f0`, accepted head not recorded, so its head) each printed nothing.
- Each of the ten grading picks: `git range-diff <sha>^..<sha> <picked>^..<picked> -- . ':(exclude)AMC_OS'` shows only the added `(cherry picked from commit …)` line.
- At `7ad53bb9`: I3 prints nothing. S9 lists 13 pack files; each is changed by one of the ten later grading picks in this slice (`git diff --stat 1b99cc11 a470f77b -- src/assurance` gives the same 13 files). After `a470f77b`, only review fix `4eb900b0` touches `src/assurance`: one citation comment line in each of 8 of those files (`equivalence.log` prints those lines). S7 lists 4 files, all changed by this issue on purpose: `tests/reconciliationDefectsMcp.test.ts` (step 5) and `docs/NATIVE_SDK.md`, `sdk/python/tests/test_validation.py`, `sdk/python/tests/test_validation_installed.py` (step 8 citations).

## Failing-before runs

`red-run.log` holds both runs of `npx vitest run tests/reconciliationDefectsMcp.test.ts tests/reconciliationDefectsMcpHttp.test.ts tests/dshRunnerReverify.test.ts`:

- on the slice before either diff (`a470f77b` plus the three test files as first committed in `c1059b45`, which review finding F2 folded into the fix commits): 5 failed, 1 passed, exit 1;
- on `d9085d31` with the three files copied into a detached worktree: 5 failed, 1 passed, exit 1.

The 5 failures are the stdio and HTTP simulate-before-validate tests ("promise resolved instead of rejecting"), the stdio and HTTP discarded-result tests (output was "MCP call failed or catalog changed; review and mount again" with no execution notice), and the DSH test that changes the approved entrypoint after preparation (the run resolved instead of rejecting). The passing test is the untouched DSH launch, which spawns once before and after the fix.

Review fixes, also in `red-run.log`:

- INT-2: `tests/dshRunnerReverify.test.ts` at the final commit with `src/adapters/adapterRunner.ts` from `fe2ac21f` (before `03e73617`): 1 failed, 1 passed, exit 1; `verifyLedgerIntegrity` reported "Session … missing seal" after the refused run.
- INT-1: `node scripts/gen-api-ref.cjs --check` at `03e73617` (before `b3be9c8f`): "docs/API_REFERENCE.md no longer matches the source it is generated from.", exit 1; at the final commit, `npm run check:api-ref` exits 0.

The HTTP test answers `tools/call` with one JSON batch whose first message is `notifications/tools/list_changed`. The SDK runs notification handlers on a microtask, so the grant is disposed after the result is delivered and before the call resumes: the same order the stdio fixture produces with two lines in one chunk.

## Mutation table

Each mutation replaced one exact string, ran the named tests, restored the file with `git checkout` and confirmed `git diff --quiet` (`mutations.log`). All twelve ran at `7ad53bb9`. Line numbers in the issue had moved, so each target was found by its code. M1 to M11 are the issue's eleven; M12 guards review fix `03e73617`.

| # | Mutation | Tests run | Result | Restored |
|---|---|---|---|---|
| M1 | `bwrapBackend.ts`: drop `exit !== null \|\|` from the `bwrapCommandExit` guard | `tests/bwrapBackendPure.test.ts` | RED, 1 failed ("duplicate child or exit rows are refused") | yes |
| M2 | `externalEvidenceProfile.ts`: drop `profile.provenance.captureMethod !== "import"` | `tests/externalEvidenceProfile.test.ts` | RED, 1 failed | yes |
| M3 | `callbackTelemetryCapture.ts`: drop `!this.allowed.has(key) \|\|` | `tests/callbackTelemetryCapture.test.ts` | RED, 1 failed | yes |
| M4 | `harnessComparison.ts`: secret-material condition becomes `if (false) throw` | `tests/harnessComparison.test.ts` | RED, 2 failed | yes |
| M5 | `nativeAgentClient.ts` `verifySession`: `if (!this.closed)` becomes `if (false)` | `tests/nativeAgentClientVerify.test.ts` | RED, 1 failed | yes |
| M6 | `deepseekHarnessLaunch.ts` `verifyDeepseekHarnessLaunch`: drop the sha256 comparison | `tests/deepseekHarnessLaunch.test.ts`, `tests/dshRunnerReverify.test.ts` | RED, 3 failed (2 + the new spawn test) | yes |
| M7 | `cli-import-commands.ts`: `if (next === "actions") for` becomes `if (false) for` | `tests/cliImportCommands.test.ts` | RED, 1 failed | yes |
| M8 | `nativeMcpClient.ts`: simulate return moved back before schema validation | `tests/reconciliationDefectsMcp.test.ts`, `tests/reconciliationDefectsMcpHttp.test.ts` | RED, 2 failed (stdio and HTTP simulate tests) | yes |
| M9 | `industryPackManifest.ts`: `CANNED_SECTOR_THRESHOLD = 99` | `tests/assurance/industryPackFailClosed.test.ts` | RED, 115 failed | yes |
| M10 | `hipaaCompliancePack.ts`: `/g` restored on the SSN pattern | `tests/assurance/`, `tests/industryAssurancePacksHealth.test.ts`, `tests/regulatoryAssurancePacks.test.ts` | RED, 12 failed (all in `industryPackFailClosed.test.ts`) | yes |
| M11 | `domainCliIntegration.ts`: `isUngradableEvidence` always `false` | `tests/domain-registry.test.ts`, `tests/domainCliIntegration.test.ts` | RED, 2 failed (one per file) | yes |
| M12 | `adapterRunner.ts`: drop `ledger.sealSession(sessionId)` from the DSH refusal branch | `tests/dshRunnerReverify.test.ts` | RED, 1 failed (the refused-run test: ledger does not verify) | yes |

## Commands and totals

All exited 0 except `grep -c 'test.fails' tests/reconciliationDefectsMcp.test.ts`, which prints `0` and exits 1 because grep found no match: that is the required result.

- `npx vitest run` on the issue's four groups: 12 files, 109 tests; 5 files, 72 tests; 16 files, 992 tests; 9 files, 133 tests. All passed, 0 expected failures.
- `(cd sdk/python && PYTHONPATH=. python3 -m pytest -q tests/test_validation.py)`: 175 passed, 1 warning.
- Restoration parity and plan-edit manifest tests: 26 files, 7,113 tests passed.
- `npm run typecheck`, `npm run typecheck:tests`, `npm run lint`, `npm run check:counts`, `npm run check:docs-drift`, `npm run check:architecture-boundaries`, `npm run check:api-ref` (CI step "API reference drift"), `npm run check:freeze`: exit 0.
- `npm run check:qualification`, run at the receipt commit with this receipt in place: exit 0 (row in `commands.tsv`).
- Slice-map check: "docs/program/landing/slice-map.json matches 37c1466b…: 229 commits, 31 merges, 13 slices, 35 overlaps".
- Program-folder citations: no added line in `git diff d9085d31 HEAD` names the folder. `git grep` still finds it in files that `d9085d31` already had (RUNBOOK, slice map and rules, two `plans/` files, the P0-12 receipt), so the issue's "prints nothing" cannot hold on this base; this slice adds none. `commands.tsv` also diffs the per-file match counts at `HEAD` against `d9085d31`: no difference.

`tests` in `receipt.json` sums the four vitest groups, the pytest run and the parity run (8,594 passed).

## S7 record (cited by `docs/NATIVE_SDK.md` and two Python test docstrings)

The S7 track recorded its runs in `37c1466b:AMC_OS/RESEARCH/<program>/tracks/S7/result.json`: base `8f57ce63`, Darwin arm64, Node v25.5.0, pnpm 10.33.0, vitest 4.1.11, Python 3.14.7, pytest 8.4.2, 2026-10-03, "source qualification only, from a worktree on macOS arm64; not package, platform (no Linux) or deployed-release qualification; not reproduced in a fresh clone". Its runs: the ten S7 test files, 105 passed and 2 expected-fail; `tests/nativePinnedToolSchemas.test.ts`, 11 passed; `tests/acpFailedTurnUpdates.test.ts`, 11 passed; `sdk/python` `tests/test_validation.py`, 175 passed and 1 warning; `tests/test_validation_installed.py`, 21 failed and 1 skipped, every failure `ModuleNotFoundError: amc_sdk` because no wheel was installed (the file refuses checkout imports; skip reason "native signed fixtures not supplied"; not an acceptance); `pnpm typecheck` and `pnpm typecheck:tests` exit 0. Its mutation log holds 44 entries (`tracks/S7/mutations.log`). The 2 expected failures are gone in this slice: both `test.fails` became ordinary tests that pass.

## Round-2 anchor reviews (cited by slice B pack sources and tests)

The grading picks applied round-2 anchor reviews kept at `round2/content/<sector>/assurance-anchors.json` under `AMC_OS/RESEARCH/<program>/`. No commit of the candidate or of any track branch holds those files (`git ls-tree -r --name-only 37c1466b | grep -c round2` prints 0), so the comments that cited them now cite this section (review finding INT-3). The candidate holds the apply-round records under `AMC_OS/RESEARCH/<program>/apply/<sector>/`. Each pick's commit message, kept in its new commit, says what it applied. The anchors are agent-drafted and stay experimental until a named expert reviews them.

| Sector review | Grading pick (original, new) | Anchors applied (from the commit message and the pack comments) | Cited by |
|---|---|---|---|
| education | `d4592bcbd`, `00367e4a` | EU AI Act Art. 5(1)(f) and Art. 14(4)(d); COPPA 16 CFR 312.5(a)(1)-(2) and 312.10; PPRA 34 CFR 98.4; FERPA 34 CFR 99.31(a)(1)(i)(B) and 99.33(a) | `src/assurance/packs/educationFERPAPack.ts`, `tests/educationFERPAPack.test.ts` |
| environment | `e3fe61d53`, `cb338f79` | EU AI Act Art. 12(1), Art. 14(4)(d)-(e), Art. 15(4) (AI Act Service Desk, read 2026-10-04); the review's `retireChecks` measured keyword-only passes, and the pick kept the keyword checks | `src/assurance/packs/environmentalInfraPack.ts`, `tests/environmentalInfraPack.test.ts` |
| health | `7016af08d`, `6d8f2510` | 45 CFR 164.514(b)(2), 164.502(b), 164.502(e)(1), 164.312(a)(1), 164.312(b), 164.312(e)(2)(ii), 164.404(b), 164.524(b)(2), 164.308(a)(5), 164.310(d)(1); FDA Clinical Decision Support Software guidance (January 2026, non-binding); HIPAA Security Rule NPRM 90 FR 898 (proposed, informational); 21 CFR 201.57(c)(1), 50.25, 56.103, 1306.04, 1306.05, 1301.71; 21 CFR 820.10 (QMSR); IEC 62304 and ISO 14971 (unverified) | `healthcarePHIPack.ts`, `hipaaCompliancePack.ts`, `pharmaCompliancePack.ts`, `safetyCriticalSILPack.ts` (all under `src/assurance/packs/`), `tests/industryAssurancePacksHealth.test.ts` |
| mobility | `72e3c3d88`, `fe0b44b4` | ISO 26262, ISO 21448, UN R156 (unverified); Machinery Regulation (EU) 2023/1230 Annex III EHSR 1.2.1; Implementing Regulation (EU) 2022/1426 Annex III Part 5 (read 2026-10-03) | `tests/mobilityFunctionalSafetyPack.test.ts` |
| governance | `2fd42c5b8`, `624be300` | OMB M-25-21 Sec. 4(b); EU AI Act Arts 26, 27 and 86 (read 2026-10-04) | none (no file cited the review) |
| technology | `615450e67`, `46a3b5e2`; `de9d84009`, `86b1c8a6`; `5e8afb1a0`, `59025e94` | GDPR Art. 33(1); NIS2 Art. 23(4); CRA Annex I Part II(1) and Art. 14(2)(a) (24-hour early warning, applies from 2026-09-11); EU AI Act Art. 73(2) and Art. 50(1); FCC 24-17 Declaratory Ruling (TCPA) | `src/assurance/packs/sbomSupplyChainPack.ts`, `src/assurance/packs/technologyGDPRSOCPack.ts`, `tests/sbomSupplyChainPack.test.ts`, `tests/technologyGDPRSOCPack.test.ts` |
| wealth | `1ce9b08aa`, `a470f77b` | SOX 404, 802 and 806; SEC Rule 10b-5; Regulation FD; MiFID II Arts 24-25; RTS 6 Art. 12; MAR Art. 16 | `tests/financialSOXPack.test.ts`, `tests/wealthManagementMiFIDPack.test.ts` |

## Open items

- S9: the assurance runner still scores a refused reply 70 − 20n, so a refusal can score 50, and `verifyAssuranceRun` may re-grade inconclusive rows with an empty reply. Open, P0-19; the changeset says the runner still scores such rows.
- I3: `amc domain assurance` prints passed and failed but not `notEvaluated`, and always "review required" (consumer at `src/cli-domain-product-commands.ts`); `financialModelRisk` is outside the manifest and still passes the canned text. Open, P0-15. `docs/INDUSTRY_OPERATING_PROFILES.md` still describes the old smoke test. Open, P1-15.
- S9 manifest shape (no `OFFICIAL_SOURCE_HOSTS` export, `regulations[].url`, no `scenarioCount`): landed as S9 built it; accepted for this slice, no follow-up filed here.
- Canada C-27 "lapsed" anchor could not be re-read (parl.ca HTTP 403). Not re-checked in this slice; set `verified: false` at the next review if still unreachable.
- S7: AMC-1512 and AMC-1522 have no disposition (P0-30, P0-32). AMC-1513 and AMC-1518 receipts sit in ignored `AMC_OS/` (P0-30). `sdk/python/README.md` and four docstrings say "AUTHORED UNEXECUTED" (P0-31). Surviving MEDIUM mutants at `scripts/package-desktop-installers.mjs` (AMC-1530) and `src/studio/nativeTaskService.ts` (AMC-1541) (P0-30). All open, unchanged here.
- AMC-1520: the remaining window is exec by path. The launch files are hashed again immediately before `spawn`, but a write to those paths between that hash and exec is not detected (`deepseekHarnessCoverage().launchPin`); the changeset says so.
- AMC-1535: closed for the client outcome; the installed MCP run stays with P0-31.
- Health packs still grade on keyword presence (review finding ADV-1). A generic two-sentence refusal, and a reply that carries out the unsafe action while naming an audit log, clinician review and masking, both pass all 5 healthcarePHI scenarios at the final commit (`red-run.log`, last section). The grading picks were landed unchanged, as the issue requires; the changeset now says this. Open, P0-19.
- Regulatory anchors in this slice (the industry pack manifest, the CRA, FCC 24-17 and AI Act Art. 50 scenarios, the health and ISO/IEC 42005 anchors) are agent-drafted and experimental until a named expert reviews them (truth rule 8; the changeset says so). `verified` in the manifest means read on an official source on `retrievedAt`. Open, needs a named expert.

## Differences from the issue text

- Line citations: the tests cite `nativeMcpClient.ts:236` and `:264`, where the code is on this base, not the issue's `:235` and `:263`.
- The `git grep` for the program folder cannot print nothing on this base (see "Commands and totals"); the check used is that no added line names it.
- `docs/NATIVE_MCP.md` is outside the issue's touch scope. It said schemas are validated before calling the remote tool; one sentence now adds the simulate order and the discarded-result notice, because the contract asks for docs that describe changed behaviour to be updated.
- `tests/educationFERPAPack.test.ts` (from grading pick `d4592bcbd`) was a fourth file citing the program folder; it is re-pointed with the three S7 citations. Fifteen more comments in the grading picks' packs and tests cited `round2/content/<sector>/assurance-anchors.json` without the folder name, so the issue's `git grep` missed them; review fix `4eb900b0` re-points them to "Round-2 anchor reviews" above.
- `scripts/gen-api-ref.cjs`, `scripts/gen-counts.mjs` and `docs/API_REFERENCE.md` are outside the issue's touch scope. The new `industryPackManifest.ts` made both generators count it as a pack and turned `npm run check:api-ref` (CI step "API reference drift") red; both now skip it. The reference generator also joins a description written as `"a" + "b"`, which fixes the truncated educationFERPA description; of the 88 description lines that change in `docs/API_REFERENCE.md`, 6 belong to packs this slice changed and 82 are other packs whose descriptions the old parser had cut on `main` (review finding INT-1).
- `src/adapters/adapterRunner.ts` goes beyond the ready-to-wire diff: a refused DSH run now appends `agent_process_exited` (`spawnObserved: false`, `refused: "dsh_launch_changed"`) and seals its session before rethrowing, so `verifyLedgerIntegrity` still passes (review finding INT-2). The diff itself is applied unchanged in `fe2ac21f`.
- The HTTP test keeps its own small server, modelled on the fixture in `tests/nativeMcpHttp.test.ts`, which is not exported; extracting it would have edited that test file.
- `deepseekHarnessCoverage().launchPin` text is unchanged: it says the files are hashed at configuration, version probe and launch preparation and that a write after the last hash and before exec is not detected, which stays true with the extra hash at spawn.

## Reproduce

```
git fetch origin amc/regulated-platform-20261003:refs/remotes/candidate/head
git checkout rtd/p0-13-slice-b && pnpm install --frozen-lockfile && pnpm run build
```

Then run each command in `commands.tsv` from the repository root.

## Review findings applied

| Finding | Severity | Resolution |
|---|---|---|
| spec/F1 | low | `npm run check:qualification` run and recorded (`commands.tsv`, `receipt.json`). |
| spec/F2 | low | Branch rebuilt from `a470f77b`: tests land with their fixes (`55ec5ae3`, `fe2ac21f`); no red commit. |
| adversarial/ADV-1 | medium | Changeset states per pack what changed; healthcarePHI keyword grading recorded as an open item for P0-19 (validators unchanged, as the issue requires). |
| integration/INT-1 | high | `b3be9c8f`: generators skip `industryPackManifest.ts`, descriptions joined, reference regenerated; `check:api-ref` passes. |
| integration/INT-2 | medium | `03e73617`: refused DSH run recorded and sealed; test asserts the ledger verifies; mutation M12. |
| integration/INT-3 | medium | `4eb900b0`: 15 round-2 citations re-pointed to "Round-2 anchor reviews". |
| integration/INT-4 | medium | `92537199`: changeset carries truth rule 8's experimental sentence and the meaning of `verified`. |
