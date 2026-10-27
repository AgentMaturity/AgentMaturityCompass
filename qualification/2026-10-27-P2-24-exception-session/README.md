# P2-24: scoped-exception requester from an authenticated session

Covers commit `62b7dc5d6`. `requestScopedException` takes the requester from an `amc approvals login` session, records it as the approval request's initiator, and refuses without a valid session (`principal_unresolved`). Scoped exceptions have no CLI command (TypeScript API only), so there is no CLI flag to add.

- `red-before-fix.txt`: `tests/governor/scopedExceptions.test.ts` with the new tests against `6df41bec8`: 11 of 12 failed.
- `mutations.json`: M19 (requester not authenticated) and M20 (no initiator recorded) each made a test fail.

Local fixture runs with fixture users and tokens in temporary directories; not a review by a named human and not a compliance verdict.
