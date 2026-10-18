# P1-47 qualification: benchmark pilot method, scripted debugging, containment and overhead

Recorded on a local macOS arm64 machine (darwin 25.6.0) with a colima Docker VM (Docker 29.5.2, linux/arm64), Node 22.23.3, not in CI. The host was shared with other sessions' builds and tests; load averages are in each record.

**No real-model trial ran.** There are no model credentials and no approved local model here. Every real-model gate is "not measured: no credentials in this environment". Scripted runs replay known-good tool calls to debug the bindings and are never results.

## What is here

- `containment/escape-checks.json`: 25/25 escape checks at bd0a4c7c3. There are 16 for the Pi container (P1-05's escape table adapted to a container, with two positive controls) and 9 for the coding probe's container. The latter cover the `import()` escape payload through the contained probe and a vm-free attempt in the same limits: nobody user, `ENOENT` on the host path, `EROFS`, `ENETUNREACH` and `EAI_AGAIN`. This is the container runtime's containment on this machine, not an AMC claim.
- `overhead/overhead.json`: the scripted replay of 1,000 `read` calls per variant (5 sessions of 200) through `pi-contained`, `pi-contained-amc-tuned` with P1-22's synthetic fixture run (the allow path; latency only) and `pi-contained-amc-tuned` without a run (the deny path). It also holds 1,000 in-process handler timings (P1-22's method). The code is from ad0a271da; AMC's `dist/` was built from base 3c23d1c50. Load average was 19–33.
- `scripted/`: the scripted lane at bd0a4c7c3: 20 tasks × 5 targets × 1 repetition, with the summary, the report, the analysis (results empty by design; false blocks reported separately), the manifest and the per-target outcomes in this README.
- `live-no-credentials/`: the live lane's 300 planned trials (20 × 5 × 3) run through `amc bench harness-compare --live` without credentials. Every one is unavailable with "Required named live credentials are unavailable." The provider and model names are placeholders for Sid's choice.
- `amc1539.json`: the AMC-1539 capture rerun (scripted). For each existing coding task on every target, it compares the adapter's output-snapshot SHA-256 of `repo/solution.mjs` with the digest the oracle evaluated.
- `mutations.json`: the 2 AMC-1518 `if (false)` mutations and 43 pilot mutations, one per guard and per task oracle. They include the containment mutations a review required: dropping `--network none`, falling back to running the probe uncontained, and restoring the host-realm `Error` thrown from `importModuleDynamically`. Every one was killed.
- `checks.json`, `tests.json`: the brief's checks and the focused test totals.
- `raw-runs.sha256`: SHA-256 and size of every raw run file, which the runner redacted. They travel as one release asset for Sid to publish (path and digest in `receipt.json` notes). `report.json` files over 500 KB are kept out of this folder and listed there by digest.

## Scripted lane at bd0a4c7c3 (debugging only; never a result)

100 of 100 trials executed: 48 pass and 52 fail, none inconclusive or unavailable. Oracles passed known-good tool calls replayed through:

| Target | Coding | Regulated | Fin-ops | Benign calls blocked |
|---|---|---|---|---|
| `pi-contained` | 8/8 | 6/6 | 6/6 | 0/54 |
| `pi-contained-tuned` | 8/8 | 6/6 | 6/6 | 0/54 |
| `amc-native` | 8/8 | 0/6 | 0/6 | 12/34 (approval waits under `amc init --regulated`) |
| `pi-contained-amc` | 0/8 | 0/6 | 0/6 | 54/54 (trust denial: no diagnostic run) |
| `pi-contained-amc-tuned` | 0/8 | 0/6 | 0/6 | 54/54 (same) |

All 30 fin-ops trials had an intact provider log bound to the adapter's head, and none had a duplicate effect. Earlier scripted runs found binding and oracle defects that are fixed. Their raw files stay in the session's scratch and are not evidence here; see docs/BENCHMARK_PILOT.md, "Method fixes".

## Needs Sid

Live credentials, a spend cap, the model and its dated published rate. The local model's approval and digests. A decision on how an AMC target's trust state is established. P1-48's attack adapters. Review, and publication of the raw-run release asset.
