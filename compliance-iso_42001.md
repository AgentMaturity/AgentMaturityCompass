# AMC Compliance Report (ISO_42001)

- Agent: default
- Window: 2026-02-15T06:58:01.806Z -> 2026-03-17T06:58:01.806Z
- Config trusted: NO (compliance maps missing)
- Trust coverage: OBSERVED 0.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage score: 13.6% (S:0 P:3 M:8 U:0)

## Categories

### Clause 4 Context (MISSING)

AIMS context, stakeholder expectations, and boundary definition are documented.

Deterministic reasons:
- No evidence events found for types: review, artifact, audit
Evidence references:
- none
What would make this SATISFIED?
- Capture review, artifact, audit events with OBSERVED trust tier

### Clause 5 Leadership (MISSING)

Leadership commitment, accountability assignment, and governance controls are evidenced.

Deterministic reasons:
- No evidence events found for types: audit, tool_action
- Assurance pack 'governance_bypass' not found in window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events with OBSERVED trust tier
- Run assurance pack 'governance_bypass' with score >= 80

### Clause 6 Planning (MISSING)

Risk/opportunity planning and AI objectives are tracked with measurable controls.

Deterministic reasons:
- No evidence events found for types: audit, metric
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, metric events with OBSERVED trust tier

### Clause 7 Support (MISSING)

Competence, documented information, and support resources are maintained as evidence artifacts.

Deterministic reasons:
- No evidence events found for types: artifact, review
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review events with OBSERVED trust tier

### Clause 8 Operation (PARTIAL)

Operational lifecycle controls and risk treatment are evidence-linked during runtime execution.

Deterministic reasons:
- No evidence events found for types: tool_action, tool_result, audit
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture tool_action, tool_result, audit events with OBSERVED trust tier
- No additional evidence required for this requirement

### Clause 9 Performance Evaluation (MISSING)

Monitoring, measurement, and internal evaluation evidence are continuously produced.

Deterministic reasons:
- No evidence events found for types: metric, test, audit
- Assurance pack 'hallucination' not found in window
Evidence references:
- none
What would make this SATISFIED?
- Capture metric, test, audit events with OBSERVED trust tier
- Run assurance pack 'hallucination' with score >= 75

### Clause 10 Improvement (PARTIAL)

Nonconformity remediation and continual-improvement loops are closed with deterministic evidence.

Deterministic reasons:
- No evidence events found for types: audit, tool_action
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events with OBSERVED trust tier
- No additional evidence required for this requirement

### ISO 42005 Impact Assessment (MISSING)

Impact assessment scope, stakeholder boundary, and foreseeable misuse are captured.

Deterministic reasons:
- No evidence events found for types: artifact, review, audit
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review, audit events with OBSERVED trust tier

### ISO 42005 Impact Assessment (MISSING)

Impact severity, likelihood, and uncertainty are quantified and regularly re-evaluated.

Deterministic reasons:
- No evidence events found for types: metric, audit
Evidence references:
- none
What would make this SATISFIED?
- Capture metric, audit events with OBSERVED trust tier

### ISO 42005 Impact Assessment (MISSING)

Traceability from identified impacts to mitigations and closure evidence is maintained.

Deterministic reasons:
- No evidence events found for types: audit, tool_action, artifact
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action, artifact events with OBSERVED trust tier

### ISO 42006 Conformity Evidence (PARTIAL)

Certification-ready, machine-readable audit evidence packages are generated and verifiable.

Deterministic reasons:
- No evidence events found for types: artifact, audit, test
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, audit, test events with OBSERVED trust tier
- No additional evidence required for this requirement

## Non-Claims
- This report provides evidence-backed signals only; it is not legal advice.
- Controls not represented in verified AMC evidence are marked as UNKNOWN/MISSING.
- Owner attestations must be explicitly signed and are not inferred automatically.
