# GAP-0678 — MCPTox provider-drift boundary

- Gap: `GAP-0678`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2508.14925`; backlog DOI `10.1609/aaai.v40i42.40895`; backlog OpenAlex `W7138189915`
- Retrieval: `2026-06-21` via browser search/open of the arXiv record and exact-title/DOI searches; shell network remains DNS-restricted in this environment.
- Status: done through existing provider-drift MCP security proof; no MCPTox runner, dataset mirror, adapter, or source-specific product path added.

## Live source metadata

The reachable arXiv record identifies the live source as `MCPTox: A Benchmark for Tool Poisoning Attack on Real-World MCP Servers`, dated `Tue Aug 19 10:12:35 2025`. The record describes MCPTox as a benchmark for MCP tool-poisoning attacks built on `45 live, real-world MCP servers`, `353 authentic tools`, `1312 malicious test cases`, `10 categories` of risk, and evaluation over `20 prominent LLM agents`. It reports a highest attack success rate of `72.8%` and a highest refusal rate of `less than 3%`.

The exact DOI and OpenAlex identifiers were not reachable as primary landing pages through the browser tool during this pass, so they are retained only as backlog identity metadata. No paper prose beyond short bibliographic and numeric metadata facts, tables, attack examples, benchmark rows, model-result rows, prompts, datasets, repository contents, figures, screenshots, or implementation details were copied into AMC.

## Relevance decision

MCPTox is relevant to AMC because MCP tool poisoning is a provider/model drift and security-regression scenario for tool-using agents. A mature AMC provider-drift proof must show the provider route, MCP server manifest, attack-suite coverage, canary result, drift statistic, alert or waiver, replay command, CI receipt, signed evidence refs, row hashes, tool-poisoning block rate, benign pass rate, and fail-closed behavior.

This does not require a MCPTox-specific subsystem. AMC already has a generic provider-drift benchmark path with MCP security proof through AgentDefense-Bench-style fields, including MCP server count, attack suite ids, provider route, canary results, drift statistics, alerts/waivers, CI receipts, prompt-injection block rate, jailbreak block rate, tool-poisoning block rate, benign pass rate, Watch alerts, eval-pack row hashes, and CI fail-closed behavior. GAP-0678 is closed by documenting the source boundary and adding regression coverage that an MCPTox-style tool-poisoning canary uses that existing generic path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider-drift canary comparisons, eval-pack row hashes, signed evidence refs, and CI gate status. |
| Shield | Relevant through fail-closed security-regression proof and Shield-verifiable provider-drift receipts. |
| Watch | Relevant through Watch alerts for MCP security evidence gaps and tool-poisoning block-rate regressions. |
| Enforce | No runtime MCP enforcement, tool sandbox, or policy engine change. |
| Vault | No prompt, dataset, credential, server registry, or private scan-result storage feature. |
| Fleet | No MCP server fleet, benchmark runner, or multi-agent orchestration implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No compliance mapping or regulated-domain claim. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/api/benchmarkRouter.ts`, `src/api/watchRouter.ts`, API route, CLI command, Studio panel, benchmark runner, provider adapter, Shield route, Watch monitor, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0678. The focused regression exercises the existing provider-drift MCP security proof path with MCPTox-style fixture data and verifies both a passing signed-evidence path and a metadata-only fail-closed path.

## Fail-closed rule

Paper title, arXiv metadata, DOI/OpenAlex fields, model-result claims, attack-success percentages, refusal-rate claims, MCP server counts, tool counts, malicious test-case counts, risk-category counts, dataset availability claims, local backlog metadata, or source identity alone must fail closed for provider-drift claims. Passing evidence requires AMC-owned provider route ids, canary result hashes, drift statistic hashes, alert/waiver hashes, replay command hashes, CI receipt hashes, MCP server manifests, attack-suite ids, tool-poisoning block-rate evidence, benign pass-rate evidence, signed evidence refs, row hashes, and no-copy proof.

## No-bloat boundary

No MCPTox runner, dataset mirror, anonymized repository importer, MCP server registry, tool-poisoning payload library, attack-template generator, result-table importer, model-result parser, paper scraper, provider adapter, API route, CLI command, Studio panel, Watch monitor, Shield route, Passport field, methodology version bump, diagnostic question-bank migration, compliance mapping, package dependency, or source-specific scoring path was added. No paper prose beyond short metadata facts, tables, attack examples, benchmark rows, model-result rows, prompts, datasets, repository contents, figures, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0678McptoxProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
