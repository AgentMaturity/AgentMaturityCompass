# P3-15 Education overlay: draft qualification

This packet records an experimental, unreviewed Education draft. Promotion is `none`. This is the authorized draft handoff with dependent checks pending; full qualification and promotion are incomplete. The source is `a625ee5cae3cde551701f7c9cfed33a4f142480f`, merging exact int `ccaabe07fdddfad442bfd1a738026862c67f7985`. Measurements are local macOS arm64 results, not CI or an institution's production evidence. The completed case probe records Node v22.23.3, the own clone and `codex-7f/runtime/p3-15`, with clean source before and after.

## Measured checks and pending work

The completed focused run has 481 tests: 480 passed and one failed. The sole failure is the deferred catalog changelog guard; it remains **FAIL / pending Claude's landing version bump**, not a pass or a baseline failure. The Education station tests passed 118/118. These scoped results do not establish full-suite qualification.

| Check | Exit | Duration ms |
| --- | --- | --- |
| `build` | 0 | 93784 |
| `focused` | 1 | 85520 |
| `typecheck` | 0 | 75354 |
| `typecheck-tests` | 0 | 190350 |
| `lint` | 0 | 7908 |
| `counts-before-regeneration` | 1 | 3161 |
| `gen-counts` | 0 | 2226 |
| `counts` | 0 | 2043 |
| `docs-drift` | 0 | 1844 |
| `industry-guides` | 0 | 1732 |
| `regulatory-calendar` | 0 | 923 |
| `freeze` | 0 | 6010 |
| `architecture-boundaries` | 0 | 5805 |
| `gates` | 0 | 1164 |
| `schemas` | 0 | 1741 |
| `api-ref` | 0 | 999 |
| `threat-model` | 0 | 1031 |
| `citations` | 0 | 1316 |
| `qualification` | 0 | 4246 |
| `release-notes` | 0 | 1008 |
| `catalog-admission` | 0 | 3221 |
| `catalog-currency` | 0 | 1438 |
| `catalog-changelog` | 1 | 3484 |
| `catalog-changelog-main` | 1 | 1567 |
| `duplicates` | 0 | 1954 |
| `dead-code` | 0 | 8903 |
| `clean-source` | 0 | 306213 |


The checks above completed at the named merged source. `checks.json` retains exact commands, source/ref/status captures and raw log hashes. Static checks after count generation saw only the ten known generated outputs; those bytes were archived, then restored to committed bytes. They are not committed here. Vitest and the case probe started and ended with clean source; intentional mutation windows are labelled separately.

All 20 guard variants were killed by their intended native assertion. The isolated clone of this exact commit passed 118/118 before mutation and 118/118 after exact restoration. All eight helper/test files match the candidate and original backups; source and int refs are unchanged and the clone is clean. Both required grade-value and emotion-capability mutations are included. No import, setup or timeout error counts as a kill. `mutations.json` preserves raw rows; `source-audit.json` independently checks their logs, reports, hashes and restoration.

Mutation metadata clarification: the raw summary field `initialGreenReportSha256` points to the candidate's broader 481/480/1 report, whose 118 Education tests pass. It is not the isolated baseline report. The nested `initialGreen.rawReportSha256` identifies the actual isolated 118/118 baseline. Both original fields are preserved and separately verified; the broader report is never advertised as fully green.

Under the direct human policy for the remaining drafts, the standard receipt must retain `tests: null` and full-suite state `NOT_RUN`, with null exit, duration and totals. A full suite on the final merged HEAD remains required; the current binding limit is two workers. This packet records the authorized draft handoff. It does not waive the full run or claim promotion.

## Case evidence and its limits

The completed table is `evidence/p3-15/final-case-probes/a625ee5cae3cde551701f7c9cfed33a4f142480f/attempt-2/catalog-probe.json`, SHA-256 `47ba7f32d546e7fdb658a67bff3662f9923ef8b07965eeaa36a3ce8895380139`. Its catalog digest is `sha256:6046d0c643083cca7470b594299189ab57539b5fabdef3152b8aa6d4af54927a`.

The 45 native fixture evaluations contain 41 `not_evaluated`, four `fail` and zero `pass` results. All 45 claims are `self_reported`. Twelve rows have the native evaluator's enforcement state `observed`; 33 have `none`. That state is separate from trust tier and claim kind: it does not establish observed-trust evidence, live interception or enforced production behavior. None is labelled `enforced`.

The 17 local synthetic protocol observations contain two allow, five deny, seven not evaluated, one pass and two fail results. These remain separate from native evidence evaluation. All six empty-production probes yield `not_evaluated` with enforcement `none`; a local oracle result is never substituted for production evidence.

Accessibility observations used actual axe-core 4.13.0, adapter 4.13.0, Playwright 1.62.1 and Chromium 151.0.7922.34 on captured synthetic HTML. Image-alt and missing-label fixtures produced actual automated failures. The automated pass covers only the executed WCAG 2.1 A/AA subset. Publication was not performed. The manual remainder is unperformed, with no assessor or default pass.

## Inventory, scope and history

Dispositions cover all 103 actual Education IDs: 87 pack and 16 handwritten deep questions, without invented missing IDs. Eight inventory source hashes were checked against current int; original int046 capture metadata remains historical provenance. The broader mapping limits are retained in `docs/catalog/education/README.md` and `dispositions.json`; the signatures do not establish every obligation in the mapped question text.

The separate current Education P1-46 plan record includes its new requirement rows. Its runtime policy digest remains `sha256:a4ec23c2162efa58cb964383a8e9d25c45180eafaa1586bfa6203d38c4e13430`. The historical P1-46 receipt and other station records remain unchanged.

The earlier failed native-enforcement expectations and first probe output collision remain preserved under their original evidence and source pins. They are historical diagnostics, not baseline classifications or current passes. Correcting the expectations distinguishes admitted self-reported evidence from enforcement state; it does not upgrade trust or weaken the empty-production boundary.

## Open dependencies and human work

On the current integration base, P2-30's guide hook, COPPA consent and marking controls, P3-14's FRIA activation draft and P2-27's two-institution FERPA fixture remain unresolved dependencies. Export-wrapper observations remain not evaluated. Technology taxonomy exists, but the fixture profiles' domain facts still declare only Education; they do not establish complete Education × Technology coverage. Age, institution-specific authority and legal applicability need separate evidence.

All 15 instrument candidates remain unverified and flagged for re-verification. Inherited locators and discovery pages establish no fresh primary read or legal review. All ten admission criteria remain tracked without invented admission success. D-14/D-10 privacy and accessibility experts, independent sign-offs, a manual accessibility assessor, P1-29 partner, funded stewardship, D-04 licence decision and Sid's promotion approval remain open. No reviewer, partner or third party was contacted.

The Education P1-46 comparison uses its inherited synthetic as-of date, 2026-10-12. It is not a claim of a past real deployment. The earlier probe collision and mutation-clone bootstrap failure are preserved in `source-audit.json`; neither changed source or an earlier result.
