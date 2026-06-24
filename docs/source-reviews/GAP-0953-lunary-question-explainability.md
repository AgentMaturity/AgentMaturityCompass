# GAP-0953 - Lunary question explainability

- Gap: `GAP-0953`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live Lunary homepage `https://lunary.ai` and docs `https://docs.lunary.ai/get-started`
- Retrieval: `2026-06-22` via live source review
- Status: Done

## Live source metadata

The live Lunary homepage presented the product as Build AI agents with confidence and as an AI platform for enterprises. It described chatbot analytics with Understand the gap between your chatbot and your users, See how your LLMs performs in real-time, Deliver reliable AI experiences, and Agents that Deploy autonomous agents and Monitor performance in real-time and catch errors early.

The homepage feature labels included Own Your Data, Self Hostable, 1-line Integration, Prompt Templates, Chat Replays, Analytics, Topic Classification, Agent Tracing, Custom Dashboards, Score LLM responses, PII Masking, and Feedback Tracking. It also described Debug LLM agents, Log all your prompts and results, agents are performing in production, Traces & error stack traces, Label data for fine-tuning, Model usages & costs, User satisfaction, A/B testing, SOC 2 Type II and ISO 27001 certified, RBAC and SSO, Hosted in your Cloud, Any LLM. Any framework, Human reviews, and Alerts system.

The live docs introduced Lunary for AI chatbots and LLM-powered applications and linked Observability Monitor and debug your LLM calls and agents, Chats Track chatbot conversations and user feedback, Prompts Collaborate on prompt templates with versioning, and Classification Setup topics classification for your chats.

Those facts are relevant to AMC only as source-review context for question-level score explainability. They do not justify a Lunary adapter, trace importer, prompt manager, dashboard clone, or source-specific scoring path.

## Relevance decision

`GAP-0953` is relevant through AMC's existing question-level score explainability primitive. Lunary's observability, scoring, feedback, agent tracing, prompt management, human-review, alerting, and compliance/security context maps to the need to expose why each L0-L5 question moved, which accepted evidence IDs were used, which rejected evidence reasons were recorded, and what repair hint remains.

The product closure is not Lunary parity. It is an AMC-owned explainability receipt that ties question ID, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, row hashes, and fail-closed thresholds to signed evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Primary surface. Question-level explainability must show question ID, level movement, accepted evidence IDs, rejected evidence reasons, repair hint, and row hashes. |
| Shield | Relevant when missing gates or rejected evidence describe unsafe, unverified, unsupported, or privacy-sensitive agent behavior. |
| Watch | Relevant as source-review context for production agent tracing and alerts, but no Watch runtime change is required. |
| Enforce | No runtime policy changed. |
| Vault | No upstream traces, prompts, chat replays, feedback records, PII data, or dashboards stored. |
| Fleet | Agent context only; no fleet topology changed. |
| Passport | Relevant only because existing Passport artifacts can carry AMC-owned question evidence; no Passport schema changed. |
| Comply | Certification/security context only; no SOC 2, ISO, GDPR, region, or compliance mapping changed. |

## Product closure

No product code changed. The focused regression exercises existing `buildQuestionExplainabilityReport` and `buildEvalScoreExplainabilityPack` behavior with a Lunary-style source context. The positive path proves an accepted question row requires AMC-owned accepted evidence IDs, signed evidence, rejected evidence reasons, repair hint, reproducible eval pack, and fail-closed thresholds. The negative path proves Lunary product/docs/observability/scoring/feedback/tracing/prompt/security metadata fails closed when it replaces AMC-owned question evidence.

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed.

## Fail-closed rule

Live Lunary homepage reachability, docs reachability, Build AI agents with confidence labels, AI platform for enterprises labels, chatbot analytics labels, real-time LLM performance labels, autonomous-agent deployment labels, production-monitoring labels, agent-tracing labels, prompt-template labels, chat-replay labels, score-response labels, PII masking labels, feedback-tracking labels, human-review labels, alerts labels, SOC 2 Type II and ISO 27001 labels, RBAC/SSO labels, hosted-in-cloud labels, docs feature labels, local backlog metadata, or competitor identity alone must fail closed for question-level score explainability.

Passing question-level explainability requires AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, reproducible eval pack evidence, threshold checks, and row hashes.

## No-bloat boundary

No Lunary integration, trace importer, prompt manager, dashboard clone, feedback importer, human-review workflow, alert connector, PII masking bridge, SOC 2/ISO mapper, cloud-hosting adapter, OpenTelemetry wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport schema change, source-specific implementation module, source-specific scoring path, or parity wrapper was added. No Lunary code, docs prose beyond minimal metadata facts, screenshots, examples, configs, traces, prompts, chat replays, feedback records, dashboards, benchmark rows, model outputs, generated outputs, or implementation details were copied into AMC.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0953LunaryQuestionExplainabilityBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the explainability, fail-closed, and implementation leakage checks already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0953LunaryQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression with `GAP-0952`: `npx vitest run tests/gap0952DiveHydrogenPublicMethodologyBoundary.test.ts tests/gap0953LunaryQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
