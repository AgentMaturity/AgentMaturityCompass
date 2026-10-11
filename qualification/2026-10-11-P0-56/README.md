# P0-56 to P0-62 · Follow-ups from P0-31's installed acceptance

One receipt for the seven follow-ups in `qualification/2026-10-11-P0-31/follow-ups.md`. Each one blocks P0-39.

- Branch `rtd/p0-56-acceptance-followups`, from `int` `3f241d5b6`.
- Runs were local and keyless, not CI:
  - macOS arm64 (this host): Node v25.5.0, the worktree's own install.
  - Linux arm64: colima profile `amc-s7f` (Ubuntu 24.04, kernel 6.8.0-117-generic, 4 vCPU), Docker context `colima-amc-s7f`.

| Key | Result | Commit |
|---|---|---|
| P0-56 | Fixed. The permission refusal is shown, and the run still exits 1. | `5445d3f53` |
| P0-57 | Fixture part only. 7 of the 8 previously failing tests now pass; 1 is still open (below). | `6903189e2` |
| P0-58 | Refusal chosen: JSONL refuses a second session writer up front with `SESSION_STORE_SINGLE_WRITER`. | `94d88a6b9`, `cfb8f87f9` |
| P0-59 | Fixed. The code is `AMC_NATIVE_BUDGET_REFUSED`. ACP error data and SDK carry it, and Studio shows it. | `200e6647d` |
| P0-60 | **Not done, Sid's step.** The cause is confirmed; the VM was not changed. | none |
| P0-61 | Fixed with tests only. All three `1545-*` mutants are killed. | `f4b4a0380` |
| P0-62 | **Reproduced 4 of 20** on the RC, with two causes, both fixed. On the branch, `amc up --demo` passed in all 18 runs. A separate Studio race is still open (below). | `2a8051425`, `1679dc686`, `8b0a56c86`, `9239cb96f`, `c6d754537` |

## P0-56 · credentials-home permission refusal

- **Root cause:** `credentialsServices.apply` registered the inner `CredentialsSeamService` fiber without awaiting it.
  - The `CredentialsFilePermissionsError` thrown at boot stayed on that inner fiber.
  - `agentLoopRunner` then reported only `composition did not provide amcCredentials`.
- **Fix:** the group plugin now awaits the inner fiber, so the group's own `await()` rethrows the permission error.
  - This covers every caller of `runComposedTurn`.
  - The run is still refused (fail closed).
- **Test:** `tests/cliAgentLoopCommands.test.ts`, "names the credentials-home permission refusal…". It checks:
  - the error name, kind, mode `0755` and fix `chmod 700 <home>`
  - that no secret value appears and stdout is empty
  - RED before the fix: `red.txt`.
- **Mutation:** dropping the `await` is killed.
- **Installed-style check:** `p0-56-cli-repro.txt` (this branch's `dist/`, not the RC tarball).
  - mode 0755: exit 1, stdout empty, stderr names the path, its mode and `chmod 700 <path>`
  - mode 0700: exit 0
- **Not changed:** the other service groups (`llmServices`, `promptServices`, `approvalServices`, `agentLoopServices`, …) have the same un-awaited inner fiber. Their constructors do not throw on operator configuration today. Follow-up candidate: `src/kernel/services/*Services.ts`, `apply`.

## P0-57 · fixture part (test-only)

- **Change:** `tests/studioNativeTaskService.test.ts` now gives the operator home (which is also `HOME`, so `~/.amc/control-checkpoints`) its own temp directory outside the workspace.
- **Not touched:** `src/residency/*`, `signedControlJournal.ts` and `assertStorageAdmission` (Codex owns the source fix).
- **Before:** 8 failed, 2 passed, all 8 with "Native startup did not finish".
- **After:** 9 of the original 10 pass (10 of 11 with P0-59's new test).
- **Passing now (7 of the 8):**
  - owner/selected-agent/demo and stale submission boundaries
  - stale non-owning observer recovery
  - JSONL managed task cold inspection
  - archive frees a current-history slot
  - archive refuses active, foreign, stale, unsealed and uncertain tasks
  - archive authenticates evidence again
  - physical workspace alias
- **Still failing (1):** "real stub turns are committed once, survive release/restart/resume and cold verify", at `tests/studioNativeTaskService.test.ts:129`.
  - After `release`, `verify` returns `Cold native verification refused this evidence…` (`src/studio/nativeTaskVerdict.ts:37`, `integrityOk: false`). The test expects `UNTRUSTED: …`.
  - The verifier's reason is `Session … is not closed and sealed; a verified prefix needs a finalized target`.
  - That rule came with P0-14 (`8c4bc10ec`, 2026-10-11). The test's `UNTRUSTED` expectation came from P0-51 (`ab600164d`, 2026-10-07).
  - The line was never reached while the fixture failed at `idle()`.
  - Not fixed here, because the fix is a source decision, not a fixture change. The question to decide: should a released, intact, unsealed session read as "refused this evidence"?
- **Mutation:** moving the home back inside the workspace is the baseline itself (8 failed).

## P0-58 · JSONL second session writer: refused, typed

**Choice: refuse.** The spec allows either of its two options. JSONL declares `capabilities.concurrentWriters: false`, and its chain head (`headHash`, `knownEventIds`) is per-writer state. Two in-process writers would fork the chain. Supporting them would mean redesigning the store, not fixing a defect.

- **New in `src/persistence/openSessionEventStore.ts`:**
  - `SessionStoreSingleWriterError` with `code: "SESSION_STORE_SINGLE_WRITER"`
  - `assertSecondSessionWriter(workspace, needs)`
- **Where it refuses, before anything is opened:**
  - `runComposedTurn` with in-process delegation (CLI `--delegate`). A foreign runner opens no AMC writer and still works.
  - ACP `session/new`, `session/load` and `session/fork` while another session is open, loading or awaiting cleanup on the connection. ACP returns `-32602` with `data.reason: "SESSION_STORE_SINGLE_WRITER"`; it used to return `-32603`.
  - The SDK raises it as `AMCNativeRefusedError` with that data unchanged.
- **Tests:**
  - `tests/kernelDelegationGrant.test.ts`: the refusal, no grant, no store pinned, and the foreign runner still admitted.
  - `tests/acpAgentServer.test.ts`: the typed refusal on JSONL, and SQLite still opening two sessions.
- **Mutations:** removing either guard is killed.
- **Installed-style checks** (`p0-58-installed-checks.txt`):
  - CLI `--delegate` on JSONL: exit 1 with the typed message, and no store marker written.
  - The same workspace on SQLite: exit 0.
  - SDK `newSession()` twice on JSONL: the second raises `AMCNativeRefusedError -32602 {reason: SESSION_STORE_SINGLE_WRITER}`.
- **Docs:** `docs/SESSION_EVENT_HISTORY.md`.
- **Not covered:** two Studio native tasks on one JSONL workspace run in separate processes. They still hit the cross-process lock with the generic message.

## P0-59 · AMC budget refusals are not provider quota

- **Root cause:** `src/llm/adapter/llmRuntime.ts:344` recorded every non-integrity `reserveNativeModelBudget` refusal as `QUOTA`.
- **Fix:** it is now the existing `AMC_NATIVE_BUDGET_REFUSED` code, whose existing guidance reads "Signed native budget admission refused this dispatch."
- **Each surface:**
  - **CLI:** run summary and `amc session show` diagnostics project the new code from the signed row.
  - **SDK and ACP:** `AgentPromptResult` (failed) carries `failureCodes` for the failed turn. The ACP `the turn did not complete` error data includes `failureCodes`, and the SDK passes it through in `AMCNativeRefusedError.data`.
  - **Studio:** a turn whose error data names the budget refusal shows that guidance and "No provider request was sent for it", instead of "did not complete cleanly".
- **Not changed:** rows recorded before this keep `QUOTA`, because signed rows are not rewritten.
- **Tests:**
  - `tests/nativeBudgets.test.ts`: request budget and unknown-token-usage cases, row code, `dispatchAttempted: false`, live and projected guidance.
  - `tests/agentSessionMultiTurn.test.ts`: `failureCodes` on the failed prompt.
  - `tests/acpAgentServer.test.ts`: the error data.
  - `tests/studioNativeTaskService.test.ts`: the Studio message, through `dist/`.
- **Mutation:** restoring `QUOTA` is killed.
- **Docs:** `docs/security/THREAT_MODEL.md`.

## P0-60 · Linux confined-shell cancellation (not done; Sid)

Read-only check inside the VM (`colima ssh --profile amc-s7f -- sysctl …`), 2026-10-11:

```
kernel.apparmor_restrict_unprivileged_userns = 1
kernel.unprivileged_userns_clone = 1
user.max_user_namespaces = 23465
```

- **Cause:** the Ubuntu AppArmor restriction. Unprivileged user namespaces are otherwise enabled.
- **No VM change was made.** Relaxing a kernel security setting is a security-setting change, even in the VM. This agent may not make it, and the follow-up spec names Sid as owner. The AMC-1513 rows were therefore not rerun; rerunning without the change would only re-record the known fail-closed exception.
- **What Sid would run, VM only and not persistent across a VM restart:**

```sh
colima ssh --profile amc-s7f -- sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0   # revert: =1
# then, from a branch build packed with: npm pack --ignore-scripts --pack-destination <stage>
docker --context colima-amc-s7f run --rm -e STEPS=rows -v <stage>:/stage:ro -v <out>:/out node@sha256:<22|24 digest from P0-31> bash /stage/harness/linux-cell.sh <commit> <tgz sha256> <cli sha256>
```

- **Scope of the rerun:** the `rows` step runs every row. Pass `--rows 1513` to `run-rows.mjs` for the one row.
- **Done when (from the spec):** each cell records `cancel-mid-command-kills-process-tree` with `backend: "bwrap"`, `cancelled: true` and `treeExitProven: true`.
- **Narrower alternative:** the pinned per-binary profile `deploy/apparmor/bwrap-userns-restrict` (sha256 `11d39094…f9`). It attaches to the VM's `/usr/bin/bwrap`, and whether it reaches `bwrap` inside a Docker container is not established.

## P0-61 · AMC-1545 delegation-limit mutants

- **Tests:** four cases in `tests/subagentHookInheritance.test.ts` ("descendant limits narrow …"). The source is unchanged.
  - a grant timeout wider than the parent's
  - parent-only turns and timeout
  - grant-only turns and timeout
  - parent-only turns with a grant-only timeout
- **Rerun:** `npm run mutation:batch -- --batch p0-61-mutations.batch.json --out p0-61-mutations.json`. The batch is P0-30's format, and its three entries have the same content as P0-31's.
- **Result:** at `f4b4a0380`, darwin arm64, Node v25.5.0, baseline green, `3 killed, 0 survived`. See `p0-61-mutations.json` and `p0-61-mutation-batch.log`.
- **Note:** P0-31 ran it under Node 22 in a clean clone; this run used the worktree's install under Node 25.

## P0-62 · intermittent `amc up --demo` (Linux arm64, Node 24): reproduced and fixed

- **Setup:**
  - Image: `node:24-bookworm@sha256:3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0` (the P0-31 digest), Node v24.21.0.
  - Baked once into a local image `amc-p062-studio:arm64` with the lane's `bubblewrap`, `python3-venv`, Playwright 1.62.1 and Chromium, so 20 runs did not download them 20 times.
  - Each run starts a **fresh container** and executes `linux-cell.sh`'s `studio` step command, unchanged (`harness/p0-62-studio-once.sh`).
  - Tarball and source are mounted read-only.
  - The once-script also keeps the scrubbed command logs and the demo daemon's `studio.log`.

**RC, 20 runs** (`p0-62-rc-runs.json`; tarball `21190c7d…0340`, RC `756bd697`): 16 passed (13/13 scenarios and the cold verifiers each), 4 failed. All four failed at public command 6, `amc up --demo`, with `Studio daemon failed to start in time. Check amc logs.` VM load before each run was 1.4–2.2.

| Run | Demo daemon log | `amc down` right after | Cause |
|---|---|---|---|
| 04 | empty | `Sent SIGTERM to studio pid 148` | the daemon was still booting at 6 s, then came up |
| 10 | empty | `Sent SIGTERM to studio pid 148` | same |
| 19 | empty | `Studio is not running.` | still booting at `down` too (no state yet, no error logged) |
| 14 | `listen EADDRINUSE: address already in use 127.0.0.1:44467` | `Studio is not running.` | the demo API port the harness picked was taken |

**Cause 1: the fixed 6 s wait** (runs 04, 10, 19).

- `startStudioDaemon` (`src/studio/studioSupervisor.ts`) polled a fixed 6 s for the daemon's state file.
- Before writing that file, the daemon loads the CLI, prepares the demo host and starts its server.
- Unloaded, 8 cycles per tarball took 2.6–3.5 s on the RC and 2.6–5.8 s on the branch (`p0-62-updemo-timing.txt`). In the lane, the owner Studio runs at the same time.
- So the margin is thin, and the CLI exits 1 while the daemon is still starting.
- **Fixed in `2a8051425`:**
  - A daemon that exits is reported at once, with its exit code and its log path.
  - A live daemon gets 60 s.
  - Tests are in `tests/upDemoMode.test.ts`. Both mutations are killed: `if (false)` on the exit check, and a 6 s bound.

**Cause 2: the harness port pick** (run 14).

- `scripts/installed-studio-browser-check.py` picked ports with `bind(0)`, which draws from the ephemeral range that outbound connections also use. It closed each probe socket at once, and picked the owner's and the demo's 7 ports in two separate calls.
- A picked port could therefore be taken before the daemon bound it, or overlap the owner's.
- **Fixed in `1679dc686` and `9239cb96f`:**
  - All 14 are picked in one call, each socket held until the last is chosen.
  - Picks are drawn from 20000–31999, below the Linux (32768+) and macOS (49152+) ephemeral ranges.
  - Self-check: 50 × 14 distinct ports in range.
- **Also fixed in `8b0a56c86`:** the harness cleanup crashed on `pid None` when `up` failed before the state file existed (all four failures recorded `'NoneType' object cannot be interpreted as an integer`).
- **Still open:** a non-ephemeral port bound by another local process between the pick and the bind.

**Branch reruns: `amc up --demo` passed in all 18.** Each lane used this branch's tarball (`cfb8f87f9`, sha256 `b6a15334…de5c`) and this branch's harness (`9239cb96f`).

| Set | Runs | `amc up --demo` | Lane result |
|---|---|---|---|
| `p0-62-branch-runs.json`, sequential; host load up to ~15 from other host processes | 9 (a 10th was cut off when the loop was stopped to diagnose; not counted) | 9/9 exit 0 | 6 pass, 3 fail at a browser scenario |
| `p0-62-ab-runs.json`, interleaved with `int` (`3f241d5b6`, its own old harness); host load 5–8 | 6 + 6 | branch 6/6, int 6/6 | all 12 pass (13/13) |
| `p0-62-ab-stress-runs.json`, interleaved under VM CPU stress (4 busy loops) | 3 + 3 | branch 3/3, **int 1/3** (2 × "failed to start in time") | branch 1 pass and 2 browser fails; int 1 pass |

**New finding, not fixed: a Studio turn-completion race.** Every branch browser failure has the same shape: after a turn, `#nativeTaskState` shows `Evidence unavailable` instead of `Ready for another turn`.

- **How it was traced:** an instrumented copy of the branch tarball logged the refresh error (`p0-62-studio-projection-diag.txt`). The only error in the failing run was `SessionHistoryRefused: CHANGED: History or trust changed during loading` from `readNativeTaskProjection`.
- **Where:** `src/studio/nativeTaskService.ts:390-393` (the same code on `int`, lines 385-388).
  - After `await turn.result`, Studio makes ONE authenticated read.
  - The workspace store can still be taking appends at that moment, so the read is refused as `CHANGED`.
  - The work then throws `No new authenticated turn ending`, and the task becomes `failed`.
  - The page stops polling a task that is no longer running, so it shows the last `unavailable` history.
- **Why it shows up now:** under load the RC and `int` usually fail earlier, at `amc up --demo` (int 2/3 under stress). With that fixed, the lane reaches this race.
- **Why it is not fixed here:** it is outside P0-62's `up --demo` defect and needs its own test.
- **Suggested fix:** retry the read briefly on `CHANGED` before judging the turn, or leave the task to the next poll.
- This keeps the "20 consecutive Studio lanes pass" form of P0-62's Done-when unmet. The `amc up --demo` defect itself is diagnosed and fixed.

## Checks

Full output: `checks.txt`. Final run at `c6d754537` (code unchanged since, apart from this receipt).

- **All exit 0:**
  - `build`, `typecheck`, `typecheck:tests` and `lint` (lint includes check-no-fabrication)
  - `check:counts`, `docs-drift`, `freeze`, `architecture-boundaries`, `gates`, `schemas`, `api-ref`, `threat-model`
  - `check:duplicates` (new 0) and `check:dead-code` (new 0, after `cfb8f87f9` removed one unused export)
- **`check:qualification`:** valid, 15 receipts, once this `receipt.json` existed.
- **D-15:** `node $SP/needs-snapshot.mjs int` prints `none`.
- **Tests:** `npx vitest run` on 75 files (every changed test file, plus every test file naming a changed module).
  - Totals: 1021 tests, 991 passed, 19 failed, 11 skipped.
  - All 19 failures are in `tests/jsonlWriterResume.test.ts` (`Residency egress blocked: registry_unverifiable`). They are the same 19 that fail in P0-31's full suite on `int`, the residency source fix that is not this item's.
  - The 11 skipped are `tests/studioNativeTaskService.test.ts`: under the 75-file parallel load, its `beforeAll` (importing `dist/`) timed out at 10 s. Run alone: 10 passed, 1 failed (the open P0-57 test).
