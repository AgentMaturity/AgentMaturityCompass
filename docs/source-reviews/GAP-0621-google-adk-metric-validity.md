# GAP-0621 — Google ADK metric-validity boundary

- Gap: `GAP-0621`
- Source: `https://github.com/google/adk-python`
- Source type: GitHub repository metadata
- Retrieval date: 2026-06-20
- Dimension: `eval-metric-validity`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Live GitHub metadata was verified before implementation:

- Repository: `google/adk-python`
- Default branch: `main`
- HEAD at retrieval: `c08debc93fa540a1c181918da9d19825470d02a3`
- License metadata: `Apache-2.0`
- GitHub API description: open-source, code-first Python toolkit for building, evaluating, and deploying AI agents
- GitHub API counts at retrieval: 20,197 stars; 3,596 forks; 708 open issues
- GitHub API timestamps at retrieval: pushed `2026-06-19T21:21:08Z`; updated `2026-06-20T16:51:49Z`
- Retrieval command evidence: `git ls-remote --symref https://github.com/google/adk-python.git HEAD` returned `refs/heads/main` and the HEAD commit above; GitHub repository API returned the metadata above.

## Relevance decision

Relevant only as a source signal for existing AMC metric-validity and public-methodology boundaries. No Google ADK subsystem, adapter, importer, parity layer, integration, or upstream implementation was added.

## Product closure

- Added public-methodology and methodology-versioning boundary checks for Google ADK-style agent-toolkit evaluation metric-validity claims.
- Google ADK repository metadata, package description, branch/license/star data, docs/README summaries, local framework runs, aggregate scores, module paths, tool labels, session labels, or source metadata alone fail closed without an AMC-owned eval pack, validation table, evaluator-suite proof through existing AMC primitives, trace-evaluation proof when traces or Watch are claimed, threshold policy, metric owner, sample size, confidence interval, signed evidence, no-copy proof, artifact hashes, and row hashes.
- Score, Shield, and Watch claims stay bound to AMC-owned evidence rows and existing `evaluatorSuiteCoverage` / `traceEvaluationCoverage` primitives.

## No-copy boundary

No Google ADK code, README prose, docs prose, examples, prompts, configs, tests, implementation details, or UI/assets were copied. The implementation uses only high-level public metadata from live GitHub verification and source-independent AMC methodology controls.
