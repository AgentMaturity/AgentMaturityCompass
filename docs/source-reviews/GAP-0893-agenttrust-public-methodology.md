# GAP-0893 - AgentTrust public-methodology boundary

- Gap: `GAP-0893`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `chenglin1112/AgentTrust`, `https://github.com/chenglin1112/AgentTrust`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 21, Fork 7, Issues 0, Pull requests 0, 32 Commits, README.md, LICENSE, `LICENSE-Apache-2.0-legacy`, Unknown, Apache-2.0 licenses found in repository metadata, a README/license section describing AGPL-3.0-or-later for current versions and Apache-2.0 legacy terms for v0.1.0 through v0.5.0, a Releases section with 1 tags, Python 100.0%, repository folders `.github/ workflows`, `docs`, `examples`, `experiments`, `src/ agent_trust`, and `tests`, and files including `mkdocs.yml` and `pyproject.toml`.
- Status: completed as `Done - skipped` for public methodology implementation. No public methodology version bump.

## Live source metadata

The live repository identifies AgentTrust as a deterministic safety floor and capability-control layer for tool-using AI agents. Relevant source-review signals include safe alternative suggestions, SafeFix, multi-step attack chain detection, RiskChain, LLM-as-Judge, Self-Learning, deterministic rule gates, least privilege, MCP, 42 risk patterns, 174 policy rules, 37 SafeFix rules, 7 chain detectors, 300 benchmark scenarios, 630 held-out test scenarios, 410 unit tests, ~0.3ms median latency, policy rules, chain detection, guarded memory, and benchmark/safety positioning.

These facts are useful safety-gate and guardrail methodology context, but they do not change AMC scoring semantics. No upstream Python source, policy YAML, benchmark scenarios, held-out test cases, unit tests, prompts, command examples, reports, docs prose beyond minimal metadata facts, diagrams, README examples, incident replay examples, SafeFix rule content, risk patterns, chain detector rules, LLM judge prompts, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC only as source-review context for Score, Shield, and Watch conversations about deterministic safety floors, capability control, safe alternatives, chain detection, LLM judge fallback, and guardrail evidence. It is skipped as public-methodology implementation evidence because the source does not require a change to AMC scoring semantics, evidence taxonomy, badge semantics, methodology version, changelog, deprecation notice, or migration guidance.

AgentTrust safety-gate metadata alone cannot justify a public methodology version bump. A future AMC methodology change would require an AMC-owned scoring semantic change with versioned methodology text, changelog entry, deprecation notice where applicable, migration guidance, signed evidence refs, replayable eval-pack rows, row hashes, regression thresholds, and no-copy proof. This gap provides no such AMC semantic change.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; no scoring semantic changed. |
| Shield | Context only for safety-gate and guardrail fail-closed treatment; no Shield verifier changed. |
| Watch | Context only for evidence visibility and safety-gate monitoring framing; no monitor changed. |
| Enforce | No runtime rule gate, SafeFix, RiskChain, MCP, or capability-control policy changed. |
| Vault | No policy files, prompts, incident examples, reports, or benchmark cases stored. |
| Fleet | Agent safety context only; no agent topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0893.

The focused regression verifies that the live source metadata is documented, that AgentTrust safety-gate metadata alone cannot justify a public methodology version bump, and that no source-specific identifiers enter public methodology implementation modules.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Unknown, Apache-2.0 licenses found metadata, AGPL-3.0-or-later labels, Apache-2.0 legacy labels, Star 21, Fork 7, Issues 0, Pull requests 0, 32 Commits, 1 tags metadata, Python 100.0%, folder names, file names, deterministic safety floor labels, capability-control labels, tool-using AI agents labels, SafeFix labels, RiskChain labels, LLM-as-Judge labels, Self-Learning labels, 42 risk patterns labels, 174 policy rules labels, 37 SafeFix rules labels, 7 chain detectors labels, 300 benchmark scenarios labels, 630 held-out test scenarios labels, 410 unit tests labels, ~0.3ms median latency labels, MCP labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing methodology-version evidence requires an AMC-owned methodology version, changelog, deprecation notice where applicable, migration guidance, signed evidence refs, replayable eval-pack rows, row hashes, regression thresholds, and no-copy proof.

## No-bloat boundary

No AgentTrust adapter, deterministic rule gate, SafeFix engine, RiskChain detector, LLM judge fallback, self-learning memory, MCP server, policy-rule importer, benchmark runner, held-out scenario importer, incident replay, shell normalizer, capability-control module, guarded memory, docs site integration, CLI command, API route, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, badge semantics change, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream Python source, policy YAML, benchmark scenarios, held-out test cases, unit tests, prompts, command examples, reports, docs prose beyond minimal metadata facts, diagrams, README examples, incident replay examples, SafeFix rule content, risk patterns, chain detector rules, LLM judge prompts, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0893AgentTrustPublicMethodologyBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist.
- Focused regression after doc addition: `npx vitest run tests/gap0893AgentTrustPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0892AgentLeakPublicMethodologyBoundary.test.ts tests/gap0893AgentTrustPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
