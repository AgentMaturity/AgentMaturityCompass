# GAP-1259 - Superagent prompt-injection suite

- Gap: `GAP-1259`
- Dimension: `security-prompt-injection-suite`
- AMC surfaces requested: Shield, Enforce, Vault
- Source reviewed: `superagent-ai/superagent` / Superagent SDK
- Retrieval: 2026-06-25 live GitHub API, raw README, CLI README, MCP README, TypeScript SDK README, docs page, and website page review
- Status: Done

## Source reviewed

- GitHub repository: `https://github.com/superagent-ai/superagent`
- GitHub API: `https://api.github.com/repos/superagent-ai/superagent`
- Raw README: `https://raw.githubusercontent.com/superagent-ai/superagent/main/README.md`
- CLI README: `https://raw.githubusercontent.com/superagent-ai/superagent/main/cli/README.md`
- MCP README: `https://raw.githubusercontent.com/superagent-ai/superagent/main/mcp/README.md`
- TypeScript SDK README: `https://raw.githubusercontent.com/superagent-ai/superagent/main/sdk/typescript/README.md`
- Docs page: `https://docs.superagent.sh`
- Website: `https://superagent.sh`

Live source metadata at retrieval:

- The GitHub repository is public, active, MIT-licensed, TypeScript-first, on default branch `main`, and the live API reported topics including `guardrails`, `llm`, `prompt-injection`, and `security`.
- The GitHub API description says Superagent protects AI applications against prompt injections, data leaks, and harmful outputs.
- The repository README identifies `Superagent SDK` and positions it as an open-source SDK for AI agent safety with Guard, Redact, Scan, and Test areas.
- The README describes runtime guard behavior for prompt injections, malicious instructions, unsafe tool calls, PII/secrets redaction, repository scanning, red-team scenarios, SDK/CLI/MCP integration options, and open-weight models.
- The CLI README describes prompt security analysis, custom system prompts, redaction, a Claude Code hook, blocked decisions, violation types, and CWE codes.
- The MCP README identifies `MCP Server` tools for guard, redact, and verify, including prompt injection, jailbreak, and data-exfiltration detection context.
- The TypeScript SDK README describes provider/model selection, default guard behavior, PDF input support, Image input support, URL/blob input handling, chunking, classification, violation types, and usage metadata.
- The docs page title at retrieval was `What is Superagent SDK?`, with metadata describing an open-source SDK for AI agent safety.
- The website page title at retrieval was `Superagent - Secure code and agents`, with public positioning around AI security and GitHub/security-agent workflows.

## Relevance decision

GAP-1259 is relevant to AMC through the generic prompt-injection regression suite primitive added for GAP-1238. Superagent is strong source context for prompt-injection blocking, runtime guardrails, data leakage, redaction, repository scanning, CLI/MCP use, multimodal/file inputs, and red-team testing.

AMC should not add a Superagent adapter, install `safety-agent`, wrap the Superagent CLI/MCP server, import Superagent models, or mirror Superagent's product. The AMC-owned closure is to prove direct, indirect, multimodal, and retrieved_content attack fixtures are mapped to blocking policies and observed decisions through signed regression receipts.

metadata-only Superagent repository facts, docs labels, README labels, package names, CLI examples, MCP tool names, model names, provider lists, GitHub stats, topics, website copy, or local backlog text cannot satisfy the suite gate.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. This gap does not alter scoring weights or public methodology semantics. |
| Shield | Relevant. Shield needs prompt-injection suite receipts for direct, indirect, multimodal, and retrieved_content cases. |
| Enforce | Relevant. Enforce needs policy mappings, observed decisions, decision receipts, and regression status. |
| Vault | Relevant. Vault preserves signed evidence refs and hashes without copying Superagent prompts, payloads, configs, docs, model artifacts, screenshots, reports, or generated outputs. |
| Watch | Context only. Runtime guard context may be observed by Watch, but this gap is not a live-drift monitor. |
| Fleet | Context only. MCP/agent tool context is relevant, but no Fleet topology changed. |
| Passport | Not directly relevant. No portable trust-token schema changed. |
| Comply | Context only. Compliance and security claims are not compliance evidence without AMC receipts. |

## Product closure

No new product code was required after GAP-1238. Existing `buildPromptInjectionRegressionSuiteReceipt`, `verifyPromptInjectionRegressionSuiteReceipt`, and `renderPromptInjectionRegressionSuiteMarkdown` behavior already supports the required closure:

- direct, indirect, multimodal, and retrieved_content vector coverage;
- attack fixture id;
- attack trace ref and hash;
- policy id and policy mapping ref;
- expected decision and observed decision;
- observed decision receipt id;
- regression status;
- suite and row evidence refs;
- signed suite and row evidence refs;
- row hash and receipt hash;
- fail-closed behavior for missing evidence and decision mismatches.

The focused regression for GAP-1259 binds synthetic Superagent-style source context to that generic primitive and proves metadata-only Superagent evidence fails closed.

## Fail-closed rule

The following must fail closed for GAP-1259:

- Superagent GitHub repository, GitHub API metadata, raw README, CLI README, MCP README, TypeScript SDK README, docs page, website page, source title, package names, or local backlog text alone;
- `Superagent SDK`, AI agent safety, prompt injections, data leaks, harmful outputs, runtime guard, redaction, repository scanning, red-team scenarios, CLI, MCP Server, open-weight models, provider/model lists, PDF support, Image support, URL/blob input support, classification fields, violation types, CWE codes, GitHub stars, forks, license, topics, language, or source identity alone;
- missing direct, indirect, multimodal, or retrieved_content vector coverage;
- source refs without suite evidence refs and signed evidence refs;
- attack fixture without attack trace ref and attack trace hash;
- attack trace without policy id and policy mapping ref;
- policy mapping without expected decision and observed decision;
- observed decision without an observed decision receipt id;
- observed decision that diverges from the expected policy decision;
- missing or non-passing regression status;
- row evidence without signed row evidence refs;
- tampered row hash or receipt hash.

## No-bloat boundary

No Superagent adapter, `safety-agent` package dependency, Superagent API client, CLI wrapper, MCP server integration, GitHub app integration, repository scanner, redaction subsystem, claim-verification subsystem, open-weight model loader, provider router, PDF analyzer, Image analyzer, prompt-injection payload corpus, repo-poisoning corpus, red-team scenario importer, SDK bridge, API route, CLI command, Studio panel, Watch monitor, methodology version bump, diagnostic question-bank change, package dependency, or source-specific scoring path was added.

AMC did not copy Superagent code, docs prose beyond minimal metadata facts, product copy beyond minimal labels, prompts, guard policies, API schemas, CLI commands, MCP configs, SDK examples, screenshots, reports, generated outputs, payloads, benchmark rows, model artifacts, provider tables, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1259SuperagentPromptInjectionSuiteBoundary.test.ts --reporter=dot` failed before this doc existed with `ENOENT` while the three receipt/no-bloat tests passed.
- Focused test: `npx vitest run tests/gap1259SuperagentPromptInjectionSuiteBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression: `npx vitest run tests/gap1259SuperagentPromptInjectionSuiteBoundary.test.ts tests/gap1244LakeraGuardPromptInjectionSuiteBoundary.test.ts tests/gap1238MaliciousAiSwarmsPromptInjectionSuiteBoundary.test.ts tests/redteam.test.ts tests/security/jailbreak.test.ts tests/redteam/attackPlugins.test.ts tests/replayBenchmarkCorpus.test.ts --reporter=dot` passed, 7 files / 232 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 976 files / 7,910 tests.
- Post-doc focused rerun: `npx vitest run tests/gap1259SuperagentPromptInjectionSuiteBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
