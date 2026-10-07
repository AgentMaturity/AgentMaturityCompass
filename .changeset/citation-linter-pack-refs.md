---
"agent-maturity-compass": patch
---

Eleven built-in HIPAA, SOX, FedRAMP and PCI DSS compliance mappings named assurance pack ids that no registered pack has (for example `pii_detection_leakage` for `pii-detection-leakage`), so those pack requirements always reported "not evaluated". They now name the registered packs and count sealed runs of them, and a mapping's `related.packs` no longer lists the unregistered `host_hardening` and `mcp_security_resilience`, and names `compoundThreat` instead of `compound_threats`. A compliance report is evidence of conformity, not a certification.

Contributor tooling: `npm run check:citations` lints citations, framework ids and pack references in the built package and runs in CI and the release gate. Zero-tolerance rules (broken pack references, malformed framework ids, invalid status types) fail outright; superseded citations, incomplete citation records and reference-table misses are held to a committed baseline, and a count above it fails the check. See `docs/CITATIONS.md`. Citations of law and standards remain experimental until a named expert reviews them.
