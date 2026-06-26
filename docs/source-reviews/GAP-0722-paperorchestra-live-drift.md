# GAP-0722 - PaperOrchestra live-drift boundary

- Gap: `GAP-0722`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/Ar9av/PaperOrchestra`, live README at `https://raw.githubusercontent.com/Ar9av/PaperOrchestra/main/README.md`, and linked paper `https://arxiv.org/abs/2604.05018`
- Retrieval: `2026-06-21` via browser search, GitHub page review, raw README fetch, and arXiv search result; shell network remains restricted in this environment.
- Status: closed through existing Watch live score and behavior drift receipts; no PaperOrchestra skill, prompt pack, benchmark runner, or automated paper-writing subsystem added.

## Live source metadata

The live GitHub source identifies `Ar9av/PaperOrchestra` as a skill pack around the PaperOrchestra automated research-paper writing workflow. Relevant source-review signals include host-agent-executable skills, deterministic helper scripts, a multi-step paper-writing pipeline, PaperWritingBench/autorater context, agent log aggregation, citation checking, LaTeX sanity checks, optional search integrations, and per-host invocation across coding-agent tools. The linked arXiv result identifies PaperOrchestra as a multi-agent framework for automated AI research paper writing.

These facts are relevant to AMC only as live score and behavior drift context. Research-writing agents can drift when host-agent tools, search availability, citation verification, helper scripts, model routing, benchmark inputs, prompt instructions, or generated artifacts change. That does not justify copying PaperOrchestra prompts, adding its skill layout, running its benchmark, or claiming paper-writing parity. No upstream README prose beyond minimal metadata facts, prompts, schemas, halt rules, rubrics, helper scripts, examples, benchmark rows, citations, model outputs, LaTeX templates, screenshots, or implementation details were copied into AMC.

## Relevance decision

GAP-0722 is relevant to AMC as live score and behavior drift context because a previously stable research-writing agent can regress after provider, prompt, tool, search, citation, or workflow changes. AMC already has the right generic Watch primitive for this: baseline/live windows, score distributions, behavior signatures, drift statistics, alert receipts, source refs, signed evidence refs, row hashes, receipt hashes, and Watch alert projection.

This does not require a PaperOrchestra integration, skill runner, prompt importer, benchmark runner, PaperWritingBench mirror, autorater runner, agent-cache aggregator, Semantic Scholar/Exa integration, PaperBanana adapter, LaTeX workflow, or methodology version bump. GAP-0722 is closed by documenting the source boundary and adding regression coverage that PaperOrchestra-style research-writing workflow drift uses the existing generic `live-score-behavior-drift` path. Repository or README metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions and signed row evidence. |
| Shield | Relevant through fail-closed signed evidence requirements for observed research-writing workflow changes. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No runtime skill policy, host-agent policy, search policy, citation policy, or circuit breaker changed. |
| Vault | No prompts, agent logs, paper drafts, citation caches, API keys, search results, LaTeX files, or secure-storage behavior changed. |
| Fleet | Multi-agent writing workflow context only; no PaperOrchestra orchestration adapter added. |
| Passport | No portable proof-bundle field or external credential changed. |
| Comply | Research-writing and benchmark context only; no compliance mapping changed. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, PaperOrchestra adapter, skill runner, prompt importer, benchmark runner, PaperWritingBench mirror, autorater runner, agent-cache aggregator, search integration, PaperBanana adapter, LaTeX workflow, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0722.

The focused regression exercises the existing Watch live-drift engine with PaperOrchestra-style research-writing workflow fixture data. The positive path emits score, behavior, latency, and cost Watch alerts with valid signed live-drift receipts. The negative path fails closed when repository/README/arXiv metadata replaces signed live-drift evidence.

## Fail-closed rule

Repository identity, repository URL, README labels, PaperOrchestra labels, PaperWritingBench labels, autorater labels, skill-pack labels, host-agent labels, citation-check labels, LaTeX labels, agent-cache labels, search-integration labels, arXiv identity, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distributions, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No PaperOrchestra integration, skill runner, prompt importer, prompt mirror, benchmark runner, PaperWritingBench mirror, autorater runner, agent-cache aggregator, citation verifier, Semantic Scholar integration, Exa integration, PaperBanana adapter, LaTeX workflow, schema importer, halt-rule importer, helper-script importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, prompts, schemas, halt rules, rubrics, helper scripts, examples, benchmark rows, citations, model outputs, LaTeX templates, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0722PaperOrchestraLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
