# GAP-1052 - MCP-AgentBench replay corpus

- Gap: `GAP-1052`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `MCP-AgentBench: Evaluating Real-World Language Agent Performance with MCP-Mediated Tools`
- Retrieval: OpenAlex API, Crossref API, DOI redirect HEAD, AAAI article HEAD, AAAI PDF HEAD, and local backlog row on 2026-06-24 UTC.
- Status: Done - relevance boundary documented and regression-tested through existing AMC replay-corpus primitives.

## Relevance decision

MCP-AgentBench is relevant to AMC as a paper/source-review signal for replayable benchmark corpus evidence. The paper concerns language-agent evaluation with MCP-mediated tools, which maps to AMC only through existing Score/Shield/Watch replay-corpus receipts: replay manifest, fixture hash, fixed seed, score delta, CI receipt, source refs, signed evidence refs, row hashes, and no-copy boundary proof.

The source does not justify a source-specific MCP-AgentBench runner, MCP server mirror, tool definition importer, query corpus copy, benchmark adapter, or paper parser. AMC should keep the closure at the generic replay-corpus primitive level.

Live metadata checked:

- OpenAlex: `https://openalex.org/W7137847086`
- OpenAlex API: `https://api.openalex.org/works/W7137847086`
- DOI: `https://doi.org/10.1609/aaai.v40i37.40347`
- DOI value: `10.1609/aaai.v40i37.40347`
- Crossref API: `https://api.crossref.org/works/10.1609/aaai.v40i37.40347`
- AAAI article: `https://ojs.aaai.org/index.php/AAAI/article/view/40347`
- PDF: `https://ojs.aaai.org/index.php/AAAI/article/download/40347/44308`

Primary-source facts captured for the boundary:

- Title: `MCP-AgentBench: Evaluating Real-World Language Agent Performance with MCP-Mediated Tools`.
- Venue/source: Proceedings of the AAAI Conference on Artificial Intelligence.
- Publisher/host organization: Association for the Advancement of Artificial Intelligence.
- publication_date `2026-03-14`.
- OpenAlex type `article`; Crossref type `journal-article`.
- Open access: is_oa `true`; oa_status `diamond`.
- cited_by_count `1`.
- volume `40`; issue `37`; pages `30888-30896`.
- Authors/institutions checked through OpenAlex/Crossref: Zikang Guo, Benfeng Xu, Chiwei Zhu, Wentao Hong, Xiaorui Wang, Zhendong Mao; University of Science and Technology of China; University of Science and Technology Beijing.
- OpenAlex concepts included Computer science, Interoperability, Testbed, Benchmark (surveying), and Protocol (science).
- DOI redirect returned HTTP/2 302 to the AAAI article page; AAAI article returned HTTP/2 200.
- PDF endpoint returned HTTP/2 200 with content-type: application/pdf and filename `26253-AAAI26.GuoZ-NLP.pdf`.
- OpenAlex abstract metadata reported a benchmark/testbed context with 33 MCP servers, 188 tools, 600 queries, 6 categories, and an MCP-Eval outcome-oriented evaluation methodology.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned replay-corpus receipts that prove score deltas can be reproduced. |
| Shield | Relevant only when the replay corpus includes signed safety/tool-risk evidence rows. |
| Enforce | No Enforce change; no MCP runtime policy or tool adapter is added. |
| Vault | No Vault change; no external server definitions, tools, queries, credentials, or paper artifacts are imported. |
| Watch | Relevant only through CI/lifecycle replay receipts and evidence drilldown source refs. |
| Fleet | No Fleet change; no external multi-agent or MCP topology is modeled. |
| Passport | No Passport change; no external proof-bundle format changes. |
| Comply | No Comply change; paper metadata is not regulatory proof. |

## Product closure

Product closure is a no-bloat replay-corpus boundary. The existing `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` primitives already enforce the required AMC replay evidence:

- replay manifest
- fixture hash
- fixed seed
- score delta
- CI receipt
- Score/Shield/Watch surface coverage
- source refs
- signed evidence refs
- row hashes

The focused regression proves that an AMC-owned replay fixture with signed baseline/candidate evidence and source refs can pass. The negative path proves that title, DOI, OpenAlex metadata, Crossref metadata, AAAI page/PDF availability, MCP labels, server counts, tool counts, query counts, category counts, and MCP-Eval labels fail closed when used instead of AMC-owned replay evidence.

No public methodology, API, CLI, Studio, runtime MCP integration, or scoring semantic changed.

## Fail-closed rule

Metadata-only MCP-AgentBench evidence must fail closed. The following signals are insufficient by themselves:

- OpenAlex, DOI, Crossref, AAAI page, PDF availability, title, venue, publisher, publication date, authors, institutions, citation count, concepts, abstract labels, or page range.
- MCP, Model Context Protocol, server count, tool count, query count, category count, benchmark, testbed, tool-use, or outcome-oriented evaluation labels.
- Local command output, paper summary, copied paper text, copied query rows, copied tool definitions, copied MCP server definitions, copied configs, copied prompts, copied benchmark results, or copied tables/figures.

An AMC replay-corpus claim passes only with an AMC-owned replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, row hashes, CI receipt, and Score/Shield/Watch coverage.

## No-bloat boundary

AMC did not add and must not add a source-specific MCP-AgentBench subsystem for this gap. Specifically out of scope:

- MCP-AgentBench runner, importer, parser, benchmark adapter, paper scraper, MCP server mirror, tool definition mirror, query corpus copy, evaluation harness, result loader, API route, CLI command, Studio panel, or package dependency.
- Copied upstream paper prose, datasets, query rows, MCP server definitions, tool definitions, configs, prompts, benchmark rows, results, examples, tables, figures, model outputs, or implementation details.

The only committed product artifact is the source-review doc plus a focused regression test that keeps the existing AMC replay-corpus primitive fail-closed.

## Verification

- Expected red: `npx vitest run tests/gap1052McpAgentBenchReplayCorpusBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1052-mcp-agentbench-replay-corpus.md` did not exist; the three primitive checks passed.
- Focused: `npx vitest run tests/gap1052McpAgentBenchReplayCorpusBoundary.test.ts --reporter=dot`
- Paired replay-corpus boundary regression: `npx vitest run tests/gap1052McpAgentBenchReplayCorpusBoundary.test.ts tests/gap1050EohsReplayCorpusBoundary.test.ts --reporter=dot`
- Static whitespace: `git diff --check -- . ':(exclude)AMC_OS'`
- No-bloat scan: `rg -n "MCP-AgentBench|mcp_agentbench|10.1609/aaai.v40i37.40347|W7137847086|40347/44308" src/benchmarks/replayBenchmarkCorpus.ts src/eval/replayCorpusEvidenceReceipt.ts src/diagnostic/evalReplayCorpusBoundary.ts`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
