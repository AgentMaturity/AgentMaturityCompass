# P1-17: F4 incident clocks with the missing US financial clocks

Branch `rtd/p1-17-f4-incident-clocks`, built on `origin/main` `cd04963e`. The checks ran on 2026-10-07 at the commit named in `receipt.json` (the last code and generated-file commit) in the issue's own clone on macOS 26.6.2 arm64 with Node v25.5.0 and pnpm 10.33.0.

## What was done

- F4's code commit `ff857211` was cherry-picked with `-x`; its receipt commit `ed9b45a2` (an `AMC_OS/` path) was skipped. Right after the pick, `git diff HEAD ed9b45a2 -- <the seven F4 paths>` was empty.
- The F4 ready-to-wire exports were applied to `src/incidents/index.ts`, and the clocks doc no longer cites the program path.
- Five clocks were added (NYDFS 500.17 ×3, GLBA 314.4(j), BSA SAR 1020.320) with three new triggers, and the two Texas § 521.053 rows were checked against the statute and marked verified. `sources.md` lists every text read, its URL, retrieval time and hash.
- Clock events persist in `incident_clock_events`; oversight records are chained and verified as a whole file; the CLI, API and MCP entry points are wired. After a security review the clock events and oversight records take `recordedTs` from the server clock, oversight appends refuse a file that fails `verifyOversightChain`, and the first-recorded notice per clock wins.

## Files

- `commands.tsv`: every check run on the receipt commit with its exit code and duration. `receipt.json` repeats them and adds `check:qualification`, run with this receipt in place.
- `sources.md`: the primary texts behind the new and rechecked clocks.
- `clocks-wealth.json`: `amc incident clocks <id> --station wealth --now <now + 3 days> --json` in a fresh `amc init --minimal` workspace built from the receipt commit, after `amc incident create --title drill --severity high`, recording `INITIAL_DETECTION` and `INCIDENT_DETERMINATION` one minute after creation and a NYDFS notice one minute later. The claimed times lie a minute or two after the recording instants, inside the 5-minute skew the guard allows. The listing shows `nydfs-500-17-notice` SATISFIED, `bsa-1020-320-sar-filing` and `glba-314-4j-ftc-notice` PENDING, the extortion clocks NOT_STARTED, and each event's `recordedAt` and `recordedBy`. The same incident listed for the health station shows none of the five new clocks.

Hand runs in a scratch workspace (not committed) also showed: an event before the incident, more than 5 minutes in the future, with an unknown trigger, a clock the station lacks, a second notice, a notice before its trigger, or a time without a zone is refused with exit 1; editing a stored clock-event row makes the listing fail with `clock event <id> refused: signature verification failed`; deleting the first line of an oversight file makes the next append fail and the evidence packet report `oversight-chain` missing with every record unverified; the API answers 200, 201, 400 and 404 as documented and the MCP tool lists 11 tools and returns the clocks with a self-reported, not-evaluated claim.

## Not run here

Sid's standing order for this round pauses tests: no vitest run, coverage, mutation check, release gate or CI. `tests` is therefore null. The issue's new test files (`tests/incidentClockEvents.test.ts` and the CLI, API and MCP cases) and its three mutation checks are not written or run; the existing tests whose assertions this change alters were edited (the Texas-dependent packet test, the forged-payload test's `recordedTs`, a fixed `now()` for oversight records, and the MCP tool counts 10 to 11).

## Reproduce

Run the commands in `commands.tsv` from the repository root at the receipt commit, then the drill above with `AMC_VAULT_PASSPHRASE` set and `HOME` pointed at a temporary directory.
