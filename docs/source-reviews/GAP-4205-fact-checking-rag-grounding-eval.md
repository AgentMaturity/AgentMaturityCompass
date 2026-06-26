# GAP-4205 - Fact-checking RAG grounding evaluation boundary

- Gap: `GAP-4205`
- Dimension: Grounding and retrieval evaluation
- AMC surfaces requested: Score; Watch; Enforce
- Source reviewed: `Hallucination to truth: a review of fact-checking and factuality evaluation in large language models`
- Retrieval: Live OpenAlex, DOI redirect, Crossref, and Springer article metadata review on `2026-06-25`
- Status: Done

## Relevance decision

The source is relevant to AMC because it reviews factuality evaluation and fact-checking for LLM outputs, including hallucination risk, evidence quality, fact-checking frameworks, retrieval-augmented generation, and validated external evidence. Those signals map directly to AMC's RAG grounding requirement: Score should measure faithfulness and unsupported claims, Watch should surface grounding findings, and Enforce should warn or block unsafe groundedness failures.

GAP-4205 does not require a new product subsystem because GAP-4200 already added the generic signed RAG grounding evaluation receipt. GAP-4205 closes by documenting the live source boundary and proving that the fact-checking review context is accepted only through that AMC-owned query set, retrieved chunks, claim labels, and faithfulness score primitive.

## Source retrieval

- OpenAlex work: `https://openalex.org/W7118132038`
- OpenAlex API: `https://api.openalex.org/works/W7118132038`
- DOI: `https://doi.org/10.1007/s10462-025-11454-w`
- Crossref API: `https://api.crossref.org/works/10.1007/s10462-025-11454-w`
- Springer article page: `https://link.springer.com/article/10.1007/s10462-025-11454-w`
- Title: `Hallucination to truth: a review of fact-checking and factuality evaluation in large language models`
- Venue: `Artificial Intelligence Review`
- Publisher from Crossref: `Springer Science and Business Media LLC`
- Publication date from OpenAlex and Crossref: `2026-01-03`
- OpenAlex type: `article`
- Crossref type: `journal-article`
- OpenAlex license: `cc-by`
- Crossref license URL: `https://creativecommons.org/licenses/by/4.0`
- Authors from OpenAlex include S M Asif Ur Rahman, Md. Adnanul Islam, Md. Mahbub Alam, Musarrat Zeba, Md Abdur Rahman, Sadia Sultana Chowa, Mohaimenul Azam Khan Raiaan, and Sami Azam.
- Springer page metadata confirmed title, journal, DOI, and abstract metadata.
- Springer page metadata describes robust fact-checking needs, factual accuracy evaluation, hallucinations, dataset limitations, evaluation-metric reliability, prompting strategies, domain-specific fine-tuning, retrieval-augmented generation methods, multi-agent reasoning, validated external evidence, factual consistency, and context-aware fact-checking.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant because factuality and faithfulness failures lower score confidence. |
| Shield | Adjacent only; hallucination and misinformation risk can feed assurance packs, but no Shield pack changed. |
| Enforce | Relevant because grounding findings produce warn/block actions through the existing receipt. |
| Vault | Out of scope; no source datasets, prompts, outputs, or secure storage behavior changed. |
| Watch | Relevant because Watch needs signed findings for grounding drilldown. |
| Fleet | Out of scope; no fleet topology changed. |
| Passport | Out of scope; no portable trust token schema changed. |
| Comply | Out of scope; no compliance mapping changed. |

## Product closure

No new product code was required. GAP-4205 reused the generic GAP-4200 RAG grounding evaluation receipt in `src/score/ragGroundingEval.ts`.

The focused test proves:

- fact-checking context can be represented only through AMC-owned query cases, retrieved chunks, claim labels, and source citations;
- unknown high-confidence claims produce Watch/Enforce findings and a `warn` action;
- metadata-only paper evidence fails closed without retrieved chunks, claim labels, receipt path, and signature;
- no source-specific identifiers were added to generic implementation files.

## Fail-closed rule

metadata-only source evidence fails closed. OpenAlex metadata, Crossref metadata, Springer metadata, article title, DOI, author names, journal name, abstract labels, hallucination labels, factuality labels, fact-checking labels, RAG labels, validated-external-evidence labels, or local backlog text cannot prove AMC RAG grounding.

A passing GAP-4205 claim requires the generic signed RAG grounding receipt: query cases, retrieved chunks, chunk provenance, claim labels, evidence chunk IDs, source citations, faithfulness metrics, findings, receipt hash, receipt path, and receipt signature path.

## No-bloat boundary

No fact-checking review importer, Springer importer, Crossref importer, OpenAlex importer, DOI importer, factuality-review subsystem, hallucination benchmark mirror, fact-checking framework clone, RAG runtime, retrieval engine, vector database, source-specific API route, source-specific CLI command, methodology bump, copied article prose, copied abstract, copied reference list, copied figures, copied tables, copied prompts, copied datasets, copied benchmark rows, or copied source outputs were added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap4205FactCheckingGroundingEvalBoundary.test.ts --reporter=dot` failed first because this source-review document did not exist; behavior, fail-closed, and no-bloat checks passed through the existing GAP-4200 primitive.
- Live source checks:
  - `curl -sS https://api.openalex.org/works/W7118132038` returned the OpenAlex metadata recorded above.
  - `curl -sSI -L https://doi.org/10.1007/s10462-025-11454-w` resolved through Springer article routing.
  - `curl -sS https://api.crossref.org/works/10.1007/s10462-025-11454-w` returned the Crossref metadata recorded above.
  - `curl -sS -L --max-time 20 'https://link.springer.com/article/10.1007/s10462-025-11454-w'` returned the Springer metadata recorded above.
- Focused test: `npx vitest run tests/gap4205FactCheckingGroundingEvalBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression: `npx vitest run tests/gap4205FactCheckingGroundingEvalBoundary.test.ts tests/gap4200RagGroundingEvalBoundary.test.ts tests/ragMaturity.test.ts tests/truthguard.test.ts tests/claimProvenance.test.ts --reporter=dot` passed, 4 files / 37 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 954 files / 7810 tests.
