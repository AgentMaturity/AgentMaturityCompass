# GAP-0844 - Circle Guard Bench public-methodology boundary

- Gap: `GAP-0844`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `whitecircle/circle-guard-bench`, `https://github.com/whitecircle/circle-guard-bench`
- Retrieval: `2026-06-21` via live GitHub page, GitHub REST API, README API, license API, and shell header checks. Repository URL returned HTTP/2 200. api.github.com repository metadata returned `stargazers_count` 70, language Python, Apache-2.0 license metadata, and topics including `guardrail`, `guardrails`, `jailbreak`, `llm-as-a-judge`, `llm-eval`, `llm-evaluation`, `llm-jailbreaks`, `llm-security`, and `safeguard`. README.md and LICENSE API lookups succeeded.
- Status: skipped as public-methodology implementation evidence; no public methodology versioning change was made.

## Live source metadata

The live README identifies CircleGuardBench - A full-fledged benchmark for evaluating protection capabilities of AI models. Relevant source-review signals include HuggingFace Leaderboard, HuggingFace Blogpost, protection capabilities, LLM guard systems, guardrails, safeguards, harmful content detection, 17 critical risk categories, jailbreak resistance, false positive rate, runtime performance, integral score, accuracy, speed, leaderboard output, model configuration, prompt templates, supported inference engines, and Python implementation context.

These facts are useful Shield and benchmark context, but they are not AMC public-methodology evidence. No upstream benchmark rows, harm-category data, prompts, prompt templates, jailbreak prompts, model configs, leaderboard rows, scoring code, dataset records, README prose beyond minimal metadata facts, HuggingFace data, screenshots, figures, outputs, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC as source-review context for public methodology versioning because guardrail and safety benchmarks can influence how users reason about Score, Shield, and Watch limitations. It does not justify changing AMC public scoring semantics by itself.

For a public methodology change to pass, AMC needs an AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations update, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, release lifecycle proof, and no-copy proof. Circle Guard Bench metadata alone cannot justify a public methodology version bump. GAP-0844 is therefore closed as a documented no-op: the source remains useful context, but No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; no scoring semantics changed because the source did not supply an AMC-owned methodology version/change record. |
| Shield | Strong safety benchmark context, but no Shield methodology or public score semantics changed without AMC-owned release proof. |
| Watch | Context only; no monitoring receipt or public methodology lifecycle event changed. |
| Enforce | No runtime guardrail, safeguard policy, jailbreak defense, or circuit breaker changed. |
| Vault | No prompts, benchmark rows, harmful-content records, model configs, or secure-storage behavior changed. |
| Fleet | Benchmark context only; no orchestration topology or multi-agent runner added. |
| Passport | No portable proof-bundle field, badge semantics, or public proof token changed. |
| Comply | Safety concept is context only; no compliance framework mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0844.

The focused regression verifies that GitHub/API/README/license/HuggingFace/guardrail/jailbreak/harm-category/leaderboard/runtime/performance/accuracy/speed metadata stays out of AMC public methodology semantics. No public methodology version bump, changelog update, deprecation notice, migration guidance, badge semantic change, API route, CLI command, or Studio change was added.

## Fail-closed rule

GitHub HTTP/2 200 reachability, api.github.com repository metadata, README.md presence, LICENSE presence, Apache-2.0 license metadata, `stargazers_count` 70, Python label, HuggingFace Leaderboard label, HuggingFace Blogpost label, protection capabilities label, LLM guard systems label, guardrails label, safeguards label, harmful content detection label, 17 critical risk categories label, jailbreak resistance label, false positive rate label, runtime performance label, integral score label, accuracy label, speed label, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing evidence requires AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations text, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, release lifecycle proof, and no-copy proof.

## No-bloat boundary

No Circle Guard Bench runner, guard benchmark importer, HuggingFace Leaderboard integration, HuggingFace dataset mirror, prompt-template importer, harm-category mapper, jailbreak prompt importer, model-config adapter, leaderboard renderer, scoring adapter, benchmark mirror, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Enforce guardrail, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific methodology path, or source-specific scoring path was added. No upstream benchmark rows, harm-category data, prompts, prompt templates, jailbreak prompts, model configs, leaderboard rows, scoring code, dataset records, README prose beyond minimal metadata facts, HuggingFace data, screenshots, figures, outputs, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0844CircleGuardBenchPublicMethodologyBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the implementation no-leakage check passed.
- Focused regression after doc addition: `npx vitest run tests/gap0844CircleGuardBenchPublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
- Paired regression: `npx vitest run tests/gap0843OvercookedGptQuestionExplainabilityBoundary.test.ts tests/gap0844CircleGuardBenchPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
