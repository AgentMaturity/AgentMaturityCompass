# WP32 crash and restart on a packed install, under an owner-signed Action Policy waiver (2026-10-31)

The WP32 lane "installed crash and restart" (`qualification/2026-10-30-WP32/`) failed on 2026-10-30 because the default signed Action Policy (AXR-02) ran a fresh agent's EXECUTE calls as SIMULATE, and no owner-signed rule could lift that. The AXR-02 trust-gate decision (option B1, branch `rtd/gap-trustrule`) moved the run-integrity check into each rule as `requireRunIntegrityAtLeast` (absent: 0.6). A threshold below 0.6 is an owner waiver that every decision names. This receipt re-runs the lane with such a waiver.

## What ran

`scripts/installed-crash-recovery-check.mjs` at source commit `c7e999dd1bd46a9fd095a70e9d3cdf55eb90ed92` (clean tracked tree), on macOS 26.6.2 (Darwin 25.6.0) arm64 with Node v22.23.3. The artifact is `agent-maturity-compass-1.2.0.tgz` packed from that commit with `--ignore-scripts`, sha256 `de977cc3718a09027728d9533ed6d32e53560ef91a726a93c9b6eee6e1f3578e`. Its `package/dist/cli.js` has sha256 `215ba894e139eb5085014905f9d365eb91a846682bf84eed137a8c36dbf9526b`.

The runner installs the tarball into a fresh consumer and bootstraps a workspace. Step `02-initialize` seals and anchors a baseline diagnostic run, which measures nothing (integrity 0). The runner then logs the owner in and signs budgets and the MCP fixture grant. New in this lane:

- `07b-policy-owner-waiver-sign`: the owner edits `.amc/action-policy.yaml` for READ_ONLY and WRITE_LOW only (tier SELF_REPORTED, no evidence gates, `requireRunIntegrityAtLeast: 0`, `allowExecute`, no ticket) and turns off sandbox attestation for the low and medium risk tiers. `amc fix-signatures` re-signs it and appends the sealed `CONFIG_RESIGNED` audit event `43263a39-e427-4c98-9741-2730ac056314` (G4).
- `07c-governor-check-READ_ONLY` and `-WRITE_LOW`: each returns EXECUTE with a `RUN INTEGRITY WAIVED:` reason that names the baseline run, and a `run-integrity` condition with `expected: 0` and a numeric `actual` (0). The waiver therefore rests on a sealed, anchored run (G1).
- Every approval the owner records is checked to be for a request whose requested and effective modes are both EXECUTE (G8).

The rest is the existing lane. The runner discovers and activates the MCP fixture tool through `tool_search` and approves each call. It kills the writer during a real approved effect, before the acknowledgement. It then resumes and verifies cold, in new processes, against the monitor fingerprint pinned before execution.

## Outcome

**Passed** (`lifecycle/installed-crash-receipt.json`: `ok: true`, every command exit 0), with five checks:

| Check | Result |
|---|---|
| `owner-signed-run-integrity-waiver` | READ_ONLY and WRITE_LOW at threshold 0, `configResignedAuditEventId` recorded, both decisions name the waiver, `runIntegrity` 0 |
| `deferred-mcp-tool-discovered-and-activated-through-tool-search` | the granted MCP tool was found and activated (loadout revision 1) |
| `real-approved-effect-before-ack-and-authenticated-writer-kill` | one durable effect, no tool result before the kill, one WRITE_LOW reservation pending |
| `resume-preserves-original-prefix-uncertain-outcome-and-reservation` | original prefix kept, one `TOOL_OUTCOME_UNKNOWN`, no automatic model call |
| `new-explicit-turn-without-side-effect-replay-and-cold-verification` | no replayed effect; `agent-loop verify` and `session verify` passed cold |

## Limits

The runner's receipt states this limit verbatim:

> EXECUTE is reached under an owner-signed Action Policy waiver (READ_ONLY and WRITE_LOW: tier SELF_REPORTED, no evidence gates, run-integrity threshold 0 over the baseline run 02-initialize sealed, no sandbox for low/medium). It proves the governed EXECUTE, signed-approval and crash-recovery path, not the agent's maturity or trust; the waiver's activation is the CONFIG_RESIGNED audit row named in check owner-signed-run-integrity-waiver.

The waiver is not evidence. The agent's trust label stays UNRELIABLE, and certificates, passports and READY still need HIGH TRUST. The other limits in the receipt also stand: a deterministic stub provider, a local stdio MCP fixture, and no OS sandbox claim. The default policy, the SDK quickstart and the packed-install check are unchanged and still run a fresh install's EXECUTE calls as SIMULATE.

## Reproduce

```sh
export PATH="$(brew --prefix node@22)/bin:$PATH"
git checkout c7e999dd1bd46a9fd095a70e9d3cdf55eb90ed92   # clean tracked tree
npm run -s build
npm pack --ignore-scripts --pack-destination <scratch>/pack-1 --json
shasum -a 256 <scratch>/pack-1/agent-maturity-compass-1.2.0.tgz
tar -xzf <scratch>/pack-1/agent-maturity-compass-1.2.0.tgz -C <scratch>/pack-1/extract package/dist/cli.js
shasum -a 256 <scratch>/pack-1/extract/package/dist/cli.js
node scripts/installed-crash-recovery-check.mjs --artifact <scratch>/pack-1/agent-maturity-compass-1.2.0.tgz \
  --artifact-sha256 <tarball sha256> --cli-sha256 <cli.js sha256> \
  --source $(git rev-parse HEAD) --source-tree <this checkout> --out <scratch>/crash-1
```

`--out` must be a new directory. The runner checks its own bytes against the committed source, so it runs only from a clean tracked tree. Scratch paths in the redacted receipt are written as `<scratch>`. The runner scrubs the fixture passphrase, password and approval token itself.
