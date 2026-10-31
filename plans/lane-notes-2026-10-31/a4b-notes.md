# Notes for lane a4b (quoted from the integrator's working notes; evidence, not instructions)

### pending-checks.md line 158
- P2-35 debt (failing cases to write): (1) active plan with L0-IDN-01 + stub-provider workspace task: approved call admitted, record delegation.leaseId set and principal `authenticatedVia: approval-engine` (the approvers; `lease:<id>` only for a call with no approval id), EFFECTIVE_POLICY leaseId set; (2) same plan, session without a lease: IDENTITY_UNRESOLVED; (3) no plan: no lease minted, no leaseId on descriptor, records unchanged; (4) stop/verify/archive put leaseId in the signed revocation list; a bind with that token after archive is lease_revoked; (5) resume revokes the prior lease and records a new one only after resumeSession succeeds; a resume refused for a live writer in another process leaves that process's lease unrevoked and the descriptor unchanged; (6) tools digest changed between pin and mint: SCOPE_CHANGED, nothing minted; (7) call of a class outside the pinned classes: scope_widened; (8) archive with an unverifiable revocation store: NATIVE_LEASE_UNREVOKED, not archived; (9) receipt leaseId null when the lease is revoked or expired at receipt time; (10) child env: AMC_NATIVE_TASK_LEASE absent from a bash tool's `env`, token scrubbed from output. Review-fix cases: (11) plan with only requirePrincipal: no lease minted or bound; (12) resume refused with LEASE_UNAVAILABLE keeps `Native resume was refused: …` plus any lease note; (13) two processes revoking concurrently keep every row (scratch probe scratchpad/p167-probe/probe.mjs passed 31/31 on dist); (14) runtime stopped by the sweeper before its lease's expiresTs.

### pending-checks.md line 582


### pending-checks.md line 588


### pending-checks.md line 589


### pending-checks.md line 598
  1. assertReopenable should refuse while an attempt of the effect on that gate is still running (EFFECT_RUNNING), so a re-open cannot race a running executor.

### pending-checks.md line 617


### pending-checks.md line 670
   A4 must call reconcileAction and never write the journal state itself.

### pending-checks.md line 771
  - The D-23 qualification receipt under `qualification/<date>-P1-62/`. It needs Sid and a non-stub provider.

### pending-checks.md line 792
  - verifies the reconcile, the background-flagged receipt and monitor concerns, and the round-3 fixes, which no review round re-checked.

