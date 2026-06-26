# GAP-3614 - Data-Prompt handoff contracts

- Gap: `GAP-3614`
- Dimension: `runtime-handoff-contracts`
- AMC surfaces requested: Enforce, Passport, Comply
- Source reviewed: Data-Prompt Co-Evolution: Growing Test Sets to Refine LLM Behavior
- Retrieval: OpenAlex API `https://api.openalex.org/works/W7128480797`, OpenAlex landing page `https://openalex.org/W7128480797`, DOI `https://doi.org/10.1145/3772318.3791222`, Crossref API `https://api.crossref.org/works/10.1145/3772318.3791222`, ACM DOI page `https://dl.acm.org/doi/10.1145/3772318.3791222`
- Status: Done

## Relevance decision

`GAP-3614` is relevant to AMC because iterative multi-agent work can lose accountability when responsibility moves from one agent to another. The source is useful context for workflow, iterative development, test-set growth, and prompt refinement, but it does not require a source-specific product module. AMC already has the generic signed handoff contract primitive needed for this gap.

OpenAlex identified the work as a 2026 paper with DOI `10.1145/3772318.3791222`, authors Minjae Lee and Minsuk Kahng, and concepts including Workflow and Iterative and incremental development. Crossref confirmed the title, ACM publisher, proceedings-article type, and `Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems`.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant as supporting evidence for multi-agent accountability, but no scoring thresholds changed. |
| Shield | Not directly relevant; no red-team pack changed. |
| Enforce | Relevant because unresolved dependencies and refused handoffs must fail closed before execution. |
| Vault | Not relevant; no secrets, DLP, or secure-storage behavior changed. |
| Watch | Adjacent because handoff failures can be monitored, but no Watch primitive changed. |
| Fleet | Primary existing primitive, even though not requested in the backlog surface list. Fleet owns signed agent handoff packets. |
| Passport | Relevant because sender and receiver receipts can travel as portable proof. |
| Comply | Relevant because handoff schema, sender receipt, receiver receipt, and unresolved-dependency log provide audit evidence. |

## Product closure

No product code changed. Existing `src/fleet/handoffPacket.ts` already provides the required Handoff schema, sender receipt, receiver receipt, and unresolved-dependency log:

- signed handoff payload schema
- sender receipt with payload hash and signature
- receiver receipt with accepted/refused status
- ownership transfer status and receipt id
- dependency status records with owner, required flag, evidence refs, and refusal reason
- unresolved dependency log when the receiving agent refuses or required dependencies remain unresolved
- fail-closed contract verification for missing receiver receipts, missing ownership acceptance, unresolved required dependencies, and missing refusal reasons

`tests/gap3614DataPromptHandoffContractsBoundary.test.ts` adds a source-specific relevance boundary fixture that reuses the generic primitive for a test-set-generator to prompt-refiner transfer and a refused release handoff.

## Fail-closed rule

Paper title, DOI, OpenAlex metadata, Crossref metadata, ACM metadata, local backlog text, workflow labels, iterative-development labels, test-set labels, prompt-refinement labels, or source identity are metadata-only. They cannot satisfy AMC handoff contracts without AMC-owned signed handoff packets, sender receipts, receiver receipts, ownership transfer evidence, dependency statuses, evidence refs, and unresolved-dependency logs when dependencies are not satisfied.

## No-bloat boundary

No Data-Prompt adapter was added. AMC did not add a paper importer, ACM/OpenAlex/Crossref importer, prompt-refinement engine, test-set growth engine, Data-Prompt workflow clone, source-specific route, source-specific CLI command, Studio screen, methodology bump, copied paper prose, copied ACM page text, copied examples, copied datasets, copied prompts, copied figures, or source-specific runtime.

## Verification

- Expected-red focused test: `npx vitest run tests/gap3614DataPromptHandoffContractsBoundary.test.ts --reporter=dot` failed only because this source-review document did not exist; 3 product/no-bloat tests passed.
- Focused and related verification: `npx vitest run tests/gap3614DataPromptHandoffContractsBoundary.test.ts tests/gap1835TradingAgentsHandoffContractsBoundary.test.ts tests/gap1836MetaGptHandoffContractsBoundary.test.ts tests/gap1837LlamaIndexHandoffContractsBoundary.test.ts tests/fleetTypedGraph.test.ts tests/trustComposition.test.ts --reporter=dot` passed, 6 files / 43 tests.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 963 files / 7,849 tests.
