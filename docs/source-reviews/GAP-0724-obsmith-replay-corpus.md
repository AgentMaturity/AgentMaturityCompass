# GAP-0724 - OBsmith replay-corpus boundary

- Gap: `GAP-0724`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: arXiv `https://arxiv.org/abs/2510.10066`, backlog OpenAlex `W7133296620`, DOI `10.1145/3798204`, and title `OBsmith: LLM-Powered JavaScript Obfuscator Testing`
- Retrieval: `2026-06-21` via browser search and arXiv page review; the source is JavaScript obfuscator correctness/testing research with LLM-assisted test generation context.
- Status: closed through existing eval replay corpus receipts; no OBsmith fuzzer, JavaScript obfuscator harness, source-code corpus, or obfuscation-testing runner added.

## Live source metadata

The live arXiv source identifies OBsmith as research on LLM-powered JavaScript obfuscator testing. Relevant source-review signals include JavaScript obfuscation, correctness testing, executable programs, differential-style validation, generated tests, and tool-evaluation context.

These facts are relevant to AMC as replayable benchmark corpus context only. OBsmith-style testing highlights why benchmark evidence must be rerunnable with fixture hashes, fixed seeds, score deltas, CI receipts, signed evidence rows, and source-review boundaries. It does not justify importing OBsmith, building a JavaScript obfuscator, adding a fuzzer, mirroring test programs, running an obfuscator benchmark, or changing public methodology. No upstream paper prose beyond minimal metadata facts, generated JavaScript programs, obfuscator outputs, benchmark rows, prompts, code, configs, figures, screenshots, datasets, tool results, or implementation details were copied into AMC.

## Relevance decision

GAP-0724 is relevant to AMC through the existing eval replay corpus receipt path because replayability is the right way to prove that a benchmark-backed score delta can be reproduced. The accepted AMC primitives are already `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt`.

The OBsmith source can be retained only as context when AMC-owned replay rows include a manifest hash, fixture hash, fixed seed, input/expected hashes, baseline/candidate run IDs, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof. Paper/arXiv/DOI/OpenAlex metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replay corpus score deltas and fixture-bound manifests. |
| Shield | Relevant through fail-closed handling for missing signed rows, missing fixture hashes, or copied/metadata-only benchmark evidence. |
| Watch | Relevant through CI/lifecycle receipts that show replay evidence remains reproducible over time. |
| Enforce | No runtime JavaScript, obfuscator, fuzzer, or policy enforcement behavior changed. |
| Vault | No JavaScript programs, obfuscator outputs, source datasets, prompts, or secure-storage behavior changed. |
| Fleet | Agent-evaluation context only; no multi-agent obfuscator testing workflow added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Software-testing context only; no compliance mapping changed. |

## Product closure

GAP-0724 is closed by documenting the live-source boundary and adding regression coverage over the existing replay corpus primitives. The positive path proves that OBsmith-style JavaScript obfuscator testing context can be cited only with AMC-owned replay fixtures and signed evidence. The negative path proves arXiv/DOI/OpenAlex/title metadata fails closed.

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, OBsmith runner, JavaScript obfuscator harness, fuzzer, test-program corpus, obfuscator adapter, ACM importer, OpenAlex importer, arXiv importer, paper parser, dataset importer, or scoring behavior changed for GAP-0724.

## Fail-closed rule

ArXiv id, OpenAlex work ID, DOI, title, JavaScript labels, obfuscator labels, correctness labels, executable-program labels, generated-test labels, tool-evaluation labels, publisher identity, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, input/expected hashes, baseline/candidate run ids, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No OBsmith runner, JavaScript obfuscator harness, fuzzer, test-program corpus, obfuscator adapter, differential-testing harness, code generator, generated-program importer, ACM importer, OpenAlex importer, arXiv importer, paper parser, dataset importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond minimal metadata facts, generated JavaScript programs, obfuscator outputs, benchmark rows, prompts, code, configs, figures, screenshots, datasets, tool results, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0724ObsmithReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
