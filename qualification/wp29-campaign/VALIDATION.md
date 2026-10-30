# WP29a validation — 2026-10-30

Branch: `rtd/gap-wp29a`. Uncommitted base/tip: `168cec13354127c514df8eb4a20f6f7a816b1b76`. No paid/live/model trial, commit, push or merge.

## Completed development checks

- Red: both new suites failed on the absent campaign/evidence modules (`/tmp/wp29a-red-runner.log`).
- Additional red/green: all three byte-admission race regressions failed before the fix (`/tmp/wp29a-race-red.log`), then passed after byte-digest and repeated-spec admission checks. All three new guards were independently mutation-killed (`/tmp/wp29a-race-mutations.json`).
- Green after implementation and mutation restoration: 46/46 source-level tests in two suites (`/tmp/wp29a-source-final.log`): 22 campaign and 24 evidence tests. The campaign suite invokes the existing `runHarnessComparison` only with pinned Node stubs and an independent exact-output oracle; it performs no inference.
- Mutation: 62 unique guards killed: 41 evidence guards and 21 campaign guards. Evidence required 42 attempts because an initial version mutant exposed a weak test fixture; the fixture now recomputes the digest before rejecting an unknown version, and the mutant was killed. The campaign workspace mutant failed its assertion as required; an initial log classifier expected an exception string and was corrected. Sources were restored, then all 46 tests passed.
- Mutation logs: `/tmp/wp29a-evidence-mutation-results.json`, `/tmp/wp29a-campaign-mutation-results.json`, `/tmp/wp29a-zero-success-mutation.json`; restoration hashes in the corresponding `*-mutation-restored.json` files.
- The default Vitest config bundler attempted a write under shared `node_modules/.vite-temp` and failed with EPERM. All runnable checks use `--configLoader runner --no-cache --maxWorkers=2`; no shared dependency files were changed.

## Repository checks in progress

The ordinary Node 22 build passed (exit 0, `/tmp/wp29a-build-8g.log`) with `NODE_OPTIONS=--max-old-space-size=8192`. The earlier default-heap build and diagnostic trace were interrupted after extended compilation without diagnostics; the trace confirmed progress through unchanged modules. The 8 GiB build completed normally. Its source snapshot preceded the last race guards, so the exact required verifier is now rebuilding the final source.

Existing regression tests passed 130/130 across six files (`/tmp/wp29a-existing-tests.log` and `.json`): `harnessComparison.test.ts` (66), `harnessComparisonOutputOwnership.test.ts` (21), `experimentGatePolicy.test.ts` (5), `statsConsolidation.test.ts` (5), `benchmarkPilotAnalysis.test.ts` (10), and `harnessCodingOutputSnapshot.test.ts` (23). `npm run -s lint` passed (`/tmp/wp29a-lint.log`). No full suite was run.

The first exact verifier exited 1 (`/tmp/wp29a-verify-wt.log`): a new test assigned a read-only process field, and the early dead-code baseline had become stale after complete build outputs appeared. The process fixture now uses object replacement. Its affected runtime test passed, and a focused type check of both new test files passed (`/tmp/wp29a-new-tests-typecheck.log`). Both new suites passed 46/46 against rebuilt `dist` modules (`/tmp/wp29a-new-tests.log` and `.json`).

The final exact verifier is running in `/tmp/wp29a-verify-wt-final.log`; its exit code will be retained in `/tmp/wp29a-verify-wt-final.exit`. Final results will replace this section before completion.

## Source-quality reconciliation

The preflight ran while the verifier was rebuilding `dist`, so its file/export findings were transient. The completed-build scan exposed three genuinely unused new exports; the version constant and workspace snapshot schema are now private, and the unused evidence type alias was removed. No documented function or behavior was removed.

The repository `quality:baseline -- dead-code --shrink` command removed obsolete findings, including the comparison-file-pin schema export that this campaign now consumes. The stable scan exited 0: baseline 2,535, current 2,608, new 0, stale 0, accepted 73 (`/tmp/wp29a-dead-code-refresh.log`). No baseline was hand-edited or globally rebaselined.

The sole new retained exception is `d6129c8e3ea043a37d44fd7732bc648ce49dd6a3da773276f5169e223f0820a4`: POSIX `mkfifo` is the host utility used by the real FIFO fixture, not an npm dependency. That fixture is skipped on Windows. Its exact recorded reason is in `scripts/quality/source-quality-baseline.json`. No API registry source or exception remains changed.

Independent final source review found no remaining blocker in the byte-admission or zero-success guards. All 35 preparation-input pins were refreshed after private-export cleanup and will be checked again at handoff.

## Scope and limits

H2X-21 already exists at base. H2X-31/43 add preparation helpers and attributed offline sidecars; production adapter collection remains deferred to its owner. AXE-02/36 add campaign-level repetition, lower-bound and inconclusive-aware analysis; red-team signing/verified receipts and evaluator-wide repetition knobs remain deferred outside campaign ownership. H2X-24/26 are excluded as already done in the H2X lane.

Installed comparator artifacts, actual serving identities, missing scenario bindings, human/platform studies, optimization substrates and separately budgeted trials remain unavailable. The supplied specs are blocked preparation plans. Analysis always returns `promotionAllowed: false`. Workspace capture requires stopped writers and is not atomic against concurrent hostile mutation.
