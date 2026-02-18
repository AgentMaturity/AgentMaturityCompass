# REV_SDR_SMB — Heartbeat Sprint Handoff (Outbound activation)

## 1) No-lead / call status review (as of 2026-02-19 start)

### Pipeline baselines
- **SCOREBOARD 2026-02-18:** Outbound 0/40, Replies 0/8, Calls Booked 0/3, Calls Held 0/0, Weighted Pipeline 0.
- **LEADS source status:**
  - `AMC_OS/LEADS/LEADS_MASTER.csv`: **5 rows**, all marked `status: New`, all with placeholder contacts/channels (no verified email/DM handle yet).
  - `AMC_OS/LEADS/PROSPECT_LIST_SMB.md`: **15 SMB prospects** in hypothesis list, all contact fields marked estimated and need verification before final send.
- **Call activity:** no booked calls logged in current pipeline artifacts.

### Status summary
- **Current state:** 0-qualified active outreach opportunities + no live call pipeline.
- **Primary constraint:** outbound list enrichment is incomplete (decision-makers and direct channels are estimated).

---

## 2) IMMEDIATE 30–60 MIN SALVAGE PLAN (to seed 40 touches, 10 quality follow-ups, 3 scheduled calls)

### Objective (hard stop)
- Seed **40 outbound touches** now.
- Add **10 quality follow-ups** (higher-context + CTA-ready, not duplicate spam).
- Lock **3 call bookings** within 60 minutes when possible.

### Non-negotiables
1. Use only sequence-compliant content from `AMC_OS/CAMPAIGNS/OUTREACH_SEQUENCES.md`.
2. Log every outbound activity with: timestamp, contact, channel, variant, next step.
3. For every touched row ensure these fields are populated: `owner`, `lifecycle_status`, `next_step`, `next_step_due_date`, `source_cta`.
4. Stop-touching at first legal/compliance issue.

### Ownership
- **Execution owner:** `REV_SDR_SMB` (all outbound execution and queue control)
- **CRM integrity owner:** `REV_REVOPS_CRM` (field hygiene, activity logging, `source_cta` tags)
- **Call-owner + qualification handoff:** `REV_HEAD_OF_SALES` (discovery execution + decision-date lock)
- **Escalation reviewer:** `REV_HEAD_OF_SALES` (pacing/quality) + `REV_COMPLIANCE_OFFICER` (message quality exceptions)

### 60-minute minute plan

#### 0–10 min (pre-flight)
- Lock sequence bucket in CRM and open one active board:
  - Queue A (best-fit): Langfuse, Humanloop, Portkey AI, Ragas
  - Queue B (high-fit): Helicone, Trubrics, Botpress, LlamaIndex
  - Queue C (supporting): FlowiseAI, Vapi AI, Parea, Agensy, HatchWorks, OpenPipe, Vellum AI, BlueLabel
- Send `Touch Batch 1` (15 touches): Email #1 to 12 prospects + 3 LinkedIn connect notes to highest-fit 3.
- Goal checkpoint: **15 touches completed**

#### 10–30 min (touch acceleration)
- Send `Batch 2` (25 additional touches total = #16–25):
  - Remaining Email #1 to all top 20 prospects
  - First follow-up on two Queue A prospects: targeted value teaser on governance/drift risk
- Goal checkpoint by minute 30: **25 total touches**

#### 30–45 min (quality shaping)
- Send `Batch 3` (15 touches):
  - LinkedIn connect/value note for Queue A+B top 10
  - Email #2 for top 6 oldest no-response prospects
- Goal checkpoint by minute 45: **40 total touches logged**

#### 45–60 min (quality follow-up wave)
- Send **10 quality follow-ups** to top 10 replied-or-staged prospects:
  - 6 = Email #2 (three-friction-points + teardown offer)
  - 4 = LinkedIn value nudge / brief case-style framework nudge
- If prospect has any positive reply indicator (`pain + context`), replace planned follow-up with direct calendar invite offer and move to call flow.

### Touch sequencing map (fixed now)

**Priority 40-touch queue (no duplicates same channel within 24h):**
1. Langfuse — Email #1
2. Humanloop — Email #1
3. Helicone — Email #1
4. Ragas — Email #1
5. Portkey AI — Email #1
6. LlamaIndex — Email #1
7. FlowiseAI — Email #1
8. Botpress — Email #1
9. OpenPipe — Email #1
10. Trubrics — Email #1
11. Relevance AI — Email #1
12. Vellum AI — Email #1
13. Regie AI — Email #1
14. Vapi AI — Email #1
15. Parea — Email #1
16. Langfuse — LinkedIn connect
17. Humanloop — LinkedIn connect
18. Helicone — LinkedIn connect
19. Ragas — LinkedIn connect
20. Portkey AI — LinkedIn connect
21. BlueLabel — Email #1
22. NineTwoThree Studio — Email #1
23. Axe Automation — Email #1
24. Agensy — Email #1
25. HatchWorks — Email #1
26. Langfuse — Email #2
27. Humanloop — Email #2
28. Portkey AI — Email #2
29. Ragas — Email #2
30. Trubrics — Email #2
31. Helicone — LinkedIn value nudge
32. Vapi AI — Email #2
33. Parea — Email #2
34. Botpress — LinkedIn value nudge
35. LlamaIndex — Email #2
36. FlowiseAI — LinkedIn value nudge
37. Regie AI — Email #2
38. Relevance AI — LinkedIn value nudge
39. OpenPipe — Email #2
40. BlueLabel — LinkedIn value nudge

### 10 quality follow-up templates (applied only after initial 40)
- 4x Email #2 + teardown offer
- 3x LinkedIn value nudge
- 2x “if timing right” decision-clarity nudge (Queue A)
- 1x pain-anchored voicemail/script text
- 1x final close-loop nudge (“good time to close this file?”)

## 3) Replies → calls: target and owners

### Call target mapping
- **Target:** 3 calls booked
- **Priority call list:** Langfuse, Humanloop, Portkey AI, Helicone, Ragas, Trubrics
- **First-fit rule:** any reply with explicit pain + timeline = `Reply-to-Call priority`

### Call booking SLAs
- **T+20 min:** first 3 warm replies should have calendar invite drafted.
- **T+45 min:** if <2 call bookings, SDR escalates to Head of Sales for direct assist and call blitz.
- **T+60 min:** hard-close checkpoint:
  - 3 calls booked = continue normal discovery flow,
  - <3 calls = trigger escalation protocol below.

### Escalation rules
1. **Pacing escalation**
   - If total outbound touches <25 by 30 min → pause lower-fit prospects and send only high-intent follow-up to Queue A (Langfuse/Humanloop/Portkey/Ragas). `REV_HEAD_OF_SALES` notified immediately.
   - If replies <2 by 30 min → queue top-5 as call-first follow-up (invite only).
2. **Quality escalation**
   - Any compliance concern or uncertain claim in live drafting → immediate handoff to `REV_COMPLIANCE_OFFICER` and stop sending that variant.
3. **Call escalation**
   - If 3 calls are not booked by end of minute 60, schedule a 20-minute escalation call with `REV_HEAD_OF_SALES` and `REV_REVOPS_CRM` to reassign 5 best leads and run a live-call follow-up wave.
4. **Data escalation**
   - Missing required lead fields on touched records at any time → `REV_REVOPS_CRM` blocks any further stage changes and SDR sends only via rows marked `needs_review` until fixed.

---

## 4) Replies + calls conversion plan
- **Reply target mapping (8 replies):**
  - 1st-wave target by touch #15: 4 replies
  - End-of-day target after 40 touches: 8 replies
  - Any reply with explicit pain + decision context = **Reply-to-Call priority.**
- **Call-booking plan (3 calls):**
  - Call Queue A: Langfuse, Humanloop, Portkey AI (highest fit + urgency language)
  - Call Queue B: Ragas, Helicone, Trubrics (next-high fit backup)
  - Call booking + scheduling owner: **REV_SDR_SMB**
  - Discovery execution for booked calls owner: **REV_HEAD_OF_SALES**

## 5) Blockers (today)

1. **No verified decision-maker/contact data** for all 20 prospects.
2. **Proof/case assets not yet finalized** for fast, proof-backed reply acceleration.
3. **Attribution and funnel baseline gap** (`source_cta` and booking source mapping not locked).
4. **CRM completeness gate risk** if required fields are not filled before creating stage changes.

## 6) Next-step owners / control owners

| Blocker | Owner | Immediate next action |
|---|---|---|
| Contact enrichment for all 20 prospects | REV_SDR_SMB + REV_REVOPS_CRM | Verify LM name/channel in parallel (LinkedIn/company pages only), then update LEADS_MASTER with clean names + channels |
| Proof snippet / value evidence package | REV_COPYWRITER_DIRECT_RESPONSE + REV_COMPLIANCE_OFFICER | Push two short proof-backed snippets through compliance gate before reply-chase touches continue |
| Tracking instrumentation | REV_REVOPS_CRM | Add `source_cta` + `next_step_due_date` on all new rows; capture reply/call outcome tags immediately |
| Midday pacing correction | REV_HEAD_OF_SALES | If <50% reply pace by touch #20, reprioritize to Queue A and request temporary rep-level reallocation |
| Call handoff hygiene | REV_HEAD_OF_SALES | Ensure all booked calls carry decision-date + next step before stage move |

## 7) Execution log template (to append)
- `Touch #`: date/time | prospect | channel | version used | response (if any) | next action | owner
- Update once every 10 touches with running totals: outbound, replies, calls booked.

---

## 8) 30–60 min control checkpoints
- Checkpoint A (15 min): outbound, replies, touch quality score (0/1 for each contact) 
- Checkpoint B (30 min): outbound, replies, call attempts initiated
- Checkpoint C (45 min): outbound 40 complete, follow-up queue locked, first call invites sent
- Checkpoint D (60 min): outbound 40 complete, quality follow-ups 10 complete, calls booked count; apply escalation if any deficit

Files created/updated: AMC_OS/INBOX/REV_SDR_SMB.md

Acceptance checks:
- 40 touches assigned with channel variation and no same-channel duplication for same prospect within 24h.
- 10 quality follow-ups are high-context and mapped to top responders/high-intent prospects.
- 3-call target tied to owners with booking SLAs and escalation rules.
- At least two control checkpoints (30m / 60m) present with explicit escalation triggers.

Next actions:
1. Execute salvage queue exactly in order above, timestamp every touch.
2. Run pacing checkpoints at 30/45/60 minutes and enforce escalation triggers.
3. Escalate immediately if calls remain below target by 60 minutes.
4. Handoff all booked calls to `REV_HEAD_OF_SALES` with discovery objective + decision-date.
5. Update `AMC_OS/HQ/SCOREBOARD.md` and `LEADS_MASTER.csv` flags after run.

Risks/unknowns:
- Contact channels may be invalid or not verifiable; can reduce responseability despite sequence quality.
- 60-minute window may be tight if CRM data entry is done manually.
- Without case proof snippets, reply quality may skew low despite high touch volume.
