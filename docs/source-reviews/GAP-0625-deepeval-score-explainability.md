# GAP-0625 — DeepEval Question Score Explainability Boundary

- Backlog row: `GAP-0625`
- Dimension: `eval-score-explainability`
- Surfaces: Score, Shield, Watch
- Source reviewed: `https://www.confident-ai.com`
- Retrieval date: 2026-06-20
- Live retrieval result: HTTP 200, `text/html; charset=utf-8`, first-200KB SHA-256 `318c59f3bcf05f7e937ddd5777b9681d2e9ee45be0987a331617307a4d7467c3`

## Relevance decision

Relevant only as a source-review signal for AMC's existing question-level score explainability, guide, and passport primitives. The row maps to AMC-owned requirements for question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence refs, reproducible eval-pack proof, and fail-closed regression thresholds.

## Non-goals / no-bloat boundary

This does **not** add a DeepEval subsystem, SDK, importer, runner, dashboard, hosted service integration, or parity claim. Public website/docs metadata, labels, screenshots, examples, copied prose, local metric output, or source metadata alone are rejected as proof.

## Closure

AMC now binds DeepEval-style question-explainability claims to existing diagnostic/guide/passport receipts. A claim is replayable only when rows contain question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence refs, source-review/no-copy proof, reproducible eval-pack hashes, and fail-closed thresholds.

## Verification

- Focused tests: `tests/questionScoreExplainability.test.ts`
- Typecheck: `npm run typecheck`
