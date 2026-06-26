# GAP-0706 - Autonomous systems replay-corpus unavailable-source boundary

- Gap: `GAP-0706`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7129449582`, DOI `10.1109/ojits.2026.3665677`, and title `LLM and AI Agents for Autonomous Systems: A Survey of Applications, Datasets, and Security Challenges`
- Retrieval: `2026-06-21` via browser search and direct URL attempts; exact-title, DOI, OpenAlex, IEEE publisher-domain, and quoted-title searches did not surface a reachable primary source in this environment. Shell network remains DNS-restricted in this environment.
- Status: closed through existing eval replay corpus receipts only when AMC-owned replay evidence exists; no autonomous-systems survey, dataset, or security benchmark importer added.

## Live source metadata

The local backlog identifies a paper titled `LLM and AI Agents for Autonomous Systems: A Survey of Applications, Datasets, and Security Challenges`, DOI `10.1109/ojits.2026.3665677`, OpenAlex work `W7129449582`, improvement dimension replayable benchmark corpus, category `Agent evaluation and benchmarks`, and concepts including software deployment, adversarial system, robustness, autonomous agent, cloud computing, artificial intelligence, and computer security. Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title, DOI, OpenAlex, IEEE publisher-domain, and quoted-title searches did not surface a reachable primary source.

These facts are insufficient for a product, dataset, or benchmark claim. Autonomous-systems and security-challenge context is relevant only when AMC can bind its own replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, CI receipt, row hashes, and no-copy proof. No upstream paper prose, abstract text beyond local backlog metadata, survey taxonomy, application list, dataset list, security-challenge list, benchmark rows, tables, figures, prompts, model outputs, screenshots, or implementation details were copied into AMC.

## Relevance decision

GAP-0706 is not accepted as standalone AMC replay-corpus evidence because the primary source was unavailable for live review and the remaining facts are metadata-only. The autonomous-systems theme maps to existing eval replay corpus receipts only as context; it does not justify an autonomous-systems dataset, security benchmark pack, source-specific evaluator, or methodology change.

The accepted AMC primitive is already `runReplayBenchmarkCorpus` plus `buildEvalReplayCorpusEvidenceReceipt`. A source citation to this paper can be retained only as context when the replay packet carries AMC-owned fixture hashes, fixed seeds, signed evidence, score deltas, source refs, and CI/lifecycle receipts. Metadata-only paper identity must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing replay manifests with fixture hash, seed, score delta, and signed evidence. |
| Shield | Relevant only when replay evidence covers adversarial or security-sensitive behavior with signed receipts and fails closed otherwise. |
| Watch | Relevant only when replay deltas are tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime autonomous-system policy, security guardrail, or enforcement behavior changed. |
| Vault | No datasets, prompts, outputs, cloud records, security findings, or secure-storage behavior changed. |
| Fleet | Autonomous-agent context only; no autonomous-systems workflow or orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No transportation, robotics, autonomous-system, safety, or audit-control mapping changed. |

## Product closure

GAP-0706 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing eval replay corpus primitive. The positive path proves that autonomous-systems survey context can be cited only with AMC-owned replay evidence. The negative path proves DOI/OpenAlex/title metadata fails closed.

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, autonomous-systems dataset, security benchmark pack, survey importer, paper parser, or scoring behavior changed for GAP-0706.

## Fail-closed rule

OpenAlex work ID, DOI, title, autonomous-systems labels, dataset labels, application labels, security-challenge labels, adversarial-system labels, robustness labels, cloud-computing labels, autonomous-agent labels, computer-security labels, publisher identity, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, row hashes, CI or lifecycle receipt, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No autonomous-systems survey corpus, dataset importer, security benchmark pack, adversarial-scenario importer, robotics/autonomy workflow, cloud-deployment harness, IEEE importer, OpenAlex importer, paper parser, source-specific replay lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, survey taxonomy, application list, dataset list, security-challenge list, benchmark rows, tables, figures, prompts, model outputs, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0706AutonomousSystemsReplayCorpusUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
