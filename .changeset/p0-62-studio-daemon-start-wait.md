---
"agent-maturity-compass": patch
---

`amc up --demo` (and every other caller that starts the Studio daemon in the background) no longer gives up after a fixed 6 seconds while the daemon is still starting. A live daemon now has up to 60 seconds to write its state file, so a slow start on a loaded host is not reported as a failure. A daemon that exits during startup is reported at once as `Studio daemon exited during startup (exit code N). See <workspace>/.amc/studio/logs/studio.log.` instead of waiting out the timeout and printing `Studio daemon failed to start in time. Check amc logs.`; a daemon still not ready after 60 seconds is reported with the same log path.
