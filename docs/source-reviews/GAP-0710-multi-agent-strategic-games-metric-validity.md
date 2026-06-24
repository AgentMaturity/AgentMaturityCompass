# GAP-0710 - Multi-agent strategic games metric-validity boundary

- Gap: `GAP-0710`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2605.03604`, DOI `10.48550/arxiv.2605.03604`, and backlog OpenAlex `W7160408279`
- Retrieval: `2026-06-21` via browser access to the live arXiv page; shell network remains DNS-restricted in this environment.
- Status: closed through existing metric-validity receipts only when AMC-owned validation evidence exists; no strategic-game simulator or game-theory benchmark added.

## Live source metadata

The live arXiv page identifies `Multi-Agent Strategic Games with LLMs` as arXiv `2605.03604`, submitted on `5 May 2026`, authored by `Maxim Chupilkin`, and categorized under Computer Science and Game Theory, Artificial Intelligence, and Computers and Society. The page lists DOI `10.48550/arXiv.2605.03604`, one version submitted on `Tue, 5 May 2026 10:28:17 UTC`, and `29 pages, 6 figures`.

Relevant source-review signals include repeated security-dilemma experiments, conflict/cooperation mechanisms, multipolarity, finite horizons, communication, public messages, private reasoning, strategic logics, and an explicit methodological contribution around scalable and replicable LLM-based experiments. These facts identify strategic-game evaluation context only. No upstream paper prose beyond short metadata facts, figures, game payoffs, experimental rows, model outputs, reasoning traces, public messages, prompts, tables, code, datasets, screenshots, or implementation details were copied into AMC.

## Relevance decision

The source is relevant to AMC as metric-validity context: multi-agent evaluation claims about cooperation, conflict, communication, and strategic behavior need construct validity, reliability, confidence intervals, sample size, metric owner, process evidence, outcome alignment, signed evidence, and regression thresholds.

The source is not accepted as a new AMC metric by itself. arXiv metadata and strategic-game labels do not validate AMC scoring, multi-agent coordination maturity, or behavior safety. Passing AMC evidence must come from AMC-owned metric-validity packets, not from paper identity or game-theory terminology.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Relevant through fail-closed rejection of unsupported conflict/cooperation, strategic behavior, or safety claims. |
| Watch | Relevant only when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime game policy, negotiation guardrail, or enforcement behavior changed. |
| Vault | No private reasoning traces, public messages, prompts, experiment data, or secure-storage behavior changed. |
| Fleet | Multi-agent strategic-game context only; no game simulator or orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No international-relations, economics, safety, or audit-control mapping changed. |

## Product closure

GAP-0710 is closed by documenting the no-bloat metric-validity boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that strategic-game context can be cited only with AMC-owned validation evidence. The negative path proves arXiv/DOI/OpenAlex metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, game simulator, security-dilemma benchmark, agent negotiation harness, private-reasoning importer, paper parser, or scoring behavior changed for GAP-0710.

## Fail-closed rule

arXiv id, DOI, OpenAlex work ID, title, author, submitted date, subject labels, security-dilemma labels, multipolarity labels, finite-horizon labels, communication labels, conflict/cooperation labels, public-message labels, private-reasoning labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No strategic-game simulator, security-dilemma benchmark, prisoner-dilemma harness, game-theory metric, negotiation agent, private-reasoning importer, public-message importer, arXiv importer, OpenAlex importer, paper parser, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond short metadata facts, figures, game payoffs, experimental rows, model outputs, reasoning traces, public messages, prompts, tables, code, datasets, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0710StrategicGamesMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
