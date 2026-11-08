---
"agent-maturity-compass": patch
---

A console login for an unknown or a revoked username now takes as long as a wrong password (it runs scrypt against a dummy verifier, computed once on first use), and a wrong password for an account whose verifier is older and cheaper (scrypt N=2^14, every account made before this version until its next successful sign-in re-hashes it) is padded to the same cost, so response time no longer tells a caller which accounts exist.
