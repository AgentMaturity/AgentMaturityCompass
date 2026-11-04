# Note: rows recorded before P1-78 — 18 October 2026

Integration note, added on `rtd/codex-full-integration`; `README.md`, `receipt.json`, `evidence.json` and `fault-matrix.json` in this folder are unchanged.

The two `recorder_down_after_effect` rows of `fault-matrix.json` (payments.send and records.delete) and the reconcile case "a signed stricter WRITE_LOW distinct-user rule rejects an operator's otherwise granted self-approval" were measured at base `5ea5e866a`, before P1-78. They are base-only evidence and do not describe the integrated line:

- P1-78 latches a pipeline whose recorder failed (`EVIDENCE_RECORDER_FAILED`): every later call of that pipeline is refused at the authorization stage before the journal is asked, so the later call is no longer a journal `blocked_by_unreconciled` denial. On the integrated line `tests/actions/faultMatrix.test.ts` asserts the latch for those rows and keeps the journal's unreconciled block covered through a second pipeline over the same journal whose recorder works.
- P1-78 records the operator as the initiator of a manual-resolution approval, so under `requireDistinctUsers` their own approval is refused when it is decided, not later at resolution. `tests/actions/reconcile.test.ts` asserts that.

Do not cite these rows for the integrated line until the matrix is re-run there.
