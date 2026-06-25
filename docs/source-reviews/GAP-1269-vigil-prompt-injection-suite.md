# GAP-1269 - Vigil prompt-injection suite

- Gap: `GAP-1269`
- Dimension: `security-prompt-injection-suite`
- AMC surfaces requested: Shield, Enforce, Vault
- Source reviewed: Vigil / `deadbits/vigil-llm`
- Retrieval: 2026-06-25 live GitHub API, raw README, detection docs, canary-token docs, Docker docs, and public docs link review
- Status: Done

## Source reviewed

- GitHub repository: `https://github.com/deadbits/vigil-llm`
- GitHub API: `https://api.github.com/repos/deadbits/vigil-llm`
- Raw README: `https://raw.githubusercontent.com/deadbits/vigil-llm/main/README.md`
- Detection docs: `https://raw.githubusercontent.com/deadbits/vigil-llm/main/docs/detections.md`
- Canary-token docs: `https://raw.githubusercontent.com/deadbits/vigil-llm/main/docs/canarytokens.md`
- Docker docs: `https://raw.githubusercontent.com/deadbits/vigil-llm/main/docs/docker.md`
- Public documentation: `https://vigil.deadbits.ai`

Live source metadata at retrieval:

- The GitHub repository is public, active, Apache-2.0-licensed, Python-first, on default branch `main`, and the live API reported topics including `adversarial-attacks`, `llm-security`, `llmops`, `prompt-injection`, `security-tools`, and `yara-scanner`.
- The GitHub API description identifies Vigil as a tool to detect prompt injections, jailbreaks, and other potentially risky LLM inputs.
- The repository README identifies Vigil as an LLM prompt injection scanner, a Python library and REST API for assessing prompts and responses against scanners.
- The README says Vigil is in `alpha` and should be considered experimental / for research purposes.
- The README lists available scan modules including Vector database / text similarity, YARA heuristics, Transformer model, Prompt-response similarity, Canary Tokens, sentiment analysis, relevance, and paraphrasing.
- The README describes local embeddings and/or OpenAI support, signatures and embeddings for common attacks, Vigil-Eval as coming soon, and a Streamlit web UI playground.
- The detection docs describe Vector database, YARA / heuristics, Transformer model, Prompt-response similarity, Canary Tokens, and relevance filtering as scanner categories.
- The canary-token docs describe Prompt leakage and Goal hijacking workflows with add/check operations.
- The Docker docs state Docker support exists but is limited to OpenAI and the vector database is not persisted between runs.

## Relevance decision

GAP-1269 is relevant to AMC through the generic prompt-injection regression suite primitive added for GAP-1238. Vigil is strong source context for prompt injection, jailbreak detection, scanners, YARA heuristics, vector similarity, transformer classification, canary tokens, prompt leakage, goal hijacking, response similarity, and REST/library deployment.

AMC should not add a Vigil adapter, install Vigil/YARA/Chroma/LiteLLM dependencies, import Vigil datasets or signatures, run the Vigil REST API, or mirror Vigil's scanner architecture. The AMC-owned closure is to prove direct, indirect, multimodal, and retrieved_content attack fixtures are mapped to blocking policies and observed decisions through signed regression receipts.

metadata-only Vigil repository facts, docs labels, README labels, scanner names, canary-token workflow names, GitHub stats, topics, Docker notes, public docs links, alpha/research labels, or local backlog text cannot satisfy the suite gate.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. This gap does not alter scoring weights or public methodology semantics. |
| Shield | Relevant. Shield needs prompt-injection suite receipts for direct, indirect, multimodal, and retrieved_content cases. |
| Enforce | Relevant. Enforce needs policy mappings, observed decisions, decision receipts, and regression status. |
| Vault | Relevant. Vault preserves signed evidence refs and hashes without copying Vigil prompts, YARA rules, datasets, embeddings, configs, docs, screenshots, reports, or generated outputs. |
| Watch | Context only. Scanner/runtime context may be observable, but this gap is not a live-drift monitor. |
| Fleet | Context only. REST/API scanner deployment is relevant context, but no Fleet topology changed. |
| Passport | Not directly relevant. No portable trust-token schema changed. |
| Comply | Context only. Security scanner metadata is not compliance evidence without AMC receipts. |

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

The focused regression for GAP-1269 binds synthetic Vigil-style source context to that generic primitive and proves metadata-only Vigil evidence fails closed.

## Fail-closed rule

The following must fail closed for GAP-1269:

- Vigil GitHub repository, GitHub API metadata, raw README, detection docs, canary-token docs, Docker docs, public documentation, source title, scanner names, or local backlog text alone;
- Vigil, LLM prompt injection scanner, Python library and REST API, alpha, research purposes, Vector database, YARA, Transformer model, Prompt-response similarity, Canary Tokens, Prompt leakage, Goal hijacking, local embeddings, OpenAI, Docker, Streamlit web UI, GitHub stars, forks, license, topics, language, or source identity alone;
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

No Vigil adapter, Vigil API client, Vigil REST server runner, Vigil scanner integration, YARA dependency, Chroma/vector-db integration, LiteLLM integration, HuggingFace model wrapper, transformer scanner, canary-token subsystem, prompt-response similarity subsystem, relevance scanner, dataset importer, embeddings importer, YARA rules importer, Docker runner, Streamlit UI bridge, prompt-injection payload corpus, API route, CLI command, Studio panel, Watch monitor, methodology version bump, diagnostic question-bank change, package dependency, or source-specific scoring path was added.

AMC did not copy Vigil code, docs prose beyond minimal metadata facts, product copy beyond minimal labels, prompts, YARA rules, datasets, embeddings, canary examples, configs, API schemas, CLI commands, screenshots, reports, generated outputs, payloads, benchmark rows, model artifacts, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1269VigilPromptInjectionSuiteBoundary.test.ts --reporter=dot` failed before this doc existed with `ENOENT` while the three receipt/no-bloat tests passed.
- Focused test: `npx vitest run tests/gap1269VigilPromptInjectionSuiteBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression: `npx vitest run tests/gap1269VigilPromptInjectionSuiteBoundary.test.ts tests/gap1259SuperagentPromptInjectionSuiteBoundary.test.ts tests/gap1244LakeraGuardPromptInjectionSuiteBoundary.test.ts tests/gap1238MaliciousAiSwarmsPromptInjectionSuiteBoundary.test.ts tests/redteam.test.ts tests/security/jailbreak.test.ts tests/redteam/attackPlugins.test.ts tests/replayBenchmarkCorpus.test.ts --reporter=dot` passed, 8 files / 236 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 977 files / 7,914 tests.
- Post-doc focused rerun: `npx vitest run tests/gap1269VigilPromptInjectionSuiteBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
