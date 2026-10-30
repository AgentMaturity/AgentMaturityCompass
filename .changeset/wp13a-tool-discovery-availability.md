---
"agent-maturity-compass": patch
---

Add a read-only `tool_search` tool that reuses the existing TF-IDF index over signed, session-authorized tool metadata. Deferred definitions can keep their schemas out of the initial model request while remaining subject to the existing tool pipeline and policy guards.

Admit conditional tools once per entered step and revoke them on completion, failure, or cancellation. Recheck registration, step identity, and current restrictions after approval waits so queued calls cannot outlive their authority.
