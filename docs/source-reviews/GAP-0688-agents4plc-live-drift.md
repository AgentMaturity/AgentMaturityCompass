# GAP-0688 - Agents4PLC live-drift boundary

- Gap: `GAP-0688`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2410.14209`, backlog DOI `10.1109/tse.2026.3667895`, backlog OpenAlex `W7131417432`
- Retrieval: `2026-06-21` via browser access to the live arXiv page; shell network remains DNS-restricted in this environment.
- Status: closed through existing Watch live score and behavior drift receipts; no Agents4PLC or PLC subsystem added.

## Live source metadata

The live arXiv page identifies `Agents4PLC: Automating Closed-loop PLC Code Generation and Verification in Industrial Control Systems using LLM-based Agents`, dated `Fri Oct 18 06:51:13 2024`. The backlog also records DOI `10.1109/tse.2026.3667895` and OpenAlex work `W7131417432`; those identifiers are retained as backlog identity metadata for this slice.

The live source describes LLM-based agents for Programmable Logic Controller code generation and verification in industrial control systems. Relevant live-drift signals include a benchmark for verifiable PLC code generation, natural-language requirements, human-written-verified formal specifications, reference PLC code, Retrieval-Augmented Generation, prompt engineering, Chain-of-Thought strategies, code-level verification, and increasingly rigorous metrics. These facts identify safety-critical live behavior drift context only. No upstream paper prose beyond short metadata facts, benchmark tasks, formal specifications, reference PLC code, prompts, code samples, benchmark rows, figures, tables, configs, generated outputs, or implementation details were copied into AMC.

## Relevance decision

Agents4PLC is relevant to AMC live drift because safety-critical code-generation agents can degrade after prompt, provider, retrieval, data, tool, or deployment changes. For AMC, the accepted product path is still the existing Watch live score and behavior drift primitive: baseline/live windows, score distributions, behavior signatures, drift statistics, alert receipts, source refs, signed evidence refs, row hashes, receipt hashes, Watch alerts, and no-copy proof.

This does not require a PLC or industrial-control subsystem. GAP-0688 is closed by documenting the source boundary and adding regression coverage that Agents4PLC-style safety-critical code-generation drift uses the existing generic `live-score-behavior-drift` path. Paper metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions and signed row evidence. |
| Shield | Relevant through fail-closed signed evidence requirements for safety-critical behavior changes. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No PLC runtime guardrail, code-generation policy, or circuit breaker changed. |
| Vault | No industrial-control logs, PLC programs, credentials, data-residency, or secure-storage behavior changed. |
| Fleet | Multi-agent workflow context only; no Agents4PLC runner or trust topology was added. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No industrial safety, IEC, OT, or regulated-domain compliance mapping changed. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, PLC-code generator, formal-spec verifier, RAG adapter, Chain-of-Thought prompt wrapper, industrial-control connector, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0688.

The focused regression exercises the existing Watch live-drift engine with Agents4PLC-style fixture data. The positive path emits score, behavior, latency, and cost Watch alerts with valid signed live-drift receipts. The negative path fails closed when paper metadata replaces signed live-drift evidence.

## Fail-closed rule

Agents4PLC paper title, arXiv metadata, DOI/OpenAlex fields, PLC labels, industrial-control labels, benchmark labels, formal-spec labels, reference-code labels, RAG labels, Chain-of-Thought labels, code-verification labels, metric-rigour claims, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distributions, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No Agents4PLC adapter, PLC code-generation module, formal-spec verifier, industrial-control connector, RAG adapter, Chain-of-Thought wrapper, benchmark importer, prompt importer, reference-code importer, proof-tool runner, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, or source-specific scoring path was added. No upstream paper prose beyond short metadata facts, benchmark tasks, formal specifications, reference PLC code, prompts, code samples, benchmark rows, figures, tables, configs, generated outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0688Agents4PlcLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
