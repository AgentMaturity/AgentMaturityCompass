# GAP-0983 - AI-Infra-Guard public-methodology boundary

- Gap: `GAP-0983`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository page at `https://github.com/Tencent/AI-Infra-Guard`, GitHub API record at `https://api.github.com/repos/Tencent/AI-Infra-Guard`, raw README at `https://raw.githubusercontent.com/Tencent/AI-Infra-Guard/main/README.md`, and raw license at `https://raw.githubusercontent.com/Tencent/AI-Infra-Guard/main/LICENSE`
- Retrieval: `2026-06-24` live source review through the web research channel, GitHub API inspection, and terminal HTTP checks. The GitHub page opened as a Public repository; GitHub API returned live metadata; raw README and LICENSE returned `HTTP/2 200`.
- Status: Done - skipped as public-methodology implementation evidence; no public methodology version bump, badge method change, diagnostic methodology versioning change, AI-Infra-Guard importer, OpenClaw integration, scanner integration, jailbreak-eval runner, MCP scanner, or source-specific public methodology path added.
- Linear: `AMC-1262`

## Live source metadata

The live GitHub page identifies `Tencent/AI-Infra-Guard` as a Public repository with 1,577 commits and Apache-2.0 license metadata. The GitHub API identifies the description as a full-stack AI Red Teaming platform securing AI ecosystems via OpenClaw Security Scan, Agent Scan, Skills Scan, MCP scan, AI Infra scan, and LLM jailbreak evaluation.

GitHub API metadata returned `archived` false, `disabled` false, default branch `main`, language Python, Apache-2.0 license, stargazers_count `3970`, forks_count `383`, open_issues_count `10`, watchers_count `3970`, created_at `2024-12-25T06:39:30Z`, pushed_at `2026-06-24T08:43:51Z`, and updated_at `2026-06-24T08:29:53Z`. Topics include agent, agent-security, ai-infra, ai-red-teaming, ai-security, llm, llm-evaluation, llm-jailbreak, llm-security, mcp-scan, openclaw-security, prompt-injection, prompt-security, scanner, security, security-tools, skill-scanner, skills-security, and vulnerability.

Relevant source-review signals include AI Red Teaming, OpenClaw Security Scan, Agent Scan, Skills Scan, MCP scan, AI Infra scan, LLM jailbreak evaluation, Prompt Security updates, agent red-team skills, AI framework vulnerability scanning, MCP Server and Agent Skills scan, AI infra vulnerability scan, 1600 known CVE coverage claims, modern web interface, API documentation, and the README warning that the project lacks an authentication mechanism and should not be deployed on public networks.

No upstream code, README prose beyond short metadata facts, docs prose, PDFs, reports, vulnerability rules, CVE/GHSA datasets, scanner signatures, jailbreak datasets, prompts, attack operators, Docker files, API specs, UI assets, screenshots, generated outputs, model responses, exploit content, or implementation details were copied into AMC.

## Relevance decision

AI-Infra-Guard is relevant to AMC only as public-methodology context. Its security and red-team coverage claims are a useful reminder that public trust claims require methodology version, changelog, deprecation notice, migration guidance, known limitations, evidence taxonomy, signed evidence, replayable eval rows, and regression thresholds.

It does not justify changing AMC public scoring semantics in this slice. The source is active and security-relevant, but the live review found no AMC-owned scoring formula, evidence taxonomy, badge semantics, diagnostic question bank, public API, CLI behavior, or user-visible methodology behavior change. AI-Infra-Guard source metadata alone cannot justify a public methodology version bump.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant as public-methodology context only; no Score formula, score category, evidence taxonomy, or public scoring semantics changed. |
| Shield | Relevant as red-team/security context only; no Shield verifier or scanner integration changed. |
| Enforce | No runtime policy, scanner, jailbreak evaluator, MCP verifier, or circuit breaker changed. |
| Vault | No vulnerability rules, scan targets, prompts, attack datasets, credentials, or secure-storage behavior changed. |
| Watch | Relevant only as methodology transparency context for red-team claims; no Watch monitor changed. |
| Fleet | No scanner orchestration, agent topology, or fleet evidence changed. |
| Passport | No portable proof-bundle field changed. |
| Comply | No compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed.

The closure is a no-bloat public-methodology relevance decision. AI-Infra-Guard metadata stays source-review context only; AMC public methodology should change only when AMC-owned score semantics, evidence taxonomy, methodology limitations, migration guidance, or badge assurance actually change.

No public methodology version bump was made.

## Fail-closed rule

GitHub repository reachability, Public repository status, star/fork/issue/watch counts, Apache-2.0 license metadata, Python language metadata, README labels, AI Red Teaming labels, OpenClaw Security Scan labels, Agent Scan labels, Skills Scan labels, MCP scan labels, AI Infra scan labels, LLM jailbreak evaluation labels, Prompt Security labels, CVE/GHSA coverage labels, scanner labels, lack-of-authentication warning, local backlog metadata, or source identity alone cannot prove AMC public methodology versioning.

Passing public-methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, known limitations, evidence taxonomy, source-review/no-copy boundary, and an actual public scoring, diagnostic, badge, API, CLI, or user-visible methodology semantic change.

## No-bloat boundary

No AI-Infra-Guard importer, OpenClaw integration, security scanner integration, Agent Scan integration, Skills Scan integration, MCP scanner, AI infra scanner, jailbreak-eval runner, vulnerability-rule importer, CVE/GHSA dataset importer, prompt-security operator importer, ClawHub skill integration, Docker deployment path, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, package dependency, methodology version bump, or source-specific public methodology path was added.

No upstream code, README prose beyond short metadata facts, docs prose, PDFs, reports, vulnerability rules, CVE/GHSA datasets, scanner signatures, jailbreak datasets, prompts, attack operators, Docker files, API specs, UI assets, screenshots, generated outputs, model responses, exploit content, or implementation details were copied.

## Verification

- Expected-red regression: `npx vitest run tests/gap0983AiInfraGuardPublicMethodologyBoundary.test.ts --reporter=dot` failed before this document existed, with 1 implementation guard passing and 2 missing-document assertions failing.
- Focused regression: `npx vitest run tests/gap0983AiInfraGuardPublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
- Paired regression: `npx vitest run tests/gap0982CognitaPublicMethodologyBoundary.test.ts tests/gap0983AiInfraGuardPublicMethodologyBoundary.test.ts --reporter=dot` passed, 2 files / 6 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 830 files / 7,316 tests.
