# GAP-0978 - Autonomous-agents review question-explainability boundary

- Gap: `GAP-0978`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: OpenAlex work `https://openalex.org/W4416982487`, OpenAlex API `https://api.openalex.org/works/W4416982487`, DOI `https://doi.org/10.1109/access.2026.3698694`, DOI redirect target `https://ieeexplore.ieee.org/document/11540994/`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through OpenAlex API, DOI resolution, IEEE landing probe, and local backlog metadata.
- Status: closed through existing question-level score explainability receipts only; no paper importer, benchmark taxonomy importer, survey adapter, IEEE importer, OpenAlex importer, DOI resolver, evaluation framework catalog, agent protocol catalog, or source-specific question lens added.
- Linear: `AMC-1257`

## Live source metadata

The OpenAlex API returned HTTP/2 200 for `https://api.openalex.org/works/W4416982487`. It identifies `From LLM Reasoning to Autonomous AI Agents: A Comprehensive Review` as an English `article` with DOI `https://doi.org/10.1109/access.2026.3698694`, publication_year `2026`, publication_date `2026-01-01`, cited_by_count `6`, open access status `gold`, and primary source `IEEE Access` from the Institute of Electrical and Electronics Engineers.

OpenAlex lists authors Mohamed Amine Ferrag, Norbert Tihanyi, and Debbah. Its concept metadata includes Computer science, Modular design, Artificial intelligence, Software engineering, Human-computer interaction, and Autonomous agent.

The DOI probe returned HTTP/2 302 to `https://ieeexplore.ieee.org/document/11540994/`; the IEEE landing probe returned HTTP/2 202 with `x-amzn-waf-action: challenge`, so the IEEE page was not treated as readable methodology evidence in this pass.

The OpenAlex abstract metadata describes a review of LLM reasoning and autonomous AI agents across evaluation benchmarks, frameworks, and collaboration protocols. Relevant source-review signals include fragmented benchmark landscapes, a unified taxonomy, about 60 benchmarks across reasoning, math, code, factual grounding, retrieval, domain, multimodal, embodied, orchestration, and interactive evaluations, agent frameworks introduced from 2023 to 2025, ACP, MCP, A2A, failure modes in multi-agent LLM systems, and dynamic tool integration.

No paper prose beyond short metadata facts, PDF content, figures, tables, benchmark rows, taxonomy tables, framework descriptions, protocol details, recommendations, examples, prompts, datasets, screenshots, or implementation details were copied into AMC.

## Relevance decision

GAP-0978 is relevant to AMC only through existing question-level score explainability proof. A broad review of autonomous-agent evaluation benchmarks reinforces why AMC L0-L5 question movement must show a question ID, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, fail-closed thresholds, row hash, signed evidence, and source refs.

The accepted AMC primitive is already `buildQuestionExplainabilityReport` plus `buildEvalScoreExplainabilityPack`. OpenAlex metadata, DOI redirects, IEEE challenge headers, abstract labels, survey labels, benchmark-taxonomy labels, ACP/MCP/A2A protocol labels, author names, citation counts, source identity, or local backlog metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level explainability rows, accepted evidence IDs, rejected evidence reasons, repair hints, and L0-L5 question movement rationale. |
| Shield | Relevant when fail-closed thresholds and rejected-evidence reasons prevent unsupported autonomous-agent benchmark claims from passing. |
| Enforce | No runtime policy, protocol bridge, model router, framework adapter, or circuit breaker changed. |
| Vault | No benchmark data, prompt, protocol artifact, source PDF, or secure-storage behavior changed. |
| Watch | Relevant when question-level repair hints connect to reproducible eval packs, CI thresholds, and evidence drilldown; no live monitor changed. |
| Fleet | Multi-agent and protocol context only; no Fleet topology, routing, orchestration, or trust graph changed. |
| Passport | Existing question explainability receipts can feed proof bundles, but no Passport schema changed. |
| Comply | Survey/journal context only; no compliance mapping changed. |

## Product closure

No product code changed. The focused regression exercises existing `buildQuestionExplainabilityReport` and `buildEvalScoreExplainabilityPack` behavior with AMC-owned synthetic fixture data.

The positive path proves autonomous-agent survey context can be accepted only when AMC-owned question rows include a real question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence, reproducible eval pack, fail-closed thresholds, row hash, and source refs. The negative path fails closed when OpenAlex, DOI, IEEE, abstract labels, benchmark-taxonomy labels, protocol labels, citation counts, and source identity replace AMC-owned question evidence.

## Fail-closed rule

OpenAlex work ID, OpenAlex API metadata, DOI, DOI redirect target, IEEE Access label, Institute of Electrical and Electronics Engineers label, HTTP/2 200 label, HTTP/2 302 label, `x-amzn-waf-action: challenge` label, publication metadata, open access labels, author names, concept tags, abstract labels, benchmark-taxonomy labels, about 60 benchmarks label, ACP label, MCP label, A2A label, failure modes label, dynamic tool integration label, local backlog metadata, or source identity alone cannot prove AMC question-level score explainability.

Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence refs, row hash, source refs, reproducible eval pack, fail-closed thresholds, Score/Shield/Watch mapping, and no-copy proof.

## No-bloat boundary

No paper importer, IEEE importer, OpenAlex importer, DOI resolver, benchmark taxonomy importer, survey adapter, agent framework catalog, protocol catalog, ACP connector, MCP connector, A2A connector, evaluation benchmark registry, source-specific question lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added.

No paper prose beyond short metadata facts, PDF content, figures, tables, benchmark rows, taxonomy tables, framework descriptions, protocol details, recommendations, examples, prompts, datasets, screenshots, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0978AutonomousAgentsReviewQuestionExplainabilityBoundary.test.ts --reporter=dot` - failed before this doc existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0978-autonomous-agents-review-question-explainability.md'`; 3 question-explainability primitive tests passed.
- Focused regression: `npx vitest run tests/gap0978AutonomousAgentsReviewQuestionExplainabilityBoundary.test.ts --reporter=dot` - passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0977GoogleAdkGoProviderDriftBoundary.test.ts tests/gap0978AutonomousAgentsReviewQuestionExplainabilityBoundary.test.ts --reporter=dot` - passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Typecheck: `npm run typecheck` - passed.
- Full suite: `npm test -- --reporter=dot` - passed, 825 files / 7,299 tests.
- Cleanup: `npm run clean` - removed generated `dist/` output before staging.
