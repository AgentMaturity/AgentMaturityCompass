# GDPR Article-Level Compliance Mapping — AMC Dimension Mapping

Version: 1.0 | Date: 2026-03-10
Regulation: General Data Protection Regulation (EU) 2016/679
Status: Engineering compliance mapping — not legal advice

---

## 1. Overview

This document maps AMC's five maturity dimensions and evidence infrastructure to specific GDPR obligations relevant to AI agent systems. AMC provides deterministic, evidence-linked compliance signals — not legal certifications.

GDPR applies to any processing of personal data by or through AI agents. AMC's compliance engine supports `GDPR` as a first-class framework alongside SOC2, NIST AI RMF, ISO 42001, and EU AI Act.

```bash
amc compliance report --framework GDPR --window 30d --out .amc/reports/gdpr.md
```

### Operational DSAR Intake

AMC also exposes a persistent DSAR workflow for access, erasure, and portability requests:

```bash
amc vault dsar submit --subject user@example.com --type access --json
amc vault dsar status <requestId> --json
amc vault dsar complete <requestId> --json
amc vault dsar list --json
```

Requests are stored under `.amc/vault/dsar/requests.json`, and each submit/complete action appends a JSONL audit event under `.amc/vault/dsar/audit.jsonl`. The audit trail hashes the subject identifier so operators can prove request handling without duplicating raw subject identifiers in the audit log.

External regulator guidance checked on 2026-06-16: ICO guidance for subject access requests says organizations should respond without delay and within one month, and provide copies in accessible, concise, intelligible formats; ICO erasure guidance says Article 17 requests can be verbal or written and require one-month handling; ICO data portability guidance emphasizes structured, commonly used, machine-readable formats and one-month response handling. See:

- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/subject-access-requests/a-guide-to-subject-access/
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-data-portability/

### Operational DLP Scan

AMC exposes the DLP scanner from both the top-level namespace and Vault namespace:

```bash
amc dlp scan "IBAN GB82 WEST 1234 5698 7654 32 from 198.51.100.42" --json
amc vault dlp scan "passport number C01X00T99" --redact
```

The scanner detects existing US/credential patterns plus EU-relevant identifiers: validated IBANs, IP addresses, VAT IDs, keyword-bound EU national ID references, passport numbers, and health-record IDs. IBAN detection validates the checksum rather than redacting every IBAN-shaped string.

External source check on 2026-06-16:

- GDPR Recital 30 lists internet protocol addresses and similar online identifiers as identifiers that can be associated with natural persons: https://gdpr-info.eu/recitals/no-30/
- Swift states IBAN is the international standard for account numbers, follows ISO 13616 national formats, and that Swift publishes the ISO 13616 IBAN registry: https://www.swift.com/standards/data-standards/iban-international-bank-account-number

---

## 2. Scope: Why GDPR Applies to AI Agents

AI agents process personal data when they:

- Handle user messages containing names, emails, phone numbers, or other PII
- Store conversation history or memory files referencing identifiable individuals
- Make tool calls that read/write personal data (CRM, email, calendar, databases)
- Generate outputs that reference or infer personal attributes
- Operate in domains where data subjects interact (support, HR, healthcare, finance)

GDPR's controller/processor distinction maps to agent architectures:
- **Controller**: The organization deploying the agent (decides purposes and means)
- **Processor**: The agent platform/provider (processes data on controller's behalf)
- **Sub-processor**: Third-party model providers, tool APIs, storage backends

---

## 3. Article-to-AMC Mapping

### Art. 5 — Principles Relating to Processing of Personal Data

Art. 5 establishes seven foundational principles. Each maps to distinct AMC evidence requirements.

#### Art. 5(1)(a) — Lawfulness, Fairness, and Transparency

**Requirement**: Personal data must be processed lawfully, fairly, and in a transparent manner in relation to the data subject.

| AMC Evidence | Module | Questions |
|---|---|---|
| Transparent capability declarations | `src/passport/` | AMC-2.4 |
| Action policy with explicit scope boundaries | `src/approvals/`, `src/governor/` | AMC-1.8 |
| Context graph documenting data flows | `src/cgx/` | AMC-3.1.2 |
| Transparency artifacts and reports | `src/transparency/` | AMC-3.3.2 |
| Assurance pack: `duality` (role boundary testing) | `src/assurance/packs/` | — |

**Evidence requirement**: Artifact/review/audit events with ≥50% OBSERVED trust tier.

**AMC mapping ID**: `gdpr_art5_lawfulness_fairness_transparency`

#### Art. 5(1)(b) — Purpose Limitation

**Requirement**: Personal data collected for specified, explicit, and legitimate purposes and not further processed in a manner incompatible with those purposes.

| AMC Evidence | Module | Questions |
|---|---|---|
| Tool/data supply chain governance | `src/bom/`, `src/supply/` | AMC-1.5 |
| Scope boundary enforcement | `src/governor/` | AMC-3.1.2 |
| Action policy restricting out-of-scope operations | `action-policy.yaml` | AMC-1.8 |
| Assurance pack: `exfiltration` (data boundary tests) | `src/assurance/packs/` | — |

**Evidence requirement**: Audit/review events ≥50% OBSERVED + no `POLICY_VIOLATION` or `SCOPE_EXCEEDED` audit events.

**AMC mapping ID**: `gdpr_art5_purpose_limitation`

#### Art. 5(1)(c) — Data Minimisation

**Requirement**: Personal data must be adequate, relevant, and limited to what is necessary in relation to the purposes for which they are processed.

| AMC Evidence | Module | Questions |
|---|---|---|
| Gateway-level context filtering | `src/bridge/`, `src/gateway/` | AMC-1.5 |
| Guardrails preventing excessive data collection | `guardrails.yaml` | AMC-3.1.2 |
| DLP controls on outbound data | `src/shield/`, `src/vault/` | AMC-1.8 |
| Assurance pack: `exfiltration` (data leakage tests) | `src/assurance/packs/` | — |

**Evidence requirement**: Audit/llm_request events ≥60% OBSERVED + no `SECRET_EXFILTRATION_SUCCEEDED` or `EXCESSIVE_DATA_COLLECTION` audit events.

**AMC mapping ID**: `gdpr_art5_data_minimisation`

#### Art. 5(1)(d) — Accuracy

**Requirement**: Personal data must be accurate and, where necessary, kept up to date; every reasonable step must be taken to ensure inaccurate data is erased or rectified without delay.

| AMC Evidence | Module | Questions |
|---|---|---|
| Anti-hallucination controls | `src/truthguard/` | AMC-2.3, AMC-4.3 |
| Eval harness with factual accuracy tests | `src/bench/` | AMC-2.3 |
| Assurance pack: `hallucination` (factual accuracy) | `src/assurance/packs/` | — |
| Memory decay and refresh protocols | `src/memory/` | AMC-4.5 |

**Evidence requirement**: Test/metric/audit events ≥60% OBSERVED + `hallucination` pack score ≥75.

**AMC mapping ID**: `gdpr_art5_accuracy`

#### Art. 5(1)(e) — Storage Limitation

**Requirement**: Personal data kept in a form which permits identification of data subjects for no longer than is necessary.

| AMC Evidence | Module | Questions |
|---|---|---|
| Data retention and lifecycle policies | `guardrails.yaml` | AMC-3.1.2 |
| Evidence ledger TTL/rotation | `src/ledger/` | AMC-1.7 |
| Memory file lifecycle management | `src/memory/` | — |
| Assurance pack: `exfiltration` (retention boundary) | `src/assurance/packs/` | — |

**Evidence requirement**: Audit/artifact events ≥50% OBSERVED.

**AMC mapping ID**: `gdpr_art5_storage_limitation`

#### Art. 5(1)(f) — Integrity and Confidentiality

**Requirement**: Personal data processed with appropriate security including protection against unauthorized or unlawful processing and against accidental loss, destruction, or damage.

| AMC Evidence | Module | Questions |
|---|---|---|
| Encryption at rest and in transit | `src/vault/`, `docs/ENCRYPTION_AT_REST.md` | AMC-1.5, AMC-1.8 |
| Prompt injection defense | `src/shield/` | AMC-1.8 |
| Secret exfiltration prevention | `src/vault/`, `src/shield/` | AMC-1.5 |
| Hash-chained evidence integrity | `src/ledger/`, `src/transparency/` | AMC-1.7 |
| Assurance packs: `exfiltration`, `injection` | `src/assurance/packs/` | — |

**Evidence requirement**: Audit/llm_request/llm_response events ≥70% OBSERVED + `exfiltration` pack score ≥80 + no `SECRET_EXFILTRATION_SUCCEEDED` or `UNSAFE_PROVIDER_ROUTE` audit events.

**AMC mapping ID**: `gdpr_art5_integrity_confidentiality`

#### Art. 5(2) — Accountability

**Requirement**: The controller shall be responsible for, and be able to demonstrate compliance with, the principles (accountability principle).

| AMC Evidence | Module | Questions |
|---|---|---|
| Append-only evidence ledger | `src/ledger/` | AMC-1.6, AMC-1.7 |
| Signed audit binder | `src/audit/` | AMC-4.1 |
| Compliance reports with deterministic checks | `src/compliance/` | AMC-3.2.3 |
| Transparency reports | `src/transparency/` | AMC-3.3.2 |
| Hash-chained receipts | `src/receipts/` | — |

**Evidence requirement**: Audit/artifact/review events ≥60% OBSERVED + signed audit binder with valid chain.

**AMC mapping ID**: `gdpr_art5_accountability` *(added to builtInMappings.ts in the 2026-06-16 follow-up)*

---

### Art. 13 — Information to Be Provided Where Personal Data Are Collected from the Data Subject

**Requirement**: At the time of obtaining personal data, the controller must provide the data subject with: identity and contact details of the controller, purposes and legal basis for processing, recipients of data, retention period, existence of data subject rights, right to lodge a complaint, and whether provision of data is statutory/contractual requirement.

For AI agents, Art. 13 further requires disclosure of the existence of automated decision-making (including profiling) with meaningful information about the logic involved, significance, and envisaged consequences (Art. 13(2)(f)).

| AMC Evidence | Module | Questions |
|---|---|---|
| Agent passport with capability declarations | `src/passport/` | AMC-2.4 |
| Transparency artifacts and disclosure docs | `src/transparency/` | AMC-3.3.2 |
| Context graph documenting data flows and recipients | `src/cgx/` | AMC-3.1.2 |
| Explainability packet for decision logic | `src/watch/explainabilityPacket.ts` | AMC-2.4 |
| Identity and voice signals | `src/identity/` | AMC-3.2.2 |

**Evidence requirement**: Artifact/review events ≥50% OBSERVED + agent passport with declared capabilities + explainability packet available for automated decisions.

**AMC mapping ID**: `gdpr_art13_information_provision` *(new — recommended addition to builtInMappings.ts)*

---

### Art. 14 — Information to Be Provided Where Personal Data Have Not Been Obtained from the Data Subject

**Requirement**: Where personal data are obtained from sources other than the data subject (e.g., third-party APIs, databases, scraped content), the controller must provide similar information as Art. 13, plus the source of the data and categories of personal data concerned.

For AI agents, this applies when agents:
- Query external databases or CRMs containing personal data
- Receive personal data from other agents in multi-agent systems
- Process data from tool calls that return third-party personal information
- Ingest data from web scraping, RSS feeds, or API integrations

| AMC Evidence | Module | Questions |
|---|---|---|
| Tool/data supply chain governance (data source tracking) | `src/bom/`, `src/supply/` | AMC-1.5 |
| Context graph with data provenance | `src/cgx/` | AMC-3.1.2 |
| Multi-agent trust boundaries | `src/federation/`, `src/pairing/` | AMC-4.5 |
| Tool action audit trail (source attribution) | `src/ledger/` | AMC-1.6, AMC-1.7 |
| Transparency artifacts | `src/transparency/` | AMC-3.3.2 |

**Evidence requirement**: Audit/tool_action events ≥60% OBSERVED + data provenance tracked in context graph + tool BOM with source classifications.

**AMC mapping ID**: `gdpr_art14_indirect_collection` *(new — recommended addition to builtInMappings.ts)*

---

### Art. 17 — Right to Erasure ('Right to Be Forgotten')

**Requirement**: The data subject has the right to obtain from the controller the erasure of personal data without undue delay where: (a) data no longer necessary, (b) consent withdrawn, (c) data subject objects, (d) unlawful processing, (e) legal obligation to erase, or (f) data collected in relation to information society services offered to a child.

For AI agents, Art. 17 creates specific technical challenges:
- **Memory files**: Personal data persisted in agent memory must be erasable
- **Conversation history**: Chat logs containing PII must support selective deletion
- **Derived data**: Inferences, summaries, or embeddings derived from personal data
- **Evidence ledger**: Append-only logs may need redaction capabilities (Art. 17(3) exceptions for legal claims, public interest, archiving)
- **Multi-agent propagation**: Data shared with sub-agents or federated agents must be traceable for cascade deletion

| AMC Evidence | Module | Questions |
|---|---|---|
| Data lifecycle and retention policies | `guardrails.yaml` | AMC-3.1.2 |
| Memory management with deletion support | `src/memory/` | AMC-3.1.2 |
| Evidence ledger with redaction capability | `src/ledger/` | AMC-1.7 |
| Vault with key deletion (crypto-shredding) | `src/vault/` | AMC-1.5 |
| Tool action audit trail for deletion verification | `src/ledger/`, `src/audit/` | AMC-4.1 |
| Federation data propagation tracking | `src/federation/` | AMC-4.5 |
| Assurance pack: `exfiltration` (boundary enforcement) | `src/assurance/packs/` | — |

**Evidence requirement**: Audit/tool_action events ≥60% OBSERVED + vault key rotation capability + memory deletion API available.

**AMC mapping ID**: `gdpr_art17_right_to_erasure` *(new — recommended addition to builtInMappings.ts)*

**Implementation gap note**: The current `gdpr_art15_22_data_subject_rights` mapping bundles Art. 17 with other rights. A dedicated Art. 17 mapping enables finer-grained compliance tracking for erasure-specific controls.

---

### Art. 22 — Automated Individual Decision-Making, Including Profiling

**Requirement**: The data subject has the right not to be subject to a decision based solely on automated processing, including profiling, which produces legal effects or similarly significantly affects them. Exceptions: (a) necessary for contract, (b) authorized by law, (c) based on explicit consent — in all cases with suitable safeguards including the right to obtain human intervention, to express their point of view, and to contest the decision.

For AI agents, Art. 22 is critical when agents:
- Make approval/denial decisions (hiring, lending, insurance, access control)
- Score, rank, or classify individuals
- Trigger automated actions with significant consequences (account suspension, content removal)
- Operate in high-autonomy modes without human checkpoint gates

| AMC Evidence | Module | Questions |
|---|---|---|
| Human oversight gates and approval workflows | `src/approvals/`, `src/governor/` | AMC-2.10 |
| Human oversight quality scoring | `src/score/humanOversightQuality.ts` | AMC-HOQ-1 to AMC-HOQ-4 |
| Explainability packet for decision logic | `src/watch/explainabilityPacket.ts` | AMC-2.4 |
| Governance bypass assurance pack | `src/assurance/packs/` | AMC-1.8 |
| Autonomy duration tracking | Domain risk × oversight interval | AMC-4.5 |
| Agent passport with decision scope declarations | `src/passport/` | AMC-2.4 |
| Circuit breakers and auto-pause | `src/governor/` | AMC-4.1 |

**Evidence requirement**: Audit/tool_action events ≥60% OBSERVED + `governance_bypass` pack score ≥85 + human oversight quality score ≥ L3 for high-risk domains.

**AMC mapping ID**: `gdpr_art22_automated_decisions` *(new — recommended addition to builtInMappings.ts)*

**Implementation gap note**: The current `gdpr_art15_22_data_subject_rights` mapping bundles Art. 22 with other rights. Given the AI-specific significance of automated decision-making, a dedicated mapping is recommended.

**Intersection with EU AI Act Art. 14**: Art. 22 GDPR and Art. 14 EU AI Act both require human oversight but from different angles — GDPR focuses on individual rights (opt-out, contestation), while EU AI Act focuses on system design (intervention, override, stop). AMC's `humanOversightQuality` scorer covers both.

---

### Art. 25 — Data Protection by Design and by Default

**Requirement**: The controller shall implement appropriate technical and organizational measures designed to implement data-protection principles (such as data minimisation) effectively and to integrate necessary safeguards into processing. By default, only personal data necessary for each specific purpose of the processing is processed — this applies to the amount collected, extent of processing, period of storage, and accessibility.

For AI agents, "by design and by default" means:
- **Minimal context windows**: Only necessary personal data included in prompts
- **Redaction by default**: PII stripped from logs, evidence, and model inputs unless required
- **Least-privilege tool access**: Agents cannot access more data than their task requires
- **Privacy-preserving memory**: Personal data in memory files is pseudonymized or encrypted
- **Consent-aware processing**: Processing gates check consent state before accessing personal data

| AMC Evidence | Module | Questions |
|---|---|---|
| Gateway-level context filtering and redaction | `src/bridge/`, `src/shield/` | AMC-1.5, AMC-1.8 |
| Tool access governed by action policy (least privilege) | `action-policy.yaml`, `tools.yaml` | AMC-1.8 |
| Vault with encryption at rest | `src/vault/` | AMC-1.5 |
| Data residency controls | `src/compliance/dataResidency.ts` | AMC-3.1.2 |
| Privacy-by-design assurance | `src/assurance/packs/technologyGDPRSOCPack.ts` | — |
| Assurance packs: `exfiltration`, `governance_bypass` | `src/assurance/packs/` | — |

**Evidence requirement**: Audit/test/review events ≥60% OBSERVED + `exfiltration` pack score ≥80 + no `SECRET_EXFILTRATION_SUCCEEDED` audit events.

**AMC mapping ID**: `gdpr_art25_data_protection_by_design`

---

### Art. 35 — Data Protection Impact Assessment (DPIA)

**Requirement**: Where a type of processing, in particular using new technologies, is likely to result in a high risk to the rights and freedoms of natural persons, the controller must carry out a DPIA before the processing. Required for: (a) systematic and extensive evaluation of personal aspects based on automated processing (profiling), (b) large-scale processing of special categories of data, (c) systematic monitoring of a publicly accessible area on a large scale.

For AI agents, DPIA is mandatory when:
- Agents operate in high-risk domains (healthcare, finance, employment, education)
- Agents process special category data (health, biometric, political opinions, religious beliefs)
- Agents perform profiling or behavioral analysis at scale
- Agents monitor public spaces (social media listening, content moderation)
- High-autonomy agents make decisions affecting individuals

The DPIA must contain: (a) systematic description of processing operations and purposes, (b) assessment of necessity and proportionality, (c) assessment of risks to rights and freedoms, (d) measures to address risks including safeguards and security measures.

| AMC Evidence | Module | Questions |
|---|---|---|
| DPIA artifact | `docs/FRIA.md`, `.amc/fria.json` | AMC-2.6, AMC-2.12 |
| FRIA (Fundamental Rights Impact Assessment) | `src/compliance/` | AMC-2.6 |
| Domain risk classification | `src/score/domainPacks.ts` | AMC-4.5 |
| Risk register and treatment plans | `src/ops/`, `src/forecast/` | AMC-2.8, AMC-4.5 |
| Context graph for processing descriptions | `src/cgx/` | AMC-3.1.2 |
| Assurance pack: `duality` (risk scenario testing) | `src/assurance/packs/` | — |

**Evidence requirement**: Artifact/review/audit events ≥50% OBSERVED + DPIA/FRIA artifact present with risk assessment and mitigation measures documented.

**AMC mapping ID**: `gdpr_art35_dpia`

---

## 4. Gap Analysis: Current builtInMappings.ts vs This Document

| GDPR Article | Existing Mapping ID | Status | Recommendation |
|---|---|---|---|
| Art. 5(1)(a) | `gdpr_art5_lawfulness_fairness_transparency` | ✅ Exists | — |
| Art. 5(1)(b) | `gdpr_art5_purpose_limitation` | ✅ Exists | — |
| Art. 5(1)(c) | `gdpr_art5_data_minimisation` | ✅ Exists | — |
| Art. 5(1)(d) | `gdpr_art5_accuracy` | ✅ Exists | — |
| Art. 5(1)(e) | `gdpr_art5_storage_limitation` | ✅ Exists | — |
| Art. 5(1)(f) | `gdpr_art5_integrity_confidentiality` | ✅ Exists | — |
| Art. 5(2) | `gdpr_art5_accountability` | ✅ Exists | — |
| Art. 13 | — | ⚠️ Missing | Add `gdpr_art13_information_provision` |
| Art. 14 | — | ⚠️ Missing | Add `gdpr_art14_indirect_collection` |
| Art. 17 | `gdpr_art15_22_data_subject_rights` (bundled) | ⚠️ Bundled | Add dedicated `gdpr_art17_right_to_erasure` |
| Art. 22 | `gdpr_art15_22_data_subject_rights` (bundled) | ⚠️ Bundled | Add dedicated `gdpr_art22_automated_decisions` |
| Art. 25 | `gdpr_art25_data_protection_by_design` | ✅ Exists | — |
| Art. 35 | `gdpr_art35_dpia` | ✅ Exists | — |

**Summary**: 9 of 13 article-level rows now have direct mappings. Art. 13 and Art. 14 remain missing. Art. 17 and Art. 22 are bundled in Art. 15-22 data-subject rights and should be split into dedicated mappings.

---

## 5. AMC Diagnostic Question Coverage

| GDPR Article | Primary AMC Questions | Coverage |
|---|---|---|
| Art. 5 (Principles) | AMC-1.5, AMC-1.7, AMC-1.8, AMC-2.3, AMC-2.4, AMC-3.1.2, AMC-3.3.2, AMC-4.3, AMC-4.5 | Strong |
| Art. 13 (Transparency — direct) | AMC-2.4, AMC-3.2.2, AMC-3.3.2 | Moderate |
| Art. 14 (Transparency — indirect) | AMC-1.5, AMC-1.6, AMC-1.7, AMC-3.1.2, AMC-4.5 | Moderate |
| Art. 17 (Erasure) | AMC-1.5, AMC-1.7, AMC-3.1.2, AMC-4.1 | Moderate (needs erasure-specific question) |
| Art. 22 (Automated decisions) | AMC-1.8, AMC-2.4, AMC-2.10, AMC-4.1, AMC-HOQ-1–4 | Strong |
| Art. 25 (DPbD) | AMC-1.5, AMC-1.8, AMC-3.1.2 | Strong |
| Art. 35 (DPIA) | AMC-2.6, AMC-2.8, AMC-2.12, AMC-3.1.2, AMC-4.5 | Strong |

---

## 6. Cross-Framework Synergies

| GDPR Article | EU AI Act Article | Overlap |
|---|---|---|
| Art. 5(1)(a) Transparency | Art. 13 Transparency | Both require clear disclosure of processing logic |
| Art. 5(1)(f) Security | Art. 15 Accuracy/Robustness/Cybersecurity | Both require appropriate security measures |
| Art. 17 Erasure | — | GDPR-specific, no direct EU AI Act equivalent |
| Art. 22 Automated decisions | Art. 14 Human oversight | Both require human intervention capabilities |
| Art. 25 DPbD | Art. 9 Risk management | Both require built-in safeguards by design |
| Art. 35 DPIA | Art. 27 FRIA | Both require pre-deployment impact assessment |

AMC's `crossFrameworkMapping.ts` generates coverage matrices across GDPR and EU AI Act simultaneously, avoiding duplicate evidence collection.

---

## 7. CLI Usage

```bash
# Full GDPR compliance report
amc compliance report --framework GDPR --window 30d --out .amc/reports/gdpr.md

# GDPR-specific assurance pack
amc assurance run --pack technologyGDPRSOC

# Cross-framework matrix (GDPR + EU AI Act)
amc compliance matrix --frameworks GDPR,EU_AI_ACT --out .amc/reports/cross-framework.md

# Install GDPR policy pack
amc policy-pack install --pack gdpr
amc policy-pack activate --pack gdpr
```

---

## References

- GDPR full text: https://gdpr-info.eu/
- EDPB Guidelines on Automated Decision-Making (Art. 22): https://edpb.europa.eu/our-work-tools/general-guidance/gdpr-guidelines-recommendations-best-practices_en
- AMC Compliance Engine: `src/compliance/complianceEngine.ts`
- AMC Built-in Mappings: `src/compliance/builtInMappings.ts`
- AMC GDPR Policy Pack: `platform/python/amc/watch/prebuilt_policy_packs.py`
- AMC Cross-Framework Mapping: `src/score/crossFrameworkMapping.ts`
- Related: `docs/EU_AI_ACT_COMPLIANCE.md`, `docs/COMPLIANCE_FRAMEWORKS.md`
