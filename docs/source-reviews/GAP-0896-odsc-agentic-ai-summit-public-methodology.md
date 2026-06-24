# GAP-0896 - ODSC Agentic AI Summit public-methodology boundary

- Gap: `GAP-0896`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `graphgeeks-lab/odsc-agentic-ai-summit-2025`, `https://github.com/graphgeeks-lab/odsc-agentic-ai-summit-2025`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 19, Fork 4, Issues 0, Pull requests 0, 69 Commits, README.md, No releases published, Python 99.5%, Shell 0.5%, repository folders `assets`, `data`, `slides`, and `src`, and files including `.gitattributes`, `.gitignore`, `TIPS.md`, `create_dataset.py`, `pyproject.toml`, `requirements.txt`, and `uv.lock`. No license metadata was visible on the GitHub repository page.
- Status: completed as `Done - skipped` for public methodology implementation. No public methodology version bump.

## Live source metadata

The live README identifies Agentic Workflows for Graph RAG as an ODSC Agentic AI Summit 2025 Workshop by GraphGeeks, dated July 16 - 31, 2025. Relevant source-review signals include 2,726 FHIR records, a Hugging Face dataset, `data/note.json`, `data/fhir.json`, BAML, Kuzu, LanceDB, vector index, full-text search, hybrid search, Graph RAG, Opik observability, guardrails, structured data evaluation, graph/vector/FTS RAG evaluation, hallucination detection, answer relevance, moderation, usefulness, traces, timing, token usage, cost analysis, and dashboard review.

These facts are useful Graph RAG evaluation and observability context, but they do not change AMC scoring semantics. No upstream Python source, workshop data, FHIR records, Hugging Face data, BAML prompts, Kuzu files, LanceDB data, Opik traces, guardrail configs, evaluation questions, result rows, dashboard screenshots, slides, README prose beyond minimal metadata facts, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC only as source-review context for Score, Shield, and Watch conversations about Graph RAG, hybrid retrieval, observability, guardrails, and evaluation traces. It is skipped as public-methodology implementation evidence because the source does not require a change to AMC scoring semantics, evidence taxonomy, badge semantics, methodology version, changelog, deprecation notice, or migration guidance.

ODSC Graph RAG workshop metadata alone cannot justify a public methodology version bump. A future AMC methodology change would require an AMC-owned scoring semantic change with versioned methodology text, changelog entry, deprecation notice where applicable, migration guidance, signed evidence refs, replayable eval-pack rows, row hashes, regression thresholds, and no-copy proof. This gap provides no such AMC semantic change.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; no scoring semantic changed. |
| Shield | Context only for guardrail and sensitive-data leakage framing; no Shield verifier changed. |
| Watch | Context only for observability and trace-review framing; no monitor changed. |
| Enforce | No runtime Graph RAG, guardrail, or retrieval policy changed. |
| Vault | No FHIR records, Hugging Face data, notes, prompts, traces, or patient data stored. |
| Fleet | RAG workflow context only; no agent topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0896.

The focused regression verifies that the live source metadata is documented, that ODSC Graph RAG workshop metadata alone cannot justify a public methodology version bump, and that no source-specific identifiers enter public methodology implementation modules.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Star 19, Fork 4, Issues 0, Pull requests 0, 69 Commits, No releases published, Python 99.5%, Shell 0.5%, folder names, file names, ODSC Agentic AI Summit 2025 Workshop labels, GraphGeeks labels, July 16 - 31, 2025 labels, 2,726 FHIR records labels, Hugging Face dataset labels, `data/note.json` labels, `data/fhir.json` labels, BAML labels, Kuzu labels, LanceDB labels, vector index labels, full-text search labels, hybrid search labels, Graph RAG labels, Opik labels, observability labels, guardrails labels, hallucination detection labels, answer relevance labels, moderation labels, usefulness labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing methodology-version evidence requires an AMC-owned methodology version, changelog, deprecation notice where applicable, migration guidance, signed evidence refs, replayable eval-pack rows, row hashes, regression thresholds, and no-copy proof.

## No-bloat boundary

No ODSC workshop adapter, Graph RAG runner, BAML integration, Kuzu integration, LanceDB integration, vector-search adapter, full-text-search adapter, hybrid retrieval runner, Opik integration, dashboard viewer, FHIR importer, Hugging Face dataset importer, guardrail config importer, trace importer, evaluation-question importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, badge semantics change, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream Python source, workshop data, FHIR records, Hugging Face data, BAML prompts, Kuzu files, LanceDB data, Opik traces, guardrail configs, evaluation questions, result rows, dashboard screenshots, slides, README prose beyond minimal metadata facts, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0896OdscAgenticAiSummitPublicMethodologyBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist.
- Focused regression after doc addition: `npx vitest run tests/gap0896OdscAgenticAiSummitPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0895MinorDetectionMetricValidityBoundary.test.ts tests/gap0896OdscAgenticAiSummitPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
