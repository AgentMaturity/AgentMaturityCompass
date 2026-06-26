# GAP-1012 - FinSight-AI live-drift boundary

- Gap: `GAP-1012`
- Dimension: Live score and behavior drift alerts (`obs-live-drift-alerts`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: GitHub repository/API for `juanjuandog/FinSight-AI`, repository API `https://api.github.com/repos/juanjuandog/FinSight-AI`, README API `https://api.github.com/repos/juanjuandog/FinSight-AI/readme`, raw README `https://raw.githubusercontent.com/juanjuandog/FinSight-AI/master/README.md`, license API `https://api.github.com/repos/juanjuandog/FinSight-AI/license`, contents API `https://api.github.com/repos/juanjuandog/FinSight-AI/contents?ref=master`, commit API `https://api.github.com/repos/juanjuandog/FinSight-AI/commits/master`, latest-release API `https://api.github.com/repos/juanjuandog/FinSight-AI/releases/latest`, CI workflow `https://raw.githubusercontent.com/juanjuandog/FinSight-AI/master/.github/workflows/ci.yml`, benchmark notes `https://raw.githubusercontent.com/juanjuandog/FinSight-AI/master/docs/benchmark.md`, workflow design notes `https://raw.githubusercontent.com/juanjuandog/FinSight-AI/master/docs/design-agent-workflow.md`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through GitHub repository APIs, raw GitHub content, workflow/docs files, and local backlog metadata.
- Status: Done
- Linear: `AMC-1291`

## Live source metadata

The GitHub API identifies `juanjuandog/FinSight-AI` at `https://github.com/juanjuandog/FinSight-AI` as a public, non-fork, non-archived, non-disabled Java repository with MIT License metadata, default branch `master`, 1,107 stars, 1,107 watchers, 59 forks, 0 open issues, size 1842, created_at `2026-05-11T11:19:40Z`, pushed_at `2026-05-26T01:39:47Z`, and updated_at `2026-06-23T07:22:23Z`.

Repository description at retrieval: AI equity research agent with resilient workflows, Redis Lua single-flight, pgvector RAG, versioned reports, evidence tracing, and RAG evaluation. Topics include ai-agent, financial-research, llm-evaluation, pgvector, postgresql, rabbitmq, rag, redis, spring-boot, and workflow-orchestration.

The README API reports `README.md` on `master` with README sha `41219993984d1a59b4986094135a9928d3257ec9`, size 20256, and raw download URL `https://raw.githubusercontent.com/juanjuandog/FinSight-AI/master/README.md`. The contents API listed `.github`, `.gitignore`, `CONTRIBUTING.md`, `LICENSE`, `README.md`, `README.zh-CN.md`, `ROADMAP.md`, `ai-service`, `backend`, `docker-compose.yml`, `docs`, and `scripts`. The license API reports LICENSE sha `70c7c97be5c2c08b826478376ab8bad70ce8bff0`, size 1068, license key `mit`, license name `MIT License`, and SPDX `MIT`.

The commit API verified HEAD `3da99f69007f88e8721efb82a950b46c579252b3`, commit_date `2026-05-26T01:39:47Z`, author `tj.zhao`, committer `GitHub`, verified `true`, verification reason `valid`, and message `fix ai report fallback model metadata (#2)`. The latest-release API returned 404, so there is no release tag to rely on for source-review closure.

The `.github/workflows/ci.yml` file exists with CI workflow sha `96aca2763416b1042b46d21735157559eb7d8d58`, size 670, and includes `mvn test` plus `bash -n scripts/*.sh`.

Relevant README and docs source-review signals include evidence-grounded reports, resilient workflow orchestration, RAG evaluation, reportVersion, dataSnapshotHash, model source, generated time, evidence chunks, report cache, RAG hit rate, evidence coverage, answer coverage, hallucination risk, conclusion consistency, confidence calibration, latency, regression loop, Redis Lua single-flight, fencing token, PostgreSQL/pgvector hybrid retrieval, RabbitMQ workflows, Spring Boot API, Prometheus/Actuator metrics, WorkflowRecoveryScheduler, and task recovery/dead-letter behavior.

No README prose beyond short metadata facts, source code, configs, Docker Compose content, credentials, screenshots, workflow YAML, benchmark rows, API examples, shell scripts, images, docs prose, license text beyond license identity, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-1012 is relevant to AMC only through the existing Watch live score and behavior drift alert primitive, with Score and Shield consuming signed drift receipts. FinSight-AI is a useful adjacent source because it emphasizes evidence-grounded financial research reports, report versioning, data snapshot hashes, traceable evidence chunks, RAG evaluation, workflow recovery, and CI-backed regression checks.

This does not justify a FinSight integration. GitHub repository metadata, README claims, docs labels, screenshots, topics, stars, CI badge, workflow YAML, report cache language, RAG evaluation labels, or source identity do not prove AMC live drift. AMC live drift still requires a baseline distribution, live sample, drift statistic, alert receipt, row hashes, trace/eval evidence refs, signed evidence refs for every baseline and live row, and fail-closed thresholds.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned signed baseline/live score rows and drift statistics. |
| Shield | Relevant as assurance context when drift reflects hallucination risk, error attribution, invalid actions, or unsafe behavior. |
| Enforce | Not changed. No FinSight workflow runner, policy hook, or circuit breaker was added. |
| Vault | Not changed. No FinSight data, credentials, Docker Compose secrets, MinIO data, Redis data, PostgreSQL data, or evidence corpus is imported. |
| Watch | Relevant through existing live-drift receipts and Watch alert projections. |
| Fleet | Context only. No fleet topology, workflow orchestrator, or cross-agent runner changed. |
| Passport | Not changed. No external proof bundle adapter was added. |
| Comply | Not changed. No financial compliance mapping or regulatory control changed. |

## Product closure

No product module changed for GAP-1012 because AMC already has the relevant primitive in `src/watch/liveDriftAlerts.ts`, with drift and score consumers available through existing Watch/Drift/Score modules.

The focused regression test `tests/gap1012FinSightAiLiveDriftBoundary.test.ts` proves:

- A positive AMC-owned live-drift receipt accepts FinSight-AI only as source references while comparing a signed baseline distribution to a signed live sample.
- The receipt emits fail-closed Watch alerts for score, pass-rate, error, latency, cost, tool-call, behavior-signature, invalid-action, and error-attribution drift.
- Metadata-only GitHub/README evidence fails closed when live rows do not include evidence references and signed evidence references.
- The boundary does not add FinSight, `juanjuandog/FinSight-AI`, repository URL, HEAD SHA, or `finsight_ai_live_drift` identifiers to Watch, Drift, or Score implementation modules.

## Fail-closed rule

FinSight repository identity, GitHub API metadata, stars, watchers, forks, open issues, topics, default branch, HEAD SHA, commit verification, README sha, README size, contents listing, license metadata, latest-release 404, CI workflow sha, `mvn test`, `bash -n scripts/*.sh`, README labels, docs labels, RAG evaluation metric names, reportVersion, dataSnapshotHash, evidence chunks, Redis Lua single-flight, pgvector, RabbitMQ, Spring Boot, Prometheus/Actuator, WorkflowRecoveryScheduler, local backlog text, or source identity cannot prove live score and behavior drift.

A live drift claim can pass only when AMC has a baseline distribution, live sample, drift statistic, alert receipt, trace/eval evidence references, signed evidence references for every baseline and live row, receipt hash, row hashes, and fail-closed thresholds tied to the lifecycle run.

## No-bloat boundary

No FinSight integration, GitHub importer, README parser, Java service adapter, Spring Boot adapter, RabbitMQ adapter, Redis Lua lease adapter, pgvector adapter, PostgreSQL adapter, Docker Compose runner, workflow orchestrator, RAG evaluator clone, financial research benchmark, report cache importer, report trace parser, CI workflow mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, package dependency, copied source code, copied configs, copied Docker Compose file, copied credentials, copied README prose, copied docs prose, copied workflow YAML, copied benchmark rows, copied API examples, copied screenshots, copied shell scripts, copied images, copied generated outputs, or source-specific live-drift subsystem was added.

FinSight-AI remains source-review signal only.

## Verification

- Expected-red TDD check: `npx vitest run tests/gap1012FinSightAiLiveDriftBoundary.test.ts --reporter=dot` failed only because this document did not exist yet (`ENOENT`) and the 3 product/boundary assertions passed.
- Live source retrieval:
  - `curl -fsSL https://api.github.com/repos/juanjuandog/FinSight-AI`
  - `curl -fsSL https://api.github.com/repos/juanjuandog/FinSight-AI/readme`
  - `curl -fsSL 'https://api.github.com/repos/juanjuandog/FinSight-AI/contents?ref=master'`
  - `curl -fsSL https://api.github.com/repos/juanjuandog/FinSight-AI/commits/master`
  - `curl -fsSL https://api.github.com/repos/juanjuandog/FinSight-AI/license`
  - `curl -fsSL https://api.github.com/repos/juanjuandog/FinSight-AI/releases/latest`
  - `curl -fsSL https://raw.githubusercontent.com/juanjuandog/FinSight-AI/master/README.md`
  - `curl -fsSL https://raw.githubusercontent.com/juanjuandog/FinSight-AI/master/.github/workflows/ci.yml`
  - `curl -fsSL https://raw.githubusercontent.com/juanjuandog/FinSight-AI/master/docs/benchmark.md`
  - `curl -fsSL https://raw.githubusercontent.com/juanjuandog/FinSight-AI/master/docs/design-agent-workflow.md`
- Focused regression: `npx vitest run tests/gap1012FinSightAiLiveDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap1008OpenAiEvalsTracesLiveDriftBoundary.test.ts tests/gap1012FinSightAiLiveDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed; narrow token scan over Watch/Drift/Score implementation files found no GAP-1012 FinSight identifiers.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 859 files / 7,425 tests.
