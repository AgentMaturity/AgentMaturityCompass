# AMC Email Sequences

> Last updated: 2026-02-19
> Owner: REV_EMAIL_NEWSLETTER / REV_SDR_SMB / REV_SDR_AGENCY

---

## 1. Cold Outreach Sequence (5 Emails)

**Target:** VP/Director of Engineering, Head of AI/ML, Platform Engineering leads at companies deploying AI agents (50-5000 employees).

**Trigger signals:** Job postings for "AI agent" roles, blog posts about agent deployments, LangChain/CrewAI/AutoGen GitHub activity, conference talks on agentic AI, LinkedIn posts about agent projects.

**CAN-SPAM compliance:** Every email includes physical mailing address, clear unsubscribe link, accurate From/Subject lines, and honors opt-outs within 10 business days.

---

### Email 1: Trigger-Based Cold Open
**Send:** Day 0 (on trigger signal)
**Subject line options (A/B test):**
- `{{COMPANY}}'s agent program — one question`
- `Saw {{TRIGGER}} — quick thought`

```
Hi {{FIRST_NAME}},

Noticed {{TRIGGER_DETAIL}} — congrats on pushing into agentic AI.

Quick question: how are you scoring the maturity of your agent program
across security, reliability, and governance?

Most teams we talk to have 3-15 agents in production but no structured
way to measure whether they're enterprise-ready. They're flying blind
on the exact dimensions that cause outages and compliance gaps.

We built the Agent Maturity Compass — 7 dimensions, 1,600 evidence-based
tests, L1-L5 scoring. Takes 30 minutes. You get a prioritized roadmap
showing exactly where to harden first.

Worth a look?

{{SIGNATURE}}

P.S. The assessment itself is free. No demo required to get your score.

{{UNSUBSCRIBE_FOOTER}}
```

---

### Email 2: Problem Deepener
**Send:** Day 3
**Subject line options:**
- `The 3 failures nobody talks about in agent programs`
- `Re: {{COMPANY}}'s agent program`

```
Hi {{FIRST_NAME}},

Following up — wanted to share what we see across agent programs at
the L1-L2 maturity range (where ~80% of teams sit today):

1. **No kill switch.** Agent hallucinates, takes a destructive action,
   and there's no governance layer to stop it. Average incident cost
   in production: 4-8 engineering hours per event.

2. **Secrets in prompts.** API keys, database credentials, PII — sitting
   in plain text inside agent configs. One prompt injection away from
   exfiltration.

3. **No eval beyond "vibes."** Teams judge agent quality by manually
   spot-checking outputs. No regression suite, no drift detection,
   no scoring rubric.

These aren't edge cases. They're the default state of agent programs
that grew organically without a maturity framework.

The AMC assessment maps your program against all 7 dimensions
(governance, security, reliability, evaluation, observability, cost,
operating model) and shows exactly which gaps carry the most risk.

Would a 30-minute self-assessment be useful for your next planning cycle?

{{SIGNATURE}}

{{UNSUBSCRIBE_FOOTER}}
```

---

### Email 3: Social Proof + Demo Invite
**Send:** Day 8 (5 days after Email 2)
**Subject line options:**
- `From L1.8 to L3.4 in 90 days`
- `How teams are scoring their agent programs`

```
Hi {{FIRST_NAME}},

One more data point — we scored our own agent program at L3.2 out of 5.
Published the methodology, the gaps, everything. Full transparency.

Here's what the assessment typically reveals:

→ Teams averaging L1-L2 have 3-5 critical security gaps they don't know about
→ The #1 underinvested dimension is observability (teams can't debug
  agent failures in production)
→ Cost management is the most ignored dimension until the first
  surprise $40K LLM bill

We're running a 20-minute live walkthrough this {{WEBINAR_DATE}} showing:
- How the 7-dimension scoring works
- A real assessment teardown (our own L3.2 score)
- The prioritized roadmap output

{{CALENDAR_LINK}}

No pitch, just the framework. Recording available if the time doesn't work.

{{SIGNATURE}}

{{UNSUBSCRIBE_FOOTER}}
```

---

### Email 4: The Ask
**Send:** Day 15 (7 days after Email 3)
**Subject line options:**
- `15 min — {{FIRST_NAME}}, worth it?`
- `Quick call on {{COMPANY}}'s agent maturity?`

```
Hi {{FIRST_NAME}},

I'll be direct — I think a 15-minute call would be valuable for
{{COMPANY}}.

Here's what I'd cover:

1. Walk through the 7 dimensions and where teams like yours typically
   score
2. Identify your top 2-3 hardening priorities based on your stack
3. Share the assessment so you can self-score on your own time

No pressure to buy anything. The framework is the product — if it's
useful, we can talk about the platform (Shield, Enforce, Vault, Watch,
Score) that automates the fixes.

If this isn't relevant, just say so and I'll stop emailing. Genuinely
trying to be helpful, not persistent.

{{CALENDAR_LINK}}

{{SIGNATURE}}

{{UNSUBSCRIBE_FOOTER}}
```

---

### Email 5: Breakup
**Send:** Day 25 (10 days after Email 4)
**Subject line options:**
- `Closing the loop`
- `Last one from me, {{FIRST_NAME}}`

```
Hi {{FIRST_NAME}},

Last email from me on this — I don't want to be noise in your inbox.

Three things I'll leave you with:

1. **Self-assessment link:** {{ASSESSMENT_URL}} — free, 30 minutes,
   no signup required. Score your agent program across 7 dimensions
   whenever it makes sense.

2. **The biggest risk pattern we see:** Teams that scale from 5 to
   50+ agents without a maturity framework hit a wall — usually a
   security incident or a cost blowout that forces a 2-month
   remediation pause.

3. **Open invite:** If agent maturity becomes a priority at {{COMPANY}}
   in 3, 6, or 12 months — my calendar is always open:
   {{CALENDAR_LINK}}

Wishing you and the team well with the agent program.

{{SIGNATURE}}

{{UNSUBSCRIBE_FOOTER}}
```

---

## 2. Newsletter Announcement

**Target:** Sid's existing audience (newsletter subscribers, LinkedIn followers, community members).
**Goal:** Awareness + assessment sign-ups.

**Subject:** `I scored my own AI agent program. It's a 3.2 out of 5. Here's the full breakdown.`

```
Hey {{FIRST_NAME}},

For the past few months I've been building something I couldn't find
anywhere else: a maturity framework for AI agent programs.

Not a vague "best practices" guide. A structured assessment with
1,600 tests across 7 dimensions — governance, security, reliability,
evaluation, observability, cost, and operating model.

Evidence-backed. L1-L5 scoring. Prioritized roadmap output.

I call it the Agent Maturity Compass (AMC).

## Why I built this

Every team deploying AI agents is reinventing the wheel on the same
questions:

- "Are our agents secure enough for production?"
- "How do we evaluate agent quality beyond spot-checking?"
- "What should we invest in next — observability? governance? cost controls?"

There was no standard framework to answer these. So I built one.

## I scored myself first

Transparency matters, so I ran AMC on my own agent program.

**Result: L3.2 out of 5.**

Strengths: security (L3.8), evaluation (L3.5)
Gaps: cost management (L2.4), operating model (L2.8)

I published the full methodology. No black box.

## What you get

**Free self-assessment** — 30 minutes, 7 dimensions, evidence-based
scoring, prioritized roadmap.

{{ASSESSMENT_CTA_BUTTON}}

**For teams that want to automate the fixes**, the AMC platform includes:
- **Shield** — runtime security for agents
- **Enforce** — governance policy engine
- **Vault** — secrets & credential management
- **Watch** — observability & debugging
- **Score** — continuous maturity scoring

But start with the assessment. That's where the value is.

## What I'd love from you

1. **Take the assessment** and tell me your score — I'm collecting
   benchmarks across industries and team sizes.

2. **Forward this to your engineering lead** if your org is deploying
   AI agents. They'll thank you.

3. **Reply with questions** — I read every response.

{{ASSESSMENT_CTA_BUTTON}}

Talk soon,
Sid

P.S. If you're an agency or consultancy that advises companies on
AI strategy — I have a white-label partner program. Reply with
"PARTNER" and I'll send details.
```

---

## 3. Agency Partner Outreach

**Target:** AI/ML consultancies, digital transformation agencies, DevOps/platform consultancies (10-200 person firms).
**Goal:** White-label / referral partnership.

**Subject line options:**
- `White-label opportunity: AI agent maturity assessments`
- `Your clients are deploying agents — here's a new revenue line`

```
Hi {{FIRST_NAME}},

I'm reaching out because {{AGENCY}} works with companies deploying
AI agents — and I have a partnership opportunity that adds a new
service line with zero R&D cost on your end.

**The problem your clients have:**
Every company scaling AI agents hits the same wall — no structured way
to measure maturity across security, governance, reliability, eval,
observability, cost, and operating model. They're asking you "are we
ready for production?" and there's no standard framework to answer.

**What I built:**
The Agent Maturity Compass (AMC) — 7 dimensions, 1,600 evidence-based
tests, L1-L5 scoring, prioritized remediation roadmap.

**The partner opportunity:**

| | Referral | White-Label |
|---|---|---|
| You send leads, we close | ✓ | |
| You deliver under your brand | | ✓ |
| Revenue share | 20% recurring | Custom |
| Your team trained on framework | ✓ | ✓ |
| Co-branded assessment reports | | ✓ |
| Platform access (Shield, Enforce, Vault, Watch, Score) | Client-direct | Your instance |

**Why this works for agencies:**

1. **New billable engagement type.** Agent maturity assessment →
   remediation roadmap → implementation. 3-6 month engagement per client.

2. **Differentiator.** Your competitors are offering generic AI strategy.
   You offer a structured, evidence-based maturity assessment with
   1,600 test points.

3. **Land-and-expand.** Assessment reveals gaps → you sell the
   remediation work → ongoing maturity monitoring retainer.

**Typical partner economics:**
- Assessment engagement: $15K-$40K (depending on agent program size)
- Remediation implementation: $50K-$200K
- Ongoing monitoring retainer: $5K-$15K/month

**Next step:**
15-minute call to walk through the framework and partner model.
No commitment — just see if it fits your practice.

{{CALENDAR_LINK}}

{{SIGNATURE}}

P.S. I'm onboarding 10 agency partners in the first cohort. Priority
goes to firms already doing AI/ML advisory work. Happy to share the
full partner deck on the call.

{{UNSUBSCRIBE_FOOTER}}
```

---

## Template Variables Reference

| Variable | Source | Example |
|---|---|---|
| `{{FIRST_NAME}}` | CRM | "Sarah" |
| `{{COMPANY}}` | CRM | "Acme Corp" |
| `{{TRIGGER}}` | Signal tracking | "your LangChain hiring post" |
| `{{TRIGGER_DETAIL}}` | Signal tracking | "Acme posted a Senior AI Agent Engineer role last week" |
| `{{CALENDAR_LINK}}` | Scheduling tool | Calendly/Cal.com link |
| `{{ASSESSMENT_URL}}` | AMC platform | Direct link to free assessment |
| `{{ASSESSMENT_CTA_BUTTON}}` | Email platform | Styled button → assessment |
| `{{WEBINAR_DATE}}` | Event calendar | "Thursday, March 5th at 11am PT" |
| `{{SIGNATURE}}` | Email platform | Name, title, company, links |
| `{{UNSUBSCRIBE_FOOTER}}` | Email platform | Physical address + unsubscribe link |
| `{{AGENCY}}` | CRM | "Thoughtworks" |

---

## Sending Cadence Summary

| Sequence | Email | Day | Goal |
|---|---|---|---|
| Cold | 1 — Trigger open | 0 | Curiosity + free assessment |
| Cold | 2 — Problem deepener | 3 | Pain awareness |
| Cold | 3 — Social proof + demo | 8 | Credibility + event |
| Cold | 4 — The ask | 15 | Meeting |
| Cold | 5 — Breakup | 25 | Leave door open |
| Newsletter | Single send | — | Awareness + assessment signups |
| Agency | Single send | — | Partner call booking |

---

## Acceptance Checks
- [ ] All 5 cold emails follow CAN-SPAM (unsubscribe, physical address, accurate headers)
- [ ] No revenue guarantees or unverifiable claims
- [ ] Only public information referenced (AMC dimensions, self-scored L3.2)
- [ ] Every email has a specific CTA
- [ ] Problem-first framing in every email (not feature-first)
- [ ] Template variables documented and consistent

## Next Actions
1. Set up email sending infrastructure (domain warmup, SPF/DKIM/DMARC)
2. Build trigger signal monitoring for cold sequence enrollment
3. A/B test subject lines — measure open rates per variant
4. Create Calendly/Cal.com booking page referenced in templates
5. Build assessment landing page for `{{ASSESSMENT_URL}}`

## Risks / Unknowns
- Cold email deliverability depends on domain reputation and warmup period
- Partner economics ($15K-$200K ranges) are market estimates — validate with first 3 partners
- Webinar date placeholder needs real scheduling
- Assessment platform must be live before sending any sequence
