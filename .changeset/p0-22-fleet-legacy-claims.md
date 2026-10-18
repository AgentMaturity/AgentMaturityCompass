---
"agent-maturity-compass": patch
---

Fleet Markdown reports now render each member's canonical claim label, including the legacy 1.x self-reported notice. Scores, status dimensions and aggregate eligibility rules are unchanged.

Lab simulation can reload a saved experiment in a new CLI process through the existing workspace store. Stored probe results remain explicitly synthetic; memory-only library calls keep their prior behavior.

`amc lab-report` and `amc lab-compare` now print the synthetic-example banner and the `lab:simulate` Synthetic example claim before their output, and `lab-report` notes that stored scores are deterministic placeholders. `lab-compare` reads both experiments' stored probe results from the workspace, so experiments simulated in earlier CLI runs can be compared; it exits 1 when the two experiments share no probe (it exited 0 before), and `lab-report` exits 1 for an unknown experiment.
