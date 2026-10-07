---
"agent-maturity-compass": patch
---

Security: execution freezes fail closed when their files are tampered with.

- **Lift records:** a freeze is lifted only by a lift record signed with the workspace auditor key for that incident and agent. Before, any file at the lift path lifted it.
- **Unreadable or badly signed incidents:** an incident file that cannot be read, or whose signature fails, now holds every action class above `READ_ONLY` until an operator restores or removes it. Before, such files were silently dropped. `activeFreezeStatus` reports these files in a new `integrityProblems` field, and the held state appears as `integrity` in `incidentIds`.
