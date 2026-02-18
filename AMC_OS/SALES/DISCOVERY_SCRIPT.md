# SPIN Discovery Script for AMC Compass Sprint

## Context
Use this script for 25-minute discovery calls (founder/CTO/Head of AI audience).
Goal: diagnose maturity gaps and position the $5,000 Compass Sprint as the fastest path to a clear execution roadmap.

---

## 0) Opening (60–90s)
**Script:**
“Great to connect. I’m not here to sell a slide. I want to understand how you currently run AI agents in production and where the reliability risk is highest this quarter.”

Set the frame:
- Meeting is diagnostic, not a hard sell.
- We’ll score their current maturity and surface top 2 blockers.

---

## 1) Situation Questions (5)
1. “What AI agent workflows are currently in production, and what do they touch (tooling, APIs, customer data)?”
2. “Who owns approvals for high-risk actions (payments, writes, external calls, commands) today?”
3. “How many people can say, confidently, what gets changed when a policy issue is found?”
4. “Do you run recurring red-team or adversarial tests on your agents, and how often?”
5. “Do you currently track token/cost at team, workflow, or agent-task level?”

Quick close: “Anything else in your setup that feels fragile?”

---

## 2) Problem Questions (5)
1. “What happened in your last production incident involving agents?”
2. “Do you have examples where an agent’s output looked fine but the downstream action was wrong?”
3. “Have you had silent failures where logs looked normal but behavior drifted?”
4. “Where do most delays happen: coding, policy review, security sign-off, or cost review?”
5. “What’s not measured that you wish you had tomorrow?”

Listen for pain words: uncertain, reactive, no evidence, blind spots.

---

## 3) Implication Questions (5)
1. “If this remains unmeasured, what’s the next 30–60 day risk to uptime, budget, or trust?”
2. “How does it affect leadership confidence when you say the system is ‘stable’?”
3. “If a security issue emerges, what is the mean time to identify root cause?”
4. “What’s your cost of over-spending or over-calling in one bad week?”
5. “How many opportunities get delayed because you don’t have a common maturity language?”

Translate to impact: uncertainty, rework, emergency fixes, slower scaling.

---

## 4) Need-Payoff Questions (3)
1. “If we could give you an evidence-backed L1–L5 maturity map in 5 business days, would that reduce your execution risk?”
2. “If you knew the exact top 3 gaps and who must own them, would that improve your closeout confidence?”
3. “Would a prioritized roadmap (30/60/90) be useful for your planning cycle?”

---

## 5) The Close-the-Loop Move
### Transition
“Based on what you shared, you already have momentum in one or two areas, but there are likely gaps that aren’t visible in normal reporting. AMC gives you a single-source maturity view across 7 dimensions.”

### Offer Link
“Given this, the cleanest next step is our **AMC Compass Sprint**:
- $5,000, fixed scope
- 5 business days
- 7-dimension score + gap plan
- executive and technical readout
- execution-ready recommendations for next quarter”

### Soft-close
“If that sounds like it would reduce your uncertainty, I can send a proposal draft today and lock execution Monday.”

---

## 6) Objection Handling (embedded)
- **“Need time to think”**
  “Totally. What I can do is share the scope and evidence checklist now. No obligation to commit, but it gives you decision clarity in one pass.”

- **“Budget is tight”**
  “Understood. This is exactly why we prioritize. Without this, you keep paying hidden costs in repeated incidents and rework. This engagement de-risks spending elsewhere.”

- **“We do this internally”**
  “Great. This complements internal teams by giving a standardized score and gap structure. It improves internal engineering throughput, not replace it.”

- **“Need legal review”**
  “Absolutely. We’ve pre-built SOW and NDA templates with scope boundaries. Legal review usually starts faster when the deliverables are explicit.”

---

## 7) Sprint Starts Monday Close Script
“Before we end, tell me your preferred kickoff date and one internal owner.
I’ll send a one-page proposal and a starter questionnaire in the next 2 hours.
If I receive confirmation by EOD, we start Monday and deliver a draft scorecard by the end of Day 2.”
