# Phase A step 0 — read-only worktree audit refresh, September 12, 2026

**Audit only. Not acceptance, qualification, a clean baseline, or Phase A completion.**

Captured 2026-09-12T13:16:01Z; written 2026-09-12T13:17:37.992957+00:00. Integration `4d2d69e5d4d01bfd1f82662ceff0305b5c2885b5` on `amc/gap-register-execution` (unchanged since the September 11 refresh). Environment: Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0; no Node, test, typecheck or build was executed. Shared stash `152a61696f336f658893a72aa9357d58df8c5679` present and untouched.

## Measured totals

| Measure | Count |
|---|---:|
| worktrees | 63 |
| dirtyWorktrees | 15 |
| rootDirtyPaths | 242 |
| rootTracked | 99 |
| rootUntracked | 143 |
| localBranches | 125 |
| unmergedLocalBranches | 90 |
| prunableRegistrations | 0 |

## Delta against refresh-2026-09-11T080851Z

| Worktree | Delta |
|---|---|
| /Users/sid/AgentMaturityCompass | {"dirtyPaths": [239, 242]} |

Root dirty paths added since September 11 (all P01 lane authoring dated 2026-09-11 14:30–14:38 local):

- `src/agent/nativeRunUsage.ts`
- `src/cli.ts`
- `src/setup/nativeChatResult.ts`
- `src/setup/nativeInteractiveApprovals.ts`
- `src/setup/nativeInteractiveSession.ts`
- `tests/cosBatch1OllamaUsage.test.ts`
- `tests/cosBatch1ProviderIntegration.test.ts`
- `tests/cosProduct01Approvals.test.ts`
- `tests/cosProduct01Chat.test.ts`
- `tests/cosProduct01Usage.test.ts`

Root dirty paths removed since September 11: none

## Root dirty-path classification by lane

Lane names follow `plans/ownership-manifest.md` (2026-09-11 native product batch table). "Recoverable work" here means authored, unmerged, import-wired source that is the integration target of this session; it is not a correctness or acceptance claim.

| Lane | Paths | Classification |
|---|---:|---|
| P05 providers/modalities | 99 | recoverable work |
| P08 ACP | 17 | recoverable work |
| P04 extensions/plugins | 16 | recoverable work |
| AMC-1512 human first-use protocol | 14 | recoverable work |
| P02 terminal/PTY | 13 | recoverable work |
| cross-lane wiring (agent loop/session/kernel/CLI registration) | 12 | recoverable work |
| P01 native CLI/chat/approvals/usage | 12 | recoverable work |
| P10 Studio native tasks backend | 11 | recoverable work |
| AMC-1518/1530/1538 batch-01/02 corrections | 10 | recoverable work |
| P06 Python SDK | 10 | recoverable work |
| bookkeeping (plans/receipts/navigation) | 9 | bookkeeping |
| P09 Studio console assets | 7 | recoverable work |
| P03 MCP client/HTTP/reconnect | 6 | recoverable work |
| P07 TypeScript SDK | 5 | recoverable work |
| unknown | 1 | unknown |

Every one of the 52 untracked `src/` files is imported by at least one other `src/` file (`untracked-import-wiring.tsv`); the authored source is wired at import level. Whether it compiles or passes is not established by this audit.

## Concurrent-session observation

Newest modification among root dirty paths: 2026-09-11T09:08:14.185326+00:00. No dirty path changed in the three hours before capture. Codex app-server and Claude desktop processes exist on the host; the lane sessions are dormant by file activity, not proven closed. Per the user's 2026-09-12 directive this session integrates the lane authoring in root; ownership is declared in `plans/ownership-manifest.md`.

## Worktrees and unmerged branches

All 63 registrations, HEADs, branches, dirty counts and exclusive-commit counts match the September 11 capture exactly, so the September 11 branch classification (1 superseded by patch equivalence, 89 unknown) is carried forward by reference, not re-derived. Unknown remains preserve-and-resolve, never abandonment. The three worktrees registered outside `AgentMaturityCompass-worktrees/` (`/private/tmp/amc-1541-*`, `/private/tmp/amc-1542-*`) and the `tmp/` Codex worktrees are all clean with zero exclusive commits.

## Files

`inventory.json`, `root-status.txt`, `worktree-status.tsv`, `worktrees-porcelain.txt`, `untracked-import-wiring.tsv`, `manifest.json`.

No reset, stash operation, worktree removal, stage, commit, checkout, source modification, test, build, provider/human execution, signing, publication or deployment occurred.
