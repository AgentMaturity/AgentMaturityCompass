# GAP-1300 - SafePLUG supply-chain posture boundary

- Gap: `GAP-1300`
- Dimension: `security-supply-chain`
- AMC surfaces requested: Shield, Enforce, Vault
- Source reviewed: SafePLUG paper metadata
- Retrieval: 2026-06-25 live OpenAlex, DOI redirect, and Crossref review
- Status: Done

## Source reviewed

- OpenAlex work: `https://openalex.org/W4416176980`
- OpenAlex API: `https://api.openalex.org/works/W4416176980`
- DOI: `https://doi.org/10.23919/chain.2026.000005`
- Crossref API: `https://api.crossref.org/works/10.23919/chain.2026.000005`
- DOI redirect target observed: `https://ieeexplore.ieee.org/document/11457862/`

Live source metadata at retrieval:

- OpenAlex identifies `SafePLUG: Empowering Multimodal LLMs with Pixel-Level Insight and Temporal Grounding for Traffic Accident Understanding`, DOI `https://doi.org/10.23919/chain.2026.000005`, publication_year `2026`, publication_date `2026-01-01`, type `article`, language `en`, cited-by count `1`, not retracted, not paratext, and primary source `CHAIN`.
- DOI resolution returned HTTP 302 to the IEEE Xplore document URL above.
- Crossref identifies the same title, container `CHAIN`, publisher `Institute of Electrical and Electronics Engineers (IEEE)`, type `journal-article`, DOI `10.23919/chain.2026.000005`, and issued year `2026`.
- OpenAlex concepts include traffic-accident and situation-awareness context plus a computer security concept. The live metadata does not establish a source-specific supply-chain method for AMC to copy.

## Relevance decision

GAP-1300 is relevant to AMC through Shield, Enforce, Vault, and the existing plugin/release supply-chain architecture, but SafePLUG itself is weak and indirect evidence for this dimension. It is a multimodal traffic-accident-understanding paper, not a model/tool supply-chain posture system.

The correct AMC closure is not a SafePLUG adapter. The relevant product gap is the backlog acceptance requirement: AMC needs a generic supply-chain posture primitive that can fail closed unless a provider, model, tool, dataset, MCP server, plugin, or package has a component inventory row, version hash, vulnerability state, and allowed-source policy outcome.

metadata-only SafePLUG/OpenAlex/DOI/Crossref facts cannot prove component inventory, version hash, vulnerability state, or allowed-source policy.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. Score can consume posture outcomes later, but this gap does not change scoring weights or public methodology. |
| Shield | Relevant. Shield needs fail-closed supply-chain posture findings before trusting models, tools, datasets, MCP servers, plugins, or packages. |
| Enforce | Relevant. Enforce can bind posture outcomes to signed guard decision receipts using the existing receipt primitive. |
| Vault | Relevant. Vault preserves posture hashes and receipt metadata without storing raw proprietary manifests. |
| Watch | Context only. Watch may observe posture drift later, but no monitor was added. |
| Fleet | Context only. Fleet may aggregate posture across agents later, but no topology behavior changed. |
| Passport | Context only. Posture hashes can be included in proof bundles later, but no Passport schema changed. |
| Comply | Context only. Supply-chain evidence can support audits, but no compliance mapping changed. |

## Product closure

Added a generic AMC supply-chain posture primitive:

- `src/security/supplyChainPosture.ts`
- `src/security/index.ts`
- `src/index.ts`
- `tests/gap1300SafeplugSupplyChainPostureBoundary.test.ts`

The primitive evaluates component inventory for providers, models, tools, datasets, MCP servers, plugins, and packages. It normalizes allowed-source policy, computes deterministic version hashes, records vulnerability state, fails closed for metadata-only or unscanned evidence, emits deterministic report and component hashes, verifies report integrity, and builds input for the existing signed guard decision receipt primitive.

No API, CLI, Studio, Watch monitor, methodology, or source-specific public surface changed.

## Fail-closed rule

The following must fail closed for GAP-1300:

- SafePLUG/OpenAlex/DOI/Crossref metadata alone;
- source title, DOI, OpenAlex work ID, IEEE redirect URL, container name, publisher, concepts, publication date, or local backlog text alone;
- missing component inventory;
- component without version;
- component without valid 64-character version hash;
- component from a source not included in the allowed-source policy;
- component with `unknown` or `unscanned` vulnerability state when fail-closed policy is enabled;
- component with known vulnerabilities when fail-closed policy is enabled;
- component claiming `clean` while listing vulnerability identifiers;
- tampered component hash or report hash;
- unsigned guard decision evidence pretending to prove supply-chain posture.

## No-bloat boundary

No SafePLUG adapter, SafePLUG importer, OpenAlex importer, DOI parser, IEEE Xplore scraper, multimodal traffic-accident workflow, pixel-level-insight model, temporal-grounding module, traffic dataset importer, paper-method implementation, model wrapper, prompt wrapper, API route, CLI command, Studio panel, Watch monitor, methodology version bump, diagnostic question-bank change, source-specific scoring path, or SafePLUG-specific implementation branch was added.

AMC did not copy upstream paper prose beyond minimal metadata facts, abstract text, figures, tables, methods, datasets, prompts, screenshots, generated outputs, model outputs, configs, workflows, images, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1300SafeplugSupplyChainPostureBoundary.test.ts --reporter=dot` first failed because `src/security/supplyChainPosture.ts` did not exist.
- Implementation check: the same focused test then failed only because this source-review doc did not exist while four supply-chain posture and no-bloat tests passed.
- Focused test: `npx vitest run tests/gap1300SafeplugSupplyChainPostureBoundary.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Related regression: `npx vitest run tests/gap1300SafeplugSupplyChainPostureBoundary.test.ts tests/supplyChainIntegrityCoverage.test.ts tests/pluginMarketplace.test.ts tests/releaseBundlesArchetypesGate.test.ts tests/releaseEngineeringPack.test.ts tests/securityStarterPack.test.ts --reporter=dot` passed, 6 files / 41 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 984 files / 7944 tests.
