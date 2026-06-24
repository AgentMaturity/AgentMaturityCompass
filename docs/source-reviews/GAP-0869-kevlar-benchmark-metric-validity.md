# GAP-0869 - Kevlar benchmark metric-validity boundary

- Gap: `GAP-0869`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `toxy4ny/kevlar-benchmark`, `https://github.com/toxy4ny/kevlar-benchmark`
- Retrieval: `2026-06-21` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 35, Fork 4, Issues 1, Pull requests 0, 66 Commits, README.md, LICENSE, MIT license, No releases published, Python 99.8%, C 0.2%, repository folders `scripts`, `src/kevlar`, and `tests`, and files including `pyproject.toml`, `uv.lock`, and `extension-run.yaml`.
- Status: completed as a metric-validity boundary over existing AMC validation receipts.

## Live source metadata

The live repository identifies Kevlar: OWASP Top 10 for Agentic Apps 2026 Benchmark. Relevant source-review signals include topics such as education, ai-agents, cybersecurity, owasp-top-10, and redteaming-tools; Full-coverage red team framework for AI agent security testing; OWASP Top 10 for Agentic Applications; Agent Goal Hijack; Unexpected Code Execution; Identity & Privilege Abuse; Tool Misuse & Exploitation; Agentic Supply Chain; Memory & Context Poisoning; Insecure Inter-Agent Comms; Cascading Failures; Human-Agent Trust Exploitation; Rogue Agents; AIVSS Scoring Engine; CI mode; 591 tests total; coverage threshold 40%; and authorized red teaming only.

These facts are useful red-team metric-validity context for agentic application safety, but they are not AMC validation evidence by themselves. No upstream source code, exploit payloads, prompts, benchmark cases, generated attack outputs, CLI behavior, extension configuration, test files, README prose beyond minimal metadata facts, screenshots, tables, scoring implementation, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing metric-validity receipts because OWASP/ASI red-team benchmark context can inform how users reason about Score, Shield, and Watch validity claims. The closure is not a Kevlar adapter, red-team runner, AIVSS scoring implementation, exploit harness, or OWASP Top 10 importer; it is a fail-closed boundary showing that Kevlar metadata is accepted only as source-review context unless AMC-owned metric validity proof exists.

For metric validity to pass, AMC needs validation table evidence, confidence interval evidence, sample size evidence, reliability checks, outcome-alignment checks, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, CI or lifecycle gate proof, and no-copy proof. GitHub/README/license/red-team benchmark metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing validation table, confidence interval, sample size, reliability, outcome-alignment, and metric-owner receipts. |
| Shield | Relevant only as a fail-closed trust boundary for red-team benchmark context; source metadata cannot stand in for signed validity proof. |
| Watch | Relevant only through source refs, CI/lifecycle gate receipts, and replayable eval-pack visibility; no live monitor changed. |
| Enforce | No runtime red-team policy, exploit policy, prompt policy, or circuit breaker changed. |
| Vault | No exploit payloads, prompts, tests, configs, generated outputs, or secure-storage behavior changed. |
| Fleet | Agentic app red-team context only; no Kevlar runner or orchestration topology added. |
| Passport | Existing metric validity receipts can feed proof bundles, but no Passport schema changed. |
| Comply | OWASP context is source-review context only; no compliance framework mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0869.

The focused regression exercises existing `buildMetricValidationReport` behavior with a positive Kevlar-style source-reference packet and a negative source-metadata-only packet. The positive path requires validation table, confidence interval, sample size, reliability check, outcome alignment, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, and CI gate proof. The negative path fails closed when GitHub/README/license/red-team benchmark metadata replaces signed metric-validity evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, LICENSE presence, MIT license metadata, Star 35, Fork 4, Issues 1, Pull requests 0, 66 Commits, No releases published, Python 99.8%, C 0.2%, folder names, file names, topic labels, OWASP Top 10 for Agentic Applications labels, Agent Goal Hijack labels, Unexpected Code Execution labels, Identity & Privilege Abuse labels, Tool Misuse & Exploitation labels, Agentic Supply Chain labels, Memory & Context Poisoning labels, Insecure Inter-Agent Comms labels, Cascading Failures labels, Human-Agent Trust Exploitation labels, Rogue Agents labels, AIVSS Scoring Engine labels, CI mode labels, 591 tests total labels, coverage threshold 40% labels, authorized red teaming only labels, local backlog metadata, or source identity alone must fail closed for metric validity. Passing evidence requires validation table, confidence interval, sample size, reliability checks, outcome alignment, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No Kevlar adapter, red-team runner, exploit harness, OWASP Top 10 importer, AIVSS scoring engine, benchmark case importer, prompt importer, attack payload importer, extension-runner, CI adapter, test-suite mirror, metric implementation, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream source code, exploit payloads, prompts, benchmark cases, generated attack outputs, CLI behavior, extension configuration, test files, README prose beyond minimal metadata facts, screenshots, tables, scoring implementation, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0869KevlarBenchmarkMetricValidityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative metric-validity paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0869KevlarBenchmarkMetricValidityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0868UavBenchProviderDriftBoundary.test.ts tests/gap0869KevlarBenchmarkMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
