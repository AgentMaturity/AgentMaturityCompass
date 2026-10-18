# AMC Compliance Report (MITRE_ATLAS)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

- Mappings: experimental: drafted and refuted by AI agents, not signed off by a named expert (D-08 pending). A result for another framework never sets a result here.
- Agent: default
- Window: 2026-09-18T08:36:43.045Z -> 2026-10-18T08:36:43.045Z
- Config trusted: YES
- Trust coverage: OBSERVED 0.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage: not evaluated (0 of 8 categories passed or failed) (S:0 P:0 M:0 N:8 U:0)
- Full hashes remain available in JSON reports: `amc compliance report --json`.

## Status and Evidence Drilldown

- Each category carries five status dimensions (result, evidence, enforcement, review, applicability) and a claim kind, decided from the evidence this report admitted; the claim line under each heading prints them.
- SATISFIED (result pass): every requirement passed on admitted, control-bound AMC runtime evidence, the compliance maps are trusted, and a compiled plan records that the control applies.
- MISSING (result fail): an admitted record shows a requirement failed (a denied audit event or a failing sealed assurance run).
- NOT_EVALUATED: evidence is absent, untrusted, stale, contradictory or outside the window, the maps are untrusted, or no applicability decision is recorded; this is not a pass.
- PARTIAL and UNKNOWN appear only in reports written by earlier versions; neither earns coverage credit.
- Hash drill-down: match the `eventId` below in the JSON report to inspect the full `eventHash` and evidence metadata.

## Categories

### Reconnaissance (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Adversary gathers information about ML system architecture, capabilities, and attack surface.

Deterministic reasons:
- no control-bound evidence for atlas_reconnaissance in window
- atlas_reconnaissance-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- atlas_reconnaissance-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, llm_request events bound to 'atlas_reconnaissance' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Resource Development (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Adversary compromises ML supply chain including poisoned models, libraries, and datasets (AML.T0010, AML.T0019).

Deterministic reasons:
- no control-bound evidence for atlas_supply_chain_compromise in window
- atlas_supply_chain_compromise-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- atlas_supply_chain_compromise-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, artifact events bound to 'atlas_supply_chain_compromise' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Initial Access (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Adversary injects malicious prompts to manipulate LLM behavior and bypass safety controls (AML.T0051).

Deterministic reasons:
- no control-bound evidence for atlas_prompt_injection in window
- atlas_prompt_injection-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'injection' in window
- atlas_prompt_injection-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, llm_request, llm_response events bound to 'atlas_prompt_injection' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'injection' with score >= 80 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### Evasion (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Adversary crafts inputs to evade ML detection or cause misclassification (AML.T0015, AML.T0043).

Deterministic reasons:
- no control-bound evidence for atlas_model_evasion in window
- atlas_model_evasion-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'injection' in window
- atlas_model_evasion-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture test, metric, audit events bound to 'atlas_model_evasion' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'injection' with score >= 75 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### Evasion (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Adversary bypasses LLM safety guardrails through crafted multi-turn or encoded prompts (AML.T0054).

Deterministic reasons:
- no control-bound evidence for atlas_llm_jailbreak in window
- atlas_llm_jailbreak-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'injection' in window
- atlas_llm_jailbreak-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, llm_request, llm_response events bound to 'atlas_llm_jailbreak' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'injection' with score >= 85 and *_SUCCEEDED <= 0
- A compiled plan must record that this control applies before it can pass

### Exfiltration (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Adversary extracts training data, model parameters, or sensitive info via inference API (AML.T0025, AML.T0057).

Deterministic reasons:
- no control-bound evidence for atlas_data_exfiltration in window
- atlas_data_exfiltration-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- No sealed assurance run for 'exfiltration' in window
- atlas_data_exfiltration-E2: fewer than 1 admitted records in the window
- no agent activity in window; absence of violations proves nothing
- atlas_data_exfiltration-E3: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, llm_response events bound to 'atlas_data_exfiltration' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Run assurance pack 'exfiltration' with score >= 80 and *_SUCCEEDED <= 0
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### Impact (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Adversary exploits ML APIs to consume compute resources and inflate costs (AML.T0034).

Deterministic reasons:
- no control-bound evidence for atlas_cost_harvesting in window
- atlas_cost_harvesting-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- atlas_cost_harvesting-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture metric, audit events bound to 'atlas_cost_harvesting' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

### ML Model Access (NOT_EVALUATED)

**Claim:** Self-reported · **Result:** not evaluated (no evidence events were recorded) · **Evidence:** incomplete · **Enforcement:** none · **Review:** pending · **Applicability:** unresolved

Adversary gains unauthorized access to ML model inference or training endpoints (AML.T0040, AML.T0044).

Deterministic reasons:
- no control-bound evidence for atlas_model_access_control in window
- atlas_model_access_control-E1: fewer than 1 admitted records in the window
- not evaluated: no compiled plan decides this control's applicability yet
- no agent activity in window; absence of violations proves nothing
- atlas_model_access_control-E2: fewer than 1 admitted records in the window
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events bound to 'atlas_model_access_control' (meta.controlIds) from AMC runtime with OBSERVED trust tier
- Capture AMC runtime evidence for this agent in the window
- A compiled plan must record that this control applies before it can pass

## Legal Review Appendix

This appendix is not legal advice. It is an export-ready checklist for qualified legal, compliance, or audit reviewers.

Export packet:
- Markdown report: this file, generated for framework `MITRE_ATLAS`.
- JSON evidence report: `amc compliance report --framework MITRE_ATLAS --json --out compliance-mitre_atlas.json`.
- Evidence drill-down: use the event IDs above to recover full hashes and metadata from the JSON report.
- Reviewer focus: resolve every MISSING and NOT_EVALUATED item before using this report as customer, board, regulator, or audit evidence.

Framework-specific legal-review notes:
- MITRE_ATLAS legal review: confirm framework applicability, role obligations, control scope, evidence sufficiency, and external-claim language with qualified counsel.
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
