# GAP-0856 - Logikon live-drift boundary

- Gap: `GAP-0856`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `logikon-ai/logikon`, `https://github.com/logikon-ai/logikon`
- Retrieval: `2026-06-21` via live GitHub repository page and README review. The GitHub URL returned HTTP/2 200 in live review. The live GitHub repository page showed Star 48, Fork 0, Issues 0, Pull requests 0, 499 Commits, README.md, AGPL-3.0 license, v0.2.0 Latest Aug 29, 2024, and a language mix led by Python 99.8% and Just 0.2%.
- Status: completed as a live score and behavior drift boundary over existing AMC Watch receipts.

## Live source metadata

The live repository identifies Logikon as Analyzing and scoring reasoning traces of LLMs. Relevant source-review signals include argument-mapping, argument-mining, argumentation, critical-thinking, explainable-ai, llmops, observability, reasoning-agent, reliable-ai, guided reasoning, pros and cons, argument maps, and recursive balancing.

These facts are useful reasoning-trace observability context, but they are not live-drift proof by themselves. No upstream source code, scoring code, argument-map examples, prompts, reasoning traces, configs, package metadata, docs prose beyond minimal metadata facts, generated outputs, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing Watch live score and behavior drift receipts because reasoning trace scoring and observability can inform how users reason about Score, Shield, and Watch degradation after traffic, prompt, provider, or data changes. The closure is not a Logikon adapter or reasoning-trace scorer; it is a fail-closed boundary showing that Logikon metadata is accepted only as source-review context unless AMC-owned live-drift proof exists.

For live score and behavior drift to pass, AMC needs a baseline distribution, live sample, drift statistic, alert receipt, signed evidence refs, source refs, row hashes, and replayable lifecycle proof. GitHub/README/license/reasoning-trace metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing score distribution comparisons and score-mean drift alerts. |
| Shield | Relevant only as a fail-closed trust boundary; source metadata cannot stand in for signed behavior-drift proof. |
| Watch | Relevant through existing baseline/live windows, drift statistic, alert receipt, and Watch alert projection. |
| Enforce | No runtime reasoning policy, prompt policy, or circuit breaker changed. |
| Vault | No reasoning traces, prompts, configs, package metadata, or secure-storage behavior changed. |
| Fleet | Reasoning-agent context only; no Logikon runner or orchestration topology added. |
| Passport | Existing live-drift receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0856.

The focused regression exercises existing `runLiveScoreBehaviorDrift`, `verifyLiveDriftReceipt`, and `buildLiveDriftWatchAlerts` behavior with a positive Logikon-style reasoning trace drift packet and a negative source-metadata-only packet. The positive path requires baseline distribution, live sample, drift statistic, alert receipt, signed evidence refs, source refs, and row proof. The negative path fails closed when GitHub/README/license/reasoning trace metadata replaces signed live-drift evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, live GitHub repository page metadata, README.md presence, AGPL-3.0 license metadata, Star 48, Fork 0, Issues 0, Pull requests 0, 499 Commits, v0.2.0 Latest Aug 29, 2024, Python 99.8%, Just 0.2%, argumentation labels, reasoning labels, observability labels, guided reasoning labels, argument-map labels, local backlog metadata, or source identity alone must fail closed for live score and behavior drift. Passing evidence requires baseline distribution, live sample, drift statistic, alert receipt, signed evidence refs, source refs, row hashes, and replayable lifecycle proof.

## No-bloat boundary

No Logikon adapter, reasoning trace scorer, argument-map importer, argument-mining runner, guided reasoning runner, recursive balancing implementation, prompt wrapper, trace parser, package wrapper, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream source code, scoring code, argument-map examples, prompts, reasoning traces, configs, package metadata, docs prose beyond minimal metadata facts, generated outputs, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0856LogikonLiveDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative live-drift paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0856LogikonLiveDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0855RagrankMetricValidityBoundary.test.ts tests/gap0856LogikonLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
