# AMC Phase A — finite closure-evidence map

**Date:** September 9, 2026. **Purpose:** hand the existing issue queue to Codex for receipt reconciliation, not declare Phase A complete.

The [machine-readable map](closure-map.json) contains one row for every supplied issue, preserving its exact title and snapshot status. Each row records source references, acceptance obligations, inspected evidence references, missing proof, dependency type, qualification boundaries and why a full passing gate alone is insufficient. The issue-key anchors below match each JSON row's `anchor` field.

## Snapshot and source boundary

The supplied `AMC_OS/RESEARCH/2026-09-09-chat-on-steroids/closure-issue-snapshot.json`, retrieved **2026-09-09T11:01:29.221Z**, contains **42 issues: 31 In Review and 11 In Progress**, with `hasNextPage: false`. These are counts of that supplied snapshot, not newly queried live statuses. The brief's older queue count is not used.

Assigned worktree: `/Users/sid/AgentMaturityCompass/tmp/cos-closure-map`; branch: `codex/cos-closure-map`; pinned source: **`68458818799d1db7826d67d1b604d6ad77ac4432`**. The worktree pointer, branch HEAD and branch ref were read as text. No Git operation or ancestry check was executed.

**Final runtime acceptance is pending and was not inspected.** The inspected root `plans/ownership-manifest.md` reports a clean-install success followed by a TypeScript build failure at the assigned pin, a correction at `e12060297b6f847903501354d3a6425ffc51adb7`, and a later frozen candidate declaration at `c16492c10592112fe610bd2e59f216f8f7f310b4`. These are separate facts. This map does not silently repin its source, inspect an ongoing run, or turn a source correction into a pass.

The earlier `AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/README.md` reports a **failed** `0fcce267ad52141dbec68af02a4af665211609bd` batch: 11,842 passed / 6 failed / 0 pending out of 11,848 tests; 11 passed / 3 failed / 1 skipped gate checks on the recorded Darwin ARM64 / Node 22.22.0 / pnpm 10.33.0 environment. Its live-deployment check lacked a supplied URL. Preserve that attempt; it is neither the assigned pin's result nor the later candidate's acceptance.

All snapshot descriptions are truncated. The earlier full archive, `AMC_OS/RESEARCH/2026-09-09-phase-a-reconciliation/issues.json`, supplies contracts for AMC-1506–1543, but not authoritative later statuses. AMC-1544–1547 additionally use the inspected implementation and acceptance guides. Their unprovided description tails remain unknown. Before any closure, Codex must refresh the full current issue contract rather than assume this dated map is complete forever.

## How to read the evidence

The JSON `evidence` registry resolves each identifier below to an **actually opened file**, its root, read range, evidence class and limits. `repository` means `/Users/sid/AgentMaturityCompass`; `assigned-worktree` means the isolated closure worktree. Root research notes may postdate the worktree pin; inspection does not prove their bytes were committed at that pin.

An opened guide can identify a relevant test or receipt without making that nested file independently inspected. Source/helper authoring is not execution; a scoped dirty-source review is not the brief's fresh-clone acceptance; historical installed receipts remain limited to their actual source and environment. All five helper source inspections were partial and their ranges are explicitly recorded. Implementation hashes are reported from inspected contracts/notes, not newly proved merge ancestry.

| Boundary | What is needed | What does not substitute |
| --- | --- | --- |
| Source | Actual fresh-clone implementation and property-specific negative/mutation evidence at the accepted commit. | An authored test, dirty-tree review or composite of unrelated scoped runs. |
| Package | Actual built bytes, provenance and isolated installed public-interface behavior. | A successful source build or a private source import. |
| Platform | Executed OS/architecture/Node/install cells, including explicit failures and not-run cells. | Another architecture, a checksum, or PowerShell executed on a different OS. |
| Human | Real first-use records, full-roster reconciliation and independent review of consent, provenance and recordings. | Guided preparation, affirmative booleans, matching recording hashes or automated personas. |
| Comparative | Matched pinned harness/model/task/settings/bounds, repetitions, independent outcomes and retained evaluated outputs. | Scripted protocol success, one interrupted pilot or missing outputs reconstructed after the fact. |
| Deployment | Authorized public artifact/deployment and actual post-deploy governed verification. | A private package, local container, health endpoint or skipped deployment check. |

Required boundaries are issue-specific. This is not a demand to run every feature on every platform or with a paid provider. Documented exclusions do not automatically become new features.

## Closure order after final receipts exist

First reconcile the actual merged source, artifact identities, clean-clone preparation, full suite and release gate, preserving the failed attempts above. Then review evidence in the following dependency order; the detailed JSON distinguishes explicit blockers from shared evidence and suggested acceptance ordering.

| Order | Issues and action | Evidence to consume |
| --- | --- | --- |
| 1 | Review foundational security: **1525, 1542, 1546, 1545, 1547**. | Actual baseline, intended-assertion mutation, causal review and exact-restoration receipts; installed/operator proof where claimed. |
| 2 | Resolve **1546 → 1508**, **1547 → 1522**, and **1545 → 1531**; carry compaction/spill scope into the native aggregate. | Do not accept late refusal as pre-dispatch prevention or preview compaction as full retained-output safety. |
| 3 | Reconcile source/package/session/provider/tool/SDK/container and count/type/persona claims: **1509–1511, 1513–1515, 1519, 1521, 1526–1529, 1532–1535, 1537**. | Exact current installed receipts and source-specific exclusions; old summaries alone are insufficient. |
| 4 | Reconcile **1544** generated null/reference semantics, **1543** staged API docs, then **1540/1541/1536** installed browser behavior and **1538** installed Linux cancellation. | Current generated artifacts; real retry/archive scenarios; shutdown and cold verification; missing cancellation follow-through. |
| 5 | Reconcile **1506/1507/1516/1517/1520/1523/1539** semantic imports, optional interoperability and retained outputs. | Conservative trust/loss mapping; actual pinned upstream consumers; exact evaluated-file retention. |
| 6 | Keep **1512, 1518, 1530** open for their missing human/model/platform evidence. Obtain owner disposition of stopped **1524** without restarting Graphify. | Real evidence or explicit scope disposition, never substituted fixtures or a new speculative feature program. |

These steps are a review order, not permission to execute work in this mapping assignment. Existing AMC-483 release/CI/install alignment and AMC-7 public-install verification are references, not additional rows in the finite snapshot.

### Mutation results need property-level review

Read `managed-portal-guide`, `stops-credentials-guide` and `spill-mutation-guide` with the actual resulting receipts. A compilation, setup, import, ABI or unrelated assertion failure is not a killed security property. Require the intended assertion, reviewed causality and restored passing behavior.

For portal attribution, removing a missing-principal guard may only change an intentional refusal into a downstream SQLite failure; stripping a forbidden field does not prove forged attribution was persisted. For Studio credentials, the prepared early-owner-guard-only mutation is expected to survive where the existing lease identity guard still covers the case. A compound bypass does not prove both guards were independently necessary.

For retained output, the six-suite lifecycle protocol does **not** cover the entire newly added operator CLI or establish bounded `spill-read` qualification. Reconcile those additional authored regressions and actual installed commands separately. Do not infer plaintext recovery, complete chain verification, remote backup erasure or DSAR completion from ciphertext inventory or local unlink.

## Per-issue map

Every entry below still requires the seven-part Done contract. “Remaining” means evidence this map cannot establish, not a claim that independently running Codex has failed to obtain it. Exact issue titles and detailed obligations are in JSON; the evidence identifiers resolve to inspected files there.

| Issue and anchor | Snapshot state | Inspected evidence identifiers | Remaining proof that aggregate green does not provide |
| --- | --- | --- | --- |
| <a id="amc-1506"></a>**AMC-1506 — neutral-import truthfulness** | In Review | `import-1506`, `import-mapping`, `dsh-capture` | Current downstream score/trust/lifecycle outputs and hostile fixtures; zero invented maturity/observed claims. Old empty Watch results do not prove failure preservation. |
| <a id="amc-1507"></a>**AMC-1507 — Pi failures and ancestry** | In Review | `pi-review`, `import-1506`, `import-mapping` | Fresh candidate nested-failure, duplicate/cycle/orphan, redaction and unknown-time consumer evidence; preserve historical dirty/scoped limitations. |
| <a id="amc-1508"></a>**AMC-1508 — authenticated portal attribution** | In Review | `portal-runtime`, `managed-portal-guide`, `studio-credentials` | Persisted-state and causal mutation receipts plus explicit **AMC-1546** blocker resolution. Injected authentication is not live credential acceptance. |
| <a id="amc-1509"></a>**AMC-1509 — source installation** | In Review | `source-install`, `batch-supervisor-guide`, `ownership` | Final documented clean-source recipe, isolated link/native turn and cold proof after the recorded build correction; older Node 25 evidence is not the current supported lane. |
| <a id="amc-1510"></a>**AMC-1510 — standalone package** | In Review | `packed-install`, `source-install`, `standalone-summary` | Actual final packed bytes/licenses/dependency closure and installed public workflow; public publication remains separate. |
| <a id="amc-1511"></a>**AMC-1511 — process resume/fork** | In Review | `session-checkpoint`, `identity-installed`, `python-sdk` | Final cross-process identity/history, crash/no-replay, contention, fork and cold verifier receipts; preserve explicit JSONL in-place-resume refusal. |
| <a id="amc-1512"></a>**AMC-1512 — interactive first use** | In Progress | `identity-installed`, `human-intake-guide`, `human-capture-guide`, `human-observer-guide` | Actual real-provider and consented first-use evidence, plus final terminal/tool qualification. Preparation/export is not a human result. |
| <a id="amc-1513"></a>**AMC-1513 — Linux native shell enforcement** | In Review | `linux-shell`, `cancellation-guide` | Actual installed Linux signed-grant effects/refusals, affected-source reconciliation and restored host. Do not promote machine readiness into process confinement. |
| <a id="amc-1514"></a>**AMC-1514 — provider capability/wire admission** | In Review | `provider-wire`, `readonly-subsets` | Exact offered-tool aliases, pre-transport refusal and old/new request reconstruction in current installed public paths; historical composite checks are not a full pass. |
| <a id="amc-1515"></a>**AMC-1515 — governed stdio MCP** | In Review | `stdio-mcp`, `typescript-sdk` | Actual process/catalog/grant/approval-before-effect and disposal/cold proof at final package; HTTP remains distinct. |
| <a id="amc-1516"></a>**AMC-1516 — external profile/verifier** | In Review | `external-profile`, `brief` | Final isolated public consumer vectors and migration/contract review. A consumer is not a separate implementation; no industry-adoption claim follows. |
| <a id="amc-1517"></a>**AMC-1517 — callback semantics** | In Review | `pi-callback` | Actual pinned upstream kit/public bridge identity, privacy/bounds and lifecycle reconciliation; keep telemetry self-reported and watcher limitations explicit. |
| <a id="amc-1518"></a>**AMC-1518 — comparative outcomes** | In Progress | `real-pilot`, `output-retention`, `human-intake-guide` | Matched repeated genuine model trials, actual retained evaluated source and real human cohorts. Preserve the pilot's failed/inconclusive results. |
| <a id="amc-1519"></a>**AMC-1519 — typed clients and portable proof** | In Review | `python-sdk`, `typescript-sdk` | Actual final wheel/public-package consumers, child cancellation and independent cold evidence; Python tools:none does not qualify Python MCP. |
| <a id="amc-1520"></a>**AMC-1520 — optional DSH capture** | In Review | `dsh-capture`, `standalone-summary` | Final pinned actual upstream/runtime and capture/proxy/cancellation boundaries; no fabricated native tool or ancestry observations. |
| <a id="amc-1521"></a>**AMC-1521 — test TypeScript gate** | In Review | `test-type-negative`, `batch-record`, `ownership` | Current production/test typing and full gate, retaining deliberate test-only failure and exact-restoration proof. |
| <a id="amc-1522"></a>**AMC-1522 — origin-addressed compaction** | In Review | `compaction-source`, `standalone-summary`, `spill-mutation-guide` | Actual measured byte/reconstruction/operator receipts and explicit **AMC-1547** blocker resolution; no invented token/cost savings. |
| <a id="amc-1523"></a>**AMC-1523 — import loss review** | In Review | `import-mapping`, `dsh-capture` | Current per-record accounting, redaction/escaping and public review/apply behavior; source renderer tests are not actual browser or human acceptance. |
| <a id="amc-1524"></a>**AMC-1524 — architecture navigation** | In Review | `archived-contracts`, `readonly-subsets`, `lead-plan`, `ownership` | **Stopped scope: owner disposition required.** Historical extraction is not current-source coverage. Do not restart Graphify or refresh canvases. |
| <a id="amc-1525"></a>**AMC-1525 — authenticated historical keys** | In Review | `key-history-review`, `packed-install` | Fresh attacker-key/admission/portable/read-only mutation and positive receipts; dirty-source review is not final acceptance or external anti-rollback. |
| <a id="amc-1526"></a>**AMC-1526 — truthful test inventory** | In Review | `count-claims`, `ownership`, `api-recovery` | Final generated-source correspondence and negative public-claim checks; inventory is not execution even when its number happens to match. |
| <a id="amc-1527"></a>**AMC-1527 — source-built containers** | In Review | `container-source`, `archived-contracts`, `notary-tls` | Reconcile later declared Linux receipts and current images. The opened earlier Darwin selective-input record is not that later raw Linux receipt. |
| <a id="amc-1528"></a>**AMC-1528 — automated persona reporting** | In Review | `persona-contract`, `human-intake-guide` | Actual installed contract outcomes and truthful denominators/failure prose; inspected synthetic planner checks do not prove installation or human ease. |
| <a id="amc-1529"></a>**AMC-1529 — optional notary/TLS** | In Review | `notary-tls`, `standalone-summary` | Exact current real-container signing/auth/replay/TLS/restart reconciliation and cleanup; local software/private CA is not public or hardware deployment. |
| <a id="amc-1530"></a>**AMC-1530 — supported platform/install matrix** | In Progress | `platform-gap`, `identity-installed`, `linux-shell`, `snapshot` | Actual remaining native Windows/AMD64/install cells. PowerShell on macOS and ARM containers do not qualify other operating systems or architectures. |
| <a id="amc-1531"></a>**AMC-1531 — standalone native delivery** | In Review | `standalone-summary`, `delegation-stops`, `spill-record` | Explicit **AMC-1545** blocker and compaction/spill scope, plus final installed independence/capability receipts. Do not mass-close on this aggregate. |
| <a id="amc-1532"></a>**AMC-1532 — CLI/ACP/SDK alignment** | In Review | `typescript-sdk`, `stdio-mcp`, `http-mcp`, `native-budgets` | Final installed public forwarding, effects, updates/cancellation and cold proof; preserve the earlier partial budget result and later correction. |
| <a id="amc-1533"></a>**AMC-1533 — signed context/chat extensions** | In Review | `chat-extensions`, `session-checkpoint` | Actual terminal hostile-manifest/resume/post-unload signed bytes at final source; unload does not remove historical context. |
| <a id="amc-1534"></a>**AMC-1534 — signed native budgets** | In Review | `native-budgets`, `typescript-sdk` | Final real-process admission race, denied effects, accounting and nonzero CLI status; unknown cost remains unknown. |
| <a id="amc-1535"></a>**AMC-1535 — native HTTP MCP** | In Review | `http-mcp`, `stdio-mcp` | Actual installed origin/credential/catalog/approval behavior, held-call cancellation and disposal; no implicit live TLS, OAuth or reconnect guarantee. |
| <a id="amc-1536"></a>**AMC-1536 — native Studio tasks** | In Review | `studio-browser-old`, `studio-browser-old-raw`, `browser-guide` | Final actual browser retry/archive/auth/lifecycle and all post-shutdown owner-session/ledger checks. Old refresh coverage is not new retry coverage. |
| <a id="amc-1537"></a>**AMC-1537 — signed read-only review** | In Review | `readonly-subsets`, `provider-wire` | Actual offered subset, allowed reads and denied guessed writes in installed paths, with provider compatibility and cold evidence; not review quality. |
| <a id="amc-1538"></a>**AMC-1538 — public validation versus completion** | In Review | `public-validation`, `cancellation-guide`, `api-recovery` | Installed Linux cancellation follow-through to **both separate cold CLI verifiers**, with SDK proof, exact outcome and restored host; prior attempt stopped early. |
| <a id="amc-1539"></a>**AMC-1539 — retained coding outputs** | In Review | `output-retention`, `real-pilot` | Final bounded safe capture and independent evaluated/retained-byte identity before cleanup; formal real-model runner qualification remains distinct. |
| <a id="amc-1540"></a>**AMC-1540 — identical-request retry** | In Progress | `archived-contracts`, `browser-guide`, `browser-helper` | Real installed create/follow-up loss before and after admission, exact replay identity and no duplicate effects; no automatic retry. |
| <a id="amc-1541"></a>**AMC-1541 — closed descriptor archival** | In Progress | `archived-contracts`, `browser-guide`, `api-recovery` | Installed owner-only eligibility/capacity/deduplication and retained signed evidence, plus current API artifact; archival is not evidence erasure. |
| <a id="amc-1542"></a>**AMC-1542 — authenticated hook revocation** | In Progress | `managed-portal-guide`, `managed-portal-helper`, `batch-record` | Final raw-list/deleted-list/unverifiable-store causal mutation receipts, restored positives and refusal before forwarding/installing. |
| <a id="amc-1543"></a>**AMC-1543 — recovered TypeDoc API** | In Progress | `archived-contracts`, `api-recovery` | Final staged output/revision links/public-export coverage and warning disposition; successful preparation is not complete API coverage or Pages deployment. |
| <a id="amc-1544"></a>**AMC-1544 — nullable OpenAPI reference** | In Progress | `snapshot`, `api-recovery` | Current generated null/reference constraint semantics and source/artifact consistency; corrected preparation retained earlier compiled TypeScript. |
| <a id="amc-1545"></a>**AMC-1545 — signed delegation stops** | In Progress | `delegation-stops`, `stops-credentials-guide`, `stops-credentials-helper` | Actual ceiling/lifetime/snapshot/descendant/settlement proof and causal mutations; distinguish injected executor/clock tests from native transport. |
| <a id="amc-1546"></a>**AMC-1546 — supplied credential binding** | In Progress | `studio-credentials`, `stops-credentials-guide`, `stops-credentials-helper` | Same-agent scope intersection and zero effects before refusal; causal mutations must preserve expected surviving and compound-guard distinctions. |
| <a id="amc-1547"></a>**AMC-1547 — retained-output lifecycle** | In Progress | `spill-record`, `spill-lifecycle-guide`, `spill-command-guide`, `spill-mutation-guide` | Final lifecycle mutations **plus operator CLI and bounded-reader receipts**, commitment-before-publication, exact reviewed scope and truthful audit/partial outcomes. |

## Seven-part Done contract — per issue, not per batch

The source is `plans/2026-09-09-amc-execution-brief.md`, lines 216–229. All seven remain individually accountable:

1. Committed implementation on a named branch, merged conflict-free into the integration branch.
2. Issue acceptance reproduced in a fresh clone at that merged commit.
3. Full suite passing at that commit, with explicit pass/fail/pending counts and zero failures; no scoped composite substitution.
4. `pnpm release:gate` passing, or every skipped check named with its reason. A failed check is not a justified skip.
5. Durable `AMC_OS/RESEARCH/` receipt with exact source/environment, exercised/excluded behavior, failures and cleanup.
6. Authorized Linear Done change with exact commit and receipt path, after refreshing the complete current contract.
7. Relevant dated Obsidian note updated with the same truthful evidence boundary.

This assignment performs none of the runtime validation, merge, Linear or Obsidian actions above. The map's completion marker is only a handoff marker. No row is labelled Done or automatically eligible for closure.

## Evidence that still needs people, platforms or later authorization

**Human and genuine model work.** `human-intake-guide` specifies the existing common task and five real first-use sessions per harness. Preserve the entire planned roster, first-task failures, unknown measurements, recovery and voluntary-return outcomes. Neither affirmative declarations nor unique recording hashes authenticate consent, independence, actual model use or task correctness. The inspected `real-pilot` reports zero qualified passes, five qualified failures and four inconclusive trials from the limited interrupted pilot. No better outcome is inferred from later scripted fixtures, and its missing final source is not backfilled.

**Independent implementation and adoption.** `external-profile` establishes an independent consumer of AMC's public module, not an independently implemented verifier. No independent implementation or external adoption pilot was inspected. Under brief section 11 these remain necessary before an industry-standard claim. They are not silently added as a new feature program or mandatory external adoption condition for each local conformance issue.

**Platform availability.** `platform-gap`, later snapshot descriptions and `standalone-summary` distinguish actual macOS/Node and Linux ARM lanes from remaining native Windows/AMD64/install work. A launcher's controlled child-failure test on macOS cannot establish native Windows installation. Keep missing cells explicit under AMC-1530 rather than hiding them behind a green host suite.

**Publish/deploy gates.** Phase B waits for actual Phase A disposition and the standing pinned release gate. The B0 public-exposure security disposition and incident key-rotation proof were not established here; no secrets or credential stores were read. Credential availability is **not assessed**, not “missing” or “present.” Before publishing, Sid must see version, signed-artifact digest, gate result and B0 disposition and explicitly approve. Deployment separately requires target/digest/rollback approval, no default/demo secrets, and an actual post-deploy governed-turn receipt. A local container or health response does not supply that evidence. Old version labels are not a current registry lookup.

## Local handoff and stop condition

The role handoff is `AMC_OS/INBOX/REV_PROGRAM_MANAGER.md` in the assigned worktree. Only it and the JSON/Markdown map were authored. The JSON ledger preserves inspected evidence, unknowns and exact pending acceptance questions; it is not an acceptance runner or an open-ended implementation queue.

Codex's next action is receipt reconciliation, not repetition of this mapping task. Review existing final receipts when independently available, update only the evidence that has actually changed, and keep the external/authorization boundaries explicit.
