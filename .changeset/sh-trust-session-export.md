---
"agent-maturity-compass": minor
---

`amc session export <id> --out <file>` writes one sealed native session as a self-contained signed bundle (rows, seal, recomputed root descriptor, monitor keys), and `amc session verify-export <file> --expect-monitor <sha256>` verifies it offline with only the file and a pinned monitor fingerprint: every row's hash pre-image, writer signature and session envelope chain and the seal are checked against the pinned key, and every descriptor field must equal the one derived from the signed rows alone (agent, runtime and window from the signed open and close rows; the record's unsigned time columns feed nothing), which the operator's trust and distrust lists may still refuse (SH-TRUST-06). Open sessions are refused (`SESSION_NOT_SEALED`); the cross-session chain is not claimed. See docs/SESSION_EXPORT.md.

freeze-exception: SH-TRUST — Sid asked for offline-verifiable signed session export; two new `amc session` commands.
