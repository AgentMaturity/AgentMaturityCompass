# GAP-0832 - CalBench provider-drift boundary

- Gap: `GAP-0832`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2605.09823`, DOI `10.48550/arXiv.2605.09823`, `https://openalex.org/W7161090376`
- Retrieval: `2026-06-21` via live arXiv header/page review plus OpenAlex checks. arXiv returned HTTP/2 200. The live arXiv page identifies `CalBench: Evaluating Coordination-Privacy Trade-offs in Multi-Agent LLMs`, Submitted on 10 May 2026 and last revised 5 Jun 2026. OpenAlex page returned HTTP/2 403. api.openalex.org DNS lookup failed.
- Status: closed through existing provider-drift benchmark receipts; no CalBench runner, calendar scheduler, privacy benchmark, CP-SAT oracle, negotiation simulator, or source-specific provider-drift adapter added.

## Live source metadata

The live arXiv page identifies `CalBench: Evaluating Coordination-Privacy Trade-offs in Multi-Agent LLMs` with authors Chelsea Zou, Yiheng Yao, Selena She, Noah Goodman, and Robert D. Hawkins.

Relevant source-review signals include calendar scheduling, private calendars, incoming meetings, decentralized non-LLM reference protocols, a CP-SAT oracle, task success, excess cost, communication efficiency, burden fairness, privacy leakage, and seven model families. These facts describe coordination/privacy evaluation risk for multi-agent LLM systems, not AMC product functionality.

No upstream benchmark rows, calendar data, private information, prompts, negotiation traces, privacy labels, CP-SAT formulations, protocol implementations, tables, figures, generated outputs, arXiv prose, or evaluation code were copied into AMC.

## Relevance decision

GAP-0832 is relevant to AMC because multi-agent coordination and privacy behavior can shift when provider models, routing, tools, prompts, calendars, or evaluation configs change. The gap maps to AMC's existing provider/model drift benchmark primitive: provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, and CI gate proof.

It does not require a CalBench runner, calendar scheduler, privacy benchmark importer, CP-SAT oracle, negotiation simulator, OpenAlex importer, arXiv importer, API route, CLI command, Studio panel, or methodology version bump. Paper metadata can explain why provider drift matters for coordination/privacy settings, but it cannot replace AMC-owned provider-drift evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider-drift score distributions, canary rows, eval packs, and CI gate proof. |
| Shield | Relevant because coordination/privacy claims fail closed without signed evidence and evaluation-framework proof. |
| Watch | Relevant through provider-drift alerts, drift statistics, observability proof, and alert or waiver evidence. |
| Enforce | No runtime calendar-sharing, privacy, negotiation, routing, or policy circuit breaker changed. |
| Vault | No calendars, private records, prompts, traces, or secure-storage behavior changed. |
| Fleet | Multi-agent coordination context only; no orchestration topology or runtime changed. |
| Passport | No portable trust token or proof-bundle schema changed. |
| Comply | Privacy benchmark context only; no compliance framework mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, CalBench runner, calendar scheduler, privacy benchmark importer, CP-SAT oracle, negotiation simulator, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0832.

The focused regression exercises the existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, Watch alert projection, and CI gate path. The positive path requires provider version, canary results, drift statistic, signed evidence, replayable eval-pack rows, observability proof, and CI gate proof. The negative path fails closed when paper metadata replaces AMC-owned provider-drift evidence.

## Fail-closed rule

arXiv HTTP/2 200 reachability, OpenAlex page returned HTTP/2 403, api.openalex.org DNS lookup failed, paper title, DOI, OpenAlex id, author list, Submitted on 10 May 2026, last revised 5 Jun 2026, calendar scheduling label, private calendars label, incoming meetings label, CP-SAT oracle label, decentralized non-LLM reference protocols label, task success label, excess cost label, communication efficiency label, burden fairness label, privacy leakage label, seven model families label, local backlog metadata, or source identity alone must fail closed for provider/model drift claims.

Passing evidence requires AMC-owned provider version, canary results, drift statistic, alert or waiver, signed evidence refs, evaluation-framework proof, observability pipeline proof, replayable eval-pack rows, CI gate proof, source refs, row hashes, and no-copy proof.

## No-bloat boundary

No CalBench runner, calendar scheduler, privacy benchmark importer, CP-SAT oracle, negotiation simulator, reference-protocol implementation, paper importer, OpenAlex importer, arXiv importer, dataset mirror, benchmark mirror, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream benchmark rows, calendar data, private information, prompts, negotiation traces, privacy labels, CP-SAT formulations, protocol implementations, tables, figures, generated outputs, arXiv prose, or evaluation code were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0832CalBenchProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
