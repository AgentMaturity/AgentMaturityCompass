# P0-33 zero-pending profile conflict — 14 October 2026

Scope: read-only source, history, and acceptance evidence. No build, test, check, source edit, ref change, policy change, or hardware/security-setting change ran. Only this unique audit note was authored.

## Current enforceable result

Current main and the P0-33 checkout both enforce `scripts/release-gate.mjs:227-240`: report success, positive passed count, total equal passed, zero failed/pending/todo tests, zero failed/pending suites, every file passed with an empty message, plus process success. A successful Vitest process with pending cases is converted to a failed full-test-suite step; the report path, SHA-256, and raw counts are retained at `:242`.

`tests/releaseGateExecution.test.ts:163-171` explicitly rejects missing, malformed, failed, skipped, some-pending, todo, invalid-count, suite-error, and file-error reports. `vitest.config.ts:7` includes all tests/**/*.test.ts. No per-platform mandatory release profile is selected by the current gate command (`release-gate.mjs:205-206`).

Therefore the actual full report must be recorded without deleting pending cases, altering totals, relabelling skips as passes, or presenting process exit 0 as release qualification. A report with pending cases does not satisfy the current gate. This audit did not read the still-running parent report or infer its final numbers.

## Exact provenance

The strict predicate was introduced by `e2f76374076371e17ac913daf0d6f3b13c5e1362`, 8 September 2026, “fix(release): qualify installed artifacts and report incomplete checks”. `git show e2f763740 -- scripts/release-gate.mjs` adds the mandatory-profile comment, count fields, strict predicate, rejection error, and retained artifact.

Current blame points to `aa0870907e5e5c41b3e303eadd2b0397bbebac96`, 5 October, because that root-patch landing moved/reindented the block into its DAG task. `git show aa0870907e` and `git blame aa0870907e^ -L 187,213 -- scripts/release-gate.mjs` prove the unchanged strict block already existed in its parent. It was not introduced by P0-46, P0-61, or P0-62.

- P0-46: `e0fdc9c5a40187bf73056752bb53cd1bed67f333`, local GitHub Action install with pnpm; exported title at Downloads/Issues.md:56.
- P0-61: `f4b4a0380241903cf42275ee742e9ecb6ce3413e`, delegation-limit mutation coverage; full criterion at qualification/2026-10-11-P0-31/follow-ups.md, P0-61 section.
- P0-62: `2a8051425b57c76ad28367c02169b40e0eee9ec2` and follow-ups, Studio daemon startup/browser reliability; criterion is diagnosed captured failure or 20 consecutive Studio runs, not blanket test-pending permission.

## Plan and historical evidence

The surviving P0-33-associated criterion in `/Users/sid/Downloads/Workstreams.md:380` requires all 14 release:gate checks to execute/pass in fresh main, with live-deploy-health per D-03 or a written skip, and every CI job green. That stated exception concerns live-deploy-health, not test cases. The full P0-33 issue checklist remains unavailable, as recorded in the preceding freeze audit.

`docs/program/READY_TO_DEPLOY.md:59` forbids weakening tests to obtain green. `:63-76` requires applicable checks or demonstrated same failure on main. `:91-96` requires accepted criteria, Node 22/24 CI, receipts, docs/changeset, reviewed merge, and merged SHA. No recovered RTD criterion authorizes relaxing the zero-pending rule or treating inapplicable cases as passed.

The exact connected AMC wiki page `vault-evidence-2026-09-08-integrated-release-gate-acceptance-m-e5fa5d4a` in workspace `5573c0e3-aa89-47bc-bb1b-b8f8af50abeb`, revision 1, was retrieved read-only. It records historical commit `33b24725fd37cc3c0cf9ee4fec9321bcab983a44`: 11,196 tests, zero failures/pending/todo, 1,330 test files, 13 configured checks passed, and one explicit live-health skip causing partial qualification. It explicitly limits the observation to Darwin ARM64/Node25.5 and says no supported-LTS or cross-platform claim. The imported note states “currency is not requalified”. This supports historical profile intent, not current completion or human approval of a new profile policy.

## Current source conflict

CI build-test runs Ubuntu (`.github/workflows/ci.yml:38`) on Node 22 and 24. It directly invokes Vitest coverage at `:176`, excludes performance tests, then runs performance files separately at `:181-182`. It has no matching strict JSON pending-count validator there.

The same configured full test corpus includes real platform cases:

- `tests/nativeManagedRecovery.test.ts:85`: two SQLite/JSONL recovery cases run only on Darwin.
- `tests/nativeValidationOutcomeSurfaces.test.ts:24,112`: actual Darwin validation and credential refusal cases run only on Darwin. Its comment at `:20-23` requires actual pinned launchers on other OSes and rejects simulated Linux success.
- `tests/sandboxConfinement.test.ts:17-19,43,158`: actual kernel refusal suites are skipped outside Darwin rather than faked.
- `tests/cosProduct02NativePtyLinux.test.ts:126`: the outside-Linux refusal case runs only when platform is not Linux. Its Linux integration block at `:55-56` uses conditional registration and opt-in rather than skipped registration, but that does not remove the refusal case's Linux skip.
- Other root/Windows/environment gates exist. Each skipped case needs its exact reason; the existence of these platform cases does not justify every pending result automatically.

Inference from current source: an unchanged all-tests command cannot produce zero pending on a single supported host across these mutually exclusive OS conditions. Darwin passes Darwin-specific work but a Linux run has those cases pending. Hardware availability alone cannot reconcile that parser/profile conflict.

## Qualification boundary

Continue fixing evidenced test failures. Preserve the actual final full report and classify the release qualification as failed/incomplete under the unchanged predicate when pending is nonzero. The unresolved mandatory-profile/acceptance conflict needs a recorded maintainer/integrator decision defining what must execute on each platform and how actual platform receipts satisfy the release criterion; this audit does not approve or prescribe a relaxed policy. Do not convert runIf to hidden conditional registration solely to obtain zero pending, delete tests, or allow arbitrary skipped outcomes.

Separately, P0-60 at `qualification/2026-10-11-P0-31/follow-ups.md` requires Sid-approved Linux ARM64 host/VM confinement qualification. Bubblewrap user namespaces were denied by host AppArmor; process-tree cancellation remained unexercised. Both Node 22/24 cells must record cancellation with backend bwrap, cancelled true, and treeExitProven true. That hardware/security decision is not a unit-test skip exception and stays separate from the release-profile decision.

Graphify's existing stale graph was queried first; returned nodes did not establish current release policy. Current source and Git history above provide the evidence. No P0-29 work was started.
