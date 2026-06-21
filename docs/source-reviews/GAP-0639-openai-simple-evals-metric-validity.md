# GAP-0639 — OpenAI Simple Evals metric-validity boundary

- Gap: `GAP-0639`
- Source: `https://github.com/openai/simple-evals`
- Source type: GitHub repository metadata
- Retrieval date: 2026-06-21
- Dimension: `eval-metric-validity`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Live GitHub metadata was verified before implementation:

- Repository: `openai/simple-evals`
- API `full_name`: `openai/simple-evals`
- Default branch: `main`
- HEAD at retrieval: `652c89d0ca9df547706735883097e9537d40dc47`
- Primary language metadata: `Python`
- License metadata: `MIT`
- GitHub API description: `None`
- GitHub API counts at retrieval: 4,530 stars; 491 forks; 56 open issues
- GitHub API timestamps at retrieval: created `2024-04-11T22:38:17Z`; pushed `2026-04-22T22:16:18Z`; updated `2026-06-20T01:20:19Z`
- Retrieval command evidence: `git ls-remote --symref https://github.com/openai/simple-evals.git HEAD` returned `refs/heads/main` and the HEAD commit above; GitHub repository API returned the metadata above.

## Relevance decision

Relevant only as a source-review signal for existing AMC metric-validity and public-methodology boundaries. The source is not imported, mirrored, wrapped, or treated as parity proof. No OpenAI Simple Evals subsystem, SDK, importer, adapter, parity layer, task mirror, result mirror, or upstream implementation was added.

## Product closure

- Added Score, Shield, and Watch public-methodology boundary checks for OpenAI Simple Evals-style metric-validity claims.
- OpenAI Simple Evals repository metadata, default branch, MIT license, star/fork/issue counts, Python language metadata, README summaries, module paths, local eval runs, task names, benchmark names, aggregate scores, result rows, or source metadata alone fail closed without an AMC-owned eval pack, validation table, evaluator-suite proof through existing AMC primitives, trace-evaluation proof when traces or Watch are claimed, fail-closed threshold policy, Score/Shield/Watch surface mapping, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, row hashes, and no-copy/source-review boundary proof.
- Diagnostic methodology-versioning receipts and badge notices now include the source-review boundary so metadata-only claims remain rejected evidence.

## No-copy boundary

No upstream code, README prose, docs prose, examples, prompts, configs, tests, task definitions, result tables, benchmark rows, implementation details, or UI/assets were copied. The implementation uses only high-level public metadata from live GitHub verification and source-independent AMC methodology controls.
