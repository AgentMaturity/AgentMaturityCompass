# GAP-0015 - Lunary public methodology versioning

- Gap: `GAP-0015`
- Dimension: Public methodology versioning
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: Lunary homepage `https://lunary.ai` and docs introduction `https://docs.lunary.ai/get-started`
- Retrieval: Live web retrieval on 2026-06-25; homepage HTTP 200, `text/html; charset=utf-8`, first-200KB SHA-256 `311d8738698d4a7f26c3044d5a2bdcefce9a70b560f64132aee7b26a8b177829`; docs HTTP 200, `text/html; charset=utf-8`, first-200KB SHA-256 `389b304b0a0d546a7d677684616559719a6d82f6a0bbad6b5e6e0230cd386c3c`
- Status: Done

## Relevance decision

Lunary is relevant to AMC because the live product page and docs describe agent observability, Prompt Templates, chat replay, analytics, topic classification, Agent Tracing, Score LLM responses, feedback, PII masking, monitoring alerts, and enterprise/security context. The homepage uses the current framing Build AI agents with confidence, and the docs identify Lunary as a platform for AI chatbots and LLM-powered applications with observability, chats, prompts, and classification.

Those concepts map to existing AMC Score, Shield, and Watch public-methodology boundaries. They do not create a Lunary product integration, parity claim, prompt-management subsystem, trace importer, dashboard clone, or external proof source. `GAP-0015` closes by strengthening the existing Lunary observability/evaluation boundary so public methodology versioning proof is required before Lunary-style evidence can be externally comparable.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant. Score claims that cite Lunary-style observability, prompt, trace, response-scoring, feedback, or eval evidence must carry AMC-owned eval packs, validation tables, thresholds, methodology version, changelog, deprecation notice, migration guidance, signed evidence, and row hashes. |
| Shield | Relevant only when Shield receipts cite Lunary-style review, feedback, response-score, monitoring, or alert evidence. Missing AMC evidence fails closed. |
| Enforce | Not changed. No runtime policy or Lunary enforcement adapter was added. |
| Vault | Not changed. No upstream traces, prompts, chat replays, feedback records, PII records, dashboards, or customer data are stored. |
| Watch | Relevant. Watch claims that cite Lunary-style tracing, analytics, or alerts must use AMC-owned live evidence and signed receipt paths. |
| Fleet | Not changed. Agent context remains covered by existing Fleet primitives. |
| Passport | Indirectly relevant through badge and methodology assurance hashes; no Passport schema changed. |
| Comply | Security/certification labels are source-review context only; no SOC 2, ISO, GDPR, region, or compliance mapping changed. |

## Product closure

AMC now publishes `2026.06.25-r219` as the current public methodology version for this closure. The existing `lunary_observability_metric_validity` boundary now requires methodology version, changelog, deprecation notice, migration guidance, badge-assurance hash, validation table, threshold policy, metric owner, sample size, confidence interval, signed evidence, no-copy proof, and row hashes before Score, Shield, or Watch claims can use Lunary-style evidence.

The methodology-versioning receipt now includes explicit Lunary lifecycle audit fields: `lunaryMethodologyVersionProof`, `lunaryChangelogProof`, `lunaryDeprecationNoticeProof`, `lunaryMigrationGuidanceProof`, and `lunaryBadgeAssuranceHash`. The public scoring methodology doc was updated to match the machine-readable manifest.

## Fail-closed rule

metadata-only Lunary evidence fails closed. A product label, public webpage, docs page, dashboard screenshot, prompt-template label, trace id, chat replay label, analytics chart, response score, feedback widget, PII masking label, alert label, security/compliance label, hosted-in-cloud label, SDK snippet, local export, copied website content, or source metadata is rejected unless AMC-owned eval-pack manifests, validation tables, threshold policy, methodology version, changelog, deprecation notice, migration guidance, badge-assurance hash, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, row hashes, and no-copy/source-review proof are present.

## No-bloat boundary

No Lunary adapter, SDK integration, trace importer, prompt manager, prompt-template importer, chat-replay importer, feedback importer, analytics connector, PII masking bridge, alert connector, security/certification mapper, dashboard clone, OpenTelemetry wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, package dependency, source-specific module, or parity layer was added. No copied Lunary website prose, docs prose beyond minimal metadata facts, screenshots, examples, prompts, configs, trace exports, chat replays, feedback records, dashboards, SDK snippets, benchmark rows, generated outputs, or implementation details were added.

## Verification

- TDD red run: `npx vitest run tests/gap0015LunaryPublicMethodologyVersioning.test.ts --reporter=dot` failed because this source-review doc did not exist, the current methodology version was still `2026.06.25-r218`, and the Lunary boundary did not yet require methodology version, changelog, deprecation notice, and migration guidance.
- Focused verification: `npx vitest run tests/gap0015LunaryPublicMethodologyVersioning.test.ts --reporter=dot` passed, 1 file / 3 tests.
- Related public-methodology regression: `npx vitest run tests/gap0015LunaryPublicMethodologyVersioning.test.ts tests/gap0001LangSmithPublicMethodologyBoundary.test.ts tests/gap0620FactCheckingFactualityReview.test.ts tests/gap0629OpenAiEvalsPublicMethodology.test.ts tests/gap0630ChemGraphMetricValidity.test.ts tests/gap0633LmEvaluationHarnessMetricValidity.test.ts tests/gap0638PocketFlowPublicMethodology.test.ts tests/gap0639OpenAiSimpleEvalsMetricValidity.test.ts tests/publicMethodology.test.ts tests/badge/badgeCli.test.ts --reporter=dot` passed, 10 files / 36 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 996 files / 7,999 tests.
