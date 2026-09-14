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
