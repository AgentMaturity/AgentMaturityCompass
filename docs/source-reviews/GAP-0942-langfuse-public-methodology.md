# GAP-0942 - Langfuse public-methodology boundary

- Gap: `GAP-0942`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Langfuse`, `https://langfuse.com`
- Retrieval: `2026-06-22` via live Langfuse homepage review.
- Status: Done - skipped as public-methodology implementation evidence

## Live source metadata

The live Langfuse homepage identified the product as `by ClickHouse`. It showed Community Stats including GitHub Stars 29.5k, Contributors 300+, Community Q&A threads 1.8k, Roadmap threads 1.6k, and Latest OSS release 2 days ago. The hero described Langfuse as an Open Source AI Engineering Platform to Trace and evaluate AI Agents, collaborate with teams, and continuously improve quality, cost, and latency.

Additional source-review signals included Used by 19 of Fortune 50, 10+ billion observations/month, 100,000+ engineers, and a full LLM engineering loop covering observability, prompts, evals, experiments, and human annotation. The product feature list described Hierarchical traces, LLM-as-a-judge, heuristic functions, human review, prompt one-click deployments and rollbacks, golden datasets, cost and latency dashboards, automated alerts, 100+ integrations, OTel language support, and broad framework/provider integrations.

The homepage also described open platform and open source positioning: MIT license, All product features MIT licensed, REST APIs for everything, Query SDK, S3 blob storage export, self-hosting, Docker Compose, Kubernetes Helm, Terraform guides, and active OSS community. Enterprise/scale signals included Clickhouse OLAP database, Async ingestion via Redis queue, S3/Blob storage for large payloads, Edge-cached prompts, 50M+ SDK installs/month, 10+ billion observations processed per month, 2300+ customers, 99.9% uptime, SOC 2 Type II, ISO 27001, GDPR, EU & US Data Regions, and HIPAA eligible.

Those facts are useful competitor and adjacent-product context for Score, Shield, and Watch, but they do not change AMC public methodology versioning. Langfuse product metadata alone cannot justify a public methodology version bump, methodology version, changelog, deprecation notice, or migration guidance because it does not alter AMC scoring semantics, evidence taxonomy, badge semantics, maturity levels, diagnostic question bank, or public methodology contract.

No Langfuse website prose beyond minimal metadata facts, screenshots, SDK code, MCP/CLI prompts, docs snippets, API examples, trace data, prompt data, eval datasets, dashboards, release artifacts, product workflows, or implementation details were copied into AMC.

## Relevance decision

`GAP-0942` is relevant only as a public-methodology no-op and source-review boundary. Langfuse's observability, evals, prompts, experiments, human annotation, open-source, and compliance positioning is adjacent to AMC Score, Shield, and Watch, but it is not an AMC scoring-methodology specification.

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed. No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed; Langfuse product metadata is not methodology-versioning proof. |
| Shield | Product assurance context only; no Shield scoring or safety methodology changed. |
| Watch | Observability context only; no Watch methodology or runtime behavior changed. |
| Enforce | No runtime policy changed. |
| Vault | No traces, prompts, datasets, dashboards, secrets, exports, or upstream artifacts stored. |
| Fleet | No fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No SOC 2, ISO, GDPR, region, HIPAA, or compliance mapping changed. |

## Product closure

No product code changed. The focused regression documents the live source metadata and asserts that this gap does not add `https://langfuse.com`, `langfuse_public_methodology`, or `COMP-002` to AMC public methodology semantics or public-methodology implementation modules.

This closure is a documented skip for implementation: Langfuse product-page claims, release recency, OSS/community metrics, tracing labels, eval labels, prompt labels, OTel/integration labels, scale labels, and compliance labels are not public methodology versioning evidence.

## Fail-closed rule

Live product-page reachability, `by ClickHouse`, GitHub Stars 29.5k, Contributors 300+, Community Q&A threads 1.8k, Roadmap threads 1.6k, Latest OSS release 2 days ago, Open Source AI Engineering Platform labels, Trace and evaluate AI Agents labels, Fortune 50 labels, observations/month labels, engineer-count labels, observability/prompts/evals/experiments/human-annotation labels, Hierarchical traces labels, LLM-as-a-judge labels, heuristic functions labels, human review labels, one-click deployments and rollbacks labels, golden datasets labels, 100+ integrations labels, OTel labels, MIT license labels, REST API labels, Query SDK labels, S3 blob storage export labels, Clickhouse OLAP database labels, Async ingestion via Redis queue labels, 50M+ SDK installs/month labels, 99.9% uptime labels, SOC 2 Type II labels, ISO 27001 labels, GDPR labels, EU & US Data Regions labels, HIPAA eligible labels, local backlog metadata, or competitor identity alone must fail closed for public methodology versioning.

Passing public methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, evidence-taxonomy change, scoring-semantics rationale, and badge compatibility analysis.

Langfuse product metadata alone cannot justify a public methodology version bump.

## No-bloat boundary

No Langfuse adapter, trace importer, prompt importer, eval importer, dashboard integration, MCP server, CLI wrapper, REST API client, Query SDK, S3 export handler, OTel collector, compliance mapper, self-hosting guide mirror, release watcher, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, source-specific scoring path, or parity wrapper was added. No Langfuse website prose beyond minimal metadata facts, screenshots, SDK code, MCP/CLI prompts, docs snippets, API examples, trace data, prompt data, eval datasets, dashboards, release artifacts, product workflows, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0942LangfusePublicMethodologyBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the public-methodology implementation leakage check already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0942LangfusePublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
- Paired regression: `npx vitest run tests/gap0941LangSmithQuestionExplainabilityBoundary.test.ts tests/gap0942LangfusePublicMethodologyBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
