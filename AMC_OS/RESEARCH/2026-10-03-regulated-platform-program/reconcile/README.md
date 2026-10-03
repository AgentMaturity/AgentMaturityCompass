# AMC-1505 child reconciliation at 8f57ce63

Source: `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da` (branch worktree-wf_5210e2f4-3ea-20). Run on 2026-10-03.

Environment: Darwin 25.6.0 arm64; Node v25.5.0 (outside the supported 22/24 production pair, so these runs are source observations, not platform qualification); pnpm 10.33.0; vitest 4.1.11; isolated git worktree nested under the root checkout; pnpm install --frozen-lockfile --prefer-offline exit 0; pnpm build exit 0 (run once, needed by tests/studioNativeTaskService.test.ts).

Scope: the 21 AMC-1505 children listed by the task (AMC-1525 to AMC-1548, excluding 1524 Canceled and 1526/1528/1544 Done). The task said 23. Linear lists 45 children under AMC-1505; the AMC-1524..1548 range has 25 issues, and removing the 4 skipped ones leaves 21. 23 matches only if Todo AMC-1549 and AMC-1550 are added. Those two were not in the task's list and were not reconciled.

Receipts were checked read-only in the ROOT checkout (/Users/sid/AgentMaturityCompass). AMC_OS/ is gitignored (.gitignore:81); 'untracked' = present on disk only, 'tracked' = committed with git add -f and present in HEAD.

Boundary: these are focused source-test observations on macOS arm64 with Node 25.5.0. They are not package, platform or release qualification. No full suite, release gate, container, VM, browser, installed package or real provider was run. Every issue's Done contract still requires a fresh merged-candidate full suite and named release-gate disposition. All 74 distinct claimed commits checked are ancestors of HEAD.

| Issue | Linear state | Verdict | Focused tests (this run) | Mutation probe | Defects |
|---|---|---|---|---|---|
| AMC-1525 | In Review | PARTIAL | 6 files, 67/67 passed | RED | none |
| AMC-1527 | In Review | PARTIAL | 14/14 passed | RED | none |
| AMC-1529 | In Review | PARTIAL | 21/21 passed (6 + 10 + 5) | RED | none |
| AMC-1530 | In Progress | OWNER_INPUT | unmutated 34/34 passed; under mutation 34/34 passed (survived) | SURVIVED | MEDIUM scripts/package-desktop-installers.mjs:120 |
| AMC-1531 | In Review | PARTIAL | 10 files, 122/122 passed | RED | none |
| AMC-1532 | In Review | PARTIAL | 11/11 passed | RED | none |
| AMC-1533 | In Review | PARTIAL | 39/39 passed | RED | none |
| AMC-1534 | In Review | PARTIAL | 34/34 passed | RED | none |
| AMC-1535 | In Review | PARTIAL | 15/15 passed | RED | none |
| AMC-1536 | In Review | PARTIAL | 108 passed, 10 skipped (needs build); build exit 0; 10/10 passed | RED | none |
| AMC-1537 | In Review | PARTIAL | 21/21 passed | RED | none |
| AMC-1538 | In Review | PARTIAL | 139/139 passed | RED | none |
| AMC-1539 | In Review | PARTIAL | 23/23 passed | RED | none |
| AMC-1540 | In Progress | PARTIAL | 23/23 passed | RED | none |
| AMC-1541 | In Progress | PARTIAL | 69/69 passed unmutated and under both mutations | SURVIVED (2 probes) | MEDIUM src/studio/nativeTaskService.ts:475 |
| AMC-1542 | In Progress | PARTIAL | 35/35 passed | RED | LOW src/bridge/bridgeAuth.ts:214 |
| AMC-1543 | In Progress | PARTIAL | 6/7: publicDocsArtifact 3/4 (missing source-revision links, environment), pagesWorkflowRuntime 3/3; 4/4 passed | RED | LOW tests/publicDocsArtifact.test.ts:156 |
| AMC-1545 | In Progress | PARTIAL | 122/122 passed | RED | none |
| AMC-1546 | In Progress | PARTIAL | 30/30 passed | 1 SURVIVED, 1 RED | LOW src/studio/studioServer.ts:6406 |
| AMC-1547 | In Progress | PARTIAL | 173/173 passed | RED | none |
| AMC-1548 | In Progress | PARTIAL | 48/48 passed | RED | none |

## Verdict key

- HOLDS: every claim verified and the DoD complete. No issue reached this.
- PARTIAL: the claims hold at HEAD, but DoD items are missing (fresh-candidate acceptance, full suite, release gate, installed/platform lanes).
- DECAYED: a claim is no longer true at HEAD. None found.
- OWNER_INPUT: the remaining DoD needs hosts, credentials or a human. AMC-1530 needs native Windows and Linux AMD64 hosts.

## Defects found

- AMC-1530 MEDIUM `scripts/package-desktop-installers.mjs:120`: No automated regression covers the fda6e7ff npm-failure propagation. Disabling `if ($InstallExitCode -ne 0)` left desktopLauncherRuntime, publicDistributionTruth, desktopAppThemePackaging, publishedInstallerVersion and doctorNativeModuleProbe green (34/34). The only evidence is a one-off PowerShell 7.6.5 run on macOS; pwsh is not on PATH on this host now.
- AMC-1541 MEDIUM `src/studio/nativeTaskService.ts:475`: Acceptance requires active, pending and unsealed tasks to refuse archival, but no test fails when the guards are removed. Disabling ARCHIVE_NOT_CLOSED (an open native session) left 69/69 passing across 5 files; disabling ARCHIVE_UNCERTAIN (line 470, pending submission) left 62/62 passing across 4 files. No test references ARCHIVE_BUSY, ARCHIVE_UNCERTAIN or ARCHIVE_NOT_CLOSED. The descriptor schema refinement (nativeTaskDescriptors.ts:33) may still reject an archived descriptor that has a pendingTurn, but nothing asserts that either.
- AMC-1542 LOW `src/bridge/bridgeAuth.ts:214`: PLAUSIBLE, not reproduced: Bridge (bridgeAuth.ts:214), workspace router (workspaceRouter.ts:671), wire dispatcher (wireDispatcher.ts:206) and Studio (studioServer.ts:1152) call verifyLeaseRevocationsSignature and then re-read the list with loadLeaseRevocations. That is two reads, so a concurrent workspace writer could swap the list between check and use. revokedLeaseIdSet and the hardened writer authenticate one snapshot instead.
- AMC-1543 LOW `tests/publicDocsArtifact.test.ts:156`: The test depends on its environment. In this git worktree nested under the root checkout, TypeDoc wrote no source URLs: reflection.json has 0 'url' fields, so `/blob/<revision>/` was missing and the test failed 3/4. The same commit passed 4/4 in a standalone clone. A generator run from a nested worktree would silently publish the API reference without source links.
- AMC-1546 LOW `src/studio/studioServer.ts:6406`: No test isolates the intent-owner refusal placed before executeIntent. Removing it left 30/30 passing. The mixed static-A/lease-B case is refused 401 at credential authentication, and the lease check binds expectedAgentId to the intent's agent. Under brief rule 7 this guard is either decoration or lacks a test where it alone decides.

## Worktree hygiene

Every mutation was restored with `git checkout -- <file>`, and its sha256 prefix was re-checked against the pre-mutation value. `.amc/keys` was unchanged, and no `*.previous-*` files were created. `git status --porcelain` was empty before these receipts were written. The AMC-1543 checks ran in a disposable clone under the session scratchpad, not in the root checkout.

Per-issue detail: `AMC-15xx.json` in this directory.
