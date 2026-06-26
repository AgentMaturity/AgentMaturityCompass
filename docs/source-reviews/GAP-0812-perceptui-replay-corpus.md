# GAP-0812 - PerceptUI replay-corpus boundary

- Gap: `GAP-0812`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2606.05697`, `https://openalex.org/W7163778420`
- Retrieval: `2026-06-21` via live arXiv/search and header checks. arXiv and OpenAlex headers returned HTTP 200; live search surfaced arXiv metadata and abstract summary.
- Status: closed through existing eval replay corpus receipts; no PerceptUI importer, synthetic-user evaluator, UI/UX benchmark runner, persona generator, or source-specific replay path added.

## Live source metadata

The reachable arXiv source identifies `PerceptUI: LLM Agents as Human-Aligned Synthetic Users for UI/UX Evaluation`, first submitted `Thu Jun  4 04:35:16 2026`, with authors Nicolas Bougie, Xiaotong Ye, Gian Maria Marconi, and Narimasa Watanabe. The local backlog maps this replay-corpus slice to OpenAlex work `W7163778420`.

Relevant source-review signals include persona-conditioned UI/UX evaluation, interface-related questions, natural-language rationales, contrastive reflection fine-tuning, teacher-generated rationales, human decisions, reflective prompt-evolution, failure traces, unseen questions and personas, and population-level response distributions. These are replay-corpus context only. No upstream personas, UI tasks, interface questions, rationales, prompts, reflection traces, failure traces, datasets, model outputs, response distributions, code, tables, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC as replayable benchmark-corpus context because synthetic-user UI/UX evaluation is an agent-evaluation setting where auditors would need replayable evidence before trusting Score/Shield/Watch claims. The correct AMC mapping is the existing replay-corpus evidence primitive: replay manifest, fixture hash, fixed seed, baseline and candidate run ids, score delta, CI receipt, signed evidence refs, source refs, row hashes, and Score/Shield/Watch surface coverage.

It does not justify importing PerceptUI, generating personas, copying UI/UX tasks, mirroring response distributions, adding a synthetic-user benchmark runner, changing public methodology, or adding API/CLI/Studio behavior. GAP-0812 is closed by documenting the source boundary and adding regression coverage that UI/UX synthetic-user context uses the existing generic `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` path. arXiv, OpenAlex, title, author list, PerceptUI label, persona label, rationale label, reflection label, or response-distribution metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replayable benchmark corpus manifests, fixture hashes, source refs, signed row evidence, and score deltas. |
| Shield | Relevant through fail-closed replay evidence before synthetic-user UI/UX evaluation claims are trusted. |
| Watch | Relevant through replay receipts that can be monitored as regression evidence for UI/UX evaluation canaries. |
| Enforce | No runtime UI policy, persona policy, or circuit breaker changed. |
| Vault | No personas, UI tasks, prompts, rationales, response distributions, or secure-storage behavior changed. |
| Fleet | Synthetic-user agent context only; no orchestration topology, persona generator, or UI evaluator added. |
| Passport | No portable proof-bundle field changed. |
| Comply | Human-alignment context only; no compliance mapping changed. |

## Product closure

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, PerceptUI integration, synthetic-user evaluator, persona generator, UI/UX benchmark runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0812.

The focused regression exercises the existing eval replay corpus engine with AMC-owned UI/UX fixture data. The positive path requires a replay manifest, fixture hash, fixed seed, source refs, baseline/candidate score delta, signed evidence, Score/Shield/Watch surface coverage, and CI-ready receipts. The negative path fails closed when arXiv/OpenAlex/title/PerceptUI/persona/rationale metadata replaces AMC-owned replay evidence.

## Fail-closed rule

Paper title, arXiv URL, OpenAlex id, author list, submission date, PerceptUI label, persona-conditioned UI/UX evaluation label, interface-related questions label, natural-language rationales label, contrastive reflection fine-tuning label, teacher-generated rationales label, human decisions label, reflective prompt-evolution label, failure traces label, unseen questions and personas label, population-level response distributions label, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, input/expected hashes, baseline and candidate run ids, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No PerceptUI importer, synthetic-user evaluator, persona generator, UI/UX benchmark runner, interface-question importer, rationale importer, reflection trace importer, failure trace importer, response-distribution importer, paper importer, OpenAlex importer, arXiv importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific replay path, or source-specific scoring path was added. No upstream personas, UI tasks, interface questions, rationales, prompts, reflection traces, failure traces, datasets, model outputs, response distributions, code, tables, figures, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0812PerceptUiReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
