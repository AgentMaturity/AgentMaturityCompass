# GAP-0878 - StockSim metric-validity boundary

- Gap: `GAP-0878`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `harrypapadakis/StockSim`, `https://github.com/harrypapadakis/StockSim`, `https://arxiv.org/abs/2507.09255`
- Retrieval: `2026-06-21` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 30, Fork 5, Issues 1, Pull requests 0, 12 Commits, README.md, MIT License, No releases published, Python 96.0%, Jinja 3.5%, Other 0.5%, repository folders `agents`, `configs`, `exchanges`, `orders`, `simulation`, `templates`, and `wrappers`, and files including `docker-compose.yml` and `main_launcher.py`.
- Status: completed as a metric-validity boundary over existing AMC validation receipts.

## Live source metadata

The live repository identifies StockSim: Multi-Agent LLM Financial Market Simulation Platform. Relevant source-review signals include topics and labels such as algorithmic-trading, financial-markets, backtesting, multi-agent-systems, real-time order book simulation, historical backtesting, heterogeneous LLM and traditional algorithmic traders, market microstructure, latency, slippage, market impact, Decision Traceability, ROI, Sharpe Ratio, Sortino Ratio, Max Drawdown, Win Rate, Profit Factor, Decision Consistency, Analyst Utilization, Response Quality, and Coordination Effectiveness.

These facts are useful high-stakes financial-agent metric-validity context, but they are not AMC validation evidence by themselves. No upstream source code, market data, agent configs, simulation outputs, order books, prompts, metrics implementations, result tables, Docker files, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing metric-validity receipts because financial-market simulation and decision-quality labels can inform how users reason about Score, Shield, and Watch validity claims. The closure is not a StockSim adapter, trading simulator, market-data importer, order-book runner, Docker runner, or financial-metric implementation; it is a fail-closed boundary showing that StockSim metadata is accepted only as source-review context unless AMC-owned metric validity proof exists.

For metric validity to pass, AMC needs validation table evidence, confidence interval evidence, sample size evidence, reliability checks, outcome-alignment checks, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, CI or lifecycle gate proof, and no-copy proof. GitHub/README/license/financial-market simulator metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing validation table, confidence interval, sample size, reliability, outcome-alignment, and metric-owner receipts. |
| Shield | Relevant only as a fail-closed trust boundary for high-stakes financial-agent context; source metadata cannot stand in for signed validity proof. |
| Watch | Relevant only through source refs, CI/lifecycle gate receipts, and replayable eval-pack visibility; no live monitor changed. |
| Enforce | No trading policy, market-risk policy, model policy, or circuit breaker changed. |
| Vault | No market data, order books, configs, prompts, outputs, Docker files, or secure-storage behavior changed. |
| Fleet | Multi-agent financial simulation context only; no StockSim runner or orchestration topology added. |
| Passport | Existing metric validity receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No financial compliance or advisory framework mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0878.

The focused regression exercises existing `buildMetricValidationReport` behavior with a positive StockSim-style source-reference packet and a negative source-metadata-only packet. The positive path requires validation table, confidence interval, sample size, reliability check, outcome alignment, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, and CI gate proof. The negative path fails closed when GitHub/README/license/financial-market simulator metadata replaces signed metric-validity evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, MIT License metadata, Star 30, Fork 5, Issues 1, Pull requests 0, 12 Commits, No releases published, Python 96.0%, Jinja 3.5%, Other 0.5%, folder names, file names, algorithmic-trading labels, financial-markets labels, backtesting labels, multi-agent-systems labels, real-time order book simulation labels, historical backtesting labels, heterogeneous LLM and traditional algorithmic traders labels, market microstructure labels, latency labels, slippage labels, market impact labels, Decision Traceability labels, ROI labels, Sharpe Ratio labels, Sortino Ratio labels, Max Drawdown labels, Win Rate labels, Profit Factor labels, Decision Consistency labels, Analyst Utilization labels, Response Quality labels, Coordination Effectiveness labels, local backlog metadata, or source identity alone must fail closed for metric validity. Passing evidence requires validation table, confidence interval, sample size, reliability checks, outcome alignment, metric owner, signed evidence refs, source refs, row hashes, regression thresholds, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No StockSim adapter, financial-market simulator, trading agent runner, order-book runner, backtesting engine, market data importer, financial metric implementation, ROI implementation, Sharpe Ratio implementation, Sortino Ratio implementation, Max Drawdown implementation, Win Rate implementation, Profit Factor implementation, Docker runner, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream source code, market data, agent configs, simulation outputs, order books, prompts, metrics implementations, result tables, Docker files, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0878StockSimMetricValidityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative metric-validity paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0878StockSimMetricValidityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0877RubyLlmContractQuestionExplainabilityBoundary.test.ts tests/gap0878StockSimMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
