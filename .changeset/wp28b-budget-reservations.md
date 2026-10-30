---
"agent-maturity-compass": patch
---

Reserve an auditor-attested worst-case USD ceiling before native model dispatch, using the existing signed budget policy and atomic ledger admission. Hard USD budgets refuse unpriced, expired, ambiguous or uncovered requests. Indicative catalog estimates never establish a ceiling or settle measured spend. Token-only budgets remain available by omitting `daily.maxCostUsd`. Pending and incomplete USD reservations survive day boundaries; only complete measured reported cost releases them.

New default budget policies use token/count limits until an auditor signs an explicit USD ceiling and request bounds. Existing signed USD limits retain their enforcement.

Add whole-run resource admission and measured role/stage cost attribution to architecture experiments. Reports distinguish verified native measurements, catalog estimates, missing stages and limits the injected runner cannot enforce. Unsupported hard experiment ceilings fail before execution.
