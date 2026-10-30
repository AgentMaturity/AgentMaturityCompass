---
"agent-maturity-compass": patch
---

Session spine throughput: the per-event signing-key gate (P2-08) costs about half as much. `getSigningKey`, `assertSigningKeyUsable` and `assertVaultMaySign` now each run as one check pass, so the key set, revocation list and built-in distrust checks they share run once per call rather than once per nested check. Deriving a public key from a private key and computing a public key's id are memoized, because both are pure. Every call still re-reads current state, so a key revocation (including one written by another process), a key rotation or a vault lock between two events refuses the second event.
