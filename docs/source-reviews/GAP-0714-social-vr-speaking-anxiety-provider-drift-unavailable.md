# GAP-0714 - Social VR speaking-anxiety provider-drift unavailable-source boundary

- Gap: `GAP-0714`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://doi.org/10.1145/3772318.3791068`, `https://openalex.org/W7154025559`
- Retrieval: `2026-06-21` via browser title search, DOI search, DOI redirect attempt, ACM DOI page attempt, and OpenAlex id search. No reachable primary source was available in this sandbox.
- Status: source unavailable; skipped as provider-drift implementation evidence.

## Retrieval notes

The backlog row identifies the paper as `LLM-based Embodied Conversational Agent for Reducing Foreign Language Speaking Anxiety in Social VR`, DOI `10.1145/3772318.3791068`, and OpenAlex id `W7154025559`. Browser searches for the exact title, DOI, OpenAlex id, and shorter title fragments did not surface a reachable primary source. The DOI redirect and ACM DOI page were not usable from this environment.

The available metadata suggests foreign-language speaking anxiety, embodied conversational agents, psychology, virtual agents, foreign language learning, virtual reality, and anxiety context. These labels may be adjacent to agent evaluation, but they do not provide a provider/model drift benchmark, canary protocol, model-version comparison, drift statistic, alert/waiver process, or signed replay evidence that AMC can adopt. No upstream abstract prose beyond local metadata facts, study materials, prompts, participant data, VR scenes, model outputs, screenshots, tables, statistics, datasets, code, or implementation details were copied into AMC.

## Relevance decision

Provider/model drift is relevant to AMC, but this source is not usable as provider-drift implementation evidence in this pass. The source is unavailable, and the backlog metadata does not establish an AMC-compatible provider/model drift benchmark. Foreign-language speaking anxiety, embodied-conversational-agent, social-VR, or psychology labels alone cannot justify a Score/Shield/Watch provider-drift product change.

Therefore GAP-0714 is closed as a documented skip. Existing AMC provider-drift primitives remain the only accepted path for this dimension: provider/model versions, canary results, evaluator proof, observability proof, drift statistic, signed evidence refs, eval-pack row hashes, Watch alert or waiver proof, CI gate receipts, and no-copy proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring behavior changed; metadata-only paper identity is rejected as provider-drift proof. |
| Shield | No Shield gate changed; missing signed evidence, evaluator proof, and observability proof must fail closed. |
| Watch | No Watch monitor changed; provider-drift alerts still require AMC-owned canary evidence. |
| Enforce | No runtime language-learning, VR, or conversational-agent policy changed. |
| Vault | No participant data, transcripts, prompts, VR assets, or secure-storage behavior changed. |
| Fleet | Social-VR agent context only; no fleet topology or multi-agent orchestration changed. |
| Passport | No portable proof bundle, credential, or badge field changed. |
| Comply | Psychology and human-study metadata only; no compliance mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/api/benchmarkRouter.ts`, `src/api/watchRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, embodied-conversational-agent adapter, social-VR simulator, language-learning evaluator, participant-study importer, DOI importer, OpenAlex importer, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0714.

The closure is a source-review boundary plus regression coverage. The focused test checks that metadata-only paper identifiers fail closed through the existing provider-drift engine and that no source-specific identifiers entered implementation modules.

## Fail-closed rule

Paper title, DOI, OpenAlex id, ACM labels, foreign-language speaking anxiety labels, embodied conversational agent labels, social-VR labels, psychology labels, virtual-agent labels, anxiety labels, title search results, local backlog metadata, or source identity alone must fail closed for provider/model drift claims. Passing evidence requires AMC-owned baseline and candidate provider/model versions, canary result hashes, evaluator config hashes, metric ids, generated test data hashes, trace exports, metric reports, drift statistics, alert or waiver proof, signed evidence refs, row hashes, CI gate receipts, and no-copy proof.

## No-bloat boundary

No embodied-conversational-agent adapter, social-VR simulator, VR scene importer, language-learning evaluator, speaking-anxiety scorer, participant-study importer, transcript loader, prompt importer, DOI importer, OpenAlex importer, ACM importer, benchmark mirror, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream abstract prose beyond local metadata facts, study materials, prompts, participant data, VR scenes, model outputs, screenshots, tables, statistics, datasets, code, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0714SocialVrProviderDriftUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
