# GAP-0791 - Vibe Design replay-corpus unavailable-source boundary

- Gap: `GAP-0791`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog DOI `10.2139/ssrn.6297816`, OpenAlex `https://openalex.org/W7131234329`, and title `Vibe Design: Human-in-the-loop Agentic Framework for UI Design with Large Language Models`
- Retrieval: `2026-06-21`; exact-title, DOI, SSRN, and OpenAlex work searches returned no reachable primary source in this sandbox; shell network remains restricted in this environment.
- Status: closed as an unavailable-source replay-corpus boundary; no UI-design framework, human-in-the-loop workflow, persona generator, walkthrough evaluator, or source-specific benchmark added.

## Source availability note

The local backlog identifies a paper titled `Vibe Design: Human-in-the-loop Agentic Framework for UI Design with Large Language Models`, DOI `10.2139/ssrn.6297816`, and OpenAlex work `W7131234329`. Live search attempts for the exact title, DOI, SSRN path, and OpenAlex work ID did not produce a reachable primary page on `2026-06-21`.

Because the primary source could not be verified, AMC must not make exact claims about the paper’s methods, personas, pluralistic walkthroughs, user-experience design process, prompts, outputs, UI artifacts, or benchmark rows. The backlog concepts can be retained only as unverified source-review context for replay-corpus boundaries: human-in-the-loop, agentic framework, UI design, large language models, usability, pluralistic walkthrough, persona, usability engineering, user experience design, and software engineering.

## Relevance decision

GAP-0791 is relevant to AMC through existing eval replay corpus receipts, but the source is unavailable for exact-source claims. The accepted AMC primitives are already `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt`: replay manifests, fixed seeds, fixture hashes, source refs, signed evidence refs, score deltas, CI receipts, and fail-closed replay readiness for Score, Shield, and Watch.

A source citation can be retained only as unverified context when the AMC replay packet is fully AMC-owned and contains no copied upstream artifacts. DOI/OpenAlex/title metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through replayable eval manifests, fixture hashes, fixed seeds, score deltas, and signed rows. |
| Shield | Relevant through fail-closed handling for unsupported UI-design, persona, usability, walkthrough, and LLM-agent claims. |
| Watch | Relevant when replay results bind to CI/lifecycle receipts and regression thresholds; no live monitor changed. |
| Enforce | No runtime UI-design policy, human-review policy, prompt policy, or circuit-breaker behavior changed. |
| Vault | No UI artifacts, personas, prompts, outputs, study data, or secure-storage behavior changed. |
| Fleet | Agentic UI-design context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field or external UX-design credential changed. |
| Comply | No compliance mapping changed. |

## Product closure

GAP-0791 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing eval replay corpus primitive. The positive path accepts UI-design context only with AMC-owned replay manifest, fixture hash, fixed seed, source refs, signed evidence refs, row hashes, score delta, and CI receipt. The negative path fails closed when DOI/OpenAlex/title/usability/persona/walkthrough metadata replaces AMC-owned replay evidence.

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, UI-design framework, human-in-the-loop workflow, persona generator, pluralistic-walkthrough evaluator, UX benchmark runner, prompt importer, output importer, paper importer, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0791.

## Fail-closed rule

DOI, OpenAlex work ID, title, human-in-the-loop labels, agentic-framework labels, UI-design labels, large-language-model labels, usability labels, pluralistic-walkthrough labels, persona labels, user-experience-design labels, software-engineering labels, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, source refs, signed evidence refs, row hashes, score delta, CI/lifecycle receipt, Score/Shield/Watch surface coverage, primary-source availability status, and no-copy proof.

## No-bloat boundary

No UI-design framework, human-in-the-loop workflow, persona generator, pluralistic-walkthrough evaluator, UX benchmark runner, Figma/design-tool adapter, prompt importer, output importer, paper importer, OpenAlex importer, DOI resolver, SSRN importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream article prose, abstracts beyond local metadata snippets, datasets, prompts, outputs, personas, UI artifacts, figures, tables, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0791VibeDesignReplayCorpusUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
