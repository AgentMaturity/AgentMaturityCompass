# AMC: governed harness standard execution

Date: 2026-09-08. Baseline: `4247e610e214a5b07de631c394acdaf0f5ed679e`, branch `amc/gap-register-execution`. Tracking epic: [AMC-1505](https://linear.app/agentmaturitycompass/issue/AMC-1505).

## Decision

Make AMC an installable, usable governed agent runtime and an independent evidence layer for other runtimes. Preserve its existing signed session spine and inline controls. Win on demonstrable task outcomes, trustworthy evidence, interoperability and developer experience. “10x” is an improvement target, not a measured claim or a substitute for comparative evidence.

The August superharness plan and state ledger are historical snapshots. Current source already has Cordis composition, a native agent loop, signed JSONL/SQLite sessions, guarded tool execution, approvals, provider streaming, delegation, prompt caching and score-input verification. Do not recreate these or repeat old verified-absence claims. At the initial audit the native `agent-loop` command was hidden and checkout-only because `@amc/core` was private/workspace-backed. Commit `616b7a6b` bundles that closure into the local package; independent installed-artifact verification is now being qualified. A local bundle does not establish a public release.

## Current checkpoint

Qualification source: `d1f2ee84` (2026-09-08). Local commits include neutral import provenance, authenticated portal attribution, clean source onboarding, bundled native runtime, authenticated key-history admission, read-only/cold verification, truthful source inventory and Pi ancestry/redaction/timing corrections. No push, merge or release has been performed.

- Pi correction `1b89a573`: 147 focused cases pass; independent acceptance: 140 cases across nine suites passes with no additional production blocker. These sets overlap. Imports stay self-reported and unevaluated; mapping2 and Watch's new schema document nullable timing.
- Graphify `f2d9f85b`: clean source extraction with 24,541 symbols/73,353 relations, zero model tokens, three focused maps and 101 generated Obsidian notes/three canvases. Canvas links now resolve from the actual vault root. Static mapping is not execution proof.
- Installed native runtime at `68262e9d`: clean external consumer install, keyless tool turn and both cold verifier commands pass. Real-provider smoke was skipped; public-release acceptance remains separate.
- Previous pinned whole suite at `68262e9d`: 11,071 passed/2 failed/0 pending. Both failures were stale UI-count assertions; `3adb0197` fixes them and 19 affected cases pass. The Pi-inclusive suite at `e5ebdbea` finished 11,081 passed / 11 failed / zero pending. All failures came from three test helpers passing the wrong workspace-initializer argument and using checkout state. `d1f2ee84` fixes them; all 11 affected cases pass. The clean-fixture full rerun at `d1f2ee84` passed: **11,092 passed / 0 failed / 0 pending** across 1,321 test files. Receipt: `AMC_OS/RESEARCH/2026-09-08-dsh-pi/full-suite-qualified-d1f2ee84.md`. In-flight AMC-1511 ownership changes are excluded. Build/typecheck and source/docs/architecture checks pass. Public inventory is 1,321 test source files, not a test-result count.
- Live tracker: 21 child issues under AMC-1505; eight In Review, one In Progress and 12 Backlog. AMC-1511 remains In Progress: two genuinely live processes can retain write authority and corrupt the same session sequence; crash-after-end recovery also needs an explicit receipt. Its passing existing tests do not meet these acceptance cases.

Next implementation: repair session ownership/recovery under AMC-1511, then continue the dependency-aware queue below. Keep the goal active; comparative tenfold improvement and standard adoption have not been measured.

## Initial audit evidence

- Root checkout clean at capture. Worktree audit: 45 worktrees, 14 dirty, 107 local branches, one stash. Preserve all pre-existing work and review selected diffs before porting anything.
- Root is 197 commits ahead of main's `3d6b8d4a`; green hosted main checks do not certify this checkout.
- Live Linear initially had 32 open issues across named buckets: 25 Backlog, 1 In Progress, 1 Todo, 1 In Review, 3 Ready to Merge, 1 Triage. G1–G8 were Backlog even though the local execution log claimed completion. They are now reconciled: G1/G2 In Review, parent and G3–G8 In Progress; G6 urgent.
- Obsidian Home/Now/Roadmap were last verified in July. Update current notes with dated evidence and preserve historical checkpoints.
- Baseline build/typecheck, docs drift, counts, architecture boundaries, vendored links/rescope/notices pass. Full baseline: 10,932 tests passed, zero failed/skipped. An initial counts check overlapped build's deletion of dist; its missing built counts were measurement interference, not a reproduced product defect.
- Import reproduction: a five-row Pi v3 session with tool/model failures produces zero Watch failures, L4, integrity .72 and observed coverage .166667. It is unsigned and isolated from scored runs, so this is a misleading import summary and data-loss bug, not demonstrated scorer bypass.

## Corpus and source discipline

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), pinned `c389f96bf3a9b6807cb71ed6bdad5849be0df6d8`, version `0.1.3-alpha.2`, retrieved 2026-09-08. Current DSH has v2 session migrations, Electron releases and browser launch-token/cookie authentication. Old blanket “no auth”, “no migration” and “no signing anywhere” comparisons are stale.
- [Pi](https://github.com/earendil-works/pi), pinned `b2602be77cb7b0de45dd616407fd210daa48aa75`, version `0.85.1`, retrieved 2026-09-08. Separate documented v3 CLI sessions, new telemetry contracts and experimental v4 harness/protocol work.
- Detailed source inventory, source-only versus exercised claims, worktree inventory and reproduction receipts: `AMC_OS/RESEARCH/2026-09-08-dsh-pi/`.

## Execution order

This execution advances one implementation issue at a time. Research/review/documentation may run in parallel. Separately active sessions can contribute concurrent changes; preserve them and review their committed snapshots independently before accepting completion. A completed slice needs a failing reproduction or explicit acceptance exercise, focused code change, relevant checks, Obsidian update, then accurate Linear state. Local verification does not equal merged, released or independently validated.

| Order | Issue | Outcome | State |
|---|---|---|---|
| 1 | [AMC-1506](https://linear.app/agentmaturitycompass/issue/AMC-1506/p0-stop-neutral-imports-from-inventing-maturity-and-observed-evidence) | Stop neutral imports from inventing maturity and observed-evidence claims | In Review — local commit 5eec4d9d |
| 2 | [AMC-1525](https://linear.app/agentmaturitycompass/issue/AMC-1525/p0-require-authenticated-key-history-admission-before-trusting) | Require authenticated key-history admission before trusting historical signing keys | In Review — be4261ec / 5c8bb044 / 72a2f3d9; cold-read component accepted; pinned d1f2ee84 whole suite 11,092 passed |
| 3 | [AMC-1508](https://linear.app/agentmaturitycompass/issue/AMC-1508/p0-recover-authenticated-portal-request-attribution-from-the) | Recover authenticated portal-request attribution from the uncommitted worktree | In Review — local commit 47141f7a; independent persistence review passes |
| 4 | [AMC-1507](https://linear.app/agentmaturitycompass/issue/AMC-1507/p1-preserve-nested-failures-and-branch-provenance-when-importing-pi-v3) | Preserve nested failures and branch provenance when importing Pi v3 sessions | In Review — 1b89a573; focused and independent review pass; pinned d1f2ee84 whole suite 11,092 passed |
| 5 | [AMC-1509](https://linear.app/agentmaturitycompass/issue/AMC-1509/p0-make-documented-source-installation-work-with-amcs-pnpm-workspace) | Make documented source installation work with AMC's pnpm workspace | In Review — local commit 2b737b3c; isolated install and signed run verified |
| 6 | [AMC-1510](https://linear.app/agentmaturitycompass/issue/AMC-1510/p0-distribute-the-governed-native-runtime-without-private-workspace) | Distribute the governed native runtime without private workspace dependencies | In Review — 616b7a6b / f7e30f8c / 2d08c60a; strengthened installed-artifact gate passed at 68262e9d |
| 7 | [AMC-1516](https://linear.app/agentmaturitycompass/issue/AMC-1516/p1-publish-a-versioned-external-evidence-profile-and-independent) | Publish a versioned external-evidence profile and independent conformance verifier | Backlog |
| 8 | [AMC-1511](https://linear.app/agentmaturitycompass/issue/AMC-1511/p1-resume-and-fork-signed-native-sessions-across-processes) | Resume and fork signed native sessions across processes | In Progress — independent live-writer corruption and recovery gaps reproduced |
| 9 | [AMC-1514](https://linear.app/agentmaturitycompass/issue/AMC-1514/p1-enforce-native-provider-protocol-and-modality-capabilities-before) | Enforce native provider protocol and modality capabilities before model spend | Backlog |
| 10 | [AMC-1513](https://linear.app/agentmaturitycompass/issue/AMC-1513/p1-qualify-real-linux-sandbox-enforcement-for-native-tools) | Qualify real Linux sandbox enforcement for native tools | Backlog |
| 11 | [AMC-1515](https://linear.app/agentmaturitycompass/issue/AMC-1515/p1-execute-mcp-client-tools-through-the-governed-native-pipeline) | Execute MCP client tools through the governed native pipeline | Backlog |
| 12 | [AMC-1512](https://linear.app/agentmaturitycompass/issue/AMC-1512/p1-expose-a-governed-interactive-native-agent-session-workflow) | Expose a governed interactive native-agent session workflow | Backlog |
| 13 | [AMC-1519](https://linear.app/agentmaturitycompass/issue/AMC-1519/p1-ship-a-typed-native-run-client-with-cancellation-and-receipt) | Ship a typed native-run client with cancellation and receipt verification | Backlog |
| 14 | [AMC-1520](https://linear.app/agentmaturitycompass/issue/AMC-1520/p1-add-dsh-capture-with-explicit-process-proxy-and-event-coverage) | Add DSH capture with explicit process, proxy and event coverage | Backlog |
| 15 | [AMC-1517](https://linear.app/agentmaturitycompass/issue/AMC-1517/p1-bridge-callback-telemetry-into-amc-with-semantic-conformance-and) | Bridge callback telemetry into AMC with semantic conformance and truthful trust | Backlog |
| 16 | [AMC-1518](https://linear.app/agentmaturitycompass/issue/AMC-1518/p1-measure-amc-dsh-and-pi-on-reproducible-task-and-governance) | Measure AMC, DSH and Pi on reproducible task and governance scenarios | Backlog |
| 17 | [AMC-1521](https://linear.app/agentmaturitycompass/issue/AMC-1521/p1-recover-and-gate-test-typescript-checks-from-the-existing-worktree) | Recover and gate test TypeScript checks from the existing worktree | Backlog |
| 18 | [AMC-1522](https://linear.app/agentmaturitycompass/issue/AMC-1522/p1-recover-verified-origin-addressed-session-compaction-without) | Recover verified origin-addressed session compaction without invented savings | Backlog |
| 19 | [AMC-1523](https://linear.app/agentmaturitycompass/issue/AMC-1523/p1-explain-import-losses-unknown-timing-and-next-actions-before) | Explain import losses, unknown timing and next actions before accepting external evidence | Backlog |
| Parallel documentation | [AMC-1524](https://linear.app/agentmaturitycompass/issue/AMC-1524) | Graphify code navigation, architecture maps and coupling evidence | In Review — f2d9f85b; current maps, 101 notes and three canvases verified |
| Parallel documentation | [AMC-1526](https://linear.app/agentmaturitycompass/issue/AMC-1526) | Distinguish source-file inventory from actual passing-test results | In Review — 05893b67; clean committed inventory check passes |

The scoped queue covers: distributable native runtime, interactive resume/fork workflow, real platform sandbox backends, provider conformance, signed extensibility, telemetry interoperability, independent verification and matched-workload benchmarks. Existing release/coverage/issues are linked rather than duplicated.

## Expanded deployment and usability scope

The September 8 goal now explicitly includes deployment readiness and a substantially easier experience against leading current harnesses. Complete AMC-1511 ownership first, then qualify the exact release candidate through clean package installation, a useful first task, cold evidence verification, release scans, supported-platform checks and recoverable deployment operations. Reuse AMC-483 for release-gate/CI/install alignment and AMC-7 for published-install verification; older Done issues are historical evidence, not proof of this candidate.

Measure first-use actions, time to a useful verified result, setup failures, explanation quality, cancellation/resume recovery and repeat use. Automated persona contract checks must be labeled as automated checks; they are not human usability ratings. Broaden source-backed comparison beyond DSH/Pi with dated official references before adding verified gaps. Preserve the distinction between local source qualification, package qualification, platform qualification and a deployed release. Current local full-suite success is not deployment readiness or an all-market superiority measurement.

## Measurable advantage and standard adoption

1. **Evidence correctness:** every scored claim resolves to provenance with explicit trust tier; imported unsigned telemetry cannot become observed merely by re-signing; tampering, missing evidence and unsupported formats fail visibly.
2. **Time to proof:** measure clean install → real task → failure explanation → independently verifiable bundle. Target at most three operator actions and under five minutes for a keyless conformance demo; measure real-provider runs separately.
3. **Daily use:** multi-turn streaming, cancellation, resume/fork and crash recovery preserve signed history and enforcement boundaries.
4. **Cost and performance:** paired identical task/model/tool/sandbox budgets for AMC, DSH and Pi; record repetitions, success criteria, latency, token/cache usage, cost source dates and failures. Targets such as 10x fewer manual audit steps need an observed baseline; never invent head-to-head scores.
5. **Interoperability:** versioned producer-neutral contract plus Pi/DSH examples, explicit lossiness and unknowns, hostile-fixture conformance. External producers do not self-certify trust.
6. **Standard adoption:** publish a small independently implementable proof/profile specification, standalone verifier and migration policy; seek independent implementations and real pilot results before claiming AMC is an industry standard.

## Continuation and release boundary

Keep this epic active while required product work remains. Preserve unrecovered worktrees/stash. Do not mass-close old gap epics on the strength of an execution-log summary; some dispositions are documented deferrals, reclassifications or scoped capabilities. No claim of whole-product readiness until current-branch CI, clean artifact installs and actual public release verification succeed.

## Execution log

- 2026-09-08: Created epic and first four implementation issues. Began full baseline tests and importer provenance fix. Current-state Obsidian refresh started.

- 2026-09-08: AMC-1506 locally committed as `5eec4d9d`, 33 affected tests and typecheck pass; Linear In Review. Correctly hashed attacker key-history admission reproduced; AMC-1525 promoted next. Graphify 0.9.56 reviewed source matches installed extractor/CLI hashes; code-only graph generation underway.
- 2026-09-08 (later): AMC-1506 local-complete at `5eec4d9d` (importer session); independent reproduction `tests/importProvenance.test.ts` from a second session passes 3/3. AMC-1508 local-complete at `47141f7a` (second session; recovered from `vigilant-merkle-2d8549`, principal derived by role). Claims: the importer session keeps AMC-1507; the second session takes AMC-1509 next. Neither issue is merged or released.

- 2026-09-08: AMC-1508 recovered in local commit `47141f7a`; independent 50-test run and 11 SQLite attribution/authorization cases pass. AMC-1509 arrived as `2b737b3c`; separate clean-clone review underway. G1–G8 tracker dispositions updated and historical ID collisions repaired; 290 registered rows retained. Graphify extracted 24,419 symbols / 72,959 relations and produced three focused maps plus 69 generated Obsidian notes and three canvases; source reading guide, browser search and node inspection verified. AMC-1525 implementation covers local history authority plus exported certificate consumers.

- 2026-09-08: Old register reconciliation committed as `247cb0b4`; Graphify focused navigation as `ab94861a`. AMC-1509 independently passed isolated clean source install/build/link and signed native-run verification, now In Review. AMC-1525 integration exposed verification-time key initialization; a read-only ledger path now preserves public-only trust anchors and rejects a missing ledger without creating state. JSONL-only and SQLite session readers are included in regression checks.
- 2026-09-08 (later still): AMC-1509 local-complete at `2b737b3c` (+ `98cd20e1`, `cef781ec`, `b3b13181`): committed lockfile was stale for CI's own frozen install; fixed, docs on the pnpm path, `check:clean-source` executable check + CI job. AMC-1507 local-complete at `c050244a` (+ `8defa070`): format-aware Pi v3 import. Open on a clean clone: three docs-graph edges into ARCHITECTURE_NAVIGATION.md (`ab94861a`). This was the contributing session's completion assessment. Independent review subsequently found unresolved AMC-1507 cycle, redaction and timing defects, so that issue remains In Progress. None of these changes is merged or released.

- 2026-09-08: AMC-1525 final qualification includes public-only exports, JSONL/SQLite readers, missing-evidence refusal and legacy blob reads that never create encryption keys. Connection setup and vault-history CLI registration now have dedicated modules, keeping both large entry files below their existing size limits; 56 focused tests and typecheck pass after extraction. AMC-1526 public count semantics and regeneration pass 22 focused tests. Final full-suite qualification remains pending.

## Qualification history (superseded checkpoints)

- AMC-1525 trust/read-only implementation: `be4261ec`; independent 44-case review, 56 integration cases and 102 core cases passed in their recorded runs (overlapping sets, not a combined unique total).
- AMC-1526 count semantics: `05893b67`; 22 focused cases and isolated committed-source inventory check pass.
- Graphify refresh: `92e0e254`; 24,475 symbols / 73,033 raw relations; three focused maps, 81 generated Obsidian notes and three canvases. Source hashes and omissions are recorded.
- Docs qualification: `3d22bd1b`; 1,180 public command paths, 175 public guides, 13 focused metadata/graph/artifact checks pass. Checkout-only navigation stays separate from the public guide collection.
- Shared-checkout full suite: **10,968 passed / 60 failed / zero pending**. Multiple concurrent builds deleted CLI output during the run, but not every failure was attributed to that interference. A pinned clean clone at `92e0e254` passed frozen install/build; the 28 failed runtime/CLI suites narrowed to **184 passed / one failed**. The real ACP failure is stale cached vault secret state after a child process adds an encrypted blob key. Its pure read-only cache refresh is now repaired in `5c8bb044`, and all 26 isolated ACP/cache/docs acceptance checks pass. Subsequent artifact review found and repaired a separate cold-process read failure in `72a2f3d9`. The two docs failures have their separate committed repair.
- Worktree refresh: 45 worktrees, 15 dirty including the now-active root; no inventory errors or destructive worktree/stash operations. Qualification uses a separate temporary clone.
- AMC-1507 remains In Progress with four confirmed review findings: ancestry termination, sanitized metadata identity, nullable valid event times and measured-sample latency. Its failing regressions are preserved; corrective production edits are paused while trust/artifact blockers are resolved. AMC-1510 is In Review with additional independent fixes in `2d08c60a`; no release claim has been accepted. AMC-1511 is In Progress in the separately active session.

The goal remains active. No push, merge, public release, comparative tenfold result or independent-standard adoption has been claimed.
- 2026-09-08 (evening): AMC-1510 local-complete at `616b7a6b` (second session) — kernel closure bundled into the artifact at one seam; ADR-006; `check:packed-install` RED on thin runtime / GREEN bundled. Prepack release gate's audit step was failing on pre-existing qs/fast-uri advisories (pnpm ignored the top-level `overrides` key); fixed via `pnpm.overrides`. None of this is merged or released.

- 2026-09-08 qualification follow-up: ACP's vault-cache regression is fixed in `5c8bb044`: already-unlocked secret reads authenticate changed disk envelopes in memory only and clear stale credentials on failure. Six new negative/refresh regressions failed before the fix; 53 focused cases passed after it. Isolated build/typecheck and 26 ACP/cache/docs acceptance cases pass, including the original conversation and clean evidence verdict. The clean qualification clone is now pinned to `5c8bb044`, including concurrent runtime/dependency commits `616b7a6b` / `f7e30f8c`; final full-suite gate is underway. AMC-1507 corrective implementation has started after component acceptance. An independent agent reviews the packed runtime separately, without rebuilding the active root checkout.

- 2026-09-08 cold/artifact follow-up: `72a2f3d9` enables explicit cold read-only vault access and prevents run summaries/verifiers from initializing trust. Independent freshly installed artifact verifies current and legacy evidence with unchanged trust files; wrong or absent passphrase fails closed. `2d08c60a` fixes repeat bundling and requires structured cold session and request verification in the installed-artifact check. The integrated five-suite run passes 41 cases, and the pinned clone passes build/typecheck. The final full suite has not started: these additional artifact blockers were discovered first. AMC-1507 is paused with 11 reproduced product failures and no corrective production edits. A missing-session verification false positive is also confirmed and under bounded repair in AMC-1525.

- 2026-09-08 pinned qualification started: source `68262e9d` includes cold-read/missing-session fixes, strengthened npm isolation/receipt identity checks and concurrent session-resume commits `62c8b44a` / `4cd258f5`. Build, typecheck, counts (1,318 committed test source files) and docs drift pass. Full suite is now actually running in the pinned clone. AMC-1507 corrective implementation resumes separately; its uncommitted changes are excluded from this full-suite candidate.

- 2026-09-08 artifact acceptance: pinned `68262e9d` passes the strengthened fresh installed-artifact gate, including both cold verifier commands and unique request identities. npm configuration is isolated from operator overrides. All architecture boundaries pass. Real-provider smoke is explicitly skipped and the whole prepack/public-release gates are not claimed. Receipt: `qualified-packed-gate.json`.

- 2026-09-08 full pinned suite: `68262e9d` completed **11,071 passed / 2 failed / 0 pending** (11,073 cases). Both failures are old UI tests expecting `1,175 CLI paths` after the published inventory moved to1,180; replacement assertions derive the expected count from the command inventory. No runtime/crypto failure remains in this run. Independent session-resume review separately reproduced live-writer takeover corrupting sequence history, so AMC-1511 remains In Progress despite its existing tests passing. The pinned full result is not whole-product completion.

- 2026-09-08 integration: Pi correction 1b89a573, inventory assertions 3adb0197 and Graphify guide/Canvas links f2d9f85b committed. Public inventory updated to 1,321 in e5ebdbea. New pinned full suite runs against e5ebdbea after preserving/restoring the temporary clone's test-mutated fixtures; actual user workspace and other worktrees are untouched. Independent Pi acceptance: 140 cases passes.

- 2026-09-08 fixture qualification: full e5ebdbea result is 11,081 passed/11 failed/0 pending. The three wrong-shaped initWorkspace calls silently initialized cwd, making their outcome depend on checkout vault state. Commit d1f2ee84 fixes all three helpers and 11 focused cases pass. The new d1f2ee84 full run starts with committed fixtures and excludes in-flight AMC-1511 ownership changes.

- Graphify focused follow-up: added only blobStore.ts to complete the extracted cold-read path. Trust map now 24 files/51 pairs; generated vault output: 101 notes/3 canvases with 358 wiki links and 130 graph edges validated. Raw f2d9f85b extraction is unchanged and prior final receipts preserved.

- 2026-09-08 clean-fixture full qualification: exact `d1f2ee8423446303f397f28aafdd886fd7b4a961` completed **11,092 passed / 0 failed / 0 pending**, 1,321 source test files. Raw JSON digest and fixture side effects are recorded in `full-suite-qualified-d1f2ee84.{md,json}`; runtime build equivalence is documented. AMC-1511 ownership repair remains in flight and excluded. Expanded deployment/usability audit has started.
