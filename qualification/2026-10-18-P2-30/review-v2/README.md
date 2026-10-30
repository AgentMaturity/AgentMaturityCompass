# P2-30 review-v2 supplement — blocked

This off-tree supplement records source `2ad86a588fa94f5b09acaf5bf9864a94bfabfb00`, integrated with int `7628a2b018ffe6046d8953c81d42c873ac6128d2`. It is local macOS arm64 review-fix evidence, not CI, a new full qualification round or promotion. The measured review is **BLOCKED and NOT READY FOR LANDING**. Native staging validation, installation and final coordinator review are still pending; none is claimed here.

The synchronized post-install attempt is complete. Exactly five measured commands appear in receipt.json:

| Check | Exit | Duration (ms) |
| --- | ---: | ---: |
| build | 0 | 133,926 |
| focused | 1 | 303,045 |
| industry-guides | 0 | 1,486 |
| catalog-admission | 1 | 2,921 |
| catalog-changelog against int | 0 | 7,707 |

All five commands retained source/int pins, own CWD/TMPDIR, clean before/after source states, null source-guard errors, raw log hashes and native report hashes where applicable. Dependency proof records Node v22.23.3, pnpm 10.33.0 and ajv-formats 3.0.1. Installed and tracked locks both hash to f948d569d509e227d68aaeb183f10f403f7f9016a1abbbd5dc75042ded4af914. Installation exited 0, but its duration was not independently captured; it remains null in summary.json and no invented install command enters the standard receipt.

The fresh focused report has 934 tests: 899 passed, 35 failed and zero skipped. Its 28 file entries comprise ten failed and eighteen passed files. The oracle's new post-install-failure-index.json binds this report and all five source/runtime/status/log records. Thirty-two assertions directly name the catalog-status error; three have raw-diff evidence of that same received issue. A separate zero-assertion Technology fixtures collection error names it too. All exact failed identities/messages and that collection failure remain in summary.json, with zero recognized raw run-error signals. This classification was read from the synchronized report, not inferred from the earlier count of 35. The fixture file supplies no new local-oracle results.

Focused and admission still fail on L1-TECH-05 CAT_CITATION_STATUS_MISMATCH: the ADMT clause is binding-future while its retained S5 us-ca-cppa-admt instrument is partially-applicable/binding. Dependency synchronization did not resolve this owner contract. No owner answer, waiver or owner unavailability is inferred. Do not null the S5 link, backdate the clause, weaken an assertion or silently edit the central contract. Whether Sid permits a blocked handoff before P3-15 is a separate explicit decision still pending; ready-v2-first and the stop rule are not waived by this packet.

The earlier 27-row attempt is retained only as PRE-INSTALL HISTORICAL DIAGNOSTICS in summary.json. Its 25 required checks had 22 passing and three failing results (focused, admission and expected default-main ENTRY_COUNT); the stale-count diagnostic failed before successful regeneration. Those passing rows were not qualified against the synchronized dependency set. The prior artifact named truth-green also exited 1 with 24/23/1 before integration. Neither historical stage is a new GREEN or current pass claim.

receipt.tests is null. This review round's full suite is NOT_RUN, with null exit, duration and totals; no full command was launched or inserted. Claude owns final merged full qualification at landing. The root receipt and README remain unchanged historical b88 evidence. Its old full run exited 1 with 25,435 total, 25,418 passed, ten failed and seven skipped; it does not apply to this source. receipt-before.json is the exact 70,150-byte root-receipt copy. The root receipt, root README and all 343 old artifact hashes remain preserved.

The seven existing EU register IDs/S5 bindings remain recorded for P2-11 reuse: extend that register, not a second one. Metadata identities establish no new authoritative-source verification. Technology expert/legal/risk review, primary-source verification, independent sign-offs, D-04 licensing, P1-29 partners and stewardship remain pending. Content remains experimental and unreviewed, promotion none, with no new live enforcement evidence.

Every new file is at most 500,000 bytes. The native staging procedure in receipt-plan.md must validate these exact four finalized files before installation and prove installed/staged equality. A global check validates the old primary receipt and recursive file rules; it does not automatically schema-validate the nested supplement. External evidence references require explicit verification; the native checker hashes the summary itself. Passing schema validation will not make these failed checks pass or authorize landing or P3-15.
