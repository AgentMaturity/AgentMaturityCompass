# GAP-0952 - DIVE hydrogen public-methodology boundary

- Gap: `GAP-0952`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: OpenAlex `https://openalex.org/W4414991289`, DOI `https://doi.org/10.1039/d5sc09921h`, and live RSC Chemical Science article page `https://pubs.rsc.org/en/content/articlelanding/2026/sc/d5sc09921h`
- Retrieval: `2026-06-22` via live DOI/RSC source review
- Status: Done - skipped as public-methodology implementation evidence

## Live source metadata

The DOI resolved to the live RSC Chemical Science article page for `"DIVE" into hydrogen storage materials discovery with AI agents`. The page identified Chemical Science, Issue 6, 2026, article type Edge Article, and Open Access status. It listed Submitted 18 Dec 2025, Accepted 18 Jan 2026, First published 03 Feb 2026, citation metadata Chem. Sci., 2026,17, 3031-3042, and Creative Commons Attribution-NonCommercial 3.0 Unported Licence.

The article abstract describes the Descriptive Interpretation of Visual Expression (DIVE) multi-agent workflow, says it reads and organizes experimental data from graphical elements in scientific literature, and applies the workflow to solid-state hydrogen storage materials. It reports 10-15% extraction gains over commercial models, over 30% relative to open-source models, a curated database of over 30 000 entries from >4000 publications, a rapid inverse-design AI workflow, proposing new materials within minutes, and multimodal AI agents for literature-embedded scientific knowledge.

Those facts are useful research context for autonomous scientific workflows and agent evaluation. They do not change AMC public methodology versioning because the paper is a domain-specific materials-discovery workflow, not an AMC scoring-methodology specification.

## Relevance decision

`GAP-0952` is relevant only as a public-methodology no-op and source-review boundary. The DIVE paper is adjacent to Score, Shield, and Watch because it discusses an AI-agent workflow and evaluation-style extraction improvements, but DIVE paper metadata alone cannot justify a public methodology version bump, methodology version, changelog, deprecation notice, or migration guidance in AMC.

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed. No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed; DIVE paper metadata is not AMC methodology-versioning proof. |
| Shield | Domain research context only; no Shield safety methodology changed. |
| Watch | Workflow/evaluation context only; no Watch methodology or runtime behavior changed. |
| Enforce | No runtime policy changed. |
| Vault | No paper PDFs, supplementary files, extracted datasets, figures, movies, or upstream artifacts stored. |
| Fleet | Multi-agent workflow context only; no Fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance mapping changed. |

## Product closure

No product code changed. The focused regression documents the live source metadata and asserts that this gap does not add `https://openalex.org/W4414991289`, `https://doi.org/10.1039/d5sc09921h`, or `dive_hydrogen_public_methodology` to AMC public methodology semantics or public-methodology implementation modules.

This closure is a documented skip for implementation: paper title, DOI, OpenAlex ID, RSC article metadata, abstract claims, extraction-gain claims, database-size claims, inverse-design workflow claims, Open Access labels, publication dates, citation details, license labels, and supplementary file availability are not public methodology versioning evidence.

## Fail-closed rule

OpenAlex metadata, DOI reachability, live RSC reachability, Chemical Science labels, Issue 6, 2026 labels, Edge Article labels, Open Access labels, Submitted 18 Dec 2025, Accepted 18 Jan 2026, First published 03 Feb 2026, Chem. Sci., 2026,17, 3031-3042, Creative Commons Attribution-NonCommercial 3.0 Unported Licence, Descriptive Interpretation of Visual Expression (DIVE) multi-agent workflow labels, graphical-elements extraction labels, solid-state hydrogen storage materials labels, 10-15% extraction gain labels, over 30% relative-to-open-source-model labels, over 30 000 entries labels, >4000 publications labels, rapid inverse-design AI workflow labels, proposing new materials within minutes labels, multimodal AI agents labels, local backlog metadata, or paper identity alone must fail closed for public methodology versioning.

Passing public methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, evidence-taxonomy change, scoring-semantics rationale, and badge compatibility analysis. DIVE paper metadata alone cannot justify a public methodology version bump.

## No-bloat boundary

No DIVE workflow adapter, chemistry/materials subsystem, paper importer, DOI resolver, OpenAlex importer, RSC scraper, PDF parser, supplementary-file importer, figure extractor, database mirror, inverse-design workflow, multimodal extraction runner, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, source-specific scoring path, or parity wrapper was added. No RSC article prose beyond minimal metadata facts, paper PDFs, figures, supplementary files, movies, datasets, examples, configs, prompts, benchmark rows, model outputs, generated outputs, or implementation details were copied into AMC.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0952DiveHydrogenPublicMethodologyBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the implementation leakage check already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0952DiveHydrogenPublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
- Paired regression with `GAP-0951`: `npx vitest run tests/gap0951HaystackQuestionExplainabilityBoundary.test.ts tests/gap0952DiveHydrogenPublicMethodologyBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
