# P0-31 follow-ups

These are defects and exceptions found while running installed acceptance on the release candidate (RC). The RC is commit `756bd6977dce19f4ef781bdb492c38d6777964f7`, tarball sha256 `21190c7da41e9fc5bf87e168416b34085f223df8cf80425e420557011ebc0340`. None of them is fixed in P0-31 (decision: defects are not fixed in this item).

**Every follow-up below blocks P0-39.** Do not publish 2.0.0 until each one is Done, or until Sid records an explicit exception for it.

Keys P0-53 to P0-55 were already taken. No other branch, spec or commit uses P0-56 to P0-60 (checked with `git log --all --grep` and the specs folder on 2026-10-11).

## P0-56 · Show the credentials-home permission refusal instead of a generic composition error

- **Owner:** an implementing agent (Agent-Doable). **Blocks:** P0-39. **Old issue:** found under AMC-1510/AMC-1532.
- **Defect:** The credentials home can be `AMC_HOME` or the default `~/.config/amc`. When that directory exists with any group or other permission bit (for example mode 0755), `amc agent-loop run` exits 1. Stdout is empty, and the run prints nothing about the real cause.
  - The real cause is `CredentialsFilePermissionsError`, which comes with its own fix. It is thrown at boot in `src/kernel/services/credentialsServices.ts:63`, through `assertOwnerOnly` in `src/credentials/credentialsFilePermissions.ts:56`.
  - That error is lost. The CLI prints only `composition did not provide amcCredentials; the fiber booted but registered no service` (`src/kernel/agentLoopRunner.ts:292-296`).
  - Refusing the run is correct (fail closed). Hiding the reason is the defect.
- **Repro** (installed RC, macOS ARM64, Node 22.22.0):
  ```sh
  H=$(mktemp -d); W=$(mktemp -d); mkdir -p "$H/.config/amc"; chmod 755 "$H/.config/amc"; cd "$W"
  HOME=$H AMC_VAULT_PASSPHRASE=x amc init --trust-boundary isolated
  HOME=$H AMC_VAULT_PASSPHRASE=x amc agent-loop run --json hello; echo "exit $?"   # exit 1, empty stdout
  chmod 700 "$H/.config/amc"; HOME=$H AMC_VAULT_PASSPHRASE=x amc agent-loop run --json hello   # exit 0
  ```
- **Failing command:** `amc agent-loop run --json hello`.
- **Done when:** the run fails with the `CredentialsFilePermissionsError` message and its fix (the path and `chmod 700`) on stderr, and a regression test covers it.

## P0-57 · Name the misplaced control-checkpoint root instead of reporting a residency block

- **Owner:** an implementing agent (Agent-Doable). **Blocks:** P0-39. **Old issue:** found under AMC-1541; the residency gate came from P2-01.
- **Defect:** When the control checkpoint root `~/.amc/control-checkpoints` falls inside the workspace (HOME equals the workspace, or HOME is under it), every native session open is refused. The refusal says `Residency egress blocked: registry_unverifiable (active_policy_unverifiable); destination=unregistered; rules=none`.
  - The real error is `Control checkpoint root … must be outside the governed workspace … Set AMC_CONTROL_CHECKPOINT_DIR` (`src/lifecycle/signedControlJournal.ts:125`).
  - `src/residency/checkEgress.ts:42` swallows that error with `catch { return block(..., "active_policy_unverifiable") }`.
  - This is a configuration error reported under a different classification (security lesson: never swallow an error into a different classification). It also hits a user who runs `amc init` in their home directory.
- **Test fixture part:** `tests/studioNativeTaskService.test.ts:37` puts the operator home inside the workspace. As a result, 8 of its 10 tests fail on `int` at `idle()` with "Native startup did not finish" (also seen in the P0-31 suite-green run).
  - The 13/13 installed Studio browser runs pass because that harness keeps HOME outside the workspace.
  - `tests/studioNativeTaskArchiveNegatives.test.ts` (this item) also keeps HOME outside the workspace.
- **Repro** (installed RC):
  ```sh
  T=$(mktemp -d); chmod 700 "$T"; cd "$T"
  HOME=$T AMC_VAULT_PASSPHRASE=x amc init --trust-boundary isolated
  HOME=$T AMC_VAULT_PASSPHRASE=x amc agent-loop run --json hello   # exit 1: "Residency egress blocked: registry_unverifiable (active_policy_unverifiable) …"
  npx vitest run tests/studioNativeTaskService.test.ts               # 8 failed: "Native startup did not finish"
  ```
- **Done when:**
  - The refusal names the checkpoint root and `AMC_CONTROL_CHECKPOINT_DIR` (still fail closed).
  - The test fixture moves the operator home outside the workspace.
  - `tests/studioNativeTaskService.test.ts` passes.

## P0-58 · Make the JSONL session store support delegation and a second ACP session

- **Owner:** an implementing agent (Agent-Doable); a design decision may be needed. **Blocks:** P0-39. **Old issues:** AMC-1545 and AMC-1532.
- **Defect:** Under `AMC_SESSION_STORE=jsonl`, the workspace writer lock refuses a second session writer in the same process (`src/persistence/jsonl/jsonlWriterLock.ts:81-95`). The lock is an exclusive coordination transaction with `timeout: 0`.
  - An installed `--delegate` run never starts its child. The delegate tool result is `[amc] delegation refused: child threw: Error: session event store is locked by another writer: database is locked`.
  - A second `session/new` on one `amc acp` process fails with `-32603 the method failed`. The stderr diagnostic is `session/new failed: session event store is locked by another writer: database is locked`.
  - Both work on the default SQLite store, on which the AMC-1545 and AMC-1532 rows passed.
- **Repro:** see `cells/*/rows/AMC-1545.json` → `probes.jsonlStore` and `cells/*/rows/AMC-1532.json` → `probes.jsonlSecondAcpSession`. In short:
  ```sh
  AMC_SESSION_STORE=jsonl amc agent-loop run --provider ollama --base-url <scripted local server> --model fixture --tools workspace --delegate --delegate-stop max-turns:1 --json "delegate once"
  ```
- **Failing command:** the run above. The child never runs, so the expected `max-turns:1 ceiling reached` row is absent.
- **Done when:** one of the following is true, with tests:
  - JSONL supports in-process child writers and multiple ACP sessions.
  - Or `--delegate`, ACP and the SDK refuse up front, with a clear message, when the store is JSONL.

## P0-59 · Stop labelling local budget refusals as provider quota

- **Owner:** an implementing agent (Agent-Doable). **Blocks:** P0-39. **Old issues:** AMC-1532 and AMC-1545.
- **Defect:** A refusal by AMC's own native budget is recorded as `request/failure` with `code: "QUOTA"` and `dispatchAttempted: false`. It is shown with the guidance "The provider reported exhausted account quota or balance." (`src/agent/nativeFailureGuidance.ts:9`). No provider was contacted, so the guidance attributes AMC's own decision to the provider. Two cases were observed:
  - The daily request budget is exhausted: `native model request budget exhausted` (AMC-1532 quota turn).
  - Unknown token usage after an aborted child request: `native model token usage is unknown or a prior dispatch remains pending …` (AMC-1545 timeout run). The parent turn then ends `error`.
  - On the SDK and ACP surfaces, the same refusal reaches the client only as `the turn did not complete` / `signed turn N ended error`.
- **Repro:** `cells/*/rows/AMC-1532.json` (quota checks, `ledgerFailure`) and `cells/*/rows/AMC-1545.json` (timeout check, `parentDiagnostics: ["QUOTA"]`).
- **Done when:** local budget refusals use their own code and guidance (for example `BUDGET_REFUSED`, "AMC's signed budget refused this request before dispatch"), and the ACP error data names the budget refusal. Tests cover both.

## P0-60 · Run the Linux confined-shell cancellation on a host that allows Bubblewrap user namespaces

- **Owner:** Sid (needs a security-setting change on a Linux host or VM, which an agent may not make). **Blocks:** P0-39, because the D-12 Linux ARM64 qualified-platform statement needs it. **Old issue:** AMC-1513.
- **Exception:** The Linux ARM64 cells ran in official `node:22-bookworm` and `node:24-bookworm` containers on the colima VM (kernel `6.8.0-117-generic`, Ubuntu 24.04). There, `kernel.apparmor_restrict_unprivileged_userns=1`, so `bwrap --unshare-user` fails with `setting up uid map: Permission denied`.
  - The installed run behaves fail-closed: `bash` is offered, but each call fails before any command runs. The `NATIVE_SHELL_CONFINEMENT` row shows `confined: false` with a failure, and no unconfined fallback runs.
  - So the cancellation of a confined process tree was not exercised on Linux.
  - The other AMC-1513 checks passed on Linux: the write outside the workspace is denied, and the control write inside the scope succeeds.
- **Steps:** on a Linux ARM64 host or VM where Sid approves it, load `deploy/apparmor/bwrap-userns-restrict` per `deploy/apparmor/README.md` and record its sha256. Then run `node qualification/2026-10-11-P0-31/harness/run-rows.mjs --rows 1513 …` against the same tarball under Node 22 and Node 24.
- **Done when:** both Linux cells record `cancel-mid-command-kills-process-tree` passed, with `backend: "bwrap"`, `cancelled: true` and `treeExitProven: true`.

## P0-61 · Kill the surviving AMC-1545 delegation-limit mutants

- **Owner:** an implementing agent (Agent-Doable). **Blocks:** P0-39. **Old issue:** AMC-1545.
- **Defect (test gap on a security guard):** `npm run mutation:batch` on the RC (`mutations.json`) shows two survivors:
  - `1545-narrower-timeout` survived. It replaces `narrower(parent.timeoutMs, grant.timeoutMs)` with `grant.timeoutMs` at `src/agent/subagentRunner.ts:131`. The two covering tests (`tests/subagentHookInheritance.test.ts:105-123` and `tests/nativeDelegationInheritance.test.ts:175-189`) narrow a parent `timeout-ms:60000` against a grant `timeout-ms:30000`, so taking the grant gives the same answer. No test gives a grant that is wider than its parent's timeout.
  - `1545-narrower-parent-only` survived. It drops a parent limit when the grant sets none (`src/agent/subagentRunner.ts:129`). No test sets a limit on one side only.
  - The source is correct today. The tests would not catch a regression that lets a child widen its inherited deadline.
  - `1545-narrower-turns` was killed.
- **Repro:** `node scripts/mutation-batch.mjs --batch qualification/2026-10-11-P0-31/mutations.batch.json --out /tmp/m.json --only 1545-narrower-timeout,1545-narrower-parent-only`. Run it in a clean clone at the RC, under Node 22 (the clone's `better-sqlite3` build).
- **Done when:** tests cover a wider grant timeout, a parent-only limit (turns and timeout) and a grant-only limit, and all three `1545-*` entries are killed.

## P0-62 · Reproduce or rule out the intermittent `amc up --demo` failure on Linux ARM64 Node 24

- **Owner:** an implementing agent (Agent-Doable). **Blocks:** P0-39. **Old issues:** AMC-1536, AMC-1540 and AMC-1541 (Studio lane).
- **Failure:** In the first Linux ARM64 Node 24.21.0 Studio attempt, the harness's `amc up --demo --no-open --no-baseline` (public command 6) exited 1, so no scenario ran. The record is `cells/linux-arm64-node24/studio-attempt1-run-receipt.json`. Its scrubbed command log was not kept, because the first version of `harness/linux-cell.sh` did not copy command logs.
  - The immediate rerun in a fresh container passed 13/13 scenarios with 8/8 cold verifiers. That rerun is the cell's result.
  - Six further `amc up --demo` and `amc down` cycles in a fresh Node 24 container all exited 0.
  - The cause is not known. Candidates are a port race in the harness's free-port pick, or demo readiness under host load (load average was about 15).
- **Repro:** run the Studio lane 20 times on Linux ARM64 Node 24. Use `STEPS=studio bash harness/linux-cell.sh …` with the RC tarball; the current script keeps `studio/logs/command-*.log`.
- **Done when:** a captured failure log is diagnosed and fixed, or 20 consecutive runs pass and this follow-up is closed as not reproduced with that evidence.
