---
"agent-maturity-compass": patch
---

Gates no longer roll back to an older run when the newest run file is deleted. The governor, ToolHub, the native Action Policy guard and the other run-reading gates now also check the ledger: if it records a newer run for the agent than the file they selected, or a newer run that no file on disk attributes to another agent, the decision fails closed with `UNTRUSTED RUN: …` instead of acting on the older passing run.
