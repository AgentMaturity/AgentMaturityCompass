# REV_HEAD_OF_SALES — Handoff + 48h Action Plan

## What was delivered
Upgraded core sales assets for immediate-close execution:
- `AMC_OS/SALES/QUALIFICATION.md`
- `AMC_OS/SALES/SCRIPTS.md`
- `AMC_OS/SALES/OFFERS.md`

These now include:
- A strict PACT-DO qualification and stage gating system
- Discovery-to-close scripts with objection handling and trial close prompts
- A 3-path offer architecture (Sprint / Pilot / Retainer) with explicit scope, timelines, and exclusions

## 48h Action Plan (execution-ready)

### 0–12 hours
1. Roll out updated qualification rubric to all active opportunities.
2. Re-score open pipeline and tag deals by band: DQ (0–5), Develop (6–7), Advance (8–9), Close (10–12).
3. Identify top 10 opportunities with PACT-DO >=8 and missing exit criteria.

### 12–24 hours
1. Run focused discovery gap-closure calls for all 8–9 scored deals.
2. For all >=10 scored deals, schedule decision calls within 48h.
3. Prepare same-day proposals using new offer menu and proposal minimums.

### 24–48 hours
1. Execute close calls using hard-close script + mutual action plan.
2. Issue final SOW/proposal docs with decision deadlines.
3. Lock kickoff dates for signed deals and handoff to implementation owner.

## Operating targets for next 48h
- 100% of active opps have PACT-DO score + decision date.
- 100% of proposals include acceptance criteria and exclusions.
- >=70% of high-intent deals (score >=10) receive same-day commercial package.

## Dependencies / blockers to monitor
- Missing decision-maker access
- Unclear implementation owner on client side
- Delayed KPI baseline data

## Suggested leadership check-in cadence
- End of Day 1: pipeline re-score review (30 min)
- End of Day 2: close report (wins, slips, blockers, next decisions)

---

## Revenue Manager Addendum — Pipeline Acceleration Command Brief (2026-02-18)
Created concise execution brief at:
- `AMC_OS/SALES/COMMAND_BRIEF_PIPELINE_ACCELERATION.md`

Top 3 actions queued:
1. Stage discipline + data hygiene enforcement (`CRM_PIPELINE_OPS.md`, `SCOREBOARD.md`)
2. Full PACT-DO re-score and routing (`QUALIFICATION.md`)
3. 48-hour close sprint for PACT-DO 8+ (`CLOSE_EXECUTION.md`, `OUTREACH_SEQUENCES.md`)

## Sales Manager Finalization Addendum (2026-02-18)
Final close-sprint plan published:
- `AMC_OS/SALES/48H_CLOSE_PLAN_FINAL.md`

Contains:
- Final 48h execution clock (0–6h, 6–24h, 24–48h)
- Top-10 opportunity selection criteria (ranked)
- Proposal cadence by intent band (PACT-DO 10–12 vs 8–9)
- Unblock list with owner + SLA for each conversion blocker

Immediate request:
1. Approve top-10 criteria as this week’s prioritization standard.
2. Enforce decision-date lock before proposal send.
3. Require EOD scoreboard update tied to close-sprint cohort.

---

## 2026-02-19 Sales salvage pass (30/60-min)

### Why execution lagged (hard stop)
- `AMC_OS/HQ/SCOREBOARD.md` is still at **0/40 outbound, 0/8 replies, 0/3 calls booked**.
- `AMC_OS/LEADS/LEADS_MASTER.csv` is very small and contact-incomplete: primary outreach fields (emails/decision makers) are not verified, so sequence throughput cannot hold quality.
- `AMC_OS/INBOX/REV_SDR_SMB.md` shows no booked call pipeline; pacing controls are not yet connected to call booking handoff.

### 30-min call-booking salvage sequence (execute now)
1. **5 min:** Pull the top 10 warmest opportunities from the SDR queue.
2. **10 min:** Filter to replies already indicating pain + timeline; tag each as `Reply-to-Call`.
3. **15 min:** Send **single-touch response** per qualified reply:
   - Restate pain + impact in one sentence.
   - Offer 2 concrete time options (next 2 business days).
   - Ask for best-fit attendee count + stakeholder list.
4. **20 min:** For each positive response, capture **decision date** and **next step due** before booking.
5. **30 min:** If 0–1 calls booked, trigger `REV_HEAD_OF_SALES` assisted booking block and reassign top 5 leads to fast-follow.

### 60-min hardening sequence
- **30–40 min:** Draft/attach meeting agenda and pre-read for each booked slot.
- **40–50 min:** Run conversion clean-up on CRM fields (`owner`, `next_step`, `next_step_due_date`, `economic_buyer`, `decision_date`).
- **50–60 min:** Confirm 3 calls in-flight or explicitly escalate:
  - 1–2 booked but unconfirmed → recontact with one final 2-slot follow-up.
  - <3 booked → 15-min escalation with SDR lead and RevOps for assisted calling.

### Immediate blockers + owners (today)
- **Contact enrichment (SMB top 10):** `REV_SDR_SMB` + `REV_HEAD_OF_SALES` — verify decision-maker names and channels; complete before minute 30.
- **CRM field compliance for conversion:** `REV_REVOPS_CRM` — block any stage move until `next_step_due_date` + `source_cta` exist.
- **Proof snippets / trust anchors:** `REV_COPYWRITER_DIRECT_RESPONSE` + `REV_COMPLIANCE_OFFICER` — approve 2 short proof-backed templates before minute 60.
- **Call-booking cadence ownership:** `REV_HEAD_OF_SALES` — hold decision-date lock + stakeholder confirmation on every booked call.

### Execution checkpoint owners (to mirror standup)
- `REV_COO_ORCH`: overall cadence control, blockers escalation.
- `REV_HEAD_OF_SALES`: call booking, warm-reply conversion, decision-date capture.
- `REV_REVOPS_CRM`: field hygiene and CRM audit.
- `REV_SDR_SMB`: outreach volume and warm reply attribution.
