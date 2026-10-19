# AMC Compliance Report (EU_AI_ACT)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

- Mappings: experimental: drafted and refuted by AI agents, not signed off by a named expert (D-08 pending). A result for another framework never sets a result here.
- Agent: default
- Window: 2026-09-19T19:53:27.420Z -> 2026-10-19T19:53:27.420Z
- Config trusted: YES
- Trust coverage: OBSERVED 0.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage: not evaluated (0 of 12 categories passed or failed) (S:0 P:0 M:0 N:12 U:0)
- Full hashes remain available in JSON reports: `amc compliance report --json`.

## Status and Evidence Drilldown

- Each category carries five status dimensions (result, evidence, enforcement, review, applicability) and a claim kind, decided from the evidence this report admitted; the claim line under each heading prints them.
- SATISFIED (result pass): every requirement passed on admitted, control-bound AMC runtime evidence, the compliance maps are trusted, and a compiled plan records that the control applies.
- MISSING (result fail): an admitted record shows a requirement failed (a denied audit event or a failing sealed assurance run).
- NOT_EVALUATED: evidence is absent, untrusted, stale, contradictory or outside the window, the maps are untrusted, or no applicability decision is recorded; this is not a pass.
- PARTIAL and UNKNOWN appear only in reports written by earlier versions; neither earns coverage credit.
- Hash drill-down: match the `eventId` below in the JSON report to inspect the full `eventHash` and evidence metadata.

## Categories

### Art. 9 Risk Management (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Continuous risk management system throughout the AI system lifecycle, including identification, estimation, evaluation, and treatment of risks.

Deterministic reasons:
- no control-bound evidence for euai_art9_risk_management in window
- euai_art9_risk_management-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'duality' in window
- euai_art9_risk_management-E2: fewer than 1 admitted records in the window
- no agent activity in window; absence of violations proves nothing
- euai_art9_risk_management-E3: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, metric, review events bound to 'euai_art9_risk_management' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'duality' with score >= 75 and *_SUCCEEDED <= 0
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Art. 10 Data Governance (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Data governance and management practices for training, validation, and testing data sets including quality criteria, bias examination, and gap identification.

Deterministic reasons:
- no control-bound evidence for euai_art10_data_governance in window
- euai_art10_data_governance-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- euai_art10_data_governance-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, artifact, review events bound to 'euai_art10_data_governance' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Art. 11 Technical Documentation (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Technical documentation drawn up before market placement, kept up to date, and sufficient for conformity assessment (Annex IV structure).

Deterministic reasons:
- no control-bound evidence for euai_art11_technical_documentation in window
- euai_art11_technical_documentation-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review, audit events bound to 'euai_art11_technical_documentation' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- A compiled plan must record that this control applies before it can pass

### Art. 12 Record-Keeping (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Automatic logging of events throughout the AI system lifecycle enabling traceability of system functioning.

Deterministic reasons:
- no control-bound evidence for euai_art12_record_keeping in window
- euai_art12_record_keeping-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- euai_art12_record_keeping-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, llm_request, llm_response, tool_action, tool_result events bound to 'euai_art12_record_keeping' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Art. 13 Transparency (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Transparency and provision of information to deployers including instructions for use, intended purpose, and known limitations.

Deterministic reasons:
- no control-bound evidence for euai_art13_transparency in window
- euai_art13_transparency-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review events bound to 'euai_art13_transparency' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- A compiled plan must record that this control applies before it can pass

### Art. 14 Human Oversight (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Human oversight measures built into the AI system design, enabling effective oversight during use including ability to intervene, override, or stop.

Deterministic reasons:
- no control-bound evidence for euai_art14_human_oversight in window
- euai_art14_human_oversight-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'governance_bypass' in window
- euai_art14_human_oversight-E2: fewer than 1 admitted records in the window
- no agent activity in window; absence of violations proves nothing
- euai_art14_human_oversight-E3: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events bound to 'euai_art14_human_oversight' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'governance_bypass' with score >= 85 and *_SUCCEEDED <= 0
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Art. 15 Accuracy Robustness Cybersecurity (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Appropriate levels of accuracy, robustness, and cybersecurity maintained throughout the lifecycle with resilience against errors, faults, and adversarial attacks.

Deterministic reasons:
- no control-bound evidence for euai_art15_accuracy_robustness in window
- euai_art15_accuracy_robustness-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'injection' in window
- euai_art15_accuracy_robustness-E2: fewer than 1 admitted records in the window
- no agent activity in window; absence of violations proves nothing
- euai_art15_accuracy_robustness-E3: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture test, metric, audit events bound to 'euai_art15_accuracy_robustness' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'injection' with score >= 80 and *_SUCCEEDED <= 0
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Art. 17 Quality Management (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Quality management system ensuring compliance with the regulation including documented policies, design/development procedures, and post-market monitoring.

Deterministic reasons:
- no control-bound evidence for euai_art17_quality_management in window
- euai_art17_quality_management-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- euai_art17_quality_management-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, test, metric events bound to 'euai_art17_quality_management' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Art. 27 FRIA (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Fundamental Rights Impact Assessment completed and maintained for high-risk deployment contexts before putting the system into use.

Deterministic reasons:
- no control-bound evidence for euai_art27_fria in window
- euai_art27_fria-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review, audit events bound to 'euai_art27_fria' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- A compiled plan must record that this control applies before it can pass

### Art. 72 Post-Market Monitoring (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Post-market monitoring system established and documented proportionate to the nature and risks of the AI system.

Deterministic reasons:
- no control-bound evidence for euai_art72_post_market_monitoring in window
- euai_art72_post_market_monitoring-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- euai_art72_post_market_monitoring-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture metric, audit, test events bound to 'euai_art72_post_market_monitoring' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Art. 73 Incident Reporting (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Signals from control-bound audit or tool-action events and the listed execution/lease audit-absence checks. They do not establish serious-incident classification, submission to authorities, reporting deadlines or evidence-backed closure.

Deterministic reasons:
- no control-bound evidence for euai_art73_incident_reporting in window
- euai_art73_incident_reporting-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- euai_art73_incident_reporting-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events bound to 'euai_art73_incident_reporting' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Art. 86 Right to Explanation (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Affected persons can obtain clear, meaningful explanations of AI-assisted decisions with contestability and appeal mechanisms.

Deterministic reasons:
- no control-bound evidence for euai_art86_right_to_explanation in window
- euai_art86_right_to_explanation-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, audit, review events bound to 'euai_art86_right_to_explanation' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- A compiled plan must record that this control applies before it can pass

## Legal Review Appendix

This appendix is not legal advice. It is an export-ready checklist for qualified legal, compliance, or audit reviewers.

Export packet:
- Markdown report: this file, generated for framework `EU_AI_ACT`.
- JSON evidence report: `amc compliance report --framework EU_AI_ACT --json --out compliance-eu_ai_act.json`.
- Evidence drill-down: use the event IDs above to recover full hashes and metadata from the JSON report.
- Reviewer focus: resolve every MISSING and NOT_EVALUATED item before using this report as customer, board, regulator, or audit evidence.

Framework-specific legal-review notes:
- EU AI Act legal review: confirm provider/deployer role, high-risk classification, FRIA obligations, technical documentation, human oversight, post-market monitoring, and serious-incident reporting duties.
- Confirm whether each MISSING or NOT_EVALUATED category maps to a legal obligation, internal policy control, or non-applicable item with counsel-approved rationale.

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
