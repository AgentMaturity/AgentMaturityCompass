---
"agent-maturity-compass": patch
---

Check the bootstrap notary public-key destination before storing its auth secret, and recheck the same captured destination immediately before the native GET. Keep bootstrap workspace and notary selection aligned across waits.

Partial, unqualified P2-01 source. Earlier setup and a late secret write remain possible effects. Later trust and signer transports remain deferred.
