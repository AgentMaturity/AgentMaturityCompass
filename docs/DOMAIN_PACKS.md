# AMC Domain Packs

AMC domain packs extend the base 67-question AMC rubric.

- Base AMC remains mandatory for every agent.
- Domain packs add regulated vertical controls.
- Composite score formula:
  - `composite = (base_score * 0.6) + (domain_score * 0.4)`

## Domains

| Domain ID | Domain | Questions | Assurance Pack | Risk Level | EU AI Act Category |
|---|---|---:|---|---|---|
| `healthcare` | Healthcare | 9 | `healthcarePHI` | critical | high-risk |
| `financial` | Financial Services | 8 | `financialModelRisk` | very-high | high-risk |
| `safety-critical` | Safety-Critical Systems | 8 | `safetyCriticalSIL` | critical | high-risk |
| `education` | Education | 6 | `educationFERPA` | very-high | high-risk |
| `environment` | Environment / Critical Infrastructure | 6 | `environmentalInfra` | critical | high-risk |
| `mobility` | Mobility / Transport | 6 | `mobilityFunctionalSafety` | critical | high-risk |
| `governance` | Governance / Public Sector | 6 | `governanceNISTRMF` | very-high | high-risk |
| `technology` | Technology / General AI Services | 6 | `technologyGDPRSOC` | high | general-purpose |
| `wealth` | Wealth Management | 6 | `wealthManagementMiFID` | very-high | high-risk |

## Composition Model

1. Run base AMC scoring (67-question rubric).
2. Run domain pack scoring (domain-specific questions).
3. Run domain assurance pack(s) for evidence generation.
4. Evaluate compliance gaps + module activation state.
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
| healthcare | `V4`, `S10`, `E19`, `W3` |
| financial | `E23`, `E20`, `V8`, `S15`, `W3` |
| safety-critical | `E2`, `E5`, `W4` |
| education | `V4`, `S9`, `E22`, `W5` |
| environment | `E5`, `E28`, `E19`, `S2`, `W6` |
| mobility | `E2`, `E5`, `E17`, `S3`, `W4` |
| governance | `W3`, `E15`, `W1`, `W7` |
| technology | `S1-S16`, `E1-E35`, `V1-V14`, `W1-W10` |
| wealth | `E20`, `E23`, `E5`, `V8`, `S15` |

Use `amc domain modules --domain <domain>` to inspect the full 165-module relevance map.

## CLI Reference

List domains:

```bash
amc domain list
amc domain list --json
```

Assessment:

```bash
amc domain assess --agent agent-1 --domain healthcare
amc domain assess --agent agent-1 --domain financial --json
```

Module map:

```bash
amc domain modules --domain governance
amc domain modules --domain technology --json
```

Compliance gaps:

```bash
amc domain gaps --agent agent-1 --domain education
amc domain gaps --agent agent-1 --domain wealth --json
```

Full report:

```bash
amc domain report --agent agent-1 --domain mobility --output reports/mobility.md
amc domain report --agent agent-1 --domain healthcare --output reports/healthcare.md --json
```

Domain assurance:

```bash
amc domain assurance --agent agent-1 --domain environment
amc domain assurance --agent agent-1 --domain governance --json
```

Roadmap:

```bash
amc domain roadmap --agent agent-1 --domain safety-critical
amc domain roadmap --agent agent-1 --domain technology --json
```

Examples for each domain:

```bash
amc domain assess --agent agent-1 --domain healthcare
amc domain assess --agent agent-1 --domain financial
amc domain assess --agent agent-1 --domain safety-critical
amc domain assess --agent agent-1 --domain education
amc domain assess --agent agent-1 --domain environment
amc domain assess --agent agent-1 --domain mobility
amc domain assess --agent agent-1 --domain governance
amc domain assess --agent agent-1 --domain technology
amc domain assess --agent agent-1 --domain wealth
```

## Regulatory Mapping Matrix

| Domain | Regulatory Basis |
|---|---|
| healthcare | FDA 510(k), HIPAA, FDA AI/ML Action Plan, EU MDR |
| financial | SR 11-7, BSA/AML, SEC Rule 17a-4, UDAAP/ECOA, MiFID II, GDPR |
| safety-critical | IEC 61508, ISO 26262, DO-178C, EN 50128 |
| education | FERPA, COPPA, EU AI Act, GDPR |
| environment | EU AI Act, NERC CIP, EPA regulations, ISO 14001, NIST CSF |
| mobility | NHTSA AV guidance, ISO 26262, UNECE WP.29, ISO 21448, EU AI Act |
| governance | NIST AI RMF, EU AI Act, FedRAMP, FISMA, OMB M-24-10, GDPR |
| technology | GDPR, CCPA, SOC 2 Type II, ISO 27001, OWASP AI Security, EU AI Act |
| wealth | MiFID II, CFTC, FINRA, Dodd-Frank, FCA SYSC, EU AI Act, GDPR |

## Notes

- Domain packs are additive and never replace base AMC.
- Compliance gaps include regulatory references and remediation text.
- Certification readiness is domain-threshold aware and sensitive to critical L1 gaps.
