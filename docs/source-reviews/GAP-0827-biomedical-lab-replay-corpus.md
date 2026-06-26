# GAP-0827 - Biomedical lab replay-corpus boundary

- Gap: `GAP-0827`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: DOI `10.64898/2026.05.13.724985`, `https://doi.org/10.64898/2026.05.13.724985`, `http://biorxiv.org/lookup/doi/10.64898/2026.05.13.724985`, `https://www.biorxiv.org/lookup/doi/10.64898/2026.05.13.724985`, OpenAlex `W7161577328`
- Retrieval: `2026-06-21` via live DOI, bioRxiv, and OpenAlex header checks. DOI returned HTTP/2 302 to `http://biorxiv.org/lookup/doi/10.64898/2026.05.13.724985`; bioRxiv lookup returned HTTP/1.1 302 to the HTTPS host; HTTPS bioRxiv returned HTTP/2 403 in this shell; OpenAlex API HEAD returned HTTP/2 200.
- Status: closed through existing replay-corpus receipts; no biomedical-lab workflow runner, tool runner, code-execution harness, dataset mirror, or source-specific replay adapter added.

## Live source metadata

The local OpenAlex-backed backlog identifies `Evaluating open LLMs for agentic analysis orchestration in a typical biomedical lab`. Source-review signals include biomedical lab, agentic tools, plans, external tools, executes code, iterative tool use, data-science analysis, and biomedical workflow orchestration. The DOI and OpenAlex records are reachable at header level, while the HTTPS bioRxiv page is Cloudflare-blocked in this shell.

These facts are replay-corpus context only. No upstream biomedical tasks, datasets, notebooks, code, analysis scripts, tool traces, prompts, expected answers, figures, tables, examples, generated outputs, or prose were copied into AMC.

## Relevance decision

This source is relevant to AMC because agentic biomedical analysis claims are only audit-ready when the exact evaluation can be replayed. GAP-0827 maps to AMC's existing replay-corpus primitive: replay manifest, fixture hash, fixed seed, source refs, signed evidence refs, score delta, CI receipt, row hashes, and Score/Shield/Watch coverage.

It does not require a biomedical-lab workflow runner, code-execution harness, notebook runner, paper importer, OpenAlex importer, bioRxiv importer, API route, CLI command, Studio panel, or methodology version bump. Source metadata can identify the paper context, but it cannot replace AMC-owned replay evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through replayed score deltas and row-hashed replay corpus receipts. |
| Shield | Relevant because biomedical workflow claims fail closed without signed replay evidence and no-copy proof. |
| Watch | Relevant through CI receipt, source refs, and replay evidence that can be monitored for regression. |
| Enforce | No runtime biomedical policy, tool policy, or circuit breaker changed. |
| Vault | No biomedical datasets, prompts, code outputs, or secure-storage behavior changed. |
| Fleet | Agentic workflow context only; no orchestration topology or multi-agent runtime changed. |
| Passport | No portable trust token or proof-bundle schema changed. |
| Comply | Biomedical context only; no compliance framework mapping changed. |

## Product closure

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, biomedical-lab runner, code-execution harness, notebook runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0827.

The focused regression exercises the existing `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` path. The positive path requires an AMC-owned replay manifest, fixture hash, fixed seed, source refs, signed evidence refs, score delta, CI receipt, row hashes, and Score/Shield/Watch coverage. The negative path fails closed when DOI/OpenAlex/source metadata replaces AMC-owned replay evidence.

## Fail-closed rule

DOI URL, bioRxiv lookup URL, OpenAlex id, paper title, biomedical lab label, agentic tools label, plans label, external tools label, executes code label, data-science label, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, source refs, signed evidence refs, score delta, CI receipt, row hashes, no-copy proof, and Score/Shield/Watch coverage.

## No-bloat boundary

No biomedical-lab workflow runner, code-execution harness, notebook runner, dataset mirror, benchmark mirror, paper importer, OpenAlex importer, bioRxiv importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream biomedical tasks, datasets, notebooks, code, analysis scripts, tool traces, prompts, expected answers, figures, tables, examples, generated outputs, or prose were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0827BiomedicalLabReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
