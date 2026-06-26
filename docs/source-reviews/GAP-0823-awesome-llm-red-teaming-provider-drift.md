# GAP-0823 - Awesome LLM Red Teaming provider-drift boundary

- Gap: `GAP-0823`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `user1342/Awesome-LLM-Red-Teaming`, `https://github.com/user1342/Awesome-LLM-Red-Teaming`
- Retrieval: `2026-06-21` via GitHub connector README.md and LICENSE fetch plus live `curl -I --max-time 12 https://github.com/user1342/Awesome-LLM-Red-Teaming`, which returned HTTP/2 200.
- Status: closed through existing provider-drift benchmark receipts; no awesome-list importer, red-team catalog mirror, jailbreak runner, provider wrapper, or source-specific drift adapter added.

## Live source metadata

The reachable GitHub README.md identifies `Awesome LLM Red Teaming` and the section `LLM Red Teaming Resources by Technical Function`. Source-review signals include Playgrounds and practice targets, Red teaming frameworks and agent harnesses, Attack generation and jailbreak toolkits, Defences, standards and guardrails to test against, Bug bounties and programmes, Folly, PyRIT, OWASP Top 10 for LLMs, and other curated red-teaming resources. The fetched LICENSE identifies the MIT License.

These facts are provider-drift context only. No upstream links list, README prose beyond short metadata facts, badges, images, examples, tool descriptions, attack recipes, challenge details, code, prompts, configs, datasets, screenshots, or generated outputs were copied into AMC.

## Relevance decision

This source is relevant to AMC because red-team and jailbreak resources are a useful context for provider/model drift canaries: a provider update can change refusal rate, invalid-action rate, latency, cost, guardrail pass rate, or score distribution while an old AMC finding stays stale. GAP-0823 maps to AMC's existing provider-drift benchmark primitive rather than to a curated-list adapter.

Before a provider/model drift claim can pass, AMC-owned evidence must include provider version, canary results, drift statistic, alert or waiver, signed evidence refs, evaluation framework proof, observability pipeline proof, replayable eval-pack rows, CI gate proof, source refs, and no-copy proof. GitHub reachability, README labels, license labels, topic tags, star counts, red-team resource labels, tool names, or awesome-list membership are metadata only and must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider-drift score distributions, canary rows, eval packs, and CI gate proof. |
| Shield | Relevant because red-team/jailbreak context must fail closed unless signed drift proof supports the assurance claim. |
| Watch | Relevant through provider-drift alerts, drift statistics, and alert or waiver evidence. |
| Enforce | No runtime red-team policy, jailbreak guardrail, provider route, or circuit breaker changed. |
| Vault | No challenge data, prompts, secrets, attack payloads, or secure-storage behavior changed. |
| Fleet | Red-team agent-harness context only; no fleet topology or orchestration changed. |
| Passport | No portable trust token or proof-bundle schema changed. |
| Comply | Security context only; no compliance framework mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, provider wrapper, awesome-list importer, red-team catalog mirror, jailbreak runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0823.

The focused regression exercises the existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, Watch alert projection, and CI gate path. The positive path requires provider version, canary results, drift statistic, signed evidence, eval-pack rows, observability proof, and CI gate proof. The negative path fails closed when repository metadata replaces AMC-owned provider-drift evidence.

## Fail-closed rule

Repository URL, GitHub HTTP/2 200 reachability, README.md, LICENSE, MIT License, `Awesome LLM Red Teaming`, `LLM Red Teaming Resources by Technical Function`, Playgrounds and practice targets, Red teaming frameworks and agent harnesses, Attack generation and jailbreak toolkits, Defences, standards and guardrails to test against, Bug bounties and programmes, Folly, PyRIT, OWASP Top 10 for LLMs, local backlog metadata, or source identity alone must fail closed for provider/model drift claims. Passing evidence requires AMC-owned provider version, canary results, drift statistic, alert or waiver, signed evidence refs, evaluation framework proof, observability pipeline proof, replayable eval-pack rows, CI gate proof, source refs, and no-copy proof.

## No-bloat boundary

No awesome-list importer, red-team catalog mirror, jailbreak runner, playground adapter, PyRIT wrapper, OWASP importer, resource scraper, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream links list, README prose beyond short metadata facts, badges, images, examples, tool descriptions, attack recipes, challenge details, code, prompts, configs, datasets, screenshots, or generated outputs were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0823AwesomeLlmRedTeamingProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
