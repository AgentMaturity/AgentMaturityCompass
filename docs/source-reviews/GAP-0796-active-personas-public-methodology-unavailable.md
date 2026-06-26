# GAP-0796 - Active Personas public-methodology unavailable-source boundary

- Gap: `GAP-0796`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog DOI `10.1007/978-3-032-14518-5_20`, OpenAlex work `W7124467215`, and title `Active Personas for Synthetic User Feedback: A Design Science Study`
- Retrieval: `2026-06-21` via live browser/search checks; shell network remains restricted in this environment.
- Status: source unavailable; skipped as public-methodology implementation evidence.

## Live retrieval result

The local backlog identifies the source as `Active Personas for Synthetic User Feedback: A Design Science Study`, DOI `10.1007/978-3-032-14518-5_20`, and OpenAlex work `W7124467215`. During this pass, live retrieval did not produce a usable primary source page or independent source page for the paper:

- exact-title search for `Active Personas for Synthetic User Feedback: A Design Science Study` returned no usable primary/source result.
- DOI search for `10.1007/978-3-032-14518-5_20` returned no usable primary/source result.
- OpenAlex search for `W7124467215` returned no usable primary/source result.

The backlog row may be a future, removed, gated, unpublished, or incorrectly indexed chapter record. AMC cannot use it as public methodology evidence without a reachable source and reviewable method/evidence details. No upstream chapter prose, persona prompts, synthetic user feedback examples, usability tasks, product-design artifacts, datasets, model outputs, statistics tables, figures, screenshots, configs, docs text, or implementation details were copied into AMC.

## Relevance decision

Public methodology versioning is relevant to AMC only when scoring semantics, evidence taxonomy, limitations, badge semantics, deprecation notices, or migration guidance actually change. GAP-0796 does not supply those facts because the cited source was unavailable during live verification.

Therefore GAP-0796 is closed as a documented skip. The source is not rejected because persona research, synthetic user feedback, design science, usability, human-computer interaction, computer science, product design, user-centered design, user experience design, or usability engineering are irrelevant; it is rejected because unavailable paper metadata alone cannot justify a public methodology version bump, badge semantics change, or scoring-methodology change.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No methodology version, scoring semantics, evidence taxonomy, benchmark criteria, or public limitation text changed. |
| Shield | Persona/usability metadata alone is not assurance evidence. |
| Watch | No drift methodology, alert semantics, regression threshold, or lifecycle receipt changed. |
| Fleet | Synthetic persona context only; no orchestration or trust-topology behavior changed. |
| Enforce | No runtime persona, user-feedback, product-design, or HCI policy changed. |
| Vault | No user-feedback data, persona artifacts, prompts, or secure-storage behavior changed. |
| Passport | No badge, token, proof bundle, or external credential semantics changed. |
| Comply | No compliance, privacy, consent, accessibility, or user-research mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0796. Existing AMC public methodology remains unchanged because the source was unavailable and because persona/synthetic-feedback metadata does not define an AMC scoring semantics change.

The source-review closure is the product boundary: source unavailable, skipped as public-methodology implementation evidence, with tests ensuring source-specific identifiers stay out of public methodology and versioning surfaces.

## Fail-closed rule

Unavailable paper metadata alone must fail closed for public methodology claims. Local backlog metadata, title text, DOI, OpenAlex id, persona labels, synthetic user feedback labels, design science labels, usability labels, human-computer interaction labels, user-centered design labels, user experience design labels, usability engineering labels, partial abstract snippets, category labels, generated gap wording, or source identity are not enough to pass. Passing evidence for a methodology change requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, public limitation text, evidence taxonomy change, signed evidence refs, row hashes, and no-copy proof.

## No-bloat boundary

No public methodology version bump, active-personas methodology, synthetic user feedback evaluator, persona generator, user-research simulator, product-design workflow, usability benchmark, HCI adapter, Springer importer, OpenAlex importer, DOI resolver, source-specific badge semantics, diagnostic question-bank migration, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, or source-specific scoring path was added. No upstream chapter prose, persona prompts, synthetic user feedback examples, usability tasks, product-design artifacts, datasets, model outputs, statistics tables, figures, screenshots, configs, docs text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0796ActivePersonasPublicMethodologyUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
