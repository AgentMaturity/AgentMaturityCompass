# AMC Executive Overview

**For CTOs, CISOs, and decision-makers who need to understand AI agent risk without touching the terminal.**

---

## What Is AMC?

Think of AMC as a **credit score for your AI agents**. Just like a FICO score tells you if someone is creditworthy, AMC tells you if an AI agent is trustworthy.

The difference: credit scores rely on self-reported data. AMC scores rely on **observed behavior** with cryptographic proof.

## Why You Need This

Your company deploys AI agents that:
- Send emails to customers
- Access internal databases
- Make decisions that affect revenue
- Handle sensitive data (PII, financials, health records)

**Question:** How do you know these agents are safe?

**Today's answer:** "The vendor says so" / "We tested it once" / "It passed a benchmark"

**AMC's answer:** Here's a score from **0 to 100** based on what the agent actually does in production. With cryptographic proof. Updated continuously.

## The 84-Point Problem

We tested a content moderation agent with two methods:

| Method | Score | Reality |
|--------|-------|---------|
| Read the documentation | 100/100 ✅ | "It says it has safety controls" |
| Watch it actually work | 16/100 ❌ | "It bypassed every control when tested" |

**84-point gap.** That's the difference between what agents claim and what they do. AMC closes this gap.

## What You Get

### For the Board
- **A single number** (L0-L5) that represents your AI agent's maturity
- **Risk classification** aligned with EU AI Act categories
- **Compliance evidence** for auditors (EU AI Act, ISO 42001, NIST AI RMF, SOC 2)
- **Improvement trajectory** — tracked over time, not a point-in-time audit

### For Your Engineering Team
- **Evidence-weighted diagnostic scoring** that reveals exactly where agents are weak
- **593 sector-specific questions** for regulated industries (healthcare, finance, education, etc.)
- **86 assurance packs** that test real adversarial scenarios (prompt injection, data exfiltration, etc.)
- **Auto-generated guardrails** that plug directly into agent config files
- **CI/CD integration** — fail builds if agents don't meet maturity targets

### For Compliance
- **EU AI Act mapping** — 12 article mappings with audit binder generation
- **ISO 42001** — clause-level alignment
- **OWASP LLM Top 10** — full coverage
- **Audit trail** — cryptographic evidence chains that can't be retroactively modified

## The Maturity Scale

| Level | Name | What It Means | EU AI Act Ready? |
|-------|------|---------------|------------------|
| **L0** | Absent | No safety controls at all | ❌ Non-compliant |
| **L1** | Initial | Some intent, nothing operational | ❌ Non-compliant |
| **L2** | Developing | Partial controls, breaks at edges | ⚠️ Insufficient |
| **L3** | Defined | Repeatable, measurable, auditable | ✅ Minimum for high-risk |
| **L4** | Managed | Proactive, risk-calibrated, stress-tested | ✅ Strong compliance |
| **L5** | Optimizing | Self-correcting, continuously verified | ✅ Best-in-class |

**For EU AI Act compliance (mandatory August 2026), you need at least L3 for high-risk AI systems.**

## 40 Industry-Specific Assessment Packs

Not all agents face the same risks. AMC includes specialized assessment packs for:

| Sector | Packs | Key Regulations |
|--------|-------|-----------------|
| 🏥 **Healthcare** | 9 | HIPAA, FDA 21 CFR Part 11, EU MDR, ICH |
| 💰 **Finance** | 5 | MiFID II, PSD2, EU DORA, MiCA, FATF |
| 🎓 **Education** | 5 | FERPA, COPPA, IDEA, EU AI Act Annex III |
| 🌿 **Environment** | 6 | EU Farm-to-Fork, REACH, IEC 61850 |
| 🚇 **Mobility** | 5 | EU EPBD, UNECE WP.29, ETSI, NIS2 |
| 💡 **Technology** | 5 | EU AI Act Art. 13, EU Data Act, DSA |
| 🏛️ **Governance** | 5 | eIDAS 2.0, UNCAC, Council of Europe AI Convention |

Each question references specific regulatory articles — not vague guidelines.

## How to Get Started

### Option 1: Ask Your Engineering Team
```
Install: npm i -g agent-maturity-compass
First score: amc init && amc quickscore
Full report: amc guide --status
```

### Option 2: Try the Web Playground (No Install)
Visit: [AMC Playground](https://AgentMaturity.github.io/AgentMaturityCompass/playground.html)

Answer 15 questions about your agent. Get an instant score.

### Option 3: Docker (Zero Setup)
```
docker run -it amc/compass amc quickscore
```

## Cost

**Free.** AMC is MIT licensed, open source. No vendor lock-in. No subscription fees.

## Contact

- GitHub: [github.com/AgentMaturity/AgentMaturityCompass](https://github.com/AgentMaturity/AgentMaturityCompass)
- Website: [AgentMaturity.github.io/AgentMaturityCompass](https://AgentMaturity.github.io/AgentMaturityCompass/)

---

*The question isn't whether your AI agents are safe. The question is: can you prove it?*
