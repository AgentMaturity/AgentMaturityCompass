# Retained-output operator/reader boundary mutation preparation

Authored on 2026-09-09 from `a5987643ef6c26b01f687226fbc6a6709fc182cb`, in `tmp/cos-spill-boundaries` on `codex/cos-spill-boundaries`. **Preparation only: no helper execution, import, syntax/parser check, install, build, baseline or mutation was performed during authoring.** This document is not a receipt. The SHA is authoring provenance, not an implicit execution default.

The finite task is `AMC_OS/RESEARCH/2026-09-09-chat-on-steroids/spill-boundaries-task.md`; ownership is the root manifest's latest retained-output boundary helper section. The only authoring outputs are this guide, `run.py` beside it, and the assigned worktree-local `AMC_OS/INBOX/REV_QA_LEAD.md`. Runtime, test sources, shared root, other worktrees, Linear and Obsidian are unchanged by this assignment.

## Purpose and exact evidence boundary

The operator outcome under review is truthful retained-output admission and deliberate erasure review, followed by authenticated, bounded disclosure to the operator. The affected surfaces are native CLI, session evidence, Vault and Comply. This helper prepares additional source mutation evidence for the operator/reader boundaries omitted by the earlier lifecycle helper. It does not add a runtime feature or start a new capability queue.

Source authority inspected in the assigned checkout:

- `src/cli-spill-commands.ts`, `src/cli-session-spill-read-command.ts`, `src/session/spill/spillRead.ts`; `tests/cliSpillCommands.test.ts`, `tests/sessionSpillRead.test.ts`.
- `src/session/spill/spillEvidence.ts`, `spillLifecycle.ts`, `spillStore.ts`, `spillEncryption.ts`; `src/persistence/openSessionEventStore.ts` and `sessionStoreVerification.ts`.
- `package.json`, `pnpm-workspace.yaml`, `vitest.config.ts`; root `AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/mutations/spill-lifecycle.py` and `spill-lifecycle.md`; root `AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/attempt-3/runner.py`.

The existing lifecycle helper explains its overlapping cryptographic/transport guards and its deferred operator surfaces. This helper does not execute that helper, import it, reuse its old receipts as new evidence, or repeat its mutation list. It uses the newer reviewed `attempt-3` process supervisor, not the lifecycle helper's earlier process-group runner.

**SOURCE evidence only.** Direct source-level Commander registration and library tests do not prove root `src/cli.ts` wiring, packed installation, published exports, a platform matrix, full suite, release gate, real-provider use, human first-use, deployment or issue closure. A green initial baseline is not mutation qualification; a structurally valid assertion failure is not a causally reviewed killed mutant.

## Invocation after Codex source review and separate execution authorization

Use an existing trusted Python 3.10+ interpreter on a POSIX host with the reviewed supervisor's `/bin/ps` identity observation available. Supply an existing Node 22 release executable, existing pnpm JavaScript entry, Git executable, and the exact local supervisor module that Codex reviewed. Do not download runtimes, repair tools or reset another checkout to satisfy admission.

The following is a future execution command, **not a command executed during authoring**. Replace the clean input checkout, unused output name and supervisor digest deliberately. The supervisor digest must be the actual independently reviewed file's complete lowercase SHA-256, not the placeholder or a digest silently recomputed by this helper as a substitute for review.

```sh
python3 /Users/sid/AgentMaturityCompass/tmp/cos-spill-boundaries/AMC_OS/RESEARCH/2026-09-09-spill-boundary-mutations/run.py \
  --execute \
  --repository /absolute/path/to/existing-clean-source-checkout \
  --source a5987643ef6c26b01f687226fbc6a6709fc182cb \
  --output /private/tmp/amc-spill-boundaries-UNIQUE_RUN_ID \
  --node /opt/homebrew/opt/node@22/bin/node \
  --pnpm /opt/homebrew/lib/node_modules/pnpm/bin/pnpm.cjs \
  --git /usr/bin/git \
  --supervisor /Users/sid/AgentMaturityCompass/AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/attempt-3/runner.py \
  --supervisor-sha256 REPLACE_WITH_REVIEWED_64_LOWERCASE_HEX_SHA256
```

`--source` is always explicit. A different supplied commit is admitted only when the input checkout's HEAD matches it, the clone matches it, and all exact source/test/assertion anchors still match. The helper does not adapt drifting anchors or rename expected tests. Root may instead freeze a newly reviewed helper for a different candidate; retain any earlier refusal and use a new output directory.

`--execute` is required even for preparation of the clone. Missing or invalid arguments refuse before execution. `--repository` must be the canonical checkout root, not a subdirectory or a bare repository. HEAD must equal the supplied full commit. Tracked or untracked dirtiness and nonstandard index flags cause refusal before cloning. Ignored caches are not source qualification inputs and are not copied by Git's fresh clone; their presence is not asserted to be a clean installation.

All supplied paths must be absolute and contain no traversal components or control characters. Selected existing paths are resolved once, permitting normal Homebrew/macOS aliases. Input files/directories must have the required type, trusted ownership and no group/other write access. Output needs an existing operator-owned non-shared-write parent or a root-owned sticky scratch parent. It must not exist, including as a dangling link. It cannot be inside a checkout, overlap the shared root or source/tool inputs, or overlap registered worktrees or source Git storage. The helper never repairs these paths.

## Finite execution sequence

The new exclusive output root contains `clone/`, isolated `home/`, `tmp/`, `cache/`, `store/`, private runtime launchers, and `receipts/`. All are retained, including on failure. The helper never resets, stashes, cleans, removes, commits or mutates the supplied source repository. Git metadata reads disable optional locks and filesystem-monitor hooks; checkout happens only in its new clone.

The clone uses `--no-local --no-hardlinks --no-checkout`, an empty private Git template and local file transport, then detaches at the exact source SHA. Linked Git storage, object alternates and submodule sources are refused. Relevant source, test, configuration and lockfile bytes are compared with `git show` at the pin. Mutation source must be a real single-link file owned by the operator inside that clone, not a linked or escaped path.

The selected Node executable drives both pnpm and Vitest. Node must report a release in major version 22; pnpm must match the candidate's `packageManager` exactly. At the authoring pin that field is `pnpm@10.33.0`; runtime admission reads the actual candidate value. Tool hashes, runtime metadata and helper/supervisor snapshots are retained.

Installation is `node /supplied/pnpm.cjs install --frozen-lockfile --store-dir /new/private/store`, only in the new clone. A preexisting `node_modules` install root, including a link, is refused before installation. Existing candidate lifecycle policy remains unchanged, including `pnpm-workspace.yaml`'s native dependency allowlist. No separate application build or generator is invoked. Install output is preserved; a nonzero exit, source drift or missing private Vitest entry aborts. This preparation install is not installed-package acceptance.

The unmodified baseline runs both complete files:

```text
tests/cliSpillCommands.test.ts
tests/sessionSpillRead.test.ts
```

It invokes the private `node_modules/vitest/vitest.mjs` directly with `run`, `--maxWorkers=1`, `--no-file-parallelism`, JSON reporting and a new per-command report path. It does not call `pnpm test` or trigger the package's `pretest` build. The repository Vitest configuration and all tests remain unedited. Both files must be wholly green with no skipped/pending baseline cases; every selected full test name must occur exactly once and pass.

Each declared mutation then runs once, independently. Its source anchor must occur exactly once; original/mutated bytes, SHA-256 hashes and a unified patch are preserved before writing. A fully anchored `--testNamePattern` selects only its declared exact regression names from the appropriate file. The mutation's result is parsed, the original bytes are restored in `finally`, and **that same selected regression is rerun after restoration**. A restored regression must be green before advancing. Survivors and inconclusive mutant results still receive the restored regression when closure, signal and time limits permit. They never get an automatic mutation retry or a changed label merely because restoration passes.

There is no second whole-file baseline or expanding audit loop: the initial two-file baseline and each mutation's own restored regression are distinct recorded checks. Source hashes and tracked cleanliness are checked at their boundaries. An unexpected source edit or partial write is retained with the original backup and stops progress, rather than overwriting unknown bytes. A timeout or interruption never authorizes extra tests outside the work deadline; byte restoration is attempted after confirmed process closure, and any omitted restored run remains explicitly unqualified.

## The declared mutation map

`MUTATIONS` in `run.py` is the exact machine-readable map. It contains only these six source mutations; parameterized cases do not become additional independent protections. The helper records the resolved test-source hash and exact intended assertion line at execution time.

| Mutation | Exact changed decision | Intended discriminator and scope limit |
|---|---|---|
| `operator-backend-conflict-admission` | Disable the operator's pinned/requested mismatch condition in `selectedBackend` | SQLite and JSONL conflict tests must fail at the expected `backend-mismatch` assertion. The remaining code still selects the pinned backend; this does not demonstrate an unrelated-store read. |
| `operator-authenticate-stripped-spill-rows` | Disable operator all-row authenticity rejection in `loadHistory` | The JSONL test strips the spill key without resigning and expects `history-row-unauthentic`. Native reference inventory skips non-spill rows, so it cannot substitute for this operator admission check. Shared hash/signature implementations are unchanged. |
| `operator-plan-requires-all-origins` | Disable `erasePlan`'s all-referencing-events scope condition | The read-only result-only plan must fail at `outside-scope-reference`. Native `eraseSessionSpills` retains its independent scope guard. No out-of-scope deletion is claimed. |
| `operator-apply-requires-fresh-plan` | Disable the comparison of fresh `plan.planSha256` with `flags.expectPlan` | Reason, scope, history, new-reference and missing-object variations must fail at the `stale-plan` assertion. They exercise one cohesive review binding; not five separate guards, and not a transactional lock. |
| `reader-must-propagate-object-refusal` | Catch retrieval failure and substitute a zero-filled buffer at the reader seam | The existing test corrupts the final ciphertext byte while requesting only the first byte. Its exact refusal assertion must fail. This models fail-open handling after object authentication refuses; it does not independently disable or qualify ciphertext hash, GCM, AAD, framing or either plaintext-hash guard. |
| `reader-must-not-disclose-beyond-page` | Serialize the full verified buffer instead of `full.subarray(offset, end)` | SQLite and JSONL exact-byte-range equality assertions must fail. Range and privacy are one over-disclosure mutation. Numeric admission, full-object authentication and terminal escaping stay unchanged. |

The zero buffer in the fifth mutation is deliberately invalid mutant behavior, never a fabricated baseline observation or legitimate retained output. All temporary source weakening and test fixture erasure occurs only in the helper's future owned clone and temporary synthetic workspaces, after explicit execution authorization. The authoring worktree receives only the Python helper and documents, not these runtime changes.

## Classification and outcome schema

Raw Vitest JSON remains at each command's `vitest.json`; `vitest-observed.json` preserves the bytes parsed. `parsed.json` includes the command/process record, `reportError`, `healthErrors`, actual counters, success flag, suite identities, assertion results and unhandled errors. Duplicate JSON keys, unexpected/duplicate files, duplicate selected names, unsupported status/shape, inconsistent total/pass/fail counters and absent reports prevent qualification. Existing malformed-options parameter rows legitimately repeat names outside the selection; these are retained in `repeatedNames`, not mistaken for corrupt evidence. Every selected identity must occur exactly once in the green baseline and in its active mutation/restored run. Selected runs may include inactive filtered tests in the report, but every active test identity must match the exact selection; the whole-file baseline permits no inactive cases.

| Mutation `status` | Meaning |
|---|---|
| `named-assertion-red-review-required` | Exact selected cases all failed, exit was 1, JSON success was false, process closure was confirmed, and every failure carries `AssertionError` plus a stack location at that test's exact intended assertion line. No setup/import/compiler/suite/unhandled error is accepted as this result. Root causal review is still required. |
| `survived` | Exact selected cases all passed with a healthy successful report and exit 0. This remains a survivor even when the restored test also passes. |
| `inconclusive-process-report-or-selection` | Process/runtime/report health or exact active selection could not be established. |
| `inconclusive-exit-or-mixed-results` | Exit/report success is inconsistent, or the selected cases contain a mixture of passes and failures. Actual per-case statuses remain in `observedCases`; passing instances are not hidden as kills. |
| `inconclusive-nonassertion-failure` | A failed case has no usable failure message. |
| `inconclusive-nonassertion-or-unintended-assertion` | A failure lacks `AssertionError` or fails at a different source assertion/setup/teardown location. |
| `not-run` / `incomplete-mutant-run` | Mutation execution or final classification did not complete. See the preserved exception and restoration record. |

The parser is deliberately conservative about the observed Vitest format. A future reporter/stack change may yield inconclusive rather than a useful red classification. Do not edit an old report, relax classification after seeing a survivor, or treat a test title mentioning security as proof. Review the cause, then separately revise the helper and create a new attempt when necessary.

`receipts/summary.json` has `schemaVersion: 1`, explicit source and authoring SHA, repository/clone/output paths, helper/supervisor/tool hashes, runtime/host metadata, source-file hashes, baseline result and `baselineGreen`, mutation rows, command records, `finalSourceClean`, `processClosure`, signal/error, timestamps, retained-artifact statement and explicit omissions. Each mutation row has:

```text
name, path, boundary, originalSha256, mutatedSha256, expectedCases,
status, observedCases, mutantResult, restoration, restored,
restoredResult, restoredRegressionGreen, directory
```

Fields for work not reached are absent or null, not invented. `restoration.json` is the immutable byte-restoration checkpoint; `result.json`, when reached, adds the separate restored regression. The mutation classification and restored-regression outcome are separate fields. The final summary preserves partial rows when an exception prevents `result.json`.

Overall `status` is `source-mutations-awaiting-causal-review` only after all six selected mutations return the provisional named-assertion result, each restoration/regression is confirmed, and final source checks finish. Any completed survivor/inconclusive result gives `not-qualified`. Interrupted/incomplete/closure-unconfirmed attempts remain so, with all prior failures preserved. Exit 0 additionally requires a successfully hashed receipt manifest. **Exit 0 is not a killed-mutant, release or issue-completion verdict.** Manifest errors are preserved in `receipt-manifest.json` and force exit 1 even when source outcomes reached the provisional review state.

## Process, filesystem and credential boundaries

The explicitly supplied supervisor is hash-checked before loading; its exact bytes are preserved. The helper executes that snapshot with a non-main module name and no import-loader bytecode-cache write to the supplied directory. It calls only `supervised()` and the signal handler, never the supervisor's release-gate `main()` or weaker `metadata()` launcher. `RECORD` is redirected to the current new receipt folder. Per-save supervisor checkpoints are exclusive versioned files; existing receipts are not overwritten.

All child commands, including short Git/runtime metadata reads, go through that supervisor. It observes spawned identity, sampled ancestry and owned live-group membership; cleanup renews identity/group observations before signaling owned groups. This is the reviewed supervisor's bounded process ownership protocol, not permission to signal other sessions. No process-name sweep, shared-process kill, VM action or whole-host containment inference is added.

**Unconfirmed closure is fail-stop.** The raw/parsed observation and process record are preserved, but no subsequent process is launched: no restored test, next mutation, final Git command or retry. A source mutation may remain in the private clone while an old process could still use it. Its original byte backup is retained; restoration is explicitly deferred. Child-owned logs/reports may still change; preserved snapshots and manifest hashes are labeled observations, not final immutable child output. Root must inspect those exact owned process identities and the private clone before separately authorizing recovery.

The reviewed supervisor documents residual sampling limits: unobserved daemon reparenting, same-second PID reuse and the final identity-check/signal race. Neither this helper nor that supervisor proves kernel containment. SIGKILL, power loss and hostile same-UID directory replacement are not recoverable/contained guarantees. Unexpected bytes are not silently reset, and no surviving host processes are declared absent merely because the direct child exited.

Child environments are built from an allowlist, not copied from the operator. HOME, temporary directories, XDG directories, npm user/global configuration, cache and pnpm store are private. Provider/vault credentials, AMC control overrides, SSH agents, proxies, user Git settings and `NODE_OPTIONS` are not inherited. Existing tests provision only their own synthetic fixture keys/passphrases and may delete their own fixture directories in teardown. The helper itself does not operate on production keys or issue provider requests.

Environment isolation is **not** an OS/network sandbox. Frozen install and approved dependency lifecycle scripts can access the network and execute as the operator. Source, tools and the hash-pinned supervisor must be trusted and separately reviewed; a matching hash alone does not make arbitrary code safe. Receipt directories can contain synthetic fixture data and should remain private.

Default limits are configuration, not observed durations: each test command 600 seconds, install 1800 seconds, total command-work deadline 14400 seconds. CLI ceilings are respectively 1200, 3600 and 43200 seconds. Metadata commands are bounded by 30 seconds, clone by 300 and checkout by 120, all capped by remaining work time. The reviewed supervisor's owned-process cleanup has its separate bounded allowance; no new test/install is authorized after work expiry. Text/report reads are bounded to 32 MiB and individual streamed manifest/tool hashes to 512 MiB; oversized or unstable files are refused, not truncated into a qualifying receipt.

No output root, clone, store, receipt, failed baseline or surviving mutation is automatically deleted. A rerun must use a new directory. Preserving `tmp/` does not claim that tests retained every fixture: normal test teardown may remove its own temporary workspace; raw reports, patches and process receipts remain preserved.

## Explicit unqualified properties and next owner

These mutations do not independently qualify monitor-key substitution, signed-event hash/signature guards, reference conflicts, full history/chain/seal completeness, cipher primitives or historical key access. Additional reader properties remain unmutated: invalid numeric limits/EOF, terminal escaping, zeroization, legacy handling, unavailable decryption, sibling-reference admission and cross-user authorization. Their presence in the baseline is not independent mutation evidence.

Native erasure all-origins enforcement, signing order/failure, exact audit payloads, retention/backlog behavior, encrypted export/restore, inode/link/private-mode rules, backup/remote copies and regulated subject erasure remain separate boundaries. The shared filesystem is assumed stable under a trusted operator; optimistic plan review is not a lock against concurrent writers.

Codex next owns static source review of this helper, the actual supervisor digest/API, exact anchors and intended assertion failures. Only after separate execution authorization should it select an existing clean pinned input and a new output root, run this finite protocol, inspect raw mutation/restore/closure receipts and write its own causal review. Preserve every refusal and survivor. Do not close AMC-1547, AMC-1522 or any other issue solely from this helper or the author's handoff. Coordinate execution with root's independently running whole-candidate gate; this authoring lane starts no competing execution.
