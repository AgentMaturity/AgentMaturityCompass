# P2-34 qualification receipt

A4 as a consumer of P2-23's governed lifecycle and P2-26's regulatory runtime. Commit 0b492e13e (feature) and fc86c813c
(regenerated counts) on rtd/w3-p2-34, base 93ccb82b5.

- `tests/a4/runtimeLifecycle.test.ts` (10 tests) covers: envelope-covered change → TUNE without REOPEN; out-of-envelope
  change → P2-23 suspended and REOPEN Adapt then TUNE, both by amc-runtime, consumed through the governed-write path;
  mandatory invalidated control → REOPEN; an ungoverned agent read from P2-26's envelope rows; no deployed release → no
  move; a kill switch holds with its incident id and RESUME is refused until it is released, then an owner resumes;
  no A4 module reads break-glass; `memory_policy_retention_floor` READY / BLOCKED / NOT_EVALUATED; the package's
  `versionManifest.manifestDigest` equals P2-23's and a tampered state row refuses; P2-23 activation on the gate's
  binding digest; RETIRE of a deployed project retires the agent through P2-23 first.
- Red: on base the file fails to import the new module (no consumer existed). Behavioural reds are the mutation
  checks in `mutations.json`: each guard broken in turn fails at least one test.
- Deployed projects in the tests reach Activate through one fixture transition, not the full release and deploy flow
  (P2-35 owns the end-to-end scenarios).
- Pending for people: D-08 expert review of the regime floors (experimental); Sid: whether memory retention should be
  held to the `logs` floor (chosen here) or another record class.
