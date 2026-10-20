---
"agent-maturity-compass": patch
---

Keep explicit ledger distrust effective with matching fingerprint pins and `--allow-unanchored`, and prevent rejected JSONL issuers from being labelled anchored. Restore empty-pin refusal at the session-anchor boundary and accept uppercase hexadecimal fingerprints.

Preserve v1 gate-receipt verification against its external Ed25519 trust root. Show unanchored trust information alongside configuration-signature failures and report signature failures without claiming that every event signature failed.
