# GAP-0677 — Agentic Security public-methodology boundary

- Gap: `GAP-0677`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/msoedov/agentic_security`
- Retrieval: `2026-06-21` via browser access to the live GitHub repository page; shell network remains DNS-restricted in this environment.
- Status: skipped as AMC public-methodology evidence; no methodology version bump or product code change.

## Live source metadata

The live GitHub page identifies `msoedov/agentic_security` as a public Agentic Security repository on branch `main`, with Apache-2.0 license, `1.9k stars`, `265 forks`, `45 issues`, `25 pull requests`, `702 commits`, `19 releases`, latest release `0.7.5` on `Jun 3, 2026`, and `Python 99.3%` language share. The page presents it as an LLM/agent workflow vulnerability scanner and AI red-team kit, with repository topics including `agent-security`, `ai-red-team`, `llm-security`, `llm-fuzzing`, `llm-guardrails`, `llm-scanner`, and `llm-jailbreaks`.

These facts identify the source and security-testing context only. No upstream code, README prose beyond short metadata facts, CLI examples, config samples, scan outputs, dataset names, prompt content, screenshots, docs text, issue data, release assets, package metadata, or implementation details were copied into AMC.

## Relevance decision

Agentic Security is relevant to AMC as external source-review context for LLM security testing, red-team scanning, fuzzing, guardrails, and jailbreak evaluation. That context maps to Score, Shield, and Watch only when AMC already has its own versioned methodology receipts, signed evidence, row hashes, thresholds, changelog, deprecation notice, migration guidance, badge/report binding, and no-copy proof.

The gap dimension is public methodology versioning. The live repository does not define an AMC scoring-methodology version, question-bank migration, L0-L5 threshold migration, badge comparability rule, Shield methodology version, Watch drift methodology, deprecation notice, or AMC migration guidance. Agentic Security repository metadata alone must fail closed for AMC public methodology claims.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Security-evaluation context only; no accepted public scoring-methodology proof. |
| Shield | Relevant as red-team and guardrail context, but not as a Shield methodology version or scanner integration. |
| Watch | Relevant as potential drift/security-monitoring context, but not as a Watch methodology version or monitor integration. |
| Enforce | No runtime policy, circuit-breaker, or guardrail-enforcement behavior changed. |
| Vault | No secret, prompt dataset, scan result, or private vulnerability storage feature. |
| Fleet | No agent orchestration, scanner fleet, or multi-agent red-team workflow implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No compliance, certification, or regulated-domain mapping. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, Shield runner, Watch monitor, or scoring code changed for GAP-0677. Existing AMC public-methodology primitives remain the only path for a public methodology claim: methodology id/version/hash, changelog, deprecation notice, migration guidance, validation proof, badge/report binding, signed evidence refs, row hashes, and no-copy proof.

## Fail-closed rule

GitHub repository metadata, stars, forks, issues, pull requests, release labels, commit counts, Apache-2.0 license, branch names, language percentages, topic tags, scanner labels, red-team-kit labels, fuzzing labels, guardrail labels, local backlog metadata, or source identity alone must fail closed for public methodology claims. Passing evidence requires AMC-owned methodology versioning receipts, versioned scoring rules, changelog rows, migration guidance, validation artifacts, signed evidence refs, row hashes, badge assurance, report binding, and no-copy proof.

## No-bloat boundary

No Agentic Security scanner integration, red-team kit wrapper, fuzzer adapter, jailbreak dataset importer, prompt loader, scan-output parser, CLI command, API route, Studio panel, Shield runner, Watch monitor, benchmark runner, methodology version bump, diagnostic question-bank migration, Passport field, compliance mapping, package dependency, or source-specific scoring path was added. No upstream code, README prose, CLI examples, config samples, scan outputs, dataset names, prompt content, screenshots, docs text, issue data, release assets, package metadata, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0677AgenticSecurityPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
