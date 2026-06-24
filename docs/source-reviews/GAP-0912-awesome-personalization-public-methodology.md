# GAP-0912 - Awesome Personalization in MLLMs public-methodology boundary

- Gap: `GAP-0912`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Clare-Nie/Awesome-Personalization-in-MLLMs`, `https://github.com/Clare-Nie/Awesome-Personalization-in-MLLMs`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 15, Fork 0, Issues 0, Pull requests 0, 53 Commits, README.md, README_zh.md, repository folders `assets` and `docs`, file `.gitignore`, Project Page link, No releases published, Packages 0, and topics `agent`, `retrieval`, `memory`, `evaluation`, `personalization`, `alignment`, `awesome-list`, `mllms`, `personalized-llm`, and `benchamrk`.
- Status: Done - skipped as public-methodology implementation evidence

## Live source metadata

The live README identifies Awesome-Personalization-in-MLLMs as a paper tracking repository for personalization in LLMs and MLLMs, including personalized memory, personalized alignment, personalized retrieval, and personalized evaluation. Relevant source-review signals include long-term goals, evolving preferences, implicit personas, multimodal context, Surveys, Personalized Memory, Memory Architectures, Personalized Memory Architectures, Latent Memory Mechanisms, Personalized Alignment, Omni-modal Embedding Retrieval, Personalized Evaluation, papers, benchmarks, datasets, systems, and a project page.

Those facts are useful source-review context, but they do not change AMC public methodology versioning. The repository is an awesome-list and survey tracker, not an AMC scoring-methodology spec. Personalization awesome-list metadata alone cannot justify a public methodology version bump, methodology version, changelog, deprecation notice, or migration guidance because it does not alter AMC scoring semantics, evidence taxonomy, badge semantics, maturity levels, diagnostic question bank, or public methodology contract. Equivalently, personalization awesome-list metadata alone cannot justify a public methodology version bump.

No upstream list entries, paper tables, dataset references, benchmark rows, images, badges, README prose beyond minimal metadata facts, Chinese README prose, project-page content, paper summaries, publication dates, resource links, examples, screenshots, or implementation details were copied into AMC.

## Relevance decision

`GAP-0912` is relevant only as a public-methodology no-op and source-review boundary. Personalized memory, alignment, retrieval, and evaluation are relevant research context for Score, Shield, and Watch, but the source does not provide an AMC-owned methodology change.

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed. No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed; awesome-list metadata is not methodology-versioning proof. |
| Shield | No new safety methodology claim; personalization list metadata remains fail-closed. |
| Watch | No Watch methodology, monitoring, or drift behavior changed. |
| Enforce | No runtime policy changed. |
| Vault | No personal data, memory corpus, paper tables, benchmark rows, or project-page assets stored. |
| Fleet | No multi-agent topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No product code changed. The focused regression documents the live source metadata and asserts that Awesome-Personalization-in-MLLMs metadata remains absent from AMC public methodology semantics and implementation modules.

This closure is a documented skip for implementation: personalized memory, personalized alignment, personalized retrieval, personalized evaluation, long-term goals, evolving preferences, implicit personas, multimodal context, surveys, paper lists, benchmark links, datasets, systems, project-page links, and topics are not public methodology versioning evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, README_zh.md presence, Star 15, Fork 0, Issues 0, Pull requests 0, 53 Commits, folder names, file names, Project Page presence, No releases published, Packages 0, topics, personalized memory labels, personalized alignment labels, personalized retrieval labels, personalized evaluation labels, long-term goals labels, evolving preferences labels, implicit personas labels, multimodal context labels, Surveys labels, Memory Architectures labels, Omni-modal Embedding Retrieval labels, Personalized Evaluation labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing public methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, evidence-taxonomy change, and scoring-semantics rationale.

## No-bloat boundary

No Awesome-Personalization-in-MLLMs adapter, paper-list importer, project-page crawler, personalization benchmark registry, memory taxonomy importer, alignment taxonomy importer, retrieval taxonomy importer, MLLM personalization evaluator, dataset loader, paper-table normalizer, source-specific scoring rule, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream list entries, paper tables, dataset references, benchmark rows, images, badges, README prose beyond minimal metadata facts, Chinese README prose, project-page content, paper summaries, publication dates, resource links, examples, screenshots, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0912AwesomePersonalizationPublicMethodologyBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the public-methodology implementation leakage check already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0912AwesomePersonalizationPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0911AresDashboardStudioDrilldownBoundary.test.ts tests/gap0912AwesomePersonalizationPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
