# GAP-0916 - AISecLists public-methodology boundary

- Gap: `GAP-0916`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `SecNode/AISecLists`, `https://github.com/SecNode/AISecLists`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed the `main` branch, Star 8, Fork 2, Issues 0, Pull requests 0, 17 Commits, README.md, repository folders `Guardrail Jailbreak` and `Prompt Extraction`, No releases published, Packages 0, No packages published, and Contributors 2.
- Status: Done - skipped as public-methodology implementation evidence

## Live source metadata

The live repository description identifies AISecLists as an AI Red Teaming Arsenal with curated prompt lists for LLM jailbreaks, prompt injection, information disclosure, and related AI security assessments. The README frames Offensive Security as non-negotiable for LLMs and AI and discusses AI Penetration Testing, AI Red-Teaming Exercises, Data Breaches, Model Inversion Attacks, Adversarial Inputs, Data Poisoning, Multimodal Threats, Intellectual Property Theft, Deployment Vulnerabilities, Regulatory Non-Compliance, Adversarial Training, Regular AI Redteaming, Secure APIs, and Monitor Systems in Real-Time.

Those facts are useful source-review context, but they do not change AMC public methodology versioning. AISecLists is a prompt-list and red-team resource repository, not an AMC scoring-methodology spec. AISecLists prompt-list metadata alone cannot justify a public methodology version bump, methodology version, changelog, deprecation notice, or migration guidance because it does not alter AMC scoring semantics, evidence taxonomy, badge semantics, maturity levels, diagnostic question bank, or public methodology contract.

No upstream prompts, jailbreak lists, prompt-extraction lists, red-team payloads, README prose beyond minimal metadata facts, examples, security assessment content, test cases, attack strings, screenshots, or implementation details were copied into AMC.

## Relevance decision

`GAP-0916` is relevant only as a public-methodology no-op and source-review boundary. AI red-team prompt-list context is useful for Shield and Watch threat reviews, but it does not provide an AMC-owned public scoring-methodology change.

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed. No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed; prompt-list metadata is not methodology-versioning proof. |
| Shield | Useful red-team source-review context, but no new Shield methodology claim changed. |
| Watch | No Watch methodology, monitoring, or drift behavior changed. |
| Enforce | No runtime policy changed. |
| Vault | No prompts, jailbreak payloads, security test cases, or prompt-extraction content stored. |
| Fleet | No multi-agent topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No product code changed. The focused regression documents the live source metadata and asserts that AISecLists metadata remains absent from AMC public methodology semantics and implementation modules.

This closure is a documented skip for implementation: AI Red Teaming Arsenal, LLM jailbreaks, prompt injection, information disclosure, Offensive Security, AI Penetration Testing, AI Red-Teaming Exercises, Data Breaches, Model Inversion Attacks, Adversarial Inputs, Data Poisoning, Multimodal Threats, Intellectual Property Theft, Deployment Vulnerabilities, Regulatory Non-Compliance, Adversarial Training, Regular AI Redteaming, Secure APIs, and Monitor Systems in Real-Time are not public methodology versioning evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Star 8, Fork 2, Issues 0, Pull requests 0, 17 Commits, folder names, No releases published, Packages 0, No packages published, Contributors 2, AI Red Teaming Arsenal labels, LLM jailbreaks labels, prompt injection labels, information disclosure labels, Offensive Security labels, AI Penetration Testing labels, AI Red-Teaming Exercises labels, Data Breaches labels, Model Inversion Attacks labels, Adversarial Inputs labels, Data Poisoning labels, Multimodal Threats labels, Intellectual Property Theft labels, Deployment Vulnerabilities labels, Regulatory Non-Compliance labels, Adversarial Training labels, Regular AI Redteaming labels, Secure APIs labels, Monitor Systems in Real-Time labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing public methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, evidence-taxonomy change, and scoring-semantics rationale.

## No-bloat boundary

No AISecLists adapter, prompt-list importer, jailbreak corpus, prompt-injection corpus, prompt-extraction corpus, red-team runner, AI security assessment catalog, Guardrail Jailbreak importer, Prompt Extraction importer, offensive security methodology module, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream prompts, jailbreak lists, prompt-extraction lists, red-team payloads, README prose beyond minimal metadata facts, examples, security assessment content, test cases, attack strings, screenshots, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0916AiSecListsPublicMethodologyBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the public-methodology implementation leakage check already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0916AiSecListsPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0915MineAnyBuildPublicMethodologyBoundary.test.ts tests/gap0916AiSecListsPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
