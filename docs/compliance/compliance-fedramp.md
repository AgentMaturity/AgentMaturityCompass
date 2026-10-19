# AMC Compliance Report (FEDRAMP)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

- Mappings: experimental: drafted and refuted by AI agents, not signed off by a named expert (D-08 pending). A result for another framework never sets a result here.
- Agent: default
- Window: 2026-09-18T08:36:32.782Z -> 2026-10-18T08:36:32.782Z
- Config trusted: YES
- Trust coverage: OBSERVED 0.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage: not evaluated (0 of 10 categories passed or failed) (S:0 P:0 M:0 N:10 U:0)
- Full hashes remain available in JSON reports: `amc compliance report --json`.

## Status and Evidence Drilldown

- Each category carries five status dimensions (result, evidence, enforcement, review, applicability) and a claim kind, decided from the evidence this report admitted; the claim line under each heading prints them.
- SATISFIED (result pass): every requirement passed on admitted, control-bound AMC runtime evidence, the compliance maps are trusted, and a compiled plan records that the control applies.
- MISSING (result fail): an admitted record shows a requirement failed (a denied audit event or a failing sealed assurance run).
- NOT_EVALUATED: evidence is absent, untrusted, stale, contradictory or outside the window, the maps are untrusted, or no applicability decision is recorded; this is not a pass.
- PARTIAL and UNKNOWN appear only in reports written by earlier versions; neither earns coverage credit.
- Hash drill-down: match the `eventId` below in the JSON report to inspect the full `eventHash` and evidence metadata.

## Categories

### AC Access Control (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Account management, access enforcement, least privilege, session controls, and remote access for AI systems in federal environments.

Deterministic reasons:
- no control-bound evidence for fedramp_access_control in window
- fedramp_access_control-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'exfiltration' in window
- fedramp_access_control-E2: fewer than 1 admitted records in the window
- No sealed assurance run for 'stepup-approval-bypass' in window
- fedramp_access_control-E3: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events bound to 'fedramp_access_control' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'exfiltration' with score >= 90 and *_SUCCEEDED <= 0
- Run assurance pack 'stepup-approval-bypass' with score >= 85 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### AU Audit and Accountability (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Audit event generation, content, storage, review, and protection for AI agent actions in federal information systems.

Deterministic reasons:
- no control-bound evidence for fedramp_audit_accountability in window
- fedramp_audit_accountability-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- fedramp_audit_accountability-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit events bound to 'fedramp_audit_accountability' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### CA Assessment Authorization Monitoring (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Security assessment, system authorization, continuous monitoring, and penetration testing for AI-enhanced federal systems.

Deterministic reasons:
- no control-bound evidence for fedramp_assessment_authorization in window
- fedramp_assessment_authorization-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'governance_bypass' in window
- fedramp_assessment_authorization-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture test, audit events bound to 'fedramp_assessment_authorization' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'governance_bypass' with score >= 85 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### CM Configuration Management (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Baseline configuration, change control, least functionality, and software usage restrictions for AI model and infrastructure.

Deterministic reasons:
- no control-bound evidence for fedramp_config_management in window
- fedramp_config_management-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- fedramp_config_management-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit events bound to 'fedramp_config_management' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### CP Contingency Planning (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Contingency plan, training, testing, backup, recovery, and reconstitution for AI-dependent federal services.

Deterministic reasons:
- no control-bound evidence for fedramp_contingency_planning in window
- fedramp_contingency_planning-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'circuit-breaker-reliability' in window
- fedramp_contingency_planning-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture metric, audit events bound to 'fedramp_contingency_planning' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'circuit-breaker-reliability' with score >= 80 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### IA Identification and Authentication (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

User, device, and service identification and authentication for AI agent endpoints and API consumers.

Deterministic reasons:
- no control-bound evidence for fedramp_identification_authentication in window
- fedramp_identification_authentication-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'agentIdentitySpoofing' in window
- fedramp_identification_authentication-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit events bound to 'fedramp_identification_authentication' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'agentIdentitySpoofing' with score >= 85 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### IR Incident Response (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Incident handling, monitoring, reporting, and assistance for AI-related security incidents in federal systems.

Deterministic reasons:
- no control-bound evidence for fedramp_incident_response in window
- fedramp_incident_response-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- fedramp_incident_response-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, metric events bound to 'fedramp_incident_response' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### RA Risk Assessment (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Security categorization, risk assessment, and vulnerability scanning for AI models, prompts, and tool integrations.

Deterministic reasons:
- no control-bound evidence for fedramp_risk_assessment in window
- fedramp_risk_assessment-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'injection' in window
- fedramp_risk_assessment-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture test, audit events bound to 'fedramp_risk_assessment' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'injection' with score >= 85 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### SC System and Communications Protection (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Application partitioning, information in shared resources, cryptographic protection, and boundary protection for AI system communications.

Deterministic reasons:
- no control-bound evidence for fedramp_system_communications in window
- fedramp_system_communications-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'sandboxBoundary' in window
- fedramp_system_communications-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events bound to 'fedramp_system_communications' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'sandboxBoundary' with score >= 85 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### SI System and Information Integrity (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Flaw remediation, malicious code protection, information handling, memory protection, and software integrity for AI components.

Deterministic reasons:
- no control-bound evidence for fedramp_system_integrity in window
- fedramp_system_integrity-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'sbom-supply-chain' in window
- fedramp_system_integrity-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture test, audit events bound to 'fedramp_system_integrity' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'sbom-supply-chain' with score >= 80 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

## Legal Review Appendix

This appendix is not legal advice. It is an export-ready checklist for qualified legal, compliance, or audit reviewers.

Export packet:
- Markdown report: this file, generated for framework `FEDRAMP`.
- JSON evidence report: `amc compliance report --framework FEDRAMP --json --out compliance-fedramp.json`.
- Evidence drill-down: use the event IDs above to recover full hashes and metadata from the JSON report.
- Reviewer focus: resolve every MISSING and NOT_EVALUATED item before using this report as customer, board, regulator, or audit evidence.

Framework-specific legal-review notes:
- FEDRAMP legal review: confirm framework applicability, role obligations, control scope, evidence sufficiency, and external-claim language with qualified counsel.
- Confirm unresolved controls have owners, target dates, and reviewer-approved remediation or non-applicability rationale.

Reviewer sign-off prompts:
- Is this framework applicable to the agent, deployment context, geography, and customer commitment?
- Are all non-claims preserved in customer-facing or regulator-facing materials?
- Are remediation owners and dates assigned for unresolved categories?
- Are signed artifacts required before this report is used externally?

## Non-Claims
- This report provides evidence-backed signals only; it is not legal advice.
- Controls without control-bound AMC runtime evidence in the window are NOT_EVALUATED; absence of evidence is never a pass.
- A category passes only when a compiled plan records that it applies; until then sufficient evidence is still not evaluated.
- Ledger evidence is verified against this workspace's own monitor key: a local audit trail, not a portable verdict.
- Owner attestations must be explicitly signed and are not inferred automatically.

## How to read claim kinds

### Claim kinds

- **Synthetic example (not evidence)**: example values from a labelled example mode; never evidence, never a level
- **Self-reported**: stated by the agent or its operator, or not backed by observed evidence, including results stored by AMC 1.x; numeric self-answers reach at most level 1 and never pass a regulated control
- **Observed**: AMC observed the behaviour at runtime or in an executed test
- **Independently reviewed**: approved by an independent reviewer whose key is pinned

### Status dimensions

- **Result**: pass, fail or not evaluated
- **Evidence**: sufficient, incomplete, stale, contradictory or untrusted
- **Enforcement**: none, advisory, observed or enforced at a named boundary
- **Review**: pending, approved, rejected or expired
- **Applicability**: applicable, not applicable with a rationale, or unresolved

### Results

- **Not evaluated**: AMC could not decide from trustworthy evidence; it is never a pass, a partial result or a default score
