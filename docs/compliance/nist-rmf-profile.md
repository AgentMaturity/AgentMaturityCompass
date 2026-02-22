# NIST AI RMF Profile — AMC (Govern / Map / Measure / Manage)

- Audit date: 2026-02-22
- Framework basis: NIST AI RMF 1.0
- Evidence scope: repo controls in `src/`, docs in `docs/`, tests in `tests/`

## Current-State Profile

| Function | Maturity (0-5) | Status | Current Evidence | Key Gaps |
|---|---:|---|---|---|
| GOVERN | 3.5 | PARTIAL-STRONG | Framework family includes Govern (`src/compliance/frameworks.ts:24`); control mapping exists (`src/compliance/builtInMappings.ts:139`); signed policy/evidence-map model (`src/compliance/complianceEngine.ts:110`) | No formal governance charter package with mandatory approver attestations and review minutes |
| MAP | 2.5 | PARTIAL | MAP control category exists (`src/compliance/builtInMappings.ts:163`); domain context/risk packs exist (`docs/DOMAIN_PACKS.md:12`) | MAP evidence is mostly generic `audit/review` event checks (`src/compliance/builtInMappings.ts:167`), lacking required stakeholder/impact inventory schema |
| MEASURE | 3.0 | PARTIAL | MEASURE mapping exists (`src/compliance/builtInMappings.ts:181`); metrics/test/audit signals required (`src/compliance/builtInMappings.ts:185`) | No unified risk-metric catalog with thresholds, uncertainty, and model/system-specific measurement governance |
| MANAGE | 2.5 | PARTIAL | MANAGE mapping exists (`src/compliance/builtInMappings.ts:203`); remediation-oriented events included (`src/compliance/builtInMappings.ts:206`) | No explicit enterprise risk treatment register and closure effectiveness loop tied to accountable owners |

## Control-Implementation Notes

### GOVERN

Implemented:
- Signed compliance map governance (`src/compliance/complianceEngine.ts:110`).
- Cryptographic evidence chain foundations (`src/ledger/ledger.ts:187`, `src/transparency/logChain.ts:143`).

Gaps:
- Governance evidence focuses on event presence rather than management review outcomes.
- Public-sector governance assurance pack validates by keyword regex in model responses (`src/assurance/packs/governanceNISTRMFPack.ts:7`).

### MAP

Implemented:
- MAP represented as a compliance category (`src/compliance/builtInMappings.ts:163`).
- Domain-specific profiles with regulatory context (`docs/DOMAIN_PACKS.md:12`).

Gaps:
- No canonical stakeholder register schema required by engine.
- No formal harm/impact taxonomy artifact with versioned approval chain.

### MEASURE

Implemented:
- MEASURE uses deterministic evidence requirements: `metric`, `test`, `audit` (`src/compliance/builtInMappings.ts:187`).
- Assurance packs and tests exist for many scenarios (`tests/regulatoryAssurancePacks.test.ts:24`).

Gaps:
- Measurement quality can still be inferred from activity, not calibrated risk thresholds.
- No documented measurement policy linking confidence bounds to control decisions.

### MANAGE

Implemented:
- MANAGE category evaluates mitigation-related evidence and denylisted failures (`src/compliance/builtInMappings.ts:214`).
- Incident and retention machinery exists (`src/incidents/incidentTypes.ts:27`, `src/ops/retention/retentionEngine.ts:229`).

Gaps:
- No explicit risk acceptance and residual-risk sign-off workflow.
- No mandatory post-remediation effectiveness metrics across all risk classes.

## Cross-Cutting Risks

1. Compliance scoring can be over-crediting because many checks are activity/presence based.
2. Explainability/contestability controls are referenced in domain questions but not implemented as a first-class rights workflow (`src/score/domainPacks.ts:515`).
3. Governance pack includes regex-based validation of policy language (`src/assurance/packs/governanceNISTRMFPack.ts:7`), which is weak evidence for real control operation.

## Target-State Profile (Recommended)

| Function | 90-Day Target | Required Deliverables |
|---|---|---|
| GOVERN | 4.5 | Signed AI governance charter, role matrix, quarterly management review logs, policy exception register |
| MAP | 4.0 | Stakeholder register schema, impact inventory, use-case boundary definitions, misuse-case catalog |
| MEASURE | 4.0 | Metric catalog with thresholds and uncertainty rules, evaluation SOP, calibration evidence ledger |
| MANAGE | 4.0 | Risk treatment register, remediation ownership SLA, residual-risk approvals, effectiveness verification protocol |

## Priority Actions

1. Implement structured MAP artifacts as required inputs to compliance scoring (not optional docs).
2. Replace keyword/regex assurance checks with deterministic artifact/schema checks.
3. Add a risk-treatment lifecycle model with accountable owner, due dates, and closure evidence.
4. Add function-level KPI dashboard with trend lines and control-health thresholds.

## Reference

- NIST AI RMF 1.0: https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf
