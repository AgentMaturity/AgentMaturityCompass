# GAP-0932 - LLMs-RAG-Neurology public-methodology boundary

- Gap: `GAP-0932`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Entspannter/LLMs-RAG-Neurology`, `https://github.com/Entspannter/LLMs-RAG-Neurology`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page showed the `main` branch, Star 13, Fork 1, Issues 0, Pull requests 0, 7 Commits, README.md, MIT license, folders `Results`, `RetrievalEvaluations`, `Visualizations`, `chroma_db/ AAN`, `conf`, and `documents`, and files `.gitattributes`, `.gitignore`, `LICENSE`, `README.md`, `Results_gpt-4o-2024-11-20_outputs.json`, `__init__.py`, `combine_all_datasets.ipynb`, `compare.py`, `compare_batch.py`, `convert_txt.py`, `evaluations.py`, `helpers.py`, `naive_gpt4.py`, `query_datasets_without_rag.ipynb`, `questions.xlsx`, `requirements.txt`, `requirements_new.txt`, `run_rag_script.ipynb`, and `visualisations.ipynb`. The page also showed No releases published, Packages 0, Jupyter Notebook 99.2%, and Python 0.8%.
- Status: Done - skipped as public-methodology implementation evidence

## Live source metadata

The live README title is `Evaluating Base and Retrieval-Augmented Large Language Models With Document or Online-Supported Support for Evidence-Based Neurology`. The README describes a GitHub repository for a manuscript under revision and the repository About section says the manuscript is published in npj Digital Medicine. Relevant source-review signals include Ferber reference context, RAG generation, `venv`, `new_venv`, separate requirements files, API keys, the dataset of neurological questions, answers, and ratings, Results folder, RAG generation notebook, no-RAG query notebook, dataset-combination notebook, visualisation/statistical-analysis notebook, and raters.

Those facts are useful source-review context, but they do not change AMC public methodology versioning. LLMs-RAG-Neurology is a clinical-domain RAG evaluation manuscript repository, not an AMC scoring-methodology specification. Clinical RAG manuscript metadata alone cannot justify a public methodology version bump, methodology version, changelog, deprecation notice, or migration guidance because it does not alter AMC scoring semantics, evidence taxonomy, badge semantics, maturity levels, diagnostic question bank, or public methodology contract.

No upstream notebooks, result JSON, Excel data, questions, ratings, medical content, prompt examples, RAG scripts, ChromaDB artifacts, requirements files, README prose beyond minimal metadata facts, generated outputs, model responses, datasets, visualizations, or implementation details were copied into AMC.

## Relevance decision

`GAP-0932` is relevant only as a public-methodology no-op and source-review boundary. The source is adjacent to Score, Shield, and Watch because it evaluates base and retrieval-augmented LLM behavior in a neurology context, but its evidence is not an AMC-owned methodology change.

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed. No public methodology version bump was made. No medical claim was added.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed; clinical RAG manuscript metadata is not methodology-versioning proof. |
| Shield | Clinical evaluation context only; no safety or medical assurance claim was added. |
| Watch | No Watch methodology, monitoring, drift, or observability behavior changed. |
| Enforce | No runtime policy changed. |
| Vault | No API keys, clinical datasets, questions, answers, ratings, notebooks, or upstream artifacts stored. |
| Fleet | No multi-agent topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No healthcare compliance mapping, medical-device claim, or regulated-domain obligation changed. |

## Product closure

No product code changed. The focused regression documents the live source metadata and asserts that LLMs-RAG-Neurology metadata remains absent from AMC public methodology semantics and implementation modules.

This closure is a documented skip for implementation: LLMs-RAG-Neurology, npj Digital Medicine, Ferber reference context, RAG generation, `venv`, `new_venv`, API keys, neurological questions, answers, ratings, raters, result JSON, notebooks, ChromaDB artifacts, and visualisations metadata are not public methodology versioning evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, MIT license metadata, Star 13, Fork 1, Issues 0, Pull requests 0, 7 Commits, No releases published, Packages 0, Jupyter Notebook 99.2%, Python 0.8%, folder names, file names, manuscript title, publication label, clinical-domain labels, RAG labels, notebook names, result file names, questions.xlsx, API-key labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing public methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, evidence-taxonomy change, and scoring-semantics rationale.

Clinical RAG manuscript metadata alone cannot justify a public methodology version bump.

## No-bloat boundary

No LLMs-RAG-Neurology adapter, clinical RAG runner, neurology benchmark importer, notebook runner, ChromaDB importer, result JSON importer, Excel/questions importer, rater workflow, medical evaluation module, API-key loader, requirements mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, source-specific scoring path, healthcare compliance claim, medical-device claim, or medical advice feature was added. No upstream notebooks, result JSON, Excel data, questions, ratings, medical content, prompt examples, RAG scripts, ChromaDB artifacts, requirements files, README prose beyond minimal metadata facts, generated outputs, model responses, datasets, visualizations, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0932LlmsRagNeurologyPublicMethodologyBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the public-methodology implementation leakage check already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0932LlmsRagNeurologyPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0931AwesomeAgentOpsLandscapeProviderDriftBoundary.test.ts tests/gap0932LlmsRagNeurologyPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
