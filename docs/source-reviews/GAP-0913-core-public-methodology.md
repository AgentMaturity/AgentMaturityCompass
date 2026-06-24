# GAP-0913 - CORE public-methodology boundary

- Gap: `GAP-0913`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Ian-Tharp/CORE`, `https://github.com/Ian-Tharp/CORE`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed the `develop` branch, Star 14, Fork 5, Issues 0, Pull requests 0, 262 Commits, README.md, Code of conduct, Contributing, MIT license, Security, repository folders `.claude`, `.cursor/ rules`, `.github`, `assets/ imgs`, `backend`, `docker/ agent`, `docs`, `mcp`, and `ui/ core-ui`, and files including `.dockerignore`, `.gitignore`, `CHANGELOG.md`, `CLAUDE.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `LICENSE`, `README.md`, `SECURITY.md`, `docker-compose.agents.yml`, `docker-compose.dev.yml`, `docker-compose.prod.yml`, `docker-compose.yml`, and `init.sql`.
- Status: Done - skipped as public-methodology implementation evidence

## Live source metadata

The live README identifies CORE as Cognitive Orchestration, Reasoning & Evaluation and describes a modular, self-hosted AI orchestration platform organized around Comprehension, Orchestration, Reasoning, and Evaluation. Relevant source-review signals include multi-agent architecture, cognitive pipeline, Agent Factory, Communication Commons, Council of Perspectives, Catalyst Engine, Consciousness Module, Angular 19, Electron, command deck UI, FastAPI, LangGraph, LangChain, PostgreSQL with pgvector, Redis, Ollama, Docker Compose, MCP, documentation for Architecture, API, ADRs, Council, Deployment, Implementation, Research, and Roadmap, and language mix Python 71.4%, TypeScript 13.1%, SCSS 9.3%, HTML 5.6%, PLpgSQL 0.4%, Dockerfile 0.1%, and Other 0.1%.

Those facts are useful source-review context, but they do not change AMC public methodology versioning. CORE is an AI orchestration platform with an evaluation pillar, not an AMC scoring-methodology spec. CORE platform metadata alone cannot justify a public methodology version bump, methodology version, changelog, deprecation notice, or migration guidance because it does not alter AMC scoring semantics, evidence taxonomy, badge semantics, maturity levels, diagnostic question bank, or public methodology contract.

No upstream Python, TypeScript, SCSS, HTML, SQL, Docker, MCP configs, docs, diagrams, README prose beyond minimal metadata facts, architecture descriptions, API docs, prompts, CLAUDE instructions, workflows, Docker Compose files, database schema, UI code, agent definitions, or implementation details were copied into AMC.

## Relevance decision

`GAP-0913` is relevant only as a public-methodology no-op and source-review boundary. CORE's agent orchestration, memory, workflow, and evaluation language is relevant to Score, Shield, and Watch as context, but it does not provide an AMC-owned scoring-methodology change.

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed. No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed; platform metadata is not methodology-versioning proof. |
| Shield | No new safety methodology claim; platform metadata remains fail-closed. |
| Watch | No Watch methodology, monitoring, or drift behavior changed. |
| Enforce | No runtime policy changed. |
| Vault | No CORE data, prompts, Docker configs, database schema, UI assets, or agent definitions stored. |
| Fleet | No multi-agent topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No product code changed. The focused regression documents the live source metadata and asserts that CORE metadata remains absent from AMC public methodology semantics and implementation modules.

This closure is a documented skip for implementation: Comprehension, Orchestration, Reasoning, Evaluation, multi-agent architecture, cognitive pipeline, Agent Factory, Communication Commons, Council of Perspectives, Catalyst Engine, Consciousness Module, Angular 19, Electron, FastAPI, LangGraph, LangChain, PostgreSQL, Redis, Ollama, Docker Compose, MCP, and self-hosted platform metadata are not public methodology versioning evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, MIT license metadata, Star 14, Fork 5, Issues 0, Pull requests 0, 262 Commits, folder names, file names, branch name, Cognitive Orchestration, Reasoning & Evaluation labels, Comprehension/Orchestration/Reasoning/Evaluation labels, multi-agent architecture labels, cognitive pipeline labels, Agent Factory labels, Communication Commons labels, Council of Perspectives labels, Catalyst Engine labels, Consciousness Module labels, Angular 19 labels, Electron labels, FastAPI labels, LangGraph labels, LangChain labels, PostgreSQL labels, Redis labels, Ollama labels, Docker Compose labels, MCP labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing public methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, evidence-taxonomy change, and scoring-semantics rationale.

## No-bloat boundary

No CORE adapter, orchestration runtime, cognitive pipeline, agent factory, communication commons, Council of Perspectives module, Catalyst Engine module, Consciousness Module, Angular/Electron UI, FastAPI service, LangGraph integration, LangChain integration, PostgreSQL schema, Redis integration, Ollama integration, Docker Compose runner, MCP server config, architecture importer, API importer, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python, TypeScript, SCSS, HTML, SQL, Docker, MCP configs, docs, diagrams, README prose beyond minimal metadata facts, architecture descriptions, API docs, prompts, CLAUDE instructions, workflows, Docker Compose files, database schema, UI code, agent definitions, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0913CorePublicMethodologyBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the public-methodology implementation leakage check already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0913CorePublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0912AwesomePersonalizationPublicMethodologyBoundary.test.ts tests/gap0913CorePublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
