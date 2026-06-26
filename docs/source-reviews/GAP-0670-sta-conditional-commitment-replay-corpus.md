# GAP-0670 — STA conditional commitment replay-corpus boundary

- Gap: `GAP-0670`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: local backlog metadata for `https://openalex.org/W7160493853` / DOI `10.5281/zenodo.20063055`; live primary source was not reachable in browser search.
- Retrieval: `2026-06-21`; exact-title, DOI, Zenodo record-id, and `Signal-Time-Authority` browser searches returned no matching primary source result; shell network remains DNS-restricted in this environment.
- Status: skipped; metadata-only source signal is insufficient for product code, replay evidence, public methodology, or maturity claims.

## Relevance decision

The local backlog row describes `STA Conditional Commitment Architecture for Output-Mediated and Multi-Agent AI Systems: A Future Extension Note for the Signal-Time-Authority Framework` and maps it to `eval-replay-corpus`. That metadata is not enough to verify the source, inspect its method, or decide that AMC needs a product implementation.

Because the live source could not be reached, GAP-0670 is relevant only as a fail-closed triage note. If the source is later verified, any accepted replay claim would still need to flow through AMC's existing generic replay-corpus primitive: AMC-owned manifests, deterministic fixture hashes, fixed seeds, baseline/candidate rows, score deltas, signed evidence refs, CI/lifecycle receipt hashes, row hashes, regression thresholds, and no-copy proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No score change. Metadata-only replay-corpus claims cannot affect maturity scoring. |
| Shield | No assurance change. Unverified architecture terms cannot establish safety proof or deception resistance. |
| Watch | No observability change. No live source, trace, replay receipt, or lifecycle evidence was available. |
| Enforce | No policy-enforcement or commitment-architecture feature. |
| Vault | No secrets, privacy, or data-residency feature. |
| Fleet | No multi-agent coordination, authority, or commitment subsystem. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No compliance mapping or methodology claim. |

## Product closure

No replay-corpus product code changed. The local backlog row remains a triage pointer, not accepted evidence. GAP-0670 is closed as a documented skip because the source is not live-verifiable here and the only available signal is local metadata.

## Fail-closed rule

OpenAlex IDs, DOI strings, Zenodo record IDs, title text, `Signal-Time-Authority` wording, `conditional commitment` wording, future-extension framing, local backlog metadata, or inferred multi-agent relevance alone must fail closed. Accepted replay claims still require AMC-owned manifests, deterministic fixture hashes, fixed seeds, baseline/candidate rows, score deltas, signed evidence refs, CI/lifecycle receipt hashes, row hashes, thresholds, and no-copy proof.

## No-bloat boundary

No Signal-Time-Authority framework, commitment architecture, multi-agent authority simulator, output-mediated AI subsystem, Zenodo importer, OpenAlex importer, paper parser, source-specific replay corpus, benchmark runner, API route, CLI command, Studio panel, Fleet topology feature, methodology version bump, or parity layer was added. No upstream prose, abstract text, diagrams, formulas, prompts, configs, generated examples, datasets, benchmark rows, source code, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0670StaConditionalCommitmentReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
