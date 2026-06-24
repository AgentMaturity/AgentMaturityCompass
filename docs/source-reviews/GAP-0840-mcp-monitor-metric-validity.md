# GAP-0840 - mcp-monitor metric-validity boundary

- Gap: `GAP-0840`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `seekrays/mcp-monitor`, `https://github.com/seekrays/mcp-monitor`
- Retrieval: `2026-06-21` via live GitHub page, GitHub REST API, README API, license API, and shell header checks. Repository URL returned HTTP/2 200. api.github.com repository metadata returned `stargazers_count` 84, language Go, Apache-2.0 license metadata, topics `computer`, `mcp`, `mcp-server`, `monitor`, `monitoring`, `pc-monitor`, and `system-monitoring`. README.md and LICENSE API lookups succeeded.
- Status: closed through existing metric-validity receipts; no MCP monitor integration, system metrics importer, Go service, MCP server adapter, host telemetry connector, process monitor, API route, CLI command, Studio panel, or source-specific metric-validity path added.

## Live source metadata

The live README identifies the project as MCP System Monitor. The GitHub description says it exposes system metrics through the Model Context Protocol and lets LLMs retrieve real-time system information through an MCP-compatible interface.

Relevant source-review signals include CPU Information, Memory Information, Disk Information, Network Information, Host Information, Process Information, `get_cpu_info`, `get_memory_info`, `get_disk_info`, `get_network_info`, `get_host_info`, `get_process_info`, README.md, LICENSE, Apache-2.0 license metadata, Go, and `stargazers_count` 84.

These facts are operational monitoring context only. They do not authorize copying upstream Go code, README prose beyond minimal metadata facts, system metric schemas, tool definitions, screenshots, build commands, configs, MCP server behavior, process samples, host telemetry, generated outputs, or implementation details into AMC.

## Relevance decision

GAP-0840 is relevant to AMC because operational-monitoring metrics can be used as evidence in Score, Shield, and Watch only when their validity is proven: metric definitions must match the maturity claim, sample size must be sufficient, stability must be tested, confidence intervals must be available, and an accountable metric owner must exist.

The source does not define AMC scoring methodology and does not require an MCP monitor integration. Its GitHub, README, license, Go, MCP, CPU, memory, disk, network, host, process, tool-name, star-count, topic, or system-monitoring metadata can motivate a source-review boundary, but it cannot replace AMC-owned validation table, confidence interval, sample size, metric owner, signed evidence refs, row hashes, eval pack, outcome alignment, and CI gate proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity rows for validation table, confidence interval, sample size, metric owner, and outcome alignment. |
| Shield | Relevant because metadata-only operational metrics fail closed without signed evidence and reliability proof. |
| Watch | Relevant as operational-monitoring context, but only through AMC-owned metric-validity receipts and Watch evidence. |
| Enforce | No runtime MCP policy, telemetry policy, host monitor, or circuit breaker changed. |
| Vault | No host telemetry, process data, credentials, screenshots, logs, or secure-storage behavior changed. |
| Fleet | MCP context only; no multi-agent orchestration topology or fleet trust runtime changed. |
| Passport | No portable trust token, external proof bundle, or Passport schema changed. |
| Comply | No compliance framework mapping, audit control, or public methodology version changed. |

## Product closure

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, MCP monitor adapter, Go service, host telemetry connector, process monitor, diagnostic question bank, methodology version, or scoring semantics changed for GAP-0840.

The focused regression exercises the existing `buildMetricValidationReport` path. The positive path requires validation table, confidence interval, sample size, metric owner, signed evidence refs, row hashes, eval pack, outcome alignment, and CI gate proof. The negative path fails closed when source metadata replaces signed metric-validity evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, api.github.com repository metadata, README.md presence, LICENSE presence, Apache-2.0 license metadata, Go label, `stargazers_count` 84, Model Context Protocol label, MCP-compatible interface label, real-time system information label, CPU Information label, Memory Information label, Disk Information label, Network Information label, Host Information label, Process Information label, `get_cpu_info`, `get_memory_info`, `get_disk_info`, `get_network_info`, `get_host_info`, `get_process_info`, local backlog metadata, or source identity alone must fail closed for AMC metric-validity claims.

Passing evidence requires AMC-owned validation table, construct-validity proof, confidence interval, sample size, metric owner, reliability check, outcome alignment, signed evidence refs, row hashes, replayable eval pack, source refs, CI gate proof, and no-copy proof.

## No-bloat boundary

No MCP monitor integration, Go service, MCP server adapter, host telemetry connector, process monitor, CPU/memory/disk/network importer, system metrics schema, repository importer, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream Go code, README prose beyond minimal metadata facts, system metric schemas, tool definitions, screenshots, build commands, configs, MCP server behavior, process samples, host telemetry, generated outputs, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0840McpMonitorMetricValidityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; 3 metric-validity behavior tests passed.
- Focused regression after doc addition: `npx vitest run tests/gap0840McpMonitorMetricValidityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0839StrandsCourseProviderDriftBoundary.test.ts tests/gap0840McpMonitorMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
