# AMC Quickstart Guide
> Get your AI Maturity Composite score in under 5 minutes.

---

## 1. What is AMC?

**Technical:** The AI Maturity Composite (AMC) is a standardized framework that scores your organization's AI operations across 7 dimensions on a 0–100 scale. It ingests questionnaire responses, telemetry, and policy artifacts, then returns a weighted composite score with per-dimension breakdowns and actionable recommendations.

**ELI5:** AMC is like a report card for how well your company uses AI. Answer some questions, get a score, and find out exactly where to improve.

---

## 2. Platform-Agnostic Path (REST API)

Works everywhere — just need `curl` and an API key.

### Step 1: Submit your answers

```bash
curl -X POST https://api.amc.dev/api/v1/score/session \
  -H "Authorization: Bearer $AMC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org": "acme-corp",
    "answers": [
      { "dimension": "governance",       "q": "GOV_01", "value": 3 },
      { "dimension": "security",         "q": "SEC_01", "value": 4 },
      { "dimension": "reliability",      "q": "REL_01", "value": 2 },
      { "dimension": "evaluation",       "q": "EVL_01", "value": 3 },
      { "dimension": "observability",    "q": "OBS_01", "value": 4 },
      { "dimension": "cost_efficiency",  "q": "CST_01", "value": 2 },
      { "dimension": "operating_model",  "q": "OPS_01", "value": 3 }
    ]
  }'
```

> **ELI5:** You're sending your answers to the AMC server. Each answer maps to one of the 7 areas AMC measures. The server does the math and sends back your score.

### Step 2: Read the response

```json
{
  "sessionId": "sess_abc123",
  "compositeScore": 58,
  "level": "L3",
  "levelLabel": "Managed",
  "dimensions": {
    "governance":       { "score": 62, "level": "L3" },
    "security":         { "score": 71, "level": "L3" },
    "reliability":      { "score": 45, "level": "L2" },
    "evaluation":       { "score": 55, "level": "L3" },
    "observability":    { "score": 68, "level": "L3" },
    "cost_efficiency":  { "score": 40, "level": "L2" },
    "operating_model":  { "score": 65, "level": "L3" }
  },
  "recommendations": [
    "Reliability and Cost Efficiency are dragging your composite down — start there."
  ]
}
```

> **ELI5:** Your overall score is 58/100 (Level 3 — "Managed"). The breakdown shows which areas are strong and which need work. The `recommendations` array tells you what to fix first.

---

## 3. Platform-Specific Shortcuts

### OpenClaw

```bash
openclaw skill install amc && openclaw amc assess
```

### NanoClaw

```bash
nanoclaw add amc --minimal && nanoclaw amc run
```

### ZeroClaw

```bash
zeroclaw init --with amc && zeroclaw assess
```

### TrustClaw

```bash
trustclaw integrate amc --security-mode strict && trustclaw amc scan
```

### Python SDK

```bash
pip install amc-sdk
```

```python
from amc_sdk import AMCClient

client = AMCClient(api_key="your-key")
result = client.assess(org="acme-corp", interactive=True)
print(f"Score: {result.composite_score} — Level: {result.level_label}")
```

> **ELI5:** Pick whichever tool you already use. One or two commands and you're done — no curl needed.

---

## 4. Understanding Your Score

### 7 Dimensions

| Dimension | What it measures |
|---|---|
| **Governance** | Policies, roles, approval workflows for AI usage |
| **Security** | Data protection, model access controls, prompt injection defenses |
| **Reliability** | Uptime, fallback strategies, graceful degradation |
| **Evaluation** | Testing, benchmarks, regression detection for models |
| **Observability** | Logging, tracing, alerting across the AI stack |
| **Cost Efficiency** | Spend tracking, model routing, waste reduction |
| **Operating Model** | Team structure, on-call, deployment processes |

### 5 Maturity Levels

| Level | Label | Score Range | What it means |
|---|---|---|---|
| **L1** | Ad-hoc | 0 – 29 | No repeatable process; hero-dependent |
| **L2** | Defined | 30 – 54 | Documented but inconsistent |
| **L3** | Managed | 55 – 79 | Consistent, measured, improving |
| **L4** | Optimized | 80 – 94 | Data-driven continuous improvement |
| **L5** | Autonomous | 95 – 100 | Self-healing, policy-as-code, minimal manual intervention |

> **ELI5:** Think of levels like school grades. L1 = winging it, L3 = solid B student, L5 = the system practically runs itself.

---

## 5. Next Steps

- **Deep-dive into each dimension** → [DIMENSIONS.md](./DIMENSIONS.md)
- **Concrete improvement playbooks** → [HOW_TO_IMPROVE.md](./HOW_TO_IMPROVE.md)
- **Full API reference** → [API.md](./API.md)

---

*Generated for AMC OS • See [DIMENSIONS.md](./DIMENSIONS.md) for full scoring methodology.*
