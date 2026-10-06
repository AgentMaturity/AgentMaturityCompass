# P0-12 PR 1: landing slice A (S3 and S5)

This receipt records slice A of the regulated-platform candidate `37c1466b` (branch `amc/regulated-platform-20261003` on `origin`), built on `origin/main` at `8d78504d` by `docs/program/landing/RUNBOOK.md`. Slice A carries S3 (regulatory-currency schema for the 41 industry packs, 15-question floor, citation fixes) and S5 (sourced regulatory register, currency check, EU AI Act timeline after Regulation (EU) 2026/1744). The round-2 register commits `9d2636531` and `1962e06cf` are PR 2 (slice `A-register`), recorded in the PR 2 section at the end. `receipt.json` describes the latest run (PR 2); PR 1's commands and results are in `commands.tsv` and below.

All commands in `commands.tsv` ran in one fresh clone of the branch head `248fa066c4cc82864c8c356ae4ff9db5adddbaad` on 2026-10-06, after the review fixes, with `origin/main`, `candidate/head` and the `worktree-wf_*` track branches fetched. The same commands had passed in a first fresh-clone run at `ba2121599ff3df5b5bf92af00ca7008236961ee1`, before the review. Full logs are not committed; their sha256 values are listed at the end.

## Commit map

Picked with `git cherry-pick -x` in slice-map order (S5, then S3, then the root commit). No pick conflicted.

| Original | New | Subject |
|---|---|---|
| `172de7457` | `2cb94f17` | feat: add sourced regulatory currency register, currency check and truthful feeds |
| `b11f43bb1` | `405d595a` | feat: encode verified EU AI Act application timeline in the classifier |
| `276a6570f` | `e57a509d` | docs: date and source the EU AI Act timeline after the Digital Omnibus |
| `d7a77cc51` | `403cb679` | fix: move regulatory register to its claimed path and close S5 review defects |
| `5a19ae6dd` | `3259482e` | feat: add regulatory-currency schema and 2026 refresh for industry packs |
| `bf84996a4` | `5c3145b7` | docs: check sector-pack counts against the registry and document regulatory currency |
| `05ae53f1e` | `c64883f8` | fix: correct verified industry-pack citations |
| `2c291c8aa` | `e576cb98` | fix: correct verified health-pack citations |
| `03ac0803f` | `43dad0e9` | docs: state the question-depth floor rationale exactly |
| `748d7c23c` | `2b1878db` | fix: conform industry-pack currency to PackCurrencyFields v1 and move the schema under packs/ |
| `20b69fb47` | `f4ad34cd` | feat: raise the industry-pack question floor to 15 [HOLD until root whitepaper edit] |
| ready-to-wire diff | `77655894` | docs: carry the 632 sector-question total into public surfaces |
| `13ea36191` | `48dc7916` | test: derive the whitepaper sector-pack totals from the compiled registry |

Follow-up commits on the branch: `37ca4ebb` (export `normalizeComplianceFrameworkLabel` and `RegulatoryReference` from `src/domains/index.ts`), `52232205` (Omnibus wording in `docs/EXECUTIVE_OVERVIEW.md` and `docs/BOARD_RISK_L3_MEMO.md`; `docs/DOMAIN_PACKS.md` names `tests/industryPackDepthFloor.test.ts`), `77f33452` (`npm run check:regulatory-currency` and its `build-test` step), `0689f417` (changeset with `freeze-exception: P0-12`, freeze baseline 600 to 632) and `ba212159` (`npm run gen-counts`).

Review fixes, after the first receipt commit `3edd34e8`:

| Commit | Finding | Change |
|---|---|---|
| `dd64c83c` | adversarial/P0-12-A-2 | `--as-of ""` or `--now ""` exits 1 (`needs a value`) instead of checking against today; regression case in `tests/regulatoryCurrency.test.ts` |
| `6e7a5057` | integration/F1, F6 | `docs/DOMAIN_PACKS.md`: the floor added 32 questions, not 24 (600 to 632). ADR-005 says 632; `tests/publicQuestionCountDrift.test.ts` now checks it against the registry |
| `c45cff2a` | integration/F2, F4 | The register section of `docs/COMPLIANCE_FRAMEWORKS.md`, the Regulatory Currency section of `docs/DOMAIN_PACKS.md` and the timeline of `docs/EU_AI_ACT_COMPLIANCE.md` say the content is agent-drafted and experimental until a named expert reviews it, and that `verified` means the source was read. The claim that the pack audit reads the PackCurrencyFields v1 contract is dropped from `docs/DOMAIN_PACKS.md` and `src/domains/packs/regulatorySchema.ts` (the reader is S4, P1-42) |
| `7811e175` | integration/F3 | Five unused value exports become module-local (see Baseline delta) |
| `248fa066` | integration/F7 | The changeset names the corrected classifier and risk-matrix provisions, `applicationDates` and the six live feed endpoints |

`review-red.log` shows the two regression checks failing with the pre-fix file and passing after restore. `register.json` `policy.note` is not changed: PR 2's `9d2636531` rewrites that policy block, and step 11 of the issue edits the note there.

Skipped receipt-only commits (`skip-receipt` in the map): S5 `082efcd18`, `c6b0d19b5`, `297af3a45`, `97027c5d9`; S3 `7b21996e9`, `406518dd9`, `a54b88fc9`. Merges `f06738699` and `f095e8811` are `record-only`.

## Ready-to-wire diff

Source `37c1466b:AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S3/ready-to-wire.diff`, 239 lines, sha256 `b3ecba7c5100825eacb01a8a658c59b8ccef9e6eb9c871a70bf6e770e1178fee`. Applied with `git apply --3way --exclude=tests/citationMetadata.test.ts`. The whitepaper abstract conflicted on one line: `main` had moved the test-file literal from 1,489 to 1,540 after `8f57ce63`. The resolution keeps `main`'s literal (owned by `gen-counts`) and takes the diff's 632 and 876 totals; every other hunk applied cleanly.

## Tree equivalence (RUNBOOK section 4)

Compared from each track's map `base` (`8f57ce63`) against its accepted head:

- At the last pick `f4ad34cd`: S3 (`a54b88fc9`) and S5 (`97027c5d9`) both print nothing.
- At the branch head, each comparison lists only named exceptions changed later in this slice:
  - S3: `tests/publicQuestionCountDrift.test.ts` (the ready-to-wire diff, then the ADR-005 check), `docs/DOMAIN_PACKS.md` (the depth-floor test name the issue asks for, the 32-question count, the experimental label, the dropped audit-reader claim), `src/domains/packs/regulatorySchema.ts` (comment and four un-exported values) and `src/domains/packs/catalogueHelpers.ts` (`REVIEWED` un-exported).
  - S5: `scripts/check-regulatory-currency.mjs` and `tests/regulatoryCurrency.test.ts` (empty `--as-of`), `docs/COMPLIANCE_FRAMEWORKS.md` and `docs/EU_AI_ACT_COMPLIANCE.md` (experimental label).

`git diff --name-only origin/main HEAD -- AMC_OS` prints nothing. None of the slice's files cite `2026-10-03-regulated-platform-program`.

## Results

- Registry: 41 packs, 632 questions (environment 6/91, health 9/151, wealth 5/75, education 5/75, mobility 6/90, technology 5/75, governance 5/75). Public surfaces say 632 sector and 876 total questions.
- `npm run check:regulatory-currency`: `entries=17 verified=11 unverified=6`, exit 0. `--as-of 2027-01-01` exits 0; `--as-of 2027-01-02` exits 1 (all 17 entries 91 days old); `--bogus` exits 1; `--as-of ""` exits 1.
- Focused tests: 35/35 (S3 set) and 142/142 (S5 set). Restoration parity tests plus `tests/planEditsManifest.test.ts`: 7,113/7,113 in 26 files. In the working clone, the 347 test files that name any changed path passed (2,824 tests).
- `typecheck`, `typecheck:tests`, `lint`, `check:counts`, `check:docs-drift`, `check:architecture-boundaries`, `check:freeze`, `check:clean-source`, `check:packed-install` and the slice-map `--check`: exit 0.
- D-15: no frozen file is edited. The parity tests pass after every pick and edit, `package.json` already has a P0-09 snapshot, and the pinned `dist/index.d.ts`, `dist/index.js` and `dist/cli.js` keep their bytes after the rebuild. No snapshot was registered.

The full suite, coverage and `npm run release:gate` are run by the orchestrator in CI and are not part of this receipt.

## Failing run before the slice

`red-run.log`: the S3 and S5 test files checked out onto unchanged `origin/main` (`8d78504d`). 11 of 11 files fail: 8 cannot import the new modules (`src/domains/packs/regulatorySchema.ts`, `src/compliance/regulatory/index.ts`, `scripts/check-regulatory-currency.mjs`), and 10 tests fail in the 3 that load (logistics pack question ids, feed contract and injected `fetchImpl`, DPIA template review dates).

## Mutations

Each mutation was applied in the working clone, the named test run, and the file restored with `git checkout` (`git diff --quiet` afterwards). Details in `mutations.log`.

| # | Mutation | Result |
|---|---|---|
| 1 | delete question `MOB-F3W-15` (`src/domains/industryPacks.ts`) | `tests/industryPackDepthFloor.test.ts` fails: `freight-3pl-warehouse: 14 < 15`, and the mobility row of `docs/DOMAIN_PACKS.md` no longer matches |
| 2 | `PACK_QUESTION_FLOOR = 13` | `tests/industryPackDepthFloor.test.ts` fails (2 tests) |
| 3 | `nist-ai-rmf` url to `https://example.com/ai-rmf` | `tests/industryPackSchema.test.ts` fails (2 tests) |
| 4 | register `eu-ai-act.lastReviewed` to `2024-01-01` | the script exits 1; `tests/regulatoryCurrency.test.ts` fails (3 tests) |
| 5 | `EU_AI_ACT_TIMELINE.annexIIIHighRisk` to `2026-08-02` | `tests/euAiActTimeline.test.ts` fails (2 tests) |
| 6 | whitepaper back to 600 / 844 | `tests/citationMetadata.test.ts` fails |

## Baseline delta (P0-04, `786d8abb`)

- Test source files: 1,522 at the baseline, 1,540 on `main` at `8d78504d`, 1,546 after this slice (six new S3 and S5 test files, `gen-counts` commit).
- Freeze baseline: `stationPackQuestions` 600 to 632 under `freeze-exception: P0-12`; CLI paths unchanged at 1,228.
- `check:architecture-boundaries` passes as on `main`; its report-only ratchet notice now also lists `src/compliance/regulatoryAutomation.ts: 802 -> 707`. The check does not ask for a budget update, so `scripts/line-budgets.json` is unchanged.
- `check:dead-code` fails on the baseline and on `main` (2,338 findings at `8d78504d`, compared without line numbers on `git archive` exports). At `248fa066` it reports 2,341: two findings are gone (`src/domains/industryPacks.ts` `sectorRiskToAgentRiskTier` and `IndustryPackAssessment`) and five are new, all exported types that name the shape of an exported value: `src/compliance/euAiActClassifier.ts` `EuAiActApplicationDate` (the element type of `applicationDates`) and `src/compliance/regulatory/index.ts` `RegisterStatus`, `RegisterSource`, `RegisterKeyDate` and `RegisterObligation` (fields of `RegulatoryRegisterEntry`). These five are a named exception: PR 2's `9d2636531` edits those declarations and uses their `export` lines as diff context, so un-exporting them here would make PR 2's cherry-pick conflict. PR 2 or a follow-up resolves them. The five unused value exports the slice also added (`REVIEWED`, `PACK_REVIEW_MAX_AGE_DAYS`, `PACK_CONTENT_VERSION`, `UNRESOLVED_JURISDICTION`, `toRegulatoryReference`) are no longer exported (`7811e175`); no later candidate commit touches their files.
- `tests/round4Gaps.test.ts` changes by design: R4-06 now requires every legacy `GLOBAL_FRAMEWORKS` entry to be `partial` with a register entry, source and review date; R4-10 expects the DPIA template to record `dpoApproval: false` and `null` review dates instead of stamping `Date.now()`.

## Open items

| Item | Status |
|---|---|
| Five hosts S3 added to `OFFICIAL_SOURCE_HOSTS` (govinfo.gov, w3.org, pcisecuritystandards.org, oecd.org, consort-spirit.org) | Open: Sid with the D-08 expert reviewer; P0-24 applies the ruling. Landed unchanged. |
| Listing-level evidence from iso.org and fatf-gafi.org (HTTP 403) | Open: P0-24 and P0-25. Landed unchanged. |
| `eu-ai-act` is `verified: true` on AI Act Service Desk pages while EUR-Lex was unreachable | Open: P0-24 decides. Landed unchanged. |
| S5 scope not built (per-finding `appliesFrom`, `tests/regulatoryFeeds.test.ts`, `fetchContract` naming, `effectiveDate: number \| null`, per-status review windows) | Open: proposed as one follow-up issue. |
| Colorado SB 26-189 key date 2027-01-01 versus in effect 2026-05-14 | Open: re-verify against the primary source before publishing. |
| `scripts/line-budgets.json` budgets `regulatoryAutomation.ts` at 802 lines (707 now) | Not changed: the boundaries check passes and does not ask. |
| Register-round follow-ups (withdrawn status, observation key dates, `affectedPacks`, unreachable hosts) | Landed unchanged in PR 2; status in the PR 2 section. |
| Every register entry goes stale on 2027-01-02 | Open, owner Sid. A dated reminder is not yet created: the integrator adds a plan-doc row (or issue) due 2026-12-15, owner Sid, to re-review every entry (176 after PR 2) before 2027-01-02. Without the re-review, CI fails on that date with no code change. |
| Release-gate step for the currency check | P0-33. |

The catalogue, register and pack citations are agent-drafted and stay experimental until a named expert signs off (truth rule 8).

## Reproduce

```
git fetch origin amc/regulated-platform-20261003:refs/remotes/candidate/head
git fetch origin 'refs/heads/worktree-wf_*:refs/remotes/origin/worktree-wf_*'
git checkout 248fa066c4cc82864c8c356ae4ff9db5adddbaad
```

Then run the commands in `commands.tsv` in order.

## Full logs (not committed)

- Fresh-clone log at `248fa066`: sha256 `3deebde5cff29bd60f69a03cb5ed837e7aaaf91718582ef540d09157ffdeb616`
- First fresh-clone log at `ba212159`: sha256 `4d369e13e262b761c4750c0db1e6cf6f2be12f02a98137d0e2e7893bf741407b`
- Failing run before the slice: sha256 `fbf390ad29e13541af24cfe66ff4838aea707f46fab10dacb1094df204b490fd`
- Mutation runs: sha256 `318e3c29f47053bda0d858b2d474ce56728dd8d32a26d1a19ea06f2b962d688b`

# P0-12 PR 2: slice A-register (round-2 regulatory register)

Branch `rtd/p0-12-slice-a-register`, built on `e680f2a6` (the verified integration head of #46, #47, #49 and #50; P0-12 PR 1 and P0-13 slice B are on it, so S9's `src/assurance/packs/industryPackManifest.ts`, which the register test imports, exists). All commands in `commands-pr2.tsv` ran in one fresh clone of the code head `3698a021b725df9873670ea3f80604b25b64ff95` on 2026-10-06 (UTC). The register is agent-drafted: the apply round fetched no source URL and the repair after the REJECTED monitor verdict on `9d263653` was not re-verified, so it stays experimental until a named expert signs off (truth rule 8); P0-24 and the D-08 reviewers re-check it.

## Commit map

Picked with `git cherry-pick -x` in slice-map order. Each pick's `AMC_OS/` paths were removed with `git rm -r -q -f --ignore-unmatch -- AMC_OS/RESEARCH/2026-10-03-regulated-platform-program` (RUNBOOK section 3). `1962e06cf` stopped on modify/delete conflicts in `apply/register/doc-rows.mjs` and `result.json` only (both under `AMC_OS/`); the `git rm` resolved them. No product file conflicted.

| Original | New | Subject |
|---|---|---|
| `9d2636531` | `261f0a35` | feat: apply round-2 EU/intl and US batches to the regulatory register (4 `AMC_OS/…/apply/register/` files stripped) |
| `1962e06cf` | `3792bf92` | fix: apply the CN/BR/IN/JP root ruling to br-lgpd and in-dpdp and restore dropped EU facts (3 `AMC_OS/…/apply/register/` files stripped) |

The merge `61d53315` is `record-only`. Follow-up commits: `d2a671c6` (regression test: `register.json` cites no `AMC_OS/` path, cites `program-records/2026-10-03/research/…`, and its `policy.note` and `docs/COMPLIANCE_FRAMEWORKS.md` say the records are held outside the repository), `fa0c7fdd` (the re-point), `fc9dd3f0` (changeset) and `3698a021` (`node scripts/gen-counts.mjs --write`: test source files 1,570 to 1,571, for `tests/regulatoryCurrencyRegister.test.ts`).

## Program-record references (D-13)

The prefix `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/` becomes the label `program-records/2026-10-03/` in 233 references on 190 lines of `register.json` (211 `research/<station>/digest.json`, 18 `map/root-decisions.md`, 4 `round2/*/review.json`), the `EU_AI_ACT_TIMELINE` comment in `src/compliance/euAiActClassifier.ts` and two references in `docs/EU_AI_ACT_COMPLIANCE.md` that `9d2636531` added. Replacing the label back with the old prefix reproduces the picked `register.json` except for the `policy.note` sentence, so every `url`, `retrievedAt` and `verified` value is unchanged. `policy.note`, `docs/COMPLIANCE_FRAMEWORKS.md` and `docs/EU_AI_ACT_COMPLIANCE.md` say the records are held outside the repository.

`git grep -n "regulated-platform-program" -- src docs tests` still prints 289 lines, all in `docs/program/landing/` (`RUNBOOK.md` 9, `slice-map.json` 249, `slice-rules.json` 31). Those files were on `e680f2a6` before this PR and name the candidate's paths by design. Excluding `docs/program/landing`, the grep prints nothing.

## Tree equivalence (RUNBOOK section 4)

The track has no accepted head (`acceptedHead: null`, verdict "NO MONITOR VERDICT: worker receipt only"), so the comparison uses its head `1962e06cf` from its map base `67d73223` against the last pick `3792bf92`. It lists three named exceptions, all PR 1 review fixes already on `main`: `docs/COMPLIANCE_FRAMEWORKS.md` and `docs/EU_AI_ACT_COMPLIANCE.md` (the experimental label, `c45cff2a`) and `tests/regulatoryCurrency.test.ts` (the empty `--as-of` case, `dd64c83c`). `git diff --name-only e680f2a6 HEAD -- AMC_OS` prints nothing.

## Results

- `npm run check:regulatory-currency`: `entries=176 verified=108 unverified=68`, exit 0; 20 jurisdictions; every entry `lastReviewed` 2026-10-03. `--as-of 2027-01-01` exits 0; `--as-of 2027-01-02` exits 1; `--bogus` and `--as-of ""` exit 1.
- `npx vitest run tests/regulatoryCurrencyRegister.test.ts tests/regulatoryCurrency.test.ts tests/euAiActTimeline.test.ts`: 45/45. With `tests/regulatoryAutomation.test.ts`, `tests/round4Gaps.test.ts`, `tests/regulatoryClaimsHonesty.test.ts`, `tests/complyRiskClassifyDocs.test.ts`, `tests/apiRouters.test.ts` and `tests/assurance/`: 674/674 in 19 files. Restoration parity plus `tests/planEditsManifest.test.ts`: 7,113/7,113 in 26 files. In the same fresh clone, the 317 test files that name any path this PR changes passed (1,701 tests).
- `typecheck`, `typecheck:tests`, `lint`, `check:counts`, `check:docs-drift`, `check:api-ref`, `check:architecture-boundaries`, `check:freeze`, `check:qualification` and the slice-map `--check`: exit 0.
- D-15: no frozen file is edited. No path this PR changes is named under `unused-code/`, the parity tests pass after the rebuild, and no snapshot was registered.
- Freeze: the register adds no CLI path and no station-pack question; `check:freeze` passes on the unchanged baseline.
- `check:dead-code`: 2,342 findings, the same list as `e680f2a6`. The slice-A named exception stands: `EuAiActApplicationDate`, `RegisterStatus`, `RegisterSource`, `RegisterKeyDate` and `RegisterObligation` are still exported and unused. The picks no longer constrain them, so a follow-up may un-export them.

## Failing runs before the change

`red-run-pr2.log`. (1) The two register test files from `1962e06cf` on unchanged `e680f2a6`: 7 of 12 tests in `tests/regulatoryCurrencyRegister.test.ts` fail (no key-date `url`, CN entry verified, no EHDS, Machinery, CMS-0057-F, observation or AILD rows); `tests/regulatoryCurrency.test.ts` and `tests/euAiActTimeline.test.ts` pass. (2) The program-record test `d2a671c6` fails at `3792bf92` (`register.json` contains `AMC_OS/`) and passes after `fa0c7fdd`.

## Mutations

Each mutation was applied in the working clone, the named test run and the file restored with `git checkout` (`git diff --quiet` afterwards). Details in `mutations-pr2.log`.

| # | Mutation | Result |
|---|---|---|
| 1 | register `eu-ai-act.lastReviewed` to `2024-01-01` | the script exits 1; `tests/regulatoryCurrency.test.ts` fails (3 tests) |
| 2 | `EU_AI_ACT_TIMELINE.annexIIIHighRisk` to `2026-08-02` | `tests/euAiActTimeline.test.ts` fails (2 tests) |
| 3 | `EU_AI_ACT_TIMELINE.publicAuthorityHighRiskDeadline` to `2030-08-03` | `tests/euAiActTimeline.test.ts` fails (register parity) |
| 4 | delete `retrievedAt` from the first `eu-ai-act` key date | `tests/regulatoryCurrencyRegister.test.ts` fails (per-date provenance) |
| 5 | `br-lgpd` obligation Art. 7 `verified: true` | `tests/regulatoryCurrencyRegister.test.ts` fails (CN/BR/IN/JP root ruling) |
| 6 | one `eu-ai-act` `digestRows` reference back to the `AMC_OS/` prefix | `tests/regulatoryCurrencyRegister.test.ts` fails (program-record labels) |

## Open items after PR 2

| Item | Status |
|---|---|
| Every register entry goes stale on 2027-01-02 | Open, owner Sid: now 176 entries. The integrator adds the dated reminder (due 2026-12-15) named in PR 1's open items. |
| Round-2 register not re-verified after the REJECTED verdict; the apply fetched no source URL | Open: experimental until expert sign-off; P0-24 and the D-08 reviewers re-check it. |
| No `withdrawn` status | Open: four withdrawn or revoked instruments (`eu-ai-liability-directive`, `us-eo-14110`, `us-eeoc-ai-ta`, `us-sec-pda`) sit under `superseded` with `taskStatus`. |
| Calendars must skip `observation: true` key dates | Open: P1-42 (S10's calendar generator). Three entries carry one (`us-eeoc-ai-ta`, `us-fda-ai-dsf-draft`, `us-qmsr`). |
| Entries without `affectedPacks` | Open: 17 entries have none (the apply receipt names six kept S5 entries among them). |
| Facts from iso.org, coe.int, le.utah.gov, ilga.gov, nysed.gov and codes.ohio.gov not re-read | Open: P0-24. |
| Release-gate step for the currency check | P0-33. |

## Reproduce PR 2

```
git fetch origin amc/regulated-platform-20261003:refs/remotes/candidate/head
git fetch origin 'refs/heads/worktree-wf_*:refs/remotes/origin/worktree-wf_*'
git checkout 3698a021b725df9873670ea3f80604b25b64ff95
```

Then run the commands in `commands-pr2.tsv` in order.

## Full logs (not committed)

- Fresh-clone log at `3698a021`: sha256 `670a0af595aa3f1560dd92638ec613299348434469005aa41952cf78c25a094a`
- Run of the 317 test files that name a changed path: sha256 `4d9c21bca933ff4477a1560aa223d3e53178560f0264d9701369c322df6c7363`
