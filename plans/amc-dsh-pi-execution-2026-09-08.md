# AMC: standalone governed agent runtime and evidence

Date: 2026-09-08. Baseline: `4247e610e214a5b07de631c394acdaf0f5ed679e`, branch `amc/gap-register-execution`. Tracking epic: [AMC-1505](https://linear.app/agentmaturitycompass/issue/AMC-1505).

## Decision

Make AMC an installable, usable standalone governed agent runtime. Its model loop, workspace tools, approvals, streaming, sessions, compaction, MCP, extensions and SDK workflows must run natively without DSH or Pi. Preserve the existing signed session spine and inline controls. External adapters, capture and imports remain optional interoperability; they do not close native feature gaps. Compare demonstrable task outcomes and developer experience only after implementation and matched acceptance. “10x” is an improvement target, not a measured claim, and industry-standard adoption remains unproven.

The August superharness plan and state ledger are historical snapshots. Current source already has Cordis composition, a native agent loop, signed JSONL/SQLite sessions, guarded tool execution, approvals, provider streaming, delegation, prompt caching and score-input verification. Do not recreate these or repeat old verified-absence claims. At the initial audit the native `agent-loop` command was hidden and checkout-only because `@amc/core` was private/workspace-backed. Commit `616b7a6b` bundled that closure into the local package, and later dated installed-artifact receipts exercised it. Those receipts do not qualify the current implementation batch. A local bundle does not establish a public release.

## Phase A reconciliation and recovery — September 9

The latest live tracker snapshot has **42 children: 30 In Review, 11 In Progress, 1 Canceled**. AMC-1524 is canceled because Sid explicitly stopped Graphify; dated navigation artifacts remain preserved. No issue has been closed from historical or partial evidence. The read-only audit and reconciliation remain dated at `7bd1e8ce8e0b38c71f2d9792cd2e2043a1c3c544`; old worktrees and the shared stash are preserved.

Corrected candidate `a5987643ef6c26b01f687226fbc6a6709fc182cb` is now running complete acceptance in a new independent clone via `AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/attempt-3/runner.py`. It includes the complete c164 failure-batch fixes: narrow study type contracts, explicit security fixtures, native agent initialization, bundle helper extraction, public guide navigation, directly supervised TypeDoc rendering with shared artifact builds, and the remaining YAML dependency corrections. Renderer timeouts and performance floors are unchanged. No independent compiler, mutation or build lane overlaps this full gate. The failed c164 results below remain immutable; no current-candidate pass or issue Done is asserted.

Candidate `c16492c10592112fe610bd2e59f216f8f7f310b4` failed complete acceptance in a fresh independently installed clone on Darwin 25.6.0 ARM64 / Node 22.22.0. The full suite measured **12,263 total: 12,233 passed, 30 failed, 0 pending/todo**. The release gate measured **10 of 14 executed checks passed, 4 failed, 1 skipped**: test types, full suite, architecture limits and runtime dependency audit failed; live deployment health was skipped because no live URL was configured. Focused spill and stop/auth baselines also failed (77/79 and106/126 passed); no mutations were applied. The independent test typecheck recorded67 diagnostics. All observed command processes closed. The full-suite clone retains eight tracked test-key/public-history changes; it is not clean after execution. Root is repairing the complete failure batch before freezing a new candidate. Immutable receipts: `AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/attempt-2/result.md`, `spill-mutations-c16492c1-01/`, `stop-auth-mutations-c16492c1-01/` and `test-types-c16492c1-01/`. No issue Done, full-suite pass, deployed release or comparative ranking is claimed.

**The first complete candidate acceptance failed.** Fresh clean source `0fcce267ad52141dbec68af02a4af665211609bd`, Darwin 25.6.0 ARM64, Node 22.22.0 and pnpm 10.33.0, completed its frozen install. The full suite measured **11,848 total: 11,842 passed, 6 failed, 0 pending**. The gate recorded **11 of 14 executed checks passed, 3 failed, 1 skipped**. Failures were the full suite, architecture limits and runtime dependency audit. Live deployment health was skipped because `AMC_RELEASE_GATE_LIVE_URL` was absent. The original logs and result remain immutable in `AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/`.

Corrections are integrated through `c2a7b41783a5cfb30c70facaf01cd27669a58b3a`. Commit `46f91e70` separates managed-hook credential verification into a small module, shortens the public barrel comment, fixes the current Anthropic encoder expectation and immutable-ledger tamper fixture, and gives complete API-site artifact builds measured time budgets plus a narrow generated-reference link check. Commits `7ad47529` / `c2a7b417` update the affected runtime dependencies; the actual lock resolutions are js-yaml 4.3.2 and Hono 4.13.7. This fixes source and dependency inputs; it does not establish that a rebuilt candidate passes. Existing AMC-483 tracks the dependency gate correction.

The recovered native retry, closed-task archive, authenticated revocation, API documentation, nullable contract publication and source-install work remains integrated. No DSH or Pi runtime is introduced. API preparation and its omitted-type warnings remain separate dated evidence; it is not complete API coverage. Next: integrate the remaining owned implementation, qualify one fresh corrected candidate, run targeted security mutations and native UI/installed cancellation acceptance, then apply the per-issue Done contract.

Sid authorized **Chat on Steroids alongside Codex**, with **GPT-6 Pro for every Chat on Steroids task**, and then requested continuing background Goal/Loop work. Its first intake implementation is merged at `e63c8cb7fa108561b584a807ae59c4da63bb6792`: standalone recording intake, operator study guide and authored regressions. Generated source-file inventory is updated at `b412b404`; this is source inventory, not passing tests. Source receipt planning was also corrected at `aa409127` to account for the added Studio retry/archive scenarios.

Chat on Steroids completed its retained-output operator commands on GPT-6 Pro. Worker `7c0f01bf73fb64845362bda20cd456e9bc6af31e` is merged at `0f4b10a4553d1c652e4b0e07a705acf7d9bd45bd`, with root CLI/documentation registration at `68458818799d1db7826d67d1b604d6ad77ac4432`. Native inventory, encrypted export/restore and deliberate exact-scope erasure are integrated alongside the bounded read command. Root and independent Astra source reviews are complete; the final command regressions include unsafe history links and genuinely signed conflicting references. The completed Goal is paused and its final response and idle state were observed. The separate finite GPT-6 Pro closure-evidence mapping Goal is delivered and visibly active while Codex validates. Its automatic opener timed out; direct composer delivery recovered it. Codex leaves it undisturbed until completion, timeout or instruction need. Records: `AMC_OS/RESEARCH/2026-09-09-chat-on-steroids/spill-integration.json` and `closure-goal-task.md`.

AMC-1545 native delegation stop enforcement is integrated at `288e210f6b22ebb7d4e2c903aa50959849fcbbb8`, following operator merge `14fba22c` and runtime merge `eb034de5`. AMC now implements validated `max-turns:N` and nonresetting `timeout-ms:N` across initial and continued child work, CLI/chat/signed presets, and narrower descendant declarations. Runtime cancellation preserves the distinction between a returned executor and an uncooperative executor whose stop remains unconfirmed. Codex source review is complete; authored regressions, mutations and final fresh-candidate qualification have not run. AMC-1545 remains In Progress and AMC-1531 remains open. Record: `AMC_OS/RESEARCH/2026-09-09-delegation-stop-conditions/README.md`.

AMC-1546 Studio credential binding is integrated at `d668d84155d600eec1dbe1133a6b9380e1fad667`, including source `b889cd4f8bcdfc8bfc76bfac3f3731cc3889b0e4` and regression source `7c18ce6490bfe391a42dbaf910d1fe8d38ad2e7a`. Authentication now validates all supplied agent credentials and intersects their scopes; original duplicate security header names are refused, and intent-owner refusal precedes tool execution. Static-token-only checks/read access and human operator authentication retain their documented boundaries. Actual HTTP, lease, signed approval and filesystem side-effect regression source is authored, with a clearly labeled synthetic diagnostic control input; none has executed. AMC-1546 remains In Progress and blocks AMC-1508 pending final fresh-candidate qualification. Record: `AMC_OS/RESEARCH/2026-09-09-studio-agent-credentials/README.md`.

AMC-1547 core implementation is integrated at `249a2a812f2600c53564fa571761aa2cfb80a144`, with authored session/retention/bundle regressions merged at `d9d55034b1e856513eea1c68b09e50ecd433063e`. Native sessions sign a spill commitment before encrypted v2 materialization; authenticated inventory, scoped audited erasure and ciphertext export/restore are implemented. Existing SQLite retention selects only expired closed-session objects and processes each locator separately to avoid a stuck backlog. Evidence bundles report ciphertext completeness and named gaps separately from plaintext verification. JSONL automatic retention, external-copy erasure and DSAR subject mapping are not added. Native operator commands are integrated at `68458818799d1db7826d67d1b604d6ad77ac4432`; final fresh-candidate tests, mutations and release gate remain pending. No production key operation or acceptance ran. AMC-1547 remains In Progress and blocks AMC-1522; earlier compaction savings receipts retain their original preview-only boundary. Record: `AMC_OS/RESEARCH/2026-09-09-spill-lifecycle/README.md`. [AMC-1547](https://linear.app/agentmaturitycompass/issue/AMC-1547).

AMC-1512 real-provider/human evidence, AMC-1518 matched outcomes, AMC-1530 broader native platforms and AMC-1538 independent cancellation verification remain open. Public release, deployed health, measured superiority and independent standard adoption remain unproven. Graphify remains stopped.

Records: `AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/README.md`, its `dependency-repair/` record, and `AMC_OS/RESEARCH/2026-09-09-chat-on-steroids/README.md`. [Linear epic](https://linear.app/agentmaturitycompass/issue/AMC-1505).

## Phase A audit complete — September 9

The standing execution brief now controls the program, with the user's newer GPT-6 Astra-only instruction overriding its older model line. Phase A step 0 is complete at integration `7bd1e8ce8e0b38c71f2d9792cd2e2043a1c3c544` on macOS ARM64. The read-only receipt inventories **45 worktrees, 15 dirty worktrees, 160 dirty leaf paths and 90 unmerged local branches**. It records **10 recoverable dirty paths, 55 superseded and 95 unknown**; unmerged branches are **one recoverable, 69 superseded and 20 unknown**. Unknown is deliberate, never permission to overwrite or a claim of abandonment. No tests, installs or source ports ran during this audit.

Compared with the previous `worktrees-refresh-final-native-3ea14e58.json` receipt, only root's HEAD and grouped path/status list changed. Other worktrees have no registration/HEAD/branch/path-status delta; the old receipt cannot establish unchanged file bytes. The shared stash remains `152a61696f336f658893a72aa9357d58df8c5679` and every worktree is preserved.

**AMC-1542** records the recovered managed-hook revocation signature check and missing-list/surviving-signature refusal. **AMC-1543** records the unmerged TypeDoc HTML API generator, linked to historical AMC-66. Source diffs and acceptance seams were read; neither recovery has been ported or qualified. The incomplete root AMC-1540 retry edits remain paused and unverified.

The live queue is **38 children: 31 In Review, four In Progress and three Backlog**. Phase A step 1 is next: reconcile each claim against current source, then meet the brief's fresh-clone, full-suite, release-gate and security-mutation requirements before Done. Earlier scoped acceptance remains dated evidence and does not satisfy the new Done definition by itself. No issue was moved to Done. Public release and live deployment remain later confirmation gates.

Receipt: `AMC_OS/RESEARCH/2026-09-09-worktree-audit/README.md`; inventory SHA256 `5f6de25cac25309f6973a1ae44538f8b0482a81e7232abfa462f2753060149f7`. The standing brief itself was created outside this task and was not edited; observed stale facts are recorded in the inventory. Graphify remains stopped.

## Native public validation — September 9

AMC-1538 is In Review. Native source `7bd1e8ce` implements operator-selected public checks across CLI/chat, ACP/SDK and Studio. Checks use AMC's signed shell, approvals, budgets, deadlines and cancellation controls. Model completion, public-check results and evidence verification remain separate. Studio pins the configuration and selected IDs and exposes authenticated, redacted check output. No DSH or Pi runtime is required.

The batch passes a clean Node22 build, test types, architecture and **175/175 focused tests in 19 files**. The fresh private package passes installation and **10 completed installed acceptance cases**: six macOS baseline/unavailable/denied cases and four Linux CLI/SDK passing/nonzero checks. The Linux cancellation case started, returned cancelled/unavailable, cleaned up its process tree and passed SDK verification; its fixture incorrectly demanded a completed confinement receipt and stopped before the separate CLI cold-verifier commands. The follow-up was a setup refusal after the VM's temporary install disappeared. Both attempts remain preserved. AppArmor was restored exactly and the owned VM is stopped. This is scoped acceptance with that cancellation verification limit, not a clean pass for every attempted case or a repeated full suite.

AMC-1514 provider tool naming and AMC-1539 bounded comparison source retention remain In Review. The completed real local-model pilot remains **zero qualified passes, five qualified failures and four inconclusive trials**. Its model is stopped; no quality ranking or tenfold improvement follows from that small pilot.

The current queue has **36 children: 31 In Review, four In Progress and one Backlog**. AMC-1540 is implementing explicit retry for an unconfirmed Studio submission. AMC-1541 queues archival of eligible closed task descriptors so the 256-task limit does not permanently block new work. AMC-1512 retains human/real-provider first use, AMC-1518 comparative outcomes and AMC-1530 broader platforms. Public release, live deployment and standard adoption remain unproven. Next work targets concrete native workflow gaps; user-directed Graphify work is stopped. Earlier sections retain dated historical evidence.

Evidence: `AMC_OS/RESEARCH/2026-09-08-dsh-pi/native-validation-acceptance/README.md` and `installed-7bd1e8ce/`. Private package SHA256: `afad702732f7290e89ef6747466cc385ee09e350849c61806245bda1fe39855d`.

## Standalone native review and coding comparison — September 9

AMC-1537 is In Review: CLI, ACP and Studio accept supported signed read-only tools without granting editing or shell. Actual CLI/SDK flows read the fixture, recorded signed denials and passed cold verification. The native OpenAI Chat startup collision is fixed. A separate official OpenAI tool-name compatibility gap is confirmed and reopened as AMC-1514.

AMC-1518 now has a local-provider lane, three actual CLI bindings and independent shared coding tasks. The fresh standalone AMC install and pinned DSH/Pi each completed the same scripted read/edit task: **3/3 targets, nine requests, six real tool calls, identical repaired files and 66/66 neutral checks**. All owned process groups and endpoints closed. The actual materializer also produced and validated three tasks and nine bindings; the formal real-model study has not run.

Runtime source **6b3f7b15** built and installed successfully; helper/test corrections are **da1de20c**. Original focused result: 95/129 passed. All 34 failures now have passing affected-file corrections (32 oracle cases and two CLI/ACP cases). Final test types, architecture and published source counts pass. These are composite scoped receipts, not a repeated full-suite pass. [Batch evidence](../AMC_OS/RESEARCH/2026-09-08-dsh-pi/local-coding-batch-acceptance/README.md) retains exact boundaries and links.

Graphify at be5c3583 supplies **seven maps, 308 generated notes, seven canvases and 40 reading paths**; 1,027 wiki links, 217 file cards and 406 edges resolve. Later Chat/comparison edits remain outside that extraction. [Graphify navigation](../docs/ARCHITECTURE_NAVIGATION.md) is the reading guide. Windows installer failure propagation passed four PowerShell cases on macOS; native Windows remains open.

Current queue: **32 children, 28 In Review, four In Progress** (AMC-1512, AMC-1514, AMC-1518, AMC-1530). Next implementation is collision-safe provider tool naming, followed by feasible real-model comparison and remaining first-use/platform work. No measured tenfold superiority, real-model quality, public release, live deployment or standard adoption is established. Earlier sections below are historical source-specific receipts.

## Native Tasks in Studio — local acceptance, September 9

AMC-1536 implements a standalone native task workspace in Studio: selected-agent tasks, committed conversation and tool activity, actual signed approvals, cancellation, release/resume and separate evidence verification. It uses AMC's native SDK/ACP, signed descriptors and execution controls; no DSH or Pi runtime is required. Scope changes during approval/model waits cannot widen an accepted task. Cookie origin/CSRF checks, demo limits, owner binding, idempotency and bounded lifecycle are enforced.

Execution source `b8e82167` built successfully and passed 111/111 focused runtime cases plus all 10 actual installed Chromium scenarios on macOS ARM64/Node22 with the deterministic native stub. Four native cold verifiers and the whole ledger passed after orderly shutdown. The live Verify screen correctly reports the incomplete whole-ledger result while the gateway is open; that is not a positive cryptographic result.

The original full run remains **13/14 executed checks passed, with 11,582/11,587 tests passing and five documentation/presentation failures**; live deployment health was skipped. Those failures are corrected. Seven affected suites have passing results covering 49 distinct cases across the scoped follow-ups, with publisher consistency and test types passing. This is a composite disposition, not a new full-suite pass. Final correction source `0ac9be93` changes docs/tests and API-reference metadata after b8; native task execution is unchanged. No full-suite repetition or package repack was done for these corrections.

Graphify 0.9.56 at b8 maps 25,461 symbols and 76,408 relations into seven focused maps. The actual Obsidian vault now contains 306 generated notes and seven canvases; 1,018 wiki links, 215 file cards, 400 canvas edges and 38 source-backed reading paths resolve. The new Native Studio map contains 31 files and 50 directed dependencies. Static navigation is separate from runtime evidence.

Current queue: **31 children, 28 In Review and 3 In Progress**. AMC-1536 is In Review. AMC-1512 retains real-provider and human first-use evidence; AMC-1518 retains matched comparative outcomes; AMC-1530 retains the broader platform/install matrix. Browser positive file editing, service-worker/offline behavior, physical mobile devices and live deployment are not qualified by the deterministic browser run. No measured 10x advantage, public release or standard adoption is claimed.

Evidence: `AMC_OS/RESEARCH/2026-09-08-dsh-pi/native-studio-task-acceptance/final-disposition.json` (SHA256 `079ac61f48cd80077ee2769b594d720fbada1ca423216bb179d04533a669ff66`), plus `studio-native-browser-acceptance/` and `native-studio-graphify-b8e82167/`. Private accepted package SHA256: `cfd5ccc4f4563f683f2558535d16d844d769ebc7eabf067e43857a9b95bdd553`. Actual Obsidian Home, Now, Roadmap, Current Operations and Native Studio Task Workspace notes are reconciled to these receipts.

## Historical accepted baseline — before Native Studio

AMC owns its provider loop, streaming chat, workspace file tools and confined Linux shell, authenticated approvals, signed budgets, delegation, sessions, resume/fork, origin-addressed compaction, signed extensions, stdio/HTTP MCP and TypeScript/Python SDKs. Native execution requires neither DSH nor Pi.

The final combined gate at `3ea14e58bdea09be147b88f654be9bc6829d210f` passed all 14 executed checks and 11,506/11,506 tests across 1,355 source test files, with zero failures, pending or todo. Live deployment health was explicitly skipped, so qualification remains partial.

The latest implementation pins agent identity and custom provider origins through chat/resume, refuses mismatched resume before recovery or MCP startup, respects the selected macOS Node runtime, restores optional TLS routing/signing, and correctly handles process interruption and gateway stream cancellation.

Separate installed acceptance passed selected-agent/custom-origin chat (40 assertions), Pi callback conformance (16), optional notary/TLS (42), the macOS Node24 installation/launcher lane, and actual pinned DSH capture (8 checkpoint groups, 13 public CLI commands, 7 HTTP requests). These retain their exact source, artifact and environment boundaries. Optional interoperability does not replace native capability.

Graphify 0.9.56 at `12de7b4f` contains 25,265 symbols and 75,793 relationships, reduced to 2,080 files and 7,502 directed pairs. Six focused maps produced 263 actual Obsidian notes and six canvases. All 891 wiki links, 184 source cards, 350 canvas edges and 25 source-backed reading paths resolve. The stream cleanup path is visible; static maps do not establish runtime acceptance. Later changes only update generated inventory and documentation.

Linear has 30 child issues: 27 In Review and 3 In Progress. AMC-1512 still needs real-provider and human first-use evidence; AMC-1518 needs matched comparative outcomes; AMC-1530 needs the wider platform/install matrix. Linux AMD64 could not run in the owned ARM VM because emulation was unavailable; no AMC execution was inferred.

The goal remains active. No public release, measured tenfold superiority or industry-standard adoption is established. The earlier d8 six-step signed prepack remains a separate dated artifact receipt; it was not repeated for this final gate.

[Native readiness](../AMC_OS/RESEARCH/2026-09-08-dsh-pi/native-standalone-readiness.md) retains the scoped receipts and remaining work. Source inventory is 1,355 test files, 1,209 CLI paths and 183 public guides; inventory counts are not passing outcomes.

The final read-only audit covered all 45 registered worktrees with zero errors. Fourteen other worktrees retain their existing changes; compared with the d8 snapshot, their registrations, HEADs, branches and listed path/status values have no new deltas. No new uncommitted production path was found. The shared stash remains `152a61696f336f658893a72aa9357d58df8c5679`. The captured total of 15 dirty worktrees includes this task's two final root documentation edits; those are finalized separately. This is path/status evidence, not dirty-content hash equality. Receipt: `AMC_OS/RESEARCH/2026-09-08-dsh-pi/worktrees-refresh-final-native-3ea14e58.json`.

## Historical accepted checkpoint — 33b24725

The following results apply only to their pinned source and exercised environments. They do not qualify the working tree or newly implemented native features.

Dated accepted integrated source: `33b24725fd37cc3c0cf9ee4fec9321bcab983a44` (2026-09-08). The **full release gate passes all13 configured checks**, including **11,196 tests with zero failures, pending or todo across1,330 committed test files**. Build, typecheck, fresh packed installation/keyless native/cold verification, public command/docs/architecture checks, dependency audit and real isolated persona installs pass. Live deployment health remains an explicit skipped gate, so the report correctly says partial qualification. No push, merge, deployment or release occurred.

- **Installed runtime at 33b:** that gate exercised a fresh external package install, a keyless native tool turn and both cold verifiers. Earlier exact fdabeba9 installed fresh/resume/fork acceptance additionally verifies denied-tool audit/session attribution and unchanged parent history. Real-provider coding remains unmeasured.
- **Linux containers:** clean source6553906e built Studio image `sha256:51e5ad9b53befa2e35b3c0ad501ad32f047710cfe20678a1a3d592293db5bcb6` and runner `sha256:736e1a4a27d534a03b185b63d4c643ca2effa70ae894a4f8706a159ff68552a5`. Final33b24725 host smoke passes21/21 runtime checks, all4 cleanup actions,4 positive cold results after graceful shutdown/restart and2 strict refusals after SIGKILL. The isolated Linux ARM64/Node22 VM is stopped. This does not qualify AMD64, other platforms, optional notary/TLS or publication.
- **Release integrity:**49b163eb restores mandatory bounded scans, full nested npm inspection, final metadata scan before archiving and explicit ephemeral prepack signing keys. Its separately retained package passes all6 actual prepack commands through expected-public-key verification, with zero HIGH and25 MEDIUM name hints. The historical 33b full gate included those source fixes but its packed-install check intentionally did not rerun prepack.
- **Truthful installation reports:**95aa5e80 reports actual planned/passed/failed/skipped checks and separates artifact validity from evidence readiness. The prior corrected real run passes103/103 persona checks and2/2 setup checks; the integrated33b gate repeats actual persona installs successfully. These are automated contract checks, not human usability scores.
- **Readable code:** Graphify0.9.56 fdab extraction contains24,557 symbols and73,437 raw relations with zero model tokens; three focused maps,108 generated Obsidian notes and3 canvases have checked links/source hashes. Static maps explicitly leave unresolved callback edges unknown. The map remains dated to its extraction revision.
- **Tracker at the historical 33b checkpoint:**25 children under AMC-1505:11 In Review,1 In Progress (AMC-1512),13 Backlog. AMC-1527 and AMC-1528 are In Review; related AMC-483 is separately In Review. First-use CLI and Studio Home were the next implementation issue at that checkpoint. Optional notary signing and supported-platform qualification remain AMC-1529/1530.

Receipts: `AMC_OS/RESEARCH/2026-09-08-dsh-pi/deployment-readiness-audit/full-release-gate-33b24725.{md,json}` and `container-smoke-cold-verification-repair.{md,json}`. The earlier6553906e full run (11,166 passed, one broken public-docs link) and546c52e4 correction remain preserved. Prior fdabeba9 whole-suite/installed receipts remain historical scoped evidence. That historical host full-gate execution used Darwin ARM64/Node25.5 (EOL); supported production Node/OS paths require AMC-1530. Comparative improvement and industry-standard adoption remain unproven.

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

The current user-directed batch implements the remaining gaps before running combined validation. Independent bounded components may be implemented in parallel, with explicit file ownership and integration. Source reviews and documentation continue during implementation. Separately active sessions can contribute concurrent changes; preserve them and review their committed snapshots independently before accepting completion. After the implementation batch, each slice receives its relevant acceptance exercise and accurate Linear/Obsidian disposition. Local verification does not equal merged, released or independently validated.

| Order | Issue | Outcome | State |
|---|---|---|---|
| 1 | [AMC-1506](https://linear.app/agentmaturitycompass/issue/AMC-1506/p0-stop-neutral-imports-from-inventing-maturity-and-observed-evidence) | Stop neutral imports from inventing maturity and observed-evidence claims | In Review — local commit 5eec4d9d |
| 2 | [AMC-1525](https://linear.app/agentmaturitycompass/issue/AMC-1525/p0-require-authenticated-key-history-admission-before-trusting) | Require authenticated key-history admission before trusting historical signing keys | In Review — be4261ec / 5c8bb044 / 72a2f3d9; cold-read component accepted; included in fdabeba9 whole suite: 11,107 passed |
| 3 | [AMC-1508](https://linear.app/agentmaturitycompass/issue/AMC-1508/p0-recover-authenticated-portal-request-attribution-from-the) | Recover authenticated portal-request attribution from the uncommitted worktree | In Review — local commit 47141f7a; independent persistence review passes |
| 4 | [AMC-1507](https://linear.app/agentmaturitycompass/issue/AMC-1507/p1-preserve-nested-failures-and-branch-provenance-when-importing-pi-v3) | Preserve nested failures and branch provenance when importing Pi v3 sessions | In Review — 1b89a573; focused and independent review pass; included in fdabeba9 whole suite: 11,107 passed |
| 5 | [AMC-1509](https://linear.app/agentmaturitycompass/issue/AMC-1509/p0-make-documented-source-installation-work-with-amcs-pnpm-workspace) | Make documented source installation work with AMC's pnpm workspace | In Review — local commit 2b737b3c; isolated install and signed run verified |
| 6 | [AMC-1510](https://linear.app/agentmaturitycompass/issue/AMC-1510/p0-distribute-the-governed-native-runtime-without-private-workspace) | Distribute the governed native runtime without private workspace dependencies | In Review — 616b7a6b / f7e30f8c / 2d08c60a; strengthened installed-artifact gate passed at 68262e9d |
| 7 | [AMC-1516](https://linear.app/agentmaturitycompass/issue/AMC-1516/p1-publish-a-versioned-external-evidence-profile-and-independent) | Publish a versioned external-evidence profile and independent conformance verifier | In Review — independent standalone verifier consumer: 19/19 accepted, d3cae563 |
| 8 | [AMC-1511](https://linear.app/agentmaturitycompass/issue/AMC-1511/p1-resume-and-fork-signed-native-sessions-across-processes) | Resume and fork signed native sessions across processes | In Review — 927a92ae / e8448405; ownership and recorder integration focused checks pass; exact fdabeba9 full suite and installed fresh/resume/fork acceptance pass |
| Provider conformance | [AMC-1514](https://linear.app/agentmaturitycompass/issue/AMC-1514) | Native provider tool-name encoding, request binding and cold replay | In Review — 9b60d86f, 160 focused cases with passing composite disposition, clean build/types and fresh private install |
| 10 | [AMC-1513](https://linear.app/agentmaturitycompass/issue/AMC-1513/p1-qualify-real-linux-sandbox-enforcement-for-native-tools) | Qualify real Linux sandbox enforcement for native tools | In Review — installed 9d963469 native shell: 41 assertions, six confined calls, seven reconstructed requests and cold verification pass |
| 11 | [AMC-1515](https://linear.app/agentmaturitycompass/issue/AMC-1515/p1-execute-mcp-client-tools-through-the-governed-native-pipeline) | Execute MCP client tools through the governed native pipeline | In Review — installed stdio MCP CLI/SDK with real approvals, refusal and cold verification; HTTP follows in AMC-1535 |
| 12 | [AMC-1512](https://linear.app/agentmaturitycompass/issue/AMC-1512/p1-expose-a-governed-interactive-native-agent-session-workflow) | Expose a governed interactive native-agent session workflow | In Progress — installed chat/resume accepted; real-provider and five-user usability protocol remain open |
| 13 | [AMC-1519](https://linear.app/agentmaturitycompass/issue/AMC-1519/p1-ship-a-typed-native-run-client-with-cancellation-and-receipt) | Ship a typed native-run client with cancellation and receipt verification | In Review — installed TypeScript lifecycle/tools/cancellation and clean Python wheel lifecycle 37/37 accepted |
| 14 | [AMC-1520](https://linear.app/agentmaturitycompass/issue/AMC-1520/p1-add-dsh-capture-with-explicit-process-proxy-and-event-coverage) | Add DSH capture with explicit process, proxy and event coverage | In Review — actual pinned DSH capture, cancellation and import accepted; integrated c1557960 |
| 15 | [AMC-1517](https://linear.app/agentmaturitycompass/issue/AMC-1517/p1-bridge-callback-telemetry-into-amc-with-semantic-conformance-and) | Bridge callback telemetry into AMC with semantic conformance and truthful trust | In Review — actual pinned Pi callback conformance passed 16 assertions; source and artifact receipts retained |
| Comparative evidence | [AMC-1518](https://linear.app/agentmaturitycompass/issue/AMC-1518) | Independent tasks, actual native CLIs and matched local-provider comparison | In Progress — first real Qwen3-4B pilot: zero qualified passes, five qualified failures, four inconclusive after memory-watchdog shutdown; bounded corpus, no ranking |
| 17 | [AMC-1521](https://linear.app/agentmaturitycompass/issue/AMC-1521/p1-recover-and-gate-test-typescript-checks-from-the-existing-worktree) | Recover and gate test TypeScript checks from the existing worktree | In Review — full e790 gate 11,434/11,434 plus production/test types and deliberate negative test-type probe |
| 18 | [AMC-1522](https://linear.app/agentmaturitycompass/issue/AMC-1522/p1-recover-verified-origin-addressed-session-compaction-without) | Recover verified origin-addressed session compaction without invented savings | In Review — installed measured compaction/reconstruction and stale-head refusal; e790 gate passes |
| 19 | [AMC-1523](https://linear.app/agentmaturitycompass/issue/AMC-1523/p1-explain-import-losses-unknown-timing-and-next-actions-before) | Explain import losses, unknown timing and next actions before accepting external evidence | In Review — record mapping/Studio drilldown dfe186da; 52 focused cases and full d8 gate pass |
| Parallel documentation | [AMC-1524](https://linear.app/agentmaturitycompass/issue/AMC-1524) | Graphify code navigation and architecture reading paths | In Review — 9b60d86f, eight maps, 338 notes, eight canvases and 44 source-backed paths; later helpers/validation outside extraction |
| Parallel documentation | [AMC-1526](https://linear.app/agentmaturitycompass/issue/AMC-1526) | Distinguish source-file inventory from actual passing-test results | In Review — source-file and CLI inventory generation current; 38 focused metadata checks pass |
| Deployment | [AMC-1527](https://linear.app/agentmaturitycompass/issue/AMC-1527) | Restore source-built containers and qualify the exact runtime image | In Review — source6553906e LinuxARM64 images; final33b24725 smoke21/21 plus full integrated gate |
| Usability evidence | [AMC-1528](https://linear.app/agentmaturitycompass/issue/AMC-1528) | Report automated persona checks and failures truthfully | In Review — 95aa5e80;35 focused and24 overlapping independent cases pass,103 actual persona checks and2 setup checks pass |
| 24 | [AMC-1529](https://linear.app/agentmaturitycompass/issue/AMC-1529) | Restore authenticated signing through the optional Compose notary service | In Review — actual optional notary/TLS acceptance passed 42 assertions; pinned environment limits retained |
| 25 | [AMC-1530](https://linear.app/agentmaturitycompass/issue/AMC-1530) | Qualify supported Node and OS install paths with executable platform receipts | In Progress — macOS Node22/24 scoped installs and four Windows-script PowerShell cases on macOS accepted; remaining native platform matrix open |
| 26 | [AMC-1531](https://linear.app/agentmaturitycompass/issue/AMC-1531) | Integrate a standalone native workflow with live preview, compaction, signed chat profiles and in-process delegation | In Review — standalone native functionality, installed shell/HTTP and final d8 source/package gates accepted |
| 27 | [AMC-1532](https://linear.app/agentmaturitycompass/issue/AMC-1532) | Align ACP and SDK provider, tools, approval, MCP and committed-update execution | In Review — installed SDK/ACP tools, provider, cancellation and authenticated stdio MCP acceptance |
| 28 | [AMC-1533](https://linear.app/agentmaturitycompass/issue/AMC-1533) | Add signed native context and prompt-command extensions with explicit load/unload | In Review — actual installed signed chat/extension lifecycle 11/11, no DSH/Pi dependency |
| Urgent correction | [AMC-1534](https://linear.app/agentmaturitycompass/issue/AMC-1534) | Count native request/tool usage and stop work at signed budget limits | In Review — installed exact quota/race/cold verification and nonzero refusal; full e790 gate passes |
| Native transport | [AMC-1535](https://linear.app/agentmaturitycompass/issue/AMC-1535) | Build native Streamable HTTP MCP with pinned origins and credential references | In Review — installed 0af82e28 CLI/SDK HTTP/SSE with credential references, real approvals, refusal/cancellation and six verifier receipts |
| Native Studio | [AMC-1536](https://linear.app/agentmaturitycompass/issue/AMC-1536) | Run governed native tasks, approvals, cancellation and verified continuation inside Studio | In Review — b8e82167 scoped runtime 111/111 and installed browser 10/10; real-model and deployment limits retained |
| Signed subsets | [AMC-1537](https://linear.app/agentmaturitycompass/issue/AMC-1537) | Start native code review with only signed read-only tools and accurate model-visible capabilities | In Review — signed subset be5c3583, Chat startup fd923f31, actual compiled CLI/ACP 2/2 with signed denials and cold verification; correction da1de20c |

| Task validation | [AMC-1538](https://linear.app/agentmaturitycompass/issue/AMC-1538) | Separate turn completion from operator-defined public validation | In Review — 7bd1e8ce; 175 focused tests and 10 completed installed cases; cancellation CLI verifier limit retained |
| Reviewable outputs | [AMC-1539](https://linear.app/agentmaturitycompass/issue/AMC-1539) | Retain bounded final coding source before cleanup | In Review — helper 9ad22983; 23/23 focused cases and actual three-CLI scripted retention acceptance pass, 22/22 oracle checks each |

The scoped queue covers: distributable native runtime, interactive resume/fork workflow, real platform sandbox backends, provider conformance, signed extensibility, telemetry interoperability, independent verification and matched-workload benchmarks. Existing release/coverage/issues are linked rather than duplicated.

## Expanded deployment and usability scope

The September 8 goal explicitly includes native standalone parity, deployment readiness and an easier experience against leading current harnesses. AMC-1511 ownership and AMC-1527 source-container repairs have dated acceptance and are In Review. The final d8 native implementation passed combined clean-package, keyless useful-task, cold-verification and release-scan acceptance; remaining supported-platform paths, live tasks and optional deployments retain their separate scopes. Reuse AMC-483 for release-gate/CI/install alignment and AMC-7 for published-install verification; older Done issues are historical evidence, not proof of this candidate.

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

- 2026-09-09 (Phase A audit): Read-only step 0 receipt written at `AMC_OS/RESEARCH/2026-09-09-worktree-audit/README.md`, reviewed integration `7bd1e8ce8e0b38c71f2d9792cd2e2043a1c3c544`. All existing worktrees and shared stash preserved. Recoveries filed as AMC-1542/1543; no runtime acceptance or source port ran during the audit.
- 2026-09-09 (Phase A reconciliation): Captured and reviewed every child in `AMC_OS/RESEARCH/2026-09-09-phase-a-reconciliation/reconciliation.json` at the same source. Historical receipt boundaries retained; no accepted receipt demonstrated false and no issue closed from summaries. Source fixes already present for correlation/confinement/coverage-floor claims are recorded separately from remaining concerns. Issue comments, Linear plan and checkpointed Obsidian records updated.
- 2026-09-09 (implementation batch): AMC-1542 committed and fast-forward integrated at `3c49ca9b45be57f8c0fb6515e23da7bbe736cd7e`; managed hooks authenticate revocations and refuse orphan-signature deletion. AMC-1540 committed directly on integration at `51404c77b91aa9f045453ecdae091d58d8203b72`; Studio explicit identical retry retains earlier uncertainty and edited drafts. Source-only records: `AMC_OS/RESEARCH/2026-09-09-managed-revocation-recovery/README.md`, `AMC_OS/RESEARCH/2026-09-09-native-submission-recovery/README.md`. Neither commit has fresh-clone acceptance, full suite or release gate yet. Implementation hooks were disabled; verification follows the batch. AMC-1541 archive backend/interface is now assigned with disjoint paths. No publication, deployment or superiority claim.

### 2026-09-09 — API, source setup and portal follow-through integrated

Integration source: 79f36cfd4d0d33af34ce4a07979c5195b149ba99. AMC-1509 helper implementation: 19ef96acd1680d776acb46d5dacb9b2e7e21aed1. AMC-1508 persisted regression: 79f36cfd4d0d33af34ce4a07979c5195b149ba99. Source-only implementation on Darwin 25.6.0 arm64, Node v25.5.0; no tests, build or install have run for this batch.

The source-install helper now uses isolated settings for installation, build and runtime, removes inherited provider credentials, selects the local stub explicitly and uses the running Node executable. It consumes JSON summaries and reuses the installed-evidence verifier for an authenticated tool turn and a session extended by a separate process. Every expected turn must complete and every recorded request must reconstruct; exit zero alone is insufficient. Synthetic subprocess regressions cover isolation, false-success verification, missing resume extension and failed installation.

Portal regressions use real temporary SQLite persistence and the actual role policy after injected authentication. They assert exact persisted identity, strict body rejection, unauthorized identity/role refusal and unchanged prior rows. This is not real HTTP cookie authentication acceptance. No new production attribution defect was established.

Next: fresh merged-candidate clean install, focused acceptance, security mutations, full suite and release gate. Mutations should remove body strictness, principal propagation, agent exclusion and role restriction individually; affected persistence regressions must turn red. Structured-verifier mutations must not permit successful exit codes or reassuring text to qualify missing/invalid evidence. Restore each mutation. AMC-1508 and AMC-1509 remain In Review, not Done.

Linear: https://linear.app/agentmaturitycompass/issue/AMC-1508 and https://linear.app/agentmaturitycompass/issue/AMC-1509.

### 2026-09-09 — Candidate generation and publication correction

Frozen install/build/staged TypeDoc completed in the79f36cfd preparation clone on Darwin25.6 ARM64, Node22.22.0/pnpm10.33.0. TypeDoc emitted zero errors and395 warnings;185 public guides were staged. Public OpenAPI generation initially failed on a nullable validation reference. AMC-1544 fixba54422d and candidate-generated artifact28acdc8a are integrated. AMC-1543 follow-through753da010 addresses concrete reference-navigation omissions. These are preparation results, not final acceptance. Records: AMC_OS/RESEARCH/2026-09-09-api-reference-recovery/{README.md,candidate-preparation.json,candidate-generation.log,candidate-generation-1544.log,candidate-typedoc.log}. Source inventory reports1,376 test files, not test passes. Tests/mutations/full suite/release gate remain next.

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

- 2026-09-08 release audit: quick gate at bd781be5 passed its ten exercised checks with full suite/persona installs/live health skipped. AMC-483 is In Progress again for remaining release/install qualification; AMC-1527 is the next deployment-blocking container repair after session ownership. Evidence: `deployment-readiness-audit/README.md`.

- 2026-09-08 AMC-1511 integration: local927a92ae, independent-reviewed production hashes unchanged; 131 focused tests in15 suites pass, including genuine child processes. 73b7ae43 inventory becomes1,323 sourcefiles. Isolated build/typecheck/count/docs/architecture pass; ownership-inclusive full suite running. Compatibility: signed SQLite handover/dead-local-owner resume; JSONL resume/recovery deliberately fail closed; legacy unowned read/fork only.
- 2026-09-08 broader comparison: five current first-party harness sources audited, six recommendations with existing AMC capabilities credited. New AMC-1528 corrects automated persona evidence labels; AMC-1512/1518 retain native discovery and actual matched usability measurement. DeploymentAMC-1527 is in progress; AMC-483 covers remaining release/install qualification.

- 2026-09-08 tool-recorder integration: whole73b7suite11102/2 narrowed to one real childwriter-binding omission plus obsolete anchorfixture; CLInew/resume/fork hadsameproductionomission. e8448405 binds tools to actual nativewriter and preservesnegativepersistedtampertest;82affectedchecks, source types/architecturepass. Exactfdabeba9 has1,324committedtestfiles. Independent source-generation excludes activeuncommittedcontainer/scannerfixtures; nextfullcandidateis isolated.

- 2026-09-08: Exact `fdabeba9` isolated full suite and installed artifact qualification are green: 11,107 passed / 0 failed / 0 pending. Actual installed CLI fresh/resume/fork denied-tool evidence and both cold verifiers pass. Previous `73b7ae43` failures remain preserved; container and release work are the next qualification boundary.

- 2026-09-08: Container source `77aae47a` integrated after independent review; no local Docker engine. Release-core `49b163eb` corrects mandatory scan/metadata/nested-package authority and source package-manager behavior. Exact isolated build, 34 artifact tests and all six actual prepack commands pass. Worktree inventory remains 45 total / 15 dirty / one stash with all existing state preserved. First-use design is recorded for AMC-1512; remaining release gate/isolation integration is active under AMC-483.

- 2026-09-08: Exact33b24725 full release gate passes13/13 configured checks and11,196/11,196 tests across1,330 files, zero pending/todo; live health explicitly skipped. Linux ARM64 images from6553906e pass21/21 checks with final33b host smoke, all cleanup succeeds, VM stopped. AMC-483/1527 enter In Review; AMC-1512 starts read-only CLI guide and Home discovery.25 child states:11 In Review,1 In Progress,13 Backlog. Retained failed receipts remain unchanged; no release/deployment.

- 2026-09-08 standalone steering: native AMC features must work without DSH/Pi. Root reports 28 children: 11 In Review, 17 In Progress, 0 Backlog; AMC-1531/1532/1533 track standalone integration, ACP/SDK alignment and signed extensions. New live preview, compaction, profiles/delegation, approval, extension and ACP-update source remains unverified. All new checks are deferred; 33b24725 stays historical only.

- 2026-09-09T06:54:08Z — Standing-order Phase A step 0 completed at `7bd1e8ce8e0b38c71f2d9792cd2e2043a1c3c544`: all 45 worktrees and 107 local branches inventoried read-only; 160 dirty leaf paths and 90 unmerged branches individually classified. Recovery issues AMC-1542 (lease verification) and AMC-1543 (TypeDoc) filed after diff/test-seam review. Unknowns retained, no ports/tests/installs/worktree changes; shared stash unchanged. Receipt: `AMC_OS/RESEARCH/2026-09-09-worktree-audit/README.md`, inventory SHA256 `5f6de25cac25309f6973a1ae44538f8b0482a81e7232abfa462f2753060149f7`. Current Linear tally 38: 31 In Review, four In Progress, three Backlog. Home/Now/Roadmap/Current Operations checkpointed then updated; evidence note added. Next: Phase A queue reconciliation. Direct GPT-6 Astra instruction overrides the brief model line; main-ahead and queue corrections recorded without touching the other session’s uncommitted brief.

### 2026-09-09 — failed candidate retained; corrections and external worker

Source0fcce267 completed the actual full suite and gate with the failed disposition above; no historical accepted receipt was disproved. Source fixes46f91e70 and dependency floors/resolution7ad47529/c2a7b417 are integrated. Runtime advisories are tracked on existing AMC-483. Sid-authorized Chat on Steroids GPT-6 Pro began the isolated intake implementation for1512/1518. Exact dispatch, ownership and failed results are in the linked dated records. No issue was closed; fresh corrected-candidate validation and human/provider/platform evidence remain pending.

### 2026-09-09 — Chat on Steroids implementation integrated

Sid-requested GPT-6 Pro settings are saved for workers and Goal/Loop/Plan in the installed app, with a no-fallback user instruction. Task “Implement AMC Evidence Intake” completed. Its exact three source/document paths were committed on `codex/cos-human-first-use` at `0030c2b5cf087291384859f8d0238055a2caff49` and merged at `e63c8cb7fa108561b584a807ae59c4da63bb6792` after source review. Local intake records declarations, checks local recording hashes and rejects insufficient/mismatched cohorts without rankings; it cannot replace real participants. Source browser-receipt correction `aa409127` also accounts for retry/archive scenarios and rejects duplicate/incomplete/stopped results. All tests remain deferred until this implementation batch and generated inventory are ready. Dispatch/handoff: `AMC_OS/RESEARCH/2026-09-09-chat-on-steroids/`; next prepared candidate: `2026-09-09-phase-a-acceptance/attempt-2/`. No issue closed.

## September 9 — GPT-6 Pro background Goal dispatched

Sid requested continuing CoS work in parallel with Goal or Loop instructions. The previous finished intake loop is Off; the new Implement AMC Observer Capture conversation visibly shows Pursuing goal, GPT-6 Pro and a running assistant acknowledgement. Its separate branch codex/cos-study-capture starts from e63c8cb7fa108561b584a807ae59c4da63bb6792. The saved finite queue and resumable handoff instructions are in AMC_OS/RESEARCH/2026-09-09-chat-on-steroids/goal-task.md; goal-dispatch.json records UI delivery and scope. The queue implements preregistration, observation capture and complete intake export, then authored regressions/docs. No tests, model study or completed implementation is asserted. Codex remains integration owner; final validation waits for the implementation handoff. Generated test-source inventory at b412b404198a3066bc5f149534bda04594591630 comes only from the pinned post-CoS-generation clone; no generator ran in root. No issue was closed.

## September 9 — native signed stop conditions implementation

AMC-1545 is now In Progress for the confirmed signed delegation stopConditions gap, blocking the related AMC-1531 closure boundary. Codex Astra is implementing validated max-turns:N and timeout-ms:N across initial/continued children, native operator configuration and inherited descendant limits in disjoint runtime/operator worktrees. Source at cf89a532 documented the missing enforcement; no earlier scoped accepted receipt claimed it. Authored regressions and combined qualification remain deferred until this and the CoS capture implementation finish. Record: AMC_OS/RESEARCH/2026-09-09-delegation-stop-conditions/README.md.

Live Linear tally after filing this closure-blocking defect is 40 children: 31 In Review and 9 In Progress. No issue closed. Existing generated inventory commit b412b404 and CoS observer-capture Goal remain separate. Root preserves other-session changes and old worktrees.

### 2026-09-09 — Native delegation stop conditions integrated

AMC-1545 native delegation stop enforcement is integrated at `288e210f6b22ebb7d4e2c903aa50959849fcbbb8`, following operator merge `14fba22c` and runtime merge `eb034de5`. AMC now implements validated `max-turns:N` and nonresetting `timeout-ms:N` across initial and continued child work, CLI/chat/signed presets, and narrower descendant declarations. Runtime cancellation preserves the distinction between a returned executor and an uncooperative executor whose stop remains unconfirmed. Codex source review is complete; authored regressions, mutations and final fresh-candidate qualification have not run. AMC-1545 remains In Progress and AMC-1531 remains open. Record: `AMC_OS/RESEARCH/2026-09-09-delegation-stop-conditions/README.md`.

Runtime worker 0d1565d4cafe7aad2467a0d7f6ea6e7410a5d0e7 and operator worker6ee3a0e0 are preserved on their own branches; root committed only owned explicit paths. Other-session architecture/brief edits and old worktrees remain untouched. No test, build, install or generator was run for this implementation batch. User steering now leaves CoS background work alone until completion, timeout or an instruction request.

### 2026-09-09 — CoS capture integrated and guided workflow dispatched

Chat on Steroids completed its observer-capture queue on GPT-6 Pro. Codex read the final source and an independent Astra source reviewer found no concrete blocker; worker 745893115193834ddbbadfd0accec37a69f71e72 is merged at 3d1f464c842934ec73d0f68bf1fd30467c054e5f. The tool preserves a preregistered roster, explicit observation events and correction history, deriving and verifying actual recording hashes before any complete intake export. No tests or human sessions have run for this source. The completed Goal was paused to prevent repeated work. Its next task, Implement AMC Observer Workflow, is delivery-confirmed with Pursuing goal and GPT-6 Pro visible, scoped to tmp/cos-observer-guide: guided terminal preparation, resumable observation entry, status/export and authored regressions over the unchanged capture core. The goal opener initially failed; direct dispatch recovered delivery while preserving the saved Goal. Codex continues its own implementation and inspects CoS only on completion, timeout or an instruction need.

Local record: AMC_OS/RESEARCH/2026-09-09-chat-on-steroids/capture-integration.json and observer-goal-dispatch.json. No new check or test runs; fresh qualification remains deferred.

### 2026-09-09 — Studio credential binding integrated

AMC-1546 Studio credential binding is integrated at `d668d84155d600eec1dbe1133a6b9380e1fad667`, including source `b889cd4f8bcdfc8bfc76bfac3f3731cc3889b0e4` and regression source `7c18ce6490bfe391a42dbaf910d1fe8d38ad2e7a`. Authentication now validates all supplied agent credentials and intersects their scopes; original duplicate security header names are refused, and intent-owner refusal precedes tool execution. Static-token-only checks/read access and human operator authentication retain their documented boundaries. Actual HTTP, lease, signed approval and filesystem side-effect regression source is authored, with a clearly labeled synthetic diagnostic control input; none has executed. AMC-1546 remains In Progress and blocks AMC-1508 pending final fresh-candidate qualification. Record: `AMC_OS/RESEARCH/2026-09-09-studio-agent-credentials/README.md`.

No acceptance ran in root or any worktree. Final qualification remains deferred until the currently owned implementation is complete.

### 2026-09-09 — Next native evidence lifecycle boundary

A bounded source inspection at82570f1474f1aa7821bc36c38221802b61081fe9 confirms the standing spill gap: sessionService calls spillPolicy before the signed result append; spillStore persists plaintext; retention only follows ledger blob_ref values; and evidence bundles preserve spill commitments without including those retained objects. Existing authenticated spill retrieval correctly distinguishes missing/tampered bytes. This finding does not invalidate measured preview compaction savings or independently prove a resume/fork defect.

The old blanket backup claim is narrowed: default backup policy already includes .amc/spill and encrypts the outer backup payload, although current staging first copies plaintext. DSAR correctly remains awaiting-fulfilment without a deployer handler; no completed erasure is claimed. No production data or source changed during this inspection. Next implementation should connect commit-before-materialization, authenticated encrypted retained objects with explicit legacy handling, and shared retention/export lifecycle, mapped to AMC-1522 retained evidence and AMC-1531 native workflow. Do not infer subject ownership from tool-output text. Source pointers: src/session/sessionService.ts, src/session/sessionSpine.ts, src/session/spill/spillStore.ts, spillPolicy.ts, spillTypes.ts, src/ops/retention/retentionEngine.ts, src/bundles/bundle.ts, src/ops/backup/backupEngine.ts and src/vault/dsarAutopilot.ts. No new issue or passing receipt is implied yet; exact implementation ownership and issue linkage must be declared before writes.

### September 9 — retained spill close blocker opened

AMC-1547 is In Progress and blocks AMC-1522: source review at `f0442ac118573683080681f443f518853cd91f22` confirmed plaintext raw spill materialization before its signed event and missing retention/export integration. Native encrypted v2 storage, signed pre-materialization commitments, authenticated lifecycle inventory, scoped erasure and encrypted export/restore are now being implemented in disjoint owned worktrees. Existing compaction receipts remain evidence of their measured preview savings, not raw spill lifecycle qualification. Default encrypted backups already include `.amc`; DSAR already refuses to claim fulfilment without a handler. No production key operation or test/check/build has run for this change. Record: `AMC_OS/RESEARCH/2026-09-09-spill-lifecycle/README.md`. [AMC-1547](https://linear.app/agentmaturitycompass/issue/AMC-1547). The live Linear enumeration returned 42 children: 31 In Review and 11 In Progress, no further page. No issue was closed. CoS remains on its guided-observer Goal; no app inspection was performed.


### September 9 — encrypted retained output and guided observer integrated

AMC-1547 core implementation is integrated at `249a2a812f2600c53564fa571761aa2cfb80a144`, with authored session/retention/bundle regressions merged at `d9d55034b1e856513eea1c68b09e50ecd433063e`. Native sessions sign a spill commitment before encrypted v2 materialization; authenticated inventory, scoped audited erasure and ciphertext export/restore are implemented. Existing SQLite retention selects only expired closed-session objects and processes each locator separately to avoid a stuck backlog. Evidence bundles report ciphertext completeness and named gaps separately from plaintext verification. JSONL automatic retention, external-copy erasure and DSAR subject mapping are not added. The operator command Goal is being dispatched to CoS; final fresh-candidate tests, mutations and release gate remain pending. No production key operation or acceptance ran. AMC-1547 remains In Progress and blocks AMC-1522; earlier compaction savings receipts retain their original preview-only boundary. Record: `AMC_OS/RESEARCH/2026-09-09-spill-lifecycle/README.md`. [AMC-1547](https://linear.app/agentmaturitycompass/issue/AMC-1547).

Chat on Steroids completed its guided observer workflow on GPT-6 Pro. Worker `71a81a966188f044c124e09ccc6bca0a45ed9dfb` is merged at `25e0c58805e5435c45dc134f29e07835c494219e`. AMC now has guided study preparation, explicit observation entry, resumable status and reviewed export over its unchanged capture/intake core. Root and independent Astra source review found no concrete blocker; tests and actual human sessions remain pending. The completed automation was paused after its final handoff. Its next finite Goal implements native retained-output operator commands in `tmp/cos-spill-commands` for AMC-1547. The automatic opener timed out; direct composer dispatch recovered it. The app confirms delivery, the active conversation **Implement AMC Commands**, **Pursuing goal**, **GPT-6 Pro** and a running turn. Codex continues independently and inspects CoS only at completion, timeout or an instruction need. Records: `AMC_OS/RESEARCH/2026-09-09-chat-on-steroids/observer-integration.json` and `spill-goal-dispatch.json`.

Live Linear child-state read returned the complete page with 42 children, 31 In Review and 11 In Progress. Epic, plan document and AMC-1547/1512/1518 comments were updated. No issue was closed. Codex source authoring/review ran on Darwin 25.6.0 ARM64; final clean Node22 candidate validation has not started. Root preserves other-session architecture edits, the standing brief, old worktrees and the shared stash. CoS spill Goal is active after the timed-out opener was recovered through direct dispatch.


### September 9 — bounded authenticated retained-output reading

Native bounded retained-output reads are integrated at `3aa7077af4cae2d3da957c1825b9c47a48f2d382`: `amc session spill-read <locator>` and the public `readSessionSpillRange` API authenticate all supplied references, verify/decrypt the selected full object, and return an explicit byte range with origins and next offset. Metadata-only reference inventory avoids reading unrelated ciphertext. SQLite/JSONL read-only backend admission refuses conflicting environment selection and malformed or dangling markers; an empty monitor pin cannot be reported as verified identity. Text escapes terminal controls and JSON preserves exact bytes as base64. Source review and authored synthetic regressions only; no tests/builds/key operations, automatic model retrieval or whole-chain acceptance are claimed. Record: `AMC_OS/RESEARCH/2026-09-09-spill-lifecycle/source.json`.


### September 9 — final runtime batch integrated and validation started

Chat on Steroids completed its retained-output operator commands on GPT-6 Pro. Worker `7c0f01bf73fb64845362bda20cd456e9bc6af31e` is merged at `0f4b10a4553d1c652e4b0e07a705acf7d9bd45bd`, with root CLI/documentation registration at `68458818799d1db7826d67d1b604d6ad77ac4432`. Native inventory, encrypted export/restore and deliberate exact-scope erasure are integrated alongside the bounded read command. Root and independent Astra source reviews are complete; the final command regressions include unsafe history links and genuinely signed conflicting references. The completed Goal is paused and its final response and idle state were observed. The separate finite GPT-6 Pro closure-evidence mapping Goal is delivered and visibly active while Codex validates. Its automatic opener timed out; direct composer delivery recovered it. Codex leaves it undisturbed until completion, timeout or instruction need. Records: `AMC_OS/RESEARCH/2026-09-09-chat-on-steroids/spill-integration.json` and `closure-goal-task.md`.

Final runtime candidate `c16492c10592112fe610bd2e59f216f8f7f310b4` includes reviewed inventories from the successful fresh `e12060297b6f847903501354d3a6425ffc51adb7` install/build/CLI-inventory/count generation on Darwin 25.6.0 ARM64 / Node 22.22.0. The earlier `68458818` build failure remains immutable in `final-batch-generation/`. Full acceptance is running in a separate clean clone under `AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/attempt-2/`. The independent spill baseline measured 77/79 passed and two failed verification assertions; no mutations were applied, and its clone/processes are confirmed clean/closed. Root authored fixture/expectation corrections while the frozen full gate collects the complete failure batch. Record: `AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/spill-mutations-c16492c1-01/README.md`. No full-suite pass, killed-mutation result or issue Done is claimed.

## c164 complete failure batch — September 9

Candidate `c16492c10592112fe610bd2e59f216f8f7f310b4` failed complete acceptance in a fresh independently installed clone on Darwin 25.6.0 ARM64 / Node 22.22.0. The full suite measured **12,263 total: 12,233 passed, 30 failed, 0 pending/todo**. The release gate measured **10 of 14 executed checks passed, 4 failed, 1 skipped**: test types, full suite, architecture limits and runtime dependency audit failed; live deployment health was skipped because no live URL was configured. Focused spill and stop/auth baselines also failed (77/79 and106/126 passed); no mutations were applied. The independent test typecheck recorded67 diagnostics. All observed command processes closed. The full-suite clone retains eight tracked test-key/public-history changes; it is not clean after execution. Root is repairing the complete failure batch before freezing a new candidate. Immutable receipts: `AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/attempt-2/result.md`, `spill-mutations-c16492c1-01/`, `stop-auth-mutations-c16492c1-01/` and `test-types-c16492c1-01/`. No issue Done, full-suite pass, deployed release or comparative ranking is claimed.

## Corrected complete candidate running — September 9

Corrected candidate `a5987643ef6c26b01f687226fbc6a6709fc182cb` is now running complete acceptance in a new independent clone via `AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/attempt-3/runner.py`. It includes the complete c164 failure-batch fixes: narrow study type contracts, explicit security fixtures, native agent initialization, bundle helper extraction, public guide navigation, directly supervised TypeDoc rendering with shared artifact builds, and the remaining YAML dependency corrections. Renderer timeouts and performance floors are unchanged. No independent compiler, mutation or build lane overlaps this full gate. The failed c164 results below remain immutable; no current-candidate pass or issue Done is asserted.

## Scope disposition — September 9

AMC-1524 moved to Canceled under Sid’s explicit instruction to stop Graphify. Existing dated maps/notes are preserved; no extraction, regeneration or runtime acceptance is claimed. Live tracker after the change:42 children,30 In Review,11 In Progress,1 Canceled. The CoS map retains its correctly dated earlier31/11 snapshot; this later disposition supersedes its suggestion that Graphify still needs an owner decision. Current full qualification remains pinned to a5987643ef6c26b01f687226fbc6a6709fc182cb.


## 2026-09-09 — complete a598 source acceptance; package and focused qualification

Candidate `a5987643ef6c26b01f687226fbc6a6709fc182cb` passed one complete source suite in a fresh independent frozen-installed clone on Darwin 25.6.0 ARM64 / Node 22.22.0: **12,262 total, 12,262 passed, 0 failed, 0 pending/todo**. All **14 executed release checks passed**; **live-deploy-health was skipped** because no live target URL was configured. The subsequent clean-source installation check passed. All observed command groups closed. The suite left eight tracked test-key/public-history changes, preserved in the receipt; the clone is not claimed clean after the suite. The source candidate and registered keyless package smoke are qualified within these limits; issue-specific security mutations, installed browser/platform checks, human sessions and matched comparative outcomes remain separate. No issue is moved to Done from this aggregate alone. Receipt: `AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/attempt-3/result.md`; previous failed attempts remain immutable.

The finite GPT-6 Pro closure-evidence map is complete, independently reviewed and merged at `d24bfb21c7b61ac67fdd3582f946bf946ddb69a9` (worker `4967f97541140fcd5d5b18360e9953006c061500`). Its dated map covers the supplied 42-issue snapshot; later qualification and the Graphify cancellation are recorded separately. The new finite GPT-6 Pro retained-output boundary mutation helper goal is delivered and shows Pursuing Goal. Its automatic opener failed and direct composer delivery recovered it; active source reads have not been observed. Codex leaves it undisturbed until completion, the recorded timeout or instruction need. Records: `AMC_OS/RESEARCH/2026-09-09-closure-map/REVIEW.md` and `AMC_OS/RESEARCH/2026-09-09-chat-on-steroids/spill-boundaries-dispatch.json`.

Current queue remains 42 children: 30 In Review, 11 In Progress, 1 Canceled. Native spill and stop/auth mutation runs have returned for root review; installed browser and Linux cancellation qualification use the separately retained a598 package. No issue Done or comparative result is asserted.


## 2026-09-09T15:45:42.159674+00:00 — installed spill 02 preserved; JSONL lifecycle corrected

Actual source/package `a5987643ef6c26b01f687226fbc6a6709fc182cb`, helper `446087ca8510c27e83c2465bab9946634a88724b`, Darwin ARM64 / Node22.22.0 / npm10.9.4. Attempt02 completed all SQLite groups but remains aggregate unqualified: JSONL second session/new refused after A completed, with downstream JSONL cases unreached. All observed inner/outer processes closed. Immutable result: `AMC_OS/RESEARCH/2026-09-09-installed-spill-acceptance/attempt-02/disposition.json`; actual private receipt SHA256 `c3a0f9b93cc6289da0afcb16d84de017b28dccce7511441228d60e39af2384e3`. Original attempt01 receipt is unchanged.

Helper `7894855312f3bad1ce9ea8dbcba7d5bb63e08401` now closes each real ACP client before the next fixture writer. JSONL explicitly declares concurrentWriters:false; the generic SDK refusal did not capture its internal reason, so the diagnosis is source-backed, not falsely quoted as a runtime lock error. No native guard changed. Distinct JSONL-only attempt03 is prepared; SQLite will not be repeated, public JSONL history-loader gap remains blocked.

Handed-over public docs fix committed as `77912a555501c652989b090914b7c52c8e7c3bf0`; targeted fresh-clone verification pending. LINEAR-PENDING AMC-1547 and AMC-1505: preserve open state and link actual receipt, no issue closure. LINEAR-PENDING AMC-1543: source correction committed, not yet verified. Current Linear discovery exposes no namespace; Sid reports earlier progress comment approved, read back rather than duplicate it. OBSIDIAN-PENDING: vault read explicitly refused outside approved root; current/evidence notes not updated. Checkpoint Home/Now/Roadmap before later material rewrites. No current child tally, full-suite pass at a new commit, human/provider/comparative result, publication or deployment claimed.


## 2026-09-09T16:01:56.404783+00:00 — native JSONL cold-verifier correction; authorized vault updated

Attempt03 is closed and unqualified, actual receipt SHA256 `2900a0c4646e996e48acf67f8e5f7630eba77de3e938f620c7facd90caba05fa`. Both real JSONL fixture sessions completed and clients closed; cold A reconstructed two requests but reported its session missing. Source inspection confirms concrete SQLite lifecycle membership in verifyAgentRun, despite selected JSONL history. Exact disposition: `AMC_OS/RESEARCH/2026-09-09-installed-spill-acceptance/attempt-03/disposition.json`. All observed inner/outer command processes closed; no downstream JSONL result inferred and no unchanged a598 retry.

Real correction `8bef3c3bdb9358cb068a8ef8601968148ee54a0b` preserves full chain/payload/signature/pin checks, uses read-only selected JSONL lifecycle for membership and unsigned IDs, and adds six authored regressions. Targeted fresh-clone verification is running under `tmp/cos-public-docs-correction-01/`, including docs correction77912a55 and existing SQLite verifier regressions. This is not a full suite, package qualification or release. Missing public JSONL event loader remains explicit.

The user shared the exact Obsidian vault; authorized reads and writes now succeed. Home, Now, Roadmap and Current Operations were checkpointed byte-for-byte before updates; new Evidence/2026-09-09 Installed Spill Corrected Attempts.md records actual boundaries. Hash receipt: `AMC_OS/RESEARCH/2026-09-09-installed-spill-acceptance/attempt-03/obsidian-update.json`. Previous vault-denial records remain dated history, not a current blocker. LINEAR-PENDING AMC-1547/AMC-1505: keep unqualified installed scope open, link attempt03 and runtime correction. LINEAR-PENDING AMC-1543: committed docs source awaiting scoped artifact result. No current Linear actions can be discovered; user-approved prior progress comment is not duplicated. No current child tally is inferred.


### 2026-09-09T16:21:11.238479+00:00 — Scoped correction complete; evidence integration blocked

Source commits 77912a555501c652989b090914b7c52c8e7c3bf0 (public docs) and 8bef3c3bdb9358cb068a8ef8601968148ee54a0b (JSONL selected-lifecycle verifier) are integrated. Fresh clone at 8bef3c3b on Darwin 25.6.0 arm64 / Node v22.22.0 / pnpm 10.33.0 passed build, test types and 19/19 scoped tests. The actual predecessor mutation failed 3/6 JSONL cases, then restoring the candidate passed 6/6. Observed cleanup closed and tracked clone status was clean. Receipt: AMC_OS/RESEARCH/2026-09-09-public-docs-correction/disposition.json. This is not new installed, full-suite, release or platform qualification.

Installed a598 attempts 01/02/03 remain preserved and aggregate unqualified; SQLite groups passed in attempt 02, while corrected JSONL attempt 03 exposed the native cold-verifier defect. Safe mirrors and checkpointed Obsidian result updates are saved. The final compound evidence-staging request was blocked before execution by the tool safety check; read-only followup found unchanged HEAD and empty staged index. New attempt-03 and scoped-result mirrors remain local/uncommitted. No equivalent staging retry or bypass was attempted. Exact blocker: AMC_OS/RESEARCH/2026-09-09-public-docs-correction/checkpoint-blocker.json.

LINEAR-PENDING: AMC-1547 and AMC-1543 retain In Progress targets; AMC-1505 requires a live child read before any tally. No Linear actions are available in current discovery; the earlier approved comment requires readback, not duplication. Pending bodies: AMC_OS/RESEARCH/2026-09-09-public-docs-correction/linear-pending.json. No Done claim. NEXT_ACTION: resolve the staging tool gate, then follow the saved NEXT_ACTION.md for the actual AMC-1540/1541/1538 implementation contracts and newly pinned installed JSONL boundary. Missing public JSONL history API, human/provider/comparative/platform evidence and release/key gates remain explicit.

## 2026-09-10 — Phase A step 0 read-only worktree audit refresh

Latest user request selected an independent audit, not task23 source work or validation. Full standing brief, root AGENTS and global/revenue-delivery rolebooks read. CoS-only serial execution; no model switch, fallback or workers. Capture: 2026-09-10T16:08:39.883433+00:00 through 2026-09-10T16:08:45.641346+00:00. Integration metadata snapshot: 4d2d69e5d4d01bfd1f82662ceff0305b5c2885b5 on amc/gap-register-execution; Darwin25.6.0 arm64. Node was not executed or measured. This is not a clean Git baseline, index/ownership assertion or acceptance receipt.

Every registered worktree received read-only branch/HEAD, porcelain leaf status and recent/exclusive commit observations: 63 worktrees, 15 dirty worktrees, 281 dirty paths (129 in root), 125 local branches and 90 unmerged local branches. Six registered Claude and 18 registered Codex worktrees are included, including tmp and /private/tmp. The named root .codex directories were absent; .claude/worktrees contained only the registered directories. Registry start/end observations agreed. All initial inventory commands returned successfully; owned session1447 returned terminal exit0 in chunk747cb5.

Required receipts are written: AMC_OS/RESEARCH/2026-09-09-worktree-audit/inventory.json and README.md. Inventory SHA256 ed43027ed92ce5096a27425e268a2fbf2bbbff26c51ce42cfccc6f5b6424b76c; README SHA256 c230385f29af1681135a3037a0c85f9501c98d611e86a9c8d927396fe728fdc0. Raw command/per-worktree evidence: refresh-2026-09-10/raw-inventory.json. Original September9 files were preserved byte-for-byte in historical-2026-09-09 before replacing the canonical inventory/README. Compared with September9: 18 added registrations, none removed, root is the only existing worktree with a HEAD/branch/path-status delta. Compared with the named September8 worktrees-refresh-final-native-3ea14e58.json: 18 added, none removed and two existing worktrees with metadata/status deltas. The earlier ignored helper is excluded from the comparable ordinary-status count; no ignored-output scan or helper repin occurred.

Every dirty path and unmerged branch has a disposition. Dirty paths:83 recoverable work,54 superseded,0 abandoned experiment,144 unknown. Unmerged branches:0 recoverable work,69 superseded,0 abandoned experiment,21 unknown. Recoverable paths belong to the existing AMC-1514 native provider/modality authoring batch, identified by current status and exact dated authoring records; this is not whole-file ownership, correctness or safe staging. Historical supersession is retained only with exact prior dirty-file hash or branch-tip identity and cited commit ancestry. Unknown is not abandonment or permission to port. No source was ported.

A supplemental stoic-faraday/TypeDoc source-comparison call was safety-blocked: "This tool call was blocked by OpenAI because we couldn't determine the safety status of the request." Its exact commands and response are preserved in refresh-2026-09-10/REVIEW_BLOCKERS.md. No retry, split, equivalent retrieval or alternate executor. The affected current source dispositions remain unknown; dated AMC-1542/AMC-1543 recovery records are not new acceptance or grounds for duplicate recovery issues. The successful metadata capture is separate from this unresolved supplemental review.

LINEAR-PENDING: independent audit comments for AMC-1514 and AMC-1505, targetState=null (no transition). Exact bodies, paths and dedup requirements: AMC_OS/RESEARCH/2026-09-09-worktree-audit/refresh-2026-09-10/LINEAR-PENDING.json, keys worktree-refresh-2026-09-10-AMC-1514 and worktree-refresh-2026-09-10-AMC-1505. Discovery advertised no Linear functions, only CoS/files. No live issue/comment read, deduplication, creation/update or new delivery ID. The established recovery batch already has AMC-1514; unresolved unknowns do not justify fabricated new issues. Task23's separate final pending body and all ancestor-refused tracker operations remain untouched.

Local handoff destinations: AMC_OS/INBOX/REV_TECH_LEAD.md and refresh-2026-09-10/ROLE_HANDOFF.md; vault Evidence/2026-09-10 Phase A Worktree Audit Refresh.md. Actual acknowledgements and file-readback hashes are recorded separately in refresh-2026-09-10/record-sync.json. No central vault note was rewritten; no new Home/Now/Roadmap checkpoint or cloud-sync proof is claimed. Existing execution log and historical role/evidence content remain preserved.

No source/test edits, AMC imports, tests/checks/builds/fixtures/acceptance/live providers, production credentials/signing, Git mutations/staging/stash/reset/checkout/worktree removal, Graphify, DSH/pi runtime or history erasure. No stash readback, clean tree, Phase A completion, issue Done, full-suite, security/platform/package/provider or release qualification. All seven Done and external gates persist. NEXT_ACTION: Phase A step1 claim reconciliation against this captured integration and separately identified uncommitted work, preserving unresolved review boundaries; no validation or recovery mutation is started by this audit. Task23's broader signed-video authoring selection remains separately not started.

## 2026-09-10 — AMC-1512 protocol-readiness authoring (amc-1512-protocol-readiness-2026-09-10)

The latest user selected AMC-1512's provider-evidence and human first-use protocol artifacts, with all execution deferred. CoS filesystem/terminal access worked. Full brief/AGENTS/applicable rolebooks, the archived AMC-1512 contract, existing human intake/capture/observer guides, scoped implementation regions and the historical native-identity receipt were read. No global audit, task23 mutation or earlier operation was resumed.

Measured authoring host from terminal2fa331 at16:21:49Z: Darwin25.6.0 arm64, /bin/zsh; Node not executed. Named working-file SHA256 observations returned in06f2c1 at the16:28:17Z clock observation and are retained in AMC_OS/RESEARCH/2026-09-10-amc-1512-protocol-readiness/source-observation.json. No current HEAD or clean index is newly asserted:4d2d69e5d4d01bfd1f82662ceff0305b5c2885b5 is explicitly the independent step0 audit's16:08:39–16:08:45Z metadata, not applicability proof for today's working files.

Existing study tooling is present and was not recreated. The inspected91b2ad3b identity receipt describes a scripted loopback Responses provider, not genuine model or human evidence. New REAL_PROVIDER_EVIDENCE_PROTOCOL.md, HUMAN_REVIEW_ADDENDUM.md, blank provider/human review forms and EVIDENCE_REQUIREMENTS.json bind future claims to exact retained evidence and independent review without inventing participants, consent, model use, timings, outcomes or counts. These are authored protocols, not executed software, a study, runtime source changes or qualification.

Source-inspected existing limit: capture copies frozen planned model state at human-first-use-capture.mjs:254; intake refuses used=true with missing/unknown credentials at human-first-use-intake.mjs:135-137. The observer guide already names this. The addendum requires preserving genuine starting state and blocked exports, not rewriting the roster to configured. AMC-only valid first-use records remain distinct from sufficient matched AMC/DSH/Pi comparison cohorts.

LINEAR-PENDING: AMC-1512, parentAMC-1505, targetState=null, independent comment dedupKey amc-1512-protocol-readiness-2026-09-10. Ordinary Linear issue discovery returned no actions (only CoS/files); no live description/comments, dedup, remote delivery or state change. Exact pending body and source archive UUIDf0865768-a11c-4d20-b487-a9d920589a18 are in the new task directory. The archived InProgress state is dated2026-09-09T06:38:25.084Z, not current. No historical pending/refused body is resent.

Receipt/handoff files and the final local vault/role delivery are being finalized in the declared task directory and Evidence/2026-09-10 AMC-1512 Protocol Readiness.md; record-sync.json will name the actual acknowledgements/readback. No central vault note/checkpoint rewrite, cloud-sync claim, source/test/script edit, test/check/build/import/fixture/acceptance/provider/participant execution, credential/signing, Git mutation, merge/port, worktree/stash change, worker, Graphify or DSH/pi runtime. No inherited refusal is retried or lifted. All seven Done and human/license/security/platform/release gates persist; AMC-1512/PhaseA/full goal remain incomplete. Next safe engineering requirement: versioned starting-credential/transition/use provenance and migration/refusal regression authoring before true cold-onboarding observation, with execution still deferred.

AMC-1512 terminal delivery update (same task): CoS acknowledged the final local vault note and both role-inbox prepends. The exact final LINEAR-PENDING body, terminal ownership release and sync records are delivered; Linear comment discovery again returned no actions. One attempted metadata patch failed an exact text-context match in the task's vault note; readback showed the prior targets unchanged and the corrected task-local edits succeeded. This ordinary mismatch is retained in REVIEW_BLOCKERS.md, not described as a safety refusal. Final delivery/readback evidence is record-sync.json. Owner/activeOwnedExecution/remainingOperation=null; workers=[]; hiddenSuccessor=false. No source or execution boundary changed.

## 2026-09-10 — AMC-1512 evidence protocols implemented (amc-1512-evidence-protocols-2026-09-10)

The current assistant performed serial CoS text reads and finite patches for the user-selected Phase A step 2. Full standing brief, root AGENTS and Global/Revenue/Innovation rolebooks were read; live AMC-1512 and all existing comment bodies were inspected, alongside the existing human intake/capture source, all three study guides, current native CLI source and dated identity/local-model receipts. No audit restart or runtime source mutation.

Implemented public docs `docs/AMC_1512_EVIDENCE_PROTOCOL.md` and `docs/AMC_1512_HUMAN_FIRST_USE_PROTOCOL.md`. Companion `provider-plan.template.json`, `human-plan.template.json` and `observation-review.template.json` are under `AMC_OS/RESEARCH/2026-09-10-amc-1512-evidence-protocols/`. They are deliberately unfilled planning/review forms, not strict intake inputs or fabricated study records. Provider cases RP-00 through RP-07 bind future dispatch, answer quality, inspection/verification, recovery and separate approval evidence to a pinned candidate and approved bounded plan. The human packet provides neutral participant/observer instructions, full-roster failure retention and nullable-denominator reporting.

Measured by direct CoS readback: provider document 228 lines, human document 196 lines, forms 116/80/100 lines. Both docs reported modification time 2026-09-10T16:33:11.165Z. Git metadata files returned `amc/gap-register-execution` / `4d2d69e5d4d01bfd1f82662ceff0305b5c2885b5`; this is not a clean index/tree or a pin of later uncommitted source bytes. No current OS/architecture/Node, artifact hashes, schema/link validation or runtime applicability was measured. Exact inventory and dated historical boundaries are in `evidence-index.json`; no old conformance or local-pilot result is promoted to real-provider/human acceptance.

Linear is available in THIS conversation. After a fresh full comment-body read with hasNextPage=false and no matching task key/body, a single independent progress comment was created: `cfb6bd41-92c6-427f-b3e7-fdb905c350e8`, createdAt `2026-09-10T16:42:09.967Z`, updatedAt `2026-09-10T16:42:09.912Z`. No state change; observed AMC-1512 remains In Progress. Exact sent body: `LINEAR_COMMENT.md`; delivery/readback: `linear-sync.json`. The separate protocol-readiness task's LINEAR-PENDING and terminal delivery entry above are preserved as its observations; its pending body was NOT sent by this task. Its active-to-terminal progression was not authored or controlled here.

Dedicated local vault note: `/Users/sid/Documents/AMC/Evidence/2026-09-10 AMC-1512 Evidence Protocols.md`. Canonical task-keyed role appends: `AMC_OS/INBOX/REV_TECH_LEAD.md` and `AMC_OS/INBOX/INNO_EVAL_BENCHMARKER.md`; task-local `ROLE_HANDOFF.md` routes the same scope. `receipt.json`, `disposition.json`, `remaining-work.json`, `process-closure.json`, `ownership.json` and `obsidian-update.json` record actual authoring/delivery and release, not qualification. Central vault notes and every previous handoff are untouched.

Known source limitation retained: frozen missing/unknown starting credentials followed by real model use cannot truthfully export under the current human capture/intake contract. The protocol keeps the blocked journal/recording instead of relabelling, omitting or inventing a participant. Next engineering action: a versioned starting-state/transition/actual-use contract with migration/refusal and whole-roster regressions authored but unexecuted, then concrete approved preregistration and later fresh-candidate qualification/real observation at the authorized boundary. AMC-only evidence is not the matched AMC/DSH/Pi comparison.

This task ran zero terminal commands, tests, checks, builds, imports, fixtures, acceptance, live/local provider trials or human sessions. No credentials, production signing, Git/index/stash/worktree mutation, source/test/script change, worker, model switch, Graphify or DSH/Pi runtime dependency. No clean baseline, completed whole-queue reconciliation, independent model attestation, issue Done, Phase A completion, source/package/platform/full-suite/release qualification, cloud sync, deployment or superiority claim. All prior refusal/equivalent-result and seven-Done/external gates remain. No owned runtime operation or successor is left running; task-local ownership records its final release.

## 2026-09-10 — AMC-1512 operator completion (amc-1512-operator-completion-398da2c9)

Read the full brief, applicable rolebooks, existing evidence and current capture/intake source regions. Preserve the independently appearing public protocol packets and their own authorship/Linear records. This disjoint completion implements the missing explicit evidence-transfer and strict capture-input mapping layer, not another collector or fabricated trial.

New artifacts under `AMC_OS/RESEARCH/2026-09-10-amc-1512-operator-completion-398da2c9/`: `EVIDENCE_TRANSFER_PROTOCOL.md`, `evidence-transfer.template.json`, `CAPTURE_INPUT_MAPPING.md`. Acknowledged CoS writes and text-read headers measured 144/117/142 lines, with modification times 2026-09-10T16:46:52.530Z/.531Z/.532Z. Receipt/reconciliation/disposition/remaining-work/process-closure and next action are delivered there. No parser, schema check, hash or executable acceptance was run.

Observed Git metadata: `amc/gap-register-execution` / `4d2d69e5d4d01bfd1f82662ceff0305b5c2885b5`, not a clean baseline, working-file content pin or installed candidate. OS/arch/Node were not measured. Existing credential-start-to-use export blockage remains documented, not fixed. Do not relabel starting state, fabricate identity/use or filter failures to force admission.

The first combined receipt/handoff patch returned mcp_network_error/network_error, message Connection failed. An ordinary read then confirmed the new receipt paths absent and canonical regions unchanged. Smaller finite patches resumed only after that reconciliation; details retained in RECONCILIATION.md. The successful initial protocol/vault writes were not repeated.

Local vault note: `/Users/sid/Documents/AMC/Evidence/2026-09-10 AMC-1512 Operator Completion 398da2c9.md`. Role additions target `AMC_OS/INBOX/REV_TECH_LEAD.md` and `AMC_OS/INBOX/INNO_EVAL_BENCHMARKER.md`. No central hub rewrite or cloud-sync claim. Linear works here; the complete comment read hasNextPage=false showed independent comment `cfb6bd41-92c6-427f-b3e7-fdb905c350e8`, not this task's key. No old pending/refused body is resent.

No runtime/script/test edits, terminal commands, tests/checks/builds/imports/fixtures/acceptance/providers/human sessions, credentials/signing, Git/stash/worktree mutation, workers, release/deployment or issue closure. No source/package/platform/provider/human/comparative qualification. Next source action: version immutable credential-start/observed-transition/actual-use provenance with migration/refusal/full-roster regressions authored unexecuted. All standing gates and the execution hold persist.

Operator-completion tracker/terminal delivery: Linear acknowledged independent comment `f90c3ee4-2d81-47d1-8270-b53141fbcf4a`, createdAt `2026-09-10T16:52:56.042Z`, updatedAt `2026-09-10T16:52:55.989Z`, with the complete submitted body. No issue-state change or LINEAR-PENDING for this delivery. CoS acknowledged the canonical log/manifest/role additions and dedicated local vault note. Exact body/metadata are LINEAR_COMMENT.md and linear-sync.json; delivery and ownership release are DELIVERY.md and ownership.json in this completion's directory. Only this task's regions are released; owner/activeOwnedExecution/remainingOwnedOperation=null, workers=[], no successor or runtime execution. No new qualification claim.

## 2026-09-10 — AMC-1512 credential-transition handoff recovery

Task: `amc-1512-credential-transition-handoff-recovery-2026-09-10`. Full standing brief and applicable rolebooks read. Current working-file text contains the opt-in credential-transition implementation in `scripts/human-first-use-capture.mjs` (798 lines, mtime 2026-09-10T17:44:53.978Z), `scripts/human-first-use-intake.mjs` (658 lines, 17:43:37.308Z) and `scripts/human-first-use-observer.mjs` (564 lines, 17:45:39.596Z). Counts and timestamps came from direct full CoS text reads, not runtime execution. Earlier authorship is not attributed to this recovery.

Source present: legacy defaults retained; capture opt-in 2026-09-10.1 / intake 2026-09-10 / credential contract 1; immutable starting state, ordered actor-labelled changes, explicit state at actual model use, coverage admission, operator assistance/unknown handling, version-separated starting-state cohorts and full-roster export. Migration is source-coded as a new disjoint create-only fork of a reviewed legacy preparation with unchanged starting states/source-head provenance. Observed/corrected journals, stale heads, version mismatch, use before known state and incomplete coverage are refused or export-blocked by the inspected code. These conditions have not been exercised.

PARTIAL IMPLEMENTATION: exact planned regression `tests/humanFirstUseCredentials.test.ts` and guide `docs/HUMAN_FIRST_USE_CREDENTIAL_TRANSITIONS.md` returned Not found. The guide is already referenced by the scripts. Do not claim those regressions are authored or passing. Next safe Phase A action is to author that regression file, guide and scoped version-labelled addenda without executing them; retain the existing script changes rather than replaying them.

Recovered receipt, source observations, reconciliation, disposition, next action and role handoff: `AMC_OS/RESEARCH/2026-09-10-amc-1512-credential-transition-contract/`. Only SCOPE.md and ownership.json existed there initially. Both remain unchanged; the generic prior active-authoring label is not live-operation/author proof. This recovery's terminal record-only ownership is `recovery-ownership.json`. CoS identity notices were Unattributed. One read connection failure was followed by a successful read; there was no uncertain mutation or safety-refusal replay.

Canonical role appends: `AMC_OS/INBOX/REV_TECH_LEAD.md`, `AMC_OS/INBOX/REV_QA_LEAD.md`, `AMC_OS/INBOX/INNO_USER_RESEARCH_PLANNER.md`; activity record: `AMC_OS/LOGS/REV_IMPLEMENTATION_SPECIALIST.log.md`. Dedicated vault note: `/Users/sid/Documents/AMC/Evidence/2026-09-10 AMC-1512 Credential Transition Contract.md`. Local delivery is not cloud-sync proof. Linear was readable, AMC-1512 In Progress, complete comment read hasNextPage=false with no matching recovery body. The actual delivery outcome is recorded separately in `linear-sync.json`; earlier comments/pending bodies are not resent.

No source or test edits by this recovery. No terminal commands, tests, checks, builds, imports, fixtures, acceptance, live/local providers, human sessions, credentials/signing, Git/index/stash/worktree mutation, workers or successor. No current source commit, byte hashes, OS/architecture/Node, clean baseline, installed artifact or runtime correctness measured. No source/package/platform/full-suite/release/human/comparative qualification, issue Done, Phase A completion, publication or deployment claim. All execution holds and standing gates remain.

Recovery tracker delivery: Linear acknowledged comment `1b9a383b-8b45-4515-89d6-a6415bcd5b65`, createdAt `2026-09-10T17:53:28.744Z`, updatedAt `2026-09-10T17:53:28.681Z`, with the full submitted body. No issue-state mutation; no LINEAR-PENDING required for this recovery. Canonical and vault additions were read back; dedicated note 64 lines, mtime 2026-09-10T17:51:45.598Z. Exact final records: task-local `LINEAR_COMMENT.md`, `linear-sync.json`, `obsidian-update.json`, `DELIVERY.md`. Missing regression/guide and all execution/qualification limits remain. Recovery owner/activeOwnedExecution/remainingOwnedOperation=null; original ownership record preserved, no workers or successor.

Final handoff readback for the same recovery key: an independent `Linear.list_comments` response returned the full matching comment `1b9a383b-8b45-4515-89d6-a6415bcd5b65` with the same createdAt/updatedAt. No duplicate was posted; the limited read hasNextPage=true and is not a new whole-discussion audit. Exact regression and guide paths again returned Not found. Updated receipt/delivery/linear-sync record this readback without changing the partial implementation status, source, original ownership, worktrees or execution hold.

## 2026-09-10 — AMC-1512 credential regression and guide authoring

Task: `amc-1512-credential-regressions-and-guide-2026-09-10`, Phase A step 2.
Sole CoS executor, requested GPT-6 Pro, no model switch/workers. Full brief,
rolebooks, current scripts, prior packet, legacy tests and affected guides read.
Existing script headers returned 798/658/564 lines; no script change, terminal
command, validation or current Git/environment/hash measurement was performed.

Authored the previously absent `tests/humanFirstUseCredentials.test.ts`; its
first complete text readback returned 628 lines, mtime 2026-09-10T18:03:42.537Z.
It contains synthetic capture/direct-intake/refusal/migration/byte-retention/
full-roster/cohort/CLI/guided-observer cases, including a controlled source-head
advance between migration reads. These are authored assertions, not passing tests,
measured test coverage, runtime observations or authenticated human evidence.

The same authoring continuation adds `docs/HUMAN_FIRST_USE_CREDENTIAL_TRANSITIONS.md`
and version-labelled notices/addenda to the four scoped human capture/intake/
observer/protocol guides. Default legacy behavior and existing scripts/tests are
preserved. Local write/readback acknowledgements and final source inventory are
recorded separately under
`AMC_OS/RESEARCH/2026-09-10-amc-1512-credential-transition-contract/authoring-completion/`.

LINEAR-PENDING: current get_issue discovery returned no Linear actions. Intended
issue AMC-1512, retain In Progress with no state transition or Done request;
current live state was not read. This continuation's exact intended progress body
is recorded in its own pending artifact, not resent as the earlier delivered
recovery comment. Earlier receipts, ownership and tracker deliveries stay dated.

No tests/checks/builds/imports/fixtures/acceptance/providers/human sessions,
credentials/signing, Git/index/stash/worktree mutation, worker or successor.
New test imports and disposable-file operations exist as source only. No source,
package, platform, full-suite, release, human, comparison or migration-safety
qualification is claimed. Final delivery/next action will be appended at closure.

Final authoring delivery for `amc-1512-credential-regressions-and-guide-2026-09-10`:
CoS acknowledged and text-read back the new regression/guide (628/276 lines),
all four addenda, continuation receipt/coverage/role/next-action/LINEAR-PENDING
records and canonical role inbox additions. The dedicated vault note was read
in full at 108 lines, mtime 2026-09-10T18:10:15.158Z. Source observations and
exact paths/acknowledgements are `authoring-completion/SOURCE_OBSERVATION.json`
and `authoring-completion/DELIVERY.md` under the credential-transition packet.

The next source-confirmed Phase A action is a separately versioned legacy
provider-to-human transfer mapping/blank-sidecar extension: the read
`2026-09-10-amc-1512-operator-completion-398da2c9/CAPTURE_INPUT_MAPPING.md`
still pins legacy capture/intake and close fields, and EVIDENCE_TRANSFER_PROTOCOL.md
retains the earlier credential representability limit. Preserve those historical
packets while explicitly binding contract versions, migration/source-head and
actual-use event references to independent provider/answer/recording review.
No fabricated values or automatic conversion of observed journals.

LINEAR-PENDING remains the actual tracker outcome; intended AMC-1512 In Progress,
no state mutation, no current live-state or remote-delivery claim. All execution
holds and standing gates persist. This continuation's ownership is terminal and
released with no runtime process, worker or hidden successor. No test count,
passing tests, code hashes, clean candidate or qualification was produced.

## 2026-09-10 — AMC-1512 stalled authoring recovery

Task: `amc-1512-credential-authoring-recovery-2026-09-10`.
Read the standing brief in full and reconciled live source/receipts. The missing
regression appeared at 628 lines before this recovery wrote it; guide/addenda and
terminal predecessor receipts appeared later. Preserve them and their historical
authorship; do not repeat a create or rewrite old absence reports as current truth.
An earlier combined patch failed context verification; no successful mutation is
claimed from that attempt. CoS later acknowledged the recovery-only scope and
three additional regression declarations plus the contract clarification.

New assertions target sticky unknown assistance despite later known help,
capture ordering versus reduced same-time intake, and configured-but-unused
sessions. They are authored source, not executed tests. The existing regression
source already addresses migration/refusal, immutable start, chronological use,
version separation and full-roster blocked export. Four guide authority addenda
retain the earlier version labels and explicitly preserve the execution hold.

Record root:
`AMC_OS/RESEARCH/2026-09-10-amc-1512-credential-transition-contract/authoring-completion/stall-recovery/`.
Current Git commit/environment are unmeasured; no clean candidate or working-file
hash is asserted. Repository terminal is used only for explicit append-only text
authoring, as the current user permits. No tests/checks/builds/imports/fixtures/
acceptance/providers/human sessions, secrets, Git/worktree mutation or workers.
Live identifier-based Linear read returned In Progress. The earlier UUID lookup
failed; exact outcome will be retained in linear-sync.json. No state change.
Final delivery/readback and role/next-action receipts follow in this same task.

Final delivery — `amc-1512-credential-authoring-recovery-2026-09-10`:
the regression is text-read back at 761 lines and the guide at 355; four scoped
guide totals are 416/412/317/245. These include preserved late source, not this
task's created-line count or executed coverage. Three recovery assertions are
authored; two later expected transition literals were corrected to nested `data`,
with their originals retained in stall-recovery/RECONCILIATION.md. Production
scripts and legacy tests were not edited.

Linear comment `bade3587-2d50-4ed6-8850-d12eb157bd1f` was delivered and its full
body separately read back: createdAt 2026-09-10T18:25:19.531Z, updatedAt
2026-09-10T18:25:19.499Z. Actual acknowledgement is stall-recovery/linear-sync.json;
no pending delivery for this recovery, no issue-state change and no predecessor
pending body resent. Canonical/role/vault authoring and scoped closure are recorded
in the recovery receipt/DELIVERY.md. Own ownership is terminal with no process,
worker or automatic successor. All tests/checks/builds/imports/fixtures/acceptance/
provider/human holds remain. Next is the separately versioned evidence-transfer
mapping and blank sidecar, not execution. No clean candidate, qualification or Done.


## 2026-09-10 — terminal credential regression/guide continuation

Continuation key: `amc-1512-terminal-credential-contract-continuation-2026-09-10`. Recorded at `2026-09-10T18:22:43.264519Z`.

Current direct reads found both requested artifacts already present; their earlier creation and the earlier script implementation are not attributed to this continuation. The terminal appended new regression source to tests/humanFirstUseCredentials.test.ts (3,858 UTF-8 bytes) and a scoped contract addendum to docs/HUMAN_FIRST_USE_CREDENTIAL_TRANSITIONS.md (2,446 UTF-8 bytes); the writing command returned exit code 0. Three additional synthetic case instances are authored: failed and incomplete outcomes after participant repair without model use, and repair/repeated use/final loss with same-time ordering counterexamples. The cases assert immutable starting state, unsupported-close blocking, direct-intake admission/refusal and retained chronological uses. Existing migration/refusal, unknown-assistance, version-isolation and full-roster export assertions remain in place. Counts describe authored source only, not passing coverage.

No tests, checks, lint, syntax/type checks, repository source imports, builds, fixture generation/execution, acceptance, provider execution, human sessions, credentials/signing, Git/index/stash/worktree operations, workers, commits, publication or deployment were performed. The terminal ran only filesystem authoring with Python standard-library support; no repository program was invoked. Existing runtime scripts and prior regression/documentation content were not replaced. No current commit, clean baseline, candidate hash, runtime behavior, passing regression, source/package/platform/release qualification, provider authenticity, human usability, comparative outcome or cloud sync is claimed. AMC-1512 was read live as In Progress; no status change is requested and AMC-1505 is not closed.

Current receipt and role handoff: `AMC_OS/RESEARCH/2026-09-10-amc-1512-credential-transition-contract/authoring-completion/terminal-credential-contract-continuation-2026-09-10/receipt.json` and `AMC_OS/RESEARCH/2026-09-10-amc-1512-credential-transition-contract/authoring-completion/terminal-credential-contract-continuation-2026-09-10/ROLE_HANDOFF.md`. Actual tracker delivery is recorded separately in `AMC_OS/RESEARCH/2026-09-10-amc-1512-credential-transition-contract/authoring-completion/terminal-credential-contract-continuation-2026-09-10/linear-sync.json`; a prepared comment is not a delivered comment. Earlier missing-path statements and other tasks' pending bodies remain historical; this appendix records current presence without claiming their authorship.

Next safe Phase A action: Continue AMC-1512 implementation-first with a separately version-labelled provider-to-human evidence-transfer addendum and blank sidecar. First read the existing CAPTURE_INPUT_MAPPING.md, EVIDENCE_TRANSFER_PROTOCOL.md and evidence-transfer.template.json under AMC_OS/RESEARCH/2026-09-10-amc-1512-operator-completion-398da2c9/. Preserve that legacy packet. Bind explicit capture/intake/credential versions, original starting state, source-head/migration declaration provenance, ordered credential observations and each actual-use observation to independent provider/request/answer/recording review references. Retain the complete roster, failures, unknowns, missing joins and blocked exports. Do not add sidecar fields to strict capture inputs or make an automatic converter. Do not populate real study values, run any tests/checks/imports/builds/fixtures/acceptance/providers/human sessions, or launch a successor. Qualification waits for completion of remaining implementation and separate authorization on a fresh pinned candidate.


### Tracker delivery acknowledged for amc-1512-terminal-credential-contract-continuation-2026-09-10

Linear comment `c71a8006-3588-43e6-a68c-85f446cf071e` was created at `2026-09-10T18:23:09.768Z` and returned in full by an independent subsequent `Linear.list_comments` read. Its exact new task key/body matched; no old comment or other task's LINEAR-PENDING body was resent. Delivery record: `AMC_OS/RESEARCH/2026-09-10-amc-1512-credential-transition-contract/authoring-completion/terminal-credential-contract-continuation-2026-09-10/linear-sync.json`. This continuation has no pending tracker delivery. No issue-state change, execution authorization, validation result or cloud-sync claim follows from the comment. All authored regressions remain UNEXECUTED / UNQUALIFIED.

## 2026-09-11 — AMC-1512 credential contract finalization

Task `amc-1512-credential-contract-finalization-2026-09-11`, sole CoS executor.
Full brief/applicable rolebooks, current human-first-use scripts/regressions/guides
and newer credential receipt/handoff records were read before source work. The
versioned implementation, main credential regression and guide already exist;
their original authorship is not attributed to this continuation. Historical
missing-path, delivery and ownership records are retained without replay.

Source-derived gap: applyRevision replay used the migration boundary for events,
but its correction declaration used only original preparedAt plus observations
and attestations. Empty corrections could therefore predate migration. The narrow
capture-source change reuses observationBoundary for that check, preserving the
legacy/non-migrated floor and existing valid wire serialization. The new
tests/humanFirstUseCredentialMigrationBoundary.test.ts authors pure, actual local
journal/CLI, cold reload and complete-roster export scenarios without execution.
The existing credential regression file is untouched. The contract guide and four
scoped guide addenda explain rejection, retained originals and direct-intake limits.

CoS command19e74c returned exit0; observed UTC2026-09-10T20:11:19Z corresponds to
September11,01:41:19 Asia/Kolkata. Host Darwin25.6.0 arm64, /bin/zsh. Its named
pre-edit file hashes are retained in this task's SOURCE_OBSERVATION.json. No
current HEAD, Node/runtime, clean Git baseline, index or acceptance was measured.

New receipt root: AMC_OS/RESEARCH/2026-09-11-amc-1512-credential-contract-finalization/.
New local vault note: Evidence/2026-09-11 AMC-1512 Credential Contract Finalization.md.
Linear issue discovery returned no matching actions and only CoS/files namespaces;
independent LINEAR-PENDING text is retained, targetState=null, no remote delivery.
Earlier c71a8006/bade3587 delivery IDs are dated local receipt facts, not current
live readback or this continuation's deliveries. No historical body is resent.

No tests/checks/builds/imports/fixtures/acceptance/provider/human execution, secrets,
production signing, Git/stash/worktree mutation, global audit, worker or successor.
No qualification, new commit, issue Done, Phase A completion, or cloud-sync claim.
All standing gates persist. Closure records will name actual readback and released
ownership. Next separate implementation remains the version-labelled provider-to-
human evidence-transfer mapping and unfilled sidecar; no validation starts here.

Terminal delivery for amc-1512-credential-contract-finalization-2026-09-11:
source/new test/all guide regions were acknowledged and text-read back. The new
test read226 lines; capture803 and guide402 are total file line observations,
not test counts or executed coverage. Post-edit hash resulte42aee returned exit0
atUTC2026-09-10T20:16:00Z. Intake/observer/main credential regression hashes match
the pre-edit observation. SOURCE_OBSERVATION.json retains exact hashes and limits.
Receipt/eight handoffs, independent final LINEAR-PENDING, role-specific tech/QA
prepends, manifest release and new vault final note are delivered locally;
record-sync.json is the final acknowledgement/readback record. No remote Linear
delivery ID or state change, no central-note rewrite/cloud-sync or qualification.
Only this task's owner/activeOwnedExecution/remainingOperation=null, workers=[],
hiddenSuccessor=false; no previous operation resumed or hidden successor launched.

## 2026-09-11 — AMC-1512 evidence transfer v2 authoring

Task `amc-1512-evidence-transfer-v2-2026-09-11`, Phase A step2, sole CoS.
Full standing brief, applicable rolebooks, predecessor receipt/handoff, all three
legacy transfer files and current capture/intake/observer modules were read.
Legacy packet pins transfer/1, capture2026-09-09.1 and intake2026-09-09. Current
source has the opt-in credential contract and migration-aware correction floor.
This task authors a new transfer/2 mapping and blank sidecar without changing
legacy artifacts, strict collector fields or runtime source.

CoS9885fa exit0 observedUTC2026-09-10T20:27:40Z (September11 Asia/Kolkata),
Darwin25.6.0 arm64, /bin/zsh. Named legacy/source/test byte hashes were captured;
they are not tests, candidate qualification or a Git clean-baseline assertion.
Current HEAD and Node were not measured. Exact observations will be retained in
AMC_OS/RESEARCH/2026-09-11-amc-1512-evidence-transfer-v2/SOURCE_OBSERVATION.json.

Linear issue discovery returned no functions and only CoS/files namespaces.
Independent LINEAR-PENDING is explicit, targetState=null; no live state or remote
delivery. New scope and dedicated vault checkpoint are written as authoring
progress, not observations. No tests/checks/builds/imports/fixtures/acceptance,
providers/humans, credentials/signing, Git/worktree/stash mutation or workers.
No historical operation/pending/refused body is replayed; all standing gates remain.

Substantive authoring checkpoint for amc-1512-evidence-transfer-v2-2026-09-11:
CoS acknowledged and read back CAPTURE_INPUT_MAPPING.v2.md,
EVIDENCE_TRANSFER_PROTOCOL.v2.md and evidence-transfer.v2.template.json. They
define manual version/reader binding, original preparation plus separately retained
migration source, correction occurrence locators, every-use request/answer/review
joins, unknown assistance and full-roster blocked-export accounting. The template
keeps actual collections and observation values null; its shape catalog is not
data. Public provider/human guides receive task-labelled addenda. No source or
strict-input change, automated converter, schema execution or observation occurs.
Final artifact hashes, role/vault readbacks and terminal ownership follow in this
same task's records; this checkpoint is not a claim of acceptance or remote delivery.

Terminal authoring boundary — amc-1512-evidence-transfer-v2-2026-09-11:
new mapping/protocol/template are acknowledged and text-read at220/308/428 lines,
not passing tests or executed coverage. Post-authoring hash observation197e29
exit0 atUTC2026-09-10T20:39:13Z confirms matching before/after named legacy,
script and credential-test bytes. Exact source/read/hash evidence is now in
SOURCE_OBSERVATION.json. Public guide additions are scoped at provider230-247
and human259-278. Strict collector fields and runtime/tests remain unchanged.

Local receipt/eight handoffs/ROLE_HANDOFF and exact final LINEAR-PENDING are
authored in AMC_OS/RESEARCH/2026-09-11-amc-1512-evidence-transfer-v2/.
Tech-lead/research-planner inbox prepends and the new dedicated vault final note
preserve earlier text. Final acknowledgement/readback authority: record-sync.json.
No central note rewrite, checkpoint requirement, current live Linear state/dedup,
remote delivery ID or cloud-sync claim. This task releases only its own
owner/activeOwnedExecution/remainingOperation=null, workers=[], hiddenSuccessor=false.

Next safe action is the legacy packet's model-revision representability question:
read-only reconciliation of requested/returned labels and unknown immutable-model
provenance against current capture/intake and exact-cohort matching. Do not invent
a pin or treat metadata as a source fix. No tests/checks/builds/imports/fixtures/
acceptance/provider/human execution, Git/worktree/stash mutation, credentials/
signing, workers or successor. All seven Done and external/full-goal gates remain;
this documentation completion is not AMC-1512, Phase A or release completion.

## 2026-09-11 — AMC-1512 model-revision read-only reconciliation

Task `amc-1512-model-revision-reconciliation-2026-09-11`. Full standing brief,
root AGENTS/rolebooks and predecessor receipts read; bounded inspection began
at the legacy transfer protocol:116-120 and followed current capture/intake and
observer model handling plus planning/transfer contracts. No global audit.

Source-derived distinction: planned revision text is mandatory in capture;
used-model null revision is missing evidence in intake, while unused null is
structurally permitted. Nonempty strings are not classified as mutable/immutable.
Current cohort matching explicitly describes declarations and disclaims human
authentication/ranking; no newly discovered false-verification claim is made.
A typed unknown-preserving opt-in correction is warranted, not a silent change
to legacy cohorts. Exact rationale and regression authoring follow in this packet.

Opening named-file/host observation: CoS 993bac, exit 0, UTC 2026-09-10T20:51:24Z
(September 11 in Asia/Kolkata), Darwin 25.6.0 arm64, /bin/zsh. Current HEAD/Node
and clean Git/index unmeasured. File hashes are byte observations, not validation.
Linear issue discovery returned no functions, only CoS/files; independent
LINEAR-PENDING records no state change or remote delivery. Prior bodies unchanged.
Source/schemas/existing tests stay read-only. No tests/checks/builds/imports/
fixtures/acceptance/providers/humans, secrets/signing, Git/worktree/stash mutation,
workers or successor. All seven Done and external/refusal boundaries remain.

Terminal authoring — amc-1512-model-revision-reconciliation-2026-09-11:
RECONCILIATION.md, PROPOSED_MODEL_IDENTITY_CONTRACT.md,
modelRevisionRepresentability.regression.ts and REGRESSION_SPEC.md are authored
and text-read, at 104/147/193/64 lines respectively. These are file lengths, not
passing tests. Regression source stays outside tests/ and unregistered; the
new-version behavior is a specification, not runtime implementation. Current
collector/schema/existing tests/public docs/prior packets remain unchanged.

Source reconciliation warrants only a new opt-in nullable immutable-revision and
typed declaration contract with conservative cohort eligibility. Preserve current
declared-only caveats: alias string agreement is not served-model authentication.
Returned labels/per-use provenance stay in independent transfer/2 review, not new
strict-event fields. Keep old defaults/versions, credential behavior and full roster;
do not add an automatic migration into the proposed identity version.

Post-authoring CoS f9ee4e exit 0 at UTC2026-09-10T20:57:40Z recorded unchanged
named prior source/test/protocol/transfer bytes and new artifact hashes. Exact
measurement boundary: SOURCE_OBSERVATION.json in the new packet. Current HEAD,
Node/index/candidate and any execution/qualification remain unmeasured.

Receipt/eight handoffs/role records and exact final independent LINEAR-PENDING
are delivered locally; actual acknowledgements/readbacks are in record-sync.json.
Tech-lead/research-planner handoffs and the dedicated Model Revision Reconciliation
vault note preserve earlier text. No live tracker read/dedup/delivery or state
change, no central-note rewrite or cloud sync. This task alone releases
owner/activeOwnedExecution/remainingOperation=null, workers=[], hiddenSuccessor=false.
Next safe action is implementation of the minimal proposal with actual-path
regression authoring after version/ownership reconciliation, not another global
audit or any tests/checks/builds/imports/fixtures/acceptance/provider/human run.
All seven Done, other Phase A/full-goal requirements and external/refusal gates remain.

## 2026-09-11 — Phase A step 1 queue reconciliation

Task phase-a-step1-queue-reconciliation-2026-09-11. Full brief/AGENTS and global/
delivery rolebooks read. Baseline: AMC_OS/RESEARCH/2026-09-09-worktree-audit/
refresh-2026-09-10/, source 4d2d69e5d4d01bfd1f82662ceff0305b5c2885b5 at its
September 10 snapshot, not freshly verified HEAD. Current Linear discovery
returned no issue actions and only CoS/files; all live statuses/full claims and
deduplication remain unavailable. The original 34-child scope is distinguished
from later archived 38/42-child records and any later unenumerated children.
Inherited baseline and source-comparison refusals are not retried or bypassed.

Read-only independent named source/receipt inspection proceeds; no whole-queue
current-head qualification can follow from archived metadata. Exact measured
states, decay distinctions, pending tracker bodies and terminal handoffs will
be retained under AMC_OS/RESEARCH/2026-09-11-phase-a-queue-reconciliation/.
No source changes, tests/checks/builds/imports/fixtures/acceptance/provider/human
execution, Git/worktree/stash mutation, worker or successor. All prior work and
seven Done/external gates remain; this opening entry is not completion evidence.

## 2026-09-11 — Phase A step 1 absolute-path record closure

Key: `phase-a-step1-absolute-path-closure-2026-09-11`.
The exact requested directory is
`/Users/sid/AgentMaturityCompass/AMC_OS/RESEARCH/2026-09-10-phase-a-step1-reconciliation/`.
Its initial CoS listing contained only SCOPE.md and REVIEW_BLOCKERS.md; these are
preserved. This bounded closure writes repository-observations.json,
queue-reconciliation.json, README.md, LINEAR-PENDING.json, DELIVERY.json,
ROLE_HANDOFF.md, process-closure.json and ownership.json. No source analysis or
implementation is resumed. CoS write acknowledgement and subsequent exact-path
readback, not this prose alone, determine delivery.

Retained September 9 reconciliation and September 11 byte-observation records are
referenced at their original dates. Original AMC-1506 through AMC-1539 rows and
later archived AMC-1540 through AMC-1543 remain separate. Current HEAD, live
membership/states/claims/dependencies and semantic decay are unverified. Prior
scope HEAD4d2d69e5 is dated metadata, not a fresh pin. The audit refresh's later
record-sync reports local delivery; its earlier preliminary scope is not rewritten.

Role inbox: AMC_OS/INBOX/REV_PROGRAM_MANAGER.md. New scoped local vault note:
Evidence/2026-09-10 Phase A Queue Reconciliation.md. No central note rewrite.
LINEAR-PENDING holds an independent AMC-1505 body; targetState=null, deliveryId=null,
no prior pending/refused body resent and no fresh live read/dedup claimed.
Own process/owner records release only this absolute-path closure; separate
September 11 active-owner metadata is preserved without assuming a live operation.

No tests/checks/builds/imports/fixtures/acceptance/providers/human sessions,
source/test/schema edits, Git/index/stash/worktree mutation, credentials/signing,
generators, worker or successor. No qualification, source cleanliness, false-receipt
finding, issue Done, Phase A completion or cloud-sync claim. Next permitted action
is current queue/source applicability reconciliation before any implementation;
all inherited refusal boundaries and seven Done/external gates remain.

## 2026-09-11 — AMC-1512 credential review binding at the legacy packet

Task `amc-1512-credential-review-binding-2026-09-11`, sole CoS authoring.
Full brief/rolebooks, legacy mapping/protocol/template and current source regions
read. Reconciliation found transfer/2 ALREADY authored elsewhere at
`AMC_OS/RESEARCH/2026-09-11-amc-1512-evidence-transfer-v2/`; its main artifacts
read 220/308/428 lines. It is preserved and not claimed as this task's creation.
The user's exact-location extension is a separately versioned detached review
profile under the legacy packet's new `credential-review-binding-v1/` directory.

Scope: bind the selected contract and reader, original/migrated journals, ordered
actual-use occurrences and independent provider/request/answer/recording review
to an immutable review input snapshot, preserving complete-roster failures and
unknowns. Existing runtime/schema/test files are read-only. The model-revision
proposal is already recorded separately; no new identity version is implemented
or silently added to this profile's applicability.

LINEAR-PENDING: current get_issue discovery returned no functions, only CoS/files
namespaces. No current live state, remote write or old pending-body delivery.
No tests/checks/builds/imports/fixtures/acceptance/providers/humans, terminal
commands, Git/index/stash/worktree mutation, workers or qualification. Exact
authoring/readback and local vault delivery will be retained in this profile.

Substantive delivery — amc-1512-credential-review-binding-2026-09-11:
CoS acknowledged and fully text-read the new mapping143, protocol199, blank
companion263, matrix78 and README69 lines. Exact source locations/mtimes:
credential-review-binding-v1/SOURCE_OBSERVATION.json under the legacy packet.
The profile binds a frozen transfer/2 subject to a distinct review companion,
avoids self-referential hash requirements, preserves original/source/destination
and correction provenance, and separates every-use/provider/answer/recording/
independence findings. It retains all roster rows, failures and unknowns. This is
manual protocol authoring, not machine enforcement, new observations or acceptance.

No old legacy or transfer/2 file was written; later legacy header reads returned
the same line totals/mtimes, not a cryptographic equality or global worktree proof.
Current capture803 and intake658 are file-header observations from named source
reads; current HEAD/OS/architecture/Node/hashes remain unmeasured in this task.
New receipt, ROLE_HANDOFF, NEXT_ACTION and own LINEAR-PENDING are authored;
task-keyed role/activity additions and new local vault note have write delivery.
Final text readback and terminal ownership are recorded separately in DELIVERY.md.

Next safe engineering is the already-authored model-revision proposal at
AMC_OS/RESEARCH/2026-09-11-amc-1512-model-revision-reconciliation/:
minimal prospective nullable immutable revision/typed declaration and conservative
unknown-cohort eligibility, with actual-path regressions authored unexecuted
after fresh current-source/version/ownership reconciliation. Do not repeat its
completed read-only reconciliation or duplicate transfer/2. No execution hold,
Done criterion or other Phase A/external requirement is lifted by this delivery.

Terminal delivery — amc-1512-credential-review-binding-2026-09-11:
the profile's receipt/source observations/handoff/next-action/pending records and
canonical tech/QA/research-planner/activity additions were text-read back. The
new local vault note read 71 lines, mtime 2026-09-11T02:55:59.052Z. Final exact
paths and acknowledgements are in the profile's DELIVERY.md; obsidian-update.json
records local readback, not cloud sync. This task's owner and remaining owned
operation are null at terminal release; no prior owner is changed. Linear remains
the new independent LINEAR-PENDING, targetState=null, no remote delivery or live
state claim. No execution, source mutation, qualification or successor is added.

## 2026-09-11 — AMC-1512 prospective model-revision implementation

Task `amc-1512-model-revision-implementation-2026-09-11`, sole CoS.
Read full brief/rolebooks, proposal/regression spec/characterization and all three
current human scripts. Read headers: capture803/intake658/observer564 lines.
Current source exposes only legacy and credential versions; no model-identity
opt-in is yet present. Implement prospective capture2026-09-11.1/intake2026-09-11
with explicit typed revision declarations and conservative comparison eligibility.
These are selected source contract identifiers, not observed study versions.

Exact scope and ensuing receipt:
`AMC_OS/RESEARCH/2026-09-11-amc-1512-model-revision-implementation/`.
Linear discovery returned no compatible get_issue action; independent LINEAR-PENDING
will record a progress body, targetState=null, no current state or remote delivery.
Prior bodies and old packets remain unchanged. No tests/checks/builds/imports/
fixtures/acceptance/providers/humans, terminal commands, Git/index/stash/worktree
mutation, secrets or workers. Current source commit/environment/hash unmeasured;
no execution qualification or Phase A/issue completion follows from authoring.

Source authoring checkpoint — amc-1512-model-revision-implementation-2026-09-11:
CoS acknowledged contextual capture/intake/observer edits and new
tests/humanFirstUseModelRevision.test.ts. The shared typed declaration validator,
prospective dispatch, inherited credentials, null-preserving observer prompts,
unknown-cohort refusal and explicit served-model non-authentication fields are
source-written. Old migration still targets credentials-only. The actual-path
regressions and new model-revision guide/version notices are authored only;
no tests, imports, parser/type/link checks, fixtures or runtime calls occurred.
Final line/header observations and local role/vault/tracker dispositions are in
this task's own receipt directory; initial counts are not passing test evidence.

Implementation authoring delivered — amc-1512-model-revision-implementation-2026-09-11:
source changed-region readbacks returned capture818/intake702/observer582 lines;
new regression589 and model-revision guide216 were read in full. Four labelled
guide notices retain old text. Exact timestamps/ranges are SOURCE_OBSERVATION.json
in the new packet. Old versions, prior tests, proposal/transfer/review packets and
worktrees outside scoped source regions remain unmodified by this task. No byte
equality, current Git/environment pin or executed compatibility is asserted.

New receipt, CHANGES, REGRESSION_MAP, ROLE_HANDOFF, NEXT_ACTION and independent
LINEAR-PENDING records are authored. Tech/QA/research-planner/activity handoffs
and dedicated local vault final note are being delivered/read back; DELIVERY.md
records the actual terminal boundary. Linear remains unavailable, no state change.
Next bounded integration is a version-labelled transfer/review mapping applicability
addendum for the new typed baseline, not another runtime proposal or immediate tests.
No tests/checks/builds/imports/fixtures/acceptance/providers/humans, Git/worktree
mutation, qualification, issue Done or Phase A completion follows from authoring.

Terminal delivery — amc-1512-model-revision-implementation-2026-09-11:
own receipt/change/regression-map/handoff/next-action/pending records and canonical
role/activity additions are acknowledged and text-read back. Dedicated new vault
note read75 lines, mtime2026-09-11T03:17:04.527Z. Final exact delivery is DELIVERY.md
and obsidian-update.json in this task's packet. Own source/artifact ownership is
terminal with owner/activeOwnedExecution/remainingOwnedOperation=null; no previous
owner or worktree is changed. Linear remains independent LINEAR-PENDING with no
state mutation, remote ID or current-live-state claim. All execution holds persist.
No tested correctness, clean candidate, provider/human evidence, qualification,
issue Done, Phase A completion, publication or automatic successor is asserted.

## 2026-09-11 — AMC-1512 model-revision mapping extension

Task `amc-1512-model-revision-mapping-2026-09-11`, sole CoS.
Full brief/rolebooks and predecessor handoff read. Current source regions expose
the prospective revision contract, while existing transfer/review packets retain
their credential-only applicability. Their full mappings/protocols/templates
were read; reuse their objects and locators, not another full packet or reader.
Exact scope and receipt: AMC_OS/RESEARCH/2026-09-11-amc-1512-model-revision-mapping/.
Current source commit/environment unmeasured. LINEAR-PENDING is recorded locally,
targetState null, no live state or remote delivery. New local Model Revision
Mapping evidence note records the opening boundary. No tests/checks/builds/imports/
fixtures/acceptance/providers/human sessions, terminal/Git/worktree operations,
source/test edits, secrets, workers or qualification. Existing work is preserved.

Substantive mapping delivery — amc-1512-model-revision-mapping-2026-09-11:
CoS acknowledged and fully read MODEL_REVISION_MAPPING.v1.md (132 lines) and
MODEL_REVISION_APPLICABILITY.v1.md (82), both mtime2026-09-11T03:27:56.467Z.
Appended packet reading pointers now total100/79 lines. Exact paths/regions:
SOURCE_OBSERVATION.json in this task's packet. Existing templates retain their
original credential-only headers and null values; no source/test/template rewrite,
new reader, copied packet or actual observation occurred. Independent finalized
LINEAR-PENDING body and canonical role/activity/vault updates record the delivery.

Next-action reconciliation found exact September11 queue ROLE_HANDOFF.md and
remaining-work.json absent; only scope/ownership/archived-claims/source-observations
were listed. Its active-owner label with activeOwnedExecution null is preserved,
not proof of a live process. Scope and dated September10 incomplete queue record
were read; underlying archived/source-observation contents were not read here.
NEXT_ACTION.md scopes recovery after ownership/late-delivery reconciliation, no
global audit or refused-result replay. No new runtime defect or queue completion
is asserted. Execution and all standing gates remain held.

Terminal delivery — amc-1512-model-revision-mapping-2026-09-11:
paired addenda, own receipt/source observations/handoffs and finalized pending
body, packet reading pointers and canonical role/activity records are acknowledged
and text-read back. Dedicated local vault note read59 lines, mtime
2026-09-11T03:30:54.811Z. Exact observations and write/readback boundary:
AMC_OS/RESEARCH/2026-09-11-amc-1512-model-revision-mapping/DELIVERY.md.
Own owner/activeOwnedExecution/remainingOwnedOperation are null at closure;
separate queue-reconciliation ownership remains untouched. Linear pending only,
no state change. No execution, source/test/template change, qualification or
automatic successor; missing queue handoff recovery is a next bounded task.

## 2026-09-11 — bounded Phase A queue handoff recovery

Task `phase-a-queue-handoff-recovery-2026-09-11`, AMC-1505 after AMC-1512.
Full brief/AGENTS/rolebooks read. Exact September 11 queue directory still returned
four original entries and Not found for ROLE_HANDOFF.md and remaining-work.json.
Read original ownership/scope, the complete retained byte-observation report,
bounded archived-claim metadata/limits, separate September 10 closure records,
and recent AMC-1512 authoring receipts. No underlying runtime source was reopened.

Recorded session 2026-09-10-bb212f1e shows the queue turn stopped at
2026-09-10T21:12:20Z; the user redirected closure to the September 10 path at
21:12:31Z. The separate closure's final at 21:29:53Z says stopped/no successor.
Incremental recording read through checkpoint #818 returned no new activity.
Session and parent ACTIVE metadata are preserved, not an OS-liveness conclusion.
Create new recovery-labelled handoff records, never claim missing originals found.

Scope/receipt root:
AMC_OS/RESEARCH/2026-09-11-phase-a-queue-reconciliation/handoff-recovery-2026-09-11/.
Linear get_issue discovery returned no functions; this task's own progress body
is LINEAR-PENDING, targetState=null. No previous body is resent. Existing vault
queue note receives an additive recovery section. Current HEAD/live queue remain
unknown; byte counters and archived statuses are not current semantic evidence.
No tests/checks/builds/imports/fixtures/acceptance/providers/humans, terminal/Git/
index/stash/worktree operations, source edits, workers or different gap started.

Terminal recovery — phase-a-queue-handoff-recovery-2026-09-11:
the newly recovery-authored parent ROLE_HANDOFF.md and remaining-work.json were
acknowledged and read back in full at65/91 lines, mtimes
2026-09-11T03:40:16.615Z/.616Z. Exact parent listing now returns seven entries,
including the four originals and the separate recovery directory. Original owner
readback remains17 lines at its original21:09:36.044Z mtime, not silently released.
Program/tech handoffs and the existing vault queue note were read back; the note
is61 lines with the recovery section27-61, mtime2026-09-11T03:40:16.637Z.
These are file-text measurements, not test counts or current queue verification.

Exact receipt/readback authority:
AMC_OS/RESEARCH/2026-09-11-phase-a-queue-reconciliation/handoff-recovery-2026-09-11/DELIVERY.md.
This recovery alone releases owner/activeOwnedExecution/remainingOwnedOperation
to null. Parent original metadata is preserved and explained. LINEAR-PENDING
remains independent and undelivered, targetState=null. Handoff recovery is
complete; current HEAD/live membership/claims/dependencies and qualification are
not. Next is the recovered index's focused permitted read-only applicability
reconciliation before selecting any real implementation gap. No execution,
source change, stash/worktree action, qualification, Done or successor occurred.

## 2026-09-11 — focused AMC-1512 current-applicability reconciliation

Task `amc-1512-current-applicability-reconciliation-2026-09-11`, sole CoS.
Followed the recovered index; read full standing brief/AGENTS/rolebooks, both
named protocols, all three collector scripts and later implementation/mapping
receipts. Current script headers return capture818/intake702/observer582 lines;
these are text measurements, not executed tests. Scope/receipt directory:
AMC_OS/RESEARCH/2026-09-11-amc-1512-current-applicability-reconciliation/.
New dedicated local evidence note records the opening. Linear discovery returned
no issue action; an independent pending progress body will retain live-state
unknowns and targetState null. No previous pending body or source operation is
replayed. No tests/checks/builds/imports/fixtures/acceptance/providers/humans,
terminal/Git/index/stash/worktree operations, source/test edits or different gap.
Current commit/environment/hash qualification remains unmeasured and held.

Finding and disposition — amc-1512-current-applicability-reconciliation-2026-09-11:
the named protocols and later credential/model-revision/mapping authoring are
present in current text; missing qualification is not labelled missing software.
Source trace demonstrates AMC1512-DIRECT-INTAKE-PHASE-ORDER: intake measurement
validation omits recovery-versus-known-first-result and return-versus-known-recovery
inequalities, although capture already enforces the required phase sequence.
Direct validateSession/study/CLI admission does not pass through capture replay.
Symbolic strict timestamp counterexamples and conditional aggregation impact are
documented in RECONCILIATION.md, not instantiated or executed. Related existing
intake/model-revision regression source was read fully (446/589 file lines); no
test was authored, collected or run, and no global coverage conclusion is made.

Applicability matrix, source observations, receipt, role handoff and exact
independent LINEAR-PENDING are now authored under this task's receipt directory.
Live state remains null, no transition or prior-body replay. Canonical role/activity
records and the dedicated local evidence note receive the bounded finding.
Next same-AMC-1512 action is a scoped direct-intake chronology correction with
unexecuted actual-path regressions, after explicit continuation. Preserve original
records/versions, null unknowns, full roster and reader-admission compatibility;
do not invent absent phase times. No source/test/protocol changes or different gap
started. All execution, qualification, refusal and external gates remain held.

Terminal delivery — amc-1512-current-applicability-reconciliation-2026-09-11:
reconciliation133/applicability50/source-observation53/role42/next59/pending16
line files were acknowledged and fully read back. These are CoS file lengths,
not checks or executed tests. Canonical program/tech/QA/research handoffs and
activity log were read; dedicated local note read65 lines, mtime
2026-09-11T03:53:21.449Z. Exact delivery/readback regions: this task's DELIVERY.md.
Scoped owner/activeOwnedExecution/remaining operations are null at terminal
closure, no prior owner or recovered handoff is rewritten. LINEAR-PENDING remains
independent with targetState null, no remote ID or issue transition.
Focused reconciliation is complete; direct-intake chronology correction is not
implemented or tested. Next same-issue action is bounded corrective source and
regression authoring without execution. All qualification and genuine-evidence
gates remain held. No source/test/protocol or worktree/stash change, different
gap, runtime, worker, issue Done or automatic successor is started.

## 2026-09-11 — AMC-1512 bounded next queue action selection

Task `amc-1512-phase-order-action-selection-2026-09-11`, sole CoS, requested GPT-6 Pro.
The delivered applicability packet exists: receipt45, reconciliation133,
applicability50, delivery78 and next-action59 file lines at current text readback.
Parent owner/process records are terminal/null. No missing-handoff recovery is needed.
Fresh full intake read returns702 lines, mtime2026-09-11T03:02:37.322Z.
Its validateMeasurements still omits the recorded cross-phase comparisons;
capture's scoped phase-order predicates remain present. These are source-text
observations, not an executed reproduction, whole-suite result or current HEAD pin.

Decision records:
AMC_OS/RESEARCH/2026-09-11-amc-1512-current-applicability-reconciliation/queue-action-selection/.
Select the existing same-issue AMC1512-DIRECT-INTAKE-PHASE-ORDER correction, not a
different queue lane or held provider/human collection. Current get_issue discovery
exposes no Linear function; own LINEAR-PENDING requests no transition or earlier-body
replay. Existing local applicability note receives a labelled addition.
No source/test changes, terminal/Git/index/stash/worktree operations, checks/tests/
builds/imports/fixtures/acceptance/providers/humans, credentials or workers.

Decision authored — amc-1512-phase-order-action-selection-2026-09-11:
queue-action.json fully read87 lines, mtime2026-09-11T04:01:24.149Z; SCOPE47 and
independent LINEAR-PENDING16 also fully read. Existing vault evidence note's
new section67-89 was read at total89 lines, mtime2026-09-11T04:01:24.150Z.
Receipt/source-observation/ROLE_HANDOFF and program/tech/QA/activity records are
being delivered and read back. Same-issue correction remains NOT IMPLEMENTED.
Selected compatibility decision preserves all current schema labels/defaults,
but not prior admission of contradictory inputs. Retain input/report history,
null/equality limitations, all rows and exact future reader provenance.
Actual-path regression obligations are requirements only, not authored tests.
No current candidate/HEAD/environment/hash pin, live-state claim or execution.

Terminal delivery — amc-1512-phase-order-action-selection-2026-09-11:
decision87/source-observation49/role55/receipt43/obsidian-sync12 line records were
read back, alongside all task-labelled program/tech/QA/activity additions and
the existing vault note's new section67-89. Exact observations and final patch
readback boundary are in the child queue-action-selection/DELIVERY.md.
Own owner/activeOwnedExecution/remaining operations are null at terminal closure;
parent and older ownership records remain untouched. LINEAR-PENDING is local,
targetState null, no transition or earlier-body replay. Next is corrective source
and unexecuted regression authoring for the same intake phase-order finding,
not another discovery loop or different queue issue. No implementation, execution,
worktree/stash operation, qualification, Done or automatic successor occurred.

## 2026-09-11 — AMC-1512 direct-intake phase-order implementation

Task `amc-1512-phase-order-implementation-2026-09-11`, sole CoS, requested GPT-6 Pro.
Read the full brief/AGENTS/rolebooks, selected queue action and terminal owners.
Current intake and existing intake/model-revision tests were read in full; capture
and protocol boundaries support the already-selected missing comparisons.
Implement only canonical-valid-timestamp cross-phase refusal and author synthetic
actual-path regressions, preserving schema/defaults/full population/unknowns.
Scope and receipt: AMC_OS/RESEARCH/2026-09-11-amc-1512-phase-order-implementation/.
Dedicated local evidence note and independent LINEAR-PENDING opening are recorded;
Linear get_issue discovery exposes no action. Current HEAD/environment remain null.
No tests/checks/builds/imports/fixtures/acceptance/providers/humans, terminal/Git/
index/stash/worktree actions, workers or different gap. No qualification implied.

Source authoring delivered — amc-1512-phase-order-implementation-2026-09-11:
CoS source patch and text readback show intake722 lines, mtime2026-09-11T04:08:27.707Z;
new tests/humanFirstUsePhaseOrder.test.ts476 lines, mtime04:13:47.195Z; study guide473
with only addendum430-473, mtime04:08:27.709Z (all September11 UTC). Exact source
regions, positive/negative regression map and reader compatibility are recorded
in CHANGES.md/REGRESSION_MAP.md/SOURCE_OBSERVATION.json in this task's packet.
Tests target actual direct admission/report/CLI/capture paths but remain unexecuted.
No test collection, fixture construction, parser/type validation or byte hashing.

The selected source gap is addressed in authored code, not qualified by execution.
All existing schema labels/defaults and stronger capture guards remain; unknown
times never become inferred bounds, contradictory old data/report bytes remain
preserved, invalid human rows withhold summaries without discarding identities.
Canonical role/activity records, new local Phase Order Implementation note and
finalized independent LINEAR-PENDING record this task's delivery. Current HEAD,
environment, live state and dependencies remain unverified. No issue transition.
Next safe action is the existing remaining-work index's bounded queue disposition
with this correction source-authored/unqualified; do not redo its selection or
lift execution hold. No other gap or whole-program implementation completion claim.

Terminal delivery — amc-1512-phase-order-implementation-2026-09-11:
source722/new regression476/guide473 changed regions and final regression text are
read back; change72/regression-map32/source-observation52/receipt48/role48/next34/
pending15 line records and every role/activity addition are also read back.
New local Phase Order Implementation evidence note read71 lines, modification
2026-09-11T04:19:54.527Z. Actual delivery and final closure-readback boundary:
AMC_OS/RESEARCH/2026-09-11-amc-1512-phase-order-implementation/DELIVERY.md.
These are file-text measurements, not runtime/test results. This task's owner and
remaining operations are null at closure; earlier owners, old reports and queue
history remain unchanged. Linear is pending only, no state change or replay.
No execution, Git/stash/worktree action, worker, qualification or Done claim.
Next is existing remaining-work disposition with this correction source-authored/
unqualified, not another correction-selection loop or an automatic test run.

## 2026-09-11 — Phase A batch 01 scoping and queue carry-forward

Batch phase-a-batch-01-2026-09-11. Read the full brief/rolebooks, recovered index
and terminal AMC-1512 phase-order receipt/owner; carry that correction forward as
source-authored/unexecuted, not a new missing gap. Latest user concurrency limit
supersedes old serial/no-worker instructions, not execution or refusal boundaries.
Fresh source identifies platform receipt overwrite at qualify-platform.mjs:13-15,
43-44,86 and comparison new-directory admission race at harnessComparison.ts:118-121.
The latter retains per-artifact wx but lacks atomic directory ownership. No race,
qualification or other runtime operation was performed. Named AMC-1538 public
validation remains a bounded applicability prerequisite, not a demonstrated defect.
Disjoint exact claims and reasons for fewer than five tasks are now recorded under
AMC_OS/RESEARCH/2026-09-11-phase-a-batches/batch-01/ before dispatch.
Linear discovery exposed no get_issue action; each task will retain its independent
LINEAR-PENDING body, targetState null, no earlier-body replay. Prime serializes
canonical per-task logs and role handoffs; worker notes and receipts are disjoint.
No tests/checks/builds/imports/fixtures/acceptance/providers/humans, terminal/Git/
stash/worktree actions or source changes have been performed by this opening.

### Batch 01 direct writes — T01 started

Under the user's direct-write steer, read the prepared exact claims and current
platform/comparison source. The first status route returned WORKER_IDENTITY_LOST;
its permitted retry reported no sub-agent history. A later dispatch has no success
acknowledgement. No further status call or worker launch is claimed.
T01 now authors the actual platform output correction in its reserved source:
exclusive directory before commands/scratch, owned report descriptor and wx steps.
The platform guide and task-local scope/new Obsidian opening are written with it.
Receipt path: AMC_OS/RESEARCH/2026-09-11-phase-a-batches/batch-01/T01-platform-output/.
No runtime/test/import/fixture/provider/human or Git/stash/worktree operation.

T01 source delivery: platform113/regression201/guide40 lines fully read back.
Separate packet T01-platform-output now records source-only receipt/handoff,
regression boundaries, own closure, Obsidian final section and LINEAR-PENDING.
The tighter output-parent requirement is not a platform acceptance result.
Canonical role/activity additions are serialized; no shared writer or old report
was overwritten. T01 source authoring ends before direct T02 authoring starts.

### Batch 01 direct writes — T02 source delivery

phase-a-b01-t02-comparison-output-2026-09-11 / AMC-1518: actual contextual source
correction in harnessComparison.ts read279 lines, mtime2026-09-11T04:36:08.989Z.
New regression read169 lines, mtime04:37:37.101Z; guide now362, addition346-362,
mtime04:36:08.990Z (September11 UTC). Atomic output-leaf admission precedes any
artifact/trial work; existing per-artifact wx, schema, population and unknowns stay.
Separate T02 receipt/handoff/log/note and LINEAR-PENDING record authoring only.
T01 packet was read back including receipt25/handoff24 and note38 lines; its
source work is released. No runtime/type/test/fixture/acceptance or provider proof.

Only two prepared implementation actions were source-backed and authored. T03 is
an unstarted read-only AMC-1538 prerequisite, not another implemented feature.
No worker launch was acknowledged; latest direct-write steer used one task at a
time, below the cap of five. All canonical writes are serialized. Batch closure
and next-action disposition live in the batch-01 root, not a rewritten old queue.

### Batch 01 terminal delivery

Both exact source/test/guide writes and complete task packets were text-read back.
Local notes read38/36 lines; T01 receipt25/handoff24 and T02 receipt26/handoff25.
Canonical execution/activity/ownership and every task's role-inbox addition were
also read. Final delivery and measurements:
AMC_OS/RESEARCH/2026-09-11-phase-a-batches/batch-01/DELIVERY.md.
Own batch/task owner and operations are null; T03's unused reservation is released,
not completed. No worker launch or parallel result claimed. No execution, validation,
Git/worktree/stash mutation, issue transition, cloud sync or Done claim. Next remains
the bounded AMC-1538 read-only prerequisite before any additional source selection.

## 2026-09-11 — Phase A batch 02 native validation admission

Consumed batch01's released AMC-1538 prerequisite using current named source,
existing regressions and the retained Python handoff; no old receipt was rewritten.
The full brief/AGENTS/rolebooks and scoped ownership were read before authoring.
Two independent source corrections were eligible; no padding to five.

### phase-a-b02-t01-config-ambiguity-2026-09-11 / AMC-1538

Authored duplicate decoded JSON-member refusal in src/setup/nativeValidationConfig.ts,
preserving safe file/pin/grammar ordering, schema1/defaults and explicit selection.
Source read110 lines, mtime2026-09-11T04:50:49.963Z; new
tests/nativeValidationConfigAmbiguity.test.ts read161, mtime2026-09-11T04:54:03.017Z.
Actual loader/selection/Studio regression source only; no imports/fixtures/runs.
Separate receipt25/role25/contract35 line records and local note37 were read fully.
Receipt: AMC_OS/RESEARCH/2026-09-11-phase-a-batches/batch-02/T01-config-ambiguity/.
Local note: /Users/sid/Documents/AMC/Evidence/2026-09-11 Phase A Batch 02 Validation Config Ambiguity.md.
LINEAR-PENDING.json holds an independent undelivered body, targetState null.

### phase-a-b02-t02-plan-admission-2026-09-11 / AMC-1538

Authored primitive identity/container and dense own-slot admission only in
src/agent/nativeValidation.ts:freezeNativeValidationPlan, preserving bounds,
order, caller bytes/objects and frozen snapshots; no execution/cancellation edit.
Source read160 lines, mtime2026-09-11T04:50:49.964Z; new
tests/nativeValidationPlanAdmission.test.ts read172, mtime2026-09-11T04:54:03.018Z.
Direct synthetic function cases only. Receipt26/role26/contract34 and note37 read.
Receipt: AMC_OS/RESEARCH/2026-09-11-phase-a-batches/batch-02/T02-plan-admission/.
Local note: /Users/sid/Documents/AMC/Evidence/2026-09-11 Phase A Batch 02 Validation Plan Admission.md.
Independent LINEAR-PENDING is recorded; no remote write or state transition.

All measurements above are CoS text headers, not collected/passing tests, hashes,
candidate/environment qualification or global preservation proof. Worker status
hit WORKER_IDENTITY_LOST; actual two-task spawn was blocked by OpenAI safety checks.
The distinct refusal is DISPATCH.json; no retry, alternate worker route, fallback
or parallel launch is claimed. Previously authorized direct CoS authoring completed
the two disjoint tasks synchronously. Shared logs/roles have a single prime writer.
No tests/checks/builds/imports/fixtures/acceptance/providers/humans, terminal/Git/
index/stash/worktree action, secrets/signing or generators. Current HEAD and live
tracker/dependencies remain unknown; all original evidence and execution holds stay.
Terminal task/batch ownership is null. Next: bounded remaining-queue disposition
with these source-authored/unqualified receipts, not another copy of these fixes,
automatic validation, a protected-source sweep or an invented next gap.

## 2026-09-12 — Phase A step 0 refresh and start of lane integration (Claude Code, Fable 5.1)

Session model: `claude-fable-5-1` for all work including subagents. The brief was read in
full before the first tool call. Live state re-verified: integration HEAD
`4d2d69e5d4d01bfd1f82662ceff0305b5c2885b5` on `amc/gap-register-execution` (unchanged
since 2026-09-11); shared stash `152a61696f336f658893a72aa9357d58df8c5679` present; no
`index.lock`; 63 registered worktrees, 15 dirty, 0 prunable; 125 local branches, 90
unmerged. Live Linear read of AMC-1505: 43 children, 28 In Review, 11 In Progress, 3 Done,
1 Canceled. Brief §1/§5 corrected in place for HEAD, worktree count and child tally.

Read-only audit refresh written:
`AMC_OS/RESEARCH/2026-09-09-worktree-audit/refresh-2026-09-12T131601Z/` (inventory.json
sha256 aacc18cb9519f9d8…, README.md e5df27d91090ea06…; full hashes in manifest.json).
Every worktree registration/HEAD/dirty count/exclusive count equals the 2026-09-11 capture.
Root delta 239 → 242 dirty paths; recovered path diff shows ten P01-lane additions dated
2026-09-11 14:30–14:38 local. Root dirty paths classified by ownership-manifest lane: 232
recoverable lane authoring (P01–P10, AMC-1512, batch-01/02, cross-lane wiring), 9
bookkeeping, 1 unknown. All 52 untracked `src/` files have at least one `src/` importer.
Newest dirty-path mtime 2026-09-11; no dirty path changed in the three hours before capture.
Not claimed: compile state, test state, correctness, acceptance, Phase A completion.

Directive in force (Sid, 2026-09-12 `/goal`): integrate the already-authored native
provider, terminal, MCP, extensions, SDK, ACP and Studio lane source into AMC end to end;
defer tests/checks to the implementation boundary, then run them and report; preserve every
worktree and the stash; no reset/stash/delete/publish/deploy/Graphify/DSH/pi. This session
therefore claims the dormant root lane paths for integration (manifest updated). Next: a
discovery typecheck of the root tree to find where the lane authoring does not yet connect.

### 2026-09-12 — Task 1 done: the authored lane source compiles as one tree

Discovery typecheck at capture (root, dirty tree, Node v25.5.0): `tsc -p tsconfig.json`
11 errors, `tsc -p tsconfig.tests.json` 57 errors. Fresh clone of HEAD `4d2d69e5` in the
session scratchpad (frozen `pnpm install`): src 0 errors, tests 4 errors — so four test
typecheck failures pre-date the lane work (`doctorNativeModuleProbe`, `jsonlWriterResume`,
`fixtures/jsonlWriterResumeWorker`, `nativeFailureVisibility`).

Root fixes (product): `src/llm/streamChunk.ts` adds `AudioContentBlock` so the closed
`ContentBlockMap` proof covers the `audio` SurfaceKind the P05 lane introduced;
`src/llm/blockAssembler.ts` and `src/llm/adapter/streamRecorder.ts` refuse `audio` the way
they refuse `image`; `src/llm/index.ts` exports the type; `src/sdk/nativeAgentClient.ts`
validates event-buffer ceilings from `unknown`; `src/studio/nativeTaskService.ts` copies the
validation selection into the signed descriptor. JSDoc contracts added (no behaviour change)
to `src/console/assets/nativeTaskSubmission.js`, `src/console/assets/nativeTasks.js` and
`scripts/human-first-use-capture.mjs`. Test side: new `tests/helpers/stepUsage.ts` mirrors
`stepRunner.stepUsage`; `tests/helpers/agentLoopHarness.ts` accepts a throwing generator
script; 17 test files received narrowing/typing corrections (listed in the session report).

Result after fixes: src typecheck 0 errors, tests typecheck 0 errors (root tree, Node
v25.5.0, `tsc` only). Not claimed: any test executed, build, package, platform or fresh-clone
qualification of this tree. Next task: execute the 27 `cosProduct*`/`cosBatch1*` lane tests
and the other authored-unexecuted native tests to find runtime disconnections.

### 2026-09-12 — Task 2 done: lane and native tests execute green in root

First execution of the authored-unexecuted lane tests (root tree, Node v25.5.0, `vitest run`
on named files, not the full suite). P01–P10 lane files (`cosProduct*`, `cosBatch1*`): 26 files
pass, 1 browser-gated skip (`cosProduct09StudioPage`, needs `AMC_PUBLIC_TASK_BROWSER=1`);
the only failures were seven cases in `cosProduct10NativeTaskService` whose fixture created
the credentials home world-readable (fixture fixed to 0700). Python P06 (`python3.14 -m pytest`,
five lane files): 109 passed. The wider native set (37 files) had 20 failures in 10 files,
grouped by root cause and resolved:

- **Runtime-context snapshot (5)**: the loop's context pre-step appends one trailing user
  part on every real CLI run; three tests now expect it explicitly.
- **Per-event payload cap (5)**: `retention.maxPayloadBytesPerEvent` (64 KiB, signed ops
  policy) refuses any session row above it, so 600 KB–1 MB single attachments can never be
  recorded. Product change, fail-closed with the fix named: new
  `src/session/sessionPayloadCap.ts`, checked at the two media doors (`LoopInbox.insert`,
  `SessionService.recordUserAttachment`), advertised and enforced by the Studio native task
  service (`INPUT_TOO_LARGE` 413, effective `maxSerializedPartsBytes`), and a new
  `amc ops sign` command (`src/cli.ts`) so the named fix exists. Regression
  `tests/sessionPayloadCap.test.ts`; both cap checks mutation-verified RED→GREEN. The five
  tests now grow a real session past the ACP aggregate replay bound with rows inside the
  cap (`tests/helpers/outgrowSession.ts`). Not done: spill-backed large attachments.
- **Cold blob reads (7)**: read-only vault access requires an explicit passphrase; the cold
  fixtures now receive it, and tamper simulations drop the immutability triggers as the
  tracked precedent does and mirror retention for pruning.
- **Budget admission after a failed stream (2)**: AMC-1534 blocks further spend after
  partial usage unless the operator signs `unknownTokenUsage: ALLOW_WITH_WARNING`; the two
  recovery tests now declare that waiver instead of widening policy.
- **Stale expectations (2)**: DeepSeek's explicit audio refusal message; Gemini encoder v2
  registered and admitting image input.

Re-run of all 77 lane/native/touched files after fixes: 73 passed, 1 skipped, 3 failed —
`nativeGeminiWire` (fixed after that run began; 26/26 on re-run) and two tracked tests
(`nativeValidationSurfaces`, `nativeValidationOutcomeSurfaces`) that load `dist/`, which is
stale from 2026-09-08. Counts: 1,789 passed, 17 failed, 12 skipped of 1,818 in that run.
Typechecks remain 0/0. Not claimed: full-suite, build, package, platform, fresh-clone
qualification. Known-open confirmed still open: `studioState.ts:130` issues all four scopes;
no spawn path installs hook control. Coherence gaps found: `nativeFirstUseGuide.ts` offers
deepseek but not gemini/gemini-audio/ollama; Studio's provider lists omit deepseek/ollama.

### 2026-09-12 — Task 3: cross-lane coherence (first-use guide, Studio providers, dist-backed checks)

Build of the integrated tree (`pnpm build`, root, Node v25.5.0): passed. Dist-backed tracked
tests then ran: 15/16 passed; the one failure was a stale expectation in
`tests/nativeValidationSurfaces.test.ts` — the P07 SDK now throws malformed validation
metadata to the dispatcher (which fails the whole client) as well as rejecting the turn; the
test now asserts both. Python suite against `dist/cli.js`: 289 passed, 22 failed, 1 skipped —
21 failures are `test_validation_installed.py` requiring the wheel installed in the
interpreter (`import amc_sdk` under `python -I`; not installed here, so not exercised), and
one was a stale substring in `test_end_to_end.py` (the MCP refusal now names the `mcpServers`
field and the reviewed `--mcp-config` path; assertion updated). Playwright's Studio browser
test needs Chromium headless shell 1234 (`npx playwright install`), a download not performed
without confirmation — recorded as a blocker. `website/openapi.yaml` is stale against the
native task contract (publisher `scripts/update-native-task-openapi.mjs` needs `dist/`); it
will be regenerated in the fresh clone at the candidate commit, not in the shared root.

Coherence fixes: `src/setup/nativeFirstUseGuide.ts` now offers every provider the native
route inventory admits (openai, openai-responses, anthropic, deepseek, gemini, gemini-audio,
ollama, stub) with GEMINI_API_KEY mapped and ollama treated as a local model server (model
required, no credential assumed, origin named); `src/setup/nativeInteractiveSession.ts` and
the `agent-loop guide --provider` help follow. Studio native tasks expose deepseek and ollama
(`src/studio/nativeTaskTypes.ts`, `nativeTaskInput.ts`, `nativeTaskDescriptors.ts`,
`nativeTaskOpenapi.ts`, `nativeTaskService.ts`, console `nativeTasks.js`/`nativeTasksView.js`):
provider entries carry `model: "fixed" | "required"` so a keyless local server is not
mistaken for the stub demo; deepseek is text-only, ollama carries images. New regression
`tests/nativeFirstUseGuideProviders.test.ts`; `cosProduct10NativeTaskService` asserts the
new entries. Affected set (14 files, 300 tests) passed; src/tests typecheck 0/0.

### 2026-09-12 — Full root suite, HEAD baseline, and the integration commits

Full `vitest run` in root against the rebuilt `dist/` (Node v25.5.0): 1,477 files — 1,462
passed, 14 failed, 1 skipped; 14,057 tests — 14,025 passed, 17 failed, 15 skipped. The same
14 files were then run in a fresh built clone of HEAD `4d2d69e5`: 6 files / 8 tests already
fail there (pre-existing since the last green suite at a598): `acpFailedTurnUpdates` (two
tests record 850–900 KB assistant blocks the 64 KiB per-event cap refuses), `publicDocsGraph`
(promoted guides link to unpromoted ones), `publicStatsDrift` (README badge 1,389 vs the real
test-file count), `sessionContinuationWithGateway`, `sessionOwnership` and
`sessionStoreConformance` (all three encode pre-JSONL-writer-recovery semantics that commit
96accade replaced). The other 9 were lane- or integration-caused: v4 encoders now bind
provider tool names (`providerToolNames`, `anthropicCacheBreakpoints`, `llmFailedToolReplay`,
`cliSignedToolSubset`), the guide's provider list (`nativeFirstUseGuideCli`), a revision-0
request now refused by schema (`studioNativeTaskService`), typedoc absent from root's
node_modules (`publicDocsArtifact`, present in the clone), and the perf floor at 487 ev/s
under full-suite load (2/2 pass in isolation). Every failure except the README counts and the
OpenAPI artifact is resolved in the tree; both generators run only in the fresh clone.

Committed by explicit path lists (no `git add -A`), HEAD was `4d2d69e5`, no index lock:
`a3467629` providers/modalities/terminal (P01/P02/P05), `b0104235` MCP/extensions (P03/P04),
`858aaa08` SDK/ACP (P06/P07/P08), `54c3ce6a` Studio (P09/P10), `da626c52` AMC-1512 and
batch-01/02, `41180d62` integration fixes, `c1b5cf9c` records (amended to force-add this
session's receipt directories, which `.gitignore` excludes under `AMC_OS/`). Root is clean at
`c1b5cf9c`. The Sep 9–11 sessions' untracked audit receipts under
`AMC_OS/RESEARCH/2026-09-09-worktree-audit/` (8.3 MB, 119 ignored paths) were left untouched.
Next: fresh clone at `c1b5cf9c` for build, typechecks, the OpenAPI publisher and
`gen-counts --write`; bring the regenerated artifacts back as candidate B; full suite, Python
suite and release gate in a fresh clone at B.
