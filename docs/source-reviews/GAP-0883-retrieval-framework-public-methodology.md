# GAP-0883 - Retrieval Framework public-methodology boundary

- Gap: `GAP-0883`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `tensorsense/Retrieval-Framework`, `https://github.com/tensorsense/Retrieval-Framework`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed the repository was archived by the owner on May 19, 2025 and is a Public archive. It also showed Star 26, Fork 3, Issues 1, Pull requests 0, 39 Commits, README.md, No releases published, No packages published, Contributors 3, Jupyter Notebook 89.1%, Python 10.9%, repository folders `inbox`, `pdf_processor`, and `results/ 2312.10997`, and files including `__init__.py`, `example.env`, `hierarchical_retrieval.ipynb`, and `requirements.txt`.
- Status: completed as `Done - skipped` for public methodology implementation. No public methodology version bump.

## Live source metadata

The live repository identifies Retrieval Framework as a tool that converts scientific PDFs into plain text for LLM-related use cases such as RAGs or agents for academic knowledge. Relevant source-review signals include LlamaIndex collaboration, Mathpix API usage, table and image extraction, multimodal LLM parsing, hierarchical retrieval, GPT-based table/image descriptions, `MathpixProcessor`, `MathpixResultParser`, and a notebook workflow.

These facts are useful RAG/document-processing context, but they do not change AMC scoring semantics. No upstream notebook, Python source, PDF data, scientific paper output, Mathpix workflow, prompts, tables, image descriptions, LlamaIndex workflow, requirements, environment examples, README prose beyond minimal metadata facts, generated text, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC only as source-review context for Score, Shield, and Watch conversations about RAG/document-processing evidence. It is skipped as public-methodology implementation evidence because the source does not require a change to AMC scoring semantics, evidence taxonomy, badge semantics, methodology version, changelog, deprecation notice, or migration guidance.

Retrieval Framework metadata alone cannot justify a public methodology version bump. A future AMC methodology change would require an AMC-owned scoring semantic change with versioned methodology text, changelog entry, deprecation notice where applicable, migration guidance, signed evidence refs, replayable eval-pack rows, row hashes, and regression thresholds. This gap provides no such AMC semantic change.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; no scoring semantic changed. |
| Shield | Context only for fail-closed treatment of PDF/RAG source metadata; no Shield verifier changed. |
| Watch | Context only for evidence visibility; no live monitor changed. |
| Enforce | No PDF-processing, Mathpix, RAG, or model policy changed. |
| Vault | No PDFs, API keys, environment files, extracted text, notebook data, or secure-storage behavior changed. |
| Fleet | No RAG agent, LlamaIndex workflow, or document-processing orchestration added. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0883.

The focused regression verifies that the live source metadata is documented, that Retrieval Framework metadata alone cannot justify a public methodology version bump, and that no source-specific identifiers enter public methodology implementation modules.

## Fail-closed rule

Live GitHub repository page reachability, archive status, Public archive status, README.md presence, Star 26, Fork 3, Issues 1, Pull requests 0, 39 Commits, No releases published, No packages published, Contributors 3, Jupyter Notebook 89.1%, Python 10.9%, folder names, file names, scientific PDFs labels, plain text labels, RAGs or agents for academic knowledge labels, LlamaIndex labels, Mathpix API labels, hierarchical retrieval labels, GPT labels, tables and images labels, `MathpixProcessor` labels, `MathpixResultParser` labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing methodology-version evidence requires an AMC-owned methodology version, changelog, deprecation notice where applicable, migration guidance, signed evidence refs, replayable eval-pack rows, row hashes, regression thresholds, and no-copy proof.

## No-bloat boundary

No Retrieval Framework adapter, PDF converter, Mathpix importer, LlamaIndex workflow, hierarchical retrieval runner, notebook runner, table extractor, image extractor, multimodal parser, GPT description path, RAG builder, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, badge semantics change, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream notebook, Python source, PDF data, scientific paper output, Mathpix workflow, prompts, tables, image descriptions, LlamaIndex workflow, requirements, environment examples, README prose beyond minimal metadata facts, generated text, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0883RetrievalFrameworkPublicMethodologyBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist.
- Focused regression after doc addition: `npx vitest run tests/gap0883RetrievalFrameworkPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0882SelfCareMetricValidityBoundary.test.ts tests/gap0883RetrievalFrameworkPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
