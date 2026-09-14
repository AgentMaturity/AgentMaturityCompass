# 2026-09-14 — Sequential fleet: per-agent results and root integration

Standing order: `plans/2026-09-09-amc-execution-brief.md`. Execution model: the 50-agent fleet
defined on 2026-09-12 (42 Phase A reconciliations, seven implementation/research scopes, one
B0/B1 readiness audit; every agent on the session model, Fable 5.1) runs **one agent at a
time** on Sid's instruction of 2026-09-14, each in a fresh worktree under a hard tool-call
budget. Root integrates each result serially after reading the diff and re-running the tests
here. Machine: Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0, vitest 4.1.11.

Every number below was measured in this session or is quoted from the named per-agent
`result.json` (the agent's own measurements, in its worktree). Nothing here is a fresh-clone
acceptance; the fresh-clone re-acceptance of the resulting commit is recorded separately when
it runs.

## Reconciliations (Phase A step 1)

| Issue | Verdict | Agent record | Linear comment | Root check |
|---|---|---|---|---|
| AMC-1506 | PARTIAL — fix `5eec4d9d` is an ancestor of `6e7875f2`; the imported-report builder (now `src/importers/neutralImportPresentation.ts:19-77`) emits UNSIGNED / integrity 0 / SELF_REPORTED with readiness UNVERIFIED; 9 adjacent files 61/61 after build; mutation (integrity 0.72, observed 0.17 injected) turned the 3 provenance tests red. Gaps: no tracked receipt at this commit; the 2026-09-08 before/after receipts and the 2026-09-09 reconciliation row are untracked; no end-to-end `amc import` CLI run; no dedicated Obsidian note; stale code reference in the description | `reconcile/AMC-1506.json` (run `wf_7e729cdc-322`, 31 tool uses, 6.3 min) | posted 2026-09-14 | root: both 2026-09-08 receipts exist on disk (821 B and 1,188 B, untracked); `reconciliation.json` has an AMC-1506 row (untracked); AMC-1506 appears in the DSH/Pi plan and evidence notes but has no completion note of its own; state left In Review |
| AMC-1507 | PARTIAL — c050244a, 8defa070, 1b89a573 are ancestors of `6e7875f2`; explicit v3 detection, nested failure preservation, structural entries as metadata, off-path branches, duplicate/cycle refusal, strict timestamps, null durations, Watch schema 2026-09-08 all verified with file:line; 7 files 47/47; two mutations red (identity sanitization dropped → 2 red; durationMs null→0 → 1 red). Gaps: cited 2026-09-08 receipts untracked; no single-commit receipt attributable to the issue; no Obsidian note. Defect: negative numeric timestamps accepted (traceMapping rejects them) | `reconcile/AMC-1507.json` (run `wf_8d677915-7b1`, 33 tool uses, 5.4 min) | posted 2026-09-14 | root: the three cited receipts exist on disk (untracked); AMC-1507 appears in the Roadmap and DSH/Pi notes, no note of its own; the timestamp defect was confirmed and fixed in `8baae594` (red then green, 7 suites 48/48) |
| AMC-1528 | PARTIAL — fix and acceptance tests hold at `43f61d5e` (30/30 persona tests, 22/22 gate-script tests, two mutations red); two 2026-09-08 receipts and the 2026-09-09 reconciliation dir untracked (ignored `AMC_OS/`); no slow-install behavioral test; 2026-09-08 schema change undocumented; tracked `.amc/release-gate/latest.json` line 126 still embeds the retired rating text | `reconcile/AMC-1528.json` (run `wf_870dd21b-f1e`, 2026-09-12) | 2026-09-14T04:17Z, `4fb9a1c6` | untracked paths, tracked persona receipt and the line-126 text confirmed in root at `43f61d5e`; state left Done |

## Implementation tracks

### impl:spill-attachments — IMPL-1, PARTIAL → integrated as `fa2ffac6`

Agent: `wf_e54e6c35-3e3`, worktree `.claude/worktrees/wf_e54e6c35-3e3-1`, base `43f61d5e`,
94 tool uses, 37.6 min. Records: `impl-spill-attachments/result.json`, `report.md`.

Done (attachment door): `SessionService.recordUserAttachment` retains image/text bytes above
`retention.maxPayloadBytesPerEvent` through the encrypted spill store behind a signed
`tool/spill-commitment` row (`subject: user/attachment`), with a canonical
`amc-spilled-input@1` descriptor as the row payload and the same `SpillRef` in meta; request
assembly (send and cold derive) and ACP history replay resolve and re-verify the bytes; above
`retention.maxBlobBytes` the attachment is refused naming that key. New
`src/session/spill/spillInput.ts`, `tests/sessionAttachmentSpill.test.ts`; changed
`sessionService.ts`, `sessionPayloadCap.ts`, `spill/spillPolicy.ts`,
`llm/request/requestSources.ts`, `acp/acpImageHistory.ts`, `tests/sessionPayloadCap.test.ts`,
`docs/SESSION_SPILL_LIFECYCLE.md`.

Not done (deliberate, documented): queued inbox inputs (`LoopInbox.insert`, Studio queued-input
cap) and audio attachments stay fail-closed at the per-event cap because their claim-time and
provenance readers decode the row payload directly; `acpProjection.ts` does not yet pass
history to `projectAcpAttachment`, so that door verifies the row's own reference without the
commitment-ordering check. Exact remaining steps are in `result.json` → `blockers`.

Root re-verification at `fa2ffac6` (this session, root checkout, dirty only in `plans/`):

| Check | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` / `npx tsc -p tsconfig.tests.json --noEmit` | exit 0 / exit 0 |
| six focused files (sessionAttachmentSpill, sessionPayloadCap, nativeSignedImageInput, nativeAcpImageInput, nativeSignedAudioInput, attachmentIngest) | 6 files, 82/82 passed, 38.7 s |
| 25 further affected files (request/ACP/provider image+audio, spill group, compaction, continuity) | 25 files, 422/422 passed |
| `node scripts/architecture-boundaries-check.mjs` | `failures: []`; `sessionService.ts` 799 lines by `wc` (cap 800) |
| Mutation M1 — publish the object before the commitment callback | 2 failed / 10 passed: exactly the commitment-durable-first and admission-refusal tests |
| Mutation M2 — accept an absent commitment row on read | 2 failed / 10 passed: exactly the ACP uncommitted-object and derive deleted-commitment tests |
| Mutation M3 — route audio to spill instead of refusing at the cap | 1 failed / 11 passed: exactly the audio fail-closed test |
| tracked `.amc/keys/*` after every run | unchanged (`git status -- .amc/` empty, no `*.previous-*` files) |

All three mutated files were restored and their SHA-256 re-matched the agent worktree copies.
Not exercised in root: `pnpm build`, the full suite, the release gate, the JSONL session
backend for spilled attachments, `AMC_NO_SIGN=1`, a text attachment actually retained through
spill, Node 22.x, Linux/Windows, real providers. Agent hygiene finding (not reproduced in root):
the first run of the new test in the worktree rotated that checkout's tracked `.amc/keys/*`;
the agent restored them and could not attribute the cause within budget.

Linear: AMC-1547 (retained spill lifecycle; state unchanged, comment posted with this receipt).

### impl:studio-token-scopes — IMPL-2, COMPLETE → integrated as `2eed9bee`

Agent: `wf_3cc93fba-030`, worktree `.claude/worktrees/wf_3cc93fba-030-1`, base `fa2ffac6`
(the harness provisioned the worktree at the merge-base `3d6b8d4a`; the agent detached its own
checkout at `fa2ffac6` before any edit), 59 tool uses, 23.7 min. Records:
`impl-studio-token-scopes/result.json`, `report.md`.

Done: `ensureAgentToken` derives the grant from the signed action policy (no valid signature,
no token), token meta v2 records `executeActionClasses` and `grantedBy`, an issued token never
widens when the live policy widens, legacy v1 meta covers no execute class; `/toolhub/execute`
refuses a static-token execute whose grant excludes the intent's action class before any
intent, ticket or approval is consumed; the five scope-gated routes name the refusing grant
and how to widen it; `GET /agents` fails closed per agent. Named limitation: lease scopes
cannot name an action class (`leaseScopeSchema` is a closed enum outside the track), so a
lease-only execute stays governed by the signed policy alone; the test asserts that boundary.

Root change on top of the agent's diff: the two route helpers moved into new
`src/studio/agentTokenScopeGuard.ts` (78 lines) because `studioServer.ts` would have grown to
8911 lines against its 8878-line ratchet; it lands at 8849. Root re-verification at
`2eed9bee`:

| Check | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` / `npx tsc -p tsconfig.tests.json --noEmit` | exit 0 / exit 0 |
| `node scripts/architecture-boundaries-check.mjs` | `failures: []` |
| `pnpm build` (root dist refreshed for the dist-backed Studio tests) | exit 0 |
| 14 files: new `studioAgentTokenScopes` + `studioAgentCredentialBinding`, `studioApiAuthorization`, `studioCliBridgeAuthz`, `studioNativeTask*` ×6, `cosProduct10*` ×4 | 14 files, 152/152 passed, 22.0 s |
| Mutation M1 — route guard removed while the live policy allows WRITE_LOW | 1 failed / 9 passed: exactly the WRITE_LOW-refusal test (the governor alone did not refuse) |
| Mutation M4 — existing token meta rewritten from the live policy | 1 failed / 9 passed: exactly the never-widens test |
| Mutation M3 — unsigned policy still grants | 2 failed / 8 passed: exactly the unsigned-policy mint and `/agents` tests |
| tracked `.amc/keys/*` after every run | unchanged |

Not exercised in root: the agent's M2/M5/M6 mutations (recorded in its `result.json` as red in
its worktree), full suite, release gate, fresh clone, CLI paths, gateway/proxy/wire/hook
scopes, browser. The agent's 14-file batch rotated its worktree's tracked `.amc/keys/*` once
(restored there, not attributed to a file, not reproduced in root). Root bisect in that
finished worktree afterwards: each of the 13 pre-existing files run alone (all green) left
`.amc/` clean with no `*.previous-*` file, so the rotation is not a per-file effect; it was seen
only in parallel multi-file batches in two agent worktrees (spill-attachments first run,
token-scopes 14-file run) and never in any root batch. Open hygiene item: suspect a
parallel-worker interaction that reaches `persistVault` with the checkout as workspace.
Linear: AMC-1546 (state unchanged, comment posted).

### impl:hook-inheritance — IMPL-3, COMPLETE → integrated as `c3c46083`

Agent: `wf_453236ab-c47`, worktree `.claude/worktrees/wf_453236ab-c47-1`, base `2eed9bee`
(worktree provisioned at `3d6b8d4a`; the agent fast-forwarded its own branch), 54 tool uses,
18.3 min. Records: `impl-hook-inheritance/result.json`, `report.md`.

Done: `createDriverRunner` takes the parent loop's hook control (`LoopHookControl` =
preStep + turnStopping) and builds every child driver on it instead of `NO_HOOKS`; the kernel
passes the same hooks it composes for the root, so grandchildren inherit the same control;
`notify` is not inherited (no session identity in its payload). Every native child records one
signed `audit` row (`kind: delegation/hook-control`, v1) before its first turn naming the
inherited controls, approval gate, signed stop conditions/scope and descendant limits; a child
built with no control records `source: "none"`. Hooks and the recorded list derive from one
snapshot. Not covered (recorded in `result.json` → `blockers`): foreign runners bypass
`createDriverRunner` and record nothing; the inherited preStep is the parent's composed
waterfall, so context plugins refresh under the parent's session id when run for a child.

Root re-verification at `c3c46083`:

| Check | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` / `npx tsc -p tsconfig.tests.json --noEmit` | exit 0 / exit 0 |
| `node scripts/architecture-boundaries-check.mjs` | `failures: []` (`subagentRunner.ts` 367, `agentLoopRunner.ts` 668, `loopTypes.ts` 265 lines) |
| `npx vitest run subagent delegat Delegat kernelDelegationGrant nativeChildStopOutput nativeDelegationInheritance agentLoop composedTurn hookControl` | 27 files, 290/290 passed, 33.3 s |
| Mutation M1 — `hooks` dropped from the child `AgentDriver` | 2 failed / 4 passed: exactly the parent-veto and turn-stopping tests |
| Mutation M3 — kernel passes no `hookControl` | 1 failed / 5 passed: exactly the kernel/grandchild test |
| Mutation M4 — a control-less child records `inherited: ["preStep","turnStopping"]` | 1 failed / 5 passed: exactly the records-absence test |
| tracked `.amc/keys/*` after every run | unchanged |

Not exercised in root: the agent's M2/M5 mutations (red in its worktree per `result.json`), full
suite, build, release gate, fresh clone, a real provider (scripted adapter only), plugin-side
attribution under a child. Linear: AMC-1545 (state unchanged, comment posted).

### impl:confinement-property — IMPL-4, COMPLETE → integrated as `910e6d97`

Agent: `wf_a2e7e6c6-6fc`, worktree `.claude/worktrees/wf_a2e7e6c6-6fc-1`, base `c3c46083`
(worktree provisioned at `3d6b8d4a`; the agent fast-forwarded its own branch), 35 tool uses,
16.2 min. Records: `impl-confinement-property/result.json`, `report.md`.

Done: `ToolsetReadiness.confined` is derived from a measured tri-state verdict
(`confined | unconfined | unknown`) produced by one create-then-unlink the OS refuses or
permits. A launcher declares the denied directory in `AMC_CONFINEMENT_PROBE_DIR`; a refusal
counts only after ownership, owner write bit and listability rule out ordinary permissions and
TCC; declared-but-writable measures unconfined; unattributable measures unknown, never
confined. `sandboxReason` leads with the measurement. Root change on top: the two
unprivileged-user cases and three `sandbox-exec` cases were converted from `it.skipIf` to
conditional registration, plus a mandatory case asserting what this machine registers and that
`buildSeatbeltProfile` denies the probe directory (the gate's mandatory profile refuses any
skipped test). Known limitation recorded here: a directory with the BSD immutable flag (`chflags
uchg`) also refuses with EPERM and would read as confined — the launcher contract is
operator-owned, so this is a misconfiguration class, not an untrusted-input one; Node exposes no
`st_flags` to rule it out cheaply.

Root re-verification at `910e6d97`:

| Check | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` / `npx tsc -p tsconfig.tests.json --noEmit` | exit 0 / exit 0 |
| `node scripts/architecture-boundaries-check.mjs` | `failures: []` (`processConfinement.ts` 215, `agentToolset.ts` 355 lines) |
| 9 files: new `toolsetConfinementProperty` (13, incl. real children under `/usr/bin/sandbox-exec`), `codeModeConfinement`, `agentToolsetSession`, `agentToolsetWiring`, `sandboxConfinement`, `nativeSandboxPolicyBinding`, `gap4746PortkeySandboxResourceLimitsBoundary` + 2 readiness consumers | 9 files, 107/107 passed, 0 skipped, 12.2 s |
| Mutation M1 — verdict `confined` returned before any probe | 8 failed across both confinement files (every measured-unconfined and Code-Mode-refusal case) |
| Mutation M2 — `unknown` counted as confined | 2 failed / 14 passed: exactly the single-verdict and unknown-keeps-Code-Mode-refused tests |
| Mutation M5 — `confined: backend !== null` (the original machine probe) | 4 failed / 12 passed: exactly the process-unconfined, Code-Mode-refusal, readiness and unknown tests |
| tracked `.amc/keys/*` and `$TMPDIR` probe leftovers after every run | unchanged / none |

Not exercised in root: the agent's M3/M4 mutations (red in its worktree per `result.json`),
Linux (Landlock/bwrap), a launcher that actually re-execs AMC under a profile (none exists yet;
the measurement reports unconfined everywhere until one does), full suite, build, release gate,
fresh clone. Linear: AMC-1513 (state unchanged, comment posted).

### impl:first-run — IMPL-5, COMPLETE → integrated as `d635a5e2` (docs measurement `1e56333e`)

Agent: `wf_e71e93d9-c37`, worktree `.claude/worktrees/wf_e71e93d9-c37-1`, base `910e6d97`
(worktree provisioned at `3d6b8d4a`; the agent detached its own checkout at the base), 105
tool uses, 31.6 min. Records: `impl-first-run/result.json`, `report.md`.

Done (brief §7 item 4 / §7a): `amc init` and `amc init --minimal` print the three operator
actions to a governed, verified, keyless turn; `--minimal` without `AMC_VAULT_PASSPHRASE`
generates a random passphrase and prints the export line once (before: generated silently and
discarded, leaving a vault no command could unlock). `amc doctor` gains `runtime-firewall-policy`
(missing → WARN, FAIL under `--strict`, fix `amc firewall enable`; invalid → FAIL naming
status/migration; disabled → WARN; signed+enabled → PASS with mode/revision), a passphrase-aware
vault check that never renders the value, and a What's next that repeats every FAIL/WARN fix
verbatim even at exit 0. `amc firewall enable` is idempotent (trusted policy with the requested
mode/enabled/fail-closed → reported, not re-journaled) and explains what it wrote, what it means
and how to widen or narrow. `src/workspace.ts` untouched by design (`tests/firewallDenyByDefault`
premise). Design point for Sid: the generated `--minimal` passphrase is printed to stdout once;
the alternative was refusing init without one.

Root change on top: the two dist-backed protocol cases converted from `test.skipIf` to
conditional registration with a mandatory case (the gate refuses skipped tests).

Root re-verification at `d635a5e2`:

| Check | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` / `npx tsc -p tsconfig.tests.json --noEmit` | exit 0 / exit 0 |
| `node scripts/architecture-boundaries-check.mjs` | `failures: []` (`cli.ts` 24516 under its 24539 ratchet) |
| `pnpm build` (root dist refreshed for the protocol test) | exit 0 |
| 15 required files (doctor ×6, firewall ×2, first-use guide ×3, toolset wiring, Studio vault loop, two new) + 3 init/guidance files | 18 files, 154/154 passed, 0 skipped |
| Mutation M1 — missing-policy fix hint removed | 3 failed / 6 passed |
| Mutation M5 — `--strict` no longer fails closed | 2 failed / 7 passed |
| Mutation M3 — vault PASS message renders the passphrase | 1 failed / 8 passed |
| First-run path against the root build in a disposable temp workspace | init 1.19 s; doctor before: `runtime-firewall-policy` WARN, `vault` PASS, exit 0; enable 0.94 s (revision 1); enable again 0.80 s "nothing was written"; stub turn 0.85 s (1 turn, 2 steps, 1 tool call, 24 events); verify 0.83 s VERIFIED, ledger/session chains ok, 0 unsigned rows, 2/2 requests derived, trust root UNANCHORED; doctor after: PASS |
| tracked `.amc/keys/*` and root `.amc/firewall` after every run | unchanged |

Not exercised in root: the agent's M2/M4/M6 mutations (red in its worktree per `result.json`;
M4 needs a dist rebuild per mutation), a real provider, `amc init` (non-minimal) interactive
path, Linux/Windows, full suite, release gate, fresh clone. Linear: AMC-1505 (comment posted; no
child issue owns first-run).

> **Correction, 2026-09-14 12:23 IST (`b382967c`).** This section and the AMC-1505 comment first
> recorded an "observed UX defect": that before `amc firewall enable` the stub turn exits 0
> without saying its tool call was denied. That was wrong. Reading the ledger row meta of a
> pre-enable stub run at `d635a5e2` shows the `echo` tool result recorded `outcome: "OK",
> denied: false` — the `echo` seam (`src/agent/echoTool.ts`, selected by `--tools echo`, the
> default for the stub provider) is a demonstration outside the firewall and allowlist, so
> nothing was denied and nothing was hidden. The policy governs workspace tools
> (`--tools workspace`), whose run refuses up front naming `amc firewall enable`. The first-run
> plan text and both guides overstated what the policy gates ("every tool call"); corrected in
> `b382967c`. The measured timings above are unaffected.

### impl:gap-register — IMPL-6, REPORT_ONLY → `plans/amc-gap-register-2026-09.md` (DRAFT)

Agent: `wf_550bf7a2-670`, 59 tool uses, 13.6 min, no repo writes. Records:
`impl-gap-register/result.json`, `report.md`. Root verified the two evidence-boundary findings
(damaged, unpinnable local dsh clone with ~25 empty package groups; worktree at `main`, AMC read
via `git archive`), added three root-check rows (E-01, G-06, G-07) and wrote the register with a
preamble. The 2026-09-08 dsh analysis cites GitHub at the pinned commit and stands. Re-cloning
the comparator is a third-party download and awaits Sid. No superiority language; all
"AMC-ahead" cells are mechanism-presence statements with caveats.

### impl:harness-breadth — IMPL-7, REPORT_ONLY → `plans/research/harness-breadth-2026-09-12.md`

Agent: `wf_6fbda2c5-fe7`, 64 tool uses, 11.9 min, no repo writes, no installs, no binaries.
Records: `impl-harness-breadth/result.json`, `report.md`. Seven harnesses pinned from official
sources with retrieval timestamps; every §7a cell "not evaluated" with the reason; one grep-verified
AMC absence per harness. Root spot-checked three absence greps at `505a28ce` and added a note
that AMC's application-level egress check (`src/enforce/egressProxy.ts`) exists outside the
native sandbox path. No ranking language anywhere; "better than" appears only in the disclaimer.

### impl:docs-reading-order — IMPL-8, REPORT_ONLY → `docs/READING_ORDER.md` + promoted-guide fixes (`84c564ca`)

Agent: `wf_3cdbc4a3-f55`, 62 tool uses, 17.8 min, no repo writes. Records:
`impl-docs-reading-order/result.json`, `report.md` (Document 2 is the retirement/fix list).
Root wrote the reading order, verified each promoted false-command line against the registered
Commander name in root, and corrected them (11 deprecated `amc wrap` recipes, `memory`,
`notary log-verify`, `sector pack list/run`, `guide --frameworks`, `mcp config`). Checks in root:
`scripts/docs-drift-check.mjs` passed (2,392 files), `publicDocsArtifact` + `publicDocsGraph`
10/10. Remaining dispositions and the "142 packs" count are AMC-1550. The agent confirmed the
five §2 facades are absent at `505a28ce` (only history comments remain).

### readiness:b0-b1 — REPORT_ONLY → `AMC_OS/RESEARCH/2026-09-12-release-readiness/README.md` (`4938dd8d`)

Agent: `wf_c844d75d-d8d`, 41 tool uses, 10.5 min. B0 trust root mostly mitigated in code with
three residuals; no key-rotation proof in the repo; hygiene list re-verified (two named
directories still tracked; one new stray tracked vault workspace, untracked by root in `7cfcb767`);
B1 credentials all absent from the shell; B2 `release:verify-version` and `release:prepack-check`
green on the exported tree. Nothing else exercised. Phase B remains closed behind Phase A and
the two §12 gates.

### impl:inbox-spill — IMPL-9, COMPLETE → integrated as `b76967e9`

Agent: `wf_8777d01c-fc6`, worktree `.claude/worktrees/wf_8777d01c-fc6-1`, base `cb251cbe`, 96
tool uses, 48.6 min. Records: `impl-inbox-spill/result.json`, `report.md`. Closes the inbox and
audio doors `fa2ffac6` left fail-closed (13 files changed, `tests/sessionInboxSpill.test.ts`
added). Root re-verification at `b76967e9`:

| Check | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` / `npx tsc -p tsconfig.tests.json --noEmit` | exit 0 / exit 0 |
| `node scripts/architecture-boundaries-check.mjs` | `failures: []` (`sessionService.ts` 799 lines by `wc`) |
| `pnpm build` | exit 0 |
| 31 files: three spill suites + every test importing a changed module + continuity, Studio task, media and provider files | 31 files, 474/474 passed, 120.7 s |
| Mutation M2 — commitment no longer bound to the queued message id | 1 failed / 17 passed: exactly the descriptor-refusal test |
| Mutation M3 — commitment no longer required to precede the row | 1 failed / 17 passed: exactly the descriptor-refusal test |
| Mutation M4 — audio fail-closed exception restored | 2 failed / 16 passed: exactly the two audio-spill tests |
| Mutation M5 — resolver failure returns the descriptor as bytes | 1 failed / 17 passed: exactly the descriptor-refusal test |
| tracked `.amc/keys/*` after every run | unchanged |

Not exercised in root: the agent's M1 (object before commitment; identical code path to the
`fa2ffac6` mutation already red in root), full suite, release gate, fresh clone, JSONL backend.
Key-rotation cause narrowed (see the execution log): first run in a fresh worktree creates a
vault at cwd; root's vault exists, so root is unaffected. Linear: AMC-1547 (comment posted).

### Fresh-clone acceptance, candidate D `6010f97c` — NOT accepted; repaired in `b3a0a71c`

Reproduced per the brief's receipt rule with `fresh-clone/fresh-clone-validate.sh` (copied from
the 2026-09-12 receipt): `git clone` of root into the scratchpad (`clone-d`), `git checkout
6010f97c`, `pnpm install --frozen-lockfile --prefer-offline`, then every step below; Darwin
25.6.0 arm64, Node v25.5.0, pnpm 10.33.0. Logs: `fresh-clone/candidate-d/`.

| Step | Result | Seconds |
|---|---|---|
| install / build / typecheck-src / typecheck-tests / openapi-check | all exit 0 | 2 / 36 / 29 / 41 / 0 |
| full suite (`vitest run`) | **1,481/1,484 files, 14,097/14,101 tests, 4 failed, 0 skipped** | 357 |
| Python lanes (`sdk/python`, built CLI) | 290 passed, **21 failed**, 1 skipped — the same `test_validation_installed.py` installed-wheel cases as on 2026-09-12 (pre-existing; not a regression) | 79 |
| release gate (`pnpm release:gate`) | **13/14 executed checks passed, 1 failed (full suite), 1 skipped** (live-deploy-health: no `AMC_RELEASE_GATE_LIVE_URL`) | 619 |

The four failures, classified and repaired in `b3a0a71c`: (1) `assertionQuality` — the first-run
agent's `tests/firstRunDoctor.test.ts:172` added a standalone `toBeGreaterThanOrEqual(0)`, the
82nd against a budget of 81 → replaced by the concrete expectation (FAIL at index 0,
`runtime-firewall-policy`), budget untouched; (2) `acpAgentServer` "declares only what it can
honour" — a fixed 20 ms handshake wait outlasted under full-suite load (passes 13/13 alone in
root) → bounded poll for the reply; (3–4) `publicStatsDrift` ×2 — seven new test files moved
the inventory 1,477 → 1,484 → counts regenerated in the clone and ported (10 generated files;
the generator measured 143 registered assurance packs / 149 files, relevant to AMC-1550).
After the run the clone's tracked `.amc/keys/*` were rewritten with `*.previous-*` backups —
the same first-run-without-a-vault effect seen in every fresh checkout (see the log); the
clone is not claimed clean after execution. No number here is a receipt for the repaired
candidate; candidate E follows.

### Fresh-clone acceptance, candidate E `6e7875f2` — ACCEPTED (source and local-package qualification only)

Reproduced per the brief's receipt rule with `fresh-clone/fresh-clone-validate.sh`: `git clone`
of root into the scratchpad (`clone-e`), `git checkout 6e7875f2`, `pnpm install
--frozen-lockfile --prefer-offline` (local store), then every step below. Environment: Darwin
25.6.0 arm64, Node v25.5.0, pnpm 10.33.0. Clean tree after checkout. Logs:
`fresh-clone/candidate-e/`.

| Step | Result | Seconds |
|---|---|---|
| install / build / typecheck-src / typecheck-tests / openapi-check | all exit 0 | 2 / 36 / 26 / 35 / 0 |
| full suite (`npx vitest run`) | **1,484/1,484 files, 14,101/14,101 tests, 0 failed, 0 skipped** | 349 |
| Python lanes (`sdk/python`, `pytest tests`, built CLI) | **290 passed, 21 failed, 1 skipped** — the failures are the same `test_validation_installed.py` installed-wheel cases recorded on 2026-09-12 (pre-existing; blocker for Sid, unchanged) | 76 |
| release gate (`pnpm release:gate`) | **14/14 executed checks passed, 0 failed, 1 skipped** (live-deploy-health: no `AMC_RELEASE_GATE_LIVE_URL`) | 604 |

After the run the clone's tracked `.amc/keys/*` were rewritten with `*.previous-*` backups (the
first-run-without-a-vault effect); nothing else differed, and the clone is not claimed clean
after execution. This qualifies the source and the locally packed package at `6e7875f2` on
Darwin arm64 / Node v25.5.0; it is not platform, published-package or deployed-release
qualification, and no AMC-1505 child moves to Done on its strength alone (the per-issue
reconciliations follow). Candidate E contains every fleet integration of 2026-09-14
(`fa2ffac6`…`b76967e9`), the root follow-ups, the research and readiness records and the
candidate-D repairs.

### Root follow-ups landed between agents

| Commit | Change | Verification in root |
|---|---|---|
| `83207148` | `projectSessionUpdates` passes its own history to `projectAcpAttachment`, so `session/load`, history continuity and the Studio task projection enforce commitment-before-attachment ordering (closes the spill agent's blocker item 5; `docs/SESSION_SPILL_LIFECYCLE.md` updated) | new assertion in `tests/sessionAttachmentSpill.test.ts` red before the change, green after; 8 projection-caller test files 104/104; both tsc profiles exit 0 |
| `8a66b5ef` | `tests/sessionAttachmentSpill.test.ts`: a text attachment above the cap is retained through spill and replays as its original text (closes a "not exercised" item of the spill receipt) | 10/10 in the file; behaviour pre-existing, covered by the M1/M2 mutations above |
| `97e1660b` | `SubagentRunner` may declare its hook control; `createDriverRunner` declares "inherited"/"none", the kernel's forwarding closure and schedule wrapper carry it through; `spawnSubagent` records an undeclared (injected/foreign) runner as an `undeclared-runner` audit row in the parent session before calling it (closes the hook-inheritance agent's first blocker) | new test; mutations M6 (driver declares nothing → 2 red) and M7 (kernel closure declares nothing → grandchild test red), restored; 30 files 339/339; tsc and boundaries clean |
| `06d084d7` | AMC-1528 follow-ups: `scripts/install-persona-qa.mjs` exports its step runner `run` (behaviour unchanged; script SHA-256 now `1831aaf7b773aa81…`, superseding the `c1f410b3…` recorded on 2026-09-09); new test "records a slow install that hits its timeout as failed with the spawn error, and leaves every consumer unrun"; `docs/RELEASE_RUNBOOK.md` section "Install persona QA receipt (schema 2026-09-08)" | 4 persona/gate test files 53/53; mutation (a timed-out step reads as passed) turned the new test red, restored |

Still open from AMC-1528: the tracked `.amc/release-gate/latest.json` (2026-08-25, schema 2026-05-23) embeds the retired rating text; refreshing it means running the gate, which must not happen in the shared root — left for the next fresh-clone gate run or an untrack decision.
