# GAP-1942 - STA runtime state checkpointing

- Gap: `GAP-1942`
- Dimension: State checkpoint and rollback proof
- AMC surfaces requested: Fleet; Watch; Studio
- Source reviewed: `STA Conditional Commitment Architecture for Output-Mediated and Multi-Agent AI Systems`
- Retrieval: Live OpenAlex, DOI, and Zenodo metadata review on `2026-06-25`
- Status: Done

## Relevance decision

The source is relevant to AMC as runtime oversight context because live OpenAlex, DOI, and Zenodo metadata describe a future-extension note about conditional commitment, output-mediated and multi-agent AI systems, multi-agent commitment cascades, state contamination, monitor-aware adaptation, pre-commitment intervention gates, provenance, and audit logs.

GAP-1942 maps to AMC's existing Fleet, Watch, Vault, and Studio runtime evidence surfaces. AMC should be able to create a signed checkpoint before a risky state transition, verify a restore test against that checkpoint, expose a state diff when restore diverges, and carry an explicit retention policy.

The product receipt for this gap is the checkpoint hash, restore test, state diff, and retention policy.

The STA source is source-review context only. AMC does not add an STA subsystem, authority-governor runtime, conditional-event graph implementation, Signal-Time-Authority framework clone, paper importer, Zenodo importer, or source-specific product flow.

## Source retrieval

- OpenAlex work: `https://openalex.org/W7160493853`
- OpenAlex API: `https://api.openalex.org/works/W7160493853`
- DOI: `https://doi.org/10.5281/zenodo.20063055`
- Zenodo record: `https://zenodo.org/records/20063055`
- Title verified from live metadata: `STA Conditional Commitment Architecture for Output-Mediated and Multi-Agent AI Systems: A Future Extension Note for the Signal-Time-Authority Framework`
- Publisher/source verified from DOI and OpenAlex metadata: `Zenodo`
- Publication date verified from OpenAlex, DOI, and Zenodo metadata: `2026-05-07`
- License verified from Zenodo metadata: `cc-by-4.0`
- Source facts verified from DOI/Zenodo metadata: separate future extension note, not a revision of the frozen STA Paper 1-5 core series; explores conditional commitment for text-only output release, tool-mediated LLM systems, multi-agent commitment cascades, state contamination, monitor-aware strategic adaptation, and pre-commitment intervention gates.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Indirect only; checkpoint and restore proof can support runtime score evidence, but no scoring methodology changed. |
| Shield | Adjacent only; state divergence can become an assurance finding, but no Shield pack changed. |
| Enforce | Adjacent only; checkpoint proof can gate risky transitions, but no policy engine changed for this gap. |
| Vault | Relevant because signed checkpoint artifacts include retention policy and must preserve state proof without relying on source metadata. |
| Watch | Relevant because Watch needs restore-test status, state diff, and fail-closed reasons during incident review. |
| Fleet | Relevant because Fleet owns runtime transition evidence across multi-agent systems. |
| Passport | Downstream consumer only; no Passport bundle schema changed. |
| Comply | Adjacent only; retention policy can support audit review, but no compliance mapping changed. |

## Product closure

Added a generic AMC-owned runtime state checkpoint primitive:

- `src/runtime/stateCheckpoint.ts` creates signed runtime state checkpoints before risky transitions.
- `proveRuntimeStateRestore` writes signed restore-proof artifacts.
- Restore proof records checkpoint hash, state hash, restored-state hash, restore-test evidence, state diff, retention policy, and fail-closed reasons.
- `verifyRuntimeStateCheckpoint` and `verifyRuntimeStateRestoreProof` fail closed when checkpoint evidence or restore evidence is incomplete.
- `renderRuntimeStateCheckpointAuditExport` exposes the audit shape for Fleet, Watch, Vault, and Studio.
- `src/lifecycle/artifactSignature.ts` now supports `runtime-state-checkpoint` and `runtime-state-restore-proof` artifact kinds.
- `src/runtime/index.ts` exports the generic checkpoint API.

No public scoring, methodology, API route, CLI command, or Studio-specific route changed for this gap.

## Fail-closed rule

metadata-only source evidence fails closed. OpenAlex metadata, DOI metadata, Zenodo metadata, title text, publication date, keywords, abstract labels, conditional commitment labels, state contamination labels, audit-log labels, provenance labels, and local backlog text cannot prove a runtime checkpoint or rollback path.

A passing GAP-1942 claim requires a signed checkpoint, checkpoint hash, state hash, persisted checkpoint path, artifact signature, risky transition id, evidence references, explicit retention policy, restore test evidence, restored-state hash, state diff, and signed restore proof.

Missing state snapshot, missing checkpoint path, missing signature, checkpoint hash mismatch, state hash mismatch, missing transition id, missing checkpoint evidence, invalid retention policy, missing restore-test evidence, restore-state mismatch, missing proof path, missing proof signature, or fail-open restore status fails closed.

## No-bloat boundary

No STA subsystem, Signal-Time-Authority framework implementation, authority-governor runtime, output buffer product, release-gate product, Conditional Event Graph, commitment-distance scoring model, claim-packet schema, Zenodo importer, OpenAlex importer, DOI importer, paper parser, source-specific runtime adapter, source-specific Studio route, source-specific CLI command, methodology bump, copied source text, copied paper content, copied prompts, copied examples, copied diagrams, copied configs, copied docs, copied data, or copied upstream outputs were added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1942RuntimeStateCheckpointBoundary.test.ts --reporter=dot` first failed because `src/runtime/stateCheckpoint.ts` did not exist.
- Behavior implementation check: `npx vitest run tests/gap1942RuntimeStateCheckpointBoundary.test.ts --reporter=dot` then passed the checkpoint, restore, fail-closed, and no-bloat checks and failed only because this source-review document did not exist.
- Focused test: `npx vitest run tests/gap1942RuntimeStateCheckpointBoundary.test.ts --reporter=dot` passed: 1 file / 4 tests.
- Related runtime regression: `npx vitest run tests/gap1942RuntimeStateCheckpointBoundary.test.ts tests/gap1838RuntimeLifecycleGraphBoundary.test.ts tests/gap1842RareDiseaseRuntimeLifecycleGraphBoundary.test.ts tests/gap1843HydrogenStorageRuntimeLifecycleGraphBoundary.test.ts tests/runtimeRunManager.test.ts --reporter=dot` passed: 5 files / 20 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed: 949 files / 7788 tests.
