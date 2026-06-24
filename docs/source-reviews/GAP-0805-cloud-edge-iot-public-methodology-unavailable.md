# GAP-0805 - Cloud-edge-IoT public-methodology unavailable-source boundary

- Gap: `GAP-0805`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog DOI `10.5281/zenodo.20591969`, OpenAlex work `W7163869541`, and title `Multi-agent LLMs on the Cloud-Edge-IoT Continuum: A Systematic Mapping Study on Architectures, Deployment, and Evaluation`
- Retrieval: `2026-06-21` via live browser/search checks; shell network remains restricted in this environment.
- Status: source unavailable; skipped as public-methodology implementation evidence.

## Live retrieval result

The local backlog identifies the source as `Multi-agent LLMs on the Cloud-Edge-IoT Continuum: A Systematic Mapping Study on Architectures, Deployment, and Evaluation`, DOI `10.5281/zenodo.20591969`, and OpenAlex work `W7163869541`. During this pass, live retrieval did not produce a usable primary source page or independent source page for the paper:

- exact-title search returned no usable primary/source result.
- DOI search for `10.5281/zenodo.20591969` returned no usable primary/source result.
- DOI URL search for `https://doi.org/10.5281/zenodo.20591969` returned no usable primary/source result.
- Zenodo search for `20591969` returned no usable primary/source result.
- OpenAlex search for `W7163869541` returned no usable primary/source result.

The OpenAlex snippet in the backlog has `No abstract in OpenAlex metadata`, so AMC cannot use this source to substantiate exact architecture, deployment, or evaluation claims. Local metadata identifies cloud-edge-IoT continuum and systematic mapping study context only. No upstream article prose, mapping tables, architecture diagrams, deployment recipes, edge-device data, IoT telemetry, prompts, model outputs, figures, benchmark rows, configs, docs text, or implementation details were copied into AMC.

## Relevance decision

Public methodology versioning is relevant to AMC only when scoring semantics, evidence taxonomy, limitations, badge semantics, deprecation notices, or migration guidance actually change. GAP-0805 does not supply those facts because the cited source was unavailable during live verification.

Therefore GAP-0805 is closed as a documented skip. The source is not rejected because cloud-edge-IoT continuum, systematic mapping study, architectures, deployment, or evaluation are irrelevant; it is rejected because unavailable source metadata alone cannot justify a public methodology version bump, badge semantics change, or scoring-methodology change.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No methodology version, scoring semantics, evidence taxonomy, benchmark criteria, or public limitation text changed. |
| Shield | Cloud-edge-IoT mapping metadata alone is not assurance evidence. |
| Watch | No drift methodology, alert semantics, regression threshold, or lifecycle receipt changed. |
| Fleet | Multi-agent LLM deployment context only; no orchestration topology or continuum framework changed. |
| Enforce | No runtime cloud, edge, IoT, deployment, or network policy changed. |
| Vault | No IoT telemetry, edge data, prompts, or secure-storage behavior changed. |
| Passport | No badge, token, proof bundle, or external credential semantics changed. |
| Comply | No IoT, infrastructure, privacy, or data-residency compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0805. Existing AMC public methodology remains unchanged because the source was unavailable and because cloud-edge-IoT mapping metadata does not define an AMC scoring semantics change.

The source-review closure is the product boundary: source unavailable, skipped as public-methodology implementation evidence, with tests ensuring source-specific identifiers stay out of public methodology and versioning surfaces.

## Fail-closed rule

Unavailable source metadata alone must fail closed for public methodology claims. Local backlog metadata, title text, DOI, OpenAlex id, No abstract in OpenAlex metadata, cloud-edge-IoT continuum labels, systematic mapping study labels, architectures labels, deployment labels, evaluation labels, category labels, generated gap wording, or source identity are not enough to pass. Passing evidence for a methodology change requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, public limitation text, evidence taxonomy change, signed evidence refs, row hashes, and no-copy proof.

## No-bloat boundary

No public methodology version bump, cloud-edge-IoT methodology, systematic mapping methodology, architecture catalog, deployment framework, edge-device simulator, IoT telemetry importer, Zenodo importer, OpenAlex importer, DOI resolver, source-specific badge semantics, diagnostic question-bank migration, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, or source-specific scoring path was added. No upstream article prose, mapping tables, architecture diagrams, deployment recipes, edge-device data, IoT telemetry, prompts, model outputs, figures, benchmark rows, configs, docs text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0805CloudEdgeIotPublicMethodologyUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
