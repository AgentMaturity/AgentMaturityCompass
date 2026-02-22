# Wave 4 Regulatory Audit — AMC (Agent Maturity Compass)

- Date: 2026-02-22
- Auditor: Wave4 Agent 7 (engineering compliance review)
- Scope: repository evidence in `src/`, `docs/`, `tests/` only
- Standard lens: EU AI Act (Regulation (EU) 2024/1689), NIST AI RMF 1.0, ISO/IEC 42001 clause structure
- Disclaimer: this is an engineering gap audit, not legal advice

## Regulatory Baseline Used

- EU AI Act (official text): https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689
  - High-risk classification rules (Art. 6 + Annex III)
  - High-risk obligations (Arts. 9-15, 17)
  - Deployer obligations and log retention baseline (Art. 26)
  - FRIA obligations for certain deployers (Art. 27)
  - Right to explanation (Art. 86)
  - Applicability timeline (Art. 113)
- NIST AI RMF 1.0: https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf
- ISO/IEC 42001 overview: https://www.iso.org/standard/81230.html

## Executive Determination

### 1) Does AMC itself qualify as a high-risk AI system?

Conclusion: **not by default, but potentially yes depending intended purpose and deployment context**.

Rationale:
- AMC is primarily a governance/evidence/control platform and scoring engine.
- Under the AI Act, high-risk status is use-case based (Art. 6 + Annex III), not brand based.
- AMC explicitly supports high-risk domains (`docs/DOMAIN_PACKS.md:12`, `docs/DOMAIN_PACKS.md:14`, `docs/DOMAIN_PACKS.md:20`), so deployments in Annex III-like contexts can move it into high-risk obligations.

Practical classification for AMC:
- `Platform mode (generic governance tooling)` -> generally not automatically high-risk.
- `Decision-support/automation in Annex III context` -> treat as high-risk deployment, apply high-risk obligations.

### 2) Which obligations apply?

If AMC is used in high-risk context, at minimum:
- Provider-style controls: risk management, data governance, technical documentation, logging, transparency, human oversight, robustness/cybersecurity, QMS.
- Deployer-style controls: lawful use, oversight assignment, monitoring, log retention, FRIA (where applicable), cooperation with incident reporting.
- Rights/transparency controls: user-facing explanation and contestability process for significant decisions (Art. 86 scope).

### 3) EU AI Act timing context (as of 2026-02-22)

- The Regulation entered into force in 2024; core application date is **2026-08-02** (Art. 113).
- Earlier obligations already applicable include:
  - **2025-02-02**: Chapters I and II.
  - **2025-08-02**: Section 4, Chapter III and Chapter V (including GPAI layer in scope of Art. 113 split dates).
- Later applicability:
  - **2027-08-02** for Article 6(1) and related obligations per Art. 113 split schedule.

## What AMC Already Implements Well

- Tamper-evident logging backbone:
  - Append-only ledger and immutable triggers (`src/ledger/ledger.ts:187`, `src/ledger/ledger.ts:193`)
  - Hash-chained transparency log + signed seals (`src/transparency/logChain.ts:98`, `src/transparency/logChain.ts:143`)
- Signed policy/evidence-map model:
  - compliance map signing and signature verification (`src/compliance/complianceEngine.ts:110`, `src/compliance/complianceEngine.ts:146`)
- Retention/archive primitives:
  - signed archive segments + prune lifecycle (`src/ops/retention/retentionEngine.ts:251`, `src/ops/retention/retentionEngine.ts:310`)
  - policy-driven retention defaults (`src/ops/policy.ts:76`)
- Framework coverage scaffolding exists for NIST and ISO 42001 categories (`src/compliance/frameworks.ts:22`, `src/compliance/frameworks.ts:38`).

## Critical/High Gaps

### Critical Gap A — High-risk classification and applicability are not operationalized

Evidence:
- EU risk classification is optional file read only (`src/score/euAIActCompliance.ts:47`) with no deterministic classifier workflow.
- No enforceable Annex III classifier or applicability decision record in compliance engine.

Impact:
- Teams can run “EU AI Act scoring” without a formal legal-role and high-risk determination decision.

### Critical Gap B — EU AI Act compliance scoring is file-existence heuristic, not obligation proof

Evidence:
- EU scoring relies on presence of selected files/paths (`src/score/euAIActCompliance.ts:55`, `src/score/euAIActCompliance.ts:61`, `src/score/euAIActCompliance.ts:67`, `src/score/euAIActCompliance.ts:91`, `src/score/euAIActCompliance.ts:109`).
- Required artifacts referenced by scorer are mostly absent in repo (`docs/RISK_MANAGEMENT.md`, `docs/DATA_GOVERNANCE.md`, `docs/FRIA.md`, `docs/QA.md` missing).

Impact:
- Reported readiness can diverge from legal readiness.

### High Gap C — EU AI Act not integrated into evidence-linked compliance engine

Evidence:
- Main compliance frameworks exclude EU AI Act (`src/compliance/frameworks.ts:1`).
- CLI `compliance report` only accepts framework list from that type (`src/cli.ts:6773`).
- EU AI Act is handled in separate score command (`src/cli.ts:13846`) rather than signed evidence-linked compliance report path.

Impact:
- No single signed, deterministic EU AI Act control report equivalent to SOC2/NIST/ISO compliance report flow.

### High Gap D — Right-to-explanation controls are not implemented as a rights workflow

Evidence:
- Explainability packet is cryptographic wrapper only (`src/watch/explainabilityPacket.ts:20`) and CLI builds from agentId/runId placeholders (`src/cli.ts:13102`).
- Governance assurance uses regex checks for words like “explain/appeal/contest” (`src/assurance/packs/governanceNISTRMFPack.ts:27`).
- Domain scoring expects contestability workflow but there is no dedicated implementation module (`src/score/domainPacks.ts:515`, `src/score/domainPacks.ts:517`).

Impact:
- Art. 86 style explanation rights cannot be consistently fulfilled/audited for affected persons.

### High Gap E — ISO 42001 and regulatory readiness scoring can overstate maturity via path existence

Evidence:
- ISO controls in readiness score pass if *any* referenced path exists (`src/score/regulatoryReadiness.ts:202`, `src/score/regulatoryReadiness.ts:207`).
- Some evidence paths are missing documentation artifacts (`src/score/regulatoryReadiness.ts:67`, `src/score/regulatoryReadiness.ts:73`, `src/score/regulatoryReadiness.ts:79`).

Impact:
- AIMS readiness can look stronger than actual management-system implementation.

## Medium Gaps

### Medium Gap F — NIST AI RMF MAP and MANAGE depth is partial

Evidence:
- NIST functions exist as categories (`src/compliance/frameworks.ts:24`) and built-in mappings (`src/compliance/builtInMappings.ts:139`, `src/compliance/builtInMappings.ts:163`, `src/compliance/builtInMappings.ts:181`, `src/compliance/builtInMappings.ts:203`).
- MAP relies on generic `audit/review` evidence types (`src/compliance/builtInMappings.ts:167`) rather than mandatory stakeholder/impact register schema.

Impact:
- Govern/Measure are stronger than Map/Manage in repeatable control evidence quality.

### Medium Gap G — Documentation consistency drift

Evidence:
- `docs/COMPLIANCE.md` lists SOC2/NIST/ISO27001 only (`docs/COMPLIANCE.md:14`) despite code supporting ISO_42001 (`src/compliance/frameworks.ts:38`).
- Standards mapping doc contains path note pointing to `AMC_OS` origin (`docs/STANDARDS_MAPPING.md:320`).

Impact:
- Auditor confidence risk due mismatched product claims vs current generated artifacts.

## Missing Audit-Trail Areas Relative to Regulatory Expectations

- Strong: append-only event chain and transparency sealing are present.
- Missing/partial for regulatory-grade traceability:
  - No explicit high-risk-decision explanation request/response log schema tied to rights handling.
  - No explicit regulator-reporting timeline evidence model for serious incidents (deadline tracking + outbound report receipts).
  - No explicit log-profile templates for sector-specific Annex III fields; logs are generic (`meta_json`) rather than requirement-profiled.

## Right-to-Explanation Assessment

Status: **Fail/Partial**.

- Current capability: internal explainability artifacts and maturity questions.
- Missing capability: external-facing, case-level explanation service with plain-language rationale, evidence references, review/appeal path, SLA tracking, and immutable request ledger.

## Compliance Posture Summary (as audited)

- EU AI Act high-risk readiness: **Partial with critical gaps**
- NIST AI RMF implementation depth: **Partial (Govern/Measure stronger than Map/Manage)**
- ISO 42001 AIMS alignment: **Partial (control signals exist; management-system structure incomplete)**
- Audit trail foundation: **Strong cryptographic core, incomplete rights/regulator workflow layer**

## Recommended Remediation Plan (90-day)

### 0-30 days

1. Add an AI Act applicability decision record and Annex III classifier workflow.
2. Integrate `EU_AI_ACT` as first-class framework in `src/compliance/frameworks.ts` and compliance report CLI.
3. Publish missing core docs under `docs/`: risk management, data governance, FRIA, QMS/AIMS policy, technical documentation index, instructions-for-use template.

### 31-60 days

1. Implement rights workflow module: explanation requests, response artifacts, appeal handling, immutable logs.
2. Implement serious incident regulatory-reporting lifecycle with deadlines, evidence receipts, and closure attestations.
3. Replace pure existence checks with schema-validated evidence packages and signed attestations.

### 61-90 days

1. Build AIMS internal audit + management review cadence artifacts aligned to ISO clauses 9-10.
2. Add sector-specific logging profiles for Annex III deployment types.
3. Add continuous control testing for all EU AI Act obligations in CI (not only keyword/artifact token checks).
