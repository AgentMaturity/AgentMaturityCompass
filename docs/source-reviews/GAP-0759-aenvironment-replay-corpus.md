# GAP-0759 - AEnvironment replay-corpus boundary

- Gap: `GAP-0759`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/inclusionAI/AEnvironment`, README `https://github.com/inclusionAI/AEnvironment/blob/main/README.md`, docs `https://inclusionai.github.io/AEnvironment/`
- Retrieval: `2026-06-21` via GitHub connector default-branch README, quickstart, and license fetches; shell network remains DNS-restricted in this environment.
- Status: closed through existing eval replay corpus receipts; no AEnvironment runtime, MCP server, Agentic RL harness, TAU2/SWE-Bench/Terminal-Bench adapter, or environment registry integration added.

## Live source metadata

The GitHub connector fetched `inclusionAI/AEnvironment` from default branch `main`. The README identifies AEnvironment as `Everything as Environment`, a production-grade environment platform for Agentic RL and agents. Relevant source-review signals include standardized MCP protocol, environment providers, algorithm developers, agent developers, AReaL reinforcement learning integration, unified Environment interface, benchmark integration, RL training, agent deployment, built-in benchmarks, TAU2-Bench, SWE-Bench, Terminal-Bench, OpenAI Agents SDK compatibility, Agent as Environment, multi-agent orchestration, hierarchical systems, Mini Program IDE, OpenAI API, MCP tools, file operations, code execution, validation tools, live preview, reward functions, episode runner, distributed RL training, CLI instance/service management, Docker image build/push workflows, Environment-as-Code quickstart, MCP Inspector local testing, environment metadata, and Apache License 2.0 metadata.

These facts are relevant to AMC only as replayable benchmark corpus context. Environment-platform benchmarks can support agent evaluation only when AMC can replay the exact fixture, seed, manifest, source refs, signed evidence, score delta, and CI receipt. They do not justify copying AEnvironment, running its MCP server, importing its built-in environments, registering AEnvironment packages, or claiming environment-platform parity. No upstream README prose beyond minimal metadata facts, code snippets, command examples, screenshots, videos, benchmark rows, environment configs, reward functions, tool definitions, Dockerfiles, registry metadata, license text, or implementation details were copied into AMC.

## Relevance decision

GAP-0759 is relevant to AMC through existing eval replay corpus receipts. The accepted AMC primitives are already `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt`: replay manifests, fixed seeds, fixture hashes, source refs, signed evidence refs, score deltas, CI receipts, and fail-closed replay readiness for Score, Shield, and Watch.

AEnvironment context sharpens the no-bloat boundary for environment-backed agent evaluation. AMC can cite environment-platform work as context only when its own replay packet proves the benchmark can be rerun without source-specific runtime dependencies or copied upstream tasks. Repository, README, MCP, RL, benchmark, environment, CLI, Docker, quickstart, or license labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through replayable eval manifests, fixture hashes, fixed seeds, score deltas, and signed rows. |
| Shield | Relevant through fail-closed handling for unsupported environment, benchmark, and runtime claims. |
| Watch | Relevant when replay results bind to CI/lifecycle receipts and regression thresholds; no live monitor changed. |
| Enforce | No runtime environment policy, MCP policy, sandbox policy, or circuit-breaker behavior changed. |
| Vault | No environment configs, tool definitions, API keys, benchmark data, traces, or secure-storage behavior changed. |
| Fleet | Multi-agent/environment orchestration context only; no AEnvironment adapter or topology changed. |
| Passport | No portable proof-bundle field or external benchmark credential changed. |
| Comply | No compliance mapping changed. |

## Product closure

GAP-0759 is closed by documenting the live-source boundary and adding regression coverage over the existing eval replay corpus primitive. The positive path accepts AEnvironment-style environment-backed benchmark context only with AMC-owned replay manifest, fixture hash, fixed seed, source refs, signed evidence refs, row hashes, score delta, and CI receipt. The negative path fails closed when GitHub/README/docs/benchmark metadata replaces AMC-owned replay evidence.

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, AEnvironment runtime, MCP server, Agentic RL harness, TAU2/SWE-Bench/Terminal-Bench adapter, OpenAI Agents SDK adapter, Mini Program IDE runner, Docker build/push wrapper, environment registry integration, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0759.

## Fail-closed rule

Repository identity, repository URL, README URL, docs URL, AEnvironment labels, Everything-as-Environment labels, Agentic RL labels, MCP labels, AReaL labels, Environment interface labels, benchmark integration labels, TAU2-Bench labels, SWE-Bench labels, Terminal-Bench labels, Agent-as-Environment labels, multi-agent orchestration labels, hierarchy labels, Mini Program labels, OpenAI API labels, MCP tool labels, file-operation labels, code-execution labels, validation-tool labels, live-preview labels, reward-function labels, episode-runner labels, Docker labels, CLI labels, Environment-as-Code labels, MCP Inspector labels, Apache License labels, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, source refs, signed evidence refs, row hashes, score delta, CI/lifecycle receipt, Score/Shield/Watch surface coverage, and no-copy proof.

## No-bloat boundary

No AEnvironment runtime, MCP server, environment registry, Agentic RL harness, AReaL integration, TAU2 adapter, SWE-Bench adapter, Terminal-Bench adapter, Mini Program IDE runner, OpenAI Agents SDK adapter, Agent-as-Environment wrapper, hierarchical-agent runtime, Docker build/push wrapper, CLI integration, MCP Inspector integration, environment config importer, reward-function importer, tool-definition importer, benchmark-row importer, docs importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, code snippets, command examples, screenshots, videos, benchmark rows, environment configs, reward functions, tool definitions, Dockerfiles, registry metadata, license text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0759AEnvironmentReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
