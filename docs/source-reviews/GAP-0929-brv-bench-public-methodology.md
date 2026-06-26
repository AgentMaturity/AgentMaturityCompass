# GAP-0929 - brv-bench public-methodology boundary

- Gap: `GAP-0929`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `campfirein/brv-bench`, `https://github.com/campfirein/brv-bench`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page showed the `main` branch, Star 13, Fork 2, Issues 2, Pull requests 0, 89 Commits, README.md, folders `assets`, `brv_bench`, `scripts`, and `tests`, files `.gitignore`, `.pre-commit-config.yaml`, `Makefile`, `README.md`, `pyproject.toml`, `requirements.txt`, and `setup.py`, Packages 0, Python 98.5%, and Other 1.5%.
- Status: Done - skipped as public-methodology implementation evidence

## Live source metadata

The live README describes `brv-bench` as a Benchmark suite for evaluating retrieval quality, latency, and diversity of AI agent context systems. It is presented as powered for ByteRover and includes blog links, setup commands, Supported Datasets, LoCoMo, LongMemEval-S, transform/curate/evaluate flows, LLM-as-Judge, Justifier, Isolated Mode, ground-truth format, metrics including Precision@K, Recall@K, NDCG@K, MRR, Cold Latency, and environment variables such as `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, and `OPENAI_API_KEY`.

Those facts are useful source-review context, but they do not change AMC public methodology versioning. `brv-bench` is a context-system benchmark and memory/retrieval evaluation project, not an AMC scoring-methodology specification. AI agent context-system benchmark metadata alone cannot justify a public methodology version bump, methodology version, changelog, deprecation notice, or migration guidance because it does not alter AMC scoring semantics, evidence taxonomy, badge semantics, maturity levels, diagnostic question bank, or public methodology contract.

No upstream Python code, benchmark datasets, context trees, judge prompts, justifier prompts, result tables, screenshots, images, reports, configs, README prose beyond minimal metadata facts, examples, generated outputs, model responses, dependency files, or implementation details were copied into AMC.

## Relevance decision

`GAP-0929` is relevant only as a public-methodology no-op and source-review boundary. The source is adjacent to Score, Shield, and Watch because it benchmarks AI agent memory/context retrieval quality and latency, but its evidence is not an AMC-owned methodology change.

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed. No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed; context-system benchmark metadata is not methodology-versioning proof. |
| Shield | Useful benchmark context only; no new Shield methodology claim was added. |
| Watch | No Watch methodology, monitoring, drift, latency, or observability behavior changed. |
| Enforce | No runtime policy changed. |
| Vault | No API keys, datasets, context trees, prompts, configs, reports, or upstream artifacts stored. |
| Fleet | Memory/context benchmark context only; no AMC fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No product code changed. The focused regression documents the live source metadata and asserts that `brv-bench` metadata remains absent from AMC public methodology semantics and implementation modules.

This closure is a documented skip for implementation: brv-bench, ByteRover, LongMemEval-S, LoCoMo, LLM-as-Judge, Justifier, Isolated Mode, retrieval quality, latency, diversity, context-system memory, Precision@K, Recall@K, NDCG@K, MRR, Cold Latency, judge model configuration, and API-key labels are not public methodology versioning evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Star 13, Fork 2, Issues 2, Pull requests 0, 89 Commits, Packages 0, Python 98.5%, Other 1.5%, folder names, file names, benchmark labels, ByteRover labels, dataset names, metric names, judge labels, model names, API-key names, blog links, result-image presence, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing public methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, evidence-taxonomy change, and scoring-semantics rationale.

AI agent context-system benchmark metadata alone cannot justify a public methodology version bump.

## No-bloat boundary

No brv-bench adapter, ByteRover adapter, memory benchmark runner, LoCoMo importer, LongMemEval-S importer, context-tree importer, judge runner, justifier runner, API-key loader, metric calculator, benchmark report parser, result-table importer, notebook/script runner, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python code, benchmark datasets, context trees, judge prompts, justifier prompts, result tables, screenshots, images, reports, configs, README prose beyond minimal metadata facts, examples, generated outputs, model responses, dependency files, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0929BrvBenchPublicMethodologyBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the public-methodology implementation leakage check already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0929BrvBenchPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0928RagPlaybookProviderDriftUnavailableBoundary.test.ts tests/gap0929BrvBenchPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
