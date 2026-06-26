# GAP-0924 - Moneybench provider-drift boundary

- Gap: `GAP-0924`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Moneybench/moneybench`, `https://github.com/Moneybench/moneybench`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed the `main` branch, Star 14, Fork 0, Issues 0, Pull requests 0, 48 Commits, README.md, MIT license, repository folders `__pycache__`, `docs`, and `payman_js_caller`, and files `.env.example`, `.gitattributes`, `.gitignore`, `LICENSE`, `README.md`, `api_test.py`, `hud_imgur_test.py`, `hud_imgur_test_v2.py`, `hud_payman_eval.py`, `moneybench-proposal.txt`, `moneybench_task.py`, `multi_agent_eval.py`, `requirements-hud-payman.txt`, `requirements.txt`, and `test_agent.py`. The page also showed No releases published, Packages 0, Python 97.0%, and TypeScript 3.0%.
- Status: Done

## Live source metadata

The live README title is `Moneybench - Real-World Agent Benchmark` and marks the project with `Status: Active development` and `VERY WIP`. It describes an experimental benchmark for how well autonomous AI agents can make money in the real world under time pressure and limited information. Relevant source-review signals include HUD SDK, Payman, programmatic peer-to-peer cash transfers, hud-browser environment, Chrome in a cloud VM, public Imgur album, Payman payee ID, Node (Bun) subprocess, USD 0.50 payment flow, Payman Client-Credentials OAuth flow, `hud_imgur_test_v2_results.json`, HUD evaluation metrics, stdout/stderr capture, timings, errors, Python >= 3.11, Bun, `.env` credentials, HUD_API_KEY, PAYMAN_CLIENT_ID, PAYMAN_CLIENT_SECRET, `hud_imgur_test_v2.py`, `env.evaluate`, OpenAI Gym API, OAuth 2 Client Credentials, JSON result bundle, and contribution guidance around reproducible test cases.

Those facts are relevant to AMC only through existing provider-drift benchmark receipts. Moneybench shows why real-world browser/payment task outcomes, reward rates, completion behavior, latency, cost, refusal behavior, invalid actions, evaluator coverage, and guardrail pass rates can drift when providers or model versions change. AMC still requires provider version, canary results, drift statistic, and alert or waiver proof before Score, Shield, or Watch can accept a provider/model drift claim.

No upstream Python code, TypeScript code, payment code, HUD task definitions, Payman SDK calls, credentials, `.env` files, prompts, result JSON, logs, screenshots, benchmark rows, README prose beyond minimal metadata facts, payment examples, API-key formats, OAuth config, browser automation code, package files, dependency lists, or implementation details were copied into AMC.

## Relevance decision

`GAP-0924` is relevant to AMC as a provider-drift boundary. The source maps to Score, Shield, and Watch through generic AMC canary evaluation receipts, not through a Moneybench integration.

The closure uses existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` behavior. It does not add a Moneybench adapter, HUD integration, Payman integration, payment runner, browser-control harness, Imgur scraper, Bun subprocess wrapper, OAuth client, secrets loader, API route, CLI command, Studio panel, Watch monitor, Shield verifier, or source-specific provider-drift implementation.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through provider-drift score stability canaries and replayable eval packs over AMC-owned rows. |
| Shield | Relevant because missing signed provider evidence, evaluator config, traces, and reports fail closed. |
| Watch | Relevant through provider-drift alerts and CI gates over reward, completion, latency, cost, payment error, refusal, invalid-action, and guardrail shifts. |
| Enforce | No runtime payment/browser policy changed. |
| Vault | No credentials, payment identifiers, `.env` files, result bundles, screenshots, logs, or upstream artifacts stored. |
| Fleet | Real-world agent context only; no AMC fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No financial, payment, or compliance claim changed. |

## Product closure

The focused regression exercises existing provider-drift primitives with a synthetic AMC-owned Moneybench-style canary. The positive path requires provider version, canary results, drift statistic, evaluator config hash, generated test-data hash, trace export hash, metric report hash, signed evidence refs, source refs, row hashes, thresholds, Watch alert projection, and CI gate proof. The negative path proves that Moneybench, Status: Active development, VERY WIP, autonomous AI agents can make money, time pressure, limited information, HUD SDK, Payman, programmatic peer-to-peer cash transfers, hud-browser environment, Chrome in a cloud VM, public Imgur album, Payman payee ID, Node (Bun) subprocess, USD 0.50, Payman Client-Credentials OAuth flow, `hud_imgur_test_v2_results.json`, HUD evaluation metrics, stdout/stderr, timings, errors, Python >= 3.11, Bun, HUD_API_KEY, PAYMAN_CLIENT_ID, PAYMAN_CLIENT_SECRET, OpenAI Gym API, OAuth 2 Client Credentials, GitHub metadata, and README labels alone fail closed without AMC-owned provider-drift evidence.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, MIT license metadata, Star 14, Fork 0, Issues 0, Pull requests 0, 48 Commits, folder names, file names, No releases published, Packages 0, Python 97.0%, TypeScript 3.0%, Status: Active development labels, VERY WIP labels, autonomous AI agents can make money labels, time pressure labels, limited information labels, HUD SDK labels, Payman labels, programmatic peer-to-peer cash transfers labels, hud-browser environment labels, Chrome in a cloud VM labels, public Imgur album labels, Payman payee ID labels, Node (Bun) subprocess labels, USD 0.50 labels, Payman Client-Credentials OAuth flow labels, `hud_imgur_test_v2_results.json` labels, HUD evaluation metrics labels, stdout/stderr labels, timings labels, errors labels, Python >= 3.11 labels, Bun labels, HUD_API_KEY labels, PAYMAN_CLIENT_ID labels, PAYMAN_CLIENT_SECRET labels, OpenAI Gym API labels, OAuth 2 Client Credentials labels, local backlog metadata, or source identity alone must fail closed for provider drift. Passing provider-drift evidence requires provider version, canary results, drift statistic, alert or waiver, evaluator config hash, generated test-data hash, trace export hash, metric report hash, signed evidence refs, row hashes, and CI/Watch gate proof.

## No-bloat boundary

No Moneybench adapter, HUD integration, Payman integration, payment runner, browser-control harness, Imgur scraper, Bun subprocess wrapper, OAuth client, secrets loader, payment credential parser, result JSON importer, log parser, screenshot importer, real-world money task runner, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python code, TypeScript code, payment code, HUD task definitions, Payman SDK calls, credentials, `.env` files, prompts, result JSON, logs, screenshots, benchmark rows, README prose beyond minimal metadata facts, payment examples, API-key formats, OAuth config, browser automation code, package files, dependency lists, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0924MoneybenchProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the provider-drift behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0924MoneybenchProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0923SystemPromptBenchmarkPublicMethodologyBoundary.test.ts tests/gap0924MoneybenchProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
