# GAP-0753 - ImpReSS replay-corpus unavailable-source boundary

- Gap: `GAP-0753`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7133312535`, DOI `10.1145/3742413.3789151`, and title `ImpReSS: Designing and Evaluating a Lightweight Implicit Recommender System in Conversational Support Agents`
- Retrieval: `2026-06-21` via browser search and direct ACM DOI attempt; exact-title and DOI searches returned no primary result in this environment, and `https://dl.acm.org/doi/10.1145/3742413.3789151` returned `403`. Shell network remains DNS-restricted in this environment.
- Status: closed through existing eval replay corpus receipts; no ImpReSS recommender, conversational support-agent workflow, personalization engine, or benchmark mirror added.

## Live source metadata

The local backlog identifies a paper titled `ImpReSS: Designing and Evaluating a Lightweight Implicit Recommender System in Conversational Support Agents`, DOI `10.1145/3742413.3789151`, OpenAlex work `W7133312535`, improvement dimension replayable benchmark corpus, category `Agent evaluation and benchmarks`, and concepts including recommender system, personalization, context, human-computer interaction, relevance, product, and purchasing. The backlog abstract snippet frames the source around LLM-powered AI agents transforming customer support. Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title and DOI searches returned no primary result in this environment, and the ACM DOI page returned `403`.

These metadata facts are relevant to AMC as replayable benchmark corpus context only. Conversational recommender and support-agent claims need rerunnable evidence with replay manifests, fixture hashes, fixed seeds, score deltas, CI receipts, signed evidence rows, source refs, and no-copy proof. They do not justify importing ImpReSS, copying recommender data, mirroring product-support scenarios, adding a personalization engine, or claiming support-agent recommendation parity. No upstream paper prose, abstract text beyond local backlog metadata, recommender datasets, product catalogs, support transcripts, prompts, model outputs, figures, tables, benchmark rows, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0753 is relevant to AMC through the existing eval replay corpus receipt path because replayability is the right way to prove that support-agent recommendation score deltas can be reproduced. The accepted AMC primitives are already `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt`.

The source can be retained only as context when AMC-owned replay rows include a manifest hash, fixture hash, fixed seed, input/expected hashes, baseline/candidate run IDs, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof. DOI/OpenAlex/title metadata, recommender labels, personalization labels, product labels, purchasing labels, HCI labels, or support-agent labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replay corpus score deltas and fixture-bound manifests for support-agent recommendation comparisons. |
| Shield | Relevant through fail-closed handling for missing signed rows, copied recommender artifacts, or metadata-only benchmark evidence. |
| Watch | Relevant through CI/lifecycle receipts that show replay evidence remains reproducible over time. |
| Enforce | No runtime recommendation policy, personalization policy, or support-agent routing behavior changed. |
| Vault | No product catalogs, support transcripts, user profiles, prompts, outputs, or secure-storage behavior changed. |
| Fleet | Conversational support-agent context only; no recommender orchestration or simulator added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Support/recommender research context only; no compliance mapping changed. |

## Product closure

GAP-0753 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing replay corpus primitives. The positive path proves that ImpReSS-style conversational recommender context can be cited only with AMC-owned replay fixtures and signed evidence. The negative path proves DOI/OpenAlex/title/support-agent metadata fails closed.

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, ImpReSS recommender, personalization engine, product recommender, conversational support-agent simulator, product-catalog importer, support-transcript importer, ACM importer, OpenAlex importer, paper parser, or scoring behavior changed for GAP-0753.

## Fail-closed rule

OpenAlex work ID, DOI, title, ImpReSS labels, recommender-system labels, personalization labels, context labels, product labels, purchasing labels, support-agent labels, conversational-agent labels, HCI labels, relevance labels, ACM labels, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, input/expected hashes, baseline/candidate run ids, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No ImpReSS recommender, personalization engine, product recommender, conversational support-agent simulator, product-catalog importer, support-transcript importer, user-profile importer, prompt importer, output importer, benchmark mirror, ACM importer, OpenAlex importer, paper parser, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, recommender datasets, product catalogs, support transcripts, prompts, model outputs, figures, tables, benchmark rows, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0753ImpressReplayCorpusUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
