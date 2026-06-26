# GAP-0739 - Maritime autonomous ships replay-corpus unavailable-source boundary

- Gap: `GAP-0739`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7135056321`, DOI `10.3390/info17030284`, and title `Deploying Efficient LLM Agents on Maritime Autonomous Surface Ships: Fine-Tuning, RAG, and Function Calling in a Mid-Size Model`
- Retrieval: `2026-06-21` via browser search and direct URL attempts; exact-title, DOI, OpenAlex, MDPI publisher-domain, and quoted-title searches did not surface a reachable primary source in this environment. Shell network remains DNS-restricted in this environment.
- Status: closed through existing eval replay corpus receipts only when AMC-owned replay evidence exists; no maritime autonomy workflow, ship-control benchmark, RAG dataset, or function-calling subsystem added.

## Live source metadata

The local backlog identifies a paper titled `Deploying Efficient LLM Agents on Maritime Autonomous Surface Ships: Fine-Tuning, RAG, and Function Calling in a Mid-Size Model`, DOI `10.3390/info17030284`, OpenAlex work `W7135056321`, improvement dimension replayable benchmark corpus, category `Agent evaluation and benchmarks`, and concepts including inference, computer science, artificial intelligence, function calling, cognition, cognitive architecture, standardization, and semantic reasoner. Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title, DOI, OpenAlex, MDPI publisher-domain, and quoted-title searches did not surface a reachable primary source.

These facts are insufficient for a product, maritime autonomy, navigation, safety, dataset, or benchmark claim. Maritime autonomous surface ship context is relevant only when AMC can bind its own replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, CI receipt, row hashes, Score/Shield/Watch coverage, and no-copy proof. No upstream paper prose, abstract text beyond local backlog metadata, vessel scenarios, navigation data, RAG corpus, function-call traces, benchmark rows, tables, figures, prompts, model outputs, screenshots, or implementation details were copied into AMC.

## Relevance decision

GAP-0739 is not accepted as standalone AMC replay-corpus evidence because the primary source was unavailable for live review and the remaining facts are metadata-only. The maritime autonomy theme maps to existing eval replay corpus receipts only as context; it does not justify a maritime autonomous systems workflow, ship-control evaluator, RAG dataset, function-calling benchmark pack, source-specific evaluator, or methodology change.

The accepted AMC primitive is already `runReplayBenchmarkCorpus` plus `buildEvalReplayCorpusEvidenceReceipt`. A source citation to this paper can be retained only as context when the replay packet carries AMC-owned fixture hashes, fixed seeds, signed evidence, score deltas, source refs, and CI/lifecycle receipts. Metadata-only paper identity must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing replay manifests with fixture hash, seed, score delta, and signed evidence. |
| Shield | Relevant only when replay evidence covers safety-sensitive autonomous-agent behavior with signed receipts and fails closed otherwise. |
| Watch | Relevant only when replay deltas are tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime maritime, navigation, vessel-control, function-call, or policy-enforcement behavior changed. |
| Vault | No ship data, navigation traces, RAG corpus, prompts, outputs, or secure-storage behavior changed. |
| Fleet | Autonomous surface ship context only; no maritime workflow or orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Maritime/autonomous-system context only; no regulated safety or audit-control mapping changed. |

## Product closure

GAP-0739 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing eval replay corpus primitive. The positive path proves that maritime autonomous ship context can be cited only with AMC-owned replay evidence. The negative path proves DOI/OpenAlex/title metadata fails closed.

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, maritime autonomy workflow, ship-control benchmark pack, navigation evaluator, RAG dataset, function-calling harness, MDPI importer, OpenAlex importer, paper parser, or scoring behavior changed for GAP-0739.

## Fail-closed rule

OpenAlex work ID, DOI, title, maritime autonomous surface ship labels, fine-tuning labels, RAG labels, function-calling labels, mid-size model labels, inference labels, semantic-reasoner labels, standardization labels, publisher identity, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, row hashes, CI or lifecycle receipt, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No maritime autonomy workflow, ship-control benchmark pack, navigation evaluator, vessel simulator, RAG dataset importer, function-calling harness, mid-size model fine-tuning path, MDPI importer, OpenAlex importer, paper parser, source-specific replay lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, vessel scenarios, navigation data, RAG corpus, function-call traces, benchmark rows, tables, figures, prompts, model outputs, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0739MaritimeAutonomousShipsReplayCorpusUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
