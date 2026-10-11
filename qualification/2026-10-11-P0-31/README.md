# P0-31 · Close-out B: installed acceptance on the release candidate

This receipt records installed acceptance of one release-candidate tarball. It covers the 14 old in-flight issues, on the two D-12 qualified platforms (macOS ARM64 and Linux ARM64) under Node 22 and Node 24. Every result below applies to that exact tarball and to nothing else.

Runs were local only, keyless, and not CI. Windows and Linux AMD64 are not qualified (D-12) and were not run.

## Release candidate

| Field | Value |
|---|---|
| RC commit | `756bd6977dce19f4ef781bdb492c38d6777964f7` (branch `rtd/p0-31b-installed-acceptance`, from `int` `a125fbc78` with P0-34's release surface) |
| Tarball | `agent-maturity-compass-1.2.0.tgz`, sha256 `21190c7da41e9fc5bf87e168416b34085f223df8cf80425e420557011ebc0340`, 4,548 entries |
| Installed `dist/cli.js` | sha256 `8b9ec22158bcb23a0f0123e1b12abfce1d9cd1675ba9c9f3aad6b54019ac9165` |
| Built from | a fresh `git clone --no-local` at the RC (own git objects, no alternates), `pnpm install --frozen-lockfile && pnpm run build` under Node 22.22.0 |
| Packed with | `npm pack --ignore-scripts`. npm 10.9.4 (Node 22) and npm 11.19.0 (Node 24) produced the same bytes. |

- The release is 2.0.0 (D-12), but the package is not versioned yet. The tarball therefore still says 1.2.0.
- Commits after the RC on this branch add only `qualification/2026-10-11-P0-31/`. That folder is not in the package `files`, so the tarball does not change. The final check is in `receipt.json`.
- The Linux `qualify:platform` lane packs its own root, so it ran on a repack of the extracted RC. That repack has a different gzip stream but a byte-identical tar; see `rc-tar-identity.txt`. Every other lane installed the RC tarball itself and checked its sha256.

## Cells

| Cell | Environment |
|---|---|
| macos-arm64-node22 | This host: macOS 26.6.2 arm64, Homebrew `node@22` 22.22.0 first on PATH (`cells/macos-arm64-node22/environment.json`) |
| macos-arm64-node24 | This host, Homebrew `node@24` 24.21.0 (installed for this item, keg-only) |
| linux-arm64-node22 | `node:22-bookworm@sha256:0e5f906573693feaa1e21057ebdcfdb5bd5021f050b2dc7c9deceb629c7da2a8` (Node 22.23.3), on colima `amc-s7f` (aarch64, Ubuntu kernel 6.8.0-117), Docker default security options |
| linux-arm64-node24 | `node:24-bookworm@sha256:3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0` (Node 24.21.0), same VM |

- The Linux cells got the tarball, a git bundle of the RC and `harness/` through a read-only mount. The repository was never the install source.
- Inside the container, `bubblewrap` 0.8.0 and `python3-venv` came from Debian. Playwright 1.62.1 and Chromium 151.0.7922.34 for linux-arm64 came from `npx playwright install --with-deps chromium`.
- Raw workspaces, keys and logs stayed in the container and were discarded. Only the summaries are here.

## Outcome matrix

`outcomes.json` has one line per old issue and cell. The short form:

| Row | macOS 22 | macOS 24 | Linux 22 | Linux 24 |
|---|---|---|---|---|
| AMC-1510 packed install + platform | pass | pass | pass | pass |
| AMC-1511 crash after side effect | pass | pass | pass | pass |
| AMC-1513 confinement + cancellation | pass | pass | exception P0-60 | exception P0-60 |
| AMC-1515 stdio MCP | pass | pass | pass | pass |
| AMC-1535 HTTP MCP | pass | pass | pass | pass |
| AMC-1532 CLI / SDK / ACP parity | pass (P0-58, P0-59) | pass (P0-58, P0-59) | pass (P0-58, P0-59) | pass (P0-58, P0-59) |
| AMC-1533 extensions | pass | pass | pass | pass |
| AMC-1536, 1540, 1541 Studio 13 scenarios | 13/13 | 13/13 | 13/13 | 13/13 (2nd attempt, P0-62) |
| AMC-1538 Python installed wheel | 21 pass | 21 pass (same run) | 21 pass | 21 pass |
| AMC-1545 delegation limits | fail P0-61 | fail P0-61 | fail P0-61 | fail P0-61 |
| AMC-1520 DSH launch pin | pass | pass | pass | pass |
| AMC-1523 Pi v3 import text | pass | pass | pass | pass |

- **AMC-1545:** the installed delegated runs pass in every cell. The row fails because two of its three guard mutations survive (P0-61).
- **AMC-1511:** the crash run passes in every cell, with exactly one side effect, no replay and cold verification. `efb4b638` is **handed to P2-12**, not promoted: 6 of its 9 guard mutations were killed. The survivors are:
  - `1511-turn-end-format` (`sessionContinuationControls.ts:40`)
  - `1511-resume-runtime` (`sessionResume.ts:207`)
  - `1511-resume-history-moved` (`sessionResume.ts:204`)

  See `mutations.json`.

## How each row was run

The committed harnesses ran unchanged, except that their Node pattern now admits 22 or 24:

- `check:packed-install` ran with `--tarball` the RC.
- `qualify:platform`
- `installed-crash-recovery-check.mjs` ran with the RC, the CLI hash and the fresh clone as `--source-tree`.
- `installed-studio-browser-check.py` used the fresh clone, the pinned node, npm and Chromium hashes, and Playwright as `--dependency-root`.
- The other rows have no committed harness. `harness/run-rows.mjs` drives them with the installed CLI, the installed `agent-maturity-compass/sdk/native` export and the loopback fixtures in `harness/fixtures.mjs`.
  - Some rows use the stub provider.
  - Others use a scripted Ollama-protocol server, so a turn can make a chosen tool call. It is a local fixture, not a model.
- The Python lane is `harness/python-lane.sh`. The Linux wrapper is `harness/linux-cell.sh`.

Notes on individual rows:

- **AMC-1513 (Linux exception):** the VM sets `kernel.apparmor_restrict_unprivileged_userns=1`, so `bwrap --unshare-user` fails with "setting up uid map: Permission denied".
  - The installed run still offers `bash`. Every call fails closed: `confined: false`, failure "Bubblewrap did not provide a complete command-exit receipt", no command process observed, no unconfined fallback.
  - Loading `deploy/apparmor/bwrap-userns-restrict` into a VM is a host security change that is Sid's to make (P0-60).
  - The rest of the row passed on Linux: the write outside the workspace is denied, and the control write inside scope succeeds.
- **AMC-1515/1535:** the native seam requests EXECUTE only (`src/agent/pipelineToolSeam.ts:98,156`), so no installed surface reaches a SIMULATE MCP call.
  - A `simulate` decision on a native request counts 0 toward an EXECUTE quorum, and the waiting turn keeps waiting.
  - The installed check therefore shows that schema validation refuses before any remote call. The SIMULATE ordering stays covered in-process by `tests/reconciliationDefectsMcp*.test.ts`.
- **AMC-1532:** surfaces ran on the default SQLite store, one session per turn (the stub calls a tool only in a fresh history).
  - The SDK result is always state `completed`; the ending is the ACP `stopReason`.
  - The JSONL second-session failure is recorded as a probe (P0-58).
- **AMC-1545:** these runs used the default store.
  - `max-turns:1` records "max-turns:1 ceiling reached".
  - `timeout-ms:1500` records "timeout-ms:1500 lifetime expired". The parent's next request is then refused by the unknown-token-usage budget rule, labelled QUOTA (P0-59).
  - Under JSONL the child never starts (P0-58).
- **AMC-1520:**
  - The spawn-site re-hash was already on `int`: `fe2ac21f` added it and `03e73617` records and seals the refusal. `tests/dshRunnerReverify.test.ts` is the spec's `dshLaunchSpawnRecheck` test; it covers both the replaced-file and the unchanged cases. Removing the call is killed by it (`1520-spawn-recheck`).
  - This item adds the exec-by-path note to `docs/adapters/deepseek-harness.md`.
  - The installed check exercises the launch pin from outside: the approved run spawns, and an edited entrypoint is refused before spawn. The window between preparation and spawn is not reachable from outside the process.
- **Studio (AMC-1536/1540/1541):**
  - Linux Node 22's first attempt never started, because of a Chromium path bug in the first `linux-cell.sh` (exit 2, argparse).
  - Linux Node 24's first attempt failed at `amc up --demo` (exit 1), with no log kept (P0-62).
  - Both cells' results are the reruns in fresh containers.
- **AMC-1538:**
  - The wheel was built from `sdk/python` at the RC.
  - It was installed with `--no-index` into a fresh venv.
  - The tests ran with `AMC_PYTHON_INSTALLED` set to that venv's interpreter.
  - PyPI supplied only `setuptools`/`wheel` (the declared build requirement) and `pytest` (the declared dev extra); versions are in `cells/*/python-lane.txt`.
  - The lane does not use Node. One macOS run covers both macOS cells; on Linux it ran in both containers.
  - The optional native-fixture test is skipped by design (fixtures not supplied); it is not counted as a pass.

## Archive handler review (AMC-1541)

**Router** (`src/api/nativeTasksRouter.ts:113-149`):

- Archive is only `POST /api/v1/native-tasks/<taskId>/archive`. The query allows `agentId` only, and the body is the strict control schema (`expectedRevision`).
- The actor comes from the authenticated Studio context (`actorFor`); a body can never name the principal.
- Native mutation admission (intent header, same origin, CSRF proof for cookie sessions; `src/studio/nativeAdmission.ts:98-107`) applies before the route.
- Service refusals keep their own status codes (`sendFailure`).

**Service** (`src/studio/nativeTaskService.ts:528-554`):

- The owner check runs twice, before and inside the descriptor lock. A foreign principal or agent gets 404 `NATIVE_TASK_NOT_FOUND`, so it learns nothing about the task. A demo actor sees only demo stub tasks.
- The revision is checked inside the lock (409 `NATIVE_STALE_REVISION`).
- Live work is refused (409 `NATIVE_ARCHIVE_BUSY`), and so is an unresolved submission (409 `NATIVE_ARCHIVE_UNCERTAIN`).
- The evidence is authenticated again. The closed state comes from the authenticated projection, not the descriptor flag (409 `NATIVE_ARCHIVE_NOT_CLOSED`).
- Lease revocation happens before archival, and a failed revocation archives nothing. Re-archiving is byte-idempotent.
- Archived tasks refuse a turn and a resume with 409 `NATIVE_TASK_ARCHIVED`.

**Tests:** the three negatives are `tests/studioNativeTaskArchiveNegatives.test.ts` (new, 3/3). Its four dist guard mutations are all killed (`mutations-dist.json`).

- The older `tests/studioNativeTaskService.test.ts` covers the same refusals at service level ("archive refuses active, foreign, stale, unsealed and uncertain tasks…", "archive frees a current-history slot…").
- That file currently fails on `int` because its fixture puts HOME inside the workspace (P0-57).

**Observation, not opened:** archive, like cancel and release, is not gated by `executionAllowed()`. With invalid workspace signatures (read-only mode), archive still re-signs the descriptor with the auditor key. Archive only narrows authority, so this is left for Sid to judge.

## `a5987643` receipts

None is attributed. `a5987643` is an ancestor of the RC, but `git log a5987643..<RC>` is not empty for the exercised paths:

- 72 commits touch the Studio scenario paths: `src/studio`, `nativeTasksRouter.ts`, the console native-task assets and the browser harness.
- 21 commits touch `src/sandbox` and `agentToolset.ts`.

Those receipts also live only in the untracked `AMC_OS/` and cannot be cited. Every scenario was rerun on the RC instead.

## Mutations

- **`mutations.json` (`npm run mutation:batch`):** P0-30's runner on a clean clone at the RC under Node 22. Result: 9 killed, 5 survived, with the baselines green.
  - Killed: 5 of the 8 `1511-*` entries; `1545-narrower-turns`; `1520-spawn-recheck`; the two Node-pattern entries for this item's harness change.
  - Survived: three `1511-*` entries (handed to P2-12), plus `1545-narrower-timeout` and `1545-narrower-parent-only` (P0-61).
- **`mutations-dist.json`:** the archive guards and `reconcileClosedClient` are exercised only through `dist/` by their tests, so they were mutated in `dist/` by hand, then restored byte for byte. 5 of 5 were killed.
- **`node-versions-red.txt`:** the failing run of `tests/qualificationNodeVersions.test.ts` before the pattern change (4 failures: v24 refused).

## Spec drift

- **macOS shell:** the spec expects macOS to refuse the shell (P0-06). P1-05 later confined it with Seatbelt (`68b1b237`), and the installed runs show `backend: seatbelt, confined: true`. So the AMC-1513 cancellation row ran on macOS too.
- **AMC-1520:** the spawn-site call was already landed (see above), so `src/adapters/adapterRunner.ts` is unchanged.
- **`tests/studioNativeTaskService.test.ts`:** 8 of its 10 tests fail on `int` (P0-57). The new archive-negatives file keeps HOME outside the workspace instead.

## Observations not opened as follow-ups

- **CLI hint:** a native approval decided with `amc approvals approve --mode simulate` exits 0 but counts 0 toward the EXECUTE quorum. The turn keeps waiting until the request expires. The CLI hint does say to approve with `--mode execute`.
- **Host change:** `brew install node@24` upgraded `simdjson` 4.2.4 to 5.0.3. That broke the existing `node` (25.5.0) and `node@22` (22.22.0), which load `libsimdjson.29.dylib`.
  - The fix used here was a symlink: `/opt/homebrew/Cellar/simdjson/5.0.3/lib/libsimdjson.29.dylib` → `../../4.2.4/lib/libsimdjson.29.0.0.dylib`. It brought both back unchanged.
  - `brew cleanup` would remove 4.2.4 and break them again.
  - The lasting fix (`brew upgrade node@22`, and a decision on the default node, whose formula is now 26.x) is Sid's.

## Reproduce

```sh
git clone --no-local <repo> rc && cd rc && git checkout 756bd6977dce19f4ef781bdb492c38d6777964f7
pnpm install --frozen-lockfile && pnpm run build && npm pack --ignore-scripts --pack-destination /tmp/rc
# per macOS cell (PATH=$(brew --prefix node@22)/bin:$PATH, then node@24):
node scripts/packed-install-check.mjs --tarball /tmp/rc/agent-maturity-compass-1.2.0.tgz
npm run qualify:platform -- --out <new dir>/report.json
node scripts/installed-crash-recovery-check.mjs --artifact <tgz> --artifact-sha256 21190c7d… --cli-sha256 8b9ec221… --source 756bd697… --source-tree <clone> --out <new dir>
python3 scripts/installed-studio-browser-check.py …   # flags as in harness/linux-cell.sh
node qualification/2026-10-11-P0-31/harness/run-rows.mjs --tarball <tgz> --tarball-sha256 21190c7d… --cli-sha256 8b9ec221… --out <new dir>
bash qualification/2026-10-11-P0-31/harness/python-lane.sh <clone> <new dir> python3
# Linux cells: docker run --rm -v <stage>:/stage:ro -v <out>:/out node@sha256:<digest> bash /stage/harness/linux-cell.sh <rc> <tgz sha> <cli sha> python
```

Follow-ups, each blocking P0-39, are in `follow-ups.md`: P0-56, P0-57, P0-58, P0-59, P0-60 (Sid), P0-61 and P0-62.
