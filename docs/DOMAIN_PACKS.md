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

## Regulatory Currency

Every sector pack carries a content `version` (`2026.10`, stamped at registry build) and a `lastReviewed` date, and its free-text `regulatoryBasis` and `complianceFrameworks` entries resolve to instruments in the regulatory catalogue (`src/domains/packs/regulatoryCatalogue.ts`). Each instrument records a citation, jurisdiction, status, `lastReviewed` and, when verified, the official source URL, `retrievedAt` date, effective date and phased application milestones. The registry attaches the resolved view to each pack as `regulatoryReferences` and `complianceFrameworkRefs`.

`version`, `lastReviewed` and `regulatoryReferences` follow the "PackCurrencyFields v1" contract read by the pack audit: each reference has a required `citation` and `jurisdiction`, optional `url`, `effectiveDate` and `lastReviewed`, and a `status` of `in-force`, `applies-from`, `proposed`, `repealed` or `unverified`. A law in force whose obligations apply in stages stays `in-force` and lists the stages as milestones; the current edition of a standard is `in-force`; a superseded edition is `repealed` with `supersededBy`.

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
5. Generate 30/60/90 roadmap and certification readiness decision.

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

Assessment:

```bash
amc domain assess --agent agent-1 --domain health
amc domain assess --agent agent-1 --domain wealth --json
amc domain assess --agent agent-1 --domain supply-chain
amc domain assess --agent agent-1 --domain logistics
amc domain pack list --domain logistics
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
| governance | NIST AI RMF, EU AI Act, FedRAMP, FISMA, OMB M-24-10, GDPR |
| technology | GDPR, CCPA, SOC 2 Type II, ISO 27001, OWASP AI Security, EU AI Act |
| wealth | SR 11-7, BSA/AML, SEC Rule 17a-4, UDAAP/ECOA, MiFID II, CFTC, FINRA, Dodd-Frank, FCA SYSC, EU AI Act, GDPR |

## Notes

- Domain packs are additive and never replace base AMC.
- Aliases are routing aids, not duplicate domains; reports and JSON output use the canonical domain ID.
- Compliance gaps include regulatory references and remediation text.
- Certification readiness is domain-threshold aware and sensitive to critical L1 gaps.
