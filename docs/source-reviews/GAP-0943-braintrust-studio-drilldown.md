# GAP-0943 — Braintrust Studio evidence drilldown

- Gap: `GAP-0943`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: Braintrust product homepage and public docs
- Retrieval: live Braintrust homepage at `https://www.braintrust.dev`, documentation index at `https://www.braintrust.dev/docs`, evaluation quickstart at `https://www.braintrust.dev/docs/evaluation-quickstart`, dataset docs at `https://www.braintrust.dev/docs/annotate/datasets`
- Status: Done

## Relevance decision

Relevant, but only as a source-review signal for AMC's existing Score evidence drilldown and Watch source-artifact primitives. The live Braintrust homepage positions the product around "Ship quality AI at scale", "Surface patterns in production", and "Inspect traces in real time". It also describes trace inspection, evals, online scoring, quality gates, and trace-to-dataset workflows that map cleanly to AMC's existing evidence-drilldown route.

This gap does not justify a Braintrust adapter, SDK integration, trace importer, dataset importer, scoring engine, Brainstore mirror, MCP integration, or hosted dashboard parity feature. AMC closure is the generic boundary: a Studio drilldown row is accepted only when an AMC-owned UI route, source artifact links, evidence preview, and empty/error states are all backed by signed evidence receipts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through the existing question evidence drilldown response and per-question signed evidence previews. |
| Shield | Relevant only because rejected evidence reasons and signed receipts keep weak observability metadata from being treated as assurance proof. |
| Enforce | Not in scope; no runtime policy, circuit breaker, or release block was added. |
| Vault | Not in scope; no secret, DLP, HIPAA, GDPR, or data-residency capability changed. |
| Watch | Relevant through existing Watch source artifact links and observability context. |
| Fleet | Not in scope; no fleet orchestration or trust topology changed. |
| Passport | Not in scope; no portable trust token changed. |
| Comply | Context only: the source mentions SOC 2 Type II, GDPR, and HIPAA compliant posture, but this gap does not change AMC compliance mappings. |

## Source signal

Live Braintrust evidence reviewed on 2026-06-22:

- The homepage describes production trace visibility with "Trace everything" and inspection of prompts, responses, and tool calls.
- The quality path includes "Measure quality with evals" and "Score outputs with LLMs, code, or humans".
- The release-control path includes "Block bad releases before they hit production".
- The product sections reviewed include Observability, Evals, and Automation.
- The automation section says Topics surfaces patterns, online scoring catches regressions, and quality gates block bad releases.
- The broader product page references Loop agent, Custom facets, Task-specific trace views, Trace to dataset, MCP, Framework agnostic, Native SDKs, and Brainstore.
- The security section references SOC 2 Type II, GDPR, and HIPAA compliant posture.
- The docs index frames Braintrust as an AI observability platform for measuring, evaluating, and improving AI in production, with workflow stages for instrument, observe, annotate, evaluate, deploy, and admin.
- The evaluation quickstart frames evals as data, task, and scores, with regression detection before deployment.

## Product closure

No product implementation module changed for this source. The existing AMC primitive is sufficient:

- `buildScoreEvidenceDrilldown` renders the question-level drilldown response.
- `buildWatchObsStudioSourceArtifactLinks` builds source artifact links without copying external assets or source prose.
- The focused regression constructs an AMC-owned Braintrust-context row and verifies the route, source links, evidence preview, empty state, error state, signed accepted evidence, rejected evidence reason, and fail-closed behavior.

## Fail-closed rule

Braintrust product-page or docs metadata is rejected unless the AMC row has:

- a valid `/api/v1/score/evidence-drilldown/...` UI route;
- a ready evidence preview;
- enough source artifact links;
- signed accepted evidence refs;
- rejected evidence refs and reasons;
- trace, reasoning trace, receipt, evidence, source artifact, empty-state, and error-state hashes;
- a satisfied status and valid row hash.

Metadata-only evidence fails closed even when it mentions traces, evals, datasets, online scoring, quality gates, compliance, SDKs, MCP, Brainstore, or production observability.

## No-bloat boundary

AMC did not add a Braintrust integration, SDK wrapper, API client, trace importer, eval runner, dataset importer, prompt importer, MCP client, Brainstore mirror, compliance mapper, Watch monitor, Shield verifier, Studio dashboard clone, public methodology version bump, CLI command, package dependency, copied docs prose, screenshots, examples, configs, benchmark rows, or generated outputs.

## Verification

- `npx vitest run tests/gap0943BraintrustStudioDrilldownBoundary.test.ts --reporter=dot`: passed, 1 file / 4 tests.
- `npx vitest run tests/gap0942LangfusePublicMethodologyBoundary.test.ts tests/gap0943BraintrustStudioDrilldownBoundary.test.ts --reporter=dot`: passed, 2 files / 7 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: passed.
- `npm run typecheck`: passed.
