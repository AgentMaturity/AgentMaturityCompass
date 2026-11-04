# P1-32 · Conformance suite skeleton and conformance classes

Suite 1.0.0 (spec 1.0). `packages/amc-conformance` runs any implementation through a command template and writes
`conformance-results` v1. AMC's standalone verifier passes all 61 normative verifier cases
(`amc-verify-0.1.0.json`, the same file as `spec/conformance/results/amc-verify-0.1.0.json`; fixture-set digest
`4a57aae5ac72e6a96c15ee6fc05ae00f4000a86c10fff7fe19b8abc8ffee24af`).

- `clean-install-results-node22.json`, `clean-install-results-node24.json`: both packages packed, installed offline into
  an empty directory with no AMC build, and run against a checkout of `spec/` on Node 22.23.3 and 24.21.0. Node 20 runs
  in the CI `verifier-conformance` matrix.
- `broken-doubles.json`: the five broken verifier doubles and the case each loses; the correct double passes all 61.
- `mutations.json`: three guards broken locally, the test that failed for each, then restored.

These results are AMC's own runs of its own verifier: self-reported evidence of conformity, not interoperability.
Interoperability may be claimed only after an independently built verifier passes (P3-03).

Pending: the class requirements are the suite's working text until P1-30 (chapter 2) states them; the compiler class
is informative until P1-10's golden outputs exist; producer case PRD-005 (writer signatures) waits for P1-30's key-id
rule. The `conformance:verifier` npm script is for the integrator to add (agents may not edit package.json). Opening
the PR, merging and publishing the package are Sid's.
