# GAP-0980 - LLM-agent optimization survey public-methodology boundary

- Gap: `GAP-0980`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: OpenAlex work record at `https://openalex.org/W7125602480`, OpenAlex API record at `https://api.openalex.org/works/W7125602480`, DOI resolver at `https://doi.org/10.1145/3789261`, ACM landing URL at `https://dl.acm.org/doi/10.1145/3789261`, open access PDF URL at `https://arxiv.org/pdf/2503.12434`, and curated collection URL at `https://github.com/YoungDubbyDu/LLM-Agent-Optimization`
- Retrieval: `2026-06-24` live source review through terminal HTTP checks and OpenAlex API metadata inspection. OpenAlex API returned `HTTP/2 200`; the DOI returned `HTTP/2 302` to the ACM landing URL; the ACM landing URL returned `HTTP/2 403` with `cf-mitigated: challenge`, so ACM page body content was not used as methodology evidence.
- Status: Done - skipped as public-methodology implementation evidence; no public methodology version bump, badge method change, diagnostic methodology versioning change, survey importer, optimization catalog, curated collection importer, or source-specific public methodology path added.
- Linear: `AMC-1259`

## Live source metadata

The OpenAlex API identifies the source as `A Survey on the Optimization of Large Language Model-based Agents`, an `article` in ACM Computing Surveys from the Association for Computing Machinery, with DOI `https://doi.org/10.1145/3789261`, publication_year `2026`, publication_date `2026-01-24`, cited_by_count `4`, and open access status `green`. The OpenAlex open-access URL points to `https://arxiv.org/pdf/2503.12434`, and the reconstructed abstract metadata points to the curated collection at `https://github.com/YoungDubbyDu/LLM-Agent-Optimization`.

OpenAlex lists Shangheng Du, Jiabao Zhao, Jinxin Shi, Zhentao Xie, Xin Jiang, Yanhong Bai, and Liang He as authors. Relevant concept metadata includes Computer science, Reinforcement learning, Artificial intelligence, and Autonomous agent.

The source-review signal is a survey of LLM-agent optimization approaches. Its abstract metadata describes agent optimization for autonomous decision-making and interactive tasks, with parameter-driven methods and parameter-free methods. It specifically references fine-tuning-based optimization, reinforcement learning-based optimization, hybrid strategies, trajectory data construction, reward function design, prompt engineering, external knowledge retrieval, agent evaluation, applications, challenges, and future directions.

No ACM article text, arXiv PDF content, GitHub collection content, code, README prose beyond short metadata facts, tables, benchmark rows, datasets, prompts, examples, configs, screenshots, generated outputs, model responses, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC only as public-methodology context. The backlog asks for methodology version, changelog, deprecation notice, and migration guidance, but this live source review did not identify an AMC-owned change to scoring formulas, evidence taxonomy, badge semantics, diagnostic question bank, public API, CLI behavior, or user-visible methodology behavior.

AMC already has a versioned public methodology contract and badge/source-review boundaries. OpenAlex/DOI/ACM metadata alone cannot justify a public methodology version bump because a third-party survey does not itself change AMC's Score, Shield, or Watch semantics. Public methodology changes must be tied to an AMC-owned semantic change and migration path, not to source metadata.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant as public-methodology context only; no Score formula, score category, evidence taxonomy, or public scoring semantics changed. |
| Shield | Relevant when unsupported benchmark or optimization claims must fail closed; no Shield verifier changed. |
| Enforce | No runtime guardrail, policy enforcement, provider, optimization runner, or circuit breaker changed. |
| Vault | No dataset, prompt, article text, credential, or secure-storage behavior changed. |
| Watch | Relevant only as evaluation-methodology transparency context; no Watch monitor or evidence drilldown behavior changed. |
| Fleet | No orchestration, multi-agent lifecycle, routing, handoff, or fleet evidence changed. |
| Passport | No portable trust token, external proof-bundle field, or badge payload changed. |
| Comply | No EU AI Act, NIST, ISO, SOC2, or other compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed.

The product closure is a no-bloat public-methodology relevance decision. GAP-0980 is closed by documenting that survey metadata stays source-review context only. No public methodology version bump was made.

## Fail-closed rule

OpenAlex work identity, DOI reachability, ACM source identity, ACM Computing Surveys metadata, Association for Computing Machinery metadata, HTTP status codes, Cloudflare challenge headers, author lists, concept tags, open access status, arXiv PDF availability, curated collection URL, survey-topic labels, optimization labels, parameter-driven labels, parameter-free labels, or local backlog metadata cannot prove AMC public methodology versioning.

Passing public-methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, known limitations, evidence taxonomy, source-review/no-copy boundary, and an actual public scoring, diagnostic, badge, API, CLI, or user-visible methodology semantic change.

## No-bloat boundary

No survey importer, OpenAlex resolver, DOI resolver, ACM scraper, arXiv PDF importer, curated collection importer, optimization taxonomy, optimization catalog, fine-tuning module, reinforcement-learning module, prompt-engineering module, retrieval optimization module, agent-evaluation runner, public methodology version bump, diagnostic methodology versioning field, badge source-review notice, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, package dependency, or source-specific public methodology path was added.

No upstream article text, arXiv PDF content, GitHub collection content, code, README prose beyond short metadata facts, tables, benchmark rows, datasets, prompts, examples, configs, screenshots, generated outputs, model responses, or implementation details were copied.

## Verification

- Expected-red regression: `npx vitest run tests/gap0980LlmAgentOptimizationSurveyPublicMethodologyBoundary.test.ts --reporter=dot` failed before this document existed, with 1 implementation guard passing and 2 missing-document assertions failing.
- Focused regression: `npx vitest run tests/gap0980LlmAgentOptimizationSurveyPublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
- Paired regression: `npx vitest run tests/gap0979HeliconeStudioDrilldownBoundary.test.ts tests/gap0980LlmAgentOptimizationSurveyPublicMethodologyBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 827 files / 7,306 tests.
