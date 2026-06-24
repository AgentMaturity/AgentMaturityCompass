# GAP-1039 - Standards topology replay corpus

- Gap: `GAP-1039`
- Dimension: Replayable benchmark corpus
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `Navigating Standards in Engineering Design through Latent Textual Topology and LLMs`
- Retrieval: DOI resolver, OpenAlex work API, Crossref works API, ASME landing page/PDF URLs
- Status: Done

## Relevance decision

`GAP-1039` is relevant to AMC only through the existing replay-corpus receipt path. The source is an engineering-design standards article with OpenAlex type `article`, Crossref type `journal-article`, and metadata around standards, technical documentation, latent textual topology, and LLM-assisted navigation. That can inform the kinds of enterprise documentation tasks an AMC-owned replay corpus might cover, but it does not authorize AMC to import the paper, its standards corpus, topology graph, prompts, data, figures, or benchmark outputs.

The AMC product closure is therefore a source-review boundary: Score, Shield, and Watch may use this source as context only when there is an AMC-owned replay manifest, fixture hash, fixed seed, score delta, signed evidence, and CI receipt. Metadata-only references to the DOI, OpenAlex record, ASME page, or PDF fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when an AMC-owned replay fixture produces scored baseline/candidate evidence with a replay manifest and score delta. |
| Shield | Relevant only when the replay row has signed evidence proving safety or assurance checks on AMC-owned tasks. |
| Enforce | Not in scope; this does not add a guardrail, policy runtime, or circuit breaker. |
| Vault | Not in scope; this does not add secrets, privacy, data residency, or storage behavior. |
| Watch | Relevant only when the replay receipt includes CI evidence and can be monitored as replay-corpus readiness, not as source metadata. |
| Fleet | Not in scope; this gap does not add multi-agent orchestration or topology simulation. |
| Passport | Not in scope; this does not mint portable trust tokens or external proof bundles. |
| Comply | Contextual only; engineering standards metadata is not a compliance mapping or public AMC methodology claim. |

## Product closure

No new source-specific product module was added. Existing AMC replay-corpus primitives already enforce the product requirement:

- `src/benchmarks/replayBenchmarkCorpus.ts` builds replay manifests, fixture hashes, score deltas, and CI receipts.
- `src/eval/replayCorpusEvidenceReceipt.ts` converts replay results into fail-closed Score/Shield/Watch evidence receipts.
- `src/diagnostic/evalReplayCorpusBoundary.ts` keeps diagnostic readiness blocked unless complete replay-corpus evidence exists.

The regression test for this gap proves both paths:

- A valid AMC-owned standards-topology replay fixture is accepted only with source refs, Score/Shield/Watch coverage, fixture hash, signed evidence, score delta, and CI receipt.
- A metadata-only standards-topology row fails closed even when it cites the DOI and OpenAlex source metadata.

## Fail-closed rule

Reject any claim that depends only on source metadata. The following are insufficient without AMC-owned replay evidence:

- DOI `10.1115/1.4071459` or `https://doi.org/10.1115/1.4071459`
- OpenAlex record `https://openalex.org/W7139912757`
- OpenAlex API record `https://api.openalex.org/works/W7139912757`
- Crossref API record `https://api.crossref.org/works/10.1115/1.4071459`
- ASME landing page `https://asmedigitalcollection.asme.org/computingengineering/article/doi/10.1115/1.4071459/1232020/Navigating-Standards-in-Engineering-Design-through`
- ASME PDF URL `https://asmedigitalcollection.asme.org/computingengineering/article-pdf/doi/10.1115/1.4071459/7601517/jcise-24-1654.pdf`
- Title text, author names, standards terminology, latent textual topology terminology, or engineering-design metadata

## No-bloat boundary

AMC did not add a standards-topology importer, ASME scraper, engineering-standards subsystem, topology graph runtime, LLM standards navigator, benchmark mirror, prompt set, dataset, copied paper text, copied figures, copied standards corpus, copied technical documentation, copied examples, copied generated outputs, or source-specific scoring path.

The only accepted product behavior remains the generic AMC-owned replay-corpus receipt path.

## Source facts used

Live retrieval on 2026-06-25 verified:

- DOI `https://doi.org/10.1115/1.4071459` returned `HTTP/2 302` to the ASME landing page, then ASME returned `HTTP/2 403` with `cf-mitigated: challenge`; the publisher HTML/PDF content was not used.
- OpenAlex `https://openalex.org/W7139912757` and `https://api.openalex.org/works/W7139912757` returned the title `Navigating Standards in Engineering Design through Latent Textual Topology and LLMs`, publication_date `2026-03-20`, publication year `2026`, source `Journal of Computing and Information Science in Engineering`, `oa_status `hybrid``, `cited_by_count `2``, and PDF URL `https://asmedigitalcollection.asme.org/computingengineering/article-pdf/doi/10.1115/1.4071459/7601517/jcise-24-1654.pdf`.
- Crossref `https://api.crossref.org/works/10.1115/1.4071459` returned DOI `10.1115/1.4071459`, publisher `ASME International`, Crossref type `journal-article`, container title `Journal of Computing and Information Science in Engineering`, page `1-14`, and the same ASME PDF URL.
- Authors observed across OpenAlex/Crossref: Matthew B. Bowen, Logan A. Smith, Cody Carroll / Cody L. Carroll, Mozhdeh Rahmanpour, Tan Pan, and Beshoy Morkos.
- Institutions/concepts observed in OpenAlex include University of Georgia, Universidad Nacional Autónoma de Nicaragua-León, Computer science, Documentation, Software engineering, Engineering design process, Process (computing), Standardization, Technical documentation, Knowledge base, Requirements engineering, and Systems engineering.
- The ASME response was a Cloudflare challenge, so AMC treats the live publisher page/PDF as inaccessible for content review in this slice.

## Verification

- `npx vitest run tests/gap1039StandardsTopologyReplayCorpusBoundary.test.ts --reporter=dot` - expected red before this doc existed: 1 failed / 3 passed, missing source-review doc only.
- `npx vitest run tests/gap1039StandardsTopologyReplayCorpusBoundary.test.ts --reporter=dot` - passed, 1 file / 4 tests.
- `npx vitest run tests/gap1039StandardsTopologyReplayCorpusBoundary.test.ts tests/gap0964PromptNativeSemanticRuntimeReplayCorpusBoundary.test.ts --reporter=dot` - passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Narrow token scan over replay-corpus implementation files - passed, no GAP-1039 identifiers in implementation modules.
- `npm run typecheck` - passed.
- `npm test -- --reporter=dot` - passed, 886 files / 7,529 tests.
