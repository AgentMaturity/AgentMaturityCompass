# GAP-0766 - Medical QA live-drift unavailable-source boundary

- Gap: `GAP-0766`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7128371373`, DOI `10.1016/j.ijmedinf.2026.106339`, and title `Agentic memory-augmented retrieval and evidence grounding for medical question-answering tasks`
- Retrieval: `2026-06-21` via browser search and direct DOI attempt; exact-title and DOI searches did not surface a reachable primary source in this environment, and direct DOI opening was blocked by browser safety constraints. Shell network remains DNS-restricted in this environment.
- Status: closed through existing live score and behavior drift receipts; no medical QA pipeline, memory-RAG subsystem, clinical evaluator, or evidence-grounding workflow added.

## Live source metadata

The local backlog identifies a paper titled `Agentic memory-augmented retrieval and evidence grounding for medical question-answering tasks`, DOI `10.1016/j.ijmedinf.2026.106339`, OpenAlex work `W7128371373`, improvement dimension live score and behavior drift alerts, category `Agent evaluation and benchmarks`, and concepts including computer science, artificial intelligence, scalability, data science, psychology, and cognitive psychology. The backlog abstract field contains no OpenAlex abstract.

Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title and DOI searches did not surface a reachable primary source in this environment, and the direct DOI URL was blocked. These metadata facts are relevant to AMC only as live-drift context for medical QA, agentic memory-augmented retrieval, evidence grounding, and retrieval behavior. They do not justify copying the paper, importing clinical data, adding medical advice behavior, adding a memory-RAG adapter, or claiming benchmark parity. No upstream paper prose, abstract text beyond local backlog metadata, medical QA data, clinical cases, memory traces, retrieval corpora, prompts, model outputs, benchmark rows, figures, tables, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0766 is relevant to AMC through existing Watch live score and behavior drift receipts because medical QA agents can degrade after traffic, prompt, provider, corpus, memory, or retrieval changes. The accepted AMC primitive is already `runLiveScoreBehaviorDrift` with baseline/live windows, behavior signatures, drift statistics, source refs, signed evidence refs, Watch alerts, and receipt verification.

The source can be retained only as context when the live-drift packet carries AMC-owned baseline rows, live rows, score distributions, behavior signatures, evidence refs, signed evidence refs, row hashes, receipt hash, alert receipt, and no-copy proof. DOI/OpenAlex/title metadata, medical QA labels, memory-augmented retrieval labels, evidence-grounding labels, or clinical labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distribution comparisons for medical QA-style agents. |
| Shield | Relevant through fail-closed checks for missing signed evidence and unsupported clinical, grounding, or memory claims. |
| Watch | Relevant through existing live score and behavior drift alert receipts. |
| Enforce | No runtime medical advice, retrieval, memory, or grounding guardrail changed. |
| Vault | No clinical data, medical QA corpus, memory store, prompts, or secure-storage behavior changed. |
| Fleet | Medical QA agent context only; no orchestration or trust topology changed. |
| Passport | No portable proof-bundle field or external benchmark credential changed. |
| Comply | Medical context only; no HIPAA, clinical safety, or healthcare compliance mapping changed. |

## Product closure

GAP-0766 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing live-drift primitive. The positive path proves that medical QA drift context can be cited only with AMC-owned baseline/live rows, behavior signatures, source refs, signed evidence, Watch alert projection, and receipt verification. The negative path proves DOI/OpenAlex/title/medical-QA metadata fails closed.

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, medical QA pipeline, memory-augmented retrieval subsystem, evidence-grounding workflow, clinical evaluator, medical dataset importer, methodology version, diagnostic question bank, or scoring behavior changed for GAP-0766.

## Fail-closed rule

OpenAlex work ID, DOI, title, medical QA labels, agentic memory labels, memory-augmented retrieval labels, evidence-grounding labels, clinical labels, artificial-intelligence labels, scalability labels, data-science labels, psychology labels, local backlog metadata, or source identity alone must fail closed for live-drift claims. Passing evidence requires AMC-owned baseline and live sample rows, score distributions, behavior signatures, evidence refs, signed evidence refs, receipt hash, Watch alert or waiver, and CI/lifecycle gate proof.

## No-bloat boundary

No medical QA pipeline, memory-RAG subsystem, evidence-grounding workflow, clinical evaluator, medical advice module, medical dataset importer, retrieval corpus importer, memory trace importer, prompt importer, output importer, benchmark mirror, paper importer, Elsevier importer, OpenAlex importer, source-specific drift lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, medical QA data, clinical cases, memory traces, retrieval corpora, prompts, model outputs, benchmark rows, figures, tables, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0766MedicalQaLiveDriftUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
