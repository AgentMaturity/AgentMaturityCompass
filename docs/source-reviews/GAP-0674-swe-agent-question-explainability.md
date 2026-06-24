# GAP-0674 — SWE-agent question-explainability boundary

- Gap: `GAP-0674`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/SWE-agent/SWE-agent`
- Retrieval: `2026-06-21` via browser access to the live GitHub repository page; shell network remains DNS-restricted in this environment.
- Status: relevant only through existing question-level score explainability; no SWE-agent integration, benchmark adapter, or source-specific question lens added.

## Live source metadata

The live GitHub page identifies `SWE-agent/SWE-agent` as a public repository on branch `main`, with approximately `19.6k` stars, `2.1k forks`, `21` issues, `2` pull requests, `111` watchers, `2,168 commits`, MIT license, and `10` releases. The page positions the source around software-engineering agents, SWE-bench usage, offensive cybersecurity mode, competitive coding/custom tasks, and NeurIPS 2024 research context.

These metadata facts identify the source and its adjacent domain only. No README prose beyond short metadata labels, benchmark instructions, citations, trajectories, configs, examples, prompts, issue data, benchmark rows, screenshots, generated outputs, or implementation details were copied into AMC.

## Relevance decision

SWE-agent is relevant to AMC as source-review context for question-level score explainability. Software-engineering agent benchmarks can make maturity labels look precise while still hiding why a specific L0-L5 question moved, which evidence was accepted, which evidence was rejected, and what repair hint remains.

The accepted AMC primitive is already question-score explainability: question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence refs, thresholds, row hashes, and Score/Shield/Watch surface mapping. SWE-agent repository metadata, SWE-bench references, release labels, trajectories, configs, or benchmark claims are not accepted evidence by themselves.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing AMC question rows with accepted evidence IDs, rejected evidence reasons, repair hints, thresholds, and row hashes. |
| Shield | Relevant only when unsupported software-agent or benchmark claims are rejected with signed evidence and repair guidance. |
| Watch | Relevant only when caller-owned traces, receipts, and threshold results are hash-bound through AMC evidence. |
| Enforce | No policy-enforcement or coding-agent sandbox change. |
| Vault | No repository secret handling, private-code storage, or data-residency feature. |
| Fleet | No SWE-agent orchestration, trajectory, or multi-agent coordination implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No compliance mapping or regulated-domain claim. |

## Product closure

GAP-0674 is closed by documenting the source-review boundary and adding regression coverage over the existing `questionScoreExplainability` primitive. The positive path proves that SWE-agent context can be cited only after AMC-owned question evidence exists. The negative path proves metadata-only source identity fails closed.

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, diagnostic question bank, or scoring behavior changed for GAP-0674.

## Fail-closed rule

GitHub repository metadata, star/fork/issue counts, MIT license, branch name, release labels, README labels, SWE-bench references, NeurIPS labels, trajectory folders, config files, benchmark claims, offensive cybersecurity labels, custom-task labels, local backlog metadata, or source identity alone must fail closed for question-score explainability claims. Passing evidence requires AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence refs, thresholds, row hashes, and no-copy proof.

## No-bloat boundary

No SWE-agent integration, benchmark adapter, trajectory importer, GitHub-issue runner, SWE-bench wrapper, EnIGMA/security-mode adapter, competitive-coding task mirror, config importer, source-specific question lens, API route, CLI command, Studio panel, Passport field, methodology version bump, or parity layer was added. No upstream code, README/docs prose, benchmark instructions, citations, trajectories, configs, examples, prompts, issue data, benchmark rows, screenshots, generated outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0674SweAgentQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
