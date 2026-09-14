# IMPL-5 — first-run: `amc firewall enable`, `amc doctor` fixes, `amc init` actions

**Source:** 910e6d9785a51ded454233aa24ec9f84de0e87e4 (amc/gap-register-execution) + this uncommitted diff, in worktree `/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_e71e93d9-c37-1` (detached at that commit; the worktree had been created at 3d6b8d4a, 424 commits behind — moved with `git checkout --detach`, nothing else touched). **Environment:** Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0, `pnpm install --frozen-lockfile --prefer-offline` exit 0, `pnpm build` exit 0. This is a fresh worktree with a clean install, not a fresh clone (§4 receipt rule); nothing was committed.

## What was wrong at 910e6d97 (baseline measured, workspace `/tmp/amc-firstrun-Dc8Xky`, removed)
- `amc doctor` after `amc init --minimal`: `PASS ✅ (29 pass, 0 fail, 3 warn, 3 info)` — never mentioned the runtime firewall policy, the precondition that denies every tool call.
- Vault check said `[INFO] vault: Vault locked (normal for fresh install…) fix: Run: amc vault unlock` even with `AMC_VAULT_PASSPHRASE` in the shell (signing worked).
- `amc firewall enable` twice → `firewall status` `policyRevision: 2` (not idempotent); output was three lines with no explanation.
- `amc init --minimal` printed quickscore/guide/doctor, not the path to a governed turn; without `AMC_VAULT_PASSPHRASE` it silently used `minimal-startup-<timestamp>` and never showed it — every later signing command then refused with `Vault locked. Run \`amc vault unlock\` first…`, a fix that cannot work because the passphrase was never disclosed.
- The stub `agent-loop run … --tools echo` before `firewall enable` exits 0 with `tool calls 1`; the run output does not say whether the call was denied.

## What shipped (scope respected)
- `src/cli.ts` firewall block: `enable` inspects first; unchanged trusted policy → "already enabled in warn mode (revision N); nothing was written" (JSON `changed:false`); otherwise writes and prints *What this wrote* (policy, signature, checkpoint, revision), *What it means* (before: every native tool call denied with missing-policy), mode semantics, and how to widen/narrow (`--mode block|observe`, `status`, `disable`).
- `src/doctor/doctorRules.ts`: new check `runtime-firewall-policy` (missing → WARN / FAIL under `--strict`, fix `Run: amc firewall enable`; invalid → FAIL naming `amc firewall status` and `migrate-signature --approve-legacy-kind`; disabled → WARN; signed+enabled → PASS with mode/revision/fail-closed). Vault check → PASS when the passphrase is in the shell (never rendered) else WARN naming `export AMC_VAULT_PASSPHRASE='…'`.
- `src/doctor/firstRunPlan.ts` (new): `firstRunActions()` (the three actions) and `firstRunFixCommands(report)` (FAIL-before-WARN copyable fixes). `src/doctor/doctorReport.ts`: headline names warnings-with-fixes instead of "All critical checks pass". `amc doctor` wiring prints the fixes under *What's next* even at exit 0.
- `amc init` / `amc init --minimal` print the three actions; `--minimal` generates a random passphrase and prints the export once.
- `docs/START_HERE.md`, `docs/QUICKSTART.md`: the keyless first-turn block and the measured timing, with commit/environment/date named inline.

## Measured first-run protocol (final dist, fresh temp workspace `/tmp/amc-firstrun-PB8bss`, removed; `AMC_VAULT_PASSPHRASE` exported first)
| # | command | exit | s |
|---|---|---|---|
| 1 | `amc init --minimal` (prints the three actions) | 0 | 1.21 |
| 2 | `amc doctor` (WARN runtime-firewall-policy → fix `amc firewall enable`; vault PASS) | 0 | 1.83 |
| 3 | stub `agent-loop run … --tools echo` before the policy (exit 0; tool outcome not surfaced) | 0 | 0.90 |
| 4 | `amc firewall enable` → revision 1, explains what it wrote | 0 | 0.75 |
| 5 | `amc firewall enable` again → "already enabled … nothing was written", revision stays 1 | 0 | 0.72 |
| 6 | `amc doctor` → `[PASS] runtime-firewall-policy … (mode warn, revision 1, fail-closed on)` | 0 | 1.72 |
| 7 | stub `agent-loop run …` → session `dea244ea-…`, turn complete | 0 | 0.84 |
| 8 | `amc agent-loop verify dea244ea-… --json` → `ok:true, ledgerOk:true` | 0 | 0.73 |

Operator path from nothing: `export AMC_VAULT_PASSPHRASE`, `init`, `firewall enable`, `run`, `verify` = 3.53 s of command time across four commands (five shell actions counting the export); three commands after init. The §7a "<5 minutes" bound is met by a wide margin; the "≤3 operator actions" bound is met only if the passphrase is already in the environment and verification is counted as part of the turn — I do not claim it as met. Script wall-clock for all 8 steps: 9.06 s.

**No-passphrase variant** (`/tmp/amc-firstrun-UKFg4R`, removed): init 1.16 s prints `export AMC_VAULT_PASSPHRASE='<generated>'` once; doctor 1.91 s exit 0 with `[WARN] vault … fix: Run: export AMC_VAULT_PASSPHRASE='<the passphrase chosen or shown at amc init>'` and the firewall WARN; `firewall enable` and both runs exit 1 with `Vault locked. Run \`amc vault unlock\` first, or \`amc setup\`…`.

## Refusals encountered and whether each named its fix
- Firewall guard `runtime firewall blocked this call (missing-policy)` (src/tools/guards/policyGuards.ts:47) — **no fix named**, and `agent-loop run` does not surface it (exit 0). I could not read the recorded tool result back (109 files scanned incl. zlib/gzip and sqlite strings: 0 hits; evidence blobs appear encrypted), so the doc states only what was observed. Out of scope → defect for the guard/agent-loop owner.
- Missing-policy decision reason "Runtime Firewall was required but no policy file was found." (src/runtime/firewall.ts:1115) — no fix named; out of scope.
- `Vault locked. Run \`amc vault unlock\` first…` — names a fix that does not work in a fresh non-interactive shell; out of scope. Mitigated in scope: init prints the export, doctor names it.
- `amc doctor` (after change): every FAIL/WARN carries a `Run: …` fix; verified by tests and mutation.

## Tests, typechecks, mutations
- Final required suites (15 files: doctor*, firewallDenyByDefault, runtimeFirewall, nativeFirstUseGuide*, agentToolsetWiring, studioVaultModeLoop, adaptersDoctorLeaseCarriers, firstRun*): **142 passed, 0 failed, 0 skipped**. No `tests/cliFirewall*.test.ts` exists; `tests/runtimeFirewall.test.ts` holds the CLI `firewall enable` coverage (concurrent three-mode writers → revision 3 still passes).
- RED first: the two new files failed before implementation (module missing + 2 assertions).
- `pnpm typecheck` 0 errors; `pnpm typecheck:tests` 0 errors.
- Mutations (all RED, sources restored and diff-verified): drop firewall fixHint; FAIL→WARN (pre-split); leak passphrase into doctor text; idempotence ignores mode (dist rebuilt, protocol test RED); ignore `--strict`; drop vault fixHint.

## Not exercised
Real providers, notary/`--live-probes`, Studio, Linux/Windows, the full vitest suite, package/platform/release qualification, a human first-use session (this is one automated session on one machine). Side effect of the CLI's own design: `amc firewall enable` wrote host-local checkpoints under `/Users/sid/.amc/control-checkpoints/<workspace-id>/runtime-firewall-policy/` for the temp workspaces; not removed.

## Defects for other tracks
1. Tool-guard denial text does not name `amc firewall enable` and `agent-loop run` hides the denial (policyGuards.ts / cli-agent-commands).
2. Vault-locked refusal names `amc vault unlock`, which needs the passphrase interactively; should also name the `export`.
3. tests/adaptersDoctorLeaseCarriers.test.ts:376 treats a workspace with no firewall policy as `ok`; if the owner wants FAIL-by-default, that fixture should call `writeRuntimeFirewallPolicy` first.