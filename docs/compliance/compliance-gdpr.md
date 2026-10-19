# AMC Compliance Report (GDPR)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

- Mappings: experimental: drafted and refuted by AI agents, not signed off by a named expert (D-08 pending). A result for another framework never sets a result here.
- Agent: default
- Window: 2026-09-18T08:36:34.544Z -> 2026-10-18T08:36:34.544Z
- Config trusted: YES
- Trust coverage: OBSERVED 0.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage: not evaluated (0 of 13 categories passed or failed) (S:0 P:0 M:0 N:13 U:0)
- Full hashes remain available in JSON reports: `amc compliance report --json`.

## Status and Evidence Drilldown

- Each category carries five status dimensions (result, evidence, enforcement, review, applicability) and a claim kind, decided from the evidence this report admitted; the claim line under each heading prints them.
- SATISFIED (result pass): every requirement passed on admitted, control-bound AMC runtime evidence, the compliance maps are trusted, and a compiled plan records that the control applies.
- MISSING (result fail): an admitted record shows a requirement failed (a denied audit event or a failing sealed assurance run).
- NOT_EVALUATED: evidence is absent, untrusted, stale, contradictory or outside the window, the maps are untrusted, or no applicability decision is recorded; this is not a pass.
- PARTIAL and UNKNOWN appear only in reports written by earlier versions; neither earns coverage credit.
- Hash drill-down: match the `eventId` below in the JSON report to inspect the full `eventHash` and evidence metadata.

## Categories

### Art. 5 Lawfulness Fairness Transparency (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Personal data processed lawfully, fairly, and transparently with clear purpose disclosure.

Deterministic reasons:
- no control-bound evidence for gdpr_art5_lawfulness_fairness_transparency in window
- gdpr_art5_lawfulness_fairness_transparency-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review, audit events bound to 'gdpr_art5_lawfulness_fairness_transparency' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- A compiled plan must record that this control applies before it can pass

### Art. 5 Purpose Limitation (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Personal data collected for specified, explicit, legitimate purposes and not further processed incompatibly.

Deterministic reasons:
- no control-bound evidence for gdpr_art5_purpose_limitation in window
- gdpr_art5_purpose_limitation-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- gdpr_art5_purpose_limitation-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, review events bound to 'gdpr_art5_purpose_limitation' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Art. 5 Data Minimisation (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Personal data adequate, relevant, and limited to what is necessary for processing purposes.

Deterministic reasons:
- no control-bound evidence for gdpr_art5_data_minimisation in window
- gdpr_art5_data_minimisation-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- gdpr_art5_data_minimisation-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, llm_request events bound to 'gdpr_art5_data_minimisation' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Art. 5 Accuracy (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Personal data accurate and kept up to date with inaccurate data erased or rectified without delay.

Deterministic reasons:
- no control-bound evidence for gdpr_art5_accuracy in window
- gdpr_art5_accuracy-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'hallucination' in window
- gdpr_art5_accuracy-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture test, metric, audit events bound to 'gdpr_art5_accuracy' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'hallucination' with score >= 75 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### Art. 5 Storage Limitation (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Personal data kept in identifiable form no longer than necessary for processing purposes.

Deterministic reasons:
- no control-bound evidence for gdpr_art5_storage_limitation in window
- gdpr_art5_storage_limitation-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, artifact events bound to 'gdpr_art5_storage_limitation' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- A compiled plan must record that this control applies before it can pass

### Art. 5 Integrity and Confidentiality (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Personal data processed securely with protection against unauthorized/unlawful processing and accidental loss.

Deterministic reasons:
- no control-bound evidence for gdpr_art5_integrity_confidentiality in window
- gdpr_art5_integrity_confidentiality-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'exfiltration' in window
- gdpr_art5_integrity_confidentiality-E2: fewer than 1 admitted records in the window
- no agent activity in window; absence of violations proves nothing
- gdpr_art5_integrity_confidentiality-E3: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, llm_request, llm_response events bound to 'gdpr_art5_integrity_confidentiality' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'exfiltration' with score >= 80 and *_SUCCEEDED <= 0
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Art. 5 Accountability (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Controller accountability is evidenced by demonstrable compliance with GDPR Art. 5 principles through audit trails, review artifacts, and governance records.

Deterministic reasons:
- no control-bound evidence for gdpr_art5_accountability in window
- gdpr_art5_accountability-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- gdpr_art5_accountability-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, audit, review, metric events bound to 'gdpr_art5_accountability' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Art. 6 Lawful Basis (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Processing has lawful basis (consent, contract, legal obligation, vital interests, public task, or legitimate interests).

Deterministic reasons:
- no control-bound evidence for gdpr_art6_lawful_basis in window
- gdpr_art6_lawful_basis-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- gdpr_art6_lawful_basis-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review, audit events bound to 'gdpr_art6_lawful_basis' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Art. 15-22 Data Subject Rights (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Data subject rights (access, rectification, erasure, restriction, portability, objection, automated decision-making) are supported.

Deterministic reasons:
- no control-bound evidence for gdpr_art15_22_data_subject_rights in window
- gdpr_art15_22_data_subject_rights-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action, artifact events bound to 'gdpr_art15_22_data_subject_rights' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- A compiled plan must record that this control applies before it can pass

### Art. 25 Data Protection by Design (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Data protection by design and by default with appropriate technical and organizational measures.

Deterministic reasons:
- no control-bound evidence for gdpr_art25_data_protection_by_design in window
- gdpr_art25_data_protection_by_design-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'exfiltration' in window
- gdpr_art25_data_protection_by_design-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, test, review events bound to 'gdpr_art25_data_protection_by_design' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'exfiltration' with score >= 80 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### Art. 32 Security of Processing (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Appropriate technical and organizational security measures including encryption, pseudonymization, and resilience.

Deterministic reasons:
- no control-bound evidence for gdpr_art32_security_of_processing in window
- gdpr_art32_security_of_processing-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'injection' in window
- gdpr_art32_security_of_processing-E2: fewer than 1 admitted records in the window
- no agent activity in window; absence of violations proves nothing
- gdpr_art32_security_of_processing-E3: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, llm_request, llm_response, tool_action events bound to 'gdpr_art32_security_of_processing' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'injection' with score >= 80 and *_SUCCEEDED <= 0
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Art. 33-34 Breach Notification (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Personal data breaches detected, documented, and notified to supervisory authority and data subjects within required timelines.

Deterministic reasons:
- no control-bound evidence for gdpr_art33_34_breach_notification in window
- gdpr_art33_34_breach_notification-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- gdpr_art33_34_breach_notification-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events bound to 'gdpr_art33_34_breach_notification' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Art. 35 DPIA (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Data Protection Impact Assessment conducted for high-risk processing with systematic evaluation and mitigation measures.

Deterministic reasons:
- no control-bound evidence for gdpr_art35_dpia in window
- gdpr_art35_dpia-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review, audit events bound to 'gdpr_art35_dpia' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- A compiled plan must record that this control applies before it can pass

## Legal Review Appendix

This appendix is not legal advice. It is an export-ready checklist for qualified legal, compliance, or audit reviewers.

Export packet:
- Markdown report: this file, generated for framework `GDPR`.
- JSON evidence report: `amc compliance report --framework GDPR --json --out compliance-gdpr.json`.
- Evidence drill-down: use the event IDs above to recover full hashes and metadata from the JSON report.
- Reviewer focus: resolve every MISSING and NOT_EVALUATED item before using this report as customer, board, regulator, or audit evidence.

Framework-specific legal-review notes:
- GDPR legal review: confirm framework applicability, role obligations, control scope, evidence sufficiency, and external-claim language with qualified counsel.
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
