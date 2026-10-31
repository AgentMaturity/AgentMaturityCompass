---
"agent-maturity-compass": patch
---

Bound autonomous goals to 256 rounds and stop after three identical normalized answers. Record exhausted occurrences separately from failed or verified-complete outcomes, with a configurable exhaustion suspension threshold.

Extend the existing signed schedule store with versioned at/daily/weekly calendar definitions, explicit timezone database provenance, skipped DST gaps, earlier-only folds, and advance-on-claim missed-run handling. Reject ambiguous definitions and stored sub-minute intervals instead of silently changing their cadence.

Add owner-authorized, signed objective revisions with explicit create/edit/pause/resume flags on native-schedule put, lifetime round ceilings, exact round/session authority, configured completion checks, and read-only get_goal context for scheduled children. Preserve existing signing, claim ownership, revocation, and interrupted-run recovery boundaries.
