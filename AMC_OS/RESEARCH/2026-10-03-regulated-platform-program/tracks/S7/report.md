# Track S7 — worker report (backfilled by the root session from the structured return; the harness refused the subagent's .md write)

- Status (self-report): **PARTIAL**
- Branch: `worktree-wf_5210e2f4-3ea-7`; HEAD before `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da` → after `f4147ddf06bf67f91958f24fab2bc3f959ec0e3a`
- Environment: Darwin arm64, Node v25.5.0, pnpm 10.33.0, vitest 4.1.11, Python 3.14.7 + pytest 8.4.2 (Homebrew), worktree at base 8f57ce63, 2026-10-03. Source qualification only.
- Receipt path (as reported): /Users/sid/AgentMaturityCompass/.claude/worktrees/wf_5210e2f4-3ea-7/AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S7/result.json

## Commits
- 853fa3b3 test: cover bwrap status receipt parser and socket deny filter (AMC-1513)
- ca57d961 test: pin import gate, lower-declaration clamp and neutral evidence projection (AMC-1516)
- 8171078b test: mutation-pin callback attribute allowlist; docs: state untracked conformance receipt (AMC-1517)
- b8e1b35e test: cover secret-bearing manifest and fixture-tamper refusals (AMC-1518)
- 0bcae3c1 test: cover close-before-verify and trust-anchor guards in native SDK (AMC-1519)
- 16bfd6f8 docs: replace stale unexecuted markers with what ran at 8f57ce63 (AMC-1519)
- 8a86bc23 fix: state path-exec boundary of the DSH launch pin in its capture receipt (AMC-1520)
- 8bbf445b fix: render import format name, record counts and reviewed next actions in text mode (AMC-1523)
- b0c523bd test: pin typecheck-tests step identity in release gate and workflows (AMC-1521)
- 80d35a87 test: document MCP discarded-result and simulate-before-validate defects as expected failures (AMC-1515)
- d4d62bce test: use a valid neutral import category in the export fixture (AMC-1516)
- f4147ddf docs: add S7 receipt (results, mutation log, ready-to-wire diffs) and point docs at it

## Files changed
- `docs/NATIVE_SDK.md`
- `docs/PI_CALLBACK_TELEMETRY.md`
- `sdk/python/tests/test_validation.py`
- `sdk/python/tests/test_validation_installed.py`
- `src/adapters/deepseekHarnessLaunch.ts`
- `src/cli-import-commands.ts`
- `tests/bwrapBackendPure.test.ts`
- `tests/callbackTelemetryCapture.test.ts`
- `tests/cliImportCommands.test.ts`
- `tests/deepseekHarnessLaunch.test.ts`
- `tests/externalEvidenceExport.test.ts`
- `tests/externalEvidenceProfile.test.ts`
- `tests/harnessComparison.test.ts`
- `tests/nativeAgentClientVerify.test.ts`
- `tests/reconciliationDefectsMcp.test.ts`
- `tests/reconciliationDefectsReleaseGate.test.ts`
- `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S7/result.json`
- `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S7/mutations.log`
- `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S7/mcp-ready-to-wire.diff`
- `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S7/dsh-runner-ready-to-wire.diff`

## Commands run
- `pnpm vitest run tests/bwrapBackendPure.test.ts tests/externalEvidenceProfile.test.ts tests/externalEvidenceExport.test.ts tests/callbackTelemetryCapture.test.ts tests/harnessComparison.test.ts tests/nativeAgentClientVerify.test.ts tests/deepseekHarnessLaunch.test.ts tests/cliImportCommands.test.ts tests/reconciliationDefectsMcp.test.ts tests/reconciliationDefectsReleaseGate.test.ts` → Test Files 10 passed (10); Tests 105 passed | 2 expected fail (107); exit 0. The 2 expected failures are test.fails cases that document the blocked AMC-1515 defects.
- `pnpm vitest run tests/nativePinnedToolSchemas.test.ts` → 11 passed (2026-09-10 schema-admission regressions; source only)
- `pnpm vitest run tests/acpFailedTurnUpdates.test.ts` → 11 passed (2026-09-10 failure-boundary regressions; source only)
- `cd sdk/python && PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=. python3 -m pytest -p no:cacheprovider -q tests/test_validation.py` → 175 passed, 1 warning
- `cd sdk/python && PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=. python3 -m pytest -p no:cacheprovider -q tests/test_validation_installed.py` → 21 failed, 1 skipped. Every failure is ModuleNotFoundError amc_sdk: the file refuses checkout imports and needs an installed wheel, and installing is out of scope. Skip reason: native signed fixtures not supplied. Not an acceptance. Only this file's docstring was touched.
- `(scratch Pi v3 fixture) node_modules/.bin/tsx src/cli.ts import '../pi session.jsonl' --dry-run` → Printed 'format pi-session v3 (jsonl)', 'Records: 5 (3 mapped, 2 retained only, 0 malformed, 0 unsupported)' and 3 structured Next: lines, including the shell-quoted --expected-digest apply argv
- `(scratchpad/s7/patchcheck copy, mcp-ready-to-wire.diff applied) vitest run tests/reconciliationDefectsMcp.test.ts tests/nativeMcpClient.test.ts tests/nativeMcpHttp.test.ts tests/cosProduct03McpRecoveryMount.test.ts` → Tests 4 failed | 40 passed (44). The 4 failures are exactly the documenting tests flipping (2 observations no longer hold, 2 test.fails now pass); the 40 existing MCP tests stay green.
- `(scratch copy, dsh-runner-ready-to-wire.diff applied) vitest run tests/dshCaptureInterruption.test.ts tests/deepseekPublicSurface.test.ts tests/deepseekHarnessLaunch.test.ts` → Tests 36 passed (36)
- `pnpm vitest run tests/reconciliationDefectsMcp.test.ts (x5)` → 5 of 5 runs: 2 passed | 2 expected fail (stable)
- `node scripts/architecture-boundaries-check.mjs (read-only mode)` → exit 1. The only failures were dist/cli.js and dist/api/index.js missing (dist not built). No line-budget failure was listed.

## Typecheck
pnpm typecheck: exit 0. pnpm typecheck:tests: first run exit 2 (TS2322: category "traces" in tests/externalEvidenceExport.test.ts:11). Fixed in d4d62bce; rerun exit 0. Both ran on commits before f4147ddf, which changed only docs, docstrings and receipt files.

## Acceptance self-report
- [x] pnpm vitest run <every vitest file touched> -> all pass — `pnpm vitest run tests/bwrapBackendPure.test.ts tests/externalEvidenceProfile.test.ts tests/externalEvidenceExport.test.ts tests/callbackTelemetryCapture.test.ts tests/harnessComparison.test.ts tests/nativeAgentClientVerify.test.ts tests/deepseekHarnessLaunch.test.ts tests/cliImportCommands.test.ts tests/reconciliationDefectsMcp.test.ts tests/reconciliationDefectsReleaseGate.test.ts` → Test Files 10 passed (10); Tests 105 passed | 2 expected fail (107); exit 0
- [ ] Touched Python test files — `pytest tests/test_validation.py; pytest tests/test_validation_installed.py (sdk/python, PYTHONPATH=.)` → test_validation.py: 175 passed. test_validation_installed.py: 21 failed, 1 skipped, because no installed wheel exists (ModuleNotFoundError by design). Only its docstring changed, and the docstring now says exactly this.
- [x] For each fixed guard: mutation command, RED line, restored GREEN — `python3 scratchpad/s7/batch.py <batch.json> (mut.py: exact-once replace, pnpm vitest run <files>, byte-exact restore); mutcopy.py for release-gate copies` → 44 entries in AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S7/mutations.log. Every guard mutation went RED and was restored GREEN, except M17 (fixed by splitting the test; M17b RED) and M23 (equivalent mutant at callbackTelemetryCapture.ts:113, survives as expected, documented, no decoration added).
- [x] git diff --name-only 8f57ce63..HEAD contains no dirty-list or forbidden path — `git diff --name-only 8f57ce63d8331f1bef1c2a18fde82a7e8f4511da..HEAD, checked against codex-dirty-paths.json and the forbidden list` → 20 changed paths; overlap: []
- [x] Disposition table covers all 7 issues and names the 2 blocked defects with patch descriptions — `see notesForMonitor` → AMC-1513, 1516, 1517, 1518, 1519, 1520 and 1523 are all covered. Blocked: AMC-1515 nativeMcpClient.ts:235/:253 (diff verified in a scratch copy) and AMC-1521 releaseGateExecution.test.ts:55 (in-place blocked; gap closed in a new file).
- [x] Worktree clean — `git status --porcelain` → empty

## Mutation checks
- bwrapBackend.ts:94 duplicate/invalid child-pid — mutation: 'if (child !== null || !Number.isSafeInteger' -> 'if (false && !Number.isSafeInteger' — RED: Tests 4 failed | 58 passed (62); sandbox suites green, bwrapBackendPure RED: 'expected +0 to be null' — restored: Tests 62 passed (62)
- bwrapBackend.ts:98 exit-before-child — mutation: drop 'child === null ||' — RED: 1 failed: 'an exit code without a preceding child pid is refused' — restored: 62 passed
- bwrapBackend.ts:98 duplicate exit — mutation: drop 'exit !== null ||' — RED: 1 failed: 'expected 1 to be null' — restored: 62 passed
- bwrapBackend.ts:98 exit range >255 — mutation: drop '|| exit > 255' — RED: 1 failed: 'expected 256 to be null' — restored: 62 passed
- bwrapBackend.ts:91 non-object row — mutation: 'if (!row || typeof row !== "object" || Array.isArray(row))' -> 'if (!row)' — RED: 1 failed: row [1] — restored: 62 passed
- bwrapBackend.ts:94 child-pid > 0 — mutation: drop '|| child-pid <= 0' — RED: 2 failed: child pid 0 / -1 — restored: 62 passed
- bwrapBackend.ts:62 BPF arch check — mutation: [0x15,1,0,arch] -> [0x15,1,1,arch] — RED: 2 failed: 'expected 327681 to be 2147483648' — restored: 62 passed
- bwrapBackend.ts:67 x32 rule — mutation: if (arch === "x64") -> if (false) — RED: 1 failed: 'expected 2147418112 to be 327681' — restored: 62 passed
- bwrapBackend.ts:70 io_uring entry points — mutation: drop 425,426,427 — RED: 2 failed — restored: 62 passed
- bwrapBackend.ts:70 connect(42) — mutation: [41,53,42] -> [41,53] — RED: 1 failed — restored: 62 passed
- externalEvidenceProfile.ts:221 import gate — mutation: drop 'profile.provenance.captureMethod !== "import" &&' — RED: 1 failed | 17 passed: 'expected { ok: true … } to match { ok: false … }' — restored: 18 passed
- externalEvidenceProfile.ts:230 lower-declaration clamp — mutation: if (rank<rank) -> if (false) — RED: 1 failed | 17 passed — restored: 18 passed
- externalEvidenceExport.ts chunk bound 1000 — mutation: /1000 -> /2000 — RED: 1 failed: 'expected [ 1000 ] to deeply equal [ 1000, 1 ]' (neutralImporter + neutralImportMapping green) — restored: 26 passed
- externalEvidenceExport.ts callback cancel mapping — mutation: drop 'callback.cancelled === true ||' — RED: 1 failed — restored: 26 passed
- externalEvidenceExport.ts:29 Unicode replacement — mutation: Array.from(value.replace(...)) -> Array.from(value) — RED: 1 failed — restored: 26 passed
- externalEvidenceExport.ts:45 time range — mutation: drop '&& time <= 253402300799999' — RED: 1 failed — restored: 26 passed
- externalEvidenceExport.ts:50 duration precision loss — mutation: drop the precisionLoss line (M17 survived; test split; M17b) — RED: M17b: 1 failed: 'expected false to be true' — restored: 26 passed
- externalEvidenceExport.ts:46 time precision loss — mutation: drop the line — RED: 1 failed — restored: 26 passed
- externalEvidenceExport.ts:21 redaction loss — mutation: if (redactionCount>0) -> if (false) — RED: 1 failed: 'to include Known sensitive source fields…' — restored: 26 passed
- callbackTelemetryCapture.ts:66 allowlist — mutation: drop '!this.allowed.has(key) ||' — RED: 1 failed | 12 passed (neutralImportMapping green) — restored: 13 passed
- callbackTelemetryCapture.ts:66 sensitive-key refusal of extensions — mutation: drop the SENSITIVE_KEY clause — RED: 1 failed — restored: 13 passed
- callbackTelemetryCapture.ts:66 token-counter exemption — mutation: drop '&& !DEFAULT_CALLBACK_ATTRIBUTES.includes(key)' — RED: 1 failed: 'expected {} to deeply equal …' — restored: 13 passed
- callbackTelemetryCapture.ts:113 this.closed (equivalent mutant) — mutation: drop 'this.closed ||' — RED: SURVIVES (13 passed), as expected; documented, no test added — restored: 13 passed
- harnessComparison.ts:112 secret-like manifest — mutation: condition -> if (false) — RED: 2 failed | 53 passed: 'promise resolved … instead of rejecting' — restored: 55 passed
- harnessComparison.ts:248 fixture tamper — mutation: condition -> if (false) — RED: 1 failed | 54 passed — restored: 55 passed
- nativeAgentClient.ts:753 close-before-verify — mutation: if (!this.closed) -> if (false) — RED: 1 failed | 51 passed (P07 files green): 'promise resolved … instead of rejecting' — restored: 52 passed
- nativeAgentClient.ts:789 trust anchor (whole) — mutation: condition -> if (false) — RED: 2 failed | 50 passed — restored: 52 passed
- nativeAgentClient.ts:789 mismatch arm — mutation: keep only !expectedFingerprint — RED: 1 failed — restored: 52 passed
- nativeAgentClient.ts:789 missing-expected arm — mutation: expected !== null && expected !== monitor — RED: 1 failed — restored: 52 passed
- deepseekHarnessLaunch.ts:34 hash compare — mutation: drop the sha256 comparison — RED: 2 failed | 34 passed (dshCaptureInterruption + deepseekPublicSurface green) — restored: 36 passed
- deepseekHarnessLaunch.ts:34 isFile — mutation: drop isFile() — RED: 1 failed, on the message only (EISDIR still refuses) — restored: 32 passed
- deepseekHarnessLaunch.ts:59 prepare re-verify — mutation: remove verify call — RED: 1 failed — restored: 36 passed
- deepseekHarnessLaunch.ts:90 launchPin boundary text — mutation: truncate boundary — RED: 1 failed — restored: 32 passed
- cli-import-commands.ts format name+version — mutation: revert to sourceFormat?.version ?? format — RED: 1 failed | 3 passed — restored: 4 passed
- cli-import-commands.ts nextActions — mutation: if (next==="actions") -> if (false) — RED: 1 failed — restored: 4 passed
- cli-import-commands.ts record counts — mutation: if (records) -> if (false) — RED: 2 failed — restored: 4 passed
- cli-import-commands.ts applied imports print no apply action — mutation: always "actions" — RED: 1 failed — restored: 4 passed
- cli-import-commands.ts JSON byte-identical — mutation: JSON.stringify(result, null, 2) -> JSON.stringify(result) — RED: 1 failed — restored: 4 passed
- cli-import-commands.ts shell quoting — mutation: argv.map(shellWord) -> argv — RED: 1 failed — restored: 4 passed
- release-gate typecheck-tests step (scratch copy only) — mutation: delete the step from the copied release-gate.mjs — RED: 1 failed: 'expected undefined to deeply equal { id: typecheck-tests …}' — restored: unmutated and restored copy: 3 passed
- release-gate step command (copy) — mutation: typecheck:tests -> typecheck — RED: 1 failed — restored: 3 passed
- ci.yml Typecheck tests step (copy) — mutation: delete the step — RED: 1 failed — restored: 3 passed
- npm-publish.yml Typecheck tests step (copy) — mutation: delete the step — RED: 1 failed — restored: 3 passed

## Sources


## Not exercised
- No Linux run. The BPF filter was checked with an in-test classic-BPF evaluator, not loaded into a kernel, and Bubblewrap was never launched.
- No fresh-clone reproduction of any result.
- No installed-wheel Python run. test_validation_installed.py fails at import here by design.
- No packaged or dist CLI run (dist not built). The import text renderer was run end to end only via tsx from source.
- No race test for DSH verify-then-spawn. The runner re-verify diff has no test that exercises the swap.
- The AMC-1515 defect tests cover the stdio transport only, not streamable HTTP.
- Some unclaimed files still say AUTHORED UNEXECUTED: sdk/python/README.md:175,194 and 4 other sdk/python/tests/*.py docstrings. Not edited.

## Blockers
- AMC-1520 is PARTIAL: re-verifying at the spawn site needs src/adapters/adapterRunner.ts, which is not claimed. The ready-to-wire diff is in readyToWireDiff and tracks/S7/dsh-runner-ready-to-wire.diff. A residual exec-by-path window remains even after it.
- AMC-1515 is blocked because src/mcp/nativeMcpClient.ts is another session's dirty file. The patch is in tracks/S7/mcp-ready-to-wire.diff and was verified in a scratch copy.
- AMC-1521: the in-place assertion at tests/releaseGateExecution.test.ts:55 is blocked (dirty file). The gap is closed in tests/reconciliationDefectsReleaseGate.test.ts.
- Owner input needed: .gitignore:81 receipts (AMC-1513, AMC-1518) exist only in the root checkout's ignored AMC_OS/; the .amc/keys rotation (AMC-1514/AMC-1519) did not reproduce in this run, and .amc/ is unclaimable.
- The track instructions asked for a report.md receipt, but the harness refused to write a report .md file. The receipt is result.json + mutations.log + 2 diffs, and the full report is in notesForMonitor.

## Ready-to-wire diff
```
=== src/adapters/adapterRunner.ts (AMC-1520) ===
--- a/src/adapters/adapterRunner.ts
+++ b/src/adapters/adapterRunner.ts
@@ -20,7 +20,7 @@
 import { nodeFetchSnippet } from "./snippets/nodeFetch.js";
 import { pythonRequestsSnippet } from "./snippets/pythonRequests.js";
 import { PROVIDER_KEY_ENV_NAMES } from "../utils/providerKeys.js";
-import { deepseekHarnessCoverage, detectDeepseekHarnessLaunch, prepareDeepseekHarnessLaunch } from "./deepseekHarnessLaunch.js";
+import { deepseekHarnessCoverage, detectDeepseekHarnessLaunch, prepareDeepseekHarnessLaunch, verifyDeepseekHarnessLaunch } from "./deepseekHarnessLaunch.js";
 
 function redactWithGatewayRules(text: string, lease: string, regexes: string[]): string {
   let out = redactSecretsInText(text, [lease]);
@@ -290,6 +290,9 @@
 
     if (!isDsh) recordStarted();
     await new Promise<void>((resolvePromise, rejectPromise) => {
+      // Re-hash the approved files at the last point before exec. A throw here
+      // rejects this promise exactly like a spawn failure; exec-by-path remains.
+      if (isDsh) verifyDeepseekHarnessLaunch(profile!.deepseekHarnessLaunch!);
       const child = spawn(executable, args, {
         stdio: ["pipe", "pipe", "pipe"],
         env,

=== src/mcp/nativeMcpClient.ts (AMC-1515; blocked, other session's dirty file) ===
--- a/src/mcp/nativeMcpClient.ts
+++ b/src/mcp/nativeMcpClient.ts
@@ -232,8 +232,8 @@
         parameters: remote.inputSchema,
         body: async (execution) => {
           if (!active || execution.agentId !== agentId || resolve(execution.workspace) !== workspace) throw new Error("MCP mount is unavailable in this execution scope");
-          if (execution.effectiveMode !== "EXECUTE") return { output: "MCP call simulated; the remote tool was not invoked.", exitCode: 0 };
           if (!validate(execution.arguments).valid) throw new Error("MCP arguments do not match the reviewed tool schema");
+          if (execution.effectiveMode !== "EXECUTE") return { output: "MCP call simulated; the remote tool was not invoked.", exitCode: 0 };
           const signal = execution.signal;
           const abort = () => { void close().catch(() => {}); };
           if (signal?.aborted) throw new Error("MCP call cancelled before dispatch");
@@ -260,9 +260,11 @@
           } catch (error) {
             await close().catch(() => {});
             const notDispatched = error instanceof NativeMcpHttpRefused && (error.code === "NOT_DISPATCHED" || error.code === "CLOSED");
-            const uncertainty = callStarted && !responseReceived && !notDispatched
-              ? "; the remote tool may have executed. It was not replayed. Inspect the remote service before another invocation."
-              : "";
+            const uncertainty = responseReceived
+              ? "; the remote tool executed and its received result was discarded. It was not replayed. Inspect the remote service before another invocation."
+              : callStarted && !notDispatched
+                ? "; the remote tool may have executed. It was not replayed. Inspect the remote service before another invocation."
+                : "";
             return { ok: false, exitCode: 1, timedOut: (transport instanceof NativeMcpHttpTransport && transport.failureTimedOut)
                 || (error instanceof McpError && error.code === ErrorCode.RequestTimeout),
               output: (signal?.aborted ? "MCP call cancelled; connection and grants disposed"

When the MCP patch lands: delete the 2 'observed today' tests in tests/reconciliationDefectsMcp.test.ts and change its 2 test.fails to test.

=== tests/releaseGateExecution.test.ts:55 (AMC-1521; blocked, dirty) ===
Add to the first test: expect(f.calls.find((call) => call.id === "typecheck-tests")).toMatchObject({ command: "npm", args: ["run", "typecheck:tests"] });
```

## Notes for monitor
DISPOSITION TABLE (issue | defect | disposition | test file:line | mutation)

- AMC-1513 | bwrapBackend.ts:85 bwrapCommandExit | FIXED (tests) | tests/bwrapBackendPure.test.ts:47-77 | M01-M06 RED, sandbox suites green, restored GREEN.
- AMC-1513 | bwrapBackend.ts:60 linuxSocketDenyFilter | FIXED (tests, in-test cBPF evaluator) | tests/bwrapBackendPure.test.ts:26-45 | M07-M10 RED, then GREEN.
- AMC-1513 | .gitignore:81 receipts unreachable | OWNER-INPUT | root checkout only.
- AMC-1516 | externalEvidenceProfile.ts:221 import gate | FIXED | tests/externalEvidenceProfile.test.ts:72 | M11 RED, then GREEN.
- AMC-1516 | externalEvidenceProfile.ts:230 lower-declaration clamp | FIXED | tests/externalEvidenceProfile.test.ts:79 | M12 RED, then GREEN.
- AMC-1516 | externalEvidenceExport.ts:7 untested | FIXED | tests/externalEvidenceExport.test.ts:21-79 | M13-M19 RED. M17 initially survived; test split; M17b RED.
- AMC-1517 | docs/PI_CALLBACK_TELEMETRY.md:43 dangling pointer | FIXED (the doc now states the receipt path is gitignored and untracked at 8f57ce63, so a clone cannot inspect it).
- AMC-1517 | callbackTelemetryCapture.ts:66 allowlist | FIXED | tests/callbackTelemetryCapture.test.ts:12,25,31 | M20-M22 RED, then GREEN.
- AMC-1517 | callbackTelemetryCapture.ts:113 redundant this.closed | DOCUMENTED, no change | M23 survives (equivalent mutant), as expected.
- AMC-1518 | harnessComparison.ts:112 secret-like manifest | FIXED | tests/harnessComparison.test.ts:147-154 | M24 RED, then GREEN 55/55.
- AMC-1518 | harnessComparison.ts:248 fixture tamper | FIXED | tests/harnessComparison.test.ts:156 | M25 RED, then GREEN.
- AMC-1518 | .gitignore:81 receipts | OWNER-INPUT.
- AMC-1519 | nativeAgentClient.ts:753 close-before-verify | FIXED | tests/nativeAgentClientVerify.test.ts:48 | M26 RED, then GREEN.
- AMC-1519 | nativeAgentClient.ts:789 trust anchor | FIXED | tests/nativeAgentClientVerify.test.ts:57,63 | M27-M29 RED, then GREEN.
- AMC-1519 | python docstrings UNEXECUTED | FIXED | test_validation.py now records its 175-passed source run. test_validation_installed.py records that it failed at import without a wheel and is not accepted.
- AMC-1519 | docs/NATIVE_SDK.md unexecuted | FIXED | nativePinnedToolSchemas 11/11 and acpFailedTurnUpdates 11/11 ran from source; installed qualification is still stated as unexecuted.
- AMC-1519 | .amc/keys rotation | OWNER-INPUT | not reproduced this run (git status clean after every run).
- AMC-1520 | deepseekHarnessLaunch.ts:34 check-then-use | PARTIAL | boundary stated in deepseekHarnessCoverage().launchPin (src/adapters/deepseekHarnessLaunch.ts:90); tests/deepseekHarnessLaunch.test.ts:22,32,38,44 | M30-M33 RED, then GREEN (M31 killed only by the message). Spawn-site re-verify is ready-to-wire in the unclaimed adapterRunner.ts; verified in a scratch copy, 36/36.
- AMC-1523 | cli-import-commands.ts:15 format label | FIXED | tests/cliImportCommands.test.ts:43,54 | M34 RED, then GREEN.
- AMC-1523 | cli-import-commands.ts:16 fixed sentence | FIXED (structured nextActions with shell quoting, record counts, inspect pointer when applied, nothing invented for legacy receipts) | tests/cliImportCommands.test.ts:43,63 | M35-M37 and M39 RED, then GREEN.
- AMC-1523 | JSON output byte-identical | VERIFIED | tests/cliImportCommands.test.ts:76 | M38 RED, then GREEN.
- BLOCKED 1, AMC-1515 | nativeMcpClient.ts:253 (received result discarded, no execution notice) and :235 (SIMULATE returns before schema validation) | tests/reconciliationDefectsMcp.test.ts:80/:87 and :94/:99 | Patch: move validate() above the effectiveMode early return; when responseReceived, append an 'executed and its received result was discarded' suffix. In a scratch copy the patch flips all 4 documenting tests and keeps the 40 existing MCP tests green.
- BLOCKED 2, AMC-1521 | releaseGateExecution.test.ts:55 counts-only | in-place blocked | tests/reconciliationDefectsReleaseGate.test.ts:18,33 closes the gap. M40-M43 were run on scratch copies only, never the dirty originals; all RED, then GREEN.

FILES IN THE RECEIPT DIRECTORY
- AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S7/: result.json, mutations.log (44 entries), mcp-ready-to-wire.diff, dsh-runner-ready-to-wire.diff.
- The harness refused to write report.md, so this structured result is the report.
- docs/NATIVE_SDK.md and the 2 Python docstrings cite tracks/S7/result.json, which is committed with git add -f.

MUTATION SCRIPTS (scratchpad, not committed)
- scratchpad/s7/mut.py: exact-once replace, vitest run, byte-exact restore with an assert.
- scratchpad/s7/batch.py: runs the batch JSON files b-*.json through mut.py.
- scratchpad/s7/mutcopy.py: copy-root mutations driven by AMC_RECONCILE_ROOT.

CAVEATS
- tests/reconciliationDefectsReleaseGate.test.ts reads HEAD's release-gate.mjs and ci.yml. If the other session's uncommitted patch renames the step, this test goes red, which is the intended signal.
- .amc/keys was never dirtied in this worktree.