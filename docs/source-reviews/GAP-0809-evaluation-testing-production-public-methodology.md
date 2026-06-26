# GAP-0809 - Evaluation/testing production public-methodology boundary

- Gap: `GAP-0809`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: DOI `10.5281/zenodo.20583928`, Zenodo record `20583928`, `https://openalex.org/W7163809507`
- Retrieval: `2026-06-21` via live header checks. The DOI, Zenodo record, API description link, and OpenAlex API endpoint were source header verified.
- Status: skipped as public-methodology implementation evidence; no public methodology versioning change was made.

## Live source metadata

The local backlog names the source as `Replication package for "Evaluation and Testing of LLM-Based Agents in Production: A Systematic Literature Review"` and maps it to OpenAlex work `W7163809507`.

Live retrieval did not rely only on local metadata. `curl -I --max-time 12 https://doi.org/10.5281/zenodo.20583928` returned HTTP 302 to `https://zenodo.org/doi/10.5281/zenodo.20583928`. `curl -I --max-time 12 https://zenodo.org/records/20583928` returned `HTTP/1.1 200 OK`, described-by links for `https://zenodo.org/api/records/20583928`, a license link to `creativecommons.org/licenses/by/4.0`, and an item link for `replication-package_v1.0.0.zip`. `curl -I --max-time 12 https://api.openalex.org/works/W7163809507` showed that the OpenAlex API HEAD returned HTTP 200 with JSON content headers.

These are useful source-review facts, but they are not AMC public-methodology evidence. No upstream zip, review rows, datasets, package contents, examples, tables, extracted data, code, or metadata body was copied into AMC.

## Relevance decision

This source is relevant to AMC as source-review context for public methodology versioning because production LLM-agent evaluation artifacts can influence how users think about scoring repeatability. It does not justify changing AMC public scoring semantics by itself.

For a public methodology change to pass, AMC needs an AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations update, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, and release lifecycle proof. The source package metadata alone cannot justify a public methodology version bump. GAP-0809 is therefore closed as a documented no-op: the source remains useful context, but no public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; no scoring semantics changed because the source did not supply an AMC-owned methodology version/change record. |
| Shield | Context only; fail-closed boundary protects users from unsupported safety or evaluation-methodology claims. |
| Watch | Context only; no monitoring receipt or public methodology lifecycle event changed. |
| Enforce | No runtime policy, route enforcement, or circuit breaker changed. |
| Vault | No Zenodo zip, package files, review rows, datasets, prompts, examples, or secure-storage behavior changed. |
| Fleet | Production-agent evaluation context only; no orchestration topology or multi-agent benchmark runner added. |
| Passport | No portable proof-bundle field, badge semantics, or public proof token changed. |
| Comply | Audit concept is context only; no compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0809.

The focused regression verifies that DOI, Zenodo, OpenAlex, title, zip item, license, and replication-package metadata stay out of AMC public methodology semantics. No public methodology version bump, changelog update, deprecation notice, migration guidance, badge semantic change, API route, CLI command, or Studio change was added.

## Fail-closed rule

DOI, Zenodo redirect, Zenodo record page, API description link, zip item link, license link, OpenAlex id, title, replication-package label, systematic literature review label, Computer science, Information retrieval, Data extraction, Audit, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing evidence requires AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations text, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, release lifecycle proof, and no-copy proof.

## No-bloat boundary

No replication-package importer, Zenodo importer, OpenAlex importer, systematic-review parser, review-row importer, dataset mirror, benchmark mirror, benchmark runner, production-agent simulator, production-agent evaluation workflow, review-extraction schema, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific methodology path, or source-specific scoring path was added. No upstream zip, review rows, datasets, examples, tables, extracted data, code, package metadata body, benchmark contents, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0809EvaluationTestingProductionPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
