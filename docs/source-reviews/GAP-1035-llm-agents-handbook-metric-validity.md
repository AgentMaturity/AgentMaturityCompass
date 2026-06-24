# GAP-1035 - LLM Agents Ecosystem Handbook metric-validity boundary

- Gap: `GAP-1035`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `oxbshw/LLM-Agents-Ecosystem-Handbook`
- Retrieval: live GitHub repository metadata, authenticated GitHub REST repository/default-branch/contents/readme/releases/tags/languages APIs, raw README, raw `requirements.txt`, raw license, raw eval/evaluation-framework docs, and local backlog metadata fetched on 2026-06-25
- Status: Done

## Relevance decision

`oxbshw/LLM-Agents-Ecosystem-Handbook` is relevant to AMC as source-review context for metric validity and reliability checks around agent evaluation practices. It maps to AMC's existing Score/Shield/Watch metric-validity primitive because AMC already requires validation table, confidence interval, sample size, metric owner, signed evidence rows, construct-validity proof, reliability checks, outcome-alignment proof, replayable eval-pack rows, row hashes, and CI/lifecycle gates before a metric-validity claim can pass.

Live source metadata verified:

- GitHub repository: `https://github.com/oxbshw/LLM-Agents-Ecosystem-Handbook`
- GitHub API: `https://api.github.com/repos/oxbshw/LLM-Agents-Ecosystem-Handbook`
- README API: `https://api.github.com/repos/oxbshw/LLM-Agents-Ecosystem-Handbook/readme`
- README: `https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/README.md`
- License: `https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/LICENSE`
- Requirements: `https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/requirements.txt`
- Evals README: `https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/evals/README.md`
- Eval design guide: `https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/evals/eval_design.md`
- Evaluation frameworks guide: `https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/evaluation_frameworks/README.md`
- Repository full name: `oxbshw/LLM-Agents-Ecosystem-Handbook`
- GitHub description: `One-stop handbook for building, deploying, and understanding LLM agents with 60+ skeletons, tutorials, ecosystem guides, and evaluation tools.`
- Public, non-fork, non-archived repository.
- License metadata and license file: `MIT License`
- primary language `Python`
- Stars `529`
- Forks `83`
- Watchers `9`
- open issues `0`
- Topics include `ai`, `ai-agent`, `ai-agents`, `fine-tuning`, `finetuning-llms`, `freamework`, `llm`, `llmops`, `local-development`, `mcp-server`, `memory`, `rag`, `rag-chatbot`, and `voice-agent`
- Created `2025-09-08T01:24:26Z`, pushed `2026-06-22T18:54:10Z`, updated `2026-06-22T18:54:15Z`
- default branch `main`; protected `false`; default branch commit `0d305fe203afc90fe4a6d9b27c3aaa4df0bcec84`
- README sha `52579de98670255b5a12ed922e22ab757304e958`, size 19267
- GitHub languages API reports Jupyter Notebook and Python
- Releases API: no releases returned
- Tags API returned tag `v1.0.1` at commit `e35d6c121b296652ae907c495f1a04865fcfd1af`
- Top-level repository shape includes `.env.example`, `.github`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `LICENSE`, `MIGRATION_AND_PROVIDER_EXPANSION_PLAN.md`, `README.md`, `ROADMAP.md`, `SECURITY.md`, `TRANSLATION.md`, `agent_os`, `agents`, `blueprints`, `checklists`, `coding_agents`, `complete_apps`, `datasets`, `design`, `design_docs`, `docs`, `ecosystem`, `evals`, `evaluation_frameworks`, `examples`, `github`, `llm_wiki`, `llms-full.txt`, `llms.txt`, `mcp`, `memory`, `notebooks`, `observability`, `prompt_engineering`, `providers`, `requirements.txt`, `resources`, `safety`, `scripts`, `skills`, `templates`, `tests`, `tutorials`, `utilities`, and `web_apps`
- README/source-review labels include 60+ skeletons, tutorials, ecosystem guides, evaluation tools, 100+ curated agent skeletons, 24+ LLM providers, provider strategy, identity, memory, skills, MCP integrations, guardrails, observability, evals, RAG, voice-agent, local development, coding-agent workflows, templates, and checklists
- Requirements labels include `gradio`, `streamlit`, `pandas`, `numpy`, `pytest`, `openai>=1.0.0`, and `anthropic`
- `evals` contents include `README.md`, `eval_design.md`, `regression_evals.md`, `tool_call_evals.md`, `memory_evals.md`, `mcp_evals.md`, `safety_evals.md`, `prompt_evals.md`, and `examples`
- `evals/examples` contents include `eval_dataset.jsonl`, `eval_rubric.md`, and `regression_eval_plan.md`
- `evaluation_frameworks` contents include `README.md`
- `observability` contents include `README.md`, `cost_tracking.md`, `dashboards.md`, `failure_analysis.md`, `latency_tracking.md`, `logging.md`, `spans.md`, and `tracing.md`
- `providers` contents include `README.md`, `cost_latency_matrix.md`, `env_vars.md`, `examples`, `local_models.md`, `model_selection_guide.md`, `provider_abstraction.md`, `provider_matrix.md`, and `router_patterns.md`
- `safety` contents include `README.md`, `data_exfiltration.md`, `examples`, `guardrails.md`, `human_approval.md`, `prompt_injection.md`, `secure_agent_checklist.md`, and `tool_risk_levels.md`
- Evals README labels include regression, tool-call, memory, MCP, safety, prompt evals, dataset format, rubric, regression eval plan, versioned golden datasets, per-release deltas, and pass/fail per suite
- Eval design guide labels include ground truth, schema, rubric score, structured tool-call trace, judge model pinning, version the rubric, sample-grade with humans, edge-case regression cases, dataset contamination warnings, and Run on every PR
- Evaluation frameworks guide labels include Promptfoo, DeepEval, MLflow, RAGAs, Deepchecks, LangSmith, TruLens, Phoenix, and Langfuse

The source is not a reason to add a handbook importer, skeleton/tutorial clone, provider adapter, evaluation-framework catalog runtime, RAG subsystem, MCP server, memory subsystem, voice-agent subsystem, eval-runner clone, dataset importer, package dependency, API route, CLI command, Studio panel, Watch panel, or source-specific metric-validity module. AMC can reference this source only as context attached to AMC-owned metric-validity receipts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when AMC-owned metric-validity rows provide validation table, sample size, confidence interval, metric owner, signed evidence, construct-validity proof, and outcome-alignment proof. |
| Shield | Relevant only when safety, prompt-injection, tool-risk, MCP-risk, refusal, invalid-action, or guardrail metrics are captured in AMC-owned validation evidence. |
| Enforce | No runtime enforcement change; metric-validity CI/lifecycle gates already fail closed through the existing primitive. |
| Vault | No secrets, dataset storage, privacy, or retention change. |
| Watch | Relevant only when metric drift or validity degradation emits Watch evidence from AMC-owned receipts. |
| Fleet | Contextual only for agent ecosystem coverage; no orchestration/runtime subsystem was added. |
| Passport | No external proof-token change. |
| Comply | No compliance mapping change. |

## Product closure

No product code change was needed. GAP-1035 is closed by documenting the relevance boundary and adding regression coverage that proves:

- existing `buildMetricValidationReport` can represent LLM-agent handbook context only when AMC-owned validation rows are present;
- validation table, confidence interval, sample size, metric owner, construct-validity evidence, reliability checks, signed evidence refs, row hashes, outcome alignment, replayable eval-pack rows, and CI/lifecycle gates are preserved;
- GitHub repository metadata, README labels, tag labels, requirements labels, eval-design labels, evaluation-framework catalog labels, benchmark/tool names, skeleton/tutorial counts, provider counts, RAG/MCP/memory/voice labels, local backlog text, or source identity cannot replace AMC-owned metric-validity evidence.

## Fail-closed rule

The following evidence is metadata-only and must fail closed if it is used without AMC-owned metric-validity proof:

- GitHub repository URL/API response, stars, forks, watchers, issues, topics, license metadata, default branch, commit SHA, README, requirements, tag labels, repository tree, eval-design prose, evaluation-framework catalog labels, observability/safety/provider directory labels, skeleton/tutorial counts, provider counts, RAG/MCP/memory/voice labels, local backlog text, or source identity.

A passing AMC metric-validity claim must include validation table, confidence interval, sample size, metric owner, signed evidence rows, construct-validity proof, reliability checks, outcome-alignment proof, replayable eval-pack rows, row hashes, source refs, and CI/lifecycle gate outcome.

## No-bloat boundary

AMC did not add a handbook importer, skeleton/tutorial clone, provider adapter, evaluation-framework catalog runtime, Promptfoo/DeepEval/RAGAs/Langfuse/Phoenix/TruLens/LangSmith/MLflow integration, RAG subsystem, MCP server, memory subsystem, voice-agent subsystem, eval-runner clone, dataset importer, template importer, package dependency, API route, CLI command, Studio panel, Watch panel, source-specific metric-validity module, copied README prose, copied docs prose, copied eval datasets, copied rubrics, copied regression plans, copied benchmark rows, copied prompts, copied examples, copied configs, copied notebooks, copied source code, copied model outputs, copied screenshots, or copied generated state.

External sources remain source-review signals only. AMC's product primitive remains generic metric-validity evidence over Score/Shield/Watch.

## Verification

- `gh repo view oxbshw/LLM-Agents-Ecosystem-Handbook --json nameWithOwner,description,stargazerCount,forkCount,watchers,primaryLanguage,repositoryTopics,licenseInfo,defaultBranchRef,pushedAt,updatedAt,createdAt,homepageUrl,url,isArchived,isFork,isPrivate` passed.
- `gh api repos/oxbshw/LLM-Agents-Ecosystem-Handbook --jq ...` passed.
- `curl -sSIL https://github.com/oxbshw/LLM-Agents-Ecosystem-Handbook | sed -n '1,80p'` passed.
- `gh api 'search/repositories?q=repo:oxbshw/LLM-Agents-Ecosystem-Handbook' --jq ...` passed.
- `gh api repos/oxbshw/LLM-Agents-Ecosystem-Handbook/readme --jq ...` passed.
- `gh api 'repos/oxbshw/LLM-Agents-Ecosystem-Handbook/contents?ref=main' --jq '.[].name'` passed.
- `gh api repos/oxbshw/LLM-Agents-Ecosystem-Handbook/branches/main --jq ...` passed.
- `gh api repos/oxbshw/LLM-Agents-Ecosystem-Handbook/languages --jq '.'` passed.
- `gh api 'repos/oxbshw/LLM-Agents-Ecosystem-Handbook/releases?per_page=5' --jq ...` passed.
- `gh api 'repos/oxbshw/LLM-Agents-Ecosystem-Handbook/tags?per_page=10' --jq ...` passed.
- `curl -sS https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/LICENSE | sed -n '1,36p'` passed.
- `curl -sS https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/requirements.txt | sed -n '1,200p'` passed.
- `curl -sS https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/README.md | rg ...` passed.
- `gh api 'repos/oxbshw/LLM-Agents-Ecosystem-Handbook/contents/evals?ref=main' --jq '.[].name'` passed.
- `gh api 'repos/oxbshw/LLM-Agents-Ecosystem-Handbook/contents/evaluation_frameworks?ref=main' --jq '.[].name'` passed.
- `gh api 'repos/oxbshw/LLM-Agents-Ecosystem-Handbook/contents/observability?ref=main' --jq '.[].name'` passed.
- `curl -sS https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/evals/README.md | rg ...` passed.
- `curl -sS https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/evals/eval_design.md | rg ...` passed.
- `curl -sS https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/evaluation_frameworks/README.md | rg ...` passed.
- `gh api 'repos/oxbshw/LLM-Agents-Ecosystem-Handbook/contents/evals/examples?ref=main' --jq '.[].name'` passed.
- `gh api 'repos/oxbshw/LLM-Agents-Ecosystem-Handbook/contents/providers?ref=main' --jq '.[].name'` passed.
- `gh api 'repos/oxbshw/LLM-Agents-Ecosystem-Handbook/contents/safety?ref=main' --jq '.[].name'` passed.
- TDD expected failure before doc creation passed as expected: missing source-review doc was the only failing condition, while 3 metric-validity primitive tests passed.
- `npx vitest run tests/gap1035LlmAgentsHandbookMetricValidityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- `npx vitest run tests/gap1035LlmAgentsHandbookMetricValidityBoundary.test.ts tests/gap1034AgentLabMetricValidityBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Narrow token scan over metric-validity implementation files found no GAP-1035 handbook identifiers.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 882 files / 7,514 tests.
