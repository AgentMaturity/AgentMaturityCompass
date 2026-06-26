# GAP-4204 - 12-factor agents knowledge refresh lineage boundary

- Gap: `GAP-4204`
- Dimension: Knowledge refresh lineage
- AMC surfaces requested: Score; Watch; Enforce
- Source reviewed: `humanlayer/12-factor-agents`
- Retrieval: GitHub API repository metadata at `https://api.github.com/repos/humanlayer/12-factor-agents`; GitHub languages API; GitHub license API; README at `https://raw.githubusercontent.com/humanlayer/12-factor-agents/main/README.md`; factor 3 context page at `https://raw.githubusercontent.com/humanlayer/12-factor-agents/main/content/factor-03-own-your-context-window.md`; factor 12 stateless reducer page at `https://raw.githubusercontent.com/humanlayer/12-factor-agents/main/content/factor-12-stateless-reducer.md`; public repository at `https://github.com/humanlayer/12-factor-agents`
- Status: Done
- Source metadata: TypeScript-led repository; repository license metadata reports `NOASSERTION`, while the README badges distinguish Apache 2.0 code license and CC BY-SA 4.0 content license.

## Relevance decision

GAP-4204 is relevant to AMC because RAG and memory-backed agents can change behavior when the underlying corpus refreshes. The source is useful as production LLM software context around the need to own your context window, memory/RAG inputs, and stateless reducer-style operation. It does not prove AMC refresh governance by itself.

The AMC-owned product need is a compact refresh-lineage receipt that binds corpus version, ingestion receipt, source approvals, deletion requests, and score impact. This maps to existing Score, Watch, and Enforce surfaces without adding a source-specific framework adapter.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant. Score changes after a knowledge refresh must cite the affected score rows and deltas. |
| Shield | Not directly changed. Poisoning/staleness defenses remain in the RAG grounding receipt. |
| Enforce | Relevant. Metadata-only or incomplete refresh claims fail closed when ingestion, approval, deletion, or score-impact evidence is missing. |
| Vault | Supporting surface. The receipt lives with Vault evidence because refresh lineage includes retention/deletion handling. |
| Watch | Relevant. Operators can inspect corpus refresh status, affected scores, and fail-closed reasons. |
| Fleet | Indirect. Fleet agents can share a refreshed corpus only after the generic receipt passes. |
| Passport | Not relevant for this gap. No portable trust token changed. |
| Comply | Indirect. Deletion request tracking supports audit posture, but no compliance mapping changed. |

## Product closure

Added `src/vault/knowledgeRefreshLineage.ts` as a generic AMC-owned receipt primitive. It records:

- corpus id, previous version, and refreshed version;
- ingestion job id and ingestion receipt id;
- source approvals with decision, approver, timestamp, and evidence ref;
- deletion requests with status, timestamps, and evidence ref;
- affected Score rows and score deltas;
- source refs, evidence refs, receipt hash, receipt path, and signature path;
- fail-closed reasons for metadata-only or incomplete refresh claims.

The module is exported from the existing Vault barrel and top-level index. No API route, CLI command, public methodology bump, or schema migration was required.

## Fail-closed rule

metadata-only source evidence fails closed. GitHub repository metadata, stars, topics, TypeScript language metadata, README badges, content page titles, factor labels, context-window labels, stateless-reducer labels, RAG labels, memory labels, or local backlog text cannot prove AMC knowledge refresh lineage.

A passing GAP-4204 claim requires an AMC-owned signed refresh-lineage receipt with changed corpus version, ingestion job, ingestion receipt, at least one approved source, deletion request tracking, affected score rows, score impact, source refs, evidence refs, receipt hash, receipt path, and receipt signature.

## No-bloat boundary

No 12-factor adapter, context-window engine, reducer runtime, framework wrapper, source importer, README mirror, content-page mirror, image importer, notebook importer, TypeScript package dependency, RAG runtime, memory store, API route, CLI command, methodology bump, copied docs, copied examples, copied source code, copied images, or source-specific runtime was added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap4204TwelveFactorKnowledgeRefreshLineageBoundary.test.ts --reporter=dot` failed first because `src/vault/knowledgeRefreshLineage.ts` did not exist.
- Behavior implementation check: focused test then passed the receipt, fail-closed, and no-bloat checks and failed only because this source-review document was absent.
- Focused test: `npx vitest run tests/gap4204TwelveFactorKnowledgeRefreshLineageBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression: `npx vitest run tests/gap4204TwelveFactorKnowledgeRefreshLineageBoundary.test.ts tests/gap4203HaystackMemoryMutationPolicyBoundary.test.ts tests/gap4200RagGroundingEvalBoundary.test.ts tests/gap4201RagPoisoningStalenessBoundary.test.ts tests/gap4205FactCheckingGroundingEvalBoundary.test.ts tests/gap4207RagasPoisoningStalenessBoundary.test.ts tests/vault-full.test.ts tests/vault-extensions.test.ts tests/fleetMode.test.ts tests/fleetScoring.test.ts tests/ragMaturity.test.ts --reporter=dot` passed, 11 files / 94 tests.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 958 files / 7827 tests.
