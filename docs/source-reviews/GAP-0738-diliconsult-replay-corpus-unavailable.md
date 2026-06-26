# GAP-0738 - DILIConsult replay-corpus unavailable-source boundary

- Gap: `GAP-0738`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7135207744`, DOI `10.1002/phar.70131`, and title `DILIConsult: A Multi-Agent Large Language Model Framework for Evaluating Drug-Induced Liver Injury in ICU Settings`
- Retrieval: `2026-06-21` via browser search and direct URL attempts; exact-title, DOI, OpenAlex, Wiley publisher-domain, and quoted-title searches did not surface a reachable primary source in this environment. Shell network remains DNS-restricted in this environment.
- Status: closed through existing eval replay corpus receipts only when AMC-owned replay evidence exists; no DILIConsult framework, clinical benchmark, medical decision-support workflow, or ICU subsystem added.

## Live source metadata

The local backlog identifies a paper titled `DILIConsult: A Multi-Agent Large Language Model Framework for Evaluating Drug-Induced Liver Injury in ICU Settings`, DOI `10.1002/phar.70131`, OpenAlex work `W7135207744`, improvement dimension replayable benchmark corpus, category `Agent evaluation and benchmarks`, and concepts including medicine, clinical decision support, pipeline, recall, parsing, ranking, artificial intelligence, and computer science. Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title, DOI, OpenAlex, Wiley publisher-domain, and quoted-title searches did not surface a reachable primary source.

These facts are insufficient for a product, clinical, diagnostic, treatment, dataset, or benchmark claim. Drug-induced liver injury and ICU context is relevant only when AMC can bind its own replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, CI receipt, row hashes, Score/Shield/Watch coverage, and no-copy proof. No upstream paper prose, abstract text beyond local backlog metadata, clinical cases, patient data, drug records, ICU notes, benchmark rows, tables, figures, prompts, model outputs, screenshots, or implementation details were copied into AMC.

## Relevance decision

GAP-0738 is not accepted as standalone AMC replay-corpus evidence because the primary source was unavailable for live review and the remaining facts are metadata-only. The DILI/ICU theme maps to existing eval replay corpus receipts only as regulated-domain context; it does not justify a clinical subsystem, DILI evaluator, medical decision-support product, dataset importer, source-specific benchmark pack, or methodology change.

The accepted AMC primitive is already `runReplayBenchmarkCorpus` plus `buildEvalReplayCorpusEvidenceReceipt`. A source citation to this paper can be retained only as context when the replay packet carries AMC-owned fixture hashes, fixed seeds, signed evidence, score deltas, source refs, and CI/lifecycle receipts. Metadata-only paper identity must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing replay manifests with fixture hash, seed, score delta, and signed evidence. |
| Shield | Relevant only when replay evidence covers clinical-risk handling with signed receipts and fails closed otherwise. |
| Watch | Relevant only when replay deltas are tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime clinical decision, medical triage, medication, or policy-enforcement behavior changed. |
| Vault | No patient data, ICU notes, drug records, clinical cases, prompts, outputs, or secure-storage behavior changed. |
| Fleet | Multi-agent clinical context only; no DILIConsult workflow or orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Medical/ICU context only; no HIPAA, clinical, pharmacovigilance, or regulated-use mapping changed. |

## Product closure

GAP-0738 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing eval replay corpus primitive. The positive path proves that DILIConsult-style clinical multi-agent context can be cited only with AMC-owned replay evidence. The negative path proves DOI/OpenAlex/title metadata fails closed.

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, DILIConsult framework, clinical benchmark pack, medical decision-support workflow, DILI evaluator, pharmacovigilance workflow, ICU subsystem, dataset importer, paper parser, or scoring behavior changed for GAP-0738.

## Fail-closed rule

OpenAlex work ID, DOI, title, DILIConsult labels, drug-induced liver injury labels, ICU labels, clinical decision-support labels, multi-agent labels, medicine labels, recall labels, parsing labels, ranking labels, publisher identity, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, row hashes, CI or lifecycle receipt, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No DILIConsult framework, clinical benchmark pack, medical decision-support workflow, DILI evaluator, medication-safety module, pharmacovigilance workflow, ICU subsystem, patient-data parser, drug-record parser, clinical-case importer, dataset importer, Wiley importer, OpenAlex importer, paper parser, source-specific replay lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, clinical cases, patient data, drug records, ICU notes, benchmark rows, tables, figures, prompts, model outputs, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0738DiliconsultReplayCorpusUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
