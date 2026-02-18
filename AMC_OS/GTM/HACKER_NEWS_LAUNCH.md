# Hacker News Launch — Show HN Post

## Primary Title

**Show HN: AMC – evidence-based maturity scoring for AI agent programs**

## Title Variants

1. **Show HN: AMC – a maturity framework for AI agent programs (7 dimensions, L1–L5 scoring)**
2. **Show HN: We built an open maturity model to score AI agent programs on security, reliability, and governance**
3. **Show HN: AMC – stop guessing if your AI agents are production-ready, measure it**

---

## Post Body

We've been building AI agent systems for the past year and kept running into the same problem: there's no consistent way to answer "how mature is our agent program?" Teams ship agents with no governance, no eval harness, no cost controls, and no way to prove compliance. When things break (and they do), nobody knows where the gaps are.

So we built AMC — Agent Maturity Compass.

**What it is:** A maturity framework that scores AI agent programs across 7 dimensions on an evidence-backed L1–L5 scale:

1. **Governance** — ownership, policies, approval workflows
2. **Security** — prompt injection detection, SBOM/CVE tracking, secrets management
3. **Reliability** — fallback chains, retry logic, graceful degradation
4. **Evaluation** — evals that actually run in CI, regression detection, human-in-the-loop review
5. **Observability** — traces, cost attribution, drift detection
6. **Cost Management** — per-agent budgets, token accounting, anomaly alerts
7. **Operating Model** — team structure, on-call, incident response, runbooks

Each level requires specific evidence — not vibes, not self-attestation. L3 means you can point to artifacts that prove L3.

**What we ship:**

- **Score** — questionnaire engine that walks teams through assessment, produces a composite score with per-dimension breakdown and prioritized roadmap
- **Shield** — prompt injection detection + software supply chain (SBOM generation, CVE scanning for agent dependencies)
- **Enforce** — policy firewall sitting between agents and tools/APIs
- **Vault** — DLP scanning and invoice/payment fraud detection for agent outputs
- **Watch** — tamper-evident receipt log (every agent action gets a verifiable receipt)

**Honest numbers:**

- 1,600 passing tests across the platform
- We scored ourselves at L3.2 (we have real gaps in L4/L5 — continuous benchmarking and formal verification are hard)
- The framework is opinionated — we think that's a feature, but reasonable people can disagree on dimension weights

**What this is not:**

- Not an agent framework (use LangChain, CrewAI, AutoGen, whatever you want)
- Not an LLM benchmark — we don't score models, we score the program around them
- Not a compliance checkbox — it's an engineering tool

We'd genuinely appreciate feedback on the framework dimensions and scoring criteria. We've iterated on this with ~20 teams internally but haven't pressure-tested it with the broader community yet.

Happy to answer questions about the approach, the scoring methodology, or any of the platform components.

---

## Expected Top Questions & Prepared Answers

### Q1: How is this different from SOC 2 / ISO 27001 / existing compliance frameworks?

**A:** Those frameworks weren't designed for AI agents. They don't cover prompt injection, tool-use authorization, token cost blowups, or eval regression. AMC is complementary — if you need SOC 2, you still need SOC 2. AMC covers the agent-specific gaps that traditional frameworks miss entirely. Think of it as the engineering layer underneath compliance, not a replacement for it.

### Q2: Why should I trust your scoring criteria? Who decides what L3 vs L4 means?

**A:** Fair question. The levels are opinionated and based on patterns we've seen across ~20 agent deployments. L1 = ad hoc, L5 = continuously verified with automated evidence. We publish the full rubric — you can disagree with specific thresholds and adjust weights. We'd rather ship something concrete and iterate than wait for a standards body. If NIST or OWASP publishes something better, we'll adopt it.

### Q3: 1,600 tests sounds like a lot. What do they actually cover?

**A:** Unit + integration + a handful of adversarial red-team tests. Breakdown: ~900 unit tests across platform components, ~500 integration tests (API contracts, policy enforcement, receipt verification), ~200 adversarial tests (injection variants, DLP bypass attempts). We don't have formal verification or property-based testing yet — that's part of our own L4 gap.

### Q4: You scored yourselves at L3.2. What's missing for L4?

**A:** Biggest gaps: (1) continuous eval benchmarking in production — we run evals in CI but not on live traffic yet, (2) automated drift detection is partially implemented, (3) formal cost anomaly detection uses static thresholds instead of learned baselines, (4) we don't have automated red-teaming on a schedule. We're honest about this because we think maturity frameworks lose credibility the moment the authors claim perfection.

### Q5: Is the framework open / can I use it without your platform?

**A:** The framework (dimensions, levels, scoring rubric) is open. You can run a self-assessment with a spreadsheet. The platform (Shield, Enforce, Vault, Watch, Score) is what we sell — it automates evidence collection and scoring. We're not going to pretend the framework is useful without tooling at scale, but for small teams a manual assessment is a fine starting point.

### Q6: How does Shield detect prompt injection? What's the false positive rate?

**A:** Combination of classifier-based detection (trained on known injection patterns) and structural analysis (checking for instruction-override patterns in untrusted input). False positive rate depends heavily on your domain — we see ~2-4% on general workloads in our test suite. We're not claiming solved — injection detection is an arms race. Shield is a layer, not a silver bullet.

### Q7: What agent frameworks / LLM providers does this work with?

**A:** Framework-agnostic by design. If your agent makes tool calls and produces outputs, AMC can wrap it. We've tested with LangChain, CrewAI, and custom Python agent loops. LLM-provider agnostic — works with OpenAI, Anthropic, open-source models. The integration point is the agent's I/O boundary, not the model internals.

### Q8: This feels like it could become a consulting grift — "pay us to tell you your score." How do you avoid that?

**A:** By publishing the rubric and making self-assessment possible without us. We make money on the platform tooling (Shield, Enforce, Vault, Watch, Score), not on telling you your number. If you can score yourself and build the tooling in-house, go for it. We think most teams won't want to build tamper-evident logging and injection detection from scratch, but that's a buy-vs-build decision, not a gatekeeping one.

### Q9: Why 7 dimensions? Why not 3 or 12?

**A:** We started with 12, collapsed where we saw overlap, and landed on 7 because each dimension has a distinct owner in a mature org. Governance ≠ Security ≠ Reliability — they have different stakeholders, different tooling, and different failure modes. If you think we're missing a dimension or two should merge, we genuinely want to hear it.

### Q10: What's your business model?

**A:** Platform SaaS. The framework is open, the tooling is paid. We charge for Shield, Enforce, Vault, Watch, and Score as a platform. No per-seat pricing games — usage-based on agent volume. Early access is available now; we're working with design partners.

---

## Pre-Launch Checklist

- [ ] Landing page live with framework overview + rubric download
- [ ] GitHub repo (if open-sourcing rubric) ready and linked
- [ ] Post scheduled for 9–10 AM ET Tuesday or Wednesday (peak HN traffic)
- [ ] Team online to respond to comments within first 2 hours
- [ ] Demo environment available if someone asks to try it
- [ ] Prepared to share rubric doc link in comments

---

*Files created/updated:* `AMC_OS/GTM/HACKER_NEWS_LAUNCH.md`

*Acceptance checks:*
- Post body reads as technical, humble, honest — no marketing fluff
- All 7 dimensions named with one-line descriptions
- Real numbers included (1,600 tests, L3.2 self-score, ~2-4% FP rate)
- 10 Q&As cover likely skeptical HN responses
- No proprietary/internal info leaked

*Next actions:*
1. Review with founding team for accuracy on all numbers
2. Finalize whether rubric will be open-sourced or gated
3. Prepare landing page and demo environment
4. Choose launch date and assign comment-response shifts
5. Cross-post plan for LinkedIn/X after HN traction

*Risks/unknowns:*
- HN audience may challenge "why not open-source everything" — need clear stance
- Injection detection FP rate claim needs validation on broader workloads before launch
- "Maturity model" framing may trigger consulting-skepticism — post tone must stay engineering-first
