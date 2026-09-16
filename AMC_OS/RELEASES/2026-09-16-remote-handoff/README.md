# Remote development handoff — 2026-09-16

## Scope and integration

Starting development commit: `2035b20034984aec847607879828171c93f91f03` on `amc/gap-register-execution`.
Starting GitHub `main`: `3d6b8d4a0c010c9fcd6e0abd410cb4635a218268`, 462 commits behind the development branch.

All 82 registered worktrees and all 189 initial local branches were reviewed. The 193 development paths left dirty in 21 worktrees are now preserved in source snapshot commits (see `source-snapshots.json`). The snapshots retain original files for recovery. Their obsolete implementations are superseded by the integrated product, as documented per path in `worktree-dispositions.json`. Reviewed historical branches are joined with an `ours` history merge; this preserves recoverable ancestry while retaining the current implementation and security corrections. Two duplicate compliance reports now redirect to current canonical reports, and the old PII fixture uses an example.com address. The generated API reference was refreshed.

Local-only exclusions: 93 generated/runtime entries across worktrees (public key histories, Python build outputs, and one node_modules symlink). These are not development dependencies. The March stash contains obsolete generated evidence/dashboard/compliance artifacts and remains untouched locally. No credential, private runtime state, dependency tree, or compiled build output is included in the source snapshot commits. The two obsolete /private/tmp worktree registrations already point to integrated commits; their residual directories are preserved.

## Continue on another device

Install Node 22 (the version in `.nvmrc`) and pnpm 10.33.0, then:

```sh
git clone https://github.com/AgentMaturity/AgentMaturityCompass.git
cd AgentMaturityCompass
git switch main
pnpm install --frozen-lockfile
pnpm run build
npm run typecheck:tests
npm test
```

For an existing clone, commit/stash its own edits, then `git fetch origin` and `git switch main && git pull --ff-only` before installing. Use pnpm for dependency installation: the vendored packages use `workspace:*`. When switching Node major versions in an existing checkout, run `pnpm rebuild better-sqlite3` to refresh the native SQLite binding.

The tracked continuation plan is `plans/amc-dsh-pi-execution-2026-09-08.md`; ownership/status is `plans/ownership-manifest.md`. The latest development status records 35 remaining issue reconciliations as a sequential workflow. This Git handoff does not close those product/evidence tasks.

A fresh clone should not need this Mac's worktree directories, absolute symlinks, installed dependencies, or local key state. For a portable end-to-end installation check, run `npm run check:clean-source`. It clones committed HEAD and verifies a keyless native tool turn, signed evidence, and session continuation across processes with an isolated home directory.

## Verification

Validation and final remote synchronization are in progress. The completed receipt will be added before final delivery. Current Python results: platform 1,609 passed; SDK 311 passed and one optional native fixture lane skipped. These outcomes do not qualify real-provider operation, deployed health, all native platforms, or publication.
