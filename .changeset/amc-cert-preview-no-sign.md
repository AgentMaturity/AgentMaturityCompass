---
"agent-maturity-compass": patch
---

Add `amc cert generate --no-sign` / `--preview` for unsigned trust-certificate previews that work without vault signing, are labeled `UNSIGNED_PREVIEW`, and are intentionally rejected by verifier logic until regenerated as signed certificates.
