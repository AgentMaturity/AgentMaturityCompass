---
"agent-maturity-compass": patch
---

For journaled consequential subcalls with a bound approval gate, commit the requested receipt and check unresolved actions before asking for approval. Bind fresh authority after the wait while retaining one execution ID and idempotency key across the requested receipt, authorization, intent, dispatch, and recorder. Refuse changed session or parent attribution before consuming approval or dispatching.
