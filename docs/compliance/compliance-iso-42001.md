# AMC Compliance Report (ISO_42001)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

- Mappings: experimental: drafted and refuted by AI agents, not signed off by a named expert (D-08 pending). A result for another framework never sets a result here.
- Flag: ISO/IEC 42005 descoped 2026-10-04 (iso.org unreachable): an alias with zero mapped controls, status "unverified: source unreachable". Its three categories are listed, never evaluated or counted. The ISO 42006 category is an AMC signal, not a clause mapping.
- Agent: default
- Window: 2026-09-18T08:36:39.355Z -> 2026-10-18T08:36:39.355Z
- Config trusted: YES
- Trust coverage: OBSERVED 0.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage: not evaluated (0 of 8 categories passed or failed) (S:0 P:0 M:0 N:8 U:0)
- Descoped: 3 categories are listed but not evaluated or counted (licensed text unavailable).
- Full hashes remain available in JSON reports: `amc compliance report --json`.

## Status and Evidence Drilldown

- Each category carries five status dimensions (result, evidence, enforcement, review, applicability) and a claim kind, decided from the evidence this report admitted; the claim line under each heading prints them.
- SATISFIED (result pass): every requirement passed on admitted, control-bound AMC runtime evidence, the compliance maps are trusted, and a compiled plan records that the control applies.
- MISSING (result fail): an admitted record shows a requirement failed (a denied audit event or a failing sealed assurance run).
- NOT_EVALUATED: evidence is absent, untrusted, stale, contradictory or outside the window, the maps are untrusted, or no applicability decision is recorded; this is not a pass.
- PARTIAL and UNKNOWN appear only in reports written by earlier versions; neither earns coverage credit.
- Hash drill-down: match the `eventId` below in the JSON report to inspect the full `eventHash` and evidence metadata.

## Categories

### Clause 4 Context (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

AIMS context, stakeholder expectations, and boundary definition are documented.

Deterministic reasons:
- no control-bound evidence for iso42001_clause_4_context in window
- iso42001_clause_4_context-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
Evidence references:
- none
What would make this SATISFIED?
- Capture review, artifact, audit events bound to 'iso42001_clause_4_context' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- A compiled plan must record that this control applies before it can pass

### Clause 5 Leadership (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Leadership commitment, accountability assignment, and governance controls are evidenced.

Deterministic reasons:
- no control-bound evidence for iso42001_clause_5_leadership in window
- iso42001_clause_5_leadership-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'governance_bypass' in window
- iso42001_clause_5_leadership-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events bound to 'iso42001_clause_5_leadership' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'governance_bypass' with score >= 80 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### Clause 6 Planning (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Risk/opportunity planning and AI objectives are tracked with measurable controls.

Deterministic reasons:
- no control-bound evidence for iso42001_clause_6_planning in window
- iso42001_clause_6_planning-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, metric events bound to 'iso42001_clause_6_planning' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- A compiled plan must record that this control applies before it can pass

### Clause 7 Support (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Competence, documented information, and support resources are maintained as evidence artifacts.

Deterministic reasons:
- no control-bound evidence for iso42001_clause_7_support in window
- iso42001_clause_7_support-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review events bound to 'iso42001_clause_7_support' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- A compiled plan must record that this control applies before it can pass

### Clause 8 Operation (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Operational lifecycle controls and risk treatment are evidence-linked during runtime execution.

Deterministic reasons:
- no control-bound evidence for iso42001_clause_8_operation in window
- iso42001_clause_8_operation-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- iso42001_clause_8_operation-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture tool_action, tool_result, audit events bound to 'iso42001_clause_8_operation' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Clause 9 Performance Evaluation (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Monitoring, measurement, and internal evaluation evidence are continuously produced.

Deterministic reasons:
- no control-bound evidence for iso42001_clause_9_performance_evaluation in window
- iso42001_clause_9_performance_evaluation-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'hallucination' in window
- iso42001_clause_9_performance_evaluation-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture metric, test, audit events bound to 'iso42001_clause_9_performance_evaluation' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'hallucination' with score >= 75 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### Clause 10 Improvement (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Nonconformity remediation and continual-improvement loops are closed with deterministic evidence.

Deterministic reasons:
- no control-bound evidence for iso42001_clause_10_improvement in window
- iso42001_clause_10_improvement-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- iso42001_clause_10_improvement-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events bound to 'iso42001_clause_10_improvement' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### ISO 42005 Impact Assessment (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Impact assessment scope, stakeholder boundary, and foreseeable misuse are captured.

Deterministic reasons:
- not evaluated: descoped (licensed text unavailable)
Evidence references:
- none
What would make this SATISFIED?
- A licensed copy of the standard and a named expert's review (D-08)

### ISO 42005 Impact Assessment (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Impact severity, likelihood, and uncertainty are quantified and regularly re-evaluated.

Deterministic reasons:
- not evaluated: descoped (licensed text unavailable)
Evidence references:
- none
What would make this SATISFIED?
- A licensed copy of the standard and a named expert's review (D-08)

### ISO 42005 Impact Assessment (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Traceability from identified impacts to mitigations and closure evidence is maintained.

Deterministic reasons:
- not evaluated: descoped (licensed text unavailable)
Evidence references:
- none
What would make this SATISFIED?
- A licensed copy of the standard and a named expert's review (D-08)

### ISO 42006 Conformity Evidence (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Certification-ready, machine-readable audit evidence packages are generated and verifiable.

Deterministic reasons:
- no control-bound evidence for iso42006_conformity_evidence_package in window
- iso42006_conformity_evidence_package-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- iso42006_conformity_evidence_package-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, audit, test events bound to 'iso42006_conformity_evidence_package' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

## Legal Review Appendix

This appendix is not legal advice. It is an export-ready checklist for qualified legal, compliance, or audit reviewers.

Export packet:
- Markdown report: this file, generated for framework `ISO_42001`.
- JSON evidence report: `amc compliance report --framework ISO_42001 --json --out compliance-iso_42001.json`.
- Evidence drill-down: use the event IDs above to recover full hashes and metadata from the JSON report.
- Reviewer focus: resolve every MISSING and NOT_EVALUATED item before using this report as customer, board, regulator, or audit evidence.

Framework-specific legal-review notes:
- ISO/IEC 42001 legal review: confirm AI management-system scope, role accountability, risk-treatment acceptance, supplier obligations, and audit-evidence retention requirements.
- Confirm unresolved controls have owners, target dates, and acceptance criteria before certification or customer use.

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
