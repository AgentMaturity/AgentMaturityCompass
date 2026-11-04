# P2-35 qualification receipt (2026-10-28)

Tests-only item: A4 acceptance scenarios, negative fixtures and mutation checks. `receipt.json` lists the commands with
their exit codes and the test totals. `tests/a4/DEBT.md` holds the case-by-case status, the mutation record and the
follow-ups.

Covered: all sixteen design §17 scenarios through the A4 HTTP routes with real signed users. A journey goes from
Aspire to a production release and its rollback, on the `other` integration path, a synthetic five-control catalog
(the shipped catalog overflows Adapt's proposal: proposed P2-42) and a reachability probe whose HTTP fetch is replaced.
Also covered: two-process request races, verified-lane re-admission, hypothesis observation, leases, router refusals on
every published A4 route, the a4-record fixture verdicts and the sign-kind list equality.

Pending, with reasons in DEBT.md: Assemble's native path, a WORKSPACE_ROUTER session fixture, freeze or kill switch
mid-effect, and the P1-06 verifier run. The P1-62 end-to-end qualification needs Sid and a non-stub provider and is not
faked here.

## Receipt repaired 2026-10-31

`receipt.json` did not follow `qualification/receipt.schema.json` (24 problems in `npm run check:qualification`). It had none of the required fields except `branch` and recorded its results in fields the schema does not allow (`item`, `base`, `testedCommit`, `machine`, `newTests`, `relatedTests`, `mutations`, `redGreen`, `checks`, `notRun`, `pendingForSid`, `followUps`). The receipt now takes `key` from `item`, `commit` from `testedCommit` (`6e4e23d48`, written in full) and `node`, `os` and `arch` from `machine`. The recorded checks become commands named as the npm scripts or script file they are, with their exit codes unchanged, and the two related-test sets become vitest rows. `tests` is null because the sets overlap and their skipped counts were not recorded. `date` is 2026-10-28, from the folder name and this README. Every other recorded field is kept in `notes`; the folder holds no other files, so `artifacts` is empty. pnpm and the command durations were never recorded; they are written as `not recorded` and `durationMs: 0`. The original receipt is in git at `58a328ea8:qualification/2026-10-28-P2-35/receipt.json`.
