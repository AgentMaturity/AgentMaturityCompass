# GAP-0762 - Privacy-by-design caregiver AI judge-calibration boundary

- Gap: `GAP-0762`
- Dimension: `eval-judge-calibration`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: MDPI Applied Sciences `https://www.mdpi.com/2076-3417/16/4/2157`, DOI `10.3390/app16042157`, OpenAlex `https://openalex.org/W7131070396`
- Retrieval: `2026-06-21` via live MDPI article page review and backlog OpenAlex/DOI metadata; shell network remains DNS-restricted in this environment.
- Status: closed through existing judge calibration and appeal receipts; no caregiver product, ASD/clinical workflow, privacy-by-design multi-agent architecture, RAGAs runner, LLM judge, or medical advisory feature added.

## Live source metadata

The live MDPI article page identifies the source as `Privacy-by-Design in AI-Assisted Systems for Caregivers of Children with Autism: A Secure Multi-Agent Architecture`, published in `Applied Sciences`, volume `16`, issue `4`, article `2157`, on `23 February 2026`. Listed authors include Sophia Zacharaki, Irene Pappou, Sofia Mamais, Nikitas-Epaminondas Tsakirakis, Nikos Stathopoulos, Irene Mademtzi, Giorgos Giannakopoulos, and Grigorios Tsoumakas.

Relevant source-review signals include caregivers of children with Autism Spectrum Disorder, privacy-by-design, PbD MAS, consent-aware design, secure multi-agent architecture, observational and diary-study context, literature scan, learner modeling, retrieval-augmented generation, policy control, consent management, data loss prevention, auditing and provenance, KB-only answer constraints, signed and versioned policies, `trace_id`, `policy_version`, `consent_version`, RAGAs evaluation, LLM-as-a-Judge, Llama 3 8B, two advisory knowledge-base datasets, `250` QA pairs, seven safety/ethics criteria `C1-C7`, `30` access-control cases, Answer Relevancy values `0.767` and `0.750`, Recall@K values `0.400` and `0.742`, Context Precision values `0.599` and `0.631`, and no harmful content detected in the reported qualitative test.

These facts are relevant to AMC only as judge calibration, appeal, and evidence-governance context. Privacy-sensitive multi-agent assistance requires auditable judge prompts, calibration examples, disagreement metrics, appeal outcomes, signed evidence, and no-copy proof before Score/Shield/Watch claims can be trusted. They do not justify adding caregiver guidance, ASD-specific workflows, clinical advice, privacy-by-design architecture code, or healthcare datasets. No upstream abstract/body prose beyond minimal metadata facts, study instruments, participant data, caregiver transcripts, advisory content, datasets, prompts, RAGAs outputs, LLM judge prompts, policy examples, architecture diagrams, tables, figures, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0762 is relevant to AMC through existing judge calibration and appeal receipts. The accepted AMC primitive is already `buildJudgeCalibrationReceipt`: rubric version, calibration set, judge prompt/output hashes, disagreement metrics, appeal outcome, signed evidence refs, row hashes, CI/lifecycle gate status, Watch alert projection, and fail-closed verification.

This source sharpens the no-bloat boundary for privacy-sensitive AI evaluation. A paper citation can be retained only as context when AMC-owned judge calibration evidence proves contested scores are calibrated, inspectable, appealable, and signed. DOI, OpenAlex, MDPI, ASD, caregiver, RAGAs, LLM-as-Judge, Llama, PbD, consent, DLP, audit, metric, or architecture labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing judge-calibration receipts with rubric version, calibration set, disagreement metric, and appeal outcome. |
| Shield | Relevant through fail-closed handling for unsupported safety, privacy, clinical, or LLM-judge claims. |
| Watch | Relevant through existing judge calibration CI/lifecycle gates and Watch alert projection. |
| Enforce | No runtime consent policy, DLP policy, clinical policy, or circuit-breaker behavior changed. |
| Vault | No caregiver data, child data, diary observations, policy content, prompts, or secure-storage behavior changed. |
| Fleet | Multi-agent architecture context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field or external clinical/privacy credential changed. |
| Comply | Privacy-by-design context only; no compliance mapping changed. |

## Product closure

GAP-0762 is closed by documenting the live-source boundary and adding regression coverage over the existing judge calibration primitive. The positive path accepts privacy-sensitive caregiver-AI context only with AMC-owned rubric, calibration rows, judge prompt/output hashes, disagreement metrics, appeal outcome, signed evidence refs, source refs, row hashes, and CI receipt. The negative path fails closed when MDPI/DOI/OpenAlex/RAGAs/ASD/privacy metadata replaces signed judge-calibration evidence.

No `src/eval/judgeCalibration.ts`, `src/score/index.ts`, `src/studio/studioState.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, caregiver product, ASD/clinical workflow, privacy-by-design MAS implementation, consent manager, DLP module, policy control plane, audit/provenance subsystem, RAGAs runner, LLM-as-Judge runner, Llama evaluator, medical-advice feature, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0762.

## Fail-closed rule

MDPI URL, DOI, OpenAlex work ID, paper title, Applied Sciences metadata, author list, ASD labels, caregiver labels, privacy-by-design labels, PbD MAS labels, consent labels, DLP labels, audit/provenance labels, RAG labels, KB-only labels, policy-version labels, trace-id labels, RAGAs labels, LLM-as-a-Judge labels, Llama 3 labels, QA-pair counts, access-control case counts, Answer Relevancy labels, Recall@K labels, Context Precision labels, harmful-content labels, local backlog metadata, or source identity alone must fail closed for judge-calibration claims. Passing evidence requires AMC-owned rubric version, calibration set, judge prompt/output hashes, disagreement metric, appeal workflow and outcome, signed evidence refs, row hashes, CI/lifecycle receipt, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No caregiver product, ASD/clinical workflow, medical-advice feature, privacy-by-design MAS implementation, consent manager, DLP module, policy control plane, audit/provenance subsystem, RAGAs runner, LLM-as-Judge runner, Llama evaluator, RAG dataset importer, QA-pair importer, access-control case importer, policy importer, prompt importer, output importer, architecture importer, MDPI importer, OpenAlex importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream abstract/body prose beyond minimal metadata facts, study instruments, participant data, caregiver transcripts, advisory content, datasets, prompts, RAGAs outputs, LLM judge prompts, policy examples, architecture diagrams, tables, figures, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0762PrivacyByDesignCaregiverJudgeCalibrationBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
