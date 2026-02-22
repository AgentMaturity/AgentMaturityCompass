# ISO/IEC 42001 AIMS Manual (Draft) — AMC

- Version: 0.1 (audit-generated baseline)
- Date: 2026-02-22
- Scope: organizational AI management system (AIMS) structure for AMC platform development and deployment
- Status: **Draft / not certifiable yet**

## 1. Purpose

This document defines the initial AI Management System (AIMS) structure for AMC aligned to ISO/IEC 42001 clause families (4-10), using available repo evidence and identifying mandatory gaps to close before certification-readiness.

## 2. Scope and Boundary

### In scope

- AMC governance and compliance engine (`src/compliance/`)
- Evidence/traceability infrastructure (`src/ledger/`, `src/transparency/`)
- Risk/assurance operations (`src/assurance/`, `src/incidents/`, `src/ops/`)

### Out of scope (current)

- Formal third-party conformity assessment execution artifacts
- External certification-body engagement records

## 3. AIMS Governance Structure (Current vs Required)

| AIMS Element | Current State | Status | Required Next Step |
|---|---|---|---|
| Defined AI policy | Scattered policies and mappings, no single AIMS policy doc | PARTIAL | Create signed `docs/AI_GOVERNANCE.md` policy with objective hierarchy |
| Accountabilities and roles | Governance/approval controls exist in code (`src/compliance/builtInMappings.ts:243`) | PARTIAL | Publish formal RACI with accountable owner per clause and control |
| AIMS documented information control | Signed maps and artifacts exist (`src/compliance/complianceEngine.ts:110`) | PARTIAL | Add documented-information register and retention/approval rules |
| Internal audit and management review model | Some audit evidence and recurrence controls | PARTIAL | Formalize internal audit plan and management review minutes template |
| Continual improvement process | Mechanic/loop modules exist | PARTIAL | Add nonconformity-to-corrective-action governance workflow with closure checks |

## 4. Clause-by-Clause Alignment

## Clause 4: Context of the Organization

Current evidence:
- ISO 42001 context category exists (`src/compliance/builtInMappings.ts:225`).
- Domain context mappings exist (`docs/DOMAIN_PACKS.md:12`).

Gap:
- No formal statement of interested parties, requirements, and AIMS scope boundary document.

Action:
- Publish AIMS context statement with stakeholder classes and applicability rules.

## Clause 5: Leadership

Current evidence:
- Leadership category is mapped (`src/compliance/builtInMappings.ts:243`).
- Approval and governance controls present in platform design.

Gap:
- No explicit top-management commitment artifact and review cadence record.

Action:
- Add signed leadership commitment memo and annual review record template.

## Clause 6: Planning

Current evidence:
- Planning category exists (`src/compliance/builtInMappings.ts:267`).
- Risk-oriented controls and readiness scoring present.

Gap:
- No formal AIMS objectives register with measurable targets and owners.

Action:
- Create AIMS objectives register (objective, KPI, owner, cadence, evidence pointer).

## Clause 7: Support

Current evidence:
- Support category exists (`src/compliance/builtInMappings.ts:285`).
- Evidence and docs infrastructure exists.

Gap:
- No formal competence/training records and communication plan in AIMS package.

Action:
- Define AI competence matrix and training evidence collection workflow.

## Clause 8: Operation

Current evidence:
- Operational category exists (`src/compliance/builtInMappings.ts:303`).
- Strong runtime evidence controls via ledger/transparency (`src/ledger/ledger.ts:187`, `src/transparency/logChain.ts:143`).

Gap:
- Operational planning not tied to formal AIMS-controlled procedures per deployment type.

Action:
- Add controlled SOP set for high-risk deployment lifecycle (design, release, monitoring, decommission).

## Clause 9: Performance Evaluation

Current evidence:
- Performance-evaluation category exists (`src/compliance/builtInMappings.ts:325`).
- Compliance report engine computes category statuses (`src/compliance/complianceEngine.ts:326`).

Gap:
- No formal internal audit schedule with objective/criteria/method records.

Action:
- Create internal audit program and management-review agenda artifacts.

## Clause 10: Improvement

Current evidence:
- Improvement category exists (`src/compliance/builtInMappings.ts:349`).
- Correction and incident components are present.

Gap:
- Nonconformity handling is not documented as an AIMS-controlled CAPA lifecycle.

Action:
- Implement CAPA register with closure verification and effectiveness re-test protocol.

## 5. Documented Information Register (Required)

| Document | Needed for | Current | Status |
|---|---|---|---|
| `docs/AI_GOVERNANCE.md` | AIMS policy and scope | Missing | FAIL |
| `docs/POLICY.md` (or equivalent controlled AIMS policy) | Leadership and accountability | Missing | FAIL |
| `docs/RISK_MANAGEMENT.md` | Planning / risk treatment | Missing | FAIL |
| `docs/DATA_GOVERNANCE.md` | Operational controls | Missing | FAIL |
| `docs/FRIA.md` | Impact/rights planning for high-risk contexts | Missing | FAIL |
| `docs/TECHNICAL_DOCUMENTATION.md` | Operational documented info | Missing | FAIL |
| `docs/INSTRUCTIONS_FOR_USE.md` | Transparency/operational support | Missing | FAIL |
| Internal audit plan and reports | Clause 9 | Missing | FAIL |
| Management review minutes | Clauses 5 and 9 | Missing | FAIL |
| CAPA register | Clause 10 | Missing | FAIL |

## 6. Existing Technical Control Strengths to Reuse in AIMS

1. Cryptographically verifiable logging and evidence chain (`src/ledger/ledger.ts:187`, `src/transparency/logChain.ts:159`).
2. Signed policy and map governance (`src/compliance/complianceEngine.ts:146`).
3. Retention and archive controls (`src/ops/policy.ts:80`, `src/ops/retention/retentionEngine.ts:235`).

These controls are strong technical foundations and should be wrapped with formal management-system governance artifacts.

## 7. Certification Readiness Assessment

Current readiness: **Low-to-Moderate (technical controls strong, management system weakly formalized)**.

Blocking items before ISO/IEC 42001 certification-readiness claim:
- Missing formal AIMS policy and scope package.
- Missing documented internal audit and management review process.
- Missing controlled nonconformity/CAPA governance records.
- Missing required documented information set for operational lifecycle and impact governance.

## 8. 90-Day AIMS Build Plan

### Days 0-30

1. Publish AIMS policy, scope, and stakeholder context pack.
2. Define clause owner matrix (accountable/responsible/consulted/informed).
3. Create documented information control procedure.

### Days 31-60

1. Implement internal audit plan and first audit cycle.
2. Implement management review cadence and sign-off records.
3. Formalize risk, impact, and transparency document templates.

### Days 61-90

1. Stand up CAPA register with effectiveness verification.
2. Run end-to-end certification-readiness rehearsal and evidence walk-through.
3. Freeze document baseline and enforce change-control signatures.

## Reference

- ISO/IEC 42001 overview: https://www.iso.org/standard/81230.html
