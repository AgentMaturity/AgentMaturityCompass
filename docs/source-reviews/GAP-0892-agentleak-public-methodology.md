# GAP-0892 - AgentLeak public-methodology boundary

- Gap: `GAP-0892`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Privatris/AgentLeak`, `https://github.com/Privatris/AgentLeak`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 22, Fork 4, Issues 0, Pull requests 0, 39 Commits, README.md, LICENSE, View license, README MIT text, No releases published, Python 99.8%, Other 0.2%, repository folders `.github/ workflows`, `agentleak`, `agentleak_data`, `benchmarks`, `docs`, and `tests`, and files including `.env.example`, `.gitignore`, `pyproject.toml`, `pytest.ini`, and `requirements.txt`.
- Status: completed as `Done - skipped` for public methodology implementation. No public methodology version bump.

## Live source metadata

The live repository identifies AgentLeak as a benchmark for privacy leakage in multi-agent LLM systems and as the companion repository for an IEEE Access paper with an arXiv link. Relevant source-review signals include privacy leakage, multi-agent LLM systems, 5,694 traces across 5 models, 7 channels, C1 output, C2 inter-agent, C3-C4 tools, C5 memory, C6 logs, C7 artifacts, 1,000 scenarios, healthcare/finance/legal/corporate coverage, 32 attack classes, 6 families, CrewAI, LangChain, AutoGPT, MetaGPT, Finding 7, Tools & Logs, reproducibility scripts, traces, and a CLI dry-run/full-run path.

These facts are useful privacy-benchmark and multi-agent leakage context, but they do not change AMC scoring semantics. No upstream Python source, datasets, benchmark rows, traces, result tables, model outputs, attack taxonomy rows, prompts, sensitive-data examples, CLI commands beyond minimal metadata facts, README prose beyond minimal metadata facts, paper text, citation text, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC only as source-review context for Score, Shield, and Watch conversations about multi-agent privacy leakage, hidden-channel evaluation, trace evidence, and output-only audit limitations. It is skipped as public-methodology implementation evidence because the source does not require a change to AMC scoring semantics, evidence taxonomy, badge semantics, methodology version, changelog, deprecation notice, or migration guidance.

AgentLeak privacy benchmark metadata alone cannot justify a public methodology version bump. A future AMC methodology change would require an AMC-owned scoring semantic change with versioned methodology text, changelog entry, deprecation notice where applicable, migration guidance, signed evidence refs, replayable eval-pack rows, row hashes, regression thresholds, and no-copy proof. This gap provides no such AMC semantic change.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; no scoring semantic changed. |
| Shield | Context only for privacy-leakage and hidden-channel fail-closed treatment; no Shield verifier changed. |
| Watch | Context only for evidence visibility and trace-review framing; no monitor changed. |
| Enforce | No runtime privacy policy, tool policy, or channel guardrail changed. |
| Vault | No sensitive data, traces, datasets, prompts, or benchmark rows stored. |
| Fleet | Multi-agent leakage context only; no agent topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0892.

The focused regression verifies that the live source metadata is documented, that AgentLeak privacy benchmark metadata alone cannot justify a public methodology version bump, and that no source-specific identifiers enter public methodology implementation modules.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, license metadata, README MIT text, Star 22, Fork 4, Issues 0, Pull requests 0, 39 Commits, No releases published, Python 99.8%, Other 0.2%, folder names, file names, privacy leakage labels, multi-agent LLM systems labels, IEEE Access paper labels, arXiv labels, 5,694 traces across 5 models labels, 7 channels labels, C1/C2/C3-C4/C5/C6/C7 labels, 1,000 scenarios labels, 32 attack classes labels, 6 families labels, CrewAI/LangChain/AutoGPT/MetaGPT labels, Finding 7 labels, Tools & Logs labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing methodology-version evidence requires an AMC-owned methodology version, changelog, deprecation notice where applicable, migration guidance, signed evidence refs, replayable eval-pack rows, row hashes, regression thresholds, and no-copy proof.

## No-bloat boundary

No AgentLeak adapter, benchmark runner, privacy-leakage detector, multi-agent framework integration, CrewAI integration, LangChain integration, AutoGPT integration, MetaGPT integration, trace importer, result-table importer, attack-taxonomy importer, sensitive-data fixture importer, hidden-channel scanner, audit-gap metric, CLI command, API route, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, badge semantics change, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream Python source, datasets, benchmark rows, traces, result tables, model outputs, attack taxonomy rows, prompts, sensitive-data examples, CLI commands beyond minimal metadata facts, README prose beyond minimal metadata facts, paper text, citation text, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0892AgentLeakPublicMethodologyBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist.
- Focused regression after doc addition: `npx vitest run tests/gap0892AgentLeakPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0891TelephonyServerProviderDriftBoundary.test.ts tests/gap0892AgentLeakPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
