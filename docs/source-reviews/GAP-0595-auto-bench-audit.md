# GAP-0595 — auto-bench-audit question score explainability

- Gap: `GAP-0595`
- Source: `https://github.com/IsThatYou/auto-bench-audit`
- Source type: GitHub repository
- Retrieval date: 2026-06-20
- Dimension: `eval-score-explainability`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Live GitHub verification found the repository public, non-archived, non-disabled, non-fork, default branch `main`, HEAD `f74341939a0dbb7a67fe1643609214f4e546df87`, no GitHub-detected license, pushed `2026-05-27T23:08:10Z`, updated `2026-06-16T01:09:55Z`, and a non-truncated recursive tree with benchmark-audit and benchmark-output signals including `README.md`, `benchmarks/benchguard/README.md`, `benchmarks/benchguard/audits_to_benchguard_findings.py`, and `benchmarks/benchguard/bix_verified50/BixBench-Verified-50.jsonl`.

A later GitHub API enrichment call hit unauthenticated rate limiting, so AMC treats the first successful primary-source metadata plus row-level AMC proof as the only accepted source signal. Metadata alone is not public evidence.

## Relevance decision

Relevant to AMC only through existing Score/Shield/Watch question-score explainability receipts. The source is benchmark-audit/evaluation related and maps to AMC requirements for reproducible eval packs, signed accepted evidence, rejected evidence reasons, repair hints, regression thresholds, CI proof, and row hashes.

No new source-specific AMC subsystem or public API was added.

## Product closure

- Added regression coverage in `tests/questionScoreExplainability.test.ts` showing auto-bench-audit-style rows can be represented with existing question explainability primitives.
- Added metadata-only fail-closed coverage for missing license/eval-pack/question-trace/metric-result/score-breakdown/regression-threshold/CI proof.

## No-copy boundary

No upstream source code, README prose, prompts, benchmark rows, JSONL data, result artifacts, configuration, or implementation details were copied into AMC. No dogfood-agent output was used as product evidence.
