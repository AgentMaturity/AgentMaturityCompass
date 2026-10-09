---
"agent-maturity-compass": patch
---

Apply Claude's source feedback to ToolHub journaling: preserve abnormal process outcomes in both dispatch consumers, bound HTTP execution and reject incomplete responses, retain the original execution record on retry denial, and keep invalid approval intent facts on the fail-closed dispatch path. Non-zero process exits no longer count as successful consequential work. Source qualification remains deferred; no executable checks were run.
