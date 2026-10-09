---
"agent-maturity-compass": major
---

Security: two API verify routes no longer report unsigned artifacts as valid.

- `POST /api/v1/enforce/formal/certificate` now returns `valid: false` and a `VerifierReportV1` `report`, the same verdict as `amc enforce verify-certificate`. A proof certificate carries an unkeyed hash, which names no signer the server's trust can admit. `integrityValid` keeps the hash check alone.
- `POST /api/v1/passport/trust-token/verify` returns `valid: false`. It no longer checks the token's HMAC and refuses a body that carries `secret` with 400 (see the P0-55 entry): it answers `status: "not_evaluated"`, `valid: false`, the token's `tokenSha256` and a reason, with no `report`. A trust token is an HMAC under a shared secret and names no signer the server's trust can admit.
