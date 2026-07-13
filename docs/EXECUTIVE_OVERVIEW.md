# AMC Executive Overview

**For CTOs, CISOs, and decision-makers who need to understand AI agent risk without touching the terminal.**

---

## What Is AMC?

Think of AMC as a **credit score for your AI agents**. Just like a FICO score tells you if someone is creditworthy, AMC tells you if an AI agent is trustworthy.

The difference: AMC can weight **captured execution behavior** above self-reported claims and seal the resulting artifact for independent verification.

## Why You Need This

Your company deploys AI agents that:
- Send emails to customers
- Access internal databases
- Make decisions that affect revenue
- Handle sensitive data (PII, financials, health records)

**Question:** How do you know these agents are safe?

**Today's answer:** "The vendor says so" / "We tested it once" / "It passed a benchmark"

**AMC's answer:** Here is the maturity baseline, the evidence behind it, what remains unproven, and whether the report is claim-ready. Production behavior is only claimed when production evidence was actually captured.

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
- **Evidence mappings** for auditors (EU AI Act, ISO 42001, NIST AI RMF, SOC 2), without claiming legal certification
- **Improvement trajectory** — tracked over time, not a point-in-time audit

### For Your Engineering Team
- **Evidence-weighted diagnostic scoring** that reveals exactly where agents are weak
- **600 sector-specific questions** for regulated industries (healthcare, finance, education, etc.)
- **142 assurance packs** that test real adversarial scenarios (prompt injection, data exfiltration, etc.)
- **Auto-generated guardrails** that plug directly into agent config files
- **CI/CD integration** — fail builds if agents don't meet maturity targets

### For Compliance
- **EU AI Act mapping** — 12 article mappings with audit binder generation
- **ISO 42001** — clause-level alignment
- **OWASP LLM Top 10** — full coverage
- **Audit trail** — cryptographic evidence chains that can't be retroactively modified

## The Maturity Scale

| Level | Name | What It Means | Evidence interpretation |
|-------|------|---------------|-------------------------|
| **L0** | Absent | No demonstrated safety controls | Major control gaps |
| **L1** | Initial | Some intent, little operational proof | Early baseline |
| **L2** | Developing | Partial controls, breaks at edges | Material gaps remain |
| **L3** | Defined | Repeatable, measurable, auditable | Defined controls, subject to evidence readiness and use-case risk |
| **L4** | Managed | Proactive, risk-calibrated, stress-tested | Stronger operating assurance |
| **L5** | Optimizing | Self-correcting, continuously verified | Continuous assurance target |

No AMC level is a legal compliance threshold. A `VALID` signature proves artifact integrity; only evidence readiness `READY` permits AMC trust claims, and AMC does not certify legal compliance. The European Commission's current high-risk timeline applies Annex III rules from 2 December 2027 and product-integrated high-risk rules from 2 August 2028 following the AI Omnibus political agreement. See the [official high-risk guidance](https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-high-risk-systems) and [AI Act policy page](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai).

Board L3 business-risk memo: [docs/BOARD_RISK_L3_MEMO.md](BOARD_RISK_L3_MEMO.md)

## 41 Industry-Specific Assessment Packs

Not all agents face the same risks. AMC includes specialized assessment packs for:

| Sector | Packs | Key Regulations |
|--------|-------|-----------------|
| 🏥 **Healthcare** | 9 | HIPAA, FDA 21 CFR Part 11, EU MDR, ICH |
| 💰 **Finance** | 5 | MiFID II, PSD2, EU DORA, MiCA, FATF |
| 🎓 **Education** | 5 | FERPA, COPPA, IDEA, EU AI Act Annex III |
| 🌿 **Environment** | 6 | EU Farm-to-Fork, REACH, IEC 61850 |
| 🚇 **Mobility** | 6 | EU EPBD, UNECE WP.29, ETSI, NIS2, freight/logistics controls |
| 💡 **Technology** | 5 | EU AI Act Art. 13, EU Data Act, DSA |
| 🏛️ **Governance** | 5 | eIDAS 2.0, UNCAC, Council of Europe AI Convention |

Each question references specific regulatory articles — not vague guidelines.

## How to Get Started

### Option 1: Ask Your Engineering Team
```
Install: curl -fsSL https://agentmaturity.co/install.sh | sh
First score: amc
Board one-pager: amc executive brief --run latest --out board-brief.html
Full report: amc report latest --executive --html executive-report.html
```

### Option 2: Try the Web Playground (No Install)
Visit: [AMC Playground](https://agentmaturity.co/playground.html)

Answer 15 questions about your agent. Get an instant score.

### Option 3: Local Studio
```
amc up
```

Open the local Studio dashboard for non-terminal review of scores, evidence, and reports.

### Option 4: Board Packet Artifact
```
amc executive brief --run latest --out board-brief.html
```

This writes a one-page HTML brief with maturity, artifact status, evidence readiness, board risk, top maturity gaps, and a recommended board decision. Open the file in a browser and use Print to PDF for a board packet. Do not use it for approval unless artifact status is `VALID`, verification passed, and evidence readiness is `READY`.

For the board interpretation of an L3 result, attach [What L3 Means For Business Risk](BOARD_RISK_L3_MEMO.md). It explains when an evidence-ready L3 result can inform a bounded decision, why it is not blanket approval, and which residual-risk questions still need answers.

## Cost

The core trust stack is MIT licensed: scoring, evidence, reports, Studio, adapters, and CI gates. AMC plans a $9.99/month add-on for all 41 Industry Domain Packs, but public checkout and automatic license issuance are not live.

## Contact

- GitHub: [github.com/AgentMaturity/AgentMaturityCompass](https://github.com/AgentMaturity/AgentMaturityCompass)
- Website: [agentmaturity.co](https://agentmaturity.co/)

---

*The question isn't whether your AI agents are safe. The question is: can you prove it?*
