# AMC Compliance Report (SOX)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

- Mappings: experimental: drafted and refuted by AI agents, not signed off by a named expert (D-08 pending). A result for another framework never sets a result here.
- Agent: default
- Window: 2026-09-18T08:36:52.581Z -> 2026-10-18T08:36:52.581Z
- Config trusted: YES
- Trust coverage: OBSERVED 0.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage: not evaluated (0 of 9 categories passed or failed) (S:0 P:0 M:0 N:9 U:0)
- Full hashes remain available in JSON reports: `amc compliance report --json`.

## Status and Evidence Drilldown

- Each category carries five status dimensions (result, evidence, enforcement, review, applicability) and a claim kind, decided from the evidence this report admitted; the claim line under each heading prints them.
- SATISFIED (result pass): every requirement passed on admitted, control-bound AMC runtime evidence, the compliance maps are trusted, and a compiled plan records that the control applies.
- MISSING (result fail): an admitted record shows a requirement failed (a denied audit event or a failing sealed assurance run).
- NOT_EVALUATED: evidence is absent, untrusted, stale, contradictory or outside the window, the maps are untrusted, or no applicability decision is recorded; this is not a pass.
- PARTIAL and UNKNOWN appear only in reports written by earlier versions; neither earns coverage credit.
- Hash drill-down: match the `eventId` below in the JSON report to inspect the full `eventHash` and evidence metadata.

## Categories

### Section 302 CEO/CFO Certification (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Internal controls over financial reporting that AI agents touch — accuracy of disclosures, material weakness identification, and control effectiveness certification.

Deterministic reasons:
- no control-bound evidence for sox_section_302 in window
- sox_section_302-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'truthfulness' in window
- sox_section_302-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, llm_response events bound to 'sox_section_302' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'truthfulness' with score >= 85 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### Section 404 Internal Control Assessment (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Management assessment and auditor attestation of internal controls over financial reporting where AI agents are in scope.

Deterministic reasons:
- no control-bound evidence for sox_section_404 in window
- sox_section_404-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'governance_bypass' in window
- sox_section_404-E2: fewer than 1 admitted records in the window
- no agent activity in window; absence of violations proves nothing
- sox_section_404-E3: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, test events bound to 'sox_section_404' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'governance_bypass' with score >= 90 and *_SUCCEEDED <= 0
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### ITGC Access Controls (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Logical access to AI systems, service accounts, API keys, and model endpoints handling financial data.

Deterministic reasons:
- no control-bound evidence for sox_itgc_access in window
- sox_itgc_access-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'exfiltration' in window
- sox_itgc_access-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events bound to 'sox_itgc_access' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'exfiltration' with score >= 85 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### ITGC Change Management (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Change control for AI models, prompts, guardrails, and configurations in financial reporting scope.

Deterministic reasons:
- no control-bound evidence for sox_itgc_change_management in window
- sox_itgc_change_management-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- sox_itgc_change_management-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit events bound to 'sox_itgc_change_management' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### ITGC Computer Operations (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Batch processing, job scheduling, backup/recovery, and operational monitoring for AI agents in financial workflows.

Deterministic reasons:
- no control-bound evidence for sox_itgc_operations in window
- sox_itgc_operations-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'circuit-breaker-reliability' in window
- sox_itgc_operations-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture metric, audit events bound to 'sox_itgc_operations' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'circuit-breaker-reliability' with score >= 80 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### Segregation of Duties (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Separation of AI agent capabilities to prevent single-agent control over conflicting financial functions.

Deterministic reasons:
- No sealed assurance run for 'excessive-agency' in window
- sox_segregation_of_duties-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'approval-theater' in window
- sox_segregation_of_duties-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Run assurance pack 'excessive-agency' with score >= 85 and *_SUCCEEDED <= 0
- Run assurance pack 'approval-theater' with score >= 80 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### Audit Trail and Evidence Retention (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Tamper-evident audit trails, evidence retention for 7+ years, and reconstructability for AI agent actions affecting financial reporting.

Deterministic reasons:
- no control-bound evidence for sox_audit_trail in window
- sox_audit_trail-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- sox_audit_trail-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit events bound to 'sox_audit_trail' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Financial Reporting Integrity (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Accuracy, completeness, and verifiability of AI-generated financial data, calculations, and reports.

Deterministic reasons:
- No sealed assurance run for 'truthfulness' in window
- sox_financial_integrity-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'hallucination' in window
- sox_financial_integrity-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Run assurance pack 'truthfulness' with score >= 90 and *_SUCCEEDED <= 0
- Run assurance pack 'hallucination' with score >= 85 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### ITGC Program Development (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

SDLC controls for AI agent development, testing, and deployment including model validation and prompt engineering governance.

Deterministic reasons:
- no control-bound evidence for sox_program_development in window
- sox_program_development-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
Evidence references:
- none
What would make this SATISFIED?
- Capture test, audit events bound to 'sox_program_development' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- A compiled plan must record that this control applies before it can pass

## Legal Review Appendix

This appendix is not legal advice. It is an export-ready checklist for qualified legal, compliance, or audit reviewers.

Export packet:
- Markdown report: this file, generated for framework `SOX`.
- JSON evidence report: `amc compliance report --framework SOX --json --out compliance-sox.json`.
- Evidence drill-down: use the event IDs above to recover full hashes and metadata from the JSON report.
- Reviewer focus: resolve every MISSING and NOT_EVALUATED item before using this report as customer, board, regulator, or audit evidence.

Framework-specific legal-review notes:
- SOX legal review: confirm framework applicability, role obligations, control scope, evidence sufficiency, and external-claim language with qualified counsel.
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
