# GAP-0900 - toolkit-mcp-server metric-validity boundary

- Gap: `GAP-0900`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `cyanheads/toolkit-mcp-server`, `https://github.com/cyanheads/toolkit-mcp-server`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 18, Fork 9, Issues 1, Pull requests 3, 7 Commits, README.md, Apache-2.0 license, 2 tags, Packages 0, TypeScript 82.5%, JavaScript 17.5%, repository folders `.github`, `workflows`, and `src`, and files including `.gitignore`, `LICENSE`, `README.md`, `package-lock.json`, `package.json`, and `tsconfig.json`.
- Status: Done

## Live source metadata

The live README identifies toolkit-mcp-server as a Model Context Protocol utility server for LLM Agents. The source-review signals include Model Context Protocol clients such as Claude Desktop and IDE tools, network and geolocation operations, IP geolocation, network diagnostics, system monitoring, cryptographic operations, QR code generation, rate limiting, constant-time hash comparison, UUID generation, terminal/SVG/base64 QR output modes, npm installation, MCP client configuration, and TypeScript implementation metadata.

Those facts are relevant to AMC only as metric-validity context for operational tool-use evaluations. They do not allow AMC to claim toolkit-mcp-server compatibility, run the MCP server, invoke geolocation/network/system/crypto/QR tools, add npm package integration, or import upstream tool schemas. For Score, Shield, and Watch, the relevant AMC requirement remains a validation table, confidence interval, sample size, metric owner, construct-validity coverage, reliability checks, outcome alignment, regression thresholds, signed evidence refs, source refs, row hashes, and CI gate proof.

No upstream TypeScript source, package files, MCP configuration snippets, tool schemas, README prose beyond minimal metadata facts, examples, command snippets, network utility outputs, cryptographic outputs, QR artifacts, workflow files, package-lock content, or implementation details were copied into AMC.

## Relevance decision

`GAP-0900` is relevant to AMC as a metric-validity and reliability boundary. A general MCP utility server can expose agent tool-use risks and operational utility claims, but AMC should only score those claims when existing metric-validation receipts prove the metric is valid, reliable, and tied to signed evidence.

The closure uses existing AMC metric-validity primitives only. It does not add a toolkit-mcp-server adapter, MCP server runner, tool schema importer, geolocation evaluator, network diagnostics runner, system monitoring plugin, cryptographic tool wrapper, QR generator, npm dependency, CLI command, API route, Studio panel, or source-specific scoring path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing validation table, construct-validity, confidence interval, sample size, reliability, and outcome-alignment evidence. |
| Shield | Relevant only when signed evidence proves tool-use risk and metric reliability. |
| Watch | Relevant through existing CI/Watch fail-closed gates for metric validity. |
| Enforce | No runtime MCP/tool policy changed. |
| Vault | No geolocation data, network data, system data, cryptographic material, QR payloads, or MCP configs stored. |
| Fleet | No agent topology or tool routing changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `buildMetricValidationReport` behavior with a synthetic AMC-owned MCP-toolkit-style validation packet. The positive path requires question scores, validation facets, process evidence, outcome alignment, signed evidence refs, source refs, row hashes, confidence interval, inter-rater agreement, replayable eval pack, and CI pass. The negative path proves that GitHub, README, Model Context Protocol, IP geolocation, network diagnostics, system monitoring, cryptographic operations, QR code generation, Claude Desktop, IDE, rate limiting, constant-time hash comparison, UUID generation, package metadata, and source identity alone fail closed without AMC-owned metric-validity proof.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Apache-2.0 license, Star 18, Fork 9, Issues 1, Pull requests 3, 7 Commits, 2 tags, Packages 0, TypeScript 82.5%, JavaScript 17.5%, folder names, file names, Model Context Protocol labels, Claude Desktop labels, IDE labels, IP geolocation labels, network diagnostics labels, system monitoring labels, cryptographic operations labels, QR code generation labels, rate limiting labels, constant-time hash comparison labels, UUID generation labels, npm installation labels, local backlog metadata, or source identity alone must fail closed for metric validity. Passing metric-validity proof requires validation table, confidence interval, sample size, metric owner, construct-validity coverage, reliability checks, outcome alignment, regression thresholds, signed evidence refs, source refs, row hashes, and CI gate proof.

## No-bloat boundary

No toolkit-mcp-server adapter, MCP server runner, MCP client configuration, tool schema importer, geolocation evaluator, network diagnostics runner, system monitoring plugin, cryptographic tool wrapper, QR generator, npm dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream TypeScript source, package files, MCP configuration snippets, tool schemas, README prose beyond minimal metadata facts, examples, command snippets, network utility outputs, cryptographic outputs, QR artifacts, workflow files, package-lock content, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0900ToolkitMcpServerMetricValidityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the metric-validity behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0900ToolkitMcpServerMetricValidityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0899RagflowProviderDriftBoundary.test.ts tests/gap0900ToolkitMcpServerMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
