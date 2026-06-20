# GAP-0629 — OpenAI Evals public-methodology boundary

- Gap: `GAP-0629`
- Source repository: `https://github.com/openai/evals`
- Source ref: `github:openai/evals`
- Source type: live GitHub repository metadata
- Retrieval date: 2026-06-20
- AMC surfaces: Score, Shield, Watch
- AMC modules touched: docs, `src/diagnostic`, `src/badge`, public methodology manifest

## Live source metadata

Verified from the GitHub repository API before implementation:

- full_name: openai/evals
- html_url: https://github.com/openai/evals
- description: Evals is a framework for evaluating LLMs and LLM systems, and an open-source registry of benchmarks.
- default_branch: main
- pushed_at: 2026-04-14T15:29:57Z
- updated_at: 2026-06-20T11:00:05Z
- stargazers_count: 18727
- forks_count: 2991
- open_issues_count: 210
- archived: false
- disabled: false
- license: NOASSERTION

These facts are used only as source-review identity metadata. They do not import or reproduce upstream implementation details.

## Relevance decision

Relevant only as a public-methodology/source-review signal for existing AMC Score, Shield, Watch, diagnostic methodology-versioning, and badge-methodology primitives. The repository identity and live metadata can seed a review of evaluation-framework terminology, but they do not establish metric parity, benchmark compatibility, registry compatibility, or public comparability.

## Product closure

- Added an `openai_evals_public_methodology` Score/Shield/Watch source-claim boundary in the public methodology manifest.
- Added an `openai_evals_public_methodology` gate that fails closed unless OpenAI Evals-style claims have AMC-owned eval-pack/validation proof, methodology version/changelog/deprecation/migration proof, fail-closed thresholds, signed evidence, no-copy proof, badge assurance, and row hashes.
- Bound the source review into the diagnostic methodology-versioning receipt with required audit fields, accepted evidence refs, rejected metadata-only refs, warnings, and the methodology assurance hash.
- Updated badge source-review notices to disclose that OpenAI Evals-style metadata-only signals require `amc_methodology_assurance` proof and do not create a subsystem/importer/parity claim.
- Updated `docs/SCORING_METHODOLOGY.md` with version `2026.06.20-r215`, changelog, deprecation notice, and migration guidance.

## No-copy boundary

No upstream code, prose, configs, prompts, datasets, eval specs, registry rows, README text, or implementation details were copied. No OpenAI Evals subsystem, importer, adapter, registry mirror, parity layer, benchmark runner, or compatibility claim was added.

## Fail-closed evidence requirements

OpenAI Evals-style public-methodology claims require:

- live GitHub metadata relevance review with retrieval date;
- AMC-owned eval-pack manifest;
- dataset/case manifest when claimed;
- validation table artifact;
- evaluator-suite proof through existing AMC primitives;
- fail-closed threshold policy;
- Score/Shield/Watch surface mapping;
- methodology version, changelog, deprecation notice, and migration guidance proof;
- badge-assurance hash;
- signed evidence refs, artifact hashes, row hashes; and
- no-copy/source-review boundary proof.

Metadata-only facts such as the repository label, default branch, license status, star/fork/issue counts, README/docs paths, registry paths, local eval output, aggregate scores, or source metadata alone fail closed.
