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

### VAULT (never public)
- Specific scoring questions and rubric weights
- Internal heuristics and decision rules
- Automation scripts, eval harness implementation
- Client data (even anonymized)
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
- Time-expire sensitive links (48–72h)
- Maintain shared docs log: `AMC_OS/LOGS/SHARED_DOCS.md`

### Demo Environment
- Use synthetic demo dataset only
- Separate demo and production environment
- Demo showcases format only, not full methodology

---

## Contract Language (starter clauses)

*Not legal advice. Review with counsel.*

### Background IP
"All pre-existing intellectual property of AMC, including framework, rubrics, methodology, templates, and software, remains AMC's exclusive property."

### Limited License
"Client is granted a limited internal-use license for deliverables only. Redistribution, resale, or sublicensing is prohibited without written consent."

### Confidentiality
"Both parties keep non-public information confidential, including AMC scoring methodology, decision weights, and internal processes."

### No Reverse Engineering
"Client may not reverse engineer or infer AMC proprietary methodology from deliverables."

### Non-Compete (optional)
"Client may not build competing maturity assessment offerings using AMC methodology for [12/24] months post engagement."

---

## Brand Protection

- File IP/trademark registrations for "Agent Maturity Compass" and core marks
- Register high-signal domain variants
- Claim social handles consistently

---

## Incident Response

1. Record in `AMC_OS/LOGS/SECURITY_INCIDENTS.md`
2. Trace leakage via document IDs
3. Send cease-and-desist template (`AMC_OS/FINANCE_LEGAL/CEASE_DESIST_TEMPLATE.md`)
4. Tighten controls, adjust disclosure ladder

---

## Acceptance Checks
- [ ] Client materials are watermarked with unique IDs
- [ ] Shared-doc log is maintained
- [ ] Sensitive sections are not in public documents
- [ ] Contracts include 4 IP clauses above
