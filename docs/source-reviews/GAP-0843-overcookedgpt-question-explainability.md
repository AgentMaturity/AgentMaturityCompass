# GAP-0843 - OvercookedGPT question-explainability boundary

- Gap: `GAP-0843`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `BladeTransformerLLC/OvercookedGPT`, `https://github.com/BladeTransformerLLC/OvercookedGPT`
- Retrieval: `2026-06-21` via live GitHub page, GitHub REST API, README API, license API, and shell header checks. Repository URL returned HTTP/2 200. api.github.com repository metadata returned `stargazers_count` 73, language Python, MIT License metadata, and description metadata for an OpenAI gym environment evaluating GPT-4, Claude, long-horizon reasoning, task planning, and dynamic multi-agent settings. README.md and LICENSE API lookups succeeded.
- Status: closed through existing question-level score explainability receipts; no OvercookedGPT integration, OpenAI gym runner, GPT-4/Claude wrapper, game simulator, in-context learning runner, CoT/PAL prompt path, multi-agent simulation adapter, API route, CLI command, Studio panel, or source-specific question explainability path added.

## Live source metadata

The live README identifies the project as OvercookedGPT (WIP). Relevant source-review signals include OpenAI gym, GPT-4, Claude, long-horizon reasoning, task planning, dynamic multi-agent settings, gym-cooking, in-context learning, CoT, PAL, GPT-3.5-Turbo, multi-agent simulation, Python, README.md, LICENSE, MIT License metadata, and `stargazers_count` 73.

These facts are question-explainability context only. They do not authorize copying upstream Python code, README prose beyond minimal metadata facts, prompts, game levels, task queues, simulation traces, videos, screenshots, model configs, environment wrappers, examples, generated plans, generated actions, evaluation rows, or implementation details into AMC.

## Relevance decision

GAP-0843 is relevant to AMC because multi-agent planning benchmarks can make a maturity score hard to trust unless each L0-L5 question exposes why it moved, which evidence was accepted, which evidence was rejected, and what repair hint would close the missing gate. The source maps to AMC's existing question-level score explainability primitive: question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.

It does not require an OvercookedGPT runner, OpenAI gym environment, GPT-4 or Claude wrapper, game simulator, in-context learning engine, CoT/PAL prompt path, multi-agent simulation adapter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport change, or public methodology version bump. Repository metadata can explain why question-level explainability matters for dynamic multi-agent planning, but it cannot replace AMC-owned question evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question ID, accepted evidence IDs, rejected evidence reasons, repair hints, row hashes, and thresholds. |
| Shield | Relevant because metadata-only multi-agent benchmark claims fail closed without signed question evidence and rejected-evidence reasons. |
| Watch | Context only; no Watch monitor changed, but source refs can appear in question-explainability receipts. |
| Enforce | No runtime policy, planning guardrail, game-action policy, or circuit breaker changed. |
| Vault | No prompts, traces, model keys, game states, screenshots, examples, or secure-storage behavior changed. |
| Fleet | Multi-agent benchmark context only; no orchestration topology, simulation runtime, or fleet trust graph changed. |
| Passport | No portable proof-bundle field, badge semantics, or Passport artifact changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, OvercookedGPT integration, OpenAI gym runner, GPT-4/Claude wrapper, game simulator, in-context learning runner, CoT/PAL prompt path, multi-agent simulation adapter, diagnostic question bank, methodology version, or scoring semantics changed for GAP-0843.

The focused regression exercises the existing `buildQuestionExplainabilityReport` path. The positive path requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, row hashes, and source refs. The negative path fails closed when source metadata replaces AMC-owned question-score evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, api.github.com repository metadata, README.md presence, LICENSE presence, MIT License metadata, `stargazers_count` 73, Python label, OpenAI gym label, GPT-4 label, Claude label, long-horizon reasoning label, task planning label, dynamic multi-agent settings label, gym-cooking label, in-context learning label, CoT label, PAL label, GPT-3.5-Turbo label, multi-agent simulation label, local backlog metadata, or source identity alone must fail closed for question-level score explainability.

Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, row hashes, source refs, and no-copy proof.

## No-bloat boundary

No OvercookedGPT integration, OpenAI gym runner, GPT-4 wrapper, Claude wrapper, game simulator, in-context learning runner, CoT prompt path, PAL prompt path, multi-agent simulation adapter, repository importer, benchmark mirror, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream Python code, README prose beyond minimal metadata facts, prompts, game levels, task queues, simulation traces, videos, screenshots, model configs, environment wrappers, examples, generated plans, generated actions, evaluation rows, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0843OvercookedGptQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; 3 question-explainability behavior tests passed.
- Focused regression after doc addition: `npx vitest run tests/gap0843OvercookedGptQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0842GraphRagBenchPublicMethodologyBoundary.test.ts tests/gap0843OvercookedGptQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
