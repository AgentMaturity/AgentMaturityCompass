# P2-36 qualification receipt: A4 under the enterprise-data systems

Branch `rtd/w3-p2-36` on base `4683eecc7`. Details: `receipt.json`; mutation results: `mutations.json`.

## What was run

- `tests/a4/enterpriseData.test.ts` (11 tests, all pass). It uses the owned P2-24 governance fixture (real vault, ledger, deletion gate, legal-hold registry, ledger encryption) and covers these cases:
  - Postgres backend: every write is refused and readiness shows `LEDGER_BACKEND_INCOMPLETE`.
  - Owner erasure: the blobs become unreadable, the hashes are kept, the chain verifies, `ERASED` is recorded and the `DELETION_ALLOWED` audit row is written.
  - Legal hold: a hold refuses erasure before anything is destroyed.
  - Ledger encryption: `verifyA4Chain` passes, and the exported record verifies offline under a pinned trust context and as integrity only without one.
  - Rows encrypted after hashing: they are exported as plaintext and verify offline.
  - Binder slice: it holds neither the email nor the token.
  - Bundle slice: a credential refuses it.
  - Detector unit test: matches are replaced by hashes and credentials are reported.
  - Signing algorithms: an `ecdsa-p256-sha256` envelope verifies under the default policy and is refused (`A4_ENVELOPE_ALGORITHM_REFUSED`) under an ed25519-only policy.
- 110 existing test files touching the changed modules: 1,417 passed and 1 failed. The failure is `evidenceBinding` source literals, which fails identically on the base.
- Mutation checks M1 to M8 each turned a named test red. M9 survived: the binder detector pass has no projected field to bite on (see `receipt.json`).

## What this does not show

- There is no Postgres server. The refusal reads the backend selection and P2-09d's mirror list, which does not declare A4's tables.
- No real HSM or KMS P-256 key is used. The ECDSA case uses a locally generated P-256 key.
- Detection is P2-02's heuristic set. A clean scan is not de-identification.

## Pending (Sid)

- Land `docs/runbooks/POSTGRES_FAILOVER.md` (P2-09d) before any decision to mirror A4's tables. Mirroring them is a follow-up and needs Postgres-side writes for A4, not just a list entry.
- Erasure semantics for regulated deployments (backup and WORM rotation windows) need expert review before any claim beyond "effective after rotation".

## Security review fix (bundle slice)

Only the project's own audit rows are decrypted for export. A referenced row of other evidence that was encrypted after hashing refuses the export with `A4_EXPORT_REF_ENCRYPTED` and is never decrypted. Every decrypted payload is scanned for credentials before anything is written, and record files are written 0600. Both regression tests failed before the fix and pass after it. Mutations M10 to M12 are in `mutations.json`.
