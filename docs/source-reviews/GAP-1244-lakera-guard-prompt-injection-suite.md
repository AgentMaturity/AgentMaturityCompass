# GAP-1244 - Lakera Guard prompt-injection suite

- Gap: `GAP-1244`
- Dimension: `security-prompt-injection-suite`
- AMC surfaces requested: Shield, Enforce, Vault
- Source reviewed: Lakera Guard / Lakera AI Agent Security
- Retrieval: 2026-06-25 live Lakera homepage, AI Agent Security page, prompt-injection risk page, docs API page, and platform docs link review
- Status: Done

## Source reviewed

- Homepage: `https://www.lakera.ai`
- AI Agent Security page: `https://www.lakera.ai/ai-agent-security`
- Prompt injection risk page: `https://www.lakera.ai/risk/prompt-injection-attacks`
- Docs API page: `https://docs.lakera.ai/docs/api`
- Platform docs: `https://platform.lakera.ai/docs`

Live source metadata at retrieval:

- The homepage identifies Lakera as an `AI-Native Security Platform`.
- The AI Agent Security page identifies `AI Agent Security`, agent visibility, agent governance, tool/data/MCP/autonomy controls, policy and runtime enforcement, and `Protect in Real Time` runtime protection.
- The homepage and AI Agent Security page list managed risks including `Prompt Injection Attacks`, `Indirect Prompt Injection`, AI data leaks, compliance and regulatory risks, toxic content generation, and `Multilingual & Multimodal Attacks`.
- The homepage says Lakera observes more than 100 languages in real time and advertises `sub-50 ms runtime latency`.
- The prompt-injection risk page describes `Prompt Injection Attacks`, `Real-Time, Context-Aware Detection`, jailbreaks, indirect injections, obfuscated prompts, and enforcement options to `Block, redact, or warn`.
- The docs API page is currently branded as `Check Point AI Security` in the retrieved page title and exposes API/policy operations including policy configuration health, policy validation, create/get/update/delete policy, project operations, and detailed detection results.

## Relevance decision

GAP-1244 is relevant to AMC through the generic prompt-injection regression suite primitive added for GAP-1238. Lakera Guard is strong source context for prompt-injection defenses, runtime policy enforcement, indirect prompt injection, multilingual and multimodal attacks, data leakage, jailbreaks, and API/policy operations.

AMC should not add a Lakera Guard adapter or mirror Lakera's hosted guardrail product. The AMC-owned closure is to prove direct, indirect, multimodal, and retrieved_content attack fixtures are mapped to blocking policies and observed decisions through signed regression receipts.

metadata-only Lakera marketing claims, docs labels, product names, latency claims, or API labels cannot satisfy the suite gate.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. This gap does not alter scoring weights or public methodology semantics. |
| Shield | Relevant. Shield needs prompt-injection suite receipts for direct, indirect, multimodal, and retrieved_content cases. |
| Enforce | Relevant. Enforce needs policy mappings, observed decisions, decision receipts, and regression status. |
| Vault | Relevant. Vault preserves evidence refs and hashes without copying Lakera payloads, policies, docs, screenshots, reports, or generated outputs. |
| Watch | Context only. Watch can observe failures, but this gap is not a live-drift monitor. |
| Fleet | Context only. Agent security and autonomy are relevant context, but no Fleet topology changed. |
| Passport | Not directly relevant. No portable trust-token schema changed. |
| Comply | Context only. Compliance and regulatory risk labels are not compliance evidence without AMC receipts. |

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

The focused regression for GAP-1244 binds synthetic Lakera-style source context to that generic primitive and proves metadata-only Lakera evidence fails closed.

## Fail-closed rule

The following must fail closed for GAP-1244:

- Lakera homepage, AI Agent Security page, prompt-injection risk page, docs API page, platform docs link, product title, Check Point AI Security docs title, or local backlog text alone;
- AI-Native Security Platform, Lakera Guard, AI Agent Security, Prompt Injection Attacks, Indirect Prompt Injection, Multilingual & Multimodal Attacks, Protect in Real Time, sub-50 ms runtime latency, Real-Time, Context-Aware Detection, Block, redact, or warn, policy operations, API labels, or source identity alone;
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

No Lakera Guard adapter, Lakera API client, Check Point AI Security integration, policy importer, docs scraper, hosted guardrail bridge, prompt-injection payload corpus, Gandalf integration, latency monitor, multilingual detector, multimodal detector, RAG dataset importer, API route, CLI command, Studio panel, Watch monitor, methodology version bump, diagnostic question-bank change, package dependency, or source-specific scoring path was added.

AMC did not copy Lakera code, docs prose beyond minimal metadata facts, product copy beyond minimal labels, prompts, policies, API schemas, screenshots, examples, benchmark rows, reports, generated outputs, payloads, latency data, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1244LakeraGuardPromptInjectionSuiteBoundary.test.ts --reporter=dot` failed before this doc existed with `ENOENT` while the three receipt/no-bloat tests passed.
- Focused test: `npx vitest run tests/gap1244LakeraGuardPromptInjectionSuiteBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression: `npx vitest run tests/gap1244LakeraGuardPromptInjectionSuiteBoundary.test.ts tests/gap1238MaliciousAiSwarmsPromptInjectionSuiteBoundary.test.ts tests/redteam.test.ts tests/security/jailbreak.test.ts tests/redteam/attackPlugins.test.ts tests/gap1237PromptInjectionReviewAdversarialRegressionBoundary.test.ts tests/replayBenchmarkCorpus.test.ts --reporter=dot` passed, 7 files / 232 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 975 files / 7,906 tests.
- Post-doc focused rerun: `npx vitest run tests/gap1244LakeraGuardPromptInjectionSuiteBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
