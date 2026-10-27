---
"agent-maturity-compass": minor
---

Ledger encryption at rest, opt-in (P2-09a, ADR 018 proposed). With `opsPolicy.encryption.ledgerEncryptionEnabled: true`, inline evidence payloads are stored as AES-256-GCM ciphertext under a data key wrapped by the configured KeyProvider (`.amc/keys/ledger-dek.json`, signed). The event hash covers the stored ciphertext, so the chain and its signatures verify without any key; payload content checks need the key or a plaintext export. An append that cannot get the data key is denied with the provider's error code and writes no row. `amc evidence-stores encrypt` encrypts existing inline payloads, rotates (`--rotate-key`) or re-wraps (`--rewrap`) data keys, and writes a signed receipt showing the chain head unchanged; migration 14 lets `canonical_payload_inline` change once, from plaintext to its ciphertext. The key file is protected against rollback by a high-water mark outside the workspace, and verification lists encrypted payloads it cannot check (key out of reach) as not evaluated rather than verified. An AMC now refuses a ledger whose schema is newer than it knows. Backups capture SQLite files as consistent `VACUUM INTO` snapshots and no longer copy WAL sidecars. See docs/EVIDENCE_STORAGE.md.

freeze-exception: P2-09 — `amc evidence-stores encrypt` is the migration command the P2-09 spec names as a freeze exception.
