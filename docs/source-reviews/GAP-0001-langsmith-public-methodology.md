# GAP-0001 - LangSmith public methodology versioning

- Gap: `GAP-0001`
- Dimension: Public methodology versioning
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: LangSmith product, observability, and evaluation pages
- Retrieval: Live web retrieval on 2026-06-25 from `https://www.langchain.com/langsmith`, `https://www.langchain.com/langsmith/observability`, and `https://www.langchain.com/langsmith/evaluation`
- Status: Done

## Relevance decision

LangSmith is relevant to AMC because its public product pages describe agent observability, tracing, monitoring, offline and online evaluation, human feedback, and CI threshold workflows. Those concepts map to existing AMC Score, Shield, and Watch evidence/methodology boundaries. The source is not treated as product parity, an integration requirement, or external proof of AMC scores.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant. Public methodology claims using LangSmith-style evals must carry AMC-owned eval packs, validation tables, threshold policy, methodology version/changelog/deprecation/migration proof, signed evidence, and row hashes. |
| Shield | Relevant only when Shield receipts cite LangSmith-style evaluator, feedback, threshold, or trace evidence. Missing AMC evidence fails closed. |
| Enforce | Not changed. No runtime policy engine or LangSmith enforcement adapter was added. |
| Vault | Not changed. No trace storage, credential handling, or data-residency subsystem was added. |
| Watch | Relevant. Watch alerts that cite LangSmith-style observability or online evals must use existing AMC live evidence and signed receipt paths. |
| Fleet | Not changed. Multi-agent fleet behavior remains covered by existing Fleet primitives. |
| Passport | Indirectly relevant through badge/methodology assurance hashes, but no portable trust-token behavior changed. |
| Comply | Not changed. Compliance mappings remain evidence consumers, not LangSmith integrations. |

## Product closure

AMC now publishes `2026.06.25-r218` as the current public methodology version for this closure. The existing `langsmith_eval_observability_metric_validity` boundary now requires methodology version, changelog, deprecation notice, migration guidance, and signed evidence before Score, Shield, or Watch claims can use LangSmith-style evidence. The methodology-versioning receipt and badge assurance hash now include the LangSmith source-review boundary, rejected metadata-only evidence, and fail-closed gate checks.

## Fail-closed rule

metadata-only LangSmith evidence fails closed. A product label, public webpage, dashboard screenshot, trace id, run id, local export, copied evaluator name, aggregate score, cost/latency total, or copied website content is rejected unless AMC-owned eval-pack manifests, validation tables, threshold policy, methodology version/changelog/deprecation/migration proof, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, and row hashes are present.

## No-bloat boundary

No LangSmith adapter, SDK integration, trace importer, dataset importer, evaluator importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, package dependency, source-specific module, or parity layer was added. No copied LangSmith website prose, screenshots, examples, prompts, configs, trace exports, datasets, evaluator definitions, or implementation details were added.

## Verification

- TDD red run: `npx vitest run tests/gap0001LangSmithPublicMethodologyBoundary.test.ts --reporter=dot` initially failed because the source-review doc and LangSmith assurance binding were missing.
- Focused verification: `npx vitest run tests/gap0001LangSmithPublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
- Related regression verification: `npx vitest run tests/gap0620FactCheckingFactualityReview.test.ts tests/gap0629OpenAiEvalsPublicMethodology.test.ts tests/gap0630ChemGraphMetricValidity.test.ts tests/gap0633LmEvaluationHarnessMetricValidity.test.ts tests/gap0638PocketFlowPublicMethodology.test.ts tests/gap0639OpenAiSimpleEvalsMetricValidity.test.ts tests/publicMethodology.test.ts tests/gap0001LangSmithPublicMethodologyBoundary.test.ts --reporter=dot` passed, 8 files / 24 tests.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 934 files / 7,725 tests.
