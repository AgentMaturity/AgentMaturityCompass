# GAP-0005 - Braintrust question-level score explainability

- Gap: `GAP-0005`
- Dimension: Question-level score explainability
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: Braintrust public product and documentation pages
- Retrieval: Live web retrieval on 2026-06-25 from `https://www.braintrust.dev`, `https://www.braintrust.dev/docs`, `https://www.braintrust.dev/docs/evaluation-quickstart`, `https://www.braintrust.dev/docs/annotate/datasets`, `https://www.braintrust.dev/docs/evaluate/run-evaluations`, `https://www.braintrust.dev/docs/observe`, `https://www.braintrust.dev/docs/evaluate/score-online`, and `https://www.braintrust.dev/docs/deploy/monitor`
- Status: Done

## Relevance decision

Braintrust is relevant to AMC because its public product and docs describe evaluation, logging, datasets, observability, online scoring, quality gates, and production monitoring. The source reinforces an existing AMC requirement: every question-level score must show the question ID, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, signed evidence rows, and regression thresholds before Score, Shield, Watch, or Passport consumers treat the row as external proof.

The source is not proof of AMC score quality and does not justify product parity. Braintrust page labels, dataset docs, trace docs, scorer examples, quality-gate wording, screenshots, SDK examples, or UI behavior cannot replace AMC-owned receipts. The closure is the generic AMC boundary: use existing question explainability receipts and fail closed when metadata-only evidence tries to stand in for signed evidence and threshold proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant. The existing `questionExplainability` receipt explains each question score with accepted evidence IDs, rejected evidence reasons, missing gates, repair hints, row hashes, and score receipt refs. |
| Shield | Relevant. Shield exposes read-only score explainability receipts so safety reviewers see the same accepted/rejected evidence chain instead of trusting aggregate maturity labels. |
| Enforce | Not changed. No runtime policy engine, release blocker, or Braintrust quality-gate adapter was added. |
| Vault | Not changed. No trace storage, secret, DLP, HIPAA, GDPR, or data-residency subsystem was added. |
| Watch | Relevant. Watch explain packets can carry the same `questionExplainability` object beside report Markdown for operator review. |
| Fleet | Not changed. Fleet orchestration and trust topology remain separate consumers of scored evidence. |
| Passport | Relevant through existing compact proof binding: Passport can carry `maturity.questionExplainabilityHash` and a summary without exposing every evidence detail. |
| Comply | Not changed. Compliance mappings consume the evidence ledger and Passport binding, but no compliance framework changed. |

## Product closure

No product implementation module changed for this Top 100 source-review closure. AMC already includes the required generic primitive:

- `buildQuestionExplainabilityReport` emits question ID, surfaces, claimed/supported/final levels, accepted evidence IDs, signed evidence refs, rejected evidence reasons, missing gate reasons, repair hints, score receipt refs, deterministic row hashes, replayability, fail-closed status, and manifest hash.
- `buildEvalScoreExplainabilityPack` projects that report into a compact proof pack that remains `fail_closed` unless reproducible eval-pack rows and fail-closed thresholds are present.
- Diagnostic JSON and Markdown include `questionExplainability`; Markdown reports include `## Question Score Explainability`.
- Watch explain responses include `questionExplainability`.
- Shield exposes `GET /api/v1/shield/score-explainability/:runId`.
- Passport binds `maturity.questionExplainabilityHash`, replayable/fail-closed flags, and a compact row summary.

Live Braintrust source facts used for the relevance review:

- The homepage uses the product framing `Ship quality AI at scale`, `Surface patterns in production`, and `Inspect traces in real time`.
- The product page describes `Measure quality with evals`, `Score outputs with LLMs, code, or humans`, and `Block bad releases before they hit production`.
- The homepage presents Observability, Evals, and Automation as product sections, with trace inspection, versioned datasets, automated/human scoring, online scoring, and quality gates.
- Dataset docs define versioned datasets that track improvements over time and list record fields `input`, `expected`, `metadata`, and `tags`.
- Dataset docs describe building datasets from production logs, user feedback, manual curation, traces, or Loop, and include track performance for row-level experiment behavior.
- Observe docs say logs use the same data structure as experiments and that Scores and feedback apply to both logs and experiments.
- Online scoring docs describe continuous quality monitoring on production traces, catching regressions, and evaluating real user interactions and edge cases.
- Monitor docs include production metrics such as request count, latency, token count, cost, scores, and tools; example alert conditions include `Score drops below 0.8`.

## Fail-closed rule

Metadata-only Braintrust evidence fails closed. Product-page text, docs-page text, docs index entries, screenshot labels, trace labels, experiment labels, dataset names, scorer names, SDK examples, automation labels, quality-gate labels, compliance labels, `Ship quality AI at scale`, `Measure quality with evals`, `Score outputs with LLMs, code, or humans`, `Block bad releases before they hit production`, `versioned datasets`, online scoring descriptions, or monitor alert examples are rejected unless AMC-owned question evidence exists.

Required AMC evidence includes a question ID, accepted evidence IDs, signed evidence refs, rejected evidence reasons, repair hint, missing gate/cap reasons where applicable, reproducible eval pack, dataset/test-case/evaluator/experiment/export/trace/CI hashes, regression thresholds, score receipt ref, row hash, manifest hash, replayability flag, fail-closed flag, and Passport binding when external proof is exported.

## No-bloat boundary

No Braintrust adapter, SDK wrapper, API client, trace importer, dataset importer, eval runner, scorer importer, prompt importer, MCP integration, Brainstore mirror, quality-gate clone, Studio dashboard clone, Shield verifier, Watch monitor, Passport schema change, public methodology version bump, CLI command, API route, package dependency, source-specific question-explainability module, or parity layer was added.

No Braintrust code, SDK examples, screenshots, UI assets, docs prose beyond short source labels, datasets, traces, scorer configs, prompts, generated outputs, benchmark rows, customer claims, compliance artifacts, or implementation details were copied into AMC.

## Verification

- TDD red run: `npx vitest run tests/gap0005BraintrustQuestionExplainabilityBoundary.test.ts --reporter=dot` initially failed because `docs/source-reviews/GAP-0005-braintrust-question-explainability.md` was missing while the existing question-explainability primitive passed its positive and negative paths.
- Focused verification: `npx vitest run tests/gap0005BraintrustQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression verification: `npx vitest run tests/gap0005BraintrustQuestionExplainabilityBoundary.test.ts tests/questionScoreExplainability.test.ts tests/apiRouters.test.ts tests/passportPublicApiAndCli.test.ts tests/gap0943BraintrustStudioDrilldownBoundary.test.ts tests/braintrustLiveDrift.test.ts --reporter=dot` passed, 6 files / 104 tests.
- Diff check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 936 files / 7,733 tests.
