# AMC Compliance Report (NIST_AI_RMF)

- Agent: default
- Window: 2026-02-15T08:54:59.421Z -> 2026-03-17T08:54:59.421Z
- Config trusted: NO (compliance maps missing)
- Trust coverage: OBSERVED 0.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage score: 25.0% (S:0 P:2 M:2 U:0)

## Categories

### Govern (MISSING)

Signals for governance structures, approvals, and policy enforcement.

Deterministic reasons:
- No evidence events found for types: audit, tool_action, tool_result
- Assurance pack 'governance_bypass' not found in window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action, tool_result events with OBSERVED trust tier
- Run assurance pack 'governance_bypass' with score >= 85

### Map (MISSING)

Signals for context mapping, role boundaries, and risk framing.

Deterministic reasons:
- No evidence events found for types: audit, review
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, review events with OBSERVED trust tier

### Measure (PARTIAL)

Signals for measured quality, integrity, and auditability.

Deterministic reasons:
- No evidence events found for types: metric, test, audit
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture metric, test, audit events with OBSERVED trust tier
- No additional evidence required for this requirement

### Manage (PARTIAL)

Signals for active risk response and remediation loops.

Deterministic reasons:
- No evidence events found for types: audit, tool_action
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events with OBSERVED trust tier
- No additional evidence required for this requirement

## Non-Claims
- This report provides evidence-backed signals only; it is not legal advice.
- Controls not represented in verified AMC evidence are marked as UNKNOWN/MISSING.
- Owner attestations must be explicitly signed and are not inferred automatically.
