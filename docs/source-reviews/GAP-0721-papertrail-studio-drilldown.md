# GAP-0721 - PaperTrail Studio evidence drilldown boundary

- Gap: `GAP-0721`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: arXiv `https://arxiv.org/abs/2602.21045`, backlog OpenAlex `W7131423702`, DOI `10.1145/3772318.3791101`, and title `PaperTrail: A Claim-Evidence Interface for Grounding Provenance in LLM-based Scholarly Q&A`
- Retrieval: `2026-06-21` via browser search and arXiv page review; arXiv lists authors Anna Martin-Boyle, Cara A. C. Leckey, Martha C. Brown, and Harmanpreet Kaur; date `2026-02-24`; CHI 2026/ACM DOI metadata.
- Status: closed through existing AMC Studio/Console/Watch evidence drilldown receipts; no PaperTrail UI, scholarly-QA subsystem, argument extractor, or claim-evidence matcher added.

## Live source metadata

The live arXiv source identifies PaperTrail as a scholarly QA provenance interface that maps claims and evidence to make supported, unsupported, and omitted content visible to researchers. The page lists a CHI 2026 venue context, DOI `10.1145/3772318.3791101`, a within-subjects study with 26 researchers, and a user-interface focus around claim/evidence provenance and trust calibration.

These facts are relevant to AMC as Studio evidence drilldown context only. They are not product requirements to copy a PaperTrail interface, import a scholarly paper pipeline, build an argument extraction engine, or claim parity with the paper. A PaperTrail-style source can support AMC only when the drilldown response is AMC-owned and contains a score route, source artifact links, accepted/rejected evidence previews, trace/receipt/evidence preview hashes, empty/error state receipts, source refs, signed evidence refs, row hashes, and fail-closed behavior.

## Relevance decision

GAP-0721 is relevant to AMC because the backlog asks for Studio evidence drilldown across Score, Shield, and Watch, and AMC already has the generic `buildScoreEvidenceDrilldown` primitive and Watch-side source artifact links. PaperTrail strengthens the no-bloat boundary: claim/evidence provenance ideas can inform the source-review lens, but only AMC-owned signed receipts can drive operator-visible proof.

The accepted AMC primitive is an existing observability Studio drilldown row with `sourceKind: "paper"`. The PaperTrail source is context for source artifact links and paper metadata; the actual claim/evidence preview, route, empty state, error state, trace preview, reasoning trace preview, receipt preview, and fail-closed result must come from AMC evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through the existing score evidence drilldown route that opens a question-level finding and shows accepted/rejected evidence previews. |
| Shield | Relevant through fail-closed handling for unsupported claims, missing evidence refs, empty preview state, and incomplete receipt hashes. |
| Watch | Relevant through source artifact links and trace/receipt/evidence preview hashes that connect operator drilldown to live evidence context. |
| Enforce | No runtime policy, argument-extraction guardrail, or enforcement behavior changed. |
| Vault | No source PDFs, prompts, claims, evidence snippets, study data, or secure-storage behavior changed. |
| Fleet | No multi-agent orchestration or scholarly-QA agent workflow added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No legal, academic-integrity, research-compliance, or audit-control mapping changed. |

## Product closure

GAP-0721 is closed by documenting the live-source boundary and adding regression coverage over the existing evidence drilldown primitive. The positive path proves that PaperTrail-style claim/evidence provenance context is accepted only when AMC-owned drilldown rows carry a valid route, source artifact links, preview hashes, ready evidence state, signed evidence refs, row hashes, and empty/error-state receipts. The negative path proves DOI/OpenAlex/arXiv/title metadata alone fails closed. The empty path proves missing question receipts return an explicit empty state rather than a partial proof.

No `src/diagnostic/evidenceDrilldown.ts`, `src/watch/evidenceDrilldown.ts`, `src/console`, `src/studio`, API, CLI, Studio panel, Watch monitor, Shield verifier, PaperTrail interface, scholarly-QA workflow, argument extraction engine, claim-evidence matcher, source-document parser, ACM importer, OpenAlex importer, arXiv importer, methodology version, diagnostic question bank, package dependency, or scoring behavior changed for GAP-0721.

## Fail-closed rule

Paper title, arXiv id, DOI, OpenAlex work ID, CHI venue metadata, author list, claim/evidence labels, provenance labels, scholarly-QA labels, study-size labels, source identity, or local backlog metadata alone must fail closed for Studio evidence drilldown claims. Passing evidence requires AMC-owned UI route proof, source artifact links, evidence previews, trace preview hash, reasoning trace preview hash, receipt preview hash, evidence preview hash, source-artifact preview hash, empty-state hash, error-state hash, signed evidence refs, row hashes, and no-copy proof.

## No-bloat boundary

No PaperTrail UI, scholarly-QA subsystem, argument extraction engine, claim-evidence matcher, source-document parser, RAG extractor, similarity extractor, LLM extractor, provenance visualization, ACM importer, OpenAlex importer, arXiv importer, paper parser, dataset importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond minimal metadata facts, figures, screenshots, UI layout, study materials, prompts, generated claims, evidence snippets, source documents, datasets, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0721PaperTrailStudioDrilldownBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
