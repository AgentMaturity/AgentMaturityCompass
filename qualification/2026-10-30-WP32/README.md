# WP32 — platform and packaging boundaries on this host

GAP-WP32 ("Qualify platform and packaging boundaries without fallback") qualifies only the lanes this machine can run: macOS 26.6.2 (Darwin 25.6.0) on arm64, Node v22.23.3, a fresh packed install, and the macOS Seatbelt boundary that AMC declares for the native shell on darwin. Every other operating system and architecture is recorded as unavailable on this host, never as passed.

All runs used source commit `3e56038befcf845c23a4db5389bcb802a468ce96` (branch `rtd/gap-wp32`) with a clean tracked tree. The packed artifact is `agent-maturity-compass@1.2.0`, tarball sha256 `26db8f832fd0923e114b887102d6f68c30b6c92b9cc373833eae210e1ee11b2b`. The Node module ABI is 127 (N-API 10). The only installed native addon is `better-sqlite3/build/Release/better_sqlite3.node` (sha256 `1946ab35…d560`), and the installed `amc doctor --json` reports `native-modules` PASS.

`lanes.json` holds these facts and each lane's outcome and reason. `receipt.json` lists the commands and the hash of every file here.

## Outcomes

| Lane | Outcome | Evidence |
|---|---|---|
| Fresh packed install, keyless governed CLI task, cold verification from new processes | passed | `platform/darwin-arm64-node22/` |
| Installed native modules (`amc doctor --json`) | passed | `platform/darwin-arm64-node22/doctor.json` |
| SDK on the packed install (`examples/sdk/quickstart.mjs`) | **failed** (pre-existing) | `packed-install-check.txt` |
| Installed crash and restart (`scripts/installed-crash-recovery-check.mjs`) | **failed** (harness drift) | `lifecycle/installed-crash-receipt.json` |
| Cancellation and restart through the lifecycle helpers (source build) | passed | `lifecycle/lifecycle-tests.json` |
| Seatbelt native shell: escape, path, network and process-tree cases | passed | `platform/darwin-arm64-sandbox/` |
| Linux-only confinement requested on macOS (Bubblewrap executable extensions, native PTY) | refused, nothing launched | `tests/platformHostRefusal.test.ts` |
| Generic write-only Seatbelt backend asked for network, read or process boundaries | passed after a fix in this package | `tests/sandboxConfinement.test.ts` |
| macOS arm64 on Node 24 | not run (WP32 qualifies Node 22 on this host) | none |
| macOS x64, Linux x64 and arm64 (Node 22 and 24, Bubblewrap), Windows x64 (Node 22 and 24) | unavailable on this host | `platform/*/lane.json` |
| Windows native shell | refused by design (until P2-14) | none |

### Packed install and cold verification

`npm run qualify:platform` packed the build with `--ignore-scripts`, installed the tarball with `--omit=dev` into an empty prefix with an empty HOME and its own npm cache, and confirmed that `@amc/core` does not resolve. It then initialised a workspace whose path contains spaces and ran a keyless `agent-loop run --provider stub` turn. `amc session verify` and `amc agent-loop verify` each ran in a new process and verified that turn's evidence against the monitor fingerprint pinned right after init. The runner then removed the installed launcher and confirmed that the command fails, restored it, and verified the same evidence again. All 13 steps passed.

`node scripts/packed-install-check.mjs --tarball <same tarball>` passed every step up to the SDK quickstart: the standalone API, the control catalog, `amc doctor`, composition inspection, the A4 preview gate, and the keyless turn with installed verification. The SDK quickstart then failed. Its governed `fs.write` ran in SIMULATE mode, so the tool status was `completed` but `hello.txt` was not written. The same failure happens on the base commit `660827742` (`tests/sdkQuickstart.test.ts` fails the same way). It comes from the AXR-02 change `1549fabbd` (native tool calls follow the signed Action Policy) and is outside WP32, so it was not changed here.

### Cancellation and restart

`scripts/installed-crash-recovery-check.mjs` stopped at its first native agent start. `amc acp` refused to mount the fixture's MCP tool, because deferred MCP tools need native `tool_search` (READ_ONLY) in the signed allowlist (`d6441c858`). The runner's fixture predates deferred MCP discovery and needs a discovery turn, which this package did not add. Even so, it observed every process it had started exit. Its redacted receipt is kept.

The lifecycle helpers were also run against the source build: `tests/helpers/sessionOwnerProcess.ts` and `ownedNodeGroup.ts`, through `execProcessTree`, `sessionRecovery`, `sessionRecoveryRetry`, `sessionResume`, `sessionOwnership`, `sessionWriterFencing`, `actionJournalReceiptProcesses` and `agentLoopToolPool`. All 58 tests passed. They cover cancelling a process tree, killing a writer and recovering or resuming its session with the original receipts intact, and fencing a live owner. Afterwards, `ps` and `lsof -iTCP -sTCP:LISTEN` showed no process or listener from these runs. The only node listeners on the machine were two processes started on 2026-10-28 and 2026-10-29, before the runs.

### Sandbox and refusal

AMC declares `macos-seatbelt` for the native shell on darwin, so its real-kernel suite ran with `AMC_REQUIRE_REAL_SANDBOX=1`, which stops a test from skipping. All 107 tests passed across 8 files. They include the nine escape cases in `tests/containment/escapeSuite.test.ts`: a write to the operator HOME, a write through a symlink, reads of SSH and authority canaries, direct TCP, the egress proxy's deny, allow and localhost cases, and a process-cap probe that reaps its children.

On this host, AMC refuses every Linux-only backend instead of falling back to running unconfined. Bubblewrap, the only backend for executable extensions, returns `unavailable` with nothing run, and the native PTY refuses before it creates any launcher state. Code Mode's process-confinement measurement reads unconfined.

One fallback defect was found and fixed. The generic Seatbelt backend (`src/sandbox/seatbeltBackend.ts`) confines writes only, yet it ran commands that asked for network deny, a read deny-list, an egress allowlist or a process cap and reported them as confined. It also ignored cancellation. The red run had 5 failing tests. The backend now refuses those requests with nothing launched and stops the command when the caller cancels.

## Reproduce

```sh
export PATH="$(brew --prefix node@22)/bin:$PATH"
npm run build
npm run qualify:platform -- --out <new-dir>/report.json --keep
node scripts/packed-install-check.mjs --tarball <scratch>/agent-maturity-compass-1.2.0.tgz
AMC_REQUIRE_REAL_SANDBOX=1 npx vitest run tests/containment/escapeSuite.test.ts tests/sandboxConfinement.test.ts tests/sandbox/seatbeltNativeProfile.test.ts tests/nativeShellPlatformGate.test.ts tests/nativeShellComposition.test.ts tests/codeModeConfinement.test.ts tests/toolsetConfinementProperty.test.ts tests/platformHostRefusal.test.ts --maxWorkers=2
npx vitest run tests/execProcessTree.test.ts tests/sessionRecovery.test.ts tests/sessionRecoveryRetry.test.ts tests/sessionResume.test.ts tests/sessionOwnership.test.ts tests/sessionWriterFencing.test.ts tests/keys/actionJournalReceiptProcesses.test.ts tests/agentLoopToolPool.test.ts --maxWorkers=2
node scripts/gen-platform-matrix.mjs --receipts qualification/2026-10-30-WP32/platform --commit 3e56038befcf845c23a4db5389bcb802a468ce96
```

`docs/PLATFORM_MATRIX.md` is generated from `platform/` for commit `3e56038be`. Paths under the home directory are written as `~`, scratch paths as `<scratch>` and temporary paths as `<tmp>`.
