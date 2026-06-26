# GAP-0887 - AgentShield Benchmark public-methodology boundary

- Gap: `GAP-0887`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `doronp/agentshield-benchmark`, `https://github.com/doronp/agentshield-benchmark`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 24, Fork 10, Issues 5, Pull requests 4, 79 Commits, README.md, LICENSE, Apache-2.0 license, Releases 1, latest release `v0.1.0`, TypeScript 94.5%, Python 3.4%, Shell 2.1%, repository folders `.github/ workflows`, `assets`, `corpus`, `docs`, `results`, `scripts`, and `src`, and files including `PROVIDERS.md`, `REVIEW.md`, and `SECURITY.md`.
- Status: completed as `Done - skipped` for public methodology implementation. No public methodology version bump.

## Live source metadata

The live repository identifies AgentShield Benchmark as an open benchmark for AI agent security tools. Relevant source-review signals include 537 test cases, 8 categories, Prompt Injection, Jailbreak, Data Exfiltration, Tool Abuse, Over-Refusal, Multi-Agent Security, Latency Overhead, Provenance & Audit, OWASP Agentic Top 10 alignment, weighted geometric mean scoring, false-positive penalties, corpus hashes, shuffleSeed determinism, provider versions, result timestamps, Commit-Reveal Integrity Protocol, Ed25519 signatures, and a verification bundle in `results/`.

These facts are useful agent-security methodology context, but they do not change AMC scoring semantics. No upstream corpus rows, provider adapters, results, scoring code, attack prompts, benchmark tables, OWASP mappings, commit-reveal protocol code, signatures, verification bundles, README prose beyond minimal metadata facts, site content, package configs, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC only as source-review context for Score, Shield, and Watch conversations about agent-security benchmarks and reproducible evidence. It is skipped as public-methodology implementation evidence because the source does not require a change to AMC scoring semantics, evidence taxonomy, badge semantics, methodology version, changelog, deprecation notice, or migration guidance.

AgentShield Benchmark metadata alone cannot justify a public methodology version bump. A future AMC methodology change would require an AMC-owned scoring semantic change with versioned methodology text, changelog entry, deprecation notice where applicable, migration guidance, signed evidence refs, replayable eval-pack rows, row hashes, and regression thresholds. This gap provides no such AMC semantic change.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; no scoring semantic changed. |
| Shield | Context only for fail-closed treatment of agent-security benchmark metadata; no Shield verifier changed. |
| Watch | Context only for evidence visibility; no live monitor changed. |
| Enforce | No prompt-injection, tool-use, data-exfiltration, provenance, or runtime policy changed. |
| Vault | No corpus rows, results, API keys, provider configs, signatures, or secure-storage behavior changed. |
| Fleet | Multi-agent security context only; no benchmark runner or adapter fleet added. |
| Passport | Existing proof bundles are unchanged. |
| Comply | OWASP context only; no compliance framework mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0887.

The focused regression verifies that the live source metadata is documented, that AgentShield Benchmark metadata alone cannot justify a public methodology version bump, and that no source-specific identifiers enter public methodology implementation modules.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, LICENSE presence, Apache-2.0 license metadata, Star 24, Fork 10, Issues 5, Pull requests 4, 79 Commits, Releases 1, `v0.1.0`, TypeScript 94.5%, Python 3.4%, Shell 2.1%, folder names, file names, 537 test cases labels, 8 categories labels, Prompt Injection labels, Data Exfiltration labels, Tool Abuse labels, Multi-Agent Security labels, Provenance & Audit labels, OWASP Agentic Top 10 labels, weighted geometric mean labels, Commit-Reveal Integrity Protocol labels, Ed25519 signatures labels, corpusHash labels, shuffleSeed labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing methodology-version evidence requires an AMC-owned methodology version, changelog, deprecation notice where applicable, migration guidance, signed evidence refs, replayable eval-pack rows, row hashes, regression thresholds, and no-copy proof.

## No-bloat boundary

No AgentShield Benchmark adapter, corpus importer, provider adapter, benchmark runner, attack-case importer, prompt-injection scanner, data-exfiltration test runner, tool-abuse runner, provenance verifier, commit-reveal implementation, Ed25519 verifier, static leaderboard, OWASP mapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, badge semantics change, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream corpus rows, provider adapters, results, scoring code, attack prompts, benchmark tables, OWASP mappings, commit-reveal protocol code, signatures, verification bundles, README prose beyond minimal metadata facts, site content, package configs, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0887AgentShieldBenchmarkPublicMethodologyBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist.
- Focused regression after doc addition: `npx vitest run tests/gap0887AgentShieldBenchmarkPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0886MosaicMetricValidityBoundary.test.ts tests/gap0887AgentShieldBenchmarkPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
