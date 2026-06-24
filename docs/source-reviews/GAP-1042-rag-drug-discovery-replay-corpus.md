# GAP-1042 - RAG drug discovery replay corpus

- Gap: `GAP-1042`
- Dimension: Replayable benchmark corpus
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `RAG-Enhanced Collaborative LLM Agents for Drug Discovery`
- Retrieval: DOI resolver, AAAI OJS article metadata, AAAI PDF endpoint, OpenAlex work API, Crossref works API
- Status: Done

## Relevance decision

`GAP-1042` is relevant to AMC only through the existing replay-corpus receipt path. The source is a drug-discovery paper about RAG-enhanced collaborative LLM agents. That can inform the style of enterprise/scientific tasks that an AMC-owned replay corpus might cover, but it does not justify adding a drug discovery subsystem, biomedical RAG agent, molecule workflow, compound dataset, AAAI scraper, source importer, paper mirror, benchmark mirror, or source-specific scoring path.

Score, Shield, and Watch may use this source only as context when an AMC-owned replay manifest, fixture hash, fixed seed, score delta, signed evidence, source refs, and CI receipt exist. Source metadata alone fails closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when an AMC-owned replay fixture produces scored baseline/candidate evidence with a replay manifest and score delta. |
| Shield | Relevant only when the replay row has signed evidence proving safety or assurance checks on AMC-owned tasks. |
| Enforce | Not in scope; this does not add runtime guardrails, policy enforcement, or circuit breakers. |
| Vault | Not in scope; this does not add secrets, privacy, data residency, or storage behavior. |
| Watch | Relevant only when the replay receipt includes CI evidence and can be monitored as replay-corpus readiness, not as source metadata. |
| Fleet | Contextual only; collaborative-agent metadata does not add AMC fleet orchestration or topology. |
| Passport | Not in scope; this does not mint portable trust tokens or external proof bundles. |
| Comply | Contextual only; drug-discovery metadata is not an AMC compliance mapping or clinical/scientific claim. |

## Product closure

No new source-specific product module was added. Existing AMC replay-corpus primitives already enforce the product requirement:

- `src/benchmarks/replayBenchmarkCorpus.ts` builds replay manifests, fixture hashes, score deltas, and CI receipts.
- `src/eval/replayCorpusEvidenceReceipt.ts` converts replay results into fail-closed Score/Shield/Watch evidence receipts.
- `src/diagnostic/evalReplayCorpusBoundary.ts` keeps diagnostic readiness blocked unless complete replay-corpus evidence exists.

The regression test for this gap proves both paths:

- A valid AMC-owned drug-discovery replay fixture is accepted only with source refs, Score/Shield/Watch coverage, fixture hash, signed evidence, score delta, and CI receipt.
- A metadata-only drug-discovery/RAG/collaborative-agent row fails closed even when it cites the DOI, OpenAlex, Crossref, AAAI article page, and PDF URL.

## Fail-closed rule

Reject any claim that depends only on source metadata. The following are insufficient without AMC-owned replay evidence:

- DOI `10.1609/aaai.v40i1.37020` or `https://doi.org/10.1609/aaai.v40i1.37020`
- OpenAlex record `https://openalex.org/W7137823239`
- OpenAlex API record `https://api.openalex.org/works/W7137823239`
- Crossref API record `https://api.crossref.org/works/10.1609/aaai.v40i1.37020`
- AAAI article page `https://ojs.aaai.org/index.php/AAAI/article/view/37020`
- AAAI PDF URL `https://ojs.aaai.org/index.php/AAAI/article/download/37020/40982`
- Title, author, institution, proceedings, drug discovery, RAG, collaborative-agent, workflow, data science, precision medicine, drug, risk-analysis, abstract, or concept metadata

## No-bloat boundary

AMC did not add a drug discovery subsystem, biomedical RAG agent, molecule workflow, compound workflow, compound dataset, pharmacology benchmark, AAAI scraper, DOI adapter, Crossref adapter, OpenAlex importer, PDF parser, paper mirror, benchmark mirror, dataset mirror, prompt set, collaborative-agent trace importer, API route, CLI command, Studio panel, Watch panel, source-specific replay module, copied paper prose, copied abstract, copied tables, copied figures, copied prompts, copied biomedical datasets, copied compound records, copied benchmark rows, copied examples, copied generated outputs, or copied source content.

The only accepted product behavior remains the generic AMC-owned replay-corpus receipt path.

## Source facts used

Live retrieval on 2026-06-25 verified:

- DOI redirect `https://doi.org/10.1609/aaai.v40i1.37020` returned `HTTP/2 302` to `https://ojs.aaai.org/index.php/AAAI/article/view/37020`; the AAAI article returned HTTP/2 200.
- The AAAI article metadata returned title `RAG-Enhanced Collaborative LLM Agents for Drug Discovery`, proceedings `Proceedings of the AAAI Conference on Artificial Intelligence`, PDF URL `https://ojs.aaai.org/index.php/AAAI/article/download/37020/40982`, DOI `10.1609/aaai.v40i1.37020`, volume `40`, firstpage `561`, and lastpage `569`.
- The PDF endpoint returned HTTP/2 200 with `content-type: application/pdf`.
- OpenAlex `https://openalex.org/W7137823239` and `https://api.openalex.org/works/W7137823239` returned title `RAG-Enhanced Collaborative LLM Agents for Drug Discovery`, publication_date `2026-03-14`, publication year `2026`, OpenAlex type `article`, journal `Proceedings of the AAAI Conference on Artificial Intelligence`, `oa_status `diamond``, `cited_by_count `1``, and PDF URL `https://ojs.aaai.org/index.php/AAAI/article/download/37020/40982`.
- Crossref `https://api.crossref.org/works/10.1609/aaai.v40i1.37020` returned DOI `10.1609/aaai.v40i1.37020`, publisher `Association for the Advancement of Artificial Intelligence (AAAI)`, Crossref type `journal-article`, container title `Proceedings of the AAAI Conference on Artificial Intelligence`, page `561-569`, and the same AAAI PDF URL.
- Authors/institution observed across source metadata: Namkyeong Lee, Edward De Brouwer, Ehsan Hajiramezanali, Tommaso Biancalani, Chanyoung Park, Gabriele Scalia, and Korea Advanced Institute of Science and Technology.
- Concepts observed in OpenAlex include Drug discovery, Workflow, Computer science, Variety (cybernetics), Data science, Flexibility (engineering), Key (lock), Matching (statistics), Data discovery, Precision medicine, Drug, and Risk analysis (engineering).

## Verification

- `npx vitest run tests/gap1042RagDrugDiscoveryReplayCorpusBoundary.test.ts --reporter=dot` - expected red before this doc existed: 1 failed / 3 passed, missing source-review doc only.
- `npx vitest run tests/gap1042RagDrugDiscoveryReplayCorpusBoundary.test.ts --reporter=dot` - passed, 1 file / 4 tests.
- `npx vitest run tests/gap1042RagDrugDiscoveryReplayCorpusBoundary.test.ts tests/gap1039StandardsTopologyReplayCorpusBoundary.test.ts --reporter=dot` - passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Narrow token scan over replay-corpus implementation files - passed, no GAP-1042 identifiers in implementation modules.
- `npm run typecheck` - passed.
- `npm test -- --reporter=dot` - passed, 889 files / 7,540 tests.
