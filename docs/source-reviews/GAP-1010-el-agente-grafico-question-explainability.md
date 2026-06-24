# GAP-1010 - El Agente Grafico question-explainability boundary

- Gap: `GAP-1010`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: OpenAlex work `https://openalex.org/W7131078049`, OpenAlex API `https://api.openalex.org/works/W7131078049`, DOI `https://doi.org/10.48550/arxiv.2602.17902`, arXiv abstract page `https://arxiv.org/abs/2602.17902`, arXiv version page `https://arxiv.org/abs/2602.17902v1`, arXiv PDF `https://arxiv.org/pdf/2602.17902v1`, arXiv API `https://export.arxiv.org/api/query?id_list=2602.17902`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through OpenAlex API, DOI headers, arXiv HTML metadata, arXiv API metadata, and local backlog metadata.
- Status: Done
- Linear: `AMC-1289`

## Live source metadata

OpenAlex identifies the work as `El Agente Gráfico: Structured Execution Graphs for Scientific Agents`, id `https://openalex.org/W7131078049`, DOI `https://doi.org/10.48550/arxiv.2602.17902`, type `preprint`, publication_year `2026`, publication_date 2026-02-19, open access `green`, license `cc-by`, cited_by_count 2, indexed in Datacite, and primary location source `Open MIND`. OpenAlex marked the primary location as a repository `submittedVersion`, with `is_accepted=false` and `is_published=false`.

The DOI returned `HTTP/2 302` to `https://arxiv.org/abs/2602.17902`; the arXiv abstract page returned `HTTP/2 200` with `last-modified: Mon, 23 Feb 2026 01:11:02 GMT`. arXiv API metadata resolved entry `http://arxiv.org/abs/2602.17902v1`, updated and published `2026-02-19T23:47:05Z`, HTML `https://arxiv.org/abs/2602.17902v1`, PDF `https://arxiv.org/pdf/2602.17902v1`, primary category `cs.AI`, and categories `cs.AI`, `cs.MA`, `cs.SE`, and `physics.chem-ph`.

Author metadata includes Jiaru Bai, Abdulrahman Aldossary, Thomas Swanick, Marcel Müller, Yeonghun Kang, Zijian Zhang, Jin Won Lee, Tsz Wai Ko, Mohammad Ghazi Vakili, Varinia Bernales, and Alán Aspuru-Guzik.

Relevant source-review signals include OpenAlex topic `Scientific Computing and Data Management`, additional topic `Machine Learning in Materials Science`, and keywords or concept labels such as Correctness, Scalability, Workflow, Abstraction, Automated reasoning, Symbolic execution, and Python. The arXiv abstract and metadata describe scientific agent context involving decision provenance, auditability, a type-safe execution environment, dynamic knowledge graphs, an object-graph mapper, typed Python objects, symbolic identifiers, provenance tracking, tool orchestration, automated benchmarking, quantum chemistry, conformer ensemble generation, and metal-organic framework design.

No paper abstract, method prose, benchmark rows, figures, examples, prompts, code, data, screenshots, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-1010 is relevant to AMC only through existing question-level score explainability. The source is a scientific-agents preprint that uses execution-graph and provenance language, so it is useful context for why AMC Score decisions must expose which question moved, what evidence was accepted, what evidence was rejected, what repair hint exists, and what reproducible eval pack and fail-closed thresholds support the claim.

The accepted AMC primitive already exists in `buildQuestionExplainabilityReport` and `buildEvalScoreExplainabilityPack`. Valid proof requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, row hash proof, reproducible eval pack, threshold outcomes, and failure reasons. OpenAlex metadata, DOI redirects, arXiv paper metadata, paper title, author list, category labels, topic labels, scientific workflow claims, and source identity alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing L0-L5 question score explanation rows, accepted evidence IDs, rejected reasons, repair hints, and threshold proof. |
| Shield | Relevant only when rejected evidence, missing gates, or test-suite failures show safety, correctness, or assurance gaps that need repair. |
| Enforce | Not changed. No runtime guardrail, scientific tool runner, graph executor, or policy circuit breaker changed. |
| Vault | Not changed. No private dataset, paper cache, credential, secure store, or data residency behavior changed. |
| Watch | Relevant when eval-pack thresholds or missing question evidence are surfaced as operational drift or lifecycle evidence, but no Watch module changed. |
| Fleet | Scientific agent orchestration is context only; no fleet topology, handoff graph, or multi-agent simulator was added. |
| Passport | Existing question-score evidence can feed proof bundles, but no Passport schema changed. |
| Comply | Not changed. Paper metadata does not add a regulatory control or methodology version. |

## Product closure

No product code changed. The focused regression proves existing question-score explainability primitives already cover GAP-1010 when AMC-owned evidence exists and fail closed when paper metadata replaces that evidence.

The positive path creates a replayable question-level eval pack with signed evidence IDs, rejected reasons, repair hints, row hashes, and threshold checks. The negative path fails closed when OpenAlex, DOI, arXiv API, paper labels, category labels, topic labels, and execution-graph claims are used without AMC-owned question evidence.

## Fail-closed rule

OpenAlex id, DOI, arXiv id, paper title, author list, preprint status, `cc-by` license, open-access status `green`, publication_date 2026-02-19, cited_by_count 2, category labels `cs.AI`, `cs.MA`, `cs.SE`, `physics.chem-ph`, topic labels, abstract concepts, source identity, or local backlog metadata alone cannot prove question-level score explainability.

Question explainability must fail closed unless the claim includes a question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, row hash proof, reproducible eval pack, fail-closed thresholds, and explicit missing-gate reasons when proof is incomplete.

## No-bloat boundary

No El Agente Grafico importer, paper importer, arXiv crawler, OpenAlex adapter, graph runtime, execution-graph mirror, scientific workflow runner, type-safe tool runtime, object-graph mapper, dynamic knowledge-graph subsystem, quantum chemistry workflow, conformer workflow, metal-organic framework workflow, dataset importer, benchmark clone, API route, CLI command, Studio panel, Watch monitor, Score method, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific subsystem was added.

No upstream code, paper prose beyond short metadata facts, abstract text beyond minimal labels, prompts, datasets, benchmark rows, figures, screenshots, examples, generated outputs, implementation details, or configurations were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap1010ElAgenteGraficoQuestionExplainabilityBoundary.test.ts --reporter=dot` failed before this document existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-1010-el-agente-grafico-question-explainability.md'`; 3 question-explainability primitive tests passed.
- Live source retrieval:
  - `curl -fsSL https://api.openalex.org/works/W7131078049`
  - `curl -I -L https://doi.org/10.48550/arxiv.2602.17902`
  - `curl -fsSL https://arxiv.org/abs/2602.17902`
  - `curl -fsSL 'https://export.arxiv.org/api/query?id_list=2602.17902'`
- Focused regression: `npx vitest run tests/gap1010ElAgenteGraficoQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap1007AnthropicConsoleEvalsQuestionExplainabilityBoundary.test.ts tests/gap1010ElAgenteGraficoQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed; narrow token scan over diagnostic/guide/passport implementation files found no GAP-1010 El Agente Grafico identifiers.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 857 files / 7,418 tests.
