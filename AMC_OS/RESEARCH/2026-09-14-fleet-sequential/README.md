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

### Root follow-ups landed between agents

| Commit | Change | Verification in root |
|---|---|---|
| `83207148` | `projectSessionUpdates` passes its own history to `projectAcpAttachment`, so `session/load`, history continuity and the Studio task projection enforce commitment-before-attachment ordering (closes the spill agent's blocker item 5; `docs/SESSION_SPILL_LIFECYCLE.md` updated) | new assertion in `tests/sessionAttachmentSpill.test.ts` red before the change, green after; 8 projection-caller test files 104/104; both tsc profiles exit 0 |
| `06d084d7` | AMC-1528 follow-ups: `scripts/install-persona-qa.mjs` exports its step runner `run` (behaviour unchanged; script SHA-256 now `1831aaf7b773aa81…`, superseding the `c1f410b3…` recorded on 2026-09-09); new test "records a slow install that hits its timeout as failed with the spawn error, and leaves every consumer unrun"; `docs/RELEASE_RUNBOOK.md` section "Install persona QA receipt (schema 2026-09-08)" | 4 persona/gate test files 53/53; mutation (a timed-out step reads as passed) turned the new test red, restored |

Still open from AMC-1528: the tracked `.amc/release-gate/latest.json` (2026-08-25, schema 2026-05-23) embeds the retired rating text; refreshing it means running the gate, which must not happen in the shared root — left for the next fresh-clone gate run or an untrack decision.
