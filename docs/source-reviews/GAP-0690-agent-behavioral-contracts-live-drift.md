# GAP-0690 - Agent Behavioral Contracts live-drift boundary

- Gap: `GAP-0690`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2602.22302`, DOI `10.48550/arxiv.2602.22302`, backlog OpenAlex `W7131872410`
- Retrieval: `2026-06-21` via browser access to the live arXiv page; shell network remains DNS-restricted in this environment.
- Status: closed through existing Watch live score and behavior drift receipts; no Agent Behavioral Contracts runtime, AgentAssert library, or AgentContract-Bench subsystem added.

## Live source metadata

The live arXiv page identifies `Agent Behavioral Contracts: Formal Specification and Runtime Enforcement for Reliable Autonomous AI Agents`; Submitted on 25 Feb 2026. The backlog also records DOI `10.48550/arxiv.2602.22302` and OpenAlex work `W7131872410`; those identifiers are retained as backlog identity metadata for this slice.

The source describes a contract framework for autonomous agents using Preconditions, Invariants, Governance policies, and Recovery mechanisms. Relevant live-drift signals include `(p, delta, k)-satisfaction`, behavioral drift bounds, multi-agent chain composition, AgentAssert as a runtime enforcement library, AgentContract-Bench, 200 scenarios, 7 models from 6 vendors, 1,980 sessions, missed soft violations, hard-constraint compliance, `D* < 0.27` drift bounds, and overhead < 10 ms per action. These facts identify live behavior drift and enforcement context only. No upstream paper prose beyond short metadata facts, formula labels, benchmark names, metric labels, result magnitudes, figures, tables, scenarios, prompts, model lists, code, benchmark rows, configs, generated outputs, or implementation details were copied into AMC.

## Relevance decision

Agent Behavioral Contracts is relevant to AMC live drift because contract-governed autonomous agents can degrade after prompt, provider, policy, recovery, tool, data, or deployment changes. For AMC, the accepted product path is still the existing Watch live score and behavior drift primitive: baseline/live windows, score distributions, behavior signatures, drift statistics, alert receipts, source refs, signed evidence refs, row hashes, receipt hashes, Watch alerts, and no-copy proof.

This does not require an AgentAssert integration, contract DSL, runtime enforcement library, benchmark importer, or formal verification subsystem. GAP-0690 is closed by documenting the source boundary and adding regression coverage that behavioral-contract compliance drift uses the existing generic `live-score-behavior-drift` path. Paper metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions and signed row evidence. |
| Shield | Relevant through fail-closed signed evidence requirements for policy, invariant, and recovery-related behavior changes. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | Contract runtime context only; no new runtime guardrail, policy engine, circuit breaker, or contract DSL changed. |
| Vault | No agent logs, policies, recovery traces, credentials, data-residency, or secure-storage behavior changed. |
| Fleet | Multi-agent chain context only; no AgentContract-Bench runner or trust topology was added. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | Governance context only; no EU AI Act, NIST, ISO, SOC2, or corporate-governance mapping changed. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, contract DSL, AgentAssert adapter, AgentContract-Bench importer, runtime enforcement library, formal verifier, recovery-policy engine, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0690.

The focused regression exercises the existing Watch live-drift engine with behavioral-contract compliance fixture data. The positive path emits score, behavior, latency, and cost Watch alerts with valid signed live-drift receipts. The negative path fails closed when paper metadata replaces signed live-drift evidence.

## Fail-closed rule

Agent Behavioral Contracts title, arXiv metadata, DOI/OpenAlex fields, contract labels, Preconditions, Invariants, Governance policies, Recovery mechanisms, `(p, delta, k)-satisfaction`, drift-bound labels, AgentAssert labels, AgentContract-Bench labels, scenario/model/session counts, compliance percentages, overhead claims, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distributions, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No AgentAssert adapter, AgentContract-Bench importer, Agent Behavioral Contracts runtime, contract DSL, formal-specification engine, probabilistic-logic verifier, recovery-policy engine, benchmark runner, scenario importer, model-vendor adapter, prompt importer, trace importer, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Enforce rule, Passport field, methodology version bump, diagnostic question-bank migration, or source-specific scoring path was added. No upstream paper prose beyond short metadata facts, formula labels, benchmark names, metric labels, result magnitudes, figures, tables, scenarios, prompts, model lists, code, benchmark rows, configs, generated outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0690AgentBehavioralContractsLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
