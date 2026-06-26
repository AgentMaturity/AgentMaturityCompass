---
"agent-maturity-compass": patch
---

Add explicit unsigned-valid status semantics to `amc redteam run`, expose `--no-sign` in the CLI, and verify that red-team reports run without creating or unlocking a vault while persisting JSON/Markdown evidence. Also refresh canon and diagnostic-bank schema counts from the live question bank so fresh workspace initialization works after the 244-question expansion.
