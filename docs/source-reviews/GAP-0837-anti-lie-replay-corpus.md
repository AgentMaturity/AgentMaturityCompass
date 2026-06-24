# GAP-0837 - Anti-Lie replay-corpus boundary

- Gap: `GAP-0837`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `lc198707/anti-lie`, `https://github.com/lc198707/anti-lie`
- Retrieval: `2026-06-21` via live GitHub page review and shell header checks. Repository URL returned HTTP/2 200. The live page exposed README and LICENSE navigation and repository metadata. Direct api.github.com DNS lookup failed in this shell. A later GitHub HTML follow-up lookup failed because `github.com` DNS resolution failed.
- Status: closed through existing eval replay corpus receipts; no Anti-Lie integration, LiarBench runner, truth-gradient scorer, claim-auditing runtime, benchmark importer, dataset mirror, or source-specific replay adapter added.

## Live source metadata

The live repository page and local backlog identify Anti-Lie with the source signal `Don't make LLMs honest. Make every factual claim auditable.` Relevant source-review context includes claim auditing, factual claim review, T1-T7 truth gradients, LiarBench, 98.1% business effectiveness, hallucination/factuality/guardrail topics, and Python implementation context.

These facts are replay-corpus context only. They do not authorize copying upstream benchmark rows, truth labels, prompts, claim examples, datasets, scoring rules, README prose beyond minimal metadata facts, code, configs, generated outputs, or implementation details into AMC.

## Relevance decision

GAP-0837 is relevant to AMC because factuality and claim-auditing evaluations need replayable evidence before they can support Score, Shield, or Watch claims. The gap maps to AMC's existing eval replay corpus primitive: replay manifest, fixture hash, fixed seed, score delta, signed rows, source refs, CI receipt, Score/Shield/Watch coverage, and no-copy proof.

It does not require an Anti-Lie runtime, LiarBench runner, T1-T7 scorer, claim-auditing subsystem, benchmark importer, dataset mirror, GitHub importer, API route, CLI command, Studio panel, or methodology version bump. Repository metadata can explain why replay evidence matters for factuality contexts, but it cannot replace AMC-owned replay evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replay manifest, fixture hash, score delta, signed rows, and CI receipt proof. |
| Shield | Relevant because factuality and anti-hallucination claims fail closed without signed replay evidence. |
| Watch | Relevant through replay evidence that can be projected into lifecycle/CI monitoring evidence. |
| Enforce | No runtime guardrail, truth-label policy, claim-auditing policy, or circuit breaker changed. |
| Vault | No claims, benchmark rows, prompts, datasets, or secure-storage behavior changed. |
| Fleet | Factuality-agent context only; no orchestration topology or multi-agent runtime changed. |
| Passport | No portable trust token or proof-bundle schema changed. |
| Comply | Audit concept is context only; no compliance framework mapping changed. |

## Product closure

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Anti-Lie integration, LiarBench runner, truth-gradient scorer, claim-auditing runtime, benchmark importer, dataset mirror, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0837.

The focused regression exercises the existing `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` path. The positive path requires replay manifest, fixture hash, fixed seed, score delta, signed evidence refs, source refs, CI receipt, and Score/Shield/Watch coverage. The negative path fails closed when repository metadata replaces AMC-owned replay evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, README presence, LICENSE presence, api.github.com DNS lookup failed, GitHub HTML follow-up lookup failed, repository title, Anti-Lie label, T1-T7 truth gradients label, LiarBench label, 98.1% business effectiveness label, claim auditing label, factual claim label, hallucination label, guardrail label, Python language metadata, local backlog metadata, or source identity alone must fail closed for replay-corpus claims.

Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, score delta, signed evidence refs, source refs, CI receipt, row hashes, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No Anti-Lie integration, LiarBench runner, truth-gradient scorer, claim-auditing runtime, benchmark importer, dataset mirror, GitHub importer, Python dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, source-specific replay lens, or source-specific scoring path was added. No upstream benchmark rows, truth labels, prompts, claim examples, datasets, scoring rules, README prose beyond minimal metadata facts, code, configs, generated outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0837AntiLieReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
