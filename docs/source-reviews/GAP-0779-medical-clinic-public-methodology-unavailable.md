# GAP-0779 - Medical clinic virtual assistant public-methodology unavailable-source boundary

- Gap: `GAP-0779`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7122760289`, `https://doi.org/10.3390/electronics15020334`
- Retrieval: `2026-06-21` via live browser/search checks; shell network remains DNS-restricted in this environment.
- Status: source unavailable; skipped as public-methodology implementation evidence.

## Live retrieval result

The local backlog identifies the source as `Designing an Architecture of a Multi-Agentic AI-Powered Virtual Assistant Using LLMs and RAG for a Medical Clinic`, OpenAlex work `W7122760289`, and DOI `10.3390/electronics15020334`. During this pass, live retrieval did not produce a usable primary source page or independent source page for the paper:

- exact-title search for `Designing an Architecture of a Multi-Agentic AI-Powered Virtual Assistant Using LLMs and RAG for a Medical Clinic` returned no usable primary/source result.
- DOI search for `10.3390/electronics15020334` returned no usable primary/source result.
- OpenAlex search for `W7122760289` returned no usable primary/source result.

The backlog row may be a future, removed, unreleased, private, or incorrectly indexed article record. AMC cannot use it as public methodology evidence without a reachable source and reviewable method/evidence details. No upstream abstract prose beyond the local metadata identifiers above, clinic workflows, patient data, virtual-assistant architecture, RAG prompts, model outputs, screenshots, configs, docs text, or implementation details were copied into AMC.

## Relevance decision

Public methodology versioning is relevant to AMC only when scoring semantics, evidence taxonomy, limitations, badge semantics, deprecation notices, or migration guidance actually change. GAP-0779 does not supply those facts because the cited source was unavailable during live verification.

Therefore GAP-0779 is closed as a documented skip. The source is not rejected because multi-agent virtual assistants, medical-clinic workflows, RAG, interpretability, HCI, or architecture are irrelevant; it is rejected because unavailable paper metadata alone cannot justify a public methodology version bump, badge semantics change, or scoring-methodology change.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No methodology version, scoring semantics, evidence taxonomy, or limitations changed. |
| Shield | Medical-clinic assistant metadata alone is not assurance evidence. |
| Watch | No drift methodology, alert semantics, or lifecycle receipt changed. |
| Comply | Medical/clinic context only; no healthcare compliance mapping changed. |
| Enforce | No runtime virtual-assistant, clinical, RAG, or guardrail policy changed. |
| Vault | No patient data, clinic data, prompts, or secure-storage behavior changed. |
| Fleet | Multi-agent architecture context only; no orchestration or topology changed. |
| Passport | No badge, token, or proof-bundle semantics changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0779. Existing AMC public methodology remains unchanged because the source was unavailable and because medical-clinic assistant architecture metadata does not define an AMC scoring semantics change.

The source-review closure is the product boundary: source unavailable, skipped as public-methodology implementation evidence, with tests ensuring source-specific identifiers stay out of public methodology and versioning surfaces.

## Fail-closed rule

Unavailable paper metadata alone must fail closed for public methodology claims. Local backlog metadata, title text, DOI, OpenAlex id, medical-clinic labels, virtual-assistant labels, multi-agentic labels, RAG labels, interpretability labels, architecture labels, HCI labels, partial abstract snippets, category labels, generated gap wording, or source identity are not enough to pass. Passing evidence for a methodology change requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, public limitation text, evidence taxonomy change, signed evidence refs, row hashes, and no-copy proof.

## No-bloat boundary

No public methodology version bump, medical-clinic virtual-assistant methodology, RAG assistant adapter, clinic workflow, patient-data importer, virtual-patient model, MDPI/OpenAlex importer, DOI resolver, source-specific badge semantics, diagnostic question-bank migration, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, or source-specific scoring path was added. No upstream abstract prose beyond local metadata identifiers, clinic workflows, patient data, virtual-assistant architecture, RAG prompts, model outputs, screenshots, configs, docs text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0779MedicalClinicPublicMethodologyUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
