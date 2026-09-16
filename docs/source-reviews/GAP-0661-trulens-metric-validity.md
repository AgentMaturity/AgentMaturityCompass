# GAP-0661 source review: TruLens metric-validity and reliability checks

- Gap: `GAP-0661`
- Priority: P0
- Surfaces requested: Score, Shield, Watch
- Source type: GitHub repository metadata
- Source: `https://github.com/truera/trulens`
- Retrieval date: 2026-06-21

## Live source metadata

Live GitHub API and `git ls-remote` metadata were verified from the isolated `agent/gap-0661` worktree before making the relevance decision. Only repository metadata facts were inspected and recorded; no upstream code, README prose, docs prose, examples, configs, tests, prompts, evaluator implementations, SDK/importer paths, adapters, trace schemas, benchmark rows, dashboard text, or implementation details were copied.

- `git ls-remote --symref https://github.com/truera/trulens.git HEAD` returned default branch ref `refs/heads/main`.
- HEAD at retrieval: `3fb807eea0ddf25cac5e65b1418a5af33f719586`.
- GitHub API endpoint: `https://api.github.com/repos/truera/trulens` returned HTTP 200.
- GitHub API response SHA-256 at retrieval: `1982f0b09cb75a023c1c08a81d2dbc5aa7150dbb46df88ad03679438eb9f6b69`.
- Selected canonical metadata SHA-256: `26ed935f2bee86149ad6df04bcb158cf10d179fe1c9b790398696e2adf76f895`.
- API `full_name`: `truera/trulens`.
- Default branch: `main`.
- License metadata: `MIT`.
- GitHub API description: `Evaluation and Tracking for LLM Experiments and AI Agents`.
- Primary language metadata: `Python`.
- GitHub API counts at retrieval: 3,392 stars; 302 forks; 108 open issues.
- GitHub API timestamps at retrieval: created `2020-11-02T21:56:45Z`; pushed `2026-06-20T00:00:31Z`; updated `2026-06-20T21:12:11Z`.
- Repository status metadata: public, not archived, not disabled.

Canonical selected metadata hash input:

```json
{"api_full_name":"truera/trulens","archived":false,"created_at":"2020-11-02T21:56:45Z","default_branch":"main","description":"Evaluation and Tracking for LLM Experiments and AI Agents","disabled":false,"forks_count":302,"head_ref":"refs/heads/main","head_sha":"3fb807eea0ddf25cac5e65b1418a5af33f719586","language":"Python","license_spdx":"MIT","open_issues_count":108,"pushed_at":"2026-06-20T00:00:31Z","source":"https://github.com/truera/trulens","stargazers_count":3392,"updated_at":"2026-06-20T21:12:11Z","visibility":"public"}
```

## Relevance decision

**Decision: relevant source-review signal, but fail-closed metadata-only review; no implementation added.**

The verified metadata identifies a public, MIT-licensed Python repository whose description is about evaluation and tracking for LLM experiments and AI agents. That makes it relevant to AMC metric-validity and reliability triage for Score, Shield, and Watch, especially where a future claim cites evaluator-suite, trace-evaluation, experiment-tracking, feedback, reliability, or monitoring evidence.

However, repository metadata alone does not establish a concrete AMC metric-validity primitive, evaluator suite, trace-evaluation protocol, validation table, reliability method, threshold policy, scoring rubric, benchmark artifact, or public methodology control that Score, Shield, or Watch can adopt. The metadata also does not justify a TruLens subsystem, SDK/importer, adapter, evaluator clone, parity layer, benchmark mirror, trace-schema mirror, dashboard integration, or copied upstream implementation.

If a future AMC claim cites TruLens, the citation can be used only as a high-level GitHub source-review signal and must still fail closed unless the claim supplies AMC-owned evidence through existing primitives, including:

- `metricValidation.rows[].evaluatorSuiteCoverage` when evaluator-suite evidence is claimed;
- `metricValidation.rows[].traceEvaluationCoverage` when trace, experiment-tracking, observability, reliability, Shield, or Watch evidence is claimed;
- AMC-owned eval-pack manifest and validation table artifact;
- deterministic evaluator/scorer or trace-measurement manifest when claimed;
- Score/Shield/Watch surface mapping;
- fail-closed threshold policy;
- metric owner, sample size, and confidence interval;
- signed evidence refs, artifact hashes, and row hashes;
- no-copy/source-review boundary proof.

## Non-implementation boundary

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, badge source, SDK/importer, adapter, evaluator clone, trace schema, parity layer, or copied upstream code path was changed for GAP-0661. Existing evaluator-suite and trace-evaluation primitives remain the only allowed path for future Score/Shield/Watch metric-validity claims involving TruLens-style evaluation, tracking, feedback, observability, or reliability signals.

## Copy/provenance boundary

No TruLens code, README prose, documentation prose, examples, prompts, configs, tests, evaluator implementations, feedback functions, trace schemas, dashboard text, benchmark rows, result tables, package metadata beyond high-level GitHub API fields, or implementation details were copied. This review records only live repository metadata facts, retrieval evidence, SHA-256 metadata hashes, the relevance decision, and the fail-closed non-implementation boundary.
