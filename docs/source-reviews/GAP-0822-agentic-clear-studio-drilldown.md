# GAP-0822 - Agentic CLEAR Studio evidence drilldown boundary

- Gap: `GAP-0822`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2605.22608`, DOI `10.48550/arXiv.2605.22608`, OpenAlex `W7162126770`
- Retrieval: `2026-06-21` via live arXiv page review plus shell header checks. arXiv returned HTTP/2 200, DOI returned HTTP/2 302 to `https://arxiv.org/abs/2605.22608`, and OpenAlex API HEAD returned HTTP/2 200.
- Status: closed through existing Score evidence drilldown and Watch source-artifact link receipts; no Agentic CLEAR Studio panel, evaluator, trace scorer, node scorer, route, or source-specific drilldown UI added.

## Live source metadata

The live arXiv page identifies `Agentic CLEAR: Automating Multi-Level Evaluation of LLM Agents`, Submitted on 21 May 2026. GAP-0822 uses the same paper source family as GAP-0821 but maps the alternate OpenAlex work id `W7162126770` to the Studio evidence drilldown dimension.

Relevant source-review signals include system, trace, node evaluation granularity, operation above the observability layer, task-success prediction, human-annotated errors, and the need for operators to inspect the proof behind agent-evaluation findings. These are drilldown context only. No upstream prompts, traces, benchmark rows, human annotations, scorer definitions, UI assets, figures, tables, examples, code, generated outputs, or prose were copied into AMC.

## Relevance decision

This source is relevant to AMC because multi-level agent evaluation findings are only actionable when an operator can open the finding and see the UI route, source artifact links, evidence preview, and empty/error states. The same drilldown also needs trace preview, receipt preview, accepted and rejected evidence, empty-state receipts, and error-state receipts. GAP-0822 maps to AMC's existing Score evidence drilldown and Watch source-artifact link primitives.

It does not require a new public route, Studio panel, Agentic CLEAR evaluator, trace/node scorer, benchmark runner, paper importer, OpenAlex importer, arXiv importer, or methodology version bump. The existing drilldown surface already has the needed fail-closed behavior: metadata-only source links can identify a paper, but they cannot replace signed AMC evidence previews.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through the existing score-finding drilldown route, accepted/rejected evidence previews, and score receipt refs. |
| Shield | Relevant because unsupported drilldown claims fail closed when signed preview evidence or route proof is missing. |
| Watch | Relevant through metadata-only source artifact links that point back to live source identity while AMC-owned evidence remains signed. |
| Enforce | No runtime policy, guardrail, routing rule, or circuit breaker changed. |
| Vault | No traces, annotations, prompts, benchmark rows, or secure-storage behavior changed. |
| Fleet | Agent-evaluation context only; no fleet topology, orchestrator, or multi-agent runtime changed. |
| Passport | No portable trust token or external proof-bundle schema changed. |
| Comply | Evidence-access context only; no compliance framework mapping changed. |

## Product closure

No `src/diagnostic/evidenceDrilldown.ts`, `src/watch/evidenceDrilldown.ts`, `src/console/assets/evidenceDrilldown.js`, `src/studio/openapi.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Agentic CLEAR adapter, trace scorer, node scorer, benchmark runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0822.

The focused regression exercises the existing `buildScoreEvidenceDrilldown` and `buildWatchObsStudioSourceArtifactLinks` paths. The positive path requires a UI route, source artifact links, evidence preview, trace preview, receipt preview, accepted/rejected evidence, empty-state receipts, error-state receipts, row hash, and complete paper metadata. The negative path fails closed when paper metadata replaces drilldown evidence previews. The empty path keeps the no-receipt state explicit and fail-closed.

## Fail-closed rule

Paper title, arXiv URL, DOI, OpenAlex id, submission date, Agentic CLEAR label, system/trace/node label, above-the-observability-layer label, local backlog metadata, or source identity alone must fail closed for Studio evidence drilldown claims. Passing evidence requires AMC-owned UI route, source artifact links, trace preview, receipt preview, evidence preview, accepted/rejected evidence, empty-state receipts, error-state receipts, signed evidence refs, row hash, source refs, and no-copy proof.

## No-bloat boundary

No Agentic CLEAR Studio panel, evaluator, multi-level evaluator, trace scorer, node scorer, benchmark runner, paper importer, OpenAlex importer, arXiv importer, dataset mirror, benchmark mirror, annotation importer, API route, CLI command, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream prompts, traces, benchmark rows, human annotations, scorer definitions, UI assets, figures, tables, examples, code, generated outputs, or prose were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0822AgenticClearStudioDrilldownBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
