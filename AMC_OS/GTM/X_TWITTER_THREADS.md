# X / Twitter Threads — Agent Maturity Compass (AMC)

> **Usage**: Copy each thread into a Twitter thread composer. One tweet per numbered block. Stay under 280 chars per tweet.

---

## Thread 1 — "Why Your AI Agent Will Fail Silently" (10 tweets)

**Goal**: Problem-awareness → AMC as the solution frame.

**1/**
Your AI agent won't crash dramatically.

It will quietly return the wrong answer, leak PII into a log file, and approve an invoice it shouldn't have.

You won't find out for weeks.

Here's why 🧵

**2/**
Most teams ship agents with two checks:

✅ "Does it respond?"
✅ "Does the response look reasonable?"

That's it. No injection testing. No cost tracking. No output validation.

The agent "works" — until it doesn't.

**3/**
A prompt injection doesn't throw an error.

It returns a perfectly formatted response that happens to follow an attacker's instructions instead of yours.

Your logs look clean. Your dashboard is green.

**4/**
An agent that calls an external API 300 times instead of 3 doesn't page anyone.

It just costs you $4,200 on a Tuesday and nobody notices until the monthly bill.

**5/**
DLP in traditional apps? Solved decades ago.

DLP when an LLM is generating the output? Almost nobody is checking.

Your agent can email a customer's SSN in a support reply and your system will log it as "ticket resolved."

**6/**
"But we have evals."

Cool. Do your evals cover adversarial inputs? Cost per execution? Drift over time? Policy compliance?

Or do they just check if the vibe is right on 50 golden examples?

**7/**
The pattern is the same every time:

1. Ship agent fast
2. Demo looks great
3. Production traffic hits edge cases
4. Silent failures accumulate
5. Incident reveals months of bad outputs

**8/**
This isn't a tooling problem. It's a maturity problem.

Teams don't know what "good" looks like for agents in production because nobody defined it.

**9/**
That's why we built the Agent Maturity Compass (AMC).

7 dimensions. Evidence-backed scoring from L1 to L5. A prioritized roadmap that tells you what to fix first.

Not a checklist. A scoring framework with 1,600 passing tests behind it.

**10/**
If you're running agents in production — or about to — score yourself before your customers score you.

AMC is open. Link in bio.

---

## Thread 2 — "We Scored Ourselves at L3.2. Here's What That Looks Like." (8 tweets)

**Goal**: Dogfooding story — credibility through transparency.

**1/**
We built a maturity framework for AI agent programs.

Then we scored ourselves with it.

Result: L3.2 out of 5.

Here's what that actually means 🧵

**2/**
L3.2 is not a flex. It's honest.

It means we have solid foundations — governance policies, injection detection, cost tracking — but gaps in advanced observability and cross-org operating model.

**3/**
Where we scored well:

• Security: Shield detects prompt injections and runs SBOM/CVE scanning
• Reliability: Enforce acts as a policy firewall before agent outputs reach users
• Evaluation: 1,600 tests across the framework, run on every change

**4/**
Where we scored lower:

• Observability: We have logging, but tamper-evident audit trails (Watch) are early
• Operating model: Our runbooks exist but aren't battle-tested across teams
• Cost: Tracking is per-agent but not yet per-task with anomaly detection

**5/**
The uncomfortable part of dogfooding: your own framework tells you where you're behind.

We publish these gaps intentionally. If we hid them, the framework would be dishonest.

**6/**
L3 means "Standardized" — repeatable processes, automated checks, evidence collection.

L4 means "Managed" — quantitative targets, anomaly detection, continuous improvement loops.

We're in the messy middle. Most teams are at L1-L2 without knowing it.

**7/**
The point of AMC isn't to get a perfect score.

It's to know exactly where you are, what to fix next, and what "better" looks like — with evidence, not opinions.

**8/**
We'll re-score quarterly and publish the delta.

If you want to score your own agent program, AMC is open.

Link in bio.

---

## Thread 3 — "The 7 Dimensions Every Production AI Agent Should Be Scored On" (6 tweets)

**Goal**: Educational — teach the framework dimensions.

**1/**
If you're putting AI agents into production, you need to score them on more than accuracy.

Here are the 7 dimensions that actually matter 🧵

**2/**
**1. Governance** — Who owns the agent? What's the approval process for changes? Is there an escalation path when it fails?

**2. Security** — Injection detection, dependency scanning, secrets management. Not "we trust the model."

**3/**
**3. Reliability** — Fallback behavior, retry logic, graceful degradation. What happens when the LLM returns garbage or the API is down?

**4. Evaluation** — Adversarial test suites, regression coverage, drift detection. Not just golden-path evals.

**4/**
**5. Observability** — Structured logs, trace IDs across agent steps, tamper-evident audit trails. Can you reconstruct what the agent did and why?

**6. Cost Management** — Per-agent and per-task cost tracking. Anomaly alerts. Budget guardrails before the bill arrives.

**5/**
**7. Operating Model** — Runbooks, on-call rotations, incident response specific to agents. Who gets paged when the agent hallucinates at 2 AM?

These aren't nice-to-haves. They're the difference between a demo and a product.

**6/**
AMC scores each dimension from L1 (Ad Hoc) to L5 (Optimizing) with evidence requirements at every level.

No self-reported vibes. Show the artifacts or don't claim the level.

Full framework → link in bio.

---

## Thread 4 — Launch Announcement (5 tweets)

**Goal**: Clear launch, specific value prop, CTA.

**1/**
Introducing the Agent Maturity Compass (AMC).

A scoring framework for AI agent programs in production. 7 dimensions, L1–L5 evidence-backed levels, and a prioritized roadmap.

Built because we needed it ourselves 🧵

**2/**
What AMC includes:

• 7 scoring dimensions: governance, security, reliability, evaluation, observability, cost, operating model
• Evidence requirements at each level — no self-reported scores
• Prioritized roadmap output — fix what matters first
• 1,600 passing tests backing the framework

**3/**
The platform behind AMC:

• **Shield** — prompt injection detection + SBOM/CVE scanning
• **Enforce** — policy firewall for agent outputs
• **Vault** — DLP + invoice fraud detection
• **Watch** — tamper-evident execution receipts
• **Score** — questionnaire engine for assessments

**4/**
We scored ourselves: L3.2 out of 5.

We publish our gaps because a framework that only works on other people's code is useless.

Quarterly re-scores. Public deltas.

**5/**
If you're running AI agents in production — or planning to — start with a score, not a hope.

AMC is open. Link in bio.

---

*Files created/updated: `AMC_OS/GTM/X_TWITTER_THREADS.md`*
*Acceptance checks: 4 threads, correct tweet counts (10/8/6/5), no IP leaks, problem-first hooks, specific CTAs, no "revolutionary"*
*Next actions: Schedule threads, create accompanying visuals, A/B test hooks*
