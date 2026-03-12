# AFTER_QUICKSCORE.md — What to do after your first AMC score

You ran `quickscore`. Good. Now what?

This page explains the next moves without drowning you in every command AMC has.

---

## Step 1 — Understand the score

AMC scores trust maturity from **L0 to L5**.

High level:
- **L0** — dangerous / absent controls
- **L1** — minimal controls
- **L2** — developing / works on happy path
- **L3** — repeatable, measurable, auditable
- **L4** — managed, proactive, proof-oriented
- **L5** — optimizing, continuously verified

The score matters, but the score alone is not the point.

The point is:
- what gaps were found
- what evidence was observed
- what you should fix next

---

## Step 2 — Read the gap list, not just the number

A pretty number can lie.
The gap list is where the useful work starts.

Look for:
- weak controls
- missing evidence
- missing policies
- low observability
- fragile compliance posture
- mismatch between claimed capability and observed behavior

Ask:
- which gaps are real risk?
- which gaps are fast wins?
- which gaps block release/compliance?

---

## Step 3 — Generate fixes

Use AMC to generate the next actions.

Typical next command:

```bash
amc fix
```

What to expect:
- guardrail suggestions
- CI/workflow ideas
- documentation outputs
- remediation direction

Treat this as a starting point for implementation, not magic.

---

## Step 4 — Decide your next mode

After your first score, most users go into one of four modes.

### Mode A — Hardening
You want to fix the trust gaps.

Focus on:
- **Score**
- **Shield**
- **Enforce**

### Mode B — Observability
You want to understand behavior over time.

Focus on:
- **Watch**
- traces
- anomaly review
- drift monitoring

### Mode C — Governance / compliance
You need evidence for audits or regulated delivery.

Focus on:
- **Comply**
- **Vault**
- policy artifacts
- audit binders

### Mode D — Scale
You need to compare or govern more than one agent.

Focus on:
- **Fleet**
- score comparison
- trust inventory
- portfolio reporting

---

## Step 5 — Put it into CI if the score matters

If the score should affect releases, don’t leave it as a one-off local ritual.

Move to:
- GitHub Actions
- score thresholds
- fail-on-drop workflows
- PR comments and uploaded artifacts

Start with:
- `.github/workflows/amc-score.yml`
- `docs/CI_TEMPLATES.md`

---

## Step 6 — Wrap your real agent if you have one

If you tested AMC on a toy path first, the next move is to wrap the real agent runtime.

```bash
amc wrap <adapter> -- <your command>
```

Examples:
- LangChain
- CrewAI
- AutoGen
- OpenAI Agents SDK
- Claude Code
- OpenClaw
- generic CLI agents

This is how you move from exploratory scoring into execution evidence.

---

## Product family cheat sheet

- **Score** — maturity score and gap analysis
- **Shield** — red-team and assurance packs
- **Enforce** — action governance and approvals
- **Vault** — cryptographic proof and evidence integrity
- **Watch** — traces, anomalies, and monitoring
- **Fleet** — multi-agent comparison and governance
- **Passport** — portable trust identity artifacts
- **Comply** — framework mapping and audit reporting

---

## Recommended next actions by score band

## If you are L0–L1
Do not obsess over advanced reporting yet.

Priorities:
1. basic controls
2. obvious hardening
3. repeatable scoring
4. one CI gate

## If you are L2
You are in the danger zone where teams often think they are “basically fine.”

Priorities:
1. improve evidence quality
2. add Shield packs
3. add Watch workflows
4. tighten policy and approvals

## If you are L3
Now optimize governance and proof quality.

Priorities:
1. stronger assurance coverage
2. compliance artifacts
3. better monitoring and drift detection
4. team workflows / Fleet

## If you are L4–L5
You are likely tuning for repeatability, scale, and defensibility.

Priorities:
1. benchmark rigor
2. fleet governance
3. portability / Passport
4. enterprise-grade evidence workflows

---

## Honest scope reminder

AMC can show you a lot. Do not try to operationalize everything at once.

A sane sequence is:
1. score
2. fix
3. CI gate
4. traces / monitoring
5. assurance packs
6. compliance outputs
7. fleet governance

---

## Read next

- `docs/START_HERE.md`
- `docs/QUICKSTART.md`
- `docs/ADAPTERS.md`
- `docs/CI_TEMPLATES.md`
- `docs/HARDENING.md`
