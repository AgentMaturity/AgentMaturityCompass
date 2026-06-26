# GAP-0852 - Governed Memory public-methodology boundary

- Gap: `GAP-0852`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `personizeai/governed-memory`, `https://github.com/personizeai/governed-memory`, `https://personize.ai/white-paper`
- Retrieval: `2026-06-21` via live GitHub page, GitHub REST API, README API, license API, and shell header checks. Repository URL returned HTTP/2 200. api.github.com repository metadata returned `stargazers_count` 50, no detected language, MIT License metadata, homepage `https://personize.ai/white-paper`, and topics `agent-memory`, `governance`, `llm-evaluation-benchmark`, `memory-systems`, `multi-agent`, and `rag`. README.md and LICENSE API lookups succeeded.
- Status: skipped as public-methodology implementation evidence; no public methodology versioning change was made.

## Live source metadata

The live README identifies Governed Memory: Experiment Datasets and describes Synthetic datasets and experiment protocols for Governed Memory: A Shared Layer for Accuracy and Compliance Across Agentic Workflows. Relevant source-review signals include fully synthetic data, the statement that there is No real customer data, PII, or proprietary information, schema collections, API reference, transcripts, emails, chats, documents, call_notes, multi_source, recall_queries, entity_isolation, governance_pairs, conflict_pairs, and adversarial_governance.

The source also lists experiment labels relevant to governed memory evaluation context, including E01 Extraction Quality Across Content Types, E03 Governance Routing Precision, E07 Recall Speed, Relevance, and Stage Breakdown, E11 Entity Isolation Validation, and E15 Governance Constraint Enforcement Under Adversarial Pressure. It references API endpoint labels such as POST /api/v1/memorize, POST /api/v1/smart-recall, POST /api/v1/evaluate, and POST /api/v1/ai/smart-guidelines.

These facts are useful public methodology review context for governed memory and agent evaluation, but they are not AMC public-methodology lifecycle evidence. No upstream datasets, experiment protocols, schemas, API examples, SDK examples, endpoint examples, results, README prose beyond minimal metadata facts, paper text, prompts, outputs, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC as source-review context for public methodology versioning because governed memory, synthetic experiment datasets, governance routing, entity isolation, adversarial governance, and evaluation protocols can inform how AMC explains Score, Shield, and Watch limitations. It does not justify changing AMC public scoring or badge semantics by itself.

For a public methodology change to pass, AMC needs an AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations update, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, release lifecycle proof, and no-copy proof. Governed Memory metadata alone cannot justify a public methodology version bump. GAP-0852 is therefore closed as a documented no-op: the source remains relevant context, but No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; no scoring semantics changed because the source did not provide AMC-owned methodology versioning evidence. |
| Shield | Context only; governance and adversarial-pressure labels reinforce fail-closed review boundaries but do not add Shield behavior. |
| Watch | Context only; recall/relevance/stage-breakdown labels do not create an AMC live drift receipt or monitoring lifecycle change. |
| Enforce | No runtime policy engine, governed-memory enforcement, endpoint policy, or circuit breaker changed. |
| Vault | No synthetic datasets, schemas, endpoint examples, SDK examples, memory artifacts, or secure-storage behavior changed. |
| Fleet | Multi-agent and memory-system context only; no orchestration topology, memory layer, or fleet simulator added. |
| Passport | No portable proof-bundle field, badge semantics, or public proof token changed. |
| Comply | Governance context only; no compliance framework mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0852.

The focused regression verifies that GitHub/API/README/license/homepage/topic/experiment/API-reference/synthetic-dataset metadata stays out of AMC public methodology semantics. No public methodology version bump, changelog update, deprecation notice, migration guidance, known-limitations update, evidence-taxonomy change, badge semantic change, API route, CLI command, or Studio change was added.

## Fail-closed rule

GitHub HTTP/2 200 reachability, api.github.com repository metadata, README.md presence, LICENSE presence, MIT License metadata, homepage metadata, `stargazers_count` 50, no detected language, topics such as `agent-memory`, `governance`, `llm-evaluation-benchmark`, `memory-systems`, `multi-agent`, or `rag`, Governed Memory labels, synthetic datasets, experiment protocols, schema collections, API reference, endpoint labels, experiment labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing evidence requires AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations text, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, release lifecycle proof, and no-copy proof.

## No-bloat boundary

No Governed Memory adapter, memory-layer wrapper, Personize SDK wrapper, endpoint wrapper, dataset importer, schema importer, experiment runner, experiment collection mirror, API reference mirror, governance-routing simulator, entity-isolation checker, adversarial-governance runner, paper parser, RAG memory subsystem, multi-agent memory subsystem, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific methodology path, or source-specific scoring path was added. No upstream datasets, experiment protocols, schemas, API examples, SDK examples, endpoint examples, results, README prose beyond minimal metadata facts, paper text, prompts, outputs, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0852GovernedMemoryPublicMethodologyBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the implementation no-leakage check passed.
- Focused regression after doc addition: `npx vitest run tests/gap0852GovernedMemoryPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0851AutoMedBenchQuestionExplainabilityBoundary.test.ts tests/gap0852GovernedMemoryPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
