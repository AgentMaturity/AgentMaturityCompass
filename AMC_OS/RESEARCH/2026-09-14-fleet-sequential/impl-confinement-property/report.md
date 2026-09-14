## IMPL-4 — `ToolsetReadiness.confined` as a measured process property

**Boundary.** Source commit c3c46083a8087b7c6fd6cfaad79b3180f9f7483f (worktree `/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_a2e7e6c6-6fc-1`, fast-forwarded from 3d6b8d4a — see decisions). Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0, `/usr/bin/sandbox-exec` present, not root. Source qualification only: no package, platform or deployed-release claim.

### What changed
- `src/sandbox/processConfinement.ts` (rewritten, 215 lines): `measureProcessConfinement()` returns `{verdict: confined|unconfined|unknown, declaredProbeDir, probe{path,result,code}, reason}`. One `openSync(path,"wx")` in the launcher-declared `AMC_CONFINEMENT_PROBE_DIR` (else `os.tmpdir()`), unlinked on success. EPERM/EACCES in a directory this process owns, may write by mode and can list → `confined`; permitted → `unconfined` regardless of declaration; everything else → `unknown`. `processIsConfined(m)` is true for exactly `verdict === "confined"`.
- `src/agent/agentToolset.ts`: readiness measures once; `confined` derives from it; new `confinement` field; `sandboxReason` leads with the measurement reason.
- `tests/toolsetConfinementProperty.test.ts`: 12 tests, two of them real children under a real `sandbox-exec` profile built by `buildSeatbeltProfile` (workspace writable, probe dir denied), one of them end-to-end through `agentToolset` + `run_code`.

### Measured
- `pnpm exec vitest run` on the 7 required files (new file, codeModeConfinement, agentToolsetSession, agentToolsetWiring, sandboxConfinement, nativeSandboxPolicyBinding, gap4746PortkeySandboxResourceLimitsBoundary): **83 passed / 0 failed / 0 skipped** (final run after the mutation pass restored the files).
- RED before implementation: 12/12 failed on the missing API.
- `pnpm run typecheck` exit 0; `pnpm run typecheck:tests` exit 0 (each run twice, the second against the restored files).
- Under the seatbelt child: verdict `confined`, probe `refused` with `EPERM`, nothing created in the probe dir; `readiness.confined === true`; `run_code` outcome `OK`, content contains `2`. Same child without the profile: `unconfined`, `permitted`.
- Mutations (all RED): M1 probe returns confined without measuring (12 tests red across 2 files); M2 unknown treated as confined (2 red); M3 owner-write-bit check dropped (1 red: chmod-500 test); M4 Code Mode gate `() => true` (3 red across 3 files, incl. agentToolsetWiring "passes the MEASURED confinement answer"); M5 `confined: backend !== null`, the original defect (4 red across 2 files).

### Not exercised
- **Linux.** No Landlock or bwrap run. The seatbelt tests are `skipIf(!sandboxExecPresent)` and would skip there, so on Linux this suite proves only the unconfined/unknown paths. A Linux qualification needs: (1) a launcher that applies a Landlock ruleset (or bwrap) to the whole AMC process and sets `AMC_CONFINEMENT_PROBE_DIR`; (2) the same two child tests under it; (3) a decision on EROFS — a bwrap `--ro-bind` refuses with EROFS, which this code classifies as `unknown` (fail closed, but never `confined`), because EROFS is also what an ordinary read-only filesystem returns and cannot be attributed to a sandbox by errno alone. Landlock's EACCES is counted; that mapping is read from documentation, not measured here.
- Root uid (mode checks are bypassed by root; two tests `skipIf(isRoot)` — they ran here).
- `src/cli-agent-commands.ts` warning path (typecheck only; its `sandboxReason` text shape changed).
- Full vitest suite, coverage thresholds, `pnpm build`, any launcher that re-execs AMC under a profile (none exists; the measurement therefore reads `unconfined` in every normal AMC invocation today, and reads it rather than returning it).

### Known-open after this track
- No AMC launcher sets `AMC_CONFINEMENT_PROBE_DIR`; the contract exists, the re-exec does not.
- `tests/codeModeConfinement.test.ts` header comment still says processIsConfined is "ALWAYS FALSE TODAY" (assertions remain correct and pass; file out of scope).