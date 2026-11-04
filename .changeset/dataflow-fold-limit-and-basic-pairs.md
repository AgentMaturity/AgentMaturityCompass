---
"agent-maturity-compass": patch
---

Protected-data detection and the shared secret redaction no longer build a folded (NFKC) view longer than four times its text plus 1 MiB, replacing such text or refusing the request instead, and both now count a Basic token with an empty user name or a UTF-8 password and a Basic header in JSON escaped more than once.
