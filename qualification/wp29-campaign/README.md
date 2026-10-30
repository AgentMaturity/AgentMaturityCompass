# WP29 part A: matched campaign preparation and offline analysis

This package prepares comparisons and analyzes retained trials. It runs no model, paid provider or live trial. A source revision, readiness check or scripted pass does not establish task quality, a release claim or superiority.

The three versioned plans are deliberately blocked (`manifest: null`). Supply an actual reviewed, digest-pinned materialized manifest in a new campaign revision; resolve each listed blocker with retained evidence. Do not replace unknown artifacts with zero hashes. The accompanying `reviewed-sources.v1.json` records the October research revisions, not current upstream HEAD or installed distribution identities.

| Plan | Cohort | Targets | Repetitions | Planned trials | Existing preparation path |
| --- | --- | --- | ---: | ---: | --- |
| `native-conformance.v1.json` | Scripted contracts | AMC / DSH / Pi | 6 | 234 | `nativeMaterialize.mjs` supplies AMC-only fixtures; comparator and missing-scenario bindings remain unavailable |
| `native-model-quality.v1.json` | Matched coding quality | AMC / DSH / Pi | 6 | 54 | `codingMaterialize.mjs` inventories installed artifacts and reuses the three neutral `codingCases.json` tasks |
| `improvement-loop.v1.json` | Optimization outcomes | AMC / Harness² | 6 | 36 | WP04 `runExecutedExperimentAsync` / `executeCaseTrials`; separately qualify the Harness² execution substrate |

These are planned counts, not observations. Improvement-loop task IDs are objective slots; actual held-out casebook fixtures remain unbound. Native conformance includes no-tools, success, refusal, injection, redaction, budget, cancel, crash, tool error, resume, tamper, child identity and unsupported scenarios. Existing source fixtures do not cover every requested scenario for every target. Human usability and platform lanes require distinct collection and qualification; neither can borrow conformance or coding outcomes.

Harness² orchestrates an execution substrate. Do not treat it as a standalone coding agent or feed improvement-loop evidence into the native task comparison. Before that cohort can run, pin its substrate, runtime/dependency/model identities, signed immutable baseline/candidate bytes, held-out task/oracle partition, permissions/environment and proposer/executor/judge identities. Predeclare equal search/evaluation budgets, stopping and exclusion rules. Preserve unchanged baseline eligibility. The preparer refuses a task-runner substitution for this cohort. WP06 owns architecture runner wiring; this package adds no executor or simulated fallback.

## Read-only dry run

After the normal Node 22 build, the campaign API performs file reads only:

```sh
node --input-type=module - <<'JS'
import { checkComparisonCampaign } from './dist/benchmarks/comparisonCampaign.js';
console.log(JSON.stringify(checkComparisonCampaign('qualification/wp29-campaign/native-conformance.v1.json'), null, 2));
JS
```

A blocked plan returns reasons and `prepared-not-executed`. A bound plan calls the existing `checkHarnessComparison` to validate every pinned artifact, fixture, adapter, oracle and command input, exact environment and declared binding. It previews the existing runner's serial order without constructing an executor, installing packages, creating output directories or writing results. No ambient provider credentials are read. Named credentials, working listeners, containment, effective permissions, build-to-source identity and actual model serving need separate evidence. `analysisOnly: true` omits only credential-presence requirements for archived analysis; it is not an execution readiness grant (`credentialsChecked: false`).

H2X-21 was already implemented by `amc bench harness-compare --check` / `--dry-run` at base `168cec133`. This package reuses that path. The normal runner still requires its execution opt-ins and an exclusive new results directory. No CLI command or Studio route is added.

## Repetition, ordering and evidence admission

Every task has the same declared repetition count and target population. The runner rotates target order by repetition; complete cycles balance each target's position. Six repetitions give two complete rotations for three targets and three for two. This is deterministic rotation, not randomization or task-order balancing. The plan requires at least three repetitions and complete cycles. Do not call one repetition stable.

Freeze the preparation output's `campaignSha256` before any trial and supply it as `expectedCampaignSha256`; changing analysis policy or omitting that frozen identity invalidates the cohort. This is a local preregistration binding, not an authenticated signature.

Analysis admits only the pinned manifest's exact target/task/lane/configuration identities and actual rotation order. Duplicate IDs, duplicate slots, extra slots, changed model/permissions/budgets, changed file pins, environment mismatch or malformed receipts invalidate the cohort. Missing slots remain explicit missing attempts. Unavailable, interrupted, unsupported, unscored or non-model arms cannot become passes or competitor failures.

`analyzeComparisonCampaign({ campaignPath, expectedCampaignSha256, report, evidence })` returns report/sidecar input digests and a machine-readable CI decision (`status`, `passed`, `reasons`) and the existing summary's sample counts, unknown counts, costs, cache coverage, interventions, failure timings and environment limits. Behavioral rates and Wilson intervals are withheld for incomplete target/task repetitions. Pairwise headline differences and intervals are withheld if any task lacks a complete matched repetition set. Recorded failures remain visible; none are silently excluded.

The outcome metric is all-pass points: a qualified pass is 100 and a qualified failure is 0. Repetitions are averaged within each task, then the shared paired bootstrap resamples task means with `deterministicSeed([campaignId, baselineId, candidateId])` and the existing 1,500-draw default. `pairedTasks` is the number of independent task clusters, not the number of repeated attempts. Shared WP05/07 `evaluateExperimentGate` applies the predeclared sample, uplift, cost, regression and interval policy. Requested cost gates remain inconclusive when any attempted arm lacks usage/cost or there are no successes. Behavioral gates read the Wilson lower bound, not an optimistic point rate. The supplied 0.5 lower-bound threshold is a preparation policy for the small cohorts, not production red-team acceptance.

Analysis rechecks pinned inputs at analysis time, so immutable retained copies are required. A later local mutation invalidates that cohort even if an older report claimed success. Original execution digests and exact evaluated output artifacts remain in the existing runner receipts. Scripted adapter/oracle tests prove collection and contract behavior only.

## Installation baseline and actual component use

The versioned `comparison-campaign-evidence/1` sidecar is bound to the exact manifest digest, run start time and a unique retained `trialId`, with `source: adapter-observation` and an evidence reference. The strict runner observation schema and semantics are unchanged; sidecars are separate inputs to campaign analysis.

For code tasks, an authorized adapter captures `captureCampaignWorkspace(root)` **after** installing/staging harness files and **before** invoking the solver. Capture again after solver completion. Submit both as `workspace: { baseline, after }`. `diffCampaignWorkspace` returns sorted added/changed/deleted relative paths and before/after content digests. Installation alone produces an empty measured diff; solver changes to harness files remain measured. An empty or missing baseline cannot be synthesized from a final snapshot. Inventories are content references, not retained file bytes or a unified patch; keep the independent oracle's exact evaluated bytes using the existing output-snapshot facility. Capture requires stopped filesystem writers; it is not an atomic snapshot under concurrent hostile mutation. The snapshot is bounded to 256 regular files and 4 MiB, refuses symlinks/special files, and omits only the root `.git` directory. Larger repositories need an explicitly reviewed capture scope before use.

Record `componentsUsed` from the actual session stream, with each instruction/skill/tool ID, kind and evidence reference. Configuration or installation presence is not evidence of use. `null` is unknown; `[]` explicitly records no observed use. Analysis reports observed and unknown trial counts plus per-component trial counts. Missing required workspace/component evidence blocks the campaign decision.

The existing report does not carry complete proposer/executor/judge usage or a human-study dataset. Those measurements remain unavailable; target totals cannot establish per-role costs or human usability.

These sidecars are attributed declarations. They are not signed execution timestamps, model attestations or proof of independent observation. The current native/coding adapters do not emit them; adapter integration belongs to the runner owner. Until that integration is reviewed, code cohorts requiring them remain inconclusive. This package leaves their use reviewable through stub trials and snapshot tests without changing another lane's runner.

## Reconciliation and remaining ownership

AMC-1518's retained P0-30 outcome is `BOUNDED_ORIGINAL43_AND_TWO_SOURCE_CONTROLS_INDEPENDENTLY_REVIEWED`, with `formalAcceptanceClosed: false` (`qualification/2026-10-15-P0-30/outcomes.json`). Its bounded runner/mutation receipts do not qualify current external artifacts or real models. The P1-47 pilot README records no real-model trial: 100 scripted debug attempts (48 pass, 52 fail) and 300 unavailable live-without-credential attempts. This package reuses existing manifests, materializers, task files, output snapshots, runner and stats rather than duplicating those facilities or relabeling historical evidence.

H2X-24/26 remain with the completed H2X lane. H2X-31/43 gain campaign preparation helpers and offline analysis; production adapter emission is deferred. AXE-02/36 gain campaign-level inconclusive-aware gating and repeated, balanced receipt analysis. Their underlying `runRedTeam` / `runAssurance` repetition knobs, red-team signing through admitted async signing providers, and persisted verified `runRedTeamCiGate` receipt remain deferred outside campaign ownership. This analysis is unsigned and always returns `promotionAllowed: false`; no new signing scheme or alternative promotion authority is introduced.
