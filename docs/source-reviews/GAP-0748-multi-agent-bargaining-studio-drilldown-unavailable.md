# GAP-0748 - Multi-agent bargaining Studio drilldown unavailable-source boundary

- Gap: `GAP-0748`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7133362381`, DOI `10.1145/3742413.3789078`, and title `Strategic Tradeoffs Between Humans and AI in Multi-Agent Bargaining`
- Retrieval: `2026-06-21` via browser search and direct ACM DOI attempt; exact-title and DOI searches returned no primary result in this environment, and `https://dl.acm.org/doi/10.1145/3742413.3789078` returned `403`. Shell network remains DNS-restricted in this environment.
- Status: closed through existing AMC Studio/Console/Watch evidence drilldown receipts; no bargaining simulator, market-agent workflow, economic benchmark runner, or negotiation UI added.

## Live source metadata

The local backlog identifies a paper titled `Strategic Tradeoffs Between Humans and AI in Multi-Agent Bargaining`, DOI `10.1145/3742413.3789078`, OpenAlex work `W7133362381`, improvement dimension Studio evidence drilldown, category `Agent evaluation and benchmarks`, and concepts including economics, microeconomics, Bayesian probability, benchmark, frontier, aggregate, Bayesian inference, and empirical evidence. The backlog abstract snippet frames the source around markets increasingly accommodating LLMs as autonomous decision-making agents. Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title and DOI searches returned no primary result in this environment, and the ACM DOI page returned `403`.

These metadata facts are relevant to AMC as Studio evidence drilldown context only. Multi-agent bargaining and market-agent claims need operator-visible drilldowns with UI route, source artifact links, evidence preview, accepted/rejected evidence, trace/receipt/source preview hashes, empty/error states, signed evidence refs, row hashes, and no-copy proof. They do not justify copying bargaining tasks, implementing a market simulator, adding an economics benchmark runner, or claiming negotiation-performance parity. No upstream paper prose, abstract text beyond local backlog metadata, datasets, bargaining scenarios, prompts, examples, figures, tables, benchmark rows, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0748 is relevant to AMC through the existing Studio evidence drilldown path because the backlog asks operators to open score findings and inspect traces, receipts, policy rules, and source artifacts. The accepted AMC primitives are already `buildScoreEvidenceDrilldown` and `buildWatchObsStudioSourceArtifactLinks`.

The source can be retained only as context when AMC-owned drilldown rows include a score route, source artifact links, accepted/rejected evidence previews, trace preview hash, reasoning trace preview hash, receipt preview hash, evidence preview hash, source-artifact preview hash, empty-state hash, error-state hash, signed evidence refs, row hashes, and no-copy proof. DOI/OpenAlex/title metadata, ACM labels, bargaining labels, economics labels, Bayesian labels, benchmark labels, or market-agent labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through the existing score evidence drilldown route that opens a question-level finding and shows accepted/rejected evidence previews. |
| Shield | Relevant through fail-closed handling for unsupported claims, missing evidence refs, empty preview state, and incomplete receipt hashes. |
| Watch | Relevant through source artifact links and trace/receipt/evidence preview hashes that connect operator drilldown to benchmark context. |
| Enforce | No runtime bargaining policy, negotiation policy, or enforcement behavior changed. |
| Vault | No datasets, traces, market records, bargaining scenarios, prompts, outputs, or secure-storage behavior changed. |
| Fleet | Multi-agent bargaining context only; no bargaining orchestration or fleet topology changed. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Economics/market-agent context only; no compliance mapping changed. |

## Product closure

GAP-0748 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing evidence drilldown primitive. The positive path proves that multi-agent bargaining context is accepted only when AMC-owned drilldown rows carry a valid route, source artifact links, preview hashes, ready evidence state, signed evidence refs, row hashes, and empty/error-state receipts. The negative path proves DOI/OpenAlex/title/ACM metadata alone fails closed. The empty path proves missing question receipts return an explicit empty state rather than partial proof.

A generic fail-closed bug was also fixed in `src/diagnostic/evidenceDrilldown.ts`: malformed paper drilldown refs with missing DOI/OpenAlex/venue/publication metadata now fail closed instead of throwing.

The accepted product contract remains UI route, source artifact links, evidence preview, and empty/error states backed by AMC-owned signed receipts.

No `src/watch/evidenceDrilldown.ts`, `src/console`, `src/studio`, API, CLI, Studio panel, Watch monitor, Shield verifier, bargaining simulator, market-agent workflow, economics benchmark runner, negotiation UI, Bayesian model, ACM importer, OpenAlex importer, methodology version, diagnostic question bank, package dependency, source-specific implementation module, or source-specific scoring behavior changed for GAP-0748.

## Fail-closed rule

OpenAlex work ID, DOI, title, ACM labels, multi-agent bargaining labels, market-agent labels, economics labels, microeconomics labels, Bayesian labels, benchmark labels, frontier labels, empirical-evidence labels, source identity, or local backlog metadata alone must fail closed for Studio evidence drilldown claims. Passing evidence requires AMC-owned UI route proof, source artifact links, evidence previews, trace preview hash, reasoning trace preview hash, receipt preview hash, evidence preview hash, source-artifact preview hash, empty-state hash, error-state hash, signed evidence refs, row hashes, and no-copy proof.

## No-bloat boundary

No bargaining simulator, market-agent workflow, economics benchmark runner, negotiation UI, Bayesian model, bargaining scenario importer, dataset mirror, prompt importer, benchmark-row importer, ACM importer, OpenAlex importer, paper parser, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, datasets, bargaining scenarios, prompts, examples, figures, tables, benchmark rows, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0748MultiAgentBargainingStudioDrilldownUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
