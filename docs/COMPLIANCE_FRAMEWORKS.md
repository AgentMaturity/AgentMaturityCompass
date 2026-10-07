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

Each control category has one of four statuses (see [COMPLIANCE.md](COMPLIANCE.md#evidence-binding-and-not-evaluated) for the binding rules):

- **SATISFIED**: Every evidence requirement passed on control-bound AMC runtime evidence
- **PARTIAL**: A requirement failed while another passed
- **MISSING**: A requirement failed and none passed
- **NOT_EVALUATED**: Control-bound evidence is absent, untrusted or outside the window, or the maps are untrusted; this is not a pass

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

The register is agent-drafted and stays experimental until a named expert reviews it: `verified` means the facts were read from an official source, not that an expert approved them. It is not legal advice.

```bash
node scripts/check-regulatory-currency.mjs            # exit 1 if any entry is malformed, unsourced, cites a non-official host or is older than 90 days
node scripts/check-regulatory-currency.mjs --now 2027-01-15 --json   # --now is an alias of --as-of; unknown flags exit 1
```

`--json` lists every entry with `status`, `lastReviewed`, `windowDays`, `currency` and its sources (`url`, `retrievedAt`), plus `allowedHosts`. Source hosts must be on `policy.officialHosts` in the register (regulators, legislatures, official journals, standards bodies), exported as `OFFICIAL_SOURCE_HOSTS` from `src/compliance/regulatory/index.ts`. aiverifyfoundation.sg was proposed and rejected (a foundation, not a regulator), so the Singapore entry covers only the Agentic AI framework read on mddi.gov.sg.

Each `keyDate` also carries the `url` and `retrievedAt` it was read from, or sought on when it is unverified. When the date was carried from a dated program receipt (`research/<station>/digest.json`, read 2026-10-03), its `basis` names that receipt. Register bases cite program receipts as `program-records/2026-10-03/<path>`: a name for the 2026-10-03 program records, which are held outside the repository, not a path in it. `observation: true` marks a retrieval observation (for example "page returns 404"), not a legal date. `status: "superseded"` also covers revoked and withdrawn instruments, and `taskStatus` says which. `supersedes`/`supersededBy` hold register entry ids; predecessors without an entry are named in `supersedesInstruments`. `tests/regulatoryCurrencyRegister.test.ts` enforces the per-date provenance, the id links, the industry-pack ids and the root ruling that China, Brazil, India and Japan entries are unverified and assert no verified obligation (some of their key dates are still marked as read from an official source).

Register as applied on 2026-10-04 from the round-2 EU/international and US batches (`lastReviewed` 2026-10-03 on every entry): 176 entries, 108 verified, 68 unverified, 20 jurisdictions. Counts are from `node scripts/check-regulatory-currency.mjs` on 2026-10-04.

| Jurisdiction | Entries | Verified |
|---|---|---|
| EU | 61 | 45 |
| US | 59 | 52 |
| International (ISO) | 22 | 0 |
| US-CA | 9 | 4 |
| US-CO | 3 | 3 |
| CN | 3 | 0 |
| JP | 2 | 0 |
| International (Council of Europe) | 2 | 0 |
| International (OECD) | 2 | 1 |
| US-TX | 2 | 2 |
| US-IL | 2 | 0 |
| BR | 1 | 0 |
| IN | 1 | 0 |
| UK | 1 | 0 |
| KR | 1 | 0 |
| SG | 1 | 0 |
| US-NY | 1 | 0 |
| US-OH | 1 | 0 |
| US-UT | 1 | 0 |
| US-NYC | 1 | 1 |

| Instrument | Jurisdiction | Status | Key dates | Primary source | Retrieved | Verified |
|---|---|---|---|---|---|---|
| Artificial Intelligence Act — Regulation (EU) 2024/1689 (CELEX 32024R1689), as amended by Regulation (EU) 2026/1744 (CELEX 32026R1744) | EU | partially-applicable | 2024-08-01, 2025-02-02, 2025-08-02, 2026-07-27, 2026-08-02, 2026-12-02, 2027-08-02, 2027-12-02, 2028-08-02, 2030-08-02, 2030-12-31 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024R1689) | 2026-10-04 | yes |
| General Data Protection Regulation — Regulation (EU) 2016/679 (CELEX 32016R0679) | EU | in-force | 2016-05-24, 2018-05-25, 2024-12-18, 2025-02-27, 2025-11-19 | [European Commission](https://commission.europa.eu/law/law-topic/data-protection/legal-framework-eu-data-protection_en) | 2026-10-03 | yes |
| Digital Operational Resilience Act — Regulation (EU) 2022/2554 (CELEX 32022R2554) with RTS/ITS incl. Delegated Regulations (EU) 2024/1772, 2025/301, 2025/532, 2025/1190 | EU | in-force | 2023-01-16, 2025-01-17 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32022R2554) | 2026-10-04 | yes |
| NIS2 Directive — Directive (EU) 2022/2555 (CELEX 32022L2555) with Implementing Regulation (EU) 2024/2690 (CELEX 32024R2690) | EU | in-force | 2023-01-16, 2024-10-17, 2024-10-18, 2024-11-07, 2026-01-20, 2026-07-08 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32022L2555) | 2026-10-04 | yes |
| Cyber Resilience Act — Regulation (EU) 2024/2847 (CELEX 32024R2847) | EU | partially-applicable | 2024-12-10, 2026-06-11, 2026-09-11, 2027-12-11 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024R2847) | 2026-10-04 | yes |
| Medical Devices Regulation and In Vitro Diagnostic Medical Devices Regulation — Regulation (EU) 2017/745 (CELEX 32017R0745); Regulation (EU) 2017/746 (CELEX 32017R0746); as amended by Regulations (EU) 2023/607 and 2024/1860 | EU | in-force | 2021-05-26, 2022-05-26, 2023-03-20, 2025-01-10, 2026-05-27, 2027-12-31, 2027-12-31, 2028-12-31, 2028-12-31, 2029-12-31 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32017R0746) | 2026-10-04 | no |
| NIST AI Risk Management Framework 1.0 — NIST AI 100-1 | US | in-force | 2023-01-26, 2026-04-07 | [NIST](https://www.nist.gov/itl/ai-risk-management-framework) | 2026-10-03 | yes |
| Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile — NIST AI 600-1 | US | in-force | 2024-07-26 | [NIST](https://www.nist.gov/itl/ai-risk-management-framework) | 2026-10-03 | yes |
| Information technology — Artificial intelligence — Management system — ISO/IEC 42001:2023 | International (ISO) | published | 2023-12-18 (unverified) | [ISO](https://www.iso.org/standard/42001) | 2026-10-04 | no |
| Artificial intelligence — AI system impact assessment — ISO/IEC 42005:2025 | International (ISO) | published | 2025-05-28 (unverified) | [ISO](https://www.iso.org/standard/42005) | 2026-10-04 | no |
| Consumer Protections for Artificial Intelligence — Colorado SB24-205 | US-CO | superseded | 2024-05-17, 2026-02-01, 2026-06-30 | [Colorado General Assembly](https://leg.colorado.gov/bills/sb24-205) | 2026-10-03 | yes |
| Automated Decision-Making Technology — Colorado SB26-189 (repeals and reenacts Part 17 of Article 1 of Title 6, C.R.S.) | US-CO | enacted-not-yet-applicable | 2026-05-14, 2027-01-01 | [Colorado General Assembly](https://leg.colorado.gov/bills/sb26-189) | 2026-10-03 | yes |
| 中华人民共和国个人信息保护法 (Personal Information Protection Law) — Order of the President No. 91 (2021) | CN | in-force | 2021-08-20, 2021-11-01 | [Cyberspace Administration of China](https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm) | 2026-10-03 | no |
| 生成式人工智能服务管理暂行办法 (Interim Measures for the Management of Generative AI Services) — CAC et al. Order No. 15 (2023) | CN | in-force | 2023-07-10, 2023-08-15 | [Cyberspace Administration of China](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm) | 2026-10-03 | no |
| Lei Geral de Proteção de Dados Pessoais — Lei nº 13.709, de 14 de agosto de 2018 | BR | in-force | 2018-12-28, 2021-08-01, 2020-09-18 (unverified) | [Presidência da República (Planalto)](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) | 2026-10-03 | no |
| Digital Personal Data Protection Act, 2023 and DPDP Rules, 2025 — Act No. 22 of 2023 | IN | partially-applicable | 2025-11-14 | [Press Information Bureau, Government of India](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014&reg=3&lang=2) | 2026-10-03 | no |
| Act on the Protection of Personal Information — Act No. 57 of 2003 (translation as amended by Act No. 37 of 2021) | JP | in-force | 2023-04-01 | [Personal Information Protection Commission, Japan](https://www.ppc.go.jp/en/legal/) | 2026-10-03 | no |
| Digital Omnibus on AI — Regulation (EU) 2026/1744 (CELEX 32026R1744), amending Regulations (EU) 2024/1689, 2018/1139 and 2023/1230 | EU | in-force | 2026-07-08, 2026-07-24, 2026-07-27 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32026R1744) | 2026-10-04 | yes |
| Commission Guidelines on prohibited AI practices and on the AI system definition — Commission Guidelines under Regulation (EU) 2024/1689 Arts. 5 and 3(1) (non-binding) | EU | published | 2025-02-04, 2025-02-06 | [European Commission](https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-prohibited-artificial-intelligence-ai-practices-defined-ai-act) | 2026-10-03 | no |
| General-Purpose AI Code of Practice and Commission guidelines on GPAI scope — Code of Practice under Regulation (EU) 2024/1689 Art. 56 (voluntary; adequacy confirmed by Commission and AI Board) | EU | published | 2025-07-10, 2025-08-02, 2026-08-02, 2027-08-02 | [European Commission](https://digital-strategy.ec.europa.eu/en/policies/contents-code-gpai) | 2026-10-03 | yes |
| Commission Art. 50 transparency guidelines and Code of Practice on transparency of AI-generated content — Commission Guidelines and Code of Practice under Regulation (EU) 2024/1689 Art. 50 (non-binding) | EU | published | 2026-06-10, 2026-07-09, 2026-07-20, 2026-08-02, 2026-12-02 | [European Commission](https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content) | 2026-10-03 | no |
| MDCG 2025-6 / AIB 2025-1 FAQ on the interplay between MDR/IVDR and the AI Act — MDCG 2025-6 / AIB 2025-1 (June 2025), non-binding guidance | EU | published | 2025-06-19 | [European Commission](https://health.ec.europa.eu/latest-updates/mdcg-2025-6-faq-interplay-between-medical-devices-regulation-vitro-diagnostic-medical-devices-2025-06-19_en) | 2026-10-03 | no |
| Data Act — Regulation (EU) 2023/2854 (CELEX 32023R2854) | EU | partially-applicable | 2024-01-11, 2025-09-12, 2026-09-12, 2027-01-12, 2027-09-12 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32023R2854) | 2026-10-04 | yes |
| European Health Data Space Regulation — Regulation (EU) 2025/327 (CELEX 32025R0327) | EU | enacted-not-yet-applicable | 2025-03-05, 2025-03-25, 2027-03-26, 2029-03-26, 2031-03-26, 2035-03 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32025R0327) | 2026-10-04 | yes |
| EudraLex Vol. 4 GMP Annex 11 (Computerised Systems) and draft Annex 22 (Artificial Intelligence) — EudraLex Volume 4, Annex 11 (2011, in force); draft revised Annex 11 and new Annex 22 (consultation 2025) | EU | in-force | 2025-07-07, 2025-10-07 | [European Commission](https://health.ec.europa.eu/consultations/stakeholders-consultation-eudralex-volume-4-good-manufacturing-practice-guidelines-chapter-4-annex_en) | 2026-10-03 | no |
| Copyright in the Digital Single Market Directive — Directive (EU) 2019/790 (CELEX 32019L0790) | EU | in-force | 2019-06-06, 2021-06-07 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32019L0790) | 2026-10-04 | yes |
| Council Recommendations on the European Qualifications Framework and on individual learning accounts — Council Recommendation 2017/C 189/03 (CELEX 32017H0615(01)); Council Recommendation 2022/C 243/03 (CELEX 32022H0627(03)) | EU | in-force | 2017-05-22, 2022-06-16 (unverified) | [Publications Office of the EU (EUR-Lex)](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32017H0615(01)) | 2026-10-03 | no |
| EU Deforestation Regulation — Regulation (EU) 2023/1115 (CELEX 32023R1115) as amended by Regulations (EU) 2024/3234 and 2025/2650 | EU | enacted-not-yet-applicable | 2023-06-29, 2025-12-26, 2026-12-30, 2027-06-30 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32023R1115) | 2026-10-04 | yes |
| Corporate Sustainability Reporting Directive (with ESRS) as amended by Omnibus I — Directive (EU) 2022/2464 (CELEX 32022L2464); Stop-the-clock Directive (EU) 2025/794; Omnibus I Directive (EU) 2026/470 (CELEX 32026L0470) | EU | in-force | 2025-04-17, 2026-02-26, 2026-03-18, 2026-07-03 (unverified), 2027-01-01 (unverified) | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32025L0794) | 2026-10-04 | no |
| Corporate Sustainability Due Diligence Directive as amended by Omnibus I — Directive (EU) 2024/1760 (CELEX 32024L1760) as amended by Directive (EU) 2026/470 | EU | enacted-not-yet-applicable | 2024-07-25, 2028-07-26, 2029-07-26 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024L1760) | 2026-10-04 | yes |
| Ecodesign for Sustainable Products Regulation — Regulation (EU) 2024/1781 (CELEX 32024R1781) with Delegated Regulation (EU) 2026/296 | EU | partially-applicable | 2024-07-18, 2026-07-19, 2027-02 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024R1781) | 2026-10-04 | yes |
| Waste Framework Directive as amended by Directive (EU) 2025/1892 — Directive 2008/98/EC as amended by Directive (EU) 2025/1892 (CELEX 32025L1892) | EU | in-force | 2025-10-16, 2027-06-17, 2028-04-17, 2030-12-31 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32025L1892) | 2026-10-04 | yes |
| Empowering Consumers for the Green Transition Directive; Green Claims Directive proposal — Directive (EU) 2024/825 (CELEX 32024L0825); proposal COM(2023) 166 (CELEX 52023PC0166) | EU | in-force | 2024-03-26, 2026-03-27, 2026-09-27, 2025-06-20 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024L0825) | 2026-10-04 | no |
| Packaging and Packaging Waste Regulation — Regulation (EU) 2025/40 (CELEX 32025R0040) | EU | partially-applicable | 2025-02-11, 2026-08-12 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32025R0040) | 2026-10-04 | yes |
| Machinery Regulation — Regulation (EU) 2023/1230 (CELEX 32023R1230) as amended by Regulation (EU) 2026/1744 | EU | enacted-not-yet-applicable | 2023-07-19, 2027-01-20 (unverified), 2028-08-02 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32023R1230) | 2026-10-04 | no |
| Urban Wastewater Treatment Directive (recast) — Directive (EU) 2024/3019 (CELEX 32024L3019) | EU | in-force | 2025-01-01, 2027-07-31, 2027-08-01 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024L3019) | 2026-10-04 | yes |
| Critical Entities Resilience Directive — Directive (EU) 2022/2557 (CELEX 32022L2557) | EU | in-force | 2023-01-16, 2026-07-17 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32022L2557) | 2026-10-04 | yes |
| Network Code on Cybersecurity for cross-border electricity flows — Delegated Regulation (EU) 2024/1366 (CELEX 32024R1366) | EU | in-force | 2024-06-13, 2024-12-13, 2025-06-13, 2027-12-31 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024R1366) | 2026-10-04 | yes |
| IUU Fishing Regulation and Fisheries Control amendment (CATCH IT system) — Regulation (EC) No 1005/2008 (CELEX 32008R1005) as amended by Regulation (EU) 2023/2842 (CELEX 32023R2842) | EU | in-force | 2024-01-09, 2026-01-10, 2028-01-10 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32023R2842) | 2026-10-04 | no |
| Energy Efficiency Directive (data-centre reporting) — Directive (EU) 2023/1791 (CELEX 32023L1791) with Delegated Regulation (EU) 2024/1364 (CELEX 32024R1364) | EU | in-force | 2023-10-10, 2024-05-15 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32023L1791) | 2026-10-04 | yes |
| Methane Emissions Regulation — Regulation (EU) 2024/1787 (CELEX 32024R1787) | EU | in-force | 2024-08-04, 2026-02-05, 2027-01-01 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024R1787) | 2026-10-04 | yes |
| EU Taxonomy Regulation with simplification Delegated Regulation (EU) 2026/73 — Regulation (EU) 2020/852 (CELEX 32020R0852); Delegated Regulation (EU) 2026/73 (CELEX 32026R0073) | EU | in-force | 2020-07-12, 2026-01-28, 2026-01-01 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32020R0852) | 2026-10-04 | yes |
| General Safety Regulation (vehicles) and ADS implementing regulation — Regulation (EU) 2019/2144 (CELEX 32019R2144); Implementing Regulation (EU) 2022/1426 (CELEX 32022R1426) | EU | in-force | 2022-07-06, 2022-09-15, 2026-07-07 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32019R2144) | 2026-10-04 | yes |
| Maritime MRV Regulation and FuelEU Maritime — Regulation (EU) 2015/757 (CELEX 32015R0757) as amended by Regulation (EU) 2023/957; Regulation (EU) 2023/1805 (CELEX 32023R1805) | EU | in-force | 2023-06-05, 2024-08-31, 2025-01-01 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32023R0957) | 2026-10-04 | yes |
| Electronic Freight Transport Information Regulation — Regulation (EU) 2020/1056 (CELEX 32020R1056) | EU | partially-applicable | 2024-08-21, 2025-01-09, 2026-12, 2027-07-09 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32020R1056) | 2026-10-04 | yes |
| Product Liability Directive (software and AI as products) — Directive (EU) 2024/2853 (CELEX 32024L2853) | EU | enacted-not-yet-applicable | 2024-12-08, 2026-12-09 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024L2853) | 2026-10-04 | yes |
| Energy Performance of Buildings Directive (recast) — Directive (EU) 2024/1275 (CELEX 32024L1275) | EU | in-force | 2024-05-28, 2026-05-29, 2026-05-30, 2028-01-01, 2029-12-31, 2030-01-01 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024L1275) | 2026-10-04 | yes |
| Construction Products Regulation — Regulation (EU) 2024/3110 (CELEX 32024R3110) | EU | partially-applicable | 2025-01-07, 2026-01-08, 2027-01-08 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024R3110) | 2026-10-04 | yes |
| European Digital Identity Framework (eIDAS 2) — Regulation (EU) 2024/1183 (CELEX 32024R1183) amending Regulation (EU) No 910/2014; Implementing Regulation (EU) 2026/1731 | EU | in-force | 2024-05-20, 2024-12-24, 2026-08-11, 2026-12-24, 2027-12-24 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024R1183) | 2026-10-04 | no |
| Digital Services Act — Regulation (EU) 2022/2065 (CELEX 32022R2065) | EU | in-force | 2022-11-16, 2024-02-17, 2025-07-01, 2025-12-05 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32022R2065) | 2026-10-04 | yes |
| Digital Markets Act — Regulation (EU) 2022/1925 (CELEX 32022R1925) | EU | in-force | 2022-11-01, 2023-05-02, 2025-04-23, 2026-07-23 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32022R1925) | 2026-10-04 | yes |
| European Media Freedom Act — Regulation (EU) 2024/1083 (CELEX 32024R1083) | EU | partially-applicable | 2025-08-08, 2027-05-08 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024R1083) | 2026-10-04 | yes |
| Regulation on transparency and targeting of political advertising — Regulation (EU) 2024/900 (CELEX 32024R0900) | EU | in-force | 2024-04-09, 2025-10-10 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024R0900) | 2026-10-04 | yes |
| Interoperable Europe Act — Regulation (EU) 2024/903 (CELEX 32024R0903) | EU | in-force | 2024-07-12, 2025-01-12 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024R0903) | 2026-10-04 | yes |
| Open Data Directive and High-Value Datasets Implementing Regulation — Directive (EU) 2019/1024 (CELEX 32019L1024); Implementing Regulation (EU) 2023/138 (CELEX 32023R0138) | EU | in-force | 2021-07-17, 2024-06-09 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32019L1024) | 2026-10-04 | yes |
| Single Digital Gateway Regulation — Regulation (EU) 2018/1724 (CELEX 32018R1724) | EU | in-force | 2020-12-12, 2023-12-12 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32018R1724) | 2026-10-04 | yes |
| AI Liability Directive proposal (withdrawn) — Proposal COM(2022) 496 (CELEX 52022PC0496); withdrawal OJ C/2025/5423 (CELEX 52025XC05423) | EU | superseded (withdrawn) | 2025-10-06 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/52022PC0496) | 2026-10-04 | yes |
| European Democracy Shield (Commission communication) — Commission communication of 12 November 2025 (policy package; no binding act verified) | EU | published | 2025-11-12 | [European Commission](https://commission.europa.eu/news-and-media/news/stronger-measures-protect-our-democracy-and-civil-society-2025-11-12_en) | 2026-10-03 | no |
| European Accessibility Act — Directive (EU) 2019/882 (CELEX 32019L0882) | EU | in-force | 2022-06-28, 2025-06-28, 2027-06-28 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32019L0882) | 2026-10-04 | yes |
| Trade Secrets Directive — Directive (EU) 2016/943 (CELEX 32016L0943) | EU | in-force | 2016-07-05, 2018-06-09 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32016L0943) | 2026-10-04 | yes |
| Platform Work Directive — Directive (EU) 2024/2831 (CELEX 32024L2831) | EU | enacted-not-yet-applicable | 2024-12-01, 2026-12-02 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024L2831) | 2026-10-04 | yes |
| Pay Transparency Directive — Directive (EU) 2023/970 (CELEX 32023L0970) | EU | in-force | 2023-06-06, 2026-06-07, 2027-06-07 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32023L0970) | 2026-10-04 | yes |
| Payment Services Directive 2 and RTS on strong customer authentication — Directive (EU) 2015/2366 (CELEX 32015L2366); Delegated Regulation (EU) 2018/389 (CELEX 32018R0389) | EU | in-force | 2018-01-13, 2019-09-14 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32015L2366) | 2026-10-04 | yes |
| Payment Services Regulation and Payment Services Directive 3 (proposals) — Proposals COM(2023) 367 (PSR) and COM(2023) 366 (PSD3); procedure 2023/0209(COD) | EU | proposed | 2025-11-27, 2026-05-05, 2026-12-14 | [European Parliament](https://www.europarl.europa.eu/legislative-train/theme-economic-and-monetary-affairs-econ/file-revision-of-eu-rules-on-payment-services?sid=10001) | 2026-10-03 | no |
| Instant Payments Regulation (verification of payee) — Regulation (EU) 2024/886 (CELEX 32024R0886) amending Regulation (EU) No 260/2012 | EU | in-force | 2024-04-08, 2025-01-09, 2025-10-09, 2027-07-09 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024R0886) | 2026-10-04 | yes |
| Transfer of Funds Regulation (recast) — Regulation (EU) 2023/1113 (CELEX 32023R1113) | EU | in-force | 2024-12-30 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32023R1113) | 2026-10-04 | no |
| Markets in Crypto-Assets Regulation — Regulation (EU) 2023/1114 (CELEX 32023R1114) | EU | in-force | 2024-06-30, 2024-12-30, 2026-07-01, 2027-12-31 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32023R1114) | 2026-10-04 | yes |
| EU AML package: Anti-Money Laundering Regulation and Sixth AML Directive — Regulation (EU) 2024/1624 (CELEX 32024R1624); Directive (EU) 2024/1640 (CELEX 32024L1640) | EU | enacted-not-yet-applicable | 2024-07-09, 2027-07-10, 2029-07-10 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32024R1624) | 2026-10-04 | yes |
| ESMA Public Statement on the use of AI in the provision of retail investment services — ESMA35-335435667-5924 (30 May 2024), supervisory statement under MiFID II | EU | published | 2024-05-30 | [ESMA](https://www.esma.europa.eu/press-news/esma-news/esma-provides-guidance-firms-using-artificial-intelligence-investment-services) | 2026-10-03 | no |
| MiFID II, RTS 6 on algorithmic trading, MAR and PRIIPs — Directive 2014/65/EU (CELEX 32014L0065) as amended by Directive (EU) 2016/1034; Delegated Regulation (EU) 2017/589 (CELEX 32017R0589); Regulation (EU) No 596/2014 (CELEX 32014R0596); Regulation (EU) No 1286/2014 | EU | in-force | 2018-01-03, 2018-01-03, 2016-07-03 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32016L1034) | 2026-10-04 | yes |
| Consumer Credit Directive (recast) — Directive (EU) 2023/2225 (CELEX 32023L2225) | EU | enacted-not-yet-applicable | 2023-11-19, 2025-11-20, 2026-11-20 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32023L2225) | 2026-10-04 | yes |
| ETSI EN 303 645 Cyber Security for Consumer IoT (European standard) — ETSI EN 303 645 V3.1.3 (2024-09) | EU | published | 2024-09 (unverified) | [ETSI](https://www.etsi.org/deliver/etsi_en/303600_303699/303645/03.01.03_60/en_303645v030103p.pdf) | 2026-10-03 | no |
| Framework Convention on Artificial Intelligence and Human Rights, Democracy and the Rule of Law — CETS No. 225; EU conclusion by Council Decision (EU) 2026/1080 (CELEX 32026D1080); text in OJ L 2026/1081 (CELEX 22026A01081) | International (Council of Europe) | published | 2024-09-05, 2026-04-21, 2026-05-13 | [Publications Office of the EU](https://publications.europa.eu/resource/celex/32026D1080) | 2026-10-04 | no |
| Committee of Ministers Recommendation CM/Rec(2017)5 — CM/Rec(2017)5 | International (Council of Europe) | published | 2017 (unverified) | [Council of Europe](https://www.coe.int/en/web/cm) | 2026-10-04 | no |
| OECD Recommendation of the Council on Artificial Intelligence — OECD/LEGAL/0449 (adopted 2019, amended May 2024) | International (OECD) | published | 2019, 2024-05 | [OECD](https://oecd.ai/en/ai-principles) | 2026-10-04 | yes |
| OECD Recommendation on Principles for Public Governance of Public-Private Partnerships — OECD/LEGAL/0392 (4 May 2012) | International (OECD) | published | 2012-05-04 | [OECD](https://legalinstruments.oecd.org/api/print?ids=275&lang=en) | 2026-10-03 | no |
| Data (Use and Access) Act 2025 — Data (Use and Access) Act 2025 c. 18 | UK | partially-applicable | 2025-06-19, 2026-02-05, 2026-06-19, 2026 (unverified) | [UK Government](https://www.gov.uk/guidance/data-use-and-access-act-2025-plans-for-commencement) | 2026-10-03 | no |
| Act on Promotion of Research, Development and Utilisation of AI-Related Technologies (AI Act) — 人工知能関連技術の研究開発及び活用の推進に関する法律 (令和7年, law number not read) | JP | in-force | 2025-06-04, 2025-09-01, 2026-07-14 (unverified) | [Cabinet Office, Japan](https://www8.cao.go.jp/cstp/ai/ai_act/ai_act.html) | 2026-10-04 | no |
| Framework Act on the Development of Artificial Intelligence and Establishment of a Foundation for Trust (AI Basic Act) — 법률 제20676호 (2025-01-21), as amended by 법률 제21311호 | KR | in-force | 2025-01-21, 2026-01-20, 2026-01-22, 2026-07-21 | [Ministry of Government Legislation (Korea)](https://www.law.go.kr/lsInfoP.do?lsiSeq=268543) | 2026-10-04 | no |
| Model AI Governance Framework for Agentic AI — MDDI / IMDA, MGF for Agentic AI (22 January 2026) | SG | published | 2026-01-22 | [MDDI Singapore](https://www.mddi.gov.sg/newsroom/singapore-launches-new-model-ai-governance-framework-for-agentic-ai--/) | 2026-10-04 | no |
| 人工智能生成合成内容标识办法 (Measures for Labeling AI-Generated Synthetic Content) — CAC, MIIT, MPS, NRTA notice of 2025-03-07 | CN | in-force | 2025-03-07, 2025-03-14, 2025-09-01, 2025 (unverified) | [Cyberspace Administration of China](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm) | 2026-10-03 | no |
| Requirements for bodies providing audit and certification of AI management systems — ISO/IEC 42006:2025 | International (ISO) | published | 2025-07-07 (unverified) | [ISO](https://www.iso.org/standard/42006) | 2026-10-04 | no |
| Information technology — Artificial intelligence — Guidance on risk management — ISO/IEC 23894:2023 | International (ISO) | published | 2023-02-06 (unverified) | [ISO](https://www.iso.org/standard/77304.html) | 2026-10-04 | no |
| Health informatics — Information security controls in health based on ISO/IEC 27002 — ISO 27799:2025 | International (ISO) | published | 2025 (unverified) | [ISO](https://www.iso.org/standard/84647.html) | 2026-10-03 | no |
| Information technology — W3C Web Content Accessibility Guidelines (WCAG) 2.2 — ISO/IEC 40500:2025 | International (ISO) | published | 2025 (unverified) | [ISO](https://www.iso.org/standard/91029.html) | 2026-10-03 | no |
| Learning services for non-formal education and training — ISO 29990:2010 | International (ISO) | superseded | 2025-07 (unverified) | [ISO](https://www.iso.org/standard/21001) | 2026-10-03 | no |
| Environmental management systems — Requirements with guidance for use — ISO 14001:2026 | International (ISO) | published | 2026-04-15 (unverified) | [ISO](https://www.iso.org/news/2026/04/iso-14001-2026-published) | 2026-10-03 | no |
| Quality management systems — Requirements — ISO 9001:2026 | International (ISO) | published | 2026-09-16 (unverified) | [ISO](https://www.iso.org/news/2026/04/iso-14001-2026-published) | 2026-10-03 | no |
| Security and resilience — Security management systems — ISO 28000:2022/Amd 1:2024 | International (ISO) | published | 2024-02 (unverified) | [ISO](https://www.iso.org/standard/88413.html) | 2026-10-03 | no |
| Sustainable cities and communities — Indicators for city services and quality of life — ISO 37120 (Ed. 3 at AWI) | International (ISO) | published | 2025-11 (unverified) | [ISO](https://www.iso.org/standard/37120) | 2026-10-04 | no |
| Road vehicles — Functional safety — ISO 26262:2018 | International (ISO) | published | 2026 (unverified) | [ISO](https://www.iso.org/standard/90022.html) | 2026-10-03 | no |
| Road vehicles — Safety of the intended functionality (SOTIF) — ISO 21448:2022 | International (ISO) | published | 2022 (unverified) | [ISO](https://www.iso.org/standard/21448) | 2026-10-04 | no |
| Road vehicles — Safety and artificial intelligence — ISO/PAS 8800:2024 | International (ISO) | published | 2024-12 (unverified) | [ISO](https://www.iso.org/standard/83303.html) | 2026-10-03 | no |
| Road vehicles — Safety for automated driving systems — ISO/TS 5083:2025 | International (ISO) | published | 2025-04 (unverified) | [ISO](https://www.iso.org/standard/81920.html) | 2026-10-03 | no |
| Industrial trucks — Safety requirements — Part 4: Driverless industrial trucks — ISO 3691-4:2023 | International (ISO) | published | 2023 (unverified) | [ISO](https://www.iso.org/standard/83545.html) | 2026-10-03 | no |
| Privacy information management systems — Requirements and guidance — ISO/IEC 27701:2025 | International (ISO) | published | 2025 (unverified) | [ISO](https://www.iso.org/standard/27701) | 2026-10-03 | no |
| Entity authentication assurance framework — ISO/IEC 29115:2013 | International (ISO) | published | 2013 (unverified) | [ISO](https://www.iso.org/standard/29115) | 2026-10-04 | no |
| Guidance on social responsibility — ISO 26000:2010 | International (ISO) | published | 2010 (unverified) | [ISO](https://www.iso.org/standard/26000) | 2026-10-04 | no |
| Software engineering — SQuaRE — Data quality model — ISO/IEC 25012 | International (ISO) | published | 2026-10-03 (unverified) | [ISO](https://www.iso.org/standard/35736.html) | 2026-10-04 | no |
| Security and resilience — Business continuity management systems — ISO 22301:2019 | International (ISO) | published | 2024 (unverified), 2026-10-03 (unverified) | [ISO](https://www.iso.org/standard/75106.html) | 2026-10-03 | no |
| Information technology — SPDX Specification V2.2.1 — ISO/IEC 5962:2021 | International (ISO) | published | 2021 (unverified) | [ISO](https://www.iso.org/standard/81870.html) | 2026-10-04 | no |
| Safe, Secure, and Trustworthy Development and Use of Artificial Intelligence — Executive Order 14110 (88 FR 75191), revoked by Executive Order 14148 (90 FR 8237) | US | superseded (withdrawn) | 2023-10-30, 2025-01-20 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/api/v1/documents/2025-01901.json) | 2026-10-04 | yes |
| Removing Barriers to American Leadership in Artificial Intelligence — Executive Order 14179 (90 FR 8741, FR Doc 2025-02172) | US | in-force | 2025-01-23 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/full_text/text/2025/01/31/2025-02172.txt) | 2026-10-04 | yes |
| Preventing Woke AI in the Federal Government — Executive Order 14319 (90 FR 35389, FR Doc 2025-14217) | US | in-force | 2025-07-23, 2025-11-20 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/full_text/text/2025/07/28/2025-14217.txt) | 2026-10-04 | yes |
| Ensuring a National Policy Framework for Artificial Intelligence — Executive Order 14365 (90 FR 58499, FR Doc 2025-23092) | US | in-force | 2025-12-11, 2026-01-10, 2026-03-11 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/full_text/text/2025/12/16/2025-23092.txt) | 2026-10-04 | no |
| Promoting Advanced Artificial Intelligence Innovation and Security — Executive Order 14409 (91 FR 34565, FR Doc 2026-11415) | US | in-force | 2026-06-02, 2026-07-02, 2026-08-01 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/full_text/text/2026/06/05/2026-11415.txt) | 2026-10-04 | yes |
| Inaugurating the Era of Super Intelligence — Executive Order 14434 (91 FR 63129, FR Doc 2026-20321) | US | in-force | 2026-09-29, 2026-11-28 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/full_text/text/2026/10/02/2026-20321.txt) | 2026-10-04 | yes |
| Accelerating Federal Use of AI through Innovation, Governance, and Public Trust — OMB Memorandum M-25-21 (rescinds M-24-10) | US | in-force | 2025-04-03, 2025-06-02, 2025-09-30, 2026-04-03 | [Executive Office of the President (OMB)](https://www.whitehouse.gov/omb/information-resources/guidance/memoranda/) | 2026-10-04 | yes |
| Driving Efficient Acquisition of Artificial Intelligence in Government — OMB Memorandum M-25-22 (rescinds M-24-18) | US | in-force | 2025-04-03, 2025-09-30, 2025-12-29 | [Executive Office of the President (OMB)](https://www.whitehouse.gov/omb/information-resources/guidance/memoranda/) | 2026-10-04 | yes |
| Increasing Public Trust in Artificial Intelligence Through Unbiased AI Principles — OMB Memorandum M-26-04 (implements EO 14319) | US | in-force | 2025-12-11, 2026-03-11 | [Executive Office of the President (OMB)](https://www.whitehouse.gov/omb/information-resources/guidance/memoranda/) | 2026-10-04 | yes |
| Policy Statement Concerning the Suppression of Accuracy in Artificial Intelligence Systems — FTC proposed policy statement, 91 FR 41638 (FR Doc 2026-13628, Matter P264200) | US | proposed | 2026-07-07, 2026-07-31 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/full_text/text/2026/07/07/2026-13628.txt) | 2026-10-04 | yes |
| TCPA applied to AI-generated voices (Declaratory Ruling) and proposed AI-call disclosure rules — FCC 24-17 (CG Docket 23-362); NPRM FCC 24-84 | US | in-force | 2024-02-08, 2024-08-08, 2026-09-09 | [Federal Communications Commission](https://docs.fcc.gov/public/attachments/FCC-24-17A1.pdf) | 2026-10-03 | yes |
| FEC interpretive rule on fraudulent misrepresentation and AI campaign-ads petition disposition — 52 U.S.C. 30124; 89 FR 78785; 89 FR 78826 | US | in-force | 2024-09-26 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/api/v1/documents/2024-21983.json) | 2026-10-03 | yes |
| Security and Privacy Controls (Release 5.2.0) and Control Overlays for Securing AI Systems — NIST SP 800-53 Rev. 5 (Release 5.2.0); COSAiS (no overlay published) | US | published | 2025-08-14, 2025-08-27, 2026-01-08, 2026-02-13 | [NIST](https://csrc.nist.gov/projects/cosais) | 2026-10-03 | yes |
| Cybersecurity Framework Profile for Artificial Intelligence (Cyber AI Profile) — NIST IR 8596 (initial preliminary draft) | US | proposed | 2025-12-16, 2026-01-30 | [NIST](https://csrc.nist.gov/pubs/ir/8596/iprd) | 2026-10-03 | yes |
| Cybersecurity Framework 2.0 — NIST CSWP 29 | US | published | 2024-02-26 | [NIST](https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf) | 2026-10-03 | yes |
| Digital Identity Guidelines — NIST SP 800-63-4 (incl. SP 800-63B-4) | US | published | 2025-07-01, 2025-07-31 | [NIST](https://csrc.nist.gov/pubs/sp/800/63/b/4/final) | 2026-10-03 | yes |
| Secure Software Development Practices for Generative AI and Dual-Use Foundation Models (SSDF Community Profile) — NIST SP 800-218A; SP 800-218r1 ipd (SSDF 1.2) | US | published | 2024-07-26, 2025-12-17 | [NIST](https://csrc.nist.gov/pubs/sp/800/218/a/final) | 2026-10-03 | yes |
| 2026 Minimum Elements for a Software Bill of Materials — CISA et al., SBOM Minimum Elements v2.1 (2026) | US | published | 2025-08-22, 2026-07-29 | [CISA](https://www.cisa.gov/sites/default/files/2026-07/2026_cisa_sbom_minimum_elements_508c.pdf) | 2026-10-03 | yes |
| Cyber Incident Reporting for Critical Infrastructure Act reporting requirements — CIRCIA reporting requirements NPRM (FR Doc 2024-06526), RIN 1670-AA04 | US | proposed | 2024-04-04, 2026-02-13 (unverified) | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/api/v1/documents.json?conditions[regulation_id_number]=1670-AA04) | 2026-10-04 | no |
| HIPAA Security Rule To Strengthen the Cybersecurity of Electronic Protected Health Information — NPRM 90 FR 898 (FR Doc 2024-30983), RIN 0945-AA22; proposed amendments to 45 CFR Part 164 | US | proposed | 2025-01-06, 2025-03-07, 2027-07 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/api/v1/documents.json?conditions[regulation_id_number]=0945-AA22) | 2026-10-04 | yes |
| Confidentiality of Substance Use Disorder (SUD) Patient Records — 42 CFR Part 2, final rule 89 FR 12472 | US | in-force | 2024-02-16, 2024-04-16, 2026-02-16 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2024/02/16/2024-02544/confidentiality-of-substance-use-disorder-sud-patient-records) | 2026-10-03 | yes |
| Information blocking (21st Century Cures Act s.4004) and provider disincentives — PHSA s.3022; 45 CFR Part 171; 89 FR 54662; HTI-5 NPRM (FR Doc 2025-23896, RIN 0955-AA09) | US | in-force | 2024-07-31, 2025-12-29, 2026-02-27, 2026-08 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/api/v1/documents.json?conditions[regulation_id_number]=0955-AA09) | 2026-10-04 | yes |
| HTI-1 Decision Support Interventions certification criterion — 45 CFR 170.315(b)(11), HTI-1 final rule 89 FR 1192 | US | in-force | 2024-01-09, 2024-02-08, 2024-12-31, 2025-12-29, 2025-12-29 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2024/01/09/2023-28857/health-data-technology-and-interoperability-certification-program-updates-algorithm-transparency-and) | 2026-10-03 | yes |
| Nondiscrimination in the use of patient care decision support tools — 45 CFR 92.210 (ACA s.1557 final rule 89 FR 37522) | US | in-force | 2024-05-06, 2024-07-05, 2025-05-01, 2025-10-22 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2024/05/06/2024-08711/nondiscrimination-in-health-programs-and-activities) | 2026-10-03 | yes |
| Clinical Decision Support Software (final guidance, January 2026) — FDA guidance, docket FDA-2017-D-6569; FD&C Act s.520(o)(1)(E) | US | published | 2026-01-06, 2026-01-29 | [US FDA](https://www.fda.gov/media/109618/download) | 2026-10-03 | yes |
| General Wellness: Policy for Low Risk Devices (January 2026) — FDA guidance (supersedes 2019-09-27 edition) | US | published | 2026-01-06 | [US FDA](https://www.fda.gov/media/90652/download) | 2026-10-03 | yes |
| Marketing Submission Recommendations for a Predetermined Change Control Plan for AI-Enabled Device Software Functions — FDA final guidance, docket FDA-2022-D-2628 (89 FR 96259) | US | published | 2024-12-04, 2025-08 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2024/12/04/2024-28361/marketing-submission-recommendations-for-a-predetermined-change-control-plan-for-artificial) | 2026-10-03 | yes |
| AI-Enabled Device Software Functions: Lifecycle Management and Marketing Submission Recommendations — FDA draft guidance, docket FDA-2024-D-4488 (90 FR 1154) | US | proposed | 2025-01-07, 2026-10-03 (observation) | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2025/01/07/2024-31543/artificial-intelligence-enabled-device-software-functions-lifecycle-management-and-marketing) | 2026-10-03 | yes |
| Cybersecurity in Medical Devices: Quality System Considerations and Content of Premarket Submissions — FDA final guidance (90 FR 27634); FD&C Act s.524B | US | published | 2025-06-27 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2025/06/27/2025-11669/cybersecurity-in-medical-devices-quality-system-considerations-and-content-of-premarket-submissions) | 2026-10-03 | yes |
| Quality Management System Regulation — 21 CFR Part 820 (89 FR 7496), incorporating ISO 13485:2016 | US | in-force | 2024-02-02, 2026-02-02, 2026-10-01 (observation) | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2024/02/02/2024-01709/medical-devices-quality-system-regulation-amendments) | 2026-10-03 | yes |
| Considerations for the Use of AI To Support Regulatory Decision-Making for Drug and Biological Products — FDA draft guidance, docket FDA-2024-D-4689 (90 FR 1157) | US | proposed | 2025-01-07 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2025/01/07/2024-31542/considerations-for-the-use-of-artificial-intelligence-to-support-regulatory-decision-making-for-drug) | 2026-10-03 | yes |
| Digital Health Technologies for Remote Data Acquisition in Clinical Investigations — FDA final guidance, docket FDA-2021-D-1128 | US | published | 2023-12 | [US FDA](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/digital-health-technologies-remote-data-acquisition-clinical-investigations) | 2026-10-03 | yes |
| Interoperability and Prior Authorization final rule — CMS-0057-F, 89 FR 8758 | US | in-force | 2024-04-08, 2026-01-01, 2026-04-14, 2027-01-01 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/api/v1/documents/2026-07205.json) | 2026-10-04 | yes |
| California AB 3030: generative AI in patient clinical communications — California AB 3030 (Ch. 848, Stats. 2024); H&S Code §1339.75 | US-CA | in-force | 2024-09-28 | [California Legislature](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240AB3030) | 2026-10-04 | no |
| California SB 1120: AI in health-plan utilization review — California SB 1120 (Ch. 879, Stats. 2024); H&S §1367.01, Ins. §10123.135 | US-CA | in-force | 2024-09-28 | [California Legislature](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240SB1120) | 2026-10-04 | no |
| Companion chatbots — California SB 243 (Ch. 677, Stats. 2025); B&P §22601 et seq. | US-CA | in-force | 2027-07-01 | [California Legislature](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260SB243) | 2026-10-03 | no |
| California AB 489: AI implying a health-care licence — California AB 489 (Ch. 615, Stats. 2025); B&P §4999.8 et seq. | US-CA | in-force | 2025 (unverified) | [California Legislature](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260AB489) | 2026-10-03 | no |
| Texas SB 1188: AI use by health care practitioners — Texas SB 1188 (89R); H&S Code §183.005 | US-TX | in-force | 2025-09-01 | [Texas Legislature](https://capitol.texas.gov/tlodocs/89R/billtext/html/SB01188F.htm) | 2026-10-03 | yes |
| Illinois HB 1806: AI use by licensed professionals in therapy — Illinois HB 1806, Public Act 104-0054 | US-IL | in-force | 2025-08-01 (unverified) | [Illinois IDFPR](https://idfpr.illinois.gov/news/2025/gov-pritzker-signs-state-leg-prohibiting-ai-therapy-in-il.html) | 2026-10-03 | no |
| Children's Online Privacy Protection Rule (as amended 2025) — 15 U.S.C. 6501-6506; 16 CFR Part 312 (amended 90 FR 16918, FR Doc 2025-05904) | US | in-force | 2025-04-22, 2025-06-23, 2026-02-25, 2026-04-22 | [US Government Publishing Office](https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm) | 2026-10-03 | yes |
| Protection of Pupil Rights Amendment — 20 U.S.C. 1232h; 34 CFR Part 98 | US | in-force | 1984-09-06 | [eCFR (NARA/GPO)](https://www.ecfr.gov/current/title-34/subtitle-A/part-98) | 2026-10-03 | yes |
| Department of Education AI guidance and Supplemental Priority on Advancing AI in Education; EO 14277 — ED Dear Colleague Letter (2025-07-22); final priority FR Doc 2026-07087 (34 CFR Part 75); Executive Order 14277 (90 FR 17519) | US | in-force | 2025-04-23, 2025-07-22, 2025-08-20, 2026-04-13 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/full_text/text/2025/04/28/2025-07368.txt) | 2026-10-04 | no |
| ED OCR 'Avoiding the Discriminatory Use of AI' and ED OET 'Designing for Education with AI' — ED OCR resource (Nov 2024); ED OET developer guide (Jul 2024) | US | published | 2024-07 (unverified), 2024-11 (unverified) | [US Department of Education](https://eric.ed.gov/?id=ED661949) | 2026-10-03 | no |
| Section 508 ICT Standards and Guidelines (Revised 508 Standards) — 29 U.S.C. 794d; 36 CFR Part 1194 (82 FR 5790) | US | in-force | 2017-01-18 | [eCFR (NARA/GPO)](https://www.ecfr.gov/current/title-36/chapter-XI/part-1194) | 2026-10-03 | yes |
| ADA Title II web and mobile app accessibility rule — 28 CFR Part 35 Subpart H (89 FR 31320); IFR FR Doc 2026-07663 | US | in-force | 2024-04-24, 2026-04-20, 2026-06-22, 2027-04-26, 2028-04-26 | [eCFR (NARA/GPO)](https://www.ecfr.gov/current/title-28/chapter-I/part-35/subpart-H/section-35.200) | 2026-10-03 | yes |
| Student Online Personal Information Protection Act — Cal. Bus. & Prof. Code 22584-22585 | US-CA | in-force | 2025-01-01 | [California Legislature](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22584) | 2026-10-03 | yes |
| Education Law 2-d student data privacy and 8 NYCRR Part 121 — N.Y. Educ. Law §2-d; 8 NYCRR Part 121 | US-NY | in-force | 2020-01-13 (unverified) | [New York State Education Department](https://www.nysed.gov/data-privacy-security/regulations-strengthen-data-privacy-and-security) | 2026-10-03 | no |
| School district artificial intelligence policy requirement — Ohio Revised Code 3301.24 (enacted by HB 96) | US-OH | in-force | 2025-12-31 (unverified), 2026-07-01 (unverified) | [Ohio Legislative Service Commission](https://codes.ohio.gov/ohio-revised-code/section-3301.24) | 2026-10-03 | no |
| NERC Critical Infrastructure Protection Reliability Standards — CIP-002 through CIP-015; FERC Orders 887, 907, 912 | US | in-force | 2023-01-19, 2025-06-26, 2025-09-23, 2026-04-01, 2027-03 (unverified) | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2025/07/02/2025-12309/critical-infrastructure-protection-reliability-standard-cip-015-1-cyber-security-internal-network) | 2026-10-03 | no |
| FERC Order 901 (Inverter-Based Resources) and PRC-029-1 — FERC Order No. 901; NERC PRC-029-1 | US | in-force | 2023-10-19, 2025-07-29 | [NERC](https://www.nerc.com/globalassets/standards/resources/documents/standards-development-mapping-of-ferc-order-901-directives-and-other-guidance-to-standards-development-project_031725.pdf) | 2026-10-03 | yes |
| PFAS National Primary Drinking Water Regulation and 2026 proposals — 40 CFR Part 141 (April 2024 final rule); FR Doc 2026-10086 (proposed) | US | in-force | 2024-04-10, 2026-05-18, 2026-05-20, 2026-07-20, 2029 | [US EPA](https://www.epa.gov/dwreginfo/pfas-rule-implementation) | 2026-10-03 | yes |
| Community water system risk and resilience assessments and emergency response plans — SDWA s.1433 as amended by AWIA (2018) s.2013 | US | in-force | 2026-06-30, 2026-12-31 | [US EPA](https://www.epa.gov/waterresilience/awia-section-2013) | 2026-10-03 | yes |
| Lead and Copper Rule Improvements — 40 CFR Part 141 Subpart I (final 2024-10-08) | US | enacted-not-yet-applicable | 2024-10-08, 2027-11-01 | [US EPA](https://www.epa.gov/ground-water-and-drinking-water/revised-lead-and-copper-rule) | 2026-10-03 | yes |
| NHTSA Third Amended Standing General Order 2021-01 and AV Framework (Part 555 interim guidance) — NHTSA SGO 2021-01 (third amendment); FR Doc 2026-15483; RIN 2127-AM63 | US | in-force | 2025-04-24, 2025-06-16, 2026-06-26, 2026-07-31, 2026-08-31 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2026/07/31/2026-15483/av-framework-updates-and-request-for-comments-on-interim-guidance) | 2026-10-03 | yes |
| FMCSRs applied to ADS-equipped commercial motor vehicles and pending ADS rulemaking — 49 CFR Parts 392, 395, 396 (incl. 392.22); RIN 2126-AC17 | US | in-force | 2025 (unverified), 2026-04-15, 2026-05-15 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2026/04/15/2026-07288) | 2026-10-03 | no |
| Cybersecurity in the Marine Transportation System — 33 CFR Part 101 Subpart F (90 FR 6298) | US | in-force | 2025-01-17, 2025-07-16, 2027-07-16 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2025/01/17/2025-00708/cybersecurity-in-the-marine-transportation-system) | 2026-10-03 | yes |
| EEOC technical assistance on AI in employment (Title VII adverse impact, May 2023; ADA, May 2022) — EEOC technical assistance documents (no longer published) | US | superseded (withdrawn) | 2026-10-03 (observation) | [US EEOC](https://www.eeoc.gov/laws/guidance/select-issues-assessing-adverse-impact-software-algorithms-and-artificial) | 2026-10-03 | yes |
| GENIUS Act (payment stablecoins) — Public Law 119-27 | US | enacted-not-yet-applicable | 2025-07-18, 2026-08-18, 2026-10-19, 2027-01-18 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2025/09/19/2025-18226/genius-act-implementation) | 2026-10-03 | yes |
| Regulation Crypto Assets (proposed) — SEC proposed rule, 91 FR 54510 (FR Doc 2026-17183) | US | proposed | 2026-08-21, 2026-10-20 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2026/08/21/2026-17183/regulation-crypto-assets) | 2026-10-03 | yes |
| Equal Credit Opportunity Act / Regulation B (as amended 2026) — ECOA; 12 CFR Part 1002; CFPB final rule FR Doc 2026-07804 (91 FR 21620) | US | in-force | 2025-11-13, 2026-04-22, 2026-07-21 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2025/11/13/2025-19864/equal-credit-opportunity-act-regulation-b) | 2026-10-03 | yes |
| Personal Financial Data Rights — Dodd-Frank s.1033; 12 CFR Part 1033 (FR Doc 2024-25079); ANPR FR Doc 2025-16139 | US | in-force | 2025-01-17, 2025-08-22, 2026-06-30 (unverified) | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2024/11/18/2024-25079/required-rulemaking-on-personal-financial-data-rights) | 2026-10-03 | no |
| Conflicts of Interest Associated with the Use of Predictive Data Analytics (proposed, withdrawn) — SEC File No. S7-12-23; withdrawal 90 FR 25531 | US | superseded (withdrawn) | 2025-06-17 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2025/06/17/2025-11110/withdrawal-of-proposed-regulatory-actions) | 2026-10-03 | yes |
| The Enhancement and Standardization of Climate-Related Disclosures for Investors — SEC Release 33-11275; Reg. S-K Subpart 1500 (stayed); rescission proposed FR Doc 2026-11091 | US | enacted-not-yet-applicable | 2024-04-12, 2026-06-03, 2026-08-03 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/api/v1/documents.json?conditions[agencies][]=securities-and-exchange-commission) | 2026-10-04 | yes |
| Regulation S-P amendments — SEC Regulation S-P amendments (89 FR 47688) | US | in-force | 2025-12-03, 2026-06-03 | [Office of the Federal Register (NARA/GPO)](https://www.federalregister.gov/documents/2024/06/03/2024-11116/regulation-s-p-privacy-of-consumer-financial-information-and-safeguarding-customer-information) | 2026-10-03 | yes |
| Interagency Revised Guidance on Model Risk Management — Federal Reserve SR 26-2 (with OCC and FDIC) | US | published | 2026-04-17 | [Federal Reserve Board](https://www.federalreserve.gov/supervisionreg/srletters/SR2602.htm) | 2026-10-03 | yes |
| FINRA Regulatory Notice 24-09 and 2026 Annual Regulatory Oversight Report (GenAI) — FINRA RN 24-09; FINRA Rules 3110, 2210 | US | in-force | 2024-06-27, 2025-12-09 | [FINRA](https://www.finra.org/rules-guidance/notices/24-09) | 2026-10-03 | yes |
| Texas Responsible Artificial Intelligence Governance Act — Texas HB 149 (89R); Bus. & Com. Code ch. 551-554 | US-TX | in-force | 2025-06-22, 2026-01-01 | [Texas Legislature](https://capitol.texas.gov/tlodocs/89R/billtext/html/HB00149F.htm) | 2026-10-04 | yes |
| Transparency in Frontier Artificial Intelligence Act — California SB 53 (Ch. 138, Stats. 2025) | US-CA | in-force | 2025-09-29, 2026-01-01 (unverified), 2027-01-01 | [California Legislature](https://leginfo.legislature.ca.gov/faces/billStatusClient.xhtml?bill_id=202520260SB53) | 2026-10-03 | no |
| Generative Artificial Intelligence: Training Data Transparency — California AB 2013 (Ch. 817, Stats. 2024) | US-CA | in-force | 2024-09-28, 2026-01-01 | [California Legislature](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240AB2013) | 2026-10-03 | yes |
| CCPA regulations on automated decisionmaking technology, risk assessments and cybersecurity audits — CCPA regulations (11 CCR) on ADMT, risk assessments and cybersecurity audits (CPPA; OAL-approved 2025-09-22) | US-CA | partially-applicable | 2025-07-24, 2025-09-22, 2026-01-01, 2027-01-01, 2027-12-31, 2028-04-01, 2029-04-01, 2030-04-01 | [California Privacy Protection Agency](https://cppa.ca.gov/regulations/ccpa_updates.html) | 2026-10-03 | yes |
| Civil Rights Council regulations on automated-decision systems in employment — California Civil Rights Council FEHA regulations on automated-decision systems | US-CA | in-force | 2025-10-01 | [California Civil Rights Department](https://calcivilrights.ca.gov/2025/06/30/civil-rights-council-secures-approval-for-regulations-to-protect-against-employment-discrimination-related-to-artificial-intelligence/) | 2026-10-03 | yes |
| Artificial Intelligence Policy Act (as amended 2025) — Utah SB 149 (2024) as amended by 2025 SB 226 / SB 332 | US-UT | in-force | 2024 (unverified) | [Utah Legislature](https://le.utah.gov/xcode/Title13/Chapter72/13-72-S1.html) | 2026-10-04 | no |
| Illinois Human Rights Act amendment on AI in employment — Illinois HB 3773, Public Act 103-0804 | US-IL | in-force | 2026-01-01 (unverified) | [Illinois General Assembly](https://www.ilga.gov/legislation/publicacts/fulltext.asp?Name=103-0804) | 2026-10-04 | no |
| Automated Employment Decision Tools law and DCWP rules — NYC Local Law 144 of 2021 and DCWP rules | US-NYC | in-force | 2023-07-05 | [NYC Department of Consumer and Worker Protection](https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page) | 2026-10-03 | yes |
| Conversational Artificial Intelligence Service Operator Requirements (Chatbot Safety Act) — Colorado HB26-1263 | US-CO | enacted-not-yet-applicable | 2026-05-29, 2026-08-11, 2026-10-26, 2027-01-01 | [Colorado General Assembly](https://leg.colorado.gov/bills/hb26-1263) | 2026-10-04 | yes |

Why an entry is unverified is recorded in the entry itself: `openQuestions`, and each `keyDate` or obligation with `verified: false` (with a `note` or `basis` where the batch gave one). The main groups: ISO standards (iso.org answers this harness with HTTP 403, so editions and dates come from a dated receipt or are unconfirmed); China, Brazil, India and Japan entries, which the program's root ruling allows only as unverified with no obligation asserted; guidance, soft-law and proposal texts not read in the review; conflicts between official sources that were not resolved; and US state statutes whose official sites refused the connection (Illinois, Utah, New York State Education Department, Ohio).

### Regulatory feeds

`DEFAULT_REGULATORY_FEEDS` (`src/compliance/regulatory/feeds.ts`) lists six live official feeds — AI Act Service Desk RSS, Commission digital-strategy RSS, EDPB news RSS, NIST news RSS, Federal Register API v1, FCA news RSS — each with the HTTP status and time of a GET made on 2026-10-03. ISO, OWASP, MITRE ATLAS, AI Verify and TC260 are web pages or non-regulators: they are kept as `manual-review-required` and disabled, with the reason recorded. A feed change is a prompt for human review, never a legal date; RSS items carry `effectiveDateEstimated: true`.

## References

- [NIST AI RMF 1.0](https://www.nist.gov/itl/ai-risk-management-framework) — retrieved 2026-10-03
- [SOC 2 Trust Services Criteria](https://www.aicpa.org/soc4so) — not re-checked in the 2026-10-03 review
- [ISO/IEC 42001:2023](https://www.iso.org/standard/81230.html) — retrieval attempted 2026-10-03, HTTP 403 bot challenge
- [GDPR (EU) 2016/679 — European Commission legal framework page](https://commission.europa.eu/law/law-topic/data-protection/legal-framework-eu-data-protection_en) — retrieved 2026-10-03
- [EU AI Act (EU) 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj) — EUR-Lex bot challenge on 2026-10-03; [AI Act Service Desk, Article 113](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-113) retrieved 2026-10-03
- Every other instrument: see the Regulatory Currency Register table above (URL and retrieved date per row)
