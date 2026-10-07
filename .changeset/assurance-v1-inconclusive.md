---
"agent-maturity-compass": patch
---

Assurance v1 run artifacts no longer turn inconclusive scenarios into findings. Those are the ungraded replies P0-19 introduced, scored 0. Before, each became a CRITICAL finding and failed the run. Now the scenario row carries `inconclusive: true` and is left out of `findingCounts` and the findings file. The run's `score.status` is `INSUFFICIENT_EVIDENCE` when the report measured nothing.
