# GAP-1009 - VoltAgent awesome-ai-agent-papers provider-drift boundary

- Gap: `GAP-1009`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: live GitHub repository/API at `https://github.com/VoltAgent/awesome-ai-agent-papers`, GitHub repository API at `https://api.github.com/repos/VoltAgent/awesome-ai-agent-papers`, raw README at `https://raw.githubusercontent.com/VoltAgent/awesome-ai-agent-papers/main/README.md`, raw contributing guide at `https://raw.githubusercontent.com/VoltAgent/awesome-ai-agent-papers/main/CONTRIBUTING.md`, raw license at `https://raw.githubusercontent.com/VoltAgent/awesome-ai-agent-papers/main/LICENSE`, latest-release API, main-branch commit API, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through GitHub repository API, raw GitHub content, main-branch commit API, latest-release API, and local backlog metadata.
- Status: Done
- Linear: `AMC-1288`

## Live source metadata

The GitHub API identifies `VoltAgent/awesome-ai-agent-papers` as a public repository with description `A curated collection of AI agent research papers released in 2026, covering agent engineering, memory, evaluation, workflows, and autonomous systems.`, homepage `https://github.com/VoltAgent/voltagent`, MIT License metadata, default branch `main`, no primary language, 1,457 stars, 161 forks, 6 open issues, watchers_count `1457`, created_at `2026-02-10T10:58:31Z`, pushed_at `2026-05-25T07:32:17Z`, and updated_at `2026-06-24T09:01:27Z`. Topics include ai-agents, awesome, awesome-list, llm, llm-agents, memory, rag, and research-paper.

The main branch commit API verified HEAD `d467d6417ca0665f36061cf4c6824d72a670b930`, committed_at `2026-05-25T07:32:17Z`, and a verified GitHub merge commit. The content API listed `.gitignore`, `CONTRIBUTING.md`, `LICENSE`, and `README.md`. The README metadata reports README size `168040` and README sha `8c8fa7d6b013fdfadb019f8e26f512ed77fbfef5`; `CONTRIBUTING.md` sha is `cf8ced045c3d7a71695987cb81df1e97a3d3ca6d`; `LICENSE` sha is `5cea5d78a41df83eafe1fb9fc0710675a5b7acf6`.

The GitHub latest-release API returned 404, so there is no latest release to rely on for this source-review closure.

Relevant README source-review signals include an AI-agent paper list published in 2026 and sourced from arXiv, category labels `Multi-Agent (53)`, `Memory & RAG (57)`, `Eval & Observability (80)`, `Agent Tooling (95)`, and `AI Agent Security (82)`. The README also states the list is curated and says the maintainers do not audit, endorse, or guarantee the correctness of listed research.

No README prose beyond short metadata facts, paper rows, paper titles, abstracts, arXiv rows, badges, images, examples, contribution text, license text beyond license identity, paper summaries, prompts, benchmark rows, datasets, figures, screenshots, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-1009 is relevant to AMC only through existing provider/model drift benchmark receipts. A curated list of agent evaluation, observability, security, memory, RAG, tooling, and multi-agent papers can explain why provider and model updates need recurring canaries, but it is not provider-drift proof by itself.

The accepted AMC primitive already exists: `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate`. Valid proof requires provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI/lifecycle gate proof, source refs, and no-copy proof. GitHub metadata, README category counts, arXiv links, paper summaries, license metadata, and source identity alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned provider canary score rows, metric suites, thresholds, and replayable eval-pack rows. |
| Shield | Relevant when provider drift changes refusal, invalid-action, guardrail, security-topic, or evaluator-coverage outcomes. |
| Enforce | Not changed. No runtime policy, provider router, model router, paper crawler, or circuit breaker changed. |
| Vault | Not changed. No private corpus, credential, paper cache, artifact store, or data residency behavior changed. |
| Watch | Relevant through existing Watch provider-drift alerts, drift statistics, and CI/lifecycle gate receipts. |
| Fleet | Curated multi-agent research can inform fleet risk review, but no Fleet topology or orchestration behavior changed. |
| Passport | Existing provider-drift receipts can feed proof bundles, but no Passport schema changed. |
| Comply | License and research context only; no compliance mapping changed. |

## Product closure

No product code changed. The focused regression proves existing provider-drift primitives can accept VoltAgent awesome-list context only when AMC has signed canary rows, provider/model versions, metric suites, evaluator hashes, generated test data, trace exports, dataset hashes, observability proof, thresholds, and CI gate evidence.

The positive path produces a replayable provider-drift eval pack and passes the CI gate without Watch alerts. The negative path fails closed when GitHub repository metadata, README metadata, category labels, arXiv metadata, contribution metadata, license metadata, topic labels, and source identity replace AMC-owned signed canary proof.

## Fail-closed rule

VoltAgent repository identity, GitHub star/fork/issue/watcher counts, default-branch SHA, verified merge metadata, README sha, README size, MIT License label, no-primary-language metadata, topic labels, `.gitignore`, `CONTRIBUTING.md`, `LICENSE`, `README.md`, category counts, arXiv labels, published-in-2026 labels, local backlog metadata, or source identity alone cannot prove provider/model drift.

A provider/model drift claim must fail closed unless provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, evaluator config hash, generated test data hash, trace export hash, metric report hash, threshold config, row hashes, CI or lifecycle receipt, Watch alert projection, source refs, and no-copy proof exist.

## No-bloat boundary

No VoltAgent integration, awesome-list mirror, paper importer, arXiv crawler, README parser, badge parser, category counter, paper recommendation engine, provider wrapper, model router, benchmark runner, eval harness clone, dataset importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific provider-drift subsystem was added.

No upstream code, README prose beyond short metadata facts, contribution prose beyond short metadata facts, license text beyond license identity, paper rows, paper titles, abstracts, arXiv rows, badges, images, examples, datasets, benchmark rows, metric rows, screenshots, figures, generated outputs, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap1009VoltAgentAwesomeAiAgentPapersProviderDriftBoundary.test.ts --reporter=dot` failed before this document existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-1009-voltagent-awesome-ai-agent-papers-provider-drift.md'`; 3 provider-drift primitive tests passed.
- Live source retrieval:
  - `curl -fsSL https://api.github.com/repos/VoltAgent/awesome-ai-agent-papers`
  - `curl -fsSL https://api.github.com/repos/VoltAgent/awesome-ai-agent-papers/readme`
  - `curl -fsSL 'https://api.github.com/repos/VoltAgent/awesome-ai-agent-papers/contents?ref=main'`
  - `curl -fsSL https://api.github.com/repos/VoltAgent/awesome-ai-agent-papers/commits/main`
  - `curl -fsSL https://api.github.com/repos/VoltAgent/awesome-ai-agent-papers/releases/latest`
  - `curl -fsSL https://raw.githubusercontent.com/VoltAgent/awesome-ai-agent-papers/main/README.md | rg -n "^#|Research Papers|Last Update|Multi-Agent|Memory & RAG|Eval & Observability|Agent Tooling|AI Agent Security|published in 2026|arXiv|CONTRIBUTING|MIT License|do not audit|guarantee"`
- Focused regression: `npx vitest run tests/gap1009VoltAgentAwesomeAiAgentPapersProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0994BeirProviderDriftBoundary.test.ts tests/gap1009VoltAgentAwesomeAiAgentPapersProviderDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed; narrow token scan over provider-drift implementation files found no GAP-1009 VoltAgent identifiers.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 856 files / 7,414 tests.
