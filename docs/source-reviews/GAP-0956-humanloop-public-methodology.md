# GAP-0956 - Humanloop public-methodology boundary

- Gap: `GAP-0956`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://humanloop.com`, `https://humanloop.com/home`, `https://humanloop.com/docs/getting-started/overview`, `https://humanloop.com/docs/guides/migrating-from-humanloop`, `https://humanloop.com/docs/changelog/2025/08`, `https://humanloop.com/docs/guides/evals/llm-as-a-judge`, `https://humanloop.com/docs/guides/evals/cicd-integration`, `https://humanloop.com/docs/reference/security-compliance`, `https://github.com/humanloop`
- Retrieval: `2026-06-22` via live Humanloop homepage, docs, changelog, migration guide, security docs, and GitHub organization pages.
- Status: Done - skipped as public-methodology implementation evidence. No public methodology version bump.

## Live source metadata

The live Humanloop homepage currently announces `Humanloop joins Anthropic` and says the company is sunsetting the Humanloop platform. The docs overview identifies Humanloop as an `LLM Evals Platform for Enterprises`, with Evaluation, Prompt Management, and Observability as the product areas. The overview also describes Evals-driven development and Collaborative development as best practices and labels the docs build as `v5.0`.

The Humanloop product page and docs expose prompt-management, evaluation, and observability signals including Prompt Editor, Version Control, CI/CD, Human review, Alerting and guardrails, Online evaluations, Tracing and logging, and the ability to replay any outputs. The migration guide says the platform will be sunset on September 8th, 2025, and that after that date all data will be permanently inaccessible. It also references exporting Files, Versions, Logs, and Evaluations. The August 2025 changelog repeats the platform sunset notice. The docs include Set up LLM as a Judge, Set up CI/CD Evaluations, and Security and Compliance pages. The security page references SOC2 Type II, RBAC, SSO, access logs, encryption, and governance controls. The GitHub organization page is reachable at `https://github.com/humanloop`.

These facts are competitor/source-review signals only. No Humanloop product copy, docs examples, code, screenshots, changelog prose, migration instructions, export tool commands, SDK snippets, security control text, policies, trust-report content, datasets, evaluation rows, prompts, logs, UI flows, screenshots, or implementation details were copied into AMC.

## Relevance decision

This source is adjacent to AMC because Humanloop used evals, prompt management, observability, CI/CD evals, human review, online evaluation, replay, and governance language in the same broad Score/Shield/Watch space. However, GAP-0956 requests public methodology versioning. Humanloop platform metadata alone cannot justify a public methodology version bump in AMC.

AMC already has a public methodology manifest with methodology version, changelog, deprecation, migration, scoring limitations, and evidence-taxonomy boundaries. GAP-0956 therefore closes as a documented no-op: relevant as a product signal, not as implementation evidence for changing AMC score semantics.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Adjacent only; Humanloop eval metadata does not alter AMC scoring methodology or metric definitions. |
| Shield | Adjacent through eval, guardrail, human review, and governance terms, but no Shield verifier or policy changed. |
| Watch | Adjacent through observability, online evaluations, tracing, logging, and replay language, but no Watch monitor changed. |
| Enforce | No runtime guardrail, policy, deployment gate, or circuit breaker changed. |
| Vault | Security/privacy and data-export context only; no Vault storage, DLP, secrets, or residency behavior changed. |
| Fleet | No multi-agent orchestration or trust topology behavior changed. |
| Passport | No portable trust token, badge, or proof-bundle schema changed. |
| Comply | Security/compliance context only; no compliance framework mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0956. No public methodology version bump was created.

The focused regression verifies the source-review note records the live Humanloop source metadata and required sections, confirms that Humanloop platform metadata stays out of `getPublicMethodologyManifest()`, and checks that source-specific Humanloop identifiers did not enter public methodology implementation modules.

## Fail-closed rule

Humanloop name, homepage, docs, changelog, migration guide, sunset notice, GitHub organization, evals, prompt management, observability, LLM-as-a-judge docs, CI/CD evals docs, security/compliance docs, SOC2 Type II, RBAC, SSO, export tooling, product screenshots, product claims, or local backlog metadata must fail closed as public-methodology evidence. Passing evidence for an AMC methodology change requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, scoring-semantic delta, signed evidence taxonomy, regression thresholds, public docs, badge output impact, and tests proving the change.

## No-bloat boundary

No Humanloop adapter, Humanloop SDK wrapper, Humanloop export importer, docs crawler, prompt manager, eval runner, LLM-as-a-judge wrapper, CI/CD integration, migration assistant, security-control mapper, trust-center mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, badge migration, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No Humanloop code, docs examples, product copy, screenshots, changelog prose, migration instructions, export tool commands, SDK snippets, security control text, policies, trust-report content, datasets, evaluation rows, prompts, logs, UI flows, screenshots, generated outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0956HumanloopPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0955EpistemicFailureModesJudgeCalibrationBoundary.test.ts tests/gap0956HumanloopPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
