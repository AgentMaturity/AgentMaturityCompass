# AMC Compliance Report (PCI_DSS)

- Agent: default
- Window: 2026-02-15T12:23:07.113Z -> 2026-03-17T12:23:07.113Z
- Config trusted: NO (compliance maps missing)
- Trust coverage: OBSERVED 0.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage score: 0.0% (S:0 P:0 M:4 U:0)

## Categories

### Req 7 Restrict Access by Business Need (MISSING)

AI agent access to cardholder data environments must be restricted to least-privilege. All agent actions touching payment data must be logged and verified.

Deterministic reasons:
- No evidence events found for types: tool_action, tool_result
- Assurance pack 'toolMisuse' not found in window
Evidence references:
- none
What would make this SATISFIED?
- Capture tool_action, tool_result events with OBSERVED trust tier
- Run assurance pack 'toolMisuse' with score >= 70

### Req 10 Log and Monitor All Access (MISSING)

All AI agent interactions with payment systems must produce immutable audit logs with timestamps. AMC ledger provides cryptographically signed evidence chains.

Deterministic reasons:
- No evidence events found for types: tool_action, audit
Evidence references:
- none
What would make this SATISFIED?
- Capture tool_action, audit events with OBSERVED trust tier

### Req 6 Develop and Maintain Secure Systems (MISSING)

AI system components must follow secure development practices. Vulnerabilities must be patched and tested via red-team packs.

Deterministic reasons:
- Assurance pack 'injection' not found in window
- No evidence events found for types: test
Evidence references:
- none
What would make this SATISFIED?
- Run assurance pack 'injection' with score >= 70
- Capture test events with OBSERVED trust tier

### Req 11 Test Security Regularly (MISSING)

Regular security testing of AI components. AMC assurance packs provide automated adversarial testing with signed evidence.

Deterministic reasons:
- Assurance pack 'sandbox_boundary' not found in window
Evidence references:
- none
What would make this SATISFIED?
- Run assurance pack 'sandbox_boundary' with score >= 60

## Non-Claims
- This report provides evidence-backed signals only; it is not legal advice.
- Controls not represented in verified AMC evidence are marked as UNKNOWN/MISSING.
- Owner attestations must be explicitly signed and are not inferred automatically.
