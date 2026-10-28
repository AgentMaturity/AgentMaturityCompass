# P2-35 qualification receipt (2026-10-28)

Tests-only item: A4 acceptance scenarios, negative fixtures and mutation checks. `receipt.json` lists the commit tested,
the commands with their exit codes, and the test totals. `tests/a4/DEBT.md` holds the case-by-case status, the
mutation record and the follow-ups.

Covered: nine of the sixteen design §17 scenarios through the A4 HTTP routes with real signed users, part of a tenth
(the acknowledgement rule), router refusals on every published A4 route, the store's request dedupe, each a4-record
fixture verdict, and the sign-kind list equality. Pending, with reasons in DEBT.md: the scenarios that need Assemble,
Adapt or Activate fixtures (changed markets, unsupported integrations, failed deployment, rollback, `outcome_unknown`,
effect drift and crash), the two-process request run, and the P1-06 verifier run. The P1-62 end-to-end qualification
needs Sid and a non-stub provider and is not faked here.
