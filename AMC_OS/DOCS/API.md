# AMC API Reference

> **Base URL:** `https://api.amc.example.com/api/v1`  
> **Version:** 1.0  
> **Auth:** Bearer token via `Authorization` header

---

## Authentication

All endpoints require a Bearer token:

```
Authorization: Bearer <token>
```

Obtain tokens via the AMC dashboard or OAuth2 client-credentials flow.

---

## Models

### DimensionScore

| Field | Type | Description |
|---|---|---|
| `dimension` | `str` | Dimension key (e.g. `"governance"`, `"security"`) |
| `score` | `float` | 0–100 |
| `level` | `str` | `"L1"` – `"L5"` |
| `level_name` | `str` | Human label (see table below) |
| `question_scores` | `dict[str, float]` | Per-question scores, e.g. `{"gov_1": 80}` |
| `recommendations` | `list[str]` | Actionable improvement items |

**Maturity Levels:**

| Level | Name |
|---|---|
| L1 | Ad-hoc |
| L2 | Defined |
| L3 | Managed |
| L4 | Optimized |
| L5 | Autonomous & Self-Improving |

### CompositeScore

| Field | Type | Description |
|---|---|---|
| `composite_score` | `float` | Weighted aggregate 0–100 |
| `composite_level` | `str` | `"L1"` – `"L5"` |
| `composite_level_name` | `str` | Human label |
| `dimensions` | `list[DimensionScore]` | Per-dimension breakdown |
| `timestamp` | `str` | ISO 8601 datetime |
| `session_id` | `str` | Unique session identifier |

### Evidence Trust Multipliers

| Trust Level | Multiplier |
|---|---|
| `KEYWORD_CLAIM` | 40% |
| `CODE_PRESENT` | 55% |
| `IMPORT_VERIFIED` | 70% |
| `EXECUTION_VERIFIED` | 100% |
| `CONTINUOUS_VERIFIED` | 110% |

### Question IDs

| Dimension | IDs |
|---|---|
| Governance | `gov_1` – `gov_7` |
| Security | `sec_1` – `sec_6` |
| Reliability | `rel_1` – `rel_6` |
| Evaluation | `eval_1` – `eval_6` |
| Observability | `obs_1` – `obs_6` |
| Cost | `cost_1` – `cost_6` |
| Operations | `ops_1` – `ops_7` |

---

## Endpoints

### 1. POST `/api/v1/score/session`

Submit questionnaire answers and receive a CompositeScore.

**Request Body:**

```json
{
  "answers": {
    "gov_1": 80,
    "gov_2": 60,
    "gov_3": 70,
    "gov_4": 50,
    "gov_5": 90,
    "gov_6": 40,
    "gov_7": 75,
    "sec_1": 85,
    "sec_2": 70,
    "sec_3": 60,
    "sec_4": 55,
    "sec_5": 90,
    "sec_6": 80,
    "rel_1": 70,
    "rel_2": 65,
    "rel_3": 80,
    "rel_4": 75,
    "rel_5": 60,
    "rel_6": 85,
    "eval_1": 50,
    "eval_2": 60,
    "eval_3": 70,
    "eval_4": 55,
    "eval_5": 65,
    "eval_6": 80,
    "obs_1": 90,
    "obs_2": 85,
    "obs_3": 70,
    "obs_4": 60,
    "obs_5": 75,
    "obs_6": 80,
    "cost_1": 40,
    "cost_2": 55,
    "cost_3": 60,
    "cost_4": 70,
    "cost_5": 50,
    "cost_6": 65,
    "ops_1": 80,
    "ops_2": 75,
    "ops_3": 70,
    "ops_4": 85,
    "ops_5": 60,
    "ops_6": 90,
    "ops_7": 55
  },
  "metadata": {
    "org_name": "Acme Corp",
    "assessor": "jane@acme.com"
  }
}
```

**curl:**

```bash
curl -X POST https://api.amc.example.com/api/v1/score/session \
  -H "Authorization: Bearer $AMC_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "answers": {
      "gov_1": 80, "gov_2": 60, "gov_3": 70, "gov_4": 50,
      "gov_5": 90, "gov_6": 40, "gov_7": 75,
      "sec_1": 85, "sec_2": 70, "sec_3": 60,
      "sec_4": 55, "sec_5": 90, "sec_6": 80,
      "rel_1": 70, "rel_2": 65, "rel_3": 80,
      "rel_4": 75, "rel_5": 60, "rel_6": 85,
      "eval_1": 50, "eval_2": 60, "eval_3": 70,
      "eval_4": 55, "eval_5": 65, "eval_6": 80,
      "obs_1": 90, "obs_2": 85, "obs_3": 70,
      "obs_4": 60, "obs_5": 75, "obs_6": 80,
      "cost_1": 40, "cost_2": 55, "cost_3": 60,
      "cost_4": 70, "cost_5": 50, "cost_6": 65,
      "ops_1": 80, "ops_2": 75, "ops_3": 70,
      "ops_4": 85, "ops_5": 60, "ops_6": 90, "ops_7": 55
    }
  }'
```

**Response `200 OK`:**

```json
{
  "composite_score": 69.4,
  "composite_level": "L3",
  "composite_level_name": "Managed",
  "dimensions": [
    {
      "dimension": "governance",
      "score": 66.4,
      "level": "L3",
      "level_name": "Managed",
      "question_scores": {
        "gov_1": 80, "gov_2": 60, "gov_3": 70,
        "gov_4": 50, "gov_5": 90, "gov_6": 40, "gov_7": 75
      },
      "recommendations": [
        "Formalize AI governance committee with quarterly review cadence",
        "Establish written model-approval policy for production deployments"
      ]
    },
    {
      "dimension": "security",
      "score": 73.3,
      "level": "L3",
      "level_name": "Managed",
      "question_scores": {
        "sec_1": 85, "sec_2": 70, "sec_3": 60,
        "sec_4": 55, "sec_5": 90, "sec_6": 80
      },
      "recommendations": [
        "Implement prompt-injection detection middleware",
        "Add automated secret-scanning in CI pipelines"
      ]
    },
    {
      "dimension": "reliability",
      "score": 72.5,
      "level": "L3",
      "level_name": "Managed",
      "question_scores": {
        "rel_1": 70, "rel_2": 65, "rel_3": 80,
        "rel_4": 75, "rel_5": 60, "rel_6": 85
      },
      "recommendations": [
        "Define SLOs for model-inference latency and availability"
      ]
    },
    {
      "dimension": "evaluation",
      "score": 63.3,
      "level": "L3",
      "level_name": "Managed",
      "question_scores": {
        "eval_1": 50, "eval_2": 60, "eval_3": 70,
        "eval_4": 55, "eval_5": 65, "eval_6": 80
      },
      "recommendations": [
        "Build automated eval-suite with regression benchmarks",
        "Track eval metrics per model version in a central registry"
      ]
    },
    {
      "dimension": "observability",
      "score": 76.7,
      "level": "L4",
      "level_name": "Optimized",
      "question_scores": {
        "obs_1": 90, "obs_2": 85, "obs_3": 70,
        "obs_4": 60, "obs_5": 75, "obs_6": 80
      },
      "recommendations": [
        "Add trace-level correlation IDs across agent pipelines"
      ]
    },
    {
      "dimension": "cost",
      "score": 56.7,
      "level": "L2",
      "level_name": "Defined",
      "question_scores": {
        "cost_1": 40, "cost_2": 55, "cost_3": 60,
        "cost_4": 70, "cost_5": 50, "cost_6": 65
      },
      "recommendations": [
        "Implement per-team token-usage budgets with alerting",
        "Evaluate caching layers for repeated prompts"
      ]
    },
    {
      "dimension": "operations",
      "score": 73.6,
      "level": "L3",
      "level_name": "Managed",
      "question_scores": {
        "ops_1": 80, "ops_2": 75, "ops_3": 70,
        "ops_4": 85, "ops_5": 60, "ops_6": 90, "ops_7": 55
      },
      "recommendations": [
        "Automate rollback procedures for model deployments"
      ]
    }
  ],
  "timestamp": "2026-02-19T05:08:00Z",
  "session_id": "sess_a1b2c3d4e5f6"
}
```

---

### 2. POST `/api/v1/score/evidence`

Submit evidence artifacts for evidence-based scoring. Trust multipliers are applied based on evidence quality.

**Request Body:**

```json
{
  "session_id": "sess_a1b2c3d4e5f6",
  "evidence": [
    {
      "dimension": "security",
      "question_id": "sec_1",
      "artifact_type": "CODE_PRESENT",
      "artifact_url": "https://github.com/acme/repo/blob/main/security/prompt_filter.py",
      "description": "Prompt injection filter middleware"
    },
    {
      "dimension": "observability",
      "question_id": "obs_1",
      "artifact_type": "EXECUTION_VERIFIED",
      "artifact_url": "https://grafana.acme.internal/d/ai-dashboard",
      "description": "Live Grafana dashboard with model latency and error-rate panels"
    },
    {
      "dimension": "governance",
      "question_id": "gov_5",
      "artifact_type": "KEYWORD_CLAIM",
      "description": "We have a governance committee that meets quarterly"
    }
  ]
}
```

**curl:**

```bash
curl -X POST https://api.amc.example.com/api/v1/score/evidence \
  -H "Authorization: Bearer $AMC_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess_a1b2c3d4e5f6",
    "evidence": [
      {
        "dimension": "security",
        "question_id": "sec_1",
        "artifact_type": "CODE_PRESENT",
        "artifact_url": "https://github.com/acme/repo/blob/main/security/prompt_filter.py",
        "description": "Prompt injection filter middleware"
      },
      {
        "dimension": "observability",
        "question_id": "obs_1",
        "artifact_type": "EXECUTION_VERIFIED",
        "artifact_url": "https://grafana.acme.internal/d/ai-dashboard",
        "description": "Live Grafana dashboard"
      }
    ]
  }'
```

**Response `200 OK`:**

```json
{
  "composite_score": 72.1,
  "composite_level": "L3",
  "composite_level_name": "Managed",
  "dimensions": [
    {
      "dimension": "security",
      "score": 78.6,
      "level": "L4",
      "level_name": "Optimized",
      "question_scores": {
        "sec_1": 46.75,
        "sec_2": 70, "sec_3": 60,
        "sec_4": 55, "sec_5": 90, "sec_6": 80
      },
      "recommendations": [
        "Upgrade sec_1 evidence to EXECUTION_VERIFIED for full trust credit"
      ]
    },
    {
      "dimension": "observability",
      "score": 80.0,
      "level": "L4",
      "level_name": "Optimized",
      "question_scores": {
        "obs_1": 90.0,
        "obs_2": 85, "obs_3": 70,
        "obs_4": 60, "obs_5": 75, "obs_6": 80
      },
      "recommendations": []
    },
    {
      "dimension": "governance",
      "score": 64.9,
      "level": "L3",
      "level_name": "Managed",
      "question_scores": {
        "gov_1": 80, "gov_2": 60, "gov_3": 70,
        "gov_4": 50, "gov_5": 36.0, "gov_6": 40, "gov_7": 75
      },
      "recommendations": [
        "Provide verifiable evidence for gov_5 to increase trust multiplier"
      ]
    }
  ],
  "timestamp": "2026-02-19T05:10:00Z",
  "session_id": "sess_a1b2c3d4e5f6"
}
```

> **Note:** Evidence scoring adjusts the self-reported question score by the trust multiplier. For example, a self-reported `sec_1: 85` with `CODE_PRESENT` (55%) evidence yields `85 × 0.55 = 46.75`. Scores with `EXECUTION_VERIFIED` (100%) keep their full value; `CONTINUOUS_VERIFIED` (110%) can boost above self-reported.

---

### 3. GET `/api/v1/shield/status`

Returns the current status of the AMC security module (Shield).

**curl:**

```bash
curl -X GET https://api.amc.example.com/api/v1/shield/status \
  -H "Authorization: Bearer $AMC_TOKEN"
```

**Response `200 OK`:**

```json
{
  "module": "shield",
  "status": "active",
  "version": "1.2.0",
  "checks": {
    "prompt_injection_filter": "enabled",
    "output_sanitizer": "enabled",
    "pii_redaction": "enabled",
    "secret_scanning": "enabled"
  },
  "last_scan": "2026-02-19T04:00:00Z",
  "threats_blocked_24h": 14
}
```

---

### 4. GET `/api/v1/enforce/status`

Returns the current status of the policy enforcement module.

**curl:**

```bash
curl -X GET https://api.amc.example.com/api/v1/enforce/status \
  -H "Authorization: Bearer $AMC_TOKEN"
```

**Response `200 OK`:**

```json
{
  "module": "enforce",
  "status": "active",
  "version": "1.1.0",
  "policies_loaded": 12,
  "policies_enforced": 12,
  "last_policy_update": "2026-02-18T22:30:00Z",
  "violations_24h": 3,
  "mode": "enforce"
}
```

---

### 5. GET `/api/v1/vault/status`

Returns the current status of the secret management module (Vault).

**curl:**

```bash
curl -X GET https://api.amc.example.com/api/v1/vault/status \
  -H "Authorization: Bearer $AMC_TOKEN"
```

**Response `200 OK`:**

```json
{
  "module": "vault",
  "status": "active",
  "version": "1.0.3",
  "secrets_managed": 47,
  "rotation_policy": "90d",
  "last_rotation": "2026-01-20T00:00:00Z",
  "next_rotation": "2026-04-20T00:00:00Z",
  "encryption": "AES-256-GCM"
}
```

---

## Error Codes

| Code | Name | Description |
|---|---|---|
| `400` | Bad Request | Malformed JSON or missing required fields. |
| `401` | Unauthorized | Missing or invalid Bearer token. |
| `403` | Forbidden | Token lacks required scope for this endpoint. |
| `404` | Not Found | Endpoint or referenced resource (e.g. session_id) does not exist. |
| `422` | Unprocessable Entity | Valid JSON but semantic errors (e.g. unknown question IDs, scores out of range). |
| `429` | Too Many Requests | Rate limit exceeded. Retry after `Retry-After` header value. |
| `500` | Internal Server Error | Unexpected server failure. Contact support with the `X-Request-Id` header value. |

**Error Response Shape:**

```json
{
  "error": {
    "code": 422,
    "message": "Unknown question ID: gov_99",
    "request_id": "req_x7y8z9"
  }
}
```

**curl example — 401 response:**

```bash
curl -X GET https://api.amc.example.com/api/v1/shield/status
# No Authorization header
```

```json
{
  "error": {
    "code": 401,
    "message": "Missing or invalid Authorization header",
    "request_id": "req_abc123"
  }
}
```

---

## Rate Limits

| Tier | Requests/min | Burst |
|---|---|---|
| Free | 10 | 20 |
| Pro | 100 | 200 |
| Enterprise | 1000 | 2000 |

Rate-limited responses include `Retry-After` (seconds) and `X-RateLimit-Remaining` headers.
