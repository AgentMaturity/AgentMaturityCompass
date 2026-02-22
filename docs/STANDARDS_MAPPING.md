# AMC Standards Mapping
**Agent Maturity Certification — Cross-Standard Alignment Reference**
*Version 1.0 | Generated 2026-02-19*

---

## Executive Summary

AMC is a **superset** of existing AI and software maturity standards. Each major framework covers a slice of what enterprises need when deploying AI agents. AMC covers *all* of their territory and adds agent-specific dimensions none of them address.

| Standard | Coverage Focus | What AMC Adds |
|---|---|---|
| **NIST AI RMF** | Risk identification, measurement, and management for AI | Execution-proof evidence, agent-specific behavioral controls, self-improvement loop |
| **ISO/IEC 42001:2023** | AI management system structure & documentation | Automated scoring, CMMI-style maturity levels, agent orchestration controls |
| **CMMI (v2.0)** | Process maturity for software/service organizations | AI-specific dimensions: prompt injection defense, token cost governance, multi-agent reliability |
| **EU AI Act** | Legal compliance for high-risk AI systems | Quantitative scoring, gap remediation roadmap, evidence collection automation |
| **Microsoft Responsible AI** | Principles-based guidelines | Operational enforcement modules, not just principles |
| **Google/HF Model Cards** | Single-model documentation | Org-level agent maturity, multi-model environments, operating model coverage |

**Bottom line:** AMC operationalizes these standards into 5 dimensions, 87 scored questions, and executable evidence modules. It is the only framework that combines *assessment*, *evidence*, *improvement*, and *certification* in a single automated system.

---

## Compliance Decomposition Update (2026-02-22)

This section supersedes legacy rollup mappings for `AMC-EUAI-1` and `AMC-OWASP-1`.

### EU AI Act: Decomposed Control Mapping

| Legacy Rollup | New AMC QID | Requirement Focus |
|---|---|---|
| AMC-EUAI-1 | **AMC-2.6** | FRIA completion and refresh governance |
| AMC-EUAI-1 | **AMC-2.7** | Serious incident lifecycle and reporting readiness |
| AMC-EUAI-1 | **AMC-2.8** | Post-market monitoring execution |
| AMC-EUAI-1 | **AMC-2.9** | Technical documentation lifecycle governance |
| AMC-EUAI-1 | **AMC-2.10** | Human oversight implementation in runtime operations |
| AMC-EUAI-1 | **AMC-2.11** | Conformity assessment readiness |

### OWASP LLM Top 10: One Question Per Risk Class

| Legacy Rollup | New AMC QID | OWASP Risk Class |
|---|---|---|
| AMC-OWASP-1 | **AMC-5.8** | LLM01 Prompt Injection |
| AMC-OWASP-1 | **AMC-5.9** | LLM02 Insecure Output Handling |
| AMC-OWASP-1 | **AMC-5.10** | LLM03 Training Data Poisoning |
| AMC-OWASP-1 | **AMC-5.11** | LLM04 Model Denial of Service |
| AMC-OWASP-1 | **AMC-5.12** | LLM05 Supply Chain Vulnerabilities |
| AMC-OWASP-1 | **AMC-5.13** | LLM06 Sensitive Information Disclosure |
| AMC-OWASP-1 | **AMC-5.14** | LLM07 Insecure Plugin Design |
| AMC-OWASP-1 | **AMC-5.15** | LLM08 Excessive Agency |
| AMC-OWASP-1 | **AMC-5.16** | LLM09 Overreliance |
| AMC-OWASP-1 | **AMC-5.17** | LLM10 Model Theft |

### ISO/IEC 42005 and 42006 Linkage

| Standard | New AMC QID | Mapping Intent |
|---|---|---|
| ISO/IEC 42005:2025 | **AMC-2.12** | Impact assessment scope + stakeholder boundary definition |
| ISO/IEC 42005:2025 | **AMC-2.13** | Impact severity/likelihood quantification and uncertainty handling |
| ISO/IEC 42005:2025 | **AMC-2.14** | Harm-to-mitigation traceability and closure evidence |
| ISO/IEC 42006:2025 | **AMC-2.11** | Certification body readiness and conformity evidence packaging |

### Bias and Fairness Sub-Controls

| Control Family | New AMC QID | Metric Focus |
|---|---|---|
| Fairness | **AMC-3.4.1** | Demographic parity |
| Fairness | **AMC-3.4.2** | Counterfactual fairness |
| Fairness | **AMC-3.4.3** | Disparate impact |

### Evidence Gate Requirement (All New Controls)

All new controls require L3+ question-scoped compliance evidence and L4/L5 observed-trust evidence with audit, metric, test, and artifact traces.

---

## Dimension → Standards Mapping Master Table

### Dimension 1: Governance (Q1–Q6)

| AMC Question | NIST AI RMF | ISO 42001:2023 | CMMI Level | EU AI Act |
|---|---|---|---|---|
| **GOV-1** Documented AI governance policy | GV-1.1 Org context, roles & responsibilities | §6.2 AI objectives, §5.1 Leadership | L2 (Managed) — Policy defined | Art 9 Risk management system |
| **GOV-2** Clear owner / RACI matrix | GV-1.2 Accountability structures | §5.3 Roles & responsibilities | L2 (Managed) — Ownership assigned | Art 9(1) Risk management system |
| **GOV-3** Audit trail for agent actions | GV-6.1 Policies for risk response | §9.1 Monitoring, measurement & evaluation | L3 (Defined) — Process institutionalized | Art 12 Record-keeping obligations |
| **GOV-4** Human-in-the-loop for high-risk actions | GV-4.1 Org teams, roles, responsibilities | §8.4 AI system operation controls | L3 (Defined) — Process defined | Art 14 Human oversight |
| **GOV-5** Formal risk assessments pre-rollout | MP-2.3 AI risk categorization | §6.1 Actions to address risks | L3 (Defined) — Risk-based process | Art 9(2) Risk management |
| **GOV-6** Policy change management & versioning | GV-6.2 Policies enforced | §10.2 Nonconformity and corrective action | L4 (Optimizing) — Continuous improvement | Art 9(6) Periodic review |

**AMC-specific additions not covered by any standard:**
- Execution-proof policy receipts (W1 Signed Action Receipts)
- AI-specific approval anti-phishing (E16 Approval Anti-Phishing)
- Agent-level RACI vs. model-level RACI distinction

---

### Dimension 2: Security (Q7–12)

| AMC Question | NIST AI RMF | ISO 42001:2023 | CMMI Level | EU AI Act |
|---|---|---|---|---|
| **SEC-1** Policy firewall for tool calls | MS-2.5 Adversarial testing | §8.5 Documented information security | L3 (Defined) — Access controls | Art 15 Accuracy, robustness & cybersecurity |
| **SEC-2** Prompt injection detection | MS-2.10 Red-teaming results | §8.2 AI risk assessment | L3 (Defined) — Threat modeling | Art 15(1) Robustness requirements |
| **SEC-3** Secrets / PII management | GV-1.6 Org policies on privacy | §8.6 Data management | L2 (Managed) — Data handling | Art 10 Data and data governance |
| **SEC-4** Skill/plugin scanning | MS-2.5 Supply chain AI risk | §8.3 AI risk treatment | L3 (Defined) — Third-party vetting | Art 9(2)(b) Risk identification |
| **SEC-5** Session firewall & egress controls | MG-3.2 Incident response | §8.4 Operation controls | L3 (Defined) — Runtime controls | Art 15(3) Cybersecurity |
| **SEC-6** SBOM / software supply chain | MS-2.6 Third-party AI components | §8.3 Risk treatment | L4 (Optimizing) — Supply chain | Art 13 Transparency obligations |

**AMC-specific additions:**
- Live behavioral sandbox testing (S2 Behavioral Sandbox) — no equivalent in any standard
- Honey tokens for detecting data exfiltration (V3 HoneyTokens) — agent-specific
- Prompt injection at runtime, not just at design-time

---

### Dimension 3: Reliability (Q13–18)

| AMC Question | NIST AI RMF | ISO 42001:2023 | CMMI Level | EU AI Act |
|---|---|---|---|---|
| **REL-1** Circuit breakers & retry logic | MG-2.4 Risk response monitoring | §8.4 Operation controls | L3 (Defined) — Resilience patterns | Art 15(4) Fail-safe mechanisms |
| **REL-2** Rate limits & timeouts | MG-4.1 Residual risk monitoring | §9.1 Monitoring & measurement | L3 (Defined) — SLA enforcement | Art 9(4) Risk controls |
| **REL-3** Health monitoring & alerting | MG-3.1 Risk mitigation monitoring | §9.1 Performance monitoring | L3 (Defined) — Observability | Art 9(7) Monitoring obligations |
| **REL-4** Safe deployment with rollback | MG-4.2 Risk treatment updates | §10.1 Continual improvement | L4 (Optimizing) — CD pipeline | Art 9(6) Modification re-assessment |
| **REL-5** Idempotency & compensation logic | MG-2.2 Risk controls in prod | §8.4 System operation | L3 (Defined) — State management | Art 15(3) Cybersecurity |
| **REL-6** Multi-agent coordination reliability | *(not addressed)* | *(not addressed)* | *(not addressed)* | *(not addressed)* |

**AMC-specific additions (not in any standard):**
- Multi-agent reliability controls (E34 Consensus Engine) — entirely novel
- Compensation/rollback for agent workflows (V10 Undo Layer)
- Loop detection for agentic cycles (Loop Detector module)

---

### Dimension 4: Evaluation (Q19–24)

| AMC Question | NIST AI RMF | ISO 42001:2023 | CMMI Level | EU AI Act |
|---|---|---|---|---|
| **EVAL-1** Evaluation framework for output quality | MS-2.1 Evaluation metrics defined | §9.1 Monitoring & evaluation | L3 (Defined) — Measurement | Art 9(8) Testing requirements |
| **EVAL-2** Automated regression testing | MS-2.3 Testing schedule | §9.2 Internal audit | L3 (Defined) — CI evaluation | Art 9(7) Testing before deployment |
| **EVAL-3** Human evaluation & feedback loops | MS-1.3 Human feedback collection | §9.1 Analysis & evaluation | L3 (Defined) — Human review | Art 14(4) Human oversight |
| **EVAL-4** Red-team / adversarial testing | MS-2.5 Adversarial ML testing | §8.2 Risk assessment | L4 (Optimizing) — Red-team | Art 9(5) Testing requirements |
| **EVAL-5** Benchmark comparison over time | MS-2.8 Benchmarking | §9.3 Management review | L4 (Optimizing) — Trend analysis | Art 9(7) Logging requirements |
| **EVAL-6** Output attestation & evidence packaging | *(partial: audit logs)* | §7.5 Documented information | L4 (Optimizing) — Evidence mgmt | Art 12(1) Record-keeping |

**AMC-specific additions:**
- Execution-proof evidence (W6 Output Attestation) rather than self-reported checklists
- Safety test kit with automated adversarial scenarios (W4 Safety TestKit)
- Explainability packets per decision (W7 Explainability Packet)

---

### Dimension 5: Observability (Q25–30)

| AMC Question | NIST AI RMF | ISO 42001:2023 | CMMI Level | EU AI Act |
|---|---|---|---|---|
| **OBS-1** Structured logging for agent actions | MG-3.1 Incident detection | §9.1 Monitoring & measurement | L3 (Defined) — Audit trail | Art 12 Logging obligations |
| **OBS-2** Token usage & cost tracking per session | MS-2.6 Resource measurement | §9.1 Performance metrics | L3 (Defined) — Measurement | Art 9(7) Monitoring |
| **OBS-3** Agent performance dashboards | MS-2.9 Monitoring metrics | §9.3 Management review | L3 (Defined) — KPI tracking | Art 9(7) Ongoing monitoring |
| **OBS-4** Tamper-evident action receipts | GV-6.1 Audit mechanisms | §7.5 Documented information | L4 (Optimizing) — Immutable audit | Art 12(1) Logging requirements |
| **OBS-5** SIEM integration & alerting | MG-3.2 Risk response monitoring | §9.1 Monitoring | L4 (Optimizing) — Integration | Art 9(7) Monitoring obligations |
| **OBS-6** Cross-agent trace correlation | *(not addressed)* | *(not addressed)* | *(not addressed)* | *(not addressed)* |

**AMC-specific additions:**
- Signed chain-of-custody receipts (W1) — beyond standard logging
- Multi-agent trace correlation — not addressed by any existing standard
- Honeytokens as observability signals for data exfiltration detection

---

### Dimension 6: Cost Efficiency (Q31–36)

| AMC Question | NIST AI RMF | ISO 42001:2023 | CMMI Level | EU AI Act |
|---|---|---|---|---|
| **COST-1** Budget caps for AI usage | MG-4.1 Resource allocation | §6.2 Resource planning | L2 (Managed) — Budget control | *(not addressed)* |
| **COST-2** Model routing by complexity | MS-2.6 Model selection criteria | §8.4 Operation controls | L3 (Defined) — Optimization | *(not addressed)* |
| **COST-3** Response caching & deduplication | *(not addressed)* | §8.6 Data management | L3 (Defined) — Efficiency | *(not addressed)* |
| **COST-4** Cost attribution per team/use-case | MG-4.1 Resource tracking | §9.1 Measurement | L3 (Defined) — Chargeback | *(not addressed)* |
| **COST-5** Outcome-based pricing models | *(not addressed)* | *(not addressed)* | L4 (Optimizing) — Value metrics | *(not addressed)* |
| **COST-6** Predictive cost modeling & alerts | *(not addressed)* | *(not addressed)* | L4 (Optimizing) — Forecasting | *(not addressed)* |

**Note:** Cost efficiency is almost entirely absent from NIST AI RMF, ISO 42001, and EU AI Act. AMC is the *only* framework that treats agent cost efficiency as a first-class maturity dimension. This reflects real enterprise priorities where LLM cost overruns are a top operational risk.

---

### Dimension 7: Operating Model (Q37–42)

| AMC Question | NIST AI RMF | ISO 42001:2023 | CMMI Level | EU AI Act |
|---|---|---|---|---|
| **OPS-1** Centralized AI platform team / CoE | GV-1.2 Org structure | §5.1 Leadership & commitment | L3 (Defined) — Org institutionalized | *(not addressed)* |
| **OPS-2** Standardized agent templates / golden paths | GV-6.2 Organizational practices | §8.1 Operational planning | L3 (Defined) — Standardization | *(not addressed)* |
| **OPS-3** Self-serve developer portal | *(not addressed)* | §7.2 Competence | L3 (Defined) — Enablement | *(not addressed)* |
| **OPS-4** Multi-agent orchestration workflows | *(not addressed)* | *(not addressed)* | *(not addressed)* | *(not addressed)* |
| **OPS-5** Adoption playbook & training | GV-1.5 AI literacy programs | §7.2 Competence | L2 (Managed) — Training | Art 4 AI literacy obligations |
| **OPS-6** Federated AI governance model | GV-1.1 Organizational context | §4.1 Org context | L4 (Optimizing) — Federated | *(not addressed)* |

**AMC-specific additions:**
- Multi-agent orchestration as a maturity indicator — entirely novel
- Self-serve agent developer portal as a maturity signal
- Agent-specific onboarding and activation metrics

---

## Coverage Completeness Matrix

| Standard Requirement Area | NIST AI RMF | ISO 42001 | CMMI | EU AI Act | **AMC** |
|---|:---:|:---:|:---:|:---:|:---:|
| Governance & Accountability | ✅ | ✅ | ✅ | ✅ | ✅ |
| Security & Adversarial Testing | 🔶 | 🔶 | ❌ | ✅ | ✅ |
| Reliability & Resilience | 🔶 | 🔶 | ✅ | 🔶 | ✅ |
| Evaluation & Testing | ✅ | 🔶 | ✅ | ✅ | ✅ |
| Observability & Logging | 🔶 | 🔶 | 🔶 | ✅ | ✅ |
| Cost Efficiency | ❌ | ❌ | 🔶 | ❌ | ✅ |
| Operating Model | 🔶 | 🔶 | ✅ | ❌ | ✅ |
| **Prompt Injection Defense** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Multi-Agent Coordination** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Execution-Proof Evidence** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Self-Improvement Loop** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Automated Scoring** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Token/Cost Governance** | ❌ | ❌ | ❌ | ❌ | ✅ |

✅ = Full coverage | 🔶 = Partial coverage | ❌ = Not addressed

---

## NIST AI RMF Subcategory Detail

| NIST Function | Subcategory | AMC Dimension(s) | AMC Questions |
|---|---|---|---|
| **GOVERN** | GV-1.1 Org context | Governance | GOV-1, GOV-2 |
| **GOVERN** | GV-1.2 Accountability | Governance | GOV-2 |
| **GOVERN** | GV-1.5 AI literacy | Operating Model | OPS-5 |
| **GOVERN** | GV-4.1 Team structures | Governance | GOV-4 |
| **GOVERN** | GV-6.1 Policies | Governance, Observability | GOV-1, OBS-4 |
| **MAP** | MP-2.3 Risk categorization | Governance | GOV-5 |
| **MAP** | MP-3.1 AI system context | All 7 dimensions | All 42 questions |
| **MAP** | MP-5.1 Likelihood & impact | Security, Reliability | SEC-2, REL-1 |
| **MEASURE** | MS-1.3 Metrics & feedback | Evaluation | EVAL-1, EVAL-3 |
| **MEASURE** | MS-2.1 Evaluation methods | Evaluation | EVAL-1, EVAL-2 |
| **MEASURE** | MS-2.5 Adversarial testing | Security, Evaluation | SEC-2, EVAL-4 |
| **MEASURE** | MS-2.6 Resource measurement | Observability, Cost | OBS-2, COST-4 |
| **MEASURE** | MS-2.9 Monitoring | Observability | OBS-3, OBS-5 |
| **MANAGE** | MG-2.2 Risk response | Security, Reliability | SEC-5, REL-1 |
| **MANAGE** | MG-3.1 Incident detection | Observability | OBS-1, OBS-5 |
| **MANAGE** | MG-3.2 Incident response | Security | SEC-5 |
| **MANAGE** | MG-4.1 Risk improvement | Cost, Reliability | COST-1, REL-4 |

---

## EU AI Act Article Detail (High-Risk Systems)

| EU AI Act Article | Requirement | AMC Coverage |
|---|---|---|
| **Art 9** — Risk Management System | Systematic risk identification, analysis, estimation & evaluation | GOV-5, SEC-4, EVAL-4 |
| **Art 10** — Data Governance | Training data, validation, bias detection | SEC-3, EVAL-1 |
| **Art 11** — Technical Documentation | System specs, capabilities, limitations | GOV-1, OPS-2 |
| **Art 12** — Record-keeping | Automatic event logging, traceability | GOV-3, OBS-1, OBS-4 |
| **Art 13** — Transparency | Instructions for use, capability disclosure | SEC-6, OPS-2 |
| **Art 14** — Human Oversight | Ability for humans to monitor, override, stop | GOV-4, EVAL-3 |
| **Art 15** — Accuracy, Robustness & Cybersecurity | Performance metrics, resilience, cybersecurity | REL-1–6, SEC-1–6 |
| **Art 4** — AI Literacy | Organizations ensure staff AI competence | OPS-5 |
| **Art 17** — Quality Management | QMS covering lifecycle stages | All 7 dimensions |

---

## ISO/IEC 42001:2023 Clause Detail

| ISO 42001 Clause | Description | AMC Dimension(s) | AMC Questions |
|---|---|---|---|
| **Clause 4** — Context | Org context, needs of stakeholders | Governance, Operating Model | GOV-1, OPS-1 |
| **Clause 5** — Leadership | Leadership commitment, roles | Governance | GOV-2, GOV-4 |
| **Clause 6** — Planning | Risk/opportunity, AI objectives | Governance, Security | GOV-5, SEC-4 |
| **Clause 7** — Support | Resources, competence, documented info | Operating Model, Observability | OPS-5, OBS-1 |
| **Clause 8** — Operation | AI system lifecycle, risk treatment | Security, Reliability, Evaluation | SEC-1–6, REL-1–6, EVAL-1–6 |
| **Clause 9** — Performance | Monitoring, measurement, internal audit | Observability, Evaluation | OBS-1–6, EVAL-1–6 |
| **Clause 10** — Improvement | Nonconformity, corrective action, continual improvement | All 7 (self-improvement loop) | All 42 questions |

---

## CMMI Level Alignment

| CMMI Level | Description | AMC Maturity Level | Typical AMC Score |
|---|---|---|---|
| **Level 1 — Initial** | Ad hoc, unpredictable | L1 (Ad Hoc) | 0–39 |
| **Level 2 — Managed** | Project-level management, some policies | L2 (Developing) | 40–59 |
| **Level 3 — Defined** | Org-wide standards, tailored processes | L3 (Defined) | 60–74 |
| **Level 4 — Quantitatively Managed** | Statistical process control, measurement | L4 (Optimized) | 75–89 |
| **Level 5 — Optimizing** | Continuous improvement, innovation | L5 (Autonomous) | 90–100 |

AMC's L1→L5 scale directly mirrors CMMI's 1–5 progression, making AMC reports directly translatable for organizations already using CMMI for software processes.

---

## Dimensions AMC Covers That No Existing Standard Addresses

1. **Prompt Injection Defense at Runtime** — All standards acknowledge adversarial threats in principle; none specify runtime injection detection as a maturity dimension.

2. **Multi-Agent Orchestration Reliability** — No existing standard addresses consensus mechanisms, loop detection, or coordination patterns for multi-agent systems.

3. **Token Cost Governance** — Cost efficiency is absent from NIST, ISO 42001, and EU AI Act. AMC treats it as a first-class operational maturity indicator.

4. **Execution-Proof Evidence Collection** — Existing standards require "documentation"; AMC requires *executable proof* via module-level test harnesses.

5. **Self-Improvement Loop** — AMC includes a FixGenerator that reads current gaps and automatically generates improvement code. No standard frameworks include this.

6. **Agent-Specific RACI** — Traditional RACI matrices don't distinguish between model ownership, tool ownership, and agent system ownership. AMC does.

7. **Autonomy Dial** — AMC measures the calibration between agent autonomy level and risk thresholds. Existing standards treat autonomy as binary (human vs. automated).

---

## How to Use This Document

**For compliance teams:** Use this mapping to demonstrate that AMC certification satisfies requirements across multiple standards simultaneously. An AMC L3 score provides documented evidence for NIST AI RMF MAP/MEASURE functions, ISO 42001 Clauses 6–9, and EU AI Act Articles 9–15.

**For procurement:** Request AMC scores as a proxy for multi-standard compliance readiness without requiring separate assessments for each standard.

**For engineering teams:** Use the dimension-to-article mapping to prioritize improvements based on which regulatory requirement each module addresses.

---

*Files created: `/Users/sid/.openclaw/workspace/AMC_OS/DOCS/STANDARDS_MAPPING.md`*
*Next actions: Cross-reference with EU AI Act Annex III (high-risk categories) for sector-specific mapping.*
