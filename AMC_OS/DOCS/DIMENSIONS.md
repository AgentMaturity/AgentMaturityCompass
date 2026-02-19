# AMC Dimensions Guide

## ELI5 — The 7 Dimensions in One Minute

Imagine your company just got a bunch of AI tools. The AMC assessment checks 7 things:

1. **Governance** — Do the grown-ups have rules for how AI gets used? (Like having house rules.)
2. **Security** — Are you keeping the bad guys out and your secrets safe? (Like locking the front door.)
3. **Reliability** — Does the AI keep working when things go wrong? (Like having a backup flashlight.)
4. **Evaluation** — Are you checking if the AI is actually doing a good job? (Like grading homework.)
5. **Observability** — Can you see what the AI is doing at all times? (Like a baby monitor.)
6. **Cost Efficiency** — Are you spending wisely on AI? (Like checking your phone bill.)
7. **Operating Model** — Is your team set up to run AI well? (Like having a pit crew, not just a driver.)

Each dimension is scored L1–L5. Higher = more mature. Your overall AMC score is a weighted blend of all seven.

---

## Maturity Levels at a Glance

| Level | Name | Score Range | What It Feels Like |
|-------|------|-------------|---------------------|
| **L1** | Ad-hoc | < 30 | People do whatever they want. No process. "We'll figure it out." |
| **L2** | Defined | 30–54 | Someone wrote a doc. Maybe people read it. Basics exist. |
| **L3** | Managed | 55–79 | Processes are enforced, measured, and part of daily work. |
| **L4** | Optimized | 80–94 | Data drives decisions. Continuous improvement is real, not a poster. |
| **L5** | Autonomous | 95+ | Systems self-tune. Humans set strategy; automation handles the rest. |

---

## 1. Governance

### What It Means
Governance is about **who decides what** with AI. Policies, ownership, approvals, ethics, and auditability — the organizational guardrails that prevent AI from becoming the Wild West.

### Why It Matters
Without governance, teams deploy random models with no oversight. You get shadow AI, compliance violations, reputational risk, and zero accountability when something goes wrong. Governance is the foundation every other dimension depends on.

### Levels with Real Scenarios

| Level | What It Looks Like |
|-------|--------------------|
| **L1** | Developers sign up for OpenAI with personal cards. Nobody knows what models are in production. Legal has never heard of your AI usage. |
| **L2** | There's a Google Doc titled "AI Policy" that HR emailed once. One engineer informally tracks models. New deployments need a Slack thumbs-up from the tech lead. |
| **L3** | A formal AI governance committee meets monthly. Every model is registered in a catalog. New deployments go through a defined approval workflow with security and legal sign-off. Ethical guidelines are in the employee handbook. |
| **L4** | Governance reviews are data-driven — audit logs feed dashboards, policy compliance is measured, the committee adjusts policies based on incident trends. Automated checks flag unapproved models before they reach production. |
| **L5** | Policy enforcement is automated end-to-end. Model registry auto-updates on deploy. Approval workflows are intelligent (auto-approve low-risk, escalate high-risk). Governance KPIs self-adjust based on regulatory changes. |

### Rubric Questions — Plain English

| ID | Formal Question | What We're Really Asking |
|----|----------------|--------------------------|
| **gov_1** | Do you have a documented AI usage policy? | Is there a written-down set of rules for how people can (and can't) use AI at your company? |
| **gov_2** | Is there a designated AI governance owner/committee? | Does someone (or some group) actually own the responsibility of overseeing AI? |
| **gov_3** | Do you track which AI models are deployed and where? | Can you list every AI model running in production right now — and where it runs? |
| **gov_4** | Is there an approval process for new AI deployments? | Before a new AI model goes live, does someone have to say "yes"? |
| **gov_5** | Do you have ethical AI guidelines? | Have you written down what's ethical and what's off-limits for your AI systems? |
| **gov_6** | Are AI decisions auditable? | If regulators (or your CEO) ask "why did the AI do that?", can you show them? |
| **gov_7** | Do you conduct regular AI governance reviews? | Do you periodically sit down and check whether your AI governance is actually working? |

---

## 2. Security

### What It Means
Security covers **protecting AI systems from attack and preventing data leaks**. Prompt injection, data exfiltration, secret management, adversarial inputs, access control, and incident response — all the ways AI can be exploited or abused.

### Why It Matters
AI systems introduce new attack surfaces that traditional AppSec doesn't cover. A prompt injection can leak your entire system prompt. An unprotected endpoint can run up a $50K bill overnight. AI-specific threats need AI-specific defenses.

### Levels with Real Scenarios

| Level | What It Looks Like |
|-------|--------------------|
| **L1** | API keys are in `.env` files committed to GitHub. No input validation. Anyone with the URL can hit the model endpoint. No one has thought about prompt injection. |
| **L2** | Keys are in a vault (most of the time). There's basic input sanitization. Access control exists but is role-based at a coarse level. Someone wrote an incident response doc but it doesn't mention AI. |
| **L3** | Prompt injection scanning runs on every request. DLP rules block PII from being sent to external models. API keys rotate automatically. There's a dedicated AI section in the incident response playbook. Access is scoped per-model with least-privilege. |
| **L4** | Adversarial attack monitoring is active — anomaly detection flags unusual patterns. Red team exercises specifically target AI systems quarterly. DLP rules auto-update based on new data classification. Incident response is tested with AI-specific tabletop exercises. |
| **L5** | Defenses adapt in real-time. New prompt injection patterns are auto-detected and blocked. Access policies self-adjust based on usage patterns. Incident response auto-triggers containment for known attack signatures. |

### Rubric Questions — Plain English

| ID | Formal Question | What We're Really Asking |
|----|----------------|--------------------------|
| **sec_1** | Do you scan AI inputs/outputs for prompt injection? | Are you checking whether users (or data) are trying to trick your AI into doing something it shouldn't? |
| **sec_2** | Is there data loss prevention for AI interactions? | Can you stop sensitive data (passwords, PII, secrets) from being sent to or leaked by AI systems? |
| **sec_3** | Are AI API keys and secrets managed securely? | Are your API keys in a vault with rotation — or in a Slack message from 2023? |
| **sec_4** | Do you monitor for adversarial attacks on AI systems? | Are you watching for people deliberately trying to break or exploit your AI? |
| **sec_5** | Is there access control for AI model endpoints? | Can only authorized people/services call your AI models, or is it open season? |
| **sec_6** | Do you have an AI-specific incident response plan? | If your AI gets hacked or goes haywire, do you have a playbook — not just a generic one, but one that covers AI scenarios? |

---

## 3. Reliability

### What It Means
Reliability is about **keeping AI systems running and recovering gracefully when they don't**. SLAs, fallbacks, load testing, circuit breakers, rollback, and redundancy.

### Why It Matters
AI models fail in ways traditional software doesn't — rate limits, model provider outages, latency spikes, degraded output quality. If your product depends on AI and the AI goes down, your product goes down. Reliability engineering for AI is non-negotiable.

### Levels with Real Scenarios

| Level | What It Looks Like |
|-------|--------------------|
| **L1** | When OpenAI is down, your app shows a 500 error. Nobody knows the expected latency. There's one model, one provider, no backup. |
| **L2** | There's a retry with exponential backoff. Someone defined "the AI should respond in under 5 seconds" but it's not monitored. A developer can manually roll back to the previous prompt version. |
| **L3** | SLOs are defined (99.5% availability, p95 < 3s). Fallback to a simpler model if the primary fails. Load tests run before major releases. Circuit breakers trip at defined thresholds. Rollback is a one-click operation. |
| **L4** | SLOs are tracked in real-time with automatic escalation. Load tests are part of CI/CD. Fallback routing is intelligent — degrades gracefully based on failure type. Rollback is automatic when error rates exceed thresholds. |
| **L5** | Self-healing: the system auto-switches providers, auto-scales, auto-rolls back, and auto-adjusts SLOs based on real-world patterns. Chaos engineering runs continuously against AI services. |

### Rubric Questions — Plain English

| ID | Formal Question | What We're Really Asking |
|----|----------------|--------------------------|
| **rel_1** | Do AI systems have defined SLAs/SLOs? | Have you set clear targets for how fast and how reliably your AI should perform? |
| **rel_2** | Is there fallback behavior when AI fails? | When the AI breaks, does your app gracefully handle it — or does everything crash? |
| **rel_3** | Do you load test AI endpoints? | Have you checked what happens when 10x the usual traffic hits your AI? |
| **rel_4** | Is there circuit breaking/rate limiting? | If the AI starts failing, do you stop hammering it (and protect downstream systems)? |
| **rel_5** | Do you have rollback procedures for AI models? | Can you quickly go back to the previous version of a model or prompt if the new one is broken? |
| **rel_6** | Is there redundancy for critical AI services? | If your primary AI provider disappears, do you have a backup? |

---

## 4. Evaluation

### What It Means
Evaluation is about **measuring whether AI is actually good at its job** — output quality, automated testing, drift detection, human review, benchmarking, and retraining triggers.

### Why It Matters
AI can silently degrade. A model that was great last month might be terrible today because the data changed, the provider updated the model, or the world moved on. Without systematic evaluation, you're flying blind — shipping AI outputs you can't vouch for.

### Levels with Real Scenarios

| Level | What It Looks Like |
|-------|--------------------|
| **L1** | "It seems to work fine" — evaluation is vibes-based. Someone spot-checks a few outputs when they feel like it. No metrics. |
| **L2** | There's a spreadsheet of test cases that someone runs manually before big changes. A few quality metrics are tracked (accuracy, relevance) but inconsistently. |
| **L3** | Automated eval pipelines run on every prompt/model change. Drift detection alerts when output quality drops. Human reviewers grade a sample of outputs weekly. Results are compared against a baseline model. |
| **L4** | Eval results auto-trigger retraining or prompt updates. Benchmarks cover edge cases and adversarial inputs. A/B testing compares model versions on live traffic. Evaluation data feeds back into training data. |
| **L5** | Continuous evaluation is fully automated. The system auto-detects degradation, auto-selects the best model, auto-retrains, and auto-validates — humans review strategy, not individual outputs. |

### Rubric Questions — Plain English

| ID | Formal Question | What We're Really Asking |
|----|----------------|--------------------------|
| **eval_1** | Do you measure AI output quality systematically? | Do you have actual metrics for "is the AI doing a good job" — not just gut feel? |
| **eval_2** | Are there automated evaluation pipelines? | Do quality checks run automatically, or does someone have to remember to do it? |
| **eval_3** | Do you track model drift/degradation? | Would you notice if the AI started getting worse over time? |
| **eval_4** | Is there human-in-the-loop evaluation? | Do real humans regularly review AI outputs for quality? |
| **eval_5** | Do you benchmark against baseline models? | Do you compare your current model against alternatives to make sure it's still the best choice? |
| **eval_6** | Are evaluation results used to trigger retraining? | When eval scores drop, does that actually cause something to happen — or does the alert get ignored? |

---

## 5. Observability

### What It Means
Observability is about **seeing what your AI is doing** — logging, dashboards, token/latency tracking, alerting, end-to-end tracing, and compliance retention.

### Why It Matters
You can't fix what you can't see. AI systems are opaque by nature; observability makes them transparent. When a customer says "the AI gave me a weird answer", you need to be able to pull up that exact request, see the full context, and understand what happened. Without observability, debugging AI is guesswork.

### Levels with Real Scenarios

| Level | What It Looks Like |
|-------|--------------------|
| **L1** | Logs go to stdout and disappear. No dashboards. "How many tokens did we use last month?" — nobody knows. When something goes wrong, you try to reproduce it locally. |
| **L2** | AI requests are logged to a centralized system. There's a basic Grafana dashboard showing request counts and error rates. Someone manually checks costs weekly. |
| **L3** | Every request/response is logged with metadata (user, session, model, tokens, latency). Dashboards show health, cost, and quality metrics. Alerts fire on anomalies (latency spike, error rate increase). Logs are retained per compliance policy. |
| **L4** | End-to-end tracing connects user action → AI call → response → outcome. Anomaly detection is ML-powered. Dashboards are used in daily standups. Log retention and access are audited. |
| **L5** | Observability is self-tuning — alert thresholds adjust automatically, dashboards surface insights proactively, trace data feeds into automated root-cause analysis. |

### Rubric Questions — Plain English

| ID | Formal Question | What We're Really Asking |
|----|----------------|--------------------------|
| **obs_1** | Do you log all AI requests and responses? | Can you go back and see exactly what was sent to and received from the AI? |
| **obs_2** | Are there dashboards for AI system health? | Is there a screen you can look at right now that shows if your AI is healthy? |
| **obs_3** | Do you track token usage and latency? | Do you know how many tokens you're burning and how fast responses come back? |
| **obs_4** | Is there alerting for AI anomalies? | If something weird happens with the AI at 3am, does someone's phone buzz? |
| **obs_5** | Can you trace AI decisions end-to-end? | Can you follow a single AI interaction from the user's click all the way through the system and back? |
| **obs_6** | Do you retain AI logs for compliance? | Are you keeping AI logs long enough to satisfy auditors and regulators? |

---

## 6. Cost Efficiency

### What It Means
Cost efficiency is about **spending smart on AI** — tracking spend, optimizing model selection, caching, budgets, prompt optimization, and chargeback.

### Why It Matters
AI costs scale fast and unpredictably. A verbose prompt, a wrong model choice, or a missing cache can 10x your bill. Without cost visibility, teams overspend without knowing it. Cost efficiency isn't about being cheap — it's about getting the most value per dollar.

### Levels with Real Scenarios

| Level | What It Looks Like |
|-------|--------------------|
| **L1** | One shared API key. Monthly bill is a surprise. "Wait, we spent $12K on OpenAI last month?" Nobody knows which team or feature caused it. |
| **L2** | Spend is tracked at the org level. Someone made a spreadsheet comparing model prices. There's a Slack reminder to "keep an eye on costs." |
| **L3** | Spend is tracked per team and project. Model selection considers cost vs. quality tradeoffs explicitly. Semantic caching reduces redundant calls. Budget alerts fire when spend exceeds thresholds. Prompts are reviewed for token efficiency. |
| **L4** | Automated model routing picks the cheapest model that meets quality requirements. Cache hit rates are optimized continuously. Chargeback reports go to team leads monthly. Prompt optimization is part of the development workflow. |
| **L5** | Cost optimization is fully automated. The system auto-routes to the best cost/quality model, auto-caches, auto-compresses prompts, and auto-adjusts budgets based on business value delivered. |

### Rubric Questions — Plain English

| ID | Formal Question | What We're Really Asking |
|----|----------------|--------------------------|
| **cost_1** | Do you track AI spend per team/project? | Do you know which team or project is responsible for which chunk of your AI bill? |
| **cost_2** | Is there model selection optimization (cost vs quality)? | Are you picking models based on data (cost vs. quality) — or just defaulting to GPT-4 for everything? |
| **cost_3** | Do you use caching to reduce redundant AI calls? | If 100 users ask the same question, do you call the AI 100 times or once? |
| **cost_4** | Are there budget alerts/limits for AI usage? | If spending goes through the roof, do you find out before or after the invoice? |
| **cost_5** | Do you optimize prompt length/token usage? | Are your prompts lean and efficient, or are you sending novels to the API? |
| **cost_6** | Is there chargeback/showback for AI costs? | Do teams see (and feel) the cost of their AI usage — or is it all "someone else's budget"? |

---

## 7. Operating Model

### What It Means
Operating model is about **how your organization is structured to run AI** — platform teams, deployment pipelines, self-service tooling, runbooks, knowledge sharing, productivity measurement, and feedback loops.

### Why It Matters
Technology alone doesn't create value — the team, processes, and culture around it do. A great model deployed by a dysfunctional team will underperform a good model deployed by a well-organized one. The operating model determines whether AI is a one-off experiment or a sustained capability.

### Levels with Real Scenarios

| Level | What It Looks Like |
|-------|--------------------|
| **L1** | Every team rolls their own AI integration. No shared tooling. Knowledge lives in one engineer's head. When they leave, so does the knowledge. No runbooks. |
| **L2** | There's an informal "AI guild" that shares tips in Slack. A few teams have deployment scripts. Someone started a wiki page about AI best practices. |
| **L3** | A dedicated AI/ML platform team provides shared infrastructure. Standardized CI/CD pipelines deploy models. A self-service portal lets developers provision AI resources. Runbooks exist for common AI operations. Regular knowledge-sharing sessions happen. |
| **L4** | Developer productivity with AI tools is measured and optimized. Feedback from production incidents feeds directly into development priorities. The platform team runs an internal developer experience survey. Deployment pipelines include automated quality gates. |
| **L5** | The platform is fully self-service and self-healing. Feedback loops are automated — production signals auto-prioritize backlog items. Knowledge is captured and distributed automatically. The operating model continuously evolves based on measured outcomes. |

### Rubric Questions — Plain English

| ID | Formal Question | What We're Really Asking |
|----|----------------|--------------------------|
| **ops_1** | Is there a dedicated AI/ML platform team? | Is someone's actual job to build and maintain the AI platform — or is it everyone's side project? |
| **ops_2** | Do you have standardized AI deployment pipelines? | Is there one way to deploy AI models, or does every team wing it differently? |
| **ops_3** | Is there a self-service AI platform for developers? | Can a developer spin up an AI capability without filing a ticket and waiting two weeks? |
| **ops_4** | Do you have AI-specific runbooks? | When the AI breaks at 2am, is there a step-by-step guide — or does the on-call engineer just panic? |
| **ops_5** | Is there cross-team knowledge sharing for AI? | Do teams learn from each other's AI wins and failures, or does everyone reinvent the wheel? |
| **ops_6** | Do you measure developer productivity with AI tools? | Do you actually know if your AI developer tools are making people more productive? |
| **ops_7** | Is there a feedback loop from production to development? | When something goes wrong (or right) in production, does that information make it back to the people building the AI? |

---

## Quick Reference: All 44 Questions

| # | ID | Dimension | Question |
|---|-----|-----------|----------|
| 1 | gov_1 | Governance | Documented AI usage policy? |
| 2 | gov_2 | Governance | Designated governance owner? |
| 3 | gov_3 | Governance | Model inventory tracked? |
| 4 | gov_4 | Governance | Deployment approval process? |
| 5 | gov_5 | Governance | Ethical AI guidelines? |
| 6 | gov_6 | Governance | Decisions auditable? |
| 7 | gov_7 | Governance | Regular governance reviews? |
| 8 | sec_1 | Security | Prompt injection scanning? |
| 9 | sec_2 | Security | DLP for AI interactions? |
| 10 | sec_3 | Security | Secure secret management? |
| 11 | sec_4 | Security | Adversarial attack monitoring? |
| 12 | sec_5 | Security | Endpoint access control? |
| 13 | sec_6 | Security | AI incident response plan? |
| 14 | rel_1 | Reliability | Defined SLAs/SLOs? |
| 15 | rel_2 | Reliability | Fallback behavior? |
| 16 | rel_3 | Reliability | Load testing? |
| 17 | rel_4 | Reliability | Circuit breaking/rate limiting? |
| 18 | rel_5 | Reliability | Rollback procedures? |
| 19 | rel_6 | Reliability | Redundancy for critical services? |
| 20 | eval_1 | Evaluation | Systematic quality measurement? |
| 21 | eval_2 | Evaluation | Automated eval pipelines? |
| 22 | eval_3 | Evaluation | Drift/degradation tracking? |
| 23 | eval_4 | Evaluation | Human-in-the-loop eval? |
| 24 | eval_5 | Evaluation | Baseline benchmarking? |
| 25 | eval_6 | Evaluation | Eval-triggered retraining? |
| 26 | obs_1 | Observability | Request/response logging? |
| 27 | obs_2 | Observability | Health dashboards? |
| 28 | obs_3 | Observability | Token/latency tracking? |
| 29 | obs_4 | Observability | Anomaly alerting? |
| 30 | obs_5 | Observability | End-to-end tracing? |
| 31 | obs_6 | Observability | Compliance log retention? |
| 32 | cost_1 | Cost Efficiency | Per-team spend tracking? |
| 33 | cost_2 | Cost Efficiency | Model selection optimization? |
| 34 | cost_3 | Cost Efficiency | Caching for redundant calls? |
| 35 | cost_4 | Cost Efficiency | Budget alerts/limits? |
| 36 | cost_5 | Cost Efficiency | Prompt/token optimization? |
| 37 | cost_6 | Cost Efficiency | Chargeback/showback? |
| 38 | ops_1 | Operating Model | Dedicated platform team? |
| 39 | ops_2 | Operating Model | Standardized deployment pipelines? |
| 40 | ops_3 | Operating Model | Self-service AI platform? |
| 41 | ops_4 | Operating Model | AI-specific runbooks? |
| 42 | ops_5 | Operating Model | Cross-team knowledge sharing? |
| 43 | ops_6 | Operating Model | Developer productivity measurement? |
| 44 | ops_7 | Operating Model | Production-to-dev feedback loop? |
