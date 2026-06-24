# GAP-0676 — Biomedical multi-agent question-explainability boundary

- Gap: `GAP-0676`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7143351253` / DOI `10.1038/s41551-026-01634-6`
- Primary source reached: `https://www.nature.com/articles/s41551-026-01634-6`
- Retrieval: `2026-06-21` via browser access to the Nature article page; shell network remains DNS-restricted in this environment.
- Status: relevant only through existing question-level score explainability; no biomedical agent subsystem, clinical claim, benchmark mirror, or source-specific question lens added.

## Live source metadata

The live Nature page identifies the article in `Nature Biomedical Engineering`. Published: 30 March 2026. The title is `Empowering AI data scientists using a multi-agent LLM framework with self-evolving capabilities for autonomous, tool-aware biomedical data analyses`. The page names BioMedAgent, BioMed-AQA, `327 biomedical data tasks`, a `77% success rate`, BixBench, public dataset locations, and GitHub code availability.

These facts are source identity and domain context only. No article prose beyond short metadata facts, figures, benchmark rows, dataset contents, milestone/reference files, task data, chat transcripts, source code, screenshots, prompts, tables, or implementation details were copied into AMC.

## Relevance decision

The source is relevant to AMC as biomedical multi-agent evaluation context for question-level score explainability. Biomedical agent benchmarks make it especially important that an AMC maturity score can show the exact question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence refs, thresholds, and row hashes behind every claim.

The source is not accepted as AMC proof by itself. Nature metadata, BioMedAgent names, BioMed-AQA dataset labels, success-rate claims, BixBench references, dataset URLs, code-availability links, or biomedical framing do not establish question-score explainability, clinical safety, compliance, or diagnostic performance in AMC.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing AMC question rows with accepted evidence IDs, rejected evidence reasons, repair hints, thresholds, and row hashes. |
| Shield | Relevant only when unsupported biomedical or benchmark claims are rejected with signed evidence and repair guidance. |
| Watch | Relevant only when caller-owned traces, receipts, and threshold results are hash-bound through AMC evidence. |
| Enforce | No policy-enforcement, clinical workflow, or tool-execution policy change. |
| Vault | No biomedical dataset, patient data, privacy, or data-residency feature. |
| Fleet | No biomedical multi-agent orchestration, task-planning, or tool-chain implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No medical, biomedical, clinical, diagnostic, or regulatory claim; no FDA, HIPAA, or regulatory compliance mapping. |

## Product closure

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, diagnostic question bank, domain pack, or scoring behavior changed for GAP-0676. Existing AMC question-score explainability remains the accepted product path: question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence refs, thresholds, row hashes, and no-copy proof.

## Fail-closed rule

Nature metadata, DOI/OpenAlex fields, article title, author list, journal label, BioMedAgent names, BioMed-AQA labels, success-rate claims, BixBench references, dataset/code-availability links, biomedical task counts, local backlog metadata, or metadata-only source identity must fail closed for question-score explainability claims. Passing evidence requires AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence refs, thresholds, row hashes, and no-copy proof.

## No-bloat boundary

No clinical decision-support subsystem, BioMedAgent integration, biomedical benchmark mirror, dataset mirror, Zenodo/Hugging Face importer, GitHub code importer, autoscoring agent, biomedical task runner, tool-aware workflow engine, source-specific question lens, API route, CLI command, Studio panel, Passport field, methodology version bump, domain pack, regulatory mapping, or parity layer was added. No upstream article prose beyond bibliographic metadata, figures, benchmark rows, dataset contents, milestone/reference files, task data, chat transcripts, source code, screenshots, prompts, tables, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0676BiomedicalMultiAgentQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
