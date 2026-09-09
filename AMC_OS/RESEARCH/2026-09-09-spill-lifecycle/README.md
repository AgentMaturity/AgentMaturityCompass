# Retained tool-output lifecycle — September 9

AMC-1547 is In Progress and blocks AMC-1522: source review at `f0442ac118573683080681f443f518853cd91f22` confirmed plaintext raw spill materialization before its signed event and missing retention/export integration. Native encrypted v2 storage, signed pre-materialization commitments, authenticated lifecycle inventory, scoped erasure and encrypted export/restore are now being implemented in disjoint owned worktrees. Existing compaction receipts remain evidence of their measured preview savings, not raw spill lifecycle qualification. Default encrypted backups already include `.amc`; DSAR already refuses to claim fulfilment without a handler. No production key operation or test/check/build has run for this change. Record: `AMC_OS/RESEARCH/2026-09-09-spill-lifecycle/README.md`. [AMC-1547](https://linear.app/agentmaturitycompass/issue/AMC-1547).

## Planned acceptance boundary

Source implementation and authored regressions first. Fresh clean candidate full suite, release gate, security mutations and explicit export/erase cases remain pending. No source/package/platform/deployment acceptance is claimed. Scope does not establish human outcomes, comparator superiority or erase external copies.
