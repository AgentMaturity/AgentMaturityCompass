# GAP-0925 - BiliCore public-methodology boundary

- Gap: `GAP-0925`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `msu-denver/bili-core`, `https://github.com/msu-denver/bili-core`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed the `develop` branch, Star 14, Fork 2, Issues 7, Pull requests 20, 597 Commits, README.MD, Contributing, MIT license, Security, repository folders `.claude`, `.github`, `.streamlit`, `bili`, `docs`, and `scripts`, and files `.coveragerc`, `.env.example`, `.gitattributes`, `.gitignore`, `.pre-commit-config.yaml`, `.pylintrc`, `CITATION.cff`, `CLAUDE.md`, `CONTRIBUTING.md`, `Dockerfile`, `LICENSE`, `MANIFEST.in`, `README.MD`, `SECURITY.md`, `docker-compose.yml`, `pytest.ini`, `requirements.txt`, `run_python_formatters.sh`, and `setup.py`. The page also showed Releases 13, latest `v5.3.2` on Jun 12, 2026, Packages 0, Python 99.3%, and Other 0.7%.
- Status: Done - skipped as public-methodology implementation evidence

## Live source metadata

The live README title is `BiliCore: An Open-Source LLM Framework`. It describes BiliCore as an open-source, domain-agnostic framework for building and testing LLM-powered applications with single-agent orchestration, multi-agent system creation, and adversarial security testing. Relevant source-review signals include the Community-Centered Computing (C3) Lab, National Science Foundation, NAIRR Pilot, IRIS, Interactive Reasoning and Integration Services, 60+ models across 6 providers, AWS Bedrock, Google Vertex AI, Azure OpenAI, OpenAI, Ollama, local models, FAISS, OpenSearch, weather APIs, web search, extensible tool registry, MongoDB, PostgreSQL, in-memory checkpointers, token-by-token streaming, AETHER, Agent Ecosystems for Testing, Hardening, Evaluation, and Research, Declarative YAML configuration, LangGraph workflows, 7 workflow types, 6 communication protocols, RuntimeContext, MASExecutor, AEGIS, Adversarial Evaluation and Guarding of Intelligent Systems, Prompt injection, jailbreak, memory poisoning, bias inheritance, agent impersonation, persistence, cross-model transferability, 3-tier detection, Streamlit dashboards, Attack GUI, Docker, PostgreSQL with PostGIS, MongoDB, LocalStack, Flask API, and the v4.x to v5.0 migration note.

Those facts are useful source-review context, but they do not change AMC public methodology versioning. BiliCore is an LLM application framework with orchestration and adversarial testing components, not an AMC scoring-methodology specification. BiliCore framework metadata alone cannot justify a public methodology version bump, methodology version, changelog, deprecation notice, or migration guidance because it does not alter AMC scoring semantics, evidence taxonomy, badge semantics, maturity levels, diagnostic question bank, or public methodology contract.

No upstream Python code, Docker configs, Streamlit code, Flask API code, prompt templates, YAML configs, docs, README prose beyond minimal metadata facts, migration tables, examples, diagrams, screenshots, API docs, package metadata, dependency lists, environment files, test suites, security payloads, graph definitions, agent definitions, or implementation details were copied into AMC.

## Relevance decision

`GAP-0925` is relevant only as a public-methodology no-op and source-review boundary. IRIS, AETHER, and AEGIS are relevant to Score, Shield, and Watch as source-review context for orchestration and adversarial testing, but they do not provide an AMC-owned scoring-methodology change.

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed. No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed; framework metadata is not methodology-versioning proof. |
| Shield | Useful adversarial-testing context only; no new Shield methodology claim was added. |
| Watch | No Watch methodology, monitoring, or drift behavior changed. |
| Enforce | No runtime policy changed. |
| Vault | No environment files, credentials, prompts, configs, graph definitions, or upstream artifacts stored. |
| Fleet | Multi-agent framework context only; no AMC fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No product code changed. The focused regression documents the live source metadata and asserts that BiliCore metadata remains absent from AMC public methodology semantics and implementation modules.

This closure is a documented skip for implementation: BiliCore, domain-agnostic framework, single-agent orchestration, multi-agent system creation, adversarial security testing, Community-Centered Computing (C3) Lab, National Science Foundation, NAIRR Pilot, IRIS, Interactive Reasoning and Integration Services, AWS Bedrock, Google Vertex AI, Azure OpenAI, OpenAI, Ollama, FAISS, OpenSearch, AETHER, Agent Ecosystems for Testing, Hardening, Evaluation, and Research, Declarative YAML, LangGraph workflows, RuntimeContext, MASExecutor, AEGIS, Adversarial Evaluation and Guarding of Intelligent Systems, Prompt injection, jailbreak, memory poisoning, bias inheritance, agent impersonation, cross-model transferability, 3-tier detection, Streamlit dashboards, Attack GUI, Docker, PostGIS, LocalStack, and Flask API metadata are not public methodology versioning evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.MD presence, MIT license metadata, Contributing presence, Security policy presence, Star 14, Fork 2, Issues 7, Pull requests 20, 597 Commits, Releases 13, `v5.3.2`, Jun 12, 2026 release metadata, Packages 0, Python 99.3%, folder names, file names, BiliCore labels, domain-agnostic framework labels, single-agent orchestration labels, multi-agent system creation labels, adversarial security testing labels, Community-Centered Computing (C3) Lab labels, National Science Foundation labels, NAIRR Pilot labels, IRIS labels, AETHER labels, AEGIS labels, provider labels, tool labels, persistence labels, LangGraph labels, workflow type labels, communication protocol labels, attack suite labels, 3-tier detection labels, Streamlit dashboard labels, Docker labels, PostGIS labels, LocalStack labels, Flask API labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing public methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, evidence-taxonomy change, and scoring-semantics rationale.

## No-bloat boundary

No BiliCore adapter, IRIS runtime, AETHER runtime, AEGIS runner, LangGraph integration, provider adapter, tool registry, checkpointer, Streamlit UI, Flask API route, Docker stack, PostgreSQL/PostGIS integration, MongoDB integration, LocalStack integration, Firebase auth, attack suite, prompt injector, graph visualizer, YAML importer, migration importer, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python code, Docker configs, Streamlit code, Flask API code, prompt templates, YAML configs, docs, README prose beyond minimal metadata facts, migration tables, examples, diagrams, screenshots, API docs, package metadata, dependency lists, environment files, test suites, security payloads, graph definitions, agent definitions, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0925BiliCorePublicMethodologyBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the public-methodology implementation leakage check already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0925BiliCorePublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0924MoneybenchProviderDriftBoundary.test.ts tests/gap0925BiliCorePublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
