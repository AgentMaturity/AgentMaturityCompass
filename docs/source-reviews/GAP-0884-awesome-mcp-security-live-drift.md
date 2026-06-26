# GAP-0884 - Awesome MCP Security live-drift boundary

- Gap: `GAP-0884`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `getagentseal/awesome-mcp-security`, `https://github.com/getagentseal/awesome-mcp-security`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 25, Fork 6, Issues 6, Pull requests 0, 7 Commits, README.md, README.ja.md, README.ko.md, README.zh.md, CONTRIBUTING.md, LICENSE, and public README score tables for MCP security.
- Status: completed as a live-drift boundary over existing AMC Watch receipts.

## Live source metadata

The live repository identifies Awesome MCP Security as a public list of security scores for 800+ MCP servers. Relevant source-review signals include Total servers scanned 800, Safe (score >= 80) 631, Review (score 50-79) 169, Total security findings 6237, Last updated March 14, 2026, 9 security analyzers, Schema Analysis, Static Pattern Detection, Prompt Injection Scanning, Toxic Flow Mapping, Unicode Detection, Deep Autopsy, Annotations & Instructions, Resource Analysis, LLM Classification, Trust Score: 0-100, attack surface risk, prompt injection, tool poisoning, Safe, Review, Risky, and Dangerous buckets.

These facts are useful MCP security-score drift context, but they are not AMC live-drift evidence by themselves. No upstream README table rows, server lists, security scores, analyzer implementations, analyzer prompts, AgentSeal report data, MCP registry data, badge assets, multilingual README prose beyond minimal metadata facts, site content, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing Watch live score and behavior drift receipts because MCP trust-score changes and analyzer outputs are the kind of security-score behavior that operators may want to monitor over time. The closure is not an Awesome MCP Security importer, MCP server scanner, AgentSeal integration, analyzer implementation, prompt-injection scanner, toxic-flow engine, Unicode detector, LLM classifier, registry mirror, report fetcher, or trust-score adapter; it is a fail-closed boundary showing that Awesome MCP Security metadata is accepted only as source-review context unless AMC-owned baseline/live samples and signed drift evidence exist.

For live drift to pass, AMC needs a baseline distribution, live sample, drift statistic, alert receipt, signed evidence refs, source refs, replayable eval-pack rows where applicable, row hashes, regression thresholds, CI or lifecycle gate proof, and no-copy proof. GitHub/README/security-score/MCP-server metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing score distribution comparisons and alert receipts; no scoring semantics changed. |
| Shield | Relevant only as a fail-closed trust boundary for MCP security-risk context; source metadata cannot stand in for signed drift proof. |
| Watch | Relevant through existing baseline distribution, live sample, drift statistic, signed evidence, and alert receipt behavior. |
| Enforce | No MCP allowlist, sandbox, prompt-injection, or tool policy changed. |
| Vault | No server list, report data, secrets, or secure-storage behavior changed. |
| Fleet | MCP fleet context only; no server registry, scanner fleet, or trust topology added. |
| Passport | Existing drift receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0884.

The focused regression exercises existing `runLiveScoreBehaviorDrift`, `verifyLiveDriftReceipt`, and `buildLiveDriftWatchAlerts` behavior with a positive Awesome MCP Security-style baseline/live sample packet and a negative source-metadata-only packet. The positive path requires baseline distribution, live sample, drift statistic, alert receipt, source refs, signed evidence refs, and Watch alert generation. The negative path fails closed when GitHub/README/security-score/MCP-server metadata replaces signed live-drift evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, multilingual README presence, CONTRIBUTING.md presence, LICENSE presence, Star 25, Fork 6, Issues 6, Pull requests 0, 7 Commits, 800+ MCP servers labels, Total servers scanned 800 labels, Safe (score >= 80) 631 labels, Review (score 50-79) 169 labels, Total security findings 6237 labels, Last updated March 14, 2026 labels, 9 security analyzers labels, analyzer names, Trust Score: 0-100 labels, attack-surface labels, prompt-injection labels, tool-poisoning labels, local backlog metadata, or source identity alone must fail closed for live drift. Passing evidence requires baseline distribution, live sample, drift statistic, alert receipt, signed evidence refs, source refs, row hashes, regression thresholds, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No Awesome MCP Security importer, MCP server scanner, AgentSeal integration, analyzer implementation, prompt-injection scanner, toxic-flow engine, Unicode detector, LLM classifier, registry mirror, report fetcher, trust-score adapter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, badge semantics change, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream README table rows, server lists, security scores, analyzer implementations, analyzer prompts, AgentSeal report data, MCP registry data, badge assets, multilingual README prose beyond minimal metadata facts, site content, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0884AwesomeMcpSecurityLiveDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative Watch live-drift paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0884AwesomeMcpSecurityLiveDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0883RetrievalFrameworkPublicMethodologyBoundary.test.ts tests/gap0884AwesomeMcpSecurityLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
