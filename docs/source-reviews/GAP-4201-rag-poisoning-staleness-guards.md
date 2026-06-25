# GAP-4201 - RAG poisoning and staleness guard boundary

- Gap: `GAP-4201`
- Dimension: Poisoning and staleness guards
- AMC surfaces requested: Score; Watch; Enforce
- Source reviewed: `A Survey on Retrieval-Augmented Text Generation for Large Language Models`
- Retrieval: Live OpenAlex, DOI redirect, Crossref, ACM page, and OpenAlex arXiv-location metadata review on `2026-06-25`
- Status: Done

## Relevance decision

The source is relevant to AMC because it surveys retrieval-augmented generation from the retrieval viewpoint, including source recency, external information, reliability, RAG evaluation methods, and the retrieval pipeline across pre-retrieval, retrieval, post-retrieval, and generation. Those signals map to AMC's existing RAG guard need: Score needs measurable source freshness and poisoning rates, Watch needs operator-visible findings, and Enforce needs guard decisions when retrieved context is stale or manipulated.

GAP-4201 does not require a new RAG subsystem. AMC already has the generic signed GAP-4200 RAG grounding evaluation receipt with retrieved chunk provenance, stale chunk flags, poisoning signals, findings, enforcement action, and score impact. GAP-4201 closes by adding a representative poisoning/staleness fixture and documenting the live source boundary.

## Source retrieval

- OpenAlex work: `https://openalex.org/W4394947112`
- OpenAlex API: `https://api.openalex.org/works/W4394947112`
- DOI: `https://doi.org/10.1145/3805774`
- Crossref API: `https://api.crossref.org/works/10.1145/3805774`
- ACM landing page: `https://dl.acm.org/doi/10.1145/3805774`
- arXiv location from OpenAlex: `https://arxiv.org/abs/2404.10981`
- Title: `A Survey on Retrieval-Augmented Text Generation for Large Language Models`
- Venue from OpenAlex and Crossref: `ACM Computing Surveys`
- Publisher from Crossref: `Association for Computing Machinery`
- DOI from OpenAlex and Crossref: `10.1145/3805774`
- OpenAlex publication date: `2026-04-09`
- Crossref published-online date: `2026-05-15`
- Crossref published-print date: `2026-09-30`
- OpenAlex primary location host organization: `Association for Computing Machinery`
- OpenAlex license: `cc-by`
- Crossref license URL: `https://creativecommons.org/licenses/by/4.0/legalcode`
- Authors from OpenAlex and Crossref: Yizheng Huang and Jimmy Xiangji Huang.
- OpenAlex indexed locations include ACM DOI, arXiv `2404.10981`, and arXiv DOI metadata.
- DOI live check returned HTTP `302` to the ACM landing page. The ACM page then returned HTTP `403` with a Cloudflare challenge, so AMC does not claim or copy article body content from ACM.
- Crossref and OpenAlex metadata describe RAG as dynamic integration of up-to-date external information and categorize the RAG pipeline across pre-retrieval, retrieval, post-retrieval, and generation.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant because stale and poisoned chunks lower RAG evidence confidence and score impact. |
| Shield | Adjacent only; poisoning is an assurance signal, but no Shield pack changed. |
| Enforce | Relevant because poisoning signals produce blocking guard decisions and stale chunks produce warnings. |
| Vault | Out of scope; no source content, retrieval corpus, or secure storage behavior changed. |
| Watch | Relevant because Watch needs signed findings for stale retrieval and poisoned retrieval drilldown. |
| Fleet | Out of scope; no multi-agent topology changed. |
| Passport | Out of scope; no portable trust token schema changed. |
| Comply | Out of scope; no compliance mapping changed. |

## Product closure

No new product code was required. GAP-4201 reused the generic GAP-4200 RAG grounding evaluation receipt in `src/score/ragGroundingEval.ts`.

The focused test proves:

- source freshness is represented by AMC-owned chunk provenance, document version, ingestion timestamp, stale flag, and source citation evidence;
- poisoning is represented by AMC-owned retrieved chunk evidence and `poisoning_signal` findings;
- the rejected chunk path is the existing `poisoning_signal` finding with `block` action;
- the guard decision is the receipt-level `enforcementAction`;
- metadata-only paper evidence fails closed without retrieved chunks, claim labels, receipt path, and signature;
- no source-specific identifiers were added to generic implementation files.

## Fail-closed rule

metadata-only source evidence fails closed. OpenAlex metadata, Crossref metadata, ACM DOI metadata, ACM landing page reachability, arXiv location metadata, article title, author names, venue name, RAG survey labels, up-to-date-external-information labels, retrieval-pipeline labels, source freshness labels, poisoning labels, staleness labels, rejected chunk labels, guard-decision labels, or local backlog text cannot prove AMC RAG poisoning/staleness protection.

A passing GAP-4201 claim requires the generic signed RAG grounding receipt: query cases, retrieved chunks, chunk provenance, source freshness evidence, stale flags where applicable, poisoning signals where applicable, claim labels, evidence chunk IDs, source citations, findings, receipt-level guard decision, receipt hash, receipt path, and receipt signature path.

## No-bloat boundary

No ACM survey importer, ACM scraper, Crossref importer, OpenAlex importer, DOI importer, arXiv importer, RAG survey taxonomy, RAG framework clone, RAG runtime, retrieval engine, vector database, poisoning detector model, staleness crawler, embedding drift service, retrieval-set manipulation subsystem, source-specific API route, source-specific CLI command, methodology bump, copied article prose, copied abstract, copied reference list, copied figures, copied tables, copied prompts, copied datasets, copied benchmark rows, or copied source outputs were added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap4201RagPoisoningStalenessBoundary.test.ts --reporter=dot` failed first because this source-review document did not exist; behavior, fail-closed, and no-bloat checks passed through the existing GAP-4200 primitive.
- Live source checks:
  - `curl -sS https://api.openalex.org/works/W4394947112` returned the OpenAlex metadata recorded above.
  - `curl -sS https://api.crossref.org/works/10.1145/3805774` returned the Crossref metadata recorded above.
  - `curl -sSI -L https://doi.org/10.1145/3805774` returned a DOI redirect to ACM and then an ACM Cloudflare challenge.
  - `curl -sS -L --max-time 20 https://dl.acm.org/doi/10.1145/3805774` returned the ACM Cloudflare challenge page, not article body content.
- Focused test: `npx vitest run tests/gap4201RagPoisoningStalenessBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression: `npx vitest run tests/gap4201RagPoisoningStalenessBoundary.test.ts tests/gap4200RagGroundingEvalBoundary.test.ts tests/gap4205FactCheckingGroundingEvalBoundary.test.ts tests/ragMaturity.test.ts tests/memoryMaturity.test.ts tests/truthguard.test.ts tests/claimProvenance.test.ts --reporter=dot` passed, 5 files / 41 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 955 files / 7814 tests.
