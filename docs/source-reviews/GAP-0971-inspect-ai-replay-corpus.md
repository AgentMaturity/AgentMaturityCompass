# GAP-0971 - Inspect AI replay-corpus boundary

- Gap: `GAP-0971`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live Inspect docs at `https://inspect.aisi.org.uk/`, live GitHub repository page at `https://github.com/UKGovernmentBEIS/inspect_ai`, eval-set docs at `https://inspect.aisi.org.uk/eval-sets.html`, log viewer docs at `https://inspect.aisi.org.uk/log-viewer.html`, log file docs at `https://inspect.aisi.org.uk/eval-logs.html`, and eval listing page at `https://inspect.aisi.org.uk/evals/index.html`
- Retrieval: `2026-06-22` live source review through the web research channel.
- Status: closed through existing eval replay corpus receipts only when AMC-owned replay evidence exists; no Inspect AI runner, package dependency, task importer, eval-set runner, log parser, transcript importer, sandbox integration, or source-specific replay path added.
- Linear: `AMC-1249`

## Live source metadata

The live Inspect docs describe Inspect as an open-source framework for large language model evaluations developed by the UK AI Security Institute and Meridian Labs. The docs identify broad evaluation coverage across coding, agentic tasks, reasoning, knowledge, behavior, and multi-modal understanding. Core source signals include reusable building blocks for datasets, agents, tools, and scorers; over 200 pre-built evaluations; Inspect View; VS Code tooling; custom and MCP tools; built-in bash, python, text editing, web search, web browsing, and computer tools; agent evaluations; multi-agent primitives; external agents like Claude Code, Codex CLI, and Gemini CLI; and sandbox options including Docker, Kubernetes, Modal, Proxmox, and other systems.

The docs define an evaluation around a Task, Dataset, Solver, and Scorer, with `inspect eval` and Inspect View as the visible run and review path. The eval-set docs describe running suites with `eval-set`, a dedicated log directory, re-run support, retries, Sample Preservation, stable unique identifiers, and completed-work tracking. The log viewer and log file docs identify Sample Details, Scores and Answers, Log File API, Log Dataframes, Inspect Scout, transcripts, and log-analysis surfaces. The live GitHub repository page identifies 2.2k stars, 567 forks, 133 issues, 97 pull requests, 6,199 commits, MIT license, and Python 99.9%.

No Inspect AI code, docs prose beyond short metadata facts, examples, task definitions, eval suite files, benchmark rows, datasets, log files, transcripts, scorer definitions, prompts, screenshots, sandbox configs, model outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0971 is relevant to AMC only through the existing replayable benchmark corpus primitive. Inspect AI's evaluation framework, eval-set, logging, sample preservation, and agent-evaluation context reinforces a real AMC audit requirement: auditors need a versioned replay manifest with fixed seeds, fixture hashes, signed baseline/candidate evidence, source refs, row hashes, score deltas, and CI or lifecycle receipts.

The accepted AMC primitive is already `runReplayBenchmarkCorpus` plus `buildEvalReplayCorpusEvidenceReceipt`. Inspect docs, GitHub metadata, task/dataset/solver/scorer labels, eval-set labels, log labels, sample-preservation labels, sandbox labels, external-agent labels, and local backlog metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned replay manifests with fixture hash, fixed seed, score delta, source refs, and signed evidence. |
| Shield | Relevant when replay rows cover unsafe, adversarial, or policy-failing behavior with signed evidence and CI/lifecycle receipts. |
| Enforce | No runtime sandbox, tool approval, MCP tool, policy, or circuit breaker changed. |
| Vault | No task data, log data, transcript, API key, sandbox artifact, or secure-storage behavior changed. |
| Watch | Relevant when replay deltas are tied to regression thresholds, lifecycle receipts, or evidence drilldown; no live monitor changed. |
| Fleet | Agent, multi-agent, and external-agent context only; no Fleet orchestration, bridge, or topology changed. |
| Passport | No portable proof-bundle field or external credential changed. |
| Comply | No compliance mapping changed. |

## Product closure

No product code changed. The focused regression exercises existing `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` behavior with AMC-owned synthetic fixture data.

The positive path proves Inspect AI source context can be cited only when AMC-owned replay rows include replay manifest, fixture hash, fixed seed, source refs, baseline/candidate evidence, signed evidence refs, Score/Shield/Watch coverage, row hashes, score delta, and CI receipt proof. The negative path fails closed when Inspect docs, GitHub metadata, eval-set labels, log labels, sample-preservation labels, task labels, and benchmark labels replace an AMC-owned replay fixture.

## Fail-closed rule

Inspect AI homepage/docs claims, GitHub counts, open-source framework labels, UK AI Security Institute labels, Meridian Labs labels, over 200 evaluations labels, Task/Dataset/Solver/Scorer labels, `inspect eval` labels, Inspect View labels, eval-set labels, dedicated-log-directory labels, re-run labels, Sample Preservation labels, stable unique identifier labels, Log File API labels, Log Dataframes labels, Inspect Scout labels, Sample Details labels, Scores and Answers labels, sandbox labels, external-agent labels, local backlog metadata, and source identity alone are not replay-corpus evidence.

Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, row hashes, CI or lifecycle receipt, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No Inspect AI runner, importer, adapter, eval-set runner, task importer, dataset importer, solver/scorer importer, log parser, transcript importer, Inspect View clone, VS Code integration, sandbox integration, MCP tool integration, external-agent bridge, eval listing mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, package dependency, or source-specific replay path was added.

No upstream code, docs prose beyond short metadata facts, examples, task definitions, eval suite files, datasets, benchmark rows, log files, transcripts, scorer definitions, prompts, screenshots, sandbox configs, model outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0971InspectAiReplayCorpusBoundary.test.ts --reporter=dot` - 1 file / 4 tests passed.
- Paired regression: `npx vitest run tests/gap0970OpenAiEvalsMetricValidityBoundary.test.ts tests/gap0971InspectAiReplayCorpusBoundary.test.ts --reporter=dot` - 2 files / 8 tests passed.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
