# GAP-0803 - Secure LLM agents provider-drift boundary

- Gap: `GAP-0803`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2606.10749`, DOI `10.48550/arxiv.2606.10749`, OpenAlex `W7164162217`
- Retrieval: `2026-06-21` via browser/search checks. The arXiv page was reachable; DOI and OpenAlex were retained as source references.
- Status: relevant only through existing provider/model drift benchmark receipts; no secure-agent survey, attack taxonomy, defense framework, provider adapter, or security benchmark added.

## Live source metadata

This is the same live source reviewed for GAP-0802, but GAP-0803 maps a different backlog dimension: provider/model drift. The reachable arXiv page identifies `Toward Secure LLM Agents: Threat Surfaces, Attacks, Defenses, and Evaluation`, first submitted `Tue Jun 9 12:01:07 2026`, with authors Yuchen Ling, Shengcheng Yu, Zhenyu Chen, and Chunrong Fang. This GAP-0803 row cites DOI `10.48550/arxiv.2606.10749` and OpenAlex work `W7164162217`.

Relevant source-review signals include a review of 247 papers, lifecycle-based framing, prompt injection, tool-mediated control-flow hijacking, persistent state, multi-agent propagation, delegated authority, privilege control, and trust-boundary risks. These facts are provider-drift context only. No upstream paper prose beyond short metadata facts, tables, threat taxonomies, attack examples, defense checklists, benchmark rows, prompts, figures, model outputs, code, or implementation details were copied into AMC.

## Relevance decision

Provider/model drift is relevant to AMC through Score, Shield, and Watch when a model/provider update can shift attack resistance, refusal behavior, privilege-control behavior, state integrity, guardrail pass rate, latency, or cost. GAP-0803 maps to the existing provider drift benchmark primitive only when the evidence includes provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, Watch alert, CI gate, and alert or waiver.

The source does not provide those receipts by itself. arXiv/OpenAlex/title/security-survey metadata can inform the canary theme, but it is not a canary result, not a provider-version comparison, not a drift statistic, not an alert, and not a waiver.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned provider-drift canary rows, provider versions, metrics, and replayable eval-pack rows. |
| Shield | Relevant only when unsupported secure-agent/model claims fail closed without signed drift evidence. |
| Watch | Relevant only through existing Watch alerts tied to drift statistics, CI gates, and waivers. |
| Fleet | Multi-agent propagation context only; no orchestration, multi-agent topology, or fleet policy changed. |
| Enforce | No runtime prompt-injection, tool-control, privilege, provider-routing, or circuit-breaker policy changed. |
| Vault | No persistent state, attack traces, prompts, state data, or secure-storage behavior changed. |
| Passport | No portable proof-bundle field, token, or external benchmark credential changed. |
| Comply | No compliance mapping changed from a security survey alone. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/api/benchmarkRouter.ts`, `src/api/watchRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version, badge semantics, diagnostic question bank, provider integration, model router, secure-agent survey subsystem, threat taxonomy, attack benchmark, or scoring behavior changed for GAP-0803. The closure is a source-review note plus regression coverage that exercises existing provider drift primitives: provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, Watch alerts, and CI gate behavior.

## Fail-closed rule

arXiv/OpenAlex/title/security-survey metadata alone must fail closed for provider and model drift claims. Source identity, DOI, author list, submission date, 247-paper count, lifecycle-based framing, prompt-injection labels, tool-mediated control-flow hijacking labels, persistent-state labels, multi-agent propagation labels, delegated-authority labels, privilege-control labels, trust-boundary labels, local backlog metadata, or generated gap wording are not enough to pass. Passing evidence requires AMC-owned baseline/candidate provider versions, canary rows, metric IDs, metric counts, generated test data hash, evaluator config hash, trace export hash, signed evidence refs, drift statistics, CI/lifecycle receipt, Watch alert or waiver, row hashes, and no-copy proof.

## No-bloat boundary

No secure-agent provider-drift adapter, security benchmark mirror, threat taxonomy importer, attack benchmark, defense framework, prompt-injection canary pack, tool-control hijacking simulator, persistent-state corruption model, multi-agent propagation workflow, paper importer, OpenAlex importer, arXiv importer, source-specific provider-drift lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, package dependency, methodology version bump, diagnostic question-bank migration, or source-specific scoring path was added. No upstream paper prose beyond short metadata facts, tables, threat taxonomies, attack examples, defense checklists, benchmark rows, prompts, figures, model outputs, code, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0803SecureLlmAgentsProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
