# AMC Domain Packs

AMC domain packs extend the base 244-question AMC rubric with industry-specific questions across 41 packs and 7 domain stations.

> The base-rubric figure is whatever `node scripts/gen-counts.mjs` reports (244
> today); the earlier "138-question rubric" and "1,021 total" predate several
> expansions and did not reconcile with the code. The sector-pack counts below
> are checked against the registry by `tests/industryPackDepthFloor.test.ts`, which fails
> when they drift.

- Base AMC remains mandatory for every agent.
- Domain packs add regulated vertical controls.
- Domain aliases are accepted by the CLI and resolved to one of the seven canonical domains.
- Composite score formula:
  - `composite = (base_score * 0.6) + (domain_score * 0.4)`

## Domains

| Domain ID | Domain | Common Aliases | Questions | Assurance Pack(s) | Risk Level | EU AI Act Category |
|---|---|---|---:|---|---|---|
| `health` | Health | `healthcare`, `clinical`, `medical`, `digital-health` | 9 | `healthcarePHI`, `safetyCriticalSIL` | critical | high-risk |
| `education` | Education | `edtech`, `learning`, `students`, `school` | 6 | `educationFERPA` | very-high | high-risk |
| `environment` | Environment / Critical Infrastructure | `supply-chain`, `supply chain`, `scm`, `procurement`, `vendor-risk`, `energy` | 6 | `environmentalInfra` | critical | high-risk |
| `mobility` | Mobility / Transport | `logistics`, `freight`, `3pl`, `warehouse`, `carrier`, `safety-critical`, `transportation` | 14 | `mobilityFunctionalSafety`, `safetyCriticalSIL` | critical | high-risk |
| `governance` | Governance / Public Sector | `public-sector`, `government`, `civic`, `citizen-services` | 6 | `governanceNISTRMF` | very-high | high-risk |
| `technology` | Technology / General AI Services | `tech`, `general-ai`, `platform`, `saas`, `software` | 6 | `technologyGDPRSOC` | high | general-purpose |
| `wealth` | Wealth / Financial Services | `financial`, `finance`, `fintech`, `banking`, `payments`, `insurance`, `crypto` | 14 | `wealthManagementMiFID`, `financialModelRisk` | very-high | high-risk |

Run `amc domain list` to see the same canonical domains, aliases, sector tags, and suggested industry packs in the CLI.

## Sector Pack Counts

Industry sector packs (`src/domains/industryPacks.ts`) per station. The Questions column counts sector-pack questions (not the domain-pack questions in the table above). No pack may fall below 15 questions (`PACK_QUESTION_FLOOR`: the median pack size measured on 2026-10-03); the October 2026 review added 32 questions to the 19 packs below the floor. Counts are measured from the registry with `getStationSummary` and checked by `tests/industryPackDepthFloor.test.ts`.

| Station | Packs | Questions |
|---|---:|---:|
| `environment` | 6 | 91 |
| `health` | 9 | 151 |
| `wealth` | 5 | 75 |
| `education` | 5 | 75 |
| `mobility` | 6 | 90 |
| `technology` | 5 | 75 |
| `governance` | 5 | 75 |
| **Total** | **41** | **632** |

## Stations

Seven stations classify every domain, pack and regulation: Education, Environment, Health, Wealth, Technology, Mobility and Governance (decided 5 October 2026). Jurisdiction and role stay filters, not stations. The taxonomy lives in `src/domains/stations.ts`: `STATIONS`, the `Station` type (the same seven ids as `Domain`), `STATION_TITLES`, `isStation` (exact id), `parseStation` (accepts an id, a title or a domain alias such as `finance`, `insurance` or `supply-chain`), the `StationScope` and `CrossStationProfile` types with `validateStationScope`, the Layer 1 domain map `STATION_DOMAINS`, `stationsForPack` and `domainsForStation`. Station order carries no meaning.

A station tag classifies and filters. It never changes a score, level or status.

### Station tags per artifact class

| Artifact | Where its stations come from |
|---|---|
| Industry sector pack | `stationId`, which equals the station of the pack's `STATION_DOMAINS` row; `stationsForPack` adds the row's `alsoStations` |
| Domain rubric | Keyed by station (`src/score/domainPacks.ts`) |
| Industry assurance pack | `INDUSTRY_ASSURANCE_PACK_STATIONS` and the registry's `assurancePacks` (`listIndustryAssurancePackStations`) |
| Compliance mapping | The mapping's optional `stations` list (at least one when present); otherwise `FRAMEWORK_STATIONS[framework]` plus the stations of the assurance packs in `related.packs` (`stationsForMapping` in `src/compliance/stationTags.ts`) |
| Regulatory register entry | The entry's `stations` (`src/compliance/regulatory/register.json`) |
| Regulatory catalogue instrument | Derived, never stored: the stations of the industry packs and domain rubrics that cite it, plus the stations of register entries that list it in `catalogueIds` (`stationsForInstrument`). An instrument nothing cites has no station. |
| Incident reporting clock | The clock's `stations` (`src/incidents/regulatoryClocksTable.ts`) |

`FRAMEWORK_STATIONS` (each row's one-line basis is in `FRAMEWORK_STATION_BASIS`; the rows are agent-encoded from the strategy's register and stay experimental until an expert reviews them):

| Framework | Stations |
|---|---|
| `SOC2`, `NIST_AI_RMF`, `ISO_27001`, `ISO_42001`, `MITRE_ATLAS`, `OWASP_API_TOP10` | all seven (the Layer 0 baseline) |
| `EU_AI_ACT`, `GDPR` | all seven |
| `HIPAA` | health, technology |
| `PCI_DSS` | wealth, technology |
| `SOX` | wealth |
| `FEDRAMP` | governance, technology |

### Layer 1 domain map

`STATION_DOMAINS` has 19 rows. They cover all 41 sector packs and all 40 domain names on the website's station pages (`website/station-<station>.html`) exactly once. "health (technology)" means the row is filed under health and its overlay also binds technology (`alsoStations`).

| Domain id | Layer 1 row | Station (also) | Wave | Pack ids |
|---|---|---|---|---|
| `environment.energy-utilities-water` | Environment · energy, utilities and water | environment | 3 | `ubiquity-to-utility`, `sip-to-sanitation` |
| `environment.food-textiles-manufacturing` | Environment · food, textiles, manufacturing and biodiversity | environment | 4 | `farm-to-fork`, `weave-to-wear`, `material-to-machines`, `source-to-sustenance` |
| `health.care-delivery-records` | Health · care delivery and records | health | 1 | `digital-health-record`, `wellness-management`, `patient-lifecycle`, `clinical-lifecycle`, `professional-practice` |
| `health.devices-diagnostics` | Health × Technology · medical devices and diagnostics | health (technology) | 2 | `life-technology` |
| `health.pharma-trials` | Health · pharma, trials and specialized medicine | health | 2 | `drug-discovery`, `clinical-trials`, `specialized-medicine` |
| `wealth.banking-finance-ops` | Wealth · banking, lending and finance operations | wealth | 1 | none |
| `wealth.payments` | Wealth × Technology · payments and agentic commerce | wealth (technology) | 2 | `digital-payments` |
| `wealth.insurance` | Wealth · insurance | wealth | 1 | none |
| `wealth.capital-markets` | Wealth · capital markets | wealth | 2 | none |
| `wealth.future-of-work` | Wealth · future of work and employment | wealth | 3 | `future-of-work` |
| `wealth.inclusion-digital-assets` | Wealth · inclusion, sustainable finance and digital assets | wealth | 4 | `no-poverty`, `circular-economy`, `blockchain` |
| `education.schools-skills` | Education · schools, universities, skills and accessibility | education | 3 | `k12-pm3`, `higher-education`, `skills-training`, `specialized-education`, `differently-abled` |
| `mobility.ports-logistics-cities` | Mobility · ports, logistics, real estate and smart cities | mobility | 3 | `sustainable-communities`, `sustainable-ports`, `sustainable-real-estate`, `freight-3pl-warehouse` |
| `mobility.vehicles-aviation` | Mobility × Technology · autonomous and connected vehicles, aviation | mobility (technology) | 4 | none |
| `technology.platforms-data` | Technology · AI platforms, IoT, content and cross-border data | technology | 2 | `cognition-to-intelligence`, `networked-ecosystems`, `os-sustainable-outcomes`, `infotainment`, `partnerships-prosperity` |
| `governance.public-services` | Governance · public services and procurement | governance | 2 | `citizen-services`, `public-private-collaboration` |
| `governance.law-rights-democracy` | Governance · law, rights and democracy | governance | 3 | `petition-to-law`, `digital-citizens-rights`, `dance-of-democracy` |
| `governance.defense` | Governance × Technology · defense | governance (technology) | 3 | none |
| `mobility.unplaced` | none (no Layer 1 row) | mobility | none | `virtual-infrastructure`, `privacy-security-mobility` |

`mobility.unplaced` holds the two website domains that match no Layer 1 row. Which row, if any, they belong to is a decision for Sid; no row is invented for them.

### Station name map

The website's station pages and the strategy's Layer 1 table name some domains differently. This table records every website name, its strategy name and the status of the match; no page, pack or strategy name was renamed to force a match. Pack `name` fields can differ from both (for example "Specialized Medicine Apothecary"), so the website comparison uses `websiteNames`, never pack names.

| Website name | Strategy name | Domain id | Pack id | Status |
|---|---|---|---|---|
| K-12 Education | K-12 | `education.schools-skills` | `k12-pm3` | renamed |
| Higher Education | Higher Education | `education.schools-skills` | `higher-education` | same |
| Skills & Vocational | Skills | `education.schools-skills` | `skills-training` | renamed |
| Specialized Education | Specialized | `education.schools-skills` | `specialized-education` | renamed |
| Differently Abled | Differently Abled | `education.schools-skills` | `differently-abled` | same |
| Farm to Fork | Farm to Fork | `environment.food-textiles-manufacturing` | `farm-to-fork` | same |
| Weave to Wear | Weave to Wear | `environment.food-textiles-manufacturing` | `weave-to-wear` | same |
| Material to Machines | Material to Machines | `environment.food-textiles-manufacturing` | `material-to-machines` | same |
| Source to Sustenance | Source to Sustenance | `environment.food-textiles-manufacturing` | `source-to-sustenance` | same |
| Ubiquity to Utility | Ubiquity to Utility | `environment.energy-utilities-water` | `ubiquity-to-utility` | same |
| Sip to Sanitation | Sip to Sanitation | `environment.energy-utilities-water` | `sip-to-sanitation` | same |
| Digital Health Record | Digital Health Record | `health.care-delivery-records` | `digital-health-record` | same |
| Wellness Management | Wellness | `health.care-delivery-records` | `wellness-management` | renamed |
| Patient Lifecycle | Patient and Clinical Lifecycle | `health.care-delivery-records` | `patient-lifecycle` | split |
| Clinical Lifecycle | Patient and Clinical Lifecycle | `health.care-delivery-records` | `clinical-lifecycle` | split |
| Professional Practice | Professional Practice | `health.care-delivery-records` | `professional-practice` | same |
| Life Technology | Life Technology | `health.devices-diagnostics` | `life-technology` | same |
| Drug Discovery | Drug Discovery | `health.pharma-trials` | `drug-discovery` | same |
| Clinical Trials | Clinical Trials | `health.pharma-trials` | `clinical-trials` | same |
| Specialized Medicine | Specialized Medicine | `health.pharma-trials` | `specialized-medicine` | same |
| Future of Work | Future of Work | `wealth.future-of-work` | `future-of-work` | same |
| Digital Payments | Digital Payments | `wealth.payments` | `digital-payments` | same |
| No Poverty | No Poverty | `wealth.inclusion-digital-assets` | `no-poverty` | same |
| Circular Economy | Circular Economy | `wealth.inclusion-digital-assets` | `circular-economy` | same |
| Blockchain & DeFi | Blockchain & DeFi | `wealth.inclusion-digital-assets` | `blockchain` | same |
| Cognition to Intelligence | Cognition to Intelligence | `technology.platforms-data` | `cognition-to-intelligence` | same |
| Networked Ecosystems | Networked Ecosystems | `technology.platforms-data` | `networked-ecosystems` | same |
| OS for Sustainable Outcomes | OS for Sustainable Outcomes | `technology.platforms-data` | `os-sustainable-outcomes` | same |
| Infotainment | Infotainment | `technology.platforms-data` | `infotainment` | same |
| Partnerships for Prosperity | Partnerships for Prosperity | `technology.platforms-data` | `partnerships-prosperity` | same |
| Sustainable Communities | Communities | `mobility.ports-logistics-cities` | `sustainable-communities` | renamed |
| Sustainable Ports | Sustainable Ports | `mobility.ports-logistics-cities` | `sustainable-ports` | same |
| Sustainable Real Estate | Real Estate | `mobility.ports-logistics-cities` | `sustainable-real-estate` | renamed |
| Virtual Infrastructure | no strategy row | `mobility.unplaced` | `virtual-infrastructure` | unplaced |
| Privacy & Security | no strategy row | `mobility.unplaced` | `privacy-security-mobility` | unplaced |
| Citizen Services | Citizen Services | `governance.public-services` | `citizen-services` | same |
| Public & Private Collaboration | Public & Private Collaboration | `governance.public-services` | `public-private-collaboration` | same |
| Petition to Law | Petition to Law | `governance.law-rights-democracy` | `petition-to-law` | same |
| Digital Citizens & Rights | Digital Citizens & Rights | `governance.law-rights-democracy` | `digital-citizens-rights` | same |
| Dance of Democracy | Dance of Democracy | `governance.law-rights-democracy` | `dance-of-democracy` | same |
| no page | freight and warehousing | `mobility.ports-logistics-cities` | `freight-3pl-warehouse` | no page |

Five Layer 1 rows have neither a website page nor a pack yet: `wealth.banking-finance-ops`, `wealth.insurance`, `wealth.capital-markets`, `mobility.vehicles-aviation` and `governance.defense`.

### Station filters

```bash
amc domain pack list --station wealth            # packs whose stationId is wealth
amc domain pack list --station finance --json    # aliases resolve: finance -> wealth
amc compliance report --framework SOC2 --station health --json
```

- `amc domain pack list --station <station>` filters by the pack's `stationId`. `--domain` still works as a deprecated alias and prints `--domain is deprecated; use --station` to stderr; giving both exits 1 with `Use --station or --domain, not both.` An unknown station exits 1.
- `amc compliance report --station <station>` keeps only the framework's mappings whose `stationsForMapping` includes the station, evaluates them exactly as an unfiltered report would, and adds `"station"` to the JSON report and a `Station:` line to the Markdown report. Coverage is computed over the kept categories only.
- Studio `GET /industry-packs/list?station=<station>` filters the same way as `pack list`; an unknown value returns 400 `{"error":"unknown station: <value>"}`. Entitlement is unchanged.

## Regulatory Currency

Every sector pack carries a content `version` (`2026.10`, stamped at registry build) and a `lastReviewed` date, and its free-text `regulatoryBasis` and `complianceFrameworks` entries resolve to instruments in the regulatory catalogue (`src/domains/packs/regulatoryCatalogue.ts`). Each instrument records a citation, jurisdiction, status, `lastReviewed` and, when verified, the official source URL, `retrievedAt` date, effective date and phased application milestones. The registry attaches the resolved view to each pack as `regulatoryReferences` and `complianceFrameworkRefs`.

The catalogue and its statuses and dates are agent-drafted and stay experimental until a named expert reviews them: a status other than `unverified` means the official source was read, not that an expert approved the entry. They are not legal advice.

`version`, `lastReviewed` and `regulatoryReferences` follow the "PackCurrencyFields v1" contract: each reference has a required `citation` and `jurisdiction`, optional `url`, `effectiveDate` and `lastReviewed`, and a `status` of `in-force`, `applies-from`, `proposed`, `repealed` or `unverified`. A law in force whose obligations apply in stages stays `in-force` and lists the stages as milestones; the current edition of a standard is `in-force`; a superseded edition is `repealed` with `supersededBy`.

- An instrument may claim a status other than `unverified` only when it names the official source it was checked against: an https URL on the official-source host allowlist (`OFFICIAL_SOURCE_HOSTS`) plus a `retrievedAt` date. An `unverified` instrument carries no URL, `retrievedAt` or effective date.
- A `complianceFrameworks` label either normalizes to a built-in AMC framework (`normalizeFrameworkName` in `src/compliance/frameworks.ts`, or a catalogue instrument mapped to one) or resolves to a catalogued external framework.
- No pack may cite a repealed instrument (including a superseded edition) in `regulatoryBasis`, `complianceFrameworks` or a question `regulatoryRef`.
- Reviews older than 365 days fail validation (`validatePackRegulatoryCurrency` in `src/domains/packs/regulatorySchema.ts`). The rules are tested by `tests/industryPackSchema.test.ts`, `tests/industryPackFrameworkNormalization.test.ts` and `tests/industryPackRegulatoryRefresh.test.ts`.

EU AI Act classifications in each pack follow Annex III of Regulation (EU) 2024/1689. Regulation (EU) 2026/1744 (Digital Omnibus on AI) moved the application of high-risk obligations to 2 December 2027 for Annex III systems and 2 August 2028 for Annex I systems; the catalogue entry `eu-ai-act` lists the application milestones.

## Supply Chain / Logistics Routing

Supply-chain and logistics teams should not have to infer hidden taxonomy. AMC now routes common operations terms directly:

| User Intent | Accepted Domain Input | Canonical Domain | Best First Surface |
|---|---|---|---|
| Supplier risk, traceability, procurement, critical infrastructure, materials, food systems, energy grids | `supply-chain`, `supply chain`, `scm`, `procurement`, `vendor-risk` | `environment` | `amc domain assess --agent <id> --domain supply-chain` |
| Freight, carrier management, 3PL operations, warehouses, transport, port logistics | `logistics`, `freight`, `3pl`, `warehouse`, `carrier`, `transportation` | `mobility` | `amc domain assess --agent <id> --domain logistics` |

Suggested supply-chain packs:

- `farm-to-fork`
- `weave-to-wear`
- `material-to-machines`
- `source-to-sustenance`
- `ubiquity-to-utility`

Suggested logistics packs:

- `freight-3pl-warehouse`
- `sustainable-ports`
- `virtual-infrastructure`
- `privacy-security-mobility`
- `sustainable-communities`

External regulatory and standards anchors confirm this is a real operational surface, not just a naming preference: [ISO 28000:2022](https://www.iso.org/standard/79612.html) specifies security-management requirements with supply-chain relevance, [NIST SP 800-161r1-upd1](https://doi.org/10.6028/NIST.SP.800-161r1-upd1) covers supply-chain cybersecurity risk management, and [GS1 EPCIS 2.0](https://ref.gs1.org/standards/epcis/) defines cross-enterprise visibility event evidence. AMC now resolves discovery and ships a dedicated `freight-3pl-warehouse` sector pack plus logistics-contextual operational reliability scoring.

## Composition Model

1. Run base AMC scoring (244-question rubric).
2. Run domain pack scoring (domain-specific questions).
3. Run domain assurance pack(s) for evidence generation.
4. Evaluate compliance gaps and module activation state.
5. Generate a 30/60/90 roadmap.

## Results Without Evidence: "Not Evaluated"

`amc domain assess`, `gaps`, `report`, `roadmap` and `assurance` report **not evaluated** unless evidence exists. Earlier versions printed scores, levels, gaps, a "Certification Readiness" verdict and an "all checks passed" assurance result that were computed from a hash of the agent id or graded against a canned reply. Those were fabricated and are removed.

- The base part reads the agent's latest sealed diagnostic run (`amc quickscore`). An unsealed run file is not evidence.
- The domain-rubric questions have no evidence source yet, so the assessment as a whole stays not evaluated and says why.
- `amc domain assurance` invokes no agent, so it grades nothing; an assurance pack that is not registered is listed as not evaluated by id. Use `amc assurance run` against a real agent for observed results.
- The commands exit 0 for a not-evaluated result and 1 for bad arguments. `--json` returns `status`, `reasons`, `claimKind` and `statusDimensions`.

`--example` prints labelled synthetic output so you can see the report shape. It starts and ends with the banner `SYNTHETIC EXAMPLE — illustrative values, not evidence. Never cite this output.`, carries claim kind `synthetic_example` (and a `banner` field in JSON), stamps the banner into any `--output` file and writes nothing under `.amc/`. Signing paths (`amc certify`, `amc assurance cert-issue`, `amc bundle export`, `amc attest`, `amc passport create`, `amc audit binder create`, `amc notary sign`) refuse a `synthetic_example` result.

## Module Activation Matrix (Domain Highlights)

The domain module map covers all `165` modules:

- Shield: `S1-S16`
- Enforce: `E1-E35`
- Vault: `V1-V14`
- Watch: `W1-W10`
- Product: `P1-P90`

Critical examples by domain:

| Domain | Critical Module Highlights |
|---|---|
| health | `V4`, `S10`, `E19`, `W3` |
| education | `V4`, `S9`, `E22`, `W5` |
| environment | `E5`, `E28`, `E19`, `S2`, `W6` |
| mobility | `E2`, `E5`, `E17`, `S3`, `W4` |
| governance | `W3`, `E15`, `W1`, `W7` |
| technology | `S1-S16`, `E1-E35`, `V1-V14`, `W1-W10` |
| wealth | `E20`, `E23`, `E5`, `V8`, `S15` |

Use `amc domain modules --domain <domain-or-alias>` to inspect the full 165-module relevance map.

## CLI Reference

List domains:

```bash
amc domain list
amc domain list --json
```

Assessment (not evaluated without evidence; `--example` shows labelled synthetic output):

```bash
amc domain assess --agent agent-1 --domain health
amc domain assess --agent agent-1 --domain health --example
amc domain assess --agent agent-1 --domain wealth --json
amc domain assess --agent agent-1 --domain supply-chain
amc domain assess --agent agent-1 --domain logistics
amc domain pack list --station logistics
amc domain pack describe --pack freight-3pl-warehouse
amc score operational-independence agent-1 --domain logistics --json
```

Module map:

```bash
amc domain modules --domain governance
amc domain modules --domain logistics --json
```

Compliance gaps:

```bash
amc domain gaps --agent agent-1 --domain education
amc domain gaps --agent agent-1 --domain wealth --json
```

Full report:

```bash
amc domain report --agent agent-1 --domain mobility --output reports/mobility.md
amc domain report --agent agent-1 --domain health --output reports/health.md --json
```

Domain assurance:

```bash
amc domain assurance --agent agent-1 --domain environment
amc domain assurance --agent agent-1 --domain governance --json
```

Roadmap:

```bash
amc domain roadmap --agent agent-1 --domain mobility
amc domain roadmap --agent agent-1 --domain technology --json
```

Examples for each canonical domain:

```bash
amc domain assess --agent agent-1 --domain health
amc domain assess --agent agent-1 --domain education
amc domain assess --agent agent-1 --domain environment
amc domain assess --agent agent-1 --domain mobility
amc domain assess --agent agent-1 --domain governance
amc domain assess --agent agent-1 --domain technology
amc domain assess --agent agent-1 --domain wealth
```

Examples using common aliases:

```bash
amc domain assess --agent agent-1 --domain healthcare
amc domain assess --agent agent-1 --domain financial
amc domain assess --agent agent-1 --domain safety-critical
amc domain assess --agent agent-1 --domain supply-chain
amc domain assess --agent agent-1 --domain logistics
```

## Domain Proof Lane Boundary

Domain packs score regulated vertical controls; they do not automatically prove that a specific legal, clinical, tax, benefits, or policy answer is correct. The Domain Proof Lane adds a bounded source-to-rule path for that narrower claim:

```bash
amc proof check --domain governance \
  --manifest fixtures/domain-proof/toy-governance/source-rule-manifest.json \
  --input examples/domain-proof/toy-governance/proven.json \
  --json
```

Current P0 support is intentionally limited to a local toy governance fixture. It maps through AMC's existing **Enforce**, **Comply**, **Score**, **Vault**, and **Watch** surfaces, emits an `amcproof` artifact, and returns `proven`, `disproven`, or `unsupported`. Unsupported domain-correctness proof never increases a domain score and must remain visible as `correctnessProofStatus: "unsupported"`.

See [`DOMAIN_PROOF_LANE.md`](./DOMAIN_PROOF_LANE.md) for the proof taxonomy and non-claim boundary.

## Regulatory Mapping Matrix

| Domain | Regulatory Basis |
|---|---|
| health | FDA 510(k), HIPAA, FDA AI/ML Action Plan, EU MDR |
| education | FERPA, COPPA, EU AI Act, GDPR |
| environment | EU AI Act, NERC CIP, EPA regulations, ISO 14001, NIST CSF; supply-chain aliases point here for supplier risk, procurement, traceability, materials, food systems, and critical-infrastructure workflows |
| mobility | NHTSA AV guidance, ISO 26262, UNECE WP.29, ISO 21448, EU AI Act; logistics aliases point here for freight, carrier, 3PL, warehouse, transport, and port-logistics workflows |
| governance | NIST AI RMF, EU AI Act, FedRAMP, FISMA, OMB M-25-21, GDPR |
| technology | GDPR, CCPA, SOC 2 Type II, ISO 27001, OWASP AI Security, EU AI Act |
| wealth | SR 26-2, BSA/AML, SEC Rule 17a-4, UDAAP/ECOA, MiFID II, CFTC, FINRA, Dodd-Frank, FCA SYSC, EU AI Act, GDPR |

## Notes

- Domain packs are additive and never replace base AMC.
- Aliases are routing aids, not duplicate domains; reports and JSON output use the canonical domain ID.
- Compliance gaps include regulatory references and remediation text.
- Certification readiness is domain-threshold aware and sensitive to critical L1 gaps.
