# GAP-0914 - CellAgent provider-drift boundary

- Gap: `GAP-0914`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `liu-shiqiang/CellAgent`, `https://github.com/liu-shiqiang/CellAgent`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed the `master` branch, Star 15, Fork 2, Issues 1, Pull requests 0, 7 Commits, README.md, repository folder `src`, files `.gitignore` and `main.py`, No releases published, Packages 0, and Python 100.0%.
- Status: Done

## Live source metadata

The live README identifies `CellAgent: LLM-Driven Multi-Agent Framework for Automated scRNA-Seq Data Analysis`. It describes single-cell RNA sequencing automation through Planner, Executor, and Evaluator roles; supporting components including Global Memory, Code Sandbox, and Tool Registry; Jupyter Notebook output; Ollama or OpenAI API key configuration; GPT-4 and llama3.1 provider paths; LangChain; scanpy; H5AD input; quality evaluation; iterative self-optimization; retry behavior; graceful error handling; quality control, normalization, clustering, annotation, differential expression, gene ontology enrichment, trajectory inference, and cell-cell interaction tasks.

Those facts are relevant to AMC only through existing provider-drift benchmark receipts. CellAgent shows why provider route changes, local-vs-hosted model paths, evaluator quality, code execution, retry behavior, and output stability need provider version, canary results, drift statistic, and alert or waiver proof before Score, Shield, or Watch can accept a provider/model drift claim.

No upstream Python code, prompts, generated code, bioinformatics tools, README prose beyond minimal metadata facts, H5AD data, notebooks, examples, dependency lists, LLM configuration snippets, Ollama/OpenAI setup details, tool registry entries, Jupyter outputs, code-sandbox behavior, scanpy workflows, retry policies, citation text, or implementation details were copied into AMC.

## Relevance decision

`GAP-0914` is relevant to AMC as a provider-drift boundary. The source maps to Score, Shield, and Watch through generic AMC canary evaluation receipts, not through a CellAgent integration.

The closure uses existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` behavior. It does not add a CellAgent adapter, scRNA-seq workflow runner, bioinformatics subsystem, Ollama wrapper, OpenAI wrapper, Jupyter executor, H5AD loader, scanpy integration, code sandbox, tool registry, Planner/Executor/Evaluator module, or source-specific provider-drift implementation.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through provider-drift score stability canaries and replayable eval packs. |
| Shield | Relevant because missing signed provider evidence, evaluator config, traces, and reports fail closed. |
| Watch | Relevant through provider-drift alerts and CI gates over latency, cost, quality, refusals, and guardrail shifts. |
| Enforce | No runtime policy changed. |
| Vault | No CellAgent data, H5AD files, notebooks, provider keys, generated code, or bioinformatics outputs stored. |
| Fleet | Multi-agent biology workflow context only; no AMC fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No medical, biological, or compliance claim changed. |

## Product closure

The focused regression exercises existing provider-drift primitives with a synthetic AMC-owned CellAgent-style canary. The positive path requires provider version, canary results, drift statistic, evaluator config hash, generated test-data hash, trace export hash, metric report hash, signed evidence refs, source refs, row hashes, thresholds, Watch alert projection, and CI gate proof. The negative path proves that CellAgent, scRNA-Seq, single-cell RNA sequencing, Planner, Executor, Evaluator, Global Memory, Code Sandbox, Tool Registry, Jupyter Notebook, Ollama, OpenAI API key, GPT-4, llama3.1, LangChain, scanpy, H5AD, quality evaluation, self-optimization, retry, GitHub metadata, and README labels alone fail closed without AMC-owned provider-drift evidence.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Star 15, Fork 2, Issues 1, Pull requests 0, 7 Commits, folder names, file names, Python 100.0%, scRNA-Seq labels, single-cell RNA sequencing labels, Planner labels, Executor labels, Evaluator labels, Global Memory labels, Code Sandbox labels, Tool Registry labels, Jupyter Notebook labels, Ollama labels, OpenAI API key labels, GPT-4 labels, llama3.1 labels, LangChain labels, scanpy labels, H5AD labels, quality evaluation labels, self-optimization labels, retry labels, local backlog metadata, or source identity alone must fail closed for provider drift. Passing provider-drift evidence requires provider version, canary results, drift statistic, alert or waiver, evaluator config hash, generated test-data hash, trace export hash, metric report hash, signed evidence refs, row hashes, and CI/Watch gate proof.

## No-bloat boundary

No CellAgent adapter, scRNA-seq workflow runner, bioinformatics subsystem, Ollama wrapper, OpenAI wrapper, GPT-4 wrapper, llama3.1 wrapper, Jupyter executor, H5AD loader, scanpy integration, code sandbox, tool registry, Planner module, Executor module, Evaluator module, Global Memory module, notebook exporter, retry controller, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python code, prompts, generated code, bioinformatics tools, README prose beyond minimal metadata facts, H5AD data, notebooks, examples, dependency lists, LLM configuration snippets, Ollama/OpenAI setup details, tool registry entries, Jupyter outputs, code-sandbox behavior, scanpy workflows, retry policies, citation text, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0914CellAgentProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the provider-drift behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0914CellAgentProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0913CorePublicMethodologyBoundary.test.ts tests/gap0914CellAgentProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
