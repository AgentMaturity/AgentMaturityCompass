# P0-21 frozen v1 controller code review

V1 is blocked before runtime by one P1 finding. Its late-stream patterns omit actual installed Vitest close failures: error during close, close timed out, and Tests closed successfully but something prevents…. Vitest can log these after the reporter and exit with the existing0/1 code. The controller could then accept ESRCH, clear ACTIVE and restore despite known incomplete close. Preserve v1 and fix this in a separate revision.

A P2 receipt issue also remains: HALTED always says restorationAttempted:false, even if normal restoration already occurred before a restored-phase/final-check failure. The handler itself correctly never restores. A narrowly named automaticRestorationOnException:false field would be truthful.

Serial scheduling flags and bounded signal-zero ESRCH polling are recommended. The existing one-shot probe is already fail-closed; polling should not retry a phase or send termination signals.

All6 recipes and candidate digests match source. C6 has two explicit anchors in one file. Source-mode37, original tests/config/guards/imports/deadlines, unchanged dist and no compiler/adapters are preserved. Per-control release/hash bindings, exclusive started markers, PID/PGID/reporter binding,90-second uncertainty hold and no automatic signal/cleanup/restoration are present. Actual failure frames and masking still require root review; substring matching is not complete causal attribution.

The actual outer environment has7 explicit keys, unlike the parent's inherited environment. The dependency link borrows this P021 parent's node_modules and native file; this is not an independent install or OS isolation. Full dependency/cache effects are outside the preservation claim.

This is code only. Unfinished setup/index metadata and the physical copy proof were not read or approved. No controller, import, parser, compiler, test or product runtime was executed. All reads are finished; only this immutable review pair is written.
