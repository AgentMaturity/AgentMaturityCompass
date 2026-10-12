---
"agent-maturity-compass": patch
---

`amc up` (and `amc start`) no longer reruns the first baseline on every start. It looked for the latest run in `.amc/agents/<agent>/runs`, but the default agent's runs are written to `.amc/runs`, so it never found one, printed "Latest run: none" and ran the baseline again. It now reads the runs directory the runner writes to, as do `amc bom generate --run latest` and the industry-adjusted score history, which shared the same lookup.
