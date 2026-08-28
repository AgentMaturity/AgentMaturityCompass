# AMC Compliance Report (EU_AI_ACT)

- Agent: default
- Window: 2026-07-29T08:20:47.590Z -> 2026-08-28T08:20:47.590Z
- Config trusted: NO (compliance maps missing) — Fix: `amc compliance init` then `amc compliance verify`.
- Trust coverage: OBSERVED 0.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage score: 33.3% (S:0 P:8 M:4 U:0)
- Full hashes remain available in JSON reports: `amc compliance report --json`.

## Status and Evidence Drilldown

- SATISFIED: mapped evidence is present and compliance maps are trusted.
- PARTIAL: some evidence exists, maps are untrusted, or one or more controls need more proof.
- MISSING: expected mapped evidence is absent.
- UNKNOWN: AMC cannot decide with the current maps and evidence window.
- Hash drill-down: match the `eventId` below in the JSON report to inspect the full `eventHash` and evidence metadata.

## Categories

### Art. 9 Risk Management (PARTIAL)

Continuous risk management system throughout the AI system lifecycle, including identification, estimation, evaluation, and treatment of risks.

Deterministic reasons:
- No evidence events found for types: audit, metric, review
- Assurance pack 'duality' not found in window
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, metric, review events with OBSERVED trust tier
- Run assurance pack 'duality' with score >= 75
- No additional evidence required for this requirement

### Art. 10 Data Governance (PARTIAL)

Data governance and management practices for training, validation, and testing data sets including quality criteria, bias examination, and gap identification.

Deterministic reasons:
- No evidence events found for types: audit, artifact, review
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, artifact, review events with OBSERVED trust tier
- No additional evidence required for this requirement

### Art. 11 Technical Documentation (MISSING)

Technical documentation drawn up before market placement, kept up to date, and sufficient for conformity assessment (Annex IV structure).

Deterministic reasons:
- No evidence events found for types: artifact, review, audit
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review, audit events with OBSERVED trust tier

### Art. 12 Record-Keeping (PARTIAL)

Automatic logging of events throughout the AI system lifecycle enabling traceability of system functioning.

Deterministic reasons:
- No evidence events found for types: audit, llm_request, llm_response, tool_action, tool_result
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, llm_request, llm_response, tool_action, tool_result events with OBSERVED trust tier
- No additional evidence required for this requirement

### Art. 13 Transparency (MISSING)

Transparency and provision of information to deployers including instructions for use, intended purpose, and known limitations.

Deterministic reasons:
- No evidence events found for types: artifact, review
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review events with OBSERVED trust tier

### Art. 14 Human Oversight (PARTIAL)

Human oversight measures built into the AI system design, enabling effective oversight during use including ability to intervene, override, or stop.

Deterministic reasons:
- No evidence events found for types: audit, tool_action
- Assurance pack 'governance_bypass' not found in window
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events with OBSERVED trust tier
- Run assurance pack 'governance_bypass' with score >= 85
- No additional evidence required for this requirement

### Art. 15 Accuracy Robustness Cybersecurity (PARTIAL)

Appropriate levels of accuracy, robustness, and cybersecurity maintained throughout the lifecycle with resilience against errors, faults, and adversarial attacks.

Deterministic reasons:
- No evidence events found for types: test, metric, audit
- Assurance pack 'injection' not found in window
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture test, metric, audit events with OBSERVED trust tier
- Run assurance pack 'injection' with score >= 80
- No additional evidence required for this requirement

### Art. 17 Quality Management (PARTIAL)

Quality management system ensuring compliance with the regulation including documented policies, design/development procedures, and post-market monitoring.

Deterministic reasons:
- No evidence events found for types: audit, test, metric
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, test, metric events with OBSERVED trust tier
- No additional evidence required for this requirement

### Art. 27 FRIA (MISSING)

Fundamental Rights Impact Assessment completed and maintained for high-risk deployment contexts before putting the system into use.

Deterministic reasons:
- No evidence events found for types: artifact, review, audit
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, review, audit events with OBSERVED trust tier

### Art. 72 Post-Market Monitoring (PARTIAL)

Post-market monitoring system established and documented proportionate to the nature and risks of the AI system.

Deterministic reasons:
- No evidence events found for types: metric, audit, test
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture metric, audit, test events with OBSERVED trust tier
- No additional evidence required for this requirement

### Art. 73 Incident Reporting (PARTIAL)

Serious incidents detected, reported to authorities within required timelines, and closed with evidence-backed remediation.

Deterministic reasons:
- No evidence events found for types: audit, tool_action
- No denied audit events found
Evidence references:
- none
What would make this SATISFIED?
- Capture audit, tool_action events with OBSERVED trust tier
- No additional evidence required for this requirement

### Art. 86 Right to Explanation (MISSING)

Affected persons can obtain clear, meaningful explanations of AI-assisted decisions with contestability and appeal mechanisms.

Deterministic reasons:
- No evidence events found for types: artifact, audit, review
Evidence references:
- none
What would make this SATISFIED?
- Capture artifact, audit, review events with OBSERVED trust tier

## Legal Review Appendix

This appendix is not legal advice. It is an export-ready checklist for qualified legal, compliance, or audit reviewers.

Export packet:
- Markdown report: this file, generated for framework `EU_AI_ACT`.
- JSON evidence report: `amc compliance report --framework EU_AI_ACT --json --out compliance-eu_ai_act.json`.
- Evidence drill-down: use the event IDs above to recover full hashes and metadata from the JSON report.
- Reviewer focus: resolve every PARTIAL, MISSING, and UNKNOWN item before using this report as customer, board, regulator, or audit evidence.

Framework-specific legal-review notes:
- EU AI Act legal review: confirm provider/deployer role, high-risk classification, FRIA obligations, technical documentation, human oversight, post-market monitoring, and serious-incident reporting duties.
- Confirm whether each PARTIAL, MISSING, or UNKNOWN category maps to a legal obligation, internal policy control, or non-applicable item with counsel-approved rationale.

Reviewer sign-off prompts:
- Is this framework applicable to the agent, deployment context, geography, and customer commitment?
- Are all non-claims preserved in customer-facing or regulator-facing materials?
- Are remediation owners and dates assigned for unresolved categories?
- Are signed artifacts required before this report is used externally?

## Non-Claims
- This report provides evidence-backed signals only; it is not legal advice.
- Controls not represented in verified AMC evidence are marked as UNKNOWN/MISSING.
- Owner attestations must be explicitly signed and are not inferred automatically.
