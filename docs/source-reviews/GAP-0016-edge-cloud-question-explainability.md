# GAP-0016 - Edge-cloud question-level score explainability

- Gap: `GAP-0016`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Edge-Cloud Collaborative Computing on Distributed Intelligence and Model Optimization: A Survey`
- Retrieval: live arXiv page, OpenAlex API, DOI redirect/IEEE landing behavior, local backlog metadata, and existing AMC question-explainability implementation, 2026-06-26
- Status: Done

## Relevance decision

GAP-0016 is relevant to AMC because it asks for question-level score explainability: why each L0-L5 diagnostic question moved, which evidence was accepted, why other evidence was rejected, and what repair hint is needed. The edge-cloud survey is useful source-review context because it discusses distributed intelligence, model optimization, resource management, privacy protection, security enhancement, performance analysis, benchmarking, and LLMs deployment across heterogeneous edge/cloud environments.

The source reinforces AMC's existing requirement that aggregate maturity labels are not enough for distributed agent and AI-system evaluation. A valid AMC closure must use AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence refs, reproducible eval pack, regression thresholds, row hash, manifest hash, replayable/fail-closed state, and Passport binding when exported.

The source does not justify an edge-cloud runtime, distributed-intelligence simulator, IEEE adapter, arXiv importer, OpenAlex importer, DOI adapter, paper parser, resource-management benchmark, deployment optimizer, or source-specific scoring path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Primary surface. The existing `questionExplainability` receipt explains each question score with accepted evidence IDs, rejected evidence reasons, missing gates, repair hints, score receipt refs, row hashes, replayability, and fail-closed state. |
| Shield | Relevant. Shield reviewers need rejected-evidence reasons and missing gates before accepting distributed-intelligence, privacy, security, or benchmarking claims. |
| Enforce | Out of scope. No runtime policy engine, release gate, circuit breaker, edge/cloud scheduler, or deployment optimizer changed. |
| Vault | Out of scope. No data-residency, privacy store, DLP, secure edge storage, or secret-management behavior changed. |
| Watch | Relevant. Watch explain packets can carry the same question-level proof so operators do not rely on aggregate labels for distributed agent environments. |
| Fleet | Indirect only. Fleet may consume mature question evidence, but this gap does not add orchestration, topology, routing, or edge-cloud simulation behavior. |
| Passport | Relevant through existing compact proof binding: Passport can carry `maturity.questionExplainabilityHash`, replayable/fail-closed flags, and row summaries. |
| Comply | Indirect only. The evidence can support audit review, but no compliance mapping changed. |

## Product closure

No product implementation module changed for this Top-100 closure. Existing AMC behavior already covers the gap:

- `buildQuestionExplainabilityReport` emits question ID, surfaces, claimed/supported/final levels, accepted evidence IDs, signed evidence refs, rejected evidence reasons, missing gate reasons, repair hints, score receipt refs, deterministic row hashes, replayability, fail-closed status, and manifest hash.
- `buildEvalScoreExplainabilityPack` projects that report into a compact proof pack that stays `fail_closed` unless reproducible eval-pack rows and fail-closed thresholds are present.
- Diagnostic JSON and Markdown include `questionExplainability`.
- Watch explain responses include `questionExplainability`.
- Shield exposes score explainability receipts for review.
- Passport binds `maturity.questionExplainabilityHash`, replayable/fail-closed flags, and a compact row summary.

Added focused regression coverage in `tests/gap0016EdgeCloudQuestionExplainabilityBoundary.test.ts` and this source-review note.

Live source facts verified:

- DOI: `https://doi.org/10.1109/COMST.2026.3669216`
- arXiv page: `https://arxiv.org/abs/2505.01821`
- OpenAlex work: `https://openalex.org/W4415028496`
- IEEE DOI target: `https://ieeexplore.ieee.org/document/11417814/`
- Source title: `Edge-Cloud Collaborative Computing on Distributed Intelligence and Model Optimization: A Survey`
- Journal/source: `IEEE Communications Surveys & Tutorials`
- Host organization: Institute of Electrical and Electronics Engineers.
- Publication date: 2026-01-01.
- OpenAlex type: article.
- OpenAlex volume/pages: volume `28`, pages `5049-5080`.
- OpenAlex open-access status: green, with arXiv PDF as OA URL.
- OpenAlex indexing: arXiv, Crossref, DataCite.
- arXiv: Submitted on 3 May 2025 and last revised 18 Mar 2026.
- arXiv comments: Accepted by IEEE ComST. 45 pages, 13 figures, 10 tables.
- arXiv subjects: Distributed, Parallel, and Cluster Computing; Artificial Intelligence; Machine Learning.
- arXiv and OpenAlex context covers edge-cloud collaborative computing, distributed intelligence, model optimization, resource management, latency, energy efficiency, privacy protection, security enhancement, performance analysis, benchmarking, and LLMs deployment.
- Retrieval hashes:
  - arXiv page HTTP 200, effective URL `https://arxiv.org/abs/2505.01821`, first-200KB SHA-256 `3e70d4e67b12984c3db6aa121014fb1be1a2b781428125f4f9a40882cdab91d7`.
  - OpenAlex API HTTP 200, effective URL `https://api.openalex.org/works/W4415028496`, first-200KB SHA-256 `5cff6679947007eb44bf4e24cd7ff1c36585b8504550ac28d48a141dc026023a`.
  - DOI HEAD retrieval returned a 302 redirect to the IEEE document page, then a CloudFront/WAF challenge response at the IEEE target; this is recorded as reachability evidence, not as proof content.

## Fail-closed rule

Question-level score explainability fails closed when question ID is missing, accepted evidence IDs are missing, signed evidence refs are absent, rejected evidence reasons are absent, repair hint is absent, reproducible eval pack proof is absent, regression thresholds are absent, row hash is absent, manifest hash is absent, replayability is false, fail-closed state is unreported, or Passport export lacks the question-explainability binding.

Metadata-only edge-cloud survey evidence fails closed. Article title, DOI, IEEE target, arXiv page, OpenAlex page, publication date, source title, subject labels, green OA status, volume/page metadata, abstract concepts, benchmarking labels, privacy/security labels, LLM deployment labels, accepted-by-IEEE status, or local backlog metadata cannot satisfy AMC question-level proof without AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, reproducible eval-pack rows, thresholds, row hashes, and Passport binding when exported.

## No-bloat boundary

No edge-cloud runtime, distributed-intelligence simulator, resource-management optimizer, deployment scheduler, latency/energy benchmark, IEEE adapter, arXiv importer, OpenAlex importer, DOI adapter, paper parser, citation importer, source-specific API/CLI, Watch monitor, Shield verifier, Passport schema change, public methodology version bump, provider parity claim, copied source prose, copied abstract text, copied figures, copied tables, copied methods, copied equations, copied datasets, copied prompts, copied screenshots, copied configs, or copied implementation details were added.

The survey remains source-review context only. AMC accepts only signed AMC-native question-level score explainability evidence.

## Verification

- Expected-red focused test: `npx vitest run tests/gap0016EdgeCloudQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-0016-edge-cloud-question-explainability.md` did not exist; 3 question-explainability/no-bloat tests passed.
- Live source checks:
  - Web channel opened `https://arxiv.org/abs/2505.01821` and verified title, authors, submitted/revised dates, accepted-by-IEEE comment, related DOI, subjects, and source context.
  - Shell retrieval fetched `https://arxiv.org/abs/2505.01821` with HTTP 200 and hash `3e70d4e67b12984c3db6aa121014fb1be1a2b781428125f4f9a40882cdab91d7`.
  - Shell retrieval fetched `https://api.openalex.org/works/W4415028496` with HTTP 200 and hash `5cff6679947007eb44bf4e24cd7ff1c36585b8504550ac28d48a141dc026023a`.
  - Shell DOI HEAD retrieval showed `https://doi.org/10.1109/COMST.2026.3669216` redirects to `https://ieeexplore.ieee.org/document/11417814/`, which returned a CloudFront/WAF challenge response rather than directly readable article content.
- Focused test: `npx vitest run tests/gap0016EdgeCloudQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired question-explainability regression: `npx vitest run tests/gap0016EdgeCloudQuestionExplainabilityBoundary.test.ts tests/gap0008MedicalAssistantQuestionExplainabilityBoundary.test.ts tests/gap0005BraintrustQuestionExplainabilityBoundary.test.ts tests/questionScoreExplainability.test.ts tests/apiRouters.test.ts tests/passportPublicApiAndCli.test.ts --reporter=dot` passed, 6 files / 105 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1016 files / 8079 tests.
