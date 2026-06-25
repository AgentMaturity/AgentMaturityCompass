# GAP-1838 - AI research signed runtime lifecycle graph

- Gap: `GAP-1838`
- Dimension: Signed runtime lifecycle graph
- AMC surfaces requested: Fleet; Watch; Studio
- Source reviewed: `Towards end-to-end automation of AI research`
- Retrieval: Live OpenAlex, DOI, Crossref, and Nature metadata review on `2026-06-25`
- Status: Done

## Relevance decision

The source is relevant to AMC because it describes an agentic AI research system moving through a research life cycle, including steps where the system creates research ideas, writes code, runs experiments, analyzes results, writes a manuscript, and performs peer review. That source signal maps directly to AMC's need to reconstruct how an agent moved from intent to action during runtime incidents.

GAP-1838 is product-relevant through AMC's existing Fleet, Watch, and Studio surfaces. The closure is a generic signed runtime lifecycle graph that records plan, tool, memory, handoff, retry, and finalization nodes from AMC runtime events and exports a replay result. The paper metadata is source-review context only.

## Source retrieval

- OpenAlex work: `https://openalex.org/W7140287209`
- OpenAlex API: `https://api.openalex.org/works/W7140287209`
- DOI: `https://doi.org/10.1038/s41586-026-10265-5`
- Nature article page: `https://www.nature.com/articles/s41586-026-10265-5`
- Crossref API: `https://api.crossref.org/works/10.1038/s41586-026-10265-5`
- Title: `Towards end-to-end automation of AI research`
- Source: `Nature`
- Publication date verified from live metadata: `2026-03-25`
- OpenAlex source facts: article type, Nature venue, Nature Portfolio / Springer Nature host lineage, DOI, PubMed ID, open-access metadata, and concepts including automation, pipeline, workflow, artificial intelligence, and scientific discovery.
- Crossref source facts: DOI, title, Nature container, published-online date, page range, CC BY license metadata, and references to a complex agentic system and research automation.
- Nature source facts: article title, DOI metadata, Nature journal title, published date, and page metadata.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Indirect only; graph replay can support scoring evidence, but no scoring methodology changed. |
| Shield | Adjacent only; incident findings can reference graph nodes, but no Shield pack changed. |
| Enforce | Adjacent only; tool and handoff edges can carry receipts, but no runtime guardrail changed. |
| Vault | Adjacent through signed event and graph artifacts; no new secure storage surface changed. |
| Watch | Relevant because Watch needs replayable runtime evidence for incident reconstruction. |
| Fleet | Relevant because Fleet needs comparable lifecycle health across agents and handoffs. |
| Passport | Out of scope for this gap; no portable trust token field changed. |
| Comply | Out of scope for this gap; runtime graph evidence can support audits, but no compliance mapping changed. |

## Product closure

Added `src/runtime/lifecycleGraph.ts`, exported it through `src/runtime/index.ts`, and added `runtime-lifecycle-graph` as a signed artifact kind. The graph builder derives source-agnostic nodes and edges from existing signed runtime run events instead of copying or importing any source system.

The graph records:

- plan, tool, memory, handoff, retry, and finalization nodes;
- event IDs, timestamps, stages, event signatures, receipt IDs, and payload hashes;
- tool execution and handoff edges with receipts;
- edge timestamps and hashes;
- a replay hash and replayable/fail-closed result;
- graph hash, graph export path, and artifact signature path.

`tests/gap1838RuntimeLifecycleGraphBoundary.test.ts` proves the graph exports and signs a replayable runtime run, fails closed when paper metadata replaces runtime evidence, and keeps implementation files free of source-specific identifiers.

## Fail-closed rule

metadata-only source evidence fails closed. OpenAlex metadata, DOI metadata, Nature page metadata, Crossref metadata, article title, Nature venue, publication date, AI research labels, agentic system labels, research life cycle labels, or local backlog text cannot prove a runtime lifecycle graph.

A passing GAP-1838 claim requires signed runtime events, plan/tool/memory/handoff/retry/finalization nodes, event signatures, edge timestamps, receipts on tool and handoff edges, a replay hash, and a graph hash. Missing nodes, missing signed event lineage, missing tool receipt, missing handoff receipt, missing edge timestamp, or graph-hash mismatch fails closed.

## No-bloat boundary

No AI Scientist subsystem, scientific research automation engine, paper-generation workflow, peer-review workflow clone, Nature importer, OpenAlex importer, Crossref importer, DOI importer, PubMed importer, source-specific runtime adapter, source-specific Studio route, source-specific CLI command, methodology bump, copied paper prose, copied abstract, copied supplementary material, copied examples, copied prompts, copied configs, or copied upstream outputs were added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1838RuntimeLifecycleGraphBoundary.test.ts --reporter=dot` failed first because `src/runtime/lifecycleGraph.ts` did not exist.
- After implementation, focused test failed only because this source-review document did not exist; the runtime graph behavior, fail-closed, and no-bloat checks passed.
- Live source checks:
  - `curl -sS https://api.openalex.org/works/W7140287209` returned OpenAlex metadata recorded above.
  - `curl -sSI -L https://doi.org/10.1038/s41586-026-10265-5` resolved to the Nature article page and returned HTTP/2 `200`.
  - `curl -sS https://api.crossref.org/works/10.1038/s41586-026-10265-5` returned Crossref metadata recorded above.
  - `curl -sSL 'https://www.nature.com/articles/s41586-026-10265-5?error=cookies_not_supported'` returned Nature article metadata for the title, DOI, journal, date, and page facts.
- Focused test: `npx vitest run tests/gap1838RuntimeLifecycleGraphBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related runtime/fleet regression: `npx vitest run tests/gap1838RuntimeLifecycleGraphBoundary.test.ts tests/runtimeRunManager.test.ts tests/fleetLifecycle.test.ts tests/fleetTypedGraph.test.ts tests/fleetMode.test.ts --reporter=dot` passed, 5 files / 22 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 943 files / 7764 tests.
