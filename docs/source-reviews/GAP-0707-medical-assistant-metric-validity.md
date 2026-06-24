# GAP-0707 - Medical assistant metric-validity boundary

- Gap: `GAP-0707`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/souvikmajumder26/Multi-Agent-Medical-Assistant`
- Retrieval: `2026-06-21` via GitHub connector repository metadata and live `README.md` fetch; shell network remains DNS-restricted in this environment.
- Status: closed through existing metric-validity receipts only when AMC-owned validation evidence exists; no medical assistant, clinical evaluator, or healthcare workflow added.

## Live source metadata

The GitHub connector identifies `souvikmajumder26/Multi-Agent-Medical-Assistant` as a public repository with repository id `946168154`, default branch `main`, size `256280`, not archived, owner `souvikmajumder26`, and clone URL `https://github.com/souvikmajumder26/Multi-Agent-Medical-Assistant.git`. The connector also confirms read-only permissions in this environment and fetched the live `README.md`, modified `2025-05-02T22:11:45Z`.

The live README metadata describes a multi-agent medical assistant for diagnosis, research, and patient interactions. Relevant source-review signals include multi-agent orchestration, medical imaging analysis, retrieval-augmented generation, real-time web search, human-in-the-loop validation, confidence-based routing, agent-to-agent handoff, input/output guardrails, Docling document parsing, Qdrant storage, hybrid retrieval, cross-encoder reranking, FastAPI, Docker deployment, and Apache-2.0 license. These facts identify healthcare-agent evaluation context only. No upstream code, README prose beyond short metadata facts, installation commands, API-key examples, Docker commands, environment variable names, diagrams, demo assets, medical images, datasets, model weights, prompts, clinical recommendations, citations, screenshots, package files, or implementation details were copied into AMC.

## Relevance decision

The medical-assistant repository is relevant to AMC as high-stakes metric-validity context: any score about a healthcare-facing agent needs construct validity, reliability, confidence intervals, sample size, metric owner, process evidence, outcome alignment, signed evidence, and regression thresholds.

The source is not accepted as clinical proof, medical-safety proof, or an AMC metric by itself. Repository and README metadata do not validate AMC scoring, medical performance, patient safety, diagnosis quality, model reliability, or clinical suitability. Passing AMC evidence must come from AMC-owned metric-validity packets, not from repository identity or healthcare labels.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Relevant through fail-closed rejection of unsupported medical-safety or clinical-quality claims. |
| Watch | Relevant only when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime clinical policy, guardrail, medical triage, or enforcement behavior changed. |
| Vault | No patient data, medical images, API keys, RAG documents, prompts, outputs, or secure-storage behavior changed. |
| Fleet | Medical multi-agent context only; no medical assistant workflow or orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No healthcare, HIPAA, FDA, clinical governance, or medical-device compliance mapping changed. |

## Product closure

GAP-0707 is closed by documenting the no-bloat metric-validity boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that medical-assistant context can be cited only with AMC-owned validation evidence. The negative path proves repository/README metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, medical assistant adapter, clinical evaluator, computer-vision model, RAG workflow, guardrail importer, image dataset importer, paper parser, or scoring behavior changed for GAP-0707.

## Fail-closed rule

Repository identity, repository id, branch name, README labels, medical-assistant labels, diagnosis labels, patient-interaction labels, medical-imaging labels, RAG labels, web-search labels, human-in-the-loop labels, confidence-routing labels, guardrail labels, Docling/Qdrant/LangGraph/LangChain/FastAPI/Docker labels, license labels, local backlog metadata, or source identity alone must fail closed for metric-validity or medical claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No medical assistant adapter, clinical evaluator, diagnosis model, medical image classifier, skin lesion segmenter, brain tumor detector, chest X-ray classifier, human-in-the-loop clinical workflow, RAG medical corpus, Qdrant connector, Docling parser, web-search agent, guardrail importer, speech integration, Docker deployment, GitHub importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No healthcare, diagnosis, patient-care, medical-device, or clinical-safety claim was added. No upstream code, README prose beyond short metadata facts, installation commands, API-key examples, Docker commands, environment variable names, diagrams, demo assets, medical images, datasets, model weights, prompts, clinical recommendations, citations, screenshots, package files, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0707MedicalAssistantMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
