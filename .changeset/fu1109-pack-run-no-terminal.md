---
"agent-maturity-compass": patch
---

`amc domain pack run` without a terminal (and without `--baseline`) now prints one line on stderr saying that interactive mode needs a terminal and that the baseline is shown. Exit codes and the `--json` stdout are unchanged.
