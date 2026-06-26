# GAP-0829 - OHR-Bench live-drift boundary

- Gap: `GAP-0829`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `opendatalab/OHR-Bench`, `https://github.com/opendatalab/OHR-Bench`
- Retrieval: `2026-06-21` via live GitHub header and GitHub connector file probes. Repository URL returned HTTP/2 200. README.md was available. LICENSE lookup returned 404. README.md links `https://arxiv.org/abs/2412.02592v2`, Hugging Face, and OpenDataLab dataset pages.
- Status: closed through existing Watch live score and behavior drift receipts; no OHR-Bench integration, OCR-RAG benchmark runner, dataset importer, Hugging Face mirror, OpenDataLab mirror, OCR adapter, or source-specific monitor added.

## Live source metadata

The live README.md identifies OHR-Bench as official code for `OCR Hinders RAG: Evaluating the Cascading Impact of OCR on Retrieval-Augmented Generation` and notes ICCV 2025 acceptance. It describes a benchmark for evaluating the cascading impact of OCR on retrieval-augmented generation, including 8500+ unstructured PDF pages from 7 domains such as Textbook, Law, Finance, Newspaper, Manual, Academic, and Administration. The README.md also describes 8498 Q&A, human-verified ground truth structured data, Semantic Noise, Formatting Noise, and evaluation of retrieval, generation, and overall performance.

These facts are useful source-review context for document-RAG drift risk. They are not AMC product evidence by themselves and do not authorize copying benchmark rows, datasets, OCR outputs, prompts, evaluation code, screenshots, model responses, or repository implementation details.

No upstream README prose beyond minimal metadata facts, source code, benchmark data, dataset records, OCR perturbation outputs, formulas, charts, prompts, examples, screenshots, generated outputs, or repository files were copied into AMC.

## Relevance decision

GAP-0829 is relevant to AMC only through existing Watch live score and behavior drift primitives. OCR-RAG and document-parsing systems can drift after provider, model, OCR, retrieval-index, prompt, corpus, ranking, or formatting changes. AMC can evaluate that risk only when it has its own baseline distribution, live sample, drift statistic, and alert receipt for the agent or workflow under review.

The acceptable closure is therefore generic and evidence-led: source refs, signed evidence refs, row hashes, behavior signatures, receipt hash, no-copy proof, Watch alert or waiver proof, and verification of the drift receipt. Repository reachability, README claims, benchmark labels, dataset links, arXiv metadata, OCR metrics, or OHR-Bench identity alone fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions and score-drift statistics for observed OCR-RAG behavior. |
| Shield | Relevant through fail-closed signed evidence requirements before a drift, robustness, or safety claim can pass. |
| Watch | Relevant through existing live-drift receipts, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No runtime OCR, retrieval, routing, model, or policy circuit breaker changed. |
| Vault | No PDFs, OCR outputs, datasets, prompts, or secure-storage behavior changed. |
| Fleet | Document-RAG workflow context only; no orchestration topology, routing layer, or multi-agent runtime changed. |
| Passport | No portable trust token, external proof bundle, or badge schema changed. |
| Comply | Benchmark context only; no EU AI Act, NIST, ISO, SOC2, or clinical/legal compliance mapping changed. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, OHR-Bench integration, OCR-RAG benchmark runner, dataset importer, Hugging Face mirror, OpenDataLab mirror, OCR adapter, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0829.

The focused regression exercises the existing Watch live-drift engine with OCR-RAG-style fixture data. The positive path emits score, behavior, latency, and cost Watch alerts with a valid signed live-drift receipt. The negative path fails closed when repository metadata replaces signed live-drift evidence.

## Fail-closed rule

Repository URL, GitHub HTTP/2 200 reachability, README.md availability, LICENSE lookup returned 404, ICCV 2025 label, OHR-Bench name, arXiv link, Hugging Face link, OpenDataLab link, 8500+ unstructured PDF pages, 7 domains, 8498 Q&A, human-verified ground truth structured data, Semantic Noise, Formatting Noise, retrieval label, generation label, overall performance label, OCR metric, dataset identity, or benchmark identity alone must fail closed for live-drift claims.

Passing evidence requires an AMC-owned baseline distribution, live sample rows, drift statistic, alert receipt, source refs, signed evidence refs, row hashes, behavior signatures, receipt hash, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No OHR-Bench integration, OCR-RAG benchmark runner, dataset importer, Hugging Face mirror, OpenDataLab mirror, OCR adapter, OpenTelemetry/OpenLLMetry subsystem, repository importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream source code, benchmark data, dataset records, OCR perturbation outputs, formulas, charts, prompts, examples, screenshots, generated outputs, README prose beyond minimal metadata facts, or repository files were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0829OhrBenchLiveDriftBoundary.test.ts --reporter=dot`
- Slice regression: `npx vitest run tests/gap0828LegalDocumentAssistantLiveDriftBoundary.test.ts tests/gap0829OhrBenchLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
