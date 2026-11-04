---
"agent-maturity-compass": patch
---

A native model request that AMC's own signed budget refuses before dispatch (the request, token or cost budget is exhausted, or token usage is unknown or a prior dispatch is pending) is now recorded as `request/failure` with code `AMC_NATIVE_BUDGET_REFUSED`, not `QUOTA`. The CLI run summary and `amc session show` diagnostics show "Signed native budget admission refused this dispatch." with the `amc budgets verify` / `amc budgets status` next step, instead of "The provider reported exhausted account quota or balance." Rows already recorded keep their `QUOTA` code. A failed ACP turn's error data (`the turn did not complete`) now also carries `failureCodes`, the recorded failure codes of that turn, so ACP and native SDK clients (`AMCNativeRefusedError.data`) can see `AMC_NATIVE_BUDGET_REFUSED`; Studio shows the budget guidance for such a turn instead of "The native turn did not complete cleanly".
