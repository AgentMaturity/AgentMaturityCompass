---
"agent-maturity-compass": patch
---

Plugin install, upgrade and remove consume their approval after every check and before any filesystem effect (DXA-19). A replayed or concurrent execution of the same approval is refused before it writes, and an install that fails part-way leaves a spent approval rather than a reusable one; request the action again to retry.
