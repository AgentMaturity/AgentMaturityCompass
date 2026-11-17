# AMC × MITRE ATLAS Mapping

> Full matrix coverage: how AMC's maturity framework detects, prevents, and measures resilience against every MITRE ATLAS tactic.

**Version:** 1.0
**Date:** 2026-03-11
**Standard:** MITRE ATLAS v4.x (Adversarial Threat Landscape for AI Systems)

---

## Overview

[MITRE ATLAS](https://atlas.mitre.org/) catalogs adversarial tactics and techniques targeting AI/ML systems. This document maps each ATLAS tactic to AMC's coverage — which dimensions, diagnostic questions, evidence checks, and assurance packs address the threat.

AMC's advantage: it doesn't trust self-reported security claims. The Execution-Proof Evidence System (EPES) observes actual agent behavior under adversarial conditions, making ATLAS-style attacks measurable rather than theoretical.

---

## Mapping Legend

| Symbol | Meaning |
|--------|---------|
| ✅ **Direct** | AMC dimension explicitly measures this tactic |
| 🔶 **Indirect** | AMC dimension contributes but doesn't target it directly |
| ⬜ **Gap** | Limited or no current coverage — improvement opportunity |

---

## Tactic 1: Reconnaissance (AML.TA0001)

**What it is:** Adversary gathers information about the target AI system — model architecture, training data sources, API endpoints, deployment infrastructure, version info, error messages.

**Why it matters for agents:** AI agents expose attack surface through tool descriptions, system prompts, error verbosity, and behavioral fingerprinting. Reconnaissance is the precursor to every other tactic.

### AMC Coverage

| AMC Dimension | Coverage | How |
|---------------|----------|-----|
| **Governance** (D1) | ✅ Direct | Q17: Data handling policies, prompt/automation guardrails. Q18: Access control via roles/least privilege. Policy-as-code gates prevent information leakage through misconfigured endpoints. |
| **Safety** (D2) | ✅ Direct | Threat models and abuse cases mapped to controls. Runtime guardrails restrict what agents disclose about their own architecture. Kill-switch capability limits exposure window. |
| **Observability** (D5) | 🔶 Indirect | Structured logs and traceability detect anomalous probing patterns. Alert quality metrics can surface reconnaissance attempts. Forensic readiness enables post-incident analysis of recon activity. |
| **Operating Model** (D7) | 🔶 Indirect | On-call model and escalation paths ensure recon detection leads to response. Runbooks for security incidents cover information-gathering attacks. |

### Key AMC Evidence Checks
- **Trust Boundary Model:** Agent boundary treats all agent-provided information as untrusted. Prevents agents from voluntarily disclosing architecture details.
- **Error message controls:** AMC's gateway proxy can observe whether agents leak model/system information in error responses.
- **EPES Observation:** Gateway-level observation detects if agents respond to reconnaissance prompts with architecture details.

### Relevant Assurance Packs
- `adversarial-robustness` — Tests agent response to probing/information extraction attempts
- `context-leakage` — Detects unintended disclosure of system internals
- `operational-discipline` — Verifies agents follow information handling policies under pressure

### AMC Questions (Domain E: Governance, Risk & Security)
- Q17: Policies for data handling, model/tool usage, prompt/automation guardrails
- Q18: Access control managed via roles/least privilege
- Q19: Review/approval checkpoints for high-risk outputs
- Q20: Incident/error/policy violation tracking with corrective action loops

---

## Tactic 2: Resource Development (AML.TA0002)

**What it is:** Adversary establishes resources to support operations — training adversarial models, acquiring infrastructure, developing tools, crafting adversarial inputs, building shadow models for transfer attacks.

**Why it matters for agents:** Attackers develop surrogate models to craft transfer attacks, build prompt injection payloads, create poisoned plugins/tools, or establish infrastructure for model extraction via repeated queries.

### AMC Coverage

| AMC Dimension | Coverage | How |
|---------------|----------|-----|
| **Governance** (D1) | 🔶 Indirect | Policy controls and change approval processes limit what resources can be introduced into the agent ecosystem. Supply-chain boundary checks detect unauthorized artifacts. |
| **Safety** (D2) | ✅ Direct | Red-team/adversarial test results verify that transfer attacks and crafted inputs are detected. Runtime guardrails block execution of adversarial payloads. |
| **Evaluation** (D4) | ✅ Direct | Versioned benchmark sets include adversarial coverage. Pre/post release gate reports verify resilience to known attack tooling. Calibration monitoring detects when adversarial capability shifts. |
| **Cost** (D6) | 🔶 Indirect | Anomaly detection on API usage patterns surfaces resource development activity (e.g., systematic probing for model extraction). Budget guardrails limit exposure to query-based attacks. |

### Key AMC Evidence Checks
- **Supply-Chain Boundary:** AMC's artifact verification prevents tampered plugins, packs, or bundles from being accepted as trusted inputs.
- **Cryptographic Binding:** Signed artifacts at point of collection prevent retroactive injection of adversarial resources.
- **Anti-Gaming (84-point gap):** EPES specifically detects when claimed defenses don't match execution reality — the same gap attackers exploit when building attack resources against falsely-confident targets.

### Relevant Assurance Packs
- `supply-chain-integrity` — Verifies artifact provenance and tamper resistance
- `adversarial-robustness` — Tests resilience to transfer attacks and adversarial inputs

### AMC Questions
- Q17: Policies for model/tool usage and guardrails
- Q19: Review checkpoints for high-risk outputs (catches adversarial resources at intake)
- Q14: Automation reliability and observability (detects unauthorized resource integration)

---

## Tactic 3: Initial Access (AML.TA0003)

**What it is:** Adversary gains initial foothold — prompt injection, API exploitation, compromised ML supply chain, valid credential theft, social engineering of operators, exploiting public-facing ML endpoints.

**Why it matters for agents:** Agents are especially vulnerable here. Prompt injection (direct and indirect), tool-use exploitation, plugin compromise, and credential theft through conversation manipulation are all initial access vectors unique to AI agents.

### AMC Coverage

| AMC Dimension | Coverage | How |
|---------------|----------|-----|
| **Governance** (D1) | ✅ Direct | Q18: Access control via least privilege. Policy-as-code enforcement gates. Exception process with expiry prevents permanent access grants. Approval workflows for elevated actions. |
| **Safety** (D2) | ✅ Direct | Threat models map initial access vectors to controls. Red-team testing verifies prompt injection defenses. Runtime guardrails (policy checks, tool restrictions, fail-safe defaults) block exploitation. Sensitive action controls with approval thresholds. |
| **Reliability** (D3) | 🔶 Indirect | Circuit breaking and controlled degradation limit blast radius after initial access. Deterministic tests for critical paths verify that access controls work under degraded conditions. |
| **Observability** (D5) | ✅ Direct | End-to-end traceability detects unauthorized access patterns. Alert quality metrics surface initial access attempts. Forensic readiness (hash-chained logs, retention) preserves evidence chain. |
| **Operating Model** (D7) | 🔶 Indirect | On-call/escalation paths ensure access anomalies trigger response. Release/canary practices limit exposure of new attack surfaces. |

### Key AMC Evidence Checks
- **Trust Boundary Model:** Five explicit trust boundaries (Agent, Gateway, Vault, Notary, Hardened) — each crossing requires authentication and produces a signed record.
- **EPES Tiered Evidence:** Self-reported security claims capped. Only observed/hardened evidence counts toward showing that access controls work.
- **Gateway Observation:** AMC's gateway proxy sits between agent and external services, observing all interactions. Initial access attempts are visible at this boundary.
- **Temporal Verification:** Evidence timestamps cross-referenced against observation windows. Claims outside observed execution periods flagged — detects post-compromise evidence fabrication.

### Relevant Assurance Packs
- `adversarial-robustness` — TAP/PAIR multi-turn prompt injection, crescendo/skeleton key escalation
- `multi-turn-safety` — Tests persistent injection across conversation turns
- `context-leakage` — Detects credential/context extraction through conversation
- `supply-chain-integrity` — Plugin/tool compromise detection

### AMC Questions
- Q17: Data handling policies, prompt/automation guardrails
- Q18: Access control via roles/least privilege, reviewed regularly
- Q19: Review/approval checkpoints for high-risk outputs
- Q20: Incident tracking with corrective action loops

---

## Tactic 4: ML Attack Staging (AML.TA0004)

**What it is:** Adversary prepares within the compromised environment — poisoning training data, backdooring models, manipulating feature stores, corrupting RAG knowledge bases, staging artifacts for later exploitation.

**Why it matters for agents:** Agents that learn, fine-tune, or use retrieval-augmented generation are vulnerable to knowledge base poisoning, memory manipulation, and staged tool responses that alter future behavior.

### AMC Coverage

| AMC Dimension | Coverage | How |
|---------------|----------|-----|
| **Governance** (D1) | ✅ Direct | Versioned policy controls and change approvals detect unauthorized modifications. Decision logs link changes to outcomes — unauthorized staging leaves a gap. Audit trail for overrides. |
| **Safety** (D2) | ✅ Direct | Abuse cases mapped to controls include data/knowledge poisoning. Red-team testing covers staged attack scenarios. Runtime guardrails detect behavioral shifts from poisoned inputs. |
| **Evaluation** (D4) | ✅ Direct | Drift monitoring detects model/behavior shifts from staged attacks. Pre/post release gate reports catch poisoned artifacts before deployment. Regression detection is timely — staged changes that alter behavior trigger alerts. |
| **Observability** (D5) | ✅ Direct | Structured logs with consistent IDs trace data lineage. End-to-end traceability across agents/tools/pipelines surfaces unauthorized modifications. Hash-chained logs make later edits to staging records detectable. |

### Key AMC Evidence Checks
- **Cryptographic Foundation (Ed25519 + Merkle Trees):** Every evidence artifact is signed. Merkle tree append-only logs mean any tampering with historical records breaks the chain. Staged poisoning of evidence is cryptographically detectable.
- **Structural Analysis:** EPES analyzes whether evidence is structurally consistent with genuine behavior — bulk-generated artifacts, timing anomalies, and pattern inconsistencies are flagged.
- **Evidence Decay:** Recent evidence weighted higher. Stale scores flagged. Prevents attackers from relying on old clean evidence while staging current attacks.

### Relevant Assurance Packs
- `adversarial-robustness` — CPA-RAG/MCP attacks specifically target RAG poisoning and tool manipulation
- `supply-chain-integrity` — Detects tampered artifacts entering the pipeline
- `operational-discipline` — Verifies agents maintain behavioral contracts even when environment is manipulated

### AMC Questions
- Q9: Reliability of source-of-truth data (detects poisoned data sources)
- Q10: Completeness and consistency of critical data fields
- Q17: Guardrails for data handling and model usage
- Q20: Error/violation tracking with corrective action loops

---

## Tactic 5: ML Model Access (AML.TA0005)

**What it is:** Adversary gains access to the ML model itself — full model theft, API-based model extraction through query patterns, inference API abuse, accessing model weights/parameters, reverse-engineering model behavior through systematic probing.

**Why it matters for agents:** Agent models represent significant IP. API-based extraction through systematic querying, behavioral cloning through conversation analysis, and direct weight theft through infrastructure compromise are all real risks.

### AMC Coverage

| AMC Dimension | Coverage | How |
|---------------|----------|-----|
| **Governance** (D1) | ✅ Direct | Access control (Q18) with least privilege prevents unauthorized model access. Policy enforcement gates protect model endpoints. Change approval processes cover model deployment. |
| **Safety** (D2) | ✅ Direct | Threat models cover model theft vectors. Runtime guardrails limit query patterns that enable extraction. Sensitive action controls gate model access. |
| **Cost** (D6) | ✅ Direct | Unit economics tracking (cost per request) detects extraction through anomalous query volume. Budget guardrails and anomaly detection surface systematic probing. Automated breach response limits extraction window. |
| **Observability** (D5) | ✅ Direct | End-to-end traceability tracks all model queries. Alert precision detects extraction patterns (high-volume, systematic, boundary-probing queries). Forensic readiness preserves evidence for post-incident analysis. |

### Key AMC Evidence Checks
- **Gateway Boundary:** AMC's gateway proxy observes all interactions between agent and external services. Systematic extraction queries are visible and measurable at this layer.
- **Key Management:** Vault-based signing key storage with rotation and compromise recovery. Model access requires authenticated requests — compromise of one key type doesn't compromise others.
- **Trust Boundary Model:** Network boundary prevents unauthorized API access. CIDR allowlists, auth sessions, and route-level checks.
- **Rate Limiting:** Built-in rate limiters on auth/write/health endpoint classes limit extraction throughput.

### Relevant Assurance Packs
- `adversarial-robustness` — Tests model extraction resistance
- `context-leakage` — EchoLeak/Garak probes for unintended model information disclosure
- `operational-discipline` — Verifies access controls function under sustained probing

### AMC Questions
- Q18: Access control via roles/least privilege, reviewed regularly
- Q14: Automations reliable and observable (alerts, logs, ownership)
- Q13: System integration quality (secure API boundaries)
- Q20: Incident tracking with corrective action loops

---

## Tactic 6: Exfiltration (AML.TA0006)

**What it is:** Adversary extracts valuable data — training data extraction, PII leakage, proprietary knowledge theft, model memorization exploitation, conversation history theft, credential harvesting through agent interactions.

**Why it matters for agents:** Agents handle sensitive data in conversations, tool calls, and memory. Training data memorization, context window leakage, and tool-mediated data exfiltration are acute risks.

### AMC Coverage

| AMC Dimension | Coverage | How |
|---------------|----------|-----|
| **Governance** (D1) | ✅ Direct | Q17: Data handling policies enforce what agents can disclose. Q18: Least privilege limits data access scope. Q19: Approval checkpoints for high-risk outputs catch exfiltration attempts at decision points. |
| **Safety** (D2) | ✅ Direct | Runtime guardrails block data disclosure. Kill-switch capability stops active exfiltration. Sensitive action controls with approval thresholds gate data-touching operations. Red-team testing covers extraction attempts. |
| **Observability** (D5) | ✅ Direct | Structured logging captures all data flows. End-to-end traceability across tools/pipelines detects unauthorized data movement. Alert quality metrics surface exfiltration patterns. Hash-chained logs make a cover-up detectable. |
| **Reliability** (D3) | 🔶 Indirect | Controlled degradation modes limit data exposure during failures. Circuit breaking prevents cascading data leaks. |
| **Operating Model** (D7) | 🔶 Indirect | Incident response runbooks cover data breach scenarios. Cross-functional rituals (eng + risk + ops) ensure exfiltration events get multi-perspective response. |

### Key AMC Evidence Checks
- **EPES Observation:** Gateway proxy observes all agent outputs. Data leaving through conversation, tool calls, or API responses is visible and auditable.
- **Cryptographic Binding:** Signed evidence chain records what data was accessed and when. Non-repudiation prevents denial of data handling.
- **Anti-Gaming:** Tiered evidence weighting means agents can't claim data protection without demonstrating it under observation. The 84-point gap specifically catches agents that claim data controls but don't enforce them.
- **Trust Boundary Model:** Every boundary crossing (agent→gateway, gateway→external) is authenticated and signed. Unauthorized data movement creates traceable anomalies.

### Relevant Assurance Packs
- `context-leakage` — Primary pack: EchoLeak/Garak techniques for detecting unintended data disclosure
- `adversarial-robustness` — Tests data extraction resistance under adversarial pressure
- `multi-turn-safety` — Detects gradual data extraction across conversation turns

### AMC Questions
- Q17: Data handling policies and guardrails
- Q18: Access control and least privilege
- Q19: Review checkpoints for high-risk outputs
- Q9: Source-of-truth data reliability (protects against extraction from corrupted sources)
- Q12: Dashboard trust (ensures data visibility without over-exposure)

---

## Tactic 7: Impact (AML.TA0007)

**What it is:** Adversary achieves objectives — model degradation, denial of ML service, output manipulation (evasion, targeted misclassification), reputational damage through manipulated outputs, financial impact through corrupted decisions, safety-critical system manipulation.

**Why it matters for agents:** Agent impact attacks include: making agents produce harmful outputs, degrading decision quality, causing agents to take destructive actions, reputational damage through manipulated public-facing behavior, and safety-critical failures in autonomous operations.

### AMC Coverage

| AMC Dimension | Coverage | How |
|---------------|----------|-----|
| **Safety** (D2) | ✅ Direct | Prevention + detection + containment of harmful behavior. Blocking controls tested in production-like runs. Kill-switch/rollback exercised in drills. Measured reduction in unsafe outcomes release-over-release. |
| **Reliability** (D3) | ✅ Direct | SLO/SLI tracking detects degradation. Error budget and release decisions prevent degraded agents from reaching production. Resilience testing (load, chaos, dependency failure). Automated rollback/circuit breaking limits impact duration. |
| **Evaluation** (D4) | ✅ Direct | Pre/post release gates catch output manipulation before deployment. Calibration and drift monitoring detect quality degradation over time. Regression detection is timely and actionable. |
| **Governance** (D1) | ✅ Direct | Incident/error/policy violation tracking (Q20) with corrective action loops. Decision logs link impact events to responses. Exception process ensures impact events get formal review. |
| **Observability** (D5) | ✅ Direct | Fast root-cause analysis from telemetry. Actionable alerts with low noise. Clear linkage between user-impact and internal signals. Hash-chained forensic record. |
| **Cost** (D6) | 🔶 Indirect | Financial impact from corrupted decisions detected through cost anomaly tracking. Budget guardrails limit financial damage. Unit economics reveal impact on value delivery. |
| **Operating Model** (D7) | ✅ Direct | On-call + escalation for rapid impact response. Runbooks for security/impact incidents. Fast learning loops from incidents. Predictable delivery with controlled change failure rate. |

### Key AMC Evidence Checks
- **Full EPES Stack:** Impact is where all of AMC's evidence chain converges. Signed observations record what happened. The Merkle index lets one entry be checked against a signed root. The gateway proxy shows how. Tiered evidence shows whether the defenses worked.
- **Evidence Decay:** Ensures ongoing resilience. Past safety doesn't guarantee current safety. Continuous assessment is incentivized.
- **Compromise Recovery:** Key rotation and revocation mechanisms. Evidence signed by uncompromised keys remains valid even during incident response.
- **Anti-Gaming:** The 84-point gap is the impact tactic's natural enemy. Agents that claim safety controls but don't have them are exactly the agents most vulnerable to impact attacks.

### Relevant Assurance Packs
- `adversarial-robustness` — Full suite: TAP/PAIR, crescendo/skeleton key, CPA-RAG/MCP
- `multi-turn-safety` — Tests output manipulation across extended interactions
- `operational-discipline` — Verifies agents maintain behavioral contracts under attack
- `context-leakage` — Prevents information that enables targeted impact attacks

### AMC Questions
- All Domain E questions (Q17–Q20) — governance/risk/security
- Q14: Automation reliability and observability
- Q19: Review/approval checkpoints for high-risk outputs
- Q20: Incident/error tracking with corrective action loops
- Q25: Workflow KPIs with baselines (detect degradation)
- Q27: Metrics reviewed and translated into updates

---

## Coverage Summary Matrix

| MITRE ATLAS Tactic | D1 Gov | D2 Safety | D3 Reliability | D4 Eval | D5 Observ | D6 Cost | D7 Ops |
|--------------------|--------|-----------|-----------------|---------|-----------|---------|--------|
| Reconnaissance | ✅ | ✅ | ⬜ | ⬜ | 🔶 | ⬜ | 🔶 |
| Resource Development | 🔶 | ✅ | ⬜ | ✅ | ⬜ | 🔶 | ⬜ |
| Initial Access | ✅ | ✅ | 🔶 | ⬜ | ✅ | ⬜ | 🔶 |
| ML Attack Staging | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ | ⬜ |
| ML Model Access | ✅ | ✅ | ⬜ | ⬜ | ✅ | ✅ | ⬜ |
| Exfiltration | ✅ | ✅ | 🔶 | ⬜ | ✅ | ⬜ | 🔶 |
| Impact | ✅ | ✅ | ✅ | ✅ | ✅ | 🔶 | ✅ |

### Coverage Statistics
- **Direct coverage (✅):** 22 / 49 cells (44.9%)
- **Indirect coverage (🔶):** 10 / 49 cells (20.4%)
- **Total coverage:** 32 / 49 cells (65.3%)
- **Gaps (⬜):** 17 / 49 cells (34.7%)

### Strongest AMC Dimensions for ATLAS
1. **Safety (D2)** — Direct coverage across all 7 tactics ✅✅✅✅✅✅✅
2. **Governance (D1)** — Direct coverage on 6/7, indirect on 1
3. **Observability (D5)** — Direct coverage on 5/7, indirect on 1

### Most-Covered Tactics
1. **Impact** — 5 direct, 2 indirect (best-covered tactic)
2. **Initial Access** — 3 direct, 2 indirect
3. **Exfiltration** — 3 direct, 2 indirect

---

## Gap Analysis & Improvement Opportunities

### High-Priority Gaps

| Gap | Affected Tactics | Recommendation |
|-----|-----------------|----------------|
| **Reliability (D3) has limited ATLAS coverage** | Recon, Resource Dev, Staging, Model Access | Add resilience testing scenarios that specifically model adversarial disruption (not just infrastructure failure). Chaos engineering should include adversarial-flavored scenarios. |
| **Evaluation (D4) doesn't cover Recon, Initial Access, Model Access, or Exfiltration** | 4 tactics | Add adversarial evaluation benchmarks: prompt injection test suites, extraction resistance metrics, information leakage scores. Make these part of standard eval gates. |
| **Cost (D6) is underutilized for threat detection** | 5 tactics with gaps | Cost anomaly detection is a powerful signal for recon (probing), resource dev (systematic queries), staging (bulk operations), and exfiltration (data volume). Expand cost monitoring to include security-relevant thresholds. |
| **Operating Model (D7) lacks direct ATLAS mapping** | 4 tactics with gaps | Add adversarial-specific runbooks, red-team exercise cadence, and security-focused retrospectives to operating model requirements. |

### Recommended New Assurance Packs

1. **`reconnaissance-resistance`** — Systematic testing of information disclosure through error messages, tool descriptions, behavioral fingerprinting, and prompt-based probing.
2. **`model-access-defense`** — Query-pattern analysis for extraction detection, rate limiting effectiveness under adversarial load, behavioral cloning resistance metrics.
3. **`cost-anomaly-security`** — Cross-referencing cost signals with security events. Budget breach as a security signal, not just a financial one.

---

## MITRE ATLAS Technique Coverage (Selected High-Impact Techniques)

| ATLAS Technique | ID | AMC Coverage |
|----------------|----|-------------|
| Active Scanning | AML.T0013 | D5 Observability (alert quality), D6 Cost (query anomaly) |
| Develop Adversarial ML Attacks | AML.T0017 | D4 Evaluation (adversarial benchmarks), D2 Safety (red-team) |
| Prompt Injection (Direct) | AML.T0051 | D2 Safety (runtime guardrails), adversarial-robustness pack |
| Prompt Injection (Indirect) | AML.T0051.001 | D2 Safety, multi-turn-safety pack, context-leakage pack |
| Poison Training Data | AML.T0020 | D1 Governance (change approval), D4 Eval (drift detection) |
| Backdoor ML Model | AML.T0018 | D2 Safety (red-team), supply-chain-integrity pack |
| ML Model Inference API Access | AML.T0040 | D1 Governance (access control), D6 Cost (rate anomaly) |
| Exfiltrate via ML Inference API | AML.T0024 | D2 Safety (guardrails), D5 Observability (data flow tracing) |
| Evade ML Model | AML.T0015 | D4 Evaluation (regression detection), D2 Safety (blocking controls) |
| Denial of ML Service | AML.T0029 | D3 Reliability (SLOs, circuit breaking), D7 Ops (runbooks) |
| Erode ML Model Integrity | AML.T0031 | D4 Evaluation (drift monitoring), D2 Safety (postmortems) |

---

## How to Use This Mapping

### For AMC Assessors
- When evaluating an agent's security posture, use this mapping to verify ATLAS tactic coverage
- Score each tactic's coverage based on evidence tier (Observed Hardened > Observed > Attested > Self-Reported)
- Flag gaps as improvement opportunities in the assessment report

### For Agent Operators
- Use the gap analysis to prioritize security investments
- Map your agent's specific threat surface to the relevant ATLAS tactics
- Ensure assurance packs cover your highest-risk tactics

### For Red Teams
- Use the technique coverage table to identify which ATLAS techniques are most/least covered
- Focus red-team exercises on gap areas (D3 Reliability under adversarial conditions, D4 Evaluation blind spots)
- Report findings using AMC dimension language for actionable remediation

---

*This mapping is a living document. As MITRE ATLAS evolves and AMC adds new dimensions, questions, and assurance packs, this matrix should be updated accordingly.*
