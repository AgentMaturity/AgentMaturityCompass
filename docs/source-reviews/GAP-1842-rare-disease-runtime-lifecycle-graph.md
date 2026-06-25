# GAP-1842 - rare disease signed runtime lifecycle graph

- Gap: `GAP-1842`
- Dimension: Signed runtime lifecycle graph
- AMC surfaces requested: Fleet; Watch; Studio
- Source reviewed: `An agentic system for rare disease diagnosis with traceable reasoning`
- Retrieval: Live OpenAlex, DOI, Crossref, and Nature metadata review on `2026-06-25`
- Status: Done

## Relevance decision

The source is relevant to AMC as runtime-orchestration context because it describes a multi-agent rare disease decision-support system that uses traceable reasoning, transparent reasoning, and verifiable medical evidence. Those source facts reinforce AMC's existing need to preserve a replayable runtime lifecycle graph for high-risk agent runs.

GAP-1842 maps to the same AMC-owned runtime lifecycle graph primitive closed in GAP-1838. AMC should record plan, tool, memory, handoff, retry, and finalization nodes from signed runtime events, then export a graph that Fleet, Watch, and Studio can use to reconstruct runtime behavior.

The source is clinical context only. AMC does not make a rare disease diagnosis claim and does not add a healthcare adapter or clinical workflow.

## Source retrieval

- OpenAlex work: `https://openalex.org/W7130436101`
- OpenAlex API: `https://api.openalex.org/works/W7130436101`
- DOI: `https://doi.org/10.1038/s41586-025-10097-9`
- Nature article page: `https://www.nature.com/articles/s41586-025-10097-9`
- Crossref API: `https://api.crossref.org/works/10.1038/s41586-025-10097-9`
- Title: `An agentic system for rare disease diagnosis with traceable reasoning`
- Source: `Nature`
- Publication date verified from live metadata: `2026-02-18`
- OpenAlex source facts: article type, Nature venue, DOI, PubMed ID, open-access metadata, primary topic `Genomics and Rare Diseases`, and concepts including rare disease, ontology, artificial intelligence, differential diagnosis, expert system, and medical decision making.
- Crossref source facts: DOI, title, Nature container, published-online date, page range, CC BY-NC-ND license metadata, and metadata for a rare-disease agentic decision-support source.
- Nature source facts: article title, DOI metadata, Nature journal title, publication date, volume/issue/page metadata, and article page metadata.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Indirect only; graph replay can support scoring evidence, but no scoring methodology changed. |
| Shield | Adjacent only; clinical reasoning failures can become findings, but no Shield pack changed. |
| Enforce | Adjacent only; tool and handoff edges can carry receipts, but no runtime guardrail changed. |
| Vault | Adjacent through signed event and graph artifacts; no new secure storage surface changed. |
| Watch | Relevant because Watch needs replayable runtime evidence for incident reconstruction. |
| Fleet | Relevant because Fleet needs comparable lifecycle health across multi-agent handoffs. |
| Passport | Out of scope for this gap; no portable trust token field changed. |
| Comply | Out of scope for this gap; no clinical compliance claim or medical regulatory mapping changed. |

## Product closure

No product code changed for this source. Existing `src/runtime/lifecycleGraph.ts` already builds and verifies generic signed runtime lifecycle graphs for Fleet, Watch, and Studio.

`tests/gap1842RareDiseaseRuntimeLifecycleGraphBoundary.test.ts` proves the existing graph primitive can close a traceable clinical reasoning run without adding source-specific implementation. The test records a signed plan, evidence lookup tool call, memory write, clinician-review handoff, retry, and finalization path; it also proves metadata-only paper evidence fails closed.

## Fail-closed rule

metadata-only source evidence fails closed. OpenAlex metadata, DOI metadata, Nature page metadata, Crossref metadata, article title, Nature venue, rare disease labels, traceable reasoning labels, transparent reasoning labels, verifiable medical evidence labels, multi-agent labels, medical performance claims, or local backlog text cannot prove a runtime lifecycle graph.

A passing GAP-1842 claim requires signed runtime events, plan/tool/memory/handoff/retry/finalization nodes, event signatures, edge timestamps, receipts on tool and handoff edges, a replay hash, and a graph hash. Missing nodes, missing signed event lineage, missing tool receipt, missing handoff receipt, missing edge timestamp, or graph-hash mismatch fails closed.

## No-bloat boundary

No clinical subsystem, rare disease subsystem, diagnosis module, medical advice feature, healthcare adapter, DeepRare adapter, Nature importer, OpenAlex importer, Crossref importer, DOI importer, PubMed importer, clinical dataset importer, source-specific runtime adapter, source-specific Studio route, source-specific CLI command, methodology bump, copied paper prose, copied abstract, copied supplementary material, copied examples, copied prompts, copied configs, or copied upstream outputs were added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1842RareDiseaseRuntimeLifecycleGraphBoundary.test.ts --reporter=dot` failed only because this source-review document did not exist; the runtime graph behavior, fail-closed, and no-bloat checks passed.
- Live source checks:
  - `curl -sS https://api.openalex.org/works/W7130436101` returned OpenAlex metadata recorded above.
  - `curl -sSI -L https://doi.org/10.1038/s41586-025-10097-9` resolved to the Nature article page and returned HTTP/2 `200`.
  - `curl -sS https://api.crossref.org/works/10.1038/s41586-025-10097-9` returned Crossref metadata recorded above.
  - `curl -sSL 'https://www.nature.com/articles/s41586-025-10097-9?error=cookies_not_supported'` returned Nature article metadata for the title, DOI, journal, date, and page facts.
- Focused test: `npx vitest run tests/gap1842RareDiseaseRuntimeLifecycleGraphBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related runtime lifecycle graph regression: `npx vitest run tests/gap1842RareDiseaseRuntimeLifecycleGraphBoundary.test.ts tests/gap1838RuntimeLifecycleGraphBoundary.test.ts tests/runtimeRunManager.test.ts tests/fleetLifecycle.test.ts --reporter=dot` passed, 4 files / 14 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 944 files / 7768 tests.
