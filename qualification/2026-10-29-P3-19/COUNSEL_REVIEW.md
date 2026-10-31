# P3-19 counsel review record

Status: **pending (Needs-Expert, D-08)**. No clause has been reviewed by counsel. All twelve clauses in
`docs/procurement-clauses.json` are `experimental` with `reviewer: null` and `reviewedAt: null`.

The issue asks counsel to review at least `PC-EVIDENCE-DELIVERY`, `PC-INDEPENDENT-VERIFICATION` and
`PC-CLAIM-VOCABULARY`. Sid approves publication; "publish" in this item meant landing the draft in the repository only.

How to record a review (one row per clause):

1. Counsel reviews the clause text, its sources and its limits.
2. Record the reviewer's name, the date and every change counsel requests in the table below.
3. Apply the changes to `docs/procurement-clauses.json`, set `status` to `counsel-reviewed` with `reviewer` and
   `reviewedAt`, and run `node scripts/gen-procurement-clauses.mjs --write`. The validator refuses a reviewed clause
   without both fields.

| Clause id | Reviewer | Date | Changes requested | Applied in commit |
| --- | --- | --- | --- | --- |
| (none yet) | | | | |
