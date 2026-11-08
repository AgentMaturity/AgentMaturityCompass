---
"agent-maturity-compass": patch
---

The deployment runbooks record the 2026-11-09 qualification runs: the current Compose Install, Backup, Upgrade and Rollback steps on the TLS stack (docs/deploy/reference/COMPOSE.md), and the Helm stdin backup, checkpoint archive and new-namespace restore on a throwaway kind cluster, with a negative control that shows a restore without the archive failing closed (docs/deploy/reference/BACKUP_RESTORE.md). What was not run is listed in each.
