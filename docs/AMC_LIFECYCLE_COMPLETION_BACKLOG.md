# AMC Lifecycle Completion Backlog

Status: active implementation tracker, created from the May 2026 source-aware AMC gap audits.

This document is the repo-local companion to Linear project `AMC Lifecycle Completion` and master issue `AMC-452`. It is written with AMC-native names only. Do not add external research-source or project names to this file, public docs, README, website copy, CLI help, or Studio UI.

## Product Rule

AMC must feel simple while staying feature rich.

The default user path is:

```bash
amc
```

That command should detect the workspace, guide setup only when needed, run the full score, write evidence, show the result, and point users to Studio and reports. Fast pulse checks can remain available as explicit advanced or legacy commands, but they must not be the primary onboarding promise.

## Existing Surfaces To Extend

All implementation must improve existing AMC surfaces instead of creating competing product names.

| Surface | Promise | Completion focus |
| --- | --- | --- |
| Score | Score trust before you ship | full-score default, evidence-backed findings, confidence metadata |
| Shield | Attack your agent before attackers do | live allow/warn/block decisions, authorized security confirmation |
| Enforce | Wrap agent actions in policy | mutation gates, route/tool policy checks, validation before commit |
| Vault | Cryptographically prove what happened | lifecycle artifact signing, manifest digests, commit/rollback receipts |
| Watch | See trust drift before it hurts you | runtime event store, trace index, monitor receipts |
| Comply | Map trust evidence to real frameworks | domain-pack entitlement, compliance mapping, audit binder outputs |
| Fleet | Govern many agents like an actual platform | parent/child lifecycle runs, graph/fleet evidence, cascade failure analysis |
| Passport | Make trust portable between environments | redacted claim proof, lifecycle export, public report proof links |

## Implementation Rules

- Extend existing modules; do not rewrite scoring, diagnostics, assurance, vault, monitoring, fleet, passport, compliance, domain packs, or Studio.
- Use AMC-native names in public code, docs, CLI output, Studio, README, and website.
- Do not add external source/project names from the research bundle to public-facing surfaces.
- Preserve the 8 AMC surfaces as the user-facing mental model.
- Persist evidence and receipts for every important lifecycle decision.
- Every issue must have deterministic tests or smoke verification.

## P0: Product Spine

### AMC-453: Canonical AMC lifecycle run artifact

Gap: AMC has many strong primitives, but one user run is still spread across separate outputs. Users and Studio need one durable object proving what happened.

Extend:
- `src/unified/unifiedRun.ts`
- `src/loop/loop.ts`
- `src/lifecycle/lifecycle.ts`
- diagnostics and scoring modules
- Vault, ledger, notary, transparency, Passport exports
- Studio run detail APIs and views

Implement:
- Add a `LifecycleRun` or `EvolutionRun` type.
- Store run id, workspace, agent id, command source, lifecycle stage, timestamps, Score/Shield/Enforce/Vault/Watch/Comply/Fleet/Passport summaries, evidence episode ids, Enforce resource manifest ids, policy decisions, receipts, report paths, export paths, and verification status.
- Add JSON schema and stable TypeScript types.
- Persist one lifecycle artifact for each full `amc` and `amc run` invocation.
- Add redacted export mode.
- Make Studio load this artifact instead of recomputing state.

Done when:
- every full run produces one lifecycle artifact;
- every surface is represented, even when skipped or degraded;
- Studio and CLI can inspect the same artifact;
- Vault and Passport can use it as the proof root.

### AMC-454: EpisodeRecord evidence for every run

Gap: traces, diagnostics, scores, and receipts are not tied together by one durable per-run evidence object.

Extend:
- trace ingestion;
- diagnostic output writers;
- Vault and Passport exports;
- Studio evidence views.

Implement:
- Add `EpisodeRecord` for one observed run or eval episode.
- Capture episode id, lifecycle run id, agent id, workspace, timestamps, raw trace refs, distilled evidence refs, metrics, failure classes, policy decisions, evaluator ids, score deltas, resource manifest ids, and receipt refs.
- Store raw trace refs separately from distilled evidence.
- Add redaction and retention controls.
- Add CLI inspection for listing, inspecting, and exporting episodes if no equivalent exists.
- Link Studio findings to their episode.

Done when:
- every full score has at least one episode;
- findings can trace back to evidence;
- exports are redacted and reloadable without rerunning the agent.

### AMC-455: Enforce resource manifest registry, diff, verify, and rollback

Gap: prompts, tools, routes, memory policy, evaluators, environment, code, and graph resources are not represented through one signed, diffable manifest.

Extend:
- Enforce resource discovery;
- prompt/tool/model route/memory/env/evaluator/code config modules;
- Vault signing and rollback receipts;
- Studio resource inspector.

Implement:
- Add an Enforce-owned resource manifest.
- Support resource kinds: prompt, agent config, tool, middleware, memory policy, environment, graph, evaluator, code artifact, and model route/policy.
- Include resource id, kind, path/ref, digest, owner, version, schema, dependencies, allowed mutation surface, rollback pointer, last verified eval, and lifecycle stage.
- Add snapshot, list, inspect, diff, verify, and restore APIs.
- Add CLI commands around `amc enforce resources`.
- Attach manifest ids to lifecycle runs and episodes.

Done when:
- resource versions are provable across runs;
- diffs identify exactly what changed;
- restore only touches manifest-covered resources.

### AMC-456: One-command full-score path with first-result SLA

Gap: the intended default path is `amc`, but docs and some helper text still imply users should start with legacy fast checks or setup subcommands.

Extend:
- `src/cli.ts`;
- setup/onboarding modules;
- full diagnostic/scoring path;
- README, website, docs, and Studio first-run copy.

Implement:
- Bare `amc` detects the workspace/agent and runs full score.
- Missing config opens guided setup or demo mode instead of crashing.
- Define first-result timing in the lifecycle artifact.
- Use cached evidence only with clear freshness metadata.
- Print a clear result with evidence/report/Studio next steps.

Done when:
- a fresh user can run `amc` without reading docs first;
- first full result is instant when cached and targeted below two minutes on a standard local first run;
- fast pulse checks are optional, not primary.

### AMC-457: Simple onboarding wizard across CLI and Studio

Gap: setup pieces exist, but the first-use flow is not yet one shared model across CLI and Studio.

Extend:
- CLI setup and quick setup modules;
- product onboarding wizard;
- Studio setup routes;
- config persistence.

Implement:
- One wizard model: detect project, choose agent/source, choose provider or demo, run full score, show report/evidence, open Studio.
- Persist wizard state and resume if interrupted.
- Support skip, demo, advanced config, and existing config import.
- Keep language plain and avoid long technical explanations.

Done when:
- CLI and Studio use the same steps;
- users can complete first run or demo without manual setup;
- repeated runs do not ask completed questions again.

### AMC-458: Studio lifecycle parity

Gap: Studio must be a state-of-the-art control plane for the same lifecycle users run from CLI.

Extend:
- Studio server routes and APIs;
- Studio frontend assets;
- LifecycleRun, EpisodeRecord, manifests, receipts, Passport exports;
- public website visual language.

Implement:
- Lifecycle command center with run status, score, 8-surface health, evidence, manifests, policy decisions, receipts, and next actions.
- First-run onboarding panel.
- Evidence drill-down from finding to episode to resource to recommendation.
- Resource manifest inspector with diff/verify/restore states.
- Domain pack paywall and entitlement view.

Done when:
- Studio can start or inspect the same run created by `amc`;
- every important CLI lifecycle object is visible in Studio;
- desktop and mobile layouts are usable and polished.

### AMC-459: Finding proof contract

Gap: each major finding needs a proof chain, not only a score and recommendation.

Extend:
- score and diagnostic result models;
- recommendation/report generators;
- Vault and Passport exports;
- Studio finding details.

Implement:
- Add a `FindingProof` contract.
- Include finding id, surface, severity, score impact, evidence episode ids, resource manifest ids, policy ids, recommendation ids, confidence, uncertainty notes, and proof refs.
- Mark weakly supported findings as unverified.
- Add redacted proof links to reports.

Done when:
- major findings have evidence and recommendation ids;
- reports and Studio can trace finding -> evidence -> resource -> recommendation.

### AMC-460: Public docs, website, README, and Obsidian drift cleanup

Status: implemented locally on 2026-05-22. Drift checks now run through `npm run check:docs-drift`.

Gap: public docs still contain stale first-run paths and fast-check-first language.

Extend:
- README;
- website docs;
- CLI help examples embedded in docs;
- internal knowledge notes used for operating AMC.

Implement:
- Make `amc` the first and simplest install/run path.
- Present fast pulse checks only as optional legacy/advanced usage.
- Keep all 8 surfaces represented in docs.
- Document domain-pack pricing and entitlement accurately.
- Add grep checks for stale primary command examples and forbidden source names in public docs.

Done when:
- README and website first-run docs match CLI behavior;
- public docs use AMC-native language;
- Obsidian/internal notes reflect the current lifecycle plan.

### AMC-461: Industry domain pack entitlement verification

Gap: 40+ industry domain packs must be ready for real users with a clear monthly paywall and CLI/Studio parity.

Extend:
- domain pack registry and entitlement;
- CLI domain pack commands;
- Studio domain pack UI;
- website pricing docs.

Implement:
- Confirm all packs are discoverable and grouped.
- Enforce entitlement before premium content is used.
- Support locked preview, checkout, activation, verification, restore, and offline states.
- State that $9.99/month unlocks all industry domain packs.
- Ensure full `amc` can recommend a domain pack without bypassing the paywall.

Done when:
- CLI and Studio show locked/unlocked status;
- locked packs cannot be used without entitlement;
- docs and website pricing are consistent.

### AMC-462: Commit, rollback, and monitoring receipts

Gap: improvements need explicit receipts from proposal through validation, commit, rollback, and monitoring.

Extend:
- lifecycle/loop orchestration;
- transform and upgrade planning;
- Vault, ledger, notary, transparency exports;
- Watch monitoring.

Implement:
- Add proposal, validation, commit, rollback, and monitor receipt types.
- Attach receipts to lifecycle runs, episodes, and manifests.
- Require policy/eval checks before accepted commit receipts.
- Point rollback receipts to exact prior manifests.

Done when:
- accepted changes have receipts and rollback pointers;
- failed validation blocks commit and records why.

### AMC-476: Component, experience, and decision observability

Status: implemented locally on 2026-05-22. The lane stays under Score, Watch, and Vault rather than introducing a ninth product surface.

Gap: evidence, reports, plans, monitoring, and lifecycle primitives exist, but component behavior, user/agent experience, and decision quality are not yet tied together as one required observability lane.

Extend:
- score and diagnostic result models;
- Watch trace ingestion;
- Mechanic plans and recommendations;
- lifecycle artifacts and EpisodeRecord storage;
- Vault and Passport receipts;
- Studio evidence views.

Implement:
- Decision receipts for material recommendations, harness changes, repair proposals, optimizer candidates, and lifecycle gates.
- Predicted outcome, observed outcome, falsification window, confidence, component/resource ids, evidence refs, rollback pointer, and owner.
- Experience corpus distilled from traces, failed evaluations, user actions, support-style observations, and Studio/CLI run events.
- Component-level attribution for prompts, tools, routes, policies, memory, evaluators, and code artifacts.

Done when:
- each major recommendation can show prediction, evidence, and later observed outcome;
- decision receipts are linked to lifecycle artifacts and episodes;
- Studio can show decision history without complicating first-run onboarding.

### AMC-477: Governed resource lifecycle protocol

Gap: manifests and receipts need one resource protocol for listing, snapshotting, diffing, validating, proposing, applying, restoring, and rolling back agent-defining objects.

Extend:
- Enforce resource manifest registry;
- lifecycle receipt writers;
- Vault/notary/signature modules;
- prompt, tool, route, memory, policy, guardrail, evaluator, dataset, schema, and environment config modules;
- Studio resource inspector.

Implement:
- Neutral resource actions: list, get, snapshot, diff, validate, propose, evaluate, apply, restore, rollback, history, and contract.
- Resource lineage: id, kind, owner, digest, mutable flag, parent version, current version, dependencies, last evaluation, validation status, rollback target, and evidence refs.
- Dry-run mutation flow and policy gates for unsafe resources, missing owners, unverified changes, untested updates, and rollback failures.

Done when:
- resource mutations create manifest diffs, validation results, and signed receipts;
- rollback can restore a prior version or explain why it cannot;
- lifecycle artifacts show active resource versions for each score.

### AMC-479: Fleet-wide instant full-score SLA

Gap: the instant full-score promise must apply consistently to one agent and many agents without falling back to fast pulse checks.

Extend:
- top-level CLI and unified run path;
- fleet/org scoring and aggregation;
- lifecycle artifact and EpisodeRecord writers;
- Watch/runtime event stream;
- Studio live fleet views;
- setup/onboarding auto-init behavior.

Implement:
- Score SLA contract for first full diagnostic result per agent, targeted below two minutes.
- Progressive fleet result states: queued, initialized, scoring, scored, lifecycle-continuing, failed, skipped, and complete.
- Same full-score model and artifact references for every agent.
- Concurrency controls, provider/rate-limit handling, and structured partial failure summaries.

Done when:
- multiple configured agents can be scored with one command;
- each agent records first-result time, score, confidence, evidence refs, lifecycle artifact path, duration, and status;
- Studio and CLI use the same artifacts.

### AMC-480: One primary command with normalized advanced command map

Gap: AMC must stay simple while exposing deep lifecycle controls. Advanced commands should exist, but the required user mental model should remain `amc`.

Extend:
- CLI command registration and help output;
- setup/onboarding wizard;
- unified and lifecycle run paths;
- README, docs, website, and generated command inventory;
- Studio action equivalents.

Implement:
- Keep `amc` as the primary path: auto-init, full score, artifacts, next actions.
- Normalize advanced lifecycle commands around existing AMC modules.
- Ensure advanced commands call shared engines for lifecycle, loop, harness, fixer, evidence, memory, graph, proof, fleet, and org workflows.
- Generate command inventory from source and add docs/help tests for representative examples.

Done when:
- a fresh user can succeed with only `amc`;
- advanced commands are discoverable but not required for onboarding;
- every documented command exists in CLI help and has smoke or help-example coverage.

## P1: Intelligence Loop

### AMC-451: Runtime Firewall protection mode

Status: implemented locally on 2026-05-22. Runtime Firewall is an Enforce/Shield/Watch capability, with Vault-signed decision artifacts and Comply-safe redacted exports. It does not add a ninth AMC surface.

Gap: runtime protection needs one understandable mode users can enable for live agent traffic.

Extend:
- Bridge and gateway hooks;
- Shield and Enforce policies;
- Watch events and monitoring;
- Studio live dashboard.

Implement:
- Runtime mode that observes, scores, warns, blocks, or allows interactions.
- Redacted decision exports.

Implemented locally:
- `src/runtime/firewall.ts` owns the policy, deterministic rules, signed decision event store, status, redaction, and JSON/JSONL/Splunk export.
- `amc firewall enable|disable|status|check|events|export` exposes the workflow in the CLI.
- `/api/v1/firewall/status|enable|check|events|export` exposes the same workflow to Studio and automation.
- Bridge request and response hooks evaluate live traffic and emit `allow`, `warn`, or `block` decisions with request id, run id, receipt id, receipt hash, event path, and signature path.
- Studio `/console/firewall` provides mode selection, payload preview, decision history, and SIEM export.

Done when:
- CLI and Studio can enable Runtime Firewall and inspect the same decisions;
- Bridge traffic receives allow/warn/block decisions with reasons;
- decisions link to request/run ids and signed receipt hashes;
- missing policy fails closed when required;
- redacted exports do not leak local paths or sensitive previews.

### AMC-468: Runtime event store and run manager

Status: implemented locally on 2026-05-22. Runtime Runs are a Watch/Gateway/Fleet state lane, linked to Runtime Firewall policy decisions and lifecycle artifacts without adding a ninth product surface.

Gap: runtime decisions now exist, but connected-agent run state still needs a generic run manager across stages.

Extend:
- Runtime Firewall decision store;
- Watch events and monitoring;
- lifecycle artifacts and EpisodeRecord storage;
- Studio live dashboard.

Implement:
- Persistent event store for run started, stage changed, trace received, score updated, policy decision, alert, receipt written, candidate proposed, commit/rollback, and run completed.
- Run manager APIs for create, resume, inspect, cancel, degraded, and complete.
- `src/runtime/runManager.ts` stores signed run state and event artifacts under each agent's `.amc` root, with redacted payload previews and JSON/JSONL exports.
- `/api/v1/runtime/status|runs|events/export` and `amc runtime status|create|list|inspect|event|resume|cancel|degrade|complete|export` expose the same persisted state.
- Studio `/console/runtime` shows live run state, recent events, and operator controls for trace, degrade, and complete.
- Runtime Firewall decisions append `policy.decision` events when a run id is present, carrying episode and receipt links.
- Lifecycle run artifacts include runtime run summaries in Watch evidence.

Done when:
- CLI and Studio read the same live run state;
- runtime events can be inspected by run, agent, stage, and receipt id;
- incomplete or degraded runs are explicit and resumable.

### AMC-463: Trace index and failure-mode miner

Status: implemented locally on 2026-05-22. Trace failure indexing is a Watch/Score evidence feature with redacted Studio/API/CLI views and repair-consumable failure classes.

Gap: raw traces need searchable, ranked failure clusters that feed scoring and repair.

Extend:
- trace ingestion;
- diagnostics;
- EpisodeRecord storage;
- Studio evidence views.

Implement:
- Index traces by run, episode, agent, tool/model, lifecycle stage, timestamp, outcome, policy decision, score impact, and failure class.
- Classify tool misuse, invalid schema, unsupported claim, unsafe action, timeout, retrieval error, memory error, orchestration dead-end, and policy violation.
- Rank recurring failures by impact.
- Store raw trace refs separately from distilled index metadata.
- Attach the trace failure index ref to EpisodeRecord when full-score evidence has trace refs or failure classifications.
- Expose redacted index and cluster views through `amc trace index`, `amc trace failures`, `/api/v1/evidence/trace-indexes`, `/api/v1/evidence/failure-clusters`, and Studio Evidence.

Done when:
- full runs build a trace index;
- findings link to redacted evidence snippets;
- repair workflows can consume failure classes.

### AMC-464: Fixer and root-cause analysis lane

Status: implemented locally on 2026-05-22. Fixer RCA is a Watch -> Enforce repair lane: trace failure indexes become root-cause reports, regression tests, rollback-aware proposals, validation receipts, CLI/API access, and Studio Evidence visibility.

Gap: diagnostics need a governed path to safe proposed fixes with regression preservation.

Extend:
- diagnostic/recommendation engine;
- auto-test generation and eval harness;
- resource manifests and receipts;
- trace/failure miner.

Implement:
- Normalize agent calls for validator input.
- Add validators for schema, tool call correctness, evidence citation, policy conformance, latency, refusal/over-action, and output quality.
- Classify likely cause, affected resource kind, confidence, and evidence refs from each failure cluster.
- Generate regression tests before proposing a patch.
- Limit fixes to allowed Enforce mutation surfaces.
- Require rollback pointers for proposed patches and block validation when mutation safety gates fail.
- Expose reports through `amc mechanic rca run|list|show`, `/api/v1/fixer/rca`, and Studio Evidence.

Done when:
- failures produce RCA output with likely cause, affected resource, confidence, and suggested test;
- unsafe mutation surfaces are rejected;
- each proposed fix has regression tests, expected score impact, and rollback evidence before it can pass validation.

### AMC-465: Governed optimizer

Status: implemented locally on 2026-05-22. Experiments now include a governed optimizer lane that turns Fixer RCA proposals into isolated candidate workspaces, search/held-out validation splits, leakage checks, Pareto ranking, candidate receipts, CLI commands, and Studio visibility without mutating live Enforce resources.

Gap: experiments need candidate workspaces, held-out validation, leakage checks, and Pareto comparison before any commit.

Extend:
- experiment runner;
- eval harness;
- lifecycle loop;
- resource manifests;
- policy gates.

Implement:
- Candidate workspaces for proposed changes.
- Search and held-out validation split.
- Candidate ranking by score gain, risk, cost, latency, confidence, and regression impact.
- Leakage checks.
- Commit only through receipt.
- Expose optimizer runs through `amc experiment optimize|optimizer-list|optimizer-show` and Studio Experiments.

Done when:
- candidates do not mutate live resources before validation;
- accepted/rejected candidates have receipts and clear reasons.

### AMC-466: Gated reasoning memory writeback

Status: implemented locally on 2026-05-22. Memory now has a governed reasoning writeback lane from EpisodeRecords with evidence gates, redaction, dedupe/merge, expiry/review timestamps, allowed consumers, lifecycle writeback receipts, API/CLI retrieval, and Studio Evidence inspection.

Gap: successful and failed runs should produce governed lessons without poisoning memory.

Extend:
- memory/correction modules;
- EpisodeRecord and trace miner;
- policy gates;
- lifecycle receipts.

Implement:
- Reasoning memory item schema with source episode, lesson type, summary, evidence refs, affected resource, confidence, expiry, privacy class, and allowed consumers.
- Evidence-required writeback with redaction, dedupe, and expiry.
- Retrieval API for scoring, recommendations, fixer, and Studio.
- CLI and API access through `amc memory writeback|retrieve|show` and `/api/v1/memory/reasoning`.
- Studio Evidence panel for writing and inspecting reasoning memory items.

Done when:
- only evidence-backed lessons are stored;
- sensitive raw trace content is not copied into memory.

### AMC-467: Confidence, uncertainty, and decisiveness controls

Status: implemented locally on 2026-05-22. Diagnostic findings now carry confidence controls for evidence sufficiency, contradiction risk, judge agreement, decisiveness risk, uncertainty level, downgrade status, and auto-fix eligibility. Reports explain uncertainty in plain language, recommendations include auto-fix gates, and Studio Diagnostic cards can filter low-confidence or high-risk findings.

Gap: findings and recommendations need confidence metadata so unsupported claims are not over-presented.

Extend:
- score and diagnostic models;
- LLM judge/evaluator modules;
- reports;
- Studio finding filters.

Implement:
- Confidence and uncertainty metadata on findings and recommendations.
- Evidence sufficiency, contradiction risk, judge agreement, and decisiveness risk.
- Thresholds for auto-propose vs manual review.
- Markdown report sections and Studio filters for low-confidence/high-risk findings.

Done when:
- low-evidence findings are visibly downgraded;
- low-confidence recommendations cannot auto-fix.

### AMC-469: Fleet lifecycle evidence spine

Status: implemented locally on 2026-05-22. Fleet scoring now writes a parent fleet lifecycle artifact that links child agent lifecycle runs, fleet aggregate risk, shared/per-agent resource manifests, topology, and cross-agent cascade failures. Studio and CLI inspect the same artifact.

Gap: fleet runs need the same lifecycle evidence model as single-agent runs.

Extend:
- fleet/org runner;
- lifecycle models;
- score aggregation;
- Studio fleet views.

Implement:
- Parent fleet lifecycle run with child agent run ids.
- Fleet-level score and risk summary.
- Cross-agent cascade failure detection.
- Shared and per-agent resource manifests.
- `src/fleet/fleetLifecycle.ts` owns parent artifact construction, cascade classification, redaction, signing, list, and load.
- `amc fleet lifecycle list|show` and `/api/v1/fleet/lifecycle` expose parent/child evidence.
- Studio `/console/fleet` shows parent runs, topology, shared manifest ids, and cascade failures.

Done when:
- fleet assessment creates parent/child evidence;
- cross-agent failures are scored separately from single-agent failures.

### AMC-478: Autonomous org runner

Status: implemented locally on 2026-05-22. The runner is an advanced Fleet workflow with Enforce gates, Watch heartbeats, Vault-signed artifacts, and lifecycle evidence. It does not add a ninth product surface and is not required for the default `amc` first-run path.

Gap: fleet/org primitives and the 70-role operating model need a productized autonomous org runner that coordinates role agents safely without bloating normal onboarding.

Extend:
- fleet/org runner;
- lifecycle artifacts and EpisodeRecord storage;
- Watch/runtime event store;
- Vault receipt signing;
- Studio fleet/org views;
- AMC_OS handoff/inbox conventions where appropriate.

Implement:
- Org run model with parent run id, role id, role workspace, role scope, public state refs, private grader state refs, handoff refs, heartbeat policy, plateau detection, and approval gates.
- Isolated role workspaces or equivalent protection so role agents do not overwrite each other or unrelated user changes.
- Public/private state separation and heartbeat triggers for recurring review, stalled work, failing gates, and scheduled lifecycle continuation.
- Per-role outputs as EpisodeRecord-linked evidence rolled up into a parent lifecycle artifact.

Done when:
- role outputs are isolated and traceable back to role id, run id, resource version, and evidence refs;
- heartbeats and plateau behavior are auditable;
- org mode remains an advanced option, not a first-run requirement.

Implemented:
- `src/org/orgRun.ts` defines the 70-role registry, org-run artifact, role scopes, public/private state refs, private grader state, handoff refs, heartbeat policy, plateau detection, and approval gates.
- `amc org roles`, `amc org run`, `amc org runs`, and `amc org inspect --redacted` expose the advanced workflow without changing the top-level `amc` path.
- `/api/v1/org/*` and Studio `/org/runs` expose role status, handoffs, blocked gates, receipts, lifecycle refs, and rollback refs.
- Each role writes an isolated workspace, an EpisodeRecord, and a child lifecycle artifact; the parent org run rolls child evidence into a parent EpisodeRecord and lifecycle artifact.

### AMC-470: Assessment question expansion

Status: Done. Added `amc-lifecycle-2026-v1` as an explicit opt-in question set with 20 new questions across lifecycle governance, harness resources, evidence binding, typed multi-agent systems, trace/repair, proof exports, reasoning memory, uncertainty controls, runtime gateway/watch, and fleet/org operation. Default scoring stays on `amc-legacy-240-v1`; Industry Pack weighting is applied only when the paid entitlement is active.

Gap: the maturity model should include lifecycle governance, harness resources, evidence binding, typed graph, trace/repair, proof exports, memory, uncertainty, runtime, and fleet coverage.

Extend:
- question registry;
- diagnostic scoring;
- surface/domain mappings;
- reports;
- domain overlays.

Implement:
- Version new question groups.
- Map every new question to surfaces and layers.
- Preserve backwards-compatible scoring where possible.
- Keep domain-pack weighting behind entitlement.

Done when:
- new dimensions are scored and documented without breaking existing fixtures.

## P2: Advanced Runtime

### AMC-471: Typed multi-agent graph schema - Done

Gap: fleet and multi-agent workflows need typed graph validation.

Extend:
- fleet/org runner;
- resource manifests;
- policy checks;
- Studio graph view.

Implement:
- Nodes, edges, roles, tools, inputs/outputs, memory scopes, policies, permissions, and invariants.
- Pre-run validation for missing contracts, unsafe permissions, circular dependencies, and unbounded fan-out.
- Graph digest in manifests and lifecycle runs.

Done when:
- invalid graphs fail with actionable errors;
- graph risks can affect fleet scoring.

Delivered:
- Added a typed graph schema for nodes, edges, roles, tools, inputs/outputs, memory scopes, policies, permissions, and invariants.
- Added CLI and API graph write/show/list/validate flows, with validation for missing contracts, unsafe permissions, cycles, and fan-out.
- Attached canonical graph digests to Enforce resource manifests, fleet lifecycle evidence, Studio graph inspection, and fleet score reports.

### AMC-472: Controlled exploit confirmation lane - Done

Gap: security confirmation needs authorization gates and safe proof.

Extend:
- Shield security modules;
- policy gates;
- Vault receipts;
- Studio security findings.

Implement:
- Authorization scope with target ownership, allowed techniques, time window, safe mode, and reviewer approval where required.
- Confirmation tasks only when scope permits.
- Safe evidence storage and redacted exports.

Done when:
- confirmation cannot run without explicit scope;
- exports include safe proof, not exploit instructions.

Delivered:
- Added signed authorization scopes with target ownership, allowed techniques, time windows, safe mode, reviewer approval requirements, and raw-payload persistence disabled.
- Added fail-closed confirmation runs that block missing/expired/ambiguous scope and write receipts for scope authorization, requested, blocked, safe replay, and completed states.
- Added redacted safe proof artifacts and exports that carry hashes, signal refs, evidence refs, and receipts without exploit instructions.
- Added Shield API, CLI, and Studio Assurance visibility for controlled confirmation status.

### AMC-473: Framework-neutral importers

Gap: AMC needs neutral importers that map common traces, runs, memory, workflow graphs, configs, evaluator outputs, and benchmark results into AMC evidence models.

Extend:
- integrations/adapters;
- trace ingestion;
- EpisodeRecord creation;
- resource manifests;
- Studio import flow.

Implement:
- Generic importer contract: detect, parse, normalize, validate, redact, persist.
- Dry run, validate, import, and rollback.
- Unsupported-format errors that are actionable.

Done when:
- representative fixtures import into episodes/manifests/lifecycle runs;
- public docs describe importers generically.

Delivered:
- Added a neutral importer contract with detect, validate, dry-run, import, and rollback modes for traces, event logs, run directories, workflow graphs, agent configs, memory stores, evaluator outputs, and benchmark results.
- Imported artifacts are normalized and redacted before persistence, with sensitive-looking values replaced before writing AMC artifacts.
- Import runs write EpisodeRecord, LifecycleRun, Enforce resource manifest, and Watch trace failure index evidence when traces are present.
- Added `amc import <path>`, `amc imports list|show|rollback`, Studio Evidence import controls, and `/api/v1/imports` endpoints.

### AMC-474: Inference strategy comparison and routing receipts

Gap: route/model changes need score, cost, latency, safety tradeoff proof and reversible receipts.

Extend:
- model route/policy modules;
- eval/judge engines;
- lifecycle receipts;
- Studio comparison views.

Implement:
- Strategy record for model, provider, prompt/resource version, settings, tool policy, cost, latency, score, risk, and evidence refs.
- Held-out comparison where possible.
- Policy-gated auto-route changes.

Done when:
- strategy recommendations include evidence and confidence;
- route changes are manifest-backed and reversible.

Delivered:
- Added inference strategy records for model, provider, prompt version, settings, tool policy, score, cost, latency, risk, confidence, and evidence refs.
- Added deterministic comparison ranking and plain-language tradeoff summaries.
- Added policy-gated route commits that block without approval, write receipts, update `model-routes.json`, attach Enforce resource manifests, and support rollback.
- Added `amc strategy compare|list|show|rollback`, `/api/v1/strategy` routes, and Studio Evidence visibility for recent strategy comparisons.

### AMC-475: End-to-end release gate

Gap: AMC needs one release gate proving CLI, Studio, website, docs, domain packs, and deploy health before ship.

Extend:
- package/build scripts;
- CLI and Studio startup;
- website build/deploy path;
- docs examples;
- domain pack entitlement;
- CI/release checks.

Implement:
- Deterministic release checklist/script.
- Fresh install, first-run onboarding, full score, report/evidence artifact, Studio routes, domain pack locked/unlocked states, docs examples, website build, public naming grep, and live health checks where credentials permit.

Done when:
- broken full-score path, broken Studio route, broken build, broken domain entitlement, or public docs drift blocks release.

Delivered:
- Added `npm run release:gate` backed by `scripts/release-gate.mjs`.
- Gate writes a JSON release receipt and remediation list to `.amc/release-gate/latest.json` by default or `--out <path>`.
- Gate covers Studio JS syntax, OpenAPI parse, TypeScript, release-critical tests, build, CLI command inventory, docs drift/public naming, CLI startup, domain pack catalog smoke, and optional live health via `AMC_RELEASE_GATE_LIVE_URL`.
- Added quick mode for local preflight and non-quick mode for release-critical tests.

### AMC-481: Deferred telemetry-only advanced research scope

Status: implemented locally on 2026-05-23. This remains a scope guardrail, not a product surface. Generic collaboration records can be imported only as telemetry-only runtime events linked to EpisodeRecord and LifecycleRun evidence.

Gap: one advanced research direction is intentionally outside current AMC product scope unless AMC later enters model-training or latent-state runtime territory. It needs a clear guardrail so the team does not overbuild or publish confusing claims.

Extend:
- internal roadmap notes;
- EpisodeRecord, lifecycle artifact, trace index, and runtime event store only if generic telemetry fields are needed.

Implement:
- Treat this as telemetry, evaluation, and governance only.
- Do not add model-training, hidden coordination runtime, or a new product surface without a future scope issue.
- Add guardrails so public docs and website copy do not imply unimplemented capabilities.

Done when:
- the scope is represented as deferred, not a missing P0;
- any telemetry support maps to existing AMC objects;
- no public claim exceeds implemented AMC behavior.

Delivered:
- Neutral imports now detect generic collaboration/handoff records and map them to redacted Watch runtime events with `scope: telemetry-only`.
- Imported collaboration telemetry links to the same EpisodeRecord and lifecycle artifact as the neutral import.
- Import manifests record telemetry event refs and rollback removes the runtime-run directory written for the import.
- Docs drift now blocks public claims that imply hidden coordination runtimes or model-training/runtime capabilities that AMC does not implement.
- No ninth surface or hidden coordination runtime was added.

## Verification Matrix

Before this backlog can be considered complete, gather current evidence for each row.

| Area | Evidence required |
| --- | --- |
| CLI first run | fresh temp workspace can run `amc` and get full score or guided demo full score |
| Setup wizard | CLI and Studio first-run flows share state and recover from interruption |
| Studio | lifecycle dashboard, evidence, manifests, receipts, and domain packs render without console errors |
| Domain packs | locked/unlocked/expired/invalid/offline entitlement states tested |
| Evidence spine | lifecycle artifact, episodes, manifests, proofs, and receipts exist after full run |
| Decision observability | material recommendations have decision receipts with predicted and observed outcomes |
| Resource lifecycle | resource changes require diff, validation, receipt, and rollback path |
| Repair loop | failure fixture produces RCA, regression test, candidate, validation receipt, and rollback path |
| Runtime | live decision event produces allow/warn/block reason, episode link, and receipt |
| Fleet | multi-agent fixture produces parent/child lifecycle evidence, first-result timing, and cascade failure classification |
| Org runner | role-based run fixture produces isolated role evidence and auditable handoffs |
| Commands | `amc` succeeds alone and documented advanced commands exist in help output |
| Docs | README, website, and docs make `amc` the primary path and keep fast pulse checks optional |
| Naming | public docs/code/UI do not contain research-source project names from the audit bundle |
| Release | build, typecheck, targeted tests, website smoke, Studio smoke, and deploy health pass |

## Linear Issue Index

- `AMC-452`: master checklist
- `AMC-451`, `AMC-453` through `AMC-481`: detailed implementation issues

Keep Linear as the execution source of truth and this document as the repo-readable implementation map.
