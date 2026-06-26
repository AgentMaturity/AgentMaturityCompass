# GAP-1952 - PLATO runtime state checkpointing

- Gap: `GAP-1952`
- Dimension: State checkpoint and rollback proof
- AMC surfaces requested: Fleet; Watch; Studio
- Source reviewed: `PLATO: Planning with LLMs and Affordances for Tool Manipulation`
- Retrieval: Live OpenAlex, DOI, Crossref, and Springer metadata review on `2026-06-25`
- Status: Done

## Relevance decision

The source is relevant to AMC as runtime state-management context because live OpenAlex, DOI, Crossref, and Springer metadata describe a robotic tool-manipulation system using specialized LLM agents for language input, environment understanding, affordance prediction, high-level planning, low-level action generation, and execution verification.

GAP-1952 maps to AMC's existing Fleet, Watch, Vault, and Studio runtime evidence surfaces. Tool-manipulation agents create risky state transitions when a high-level plan becomes a low-level action, when an affordance model changes, or when the environment snapshot changes. AMC should require a checkpoint hash, restore test, state diff, and retention policy before treating this class of runtime state as recoverable.

The PLATO source is source-review context only. AMC does not add a PLATO adapter, robotics runtime, affordance model, tool-manipulation engine, Springer importer, DOI importer, or source-specific product surface.

## Source retrieval

- OpenAlex work: `https://openalex.org/W4403708691`
- OpenAlex API: `https://api.openalex.org/works/W4403708691`
- DOI: `https://doi.org/10.1007/s10846-026-02392-y`
- Crossref API: `https://api.crossref.org/works/10.1007/s10846-026-02392-y`
- Springer article page: `https://link.springer.com/article/10.1007/s10846-026-02392-y`
- Title verified from live metadata: `PLATO: Planning with LLMs and Affordances for Tool Manipulation`
- Journal verified from live metadata: `Journal of Intelligent & Robotic Systems`
- Publisher verified from DOI/Crossref metadata: `Springer Science and Business Media LLC`
- Publication date verified from OpenAlex and Crossref metadata: `2026-04-11`
- Springer page metadata verified title, journal, DOI, and publication-date metadata.
- Source facts verified from DOI/Crossref metadata: robotic systems in real-world environments, natural language instructions, specialized large language model agents, environment understanding, tool affordances, executable actions, modular agent-based architecture, high-level plan generation, low-level actions, and verify successful execution.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Indirect only; checkpoint proof can support runtime evidence, but no scoring methodology changed. |
| Shield | Adjacent only; divergent restore state can become a safety finding, but no Shield pack changed. |
| Enforce | Adjacent only; checkpoint proof can gate risky tool actions, but no runtime policy engine changed. |
| Vault | Relevant because checkpoint artifacts carry state snapshot hashes and retention policy. |
| Watch | Relevant because Watch needs restore-test status, state diff, and fail-closed reasons for runtime incident review. |
| Fleet | Relevant because Fleet owns multi-agent runtime transition evidence. |
| Passport | Downstream consumer only; no Passport bundle schema changed. |
| Comply | Adjacent only; retention policy can support audit review, but no compliance mapping changed. |

## Product closure

No product code changed for this source. Existing `src/runtime/stateCheckpoint.ts`, added for GAP-1942, already closes this dimension through a generic AMC-owned runtime state checkpoint and restore-proof primitive.

`tests/gap1952PlatoRuntimeStateCheckpointBoundary.test.ts` proves the primitive handles tool-manipulation state transitions without PLATO-specific implementation. The test records a risky tool-affordance transition, creates a signed checkpoint with state hash and retention policy, verifies a restore proof, records divergent state diff entries, and fails closed when PLATO metadata replaces AMC-owned checkpoint evidence.

## Fail-closed rule

metadata-only source evidence fails closed. OpenAlex metadata, DOI metadata, Crossref metadata, Springer metadata, article title, publication date, journal labels, affordance labels, robotics labels, high-level plan labels, low-level action labels, execution-verification labels, and local backlog text cannot prove a runtime checkpoint or rollback path.

A passing GAP-1952 claim requires a signed checkpoint, checkpoint hash, state hash, persisted checkpoint path, artifact signature, risky transition id, evidence references, explicit retention policy, restore test evidence, restored-state hash, state diff, and signed restore proof.

Missing state snapshot, missing checkpoint path, missing signature, checkpoint hash mismatch, state hash mismatch, missing transition id, missing checkpoint evidence, invalid retention policy, missing restore-test evidence, restore-state mismatch, missing proof path, missing proof signature, or fail-open restore status fails closed.

## No-bloat boundary

No PLATO adapter, robotics runtime, robot control system, affordance predictor, tool-manipulation engine, high-level planning model, low-level action executor, environment model, execution-verification engine, Springer importer, OpenAlex importer, DOI importer, Crossref importer, paper parser, source-specific runtime adapter, source-specific Studio route, source-specific CLI command, methodology bump, copied source text, copied paper content, copied prompts, copied examples, copied diagrams, copied configs, copied docs, copied data, or copied upstream outputs were added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1952PlatoRuntimeStateCheckpointBoundary.test.ts --reporter=dot` failed only because this source-review document did not exist; checkpoint, restore, fail-closed, and no-bloat checks passed against the existing GAP-1942 primitive.
- Focused test: `npx vitest run tests/gap1952PlatoRuntimeStateCheckpointBoundary.test.ts --reporter=dot` passed: 1 file / 4 tests.
- Related runtime regression: `npx vitest run tests/gap1952PlatoRuntimeStateCheckpointBoundary.test.ts tests/gap1942RuntimeStateCheckpointBoundary.test.ts tests/gap1838RuntimeLifecycleGraphBoundary.test.ts tests/runtimeRunManager.test.ts --reporter=dot` passed: 4 files / 16 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed: 950 files / 7792 tests.
