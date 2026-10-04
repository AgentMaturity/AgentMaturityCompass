# ISO/IEC 42001 Alignment — AMC Dimension Mapping

Version: 1.0 | Date: 2026-02-23
Standards: ISO/IEC 42001:2023, ISO/IEC 42005:2025, ISO/IEC 42006:2025
Status: Engineering alignment mapping — not certification claim

---

## 1. Overview

ISO/IEC 42001 defines requirements for an AI Management System (AIMS). AMC provides automated, evidence-linked compliance signals for all AIMS clause families (4-10) plus companion standards ISO 42005 (AI impact assessment) and ISO 42006 (conformity assessment).

AMC supports `ISO_42001` as a first-class compliance framework:

```bash
amc compliance report --framework ISO_42001 --window 30d --out .amc/reports/iso42001.md
```

The compliance engine evaluates 11 evidence-linked control categories with deterministic pass/fail criteria.

---

## 2. AI Policy (Clause 5)

### AIMS Policy Requirements

| ISO Requirement | AMC Implementation | Evidence Path |
|---|---|---|
| AI policy statement | Governance docs + signed policy artifacts | `docs/GOVERNANCE.md`, `src/governor/` |
| Leadership commitment | Approval gates with accountable owners | `src/approvals/` |
| Accountability assignment | RBAC and identity controls | `src/identity/`, `src/auth/` |
| Policy communication | Transparency and documentation infrastructure | `src/transparency/` |

### AMC Compliance Mapping

Mapping ID: `iso42001_clause_5_leadership`
- Evidence: audit + tool_action events ≥60% OBSERVED
- Assurance: governance_bypass pack score ≥80
- Related questions: AMC-1.2, AMC-1.8, AMC-4.6

### Gap Status

Current: PARTIAL — governance controls exist in code but no single signed AIMS policy document. See `docs/compliance/iso-42001-aims-manual.md` for the 90-day build plan.

---

## 3. Risk Assessment (Clause 6)

### Risk Planning Requirements

| ISO Requirement | AMC Implementation | Evidence Path |
|---|---|---|
| Risk identification and analysis | Forecast engine + advisory generator | `src/forecast/`, `src/ops/` |
| Opportunity identification | Maturity trajectory and improvement velocity | `src/score/predictiveMaturity.ts` |
| AI objectives with measurable targets | Equalizer targets and maturity levels | `src/score/`, `docs/EQUALIZER_TARGETS.md` |
| Risk treatment plans | Mechanic mode remediation | `src/mechanic/` |

### AMC Compliance Mapping

Mapping ID: `iso42001_clause_6_planning`
- Evidence: audit + metric events ≥60% OBSERVED
- Related questions: AMC-4.5, AMC-2.4

### Domain Risk Classification

Risk assessment must account for deployment domain. AMC's domain packs adjust risk thresholds:

| Domain | Risk Multiplier | Additional Controls Required |
|---|---|---|
| Healthcare | 2.0x | FRIA, enhanced logging, mandatory human checkpoints |
| Finance | 1.8x | Transaction audit trail, dual-control approvals |
| Education | 1.5x | Age-appropriate safeguards, bias monitoring |
| Code assistance | 1.0x | Standard governance baseline |
| Internal productivity | 0.8x | Reduced oversight acceptable at higher maturity |

---

## 4. AI System Lifecycle (Clause 8)

### Operational Control Requirements

| ISO Requirement | AMC Implementation | Evidence Path |
|---|---|---|
| Operational planning and control | Governor + work orders + action policy | `src/governor/`, `src/workorders/` |
| AI system development lifecycle | Release management + CI controls | `src/release/`, `src/ci/` |
| Third-party AI system management | Adapter framework + provider governance | `src/adapters/`, `src/providers/` |
| Data management | Vault + DLP + data residency | `src/vault/`, `src/compliance/dataResidency.ts` |
| AI system impact assessment | ISO 42005 impact assessment mappings | `src/compliance/builtInMappings.ts` |

### AMC Compliance Mappings

Mapping ID: `iso42001_clause_8_operation`
- Evidence: tool_action + tool_result + audit events ≥60% OBSERVED
- Denylist: EXECUTE_WITHOUT_TICKET_ATTEMPTED, DIRECT_PROVIDER_BYPASS_SUSPECTED
- Related questions: AMC-1.5, AMC-2.3, AMC-4.6

### Autonomy Duration in Lifecycle

The AI system lifecycle must account for autonomy duration — the time an agent operates between human interventions:

- **Design phase**: Define maximum autonomy duration per deployment context
- **Development phase**: Implement circuit breakers and auto-pause at duration thresholds
- **Deployment phase**: Monitor actual autonomy duration vs. designed limits
- **Monitoring phase**: Alert when autonomy duration exceeds risk-appropriate thresholds

Agents that self-limit (proactively request human input when uncertain) demonstrate higher operational maturity.

---

## 5. Performance Evaluation (Clause 9)

### Monitoring and Measurement Requirements

| ISO Requirement | AMC Implementation | Evidence Path |
|---|---|---|
| Monitoring and measurement | Drift detection + watch module | `src/drift/`, `src/watch/` |
| Internal audit | Audit binder + compliance reports | `src/audit/`, `src/compliance/` |
| Management review | Snapshot + forecast reports | `src/snapshot/`, `src/forecast/` |
| Analysis and evaluation | Maturity scoring + predictive validity | `src/score/`, `src/score/predictiveValidity.ts` |

### AMC Compliance Mapping

Mapping ID: `iso42001_clause_9_performance_evaluation`
- Evidence: metric + test + audit events ≥60% OBSERVED
- Assurance: hallucination pack score ≥75
- Related questions: AMC-1.6, AMC-2.2, AMC-2.3

---

## 6. Improvement (Clause 10)

### Continual Improvement Requirements

| ISO Requirement | AMC Implementation | Evidence Path |
|---|---|---|
| Nonconformity and corrective action | Corrections module + incident closure | `src/corrections/`, `src/incidents/` |
| Continual improvement | Loop module + mechanic mode | `src/loop/`, `src/mechanic/` |
| Effectiveness verification | Re-test after remediation | `src/assurance/` |

### AMC Compliance Mapping

Mapping ID: `iso42001_clause_10_improvement`
- Evidence: audit + tool_action events ≥60% OBSERVED
- Denylist: DRIFT_REGRESSION_DETECTED, EXECUTE_FROZEN_ACTIVE
- Related questions: AMC-2.2, AMC-4.1, AMC-4.3

---

## 7. ISO 42005 — AI Impact Assessment

AMC maps three control categories to ISO/IEC 42005:2025:

| Mapping ID | Category | Focus |
|---|---|---|
| `iso42005_scope_and_stakeholders` | Scope & Stakeholders | Impact assessment boundary, stakeholder identification, foreseeable misuse |
| `iso42005_severity_likelihood_uncertainty` | Severity & Likelihood | Impact quantification, uncertainty handling, periodic re-evaluation |
| `iso42005_mitigation_traceability` | Mitigation Traceability | Harm-to-mitigation traceability and closure evidence |

Related AMC questions: AMC-2.12, AMC-2.13, AMC-2.14

---

## 8. ISO 42006 — Conformity Assessment

AMC maps one control category to ISO/IEC 42006:2025:

| Mapping ID | Category | Focus |
|---|---|---|
| `iso42006_conformity_evidence_package` | Conformity Evidence | Machine-readable, certification-ready audit evidence packages |

Requirements:
- artifact + audit + test events ≥60% OBSERVED
- No TRACE_RECEIPT_INVALID, TRACE_EVENT_HASH_NOT_FOUND, or CONFIG_SIGNATURE_INVALID audit events
- Related question: AMC-2.11

---

## 9. AIMS Clause Coverage Summary

| Clause | Mapping IDs | AMC Modules | Status |
|---|---|---|---|
| 4 Context | `iso42001_clause_4_context` | setup, org, domains | PARTIAL |
| 5 Leadership | `iso42001_clause_5_leadership` | approvals, governor, identity | PARTIAL |
| 6 Planning | `iso42001_clause_6_planning` | forecast, ops, mechanic | PARTIAL |
| 7 Support | `iso42001_clause_7_support` | docs, eval-harness | PARTIAL |
| 8 Operation | `iso42001_clause_8_operation` | governor, workorders, vault | PARTIAL |
| 9 Performance | `iso42001_clause_9_performance_evaluation` | drift, watch, audit, score | PARTIAL |
| 10 Improvement | `iso42001_clause_10_improvement` | corrections, incidents, loop | PARTIAL |
| 42005 Impact | 3 mappings | assurance, forecast, audit | PARTIAL |
| 42006 Conformity | 1 mapping | certify, audit, passport | PARTIAL |

Technical controls are strong. Management-system formalization (signed policy docs, internal audit cadence, CAPA register) is the primary gap. See `docs/compliance/iso-42001-aims-manual.md` for the detailed 90-day remediation plan.

---

## References

| Standard | Catalogue page | Status |
|---|---|---|
| ISO/IEC 42001:2023 | https://www.iso.org/standard/81230.html | unverified — iso.org answered HTTP 403 to every fetch on 2026-10-03 and 2026-10-04 |
| ISO/IEC 42005:2025 | https://webstore.iec.ch/en/publication/107659 (IEC co-publishes ISO/IEC standards) | read 2026-10-04: title, one-line abstract, published 2025-05-28, edition 1.0. Clause text not available. The iso.org catalogue number was not reached, so no iso.org URL is given |
| ISO/IEC 42006:2025 | iso.org page not reached | unverified — catalogue number not confirmed; scoped to bodies that audit and certify AI management systems |

The ISO texts are sold by ISO and were not read for this mapping. The clause
families above follow the published clause structure (4-10) and the mappings
in `src/compliance/builtInMappings.ts` carry no `sources` entries, so a control
crosswalk receipt over them cites whatever sources its caller supplies rather
than a clause-level ISO citation. Mapping count, measured at commit `de349bee`
(2026-10-03): 11 `ISO_42001` mappings, as stated in section 1.

Related changes on 2026-10-03/04: `normalizeFrameworkName` resolves pack
strings such as `ISO/IEC 42001:2023` to `ISO_42001`, and `coverageScore` gives
UNKNOWN controls no credit (see `docs/COMPLIANCE_MAPS.md`). ISO/IEC 42005 was
not split into its own framework family because its clauses could not be read;
it stays the "ISO 42005 Impact Assessment" category of `ISO_42001`.

- AMC Compliance Engine: `src/compliance/complianceEngine.ts`
- AMC AIMS Manual (Draft): `docs/compliance/iso-42001-aims-manual.md`
