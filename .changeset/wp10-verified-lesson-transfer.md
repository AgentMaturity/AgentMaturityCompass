---
"agent-maturity-compass": patch
---

Add opt-in verified correction lessons to the existing prompt compiler. Bind cue, scope, source evidence, domain, library version, experimental mode and earlier-task lineage into signed lesson content. Exclude future, held-out, expired, revoked, drifting and unverified lessons. Keep previews read-only, record exact lesson digests once after signed prompt publication, and require matching run context when admitting a lesson pack to a bridge request.

Enforced bridge requests always authenticate prompt archives, including when the legacy optional signature toggle is disabled, so deleting lesson metadata cannot bypass admission. Artifact destinations cannot overwrite the selected lesson ledger or its SQLite sidecars.
