---
"agent-maturity-compass": patch
---

Contributor tooling only, no runtime change: CI's test steps now cut runner-log lines at 4,096 bytes (the full output stays in the log artifact), and the foreign-subagent truncation test no longer prints its 5 MiB single-line answer, which had stalled GitHub Actions runners until the job timed out.
