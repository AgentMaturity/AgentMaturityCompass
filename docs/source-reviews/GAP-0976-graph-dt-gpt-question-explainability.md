# GAP-0976 - Graph-DT-GPT question-explainability boundary

- Gap: `GAP-0976`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: Cambridge repository record at `https://www.repository.cam.ac.uk/items/87f596f4-6981-415c-9ce6-e63aa74460d8`, DOI landing metadata at `https://doi.org/10.1016/j.autcon.2026.106791`, OpenAlex work `https://openalex.org/W7125818766`, OpenAlex API, and local backlog metadata
- Retrieval: `2026-06-24` live source review through web research, OpenAlex API, and the local backlog row.
- Status: closed through existing question-level score explainability receipts only when AMC-owned question evidence exists; no Graph-DT-GPT framework, graph database connector, AEC digital twin subsystem, paper importer, multi-agent simulator, or source-specific question lens added.
- Linear: `AMC-1255`

## Live source metadata

The Cambridge repository record identifies `LLM-enabled multi-agent framework for natural language interaction with graph-based digital twins` as a Published version, Peer-reviewed Article with repository handle `https://www.repository.cam.ac.uk/handle/1810/399211`. The source lists authors Yuandong Pan, Mudan Wang, Linjun Lu, Rabindra Lamsal, Erika Parn, Sisi Zlatanova, and Ioannis Brilakis. The journal is Automation in Construction, Volume 183, publisher Elsevier, DOI `https://doi.org/10.1016/j.autcon.2026.106791`, and the repository rights state Attribution 4.0 International.

The Cambridge abstract identifies Graph-DT-GPT as a multi-agent framework for natural language interaction with graph-based digital twins. Relevant source-review signals include modular agents, decision, query generation, and answer extraction, grounding outputs in structured graph data, a city-level graph with over 40,000 building nodes, room-level apartment layout graphs, 100% and 95.5% answer correctness using Claude Sonnet 4.5 and GPT-4o, LangChain Neo4j pipelines as baselines, and relative improvements around 40% and 10%.

OpenAlex API verification returned `id: https://openalex.org/W7125818766`, DOI `https://doi.org/10.1016/j.autcon.2026.106791`, publication_year `2026`, publication_date: 2026-01-27, type `article`, cited_by_count: 5, English language, open access status `hybrid`, source `Automation in Construction`, host `Elsevier BV`, and concepts including Computer science, Correctness, Scalability, Modular design, Graph, Toolbox, Programming language, and Graph database.

No Graph-DT-GPT paper prose beyond short metadata facts, PDF content, figures, tables, prompts, query examples, graph schemas, graph data, benchmark rows, result tables, code, model outputs, digital twin datasets, AEC workflows, screenshots, algorithms, or implementation details were copied into AMC.

## Relevance decision

GAP-0976 is relevant to AMC only through existing question-level score explainability proof. The paper's multi-agent, graph-grounded, digital-twin evaluation context reinforces why AMC L0-L5 question movement must show a question ID, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, fail-closed thresholds, row hash, and source refs.

The accepted AMC primitive is already `buildQuestionExplainabilityReport` plus `buildEvalScoreExplainabilityPack`. DOI, OpenAlex, Cambridge repository, abstract metadata, Graph-DT-GPT labels, digital-twin labels, multi-agent labels, graph-database labels, result percentages, baseline names, or source identity alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level explainability rows, accepted evidence IDs, rejected evidence reasons, repair hints, and L0-L5 question movement rationale. |
| Shield | Relevant when fail-closed thresholds and rejected-evidence reasons prevent unsupported graph-grounded or multi-agent evaluation claims from passing. |
| Enforce | No runtime policy, graph query route, model sampler, digital twin connector, or circuit breaker changed. |
| Vault | No graph data, AEC data, prompt, model output, building data, digital twin artifact, or secure-storage behavior changed. |
| Watch | Relevant when question-level repair hints connect to reproducible eval packs, CI thresholds, and evidence drilldown; no live monitor changed. |
| Fleet | Multi-agent framework context only; no Fleet topology, routing, orchestration, or trust graph changed. |
| Passport | Existing question explainability receipts can feed proof bundles, but no Passport schema changed. |
| Comply | AEC/digital-twin context only; no compliance mapping changed. |

## Product closure

No product code changed. The focused regression exercises existing `buildQuestionExplainabilityReport` and `buildEvalScoreExplainabilityPack` behavior with AMC-owned synthetic fixture data.

The positive path proves Graph-DT-GPT source context can be accepted only when AMC-owned question rows include a real question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence, reproducible eval pack, fail-closed thresholds, row hash, and source refs. The negative path fails closed when DOI/OpenAlex/Cambridge metadata, abstract labels, graph-digital-twin labels, multi-agent labels, graph-database labels, result percentages, and baseline labels replace AMC-owned question evidence.

## Fail-closed rule

Cambridge repository URL, DOI, OpenAlex work ID, title, author list, Automation in Construction metadata, Published version labels, Peer-reviewed labels, Article labels, Elsevier labels, Attribution 4.0 International labels, Graph-DT-GPT labels, multi-agent labels, natural-language interaction labels, graph-based digital twin labels, modular-agent labels, structured-graph-data labels, answer-correctness labels, Claude Sonnet 4.5 labels, GPT-4o labels, LangChain Neo4j baseline labels, city-scale graph labels, room-layout graph labels, local backlog metadata, or source identity alone cannot prove AMC question-level score explainability.

Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence refs, row hash, source refs, reproducible eval pack, fail-closed thresholds, Score/Shield/Watch mapping, and no-copy proof.

## No-bloat boundary

No Graph-DT-GPT framework, graph database connector, AEC digital twin subsystem, Neo4j adapter, LangChain pipeline, query-generation agent, answer-extraction agent, decision agent, graph-data importer, building-data importer, room-layout graph loader, paper importer, OpenAlex importer, DOI resolver, Cambridge repository importer, multi-agent simulator, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific question lens was added.

No upstream paper prose beyond short metadata facts, PDF content, figures, tables, prompts, query examples, graph schemas, graph data, benchmark rows, result tables, code, model outputs, digital twin datasets, AEC workflows, screenshots, algorithms, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0976GraphDtGptQuestionExplainabilityBoundary.test.ts --reporter=dot` - failed before this doc existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0976-graph-dt-gpt-question-explainability.md'`; 3 question-explainability primitive tests passed.
- Focused regression: `npx vitest run tests/gap0976GraphDtGptQuestionExplainabilityBoundary.test.ts --reporter=dot` - passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0975OpenAiSimpleEvalsQuestionExplainabilityBoundary.test.ts tests/gap0976GraphDtGptQuestionExplainabilityBoundary.test.ts --reporter=dot` - passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Typecheck: `npm run typecheck` - passed.
- Full suite: `npm test -- --reporter=dot` - passed, 823 files / 7,291 tests.
- Cleanup: `npm run clean` - removed generated `dist/` output before staging.
