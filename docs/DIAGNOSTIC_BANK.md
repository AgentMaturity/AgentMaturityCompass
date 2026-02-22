# Diagnostic Bank (5 Dimensions, 89 Questions)

AMC diagnostic bank is a signed, explicit rubric built from the live question bank in `src/diagnostic/questionBank.ts`.

Files:
- `.amc/diagnostic/bank/bank.yaml`
- `.amc/diagnostic/bank/bank.yaml.sig`

Commands:

```bash
amc diagnostic bank init
amc diagnostic bank verify
amc diagnostic render --agent default --format md
```

Hard guarantees:
- exactly 5 dimensions
- exactly 89 questions
- each question has 6 rubric levels (`0..5`)
- each question has explicit evidence mapping and minimum coverage logic

Scoring model:
- agents cannot submit scores or override answers
- scores are derived from OBSERVED/ATTESTED evidence gates
- missing evidence yields `UNKNOWN` and applies conservative score caps
- SELF_REPORTED telemetry cannot increase high-trust maturity tiers

Contextualization:
- question semantics remain fixed
- phrasing/examples are adapted by agent profile (`code-agent` / `support-agent` / `ops-agent` / `research-agent` / `sales-agent` / `other`)

Studio API endpoints:
- `GET /diagnostic/bank`
- `GET /diagnostic/bank/verify`
- `POST /diagnostic/bank/apply`
- `GET /diagnostic/render?agentId=<id>`

Auth model:
- `/diagnostic/bank*` and `/diagnostic/render` use session/admin-token auth with RBAC.
- `/diagnostic/self-run` is lease-auth only (`diagnostic:self-run` scope). Any submitted answer payload is ignored; scoring is evidence-derived server-side.

Lightweight score API (`/api/v1/*`, operational surface):
- `GET /api/v1/score/status`
- `POST /api/v1/score/session`
- `GET /api/v1/score/question/:sessionId`
- `POST /api/v1/score/answer`
- `GET /api/v1/score/result/:sessionId`
