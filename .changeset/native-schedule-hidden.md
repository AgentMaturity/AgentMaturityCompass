---
"agent-maturity-compass": patch
---

`amc native-schedule` is hidden (D-12): it was never qualified, so it no longer appears in `amc --help`, `amc commands` or `docs/CLI_COMMAND_INVENTORY.md`, and its description now starts with "Experimental, not qualified". The commands still parse and behave as before for anyone who already uses them; nothing was removed. The public CLI path count falls from 1,236 to 1,226.
