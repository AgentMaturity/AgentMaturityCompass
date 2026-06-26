# GAP-0903 - Azure LLMAgentOps question-explainability boundary

- Gap: `GAP-0903`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Azure-Samples/llm-agent-ops-toolkit-sk`, `https://github.com/Azure-Samples/llm-agent-ops-toolkit-sk`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 17, Fork 5, Issues 0, Pull requests 5, 29 Commits, README.md, MIT license, Python 66.8%, Jupyter Notebook 30.5%, PowerShell 2.2%, Other 0.5%, repository folders `.devcontainer`, `.github`, `.vscode`, `evaluation`, `experimentation`, `security`, `src`, and `tests`, and files including `.gitignore`, `.pylintrc`, `CHANGELOG.md`, `CONTRIBUTING.md`, `Dockerfile`, `LICENSE.md`, `README.md`, `SECURITY.md`, `SUPPORT.md`, `app_rest_api.py`, `env_template`, `env_template_docker`, and `requirements.txt`.
- Status: Done

## Live source metadata

The live README identifies LLMAgentOps Toolkit as a Semantic Kernel starter structure for LLM Agent-based applications moving from experimentation to evaluation and production deployment. Relevant source-review signals include Semantic Kernel, MySql Copilot, StateFlow, Finite State Machine workflow, AutoGen Selector Group Chat Pattern, Experimentation & Evaluation, LLM as Judge, Human Evaluation, GitHub Actions, Continuous Evaluation, Continuous Security, Deployment, Monitoring, OpenTelemetry, Azure Web App Service, FastAPI, Azure AI Foundry Service, Azure OpenAI Chat Model, Azure Application Insights, Docker, REST API app, dev containers, unit tests, linting, batch experimentation, and batch evaluation.

Those facts are relevant to AMC only as question-level score explainability context for LLMOps evaluation and deployment workflows. They do not allow AMC to claim Azure/Semantic Kernel compatibility, run the sample agents, deploy Azure Web App Service workloads, use Azure AI Foundry, invoke Azure OpenAI, ingest Application Insights traces, run FastAPI, use Docker images, import StateFlow logic, or mirror the repository's evaluation/security workflows. For Score, Shield, and Watch, the relevant AMC requirement remains question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed rows, source refs, thresholds, row hashes, and no-copy proof.

No upstream Python source, notebooks, Dockerfile content, environment templates, prompts, Semantic Kernel agent code, FastAPI app code, GitHub Actions workflows, Azure deployment configuration, evaluation data, security checks, README prose beyond minimal metadata facts, command snippets, or implementation details were copied into AMC.

## Relevance decision

`GAP-0903` is relevant to AMC as a question-level score explainability boundary. The source has useful LLMOps, evaluation, monitoring, and deployment signals, but AMC should only explain L0-L5 question movement through AMC-owned accepted evidence, rejected evidence reasons, missing gates, repair hints, signed rows, thresholds, and row hashes.

The closure uses existing AMC question-score explainability primitives only. It does not add an Azure adapter, Semantic Kernel runner, StateFlow simulator, AutoGen selector integration, OpenTelemetry importer, Application Insights connector, Azure Web App deployment path, FastAPI client, Docker runner, LLM-as-judge runner, Human Evaluation workflow, or source-specific scoring path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level explanations for why a maturity question passed, failed, or needs evidence. |
| Shield | Relevant only when rejected evidence reasons and missing gates prevent metadata-only LLMOps claims. |
| Watch | Relevant through existing evidence drilldown and fail-closed status that can be surfaced to operators. |
| Enforce | No runtime agent, Azure, Semantic Kernel, FastAPI, or Docker policy changed. |
| Vault | No Azure secrets, prompts, environment templates, notebooks, telemetry, or deployment configs stored. |
| Fleet | LLMOps workflow context only; no fleet topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `buildQuestionExplainabilityReport` behavior with a synthetic AMC-owned Azure/Semantic-Kernel-style question proof. The positive path requires a question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, source refs, thresholds, and row hash. The negative path proves that GitHub, README, Azure, Semantic Kernel, MySql Copilot, StateFlow, Finite State Machine, AutoGen Selector Group Chat Pattern, Experimentation & Evaluation, LLM as Judge, Human Evaluation, Continuous Evaluation, Continuous Security, Monitoring, OpenTelemetry, Azure Web App Service, FastAPI, Azure AI Foundry Service, Azure OpenAI Chat Model, Azure Application Insights, and source identity alone fail closed without AMC-owned question-level proof.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, MIT license, Star 17, Fork 5, Issues 0, Pull requests 5, 29 Commits, Python 66.8%, Jupyter Notebook 30.5%, PowerShell 2.2%, Other 0.5%, folder names, file names, Azure labels, Semantic Kernel labels, MySql Copilot labels, StateFlow labels, Finite State Machine labels, AutoGen Selector Group Chat Pattern labels, Experimentation & Evaluation labels, LLM as Judge labels, Human Evaluation labels, Continuous Evaluation labels, Continuous Security labels, Monitoring labels, OpenTelemetry labels, Azure Web App Service labels, FastAPI labels, Azure AI Foundry Service labels, Azure OpenAI Chat Model labels, Azure Application Insights labels, local backlog metadata, or source identity alone must fail closed for question-level score explainability. Passing question-level proof requires question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed rows, source refs, thresholds, row hashes, and no-copy proof.

## No-bloat boundary

No Azure adapter, Semantic Kernel runner, StateFlow simulator, AutoGen selector integration, OpenTelemetry importer, Application Insights connector, Azure AI Foundry integration, Azure OpenAI wrapper, Azure Web App deployment path, FastAPI client, Docker runner, LLM-as-judge runner, Human Evaluation workflow, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python source, notebooks, Dockerfile content, environment templates, prompts, Semantic Kernel agent code, FastAPI app code, GitHub Actions workflows, Azure deployment configuration, evaluation data, security checks, README prose beyond minimal metadata facts, command snippets, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0903AzureLlmAgentOpsQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the question-explainability behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0903AzureLlmAgentOpsQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0902PromptingBlueprintsLiveDriftBoundary.test.ts tests/gap0903AzureLlmAgentOpsQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
