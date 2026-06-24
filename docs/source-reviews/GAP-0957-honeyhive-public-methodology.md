# GAP-0957 - HoneyHive public-methodology boundary

- Gap: `GAP-0957`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://www.honeyhive.ai`, `https://docs.honeyhive.ai/v2/introduction/what-is-hhai`, `https://www.honeyhive.ai/evaluation`, `https://www.honeyhive.ai/observability`, `https://www.honeyhive.ai/playground`, `https://github.com/honeyhiveai/honeyhive-cli`, `https://docs.honeyhive.ai/v2/setup/self-hosted`
- Retrieval: `2026-06-22` via live HoneyHive homepage, product pages, docs, CLI GitHub repository, and self-hosting docs.
- Status: Done - skipped as public-methodology implementation evidence. No public methodology version bump.

## Live source metadata

The live HoneyHive homepage identifies the product as `The observability layer for production agents` and describes a continuous improvement loop around observability and evaluation. The homepage exposes Traces, Trajectories, Experiments, Dashboard, Alerts, Playground, Annotations, OpenTelemetry-native instrumentation, Online Evaluation, Session Replays, Graph and Timeline View, user feedback, alerting, drift detection, automations, dashboards, root-cause workflows, offline evals, datasets, Custom Rubrics, Audit Trail, Evaluator Alignment, signed manifests, OIDC, RBAC, SSO & SAML, SOC 2, GDPR, and HIPAA claims.

The live docs identify HoneyHive as an AI observability and evaluation platform for tracing, evaluating, monitoring, and improving AI agents from development to production. The docs describe an Evaluation-Driven Development workflow, Run Your First Eval onboarding, Open Standards, Open Ecosystem posture, experiments, datasets, regression tests, LLM evaluators, code evaluators, annotation queues, prompt management, OpenTelemetry, model/framework/runtime agnostic operation, hosting options, and self-hosted deployment. The evaluation product page adds continuous testing, release gates, code/AI/human evaluators, CI/CD Integration, evaluation reports, dataset management, Regression Detection, LLM-as-a-judge and code evaluators, golden datasets, pre-built evaluator categories, and custom evaluators. The HoneyHive CLI repository is reachable at `https://github.com/honeyhiveai/honeyhive-cli`.

These facts are competitor/source-review signals only. No HoneyHive product copy, docs examples, CLI examples, commands, SDK snippets, screenshots, dashboards, traces, eval rows, model outputs, prompts, rubrics, datasets, alerts, policies, trust-center content, architecture diagrams, self-hosting configs, code, generated outputs, or implementation details were copied into AMC.

## Relevance decision

HoneyHive is adjacent to AMC because it uses observability, evaluation, replay, traces, CI/CD, review, audit, and governance language in the same broad Score/Shield/Watch market. However, GAP-0957 requests public methodology versioning. HoneyHive platform metadata alone cannot justify a public methodology version bump in AMC.

AMC already has a public methodology manifest with methodology version, changelog, deprecation notice, migration guidance, scoring limitations, and evidence-taxonomy boundaries. GAP-0957 therefore closes as a documented no-op: relevant as a product signal, not as implementation evidence for changing AMC score semantics.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Adjacent through evaluation, experiments, datasets, reports, and regression tests, but no AMC scoring methodology changed. |
| Shield | Adjacent through LLM evaluators, guardrails, review, audit, and governance language, but no Shield verifier changed. |
| Watch | Adjacent through traces, online evaluation, alerts, drift detection, dashboards, and replays, but no Watch monitor changed. |
| Enforce | No runtime policy, provider route, deployment gate, or circuit breaker changed. |
| Vault | Security, tenancy, signed manifest, OIDC, RBAC, SSO, SOC 2, GDPR, HIPAA, and self-hosted context only; no Vault behavior changed. |
| Fleet | Agent graph and multi-agent trace context only; no fleet topology or orchestration behavior changed. |
| Passport | No portable trust token, badge, or proof-bundle schema changed. |
| Comply | Governance/compliance context only; no compliance framework mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0957. No public methodology version bump was created.

The focused regression verifies the source-review note records the live HoneyHive source metadata and required sections, confirms that HoneyHive platform metadata stays out of `getPublicMethodologyManifest()`, and checks that source-specific HoneyHive identifiers did not enter public methodology implementation modules.

## Fail-closed rule

HoneyHive name, homepage, docs, CLI repository, self-hosting docs, observability, evaluation, tracing, OpenTelemetry, online evaluation, session replay, graph/timeline view, alerts, drift detection, experiments, datasets, CI/CD integration, LLM-as-a-judge, human review, custom rubrics, audit trail, evaluator alignment, signed manifests, OIDC, RBAC, SSO & SAML, SOC 2, GDPR, HIPAA, self-hosting, product screenshots, product claims, or local backlog metadata must fail closed as public-methodology evidence. Passing evidence for an AMC methodology change requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, scoring-semantic delta, signed evidence taxonomy, regression thresholds, public docs, badge output impact, and tests proving the change.

## No-bloat boundary

No HoneyHive adapter, HoneyHive SDK wrapper, HoneyHive CLI wrapper, docs crawler, MCP client, tracing skill installer, prompt manager, eval runner, LLM-as-a-judge wrapper, CI/CD integration, alert connector, drift detector, replay importer, trace importer, self-hosted deployment profile, security-control mapper, trust-center mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, badge migration, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No HoneyHive code, docs examples, CLI examples, commands, SDK snippets, screenshots, dashboards, traces, eval rows, model outputs, prompts, rubrics, datasets, alerts, policies, trust-center content, architecture diagrams, self-hosting configs, generated outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0957HoneyHivePublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0956HumanloopPublicMethodologyBoundary.test.ts tests/gap0957HoneyHivePublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
