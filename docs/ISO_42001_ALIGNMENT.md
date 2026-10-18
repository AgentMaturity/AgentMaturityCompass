# ISO/IEC 42001 Alignment — AMC Dimension Mapping

Version: 1.0 | Date: 2026-02-23
Standards: ISO/IEC 42001:2023; ISO/IEC 42005:2025 descoped (unverified: source unreachable); ISO/IEC 42006:2025 unverified
Status: Engineering alignment mapping, experimental (no named-expert sign-off, D-08 pending) — not a certification claim

---

## 1. Overview

ISO/IEC 42001 defines requirements for an AI Management System (AIMS). AMC provides automated, evidence-linked compliance signals for all AIMS clause families (4-10), plus impact-assessment and conformity-evidence signals filed under the ISO 42005 and ISO 42006 category names. No ISO/IEC 42005 or 42006 clause text was read: see section 7.

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
| AI system impact assessment | AMC impact-assessment signals (ISO 42005 category; ISO/IEC 42005 descoped) | `src/compliance/builtInMappings.ts` |

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

## 7. ISO 42005 — AI Impact Assessment (descoped)

**Descoped on 2026-10-04 (P1-45).** ISO/IEC 42005:2025 is sold by ISO and was
not readable: iso.org returned HTTP 403 to every fetch on 2026-10-03 and
2026-10-04, and the IEC webstore page gives only the title, a one-line abstract
and the publication date. No clause text may be paraphrased from memory, so:

- `ISO_42005` is not a framework family. The name stays as an alias with zero
  mapped controls and the status `unverified: source unreachable`:
  `normalizeFrameworkName("ISO/IEC 42005:2025")` is `null` and
  `classifyFrameworkString` reports `descoped-source-unreachable`
  (`src/compliance/frameworks.ts`).
- No clause-level control quotes ISO/IEC 42005 (`src/compliance/frameworks/controls.ts`).
- The three mappings below keep their ids and the category name "ISO 42005
  Impact Assessment", so evidence already bound to them still resolves. Every
  report lists them as NOT_EVALUATED, "not evaluated: descoped (licensed text
  unavailable)". They are never evaluated, and coverage leaves them out. The
  `ISO_42001` family prints this flag on every compliance surface.
- A licensed copy of the standard is Sid's to supply; mapping its clauses then
  needs a named expert's review (D-08).

The three AMC impact-assessment signals:

| Mapping ID | Category | Focus |
|---|---|---|
| `iso42005_scope_and_stakeholders` | Scope & Stakeholders | Impact assessment boundary, stakeholder identification, foreseeable misuse |
| `iso42005_severity_likelihood_uncertainty` | Severity & Likelihood | Impact quantification, uncertainty handling, periodic re-evaluation |
| `iso42005_mitigation_traceability` | Mitigation Traceability | Harm-to-mitigation traceability and closure evidence |

Related AMC questions: AMC-2.12, AMC-2.13, AMC-2.14

---

## 8. ISO 42006 — Conformity Assessment

AMC files one conformity-evidence signal under the ISO 42006 category name. ISO/IEC 42006:2025 was not read either (its iso.org page was not reached), so this is an AMC signal, not a clause mapping:

| Mapping ID | Category | Focus |
|---|---|---|
| `iso42006_conformity_evidence_package` | Conformity Evidence | Machine-readable audit evidence packages (evidence of conformity, not a certification) |

Requirements:
- artifact + audit + test events ≥60% OBSERVED
- No TRACE_RECEIPT_INVALID, TRACE_EVENT_HASH_NOT_FOUND, or CONFIG_SIGNATURE_INVALID audit events
- Related question: AMC-2.11

---

## 9. AIMS Clause Coverage Summary

The mapping status is not a result. A report evaluates each mapping against the
evidence in its window; without control-bound evidence a category is
NOT_EVALUATED.

| Clause | Mapping IDs | AMC Modules | Mapping status |
|---|---|---|---|
| 4 Context | `iso42001_clause_4_context` | setup, org, domains | experimental |
| 5 Leadership | `iso42001_clause_5_leadership` | approvals, governor, identity | experimental |
| 6 Planning | `iso42001_clause_6_planning` | forecast, ops, mechanic | experimental |
| 7 Support | `iso42001_clause_7_support` | docs, eval-harness | experimental |
| 8 Operation | `iso42001_clause_8_operation` | governor, workorders, vault | experimental |
| 9 Performance | `iso42001_clause_9_performance_evaluation` | drift, watch, audit, score | experimental |
| 10 Improvement | `iso42001_clause_10_improvement` | corrections, incidents, loop | experimental |
| 42005 Impact | 3 mappings | assurance, forecast, audit | experimental; ISO/IEC 42005 descoped (unverified: source unreachable) |
| 42006 Conformity | 1 mapping | certify, audit, passport | experimental; ISO/IEC 42006 unverified |

Technical controls are strong. Management-system formalization (signed policy docs, internal audit cadence, CAPA register) is the primary gap. See `docs/compliance/iso-42001-aims-manual.md` for the detailed 90-day remediation plan.

---

## References

| Standard | Catalogue page | Status |
|---|---|---|
| ISO/IEC 42001:2023 | https://www.iso.org/standard/81230.html | unverified: iso.org answered HTTP 403 to every fetch on 2026-10-03 and 2026-10-04 |
| ISO/IEC 42005:2025 | https://webstore.iec.ch/en/publication/107659 (IEC co-publishes ISO/IEC standards) | descoped, unverified: source unreachable. The IEC page, read 2026-10-04, gives the title, a one-line abstract, publication 2025-05-28 and edition 1.0; no clause text |
| ISO/IEC 42006:2025 | iso.org page not reached | unverified: catalogue number not confirmed |

The ISO texts are sold by ISO and were not read for these mappings, which carry
no `sources` entries.

- AMC Compliance Engine: `src/compliance/complianceEngine.ts`
- AMC AIMS Manual (Draft): `docs/compliance/iso-42001-aims-manual.md`
