# GAP-0817 - Chain-Centric question-explainability boundary

- Gap: `GAP-0817`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: DOI `10.5281/zenodo.20439911`, Zenodo redirect record `20439912`, `https://openalex.org/W7162762070`
- Retrieval: `2026-06-21` via live DOI/Zenodo/OpenAlex header checks. DOI returned HTTP 302 to `https://zenodo.org/doi/10.5281/zenodo.20439911`; Zenodo record `20439911` returned HTTP 302 to `/records/20439912`; OpenAlex API HEAD returned HTTP 200.
- Status: closed through existing question-score explainability receipts; no Chain-Centric importer, DOCX parser, collaboration framework, or source-specific diagnostic path added.

## Live source metadata

This is the same live source reviewed for GAP-0816, but GAP-0817 maps the source to question-level score explainability.

The local backlog names the source as `Chain-Centric Multi-Agent Framework: Layer-Separated LLM Collaboration Without Subjective Confidence Evaluation` and maps it to OpenAlex work `W7162762070`. The backlog row notes No abstract in OpenAlex metadata.

Relevant source-review signals include layer-separated LLM collaboration, subjective confidence evaluation, Chain-Centric framework context, psychology, applied psychology, data collection, process, and perspective concepts. These are question-explainability context only. No upstream DOCX body, framework steps, prompts, examples, diagrams, methodology text, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC because a chain-centric collaboration framework can otherwise obscure why a specific L0-L5 question moved. The correct AMC closure is question-level score explainability: question ID, accepted evidence IDs, rejected evidence reasons, repair hints, missing gate reasons, signed rows, thresholds, and row hashes.

It does not justify importing Chain-Centric artifacts, parsing a DOCX, adding a multi-agent collaboration framework, changing guide/passport semantics, or altering public methodology. DOI, Zenodo, OpenAlex, title, Chain-Centric label, layer-separated LLM collaboration label, subjective confidence evaluation label, or document metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level score explainability rows and repair hints. |
| Shield | Relevant through fail-closed rejected-evidence reasons and missing-gate reasons. |
| Watch | Relevant through replayable question rows and row hashes that can be audited over time. |
| Enforce | No runtime policy or enforcement behavior changed. |
| Vault | No DOCX body, prompts, examples, or secure-storage behavior changed. |
| Fleet | Multi-agent collaboration context only; no orchestration topology or Chain-Centric framework added. |
| Passport | Existing passport artifact boundaries are preserved; no source-specific field changed. |
| Comply | No compliance mapping changed. |

## Product closure

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Chain-Centric importer, DOCX parser, methodology version, diagnostic question bank, guide semantics, passport schema, or scoring semantics changed for GAP-0817.

The focused regression exercises the existing `buildQuestionExplainabilityReport` path with AMC-owned question-level evidence. The positive path requires question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence, row hash, and source refs. The negative path fails closed when DOI/Zenodo/OpenAlex/title/Chain-Centric metadata replaces AMC-owned question evidence.

## Fail-closed rule

DOI, Zenodo redirect, Zenodo record id, OpenAlex id, paper title, Chain-Centric label, layer-separated LLM collaboration label, subjective confidence evaluation label, No abstract in OpenAlex metadata label, psychology concept, data-collection concept, local backlog metadata, or source identity alone must fail closed for question-level score explainability. Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, missing gate reasons, signed rows, thresholds, row hashes, source refs, and no-copy proof.

## No-bloat boundary

No Chain-Centric importer, Zenodo importer, OpenAlex importer, DOCX parser, framework parser, process-model importer, multi-agent collaboration framework, evidence-taxonomy migration, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific diagnostic path, or source-specific scoring path was added. No upstream DOCX body, framework steps, prompts, examples, diagrams, methodology text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0817ChainCentricQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
