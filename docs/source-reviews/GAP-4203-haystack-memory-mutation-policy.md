# GAP-4203 - Haystack memory mutation policy boundary

- Gap: `GAP-4203`
- Dimension: Memory mutation policy
- AMC surfaces requested: Score; Watch; Enforce
- Source reviewed: `deepset-ai/haystack`
- Retrieval: GitHub API repository metadata at `https://api.github.com/repos/deepset-ai/haystack`; GitHub languages API; GitHub license API; README at `https://raw.githubusercontent.com/deepset-ai/haystack/main/README.md`; docs introduction at `https://docs.haystack.deepset.ai/docs/intro`; public repository at `https://github.com/deepset-ai/haystack`
- Status: Done
- License metadata: Apache-2.0

## Relevance decision

GAP-4203 is relevant to AMC because durable agent memory can silently preserve incorrect, stale, poisoned, or sensitive context across future runs. The Haystack source is relevant only as a live RAG and agent-orchestration signal: the repository and docs describe production-ready AI agents and RAG systems, including explicit control over retrieval, routing, memory, and generation. That maps to AMC's existing reasoning-memory writeback path, Score evidence chain, Watch receipts, and Enforce fail-closed gates.

The gap does not justify a Haystack integration or parity claim. AMC should close it through its own generic memory mutation policy: every durable reasoning-memory writeback must carry an evidence-backed policy decision, retention tag, provenance, and rollback plan.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant. Scoring recommendations can retrieve memory only when the writeback was evidence backed and policy accepted. |
| Shield | Indirect. Secret redaction and evidence gates prevent unsafe memory persistence, but no new Shield module was required. |
| Enforce | Relevant. Missing evidence, invalid retention, or unsupported consumer scopes reject durable memory writes. |
| Vault | Indirect. Retention tags and signatures support controlled durable storage without adding a new vault subsystem. |
| Watch | Relevant. Writeback receipts expose policy outcome, denied gates, and rollback plan for operator review. |
| Fleet | Indirect. Multi-agent memory consumers can reuse governed reasoning memory, but no fleet topology change was required. |
| Passport | Not relevant for this gap. No portable trust token changed. |
| Comply | Indirect. Retention and evidence receipts support auditability, but no compliance mapping changed. |

## Product closure

`src/learning/reasoningMemory.ts` now adds generic, source-agnostic memory mutation policy metadata:

- reasoning-memory items include a durable `retentionTag`;
- writeback receipts include `policyDecision.policyId`, allowed/denied status, retention tag, evidence count, denied gate IDs, and rollback plan;
- accepted new writes carry a `delete-new-item` rollback plan;
- duplicate merges carry a `restore-previous-item` rollback plan with the previous item hash;
- rejected writes still emit signed receipts with denied gates and no durable write.

No API route was required because the existing reasoning-memory API already returns writeback receipts.

## Fail-closed rule

metadata-only source evidence fails closed. GitHub repository metadata, stars, license metadata, README language, docs titles, RAG labels, memory labels, production labels, or local backlog text cannot prove AMC memory mutation safety.

A passing GAP-4203 claim requires AMC-owned episode evidence, signed reasoning-memory item evidence, a signed writeback receipt, policy decision, retention tag, provenance references, denied-gate details when rejected, and a rollback plan for accepted or merged durable writes.

## No-bloat boundary

No Haystack adapter, importer, dependency, benchmark clone, document-store mirror, memory-store wrapper, pipeline runner, copied docs, copied README examples, copied configs, or source-specific runtime was added. Haystack remains a source-review signal only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap4203HaystackMemoryMutationPolicyBoundary.test.ts --reporter=dot` failed first because this source-review document did not exist and reasoning-memory receipts lacked policy decision metadata.
- Focused test: `npx vitest run tests/gap4203HaystackMemoryMutationPolicyBoundary.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Related regression: `npx vitest run tests/gap4203HaystackMemoryMutationPolicyBoundary.test.ts tests/reasoningMemory.test.ts tests/gap4200RagGroundingEvalBoundary.test.ts tests/gap4201RagPoisoningStalenessBoundary.test.ts tests/gap4205FactCheckingGroundingEvalBoundary.test.ts tests/gap4207RagasPoisoningStalenessBoundary.test.ts tests/memoryMaturity.test.ts tests/ragMaturity.test.ts --reporter=dot` passed, 7 files / 40 tests.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 957 files / 7823 tests.
