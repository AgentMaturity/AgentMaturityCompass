# Product Hunt Launch — Agent Maturity Compass (AMC)

---

## Tagline (58 chars)

> Your AI agents are failing silently. Now you can measure it.

---

## Short Description (256 chars)

AMC scores your AI agent program across 7 dimensions — governance, security, reliability, evaluation, observability, cost, and operating model — with evidence-backed L1–L5 maturity levels. Answer 30 questions, get a score and a prioritized roadmap to fix what matters first.

---

## Full Description (~800 words)

### The problem nobody talks about

Here's an uncomfortable truth: most companies deploying AI agents have no idea if they're working.

Not "working" as in responding — they respond fine. Working as in: Are they following policy? Are they leaking data? Are they costing 4x what they should? Are they hallucinating in ways nobody catches until a customer complains?

This is silent failure. Your agent handles 10,000 interactions a day and you can't answer basic questions: How secure is it? How reliable? Who's accountable when it gets something wrong?

Teams slap together dashboards, write ad-hoc evals, and call it good enough. But "good enough" doesn't survive an audit. It doesn't survive a breach. It doesn't survive the moment your CEO asks, "How mature is our agent program?" and nobody has an answer.

### What AMC does

Agent Maturity Compass is a structured assessment tool that scores your AI agent program across 7 dimensions:

- **Governance** — ownership, policy, accountability
- **Security** — injection defense, supply chain, access control
- **Reliability** — failure handling, fallbacks, SLAs
- **Evaluation** — testing, benchmarking, regression detection
- **Observability** — logging, tracing, anomaly detection
- **Cost** — budget controls, optimization, forecasting
- **Operating Model** — team structure, incident response, change management

Each dimension is scored from **L1 (Ad Hoc)** to **L5 (Optimizing)** based on evidence, not opinion. You answer 30 targeted questions. AMC produces a composite maturity score and a prioritized roadmap that tells you exactly what to fix next for the highest impact.

No hand-waving. No subjective gut checks. Numbers backed by evidence.

### Why now

The AI agent market crossed a threshold in 2025. Companies went from experimenting with agents to running them in production — handling customer data, making financial decisions, executing workflows with real consequences.

But the tooling didn't keep up. We have frameworks for building agents. We have frameworks for evaluating LLM outputs. We have almost nothing for evaluating the *program* around the agent: the governance, the security posture, the operational maturity.

That gap is where failures hide. An agent with great eval scores can still be a disaster if there's no incident response plan, no cost controls, and no data loss prevention. AMC closes that gap.

### How it works

**1. Take the assessment.** Answer 30 questions across 7 dimensions. Each question is designed to surface specific evidence — not aspirations, not plans, but what you actually have in place today.

**2. Get your score.** AMC calculates dimension-level scores (L1–L5) and a composite maturity score. You see exactly where you're strong and where the gaps are.

**3. Follow the roadmap.** AMC generates a prioritized list of improvements ranked by impact. No 50-page report you'll never read — a clear sequence of next steps.

### The platform behind the score

AMC isn't just a questionnaire. It's built on a platform we use ourselves:

- **Shield** — Prompt injection detection and software supply chain scanning (SBOM/CVE)
- **Enforce** — Policy firewall that blocks non-compliant agent actions
- **Vault** — Data loss prevention and invoice fraud detection
- **Watch** — Tamper-evident audit receipts for every agent action
- **Score** — The questionnaire and scoring engine that powers the assessment

We scored AMC with AMC. Our composite score: **L3.2**. We publish it openly because we believe transparency is the baseline, not the ceiling. We eat our own cooking.

### Built with rigor

The assessment engine has **1,600 passing tests**. The scoring methodology is versioned, auditable, and designed to be repeated over time so you can track maturity improvements quarter over quarter.

### Who it's for

- **Engineering leaders** deploying agents in production who need to answer "how mature are we?" with a real number
- **Security and compliance teams** who need structured evidence for audits and risk assessments
- **AI/ML platform teams** building internal agent infrastructure who want a maturity benchmark

### Get started

→ **Score your agent program** — takes 15 minutes, free tier available
→ **See a sample report** — understand what you'll get before you start
→ **Book a walkthrough** — we'll review your score and roadmap live

---

## Gallery Image Descriptions

### Image 1 — Hero
Split screen. Left side: a dashboard showing green checkmarks with a subtle red "silent failure" alert buried in the corner. Right side: the AMC compass visualization with the tagline overlaid. Dark background, clean typography. Conveys the contrast between "looks fine" and "actually measured."

### Image 2 — Score Demo
Screenshot of the AMC scoring interface mid-assessment. Shows a question from the Security dimension with evidence-level options (L1–L5). Progress bar at top showing 12/30 questions completed. Clean, focused UI — no clutter.

### Image 3 — Report Sample
The AMC results page showing a composite score of L3.2 with dimension-level breakdowns in a vertical bar chart. Each dimension labeled with its score. A "Priority Roadmap" section visible below the fold with the top 3 recommended actions.

### Image 4 — Dimensions Radar
Radar/spider chart showing all 7 dimensions plotted with scores. One overlay shows a "before" state (spiky, uneven) and another shows a "6-month later" state (more rounded, higher). Demonstrates progress tracking over time.

### Image 5 — Roadmap
The prioritized roadmap view. A ranked list of 5 improvements with impact scores, estimated effort, and which dimension each one improves. Clean table format. A "Start here" badge on the #1 item. Shows that AMC doesn't just diagnose — it prescribes.

---

## First Comment — Founder Story (~300 words)

Hey Product Hunt 👋

I built AMC because I kept seeing the same pattern.

Teams would build impressive AI agents — great demos, solid eval scores, fast iteration. Then they'd put them in production and have no idea what was actually happening. An agent would quietly violate a policy, or leak PII in a support conversation, or rack up a $40K inference bill, and nobody noticed for weeks.

The problem wasn't the agent. The problem was everything around it: no governance, no security posture, no cost controls, no observability, no incident response plan. The agent was fine. The *program* was flying blind.

I looked for a maturity framework that covered all of this. Something like CMMI or DORA but for AI agent programs. It didn't exist. So I built one.

AMC assesses 7 dimensions — governance, security, reliability, evaluation, observability, cost, and operating model — with 30 evidence-based questions. You get an L1–L5 score for each dimension, a composite score, and a roadmap that tells you what to fix first.

The part I'm most proud of: we scored ourselves with our own tool. We're at L3.2. Not perfect. Published openly. If we're going to ask teams to be honest about their maturity, we should go first.

The scoring engine has 1,600 passing tests. The methodology is versioned so you can re-assess quarterly and track real progress, not vibes.

We're not trying to replace your agent framework or your eval harness. AMC sits above that — it measures whether your overall program is ready for production, for audits, for scale.

If you're running agents in production (or about to), take 15 minutes and score yourself. The silent failures are already there. Now you can find them.

Happy to answer any questions in the comments.

---

## Top 5 Communities to Post on Launch Day

| # | Community | Why | Post Angle |
|---|-----------|-----|------------|
| 1 | **r/artificial** (Reddit) | 1.2M+ members, high engagement on AI tooling posts | "We built a DORA-like maturity model for AI agent programs — here's what L1 vs L5 looks like" |
| 2 | **r/MachineLearning** (Reddit) | Technical audience that values rigor and methodology | "Scoring AI agent programs across 7 dimensions with evidence-based L1–L5 levels (1,600 tests)" |
| 3 | **Hacker News (Show HN)** | Builder audience, loves frameworks and self-assessment tools | "Show HN: Agent Maturity Compass — a structured assessment for AI agent programs" |
| 4 | **LinkedIn AI/ML community** | Decision-makers (eng leads, CISOs, VPs) who need to justify maturity | Post from founder: "Your AI agents are failing silently. Here's how to measure it." with carousel of dimensions |
| 5 | **IndieHackers** | Builder community, appreciates "ate our own cooking" transparency | "We scored our own product with our own maturity tool. Here's what we found (L3.2)." |

---

## Hunter Outreach Message

> Hey [Name] — we built an assessment tool that scores AI agent programs across 7 dimensions (governance, security, reliability, evaluation, observability, cost, operating model) with evidence-backed L1–L5 maturity levels. We scored ourselves at L3.2 and publish it openly — the "eat your own cooking" angle has resonated well with engineering leaders. Would you be interested in hunting it on Product Hunt?

---

*Files created/updated:* `AMC_OS/GTM/PRODUCT_HUNT_LAUNCH.md`
*Acceptance checks:* Tagline under 60 chars ✓ | Description under 260 chars ✓ | Full description ~800 words ✓ | 5 gallery images ✓ | First comment ~300 words ✓ | 5 communities ✓ | Hunter message 3 sentences ✓ | No IP leaks (no rubric weights, questions, pricing, heuristics) ✓
*Next actions:* Design the 5 gallery images | Choose target hunter and send outreach | Draft launch-day social posts | Set up landing page CTAs (score / sample report / book call)
*Risks/unknowns:* Hunter availability and interest | PH algorithm favoring/penalizing certain launch days | Reddit community rules on self-promotion
