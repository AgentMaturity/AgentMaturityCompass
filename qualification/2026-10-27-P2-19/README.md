# P2-19 qualification receipt: OWASP ACS v0.1 hooks

Code commit: `50ffa1246` on `rtd/w3-p2-19` (base `93ccb82b5`). ACS pinned to `v0.1.4`, commit `834f3f0d51e7bbbd9a68ff682bec89f97ddd72d8`.

- Served: `steps/toolCallRequest` (enforce, advisory receipts), `handshake/hello`, `system/ping`. Every other ACS hook is answered unsupported.
- Conformance: ACS publishes no vectors; 8 AMC-authored fixtures, 8 passed, 0 failed (`conformance.json`).
- Mutation checks: 4 guards broken by hand, each failed at least one test (`mutations.json`).
- Tests: the 36 test files touching the changed modules plus `tests/asiCrosswalk.test.ts`; see `receipt.json`.
- Regression: `tests/acsHooks.test.ts`, `tests/acsConformance.test.ts` and `tests/asiCrosswalk.test.ts` fail at the base commit, where `src/standards/acs/` and the crosswalk do not exist.

Pending, not faked: Sid submits the draft OWASP test cases (`docs/standards/acs-contributions/`); a named expert signs off the ASI crosswalk (P1-34); no third-party ACS runtime has been tested against the route, so every ACS decision stays advisory.
