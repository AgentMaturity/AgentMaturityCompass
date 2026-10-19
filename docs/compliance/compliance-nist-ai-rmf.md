# AMC Compliance Report (NIST_AI_RMF)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

- Mappings: experimental: drafted and refuted by AI agents, not signed off by a named expert (D-08 pending). A result for another framework never sets a result here.
- Agent: default
- Window: 2026-09-18T08:36:45.061Z -> 2026-10-18T08:36:45.061Z
- Config trusted: YES
- Trust coverage: OBSERVED 0.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage: not evaluated (0 of 4 categories passed or failed) (S:0 P:0 M:0 N:4 U:0)
- Full hashes remain available in JSON reports: `amc compliance report --json`.

## Status and Evidence Drilldown

- Each category carries five status dimensions (result, evidence, enforcement, review, applicability) and a claim kind, decided from the evidence this report admitted; the claim line under each heading prints them.
- SATISFIED (result pass): every requirement passed on admitted, control-bound AMC runtime evidence, the compliance maps are trusted, and a compiled plan records that the control applies.
- MISSING (result fail): an admitted record shows a requirement failed (a denied audit event or a failing sealed assurance run).
- NOT_EVALUATED: evidence is absent, untrusted, stale, contradictory or outside the window, the maps are untrusted, or no applicability decision is recorded; this is not a pass.
- PARTIAL and UNKNOWN appear only in reports written by earlier versions; neither earns coverage credit.
- Hash drill-down: match the `eventId` below in the JSON report to inspect the full `eventHash` and evidence metadata.

## Categories

### Govern (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Signals for governance structures, approvals, and policy enforcement.

Deterministic reasons:
- no control-bound evidence for nist_govern in window
- nist_govern-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'governance_bypass' in window
- nist_govern-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action, tool_result events bound to 'nist_govern' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'governance_bypass' with score >= 85 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### Map (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Signals for context mapping, role boundaries, and risk framing.

Deterministic reasons:
- no control-bound evidence for nist_map in window
- nist_map-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, review events bound to 'nist_map' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- A compiled plan must record that this control applies before it can pass

### Measure (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Signals for measured quality, integrity, and auditability.

Deterministic reasons:
- no control-bound evidence for nist_measure in window
- nist_measure-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- nist_measure-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture metric, test, audit events bound to 'nist_measure' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Manage (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Signals for active risk response and remediation loops.

Deterministic reasons:
- no control-bound evidence for nist_manage in window
- nist_manage-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- nist_manage-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events bound to 'nist_manage' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

## Legal Review Appendix

This appendix is not legal advice. It is an export-ready checklist for qualified legal, compliance, or audit reviewers.

Export packet:
- Markdown report: this file, generated for framework `NIST_AI_RMF`.
- JSON evidence report: `amc compliance report --framework NIST_AI_RMF --json --out compliance-nist_ai_rmf.json`.
- Evidence drill-down: use the event IDs above to recover full hashes and metadata from the JSON report.
- Reviewer focus: resolve every MISSING and NOT_EVALUATED item before using this report as customer, board, regulator, or audit evidence.

Framework-specific legal-review notes:
- NIST AI RMF legal review: confirm Govern, Map, Measure, and Manage evidence is appropriate for the deployment context, risk appetite, and external commitments.
- Confirm the report is used as risk-management support rather than as a statutory compliance claim unless counsel approves that claim.

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
