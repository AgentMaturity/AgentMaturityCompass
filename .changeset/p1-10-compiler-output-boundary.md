---
"agent-maturity-compass": patch
---

Refuse catalog compiler output paths that resolve through filesystem aliases into the workspace signed configuration tree before signing or writing a plan. Keep the lexical boundary and fail closed when a path cannot be resolved safely. The plan remains experimental and makes no compliance claim. Qualification uses explicitly synthetic planning data.
