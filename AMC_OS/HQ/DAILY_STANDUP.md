# DAILY STANDUP

Date: 2026-02-18
Owner: REV_COO_ORCH

## Today’s Command Intent
Convert baseline into first qualified pipeline while preserving delivery readiness and compliance.

## Top 3 outcomes (EOD)
1. Launch coordinated outbound motion with clear ICP/trigger filters and owner-level next steps.
2. Book first qualified discovery calls and move at least 2 opportunities to proposal stage.
3. Lock delivery handoff package (proposal/SOW template + implementation SOP + QA checklist) to reduce time-to-start post-close.

## Operating cadence (execution-ready)
- 09:30-09:45 — Daily standup: commit targets, identify blockers, assign owners.
- 12:30-12:45 — Midday pipeline check: activity vs target, quality spot-check, unblock dependencies.
- 17:30-17:50 — Close-out: scoreboard update, decision log updates, next-day priorities.
- 18:00-18:20 — Risk/compliance gate: review outbound claims, proposal terms, and exceptions.

## Functional priorities and owners (today)
- Sales (REV_HEAD_OF_SALES + SDR/AE pods)
  - Build/send first outbound batch to ICP-tagged, trigger-tagged list.
  - Target: 40 quality outbound touches, 8 meaningful replies, 3 calls booked.
- RevOps (REV_REVOPS_CRM)
  - Ensure CRM stages, probability weights, and activity logging are enforced.
  - Target: 100% of new opportunities with owner, value, probability, next step, next meeting date.
- Proposal/Delivery (REV_PROPOSAL_SOW_SPECIALIST + REV_IMPLEMENTATION_SPECIALIST)
  - Finalize proposal + SOW template with acceptance criteria and exclusions.
  - Target: 1 approved template pack ready for same-day send.
- Marketing support (REV_HEAD_OF_GROWTH + messaging/copy roles)
  - Align outreach narrative to proof-backed claims only.
  - Target: 2 outbound variants approved through compliance gate.

## Critical blockers to clear today
- Any lead source or enrichment gaps that prevent ICP filtering.
- Missing social proof/case references required for proof-backed outreach.
- Contract/legal language ambiguity delaying proposal issuance.

## End-of-day definition of done
- Scoreboard updated with actuals (activity + pipeline + cash metrics).
- At least 1 decision captured in DECISIONS.md with owner and review date.
- Next-day plan drafted with explicit owner per priority.

## 2026-02-19 Sales salvage checkpoint (30/60 min loop)

### Why REV_HEAD_OF_SALES execution lagged (latest check)
- `AMC_OS/HQ/SCOREBOARD.md` shows **0 outbound / 0 replies / 0 calls booked** against the 2026-02-18 targets.
- `AMC_OS/LEADS/LEADS_MASTER.csv` currently has only **5 SMB rows**, with missing emails and named decision-maker fields (`contact` remains TBD for all rows).
- `AMC_OS/INBOX/REV_SDR_SMB.md` already reports **no replies, no live call pipeline**, and unresolved field hygiene around `next_step_due_date` and `source_cta`.

### Immediate 30-min salvage actions (owner: immediate)
1. **0–10 min:** `REV_HEAD_OF_SALES` + `REV_SDR_SMB` freeze the execution set (top 10 ICP-fit prospects from `LEADS_MASTER.csv` + SMB priority list) and enforce one record format (`owner`, `next_step`, `next_step_due_date`, `source_cta`).
2. **10–20 min:** `REV_SDR_SMB` sends 15 high-intent first touches using approved outreach variants; `REV_REVOPS_CRM` logs each as Activity with mandatory fields.
3. **20–30 min:** `REV_HEAD_OF_SALES` reviews all warm replies and runs first call-booking push (2–3 calendar offers + decision-date confirmation).
4. **30-min checkpoint:** If `<10 touches` or `<2 replies`, escalate to `REV_COO_ORCH` and reallocate 2-touch capacity to Queue A only.

### 60-min salvage actions (owner: immediate)
1. **30–40 min:** Second-touch to all touched queue-A leads with reply-context variants; hard stop on compliance exceptions.
2. **40–50 min:** Run discovery-first booking sequence:
   - Acknowledge pain in 1 line, propose 2 call times,
   - Capture decision-maker status,
   - Confirm **decision-date** + **next_step_due_date**.
3. **50–60 min:** `REV_HEAD_OF_SALES` + `REV_REVOPS_CRM` freeze 3 booked calls target and close the loop in `SCOREBOARD.md`/pipeline.
4. **Escalation (if targets missed):** `REV_HEAD_OF_SALES` runs escalation bloc at minute 60 and re-queues 5 high-fit contacts for assisted call blitz.

## Blockers / owners for immediate unblocks
- **Lead quality for first-touch execution:** `REV_SDR_SMB` + `REV_HEAD_OF_SALES` — enrich emails/decision-makers from the top 10 target accounts within 60 min.
- **CRM readiness for conversion logging:** `REV_REVOPS_CRM` — enforce mandatory fields on all touched leads (`next_step`, `next_step_due_date`, `source_cta`) before stage movement.
- **Proof/compliance-ready assets for reply conversion:** `REV_COPYWRITER_DIRECT_RESPONSE` + `REV_COMPLIANCE_OFFICER` — supply 2 approved proof snippets before minute 60.
- **Call booking throughput:** `REV_HEAD_OF_SALES` — lead all `pain + timeline` replies to discovery calls with owner + decision-date lock by minute 60.
