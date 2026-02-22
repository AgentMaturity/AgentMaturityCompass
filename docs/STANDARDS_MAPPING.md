# AMC Standards Mapping
**Agent Maturity Certification - Cross-Standard Alignment Reference**
*Version 2.0 | Updated 2026-02-22*

---

## Executive Summary

AMC operationalizes enterprise AI governance and reliability standards with a single evidence-gated scoring system.

The canonical runtime model is:
- **5 dimensions**
- **67 scored questions**
- **Signed diagnostic bank + deterministic evidence gates**

Source-of-truth implementation:
- `src/diagnostic/questionBank.ts`
- `src/diagnostic/bank/bankSchema.ts`
- `src/score/crossFrameworkMapping.ts`

AMC provides cross-framework evidence translation for:
- NIST AI RMF
- ISO/IEC 42001
- EU AI Act (high-risk controls)
- SOC 2 Type II (via existing AMC audit artifacts)
- GDPR (via AMC data governance and privacy artifacts)

---

## Canonical Scoring Model

| Attribute | Canonical Value |
|---|---|
| Dimensions | 5 |
| Questions | 67 |
| Rubric Levels | 0..5 per question |
| Scoring Inputs | OBSERVED/ATTESTED/SELF_REPORTED evidence with gating |
| Integrity Model | Evidence coverage + penalties + trust labeling |

Dimension set:
1. Strategic Agent Operations
2. Leadership & Autonomy
3. Culture & Alignment
4. Resilience
5. Skills

---

## Dimension to Standard Coverage

| AMC Dimension | NIST AI RMF | ISO 42001 | EU AI Act |
|---|---|---|---|
| Strategic Agent Operations | GOVERN, MAP, MEASURE, MANAGE controls tied to policy, observability, supply chain, and governance operations | Context, leadership, planning, operational controls | Articles 9, 10, 11, 12, 13, 14, 15 |
| Leadership & Autonomy | Accountability, role clarity, verified outcomes, oversight quality | Leadership commitment, operational accountability, improvement loops | Articles 13, 14, 15, 61 |
| Culture & Alignment | Impact assessment, ethics/fairness, compliance workflow integration | Impact assessment, governance culture, social impact controls | Articles 9, 10, 13, 14 |
| Resilience | Risk treatment, monitoring, incident resilience, lifecycle stability | Risk treatment, monitoring/measurement, continual improvement | Articles 9, 12, 15, 17 |
| Skills | Technical control maturity, secure tooling, platform reliability | Lifecycle execution support and technical controls | Articles 10, 12, 15 |

---

## Framework Control Crosswalk (Operational)

The executable crosswalk used by scoring is defined in `src/score/crossFrameworkMapping.ts`.
All mapped AMC QIDs are validated against the live 67-question bank at runtime.

### NIST AI RMF (Implemented Controls)

| NIST Control | AMC Coverage QIDs (examples) |
|---|---|
| GOVERN-1.1 | AMC-1.1, AMC-1.3 |
| GOVERN-1.2 | AMC-1.2 |
| GOVERN-2.1 | AMC-4.1 |
| MAP-1.1 | AMC-1.1, AMC-1.5 |
| MAP-2.1 | AMC-3.1.2, AMC-3.2.1, AMC-4.6 |
| MEASURE-2.8 | AMC-3.1.2, AMC-EUAI-1 |
| MANAGE-1.1 | AMC-4.1, AMC-4.2 |

### ISO/IEC 42001 (Implemented Controls)

| ISO Control | AMC Coverage QIDs (examples) |
|---|---|
| ISO-4.1 Context | AMC-1.1 |
| ISO-5.1 Leadership | AMC-1.2, AMC-1.3 |
| ISO-6.1 Risk & Opportunity | AMC-4.5 |
| ISO-8.4 Impact Assessment | AMC-3.1.2, AMC-4.6, AMC-EUAI-1 |
| ISO-10.1 Continual Improvement | AMC-2.2, AMC-4.3 |

### EU AI Act (Implemented High-Risk Anchors)

| EU AI Act Article | AMC Coverage QIDs (examples) |
|---|---|
| Article 9 Risk Management | AMC-4.5, AMC-1.1 |
| Article 10 Data Governance | AMC-1.5 |
| Article 11 Technical Documentation | AMC-1.1, AMC-1.2 |
| Article 12 Record-Keeping | AMC-1.6 |
| Article 13 Transparency | AMC-2.4 |
| Article 14 Human Oversight | AMC-1.3 |
| Article 15 Robustness/Cybersecurity | AMC-2.1, AMC-4.5 |
| Article 61 Conformity Assessment | AMC-2.1 |

---

## Compliance Positioning

AMC is a maturity and evidence orchestration system, not a legal opinion engine.
It accelerates readiness by turning operational evidence into framework-aligned artifacts and control summaries.

For regulated deployments, teams should pair AMC outputs with legal/compliance review and sector-specific controls.

---

## Migration Note

Any older references to previous bank sizes are legacy and non-canonical.
The enforced scoring baseline is the **67-question bank**.
