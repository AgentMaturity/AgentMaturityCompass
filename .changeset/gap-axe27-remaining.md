---
"agent-maturity-compass": patch
---

Report the remaining empty evidence ratios as not measured. The micro-canary health score is null when no probe ran in the window instead of 100. Level-transition promotion retention is null when no promotion was observed and no longer adds retention credit to the score. A run without ToolHub actions adds no denial-rate point, and a bench with no measured denial rate publishes `toolhubDenialRate: null` instead of a clean 0.
