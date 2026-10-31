---
"agent-maturity-compass": patch
---

The SDK quickstart (`examples/sdk/quickstart.mjs`) no longer fails on a fresh `amc init --coding` workspace. The default signed Action Policy runs a new agent's EXECUTE calls as SIMULATE until it has an observed diagnostic run, so the quickstart now reports the call's effective mode and checks that a SIMULATE call wrote no file.
