---
"agent-maturity-compass": patch
---

Fix: `amc resource snapshot`, `amc run` and the other commands that write an Enforce resource manifest no longer fail with `RESOURCE_STATE_CHANGED` when `.amc/fleet/typed-graphs/latest.json` exists. The manifest records that graph by its canonical graph digest (the same value as the graph's `digestSha256`), and the snapshot copy, the lifecycle status check, restore and rollback now compare the graph against that same digest instead of its raw file bytes. Before this fix, a workspace with a typed graph could not write a resource manifest at all, so it had no restorable resource version. Every other resource is still compared by its file or directory bytes.
