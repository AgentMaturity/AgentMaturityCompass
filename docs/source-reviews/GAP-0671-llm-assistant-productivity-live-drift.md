# GAP-0671 — LLM-assistant productivity live-drift boundary

- Gap: `GAP-0671`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W4415343831` / DOI `10.1145/3809494`
- Corroborating primary source reached: `https://arxiv.org/abs/2507.03156`
- Retrieval: `2026-06-21`; browser access to arXiv succeeded, while the local DOI/OpenAlex values are retained as backlog identity metadata because the accessible arXiv page did not corroborate the DOI string.
- Status: relevant only through existing Watch live score/behavior drift receipts; no developer-productivity subsystem, SPACE metric adapter, replication-package importer, or benchmark mirror added.

## Live source metadata

The accessible arXiv page identifies `The Impact of LLM-Assistants on Software Developer Productivity: A Systematic Review and Mapping Study`, authors Amr Mohamed, Maram Assi, and Mariam Guizani, and arXiv identifier `2507.03156`. The page describes a systematic review of LLM assistants in software engineering, references the SPACE framework, and notes an associated replication package.

These facts are source identity and domain context only. No paper prose beyond short metadata facts, search strings, tables, figures, replication data, study rows, exclusion rationales, code, prompts, examples, or implementation details were copied into AMC.

## Relevance decision

The source is relevant to AMC as context for live score and behavior drift in code-assistant and software-engineering agents. It reinforces that LLM-assistant impact is multi-dimensional and can change across quality, speed, collaboration, cognitive load, and workflow behavior, which maps naturally to Watch drift over score windows, behavior signatures, latency, cost, error attribution, and invalid actions.

The source does not supply AMC-owned baseline/live windows, trace rows, drift statistics, signed evidence, row hashes, thresholds, or Watch alert receipts. GAP-0671 is therefore closed through the existing generic `live-score-behavior-drift` primitive rather than a source-specific productivity adapter.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when AMC-owned score-window evidence proves a material change in maturity or evaluation behavior. |
| Shield | Relevant only when signed drift evidence supports a safety, unsupported-action, quality, or tool-misuse regression. |
| Watch | Yes, through existing baseline/live trace windows, drift statistics, receipt hashes, and Watch alert projection. |
| Enforce | No policy-enforcement or coding-assistant guardrail feature. |
| Vault | No secrets, repository data, developer telemetry storage, or privacy feature. |
| Fleet | No team-productivity or multi-agent orchestration subsystem. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No labor, productivity, or software-process compliance mapping. |

## Product closure

GAP-0671 is closed by documenting the source-review boundary and adding regression coverage that exercises existing Watch live score/behavior drift receipts with AMC-owned synthetic software-assistant traces. The accepted product primitive remains generic live drift: baseline and live rows, score deltas, behavior signatures, latency/cost movement, invalid-action/error-attribution rates, signed evidence refs, receipt hashes, and Watch alerts.

## Fail-closed rule

ArXiv metadata, local DOI/OpenAlex fields, paper title, author names, systematic-review labels, SPACE framework references, replication-package labels, productivity dimensions, search strategy metadata, local backlog metadata, and source identity alone must fail closed for live-drift claims. Passing evidence requires AMC-owned baseline/live trace windows, evaluator configs, drift statistics, thresholds, signed evidence refs, row hashes, receipt hashes, and Watch alert or waiver proof.

## No-bloat boundary

No developer-productivity subsystem, SPACE framework adapter, DevEx metric adapter, replication-package importer, study-row mirror, survey/result parser, benchmark runner, coding-assistant telemetry collector, team-productivity dashboard, API route, CLI command, Studio panel, methodology version bump, or parity layer was added. No upstream paper prose beyond bibliographic title/metadata, search strings, tables, figures, replication package data, study rows, exclusion rationales, code, prompts, examples, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0671LlmAssistantProductivityLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
