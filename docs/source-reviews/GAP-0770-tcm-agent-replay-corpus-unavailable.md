# GAP-0770 - TCM-Agent replay-corpus unavailable-source boundary

- Gap: `GAP-0770`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7128484821`, DOI `10.1016/j.jpha.2026.101581`, and title `TCM-Agent: Advancing Network Pharmacology and Herbal Medicine Discovery with LLM-Based Multi-Agent Systems`
- Retrieval: `2026-06-21` via browser search and direct DOI attempt; exact-title and DOI searches did not surface a reachable primary source in this environment, and direct DOI opening was blocked by browser safety constraints. Shell network remains DNS-restricted in this environment.
- Status: closed through existing eval replay corpus receipts; no TCM-Agent, network pharmacology, herbal medicine, or drug-discovery subsystem added.

## Live source metadata

The local backlog identifies a paper titled `TCM-Agent: Advancing Network Pharmacology and Herbal Medicine Discovery with LLM-Based Multi-Agent Systems`, DOI `10.1016/j.jpha.2026.101581`, OpenAlex work `W7128484821`, improvement dimension replayable benchmark corpus, category `Agent evaluation and benchmarks`, and concepts including systems pharmacology, computer science, adaptability, data science, benchmark, systems biology, and task management. The backlog abstract snippet frames network pharmacology as an approach for complex mechanisms.

Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title and DOI searches did not surface a reachable primary source in this environment, and the direct DOI URL was blocked. These metadata facts are relevant to AMC only as replay-corpus context for multi-agent scientific discovery, network pharmacology, and herbal medicine workflows. They do not justify copying the paper, importing herbal medicine datasets, adding pharmacology workflows, or claiming benchmark parity. No upstream paper prose, abstract text beyond local backlog metadata, pharmacology data, herbal medicine data, biological networks, prompts, model outputs, benchmark rows, figures, tables, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0770 is relevant to AMC through existing eval replay corpus receipts because scientific multi-agent workflows need reproducible eval manifests, fixed seeds, fixture hashes, score deltas, signed evidence refs, and CI receipts before they affect Score, Shield, or Watch. The accepted AMC primitives are already `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt`.

The source can be retained only as context when the replay packet carries AMC-owned replay manifest, fixture hash, fixed seed, source refs, signed evidence refs, row hashes, score delta, CI receipt, and no-copy proof. DOI/OpenAlex/title metadata, TCM-Agent labels, network-pharmacology labels, herbal-medicine labels, multi-agent labels, or systems-biology labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through replayable eval manifests, fixture hashes, fixed seeds, score deltas, and signed rows. |
| Shield | Relevant through fail-closed handling for unsupported pharmacology, herbal medicine, scientific discovery, or multi-agent claims. |
| Watch | Relevant when replay results bind to CI/lifecycle receipts and regression thresholds; no live monitor changed. |
| Fleet | Multi-agent discovery context only; no orchestration adapter or topology changed. |
| Enforce | No runtime pharmacology, medical, or scientific-discovery policy changed. |
| Vault | No herbal medicine data, pharmacology data, biological networks, prompts, or secure-storage behavior changed. |
| Passport | No portable proof-bundle field or external scientific credential changed. |
| Comply | Healthcare/pharmacology context only; no compliance mapping changed. |

## Product closure

GAP-0770 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing eval replay corpus primitive. The positive path proves that TCM-Agent-style scientific discovery context can be cited only with AMC-owned replay manifest, fixture hash, fixed seed, source refs, signed evidence refs, row hashes, score delta, CI receipt, and Score/Shield/Watch surface coverage. The negative path proves DOI/OpenAlex/title/herbal-medicine metadata fails closed.

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, TCM-Agent framework, network pharmacology workflow, herbal medicine discovery subsystem, biological-network importer, multi-agent discovery runner, methodology version, diagnostic question bank, or scoring behavior changed for GAP-0770.

## Fail-closed rule

OpenAlex work ID, DOI, title, TCM-Agent labels, network-pharmacology labels, herbal-medicine labels, LLM-based multi-agent labels, systems-pharmacology labels, systems-biology labels, benchmark labels, adaptability labels, data-science labels, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, source refs, signed evidence refs, row hashes, score delta, CI/lifecycle receipt, Score/Shield/Watch surface coverage, primary-source availability status, and no-copy proof.

## No-bloat boundary

No TCM-Agent framework, network pharmacology workflow, herbal medicine discovery subsystem, biological-network importer, traditional medicine database importer, scientific discovery runner, multi-agent pharmacology simulator, prompt importer, output importer, benchmark mirror, paper importer, Elsevier importer, OpenAlex importer, source-specific replay lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, pharmacology data, herbal medicine data, biological networks, prompts, model outputs, benchmark rows, figures, tables, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0770TcmAgentReplayCorpusUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
