# GAP-0959 - Prompt injection replay-corpus boundary

- Gap: `GAP-0959`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://doi.org/10.3390/info17010054`, `https://www.mdpi.com/2078-2489/17/1/54`, `https://openalex.org/W7118532765`, `https://api.openalex.org/works/W7118532765`
- Retrieval: `2026-06-22` via DOI HEAD, MDPI article page, and OpenAlex API. DOI returned HTTP/2 302 to the MDPI article route. MDPI article page opened successfully through the web channel. OpenAlex API HEAD returned HTTP/2 200.
- Status: closed through existing eval replay corpus receipts; no prompt-injection paper importer, attack prompt dataset, MDPI/OpenAlex importer, defense framework, RAG poisoning simulator, or source-specific replay subsystem added.

## Live source metadata

The live MDPI article page identifies the source as a Review and Open Access article titled `Prompt Injection Attacks in Large Language Models and AI Agent Systems: A Comprehensive Review of Vulnerabilities, Attack Vectors, and Defense Mechanisms`. It is published as `Information 2026, 17(1), 54`, dated `7 January 2026`, and tied to DOI `https://doi.org/10.3390/info17010054`.

The article metadata lists Saidakhror Gulyamov, Said Gulyamov, Andrey Rodionov, Rustam Khursanov, Kambariddin Mekhmonov, Djakhongir Babaev, and Akmaljon Rakhimjonov as authors. The page places the article in the Special Issue `Emerging Trends in AI-Driven Cyber Security and Digital Forensics`.

The article context is prompt injection attacks in large language models and AI agents. The live page mentions direct jailbreaking, indirect injection, external content, retrieval-augmented generation, RAG System Vulnerabilities, RAG poisoning, Model Context Protocol, tool poisoning, GitHub Copilot, CVE-2025-53773, ChatGPT Windows license key exposure, OWASP Top 10 for LLM Applications 2025, PALADIN, defense-in-depth, stochastic nature problem, alignment paradox, taxonomy of prompt injection attacks, and AI agent systems.

These facts are source-review signals only. No MDPI article prose, paper tables, figures, attack prompts, exploit instructions, incident rows, defense tables, benchmark outputs, RAG examples, MCP examples, Copilot details, ChatGPT examples, PALADIN details, repository code, configs, datasets, prompts, or generated outputs were copied into AMC.

## Relevance decision

This source is relevant to AMC because prompt-injection and agent-system vulnerability literature is directly related to replayable Score/Shield/Watch evidence. GAP-0959 asks for replay manifest, fixture hash, score delta, and CI receipt proof. That maps to AMC's existing eval replay corpus primitive: source refs, AMC-owned fixtures, fixed seed, fixture hash, baseline/candidate run IDs, score delta, signed evidence refs, Score/Shield/Watch surface coverage, and fail-closed receipt status.

The source does not require a prompt-injection benchmark mirror, paper parser, DOI importer, MDPI importer, OpenAlex importer, RAG poisoning simulator, MCP attack runner, Copilot incident importer, OWASP mapping subsystem, PALADIN implementation, defense framework, red-team pack, public methodology version bump, or source-specific replay corpus module. Paper metadata can describe the source-review context, but it cannot replace AMC-owned replay fixtures and signed evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned replay manifest, fixture hash, fixed seed, score delta, and CI receipt proof. |
| Shield | Relevant because prompt-injection security context requires signed evidence and fails closed when paper metadata replaces replay proof. |
| Watch | Relevant through replay evidence monitoring and source refs that can be inspected beside CI receipts. |
| Enforce | No runtime policy, guardrail, tool-call enforcement, or circuit breaker changed. |
| Vault | No secret handling, DLP, data residency, secure storage, or key-management behavior changed. |
| Fleet | Agent-system context only; no Fleet orchestration, trust topology, or multi-agent router changed. |
| Passport | No portable trust token, badge, or external proof bundle schema changed. |
| Comply | OWASP and AI-security context only; no compliance mapping or public control claim changed. |

## Product closure

No product code changed for GAP-0959. The existing `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` paths already provide the generic AMC primitive required here.

The focused regression verifies a positive prompt-injection source context only passes when it includes AMC-owned replay fixture data, fixed seed, fixture hash, source refs, baseline/candidate evidence, signed evidence refs, score delta, Score/Shield/Watch coverage, and CI-style receipt proof. The negative path fails closed when DOI, MDPI, OpenAlex, OWASP, MCP, direct jailbreaking, indirect injection, RAG poisoning, and defense-in-depth metadata replaces an AMC-owned replay fixture. A no-bloat assertion verifies paper identifiers were not added to replay corpus implementation modules.

## Fail-closed rule

The article title, DOI, MDPI URL, OpenAlex work ID, OpenAlex API URL, publication metadata, author list, special issue, Review/Open Access flags, prompt-injection vocabulary, OWASP Top 10 for LLM Applications 2025, Model Context Protocol, direct jailbreaking, indirect injection, RAG poisoning, GitHub Copilot, CVE-2025-53773, ChatGPT Windows license key exposure, PALADIN, defense-in-depth, stochastic nature problem, alignment paradox, taxonomy of prompt injection attacks, AI agent systems, or local backlog metadata must fail closed as replay-corpus proof.

Passing proof requires an AMC-owned replay manifest, fixture hash, fixed seed, source refs, baseline run ID, candidate run ID, score delta, signed evidence refs, Score/Shield/Watch surface coverage, and CI receipt.

## No-bloat boundary

No prompt-injection paper importer, DOI importer, MDPI importer, OpenAlex importer, paper parser, attack prompt dataset, exploit example mirror, incident-row importer, defense-table mirror, RAG poisoning simulator, MCP attack runner, Copilot incident adapter, ChatGPT example adapter, OWASP mapping subsystem, PALADIN implementation, prompt-injection benchmark mirror, red-team pack, source-specific replay corpus module, source-specific metric lens, Watch monitor, Shield verifier, public methodology version bump, API route, CLI command, Studio panel, package dependency, or diagnostic question-bank migration was added.

No MDPI article prose, paper tables, figures, attack prompts, exploit instructions, incident rows, defense tables, benchmark outputs, RAG examples, MCP examples, Copilot details, ChatGPT examples, PALADIN details, repository code, configs, datasets, prompts, or generated outputs were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0959PromptInjectionReplayCorpusBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0958LaminarStudioDrilldownBoundary.test.ts tests/gap0959PromptInjectionReplayCorpusBoundary.test.ts --reporter=dot` passed, 2 files / 9 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
