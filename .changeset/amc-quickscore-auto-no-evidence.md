---
"agent-maturity-compass": patch
---

Make `amc quickscore --auto --json` fail closed with structured `AUTO_NO_EVIDENCE` metadata when execution evidence is missing, avoiding normal-looking zero-score output for first-run users.
