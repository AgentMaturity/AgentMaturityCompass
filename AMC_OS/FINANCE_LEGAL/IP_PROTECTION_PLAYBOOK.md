# AMC IP Protection Playbook
> Protect the crown jewels while still enabling sales.

---

## The Disclosure Ladder (what to share vs what to guard)

### PUBLIC (safe to share freely)
- What AMC does at a high level (score + roadmap)
- The 7 dimension names (Governance, Security, Evaluation, Reliability, Cost, Observability, Operating Model)
- Sample *format* of outputs (watermarked/partial)
- High-level maturity level descriptions (L1–L5 labels)
- The philosophy: evidence-over-claims, maturity velocity

### SEMI-PRIVATE (under NDA or with serious buyers only)
- Deeper dimension descriptions
- Example evidence types per dimension
- Delivery methodology steps
- Sample question categories
- Benchmark aggregates (anonymized)

### VAULT (never public — ever)
- Specific scoring questions and rubric weights
- Internal heuristics and decision rules
- Automation scripts, eval harness implementation
- Client data (even anonymized without consent)
- Competitive analysis and positioning documents
- Pricing rationale and margin models

---

## Operational Controls

### Document Watermarking
Every shared document must include:
- "CONFIDENTIAL — AMC — Recipient: [Name] — [Date]"
- Unique document ID (for leak tracing)
- Footer: "© Agent Maturity Compass. Not for redistribution."

### Access Controls
- Share docs as view-only links with download disabled where possible
- Time-expire sensitive links (48-72 hour expiry for pre-sales materials)
- Maintain a "shared document log": AMC_OS/LOGS/SHARED_DOCS.md

### Demo Environment
- Use a "demo dataset" (synthetic, never real client data)
- Keep a separate demo environment/instance from production
- Demo only shows scorecard format, not full methodology

---

## Contract Language (standard clauses)

*Not legal advice. Review with counsel before signing.*

### Background IP Clause
"All pre-existing intellectual property of AMC, including but not limited to the Agent Maturity Compass framework, scoring rubrics, methodology, templates, and software, remains the exclusive property of AMC. No rights are transferred under this agreement except as explicitly stated."

### Limited License Clause
"Client is granted a non-exclusive, non-transferable license to use the deliverables (scorecard, roadmap, templates) internally for the purpose of improving their AI agent program. Redistribution, resale, or sublicensing of deliverables or methodology is prohibited without written consent."

### Confidentiality Clause
"Both parties agree to keep confidential all non-public information received under this engagement. AMC's scoring methodology, decision weights, and internal processes are explicitly designated as confidential AMC trade secrets."

### No Reverse Engineering Clause
"Client may not reverse engineer, decompile, or attempt to derive AMC's proprietary scoring methodology from deliverables."

### Non-Compete (where appropriate)
"Client may not use deliverables to build a competing maturity assessment product for [12/24] months post-engagement."

---

## White-Label Partner IP Rules

For agency partners offering AMC under their brand:
- Partner may white-label the deliverable format but not the underlying methodology
- Partner must sign a Platform Agreement with background IP protections
- Revenue share %, client data ownership, and sub-licensing terms must be explicit
- Partner cannot share methodology with their clients without AMC approval

---

## Brand Protection

- Trademark registration: file for "Agent Maturity Compass" and "AMC" in relevant classes
- Domain variants: register amc.ai, agentmaturitycompass.com, agentmaturity.com
- Social handles: claim on LinkedIn, X, GitHub
- Brand kit: consistent usage rules to prevent dilution (see MARKETING/WEBSITE_STYLE_GUIDE.md)

---

## Incident Response (IP breach)

If a document is leaked or methodology is copied:
1. Document the incident in AMC_OS/LOGS/SECURITY_INCIDENTS.md
2. Trace via document ID
3. Send cease and desist (template: AMC_OS/FINANCE_LEGAL/CEASE_DESIST_TEMPLATE.md)
4. Update disclosure ladder if necessary
5. Review and tighten access controls

---

## Acceptance Checks
- [ ] Every client document has watermark + unique ID
- [ ] Shared doc log updated
- [ ] Contract has all 5 standard clauses
- [ ] Demo uses synthetic data only
- [ ] Vault items never appear in public materials
