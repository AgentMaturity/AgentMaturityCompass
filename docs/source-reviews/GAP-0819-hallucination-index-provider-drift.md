# GAP-0819 - Hallucination Index provider-drift boundary

- Gap: `GAP-0819`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/rungalileo/hallucination-index`
- Retrieval: `2026-06-21` via GitHub connector fetch for `README.md`, GitHub connector lookup for `LICENSE`, and live GitHub header check.
- Status: closed through existing provider-drift receipts; no Hallucination Index importer, RAG benchmark runner, image parser, ranking mirror, or source-specific provider-drift path added.

## Live source metadata

GitHub source reviewed: `rungalileo/hallucination-index` at `https://github.com/rungalileo/hallucination-index`. A live `curl -I --max-time 12` check returned HTTP/2 200 for the repository page. The GitHub connector fetched `README.md`; LICENSE lookup returned 404.

The README identifies `LLM Hallucination Index - RAG Special`. Relevant source-review signals include Context Length, Open vs. Closed Source, Prompting Techniques, 22 models, 10 closed-source models, 12 open-source models, Short Context RAG, Medium and Long Context RAG, Chainpoll with GPT-4o, Context Adherence, and ChainPoll. These are provider-drift context only. No README tables, model rankings, images, RAG datasets, prompts, context chunks, needle questions, evaluation outputs, source methodology prose, scripts, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC as provider and model drift context because hallucination propensity, RAG context length, open/closed-source model comparison, context adherence, latency, and cost can shift when providers update model versions. The correct AMC mapping is the existing provider-drift benchmark primitive: provider version, canary results, drift statistic, signed evidence, replayable eval-pack rows, Watch alert, and CI alert or waiver.

It does not justify importing Hallucination Index data, copying rankings, mirroring RAG tasks, adding a Galileo integration, creating a ChainPoll runner, or changing public methodology. GAP-0819 is closed by documenting the source boundary and adding regression coverage that hallucination-index context uses the existing generic `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, and CI gate path. GitHub repository metadata, README text, model-count labels, Context Adherence label, or ChainPoll label alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider-drift score deltas, metric ids, and replayable eval-pack rows. |
| Shield | Relevant through fail-closed signed evidence, evaluation framework proof, and observability pipeline proof. |
| Watch | Relevant through provider-drift canary alerts and CI gates. |
| Enforce | No runtime routing policy, model pinning policy, or circuit breaker changed. |
| Vault | No prompts, RAG datasets, model outputs, images, or secure-storage behavior changed. |
| Fleet | Model/provider comparison context only; no fleet topology or routing layer added. |
| Passport | No portable proof-bundle field changed. |
| Comply | No compliance mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/api/benchmarkRouter.ts`, `src/api/watchRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Hallucination Index importer, Galileo integration, RAG benchmark runner, ChainPoll runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0819.

The focused regression exercises the existing provider-drift benchmark engine with AMC-owned hallucination/RAG-style canary rows. The positive path requires provider version, canary results, metric ids, drift statistics, source refs, signed evidence, replayable eval-pack rows, observability proof, and CI gate. The negative path fails closed when repository metadata replaces AMC-owned provider-drift proof.

## Fail-closed rule

Repository URL, owner/name, README title, Context Length label, Open vs. Closed Source label, Prompting Techniques label, 22 models label, 10 closed-source label, 12 open-source label, Chainpoll with GPT-4o label, Context Adherence label, ChainPoll label, local backlog metadata, or source identity alone must fail closed for provider/model drift. Passing evidence requires AMC-owned provider version, canary results, drift statistic, sample and trajectory counts, signed evidence refs, evaluation framework proof, observability pipeline proof, replayable eval-pack rows, Watch alert, CI alert or waiver, and no-copy proof.

## No-bloat boundary

No GitHub importer, Hallucination Index importer, Galileo integration, README parser, image parser, ranking mirror, model-ranking importer, RAG benchmark runner, ChainPoll runner, Context Adherence adapter, prompt importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific provider-drift path, or source-specific scoring path was added. No README tables, model rankings, images, RAG datasets, prompts, context chunks, needle questions, evaluation outputs, source methodology prose, scripts, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0819HallucinationIndexProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
