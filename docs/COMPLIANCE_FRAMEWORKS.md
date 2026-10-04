# Compliance Frameworks

AMC provides built-in mappings and pre-built policy packs for major compliance frameworks.

## Supported Frameworks

### NIST AI RMF 1.0
**NIST AI Risk Management Framework**

The NIST AI RMF provides a structured approach to managing AI risks across four core functions:

- **Govern**: Governance structures, approvals, and policy enforcement
- **Map**: Context mapping, role boundaries, and risk framing
- **Measure**: Measured quality, integrity, and auditability
- **Manage**: Active risk response and remediation loops

**Pre-built Policy Pack**: `nist_ai_rmf_policy_pack()`

### SOC 2 Type II
**Trust Services Criteria**

SOC 2 Type II focuses on five trust service categories:

- **Security**: Preventing unauthorized actions and policy bypass
- **Availability**: Operational reliability and service continuity
- **Confidentiality**: Secret handling, redaction, and data boundary enforcement
- **Processing Integrity**: Verification discipline and correctness controls
- **Privacy**: Consent-aware operations and minimization

**Pre-built Policy Pack**: `soc2_policy_pack()`

### ISO/IEC 42001:2023
**AI Management System**

ISO 42001 provides a comprehensive AI management system framework with:

- **Clause 4**: Context and stakeholder expectations
- **Clause 5**: Leadership commitment and accountability
- **Clause 6**: Risk/opportunity planning
- **Clause 7**: Support resources and competence
- **Clause 8**: Operational lifecycle controls
- **Clause 9**: Performance evaluation
- **Clause 10**: Continual improvement
- **ISO 42005**: Impact assessment methodology
- **ISO 42006**: Conformity evidence packages

**Pre-built Policy Pack**: `iso42001_policy_pack()`

### GDPR
**General Data Protection Regulation (EU) 2016/679**

GDPR establishes data protection principles and requirements:

- **Art. 5**: Lawfulness, fairness, transparency, purpose limitation, data minimization, accuracy, storage limitation, integrity & confidentiality, and accountability
- **Art. 6**: Lawful basis for processing
- **Art. 15-22**: Data subject rights (access, rectification, erasure, restriction, portability, objection)
- **Art. 25**: Data protection by design and by default
- **Art. 32**: Security of processing
- **Art. 33-34**: Breach notification
- **Art. 35**: Data Protection Impact Assessment (DPIA)

**Pre-built Policy Pack**: `gdpr_policy_pack()`

### EU AI Act
**Regulation (EU) 2024/1689 — High-Risk AI Obligations**

The EU AI Act establishes requirements for high-risk AI systems:

- **Art. 9**: Risk management system
- **Art. 10**: Data governance
- **Art. 11**: Technical documentation
- **Art. 12**: Record-keeping and logging
- **Art. 13**: Transparency and information provision
- **Art. 14**: Human oversight measures
- **Art. 15**: Accuracy, robustness, and cybersecurity
- **Art. 17**: Quality management system
- **Art. 27**: Fundamental Rights Impact Assessment (FRIA)
- **Art. 72**: Post-market monitoring
- **Art. 73**: Incident reporting
- **Art. 86**: Right to explanation

## Using Pre-built Policy Packs

### Python

```python
from amc.watch.prebuilt_policy_packs import (
    nist_ai_rmf_policy_pack,
    soc2_policy_pack,
    iso42001_policy_pack,
    gdpr_policy_pack,
    get_all_prebuilt_packs,
)
from amc.watch.w10_policy_packs import PolicyPackRegistry

# Install a single pack
registry = PolicyPackRegistry()
pack = nist_ai_rmf_policy_pack()
pack_id = registry.install(pack)
registry.activate(pack_id)

# Install all packs
for pack in get_all_prebuilt_packs():
    registry.install(pack)

# Run marketplace scan
result = registry.run_marketplace_scan()
print(f"Passed: {result.passed}, Risk Score: {result.risk_score}")
```

### CLI

```bash
# List available frameworks
amc guide --frameworks

# Generate compliance report for a framework
amc compliance report --framework NIST_AI_RMF --output report.json

# Generate reports for all frameworks
amc compliance report --framework SOC2 --output soc2-report.json
amc compliance report --framework ISO_42001 --output iso42001-report.json
amc compliance report --framework GDPR --output gdpr-report.json
amc compliance report --framework EU_AI_ACT --output euai-report.json

# Frameworks are selected per report, not installed — there is no policy-pack
# command. The framework list is fixed and validated by `compliance report`.
amc compliance report --framework NIST_AI_RMF --output nist-report.json

# Assurance packs, which are installable, are a different thing:
amc pack search nist
amc pack install <name>
amc pack list

# Scan installed packs
amc pack list
```

## Compliance Mapping Structure

Each compliance mapping defines:

- **Framework**: The compliance framework (SOC2, NIST_AI_RMF, ISO_42001, GDPR, EU_AI_ACT)
- **Category**: Specific control family or article
- **Description**: What the control requires
- **Evidence Requirements**: 
  - Required evidence event types (audit, metric, test, etc.)
  - Minimum observed ratio (0.0-1.0)
  - Required assurance packs with minimum scores
  - Audit types that must NOT be present (denylist)
- **Related**:
  - AMC diagnostic questions
  - Assurance packs
  - Configuration files

## Control Crosswalk Receipts

Auditor-ready crosswalks use `buildControlCrosswalkReceipt` from `src/compliance/controlCrosswalk.ts`. A crosswalk receipt maps existing AMC compliance mappings to framework clauses without creating a new compliance framework or legal-certification claim.

Each control row includes:

- **Framework clause**: The existing compliance mapping category, such as NIST AI RMF `Govern`, ISO 42001 `Clause 5 Leadership`, EU AI Act `Art. 12 Record-Keeping`, SOC 2 `Security`, or a sector framework clause such as HIPAA `§164.312 Technical Safeguards`.
- **AMC question IDs**: Diagnostic questions already linked by the compliance mapping.
- **Evidence types**: Required event, assurance-pack, or audit-absence evidence from the mapping.
- **Owner**: Accountable control owner supplied by the operator.
- **Exception state**: `none`, `pending`, `approved`, `rejected`, or `expired`.
- **Source citations**: Source-backed framework or review references supplied to the receipt.
- **Evidence chain**: Event hashes and signed evidence refs for the row, summarized with a row-level evidence-chain hash.

Crosswalk verification fails closed when source citations are missing, a row lacks an owner, a row lacks evidence lineage, or a non-`none` exception has no signed evidence reference and signature hash. Paper metadata, framework names, local notes, or self-reported owner names are not enough to satisfy a crosswalk without signed evidence and row hashes.

## Reviewer Independence Receipts

High-risk approval reviews can use `buildReviewerIndependenceReceipt` from `src/audit/reviewerIndependence.ts` to prove reviewer separation without adding a separate workflow engine. The receipt is a generic audit artifact for existing Comply, Passport, and Vault evidence paths.

Each reviewer row includes:

- **Reviewer metadata**: requester/control owner, reviewer, role, org unit, action, control, risk tier, decision, and decision time.
- **Role separation**: a separation rule ID plus checks that the reviewer is not the requester and is not acting in the same role.
- **Conflict flags**: the conflict-check timestamp, conflict flags, and signed conflict-check evidence.
- **Second review**: required signed second-review metadata for `high` and `critical` actions.
- **Approval receipt**: the signed approval receipt reference and signature hash.
- **Evidence lineage**: event hashes and signed evidence references summarized into an evidence-chain hash.
- **Source citations**: source-backed review or control obligations supplied by the operator.

Reviewer-independence verification fails closed when source citations are missing, the reviewer cannot be identified, the separation rule is missing, the reviewer is also the requester, a conflict check is missing or unsigned, a conflict flag is present, a high-risk second review is missing or unsigned, an approval receipt is missing, or evidence lineage is missing or malformed. Source metadata, paper titles, policy names, or unsigned reviewer notes do not satisfy the receipt.

## Post-Hoc Audit Sampling Receipts

Completed autonomous actions can use `buildPosthocAuditSamplingReceipt` from `src/audit/posthocAuditSampling.ts` to prove retrospective human audit coverage without adding a separate audit-workflow engine. The receipt is a generic Comply, Passport, and Vault artifact for sampled action reviews, audit findings, corrective actions, and scoring deltas.

Each sampled action row includes:

- **Sample plan**: plan ID, population ID, population size, sample size, method, risk tier, owner, plan time, signed plan evidence, and signature hash.
- **Reviewed action**: action ID, agent ID, policy ID, completion time, sample time, reviewer ID, review decision, signed review evidence, and signature hash.
- **Findings**: signed finding records with severity, owner, opened time, and action linkage.
- **Corrective actions**: signed corrective-action records linked to findings, with owner, status, due date, and optional regression test reference.
- **Score impact**: signed diagnostic score-impact rows with dimension ID, question ID, before/after scores, impact, and reason.
- **Evidence lineage**: event hashes and signed evidence references summarized into an evidence-chain hash.
- **Source citations**: source-backed review or control obligations supplied by the operator.

Post-hoc audit sampling verification fails closed when source citations are missing, the sample plan is missing or unsigned, reviewed action metadata is missing, review evidence is unsigned, evidence lineage is missing, non-passing reviews lack findings, findings lack corrective actions, score impact rows are missing, or row and receipt hashes do not verify. Source metadata, website labels, policy names, or unsigned review notes do not satisfy the receipt.

## Governance Exception Lifecycle Receipts

Governance exception and waiver reviews can use `buildGovernanceExceptionLifecycleReceipt` from `src/compliance/exceptionLifecycle.ts` to prove temporary risk acceptances without adding a separate workflow engine. The receipt is a generic Comply, Passport, and Vault artifact for policy exceptions, compliance waivers, and compensating-control windows.

Each exception row includes:

- **Exception request**: exception ID, policy ID, control ID, requester, request reason, request time, signed request evidence, and accountable owner.
- **Approval**: approver, decision, decision time, signed approval evidence, and approval signature hash.
- **Expiry**: expiry timestamp, expiry-check timestamp, signed expiry-check evidence, and expiry signature hash.
- **Compensating controls**: one or more signed compensating controls with owners and descriptions.
- **Renewal outcome**: signed renewal, denial, or not-requested decision with approver, reason, and decision time.
- **Evidence lineage**: event hashes and signed evidence references summarized into an evidence-chain hash.
- **Source citations**: source-backed review or control obligations supplied by the operator.

Exception-lifecycle verification fails closed when source citations are missing, the policy/control mapping is missing, the owner is missing, the request is unsigned, the approval is unsigned, expiry proof is missing, compensating controls are missing or unsigned, renewal outcome is missing or unsigned, or evidence lineage is missing or malformed. Source metadata, website labels, policy names, or unsigned waiver notes do not satisfy the receipt.

## Policy Drift Impact Receipts

Policy changes can use `buildPolicyDriftImpactReceipt` from `src/compliance/policyDrift.ts` to prove change impact before rollout without adding a separate policy-management platform. The receipt is a generic Comply, Passport, and Vault artifact for policy diffs, affected agents, affected controls, affected tests, prior decisions, recheck lists, and rollout receipts.

Each policy drift row includes:

- **Policy diff**: policy ID, before/after versions, before/after policy hashes, change owner, change timestamp, rationale, diff summary, signed diff evidence, and signature hash.
- **Affected agents**: agent IDs, environments, current and required policy versions, impact level, reason, signed evidence, and signature hash.
- **Affected controls**: framework/control IDs, owners, change type, signed evidence, and signature hash.
- **Affected tests**: test IDs, commands, owners, reasons, signed evidence, and signature hash.
- **Prior decisions**: release, waiver, approval, or compliance decisions that must be rechecked when policy drift invalidates previous proof.
- **Recheck list**: owner, due date, action, status, signed recheck evidence, and signature hash.
- **Rollout receipt**: rollout ID, approver, approval time, rollout window, rollback plan reference, signed rollout evidence, and signature hash.
- **Evidence lineage**: event hashes and signed evidence references summarized into an evidence-chain hash.
- **Source citations**: source-backed review or control obligations supplied by the operator.

Policy-drift verification fails closed when source citations are missing, the policy diff is missing or unsigned, affected agents are missing, affected controls are missing, affected tests are missing, prior decisions are missing, recheck items are missing, rollout proof is missing or unsigned, evidence lineage is missing, or row and receipt hashes do not verify. Source metadata, website labels, policy names, or unsigned impact notes do not satisfy the receipt.

## Third-Party Provider Risk Receipts

Third-party provider reviews can use `buildThirdPartyProviderRiskReceipt` from `src/compliance/providerRisk.ts` to capture provider and vendor risk without creating a provider-specific integration. The receipt is a generic Comply, Passport, and Vault artifact for external agents, model providers, tool providers, data providers, and infrastructure providers.

Each provider row includes:

- **Provider record**: provider ID, name, type, owner, review date, next review date, and allowed use cases.
- **Attestations**: signed SOC 2, ISO 42001, security questionnaire, AI safety, or custom attestations.
- **Data boundary**: data classes, allowed regions, subprocessors, retention, transfer mechanism, and signed boundary evidence.
- **Model restrictions**: operator-defined restrictions such as no regulated decisioning or no autonomous funds transfer.
- **Contractual controls**: obligations, status, owner, review date, and signed control evidence.
- **Exceptions**: signed exception workflow state and owner.
- **Evidence lineage**: event hashes and signed evidence references summarized into an evidence-chain hash.
- **Source citations**: source-backed review or control obligations supplied by the operator.

Provider-risk verification fails closed when source citations are missing, provider record metadata is missing, owner or review date is missing, attestations are missing or unsigned, data boundary evidence is missing or unsigned, contractual controls are missing or unsigned, exceptions are unsigned, or evidence lineage is missing or malformed. Source metadata, paper titles, vendor names, website copy, or unsigned questionnaires do not satisfy the receipt.

## Evidence Requirements

### Evidence Event Types

- `audit`: Audit trail events
- `metric`: Performance and quality metrics
- `test`: Test execution results
- `review`: Manual review records
- `llm_request`: LLM API requests
- `llm_response`: LLM API responses
- `tool_action`: Tool execution actions
- `tool_result`: Tool execution results
- `artifact`: Documentation and artifacts
- `gateway`: Gateway routing events

### Assurance Packs

Pre-defined test suites that validate specific security properties:

- `governance_bypass`: Tests for policy bypass attempts
- `injection`: Prompt injection and adversarial input tests
- `exfiltration`: Data exfiltration and secret leakage tests
- `hallucination`: Factual accuracy and hallucination tests
- `unsafe_tooling`: Unsafe tool usage tests
- `duality`: Role confusion and boundary tests

### Audit Denylist

Specific audit event types that indicate non-compliance:

- `GOVERNANCE_BYPASS_SUCCEEDED`: Policy bypass detected
- `SECRET_EXFILTRATION_SUCCEEDED`: Data exfiltration detected
- `EXECUTE_WITHOUT_TICKET_ATTEMPTED`: Unauthorized execution
- `TRACE_RECEIPT_INVALID`: Evidence integrity failure
- `DRIFT_REGRESSION_DETECTED`: Quality regression
- `MISSING_CONSENT`: Consent violation
- `POLICY_VIOLATION`: Policy violation

## Compliance Status

Each control category can have one of four statuses:

- **SATISFIED**: All evidence requirements met
- **PARTIAL**: Some evidence requirements met
- **MISSING**: No evidence found
- **UNKNOWN**: Unable to determine status

## Extending Compliance Mappings

To add a new framework or extend existing mappings:

1. Add the framework to `src/compliance/frameworks.ts`:
   ```typescript
   export type ComplianceFramework = "..." | "NEW_FRAMEWORK";
   ```

2. Add framework family definition:
   ```typescript
   {
     framework: "NEW_FRAMEWORK",
     displayName: "Framework Display Name",
     categories: ["Category 1", "Category 2", ...]
   }
   ```

3. Add mappings to `src/compliance/builtInMappings.ts`:
   ```typescript
   mapping({
     id: "framework_category",
     framework: "NEW_FRAMEWORK",
     category: "Category Name",
     description: "Control description",
     evidenceRequirements: [...],
     related: {
       questions: ["AMC-X.Y"],
       packs: ["pack_name"],
       configs: ["config.yaml"]
     }
   })
   ```

4. Create pre-built policy pack in `platform/python/amc/watch/prebuilt_policy_packs.py`

5. Add tests in `platform/python/tests/test_prebuilt_policy_packs.py`

## Best Practices

1. **Evidence-Based**: All compliance claims must be backed by deterministic evidence
2. **Privacy-Safe**: Never require raw prompt/content disclosure
3. **Deterministic Checks**: Keep checks deterministic and evidence-bound
4. **Fixed Reason Templates**: No model-generated compliance text
5. **Signed Configurations**: All compliance maps must be signed and verified
6. **Governance Gates**: Only OWNER can apply new compliance maps

## Regulatory Currency Register

`src/compliance/regulatory/register.json` is the sourced list of instruments that govern AI agents across the seven stations (health, education, environment, mobility, governance, technology, wealth). Each entry records the instrument, obligations relevant to agents, key dates, official sources with `retrievedAt`, `lastReviewed`, and per-fact `verified` flags. An entry is `verified` only when every date and obligation it encodes was read from an official source and nothing is left open; otherwise its `openQuestions` say what was not confirmed. It replaces the five 2020-2023 `GLOBAL_FRAMEWORKS` records as the authority for dates and status; `GLOBAL_FRAMEWORKS` remains as a legacy view and links each record by `registerId`.

```bash
node scripts/check-regulatory-currency.mjs            # exit 1 if any entry is malformed, unsourced, cites a non-official host or is older than 90 days
node scripts/check-regulatory-currency.mjs --now 2027-01-15 --json   # --now is an alias of --as-of; unknown flags exit 1
```

`--json` lists every entry with `status`, `lastReviewed`, `windowDays`, `currency` and its sources (`url`, `retrievedAt`), plus `allowedHosts`. Source hosts must be on `policy.officialHosts` in the register (regulators, legislatures, official journals, standards bodies), exported as `OFFICIAL_SOURCE_HOSTS` from `src/compliance/regulatory/index.ts`.

Register as reviewed on 2026-10-03 (17 entries, 11 verified, 6 unverified):

| Instrument | Jurisdiction | Status | Key dates | Primary source | Retrieved | Verified |
|---|---|---|---|---|---|---|
| Artificial Intelligence Act — Regulation (EU) 2024/1689, as amended by Regulation (EU) 2026/1744 (Digital Omnibus on AI) | EU | partially-applicable | 2024-08-01, 2025-02-02, 2025-08-02, 2026-07-27, 2026-08-02, 2026-12-02, 2027-08-02, 2027-12-02, 2028-08-02 | [European Commission](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-113) | 2026-10-03 | yes |
| General Data Protection Regulation — Regulation (EU) 2016/679 | EU | in-force | 2016-05-24, 2018-05-25 | [European Commission](https://commission.europa.eu/law/law-topic/data-protection/legal-framework-eu-data-protection_en) | 2026-10-03 | yes |
| Digital Operational Resilience Act — Regulation (EU) 2022/2554 | EU | in-force | 2025-01-17 | [EIOPA](https://www.eiopa.europa.eu/digital-operational-resilience-act-dora_en) | 2026-10-03 | yes |
| NIS2 Directive — Directive (EU) 2022/2555 | EU | in-force | 2024-10-17, 2024-10-18, 2026-01-20 | [European Commission](https://digital-strategy.ec.europa.eu/en/policies/nis2-directive) | 2026-10-03 | no |
| Cyber Resilience Act — Regulation (EU) 2024/2847 | EU | partially-applicable | 2024-12-10, 2026-09-11, 2027-12-11 | [European Commission](https://digital-strategy.ec.europa.eu/en/policies/cyber-resilience-act) | 2026-10-03 | yes |
| Medical Devices Regulation and In Vitro Diagnostic Medical Devices Regulation — Regulation (EU) 2017/745; Regulation (EU) 2017/746 | EU | in-force | 2021-05-26, 2022-05-26 | [European Commission](https://health.ec.europa.eu/medical-devices-sector/new-regulations_en) | 2026-10-03 | no |
| NIST AI Risk Management Framework 1.0 — NIST AI 100-1 | US | in-force | 2023-01-26, 2026-04-07 | [NIST](https://www.nist.gov/itl/ai-risk-management-framework) | 2026-10-03 | yes |
| Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile — NIST AI 600-1 | US | in-force | 2024-07-26 | [NIST](https://www.nist.gov/itl/ai-risk-management-framework) | 2026-10-03 | yes |
| Information technology — Artificial intelligence — Management system — ISO/IEC 42001:2023 | International | published | 2023-12 (unverified) | [ISO](https://www.iso.org/standard/42001) | 2026-10-03 | no |
| Information technology — Artificial intelligence (AI) — AI system impact assessment — ISO/IEC 42005:2025 | International | published | 2025-05 (unverified) | [ISO](https://www.iso.org/standard/42005) | 2026-10-03 | no |
| Consumer Protections for Artificial Intelligence — Colorado SB24-205 | US-CO | superseded | 2024-05-17, 2026-02-01, 2026-06-30 | [Colorado General Assembly](https://leg.colorado.gov/bills/sb24-205) | 2026-10-03 | yes |
| Automated Decision-Making Technology — Colorado SB26-189 (repeals and reenacts Part 17 of Article 1 of Title 6, C.R.S.) | US-CO | enacted-not-yet-applicable | 2026-05-14, 2027-01-01 | [Colorado General Assembly](https://leg.colorado.gov/bills/sb26-189) | 2026-10-03 | yes |
| Personal Information Protection Law of the People's Republic of China — 中华人民共和国个人信息保护法 | CN | in-force | 2021-08-20, 2021-11-01 | [Cyberspace Administration of China](https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm) | 2026-10-03 | yes |
| Interim Measures for the Management of Generative Artificial Intelligence Services — 生成式人工智能服务管理暂行办法 | CN | in-force | 2023-08-15 | [Cyberspace Administration of China](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm) | 2026-10-03 | yes |
| Lei Geral de Proteção de Dados Pessoais — Lei nº 13.709, de 14 de agosto de 2018 | BR | in-force | 2018-12-28, 2021-08-01, 2020-09-18 (unverified) | [Presidência da República (Planalto)](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) | 2026-10-03 | no |
| Digital Personal Data Protection Act, 2023 and DPDP Rules, 2025 — Act No. 22 of 2023 | IN | partially-applicable | 2025-11-14 | [Press Information Bureau, Government of India](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014&reg=3&lang=2) | 2026-10-03 | no |
| Act on the Protection of Personal Information — Act No. 57 of 2003 (translation as amended by Act No. 37 of 2021) | JP | in-force | 2023-04-01 | [Personal Information Protection Commission, Japan](https://www.ppc.go.jp/en/legal/) | 2026-10-03 | yes |

Unverified entries and why: NIS2 (reporting stages and sector scope not on the page read), MDR/IVDR (Regulation (EU) 2023/607 transition dates not stated on the page read), ISO/IEC 42001 and 42005 (iso.org answered with a bot challenge; month-level dates come from the search index), LGPD (the 2020-09-18 general effective day depends on Lei 14.058/2020, not read), DPDP (phase dates of the 18-month timeline not stated; India Code timed out).

### Regulatory feeds

`DEFAULT_REGULATORY_FEEDS` (`src/compliance/regulatory/feeds.ts`) lists six live official feeds — AI Act Service Desk RSS, Commission digital-strategy RSS, EDPB news RSS, NIST news RSS, Federal Register API v1, FCA news RSS — each with the HTTP status and time of a GET made on 2026-10-03. ISO, OWASP, MITRE ATLAS, AI Verify and TC260 are web pages or non-regulators: they are kept as `manual-review-required` and disabled, with the reason recorded. A feed change is a prompt for human review, never a legal date; RSS items carry `effectiveDateEstimated: true`.

## References

- [NIST AI RMF 1.0](https://www.nist.gov/itl/ai-risk-management-framework) — retrieved 2026-10-03
- [SOC 2 Trust Services Criteria](https://www.aicpa.org/soc4so) — not re-checked in the 2026-10-03 review
- [ISO/IEC 42001:2023](https://www.iso.org/standard/81230.html) — retrieval attempted 2026-10-03, HTTP 403 bot challenge
- [GDPR (EU) 2016/679 — European Commission legal framework page](https://commission.europa.eu/law/law-topic/data-protection/legal-framework-eu-data-protection_en) — retrieved 2026-10-03
- [EU AI Act (EU) 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj) — EUR-Lex bot challenge on 2026-10-03; [AI Act Service Desk, Article 113](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-113) retrieved 2026-10-03
- Every other instrument: see the Regulatory Currency Register table above (URL and retrieved date per row)
