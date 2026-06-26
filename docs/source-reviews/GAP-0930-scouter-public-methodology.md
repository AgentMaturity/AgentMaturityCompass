# GAP-0930 - scouter public-methodology boundary

- Gap: `GAP-0930`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `demml/scouter`, `https://github.com/demml/scouter`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page showed the `main` branch, Star 13, Fork 1, Issues 48, Pull requests 0, 2,988 Commits, README.md, Contributing, MIT license, folders `.github`, `crates`, `docker`, `docs`, `images`, `py-scouter`, and `setup`, files `.gitattributes`, `.gitignore`, `AGENTS.md`, `CHANGELOG.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `Cargo.lock`, `Cargo.toml`, `LICENSE.md`, `README.md`, `cliff.toml`, `codecov.yml`, `docker-compose.yml`, `makefile`, `mise.toml`, and `release-plz.toml`, Releases 62, latest `v0.25.0` on Mar 26, 2026, Packages 0, Rust 68.2%, Python 31.0%, and Other 0.8%.
- Status: Done - skipped as public-methodology implementation evidence

## Live source metadata

The live README describes Scouter as `Developer-First ML Monitoring, Observability, and Agent Evaluation` and as `Monitoring, Evaluation and Observability for AI Applications`. It presents a monitoring and observability toolkit for ML and AI workflows spanning traditional data/model drift detection, distributed tracing, online and offline Agent evaluation, Rust implementation, Postgres storage, Python stubs via PyO3, and event-driven transport support for Kafka, RabbitMQ, and Redis.

Relevant source-review signals include Population Stability Index (PSI), Custom Metrics, Distributed Tracing, OpenTelemetry Compatible tracing, Offline Evaluation, Online Evaluation, AssertionTask, LLMJudgeTask, TraceAssertionTask, conditional execution gates, dependency graphs, production drift profiles, alert thresholds, Slack alerting, OpsGenie alerting, and Python/Rust packaging.

Those facts are useful source-review context, but they do not change AMC public methodology versioning. Scouter is an AI monitoring, observability, and agent-evaluation toolkit, not an AMC scoring-methodology specification. Scouter observability metadata alone cannot justify a public methodology version bump, methodology version, changelog, deprecation notice, or migration guidance because it does not alter AMC scoring semantics, evidence taxonomy, badge semantics, maturity levels, diagnostic question bank, or public methodology contract.

No upstream Rust code, Python code, prompt examples, trace examples, alert configs, Docker configs, telemetry schemas, docs, README prose beyond minimal metadata facts, generated outputs, model responses, dependency files, or implementation details were copied into AMC.

## Relevance decision

`GAP-0930` is relevant only as a public-methodology no-op and source-review boundary. The source is adjacent to Score, Shield, and Watch because it covers monitoring, drift, observability, and agent evaluation, but its evidence is not an AMC-owned methodology change.

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed. No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed; observability and agent-evaluation toolkit metadata is not methodology-versioning proof. |
| Shield | Useful evaluation context only; no new Shield methodology claim was added. |
| Watch | Relevant observability context only; no Watch methodology, alert, monitor, or drift behavior changed. |
| Enforce | No runtime policy changed. |
| Vault | No telemetry schemas, configs, prompts, traces, or upstream artifacts stored. |
| Fleet | Agent evaluation context only; no AMC fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No product code changed. The focused regression documents the live source metadata and asserts that Scouter metadata remains absent from AMC public methodology semantics and implementation modules.

This closure is a documented skip for implementation: Scouter, Developer-First ML Monitoring, Observability, Agent Evaluation, Population Stability Index (PSI), Custom Metrics, Distributed Tracing, Offline Evaluation, Online Evaluation, AssertionTask, LLMJudgeTask, TraceAssertionTask, OpenTelemetry Compatible tracing, Postgres, PyO3, Kafka, RabbitMQ, Redis, Slack, and OpsGenie metadata are not public methodology versioning evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, MIT license metadata, Star 13, Fork 1, Issues 48, Pull requests 0, 2,988 Commits, Releases 62, `v0.25.0`, Mar 26, 2026 release metadata, Packages 0, Rust 68.2%, Python 31.0%, folder names, file names, observability labels, drift labels, tracing labels, agent evaluation labels, task names, transport names, alerting names, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing public methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, evidence-taxonomy change, and scoring-semantics rationale.

Scouter observability metadata alone cannot justify a public methodology version bump.

## No-bloat boundary

No Scouter adapter, Rust crate integration, Python stub integration, Postgres store, OpenTelemetry tracer, PSI monitor, custom metric monitor, LLM judge runner, trace assertion runner, online eval runner, offline eval runner, Kafka/RabbitMQ/Redis transport, Slack/OpsGenie notifier, Docker stack, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Rust code, Python code, prompt examples, trace examples, alert configs, Docker configs, telemetry schemas, docs, README prose beyond minimal metadata facts, generated outputs, model responses, dependency files, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0930ScouterPublicMethodologyBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the public-methodology implementation leakage check already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0930ScouterPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0929BrvBenchPublicMethodologyBoundary.test.ts tests/gap0930ScouterPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
