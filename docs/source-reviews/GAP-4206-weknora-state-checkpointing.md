# GAP-4206 — WeKnora state checkpointing

- Gap: `GAP-4206`
- Dimension: State checkpoint and rollback proof
- AMC surfaces requested: Score; Watch; Enforce
- Source reviewed: `Tencent/WeKnora`
- Retrieval: GitHub repository API, GitHub languages API, GitHub license API, README, root source inventory, internal source inventory, and license text, retrieved 2026-06-25
- Status: Done

## Relevance decision

WeKnora is relevant to AMC as RAG and agent-knowledge-platform context, not as a dependency. Live GitHub metadata identifies `Tencent/WeKnora` as a public Go-led repository with topics around RAG, agents, embeddings, evaluation, semantic search, vector search, question answering, wiki, and multi-tenant operation. The README describes WeKnora as an enterprise-grade document understanding, semantic retrieval, and autonomous reasoning framework with RAG-based Quick Q&A, a ReAct Agent, Wiki Mode, Langfuse observability, tenant RBAC, multi-source ingestion, vector database options, and private deployment/data sovereignty.

GAP-4206 is relevant because RAG and memory transitions can corrupt retrieval state, reasoning-memory cursors, wiki graph state, or citation provenance. AMC already had a generic runtime checkpoint primitive from GAP-1942; this gap tightens the primitive by projecting restore proof into Score, Watch, and Enforce so restore divergence creates a score penalty and an enforcement block.

The required proof is checkpoint hash, restore test, state diff, and retention policy. Source metadata, README claims, stars, topics, language stats, or license badges cannot prove a safe AMC restore path.

## Source retrieval

- Public repository: `https://github.com/Tencent/WeKnora`
- GitHub API: `https://api.github.com/repos/Tencent/WeKnora`
- GitHub languages API: `https://api.github.com/repos/Tencent/WeKnora/languages`
- GitHub license API: `https://api.github.com/repos/Tencent/WeKnora/license`
- README: `https://raw.githubusercontent.com/Tencent/WeKnora/main/README.md`
- License text: `https://raw.githubusercontent.com/Tencent/WeKnora/main/LICENSE`
- Homepage: `https://weknora.weixin.qq.com`
- Source inventory checked through GitHub contents API at repository root and `internal/`.

Live source notes:

- GitHub license API reports `NOASSERTION`, while the README badge and license text state MIT License with third-party components under other terms.
- The repository is Go-led, with additional Vue, TypeScript, Python, Shell, database, Docker, and frontend sources.
- The source inventory includes `cmd`, `cli`, `client`, `internal`, `mcp-server`, `migrations`, `frontend`, `docreader`, `helm`, `deploy`, `tests`, and related runtime/source folders.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant. Restore proof now carries a score-impact projection so corrupted RAG or memory restore state lowers confidence. |
| Shield | Adjacent only. Divergence may become an assurance finding, but no Shield pack changed. |
| Enforce | Relevant. Restore failure or state divergence now maps to a blocking enforcement action. |
| Vault | Relevant through existing signed checkpoint and restore proof artifact retention. |
| Watch | Relevant. Watch can inspect restore status, state diff, score impact, and enforcement action in the audit export. |
| Fleet | Relevant through the existing runtime run and checkpoint owner path, but no fleet topology change was needed. |
| Passport | Downstream only; no Passport bundle schema changed. |
| Comply | Adjacent only; retention policy supports audit review, but no compliance mapping changed. |

## Product closure

Updated the generic AMC runtime state restore proof in `src/runtime/stateCheckpoint.ts`:

- Restore proofs now include `assurance.surfaceBinding = ["Score", "Watch", "Enforce"]`.
- Passing restore tests with zero state diff emit `enforcementAction: "allow"` and zero score penalty.
- Failed or divergent restore tests emit `enforcementAction: "block"` and a bounded score penalty.
- Verification fails closed if the assurance surface, action, or score impact is inconsistent with restore state.
- Audit exports now show enforcement action and score impact.

The focused GAP-4206 fixture proves a RAG/memory transition checkpoint with knowledge-base id, retrieval corpus version, reasoning-memory cursor, memory policy id, wiki graph hash, citation provenance receipt id, retention policy, checkpoint hash, restore proof, and state diff behavior.

## Fail-closed rule

metadata-only WeKnora evidence fails closed. GitHub metadata, stars, topics, language facts, README text, source inventory, license facts, RAG labels, agent labels, wiki labels, Langfuse labels, RBAC labels, or local backlog text cannot prove checkpoint safety.

A passing claim requires AMC-owned runtime run evidence, signed checkpoint path, checkpoint hash, state hash, state snapshot, evidence references, retention policy, signed restore proof, restore-test evidence, zero state diff, and consistent Score/Watch/Enforce assurance projection.

Missing state snapshot, missing checkpoint path, missing signature, checkpoint hash mismatch, state hash mismatch, missing transition id, missing checkpoint evidence, invalid retention policy, missing restore-test evidence, restore-state mismatch, missing proof path, missing proof signature, inconsistent assurance action, invalid score impact, or fail-open restore status fails closed.

## No-bloat boundary

No WeKnora adapter, importer, RAG platform clone, knowledge-base connector, vector database connector, Langfuse connector, RBAC mirror, wiki subsystem, MCP wrapper, CLI wrapper, Helm mirror, Docker profile, source-code copy, README copy, image copy, source-specific API/CLI, methodology bump, or source-specific runtime was added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap4206WeknoraStateCheckpointBoundary.test.ts --reporter=dot` failed first because the source-review doc and restore assurance projection were missing.
- Focused test: `npx vitest run tests/gap4206WeknoraStateCheckpointBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related runtime/RAG tests: `npx vitest run tests/gap4206WeknoraStateCheckpointBoundary.test.ts tests/gap1942RuntimeStateCheckpointBoundary.test.ts tests/gap1952PlatoRuntimeStateCheckpointBoundary.test.ts tests/gap1838RuntimeLifecycleGraphBoundary.test.ts tests/runtimeRunManager.test.ts tests/gap4203HaystackMemoryMutationPolicyBoundary.test.ts tests/gap4204TwelveFactorKnowledgeRefreshLineageBoundary.test.ts --reporter=dot` passed, 7 files / 29 tests.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 960 files / 7,835 tests.
