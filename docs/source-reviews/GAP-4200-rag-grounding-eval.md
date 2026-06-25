# GAP-4200 - RAG grounding evaluation receipt

- Gap: `GAP-4200`
- Dimension: Grounding and retrieval evaluation
- AMC surfaces requested: Score; Watch; Enforce
- Source reviewed: `Affordance-Compiled Intelligence: Observable-Only Cognitive Impedance Matching for No-Meta LLM-Integrated Systems`
- Retrieval: Live OpenAlex, DOI redirect, Zenodo API, and arXiv landing-page review on `2026-06-25`
- Status: Done

## Relevance decision

GAP-4200 is relevant to AMC because RAG and memory-backed agents can look mature while producing unsupported, contradicted, stale, or poorly sourced answers. The relevant AMC product need is a signed grounding-evaluation receipt that binds a query set, retrieved chunks, claim labels, and faithfulness score to Score, Watch, and Enforce.

The specific backlog source has a live metadata mismatch, so it is not accepted as proof of any source-specific methodology. OpenAlex `W3027879771` returned the backlog title and DOI, but its primary location pointed to arXiv `2005.11401`, whose live page is `Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks` by Patrick Lewis and coauthors. The DOI `10.5281/zenodo.18717227` redirected to Zenodo record `18717228`, whose live title is `When Systems Turn Inward (II): Windows in the Room`. Those inconsistencies make the source useful only as a source-review warning: AMC must fail closed on metadata-only RAG grounding claims.

## Source retrieval

- Backlog/OpenAlex work: `https://openalex.org/W3027879771`
- OpenAlex API: `https://api.openalex.org/works/W3027879771`
- Backlog DOI: `https://doi.org/10.5281/zenodo.18717227`
- DOI redirect target: `https://zenodo.org/records/18717228`
- Zenodo API target: `https://zenodo.org/api/records/18717228`
- arXiv primary location from OpenAlex: `http://arxiv.org/abs/2005.11401`
- OpenAlex returned title: `Affordance-Compiled Intelligence: Observable-Only Cognitive Impedance Matching for No-Meta LLM-Integrated Systems`
- OpenAlex returned type: `preprint`
- OpenAlex returned publication date: `2026-03-13`
- OpenAlex returned concepts: Artificial intelligence, Computer science, Natural language processing, and Information retrieval.
- OpenAlex primary location mismatch: arXiv landing page `2005.11401`.
- arXiv title at that primary location: `Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks`
- arXiv authors include Patrick Lewis, Ethan Perez, Aleksandra Piktus, and Fabio Petroni.
- Zenodo DOI redirect returned final record `18717228`.
- Zenodo record title: `When Systems Turn Inward (II): Windows in the Room`
- Zenodo record publication date: `2026-03-26`
- Zenodo record license: `cc-by-4.0`
- Zenodo record keywords include grounding, provenance, verification, AI reliability, hallucinations, and evaluation.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant because answer faithfulness, retrieved support quality, unsupported claim rate, and contradiction rate affect score confidence. |
| Shield | Adjacent only; poisoning signals are recorded, but no Shield pack changed. |
| Enforce | Relevant because high-confidence unsupported, contradicted, stale, or poisoned retrieval findings produce warn/block actions. |
| Vault | Adjacent only; no secret, PII, or secure-storage behavior changed. |
| Watch | Relevant because Watch needs signed grounding receipts and findings for runtime drilldown. |
| Fleet | Out of scope for this gap; receipts can be attached to agents later, but no fleet topology changed. |
| Passport | Out of scope; no portable trust token schema changed. |
| Comply | Out of scope; audit evidence improves traceability, but no compliance mapping changed. |

## Product closure

Added `src/score/ragGroundingEval.ts`, exported it from `src/score/index.ts`, and added `rag-grounding-eval-receipt` as a signed artifact kind.

The generic receipt records:

- query IDs, query hashes, answer hashes, retrieved chunk hashes, source metadata, rank, score, stale flags, and poisoning flags;
- claim labels for supported, unsupported, contradicted, and unknown claims;
- claim evidence chunk IDs and citation IDs;
- faithfulness score, retrieved support quality, unsupported claim rate, contradiction rate, stale chunk rate, poisoning signal rate, and provenance coverage;
- Score/Watch/Enforce findings with warn or block actions;
- score penalty, receipt hash, receipt path, and artifact signature path.

`tests/gap4200RagGroundingEvalBoundary.test.ts` proves positive signed receipt behavior, metadata-only fail-closed behavior, missing retrieved evidence fail-closed behavior, and no-bloat source boundaries.

## Fail-closed rule

metadata-only source evidence fails closed. OpenAlex metadata, DOI metadata, Zenodo metadata, arXiv title, author names, concepts, keywords, backlog text, or local source-review notes cannot prove RAG grounding.

A passing GAP-4200 claim requires AMC-owned query cases, retrieved chunks, chunk provenance, claim labels, supported or contradicted claim evidence linked to retrieved chunk IDs, faithfulness metrics, retrieved support metrics, findings, receipt hash, receipt path, and receipt signature path. Missing cases, missing retrieved chunks, missing claim labels, missing source citations, missing chunk provenance, supported/contradicted claims without retrieved evidence, receipt-hash mismatch, missing receipt path, or missing signature fails closed.

## No-bloat boundary

No Affordance-Compiled Intelligence subsystem, Cognitive Impedance Matching implementation, no-meta compiler theory implementation, RAG paper importer, Zenodo importer, OpenAlex importer, arXiv importer, DOI importer, RAG runtime, retrieval engine, vector database, chunking subsystem, source-specific API route, source-specific CLI command, methodology bump, copied paper prose, copied abstract, copied figures, copied examples, copied prompts, copied datasets, copied benchmark rows, or copied source outputs were added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap4200RagGroundingEvalBoundary.test.ts --reporter=dot` failed first because `src/score/ragGroundingEval.ts` did not exist.
- After implementation, focused test failed only because this source-review document did not exist; receipt behavior, fail-closed, and no-bloat checks passed.
- Live source checks:
  - `curl -sS https://api.openalex.org/works/W3027879771` returned the OpenAlex metadata and primary-location mismatch recorded above.
  - `curl -sSI -L https://doi.org/10.5281/zenodo.18717227` redirected to `https://zenodo.org/records/18717228`.
  - `curl -sS https://zenodo.org/api/records/18717228` returned the Zenodo metadata recorded above.
  - `curl -sS -L --max-time 20 https://arxiv.org/abs/2005.11401` returned the arXiv title and author metadata recorded above.
- Focused test: `npx vitest run tests/gap4200RagGroundingEvalBoundary.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Related RAG/truthguard regression: `npx vitest run tests/gap4200RagGroundingEvalBoundary.test.ts tests/ragMaturity.test.ts tests/garageLiveDrift.test.ts tests/ragTextGenerationLiveDrift.test.ts tests/gap0922ProductionRagMetricValidityBoundary.test.ts tests/truthguard.test.ts tests/claimProvenance.test.ts --reporter=dot` passed, 6 files / 41 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 953 files / 7,806 tests.
