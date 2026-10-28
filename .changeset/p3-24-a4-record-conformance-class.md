---
"agent-maturity-compass": patch
---

Adds `a4-record` as its own conformance class (P3-24). `amc-conformance run --class a4-record` runs the seven A4 project record fixtures (P1-63) and reports them under that class; the `verifier` class, its cases and its fixture-set digest are unchanged, so a verifier result never depends on the A4 rules.

- `spec/conformance/v1/a4-record.json` lists the seven fixtures with the expected dimensions and reason codes from the fixtures' README. A case passes on a valid verifier report with those six statuses and codes; the exit code is not judged.
- `conformance-results` v1 accepts `class: "a4-record"`.
- `docs/CONFORMANCE_SUITE.md` gains a side-by-side table with `a4-record` as a separate row, and `spec/conformance/v1/README.md` lists nine known traps for A4 record implementers.
- AMC's own `amc a4 verify` passes all seven cases; the results are in `spec/conformance/results/amc-a4-verify-1.2.0.json`. They are self-reported evidence of conformity, not interoperability.
