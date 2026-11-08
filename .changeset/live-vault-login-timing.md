---
"agent-maturity-compass": patch
---

A console login for an unknown or a revoked username now takes as long as a wrong password (it runs scrypt against a dummy verifier, computed once on first use), so response time no longer tells a caller which accounts exist.
