# GAP-0875 - RedThread provider-drift boundary

- Gap: `GAP-0875`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `matheusht/redthread`, `https://github.com/matheusht/redthread`
- Retrieval: `2026-06-21` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 35, Fork 3, Issues 1, Pull requests 0, 255 Commits, README.md, LICENSE, MIT license, RedThread Security Scan v0.1.0 Latest May 13, 2026, Python 96.7%, HTML 3.0%, Other 0.3%, repository folders `.agent`, `.agents/ plugins`, `.clarity-protocol`, `.codex`, `.github/ workflows`, `artifacts`, `autoresearch/ templates`, `plugins/ caveman`, and `src/ redthread`, and file `test_pyrit.py`.
- Status: completed as a provider/model drift boundary over existing AMC canary receipts.

## Live source metadata

The live repository identifies RedThread as an autonomous red-team engine. Relevant source-review signals include attack generation, target execution, judge scoring, defense synthesis, replay validation, promotion evidence, semantic drift, response consistency, latency / token anomalies, canary probe variance, tool poisoning, confused-deputy delegation, and pre-action authorization.

These facts are useful red-team and provider-drift context, but they are not provider/model drift proof by themselves. No upstream source code, attack payloads, judge prompts, defense templates, replay artifacts, promotion evidence artifacts, plugin code, PyRIT examples, reports, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing provider/model drift canary receipts because red-team behavior, replay validation, and drift signals can inform how users reason about Score, Shield, and Watch changes across model or provider updates. The closure is not a RedThread adapter, attack generator, judge scorer, defense synthesizer, replay validator, plugin runner, or PyRIT integration; it is a fail-closed boundary showing that RedThread metadata is accepted only as source-review context unless AMC-owned provider-drift proof exists.

For provider/model drift to pass, AMC needs provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof. GitHub/README/license/red-team engine metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider score distribution comparisons and canary result rows. |
| Shield | Relevant only as a fail-closed trust boundary for red-team drift context; source metadata cannot stand in for signed provider-drift proof. |
| Watch | Relevant through existing provider drift alerts, Watch alert projection, and CI/lifecycle gate receipts. |
| Enforce | No runtime red-team policy, tool policy, authorization policy, or circuit breaker changed. |
| Vault | No attack payloads, judge prompts, defense templates, replay artifacts, plugins, reports, or secure-storage behavior changed. |
| Fleet | Red-team lifecycle context only; no RedThread runner or orchestration topology added. |
| Passport | Existing provider-drift receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0875.

The focused regression exercises existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` behavior with a positive RedThread-style canary packet and a negative source-metadata-only packet. The positive path requires provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, and CI gate proof. The negative path fails closed when GitHub/README/license/red-team engine metadata replaces signed provider-drift evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, LICENSE presence, MIT license metadata, Star 35, Fork 3, Issues 1, Pull requests 0, 255 Commits, RedThread Security Scan v0.1.0 Latest May 13, 2026 labels, Python 96.7%, HTML 3.0%, Other 0.3%, folder names, file names, attack generation labels, target execution labels, judge scoring labels, defense synthesis labels, replay validation labels, promotion evidence labels, semantic drift labels, response consistency labels, latency / token anomalies labels, canary probe variance labels, tool poisoning labels, confused-deputy delegation labels, pre-action authorization labels, local backlog metadata, or source identity alone must fail closed for provider/model drift. Passing evidence requires provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No RedThread adapter, red-team runner, attack generator, target executor, judge scorer, defense synthesizer, replay validator, promotion gate, semantic-drift analyzer, PyRIT integration, plugin runner, attack payload importer, judge prompt importer, defense-template importer, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream source code, attack payloads, judge prompts, defense templates, replay artifacts, promotion evidence artifacts, plugin code, PyRIT examples, reports, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0875RedThreadProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative provider-drift paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0875RedThreadProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0874ClaudeRagSkillsProviderDriftBoundary.test.ts tests/gap0875RedThreadProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
