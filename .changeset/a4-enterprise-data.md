---
"agent-maturity-compass": minor
---

A4 Forge now works with the G2 enterprise-data systems (P2-36, preview behind `AMC_A4_PREVIEW=1`).

- **Erasure.** A project owner can erase a project's private text with `POST /api/v1/a4/projects/:id/private/erase`.
  AMC destroys the project's key inside the P2-01 deletion gate, and a legal hold refuses the request with 409
  `DELETION_DENIED`. The request is then recorded as a new `ERASED` transition. Personal context, brief free text and
  comment bodies can no longer be read. The chain still verifies through its salted hashes. Erasure is effective only
  once every backup, WORM segment and mirror older than it has been rotated out.
- **Deletion.** `scripts/deletion-executors.json` lists `a4-projects/` and `a4-releases/` as never deleted.
- **Postgres.** On a Postgres session store, every A4 write is refused with 503 `LEDGER_BACKEND_INCOMPLETE`, and
  readiness lists `store.ledger_backend` as BLOCKED. This lasts until the mirror declares A4's `a4_*` and `action_*`
  tables.
- **Ledger encryption.** With ledger encryption on, `verifyA4Chain` opens audit rows through the ledger cipher; before
  this change, every encrypted A4 audit row failed verification. The bundle slice exports any row encrypted after it was
  hashed as its plaintext, so an offline verifier still recomputes every digest without a key. `a4/index.json` now
  states that the slice is plaintext under the operator's control.
- **Redaction.** P2-02's detectors run over the binder slice, and each match is replaced by its hash. They also run
  over the bundle slice, where matches are counted rather than rewritten. A credential match refuses either export.
- **Signing algorithms.** A4 envelope checks follow the P2-08 algorithm policy. An `ecdsa-p256-sha256` envelope fails
  with `A4_ENVELOPE_ALGORITHM_REFUSED` when the policy does not allow that algorithm.
- **Data classes.** Adapt's data-handling card shows "enforced at redaction" for the declared data classes only when
  P2-02 redaction is on and its processor registry verifies.
