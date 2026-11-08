---
"agent-maturity-compass": patch
---

A fresh, signed-in workspace no longer answers the console with server errors. Without a value contract, `GET /value/contracts`, `/value/snapshot/latest` and `/value/report` answer 404 `{"error":"value contract missing","code":"VALUE_CONTRACT_MISSING"}` (or `VALUE_POLICY_MISSING`), and an agent id that is not a plain name is 400; before, all three answered 500. `GET /outcomes/report` without an outcome contract answers 200 with `"status":"OUTCOME_CONTRACT_MISSING"` and `"report":null`, which the outcomes page renders as an empty report. `GET /standard/schemas/<name>` for a schema that is not generated (or unknown) answers 404 `STANDARD_SCHEMA_NOT_GENERATED`. `POST /governor/check` now works for a signed-in user, as its role check intended (an agent still checks only itself). Studio serves `GET /shield/exploit-confirmation/scopes` and `/proofs`, which the console's assurance page reads, to human roles; the same lists stay under `/api/v1/shield/exploit-confirmation/`.

freeze-exception: LIVE-RUNTIME — Studio serves the two exploit-confirmation list paths the console already calls (no new CLI command)
