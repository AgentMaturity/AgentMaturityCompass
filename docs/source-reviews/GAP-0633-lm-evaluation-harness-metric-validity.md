# GAP-0633 — LM Evaluation Harness metric-validity boundary

- Gap: `GAP-0633`
- Source: `https://github.com/EleutherAI/lm-evaluation-harness`
- Source type: GitHub repository metadata
- Retrieval date: 2026-06-21
- Dimension: `eval-metric-validity`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Live GitHub metadata was verified before implementation:

- Repository: `EleutherAI/lm-evaluation-harness`
- Default branch: `main`
- HEAD at retrieval: `1dd931087362abba74e0375c8c631295559f48b2`
- License metadata: `MIT`
- GitHub API description: A framework for few-shot evaluation of language models.
- GitHub API counts at retrieval: 13,016 stars; 3,353 forks; 873 open issues
- GitHub API timestamps at retrieval: pushed `2026-06-02T15:06:38Z`; updated `2026-06-20T16:02:41Z`
- Retrieval command evidence: `git ls-remote --symref https://github.com/EleutherAI/lm-evaluation-harness.git HEAD` returned `refs/heads/main` and the HEAD commit above; GitHub repository API returned the metadata above.

## Relevance decision

Relevant only as a source signal for existing AMC metric-validity and public-methodology boundaries. No lm-evaluation-harness subsystem, SDK, importer, adapter, parity layer, task mirror, leaderboard mirror, or upstream implementation was added.

## Product closure

- Added Score, Shield, and Watch public-methodology boundary checks for LM Evaluation Harness-style metric-validity claims.
- LM Evaluation Harness repository metadata, default branch/license/star data, README/docs summaries, task names, evaluator labels, model names, local harness runs, leaderboard rows, aggregate scores, or source metadata alone fail closed without an AMC-owned eval pack, validation table, evaluator-suite proof through existing AMC primitives, trace-evaluation proof when traces or Watch are claimed, threshold policy, metric owner, sample size, confidence interval, signed evidence, no-copy proof, artifact hashes, and row hashes.
- Diagnostic methodology-versioning receipts and badge notices now include the source-review boundary so metadata-only claims remain rejected evidence.

## No-copy boundary

No lm-evaluation-harness code, README prose, docs prose, examples, prompts, configs, tests, task definitions, result tables, leaderboard content, implementation details, or UI/assets were copied. The implementation uses only high-level public metadata from live GitHub verification and source-independent AMC methodology controls.
