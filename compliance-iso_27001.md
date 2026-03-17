# AMC Compliance Report (ISO_27001)

- Agent: default
- Window: 2026-02-15T06:58:12.213Z -> 2026-03-17T06:58:12.213Z
- Config trusted: NO (compliance maps missing)
- Trust coverage: OBSERVED 0.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage score: 30.0% (S:0 P:3 M:2 U:0)

## Categories

### Access Control (PARTIAL)

Signals for least-privilege access and approval gates.

Deterministic reasons:
- No evidence events found for types: audit, tool_action
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events with OBSERVED trust tier
- No additional evidence required for this requirement

### Logging & Monitoring (MISSING)

Signals for traceability and operational telemetry.

Deterministic reasons:
- No evidence events found for types: audit, metric, llm_request, llm_response
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, metric, llm_request, llm_response events with OBSERVED trust tier

### Incident Management (PARTIAL)

Signals for drift/regression response and controlled recovery.

Deterministic reasons:
- No evidence events found for types: audit
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit events with OBSERVED trust tier
- No additional evidence required for this requirement

### Supplier Security (PARTIAL)

Signals for upstream/provider route governance and provenance controls.

Deterministic reasons:
- No evidence events found for types: llm_request, llm_response, audit
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture llm_request, llm_response, audit events with OBSERVED trust tier
- No additional evidence required for this requirement

### Risk Management (MISSING)

Signals for proactive risk analysis and governance-driven decisions.

Deterministic reasons:
- No evidence events found for types: audit, metric
- Assurance pack 'duality' not found in window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, metric events with OBSERVED trust tier
- Run assurance pack 'duality' with score >= 75

## Non-Claims
- This report provides evidence-backed signals only; it is not legal advice.
- Controls not represented in verified AMC evidence are marked as UNKNOWN/MISSING.
- Owner attestations must be explicitly signed and are not inferred automatically.
