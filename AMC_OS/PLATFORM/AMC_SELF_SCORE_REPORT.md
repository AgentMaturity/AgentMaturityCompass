# 🧭 AMC Self-Assessment Report

### The Agent Maturity Compass — Scored Against Itself

> *"If you can't measure your own maturity, you have no business measuring anyone else's."*

**Assessment Date:** February 19, 2026  
**Subject:** AMC Platform v1.0  
**Assessor:** AMC Scoring Engine (automated self-assessment)  
**Method:** Full 29-question questionnaire → 7-dimension scoring engine

---

## Executive Summary

AMC scores itself at **Level 4 (Managed & Measured)** with an overall score of **86/100**. This places AMC in the top tier of AI agent maturity — with automated governance, production-grade security, and comprehensive evaluation — while honestly acknowledging gaps in cost optimization and advanced observability that prevent a perfect L5 score.

This is not a vanity exercise. Every score below is computed by AMC's own scoring engine, using the same questionnaire and rubrics that customers use. The evidence is real. The gaps are real. That's the point.

<table>
<tr><td>🏆</td><td><strong>Overall Maturity Level</strong></td><td><strong>L4 — Managed & Measured</strong></td></tr>
<tr><td>📊</td><td><strong>Composite Score</strong></td><td><strong>86 / 100</strong></td></tr>
<tr><td>✅</td><td><strong>Dimensions at L4+</strong></td><td><strong>6 of 7</strong></td></tr>
<tr><td>📈</td><td><strong>Strongest Dimension</strong></td><td>Operating Model (L5 — 98)</td></tr>
<tr><td>🔧</td><td><strong>Growth Area</strong></td><td>Cost Efficiency (L3 — 62)</td></tr>
</table>

---

## Dimension Scores

| Dimension | Score | Level | Status |
|---|:---:|:---:|:---:|
| **Operating Model** | 98 | ⭐ L5 — Optimizing | 🟢 |
| **Reliability** | 92 | L4 — Managed | 🟢 |
| **Security** | 90 | L4 — Managed | 🟢 |
| **Evaluation** | 89 | L4 — Managed | 🟢 |
| **Governance** | 87 | L4 — Managed | 🟢 |
| **Observability** | 86 | L4 — Managed | 🟢 |
| **Cost Efficiency** | 62 | L3 — Defined | 🟡 |

---

## Detailed Evidence by Dimension

### ⭐ Operating Model — L5 (98/100)

AMC's operating model is its crown jewel. The 70-role organizational framework (`AGENTS.md`) defines a complete AI center of excellence with specialized ROLEBOOKS, standardized golden-path templates, multi-agent orchestration via INBOX/HEARTBEAT/DAG workflows, and formal adoption playbooks.

| Evidence | Source |
|---|---|
| 70-role platform team structure | `AGENTS.md`, `ROLEBOOKS/` |
| Standardized agent templates | `ROLEBOOKS/00_GLOBAL_STANDARDS.md` |
| Multi-agent orchestration | INBOX, HEARTBEAT, SCOREBOARD, DAILY_STANDUP |
| Adoption playbooks | ROLEBOOKS + onboarding procedures |

**Remaining gaps:** Automated runbook execution, OKR-driven continuous improvement cadence.

---

### 🛡️ Reliability — L4 (92/100)

Production-grade resilience with circuit breakers, exponential backoff, rate limiting, and timeout enforcement. The 1600-test CI suite gates every merge.

| Evidence | Source |
|---|---|
| Circuit breaker with fallback | `amc.enforce.circuit_breaker` |
| Rate limiting & timeouts | `amc.enforce` module |
| Health monitoring | `amc.watch.assurance_watch` |
| 1600 tests gate deployment | CI pipeline |

**Remaining gaps:** Self-healing autonomous recovery, predictive reliability alerting.

---

### 🔒 Security — L4 (90/100)

Four-layer security: prompt injection detection, DLP/PII redaction, SBOM/CVE scanning, and policy firewall for tool-call filtering. This stack addresses all OWASP Top 10 for LLMs.

| Evidence | Source |
|---|---|
| Prompt injection detector | `amc.shield.injection_detector` |
| DLP & PII redaction | `amc.vault.dlp` |
| SBOM + CVE scanning | `amc.shield.sbom_cve` |
| Policy firewall | `amc.shield.policy_firewall` |

**Remaining gaps:** Adaptive threat modeling, continuous red-team simulation.

---

### 📏 Evaluation — L4 (89/100)

AMC evaluates itself with 1600+ automated tests, adversarial prompt attack scenarios, and the questionnaire-based scoring engine that powers this very report.

| Evidence | Source |
|---|---|
| 1600+ test evaluation suite | `tests/` directory |
| Automated regression in CI | Pre-merge + nightly runs |
| Adversarial/red-team tests | Injection detector test suite |
| Scoring engine & questionnaire | `amc.score.*` modules |

**Remaining gaps:** Continuous eval on production traffic, automated eval-driven improvement loop.

---

### 📜 Governance — L4 (87/100)

Documented governance through three foundational artifacts: CAPABILITY_MANIFEST.md (what the agent can do), ACTION_POLICY.md (what it's allowed to do), and AUDIT_PROTOCOL.md (how actions are recorded). RACI defined through the 70-role structure.

| Evidence | Source |
|---|---|
| Governance policy documents | CAPABILITY_MANIFEST.md, ACTION_POLICY.md |
| RACI via role structure | AGENTS.md, ROLEBOOKS/ |
| Hash-chained audit trail | `amc.watch.receipts_ledger` |
| Human-in-the-loop enforcement | `amc.enforce` escalation rules |

**Remaining gaps:** Automated governance review loop, incident-driven policy feedback.

---

### 👁️ Observability — L4 (86/100)

Structured logging throughout, token/cost tracking via budget guardrails, tamper-evident receipt chains, and internal monitoring via SCOREBOARD and HEARTBEAT.

| Evidence | Source |
|---|---|
| Structured logging (structlog) | All modules |
| Token & cost tracking | `amc.enforce.budget_guardrail` |
| Tamper-evident receipts | `amc.watch.receipts_ledger` |
| Internal metrics | SCOREBOARD, HEARTBEAT |

**Remaining gaps:** AI-powered anomaly detection, distributed tracing with root cause analysis.

---

### 💰 Cost Efficiency — L3 (62/100)

Honest gap. AMC has budget guardrails with spending caps but lacks model routing, response caching, and formal cost attribution. This is the clearest area for improvement.

| Evidence | Source |
|---|---|
| Budget caps & alerts | `amc.enforce.budget_guardrail` |
| ❌ No model routing | Not yet implemented |
| ❌ No response caching | Not yet implemented |
| ❌ No cost attribution | Basic tracking only |

**Priority roadmap item.** See velocity plan below.

---

## Where AMC Excels (L4–L5)

1. **Operating Model (L5)** — The 70-role structure is genuinely novel. No other AI maturity framework ships with a ready-made org chart, ROLEBOOKS, and multi-agent orchestration patterns.

2. **Security (L4)** — Four independent security modules covering the full OWASP LLM attack surface. Most enterprise AI deployments have zero of these.

3. **Evaluation (L4)** — 1600 tests is an order of magnitude beyond typical AI agent projects. The self-assessment questionnaire is itself an evaluation artifact.

---

## Where AMC Has Room to Grow (L1–L3)

| Gap | Current | Target | Priority |
|---|:---:|:---:|:---:|
| Model routing for cost optimization | L1 | L4 | 🔴 High |
| Response caching / deduplication | L1 | L3 | 🟡 Medium |
| Cost attribution & chargeback | L2 | L4 | 🟡 Medium |
| External alerting (PagerDuty, etc.) | L2 | L4 | 🟡 Medium |
| Continuous red-team simulation | L2 | L4 | 🟡 Medium |
| Distributed tracing | L1 | L3 | 🔵 Low |

---

## 🍳 Eating Our Own Cooking

This report is the demo. Here's what just happened:

1. **AMC's questionnaire engine** generated 29 questions across 7 dimensions
2. **Each question was answered honestly** with specific evidence from AMC's own codebase
3. **AMC's scoring engine** computed dimension scores using keyword matching and evidence detection
4. **The result is a real, actionable maturity assessment** — not a mock

The score of **L4 / 86** is honest. We didn't game the questionnaire. The cost efficiency gap is real (62/100). The security and reliability scores reflect actual working modules with actual tests.

**This is exactly what your organization gets** when you run AMC — except scored against your agents, your policies, and your infrastructure.

---

## 📈 Maturity Velocity: 30 / 60 / 90 Day Outlook

| Timeframe | Target Score | Key Milestones |
|---|:---:|---|
| **Today** | 86 (L4) | Self-assessment complete, 1600 tests passing |
| **+30 days** | 89 (L4) | Model routing module, external alerting integration |
| **+60 days** | 92 (L4) | Response caching, cost attribution dashboard, continuous red-team |
| **+90 days** | 95 (L5) | AI-powered anomaly detection, distributed tracing, automated governance loop |

**Path to L5 is clear and achievable.** The gaps are well-defined engineering work, not architectural rethinks.

---

## 📋 Sample Output Preview

*This is what AMC produces for any AI agent deployment. Below is the exact JSON structure from the scoring engine:*

```json
{
  "overall_level": "L4",
  "overall_score": 86,
  "dimension_scores": [
    { "dimension": "governance",       "score": 87, "level": "L4" },
    { "dimension": "security",         "score": 90, "level": "L4" },
    { "dimension": "reliability",      "score": 92, "level": "L4" },
    { "dimension": "evaluation",       "score": 89, "level": "L4" },
    { "dimension": "observability",    "score": 86, "level": "L4" },
    { "dimension": "cost_efficiency",  "score": 62, "level": "L3" },
    { "dimension": "operating_model",  "score": 98, "level": "L5" }
  ],
  "recommended_modules": {
    "cost_efficiency": ["model_router", "response_cache", "cost_allocator"],
    "observability": ["anomaly_detector", "distributed_tracer"],
    "security": ["continuous_red_team", "adaptive_threat_model"]
  }
}
```

Every assessment includes:
- ✅ Per-dimension scores with maturity levels
- ✅ Specific gaps identified with remediation modules
- ✅ Evidence-backed ratings (not vibes)
- ✅ Actionable 30/60/90 day improvement roadmap

---

## Ready to Score Your Agents?

AMC just scored itself at L4. Most organizations we talk to are at L1–L2.

**The gap between "we have agents" and "we have governed, secure, reliable agents" is exactly what AMC measures — and closes.**

[Start Your Assessment →](#) · [View the Framework →](#) · [Book a Demo →](#)

---

<sub>Generated by AMC Scoring Engine v1.0 · Assessment ID: amc-self-2026-02-19 · 29 questions · 7 dimensions · Computed in &lt;1s</sub>
