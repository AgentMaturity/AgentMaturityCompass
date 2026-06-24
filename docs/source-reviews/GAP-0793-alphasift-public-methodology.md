# GAP-0793 - AlphaSift public-methodology boundary

- Gap: `GAP-0793`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/ZhuLinsen/alphasift`
- Retrieval: `2026-06-21` via GitHub connector fetches for `README.md`, `LICENSE`, `pyproject.toml`, and `requirements.txt`; `requirements.txt returned 404`.
- Status: skipped as AMC public-methodology evidence; no methodology version bump or product code change.

## Live source metadata

The live README identifies AlphaSift as an agent-friendly stock discovery and ranking engine. It includes explicit disclaimers that the project is for learning, research, and engineering experiments only and is not investment advice, a return guarantee, or a buy/sell instruction.

Relevant source-review signals include L1 deterministic screening, L2 optional LLM ranking, L3 pluggable post-analysis, Hotspot discovery, daily feature enrichment, an Evaluation loop for saved runs and later T+N evaluation, and an Agent-native interface via `SKILL.md`. The repository includes an Apache-2.0 license. The `pyproject.toml` identifies package version `0.2.0`, Python >=3.10, and dependencies including pandas, pyyaml, litellm, efinance, akshare, baostock, tushare, yfinance, and requests. These facts identify finance-evaluation and auditability context only. No upstream code, README prose beyond short metadata facts, stock examples, strategy YAML, market data, prompts, configs, screenshots, package files, or implementation details were copied into AMC.

## Relevance decision

AlphaSift is relevant to AMC as external finance-evaluation context: it emphasizes explicit disclaimers, auditable strategies, saved-run evaluation, deterministic scoring, optional LLM judgment, and later outcome checks. That context reinforces AMC's evidence-first posture for Score, Shield, and Watch.

AlphaSift is not an AMC public methodology versioning source. The live repository does not define AMC scoring methodology ids, L0-L5 threshold semantics, badge comparability rules, public methodology hashes, changelog rows, deprecation notice, migration guidance, report binding, or AMC diagnostic question-bank changes. AlphaSift repository metadata and README evaluation claims alone must fail closed for public methodology claims.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Finance-evaluation context only; no accepted public scoring-methodology proof. |
| Shield | Disclaimer and risk context only; no Shield assurance threshold changed. |
| Watch | Saved-run evaluation context only; no Watch methodology or alert semantics changed. |
| Enforce | No runtime trading, market-data, LLM-ranking, or investment policy changed. |
| Vault | No API keys, market snapshots, strategy YAML, stock rows, prompts, or secure-storage behavior changed. |
| Fleet | Agent-native stock-screening context only; no orchestration adapter added. |
| Passport | No portable proof-bundle field or finance credential changed. |
| Comply | Finance disclaimer context only; no compliance mapping or investment advice claim changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, or scoring code changed for GAP-0793. No public methodology version bump was made.

The closure is a documented no-op: finance-evaluation context only, no public methodology version change. Public methodology versioning, changelog, deprecation notice, and migration guidance remain AMC-owned artifacts and must not be sourced from a third-party stock-screening repo.

## Fail-closed rule

AlphaSift repository identity, repository URL, README labels, stock-screening labels, L1 deterministic screening labels, L2 optional LLM ranking labels, L3 post-analysis labels, Hotspot discovery labels, saved-run evaluation labels, Agent-native interface labels, Apache-2.0 license label, pyproject metadata, dependency lists, stock examples, market-data labels, local backlog metadata, or source identity alone must fail closed for AMC public methodology claims. Passing evidence requires AMC-owned methodology id/version/hash, changelog rows, deprecation notice, migration guidance, validation artifacts, signed evidence refs, row hashes, badge/report binding, and no-copy proof.

## No-bloat boundary

No AlphaSift adapter, stock-screening engine, market-data importer, LLM-ranking adapter, deterministic-factor scoring module, saved-run evaluation loop, strategy YAML importer, hotspot workflow, T+N evaluator, finance compliance workflow, GitHub importer, source-specific methodology lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream code, README prose beyond short metadata facts, stock examples, strategy YAML, market data, prompts, configs, screenshots, package files, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0793AlphasiftPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
