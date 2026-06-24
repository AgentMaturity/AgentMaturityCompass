# GAP-0839 - Strands course provider-drift boundary

- Gap: `GAP-0839`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `aws-samples/sample-getting-started-with-strands-agents-course`, `https://github.com/aws-samples/sample-getting-started-with-strands-agents-course`
- Retrieval: `2026-06-21` via live GitHub page review and shell header checks. Repository URL returned HTTP/2 200. The live page exposed README.md, LICENSE, MIT-0 license metadata, and the title `Getting Started with Strands Agents - Complete Learning Path`. Direct api.github.com DNS lookup failed in this shell.
- Status: closed through existing provider-drift benchmark receipts; no Strands course integration, Bedrock/Anthropic/OpenAI/Ollama/LiteLLM wrapper, AWS service adapter, MCP/A2A runtime, LangFuse/RAGAS adapter, AgentCore integration, notebook runner, or source-specific provider-drift path added.

## Live source metadata

The live repository page identifies a Strands Agents learning path with Course 1 foundation and core concepts, Course 2 AWS integration and production patterns, Course 3 advanced features and production readiness, and Course 4 AgentCore integration.

Relevant source-review context includes Amazon Bedrock, Anthropic, OpenAI, Ollama, LiteLLM, AWS service connections, Model Context Protocol, Agent-to-Agent Communication, LangFuse, RAGAS, AgentCore, Jupyter Notebook, Python, README.md, LICENSE, and MIT-0 license metadata.

These facts are provider/model drift context only. They do not authorize copying upstream notebooks, course prose, code, prompts, datasets, examples, AWS configs, traces, screenshots, generated outputs, LangFuse/RAGAS examples, MCP/A2A tools, AgentCore materials, or implementation details into AMC.

## Relevance decision

GAP-0839 is relevant to AMC because agent evaluation results can drift when provider routes, model versions, tool protocols, retrieval settings, evaluator frameworks, observability pipelines, or cost/latency envelopes change. The gap maps to AMC's existing provider/model drift benchmark primitive: provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, and CI gate proof.

It does not require a Strands course runner, Bedrock service adapter, Anthropic/OpenAI/Ollama/LiteLLM wrapper, AWS integration layer, MCP tool runtime, Agent-to-Agent Communication simulator, LangFuse adapter, RAGAS adapter, AgentCore integration, notebook importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, or public methodology version bump. Course metadata can explain why provider drift matters for agent evaluation stacks, but it cannot replace AMC-owned drift evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider-drift score distributions, canary rows, eval packs, and CI gate proof. |
| Shield | Relevant because provider-drift claims fail closed without signed evidence, evaluator proof, and no-copy proof. |
| Watch | Relevant through drift statistics, Watch alert projection, observability proof, and alert or waiver evidence. |
| Enforce | No runtime provider policy, AWS guardrail, MCP/A2A enforcement path, or circuit breaker changed. |
| Vault | No notebooks, prompts, traces, datasets, credentials, AWS configs, or secure-storage behavior changed. |
| Fleet | Agent-course context only; no orchestration topology, multi-agent runtime, or fleet protocol changed. |
| Passport | No portable trust token, external proof bundle, or Passport schema changed. |
| Comply | No compliance framework mapping, audit control, or methodology version changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Strands integration, Bedrock adapter, Anthropic/OpenAI/Ollama/LiteLLM wrapper, AWS service connector, MCP/A2A runtime, LangFuse/RAGAS adapter, AgentCore integration, notebook runner, diagnostic question bank, methodology version, or scoring semantics changed for GAP-0839.

The focused regression exercises the existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, Watch alert projection, and CI gate path. The positive path requires provider version, canary results, drift statistic, signed evidence, replayable eval-pack rows, observability proof, and CI gate proof. The negative path fails closed when course or repository metadata replaces AMC-owned provider-drift evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, README.md presence, LICENSE presence, MIT-0 license metadata, api.github.com DNS lookup failed, repository title, Strands label, Amazon Bedrock label, Anthropic label, OpenAI label, Ollama label, LiteLLM label, Course 1 label, Course 2 label, Course 3 label, Course 4 label, Model Context Protocol label, Agent-to-Agent Communication label, LangFuse label, RAGAS label, AgentCore label, Jupyter Notebook label, Python label, local backlog metadata, or source identity alone must fail closed for provider/model drift claims.

Passing evidence requires AMC-owned provider version, canary results, drift statistic, alert or waiver, signed evidence refs, evaluation-framework proof, observability pipeline proof, replayable eval-pack rows, CI gate proof, source refs, row hashes, and no-copy proof.

## No-bloat boundary

No Strands course integration, Bedrock adapter, Anthropic wrapper, OpenAI wrapper, Ollama wrapper, LiteLLM wrapper, AWS service adapter, MCP runtime, Agent-to-Agent Communication simulator, LangFuse adapter, RAGAS adapter, AgentCore integration, notebook runner, repository importer, benchmark mirror, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream notebooks, course prose, code, prompts, datasets, examples, AWS configs, traces, screenshots, generated outputs, LangFuse/RAGAS examples, MCP/A2A tools, AgentCore materials, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0839StrandsCourseProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; 3 provider-drift behavior tests passed.
- Focused regression after doc addition: `npx vitest run tests/gap0839StrandsCourseProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0838AutoRagEvalMetricValidityBoundary.test.ts tests/gap0839StrandsCourseProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
