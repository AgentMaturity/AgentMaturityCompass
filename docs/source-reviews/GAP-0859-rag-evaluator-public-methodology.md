# GAP-0859 - RAG Evaluator public-methodology boundary

- Gap: `GAP-0859`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `AIAnytime/rag-evaluator`, `https://github.com/AIAnytime/rag-evaluator`
- Retrieval: `2026-06-21` via live GitHub repository page and README review. The GitHub URL returned HTTP/2 200 in live review. The live GitHub repository page showed Star 44, Fork 19, Issues 1, Pull requests 0, 31 Commits, README.md, LICENSE.txt, MIT license, No releases published, topics `eval`, `evals`, and `rag`, Python 100.0%, and repository files including `rag_evaluator`, streamlit app, `requirements.py`, and `setup.py`.
- Status: skipped as public-methodology implementation evidence; no public methodology versioning change was made.

## Live source metadata

The live repository identifies RAG Evaluator as a library for evaluating Retrieval-Augmented Generation systems. Relevant source-review signals include generated text against reference text, Streamlit Web App, `pip install rag-evaluator`, `evaluate_all`, BLEU, ROUGE-1, BERT Score, Perplexity, Diversity, Racial Bias, MAUVE, METEOR, CHRF, Flesch Reading Ease, and Flesch-Kincaid Grade.

These facts are useful RAG evaluation context, but they are not AMC public-methodology lifecycle evidence. No upstream source code, metric implementations, examples, docs prose beyond minimal metadata facts, generated outputs, package metadata, sample datasets, Streamlit app code, prompts, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC as source-review context for public methodology versioning because RAG evaluation metric labels can inform how users reason about Score, Shield, and Watch limitations. It does not justify changing AMC public scoring or badge semantics by itself.

For a public methodology change to pass, AMC needs an AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations update, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, release lifecycle proof, and no-copy proof. RAG Evaluator metadata alone cannot justify a public methodology version bump. GAP-0859 is therefore closed as a documented no-op: the source remains relevant context, but No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; no scoring semantics changed because the source did not provide AMC-owned methodology versioning evidence. |
| Shield | Context only; metric labels reinforce fail-closed review boundaries but do not add Shield behavior. |
| Watch | Context only; repository metadata does not create an AMC monitoring receipt or public methodology lifecycle change. |
| Enforce | No runtime RAG evaluation policy, prompt policy, or circuit breaker changed. |
| Vault | No datasets, examples, app files, package metadata, or secure-storage behavior changed. |
| Fleet | RAG evaluation context only; no evaluator runner or orchestration topology added. |
| Passport | No portable proof-bundle field, badge semantics, or public proof token changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0859.

The focused regression verifies that GitHub/README/license/RAG metric/package metadata stays out of AMC public methodology semantics. No public methodology version bump, changelog update, deprecation notice, migration guidance, known-limitations update, evidence-taxonomy change, badge semantic change, API route, CLI command, or Studio change was added.

## Fail-closed rule

GitHub HTTP/2 200 reachability, live GitHub repository page metadata, README.md presence, LICENSE.txt presence, MIT license metadata, Star 44, Fork 19, Issues 1, Pull requests 0, 31 Commits, No releases published, Python 100.0%, topics such as `eval`, `evals`, or `rag`, RAG Evaluator labels, metric names, package-install labels, Streamlit Web App labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing evidence requires AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations text, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, release lifecycle proof, and no-copy proof.

## No-bloat boundary

No RAG Evaluator adapter, evaluator runner, metric importer, package wrapper, Streamlit app runner, docs parser, BLEU implementation, ROUGE-1 implementation, BERT Score wrapper, Perplexity wrapper, Diversity metric wrapper, Racial Bias metric wrapper, MAUVE wrapper, METEOR wrapper, CHRF wrapper, Flesch metric wrapper, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific methodology path, or source-specific scoring path was added. No upstream source code, metric implementations, examples, docs prose beyond minimal metadata facts, generated outputs, package metadata, sample datasets, Streamlit app code, prompts, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0859RagEvaluatorPublicMethodologyBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the implementation no-leakage check passed.
- Focused regression after doc addition: `npx vitest run tests/gap0859RagEvaluatorPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0858VgcBenchProviderDriftBoundary.test.ts tests/gap0859RagEvaluatorPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
