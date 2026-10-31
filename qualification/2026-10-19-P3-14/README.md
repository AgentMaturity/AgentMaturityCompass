# P3-14 Governance overlay: current-source v2 supplement

Source `386a9a993a9c0997dbbe8c7b74bad9bf84760c46`, integration `dc8c34d0403c7e4d7513ad546f202574e3e78af8`; catalog `0.1.2`, digest `sha256:036bd60ef00833c802b17540190498edbacc0e7a19c69e30d808ef8a3dc9e78b`. Measurements are local macOS arm64, Node v22.23.3, not CI. This receipt binds product source386, not its future receipt-only committed HEAD Q. Root must repeat the 23 checks and full suite on exact Q before local int landing. Those future measurements belong off-tree and in the handoff; none is claimed here. This technical evidence does not review regulatory content. The overlay remains experimental and unreviewed; promotion is none.

## Current scoped measurements

The 23 ordinary checks passed at this source. The broader focused suite passed 469/469 across 26 native JSON file entries. The own three-file suite passed 176/176. These totals describe separate runs and are not added to the full-suite totals.

| Check | Exit | Duration ms |
| --- | --- | --- |
| `build` | 0 | 46085 |
| `typecheck` | 0 | 28363 |
| `typecheck-tests` | 0 | 41631 |
| `lint` | 0 | 4540 |
| `check-counts` | 0 | 739 |
| `check-docs-drift` | 0 | 440 |
| `check-freeze` | 0 | 1696 |
| `check-citations` | 0 | 331 |
| `check-architecture-boundaries` | 0 | 1713 |
| `check-threat-model` | 0 | 213 |
| `check-api-ref` | 0 | 182 |
| `check-schemas` | 0 | 577 |
| `check-gates` | 0 | 280 |
| `check-qualification` | 0 | 1522 |
| `check-catalog-currency` | 0 | 379 |
| `check-catalog-changelog` | 0 | 780 |
| `check-catalog-admission` | 0 | 1378 |
| `check-industry-guides` | 0 | 805 |
| `check-regulatory-calendar` | 0 | 236 |
| `check-clean-source` | 0 | 57752 |
| `check-duplicates` | 0 | 738 |
| `check-dead-code` | 0 | 3325 |
| `release-notes-check` | 0 | 191 |


The current isolated matrix killed 22/22 intended guard mutations, with 48 actual native AssertionErrors. Its own suite passed 176/176 before mutation and after exact restoration of all ten frozen source files. Import, setup, timeout or unrelated failures do not count as kills. The named guard-family proof does not independently measure every subcondition. Seven added test cases cover existing guards; their first green and later guard-mutation reds are not new feature RED evidence. Historical feature TDD and earlier mutation pins remain historical.

## Actual current full run and classification

The completed current full run exited 1 after 3398547 ms: 28032 assertions, 28015 passed, 10 failed, 7 native pending/skipped and 0 todo. Receipt skipped is pending+todo=7. The actual exit and totals are retained. Raw file summary: {"counts":{"failed":4,"passed":1844,"skipped":2},"line":" Test Files  4 failed | 1844 passed | 2 skipped (1850)","total":1850}. JSON file entries: 1850; statuses: {"failed":4,"passed":1846}. Native suite counters remain separately recorded.

Descriptor classifications: {"BASELINE_MATCHED":12,"BASELINE_MATCHED_ASYNC_DISPATCH_FRAME":2,"RECORDED_SKIP_OR_TODO":7}. By descriptor kind: {"assertion":{"BASELINE_MATCHED":9,"BASELINE_MATCHED_ASYNC_DISPATCH_FRAME":1,"RECORDED_SKIP_OR_TODO":7},"run":{},"suite":{"BASELINE_MATCHED":3,"BASELINE_MATCHED_ASYNC_DISPATCH_FRAME":1}}. Descriptors are not counts of distinct failed tests. Complete exact-input coverage is mandatory; no unresolved or item-regression descriptor is admitted.

Fresh intDC observations reproduce all ten failed assertions. Nine have clone-prefix-only message equality. The remaining named checkpoint assertion uses the distinct `BASELINE_MATCHED_ASYNC_DISPATCH_FRAME` classification, also applied to its containing six-failure suite descriptor: exactly one baseline-only `processTicksAndRejections (node:internal/process/task_queues:103:5)` frame is removed only for that assertion's comparison, between the exact helper line 289 and checkpoint line 500 frames. All original messages and every other byte/frame remain retained. This is explicitly scoped observational signature equivalence, not byte equality or an OpenSSL root-cause finding. The measured full run still exited1 with ten failed assertions.

`full-suite.json` retains separate native suite counters, JSON file entries/statuses, raw file categories and assertion totals. Large raw, native report and complete audit remain off-tree with exact path/hash/byte references. Every actual failed assertion, failed or message-bearing suite, nonpass assertion and run signal is accounted for. Raw timeout diagnostics are preserved separately from hook errors. Skip and file-category explanations are bound to current source gates; neither measurement is rewritten.

A baseline classification uses fresh clean exact-int whole-file evidence under unchanged defaults and exact error identities. A load-dependent inference additionally requires the current candidate's same whole file to pass alone, with every failed fullName observed passing. It is an attributed inference, never a replacement for the failed full exit or an all-green full-run claim. Unsupported errors and item regressions block preview.

## Cases, inventory and provenance

The remeasured probe contains 70 native fixture evaluations: 64 not evaluated, six conservative failures and zero passes. Its 28 separate synthetic local outcomes are five allow, 12 deny, eight not evaluated, one pass and two fail. Seven empty-production probes remain not evaluated, enforcement none and zero admitted evidence. All native claims are self_reported. An enforcement state named observed is not observed trust or proof of live interception. Local example outcomes supply no production evidence.

The current inventory proof verifies all 147 unique actual disposition IDs and their seven source hashes against current source and int. The retained declared source split is 91 pack, seven hand-written deep and 49 generated deep questions; this proof is not a new runtime count. `GOV-CS-4` is absent, and `GOV-CS-4-v2` has narrower actual meaning. The mapping limits remain in the source README and dispositions; no question or legal coverage is invented.

The original eight-file October 18 packet is byte-verified and unchanged. The earlier D7 full run recorded 17 failures on a different integration, int9D. Its classifications and scoped evidence are historical, not current intDC baseline proof. Current source, owner-generation metadata, catalog digest, command records and input references are retained separately. Old failures, source pins and preparation limitations are not rewritten. Owner preparation retains eleven completed generator/preflight/shrink records, the separate successful resume stage and a11-to-386 commit. The initial SQLite-location preflight refusal had no command result; the later ignored-path staging command exited1/27ms. Both failures and the porcelain-trim limitation remain historical.

## Human and deployment limits

Technology's guide hook, marking draft and EU register are present here; their presence does not establish complete cross-station applicability, human-facing disclosure or legal scope. Real authoritative ten-case corpus remains open: ten synthetic IDs plus an unknown eleventh are not real cases. Manual accessibility/WCAG remainder, FRIA substance, explanation quality, full contracts, CUI scope and retention remain unresolved.

D14/D10 experts, distinct authorized legal/domain/risk sign-offs, P129 partners, stewardship/funding, D04 licence and Sid's promotion decision remain pending. Instrument candidates are unverified/reverify; no fresh primary reading, legal review, human approval, third-party contact or live agency/court/defense result is claimed.

Native qualification validation is NOT_RUN_AT_ASSEMBLY. Root records the subsequent actual validation command/result off-tree and in the handoff. This supplement makes no public push or final promotion claim.
