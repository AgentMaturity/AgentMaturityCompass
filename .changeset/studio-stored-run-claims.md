---
"agent-maturity-compass": patch
---

Studio stored diagnostic reports now use the canonical legacy claim policy and verify the original report seal before adding display readiness. Missing reports return 404, and decoded run IDs containing directory separators or NUL bytes are rejected before file lookup. Existing agent scope and entitlement checks remain enforced.
