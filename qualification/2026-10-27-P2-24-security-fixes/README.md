# P2-24 security-review fixes

Covers commit `77808180d`, which fixes three authorization findings from the review of `9050b7352`.

1. A regulated `--approval-exception` must match the control version the active plan runs.
2. The break-glass requester is an authenticated `amc approvals login` user, recorded as the approval request's initiator; no session refuses.
3. A review's reviewer comes from the authenticated session, and a break-glass-packet review takes its requester from the break-glass record; neither counts toward the quorum.

- `red-before-fix.txt`: the regression tests run against `611a9b4af` with the new tests in place. The tests for all three findings failed (18 failures in total, most because the request and review APIs now take a session).
- `mutations.json`: five mutations of the new guards (M14 to M18), each applied alone and restored; each made a test fail.

These are local fixture runs with fixture users, passwords and tokens in temporary directories. They are not a review by a named human and not a compliance verdict. The architecture-boundaries (`src/vault/vault.ts`, 803 lines) and freeze-baseline failures are unchanged from base.
