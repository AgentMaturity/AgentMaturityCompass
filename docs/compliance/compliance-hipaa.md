# AMC Compliance Report (HIPAA)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

- Mappings: experimental: drafted and refuted by AI agents, not signed off by a named expert (D-08 pending). A result for another framework never sets a result here.
- Agent: default
- Window: 2026-09-19T19:53:31.169Z -> 2026-10-19T19:53:31.169Z
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

### §164.308 Administrative Safeguards (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Risk analysis, workforce security, information access management, security awareness training, security incident procedures, contingency planning, and evaluation.

Deterministic reasons:
- no control-bound evidence for hipaa_administrative_safeguards in window
- hipaa_administrative_safeguards-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'governance_bypass' in window
- hipaa_administrative_safeguards-E2: fewer than 1 admitted records in the window
- no agent activity in window; absence of violations proves nothing
- hipaa_administrative_safeguards-E3: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, llm_request, tool_action events bound to 'hipaa_administrative_safeguards' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'governance_bypass' with score >= 80 and *_SUCCEEDED <= 0
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### §164.312 Technical Safeguards (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Access control, audit controls, integrity controls, person or entity authentication, and transmission security for electronic PHI.

Deterministic reasons:
- no control-bound evidence for hipaa_technical_safeguards in window
- hipaa_technical_safeguards-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'exfiltration' in window
- hipaa_technical_safeguards-E2: fewer than 1 admitted records in the window
- No sealed assurance run for 'pii-detection-leakage' in window
- hipaa_technical_safeguards-E3: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events bound to 'hipaa_technical_safeguards' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'exfiltration' with score >= 90 and *_SUCCEEDED <= 0
- Run assurance pack 'pii-detection-leakage' with score >= 85 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### §164.310 Physical Safeguards (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Facility access controls, workstation use and security, and device and media controls for systems handling PHI.

Deterministic reasons:
- no control-bound evidence for hipaa_physical_safeguards in window
- hipaa_physical_safeguards-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
Evidence references:
- none
What would make this SATISFIED?
- Capture audit events bound to 'hipaa_physical_safeguards' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- A compiled plan must record that this control applies before it can pass

### §164.314 Organizational Requirements (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Business associate contracts and group health plan requirements for AI systems processing PHI on behalf of covered entities.

Deterministic reasons:
- no control-bound evidence for hipaa_organizational_requirements in window
- hipaa_organizational_requirements-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'delegationTrustChain' in window
- hipaa_organizational_requirements-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit events bound to 'hipaa_organizational_requirements' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'delegationTrustChain' with score >= 75 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### §164.316 Policies and Documentation (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Documentation of policies and procedures, retention requirements, and availability of documentation.

Deterministic reasons:
- no control-bound evidence for hipaa_policies_documentation in window
- hipaa_policies_documentation-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- hipaa_policies_documentation-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, test events bound to 'hipaa_policies_documentation' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### §164.502-514 Privacy Rule Uses and Disclosures (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Minimum necessary standard, de-identification requirements, authorization requirements, and permitted uses and disclosures of PHI by AI agents.

Deterministic reasons:
- No sealed assurance run for 'pii-detection-leakage' in window
- hipaa_privacy_rule-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'context-leakage' in window
- hipaa_privacy_rule-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Run assurance pack 'pii-detection-leakage' with score >= 90 and *_SUCCEEDED <= 0
- Run assurance pack 'context-leakage' with score >= 85 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### §164.524 Access to PHI (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Individual right of access to inspect and obtain a copy of PHI, including AI-generated health records and inferences.

Deterministic reasons:
- no control-bound evidence for hipaa_access_to_phi in window
- hipaa_access_to_phi-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events bound to 'hipaa_access_to_phi' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- A compiled plan must record that this control applies before it can pass

### §164.528 Accounting of Disclosures (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Maintain an accounting of disclosures of PHI by AI agents, including automated disclosures and inter-system data sharing.

Deterministic reasons:
- no control-bound evidence for hipaa_accounting_disclosures in window
- hipaa_accounting_disclosures-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- hipaa_accounting_disclosures-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit events bound to 'hipaa_accounting_disclosures' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### §164.530 Administrative Requirements (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Privacy officer designation, training, safeguards, complaint procedures, and sanctions for AI system operators.

Deterministic reasons:
- no control-bound evidence for hipaa_administrative_requirements in window
- hipaa_administrative_requirements-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
Evidence references:
- none
What would make this SATISFIED?
- Capture audit events bound to 'hipaa_administrative_requirements' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- A compiled plan must record that this control applies before it can pass

### Breach Notification Rule §164.400-414 (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Signals from control-bound audit or metric events and the listed exfiltration audit-absence check. They do not verify breach discovery, notification to individuals or HHS, notification content or discovery-to-notification timing.

Deterministic reasons:
- no control-bound evidence for hipaa_breach_notification in window
- hipaa_breach_notification-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- hipaa_breach_notification-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, metric events bound to 'hipaa_breach_notification' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

## Legal Review Appendix

This appendix is not legal advice. It is an export-ready checklist for qualified legal, compliance, or audit reviewers.

Export packet:
- Markdown report: this file, generated for framework `HIPAA`.
- JSON evidence report: `amc compliance report --framework HIPAA --json --out compliance-hipaa.json`.
- Evidence drill-down: use the event IDs above to recover full hashes and metadata from the JSON report.
- Reviewer focus: resolve every MISSING and NOT_EVALUATED item before using this report as customer, board, regulator, or audit evidence.

Framework-specific legal-review notes:
- HIPAA legal review: confirm framework applicability, role obligations, control scope, evidence sufficiency, and external-claim language with qualified counsel.
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
