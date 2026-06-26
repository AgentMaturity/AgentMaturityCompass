# GAP-0792 - MedQA-CS question-explainability boundary

- Gap: `GAP-0792`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: ACL Anthology `https://aclanthology.org/2026.eacl-long.292/`, DOI `https://doi.org/10.18653/v1/2026.eacl-long.292`, OpenAlex `https://openalex.org/W7140118344`
- Retrieval: `2026-06-21` via live ACL Anthology page review.
- Status: closed through existing question-level score explainability receipts; no MedQA-CS benchmark, OSCE simulator, clinical evaluator, or medical workflow added.

## Live source metadata

The live ACL Anthology page identifies the source as `MedQA-CS: Objective Structured Clinical Examination (OSCE)-Style Benchmark for Evaluating LLM Clinical Skills`, Anthology ID `2026.eacl-long.292`, and DOI `10.18653/v1/2026.eacl-long.292`. Listed authors include Zonghai Yao, Zihao Zhang, Chaolong Tang, Xingyu Bian, and Youxia Zhao. The source appears in the EACL 2026 long-paper track.

Relevant source-review signals include Objective Structured Clinical Examination, OSCE, clinical skills, standardized patient interaction, history taking, physical examination, diagnosis, clinical communication, and benchmark evaluation for LLM clinical skills. These facts are question-level score explainability context only. No upstream paper prose beyond short metadata facts, clinical cases, standardized-patient scripts, rubrics, prompts, model answers, medical examples, figures, tables, statistics, datasets, code, or implementation details were copied into AMC.

## Relevance decision

GAP-0792 is relevant to AMC because clinical-skills benchmark claims need question-level explanations: question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes. The accepted AMC primitive is already `buildQuestionExplainabilityReport`.

The source is not an AMC clinical benchmark, medical evaluator, OSCE simulator, or healthcare product claim. MedQA-CS can be retained only as clinical benchmark context when AMC-owned question evidence explains why a score moved and what repair path remains. ACL/DOI/OpenAlex/title metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level explainability rows with accepted evidence IDs, rejected evidence reasons, repair hints, and row hashes. |
| Shield | Relevant through fail-closed handling for unsupported clinical-skills, OSCE, standardized-patient, diagnosis, or benchmark claims. |
| Watch | Relevant when question explanations bind to replayable evidence and regression receipts; no live monitor changed. |
| Enforce | No runtime medical, diagnosis, patient, or clinical-communication policy changed. |
| Vault | No clinical cases, patient simulations, prompts, model answers, medical examples, or secure-storage behavior changed. |
| Fleet | Clinical multi-turn context only; no orchestration adapter or medical-agent topology changed. |
| Passport | No portable proof-bundle field or clinical credential changed. |
| Comply | Medical/education context only; no compliance mapping or clinical claim changed. |

## Product closure

GAP-0792 is closed by documenting the live-source boundary and adding regression coverage over the existing question-score explainability primitive. The positive path proves that MedQA-CS-style clinical benchmark context is accepted only when AMC-owned question rows include accepted evidence IDs, rejected evidence reasons, repair hints, thresholds, signed evidence, and row hashes. The negative path proves ACL/DOI/OpenAlex/title metadata alone fails closed.

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, MedQA-CS benchmark, OSCE simulator, standardized-patient workflow, clinical-skills evaluator, diagnosis evaluator, medical rubric, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0792.

## Fail-closed rule

ACL URL, DOI, OpenAlex work ID, title, author list, EACL metadata, OSCE labels, Objective Structured Clinical Examination labels, clinical-skills labels, standardized-patient labels, history-taking labels, physical-examination labels, diagnosis labels, clinical-communication labels, benchmark labels, local backlog metadata, or source identity alone must fail closed for question-level explainability claims. Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, missing-gate reasons, row hashes, Score/Shield/Watch surface coverage, and no-copy proof.

## No-bloat boundary

No MedQA-CS benchmark, OSCE simulator, standardized-patient workflow, clinical-skills evaluator, diagnosis evaluator, medical rubric, clinical-case importer, prompt importer, answer importer, paper importer, OpenAlex importer, DOI resolver, ACL importer, source-specific question lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond short metadata facts, clinical cases, standardized-patient scripts, rubrics, prompts, model answers, medical examples, figures, tables, statistics, datasets, code, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0792MedqaCsQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
