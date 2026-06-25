# GAP-1843 - hydrogen storage signed runtime lifecycle graph

- Gap: `GAP-1843`
- Dimension: Signed runtime lifecycle graph
- AMC surfaces requested: Fleet; Watch; Studio
- Source reviewed: `"DIVE" into hydrogen storage materials discovery with AI agents`
- Retrieval: Live OpenAlex, DOI, Crossref, and RSC metadata review on `2026-06-25`
- Status: Done

## Relevance decision

The source is relevant to AMC as runtime-orchestration context because it describes a multi-agent workflow for hydrogen storage materials discovery, knowledge extraction from scientific literature, and inverse design. Those source facts reinforce AMC's existing need to preserve replayable runtime evidence for agent plans, tool calls, memory writes, handoffs, retries, and finalization.

GAP-1843 maps to the same AMC-owned runtime lifecycle graph primitive closed in GAP-1838. AMC should record plan, tool, memory, handoff, retry, and finalization nodes from signed runtime events, then export a graph that Fleet, Watch, and Studio can use to reconstruct runtime behavior.

The source is materials-discovery context only. AMC does not make a hydrogen storage discovery claim, validate scientific results, or add a lab automation workflow.

## Source retrieval

- OpenAlex work: `https://openalex.org/W4414991289`
- OpenAlex API: `https://api.openalex.org/works/W4414991289`
- DOI: `https://doi.org/10.1039/d5sc09921h`
- RSC article page: `https://pubs.rsc.org/en/content/articlelanding/2026/sc/d5sc09921h`
- Crossref API: `https://api.crossref.org/works/10.1039/d5sc09921h`
- Title: `"DIVE" into hydrogen storage materials discovery with AI agents`
- Source: `Chemical Science`
- Publisher: `Royal Society of Chemistry`
- RSC publication metadata: online date `2026/02/03`, publication date `2026/02/11`, volume `17`, issue `6`, pages `3031-3042`, DOI `10.1039/D5SC09921H`.
- OpenAlex source facts: article/work metadata, DOI, PubMed ID, Chemical Science venue, Royal Society of Chemistry host organization, open-access metadata, primary topic in engineering/physical sciences, and keywords/concepts including workflow, knowledge extraction, scientific discovery, data extraction, chemical database, information retrieval, and data mining.
- Crossref source facts: DOI, title, Chemical Science container, Royal Society of Chemistry publisher, journal issue metadata, page range, license metadata, and abstract metadata describing an autonomous AI materials-discovery workflow that turns literature visuals into structured and scored data for hydrogen-storage inverse design.
- RSC source facts: canonical article page, title metadata, DOI metadata, Chemical Science journal metadata, author metadata, publication dates, page range, PDF URL, and article landing URL.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Indirect only; graph replay can support scored evidence, but no scoring methodology changed. |
| Shield | Adjacent only; materials-discovery runtime failures can become findings, but no Shield pack changed. |
| Enforce | Adjacent only; tool and handoff edges can carry receipts, but no runtime guardrail changed. |
| Vault | Adjacent through signed event and graph artifacts; no new secure storage surface changed. |
| Watch | Relevant because Watch needs replayable runtime evidence for incident reconstruction. |
| Fleet | Relevant because Fleet needs comparable lifecycle health across multi-agent and tool-heavy runs. |
| Passport | Out of scope for this gap; no portable trust token field changed. |
| Comply | Out of scope for this gap; no scientific, environmental, or lab compliance mapping changed. |

## Product closure

No product code changed for this source. Existing `src/runtime/lifecycleGraph.ts` already builds and verifies generic signed runtime lifecycle graphs for Fleet, Watch, and Studio.

`tests/gap1843HydrogenStorageRuntimeLifecycleGraphBoundary.test.ts` proves the existing graph primitive can close a materials-discovery agent run without adding source-specific implementation. The test records a signed plan, knowledge-extraction tool call, structured evidence memory write, lab-review handoff, retry, and finalization path; it also proves metadata-only paper evidence fails closed.

## Fail-closed rule

metadata-only source evidence fails closed. OpenAlex metadata, DOI metadata, RSC page metadata, Crossref metadata, article title, Chemical Science venue, Royal Society of Chemistry publisher metadata, hydrogen storage labels, materials discovery labels, knowledge extraction labels, inverse design labels, multi-agent workflow labels, performance claims, or local backlog text cannot prove a runtime lifecycle graph.

A passing GAP-1843 claim requires signed runtime events, plan/tool/memory/handoff/retry/finalization nodes, event signatures, edge timestamps, receipts on tool and handoff edges, a replay hash, and a graph hash. Missing nodes, missing signed event lineage, missing tool receipt, missing handoff receipt, missing edge timestamp, or graph-hash mismatch fails closed.

## No-bloat boundary

No materials science subsystem, hydrogen storage subsystem, lab automation module, scientific discovery adapter, RSC adapter, Chemical Science adapter, DIVE adapter, OpenAlex importer, Crossref importer, DOI importer, PubMed importer, source-specific runtime adapter, source-specific Studio route, source-specific CLI command, methodology bump, copied paper prose, copied abstract, copied figures, copied data, copied examples, copied prompts, copied configs, or copied upstream outputs were added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1843HydrogenStorageRuntimeLifecycleGraphBoundary.test.ts --reporter=dot` failed only because this source-review document did not exist; the runtime graph behavior, fail-closed, and no-bloat checks passed.
- Live source checks:
  - `curl -sS https://api.openalex.org/works/W4414991289` returned OpenAlex metadata recorded above.
  - `curl -sSI -L https://doi.org/10.1039/d5sc09921h` resolved through RSC DOI redirects to the RSC article page and returned HTTP `200`.
  - `curl -sS https://api.crossref.org/works/10.1039/d5sc09921h` returned Crossref metadata recorded above.
  - `curl -sSL https://pubs.rsc.org/en/content/articlelanding/2026/sc/d5sc09921h` returned RSC article metadata for the title, DOI, journal, date, and page facts.
- Focused test: `npx vitest run tests/gap1843HydrogenStorageRuntimeLifecycleGraphBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related runtime lifecycle graph regression: `npx vitest run tests/gap1843HydrogenStorageRuntimeLifecycleGraphBoundary.test.ts tests/gap1842RareDiseaseRuntimeLifecycleGraphBoundary.test.ts tests/gap1838RuntimeLifecycleGraphBoundary.test.ts tests/runtimeRunManager.test.ts tests/fleetLifecycle.test.ts --reporter=dot` passed, 5 files / 18 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 945 files / 7772 tests.
