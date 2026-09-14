# IMPL-1 — large attachments through the encrypted spill store (PARTIAL)

**Boundary.** Source commit 43f61d5eaabccc5652e1021e439cefbed6901eae (amc/gap-register-execution), worked in worktree branch `worktree-wf_e54e6c35-3e3-1` at `/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_e54e6c35-3e3-1` (fast-forwarded from 3d6b8d4a, the merge-base, before any edit). Environment: Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0, vitest 4.1.11, `AMC_VAULT_PASSPHRASE` and `AMC_NO_SIGN` unset in the shell. `pnpm install --frozen-lockfile --prefer-offline` exit 0. No `pnpm build`, no generators, no commits. Every number below was produced in this session.

## What was done (attachment door, end to end)

- `src/session/spill/spillInput.ts` (new, 202 lines): descriptor codec (`amc-spilled-input@1`: locator, contentSha256, bytes; canonical-encoding check), `SpilledInputRetentionError` (stage prepare/commit/persist), `resolveSpilledInputPayload` (descriptor-vs-signed-ref cross-check, optional commitment-precedes-row check when history is supplied, then `inspectSpilledEvent` — row hash + monitor signature + object digest/length — plus a final digest/length recheck).
- `src/session/spill/spillPolicy.ts`: `SessionSpillPolicy.retainInput` — prepare in memory, sync commitment callback, then publish; every failure throws with its stage (no preview degradation for inputs).
- `src/session/sessionPayloadCap.ts`: `SessionSpillCapError`, `sessionSpillCap` = min(retention.maxBlobBytes, 0xffffffff), `assertSessionPayloadRetainable`, `attachmentPayloadRoute` (audio stays fail-closed at the per-event cap).
- `src/session/sessionService.ts` (recordUserAttachment path only): above the cap, validated image/text bytes go through `retainOversizeAttachment` → signed `tool/spill-commitment` row (`subject: "user/attachment"`, filename, `spilled` ref) → object → `user/attachment` row with descriptor payload, `spilled` ref, original `bytes`, slot digest over original bytes. File is 799 lines (`wc`), 800 by the gate's count, cap 800; it was 790 at base.
- `src/llm/request/requestSources.ts` (send + cold derive): resolves spilled attachments with the projection prefix as history; commitment row id joins `sourceEventIds`; image/audio part `sha256` is now the digest of the bytes carried.
- `src/acp/acpImageHistory.ts`: `projectAcpAttachment(workspace, event, history?)` resolves spilled attachments; refusals `payload-missing` / `payload-key-unavailable` / `evidence-inconsistent`.
- `docs/SESSION_SPILL_LIFECYCLE.md`: appended section "Spilled user attachments" (behaviour, failure states, what readers verify, what is not done).

## Tests (measured)

| Command | Result |
|---|---|
| `npx vitest run tests/sessionAttachmentSpill.test.ts` before implementation | 1 file failed to import (RED) |
| `npx vitest run tests/sessionAttachmentSpill.test.ts tests/sessionPayloadCap.test.ts` after implementation, before updating the cap test's contract | 10 passed / 2 failed |
| same, final | 12 passed / 0 failed |
| 19 files importing requestSources/deriveRequest/acpImageHistory/recordUserAttachment/sessionPayloadCap/spillPolicy/spillInput/ingestAttachment (acpFailedTurnUpdates, agentLoopReconstructable, anthropicCacheBreakpoints, attachmentIngest, cosProduct05OllamaRuntime, cosProduct08Continuity, deepseekNativeIntegration, nativeAcpImageInput, nativeChatImageInput, nativeOrderedAcpImageInput, nativeResponsesImageInput, nativeSignedAudioColdHostile, nativeSignedAudioInput, nativeSignedImageInput, promptContext, providerToolNameBinding, sessionAttachmentSpill, sessionPayloadCap, surfaceHistoryCompaction) | 293 passed / 0 failed, 58.5 s |
| 12 spill-group files (sessionSpillCommitment, sessionSpill, spillLifecycle, retentionSpill, sessionSpillRead, bundleSpill, cliSpillCommands, spillEncryption, nativeSignedImagePublicInput, nativeSignedAudioPublic, nativeSignedAudioRuntime, nativeSignedToolSubset) | 211 passed / 0 failed, 48.4 s |
| final rerun after line-count compaction: sessionAttachmentSpill, sessionPayloadCap, nativeSignedImageInput, nativeAcpImageInput, nativeSignedAudioInput, attachmentIngest | 82 passed / 0 failed |
| `npx tsc -p tsconfig.json --noEmit` / `npx tsc -p tsconfig.tests.json --noEmit` (final) | exit 0 / exit 0 |
| `node scripts/architecture-boundaries-check.mjs` (final) | sessionService.ts 800 (not over cap); remaining failures only `dist/cli.js` and `dist/api/index.js` missing (no build run) |

The new file's live-request test drives the real `LlmRuntime` with a scripted Anthropic SSE transport (no live provider) and spawns a fresh process (`tests/fixtures/nativeSignedImageCold.ts`) that derives identical request bytes from the spilled row. The 19- and 12-file runs were executed on the code immediately before the final line-count compaction of `sessionService.ts`/`sessionPayloadCap.ts`; the 6-file run and both tsc profiles were executed on the final code. The full suite was not run.

## Mutation verification

- **M1** (`retainInput`: publish the object before the commitment callback, later persist a no-op): 2 failed / 10 passed — exactly "a signed commitment row is durable before any object exists…" and "a commitment refused at admission never publishes an object…". Restored; `grep -c MUTATION` = 0.
- **M2** (`resolveSpilledInputPayload`: accept an absent commitment row): 2 failed / 10 passed — exactly the ACP "commitment absent from supplied history" assertion and the derive "deleted commitment row" assertion. Restored; `grep -c MUTATION` = 0.
- Not mutated: the descriptor-vs-ref cross-check (reaching a mismatch requires rewriting both payload and `payload_sha256`, which the callers' payload-digest check and the row-hash check already refuse).

## Not done / decisions

- **Inbox door left fail-closed** (`LoopInbox.insert`, nativeTaskService cap helpers unchanged). All claim paths (`src/agent/nativeImageMessage.ts`, `nativeOrderedMessage.ts`, `nativeAudioMessage.ts`) and the continuity validators (`src/acp/acpHistoryContinuity.ts`, `src/session/nativeAudioProvenance.ts`, `src/studio/nativeTaskProjection.ts`) re-read and decode the inbox row payload and are outside this track's write scope; spilling at the door would fail at claim time. Exact remaining steps are listed in `blockers`.
- Audio attachments stay fail-closed at the cap (same provenance reader).
- `tool/spill-commitment` reused with a `subject` meta key; a dedicated type needs `src/types.ts`/`src/session/sessionTypes.ts`.
- `tests/sessionPayloadCap.test.ts` attachment case updated: its old assertion was exactly the behaviour this track changes; the inbox case is unchanged.
- **Hygiene finding:** the first run of the new test file (10:02:25 local) modified the checkout's tracked `.amc/keys/*` and created four `*.previous-<sha>` files; restored with `git restore -- .amc/keys` and deleted. Did not recur in later runs including the same file; cause not located within budget (prime suspect: the since-removed test variant stubbing `AMC_VAULT_PASSPHRASE` to undefined).

## Not exercised

`pnpm build`; full suite; JSONL backend for spilled attachments; `AMC_NO_SIGN=1` refusal; a text-kind attachment retained through spill (allowed by code; only the above-maxBlobBytes refusal used text); spilled rows with ordered/audio provenance (unreachable while the inbox stays capped). Source qualification of authored tests only — not package, platform or release acceptance.