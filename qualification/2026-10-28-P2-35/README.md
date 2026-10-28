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
