# GAP-0659 — RAG service-discovery live-drift boundary

- Gap: `GAP-0659`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7129177026` / DOI `10.1109/tsc.2026.3665441`
- Corroborating primary source reached: `https://arxiv.org/abs/2505.19310`
- Retrieval: `2026-06-21`; browser access to arXiv succeeded, while shell API retrieval for OpenAlex, Crossref, and DOI failed with DNS resolution errors in the restricted environment.
- Status: relevant only through existing Watch live score/behavior drift receipts; no RAG chunking, service-discovery, OpenAPI, SOCBench-D, RestBench, paper importer, or benchmark mirror added.

## Live source metadata

The accessible primary arXiv page identified the title `Retrieval-Augmented Generation for Service Discovery: Chunking Strategies and Benchmarking`, authors Robin D. Pesl, Jerin G. Mathew, Massimo Mecella, and Marco Aiello, submission date `2025-05-25`, subject areas `cs.SE` and `cs.AI`, and arXiv DOI `10.48550/arXiv.2505.19310`.

The local backlog row maps the gap to OpenAlex work `W7129177026`, DOI `10.1109/tsc.2026.3665441`, and the live-drift dimension. Because direct shell retrieval from `api.openalex.org`, `api.crossref.org`, and `doi.org` failed with DNS errors, those local DOI/OpenAlex/Crossref fields are retained only as source identity context here, not as accepted live API evidence.

## Relevance decision

The source is relevant to AMC only as RAG/service-discovery context for live behavior drift. RAG chunking and endpoint-discovery benchmarks can motivate why a production agent's retrieval behavior, score windows, latency, cost, and action choices must be monitored over time, but the source does not provide AMC-owned baseline/live windows, trace rows, evaluator configs, thresholds, signed evidence, row hashes, or Watch alert receipts.

GAP-0659 is therefore closed through existing `live-score-behavior-drift` receipts. Metadata-only source identity, paper title, arXiv metadata, DOI/OpenAlex backlog fields, benchmark names, or service-discovery framing must not pass as Score, Shield, or Watch evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Only through AMC-owned score-window evidence tied to signed baseline/live trace rows. |
| Shield | Only when signed drift evidence supports a safety, retrieval-quality, unsupported-action, or policy-relevant behavior regression. |
| Watch | Yes, through existing `liveDriftAlerts` receipts and Watch alert builders. |
| Enforce | No policy-enforcement change. |
| Vault | No secrets, storage, or data-residency change. |
| Fleet | No orchestration or routing-topology implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No compliance mapping or regulated-domain claim. |

## Product closure

GAP-0659 is closed by documenting the source-review boundary and adding regression coverage that exercises the existing Watch live score/behavior drift receipt path with AMC-owned synthetic service-discovery/RAG traces. The accepted product primitive remains generic live drift: baseline and live rows, behavior signatures, latency/cost deltas, signed evidence refs, thresholds, receipt hash, and Watch alert projection.

## Fail-closed rule

ArXiv metadata, DOI/OpenAlex/Crossref identity fields, source title, author list, submission date, subject labels, service-discovery framing, RAG chunking terminology, benchmark names, citation metadata, local backlog metadata, and failed API retrieval attempts must fail closed for live-drift claims. Passing evidence requires AMC-owned baseline/live windows, trace rows, evaluator configs, threshold policies, signed evidence refs, row hashes, receipt hashes, and Watch alert or waiver proof.

## No-bloat boundary

No RAG chunking subsystem, service-discovery engine, OpenAPI parser, Discovery Agent clone, SOCBench-D or RestBench mirror, paper importer, paper-content parser, benchmark adapter, provider adapter, route, API, CLI behavior, methodology version bump, or parity claim was added. No paper prose, abstract text, figures, tables, prompts, datasets, benchmark rows, results, source code, configs, examples, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0659RagServiceDiscoveryLiveDriftBoundary.test.ts --reporter=dot`
- Focused adjacent regression: `npx vitest run tests/gap0658GenerativeAgentsLiveDriftBoundary.test.ts tests/gap0659RagServiceDiscoveryLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: attempted with `npm test -- --reporter=dot`; blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
