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
amc compliance frameworks

# Generate compliance report for a framework
amc compliance report --framework NIST_AI_RMF --output report.json

# Generate reports for all frameworks
amc compliance report --framework SOC2 --output soc2-report.json
amc compliance report --framework ISO_42001 --output iso42001-report.json
amc compliance report --framework GDPR --output gdpr-report.json
amc compliance report --framework EU_AI_ACT --output euai-report.json

# Install policy pack
amc policy-pack install --pack nist-ai-rmf
amc policy-pack activate --pack nist-ai-rmf

# List installed packs
amc policy-pack list

# Run marketplace scan
amc policy-pack scan
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

## References

- [NIST AI RMF 1.0](https://www.nist.gov/itl/ai-risk-management-framework)
- [SOC 2 Trust Services Criteria](https://www.aicpa.org/soc4so)
- [ISO/IEC 42001:2023](https://www.iso.org/standard/81230.html)
- [GDPR (EU) 2016/679](https://gdpr-info.eu/)
- [EU AI Act (EU) 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)
