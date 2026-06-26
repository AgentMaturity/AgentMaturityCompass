# GAP-1061 - Execution gap provider-risk boundary

- Gap: `GAP-1061`
- Dimension: `gov-third-party-risk`
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: `Closing the Execution Gap in LLM Agent Systems Empirical Evidence for Compliant Drift, Partial Observability, and Integrated Runtime`
- Retrieval: live OpenAlex API, Zenodo API, and DOI HEAD checks on 2026-06-25 Asia/Kolkata
- Status: Done
- Backlog improvement: Third-party agent and provider risk

## Relevance decision

GAP-1061 is relevant to AMC because third-party agent runtimes, observability providers, hosted tool infrastructure, model gateways, and data processors can create provider risk that is not visible from paper metadata or platform labels alone. The source is an execution-gap and runtime-governance context signal, not a requirement to add a paper-specific runtime, observability adapter, or provider integration.

AMC closure uses the existing generic third-party provider-risk receipt. The receipt requires a Provider record, attestation, data boundary, contractual control, review date, signed exception workflow, source citations, and evidence lineage before provider-risk proof can pass. Metadata-only runtime or paper evidence fails closed.

Reviewed source facts:

- OpenAlex: `https://openalex.org/W7158586692`
- OpenAlex API: `https://api.openalex.org/works/W7158586692`
- DOI: `https://doi.org/10.5281/zenodo.19929771`
- Zenodo record: `https://zenodo.org/records/19929771`
- Zenodo API: `https://zenodo.org/api/records/19929771`
- Title: `Closing the Execution Gap in LLM Agent Systems Empirical Evidence for Compliant Drift, Partial Observability, and Integrated Runtime`
- OpenAlex publication_year `2026`, publication_date `2026-04-30`, type `preprint`, OA status `green`, OA URL `https://doi.org/10.5281/zenodo.19929771`, repository source `Zenodo (CERN European Organization for Nuclear Research)`, host organization `European Organization for Nuclear Research`
- Zenodo publication date `2026-04-30`, resource type `Preprint`, license `cc-by-4.0`
- Creator: `Fernandez, Marcelo Patricio`; affiliation `TraslaIA`; ORCID `0009-0008-7884-2087`
- OpenAlex authorship lists `Marcelo Patricio Fernandez`, ORCID `https://orcid.org/0009-0008-7884-2087`, and institution `Smile Train`
- Zenodo file: `main.pdf`, checksum `md5:80bc7912d199b16546094849a006119b`, size `614642`
- DOI HEAD returned HTTP redirects through `https://zenodo.org/doi/10.5281/zenodo.19929771` to `https://zenodo.org/records/19929771` and returned `200 OK`; Zenodo link metadata included ORCID author, cite-as DOI, describedby API links, item PDF, and CC BY 4.0 license link.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring-methodology or diagnostic-question change. Provider risk remains compliance evidence, not a score recalibration. |
| Shield | Indirectly relevant to assurance around external runtime providers, but no Shield detector or red-team control changed. |
| Enforce | No runtime policy engine, circuit breaker, or provider gateway changed. |
| Vault | Relevant because provider data boundaries, data classes, regions, subprocessors, retention, and transfer mechanisms affect sensitive-data posture. |
| Watch | Runtime observability context is relevant, but this gap is not a Watch live-drift or telemetry-integration change. |
| Fleet | Indirectly relevant to multi-agent runtime dependencies, but no Fleet orchestration or topology change was added. |
| Passport | Relevant because third-party provider-risk receipts can be included in portable trust proof bundles. |
| Comply | Primary surface. Existing provider-risk receipts capture provider record, attestation, data boundary, contractual control, review date, signed exception proof, and evidence-chain hashes. |

## Product closure

No product module changed for GAP-1061. GAP-1059 already added the generic provider-risk primitive in `src/compliance/providerRisk.ts`:

- `buildThirdPartyProviderRiskReceipt`
- `verifyThirdPartyProviderRiskReceipt`
- `renderThirdPartyProviderRiskAuditExport`

This gap adds focused regression coverage proving that execution-gap provider governance uses the existing receipt with source citations, provider metadata, signed attestations, data-boundary proof, contractual controls, signed exceptions, and evidence-chain hashes. The negative fixture proves that paper metadata, source identity, and unsigned runtime claims fail closed.

## Fail-closed rule

The provider-risk receipt fails closed when source citations are missing or when a provider lacks a provider record, owner, review date, allowed use cases, signed attestation, signed data boundary, signed contractual control, signed exception workflow, signed evidence refs, valid SHA-256 event hashes, row hash, or receipt hash.

Metadata-only evidence fails closed. An OpenAlex record, Zenodo record, DOI, paper title, preprint status, OA status, author identity, ORCID, repository metadata, PDF filename, checksum, runtime-governance concept, or local backlog row cannot satisfy third-party provider-risk proof without AMC-owned provider evidence and signed evidence lineage.

## No-bloat boundary

No execution-gap runtime subsystem, provider gateway, OpenAlex adapter, Zenodo importer, DOI resolver, paper parser, OpenTelemetry/OpenLLMetry integration, observability SDK, source-specific provider module, API route, CLI command, methodology version bump, legal certification claim, or demo provider integration was added.

No upstream paper prose, PDF text, tables, figures, prompts, examples, benchmark rows, datasets, screenshots, configs, or generated outputs were copied.

## Verification

Commands run:

- `curl -sSL https://api.openalex.org/works/W7158586692 | jq ...` - passed
- `curl -sSL https://zenodo.org/api/records/19929771 | jq ...` - passed
- `curl -sSIL https://doi.org/10.5281/zenodo.19929771` - passed
- `npx vitest run tests/gap1061ExecutionGapProviderRiskBoundary.test.ts --reporter=dot` - expected red on missing source-review doc; existing product primitive otherwise worked
- `npx vitest run tests/gap1061ExecutionGapProviderRiskBoundary.test.ts --reporter=dot` - passed, 1 file / 4 tests
- `npx vitest run tests/gap1061ExecutionGapProviderRiskBoundary.test.ts tests/gap1059EnterpriseFinancialRiskProviderRiskBoundary.test.ts tests/dataResidency.test.ts tests/trustInterchange.test.ts tests/auditBinderComplianceMaps.test.ts --reporter=dot` - passed, 5 files / 74 tests
- `git diff --check -- . ':(exclude)AMC_OS'` - passed
- Narrow no-bloat scan over generic provider-risk, passport, trust, and compliance-doc implementation files returned no GAP-1061 source identifiers.
- `npm run typecheck` - passed
- `npm test -- --reporter=dot` - passed, 908 files / 7,615 tests

Final verification is recorded in the progress ledger for the committed slice.
