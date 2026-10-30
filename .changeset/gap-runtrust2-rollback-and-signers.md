---
"agent-maturity-compass": patch
---

Gates no longer roll back to an older run when the newest run file is deleted. The governor, ToolHub, the native Action Policy guard and the other run-reading gates now also check the ledger: if it records a newer run for the agent than the file they selected, or a newer run that no file on disk attributes to another agent, the decision fails closed with `UNTRUSTED RUN: …` instead of acting on the older passing run.

`amc cert generate`, `amc passport create` and `amc audit binder create` now sign only the same trusted run the gates use. Before, they checked the run's seal but not that it named this agent or that the ledger recorded it, so a sealed run copied from another agent's runs directory (or an unrecorded one) was signed as this agent's score. They now refuse (certificate), or report insufficient evidence (passport, binder), with the reason.
