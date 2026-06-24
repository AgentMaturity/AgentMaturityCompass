# GAP-1038 - ParseBench public methodology

- Gap: `GAP-1038`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `run-llama/ParseBench`
- Retrieval: authenticated GitHub repository, contents, README, releases, tags, languages, raw README, raw `pyproject.toml`, docs directory, and local backlog metadata on 2026-06-25
- Status: Done - skipped as public-methodology implementation evidence

## Relevance decision

`GAP-1038` is relevant to AMC as source-review context only. ParseBench is a document parsing benchmark for AI agents, and its dataset dimensions, leaderboard, reports, and parser pipeline framing are useful context for evidence-linked evaluation design. They do not change AMC's public scoring methodology, question set, evidence taxonomy, badge semantics, or methodology version.

No public methodology version bump is warranted. A public methodology change would require an AMC-owned scoring semantics change with methodology version, changelog, deprecation notice, migration guidance, and public audit fields. ParseBench benchmark metadata alone cannot justify a public methodology version bump.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only as benchmark context; no AMC scoring formula, L0-L5 semantics, question bank, or methodology version changed. |
| Shield | Relevant only as a fail-closed assurance boundary; leaderboard or parser benchmark rows cannot replace AMC signed evidence. |
| Enforce | Not changed; no document parsing, OCR, PDF, table, chart, or parser policy was added. |
| Vault | Not changed; no documents, datasets, parser outputs, screenshots, PDFs, or Hugging Face assets were imported. |
| Watch | Relevant only when source metadata is rejected as public-methodology proof; no monitor or alert changed. |
| Fleet | Not changed; no parser fleet, provider benchmark runner, or document-AI orchestration was added. |
| Passport | Not changed; no badge or proof-bundle semantics changed. |
| Comply | Not changed; no regulated-document, auditability, or compliance mapping was added. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed.

The existing public methodology manifest already exposes AMC-owned methodology versioning, changelog, deprecation notice, migration guidance, evidence taxonomy, public limitations, and change policy. ParseBench can be documented as external source-review context, but it is skipped as public-methodology implementation evidence because it does not alter AMC scoring semantics.

No public methodology version bump was made.

## Live source facts

- Repository: `https://github.com/run-llama/ParseBench`.
- Raw README: `https://raw.githubusercontent.com/run-llama/ParseBench/main/README.md`.
- Raw license: `https://raw.githubusercontent.com/run-llama/ParseBench/main/LICENSE`.
- Raw package metadata: `https://raw.githubusercontent.com/run-llama/ParseBench/main/pyproject.toml`.
- Raw pipelines docs: `https://raw.githubusercontent.com/run-llama/ParseBench/main/docs/pipelines.md`.
- Website link in README: `https://parsebench.ai`.
- Dataset link in README: `https://huggingface.co/datasets/llamaindex/ParseBench`.
- arXiv link in README: `https://arxiv.org/abs/2604.08538`.
- GitHub metadata: description `ParseBench - A Document Parsing Benchmark for AI Agents`, Apache-2.0 license, Python primary language, 505 stars, 64 forks, 2 open issues, default branch `main`, created `2026-04-10T20:46:33Z`, pushed `2026-06-24T17:26:22Z`, and topics for benchmark, document-ai, document-parsing, evaluation, llamaindex, llm, machine-learning, ocr, pdf-parsing, table-extraction, and vision-language-models.
- Repository contents include `.env.example`, `LICENSE`, `README.md`, `apps`, `docs`, `leaderboard.csv`, `pyproject.toml`, `scripts`, `src`, `tests`, and `uv.lock`.
- Releases API returned No releases. Tags API returned No tags.
- `pyproject.toml` declares package version `0.2.0` and script `parse-bench`.
- README context reviewed only as metadata includes 90+ pipelines, leaderboard data, raw `leaderboard.csv`, five benchmark dimensions, and dataset totals of 2,078 pages, 1,211 documents, and 169,011 rules.
- Dataset dimensions reviewed only as metadata: Tables, Charts, Content Faithfulness, Semantic Formatting, and Visual Grounding.

## Fail-closed rule

GitHub repository metadata, README metadata, Apache-2.0 license metadata, primary language, topics, stars, forks, open issues, default branch, release absence, tag absence, package version, script names, `.env.example`, leaderboard labels, provider rankings, parser names, dataset links, arXiv links, Hugging Face links, website links, raw `leaderboard.csv`, 90+ pipelines, dimension names, dataset totals, report labels, parser cost labels, OCR/PDF/table/chart labels, visual grounding labels, local backlog text, or source identity cannot prove AMC public methodology versioning.

Passing public methodology evidence requires an AMC-owned scoring semantics change, methodology version, changelog, deprecation notice, migration guidance, public audit fields, evidence taxonomy update, and deterministic methodology manifest hash.

## No-bloat boundary

No ParseBench importer, runner, parser adapter, benchmark harness, dataset mirror, Hugging Face dataset downloader, leaderboard mirror, leaderboard parser, report renderer, parser provider registry, OCR subsystem, PDF parser, table-extraction subsystem, chart-extraction subsystem, visual-grounding subsystem, LlamaParse adapter, document-AI benchmark, VLM parser integration, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport schema, badge semantics change, methodology version bump, package dependency, copied README prose beyond minimal metadata facts, copied leaderboard rows, copied dataset rows, copied documents, copied PDFs, copied images, copied parser outputs, copied reports, copied prompts, copied configs, copied model outputs, copied screenshots, or source-specific public-methodology module was added.

ParseBench remains source-review signal only.

## Verification

- TDD expected failure before doc creation: `npx vitest run tests/gap1038ParseBenchPublicMethodologyBoundary.test.ts --reporter=dot` failed only because this document did not exist; implementation leakage check passed.
- Live source retrieval:
  - `gh api repos/run-llama/ParseBench`
  - `gh api repos/run-llama/ParseBench/contents`
  - `gh api repos/run-llama/ParseBench/readme`
  - `gh api repos/run-llama/ParseBench/releases`
  - `gh api repos/run-llama/ParseBench/tags`
  - `curl -fsSL https://raw.githubusercontent.com/run-llama/ParseBench/main/README.md`
  - `curl -fsSL https://raw.githubusercontent.com/run-llama/ParseBench/main/pyproject.toml`
  - `gh api repos/run-llama/ParseBench/contents/docs`
  - `gh api repos/run-llama/ParseBench/languages`
- `npx vitest run tests/gap1038ParseBenchPublicMethodologyBoundary.test.ts --reporter=dot`: PASS, 1 file / 3 tests.
- `npx vitest run tests/gap0957HoneyHivePublicMethodologyBoundary.test.ts tests/gap1038ParseBenchPublicMethodologyBoundary.test.ts --reporter=dot`: PASS, 2 files / 6 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, and `src/badge/badgeCli.ts`: PASS, no ParseBench identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 885 files / 7,525 tests.
