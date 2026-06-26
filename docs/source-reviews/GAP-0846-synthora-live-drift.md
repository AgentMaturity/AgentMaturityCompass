# GAP-0846 - Synthora live-drift boundary

- Gap: `GAP-0846`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `syntropix-ai/synthora`, `https://github.com/syntropix-ai/synthora`, docs homepage `https://docs.syntropix.ai/`
- Retrieval: `2026-06-21` via live GitHub page, GitHub REST API, README API, license API, and shell header checks. Repository URL returned HTTP/2 200. api.github.com repository metadata returned `stargazers_count` 67, language Python, Apache-2.0 license metadata, homepage `https://docs.syntropix.ai/`, and topics including `agent`, `artificial-intelligence`, `cooperative-ai`, `large-language-models`, `llm`, `multi-agent-systems`, `natural-language-processing`, and `workflows`. README.md and LICENSE API lookups succeeded. A later raw.githubusercontent.com README retrieval attempt failed with `raw.githubusercontent.com DNS lookup failed`, so the source-review evidence stays bound to the successful GitHub REST API retrieval.
- Status: Done; closed by documenting and testing the existing Watch live score and behavior drift receipt boundary without adding a Synthora-specific subsystem.

## Live source metadata

The live README and API metadata identify Synthora as an agent framework for building, testing, and evaluating LLM-driven agents. Relevant source-review signals include Config-Driven Assembly, Agents, Tools, Task Automation, Multi-Agent Interactions, extensibility, workflows, early stage project status, APIs are subject to significant changes, detailed observability, analysis, and evaluation, a docs homepage, and Python implementation context.

These facts are useful Score, Shield, and Watch context, but they are not live-drift evidence by themselves. No upstream code, package configs, examples, agent definitions, workflow definitions, tool examples, screenshots, assets, docs pages, README prose beyond minimal metadata facts, prompts, outputs, or implementation details were copied into AMC.

## Relevance decision

Relevant to AMC only through existing Watch live score and behavior drift primitives. A general agent framework can degrade after traffic, provider, prompt, tool, data, or workflow changes, so AMC should preserve the requirement that any live-drift claim includes a baseline distribution, live sample, drift statistic, and alert receipt.

The source does not justify a Synthora adapter, imported agent runtime, workflow runner, provider wrapper, or source-specific alert path. GAP-0846 is closed by regression coverage showing that Synthora-style agent workflow context can be represented by AMC-owned signed live-drift rows, and that GitHub/API/README/license/docs metadata alone fails closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when score movement is calculated from AMC-owned baseline and live samples with signed evidence. |
| Shield | Relevant when behavior drift increases safety or invalid-action risk; no source-specific Shield verifier was added. |
| Watch | Primary surface; existing live score and behavior drift receipts generate alert receipts from signed baseline/live rows. |
| Enforce | No runtime policy, workflow enforcement, or circuit breaker changed. |
| Vault | No source examples, configs, prompts, traces, docs, or secure-storage behavior changed. |
| Fleet | Multi-agent framework context only; no orchestration topology or Synthora runtime was added. |
| Passport | No portable proof-bundle field or badge semantics changed. |
| Comply | No compliance mapping changed. |

## Product closure

The product path remains the existing Watch live-drift primitive: `runLiveScoreBehaviorDrift`, `verifyLiveDriftReceipt`, and `buildLiveDriftWatchAlerts`. The focused regression exercises a Synthora-style agent workflow using AMC-owned baseline distribution rows, live sample rows, signed evidence refs, source refs, drift statistics, and alert receipt generation.

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0846.

## Fail-closed rule

GitHub HTTP/2 200 reachability, api.github.com repository metadata, README.md presence, LICENSE presence, Apache-2.0 license metadata, `stargazers_count` 67, Python label, docs homepage, `agent` topic, `artificial-intelligence` topic, `cooperative-ai` topic, `large-language-models` topic, `llm` topic, `multi-agent-systems` topic, `natural-language-processing` topic, `workflows` topic, Config-Driven Assembly label, Agents label, Tools label, Task Automation label, Multi-Agent Interactions label, early stage label, APIs are subject to significant changes label, Detailed observability, analysis, and evaluation label, local backlog metadata, or source identity alone must fail closed. Passing evidence requires an AMC-owned baseline distribution, live sample, drift statistic, alert receipt, signed evidence refs, source refs, row hashes, and replayable lifecycle proof.

## No-bloat boundary

No Synthora adapter, Synthora runtime, agent importer, workflow importer, config importer, tool wrapper, task-automation runner, multi-agent simulator, docs importer, package dependency, provider wrapper, API route, CLI command, Studio panel, Shield verifier, Enforce guardrail, Passport field, methodology version bump, diagnostic question-bank migration, source-specific Watch monitor, source-specific drift metric, or source-specific scoring path was added. No upstream code, package configs, examples, agent definitions, workflow definitions, tool examples, screenshots, assets, docs pages, README prose beyond minimal metadata facts, prompts, outputs, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0846SynthoraLiveDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the Watch live-drift positive, metadata-only fail-closed, and no-leakage checks passed.
- Focused regression after doc addition: `npx vitest run tests/gap0846SynthoraLiveDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0845AzureAiSearchPublicMethodologyBoundary.test.ts tests/gap0846SynthoraLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
