---
"agent-maturity-compass": major
---

Breaking: 1.x results are now labelled legacy self-reported or synthetic example; originals are never modified.

- Claim labels for results stored by AMC 1.x cite the notice they are read under: `Legacy (1.x), self-reported (notice AMC-LEGACY-2026-001 v1)` or `Legacy (1.x), synthetic example (notice AMC-LEGACY-2026-001 v1)`, and `provenance.legacy.notice` carries the same reference in JSON. A legacy result's eligible level is now 1 at most; the original level stays in the stored file.
- `amc assurance verify` labels an assurance run stored without `evidenceStatus` (AMC 1.x graded a canned reply for it) as a legacy synthetic example, not observed, even when its seal verifies.
- `amc verify --relabel-legacy` (with `--dry-run` and a repeatable `--path <file>`) runs after the integrity check unless it fails. It appends one record per 1.x result not yet recorded under the notice to the hash-chained `.amc/migrations/relabel.jsonl` and writes a receipt under `.amc/migrations/receipts/`, signed as the new `MIGRATION_RECEIPT` kind, with the counts and a digest of the original hashes. It opens the ledger read-only, writes no original file, refuses to combine with `--repair`, and records nothing new on a second run.
- Passports, assurance certificates and trust-certificate JSON record no AMC version, so they are not labelled legacy; they stay self-reported. See `docs/migration/LEGACY_RESULTS.md`.
