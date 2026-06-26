# GAP-0816 - Chain-Centric public-methodology boundary

- Gap: `GAP-0816`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: DOI `10.5281/zenodo.20439912`, Zenodo record `20439912`, `https://openalex.org/W7162762945`
- Retrieval: `2026-06-21` via live header checks. The DOI, Zenodo record, API description link, license link, item link, and OpenAlex API endpoint were source header verified.
- Status: skipped as public-methodology implementation evidence; no public methodology versioning change was made.

## Live source metadata

The local backlog names the source as `Chain-Centric Multi-Agent Framework: Layer-Separated LLM Collaboration Without Subjective Confidence Evaluation` and maps it to OpenAlex work `W7162762945`. The backlog row notes No abstract in OpenAlex metadata.

Live retrieval did not rely only on local metadata. `curl -I --max-time 12 https://doi.org/10.5281/zenodo.20439912` returned HTTP 302 to `https://zenodo.org/doi/10.5281/zenodo.20439912`. `curl -I --max-time 12 https://zenodo.org/records/20439912` returned `HTTP/1.1 200 OK`, described-by links for `https://zenodo.org/api/records/20439912`, a license link to `creativecommons.org/licenses/by/4.0`, and an item link containing `Chain-Centric_V8`. `curl -I --max-time 12 https://api.openalex.org/works/W7162762945` showed that the OpenAlex API HEAD returned HTTP 200 with JSON content headers.

These facts are useful source-review context for layer-separated LLM collaboration and subjective confidence evaluation boundaries. They are not AMC public methodology evidence. No upstream DOCX, document body, diagrams, examples, prompts, process artifacts, framework steps, implementation details, or methodology text was copied into AMC.

## Relevance decision

This source is relevant to AMC as source-review context for public methodology versioning because chain-centric multi-agent collaboration could be confused with a scoring-methodology change. It does not justify changing AMC public scoring semantics by itself.

For a public methodology change to pass, AMC needs an AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations update, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, and release lifecycle proof. The source document metadata alone cannot justify a public methodology version bump. GAP-0816 is therefore closed as a documented no-op: the source remains useful context, but no public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; no scoring semantics changed because the source did not supply an AMC-owned methodology version/change record. |
| Shield | Context only; fail-closed boundary protects users from unsupported methodology claims. |
| Watch | Context only; no monitoring receipt or public methodology lifecycle event changed. |
| Enforce | No runtime policy, route enforcement, or circuit breaker changed. |
| Vault | No DOCX body, examples, prompts, framework steps, or secure-storage behavior changed. |
| Fleet | Multi-agent collaboration context only; no orchestration topology or chain-centric framework added. |
| Passport | No portable proof-bundle field, badge semantics, or public proof token changed. |
| Comply | Psychology/applied-psychology context only; no compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0816.

The focused regression verifies that DOI, Zenodo, OpenAlex, title, DOCX item, license, and Chain-Centric metadata stay out of AMC public methodology semantics. No public methodology version bump, changelog update, deprecation notice, migration guidance, badge semantic change, API route, CLI command, or Studio change was added.

## Fail-closed rule

DOI, Zenodo redirect, Zenodo record page, API description link, DOCX item link, license link, OpenAlex id, title, Chain-Centric label, layer-separated LLM collaboration label, subjective confidence evaluation label, psychology concept, computer-science concept, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing evidence requires AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations text, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, release lifecycle proof, and no-copy proof.

## No-bloat boundary

No Chain-Centric importer, Zenodo importer, OpenAlex importer, DOCX parser, framework parser, process-model importer, multi-agent collaboration framework, evidence-taxonomy migration, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific methodology path, or source-specific scoring path was added. No upstream DOCX, document body, diagrams, examples, prompts, process artifacts, framework steps, implementation details, or methodology text was copied.

## Verification

- Focused regression: `npx vitest run tests/gap0816ChainCentricPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
