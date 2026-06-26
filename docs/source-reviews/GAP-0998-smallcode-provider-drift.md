# GAP-0998 - smallcode provider-drift boundary

- Gap: `GAP-0998`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository/API at `https://github.com/Doorman11991/smallcode`, GitHub repository API at `https://api.github.com/repos/Doorman11991/smallcode`, raw README at `https://raw.githubusercontent.com/Doorman11991/smallcode/master/README.md`, license API at `https://api.github.com/repos/Doorman11991/smallcode/license`, raw package metadata at `https://raw.githubusercontent.com/Doorman11991/smallcode/master/package.json`, latest release API, `git ls-remote`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through GitHub repository API, raw GitHub content, release API, `git ls-remote`, package metadata, and local backlog metadata.
- Status: closed through existing provider/model drift benchmark receipts only; no smallcode runner, CLI wrapper, provider wizard, model-router adapter, benchmark mirror, MCP adapter, package dependency, Watch monitor, Shield verifier, API route, Studio panel, or source-specific provider-drift subsystem added.
- Linear: `AMC-1277`

## Live source metadata

The GitHub API identifies `Doorman11991/smallcode` as a public JavaScript repository with description `AI coding agent optimized for small LLMs. 87% benchmark with 4B-active model.`, MIT License metadata, default branch `master`, 1,926 stars, 144 forks, 18 open issues, topics `[]`, created_at `2026-05-18T06:19:44Z`, pushed_at `2026-06-20T04:11:30Z`, and updated_at `2026-06-24T12:19:02Z`.

`git ls-remote https://github.com/Doorman11991/smallcode.git HEAD refs/heads/master` verified default branch `master` at `c3fc7baa149129b35e36a3d5623d123e926003ed`. GitHub content metadata identified README blob `062899c3df3ea72101de16a6fd890a9dd91400e3`, LICENSE blob `96a317894ddf9d78eaab6266ef1bf6bc4b93f84b`, and package metadata blob `29b914d197788150d42dd68225fd9870657f0d71`.

The GitHub releases API identifies release `v1.6.0` published `2026-05-31T05:35:24Z` on target branch `master`.

The package metadata identifies package version `1.6.0`, MIT license, binary entries for `smallcode`, `smolv2`, `smallcode-init`, and `smallcode-rag-index`, bench scripts, Node test scripts, and dependencies including `chalk`, `express`, `marked`, and `marked-terminal`.

Relevant source-review signals include 8B-35B small-model positioning, local LLM server support, OpenAI-compatible endpoint usage, tiered model routing, adaptive routing, opt-in cloud escalation, provider wizard, structured traces, token monitoring, MCP references, benchmark scripts, benchmark diffing, test-command discovery, context-window controls, tool-call parsing, and local-first agent workflow instrumentation.

No smallcode code, README prose beyond short metadata facts, package scripts beyond short metadata facts, license text beyond license identity, configuration files, TOML/env examples, MCP config, benchmark tasks, benchmark results, traces, skills, plugins, install scripts, screenshots, examples, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0998 is relevant to AMC because a small-LLM coding-agent workflow can regress when provider endpoints, model tiers, routing policies, context limits, tool-call parsing, or fallback models change. Those are provider/model drift concerns for Score, Shield, and Watch.

The accepted AMC primitive already exists: `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate`. Valid proof requires provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI/lifecycle gate proof, source refs, and alert or waiver output. Repository metadata, README claims, package metadata, bench script names, provider labels, model labels, CLI names, MCP labels, trace labels, and source identity alone must not affect Score, Shield, or Watch.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned provider canary rows for coding-task success, tool sequencing, score, latency, cost, refusal, and evidence coverage. |
| Shield | Relevant when provider/model routing drift changes unsafe tool use, invalid actions, refusal behavior, guardrail pass rate, or evaluator coverage. |
| Enforce | No runtime provider wizard, router, model selection, policy engine, MCP bridge, CLI wrapper, or circuit breaker changed. |
| Vault | No credential handling, provider key storage, environment file handling, secure storage, DLP, or data residency behavior changed. |
| Watch | Relevant through existing Watch provider-drift alerts and CI/lifecycle gate receipts. |
| Fleet | Coding-agent canaries can inform fleet-level risk, but no Fleet topology, orchestration, or agent routing behavior changed. |
| Passport | Existing provider-drift receipts can feed proof bundles, but no Passport schema changed. |
| Comply | License and source context only; no compliance mapping changed. |

## Product closure

No product code changed. The focused regression proves existing provider-drift primitives can accept smallcode-style small-LLM coding-agent context only when AMC has signed canary rows, provider versions, metric suites, evaluator hashes, trace exports, dataset hashes, observability proof, thresholds, and CI gate evidence.

The positive path produces a replayable provider-drift eval pack and passes the CI gate without Watch alerts. The negative path fails closed when smallcode repository metadata, README metadata, package metadata, license metadata, release metadata, benchmark-script labels, provider labels, model labels, CLI labels, MCP labels, trace labels, and source identity replace AMC-owned signed canary proof.

## Fail-closed rule

smallcode repository identity, GitHub star/fork/issue counts, default-branch SHA, README labels, MIT License label, JavaScript language label, package version, package binary names, package script names, benchmark script names, local LLM labels, OpenAI-compatible endpoint labels, model-size labels, adaptive routing labels, provider wizard labels, MCP labels, structured trace labels, token monitor labels, source tree names, local backlog metadata, or source identity alone cannot prove provider/model drift.

A provider/model drift claim must fail closed unless provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, evaluator config hash, generated test data hash, trace export hash, metric report hash, threshold config, row hashes, CI or lifecycle receipt, Watch alert projection, source refs, and no-copy proof exist.

## No-bloat boundary

No smallcode runner, CLI wrapper, provider wizard, model-router adapter, adaptive-router adapter, MCP adapter, benchmark harness wrapper, benchmark dataset mirror, benchmark task mirror, benchmark result parser, trace importer, package-script importer, configuration importer, install-script integration, plugin/skill importer, OpenAI-compatible endpoint adapter, local-model server integration, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, diagnostic question-bank migration, provider router, or source-specific provider-drift subsystem was added.

No upstream code, README prose beyond short metadata facts, package scripts beyond short metadata facts, license text beyond license identity, configuration files, TOML/env examples, MCP config, benchmark tasks, benchmark results, traces, skills, plugins, install scripts, screenshots, examples, generated outputs, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0998SmallcodeProviderDriftBoundary.test.ts --reporter=dot` failed before this document existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0998-smallcode-provider-drift.md'`; 3 provider-drift primitive tests passed.
- Focused regression: `npx vitest run tests/gap0998SmallcodeProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0997ComputationalMaterialsPublicMethodologyBoundary.test.ts tests/gap0998SmallcodeProviderDriftBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Source-specific implementation token scan: `rg -n "Doorman11991/smallcode|https://github.com/Doorman11991/smallcode|smallcode-provider-drift|SmallCode provider drift" src/benchmarks/providerDriftBenchmark.ts src/watch/providerDriftAlerts.ts src/api/benchmarkRouter.ts` returned no product-module matches.
- Diff whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 845 files / 7,373 tests.
- Post-doc focused rerun: `npx vitest run tests/gap0998SmallcodeProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
