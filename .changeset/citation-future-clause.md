---
"agent-maturity-compass": minor
---

Catalog citations: a clause of an in-force or partially-applicable binding instrument that carries a `complianceDueDate` may be cited `binding-future` (for example 11 CCR §7220 ADMT notices, due 2027-01-01). Before, `binding-future` was accepted only for an `enacted-not-yet-applicable` instrument, so such a clause had to be mislabelled `binding-now`. A due date that has passed never fails validation; `check:catalog-currency` reports it as `GOV_CITATION_DUE_PASSED` (a warning for experimental content, an error for reviewed content) so the clause is relabelled `binding-now` and re-verified.
