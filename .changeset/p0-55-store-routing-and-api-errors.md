---
"agent-maturity-compass": patch
---

Under `AMC_NO_SIGN=1`, `amc ingest`, `amc attest`, `amc budgets reset`, the archetype apply audit and the `amc watch` observability bridge and realtime assurance writers now record their unsigned evidence in `.amc/unsigned/evidence.sqlite`, so `.amc/evidence.sqlite` no longer gains rows whose signature is the literal "unsigned".

API routes that answer a failure through their fallback now return that fallback text instead of the internal error message, and log the detail on the server. `POST /api/v1/enforce/formal/certificate` with a certificate that has no `proofTree` or `certificateHash` (for example `{ "certificate": { "proof": true } }`) now answers 400 "Invalid request body" instead of 500.

The native shell's egress proxy now tries every address it checked for a host, in order, as the gateway proxy does, so a dual-stack name whose first address refuses still connects. A CONNECT tunnel records the address it reached (`connectedAddress`) in a `NATIVE_SHELL_EGRESS` row before it answers 200.
