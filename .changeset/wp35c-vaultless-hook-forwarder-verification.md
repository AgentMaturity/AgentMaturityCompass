---
"agent-maturity-compass": patch
---

A delegated Claude Code child's tool calls are no longer all denied. The child's hook forwarder never receives the vault passphrase, so it could not open the encrypted payload blob of the Bridge's decision row and denied every call fail-closed. The forwarder now verifies the decision and the prompt admission with public material only: the chain, the writer signature, the signed receipt and the session seal. It lists the blob as not evaluated, which is never counted as verified.

This applies only to the forwarder, which opts in, and only when the blob's key is held by a vault that is locked in that process with no passphrase set. The blob's key version must also be one the workspace issued, per its signed blob-key record. Any other key failure still fails verification: the unvaulted key, the no-sign key, a missing secret in an unlocked vault, bad key material, an unknown version, or a blob that names another payload. The Bridge and every other ledger reader check the blob as before.
