---
"agent-maturity-compass": patch
---

Studio now stops within the deploy grace period and records its stop. Anti-rollback checks no longer re-parse the machine's high-water file when its bytes have not changed, which had kept Studio's event loop busy for tens of seconds on a machine with many marks, so SIGTERM went unanswered until the supervisor's SIGKILL. Studio also writes `STUDIO_RUNTIME_STOPPED` as soon as it stops accepting work, before its bounded wait for open sockets and in-flight requests.
