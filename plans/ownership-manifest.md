# AMC ownership manifest — 2026-09-09

Standing order: `plans/2026-09-09-amc-execution-brief.md`; this Codex session and its workers use GPT-6 Astra. Phase A step 0 is complete and step 1 findings have been read. Other sessions and worktrees retain ownership of their files.

| Worker | Worktree / branch | Linear | Exact writable paths | State |
|---|---|---|---|---|
| Root | `/Users/sid/AgentMaturityCompass` / `amc/gap-register-execution` | AMC-1505 | `plans/ownership-manifest.md`; `plans/amc-dsh-pi-execution-2026-09-08.md`; `AMC_OS/RESEARCH/2026-09-09-worktree-audit/inventory.json`; `AMC_OS/RESEARCH/2026-09-09-worktree-audit/worktrees-porcelain.txt`; `AMC_OS/RESEARCH/2026-09-09-worktree-audit/README.md`; `AMC_OS/RESEARCH/2026-09-09-worktree-audit/classification-review.json`; `AMC_OS/RESEARCH/2026-09-09-worktree-audit/manifest.json` | Audit records only; no source changes |
| Astra audit: dirty worktrees | All existing worktrees, read-only | AMC-1505 | None | Finished; source classification only |
| Astra audit: unmerged branches | Shared repository, read-only | AMC-1505 | None | Finished; commit/patch classification only |
| Prior native workflow worker | Root, inherited model worker ended | AMC-1540 | None while paused | Partial uncommitted files preserved; ownership recorded in audit |

Paused AMC-1540 source owned by this task: `src/console/assets/nativeTaskSubmission.js`, `src/console/assets/nativeTasks.js`, `src/console/assets/nativeTasksView.js`, `src/console/assets/sw.js`, `docs/NATIVE_STUDIO_TASKS.md`. No acceptance was run. Resuming requires an updated manifest and Phase A queue reconciliation. The standing brief was created outside this task and is preserved.

## Audit completion records

The read-only Astra auditors have finished. Root owns only the audit records, execution log and these exact note/checkpoint updates; source implementation stays paused.

- `/Users/sid/Documents/AMC/AMC Home.md` and new checkpoint `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 AMC Home phase-a-audit checkpoint.md`
- `/Users/sid/Documents/AMC/Projects/AMC/AMC Now.md` and new checkpoint `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 AMC Now phase-a-audit checkpoint.md`
- `/Users/sid/Documents/AMC/Projects/AMC/AMC Roadmap.md` and new checkpoint `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 AMC Roadmap phase-a-audit checkpoint.md`
- `/Users/sid/Documents/AMC/MOCs/MOC - Current Operations.md` and new checkpoint `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 MOC - Current Operations phase-a-audit checkpoint.md`
- `/Users/sid/Documents/AMC/Evidence/2026-09-09 Phase A Worktree Audit.md`
- `AMC_OS/RESEARCH/2026-09-09-worktree-audit/record-sync.json`

Root audit handoff path: `AMC_OS/INBOX/REV_TECH_LEAD.md`. No other writer is active in this task. Next ownership assignment waits for Phase A queue reconciliation.

## Phase A step 1 — queue reconciliation

Audit step 0 is complete. Root owns the integration metadata below; all source implementation remains paused. Three GPT-6 Astra workers may inspect their assigned issue groups and committed source read-only and may write no files. They must use source `7bd1e8ce8e0b38c71f2d9792cd2e2043a1c3c544`, not the paused UI edits.

Root exact new writable paths:
- `AMC_OS/RESEARCH/2026-09-09-phase-a-reconciliation/issues.json`
- `AMC_OS/RESEARCH/2026-09-09-phase-a-reconciliation/reconciliation.json`
- `AMC_OS/RESEARCH/2026-09-09-phase-a-reconciliation/README.md`
- `AMC_OS/RESEARCH/2026-09-09-phase-a-reconciliation/source-presence.json`
- `AMC_OS/RESEARCH/2026-09-09-phase-a-reconciliation/known-open-review.json`
- `AMC_OS/RESEARCH/2026-09-09-phase-a-reconciliation/ground-truth.json`
- `AMC_OS/RESEARCH/2026-09-09-phase-a-reconciliation/record-sync.json`
- `AMC_OS/RESEARCH/2026-09-09-phase-a-reconciliation/manifest.json`

Read-only assignments: trust/session (AMC-1506,1507,1508,1511,1516,1522,1523,1525,1526,1534); native surfaces (AMC-1513,1514,1515,1519,1531,1532,1533,1535,1536,1537); distribution/interoperability (AMC-1509,1510,1517,1520,1521,1527,1528,1529,1539). AMC-1524 is user-stopped and receives metadata reconciliation only, without Graphify operations. Root reconciles AMC-1512,1518,1530,1538,1540,1541,1542,1543 and the standing brief's known-open source claims.

## Recovery implementation and reconciliation records

The read-only reconciliation workers have finished. Their findings are being persisted; they are source reviews, not new acceptance. AMC-1542 blocks trustworthy revocation enforcement and is the next implementation under the brief's truthfulness priority.

| Worker | Worktree / branch | Linear | Exact writable paths | State |
|---|---|---|---|---|
| Astra revocation recovery | `/private/tmp/amc-1542-revocation-20260909` / `codex/amc-1542-managed-revocation` | AMC-1542 | None after commit | Finished at `3c49ca9b45be57f8c0fb6515e23da7bbe736cd7e`, fast-forward integrated; no acceptance runs |
| Astra reconciliation recorder | Root / `amc/gap-register-execution` | AMC-1505 | `AMC_OS/RESEARCH/2026-09-09-phase-a-reconciliation/reconciliation.json`; `AMC_OS/RESEARCH/2026-09-09-phase-a-reconciliation/README.md` | Persist reviewed findings only; root temporarily yields these two paths |

Root additionally owns the following exact Obsidian updates and new checkpoints:
- `/Users/sid/Documents/AMC/AMC Home.md`
- `/Users/sid/Documents/AMC/Projects/AMC/AMC Now.md`
- `/Users/sid/Documents/AMC/Projects/AMC/AMC Roadmap.md`
- `/Users/sid/Documents/AMC/MOCs/MOC - Current Operations.md`
- `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 AMC Home phase-a-reconciliation checkpoint.md`
- `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 AMC Now phase-a-reconciliation checkpoint.md`
- `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 AMC Roadmap phase-a-reconciliation checkpoint.md`
- `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 MOC - Current Operations phase-a-reconciliation checkpoint.md`
- `/Users/sid/Documents/AMC/Evidence/2026-09-09 Phase A Queue Reconciliation.md`

Paused AMC-1540 source remains untouched by the recovery worker. The dirty `stoic-faraday-20e4ee` worktree is read-only. Root will serialize local integration after inspecting the explicit recovery diff; qualification follows in a fresh clean clone of the integrated candidate, after implementation.

## AMC-1540 resumed after revocation integration

Root resumes its own previously paused partial Studio retry implementation at integration `3c49ca9b45be57f8c0fb6515e23da7bbe736cd7e`. Exact writable paths: `src/console/assets/nativeTaskSubmission.js`, `src/console/assets/nativeTasks.js`, `src/console/assets/nativeTasksView.js`, `src/console/assets/sw.js`, `docs/NATIVE_STUDIO_TASKS.md`, `tests/studioNativeTaskSubmission.test.ts`, `tests/e2e/native-tasks-page.mjs`. No other worker may write these paths. Root still preserves `docs/ARCHITECTURE_NAVIGATION.md` and the externally authored execution brief. Tests and browser acceptance run after the batch in a fresh clone, not in root.

Root owns the new local implementation record paths: `AMC_OS/RESEARCH/2026-09-09-managed-revocation-recovery/README.md`, `AMC_OS/RESEARCH/2026-09-09-managed-revocation-recovery/source.json`, and `/Users/sid/Documents/AMC/Evidence/2026-09-09 Managed Hook Revocation Recovery.md`.

## AMC-1541 native task archival

AMC-1540 implementation is committed at `51404c77b91aa9f045453ecdae091d58d8203b72`; its acceptance remains deferred. The next implementation is AMC-1541.

| Worker | Worktree / branch | Linear | Exact writable paths | State |
|---|---|---|---|---|
| Root (Astra), taking over terminal worker | `/private/tmp/amc-1541-archive-20260909` / `codex/amc-1541-native-task-archive` | AMC-1541 | `src/studio/nativeTaskDescriptors.ts`; `src/studio/nativeTaskService.ts`; `src/studio/nativeTaskTypes.ts`; `src/api/nativeTasksRouter.ts`; `tests/studioNativeTaskDescriptors.test.ts`; `tests/studioNativeTaskService.test.ts`; `tests/studioNativeTaskAdmission.test.ts` | Worker reached usage limit; root continues its owned partial implementation; no acceptance runs |
| Root archive interface | Root / `amc/gap-register-execution` | AMC-1541 | `src/console/assets/nativeTasks.js`; `src/console/assets/nativeTasksView.js`; `src/console/assets/sw.js`; `docs/NATIVE_STUDIO_TASKS.md`; `tests/e2e/native-tasks-page.mjs`; `src/studio/nativeTaskOpenapi.ts`; `tests/openapiContracts.test.ts`; `website/openapi.yaml` | Finish operator archive/list control and public contract after backend interface agreement; generated YAML only from candidate clone |

Root additionally owns implementation records `AMC_OS/RESEARCH/2026-09-09-native-submission-recovery/README.md`, `source.json` in that directory, and `/Users/sid/Documents/AMC/Evidence/2026-09-09 Native Submission Recovery.md`. Recorder ownership of reconciliation README/JSON has returned to root. No worker may touch another session's root changes, signed configs, package.json, ledger or session spine.

## Implementation checkpoint — f00fd254

AMC-1541 backend `d018f15f` is integrated and root interface/OpenAPI-source changes are committed at `f00fd25464d1a7b69096b01337bb7e358506b274`. No archive worker remains active. Root owns follow-through; public generated YAML awaits generation from a candidate clone. No tests, build or acceptance have run for this batch.

Root exact new record paths:
- `AMC_OS/RESEARCH/2026-09-09-native-task-archive/README.md`
- `AMC_OS/RESEARCH/2026-09-09-native-task-archive/source.json`
- `/Users/sid/Documents/AMC/Evidence/2026-09-09 Native Task Archive.md`
- `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 AMC Home native-recovery-implementation checkpoint.md`
- `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 AMC Now native-recovery-implementation checkpoint.md`
- `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 AMC Roadmap native-recovery-implementation checkpoint.md`
- `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 MOC - Current Operations native-recovery-implementation checkpoint.md`

The read-only reconciliation snapshot remains pinned to7bd1e8ce, with dated implementation follow-through recorded separately. Metadata/Obsidian paths previously assigned to root remain root-owned.

## AMC-1543 public API reference recovery

Root serial ownership, integration branch, issue AMC-1543. Exact writable paths: `package.json`, `pnpm-lock.yaml`, `typedoc.json`, `.github/workflows/pages.yml`, `scripts/build-pages-site.mjs`, `docs/API_REFERENCE.md`, `docs/API_SURFACES.md`, `website/docs/index.html`, `tests/pagesWorkflowRuntime.test.ts`, `tests/publicDocsArtifact.test.ts`. Generated API output and lockfile resolution run only in a candidate clone, never the shared root. No TypeDoc or graph generator has run yet. The recovered branch `claude/eager-boyd` remains untouched; adapting its config/workflow to current TypeScript6, pnpm10 and Node22 is root-owned. No deployment is authorized by this implementation.

Root also owns `website/docs/docs.js` solely to register the new public API reference guide, keeping its link from API_SURFACES available in the staged docs viewer.

The new guide is `docs/PACKAGE_API_REFERENCE.md`. Existing generated `docs/API_REFERENCE.md` belongs to the separate CLI/HTTP reference; root restores its own mistaken overwrite exactly from HEAD and retains that existing guide unchanged. TypeDoc and guide links use the distinct package-guide path.

Root owns scratch clones under `/private/tmp/amc-phase-a-generation-20260909-*` for dependency resolution and generated artifacts from committed candidates, plus `AMC_OS/RESEARCH/2026-09-09-api-reference-recovery/README.md`, `source.json`, `lockfile-resolution.log` and `generation.json` in that directory. These are preparation records, not fresh merged-candidate acceptance. The generated lockfile may be copied back to its explicitly owned root path; root dependencies remain untouched.

## API recovery integrated; source-install follow-through

AMC-1543 source and lockfile are integrated at `1161fc92`. Root serially owns `scripts/clean-source-check.mjs`, `scripts/packed-evidence-verification.mjs`, `tests/cleanSourceDocs.test.ts`, `tests/packedInstallVerification.test.ts` and `docs/INSTALL.md` for AMC-1509 structured isolated-source qualification. Existing signed-evidence verification is reused; checks run after implementation in a fresh clone. The trust reconciliation worker may inspect AMC-1508 read-only and owns no writable paths.

Root additional exact records:
- `AMC_OS/RESEARCH/2026-09-09-clean-source-followthrough/README.md`
- `AMC_OS/RESEARCH/2026-09-09-clean-source-followthrough/source.json`
- `/Users/sid/Documents/AMC/Evidence/2026-09-09 Package API Reference Recovery.md`
- `/Users/sid/Documents/AMC/Evidence/2026-09-09 Clean Source Follow-through.md`
- `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 AMC Home api-recovery checkpoint.md`
- `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 AMC Now api-recovery checkpoint.md`
- `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 AMC Roadmap api-recovery checkpoint.md`
- `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 MOC - Current Operations api-recovery checkpoint.md`

## AMC-1508 persisted attribution regression

Astra trust worker owns only `tests/portalAttribution.test.ts` in root on `amc/gap-register-execution`, to replace mocked storage/role checks with real temporary SQLite and actual role policy. No commits, generators, tests or builds may run there. Root owns all other paths and will commit this exact file after reading its final diff. This is the authorized post-auth integration seam; it is not browser/cookie authentication acceptance.

## Candidate preparation — 79f36cfd

Trust worker is finished; its sole file was reviewed and committed at `79f36cfd4d0d33af34ce4a07979c5195b149ba99`. It owns no writable paths. The implementation batch is complete; root now prepares generated artifacts in an owned clone under `/private/tmp/amc-phase-a-generation-20260909-*`. Root additionally owns `AMC_OS/RESEARCH/2026-09-09-api-reference-recovery/candidate-preparation.json`, `candidate-install.log`, `candidate-build.log`, `candidate-generation.log`, and `candidate-typedoc.log` in that record directory. Outputs are preparation until a final merged-candidate fresh clone satisfies the standing evidence requirements. Existing root dependencies stay untouched.

## AMC-1544 generation correction

Root serially owns `scripts/update-native-task-openapi.mjs`, `tests/openapiContracts.test.ts` and already-owned `website/openapi.yaml` for the newly observed nullable-reference publication failure. Root also owns `AMC_OS/RESEARCH/2026-09-09-api-reference-recovery/candidate-generation-1544.log` and `/Users/sid/Documents/AMC/Evidence/2026-09-09 Nullable API Reference Publication.md`. The original generation failure log remains immutable. API reference staging running in the preparation clone is independent of this exporter correction.

Root owns exact generated-count copy targets after reviewing the candidate diff: `CONTRIBUTING.md`, `README.md`, `docs/content/reddit-launch-drafts.md`, `docs/content/show-hn-draft.md`, `docs/internal/competitive-landscape.md`, `docs/internal/mirofish-simulation-council.md`, `website/i18n.js`, `website/index.html`, `website/lite.html`, `whitepaper/AMC_WHITEPAPER_v1.md`. Only generated inventory-count deltas may be copied. The source is the owned preparation clone at `ba54422d`; no generator runs in root. `website/openapi.yaml` receives only its generated native-contract additions. These paths had no root changes before assignment.

## AMC-1543 generated-reference follow-through

The Astra artifact reviewer has finished read-only review. Root serially owns `src/index.ts`, `src/sdk/nativeAgentClient.ts`, `docs/PACKAGE_API_REFERENCE.md` and `tests/publicDocsArtifact.test.ts` for its concrete findings: package comment attribution, navigable InitWorkspaceOptions, a public inline agentInfo type and a staged-reference entry link. Root owns API recovery `artifact-review.json` and the final validation clone/record paths under `/private/tmp/amc-phase-a-acceptance-20260909-*` and `AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/` (runner, source/environment manifest, command logs/results, mutation diffs and README only). No worker is writing source. Root will finish these source fixes before final validation.

Exact initial validation record paths: `AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/source.json`, `runner.py`, `install.log`, `release-gate.log`, `release-gate.json`, `README.md`. Root also owns new Obsidian checkpoints `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 AMC Home candidate-generation checkpoint.md`, `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 AMC Now candidate-generation checkpoint.md`, `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 AMC Roadmap candidate-generation checkpoint.md`, `/Users/sid/Documents/AMC/Archive/Checkpoints/2026-09-09 MOC - Current Operations candidate-generation checkpoint.md`. All implementation workers are finished; acceptance will use a fresh committed clone and no root dependencies.
