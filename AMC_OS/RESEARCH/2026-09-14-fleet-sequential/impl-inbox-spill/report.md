# IMPL-9 — queued inbox inputs and audio attachments through the signed spill store

**Commit:** cb251cbe06e1e3aae4d42b0ea06724d60f09d1fb (worktree `/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_8777d01c-fc6-1`, own branch fast-forwarded from 3d6b8d4a with `git merge --ff-only`; no commit made).
**Environment:** Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0, vitest 4.1.11, `pnpm install --frozen-lockfile --prefer-offline`, `pnpm build` (needed only by tests/nativeValidationOutcomeSurfaces.test.ts).

## What was done (all five steps of the brief)
1. `src/session/spill/spillInput.ts` (additive): `SPILL_INBOX_SUBJECT`, `SPILL_INBOX_MESSAGE_META_KEY`, `SpillCommitmentSubject`, `spillCommitmentMeta`, `spillCommitmentNameSeed`, `resolveSpilledInboxPayload`; the object-read tail of `resolveSpilledInputPayload` is shared as private `readCommittedObject`.
2. `src/session/sessionService.ts`: `retainOversizeInput(what, bytes, cap, subject)` (generalized from the adjacent private attachment method, net-zero lines — see decisions), import line, one call site.
3. `src/session/sessionPayloadCap.ts` (additive `queuedInputPayloadRoute`; `attachmentPayloadRoute` no longer refuses audio).
4. `src/agent/inbox.ts`: door routes through `queuedInputPayloadRoute` + `retainOversizeInput`, descriptor becomes the row payload, meta unchanged; replay resolves via new exported `readQueuedInputBytes`.
5. `nativeImageMessage.ts`, `nativeOrderedMessage.ts`, `nativeAudioMessage.ts`: decode from `readQueuedInputBytes`; original refusal messages for pruned/missing/tampered preserved.
6. `acpHistoryContinuity.ts`, `nativeAudioProvenance.ts`: `originalBytes(workspace, events, row)` resolves loop/inbox rows through the inbox resolver and attachment/message rows through `resolveSpilledInputPayload`.
7. `nativeTaskService.ts`: bound = min(NATIVE_TASK_MAX_PARTS_BYTES, sessionSpillCap); advertised = bound − 512; 413 names both bounds.
8. Docs: `docs/SESSION_SPILL_LIFECYCLE.md` "Not done" paragraph replaced by a "Spilled queued inputs" section; audio sentence corrected.
9. `nativeTaskProjection.ts` unchanged (decodes no inbox row); verified through the new test.

## Measured results
- RED first: `tests/sessionInboxSpill.test.ts` 0/5 before implementation.
- GREEN: sessionInboxSpill + sessionPayloadCap + sessionAttachmentSpill = 18/18 (run before and after the mutation checks, identical).
- 25 affected files (every importer of a changed module plus the named image/audio/continuity/task suites): 390 passed, 13 failed only for missing `dist/`; after `pnpm build` that file 13/13. Net 403/403.
- `tsc -p tsconfig.json --noEmit` exit 0; `tsc -p tsconfig.tests.json --noEmit` exit 0.
- `node scripts/architecture-boundaries-check.mjs` failures []; `sessionService.ts` = 800 split lines (at cap, not over). `node scripts/docs-drift-check.mjs` passed (301 files).

## Mutation checks (each applied, run, restored; `grep MUTATION` = 0 afterwards)
| Property | Mutation | Result |
|---|---|---|
| Commitment durable before object | persist() before commitBeforeRetain in spillPolicy.retainInput | red: 12 tests across both spill suites incl. the new inbox ordering test |
| Commitment bound to messageId | drop messageId check in resolveSpilledInboxPayload | red: only sessionInboxSpill.test.ts:192 |
| Commitment must precede the row | scan whole history instead of the prefix | red: only :193 |
| Audio routes to spill | re-add audio SessionPayloadCapError | red: exactly the two audio tests |
| Readers never degrade to the descriptor | return descriptor bytes on unresolvable | red: :195 (throw expected) |

## Not exercised
- Full suite; package, platform and release qualification; live providers.
- JSONL session backend for spilled inbox rows (tests use the default store via `openSessionEventStore`).
- ACP `session/load` over the wire (only `projectSessionUpdates`, `validateAcpOrderedHistory`, `readNativeTaskProjection` exercised directly).
- No new test asserts the native task service's advertised `maxSerializedPartsBytes`; only the existing cosProduct10 suites ran green (they do not assert the old value).
- Cold request derivation for an inbox-derived spilled **audio** attachment (the code path in requestSources.ts is shared with images, which fa2ffac6's tests cover).

## Observation for the integrator
The first (RED) run of the new test rewrote the worktree's tracked `.amc/keys/*` (mtime 13:28:16) and left four `.previous-*` backups; I restored the eight files from HEAD and removed the backups, and later runs did not repeat it. Not attributed within budget.