# AMC Compliance Report (EU_AI_ACT)

- Agent: default
- Window: 2026-02-15T08:10:58.227Z -> 2026-03-17T08:10:58.227Z
- Config trusted: NO (compliance maps missing)
- Trust coverage: OBSERVED 0.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage score: 33.3% (S:0 P:8 M:4 U:0)

## Categories

### Art. 9 Risk Management (PARTIAL)

Continuous risk management system throughout the AI system lifecycle, including identification, estimation, evaluation, and treatment of risks.

Deterministic reasons:
- No evidence events found for types: audit, metric, review
- Assurance pack 'duality' not found in window
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, metric, review events with OBSERVED trust tier
- Run assurance pack 'duality' with score >= 75
- No additional evidence required for this requirement

### Art. 10 Data Governance (PARTIAL)

Data governance and management practices for training, validation, and testing data sets including quality criteria, bias examination, and gap identification.

Deterministic reasons:
- No evidence events found for types: audit, artifact, review
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, artifact, review events with OBSERVED trust tier
- No additional evidence required for this requirement

### Art. 11 Technical Documentation (MISSING)

Technical documentation drawn up before market placement, kept up to date, and sufficient for conformity assessment (Annex IV structure).

Deterministic reasons:
- No evidence events found for types: artifact, review, audit
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review, audit events with OBSERVED trust tier

### Art. 12 Record-Keeping (PARTIAL)

Automatic logging of events throughout the AI system lifecycle enabling traceability of system functioning.

Deterministic reasons:
- No evidence events found for types: audit, llm_request, llm_response, tool_action, tool_result
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, llm_request, llm_response, tool_action, tool_result events with OBSERVED trust tier
- No additional evidence required for this requirement

### Art. 13 Transparency (MISSING)

Transparency and provision of information to deployers including instructions for use, intended purpose, and known limitations.

Deterministic reasons:
- No evidence events found for types: artifact, review
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review events with OBSERVED trust tier

### Art. 14 Human Oversight (PARTIAL)

Human oversight measures built into the AI system design, enabling effective oversight during use including ability to intervene, override, or stop.

Deterministic reasons:
- No evidence events found for types: audit, tool_action
- Assurance pack 'governance_bypass' not found in window
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events with OBSERVED trust tier
- Run assurance pack 'governance_bypass' with score >= 85
- No additional evidence required for this requirement

### Art. 15 Accuracy Robustness Cybersecurity (PARTIAL)

Appropriate levels of accuracy, robustness, and cybersecurity maintained throughout the lifecycle with resilience against errors, faults, and adversarial attacks.

Deterministic reasons:
- No evidence events found for types: test, metric, audit
- Assurance pack 'injection' not found in window
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture test, metric, audit events with OBSERVED trust tier
- Run assurance pack 'injection' with score >= 80
- No additional evidence required for this requirement

### Art. 17 Quality Management (PARTIAL)

Quality management system ensuring compliance with the regulation including documented policies, design/development procedures, and post-market monitoring.

Deterministic reasons:
- No evidence events found for types: audit, test, metric
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, test, metric events with OBSERVED trust tier
- No additional evidence required for this requirement

### Art. 27 FRIA (MISSING)

Fundamental Rights Impact Assessment completed and maintained for high-risk deployment contexts before putting the system into use.

Deterministic reasons:
- No evidence events found for types: artifact, review, audit
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review, audit events with OBSERVED trust tier

### Art. 72 Post-Market Monitoring (PARTIAL)

Post-market monitoring system established and documented proportionate to the nature and risks of the AI system.

Deterministic reasons:
- No evidence events found for types: metric, audit, test
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture metric, audit, test events with OBSERVED trust tier
- No additional evidence required for this requirement

### Art. 73 Incident Reporting (PARTIAL)

Serious incidents detected, reported to authorities within required timelines, and closed with evidence-backed remediation.

Deterministic reasons:
- No evidence events found for types: audit, tool_action
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events with OBSERVED trust tier
- No additional evidence required for this requirement

### Art. 86 Right to Explanation (MISSING)

Affected persons can obtain clear, meaningful explanations of AI-assisted decisions with contestability and appeal mechanisms.

Deterministic reasons:
- No evidence events found for types: artifact, audit, review
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, audit, review events with OBSERVED trust tier

## Non-Claims
- This report provides evidence-backed signals only; it is not legal advice.
- Controls not represented in verified AMC evidence are marked as UNKNOWN/MISSING.
- Owner attestations must be explicitly signed and are not inferred automatically.
