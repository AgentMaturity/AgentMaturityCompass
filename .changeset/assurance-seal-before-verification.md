---
"agent-maturity-compass": patch
---

Assurance runs now seal their completed evidence session before ledger verification and before signing or persisting the report. A genuine signed artifact can be VALID independently of whether its measurements pass, fail, or remain insufficient. A completion seal failure prevents report persistence, while a later report-write failure preserves the existing seal and original error.
