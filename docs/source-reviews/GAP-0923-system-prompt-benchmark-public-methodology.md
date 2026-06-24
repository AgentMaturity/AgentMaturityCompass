# GAP-0923 - system-prompt-benchmark public-methodology boundary

- Gap: `GAP-0923`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `KazKozDev/system-prompt-benchmark`, `https://github.com/KazKozDev/system-prompt-benchmark`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed the `main` branch, Star 14, Fork 2, Issues 1, Pull requests 0, 34 Commits, README.md, Code of conduct, Contributing, MIT license, Security, repository folders `.github`, `assets`, `datasets`, `deploy/ prometheus`, `docs`, `examples/ benchmark-output`, `plugins`, `prompts`, `src`, and `tests`, and files `.dockerignore`, `.gitignore`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `Dockerfile`, `LICENSE`, `README.md`, `SECURITY.md`, `app.py`, `benchmark.example.yaml`, `docker-compose.yml`, `package-lock.json`, `package.json`, `requirements.txt`, `spb.py`, `start.command`, and `start.sh`. The page also showed Releases 2, latest `v1.1.0` on Mar 23, 2026, Python 97.4%, CSS 1.4%, and Other 1.2%.
- Status: Done - skipped as public-methodology implementation evidence

## Live source metadata

The live README identifies `System Prompt Benchmark` as Automated red-team testing for LLM system prompts across 12 security and behavior categories. Relevant source-review signals include prompt injection, jailbreak, data exfiltration, 12 evaluation categories, 15+ provider integrations, OpenAI, Anthropic, Gemini, Bedrock, Ollama, CLI, Streamlit web UI, and REST API, Redis, Prometheus, Grafana, Plugin SDK for providers/judges/transforms/exporters, role adherence, jailbreak resistance, security, instruction following, ethics compliance, consistency, scope boundaries, graceful degradation, robustness, constraint following, multi-turn behavior, edge cases, ensemble judge, pattern detectors, LLM judge, OpenAI Moderation, Perspective API, HarmJudge, external webhook detectors, YAML/JSON benchmark config, dataset transforms, remote catalog sync with integrity verification, parallel benchmark execution, rate limiting, retry logic, PDF report export, Prompt analyzer, Async REST API, SQLite job store, Redis Stream broker, webhook delivery, Python 3.12, FastAPI, Uvicorn, Plotly, Pandas, and ReportLab.

Those facts are useful source-review context, but they do not change AMC public methodology versioning. system-prompt-benchmark is a red-team prompt benchmark and application, not an AMC scoring-methodology specification. system-prompt-benchmark red-team metadata alone cannot justify a public methodology version bump, methodology version, changelog, deprecation notice, or migration guidance because it does not alter AMC scoring semantics, evidence taxonomy, badge semantics, maturity levels, diagnostic question bank, or public methodology contract.

No upstream Python, CSS, JavaScript, prompts, datasets, benchmark packs, benchmark outputs, reports, configs, Docker files, Prometheus configs, plugin code, provider adapters, judge logic, README prose beyond minimal metadata facts, diagrams, screenshots, package metadata, dependency lists, examples, API docs, UI code, or implementation details were copied into AMC.

## Relevance decision

`GAP-0923` is relevant only as a public-methodology no-op and source-review boundary. System prompt red-team benchmark context is relevant to Shield, Score, and Watch as source-review evidence vocabulary, but it does not provide an AMC-owned scoring-methodology change.

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed. No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed; red-team benchmark metadata is not methodology-versioning proof. |
| Shield | Useful security-review context only; no new Shield methodology claim was added. |
| Watch | No Watch methodology, monitoring, or drift behavior changed. |
| Enforce | No runtime prompt policy changed. |
| Vault | No prompts, datasets, benchmark outputs, reports, provider configs, or upstream artifacts stored. |
| Fleet | No agent topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No product code changed. The focused regression documents the live source metadata and asserts that system-prompt-benchmark metadata remains absent from AMC public methodology semantics and implementation modules.

This closure is a documented skip for implementation: System Prompt Benchmark, automated red-team testing, 12 security and behavior categories, prompt injection, jailbreak, data exfiltration, provider integrations, CLI, Streamlit web UI, REST API, Redis, Prometheus, Grafana, Plugin SDK, role adherence, jailbreak resistance, scope boundaries, multi-turn behavior, ensemble judge, pattern detectors, LLM judge, OpenAI Moderation, Perspective API, HarmJudge, YAML/JSON benchmark config, integrity verification, rate limiting, retry logic, PDF report export, Prompt analyzer, SQLite job store, and webhook delivery metadata are not public methodology versioning evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Code of conduct presence, Contributing presence, MIT license metadata, Security policy presence, Star 14, Fork 2, Issues 1, Pull requests 0, 34 Commits, Releases 2, `v1.1.0`, Mar 23, 2026 release metadata, Python 97.4%, CSS 1.4%, folder names, file names, automated red-team testing labels, 12 security and behavior categories labels, prompt injection labels, jailbreak labels, data exfiltration labels, OpenAI labels, Anthropic labels, Gemini labels, Bedrock labels, Ollama labels, CLI/Streamlit/REST API labels, Redis labels, Prometheus labels, Grafana labels, Plugin SDK labels, ensemble judge labels, YAML/JSON benchmark config labels, integrity verification labels, rate limiting labels, retry logic labels, PDF report export labels, Prompt analyzer labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing public methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, evidence-taxonomy change, and scoring-semantics rationale.

## No-bloat boundary

No system-prompt-benchmark adapter, red-team prompt runner, benchmark pack importer, prompt dataset importer, provider integration, judge stack, detector stack, OpenAI Moderation wrapper, Perspective API wrapper, HarmJudge wrapper, webhook detector, Streamlit UI, REST API route, Redis queue, Prometheus config, Grafana dashboard, plugin SDK, report exporter, PDF generator, prompt analyzer, package dependency, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python, CSS, JavaScript, prompts, datasets, benchmark packs, benchmark outputs, reports, configs, Docker files, Prometheus configs, plugin code, provider adapters, judge logic, README prose beyond minimal metadata facts, diagrams, screenshots, package metadata, dependency lists, examples, API docs, UI code, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0923SystemPromptBenchmarkPublicMethodologyBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the public-methodology implementation leakage check already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0923SystemPromptBenchmarkPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0922ProductionRagMetricValidityBoundary.test.ts tests/gap0923SystemPromptBenchmarkPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
