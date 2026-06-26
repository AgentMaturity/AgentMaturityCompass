# GAP-0888 - RAG evaluation harnesses public-methodology boundary

- Gap: `GAP-0888`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `RulinShao/RAG-evaluation-harnesses`, `https://github.com/RulinShao/RAG-evaluation-harnesses`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 24, Fork 3, Issues 2, Pull requests 0, 12 Commits, README.md, LICENSE.md, MIT license, No releases published, Python 98.9%, Other 1.1%, repository folders `annotation`, `docs`, `examples`, `lm_eval.egg-info`, `lm_eval`, `scripts`, `templates/ new_yaml_task`, and `tests`, and files including `CITATION.bib`, `CODEOWNERS`, `LICENSE.md`, `pile_statistics.json`, `pyproject.toml`, `requirements.txt`, and `setup.py`.
- Status: completed as `Done - skipped` for public methodology implementation. No public methodology version bump.

## Live source metadata

The live repository identifies Retrieval Augmented Generation (RAG) Evaluation Harness as an evaluation suite adapted from Language Model Evaluation Harness. Relevant source-review signals include RAG evaluation, downstream tasks supported by lm-evaluation-harnesses as of Jun 10, 2024, Scaling Retrieval-Based Langauge Models with a Trillion-Token Datastore, DPR-Wiki searched results, MassiveDS context, retrieval augmentations, JSONL queries and contexts, TriviaQA, MMLU, Natural Questions, MedQA, concat_k, vLLM, HuggingFace model evaluation, custom task YAMLs, prompt formatting, and citation metadata.

These facts are useful RAG evaluation methodology context, but they do not change AMC scoring semantics. No upstream Python source, task YAMLs, prompts, retrieved documents, DPR-Wiki/MassiveDS data, JSONL rows, benchmark outputs, model args, vLLM configs, lm-eval implementation, README prose beyond minimal metadata facts, citations beyond source identity, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC only as source-review context for Score, Shield, and Watch conversations about RAG evaluation, retrieval augmentation, and benchmark reproducibility. It is skipped as public-methodology implementation evidence because the source does not require a change to AMC scoring semantics, evidence taxonomy, badge semantics, methodology version, changelog, deprecation notice, or migration guidance.

RAG evaluation harness metadata alone cannot justify a public methodology version bump. A future AMC methodology change would require an AMC-owned scoring semantic change with versioned methodology text, changelog entry, deprecation notice where applicable, migration guidance, signed evidence refs, replayable eval-pack rows, row hashes, and regression thresholds. This gap provides no such AMC semantic change.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; no scoring semantic changed. |
| Shield | Context only for fail-closed treatment of RAG-evaluation metadata; no Shield verifier changed. |
| Watch | Context only for evidence visibility; no live monitor changed. |
| Enforce | No RAG policy, retrieval policy, prompt policy, or runtime guardrail changed. |
| Vault | No retrieved docs, datasets, prompts, model configs, or secure-storage behavior changed. |
| Fleet | RAG-evaluation context only; no harness runner, lm-eval integration, or agent topology added. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0888.

The focused regression verifies that the live source metadata is documented, that RAG evaluation harness metadata alone cannot justify a public methodology version bump, and that no source-specific identifiers enter public methodology implementation modules.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, LICENSE.md presence, MIT license metadata, Star 24, Fork 3, Issues 2, Pull requests 0, 12 Commits, No releases published, Python 98.9%, Other 1.1%, folder names, file names, Adapted From labels, Language Model Evaluation Harness labels, RAG evaluation labels, Scaling Retrieval-Based Langauge Models with a Trillion-Token Datastore labels, retrieval augmentations labels, DPR-Wiki labels, TriviaQA labels, MMLU labels, Natural Questions labels, MedQA labels, concat_k labels, vLLM labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing methodology-version evidence requires an AMC-owned methodology version, changelog, deprecation notice where applicable, migration guidance, signed evidence refs, replayable eval-pack rows, row hashes, regression thresholds, and no-copy proof.

## No-bloat boundary

No RAG evaluation harness adapter, lm-eval integration, retrieval runner, task YAML importer, prompt formatter, JSONL importer, DPR-Wiki/MassiveDS importer, HuggingFace runner, vLLM runner, custom metric path, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, badge semantics change, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream Python source, task YAMLs, prompts, retrieved documents, DPR-Wiki/MassiveDS data, JSONL rows, benchmark outputs, model args, vLLM configs, lm-eval implementation, README prose beyond minimal metadata facts, citations beyond source identity, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0888RagEvaluationHarnessesPublicMethodologyBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist.
- Focused regression after doc addition: `npx vitest run tests/gap0888RagEvaluationHarnessesPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0887AgentShieldBenchmarkPublicMethodologyBoundary.test.ts tests/gap0888RagEvaluationHarnessesPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
