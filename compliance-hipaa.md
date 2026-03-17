# AMC Compliance Report (HIPAA)

- Agent: default
- Window: 2026-02-15T08:54:59.773Z -> 2026-03-17T08:54:59.773Z
- Config trusted: NO (compliance maps missing)
- Trust coverage: OBSERVED 0.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage score: 25.0% (S:0 P:5 M:5 U:0)

## Categories

### §164.308 Administrative Safeguards (PARTIAL)

Risk analysis, workforce security, information access management, security awareness training, security incident procedures, contingency planning, and evaluation.

Deterministic reasons:
- No evidence events found for types: audit, llm_request, tool_action
- Assurance pack 'governance_bypass' not found in window
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, llm_request, tool_action events with OBSERVED trust tier
- Run assurance pack 'governance_bypass' with score >= 80
- No additional evidence required for this requirement

### §164.312 Technical Safeguards (MISSING)

Access control, audit controls, integrity controls, person or entity authentication, and transmission security for electronic PHI.

Deterministic reasons:
- No evidence events found for types: audit, tool_action
- Assurance pack 'exfiltration' not found in window
- Assurance pack 'pii_detection_leakage' not found in window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events with OBSERVED trust tier
- Run assurance pack 'exfiltration' with score >= 90
- Run assurance pack 'pii_detection_leakage' with score >= 85

### §164.310 Physical Safeguards (PARTIAL)

Facility access controls, workstation use and security, and device and media controls for systems handling PHI.

Deterministic reasons:
- No evidence events found for types: audit
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit events with OBSERVED trust tier
- No additional evidence required for this requirement

### §164.314 Organizational Requirements (MISSING)

Business associate contracts and group health plan requirements for AI systems processing PHI on behalf of covered entities.

Deterministic reasons:
- No evidence events found for types: audit
- Assurance pack 'delegation_trust_chain' not found in window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit events with OBSERVED trust tier
- Run assurance pack 'delegation_trust_chain' with score >= 75

### §164.316 Policies and Documentation (PARTIAL)

Documentation of policies and procedures, retention requirements, and availability of documentation.

Deterministic reasons:
- No evidence events found for types: audit, test
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, test events with OBSERVED trust tier
- No additional evidence required for this requirement

### §164.502-514 Privacy Rule Uses and Disclosures (MISSING)

Minimum necessary standard, de-identification requirements, authorization requirements, and permitted uses and disclosures of PHI by AI agents.

Deterministic reasons:
- Assurance pack 'pii_detection_leakage' not found in window
- Assurance pack 'context_leakage' not found in window
Evidence references:
- none
What would make this SATISFIED?
- Run assurance pack 'pii_detection_leakage' with score >= 90
- Run assurance pack 'context_leakage' with score >= 85

### §164.524 Access to PHI (MISSING)

Individual right of access to inspect and obtain a copy of PHI, including AI-generated health records and inferences.

Deterministic reasons:
- No evidence events found for types: audit, tool_action
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events with OBSERVED trust tier

### §164.528 Accounting of Disclosures (PARTIAL)

Maintain an accounting of disclosures of PHI by AI agents, including automated disclosures and inter-system data sharing.

Deterministic reasons:
- No evidence events found for types: audit
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit events with OBSERVED trust tier
- No additional evidence required for this requirement

### §164.530 Administrative Requirements (MISSING)

Privacy officer designation, training, safeguards, complaint procedures, and sanctions for AI system operators.

Deterministic reasons:
- No evidence events found for types: audit
Evidence references:
- none
What would make this SATISFIED?
- Capture audit events with OBSERVED trust tier

### Breach Notification Rule §164.400-414 (PARTIAL)

Breach discovery, notification to individuals and HHS, and content of breach notifications for AI-related PHI incidents.

Deterministic reasons:
- No evidence events found for types: audit, metric
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, metric events with OBSERVED trust tier
- No additional evidence required for this requirement

## Non-Claims
- This report provides evidence-backed signals only; it is not legal advice.
- Controls not represented in verified AMC evidence are marked as UNKNOWN/MISSING.
- Owner attestations must be explicitly signed and are not inferred automatically.
