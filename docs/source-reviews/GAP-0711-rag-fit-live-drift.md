# GAP-0711 - RAG-FiT live-drift boundary

- Gap: `GAP-0711`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/IntelLabs/RAG-FiT`
- Retrieval: `2026-06-21` via GitHub connector repository metadata and live `README.md` fetch; shell network remains DNS-restricted in this environment.
- Status: closed through existing Watch live score and behavior drift receipts; no RAG-FiT library, training, inference, evaluation, or Hydra integration added.

## Live source metadata

The GitHub connector identifies `IntelLabs/RAG-FiT` as a public repository with repository id `832661327`, default branch `main`, size `976`, not archived, owner organization `IntelLabs`, and clone URL `https://github.com/IntelLabs/RAG-FiT.git`. The connector also confirms read-only permissions in this environment and fetched the live `README.md`, modified `2024-10-06T10:20:02Z`.

The live README metadata describes RAG-FiT as a library for improving LLMs on RAG tasks using fine-tuning over RAG-augmented datasets. Relevant source-review signals include dataset creation, training, inference, evaluation, RAG interactions, information retrieval, prompt generation, output processing, PEFT, TRL, model-independent input/output formats, configurable workflows, Hydra configuration, optional Haystack and Deepeval packages, metrics such as EM, F1, ROUGE, BERTScore, Deepeval, RAGAS, HF evaluate, classification and recall, plus Apache 2.0 license and a disclaimer that it is not an official Intel product. These facts are RAG evaluation and lifecycle context only. No upstream code, README prose beyond short metadata facts, install commands, configuration examples, paper configs, API details, dataset rows, metrics tables, prompt templates, model outputs, citations, screenshots, package files, or implementation details were copied into AMC.

## Relevance decision

RAG-FiT is relevant to AMC as live score and behavior drift context because RAG fine-tuning and evaluation workflows can change retrieval quality, generated-answer behavior, latency, cost, and evidence traceability across baseline and live runs. AMC already has the right generic Watch primitive for this: baseline/live windows, score distributions, behavior signatures, drift statistics, alert receipts, source refs, signed evidence refs, row hashes, receipt hashes, and Watch alert projection.

This does not require a RAG-FiT library integration, Hydra config importer, RAG dataset creator, PEFT trainer, inference runner, evaluation module, provider integration, or metric wrapper. GAP-0711 is closed by documenting the source boundary and adding regression coverage that RAG-FiT-style evaluation drift uses the existing generic `live-score-behavior-drift` path. Repository or README metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions and signed row evidence. |
| Shield | Relevant through fail-closed signed evidence requirements for observed RAG behavior changes. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No runtime RAG policy, fine-tuning guardrail, Hydra config policy, or circuit breaker changed. |
| Vault | No datasets, RAG interactions, prompts, outputs, configs, model artifacts, or secure-storage behavior changed. |
| Fleet | RAG workflow context only; no RAG-FiT orchestration or training adapter added. |
| Passport | No portable proof-bundle field or external credential changed. |
| Comply | No Apache license, RAG, model-training, or audit-control mapping changed. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, RAG-FiT wrapper, Hydra config importer, PEFT trainer, RAG dataset creator, evaluation metric wrapper, inference runner, provider adapter, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0711.

The focused regression exercises the existing Watch live-drift engine with RAG-FiT-style fixture data. The positive path emits score, behavior, latency, and cost Watch alerts with valid signed live-drift receipts. The negative path fails closed when live rows carry source metadata but no signed evidence.

## Fail-closed rule

RAG-FiT repository identity, repository id, branch name, README labels, RAG-augmented dataset labels, fine-tuning labels, PEFT labels, TRL labels, dataset creation/training/inference/evaluation labels, Hydra labels, Haystack/Deepeval labels, EM/F1/ROUGE/BERTScore/RAGAS/HF evaluate labels, Apache license labels, Intel disclaimer labels, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distributions, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No RAG-FiT integration, RAG dataset creator, PEFT trainer, TRL trainer, Hydra config importer, Haystack integration, Deepeval integration, RAGAS wrapper, HF evaluate wrapper, inference runner, evaluation module, prompt-template importer, model-output importer, paper-config importer, GitHub importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream code, README prose beyond short metadata facts, install commands, configuration examples, paper configs, API details, dataset rows, metrics tables, prompt templates, model outputs, citations, screenshots, package files, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0711RagFitLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
