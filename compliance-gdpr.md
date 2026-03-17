# AMC Compliance Report (GDPR)

- Agent: default
- Window: 2026-02-15T08:10:58.574Z -> 2026-03-17T08:10:58.574Z
- Config trusted: NO (compliance maps missing)
- Trust coverage: OBSERVED 0.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage score: 25.0% (S:0 P:6 M:6 U:0)

## Categories

### Art. 5 Lawfulness Fairness Transparency (MISSING)

Personal data processed lawfully, fairly, and transparently with clear purpose disclosure.

Deterministic reasons:
- No evidence events found for types: artifact, review, audit
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review, audit events with OBSERVED trust tier

### Art. 5 Purpose Limitation (PARTIAL)

Personal data collected for specified, explicit, legitimate purposes and not further processed incompatibly.

Deterministic reasons:
- No evidence events found for types: audit, review
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, review events with OBSERVED trust tier
- No additional evidence required for this requirement

### Art. 5 Data Minimisation (PARTIAL)

Personal data adequate, relevant, and limited to what is necessary for processing purposes.

Deterministic reasons:
- No evidence events found for types: audit, llm_request
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, llm_request events with OBSERVED trust tier
- No additional evidence required for this requirement

### Art. 5 Accuracy (MISSING)

Personal data accurate and kept up to date with inaccurate data erased or rectified without delay.

Deterministic reasons:
- No evidence events found for types: test, metric, audit
- Assurance pack 'hallucination' not found in window
Evidence references:
- none
What would make this SATISFIED?
- Capture test, metric, audit events with OBSERVED trust tier
- Run assurance pack 'hallucination' with score >= 75

### Art. 5 Storage Limitation (MISSING)

Personal data kept in identifiable form no longer than necessary for processing purposes.

Deterministic reasons:
- No evidence events found for types: audit, artifact
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, artifact events with OBSERVED trust tier

### Art. 5 Integrity and Confidentiality (PARTIAL)

Personal data processed securely with protection against unauthorized/unlawful processing and accidental loss.

Deterministic reasons:
- No evidence events found for types: audit, llm_request, llm_response
- Assurance pack 'exfiltration' not found in window
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, llm_request, llm_response events with OBSERVED trust tier
- Run assurance pack 'exfiltration' with score >= 80
- No additional evidence required for this requirement

### Art. 6 Lawful Basis (PARTIAL)

Processing has lawful basis (consent, contract, legal obligation, vital interests, public task, or legitimate interests).

Deterministic reasons:
- No evidence events found for types: artifact, review, audit
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review, audit events with OBSERVED trust tier
- No additional evidence required for this requirement

### Art. 15-22 Data Subject Rights (MISSING)

Data subject rights (access, rectification, erasure, restriction, portability, objection, automated decision-making) are supported.

Deterministic reasons:
- No evidence events found for types: audit, tool_action, artifact
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action, artifact events with OBSERVED trust tier

### Art. 25 Data Protection by Design (MISSING)

Data protection by design and by default with appropriate technical and organizational measures.

Deterministic reasons:
- No evidence events found for types: audit, test, review
- Assurance pack 'exfiltration' not found in window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, test, review events with OBSERVED trust tier
- Run assurance pack 'exfiltration' with score >= 80

### Art. 32 Security of Processing (PARTIAL)

Appropriate technical and organizational security measures including encryption, pseudonymization, and resilience.

Deterministic reasons:
- No evidence events found for types: audit, llm_request, llm_response, tool_action
- Assurance pack 'injection' not found in window
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, llm_request, llm_response, tool_action events with OBSERVED trust tier
- Run assurance pack 'injection' with score >= 80
- No additional evidence required for this requirement

### Art. 33-34 Breach Notification (PARTIAL)

Personal data breaches detected, documented, and notified to supervisory authority and data subjects within required timelines.

Deterministic reasons:
- No evidence events found for types: audit, tool_action
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events with OBSERVED trust tier
- No additional evidence required for this requirement

### Art. 35 DPIA (MISSING)

Data Protection Impact Assessment conducted for high-risk processing with systematic evaluation and mitigation measures.

Deterministic reasons:
- No evidence events found for types: artifact, review, audit
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review, audit events with OBSERVED trust tier

## Non-Claims
- This report provides evidence-backed signals only; it is not legal advice.
- Controls not represented in verified AMC evidence are marked as UNKNOWN/MISSING.
- Owner attestations must be explicitly signed and are not inferred automatically.
