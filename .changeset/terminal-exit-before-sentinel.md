---
"agent-maturity-compass": patch
---

A terminal command that closes the shell before AMC's completion sentinel is accepted (for example `exit 0; false`) now returns readiness `exited` with an unknown exit status instead of throwing "The pipe terminal did not accept input.". The pipe backend reports the exit only after that write error, so the outcome depended on timing and failed CI at random.
