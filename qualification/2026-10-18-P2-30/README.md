# P2-30 Technology overlay — draft handoff

Final source: `b88f0fb934605ba528ad517eef797a5b891ee843`; integration: `577aa79700479634fa4f16cf44c48192fe57a994`; clone: `/Users/sid/AgentMaturityCompass-worktrees/codex-7f/p2-30`; branch: `codex/p2-30-technology-overlay`. Node 22, pnpm 10.33.0, local macOS arm64; not CI.

**The final full suite completed at this source with exit 1: 25435 tests, 25418 passed, 10 failed and 7 skipped.** The report contains 1754 files, including 7 failed files, 10 failed assertions and 1 hook-timeout messages, 0 other suite-level failures and 0 unresolved run-error signals (signals are not a deduplicated logical-error count). Sid authorized one measured final-source run and a handoff with explicitly classified failures; an all-green result is not required. This is an experimental draft handoff, not promotion or landing. Final-source formal checks: **23 PASS; one expected GOV_CHANGELOG_ENTRY_COUNT failure, exit 1, against origin/main**. The passing int-relative check remains mandatory; 7fccbbfa owns consolidation at the final main merge.

## Final-source checks

`checks/post-governance-results.json` supplies the 24 formal final-source checks. `checks/full-suite-final.json` and its hashed log/report supply the separate measured full suite at the same HEAD. Historical commands remain separately attributed in `checks/command-source-map.json`. The default-main failure is retained as measured exit 1, not reported as a pass. `checks/catalog-changelog-main-blocker.json` contains the exact coordinator decision, section SHA-256 `38f9e426834ac75df1fab58ad888e7bb5034d23888c132403dcc6795d85e3b8b`, authoritative base `5ea5e866a42acd5c8228a712e9b8c1d9f18c745c`, failed log hash and preserved prior old-ref attempt. Its section is verified against RESERVATIONS. The guard and earlier entries are unchanged; consolidation remains a later coordinator step.

The formal runner's implementation inputs are committed; only the ten authorized generated-count paths may differ from HEAD. Its focused selection covers the overlay, changed catalog/governance/register/clock files and affected station-golden/starter expectations; it is not a full-suite run. A `counts-before-regeneration` exit 1 is expected only when followed by successful `gen-counts` and `counts` rows; it remains recorded and is not a current unresolved check. The later full suite has its own measured result and source pin.

The final full suite intentionally used **workingTreeClean=false**: exactly ten required generated-count outputs were dirty, uncommitted, hashed and backed up, while implementation, tests and catalog matched the committed source. Reverting those required inputs to stale HEAD counts would create artificial public-stat drift. `checks/full-suite-final-start.json` records every admitted path/hash and the backup; the final result records generated outputs unchanged by tests as **true**. This record does not claim a wholly clean tracked worktree.

| Command | Result |
| --- | --- |
| `npm run -s build` | PASS |
| `npx vitest run --maxWorkers=2 tests/catalog/stations/technology tests/catalog/governance tests/catalog/l0 tests/usRegister.test.ts tests/wealthOverlay.test.ts tests/regulatoryClocks.test.ts tests/compilerStationDefaults.test.ts tests/starterProfiles.test.ts tests/industryGuides.test.ts tests/industryGuidesGenerator.test.ts tests/deepIndustryPacksStations.test.ts` | PASS |
| `npm run -s typecheck` | PASS |
| `npm run -s typecheck:tests` | PASS |
| `npm run -s lint` | PASS |
| `npm run -s check:counts` | EXPECTED STALE OUTPUTS (exit 1); regenerated and subsequent counts passed |
| `node scripts/gen-counts.mjs --write` | PASS |
| `npm run -s check:counts` | PASS |
| `npm run -s check:docs-drift` | PASS |
| `npm run -s check:industry-guides` | PASS |
| `npm run -s check:regulatory-calendar` | PASS |
| `pnpm check:freeze -- --base-ref int` | PASS |
| `npm run -s check:architecture-boundaries` | PASS |
| `npm run -s check:gates` | PASS |
| `npm run -s check:schemas` | PASS |
| `npm run -s check:api-ref` | PASS |
| `npm run -s check:threat-model` | PASS |
| `npm run -s check:citations` | PASS |
| `npm run -s check:qualification` | PASS |
| `npm run -s release:notes -- --check` | PASS |
| `npm run -s check:catalog-currency` | PASS |
| `npm run -s check:catalog-changelog -- --base-ref int` | PASS |
| `node scripts/check-catalog-changelog.mjs` | EXPECTED GOV_CHANGELOG_ENTRY_COUNT (exit 1); coordinator consolidates at final main merge; int-relative check passed |
| `npm run -s check:duplicates` | PASS |
| `npm run -s check:dead-code` | PASS |
| `npm run -s check:clean-source` | PASS |
| `npm test -- --maxWorkers=4 --reporter=dot --reporter=json --outputFile=/Users/sid/AgentMaturityCompass-worktrees/codex-7f/evidence/p2-30/checks/full-suite-final-report.json` | Exit 1; 25418/25435 passed, 10 failed, 7 skipped |

Final failure classification is explicit in `checks/baseline-reconciliation-final.json`, which binds an exact comparator output path and SHA-256. The comparator must identify the same source, raw log, JSON report and completed-run receipt bytes. Every actual failed assertion, failed/message-bearing file, non-assertion suite error and recognized raw run-error signal must be represented exactly once; omissions, extras, duplicates or changed messages stop finalization. A whole file is baseline only when all its actual failed assertions reproduced and it has no unresolved suite error. Native baseline receipts must bind clean before/after source, default budgets/assertions, completed exits, report/log hashes and integration `577aa79700479634fa4f16cf44c48192fe57a994`. Passing or absent baseline assertions never support a final failure. Older reproductions remain historical. Every unsupported failure remains **UNRESOLVED**:

- `tests/nativeClientStartupAbort.test.ts`: **UNRESOLVED**.
- `tests/publicDocsGraph.test.ts`: **baseline_reproduced**.
- `tests/releaseSecretScanCoverage.test.ts`: **UNRESOLVED**.
- `tests/sessionStoreConformance.test.ts`: **UNRESOLVED**.
- `tests/compliance/evidenceBinding.test.ts`: **baseline_reproduced**.
- `tests/keys/atomicRotation.test.ts`: **UNRESOLVED**.
- `tests/performance/sessionSpine.performance.test.ts`: **baseline_reproduced**.

`checks/full-suite-final-summary.json` preserves final file/test totals, all failed assertions, every non-assertion suite message (including opaque zero-assertion failures), the hook-timeout subset, other suite errors, raw run-error signals and those dispositions. `checks/reconciliation-validation.json` records exact coverage and provenance checks. Historical graph/throughput reproductions do not automatically classify any other failure as baseline.

The raw final summary reports 1754 files: 1745 passed, 7 failed and 2 skipped. Native JSON file statuses report 1747 passed, 7 failed and 0 skipped. Vitest's JSON reporter encodes nonfailed skipped files as passed: the Claude conformance file contains seven skipped assertions, and the Pi opt-in file contains no assertions. The latter is verified against committed opt-in source; no environment-flag capture is claimed. Both measurements, original statuses and the explicit source-bound reconciliation remain in the summary. An unexplained mismatch stops finalization.

## Preserved full-suite history

The initial runner captured startup source `3384649cecd2fd2e6b3be04e39dc8bffe579b9b7` but no per-command source pins. Two unused test-helper export removals were committed during that run; `tested-source-state.json` later records `0b9525b17f8a42ab0b4042f34cd3be21a1edf561`. The first full attempt was cancelled, exit 130, without final totals. Its exact execution source pin is unavailable: the cancellation metadata records no HEAD. The completed two-worker retry has an explicit source capture at `0b9525b17f8a42ab0b4042f34cd3be21a1edf561` and exited 1: **25064 total, 25044 passed, 13 failed, 7 skipped**, with 8 failed files, 13 failed assertions and 2 hook errors. Those totals belong only to the pinned retry. `checks/full-suite-history.json` retains failure names, exact logs/report hashes, known pins and missing execution pins; no later targeted pass erases them.

Earlier scoped verification passed 15 files / 829 tests. Its command execution source was not captured separately; the runner-start and later snapshots bound the historical evidence without assigning an exact per-command pin. The initial dead-code exit 1 involved two unused test-helper exports and was followed by exit 0 after removing those export keywords. The clean-source smoke log explicitly pins its subject clone at `3384649cecd2fd2e6b3be04e39dc8bffe579b9b7`; that is distinct from the outer command's unrecorded execution HEAD and is not a post-integration claim. The historical qualification check validated the old preflight receipt; rerun after installing this final receipt.

The pre-P1-10F partial runner at `b37f2630b74084282abccb777f41f275813e4103` completed only the result rows preserved in `checks/pre-p1-10f-post-governance-results.json`: build, focused tests and typecheck. Root interrupted its own runner to follow the new integration instruction. The unfinished tests typecheck has no inferred exit or duration, and the full suite had not started. Its interruption and partial results remain separate from final-source qualification.

The superseded `e4bbdb66c6ee99ab266a7aae86380665d270139f` candidate completed all 21 non-full checks; its 23 recorded rows include expected stale-count exit 1 followed by generation/counts exits 0/0. Root then interrupted the four-worker full attempt after independent review found the NIS2 timestamp-precision issue. That attempt lasted 201,278 ms, produced no JSON report or totals, and has **npm exit unknown/null**. The outer Python runner exited 2 with `KeyboardInterrupt`, as recorded by the interruption artifact; this is not an npm exit 130. `checks/pre-precision-*` and the generated-input backup remain preserved. The cancelled non-final attempt stays in history only and creates no invented receipt command result. The new source and its checks are distinct.

The completed a7 source run before required P1-42 integration exited 1 after 3754276 ms: **25181 total, 25161 passed, 13 failed and 7 skipped**, across 1735 files with 8 failed files. Its 21 formal checks and their 23 result rows are archived under `checks/pre-p1-42-*`. Raw/report hashes and exact command pins are validated. These results remain historical after integration; they never replace the required new final-source run.

## Implemented draft and fixture evidence

Canonical Technology layer controls, fixtures, US/EU law-as-data entries and outside-catalog dispositions/profile/promotion notes implement the approved path translation. The guide, CRA clock and changeset are included. No question was invented. Catalog schema/loader/validator, `src/domains/**`, operating profiles and protected jurisdiction profiles are not overlay edits. P1-34's integration and any final assertion/SDK fixes are described by the final source diff and post-governance evidence.

`oracles/fixture-results.json` explicitly names its source `b88f0fb934605ba528ad517eef797a5b891ee843`, catalog digest `sha256:8626c07e015cd4f1ca10dc0b65129a6b623d55148443bfe802815f2f84ec6b52` and plan digest `sha256:1f3bb7ca16997360d043bb47e58bc367eb8f9f327185cded6ea65ecce44ff3ad`. Its 82 fixture envelopes and 26 synthetic oracle cases are scoped to that artifact's source, not silently attributed to the final source. The artifact separates fixture outcomes from production evidence: production remains `not_evaluated` with enforcement `none`. Questionnaire contracts omit `policyDigest` and establish no receipt-bound runtime enforcement. 4 final-source guard mutations were killed and restored: the standard three remain in `oracles/mutations-post-governance.json`, with the fourth precision-only mutation kept separately in `oracles/nis2-precision-mutation.json`. 135 tests passed after restoration, recorded in `oracles/post-p1-42-20261018T113154490384Z/restored-fixtures.json`. Earlier `oracles/mutations.json` remains historical evidence and is not relabelled as final proof.

The precision regression rejects timestamps finer than the millisecond comparison can represent. `oracles/precision-regression/manifest.json` hashes retained historical red/green/final records without rewriting their execution pins. `oracles/precision-regression/current-source-equivalence.json` separately binds identical helper/test bytes and fresh current-source mutation, restoration and fixture hashes. The separate fourth proof does not change the three-entry standard index contract.

The durable guide hook reads station-owned catalog prose through the existing generator Reader. Its two TDD regressions first failed, then the generator/guide slice passed 53 tests; a separate error-handling mutation was killed and restored. These scoped runs used working edits at `158d4387b75831598cea037fdf97046805c9602d`; all four edited file hashes match the committed final source, but the original execution pin is preserved. `docs/guide-hook-evidence.json` retains the native records and hashed raw-log references. The local catalog README hyperlink became a source-path code literal so the promoted Technology guide adds no unsupported public-doc edge. The recorded graph failure was only the existing MCP edge; final failure disposition still requires the final-source reconciliation.



The older P1-10F bounded source-equivalence artifact remains historical at its recorded source/integration pins. It supplies no equivalence waiver and classifies no failure of the new final source.

## Inventory, sources and human dependencies

Current inventory contains 97 pack questions and 16 deep questions, 113 unique actual IDs and exactly one disposition per ID. The old spec expected 77 pack questions. All ten formerly absent pack IDs are present; current absent IDs: 0. All six landed restoration IDs are required, with no temporary absence tolerance. Six retired IDs are replaced by their current -v2 IDs. The 9 mapping-meaning limitations are recorded explicitly; a related signature, consent, AIBOM or documentation fixture does not establish a different disclosure, notice, SBOM, deletion or full model-provider obligation.

Current provenance hashes all seven split Technology source inputs: the pack and deep files, their shared builders, both registry wrappers and questionnaire labels. Each declared hash is verified against its recorded source revision and the committed final source. The committed dispositions and `inventory-drift.json` agree on the source hashes, integration pin and 97/16/113 counts. The earlier 75-pack/zero-deep inventory and its monolithic registry hash remain historical only; they do not describe the new split source. `final-source-state.json` records the refreshed source-hash array and reconciliation provenance.

The old blocked preflight is historical; Claude subsequently authorized the canonical tree and actual inventory. No new primary regulatory text was fetched or hashed. Candidate source locators do not establish a read; unread dates remain null. Metadata-only candidates retain null URLs/dates and re-verification flags. The FTC AI-accuracy proposal is separately labelled draft and does not replace FTC Act Section 5. The CRA candidate clock remains `verified: false` with reason `article, authority and content not read`; its timestamp is inherited S5 metadata. MIT is inherited pending D-04.

Promotion remains **none — experimental, unreviewed**. Criteria 2, 9 and 10 are unmet; no agent supplies human review or approval. Open evidence:

- The recorded default-main GOV_CHANGELOG_ENTRY_COUNT exit 1 remains expected until 7fccbbfa consolidates the changelog at the final main merge; the int-relative check passed.
- Final full-suite file failure remains UNRESOLVED: tests/nativeClientStartupAbort.test.ts.
- Final full-suite file failure remains UNRESOLVED: tests/releaseSecretScanCoverage.test.ts.
- Final full-suite file failure remains UNRESOLVED: tests/sessionStoreConformance.test.ts.
- Final full-suite file failure remains UNRESOLVED: tests/keys/atomicRotation.test.ts.
- Non-assertion suite failure remains UNRESOLVED: tests/keys/atomicRotation.test.ts (reported_suite_message); exact message retained in the final summary.
- D-14 named Technology reviewer and independent legal/domain/risk sign-offs.
- P1-29 real platform/content-safety partner, funded update plan and triage target.
- Primary-source reading/hashes and legal scope confirmation for all unverified content.
- All ten P1-33 admission criteria, Sid promotion decision, integrator review and landing.
- Live enforcement evidence; local signature/clock/device oracles remain synthetic.

## Environment and finalization

Initial incremental agent/TDD/oracle runs used the system default temporary directory before `TMPDIR` was corrected. Retained logs and evidence are under `codex-7f`; the formal runner, focused 829-test run and full attempts explicitly use `/Users/sid/AgentMaturityCompass-worktrees/codex-7f/runtime/p2-30`. Every test ran from this item's own fresh clone. The halted `/private/tmp/p1-39-post-typecheck-20261016` run was never used or touched.

The ten generated-count output changes are excluded from task commits. `generated-counts-state.json` records the regeneration hashes and external patch `/Users/sid/AgentMaturityCompass-worktrees/codex-7f/evidence/p2-30/generated-counts-final-b88f0fb93-uncommitted.patch`; the final full-suite startup artifact independently records the exact ten input hashes actually used. At finalization, 10 of those output paths are dirty. Counts/docs and full-suite checks used the admitted regenerated inputs; Claude regenerates at landing. The final source-state artifact records exact HEAD/status, the authorized dirty input set and committed implementation sources. The setup install/build succeeded without instrumented durations; no duration is invented. Revalidate the installed receipt and final D-15 scan before appending the handoff. No push, external contact, integration/main merge, deployment or publication was performed by Codex.
