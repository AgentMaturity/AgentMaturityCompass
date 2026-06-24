# GAP-1013 - JamAIBase public-methodology boundary

- Gap: `GAP-1013`
- Dimension: Public methodology versioning (`std-public-methodology`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: GitHub repository/API for `EmbeddedLLM/JamAIBase`, repository API `https://api.github.com/repos/EmbeddedLLM/JamAIBase`, README API `https://api.github.com/repos/EmbeddedLLM/JamAIBase/readme`, raw README `https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/README.md`, license API `https://api.github.com/repos/EmbeddedLLM/JamAIBase/license`, contents API `https://api.github.com/repos/EmbeddedLLM/JamAIBase/contents?ref=main`, commit API `https://api.github.com/repos/EmbeddedLLM/JamAIBase/commits/main`, latest-release API `https://api.github.com/repos/EmbeddedLLM/JamAIBase/releases/latest`, CI workflow `https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/.github/workflows/ci.yml`, lint workflow `https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/.github/workflows/lint.yml`, versioning doc `https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/VERSIONING.md`, migration guide `https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/MIGRATION_GUIDE.md`, changelog `https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/CHANGELOG.md`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through GitHub repository APIs, raw GitHub content, workflow/versioning/migration/changelog files, and local backlog metadata.
- Status: Done - skipped
- Linear: `AMC-1292`

## Live source metadata

The GitHub API identifies `EmbeddedLLM/JamAIBase` at `https://github.com/EmbeddedLLM/JamAIBase` as a public, non-fork, non-archived, non-disabled Python repository with homepage `https://www.jamaibase.com/`, Apache License 2.0 metadata, default branch `main`, 1,100 stars, 1,100 watchers, 41 forks, 2 open issues, size 18252, created_at `2024-05-30T15:31:08Z`, pushed_at `2026-06-08T06:06:06Z`, and updated_at `2026-06-23T23:19:52Z`.

Repository description at retrieval: a collaborative spreadsheet for AI where users chain cells into pipelines, experiment with prompts and models, evaluate LLM responses in real time, and collaborate on AI applications. Topics include agents, ai, ai-agents-framework, baas, backend-as-a-service, chatbot, chatgpt, intelligent-spreadsheet, lancedb, llama3-1, llm, llm-ops, orchestration, python, rag, retrieval-augmented-generation, serverless, spreadsheet, svelte, and workflow.

The README API reports `README.md` with README sha `e9e26769c40543ecfe5400af9b8f4f0792eb0981`, size 6814, and raw download URL `https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/README.md`. The contents API listed `.dockerignore`, `.env.example`, `.github`, `AGENTS.md`, `CHANGELOG.md`, `LICENSE`, `MIGRATION_GUIDE.md`, `README.md`, `VERSIONING.md`, `clients`, `docker`, `docs`, `scripts`, and `services`. The license API reports LICENSE sha `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`, size 11357, license key `apache-2.0`, license name `Apache License 2.0`, and SPDX `Apache-2.0`.

The commit API verified HEAD `91e2743e96290a8029f9d803ac00f765d0f03f3a`, commit_date `2026-06-08T06:06:06Z`, author `noobHappylife`, committer `noobHappylife`, verified `false`, verification reason `unsigned`, and message `add replace model api script (#927)`.

The latest-release API returned release `v0.4` published `2025-02-13T16:58:32Z`, name `v0.4 (2025-02-14)`, target_commitish `main`, and release URL `https://github.com/EmbeddedLLM/JamAIBase/releases/tag/v0.4`.

The workflow directory contains `ci.yml` with CI workflow sha `1cc46d9161854bce5e89bf180307b418a03db62a`, size 20245, and `lint.yml` with lint workflow sha `fc364c3befdbc3c0a3e3e269dbedd9356232207e`, size 1104. The CI workflow includes Python 3.12 setup, Docker Compose service launch, `pytest`, coverage, JUnit XML merging, and log artifact upload.

Relevant README/source-review signals include built-in LLM, vector embeddings, reranker orchestration, spreadsheet-like UI, REST API, Generative Tables, Action Tables, Knowledge Tables, Chat Tables, LanceDB, RAG, managed memory, prompt/model experimentation, and real-time LLM response evaluation.

Versioning and lifecycle files reviewed:

- `VERSIONING.md` says the repository follows Semantic Versioning, uses `v0.x.x`, and states Major version zero is initial development where the public API should not be considered stable.
- `MIGRATION_GUIDE.md` is a JamAIBase v1 to v2 migration guide and says migration needs both instances of JamAIBase running concurrently.
- `CHANGELOG.md` has a CHANGELOG structure, `CHANGED / FIXED` categories, breaking-change notes, client methods deprecated and/or removed, RAG references stored with model response, versioned release entries, model configuration changes, and migration-related entries.

No upstream code, README prose beyond short metadata facts, workflow YAML, changelog rows, migration commands, versioning policy prose beyond short metadata facts, examples, images, configs, `.env.example`, prompts, generated outputs, API samples, Docker files, tests, package metadata, or implementation details were copied into AMC.

## Relevance decision

GAP-1013 is relevant to AMC only as public-methodology boundary evidence. JamAIBase is an adjacent agent/RAG workflow product with its own versioning, migration guide, changelog, CI, and prompt/model evaluation surface. Those facts reinforce why AMC public claims need a methodology version, changelog, deprecation notice, migration guidance, and stable evidence taxonomy before score semantics change.

JamAIBase repo evidence alone cannot justify an AMC public methodology version bump. JamAIBase versioning and migration docs govern JamAIBase client/cloud/API behavior, not AMC score semantics, badge semantics, diagnostic evidence taxonomy, methodology versioning, deprecation policy, migration guidance, or public changelog entries. This slice is skipped as public-methodology implementation evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. No AMC score formula, L0-L5 threshold, evidence taxonomy, methodology version, changelog, deprecation notice, migration guidance, or badge comparability changed. |
| Shield | Context only. Prompt/model experimentation and response evaluation do not provide AMC assurance evidence. |
| Enforce | Not changed. No runtime policy, JamAIBase backend, or table workflow enforcement changed. |
| Vault | Not changed. No JamAIBase data, `.env.example`, file store, database, or credential behavior is imported. |
| Watch | Context only. CI, logs, and evaluation labels do not create AMC drift monitoring or evidence drilldown behavior. |
| Fleet | Context only. Workflow/table orchestration does not change AMC multi-agent topology or fleet evidence. |
| Passport | Not changed. No proof-bundle schema or JamAIBase trust token adapter changed. |
| Comply | Not changed. No compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed.

No public methodology version bump was made because the verified source does not alter AMC public scoring semantics, evidence taxonomy, methodology versioning, badge comparability, deprecation notices, migration guidance, or report-binding proof.

The focused regression test proves the live source metadata and skip decision are documented, `getPublicMethodologyManifest()` does not include JamAIBase as an AMC methodology source, and public methodology/badge/scoring modules do not contain source-specific JamAIBase, release, commit, repository, or identifier strings.

## Fail-closed rule

JamAIBase repository metadata, GitHub stars, forks, issues, topics, homepage, README sha, LICENSE sha, contents listing, release tag, CI workflow sha, lint workflow sha, versioning doc, migration guide, changelog rows, Semantic Versioning labels, Major version zero language, public API instability labels, JamAIBase migration guidance, deprecated client methods, RAG references stored with model response, built-in LLM labels, spreadsheet UI labels, table workflow labels, LanceDB labels, local backlog text, or source identity cannot prove AMC public methodology versioning.

An AMC public methodology change can pass only when there is an AMC-owned scoring semantic change with explicit methodology version, changelog, deprecation notice, migration guidance, tests, and public documentation.

## No-bloat boundary

No JamAIBase integration, GitHub importer, README parser, Python backend adapter, spreadsheet UI adapter, LanceDB adapter, SQLite adapter, Docker runner, prompt/model experiment runner, table workflow runner, generative/action/knowledge/chat table subsystem, RAG backend clone, client SDK adapter, release importer, changelog importer, migration runner, CI workflow mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, package dependency, public methodology version bump, copied source code, copied configs, copied `.env.example`, copied README prose, copied workflow YAML, copied changelog rows, copied migration commands, copied versioning prose, copied images, copied examples, copied generated outputs, or copied implementation details was added.

JamAIBase remains source-review signal only.

## Verification

- Expected-red focused test before doc: `npx vitest run tests/gap1013JamAiBasePublicMethodologyBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1013-jamaibase-public-methodology.md` did not exist; the implementation guard passed.
- Live source retrieval:
  - `curl -fsSL https://api.github.com/repos/EmbeddedLLM/JamAIBase`
  - `curl -fsSL https://api.github.com/repos/EmbeddedLLM/JamAIBase/readme`
  - `curl -fsSL 'https://api.github.com/repos/EmbeddedLLM/JamAIBase/contents?ref=main'`
  - `curl -fsSL https://api.github.com/repos/EmbeddedLLM/JamAIBase/commits/main`
  - `curl -fsSL https://api.github.com/repos/EmbeddedLLM/JamAIBase/releases/latest`
  - `curl -fsSL https://api.github.com/repos/EmbeddedLLM/JamAIBase/license`
  - `curl -fsSL https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/README.md`
  - `curl -fsSL https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/.github/workflows/ci.yml`
  - `curl -fsSL https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/.github/workflows/lint.yml`
  - `curl -fsSL https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/VERSIONING.md`
  - `curl -fsSL https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/MIGRATION_GUIDE.md`
  - `curl -fsSL https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/CHANGELOG.md`
- `npx vitest run tests/gap1013JamAiBasePublicMethodologyBoundary.test.ts --reporter=dot`: PASS, 1 file / 3 tests.
- `npx vitest run tests/gap1011LargeReasoningModelsPublicMethodologyBoundary.test.ts tests/gap1013JamAiBasePublicMethodologyBoundary.test.ts --reporter=dot`: PASS, 2 files / 6 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, and `src/badge/badgeCli.ts`: PASS, no JamAIBase identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 860 files / 7,428 tests.
