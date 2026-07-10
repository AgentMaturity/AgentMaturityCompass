# AFTER_FIRST_SCORE.md — What to do after your first AMC score

You ran `amc` and got a full score. This page explains the next moves without drowning you in every command AMC has.

---

## Step 1 — Understand the score

AMC scores trust maturity from **L0 to L5**.

High level:
- **L0 — Absent**: no demonstrated controls
- **L1 — Initial**: minimal, mostly manual controls
- **L2 — Developing**: repeatable controls with partial coverage
- **L3 — Defined**: systematic, documented, evidence-backed controls
- **L4 — Managed**: measured, proactive, proof-oriented controls
- **L5 — Optimizing**: continuously verified improvement

The score matters, but the score alone is not the point.

The point is:
- what gaps were found
- what evidence was observed
- what you should fix next

Read the two trust lines separately:

- **Artifact status** (`VALID`, `INVALID`, `UNSIGNED`) tells you whether the report and seal verify.
- **Evidence readiness** (`READY`, `LIMITED`, `INSUFFICIENT_EVIDENCE`, `UNVERIFIED`) tells you whether the evidence can support external claims.

A clean first run commonly reports `VALID` plus `INSUFFICIENT_EVIDENCE`. That is not a contradiction. Signing proves integrity, not evidence sufficiency. Only `READY` is claim-eligible.

---

## Step 2 — Inspect proof

Use the lifecycle evidence commands behind the score:

```bash
amc evidence lifecycle list
amc evidence episodes list
amc evidence decisions list
amc evidence observability list
```

These show the run artifact, evidence episode, recommendation receipts, component attribution, experience signals, and decision outcomes.

---

## Step 3 — Generate fixes

Use AMC to generate the next actions.

```bash
amc fix
```

Treat this as a starting point for implementation, not magic.

---

## Step 4 — Decide your next mode

After your first score, most users go into one of four modes.

### Mode A — Hardening

Focus on **Score**, **Shield**, and **Enforce**.

### Mode B — Observability

Focus on **Watch**, traces, anomalies, decision outcomes, and drift monitoring.

### Mode C — Governance / compliance

Focus on **Comply**, **Vault**, policy artifacts, and audit binders.

### Mode D — Scale

Focus on **Fleet**, score comparison, trust inventory, and portfolio reporting.

---

## Step 5 — Put it into CI if the score matters

If the score should affect releases, do not leave it as a one-off local ritual.

Start with:
- `.github/workflows/amc-score.yml`
- `docs/CI_TEMPLATES.md`

---

## Step 6 — Wrap your real agent if you have one

If you tested AMC on a toy path first, wrap the real agent runtime next.

```bash
amc wrap <adapter> -- <your command>
```

That is how you move from exploratory scoring into execution evidence.

---

## Product Family

- **Score** — maturity score and gap analysis
- **Shield** — red-team and assurance packs
- **Enforce** — action governance and approvals
- **Vault** — cryptographic proof and evidence integrity
- **Watch** — traces, anomalies, monitoring, and decision observability
- **Comply** — framework mapping and audit reporting
- **Fleet** — multi-agent comparison and governance
- **Passport** — portable trust identity artifacts
