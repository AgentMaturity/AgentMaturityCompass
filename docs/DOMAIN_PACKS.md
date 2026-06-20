# AMC Domain Packs

AMC domain packs extend the base 138-question AMC rubric. Additionally, 283 domain-level questions and 600 industry-specific questions across 41 packs and 7 domain stations bring the total diagnostic surface to **1,021 questions**.

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

1. Run base AMC scoring (138-question rubric).
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
