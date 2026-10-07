---
"agent-maturity-compass": patch
---

Contributor tooling only, no runtime change: the release tamper test signs a one-file package instead of packing the whole repository, so it runs in under a second instead of ~8 s and no longer times out when several test suites share a machine.
