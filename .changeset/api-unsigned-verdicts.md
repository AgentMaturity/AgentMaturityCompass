---
"agent-maturity-compass": major
---

Security: two API verify routes no longer report unsigned artifacts as valid.

- `POST /api/v1/enforce/formal/certificate` and `POST /api/v1/passport/trust-token/verify` now return `valid: false` and a `VerifierReportV1` `report`, the same verdict as `amc enforce verify-certificate` and `amc passport verify-token`.
- A proof certificate carries an unkeyed hash. A trust token is an HMAC under a secret the caller supplies in the request. Neither names a signer the server's trust can admit.
- `integrityValid` keeps the hash or HMAC check alone.
