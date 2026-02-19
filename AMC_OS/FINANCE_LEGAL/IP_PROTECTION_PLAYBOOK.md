# AMC POLARIS — IP Protection Playbook

> **Status:** DRAFT — Requires review and approval by qualified legal counsel before use.
> **Owner:** REV_LEGAL_CONTRACTS / REV_SECURITY_OFFICER
> **Last updated:** 2026-02-19

---

## 1. Disclosure Ladder

All external communications must follow this tiered disclosure framework. When in doubt, default to the more restrictive tier.

### Tier 1 — Public (website, social media, demos, conferences)

| Shareable | Not Shareable |
|-----------|---------------|
| What AMC POLARIS does (high-level value proposition) | Any specifics on how scoring works |
| The 7 assessment dimensions (names and plain-English descriptions) | Dimension weights or scoring heuristics |
| Sample **format** of deliverables (watermarked, with synthetic data) | Real client data or real scored outputs |
| Client testimonials and anonymized case studies (with approval) | Client names without written consent |
| Pricing tiers (if published) | Internal cost structures |

### Tier 2 — Warm Prospect (after intro call, no NDA required)

Everything in Tier 1, plus:

- Deeper descriptions of each rubric dimension and what evidence types are evaluated
- Sample evidence categories and how they map to dimensions
- Delivery timeline and engagement process overview
- High-level differentiation vs. alternatives (without revealing proprietary methods)

### Tier 3 — Signed NDA

Everything in Tiers 1–2, plus:

- Partial rubric questions (representative subset, not the full instrument)
- Methodology overview (assessment philosophy, data-collection approach)
- Sample scored output using synthetic data
- Integration architecture overview (non-sensitive)

### Tier 4 — Client (under executed contract)

Everything in Tiers 1–3, plus:

- Full deliverables and scored reports for their engagement
- Complete rubric as applied to their assessment
- Recommendations and evidence documentation

### Tier 5 — NEVER Public (internal only, no exceptions)

The following must never be disclosed outside AMC, regardless of NDA or contract status:

- Scoring weights, heuristics, and calibration logic
- Internal prompts (LLM system prompts, chain-of-thought templates)
- Proprietary taxonomy and classification schemas
- Automation scripts, pipelines, and tooling source code
- Internal benchmarks and model evaluation data
- Raw training/fine-tuning datasets
- Security architecture and access-control details

---

## 2. Operational Controls

### 2.1 Document Sharing

- **View-only links** for all externally shared documents; download, print, and copy disabled where platform supports it.
- **Expiring links** — shared access expires after 30 days unless explicitly renewed.
- **No email attachments** of scored reports or methodology documents; use controlled-access platforms (e.g., secure portal, Google Drive with restricted sharing).

### 2.2 Watermarking

Every document shared externally (Tiers 2–4) must carry the following watermark on every page:

```
CONFIDENTIAL — AMC POLARIS — Recipient: [Full Name] — [YYYY-MM-DD]
```

- Watermark must be semi-transparent, diagonal, covering the document body.
- Applied automatically via document generation pipeline where possible.

### 2.3 Document Traceability

- Every shared PDF receives a **unique document ID** (format: `AMC-DOC-YYYYMMDD-XXXX`) embedded in the document metadata and printed in the footer.
- The **Document Tracking Registry** (`FINANCE_LEGAL/doc_tracking_registry.csv`) logs: Document ID, Recipient, Tier, Date Shared, Expiry Date, Revoked (Y/N).

### 2.4 Demo Environment

- A **separate demo dataset** (synthetic/fabricated data) is maintained for all sales and marketing demonstrations.
- Real client data must **never** appear in demos, screenshots, or marketing materials.
- The demo environment is **logically isolated** from production — separate accounts, separate data stores, no shared credentials.

### 2.5 Access Revocation

- Upon contract termination, NDA expiry, or personnel departure: revoke all shared links within **2 business days**.
- Quarterly audit of all active shared links and access grants.
- Revocation logged in the Document Tracking Registry.

---

## 3. Contract Clauses (Standard Inclusions)

The following clauses must be included in every client services agreement. Exact language to be drafted/approved by counsel.

### 3.1 Background IP Ownership

> All intellectual property owned by or developed by AMC prior to or independently of the engagement — including but not limited to the POLARIS assessment framework, rubric instruments, scoring models, templates, prompts, taxonomies, and software — remains the sole and exclusive property of AMC ("Background IP"). No transfer of ownership of Background IP is implied or granted under this Agreement.

### 3.2 Limited License

> Client is granted a non-exclusive, non-transferable, non-sublicensable license to use the deliverables produced under this Agreement solely for Client's internal business purposes. This license does not extend to the underlying methodology, scoring models, or framework.

### 3.3 No Reverse Engineering

> Client shall not reverse engineer, deconstruct, or attempt to derive the scoring methodology, algorithms, weights, or heuristics used in producing the deliverables.

### 3.4 Confidentiality

> Both parties agree to maintain the confidentiality of information designated as confidential. The parties expressly acknowledge that AMC's assessment methodology, scoring models, rubric instruments, and proprietary taxonomy constitute AMC's confidential information and trade secrets.

### 3.5 No Redistribution

> Client shall not distribute, publish, sublicense, or otherwise make available the deliverables or any portion thereof to any third party without the prior written consent of AMC.

### 3.6 Client Responsibilities & Scope

> Client shall provide timely access to requested information, personnel, and systems as outlined in the Statement of Work. AMC's obligations are limited to the scope defined therein.

### 3.7 Indemnification

> Each party shall indemnify and hold harmless the other party from claims arising from (a) the indemnifying party's breach of this Agreement, or (b) the indemnifying party's negligence or willful misconduct.

### 3.8 Termination & Survival

> Either party may terminate upon [30] days' written notice. Upon termination, Client's license to deliverables survives only if all fees are paid. Sections relating to IP ownership, confidentiality, no reverse engineering, indemnification, and limitation of liability survive termination for the longer of [3 years] or the applicable statute of limitations.

---

## 4. NDA Template (Key Terms)

Use AMC's standard mutual NDA for all Tier 3+ engagements. Key provisions:

### 4.1 Definition of Confidential Information

> "Confidential Information" means all non-public information disclosed by either party, whether orally, in writing, or electronically, that is designated as confidential or that a reasonable person would understand to be confidential given the nature of the information and circumstances of disclosure. This includes, without limitation: assessment methodologies, scoring models, rubric instruments, taxonomies, software, business plans, pricing, and client data.

### 4.2 Exclusions

Confidential Information does not include information that:

1. Is or becomes publicly available through no fault of the receiving party;
2. Was already known to the receiving party without restriction prior to disclosure;
3. Is independently developed by the receiving party without use of the disclosing party's Confidential Information;
4. Is rightfully received from a third party without restriction on disclosure.

### 4.3 Term

> This Agreement is effective for **two (2) years** from the date of execution. Obligations of confidentiality survive for **two (2) years** after the expiration or termination of this Agreement.

### 4.4 Permitted Use

> The receiving party shall use Confidential Information solely for the purpose of evaluating or conducting a business relationship between the parties.

### 4.5 Remedies

> The parties acknowledge that unauthorized disclosure of Confidential Information may cause irreparable harm for which monetary damages would be insufficient. The disclosing party shall be entitled to seek injunctive or equitable relief in addition to any other available remedies, without the requirement of posting a bond.

---

## 5. Enforcement Procedures

### 5.1 If IP Leakage Is Suspected

1. **Identify** — Document the suspected leak: what was disclosed, where it appeared, who may have had access.
2. **Contain** — Immediately revoke access for the suspected source. Disable shared links. Change relevant credentials.
3. **Preserve evidence** — Screenshot/archive the unauthorized disclosure. Save URLs, timestamps, and metadata. Do not alter originals.
4. **Trace** — Use the Document Tracking Registry and unique document IDs to identify the source document and recipient.

### 5.2 Escalation Path

| Step | Action | Owner | Timeline |
|------|--------|-------|----------|
| 1 | Internal incident logged | REV_SECURITY_OFFICER | Immediately |
| 2 | Notify REV_LEGAL_CONTRACTS | REV_SECURITY_OFFICER | Within 4 hours |
| 3 | Formal assessment and evidence gathering | REV_LEGAL_CONTRACTS | Within 48 hours |
| 4 | Cease-and-desist to the responsible party | External counsel | Within 5 business days |
| 5 | Evaluate further legal action (injunction, damages) | External counsel + leadership | As advised |

### 5.3 Evidence Preservation Checklist

- [ ] Screenshots with timestamps of the unauthorized disclosure
- [ ] Archived copies of the infringing material (web archive, PDF print)
- [ ] Document Tracking Registry entry for the leaked document
- [ ] Access logs showing who had access and when
- [ ] Communication records (emails, messages) related to the disclosure
- [ ] Chain of custody documented for all evidence

### 5.4 Post-Incident Review

After resolution, conduct a review to:

- Identify how the breach occurred
- Update controls to prevent recurrence
- Revise disclosure tier assignments if necessary
- Brief the team on lessons learned

---

## Appendix: Quick Reference — What Can I Share?

| Audience | Rubric Names | Rubric Questions | Scoring Weights | Sample Reports | Real Client Data | Methodology Detail |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Public | ✅ | ❌ | ❌ | Format only (watermarked) | ❌ | ❌ |
| Warm Prospect | ✅ | ❌ | ❌ | Format + synthetic | ❌ | High-level |
| Signed NDA | ✅ | Partial | ❌ | Synthetic scored | ❌ | Overview |
| Client (contract) | ✅ | ✅ (their engagement) | ❌ | Their reports | Their own | As applied |
| Internal only | ✅ | ✅ | ✅ | ✅ | Restricted | Full |

---

> ⚠️ **DISCLAIMER:** This playbook is a working framework and does not constitute legal advice. All contract clauses, NDA terms, and enforcement procedures must be reviewed and approved by qualified legal counsel licensed in the relevant jurisdiction(s) before use. AMC should engage an attorney specializing in intellectual property and commercial contracts to finalize these documents.

---

*Files created/updated:* `AMC_OS/FINANCE_LEGAL/IP_PROTECTION_PLAYBOOK.md`
