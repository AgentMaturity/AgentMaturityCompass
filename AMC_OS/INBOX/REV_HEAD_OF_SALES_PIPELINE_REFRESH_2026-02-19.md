# Live Pipeline Refresh — 2026-02-19

**Owner:** REV_HEAD_OF_SALES (subagent handoff)

## 1) What I ran
- Parsed current live lead data from `AMC_OS/LEADS/LEADS_MASTER.csv` (5 rows currently).
- Re-checked CRM quality expectations against `AMC_OS/LEADS/LEADS_MASTER_SCHEMA_GUIDE.md` and `AMC_OS/OPS/QUALITY_GATE_CHECKS.md` (LL-01/LL-02/LL-03 focus).
- Reviewed ICP source inputs from:
  - `AMC_OS/LEADS/PROSPECT_LIST_SMB.md` (15 entries)
  - `AMC_OS/LEADS/PROSPECT_LIST_MIDMARKET.md` (15 entries)
  - `AMC_OS/LEADS/PROSPECT_LIST_AGENCY.md` (15 entries)

## 2) RevOps CRM completeness check — live status

### Critical gaps (today’s snapshot)
- **5/5 leads are missing** required canonical lead-id/contact/owner context:
  - `lead_id` (required): **0/5 present**
  - `contact_name` (required): **0/5 present** (exists as `contact` field only)
  - `contact_role` (required): **0/5 present** (exists as `role` field only)
  - `owner` (required): **0/5 present**
  - `lifecycle_status` equivalent is currently `status=New` (not canonical).
- **Schema mismatch:** header is still legacy v1 style (`company,contact,role,email,source,icp,trigger,personalization_hook,priority,status,next_step`), not the canonical 28-column schema.
- **Contactability check:** `email` blank for all 5 leads (currently only URLs embedded in `source`).
- **Channel traceability:** `source` is a blended URL blob and not CRM taxonomic source (`inbound/outbound/partner/referral/event/content`).

### LL-style gate impact
- LL-01 (ICP tag): currently **passes as non-empty** but **non-canonical** (`icp` free text, no enum values).
- LL-02 (trigger): passes non-empty but low quality due to inconsistent format.
- LL-03 (owner + next step): `owner` fails 100%; next_step exists.
- LL-04 (actionable contact): fails for 5/5 on missing valid channel (all emails blank; only URL strings).

## 3) ICP lead source gap analysis
- `LEADS_MASTER.csv` has **only 5 leads**, all with source values as raw URLs; effectively **0 leads mapped to canonical source taxonomy**.
- Existing master list lacks all canonical source classes:
  - inbound=0, outbound=0, referral=0, partner=0, event=0, content=0
- Prospect lists are rich for pipeline capacity (+45 additional prospects total), but **also do not carry explicit canonical source tags**, so direct import will fail source-based reporting and routing.
- ICP field quality: master contains mixed narrative labels, not normalized enum values (`SMB`, `Mid-Market`, `Agency`) required for segment reporting.

### Current source-risk implication
- Without re-labelling, we cannot reliably answer channel ROI, source conversion, or segment-specific reply rate in CRM dashboards, and funnel hygiene score stays artificially low.

## 4) One-day remediation plan to hit **40 touches / 8 replies / 3 calls**

### Assumptions
- Conversion assumptions for execution math (conservative): 20% reply rate on touches, 37.5% reply→call booked.
- Target requires **40 touches** (email + LI + voicemail), yielding ~8 replies and ~3 calls.

### 0-Day refresh actions (today)
1. **Run normalization pass (2–3 hrs, RevOps + Head of Sales):**
   - Map all 5 active leads to canonical schema + add `lead_id`, `owner`, `lifecycle_status`, `icp_segment`, `source` enum, `next_step_due_date`, `last_activity_date`.
   - Backfill owner to SDR pod; set stage `new` for all unless contact made.
2. **Lead-source enrichment (2 hrs, RevOps + SDR Ops):**
   - Add `source` enum tags using import rule:
     - manual research list = `outbound`
     - referral/import = `referral`/`partner` as confirmed.
   - Add `trigger_event` enum with standardized reason text.
3. **Pipeline expansion from prospect lists (3 hrs, SDR lead):**
   - Promote **20 leads** from prospect lists into `LEADS_MASTER` (7 SMB, 7 Mid-Market, 6 Agency) with minimum contactable fields.
4. **Contactability hardening (1 hr):**
   - For each promoted lead require at least one of `email` OR `linkedin_url` verified.
   - Hold 0 leads in touch-ready pool with empty channels.
5. **Outreach execution (within day):**
   - 20 leads × 2 touches each (1 email + 1 LinkedIn touch) = **40 touches**.
   - 5 touch-owner micro-allocations:
     - 6–7 leads from each SDR
     - 4 warm/high-fit leads prioritized for faster call booking
   - 5-minute SLA on activity logging after each send.

### KPI control (midday + EOD)
- Midday checkpoint: touches >=20, quality flags logged, and lead-source tags on all touched records.
- EOD checkpoint: touches=40, replies target=8, calls booked target=3 (or set close forecast if calls<3 with re-routed secondary channel touches).

## 5) Concrete 1-day deliverables
- Updated `LEADS_MASTER` normalization map + import template completed.
- 20 additional touch-ready leads loaded with canonical source + ICP enums.
- 40 outbound touch actions executed and logged with channel and timestamp.
- Replies/calls funnel reviewed and rerouted into `attempting_contact`/`connected` stages.

---

Files created/updated:
- `AMC_OS/INBOX/REV_HEAD_OF_SALES_PIPELINE_REFRESH_2026-02-19.md`

Acceptance checks:
- Completeness check shows 100% required canonical fields for all touch-ready leads by end of refresh.
- All active records contain canonical `icp_segment` and `source` enums.
- Outbound touches logged (40+) with reply + call counts measured against 8/3 targets.
- Stage transitions use canonical names (new → attempting_contact → connected).

Next actions:
1. Merge canonical mapping into actual CRM tool sheet and enforce via validation on create/update.
2. Import top 20 leads with source + channel verified before first outbound wave.
3. Run quick half-day `LL-01/LL-03/LL-04` re-check and escalate failures in `AMC_OS/HQ/BLOCKERS.md`.
4. Assign 1-hour call blocks for SDRs once 8 replies are reached to keep reply→call conversion near 37.5%.

Risks/unknowns:
- Current master file quality is too low; without schema migration/validation, quality data can remain inconsistent.
- Prospect-list records are estimated contact data and need verification before compliant outreach.
- Reply-to-call conversion may drop below target unless call intent lines are tightened on first reply sequence.
