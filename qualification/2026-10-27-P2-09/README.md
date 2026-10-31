# P2-09 qualification receipts (2026-10-27)

Branches: `rtd/p2-09a-ledger-encryption` → `rtd/p2-09b-worm-export` → `rtd/p2-09c-guard-events-cutover` → `rtd/p2-09d-postgres` (stacked). Machine: macOS 26.6.2 arm64, Node v22.23.3, shared with other agents (vitest `--maxWorkers=2`). ADR: `docs/adr/018-encrypted-ledger-worm-postgres.md` (proposed; **Sid approval pending**).

## 09a: ledger encryption, downgrade guard, WAL-safe backup

New tests (all pass): `tests/ledgerEncryption.test.ts` (6), `tests/ledgerEncryptionMigration.test.ts` (4), `tests/ledgerDowngradeGuard.test.ts` (2), `tests/backupWalSafety.test.ts` (2).

Existing tests: 362 files that import `src/ledger`, `src/storage`, backup, retention, guard events, the payload read path or the key bridge (list in `a-related-files.txt`). Under load 49 files had failures; the same 49 files were rerun on the base (`7bdb1627a`, stashed tree, rebuilt `dist`): every failure that remained on this branch also fails on the base (113 failing tests on the base, among them `asyncBackupCreate`, `embeddedKeyForgery`, many `tests/keys/async*`). Two regressions found that way were fixed before commit: CLI tests replace `dist/keys/providerBridge.js` with a stub, so the sync unwrap moved to `src/ledger/encryption/syncUnwrap.ts`; and `tests/actions/receiptStates.test.ts` encoded "current schema is v13" and the unchanged `protect_evidence_immutable` trigger, updated for migration 14.

Red/green:
- Downgrade guard: with the `assertSchemaNotNewer` call removed, `ledgerDowngradeGuard` "refuses a ledger holding a migration one above…" fails; restored, passes.
- WAL-safe backup: on the base `backupEngine.ts`, `backupWalSafety` fails deterministically on the sidecar assertion (the manifest carries `.amc/evidence.sqlite-wal`/`-shm`). Without that assertion the byte copy failed 1 of 3 runs (`SqliteError: database is locked` on the restored copy), so the torn-copy failure is real but not deterministic on this machine.
- Encryption features are new behaviour (no prior code path to fail).

Mutation checks (each made one named test fail, then restored):
- AAD dropped (`aadBytes` → empty buffer): "refuses a ciphertext moved to another row (AAD binds the row id)" fails.
- Appends allowed without a key (`sealInline` falls back to plaintext on error): "denies the append with the provider's reason when the KeyProvider is down" fails.
- Downgrade guard call removed: see above.

Checks on the 09a tree: build, typecheck, typecheck:tests, lint, check:gates, check:dead-code (0 new), check:counts (after `gen-counts --write`), check:docs-drift, check:architecture-boundaries, check:api-ref pass. check:duplicates reports 3 `transformation/transformApi.ts` findings that the base reports identically (not touched here); two re-fingerprinted pre-existing clones were accepted with reasons. check:freeze fails on the base already (P3-14, P2-30 not in the base baseline) and P2-09 must be added to `allowedExceptionKeys` by the integrator: a PR cannot authorize itself.

### Security review follow-up (09a, second commit)

Two findings from the coordinator's security review, each with a regression test in `tests/ledgerEncryptionSecurity.test.ts` that failed on the first 09a commit (5 of 5 red) and passes after the fix (5 of 5 green):
1. Fail-open payload check: an encrypted payload was skipped whenever decryption threw a KeyProviderError. Now only `KEY_PROVIDER_UNAVAILABLE` (unreachable provider, locked vault) yields "not evaluated", reported in the verdict's `payloadsNotEvaluated`; a missing or rolled-back key file, an unknown key version or a ciphertext that does not open is an error, and `payload_inline` is decrypted and compared with `canonical_payload_inline`.
2. Key-file rollback: the signed key file now has a `sequence`; the P1-08 high-water store (`<AMC home>/state/high-water.json`, kind `ledger-dek`, per workspace scope) refuses an older one, and `encryptField` refuses a key version older than the newest ciphertext in the ledger.
The 48 verification, retention, bundle, backup and high-water test files were rerun after the fix: 501 passed, 15 failed, all 15 also failing on the base.

## 09c: guard-events cutover

New tests: `tests/guardEventCutover.test.ts` (3): divergent parity refuses cutover and the workspace stays DUAL_WRITE; identical parity allows it, new events then reach only `evidence.sqlite`, the legacy rows are unchanged, and `AMC_GUARD_EVENTS_STAGE=DUAL_WRITE` reverts; retention with `pruneGuardEventsAfterDays` prunes both stores and parity stays identical. All 3 failed on the 09b source (no cutover function; the evidence-store copy was never pruned) and pass now.

Mutation checks: dropping the identical-parity check fails "refuses cutover while parity diverges"; dropping the DUAL_WRITE prune of the evidence-store copy fails "prunes both stores". Both restored.

Existing tests touching the emitter, guard events, retention or the deletion gate: 74 files, 1,728 passed, 3 failed; all 3 fail on base `7bdb1627a` as well (`auditEvidenceAccountingParity` gate exports, `domainExampleMode` binder signing, `evidenceBinding` source literals).

Deviation: the spec says to use CUTOVER for new workspaces. CUTOVER is recorded per workspace by `amc evidence-stores cutover` (immediately allowed on a new workspace, whose two stores are empty and identical) rather than switched on by `initWorkspace`, because 16 existing test files and P2-01's path contract assume DUAL_WRITE by default and `src/workspace.ts` is outside the touch scope. Making it automatic is one line in `initWorkspace` once Sid accepts the test churn. The new deletion site is registered in `scripts/deletion-executors.json` as gated.

## Pending Sid

- Approve or reject ADR 018 (the code follows its proposal).
- Add `P2-09` to `scripts/freeze-baseline.json` `allowedExceptionKeys` on the base (new CLI paths: `amc evidence-stores encrypt`, and in later branches the WORM and cutover commands).

## 09b: WORM export

New tests: `tests/wormExport.test.ts` (7, fake targets): unlocked target refused before any upload; shorter retain-until refused; governance mode refused; offline verification passes against a signed trust list; one flipped segment byte fails; an index signed by a key the trust list does not pin fails; re-export uploads nothing; the S3 adapter sends `COMPLIANCE`, a SHA-256 checksum and `If-None-Match: *`.

Mutation checks: skipping the HEAD mode check makes "refuses when HEAD reports governance mode" fail; skipping the object-lock configuration check makes "refuses a target without object lock before uploading anything" fail. Both restored.

Security review follow-up (09b, second commit): an object already present under our key was accepted on its lock alone. `headObject` now also returns the store's SHA-256 checksum (S3 HEAD with `ChecksumMode: ENABLED`) and version id; a present object must match our sha256, its lock and retain-until, and the recorded version id when known, or the export is refused (never overwritten). Regression test "refuses an object already present under our key whose content, lock or version is not ours (pre-planted object)" failed before the fix (the export resolved) and passes after; mutation: dropping the checksum comparison makes it fail again.

Interface deviation: the spec's `WormTarget` has no way to ask whether a bucket has object lock, so `lockConfiguration()` was added (S3 `GetObjectLockConfiguration`); `headObject` returns null for a missing object and also reports the store's checksum and version id.

### Real object-lock bucket run: PENDING SID (not run, not faked)

Needs a dedicated S3 bucket created with Object Lock enabled, credentials in the AWS SDK default chain, and a workspace with at least one retention segment. Compliance-mode locks cannot be removed: use a test bucket and a short retention.

```bash
npm install --no-save @aws-sdk/client-s3
amc retention run                                   # produces signed segments if any are due
amc evidence-stores worm-export --bucket <bucket> --retain-days 1 --prefix p2-09-qual/ --json > worm-export-receipt.json
aws s3api head-object --bucket <bucket> --key p2-09-qual/<indexKey>   # expect ObjectLockMode COMPLIANCE
aws s3 cp --recursive s3://<bucket>/p2-09-qual/ ./download/
amc evidence-stores worm-verify --index ./download/<indexKey> --objects ./download --trust-list <signed trust list pinning the artifact-seal key>
```

Record `worm-export-receipt.json`, the head-object output and the verify output here as `worm-real-bucket/`.
