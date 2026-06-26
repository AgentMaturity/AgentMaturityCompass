# GAP-0713 - Dig Deeper replay-corpus boundary

- Gap: `GAP-0713`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2509.23327`, `https://doi.org/10.1145/3772318.3790551`, `https://openalex.org/W4415332356`
- Retrieval: `2026-06-21` via browser. The DOI endpoint returned a cache miss and the ACM DOI page returned `403 Forbidden`; the arXiv page was reachable and lists the ACM DOI as a related DOI.
- Status: closed through existing eval replay corpus receipts; no asynchronous discussion dataset, intervention strategy, study workflow, or source-specific benchmark added.

## Live source metadata

The reachable arXiv page identifies arXiv `2509.23327` in Computer Science / Human-Computer Interaction, submitted `2025-09-27` and last revised `2026-02-01` as version 2. It lists the title `"Shall We Dig Deeper?": Designing and Evaluating Strategies for LLM Agents to Advance Knowledge Co-Construction in Asynchronous Online Discussions`, authors Yuanhao Zhang, Wenbo Li, Xiaoyu Wang, Kangyu Yuan, Shuai Ma, and Xiaojuan Ma, arXiv DOI `10.48550/arXiv.2509.23327`, and related DOI `10.1145/3772318.3790551`.

The paper metadata describes LLM agents that support asynchronous online discussions and knowledge co-construction. Relevant source-review signals include staged knowledge progression, task-oriented and relationship-oriented intervention strategies, a design workshop, a within-subject study with `N=60`, five consecutive asynchronous discussions, constructive online discussion outcomes, and human-computer interaction context. These facts are agent-evaluation context only. No upstream paper prose beyond short metadata facts, discussion transcripts, study instruments, intervention strategies, prompts, datasets, rubrics, participant data, figures, tables, statistics, model outputs, code, or benchmark rows were copied into AMC.

## Relevance decision

This source is relevant to AMC as replayable benchmark-corpus context because asynchronous discussion facilitation is a multi-turn agent-evaluation setting where auditors would need a versioned replay manifest, fixed seed, fixture hash, baseline/candidate score deltas, source refs, signed evidence refs, and CI receipts before trusting Score/Shield/Watch claims.

It does not justify importing the paper, mirroring discussion transcripts, reproducing the intervention design, adding an online-discussion simulator, adding a knowledge-co-construction benchmark, or changing public methodology. GAP-0713 is closed by documenting the source boundary and adding regression coverage that Dig-Deeper-style discussion-agent context uses the existing generic `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` path. DOI, OpenAlex, arXiv, title, or abstract metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replayable benchmark corpus manifests, fixture hashes, score deltas, and signed row evidence. |
| Shield | Relevant through fail-closed evidence and CI receipts before external claims about discussion-agent evaluation are trusted. |
| Watch | Relevant through replay receipts that can be monitored as regression evidence. |
| Enforce | No runtime discussion intervention policy, prompt policy, or circuit breaker changed. |
| Vault | No participant data, discussion transcripts, prompts, study data, or secure storage changed. |
| Fleet | Multi-agent or group-discussion context only; no coordination topology or simulator added. |
| Passport | No portable proof-bundle field changed. |
| Comply | Human-study context only; no compliance mapping changed. |

## Product closure

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, online-discussion simulator, intervention-strategy importer, participant-data importer, benchmark runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0713.

The focused regression exercises the existing eval replay corpus engine with Dig-Deeper-style discussion-agent fixture data. The positive path requires AMC-owned replay fixtures, fixed seeds, fixture hashes, source refs, baseline/candidate score deltas, signed evidence, and CI-ready receipts. The negative path fails closed when arXiv/DOI/OpenAlex/title metadata replaces AMC-owned replay evidence.

## Fail-closed rule

Paper title, arXiv id, arXiv DOI, related ACM DOI, OpenAlex id, author list, submission dates, subject category, abstract labels, design-workshop labels, task-oriented labels, relationship-oriented labels, intervention labels, `N=60` label, five-discussion study label, online-discussion labels, knowledge-co-construction labels, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, input/expected hashes, baseline and candidate run ids, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No asynchronous-discussion benchmark, knowledge-co-construction simulator, intervention-strategy importer, design-workshop importer, participant-study importer, transcript loader, prompt importer, paper importer, OpenAlex importer, ACM importer, arXiv importer, dataset mirror, benchmark mirror, online-discussion workflow, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond short metadata facts, discussion transcripts, study instruments, intervention strategies, prompts, datasets, rubrics, participant data, figures, tables, statistics, model outputs, code, or benchmark rows were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0713DigDeeperReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
