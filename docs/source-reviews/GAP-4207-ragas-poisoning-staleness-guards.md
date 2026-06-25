# GAP-4207 - Ragas poisoning and staleness guard boundary

- Gap: `GAP-4207`
- Dimension: Poisoning and staleness guards
- AMC surfaces requested: Score; Watch; Enforce
- Source reviewed: `Ragas`
- Retrieval: Live Ragas docs, sitemap, selected RAG metric docs, GitHub repository API, and raw docs metadata review on `2026-06-25`
- Status: Done

## Relevance decision

Ragas is relevant to AMC as competitor and adjacent-product source-review context because its current docs describe evaluation loops, datasets, RAG evaluation, faithfulness, context precision, context recall, noise sensitivity, observability, and framework integrations. Those signals map to AMC's RAG guard lane: Score needs evidence-backed quality metrics, Watch needs findings for noisy or stale retrieval context, and Enforce needs a guard decision when retrieved context should be rejected.

GAP-4207 does not require a Ragas adapter, metrics importer, or source-specific runtime. AMC already has the generic signed GAP-4200 RAG grounding evaluation receipt with retrieved chunk provenance, stale chunk flags, poisoning signals, findings, enforcement action, and score impact. GAP-4207 closes by adding a Ragas-style noisy/stale context fixture and documenting the live source boundary.

## Source retrieval

- Ragas docs stable root: `https://docs.ragas.io/en/stable/`
- Ragas docs sitemap: `https://docs.ragas.io/sitemap.xml`
- RAG evaluation docs: `https://docs.ragas.io/en/stable/getstarted/rag_eval/`
- Available metrics docs: `https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/`
- Faithfulness docs: `https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/`
- Context precision docs: `https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/context_precision/`
- Context recall docs: `https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/context_recall/`
- Noise sensitivity docs: `https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/noise_sensitivity/`
- Observability docs: `https://docs.ragas.io/en/stable/howtos/observability/`
- GitHub repository: `https://github.com/vibrantlabsai/ragas`
- GitHub API: `https://api.github.com/repos/vibrantlabsai/ragas`
- Raw docs index checked: `https://raw.githubusercontent.com/vibrantlabsai/ragas/main/docs/index.md`
- Raw faithfulness doc checked: `https://raw.githubusercontent.com/vibrantlabsai/ragas/main/docs/concepts/metrics/available_metrics/faithfulness.md`
- Raw noise sensitivity doc checked: `https://raw.githubusercontent.com/vibrantlabsai/ragas/main/docs/concepts/metrics/available_metrics/noise_sensitivity.md`
- Docs root redirected to stable and returned HTTP `200` with Read the Docs metadata for project `ragas`, version `stable`, and last-modified `2026-01-13`.
- Robots file allowed crawling and pointed to the sitemap.
- Sitemap included RAG evaluation, available metrics, faithfulness, context precision, context recall, noise sensitivity, observability, integrations, agent evals, and CLI pages with `2026-01-13` lastmod entries.
- Stable docs metadata used the description `Evaluation framework for your AI Application`.
- GitHub API verified `vibrantlabsai/ragas` as public, not archived, default branch `main`, language `Python`, license `Apache-2.0`, homepage `https://docs.ragas.io`, topics `evaluation`, `llm`, and `llmops`, with repository metadata updated on `2026-06-25`.
- Ragas docs describe faithfulness as checking factual consistency against retrieved context, and noise sensitivity as evaluating incorrect responses from relevant or irrelevant retrieved documents.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant because Ragas-style RAG metrics map to AMC score evidence, not source metadata. |
| Shield | Adjacent only; noisy/poisoned context is an assurance signal, but no Shield pack changed. |
| Enforce | Relevant because poisoned or noisy retrieval context must produce a blocking guard decision. |
| Vault | Out of scope; no docs, datasets, traces, retrieved contexts, or provider keys were imported. |
| Watch | Relevant because Watch needs signed stale/noisy/poisoned retrieval findings for drilldown. |
| Fleet | Out of scope; no multi-agent topology changed. |
| Passport | Out of scope; no portable trust token schema changed. |
| Comply | Out of scope; no compliance mapping changed. |

## Product closure

No new product code was required. GAP-4207 reused the generic GAP-4200 RAG grounding evaluation receipt in `src/score/ragGroundingEval.ts`.

The focused test proves:

- Ragas-style noisy context is represented only through AMC-owned retrieved chunks, chunk provenance, source citations, stale flags, and poisoning signals;
- stale Ragas context produces a `stale_retrieval` warning;
- noisy or poisoned context produces a `poisoning_signal` blocking finding;
- the rejected chunk path is the existing finding with `block` action;
- the guard decision is the receipt-level `enforcementAction`;
- metadata-only Ragas docs evidence fails closed without retrieved chunks, claim labels, receipt path, and signature;
- no Ragas-specific identifiers were added to generic implementation files.

## Fail-closed rule

metadata-only source evidence fails closed. Ragas docs reachability, sitemap entries, GitHub repository metadata, raw docs files, title text, metrics-page names, faithfulness labels, context precision labels, context recall labels, noise sensitivity labels, observability labels, integration labels, RAG eval labels, local backlog metadata, or competitor identity cannot prove AMC RAG poisoning/staleness protection.

A passing GAP-4207 claim requires the generic signed RAG grounding receipt: query cases, retrieved chunks, chunk provenance, source freshness evidence, stale flags where applicable, poisoning signals where applicable, claim labels, evidence chunk IDs, source citations, findings, receipt-level guard decision, receipt hash, receipt path, and receipt signature path.

## No-bloat boundary

No Ragas adapter, Ragas metrics importer, Ragas dataset importer, Ragas evaluator wrapper, Ragas CLI wrapper, Ragas experiment tracker, Ragas observability adapter, Ragas integration adapter, GitHub importer, docs scraper, sitemap importer, raw-doc importer, RAG runtime, retrieval engine, vector database, poisoning detector model, staleness crawler, embedding drift service, retrieval-set manipulation subsystem, source-specific API route, source-specific CLI command, methodology bump, copied docs prose, copied examples, copied code, copied prompts, copied datasets, copied benchmark rows, copied traces, or copied source outputs were added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap4207RagasPoisoningStalenessBoundary.test.ts --reporter=dot` failed first because this source-review document did not exist; behavior, fail-closed, and no-bloat checks passed through the existing GAP-4200 primitive.
- Live source checks:
  - `curl -sSI -L https://docs.ragas.io` verified redirect to stable docs and live HTTP `200` response.
  - `curl -sS -L --max-time 20 https://docs.ragas.io/robots.txt` verified crawl policy and sitemap URL.
  - `curl -sS -L --max-time 20 https://docs.ragas.io/sitemap.xml` returned the sitemap pages recorded above.
  - `curl -sS -L --max-time 20 https://docs.ragas.io/en/stable/` returned stable docs metadata and navigation.
  - Targeted live fetches for RAG eval, available metrics, faithfulness, context precision, context recall, noise sensitivity, and observability pages returned HTTP `200`.
  - `curl -sS https://api.github.com/repos/vibrantlabsai/ragas` returned the GitHub metadata recorded above.
  - Raw docs fetches for the index, faithfulness, and noise sensitivity pages returned the source-review metadata recorded above.
- Focused test: `npx vitest run tests/gap4207RagasPoisoningStalenessBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression: `npx vitest run tests/gap4207RagasPoisoningStalenessBoundary.test.ts tests/gap4201RagPoisoningStalenessBoundary.test.ts tests/gap4200RagGroundingEvalBoundary.test.ts tests/gap4205FactCheckingGroundingEvalBoundary.test.ts tests/ragMaturity.test.ts tests/memoryMaturity.test.ts tests/truthguard.test.ts tests/claimProvenance.test.ts --reporter=dot` passed, 6 files / 45 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 956 files / 7818 tests.
