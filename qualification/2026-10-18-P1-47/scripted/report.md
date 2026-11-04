# Harness comparison: p1-47-pilot-scripted

These are automated execution and independent-oracle records. There is no inferred ranking, maturity score, human usability rating or superiority factor.

Manifest SHA-256: `2cc08157e817d56f58749fe8c3925eab3dd74e2fee701b6a2ce12eb71ff1f445`. Started 2026-10-18T10:44:47.544Z; finished 2026-10-18T11:44:50.288Z.

| Target | Lane | Requested | Ran | Determinate | Qualified pass | Qualified fail | Unavailable | Inconclusive | Command wall median ms | Timing samples |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| amc-native | scripted (keyless-conformance) | 20 | 20 | 20 | 8 | 12 | 0 | 0 | 232177.50 | 20 |
| pi-contained | scripted (keyless-conformance) | 20 | 20 | 20 | 20 | 0 | 0 | 0 | 3903.00 | 20 |
| pi-contained-amc | scripted (keyless-conformance) | 20 | 20 | 20 | 0 | 20 | 0 | 0 | 10574.50 | 20 |
| pi-contained-tuned | scripted (keyless-conformance) | 20 | 20 | 20 | 20 | 0 | 0 | 0 | 3353.00 | 20 |
| pi-contained-amc-tuned | scripted (keyless-conformance) | 20 | 20 | 20 | 0 | 20 | 0 | 0 | 13487.50 | 20 |

Timing includes failed/inconclusive executions and adapter startup/cleanup wait. Missing timings, usage, cache, costs and interventions remain unknown; `summary.json` includes each metric's actual sample count and missing count. Cost observations retain their source URL/date. Human actions and automated fixture actions are separate.

## Observed task outcomes before qualification

These independent oracle outcomes passed the input-integrity checks. They do not imply verified budgets or successful cleanup. A local model call is an attributed adapter observation, not model-identity or quality attestation; missing token usage keeps the qualification above inconclusive.

| Target | Lane | Task pass | Task fail | Outcome unknown | Model called (reported) | Model call unknown | Budget unknown |
|---|---|---:|---:|---:|---:|---:|---:|
| amc-native | scripted | 8 | 12 | 0 | 20 | 0 | 0 |
| pi-contained | scripted | 20 | 0 | 0 | 20 | 0 | 0 |
| pi-contained-amc | scripted | 0 | 20 | 0 | 20 | 0 | 0 |
| pi-contained-tuned | scripted | 20 | 0 | 0 | 20 | 0 | 0 |
| pi-contained-amc-tuned | scripted | 0 | 20 | 0 | 20 | 0 | 0 |

## Repeat

Invoke `runHarnessComparison` with the original manifest path recorded in `report.json`, a new output directory and the recorded execution opt-ins. The redacted manifest copy is for inspection; it is not a replacement for the original pinned input. Verify the same original manifest digest and exact platform/runtime before comparing a repeat.

Registered CLI repeat argv (replace the output placeholder): `["amc","bench","harness-compare","--manifest","/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/P1-47-runs/f2-scripted/inputs/manifest.json","--out","<NEW_OUTPUT_DIRECTORY>","--allow-adapter-execution"]`.

## Limits

- Automated conformance is not a human usability study or a coding-performance ranking.
- Shared manifest settings match requested conditions; effective model, permission and token/spend enforcement remain the pinned adapter's responsibility.
- The runner enforces wall time, isolated HOME/work directories, bounded capture and process-group termination; it is not an OS filesystem/network sandbox.
- Source commits are declared provenance. Determinate trials require artifact, executable, fixture, adapter and oracle file digests to match before and after execution; this does not attest a build-to-source relationship or every dynamic dependency.
- Latency is complete target-command wall time including adapter startup and process-group wait, not model-only latency. Failed and inconclusive executions retain their timing.
- Token/cache/cost/action counters remain attributed observations; missing values are unknown, and token/spend comparisons are retrospective rather than a substitute for live budget enforcement.
- Local-provider lanes declare literal loopback origins and operator model/runtime digests; the pinned adapter must enforce actual upstream/redirect boundaries and verify those identities. Loopback can still host a proxy; the runner does not attest where inference occurred.
- A reported model call and an observed task result are separate from qualification. Missing local token usage leaves the bounded trial inconclusive; no monetary observation or scripted-backend quality claim is manufactured.
- Durable raw captures are bounded and redacted; digests identify those retained bytes, not an undisclosed original. No superiority factor is inferred.

## Unavailable and inconclusive trials

