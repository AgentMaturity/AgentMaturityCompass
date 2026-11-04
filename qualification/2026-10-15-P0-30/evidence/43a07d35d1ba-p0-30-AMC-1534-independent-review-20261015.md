# AMC-1534 original-corpus independent review

No actionable findings were found in this bounded receipt audit. The original native file registered and passed 25/25, and the separate CLI context registered and passed 9/9 alone.

| Source control | Passed baseline → mutant → restored | Meaning |
| --- | --- | --- |
| Budget comparison | 25 → 23 → 25 | Two original exact budget-refusal assertions fail. |
| Outer transaction removal | 25 → 25 → 25 | The original corpus lacks a cross-process admission witness. |

The comparison mutant fails at `tests/nativeBudgets.test.ts:217:70` and `:232:70`: expected `budgets`, actual `undefined`. The earlier same-owner healthy READ_ONLY calls at lines 216 and 231 pass. The first failure masks subsequent body/denial calls and accounting totals at lines 218–224. The second masks usage, body count and reservation-seal checks at lines 233–239. No later mutant effects or generic refusal are inferred from these early assertions.

The surviving transaction-removal control is coverage debt, not equivalence. The overlap test at lines 199–209 runs both sessions in one process; the actual reservation is synchronous before the awaited transport (`llmRuntime.ts:337` before line 350). The rollback case at lines 307–319 creates its own unmutated ledger transaction and does not exercise the removed reserve wrapper. No independent contender or barrier forces overlapping admissions in the original 25-case corpus.

The native corpus expands as 18 single registrations, three protocol rows and four post-admission disposition rows. Eight corpus processes repeat 184 case executions. The separate nine-case CLI corpus uses in-process Commander and keyless local seams; held 27 and historical 26 are distinct. Fresh local keys, workspaces, rows and timestamps are not identical physical inputs across phases.

All 2,331 indexed references, all 11 frozen command records and both exact source deltas were independently checked. Each mutant manifest changes only `src/budgets/nativeBudgetAdmission.ts`; restoration is exact. All 7,739 source files, 4,529 compiled files and the full 12,268-file private closure match. All 203 protected pins, three late pins, 2,182 prior references, 12 actual prior closure path sets, 307 dependency links and native-module bytes/device/inode/link count remain exact. The copy is a physical filesystem copy, not a Git clone.

Normal source imports, Vitest configuration, global/per-file guards, original 30-second deadlines, one-worker file-alone commands, dual reporters and original cleanup remain unchanged. No setup, import, transform, timeout, unhandled or reported cleanup failure is being counted as a guard result. The launcher directly prints Node 22.23.3/ABI 127; no direct per-worker fingerprint is invented.

Original native teardown suppresses session-close errors at line 36. Passing cases therefore do not prove all pooled handles physically closed, a whole-cold interval or repair of prior mixed-parent corruption. Real local signing/journals and verification run behind synthetic provider/tool fixtures; they do not establish external identity, live provider behavior or a hard USD price ceiling.

The retained recipe provenance still says “current source-mode runtime not yet executed.” That copied readiness note describes origin; the actual raw matrices and frozen journal establish eight executed corpus processes. Original packet bytes remain untouched. Separate race-v2 preparation is outside this review and cannot extend the original 25-case result. No notary, cross-process atomicity, full batch, full suite, Node 24, hosted/release, Done or dependency-closure claim follows.

All reads are finished. This reviewer ran no AMC imports, tests, parser, compiler, build, network or Git commands and wrote only this review pair.
