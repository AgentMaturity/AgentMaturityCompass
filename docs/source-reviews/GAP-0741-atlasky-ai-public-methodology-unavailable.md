# GAP-0741 - ATLASky-AI public-methodology unavailable-source boundary

- Gap: `GAP-0741`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7135068047`, DOI `10.1016/j.eswa.2026.131801`, and title `ATLASky-AI: An autonomous framework for physics-based trustworthy verification of LLM-generated spatiotemporal knowledge`
- Retrieval: `2026-06-21` via browser search and direct URL attempts; exact-title, DOI, OpenAlex, Elsevier publisher-domain, and quoted-title searches did not surface a reachable primary source in this environment. Shell network remains DNS-restricted in this environment.
- Status: skipped as a public-methodology version change; no AMC methodology version bump, diagnostic migration, badge change, physics-verification framework, or spatiotemporal reasoning subsystem added.

## Live source metadata

The local backlog identifies a paper titled `ATLASky-AI: An autonomous framework for physics-based trustworthy verification of LLM-generated spatiotemporal knowledge`, DOI `10.1016/j.eswa.2026.131801`, OpenAlex work `W7135068047`, improvement dimension public methodology versioning, category `Agent evaluation and benchmarks`, and concepts including computer science, ground truth, artificial intelligence, data mining, anomaly detection, false positive paradox, architecture, and graph. The backlog abstract snippet references a five-module agent architecture that detects hallucinations missed by single-agent approaches. Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title, DOI, OpenAlex, Elsevier publisher-domain, and quoted-title searches did not surface a reachable primary source.

These metadata facts are useful as source-review context only. They do not by themselves define an AMC methodology version, scoring rule, changelog, deprecation notice, migration guidance, validation artifact, signed evidence receipt, badge rule, or public comparability contract. No upstream paper prose, abstract text beyond local backlog metadata, figures, tables, workflows, architecture diagrams, datasets, prompts, examples, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0741 is relevant to AMC only as public-methodology boundary evidence. Physics-based verification, spatiotemporal knowledge, ground-truth comparison, anomaly detection, and multi-agent hallucination checks can inform future evidence taxonomy work, but an unavailable metadata-only source cannot change public Score, Shield, or Watch methodology semantics.

The accepted AMC primitive is the existing public methodology manifest and versioning path. This slice intentionally does not change that path because the DOI/OpenAlex/title metadata and backlog abstract snippet do not provide AMC-owned methodology proof. A source citation to the paper can be retained only as context; any public methodology claim still requires AMC-owned methodology versioning receipts, validation artifacts, signed evidence refs, row hashes, badge assurance, and report-binding proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Background physics-verification/evidence-taxonomy context only; no accepted public scoring-methodology proof or version bump. |
| Shield | Background hallucination/anomaly context only; no new safety threshold or assurance rule. |
| Watch | Background spatiotemporal verification context only; no new drift methodology, monitor, or alert. |
| Enforce | No runtime physics rule, spatiotemporal verifier, or policy-enforcement behavior changed. |
| Vault | No datasets, traces, geospatial/time-series records, prompts, outputs, or secure-storage behavior changed. |
| Fleet | Multi-agent verification context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field, badge credential, or external proof token changed. |
| Comply | Verification context only; no compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, scoring code, Watch monitor, Shield verifier, Enforce runtime, physics-verification framework, spatiotemporal reasoner, anomaly detector, or public methodology docs changed for GAP-0741.

The closure is an unavailable-source no-bloat source-review boundary: ATLASky-AI, physics-based verification, spatiotemporal knowledge, ground truth, anomaly detection, false-positive, five-module agent, DOI, OpenAlex, and title labels are not accepted as public methodology proof without AMC-owned methodology receipts.

## Fail-closed rule

OpenAlex work ID, DOI, title, ATLASky-AI labels, physics-based verification labels, LLM-generated spatiotemporal knowledge labels, ground-truth labels, anomaly-detection labels, false-positive labels, five-module agent labels, hallucination labels, architecture labels, graph labels, publisher identity, local backlog metadata, or source identity alone must fail closed for public methodology claims. Passing evidence requires AMC-owned methodology versioning receipts, versioned scoring rules, changelog rows, deprecation notice, migration guidance, validation artifacts, signed evidence refs, row hashes, badge assurance, report-binding proof, and no-copy proof.

## No-bloat boundary

No ATLASky-AI framework, physics verifier, spatiotemporal reasoner, ground-truth comparator, anomaly detector, false-positive analyzer, five-agent architecture, hallucination detector, paper importer, Elsevier importer, OpenAlex importer, methodology version bump, badge parameter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Enforce policy module, Passport field, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, figures, tables, workflows, architecture diagrams, datasets, prompts, examples, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0741AtlaskyPublicMethodologyUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
