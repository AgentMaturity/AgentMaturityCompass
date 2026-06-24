# GAP-0653 — pydantic/logfire question-level score explainability boundary

- Gap: `GAP-0653`
- Priority: `P0`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `github_repo:pydantic/logfire`
- Source URL: `https://github.com/pydantic/logfire`
- Retrieval: `2026-06-21` via GitHub REST API and `git ls-remote`
- GitHub API metadata SHA-256: `7eeed1f9e0ed18dd28d72580a873f36d4b162e420f4a64912cee5aabfaf45765`

## Live source metadata

| Field | Value |
| --- | --- |
| Repository | `pydantic/logfire` |
| Description | `AI observability platform for production LLM and agent systems.` |
| Default branch | `main` |
| HEAD commit | `ced2fd2cd866784a11b3a8520b9ce0d3989a2c2b` |
| License | MIT (`MIT License`, SPDX `MIT`) |
| Created | `2024-04-23T11:50:23Z` |
| Updated | `2026-06-20T22:09:39Z` |
| Pushed | `2026-06-20T19:20:01Z` |
| Stars / forks / open issues / subscribers | `4312` / `250` / `230` / `19` |
| Size / language / visibility | `80840` / Python / public |
| Archived / disabled | `false` / `false` |
| `ls-remote --symref HEAD` | `ref: refs/heads/main HEAD` |

## Relevance decision

Relevant to AMC only as source-review context for existing question-level score explainability and observability Studio drilldown primitives. Logfire's repository metadata and observability positioning can help label a source-review boundary for Score, Shield, and Watch, but it is not external proof of an AMC score, Shield receipt, or Watch view.

Accepted use is limited to AMC-owned question rows that already carry a question id, signed accepted evidence, rejected-evidence reasons, repair hints, evidence drilldown route, source artifact links, trace/reasoning/receipt/evidence previews, empty/error-state receipts, row hashes, and fail-closed thresholds through the existing `obsStudioDrilldownLens` / score drilldown path.

Metadata-only claims remain rejected evidence. A Logfire repository label, GitHub counts, README summary, local trace screenshot, dashboard route, SDK snippet, package name, aggregate score, or source metadata alone does not establish question-level score explainability.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Yes, only through existing question-score explainability rows and evidence drilldown proof. |
| Shield | Yes, only when unsupported metadata-only evidence is rejected with signed evidence refs and repair hints. |
| Watch | Yes, only when caller-owned observability traces/previews/empty/error states are hash-bound through existing Watch/drilldown receipts. |
| Guide | Indirect: guide/passport outputs may cite the accepted/rejected question-row proof already produced by AMC. |
| Passport | Indirect: portable proof remains AMC-owned row hashes and signed evidence, not Logfire parity. |
| Fleet / Enforce / Vault / Comply | No direct product scope in this source review. |

## Product closure

GAP-0653 is closed through existing question-score explainability and observability Studio drilldown primitives. The product boundary is AMC-owned question rows, rejected-evidence reasons, repair hints, route/preview links, row hashes, and signed evidence, not a Logfire integration or parity claim.

## No-bloat boundary

No Logfire subsystem, SDK integration, importer, adapter, dashboard clone, parity layer, trace schema mirror, copied upstream code, copied docs, copied config, or copied UI asset was added. This review binds only to existing AMC question-score explainability and observability Studio drilldown lenses.

## Fail-closed rule

Logfire repository metadata, stars, README labels, dashboard screenshots, SDK snippets, trace-route names, aggregate score labels, and observability positioning must fail closed as question-score explainability proof. A claim can pass only with AMC-owned question IDs, accepted evidence IDs, rejected-evidence reasons, repair hints, source artifact links, signed evidence refs, row hashes, threshold results, and drilldown evidence previews.

## Acceptance boundary

A Logfire-style question-level score explainability claim can pass only when all of the following are present in AMC-owned artifacts:

- live source-review metadata for `pydantic/logfire` recorded as identity, not proof;
- a signed AMC question row with accepted evidence ids and rejected metadata-only evidence reasons;
- an evidence drilldown route under AMC control;
- source artifact links and hashes for trace, reasoning trace, receipt, evidence preview, source artifact preview, empty state, and error state;
- evidence preview count and source artifact link count meeting the configured thresholds;
- row hash, signed evidence refs, fail-closed threshold behavior, and repair hints.

## Verification

- Focused regression: `npx vitest run tests/gap0653LogfireQuestionScoreExplainability.test.ts`
- Typecheck: `npm run typecheck`
