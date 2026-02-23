# EU AI Act Compliance Framework — AMC Dimension Mapping

Version: 1.0 | Date: 2026-02-23
Regulation: EU AI Act (Regulation (EU) 2024/1689) — Full application: 2026-08-02
Status: Engineering compliance mapping — not legal advice

---

## 1. Overview

This document maps AMC's five maturity dimensions and evidence infrastructure to the EU AI Act's obligations for high-risk AI systems. AMC provides deterministic, evidence-linked compliance signals — not legal certifications.

The EU AI Act applies a risk-based approach. AMC's compliance engine now supports `EU_AI_ACT` as a first-class framework alongside SOC2, NIST AI RMF, ISO 27001, and ISO 42001.

```bash
amc compliance report --framework EU_AI_ACT --window 30d --out .amc/reports/eu-ai-act.md
```

---

## 2. Risk Classification (Art. 6 + Annex III)

### How AMC Maps Risk

AMC uses **Domain Risk Classification** to determine which governance tier applies:

| Domain Risk Class | EU AI Act Tier | AMC Governance Requirements |
|---|---|---|
| `critical` | Unacceptable (Art. 5) | Prohibited unless exempted; AMC blocks deployment |
| `high` | High-risk (Annex III) | Full Art. 9-15, 17 obligations; strict human oversight |
| `elevated` | Limited risk | Transparency obligations (Art. 50); moderate oversight |
| `standard` | Minimal risk | Voluntary codes of practice; baseline AMC governance |

Domain classification is stored in `.amc/eu_ai_act_classification.json` and scored by `src/score/euAIActCompliance.ts`.

High-risk domains include: healthcare, finance, employment, education, law enforcement, critical infrastructure, and immigration/asylum (per Annex III).

### Autonomy Duration Factor

Agents operating in high-risk domains require stricter governance proportional to their autonomy duration — the time between human interventions:

| Autonomy Duration | Required Oversight Level | AMC Signal |
|---|---|---|
| < 1 minute | Standard approval gates | Level 3+ maturity |
| 1-15 minutes | Enhanced monitoring + circuit breakers | Level 4+ maturity |
| 15-60 minutes | Continuous oversight dashboard + auto-pause | Level 4+ with drift alerts |
| > 60 minutes | Mandatory periodic human checkpoints | Level 5 only, with FRIA |

Agents that proactively pause and request human input when encountering uncertainty score higher on oversight quality.

---

## 3. Obligation-to-AMC Mapping

### Art. 9 — Risk Management System

**Requirement**: Continuous risk management throughout the AI system lifecycle.

| AMC Evidence | Module | Questions |
|---|---|---|
| Risk register and treatment plans | `src/ops/`, `src/forecast/` | AMC-2.8, AMC-4.5 |
| Assurance pack: `duality` (risk scenarios) | `src/assurance/packs/` | — |
| Drift regression detection | `src/drift/` | AMC-4.1 |
| Compliance mapping: `euai_art9_risk_management` | `src/compliance/builtInMappings.ts` | — |

**Evidence requirement**: Audit/metric/review events with ≥60% OBSERVED trust tier + duality pack score ≥75.

### Art. 10 — Data Governance

**Requirement**: Data quality, bias examination, and governance for training/operation data.

| AMC Evidence | Module | Questions |
|---|---|---|
| Data governance artifacts | `docs/DATA_GOVERNANCE.md` | AMC-1.5 |
| DLP and exfiltration controls | `src/shield/`, `src/vault/` | AMC-1.8 |
| Compliance mapping: `euai_art10_data_governance` | `src/compliance/builtInMappings.ts` | — |

### Art. 11 — Technical Documentation (Annex IV)

**Requirement**: Technical documentation before market placement, sufficient for conformity assessment.

| AMC Evidence | Module | Questions |
|---|---|---|
| Architecture documentation | `docs/ARCHITECTURE_MAP.md` | AMC-2.9 |
| Master reference | `docs/AMC_MASTER_REFERENCE.md` | — |
| Agent passport (per-agent technical profile) | `src/passport/` | — |
| Compliance mapping: `euai_art11_technical_documentation` | `src/compliance/builtInMappings.ts` | — |

### Art. 12 — Record-Keeping / Automatic Logging

**Requirement**: Automatic logging enabling traceability of system functioning.

| AMC Evidence | Module | Questions |
|---|---|---|
| Append-only evidence ledger | `src/ledger/` | AMC-1.6, AMC-1.7 |
| Hash-chained transparency log | `src/transparency/logChain.ts` | — |
| Signed receipts | `src/receipts/` | — |
| Compliance mapping: `euai_art12_record_keeping` | `src/compliance/builtInMappings.ts` | — |

**Evidence requirement**: LLM request/response + tool action/result + audit events with ≥70% OBSERVED trust tier.

### Art. 13 — Transparency to Deployers

**Requirement**: Instructions for use, intended purpose, known limitations, and performance characteristics.

| AMC Evidence | Module | Questions |
|---|---|---|
| Agent passport with capability declarations | `src/passport/` | AMC-2.4 |
| Transparency artifacts | `src/transparency/` | — |
| Compliance mapping: `euai_art13_transparency` | `src/compliance/builtInMappings.ts` | — |

### Art. 14 — Human Oversight

**Requirement**: Human oversight measures built into system design enabling intervention, override, or stop.

| AMC Evidence | Module | Questions |
|---|---|---|
| Approval gates and governor controls | `src/approvals/`, `src/governor/` | AMC-2.10, AMC-1.8 |
| Human oversight quality scoring | `src/score/humanOversightQuality.ts` | AMC-HOQ-1 to AMC-HOQ-4 |
| Governance bypass assurance pack | `src/assurance/packs/` | — |
| Autonomy duration tracking | Domain risk × oversight interval | — |
| Compliance mapping: `euai_art14_human_oversight` | `src/compliance/builtInMappings.ts` | — |

**Evidence requirement**: Audit/tool_action events ≥60% OBSERVED + governance_bypass pack score ≥85.

### Art. 15 — Accuracy, Robustness, Cybersecurity

**Requirement**: Appropriate accuracy and resilience against errors, faults, and adversarial attacks.

| AMC Evidence | Module | Questions |
|---|---|---|
| Injection/exfiltration assurance packs | `src/assurance/packs/` | AMC-2.1, AMC-4.5 |
| Shield (prompt injection defense) | `src/shield/` | — |
| Production readiness scoring | `src/score/productionReadiness.ts` | — |
| Compliance mapping: `euai_art15_accuracy_robustness` | `src/compliance/builtInMappings.ts` | — |

### Art. 17 — Quality Management System

**Requirement**: QMS ensuring compliance including documented policies and post-market monitoring.

| AMC Evidence | Module | Questions |
|---|---|---|
| Eval harness and test infrastructure | `src/bench/`, `src/e2e/` | AMC-2.2, AMC-2.3 |
| Compliance maps with signed governance | `src/compliance/` | — |
| Compliance mapping: `euai_art17_quality_management` | `src/compliance/builtInMappings.ts` | — |

### Art. 27 — Fundamental Rights Impact Assessment

**Requirement**: FRIA completed before deploying in high-risk contexts.

| AMC Evidence | Module | Questions |
|---|---|---|
| FRIA artifact | `docs/FRIA.md`, `.amc/fria.json` | AMC-2.6 |
| Diagnostic question bank (FRIA question) | `src/diagnostic/questionBank.ts` | — |
| Compliance mapping: `euai_art27_fria` | `src/compliance/builtInMappings.ts` | — |

### Art. 72 — Post-Market Monitoring

**Requirement**: Post-market monitoring system proportionate to risks.

| AMC Evidence | Module | Questions |
|---|---|---|
| Drift detection and alerting | `src/drift/`, `src/watch/` | AMC-2.8 |
| Forecast and advisory engine | `src/forecast/` | — |
| Compliance mapping: `euai_art72_post_market_monitoring` | `src/compliance/builtInMappings.ts` | — |

### Art. 73 — Serious Incident Reporting

**Requirement**: Serious incidents reported to authorities within required timelines.

| AMC Evidence | Module | Questions |
|---|---|---|
| Incident subsystem | `src/incidents/` | AMC-2.7 |
| Audit trail for incident lifecycle | `src/ledger/`, `src/audit/` | — |
| Compliance mapping: `euai_art73_incident_reporting` | `src/compliance/builtInMappings.ts` | — |

### Art. 86 — Right to Explanation

**Requirement**: Affected persons can obtain meaningful explanations of AI-assisted decisions.

| AMC Evidence | Module | Questions |
|---|---|---|
| Explainability packet | `src/watch/explainabilityPacket.ts` | AMC-2.4 |
| Decision transparency artifacts | `src/transparency/` | — |
| Compliance mapping: `euai_art86_right_to_explanation` | `src/compliance/builtInMappings.ts` | — |

---

## 4. Conformity Assessment (Art. 43)

AMC supports conformity assessment readiness through:

1. **Evidence-linked compliance reports** — `amc compliance report --framework EU_AI_ACT`
2. **Signed audit binder** — cryptographically verifiable evidence packages
3. **Cross-framework mapping** — `src/score/crossFrameworkMapping.ts` generates EU AI Act control coverage reports
4. **Agent passport** — per-agent technical documentation profile

AMC does not perform the conformity assessment itself — that requires a notified body or internal assessment per Art. 43 procedures.

---

## 5. Timeline Context (Art. 113)

| Date | Milestone |
|---|---|
| 2024-08-01 | Regulation entered into force |
| 2025-02-02 | Chapters I and II applicable |
| 2025-08-02 | Chapter III Section 4, Chapter V (GPAI) applicable |
| **2026-08-02** | **Full application of high-risk obligations (Arts. 9-15, 17)** |
| 2027-08-02 | Art. 6(1) and related obligations |

---

## 6. Domain Risk Classification and Autonomy Duration

### Domain Risk Tiers

Healthcare, finance, employment, education, and law enforcement agents require stricter governance than code assistants or internal productivity tools. AMC enforces this through domain packs (`src/score/domainPacks.ts`) that adjust scoring thresholds based on deployment context.

### Autonomy Duration as Maturity Signal

Time between human interventions is a key maturity indicator:

- **Low autonomy** (frequent human checkpoints): Acceptable at lower maturity levels
- **High autonomy** (extended unsupervised operation): Requires Level 4-5 maturity with comprehensive evidence
- **Self-limiting agents** (proactively pause when uncertain): Score bonus on oversight quality dimension

This maps directly to Art. 14 human oversight requirements — the EU AI Act requires that oversight measures be "commensurate with the risks, level of autonomy and context of use."

---

## References

- EU AI Act text: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689
- AMC Compliance Engine: `src/compliance/complianceEngine.ts`
- AMC EU AI Act Scorer: `src/score/euAIActCompliance.ts`
- AMC Cross-Framework Mapping: `src/score/crossFrameworkMapping.ts`
