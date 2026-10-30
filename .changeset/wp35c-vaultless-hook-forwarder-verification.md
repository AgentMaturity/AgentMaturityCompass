---
"agent-maturity-compass": patch
---

A delegated Claude Code child's tool calls are no longer all denied. The child's hook forwarder never receives the vault passphrase, so it could not open the encrypted payload blob of the Bridge's decision row and denied every call fail-closed. The forwarder now verifies the decision and the prompt admission with public material only: the chain, the writer signature, the signed receipt and the session seal. It lists the blob as not evaluated, which is never counted as verified. A blob that does not open under a reachable key, or that names another payload, still fails. The Bridge and every other ledger reader still check the blob as before.
