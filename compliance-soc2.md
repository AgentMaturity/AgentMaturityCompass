# AMC Compliance Report (SOC2)

- Agent: default
- Window: 2026-02-15T08:54:59.067Z -> 2026-03-17T08:54:59.067Z
- Config trusted: NO (compliance maps missing)
- Trust coverage: OBSERVED 0.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage score: 40.0% (S:0 P:4 M:1 U:0)

## Categories

### Security (PARTIAL)

Signals for preventing unauthorized actions and policy bypass.

Deterministic reasons:
- No evidence events found for types: llm_request, llm_response, tool_action, audit
- Assurance pack 'governance_bypass' not found in window
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture llm_request, llm_response, tool_action, audit events with OBSERVED trust tier
- Run assurance pack 'governance_bypass' with score >= 85
- No additional evidence required for this requirement

### Availability (PARTIAL)

Signals for operational reliability and service continuity.

Deterministic reasons:
- No evidence events found for types: metric, audit, test
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture metric, audit, test events with OBSERVED trust tier
- No additional evidence required for this requirement

### Confidentiality (PARTIAL)

Signals for secret handling, redaction, and data boundary enforcement.

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

### Processing Integrity (MISSING)

Signals for verification discipline and correctness controls.

Deterministic reasons:
- No evidence events found for types: test, audit, metric
- Assurance pack 'hallucination' not found in window
Evidence references:
- none
What would make this SATISFIED?
- Capture test, audit, metric events with OBSERVED trust tier
- Run assurance pack 'hallucination' with score >= 80

### Privacy (PARTIAL)

Signals for consent-aware operations and minimization.

Deterministic reasons:
- No evidence events found for types: audit, review
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, review events with OBSERVED trust tier
- No additional evidence required for this requirement

## Non-Claims
- This report provides evidence-backed signals only; it is not legal advice.
- Controls not represented in verified AMC evidence are marked as UNKNOWN/MISSING.
- Owner attestations must be explicitly signed and are not inferred automatically.
