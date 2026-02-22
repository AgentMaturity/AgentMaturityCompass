# Diagnostic Bank (5 Dimensions, 67 Questions)

AMC diagnostic bank is a signed, explicit 67-question rubric for agents.

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
- exactly 67 questions
- each question has 6 rubric levels (0..5)
- each question has explicit evidence mapping and minimum coverage logic

Scoring model:
- agents cannot submit scores or override answers
- scores are derived from OBSERVED/ATTESTED evidence
- missing evidence yields `UNKNOWN` and score is capped low (<=1)
- SELF_REPORTED telemetry cannot increase maturity

Contextualization:
- question semantics remain fixed
- only phrasing/examples are adapted by agent profile (code/support/ops/research/sales/other)

API:
- `GET /api/diagnostic/bank`
- `GET /api/diagnostic/render?agentId=<id>`
- `POST /api/diagnostic/self-run` (lease-auth, no answer payload accepted)
