---
"agent-maturity-compass": patch
---

Security: context a tool supplies (`additionalContext`) now reaches the model inside an AMC-written fence that marks it as tool data, not instructions and not from the user. Before, it entered as a plain user message. No built-in tool sets `additionalContext` today, so this closes the path before one does.
