# GAP-0838 - Auto-RAG-Eval metric-validity boundary

- Gap: `GAP-0838`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `amazon-science/auto-rag-eval`, `https://github.com/amazon-science/auto-rag-eval`, `https://arxiv.org/abs/2405.13622`
- Retrieval: `2026-06-21` via live GitHub page review and shell header checks. Repository URL returned HTTP/2 200. The live page exposed README.md, LICENSE, Apache-2.0 license metadata, and the code repository for the ICML 2024 paper `Automated Evaluation of Retrieval-Augmented Language Models with Task-Specific Exam Generation`. Direct api.github.com DNS lookup failed in this shell.
- Status: closed through existing metric-validity receipts; no Auto-RAG-Eval integration, task-specific exam generator, RAG evaluator, Bedrock/Claude wrapper, lm-harness adapter, benchmark importer, or source-specific metric-validity path added.

## Live source metadata

The live repository page and local backlog identify Auto-RAG-Eval as the code repo for the ICML 2024 paper `Automated Evaluation of Retrieval-Augmented Language Models with Task-Specific Exam Generation`. Relevant source-review signals include task-specific exam generation, RAG system evaluation, Bedrock, Claude, lm-harness, Python implementation context, README.md, LICENSE, and Apache-2.0 license metadata.

These facts are metric-validity context only. They do not authorize copying upstream code, README prose beyond minimal metadata facts, datasets, generated exams, prompts, evaluation rows, RAG system configs, Bedrock/Claude settings, lm-harness configs, scripts, tables, figures, generated outputs, or implementation details into AMC.

## Relevance decision

GAP-0838 is relevant to AMC because RAG evaluation metrics can be invalid if they lack construct validity, reliability checks, sample-size support, metric ownership, confidence intervals, outcome alignment, signed evidence, and replayable eval-pack proof. The gap maps to AMC's existing metric-validity primitive: validation table, confidence interval, sample size, metric owner, signed evidence refs, row hashes, eval pack, and CI gate proof.

It does not require an Auto-RAG-Eval runner, task-specific exam generator, RAG evaluator, Bedrock/Claude wrapper, lm-harness adapter, GitHub importer, API route, CLI command, Studio panel, or methodology version bump. Repository metadata can explain why metric validity matters for RAG evaluation, but it cannot replace AMC-owned metric-validity evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing validation table, confidence interval, sample-size, metric-owner, and eval-pack proof. |
| Shield | Relevant because unsupported metric-validity claims fail closed without signed evidence and outcome alignment. |
| Watch | Relevant through CI/lifecycle gate evidence that can block or surface metric-validity regressions. |
| Enforce | No runtime RAG policy, provider route, evaluator route, or circuit breaker changed. |
| Vault | No datasets, generated exams, prompts, configs, traces, or secure-storage behavior changed. |
| Fleet | RAG evaluation context only; no orchestration topology or multi-agent runtime changed. |
| Passport | No portable trust token or proof-bundle schema changed. |
| Comply | Evaluation context only; no compliance framework mapping changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Auto-RAG-Eval integration, task-specific exam generator, RAG evaluator, Bedrock/Claude wrapper, lm-harness adapter, benchmark importer, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0838.

The focused regression exercises the existing `buildMetricValidationReport` path. The positive path requires validation table, confidence interval, sample size, metric owner, signed evidence refs, row hashes, eval pack, outcome alignment, and CI gate proof. The negative path fails closed when source metadata replaces signed metric-validity evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, README.md presence, LICENSE presence, Apache-2.0 license metadata, api.github.com DNS lookup failed, repository title, Auto-RAG-Eval label, ICML 2024 label, arXiv URL, task-specific exam generation label, RAG system evaluation label, Bedrock label, Claude label, lm-harness label, Python language metadata, local backlog metadata, or source identity alone must fail closed for metric-validity claims.

Passing evidence requires AMC-owned validation table, confidence interval, sample size, metric owner, signed evidence refs, row hashes, eval pack, outcome alignment, CI gate proof, source refs, and no-copy proof.

## No-bloat boundary

No Auto-RAG-Eval integration, task-specific exam generator, RAG evaluator, Bedrock/Claude wrapper, lm-harness adapter, benchmark importer, repository importer, Python dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, source-specific metric lens, or source-specific scoring path was added. No upstream code, README prose beyond minimal metadata facts, datasets, generated exams, prompts, evaluation rows, RAG system configs, Bedrock/Claude settings, lm-harness configs, scripts, tables, figures, generated outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0838AutoRagEvalMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
