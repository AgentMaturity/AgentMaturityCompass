# GAP-0697 - Hybrid industrial decision-support live-drift boundary

- Gap: `GAP-0697`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://www.mdpi.com/2673-2688/7/2/51`, DOI `10.3390/ai7020051`, backlog OpenAlex `W7126421871`
- Retrieval: `2026-06-21` via browser access to the live MDPI page; shell network remains DNS-restricted in this environment.
- Status: closed through existing Watch live score and behavior drift receipts; no industrial process, CIP, PLC, SCADA, or LLM decision-support subsystem added.

## Live source metadata

The live MDPI page identifies `Hybrid AI and LLM-Enabled Agent-Based Real-Time Decision Support Architecture for Industrial Batch Processes: A Clean-in-Place Case Study`, dated `1 February 2026`, in `AI 2026, 7(2), 51`, with DOI `10.3390/ai7020051`. The backlog also records OpenAlex work `W7126421871`; that identifier is retained as backlog identity metadata for this slice.

The live source describes Clean-in-Place industrial batch process supervision, industrial IoT, process supervision, real-time decision support, predictive maintenance, PLC/SCADA legacy infrastructure, deterministic rule-based agents, fuzzy and statistical enrichment, an LLM-driven analytics agent, high-frequency sensor streams, rolling buffers, and safety-critical real-time constraints. Relevant live-drift signals include a six-month deployment, 24 runs, three representative CIP executions, nominal baseline, preventive-warning, diagnostic-alert conditions, stage-specification compliance, state-to-specification consistency, temporal stability, numerical consistency between language summaries and enriched logs, 100% compliance in evaluated sanitizing stages, and median numerical error below 3% in audited samples. These facts identify safety-critical live behavior drift context only. No upstream paper prose beyond short metadata facts, tables, figures, process recipes, sensor logs, plant data, prompts, model outputs, formulas, diagrams, screenshots, or implementation details were copied into AMC.

## Relevance decision

The hybrid industrial decision-support paper is relevant to AMC live drift because safety-critical, LLM-assisted industrial workflows can degrade after prompt, provider, rule, data, tool, sensor, traffic, or deployment changes. For AMC, the accepted product path is still the existing Watch live score and behavior drift primitive: baseline/live windows, score distributions, behavior signatures, drift statistics, alert receipts, source refs, signed evidence refs, row hashes, receipt hashes, Watch alerts, and no-copy proof.

This does not require a Clean-in-Place, SCADA, PLC, industrial IoT, process-supervision, RAG, fuzzy-logic, or predictive-maintenance subsystem. GAP-0697 is closed by documenting the source boundary and adding regression coverage that industrial decision-support drift uses the existing generic `live-score-behavior-drift` path. Paper metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions and signed row evidence. |
| Shield | Relevant through fail-closed signed evidence requirements for safety-critical industrial behavior changes. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No runtime policy, PLC/SCADA guardrail, process-control interlock, or circuit breaker changed. |
| Vault | No plant sensor logs, process recipes, operator data, credentials, or secure-storage behavior changed. |
| Fleet | Multi-agent architecture context only; no industrial runner or trust topology was added. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No industrial, food/beverage, pharmaceutical, safety, or audit-control mapping changed. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, CIP connector, PLC/SCADA adapter, industrial IoT connector, fuzzy-logic agent, LLM analytics agent, RAG adapter, predictive-maintenance module, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0697.

The focused regression exercises the existing Watch live-drift engine with industrial decision-support fixture data. The positive path emits score, behavior, latency, and cost Watch alerts with valid signed live-drift receipts. The negative path fails closed when paper metadata replaces signed live-drift evidence.

## Fail-closed rule

Paper title, MDPI metadata, DOI/OpenAlex fields, Clean-in-Place labels, industrial IoT labels, process-supervision labels, real-time decision-support labels, predictive-maintenance labels, PLC/SCADA labels, rule-based-agent labels, fuzzy/statistical enrichment labels, LLM analytics labels, run counts, deployment-duration labels, compliance percentages, numerical-error claims, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distributions, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No Clean-in-Place subsystem, industrial process runner, PLC adapter, SCADA adapter, industrial IoT connector, fuzzy-logic engine, statistical-enrichment engine, LLM analytics agent, process-ontology importer, plant-data importer, sensor-log parser, RAG adapter, predictive-maintenance module, MDPI importer, OpenAlex importer, paper parser, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond short metadata facts, tables, figures, process recipes, sensor logs, plant data, prompts, model outputs, formulas, diagrams, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0697HybridIndustrialDecisionSupportLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
