---
"agent-maturity-compass": minor
---

Adds the AMC conformance suite (P1-32): `packages/amc-conformance`, a zero-dependency runner for Node 20 or later that tests any implementation of the spec, in any language, through a command template, and the new `conformance-results` v1 contract (`spec/schemas/v1/conformance-results.schema.json`). See `docs/CONFORMANCE_SUITE.md`.

- Four classes in `spec/conformance/v1/`: `verifier` (normative, one case per fixture in `spec/fixtures/v1/`), `producer` and `adapter` (normative, initial cases), and `compiler` (informative and skipped until P1-10's golden outputs exist). The class requirements are the suite's working text until the Core Spec (P1-30) states them.
- `amc-conformance run --class <class> --impl "<command template>" [--cases <glob>] [--out results.json]` exits 0 only when every normative case passed. A crash, a timeout (30 s per case by default) or output that is not JSON is `error`, never a pass; a skipped normative case or a run filtered by `--cases` is never conformant, and the contract refuses a results file that says otherwise.
- A producer declaring the importer role fails any record whose enforcement is not `none`; an adapter in observation-only mode fails if its receipt claims enforcement.
- AMC's own verifier passes all 61 verifier cases; the results are committed in `spec/conformance/results/amc-verify-0.1.0.json`. They are self-reported. Interoperability may be claimed only after an independently built verifier passes (P3-03).

freeze-exception: P1-32 — conformance runner binary in its own package
