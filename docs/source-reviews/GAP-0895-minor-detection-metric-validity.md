# GAP-0895 - Minor-Detection metric-validity boundary

- Gap: `GAP-0895`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `xiaohanzhang2005/Minor-Detection`, `https://github.com/xiaohanzhang2005/Minor-Detection`
- Retrieval: `2026-06-22` attempted through the web channel. The live GitHub repository page could not be fetched and returned `Cache miss`. Follow-up live search queries returned no results for `"Minor-Detection" "Self-evolving minor-user identification agent"`, `"xiaohanzhang2005" "Minor-Detection"`, and `"minor-user identification" "Minor-Detection"`. The source is therefore source-unverified in this slice.
- Status: completed as `Done - skipped`.

## Local backlog metadata reviewed

The local backlog describes the source as a Self-evolving minor-user identification agent for anthropomorphic AI interaction, with trigger evaluation, evidence chains, deployable protection workflows, minor-protection, risk-detection, dialogue-systems, Hugging Face datasets, RAG, and AI-safety context.

That local metadata is not sufficient to make an AMC product claim or to add metric-validity behavior. No live repository structure, README, license, benchmark, dataset, test, or release metadata could be verified in this slice.

## Relevance decision

`GAP-0895` is skipped because the source could not be live-verified and the remaining local metadata is metadata-only. Minor-user protection and risk-detection evaluation would be relevant to AMC only if it could be represented through AMC-owned metric-validity evidence: validation table, confidence interval, sample size, metric owner, reliability checks, outcome alignment, signed evidence refs, source refs, row hashes, regression thresholds, and CI/lifecycle gate proof.

The source-unverified state means AMC must not add a source-specific implementation, methodology claim, API/CLI behavior, Studio surface, Shield verifier, or scoring path for this gap.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Potential context only; skipped because no verified source and no signed metric-validity evidence. |
| Shield | Potential minor-protection context only; no Shield verifier changed. |
| Watch | No live monitor or evidence drilldown changed. |
| Enforce | No minor-protection policy, trigger evaluator, or runtime guardrail changed. |
| Vault | No datasets, prompts, evidence chains, or user data stored. |
| Fleet | No multi-agent or dialogue-system behavior changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

No product implementation module changed. The focused regression documents the live retrieval failure and proves that unverified Minor-Detection metadata-only evidence fails closed under existing AMC metric-validity behavior.

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API, CLI, Studio, badge, diagnostic question bank, Shield, Watch, Vault, or scoring code changed for GAP-0895.

## Fail-closed rule

Local backlog metadata, GitHub URL identity, source title, Self-evolving minor-user identification agent wording, trigger evaluation wording, evidence chains wording, deployable protection workflows wording, minor-protection tags, risk-detection tags, dialogue-systems tags, Hugging Face datasets tags, RAG tags, AI-safety tags, or an unfetched repository URL alone must fail closed for metric-validity proof. Passing proof requires live-verifiable source context plus AMC-owned validation table, confidence interval, sample size, metric owner, reliability checks, outcome alignment, signed evidence refs, source refs, row hashes, regression thresholds, and CI/lifecycle gate proof.

## No-bloat boundary

No Minor-Detection adapter, minor-user detector, trigger evaluator, evidence-chain importer, Hugging Face dataset importer, RAG workflow, dialogue-system integration, deployable protection workflow, safety classifier, policy engine, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream code, README prose, datasets, prompts, examples, benchmark rows, model outputs, configs, evidence chains, protection workflow definitions, or implementation details were copied.

## Verification

- Live source attempt: `https://github.com/xiaohanzhang2005/Minor-Detection` could not be fetched through the web channel and returned `Cache miss`.
- Live search attempts: `"Minor-Detection" "Self-evolving minor-user identification agent"`, `"xiaohanzhang2005" "Minor-Detection"`, and `"minor-user identification" "Minor-Detection"` returned no results.
- Initial focused TDD regression: `npx vitest run tests/gap0895MinorDetectionMetricValidityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the fail-closed metric-validity behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0895MinorDetectionMetricValidityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0894SmallevalsMetricValidityBoundary.test.ts tests/gap0895MinorDetectionMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
