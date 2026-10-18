---
"agent-maturity-compass": patch
---

The formal certificate API now rejects caller-supplied trust fields even when their values are false or null. Verification continues to use the server operator's trust context, and unsigned certificates remain UNTRUSTED regardless of their integrity result. Unrelated request metadata remains compatible.
