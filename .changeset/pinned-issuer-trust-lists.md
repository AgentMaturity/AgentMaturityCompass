---
"agent-maturity-compass": minor
---

Adds `agent-maturity-compass/trust`: a signed trust-list format for pinning issuer keys by purpose (Ed25519, signed under pinned roots, refused when expired or malformed), an issuer admission check that never lets an artifact's own embedded key vouch for it, a built-in distrust list shipped with the package that no flag or environment variable disables, and the `VerifierReportV1` shape that keeps integrity separate from issuer admission. Workspace self-trust is labelled as a self-check and never admits an independent issuer. No verify command uses these yet, so this change leaves verification results as they were; wiring the verifiers follows separately. See `docs/TRUST_LIST.md` and `docs/security/verifier-inventory.md`.
