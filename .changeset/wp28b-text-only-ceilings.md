---
"agent-maturity-compass": patch
---

Close a hard USD reservation validator bypass by allowing only each encoder's supported text content types. Refuse unknown content types and nested attachment keys ending in `_url`, `file` or `source` before recording a reservation. Preserve supported text/function request structures and token-only budgets.
