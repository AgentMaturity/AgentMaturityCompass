# GAP-0732 - AgentCDM replay-corpus boundary

- Gap: `GAP-0732`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: arXiv `https://arxiv.org/abs/2508.11995`, backlog OpenAlex `W7138982029`, backlog DOI `10.1609/aaai.v40i41.40803`, arXiv DOI `10.48550/arxiv.2508.11995`, and title `AgentCDM: Enhancing Multi-Agent Collaborative Decision-Making via ACH-Inspired Structured Reasoning`
- Retrieval: `2026-06-21` via live arXiv page review and DOI/title search; shell network remains DNS-restricted in this environment.
- Status: closed through existing eval replay corpus receipts; no AgentCDM trainer, ACH reasoning engine, multi-agent simulator, or benchmark mirror added.

## Live source metadata

The live arXiv source identifies AgentCDM as research on enhancing multi-agent collaborative decision-making through Analysis of Competing Hypotheses inspired structured reasoning. Relevant source-review signals include collaborative decision-making, structured reasoning, hypothesis analysis, multi-agent debate and consensus context, two-stage training, benchmark datasets, accuracy and reasoning-quality evaluation, and robustness claims for complex decision tasks. The live arXiv page lists authors Xuyang Zhao, Shiwan Zhao, Hualong Yu, Liting Zhang, Qicheng Li, Junhao Pan, Zikun Liu, Qiushi Sun, Chengwei Liu, and Zhengxiang Shi; submitted `2025-08-16`.

These facts are relevant to AMC as replayable benchmark corpus context only. Multi-agent decision-making claims need rerunnable evidence with replay manifests, fixture hashes, fixed seeds, score deltas, CI receipts, signed evidence rows, and source-review boundaries. They do not justify importing AgentCDM, copying its training data, running its benchmark, adding an ACH engine, or claiming methodology parity. No upstream paper prose beyond minimal metadata facts, dataset rows, prompts, training recipes, model outputs, benchmark results, figures, tables, algorithms, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0732 is relevant to AMC through the existing eval replay corpus receipt path because replayability is the right way to prove that multi-agent decision-quality score deltas can be reproduced. The accepted AMC primitives are already `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt`.

The AgentCDM source can be retained only as context when AMC-owned replay rows include a manifest hash, fixture hash, fixed seed, input/expected hashes, baseline/candidate run IDs, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof. Paper/arXiv/DOI/OpenAlex/title metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replay corpus score deltas and fixture-bound manifests. |
| Shield | Relevant through fail-closed handling for missing signed rows, missing fixture hashes, or copied/metadata-only benchmark evidence. |
| Watch | Relevant through CI/lifecycle receipts that show replay evidence remains reproducible over time. |
| Enforce | No runtime ACH policy, debate policy, consensus policy, or enforcement behavior changed. |
| Vault | No prompts, training data, decision traces, model outputs, benchmark rows, or secure-storage behavior changed. |
| Fleet | Multi-agent decision-making context only; no AgentCDM orchestration or simulator added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Decision-support research context only; no compliance mapping changed. |

## Product closure

GAP-0732 is closed by documenting the live-source boundary and adding regression coverage over the existing replay corpus primitives. The positive path proves that AgentCDM-style collaborative decision-making context can be cited only with AMC-owned replay fixtures and signed evidence. The negative path proves arXiv/DOI/OpenAlex/title metadata fails closed.

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, AgentCDM trainer, ACH reasoning engine, multi-agent debate simulator, consensus runner, benchmark mirror, dataset importer, paper parser, OpenAlex importer, arXiv importer, or scoring behavior changed for GAP-0732.

## Fail-closed rule

ArXiv id, OpenAlex work ID, DOI, title, author list, AgentCDM labels, Analysis of Competing Hypotheses labels, structured-reasoning labels, collaborative-decision-making labels, two-stage-training labels, benchmark-dataset labels, accuracy labels, robustness labels, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, input/expected hashes, baseline/candidate run ids, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No AgentCDM trainer, ACH reasoning engine, hypothesis analyzer, multi-agent debate simulator, consensus runner, benchmark mirror, dataset importer, prompt importer, training pipeline, score rubric importer, OpenAlex importer, arXiv importer, paper parser, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond minimal metadata facts, dataset rows, prompts, training recipes, model outputs, benchmark results, figures, tables, algorithms, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0732AgentCdmReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
